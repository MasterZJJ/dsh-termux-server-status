/**
 * dsh-termux-state — 采集器（Termux / Android）。
 *
 * 只读：电池走 termux-battery-status，其余读 /proc 与 /sys。
 * Android 禁止读取 /proc/stat、/proc/loadavg、/proc/uptime，
 * 因此整机 CPU 占用由「各进程 utime+stime 差分」累加得出（口径：可见进程）。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, statfs } from 'node:fs/promises'
import os from 'node:os'

const exec = promisify(execFile)

const HZ = 100
const PAGE = 4096
const THERMAL_ROOT = '/sys/class/thermal'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function sh(cmd, args = [], timeout = 8000) {
  try {
    const { stdout } = await exec(cmd, args, { timeout, maxBuffer: 1 << 20 })
    return stdout
  } catch {
    return ''
  }
}

const toGb = (kb) => Math.round((kb / 1024 / 1024) * 100) / 100
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

// ── 设备信息（启动时读一次，之后不变）────────────────────────────
let deviceCache = null

export async function deviceInfo() {
  if (deviceCache) return deviceCache
  const [model, android, sdk, soc, abi] = await Promise.all([
    sh('getprop', ['ro.product.model']),
    sh('getprop', ['ro.build.version.release']),
    sh('getprop', ['ro.build.version.sdk']),
    sh('getprop', ['ro.soc.model']),
    sh('getprop', ['ro.product.cpu.abi']),
  ])
  const cores = os.availableParallelism?.() ?? os.cpus().length
  let maxFreqMhz = null
  const raw = await readFile('/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq', 'utf8').catch(() => '')
  if (raw.trim()) maxFreqMhz = Math.round(Number(raw.trim()) / 1000)
  deviceCache = {
    model: model.trim() || 'unknown',
    android: android.trim() || '?',
    sdk: sdk.trim() || '?',
    soc: soc.trim() || '?',
    abi: abi.trim() || '?',
    cores,
    maxFreqMhz,
    arch: os.arch(),
  }
  return deviceCache
}

// ── 电池 ───────────────────────────────────────────────────────
export async function batterySnapshot() {
  const out = await sh('termux-battery-status', [], 8000)
  if (!out.trim()) return { available: false }
  let d
  try {
    d = JSON.parse(out)
  } catch {
    return { available: false }
  }
  const status = String(d.status || '').toUpperCase()
  const currentMa = d.current === undefined ? null : round(d.current / 1000, 1)
  const charging = status === 'CHARGING'
  return {
    available: true,
    percent: d.percentage ?? null,
    status: status || 'UNKNOWN',
    charging,
    full: status === 'FULL',
    plugged: d.plugged || 'UNKNOWN',
    health: d.health || 'UNKNOWN',
    temperatureC: d.temperature ?? null,
    voltageV: d.voltage ? round(d.voltage / 1000, 3) : null,
    currentMa,
    cycle: d.cycle ?? null,
    chargeCounterMah: d.charge_counter ? Math.round(d.charge_counter / 1000) : null,
  }
}

/** 预计剩余时长（放电时按 当前容量 / 放电电流）。 */
export function estimateRuntime(battery) {
  if (!battery?.available || battery.charging || battery.full) return null
  const cur = battery.currentMa
  const cap = battery.chargeCounterMah
  if (!cur || cur <= 0 || !cap) return null
  return round(cap / cur, 1)
}

// ── 内存 ───────────────────────────────────────────────────────
export async function memSnapshot() {
  const txt = await readFile('/proc/meminfo', 'utf8').catch(() => '')
  if (!txt) return { available: false }
  const v = {}
  for (const line of txt.split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const num = parseInt(line.slice(i + 1).trim(), 10)
    if (!Number.isNaN(num)) v[line.slice(0, i)] = num
  }
  const total = v.MemTotal || 0
  const avail = v.MemAvailable || 0
  const swapTotal = v.SwapTotal || 0
  const swapFree = v.SwapFree || 0
  const used = total - avail
  return {
    available: true,
    totalGb: toGb(total),
    usedGb: toGb(used),
    availableGb: toGb(avail),
    cachedGb: toGb(v.Cached || 0),
    usedPct: total ? round((used / total) * 100, 1) : null,
    swapTotalGb: toGb(swapTotal),
    swapUsedGb: toGb(swapTotal - swapFree),
    swapUsedPct: swapTotal ? round(((swapTotal - swapFree) / swapTotal) * 100, 1) : null,
  }
}

// ── CPU（可见进程差分）──────────────────────────────────────────
async function readProcTable() {
  const table = new Map()
  let names
  try {
    names = await readdir('/proc')
  } catch {
    return table
  }
  await Promise.all(
    names
      .filter((n) => /^\d+$/.test(n))
      .map(async (n) => {
        try {
          const raw = await readFile(`/proc/${n}/stat`, 'utf8')
          const rp = raw.lastIndexOf(')')
          const comm = raw.slice(raw.indexOf('(') + 1, rp)
          const f = raw.slice(rp + 2).split(' ')
          const ticks = Number(f[11]) + Number(f[12])
          const rss = Number(f[21]) * PAGE
          let cmd = ''
          try {
            cmd = (await readFile(`/proc/${n}/cmdline`, 'utf8')).replace(/\0/g, ' ').trim()
          } catch {}
          table.set(Number(n), { ticks, rss, comm, cmd: cmd || comm })
        } catch {}
      }),
  )
  return table
}

export async function cpuSnapshot(intervalMs = 400) {
  const cores = os.availableParallelism?.() ?? os.cpus().length
  const a = await readProcTable()
  const t0 = Date.now()
  await sleep(intervalMs)
  const b = await readProcTable()
  const elapsed = (Date.now() - t0) / 1000

  let totalTicks = 0
  const procs = []
  for (const [pid, cur] of b) {
    const prev = a.get(pid)
    if (!prev) continue
    const d = cur.ticks - prev.ticks
    if (d < 0) continue
    totalTicks += d
    const cpu = (d / HZ / elapsed) * 100
    if (cpu > 0.05) procs.push({ pid, cpu: round(cpu, 1), rssMb: round(cur.rss / 1024 / 1024, 1), cmd: cur.cmd.slice(0, 80) })
  }
  procs.sort((x, y) => y.cpu - x.cpu)
  const usagePct = b.size ? round((totalTicks / HZ / (elapsed * cores)) * 100, 1) : null

  // 每核频率
  const freqs = []
  for (let i = 0; i < cores; i += 1) {
    const raw = await readFile(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`, 'utf8').catch(() => '')
    freqs.push(raw.trim() ? Math.round(Number(raw.trim()) / 1000) : null)
  }
  return { usagePct: Math.min(100, usagePct ?? 0), cores, freqs, top: procs.slice(0, 6), visibleProcs: b.size }
}

// ── 温度 ───────────────────────────────────────────────────────
export async function thermalSnapshot() {
  let zones = []
  try {
    zones = (await readdir(THERMAL_ROOT)).filter((n) => n.startsWith('thermal_zone'))
  } catch {
    return { available: false }
  }
  const sensors = []
  for (const z of zones) {
    try {
      const [rawT, rawType] = await Promise.all([
        readFile(`${THERMAL_ROOT}/${z}/temp`, 'utf8'),
        readFile(`${THERMAL_ROOT}/${z}/type`, 'utf8'),
      ])
      const c = Number(rawT.trim()) / 1000
      if (!(c > -40 && c < 150)) continue
      sensors.push({ zone: z, type: rawType.trim(), c: round(c, 1) })
    } catch {}
  }
  const pick = (re) => {
    const hit = sensors.filter((s) => re.test(s.type)).sort((a, b) => b.c - a.c)[0]
    return hit ? hit.c : null
  }
  const others = sensors.filter((s) => !/pm8550/.test(s.type))
  const hotspot = others.sort((a, b) => b.c - a.c)[0] || null
  return {
    available: sensors.length > 0,
    sensors: sensors.length,
    hotspotC: hotspot ? hotspot.c : null,
    hotspotType: hotspot ? hotspot.type : null,
    pmicC: pick(/pm8550/),
    batteryC: pick(/battery/i),
    cpuC: pick(/cpuss|cpu/i),
  }
}

// ── 存储 ───────────────────────────────────────────────────────
export async function diskSnapshot() {
  try {
    const s = await statfs(os.homedir())
    const total = s.blocks * s.bsize
    const free = s.bavail * s.bsize
    const used = total - free
    return {
      available: true,
      totalGb: round(total / 1024 ** 3, 1),
      usedGb: round(used / 1024 ** 3, 1),
      freeGb: round(free / 1024 ** 3, 1),
      usedPct: round((used / total) * 100, 1),
    }
  } catch {
    return { available: false }
  }
}

export async function collectSnapshot({ full = false } = {}) {
  const [device, battery, mem, thermal, disk, cpu] = await Promise.all([
    deviceInfo(),
    batterySnapshot(),
    memSnapshot(),
    thermalSnapshot(),
    diskSnapshot(),
    cpuSnapshot(),
  ])
  return {
    collectedAt: new Date().toISOString(),
    device,
    cpu: full ? cpu : { ...cpu, top: [] },
    mem,
    battery,
    thermal,
    disk,
    runtimeH: estimateRuntime(battery),
  }
}

// ── runit 服务状态 ─────────────────────────────────────────────
let svProbe = null

/** 目标机是否装了 termux-services（提供 sv）；没有时服务状态与重启都要降级。 */
export async function hasSv() {
  if (svProbe !== null) return svProbe
  const out = await sh('sh', ['-c', 'command -v sv'], 3000)
  svProbe = Boolean(out.trim())
  return svProbe
}

/** 解析 `sv status <name>`，例如 "run: dshweb: (pid 30208) 359s; run: log: (pid 15632) ..." */
export async function serviceStatus(name = 'dshweb') {
  const out = await sh('sv', ['status', name], 5000)
  if (!out.trim()) return { available: false, name, reason: (await hasSv()) ? 'status-failed' : 'sv-missing' }
  const state = /^(\w+):/.exec(out)?.[1] || 'unknown'
  const pid = /\(pid (\d+)\)/.exec(out)?.[1]
  const upRaw = /\(pid \d+\)\s+(\d+)s/.exec(out)?.[1]
  return {
    available: true,
    name,
    state,
    pid: pid ? Number(pid) : null,
    uptimeSec: upRaw ? Number(upRaw) : null,
    raw: out.trim().slice(0, 200),
  }
}
