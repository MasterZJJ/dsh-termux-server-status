/**
 * dsh-termux-state — 宿主端。
 *
 * 注册一个只读接口：GET /api/dsh-termux-state/snapshot
 * 后台每 60s 采样一次电量，维护「上次充电结束 / 已用时长」并在低电量时推微信。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { batterySnapshot, collectSnapshot, estimateRuntime, hasSv, serviceStatus } from './metrics.js'
import { advanceChargeState, backfillFromLog, hoursSince, loadState, saveState, statePath } from './state.js'
import { sendWechat } from './wechat.js'

export const name = 'termux-state'
export const inject = ['webServer']

const SNAPSHOT_PATH = '/api/dsh-termux-state/snapshot'
const RESTART_PATH = '/api/dsh-termux-state/restart'
const SAMPLE_MS = 60_000
const CACHE_MS = 4_000

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-termux-state',
    validate(value) {
      try {
        return { value: validateConfig(value ?? {}) }
      } catch (error) {
        return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }
      }
    },
  },
}

export function validateConfig(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('config must be an object')
  const num = (v, d, min, max) => {
    if (v === undefined || v === null) return d
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`config value out of range: ${v}`)
    return n
  }
  return {
    refreshSeconds: num(raw.refreshSeconds, 60, 60, 3600),
    lowBatteryPct: num(raw.lowBatteryPct, 20, 1, 100),
    // 默认关闭：换机安装时通常没有接入微信机器人，开启只会让告警静默失败。
    wechatAlerts: raw.wechatAlerts === true,
    service: typeof raw.service === 'string' && /^[\w.-]{1,64}$/.test(raw.service) ? raw.service : 'dshweb',
    // 默认不做历史回填：historyLog 只在显式配置时使用（旧值指向本机 monitor.py 日志）。
    historyLog: typeof raw.historyLog === 'string' && raw.historyLog.trim() ? raw.historyLog.trim() : null,
  }
}

/** 探测宿主 DSH_HOME：环境变量优先，其次常见目录名，最后回退 ~/.dsh。 */
export function resolveDshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  const home = homedir()
  for (const name of ['.dsh', '.dsh-v021', '.dsh-rc5-test']) {
    const dir = join(home, name)
    if (existsSync(dir)) return dir
  }
  return join(home, '.dsh')
}

function isLoopback(req) {
  const addr = req?.socket?.remoteAddress || ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function buildAlertText(snapshot) {
  const b = snapshot.battery
  const lines = [
    `⚠️ Termux 设备电量 ${b.percent}%`,
    `状态 ${b.status} · ${b.temperatureC ?? '?'}°C · ${b.voltageV ?? '?'} V`,
  ]
  if (snapshot.runtimeH) lines.push(`预计剩余 ${snapshot.runtimeH} 小时`)
  if (snapshot.power?.sinceChargeH) lines.push(`上次充电后已用 ${snapshot.power.sinceChargeH} 小时`)
  lines.push('来自 DSH 侧边栏「服务器状态」')
  return lines.join('\n')
}

export function apply(ctx, rawConfig = {}) {
  const config = validateConfig(rawConfig)
  const dshHome = resolveDshHome()
  const stateFile = statePath(dshHome)

  let state = null
  let cache = { at: 0, data: null }
  let busy = null

  const ensureState = async () => {
    if (state) return state
    state = await loadState(stateFile)
    if (!state.lastChargeEndAt && config.historyLog) {
      const seeded = await backfillFromLog(config.historyLog)
      if (seeded.lastChargeEndAt || seeded.lastFullAt) {
        state = { ...state, ...seeded }
        await saveState(stateFile, state).catch(() => {})
      }
    }
    return state
  }

  const sample = async () => {
    const battery = await batterySnapshot()
    const st = await ensureState()
    const changed = advanceChargeState(st, battery)
    if (changed) await saveState(stateFile, st).catch(() => {})
    return { battery, state: st }
  }

  const alertIfNeeded = async (battery, st) => {
    if (!config.wechatAlerts || !battery?.available) return
    const pct = battery.percent
    if (pct == null) return
    if (battery.charging || battery.full) return
    if (pct > config.lowBatteryPct) {
      if (st.lastAlertPct != null && pct > config.lowBatteryPct + 5) {
        st.lastAlertPct = null
        await saveState(stateFile, st).catch(() => {})
      }
      return
    }
    // 每下降 5% 才再提醒一次，避免每小时重复轰炸
    if (st.lastAlertPct != null && pct > st.lastAlertPct - 5) return
    const snapshot = {
      battery,
      runtimeH: estimateRuntime(battery),
      power: { sinceChargeH: hoursSince(st.lastChargeEndAt) },
    }
    const result = await sendWechat(buildAlertText(snapshot))
    st.lastAlertPct = pct
    st.lastAlertAt = new Date().toISOString()
    st.lastAlertOk = Boolean(result?.ok)
    st.lastAlertError = result?.ok ? null : String(result?.error || '').slice(0, 200)
    await saveState(stateFile, st).catch(() => {})
  }

  const buildSnapshot = async (full) => {
    const now = Date.now()
    if (!full && cache.data && now - cache.at < CACHE_MS) return cache.data
    if (busy) return busy
    busy = (async () => {
      const { battery, state: st } = await sample()
      const [base, service, svReady] = await Promise.all([
        collectSnapshot({ full }),
        serviceStatus(config.service),
        hasSv(),
      ])
      const data = {
        ...base,
        service,
        caps: { sv: svReady, battery: Boolean(battery?.available) },
        battery,
        runtimeH: estimateRuntime(battery),
        power: {
          lastChargeStartAt: st.lastChargeStartAt,
          lastChargeEndAt: st.lastChargeEndAt,
          lastFullAt: st.lastFullAt,
          sinceChargeH: hoursSince(st.lastChargeEndAt),
          charging: st.charging,
        },
        alert: {
          enabled: config.wechatAlerts,
          thresholdPct: config.lowBatteryPct,
          lastAlertPct: st.lastAlertPct,
          lastAlertAt: st.lastAlertAt,
          lastAlertOk: st.lastAlertOk ?? null,
        },
        config: {
          refreshSeconds: config.refreshSeconds,
          lowBatteryPct: config.lowBatteryPct,
          wechatAlerts: config.wechatAlerts,
        },
      }
      cache = { at: Date.now(), data }
      return data
    })()
    try {
      return await busy
    } finally {
      busy = null
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: SNAPSHOT_PATH,
        handler: (req, res) => {
          if (!isLoopback(req)) return json(res, 403, { error: 'loopback only' })
          const url = new URL(req.url || '/', 'http://127.0.0.1')
          const full = url.searchParams.get('full') === '1'
          const force = url.searchParams.get('refresh') === '1'
          if (force) cache = { at: 0, data: null }
          Promise.resolve()
            .then(() => buildSnapshot(full))
            .then((data) => json(res, 200, data))
            .catch((err) => json(res, 500, { error: err?.message || String(err) }))
        },
      }),
    'termux-state: snapshot route',
  )

  // 重启服务：先回包再执行，否则 sv restart 会先杀掉本进程导致请求中断
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: RESTART_PATH,
        handler: (req, res) => {
          if (!isLoopback(req)) return json(res, 403, { error: 'loopback only' })
          if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
          hasSv().then((ready) => {
            if (!ready) {
              // 没有 termux-services 时不要假装修重启：直接告诉前端不支持。
              json(res, 409, { ok: false, error: 'termux-services (sv) not installed; restart unavailable' })
              return
            }
            json(res, 202, { ok: true, service: config.service, scheduled: true })
            setTimeout(() => {
              try {
                const child = spawn('sv', ['restart', config.service], { detached: true, stdio: 'ignore' })
                child.unref()
              } catch {}
            }, 250)
          })
        },
      }),
    'termux-state: restart route',
  )

  // 后台采样：维护充电时刻 + 低电量提醒
  const timer = setInterval(() => {
    Promise.resolve()
      .then(() => ensureState())
      .then(async (st) => {
        const { battery } = await sample()
        await alertIfNeeded(battery, st)
      })
      .catch(() => {})
  }, SAMPLE_MS)
  if (typeof timer.unref === 'function') timer.unref()
  ctx.effect(() => () => clearInterval(timer), 'termux-state: sampler')

  return { getState: () => state }
}

export { SNAPSHOT_PATH, RESTART_PATH }
