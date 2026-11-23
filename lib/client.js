/**
 * dsh-termux-state — 浏览器端。
 *
 * 手写 __ModuleLoader__ bundle（无构建步骤）：
 * 在 sidebar.footer.action 挂一个入口，展开态显示电量/CPU/内存三枚胶囊，
 * 收起态显示电池图标 + 百分比；点击弹出详情浮层（含手动刷新与刷新间隔设置）。
 */

window.__ModuleLoader__.load({
  id: 'dsh-termux-state',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = react.createElement
    const NS = 'dsh-termux-state'
    const INTERVAL_KEY = 'dsh-termux-state:interval'
    const inject = ['slots', 'locale']
    const ENDPOINT = '/api/dsh-termux-state/snapshot'
    const RESTART_ENDPOINT = '/api/dsh-termux-state/restart'
    /** 刷新间隔档位（秒）：1 分钟 / 30 分钟 / 60 分钟。 */
    const INTERVALS = [60, 1800, 3600]

    // ── 文案 ────────────────────────────────────────────────
    const zh = {
      title: '服务器状态',
      battery: '电量',
      cpu: 'CPU',
      mem: '内存',
      processor: '处理器',
      cores: '{n} 核',
      avg: '整机',
      memory: '内存',
      used: '已用',
      available: '可用',
      swap: 'Swap',
      batterySection: '电池',
      discharging: '放电中',
      charging: '充电中',
      full: '已充满',
      lastCharge: '上次充电结束',
      sinceCharge: '已用',
      remaining: '预计剩余',
      hours: '小时',
      minutes: '分钟',
      never: '未记录',
      temp: '温度',
      voltage: '电压',
      current: '电流',
      health: '健康',
      cycles: '循环',
      thermal: '温度传感器',
      storage: '存储',
      updated: '更新于',
      refresh: '刷新',
      refreshing: '刷新中',
      interval: '刷新间隔',
      manual: '手动',
      wechatOn: '低电量微信提醒 · {n}%',
      wechatOff: '微信提醒关闭',
      error: '读取失败',
      retry: '重试',
      topProcs: '占用最高的进程',
      close: '关闭',
      restart: '重启服务',
      restartConfirm: '确定重启 DSH 服务？当前页面会断开，约 5-15 秒后恢复。',
      restarting: '重启中…',
      restarted: '服务已恢复',
      restartFailed: '重启超时，请手动检查',
      svMissing: '未启用 termux-services',
      restartUnsupported: '本机未安装 termux-services，无法重启服务',
      service: '服务',
      uptime: '已运行',
      unknown: '—',
    }
    const en = {
      title: 'Server status',
      battery: 'Battery',
      cpu: 'CPU',
      mem: 'Memory',
      processor: 'Processor',
      cores: '{n} cores',
      avg: 'total',
      memory: 'Memory',
      used: 'Used',
      available: 'Available',
      swap: 'Swap',
      batterySection: 'Battery',
      discharging: 'Discharging',
      charging: 'Charging',
      full: 'Full',
      lastCharge: 'Charged until',
      sinceCharge: 'Running for',
      remaining: 'Runtime left',
      hours: 'h',
      minutes: 'min',
      never: 'not recorded',
      temp: 'Temp',
      voltage: 'Voltage',
      current: 'Current',
      health: 'Health',
      cycles: 'Cycles',
      thermal: 'Thermal',
      storage: 'Storage',
      updated: 'Updated',
      refresh: 'Refresh',
      refreshing: 'Refreshing',
      interval: 'Refresh',
      manual: 'Manual',
      wechatOn: 'WeChat alert at {n}%',
      wechatOff: 'WeChat alerts off',
      error: 'Failed to read',
      retry: 'Retry',
      topProcs: 'Top processes',
      close: 'Close',
      restart: 'Restart service',
      restartConfirm: 'Restart the DSH service? This page will disconnect for 5-15s.',
      restarting: 'Restarting…',
      restarted: 'Service is back',
      restartFailed: 'Restart timed out',
      svMissing: 'termux-services not enabled',
      restartUnsupported: 'termux-services is not installed; restart unavailable',
      service: 'Service',
      uptime: 'Uptime',
      unknown: '—',
    }

    // ── 主题色（跟随宿主）────────────────────────────────────
    const C = {
      text: 'var(--dsw-alias-label-primary, #292929)',
      text2: 'var(--dsw-alias-label-secondary, #545557)',
      text3: 'var(--dsw-alias-label-tertiary, #7f8287)',
      border: 'var(--dsw-alias-border-l1, #e8e8e8)',
      border2: 'var(--dsw-alias-border-l2, #ededed)',
      fill: 'var(--dsw-alias-fill-l2, #f5f5f5)',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04))',
      bg: 'var(--dsw-alias-bg-base, #ffffff)',
      brand: 'var(--dsw-alias-brand-primary, #4176e6)',
      danger: 'var(--dsw-alias-state-error-primary, #d93026)',
      success: 'var(--dsw-alias-state-success-primary, #2a9d6c)',
      shadow: 'var(--dsw-shadow-lv2, 0 10px 32px rgba(0,0,0,.14))',
      amber: '#de8a14',
      violet: '#8b76f6',
    }

    // 字体族与字号都跟随宿主设置：
    //   字体：--dsw-font-family / --dsh-font-family-{text,code}（用户自定义时覆盖默认栈）
    //   字号：--dsh-content-font-size（设置 → 外观 → 字号，当前 16px）
    const BASE_FONT =
      'var(--dsw-font-family, var(--dsh-font-family-text, var(--dsh-font-family-text-default, system-ui, sans-serif)))'
    const MONO =
      'var(--dsh-font-family-code, var(--dsh-font-family-code-default, ui-monospace, SFMono-Regular, monospace))'
    /** 以 14px 为设计基准，按宿主字号等比缩放；标题数字保持固定视觉重量。 */
    const sz = (px) => (px <= 14 ? `calc(var(--dsh-content-font-size, 14px) * ${(px / 14).toFixed(3)})` : `${px}px`)

    // ── 小工具 ──────────────────────────────────────────────
    function readInterval(fallback) {
      try {
        const raw = localStorage.getItem(INTERVAL_KEY)
        if (raw === null) return fallback
        const n = Number(raw)
        return Number.isFinite(n) ? n : fallback
      } catch {
        return fallback
      }
    }

    function writeInterval(v) {
      try {
        localStorage.setItem(INTERVAL_KEY, String(v))
      } catch {}
    }

    async function loadSnapshot({ full = false, refresh = false } = {}) {
      const q = []
      if (full) q.push('full=1')
      if (refresh) q.push('refresh=1')
      const res = await fetch(`${ENDPOINT}${q.length ? `?${q.join('&')}` : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    function fmtDuration(sec, t) {
      if (sec == null) return t('unknown')
      if (sec < 60) return `${sec}s`
      if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
      return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
    }

    function colorFor(kind, v) {
      if (v == null) return C.text3
      if (kind === 'battery') return v <= 10 ? C.danger : v <= 20 ? C.amber : C.success
      if (kind === 'cpu') return v >= 85 ? C.danger : C.brand
      if (kind === 'mem') return v >= 90 ? C.danger : C.violet
      return C.text
    }

    function fmtTime(iso) {
      if (!iso) return null
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      return `${mm}-${dd} ${hh}:${mi}`
    }

    function fmtHours(v, t) {
      if (v == null) return '—'
      if (v >= 1) return `${v} ${t('hours')}`
      return `${Math.max(1, Math.round(v * 60))} ${t('minutes')}`
    }

    // ── 原子组件 ────────────────────────────────────────────
    function BatteryGlyph({ pct, color, size = 16 }) {
      const w = size
      const hgt = Math.round(size * 0.56)
      const inner = Math.max(1, Math.round((w - 6) * clamp((pct ?? 0) / 100, 0, 1)))
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 1.5, lineHeight: 0 } },
        h('span', {
          style: {
            width: w,
            height: hgt,
            borderRadius: 2.5,
            border: `1.4px solid ${color}`,
            padding: 1.5,
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
          },
        }, h('span', {
          style: { width: inner, height: '100%', borderRadius: 1, background: color, display: 'block' },
        })),
        h('span', {
          style: { width: 2, height: Math.round(hgt * 0.44), borderRadius: 1, background: color, display: 'block' },
        }),
      )
    }

    function ChipIcon({ kind, color }) {
      const common = { width: 10, height: 10, viewBox: '0 0 12 12', fill: 'none', stroke: color, strokeWidth: 1.4 }
      if (kind === 'cpu') {
        return h('svg', common,
          h('rect', { x: 2.5, y: 2.5, width: 7, height: 7, rx: 1.5 }),
          h('rect', { x: 5, y: 5, width: 2, height: 2, fill: color, stroke: 'none' }),
          h('path', { d: 'M6 .8v1.2M6 10v1.2M.8 6h1.2M10 6h1.2' }))
      }
      return h('svg', common,
        h('rect', { x: 1.2, y: 3.2, width: 9.6, height: 5.6, rx: 1.4 }),
        h('path', { d: 'M4 3.2v5.6M8 3.2v5.6' }))
    }

    function MiniBar({ pct, color, height = 4 }) {
      return h('span', {
        style: { display: 'block', height, borderRadius: height, background: C.fill, overflow: 'hidden' },
      }, h('span', {
        style: {
          display: 'block',
          height: '100%',
          width: `${clamp(pct ?? 0, 0, 100)}%`,
          borderRadius: height,
          background: color,
          transition: 'width .3s ease',
        },
      }))
    }

    function Row({ label, value, mono }) {
      return h('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '4px 0' },
      },
      h('span', { style: { fontSize: sz(11), color: C.text3 } }, label),
      h('span', { style: { fontSize: sz(11.5), color: C.text, fontFamily: mono ? MONO : BASE_FONT } }, value))
    }

    function SectionTitle({ children, right }) {
      return h('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 0 6px' },
      },
      h('span', { style: { fontSize: sz(10), fontWeight: 600, letterSpacing: '.04em', color: C.text3, textTransform: 'uppercase' } }, children),
      right ? h('span', { style: { fontSize: sz(10), color: C.text3 } }, right) : null)
    }

    // ── 浮层 ────────────────────────────────────────────────
    function DetailPanel({ data, t, onClose, onRefresh, refreshing, interval, setIntervalValue, onRestart, restarting, restartNote }) {
      const b = data.battery || {}
      const p = data.power || {}
      const cpu = data.cpu || {}
      const mem = data.mem || {}
      const th = data.thermal || {}
      const disk = data.disk || {}
      const dev = data.device || {}
      const cfg = data.config || {}
      const svc = data.service || {}

      const statusText = b.full ? t('full') : b.charging ? t('charging') : t('discharging')

      const batteryChips = [
        { label: t('lastCharge'), value: p.lastChargeEndAt ? fmtTime(p.lastChargeEndAt) : t('never') },
        { label: t('sinceCharge'), value: fmtHours(p.sinceChargeH, t) },
        { label: t('remaining'), value: b.charging ? '—' : fmtHours(data.runtimeH, t) },
      ]

      return h('div', {
        role: 'dialog',
        'aria-label': t('title'),
        style: {
          position: 'fixed', left: 12, bottom: 84, width: 372, maxHeight: '72vh', overflow: 'auto',
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: C.shadow,
          padding: '12px 14px 10px', zIndex: 60, fontFamily: BASE_FONT, color: C.text,
        },
        onMouseDown: (e) => e.stopPropagation(),
      },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 } },
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontSize: sz(13.5), fontWeight: 600 } }, t('title')),
          h('div', { style: { fontSize: sz(10), color: C.text3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
            `${dev.model || '—'} · Android ${dev.android || '?'} · ${dev.soc || '?'}`),
          h('div', { style: { fontSize: sz(9.5), color: C.text3, marginTop: 2 } },
            svc.available === false
              ? `${t('service')} · ${t('svMissing')}`
              : `${t('service')} ${svc.name || 'dshweb'} · ${svc.state || '?'}${svc.uptimeSec != null ? ` · ${t('uptime')} ${fmtDuration(svc.uptimeSec, t)}` : ''}`)),
        h('button', {
          type: 'button',
          onClick: onRefresh,
          title: t('refresh'),
          'aria-label': t('refresh'),
          style: {
            border: `1px solid ${C.border}`, background: C.bg, borderRadius: 7, width: 26, height: 26,
            cursor: 'pointer', color: C.text2, fontSize: sz(13), lineHeight: 1, padding: 0,
          },
        }, refreshing ? '…' : '⟳'),
        data.caps?.sv === false ? null : h('button', {
          type: 'button',
          onClick: onRestart,
          disabled: restarting,
          title: restarting ? t('restarting') : t('restart'),
          'aria-label': t('restart'),
          style: {
            border: `1px solid ${restarting ? C.border : C.border}`, background: C.bg, borderRadius: 7,
            width: 26, height: 26, cursor: restarting ? 'default' : 'pointer',
            color: restarting ? C.text3 : C.danger, fontSize: 12, lineHeight: 1, padding: 0,
          },
        }, restarting ? '…' : '⏻'),
        h('button', {
          type: 'button',
          onClick: onClose,
          title: t('close'),
          'aria-label': t('close'),
          style: {
            border: 'none', background: 'transparent', width: 24, height: 26, cursor: 'pointer',
            color: C.text3, fontSize: sz(14), lineHeight: 1, padding: 0,
          },
        }, '×')),

      // 处理器
      h(SectionTitle, { right: `${t('cores', cpu.cores ?? dev.cores ?? 8)}${dev.maxFreqMhz ? ` · ${(dev.maxFreqMhz / 1000).toFixed(2)} GHz` : ''}` }, t('processor')),
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 } },
        h('span', { style: { fontSize: sz(26), fontWeight: 600, lineHeight: 1, color: colorFor('cpu', cpu.usagePct) } }, cpu.usagePct ?? '—'),
        h('span', { style: { fontSize: sz(11), color: C.text3 } }, '%'),
        h('span', { style: { marginLeft: 'auto', fontSize: sz(10), color: C.text3 } }, `${t('avg')} · ${(cpu.freqs || []).find((f) => f) ?? '?'} MHz`)),
      h(MiniBar, { pct: cpu.usagePct, color: colorFor('cpu', cpu.usagePct) }),

      cpu.top && cpu.top.length
        ? h('div', { style: { marginTop: 8 } },
            h('div', { style: { fontSize: sz(9.5), color: C.text3, marginBottom: 2 } }, t('topProcs')),
            cpu.top.slice(0, 3).map((pr) => h('div', {
              key: pr.pid,
              style: { display: 'flex', gap: 8, fontSize: sz(10), color: C.text2, padding: '2px 0' },
            },
            h('span', { style: { fontFamily: MONO, color: C.text3, width: 30 } }, pr.cpu + '%'),
            h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, pr.cmd),
            h('span', { style: { fontFamily: MONO, color: C.text3 } }, `${pr.rssMb} MB`))))
        : null,

      // 内存
      h(SectionTitle, { right: `${mem.usedGb ?? '—'} / ${mem.totalGb ?? '—'} GB` }, t('memory')),
      h(MiniBar, { pct: mem.usedPct, color: colorFor('mem', mem.usedPct) }),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: sz(10), color: C.text3, marginTop: 4 } },
        h('span', null, `${t('used')} ${mem.usedPct ?? '—'}%`),
        h('span', null, `${t('available')} ${mem.availableGb ?? '—'} GB`)),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 } },
        h('span', { style: { fontSize: sz(9.5), color: C.text3, width: 34 } }, t('swap')),
        h('span', { style: { flex: 1 } }, h(MiniBar, { pct: mem.swapUsedPct, color: C.text3, height: 3 })),
        h('span', { style: { fontSize: sz(9.5), color: C.text3, fontFamily: MONO } }, `${mem.swapUsedGb ?? 0}/${mem.swapTotalGb ?? 0} GB`)),

      // 电池
      h(SectionTitle, { right: statusText }, t('batterySection')),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h(BatteryGlyph, { pct: b.percent, color: colorFor('battery', b.percent), size: 22 }),
        h('span', { style: { fontSize: sz(22), fontWeight: 600, lineHeight: 1, color: colorFor('battery', b.percent) } }, b.percent ?? '—'),
        h('span', { style: { fontSize: sz(11), color: C.text3 } }, '%'),
        h('span', { style: { marginLeft: 'auto', fontSize: sz(10), color: C.text3 } },
          b.temperatureC != null ? `${b.temperatureC}°C` : '')),
      h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
        batteryChips.map((chip) => h('div', {
          key: chip.label,
          style: { flex: 1, background: C.fill, borderRadius: 8, padding: '6px 7px' },
        },
        h('div', { style: { fontSize: sz(9), color: C.text3 } }, chip.label),
        h('div', { style: { fontSize: sz(10.5), fontWeight: 500, marginTop: 2, fontFamily: MONO, color: C.text } }, chip.value)))),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 } },
        [['temp', b.temperatureC != null ? `${b.temperatureC} °C` : '—'],
         ['voltage', b.voltageV != null ? `${b.voltageV} V` : '—'],
         ['current', b.currentMa != null ? `${Math.abs(b.currentMa)} mA` : '—']].map(([k, v]) => h('div', { key: k },
          h('div', { style: { fontSize: sz(9), color: C.text3 } }, t(k)),
          h('div', { style: { fontSize: sz(10.5), fontFamily: MONO, marginTop: 1 } }, v)))),
      h('div', { style: { fontSize: sz(9.5), color: C.text3, marginTop: 6 } },
        `${t('health')} ${b.health ?? '—'} · ${t('cycles')} ${b.cycle ?? '—'}`),

      // 温度
      h(SectionTitle, { right: `${th.sensors ?? 0} sensors` }, t('thermal')),
      h('div', { style: { display: 'flex', gap: 6 } },
        [['PMIC', th.pmicC, C.amber], [t('battery'), th.batteryC ?? b.temperatureC, C.success], ['CPU', th.cpuC, C.brand]]
          .map(([label, val, color]) => h('div', {
            key: label,
            style: { flex: 1, background: C.fill, borderRadius: 8, padding: '6px 8px' },
          },
          h('div', { style: { fontSize: sz(9), color: C.text3 } }, label),
          h('div', { style: { fontSize: sz(11), fontWeight: 500, marginTop: 2, fontFamily: MONO } }, val != null ? `${val}°C` : '—')))),

      // 存储
      h(SectionTitle, { right: `${disk.usedGb ?? '—'} / ${disk.totalGb ?? '—'} GB` }, t('storage')),
      h(MiniBar, { pct: disk.usedPct, color: '#6eaa78', height: 5 }),

      // 页脚
      h('div', {
        style: {
          marginTop: 12, paddingTop: 8, borderTop: `1px solid ${C.border2}`,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        },
      },
      h('span', { style: { fontSize: sz(9), color: C.text3 } }, `${t('updated')} ${data.collectedAt ? new Date(data.collectedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}`),
      h('span', { style: { marginLeft: 'auto', fontSize: sz(9), color: C.text3 } }, t('interval')),
      INTERVALS.map((sec) => h('button', {
        key: sec,
        type: 'button',
        onClick: () => setIntervalValue(sec),
        style: {
          border: `1px solid ${interval === sec ? C.brand : C.border}`,
          background: interval === sec ? 'rgba(65,118,230,.08)' : 'transparent',
          color: interval === sec ? C.brand : C.text3,
          borderRadius: 6, fontSize: sz(9), padding: '2px 5px', cursor: 'pointer',
        },
      }, sec >= 3600 ? `${sec / 3600}h` : `${sec / 60}m`))),

      h('div', { style: { fontSize: sz(9), color: C.text3, marginTop: 6, display: 'flex', gap: 8 } },
        h('span', null, cfg.wechatAlerts ? t('wechatOn', cfg.lowBatteryPct) : t('wechatOff')),
        restartNote ? h('span', { style: { color: restartNote.ok ? C.success : C.danger } }, restartNote.text) : null))
    }

    // ── 侧边栏入口 ──────────────────────────────────────────
    function TermuxStateEntry({ wide, t }) {
      const tr = (key, arg) => {
        let v = typeof t === 'function' ? t(key) : undefined
        if (typeof v !== 'string' || v === key) v = zh[key] ?? key
        return arg === undefined ? v : String(v).replace('{n}', String(arg))
      }

      const [data, setData] = react.useState(null)
      const [error, setError] = react.useState(null)
      const [open, setOpen] = react.useState(false)
      const [refreshing, setRefreshing] = react.useState(false)
      const [interval, setIntervalValue] = react.useState(() => readInterval(60))
      const [hover, setHover] = react.useState(false)
      const [restarting, setRestarting] = react.useState(false)
      const [restartNote, setRestartNote] = react.useState(null)
      const rootRef = react.useRef(null)

      const refresh = react.useCallback(async (opts = {}) => {
        setRefreshing(true)
        try {
          const next = await loadSnapshot({ full: true, refresh: opts.force !== false })
          setData(next)
          setError(null)
        } catch (e) {
          setError(e?.message || String(e))
        } finally {
          setRefreshing(false)
        }
      }, [])

      // 重启服务：先确认，再 POST，然后轮询到服务恢复
      const handleRestart = react.useCallback(async () => {
        if (restarting) return
        if (data?.caps?.sv === false) {
          setRestartNote({ ok: false, text: tr('restartUnsupported') })
          return
        }
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(tr('restartConfirm'))) return
        setRestarting(true)
        setRestartNote({ ok: true, text: tr('restarting') })
        try {
          // 服务可能先于响应断开，请求失败属于预期
          await fetch(RESTART_ENDPOINT, { method: 'POST' }).catch(() => {})
          const deadline = Date.now() + 90_000
          while (Date.now() < deadline) {
            await sleep(2000)
            try {
              const next = await loadSnapshot({ full: true, refresh: true })
              setData(next)
              setError(null)
              setRestartNote({ ok: true, text: tr('restarted') })
              setRestarting(false)
              return
            } catch {}
          }
          setRestartNote({ ok: false, text: tr('restartFailed') })
        } finally {
          setRestarting(false)
        }
      }, [restarting])

      // 首次加载 + 定时轮询（打开浮层时加密到 5s）
      react.useEffect(() => {
        let alive = true
        let timer = null
        const tick = async () => {
          try {
            const next = await loadSnapshot({ full: true })
            if (!alive) return
            setData(next)
            setError(null)
          } catch (e) {
            if (alive) setError(e?.message || String(e))
          }
        }
        tick()
        const period = interval > 0 ? interval * 1000 : 0
        if (period > 0) timer = setInterval(tick, period)
        return () => {
          alive = false
          if (timer) clearInterval(timer)
        }
      }, [interval, open])

      // 点击外部关闭
      react.useEffect(() => {
        if (!open) return undefined
        const onDown = (e) => {
          if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => {
          if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      const b = data?.battery || {}
      const cpu = data?.cpu || {}
      const mem = data?.mem || {}
      const bp = b.percent
      const bColor = colorFor('battery', bp)

      const setIv = (v) => {
        setIntervalValue(v)
        writeInterval(v)
      }

      const btnStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        border: `1px solid ${hover || open ? C.border : 'transparent'}`,
        background: hover || open ? C.hover : 'transparent',
        borderRadius: 10,
        padding: wide ? '8px 10px' : '6px 0',
        cursor: 'pointer',
        fontFamily: BASE_FONT,
        textAlign: 'left',
        transition: 'background .15s ease',
      }

      const content = wide
        ? h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              h('span', {
                style: { width: 6, height: 6, borderRadius: 3, background: error ? C.danger : C.success, flex: 'none' },
              }),
              h('span', { style: { fontSize: sz(12.5), fontWeight: 500, color: C.text } }, tr('title'))),
            h('div', { style: { display: 'flex', gap: 5, marginTop: 6 } },
              h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3, background: C.fill, borderRadius: 6, padding: '2px 6px' } },
                h(BatteryGlyph, { pct: bp, color: bColor, size: 11 }),
                h('span', { style: { fontSize: sz(9.5), color: C.text2, fontFamily: MONO } }, `${bp ?? '—'}%`)),
              h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3, background: C.fill, borderRadius: 6, padding: '2px 6px' } },
                h(ChipIcon, { kind: 'cpu', color: colorFor('cpu', cpu.usagePct) }),
                h('span', { style: { fontSize: sz(9.5), color: C.text2, fontFamily: MONO } }, `${cpu.usagePct ?? '—'}%`)),
              h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3, background: C.fill, borderRadius: 6, padding: '2px 6px' } },
                h(ChipIcon, { kind: 'mem', color: colorFor('mem', mem.usedPct) }),
                h('span', { style: { fontSize: sz(9.5), color: C.text2, fontFamily: MONO } }, `${mem.usedPct ?? '—'}%`))))
        : h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 } },
            h(BatteryGlyph, { pct: bp, color: bColor, size: 15 }),
            h('span', { style: { fontSize: sz(8), color: C.text3, fontFamily: MONO } }, `${bp ?? '—'}%`),
            h('span', { style: { width: 18 } }, h(MiniBar, { pct: cpu.usagePct, color: colorFor('cpu', cpu.usagePct), height: 2 })),
            h('span', { style: { width: 18 } }, h(MiniBar, { pct: mem.usedPct, color: colorFor('mem', mem.usedPct), height: 2 })))

      return h('div', { ref: rootRef, style: { position: 'relative', width: '100%' } },
        h('button', {
          type: 'button',
          onClick: () => setOpen((v) => !v),
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          'aria-expanded': open,
          'aria-label': tr('title'),
          title: data
            ? `${tr('battery')} ${bp}% · ${tr('cpu')} ${cpu.usagePct}% · ${tr('mem')} ${mem.usedPct}%`
            : tr('title'),
          style: btnStyle,
        }, content),
        open
          ? h(DetailPanel, {
              data: data || { battery: {}, cpu: {}, mem: {}, thermal: {}, disk: {}, device: {}, config: {}, power: {} },
              t: tr,
              onClose: () => setOpen(false),
              onRefresh: () => refresh(),
              refreshing,
              interval,
              setIntervalValue: setIv,
              onRestart: handleRestart,
              restarting,
              restartNote,
            })
          : null)
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'termux-state: dictionaries')
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'termux-state', locale: NS, order: 5 },
          TermuxStateEntry,
        ))
    }

    exports.apply = apply
    exports.inject = inject
    exports.TermuxStateEntry = TermuxStateEntry
    return module.exports
  },
})
