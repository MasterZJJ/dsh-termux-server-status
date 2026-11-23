/**
 * 充电周期状态：持久化在 <DSH_HOME>/dsh-termux-state/state.json。
 *
 * 记录「上次开始充电 / 上次充电结束（拔线或停充）/ 上次充满」三个时刻，
 * 用来回答「上一次充电后到现在用了多久」。首次启动若状态为空，
 * 会尝试从既有监控日志回填，避免界面上出现空白。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function defaultState() {
  return {
    version: 1,
    lastChargeStartAt: null,
    lastChargeEndAt: null,
    lastFullAt: null,
    charging: false,
    lastPercent: null,
    lastAlertPct: null,
    lastAlertAt: null,
    updatedAt: null,
  }
}

export async function loadState(path) {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8'))
    return { ...defaultState(), ...raw }
  } catch {
    return defaultState()
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8')
}

/** 首次启动且无历史时，从 monitor.py 的 JSONL 日志回填充电时刻。 */
export async function backfillFromLog(logPath) {
  const state = defaultState()
  let text
  try {
    text = await readFile(logPath, 'utf8')
  } catch {
    return state
  }
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {}
  }
  let prevStatus = null
  for (const r of rows) {
    const b = r.battery || {}
    const status = String(b.status || '').toUpperCase()
    const at = r.ts || null
    if (!at || !status) continue
    if (status === 'CHARGING' && prevStatus !== 'CHARGING') state.lastChargeStartAt = at
    if (status === 'FULL' && b.percent >= 99) state.lastFullAt = at
    if ((prevStatus === 'CHARGING' || prevStatus === 'FULL') && status === 'DISCHARGING') {
      state.lastChargeEndAt = at
    }
    prevStatus = status
  }
  const last = rows[rows.length - 1]
  if (last?.battery) {
    state.lastPercent = last.battery.percent ?? null
    state.charging = String(last.battery.status || '').toUpperCase() === 'CHARGING'
  }
  return state
}

/** 根据当前电池读数推进状态，返回是否有变化。 */
export function advanceChargeState(state, battery, now = new Date()) {
  if (!battery?.available) return false
  const before = JSON.stringify(state)
  const iso = now.toISOString()
  const status = String(battery.status || '').toUpperCase()

  if (status === 'CHARGING' && !state.charging) state.lastChargeStartAt = iso
  if (status === 'FULL' && (battery.percent ?? 0) >= 99) state.lastFullAt = iso
  if (state.charging && status !== 'CHARGING') state.lastChargeEndAt = iso

  state.charging = status === 'CHARGING'
  state.lastPercent = battery.percent ?? state.lastPercent
  state.updatedAt = iso
  return JSON.stringify(state) !== before
}

/** 上次充电结束至今的小时数。 */
export function hoursSince(iso, now = Date.now()) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.round(((now - t) / 36e5) * 10) / 10
}

export function statePath(dshHome) {
  return join(dshHome, 'dsh-termux-state', 'state.json')
}
