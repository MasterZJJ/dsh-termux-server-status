# dsh-termux-server-status

> DeepSeek Harness（DSH）Web 侧边栏的「服务器状态」插件。
> 在侧边栏底部常驻一枚入口，一眼看到这台 Termux 手机的电量 / CPU / 内存；点开是一个完整快照浮层：
> 设备、电池、充电周期、温度、存储、runit 服务状态，以及「重启服务」按钮。

- 包名（npm 名）：`dsh-termux-state`
- 仓库：`MasterZJJ/dsh-termux-server-status`
- 适用：Termux / Android 上的 DSH Web（已在 DSH `0.2.2-rc.5` + Android 14 实测）
- 许可证：MIT

---

## 目录

- [界面](#界面)
- [功能](#功能)
- [快速开始](#快速开始)
- [配置](#配置)
- [HTTP 接口](#http-接口)
- [数据来源与口径](#数据来源与口径)
- [状态文件](#状态文件)
- [工作原理](#工作原理)
- [字体与字号](#字体与字号)
- [开发与调试](#开发与调试)
- [故障排查](#故障排查)
- [已知限制](#已知限制)
- [路线图](#路线图)
- [许可证](#许可证)

---

## 界面

侧边栏入口挂在 `sidebar.footer.action`（「设置」上方，`order: 5`），两种形态自适应：

```text
展开态（≥ 宽侧边栏）                         收起态（56px 竖栏）
┌────────────────────────────┐              ┌──────┐
│ ● 服务器状态                │              │ ▭▭▭  │  ← 电池图标 + 百分比
│ [▭ 49%] [▣ 3.8%] [▤ 43.1%] │              │  49% │
└────────────────────────────┘              │ ▬▬   │  ← CPU 迷你条
        ↑ 点击展开详情浮层                    │ ▬▬   │  ← 内存迷你条
                                             └──────┘
```

详情浮层（`role="dialog"`，宽 372，最大高 72vh，Esc / 点击外部关闭）：

| 区块 | 内容 |
|---|---|
| 头部 | 设备型号 · Android 版本 · SoC；服务名 · 状态 · 已运行时长；`⟳` 刷新 / `⏻` 重启 / `×` 关闭 |
| 处理器 | 整机占用大号读数 + 条形图 + 平均频率；占用最高的 3 个进程（CPU% / 命令 / RSS） |
| 内存 | 已用/总量、可用、Swap 条形图 |
| 电池 | 电量、状态（放电中/充电中/已充满）、温度、电压、电流、健康、循环；「上次充电结束 / 已用 / 预计剩余」三枚小卡 |
| 温度 | PMIC / 电池 / CPU 三个代表温度（从 60+ 个 thermal zone 里挑）+ 传感器总数 |
| 存储 | `$HOME` 已用 / 总量条形图 |
| 页脚 | 更新时间、刷新间隔（1m / 30m / 60m）、低电量提醒状态、重启结果提示 |

颜色语义：电量 ≤20% 转黄、≤10% 转红；CPU ≥85% 转红；内存 ≥90% 转红。

## 功能

- **侧边栏常驻入口**：展开态是「电量 / CPU / 内存」三枚胶囊，收起态是电池图标 + 两条迷你条。
- **一次刷新覆盖全部指标**：电量、CPU、内存、温度、存储、服务状态来自同一份快照，读数不会互相错位。
- **充电周期记忆**：记录上次开始充电 / 上次充电结束 / 上次充满，回答「上次充电后用了多久」。进程重启后从状态文件恢复。
- **续航估算**：放电时按 `当前容量 ÷ 放电电流` 估算剩余小时数。
- **服务状态与一键重启**：读取 `sv status <service>`；浮层右上 `⏻` 确认后执行 `sv restart`，前端每 2s 轮询最多 90s 等待服务回来。
- **刷新间隔可调**：1 / 30 / 60 分钟，保存在 `localStorage`；打开浮层立即刷新一次。
- **低电量微信提醒**（可选）：默认关闭。开启后 ≤ 阈值触发，之后每再降 5% 才重复提醒，充电中不提醒。
- **无构建步骤**：客户端是手写的 `__ModuleLoader__` bundle，改完直接生效，无需打包器。
- **多语言**：内置中英文案，跟随宿主 locale；默认中文。
- **字体字号跟随宿主**：使用宿主 CSS 变量，不写死字体族与字号。

## 快速开始

### 前置条件

| 依赖 | 必需 | 说明 |
|---|---|---|
| Termux | ✅ | Android 上的 Termux |
| DSH | ✅ | 宿主需提供 `webServer` 与 `sidebar.footer.action` 插槽（`0.2.x` 起） |
| Node.js | ✅ | 与宿主一致（DSH `0.2.2-rc.5` 要求 `>= 24.9.0`） |
| Termux:API（App + `pkg install termux-api`） | 推荐 | 没有则电量整块降级为不可用，其余指标照常 |
| termux-services（提供 `sv`） | 推荐 | 没有则隐藏服务状态与重启按钮 |

```bash
# node 必须满足宿主要求（DSH 0.2.2-rc.5 为 >= 24.9.0），Termux 的 nodejs 包即可
pkg install nodejs git termux-api termux-services
# Termux:API 还需从 F-Droid 安装同名 App（只装命令行包不够）
```

### 安装（推荐：从 GitHub 克隆后跑安装脚本）

```bash
git clone git@github.com:MasterZJJ/dsh-termux-server-status.git ~/.dsh-plugins/dsh-termux-state
node ~/.dsh-plugins/dsh-termux-state/scripts/install.mjs
sv restart dsh-web      # 或：重启你自己的 DSH 宿主进程
```

`install.mjs` 做三件事，全部幂等：

1. 把 `lib/`、`cordis.patch.yml`、`package.json`、`README.md` 复制到
   `<DSH_HOME>/profiles/<profile>/node_modules/dsh-termux-state`；
2. 在 profile 的 `package.json` 里登记依赖（`file:<插件源目录>`）与
   `dsh.profile.bundles` 条目；
3. 打印「重启宿主后生效」。

支持的参数（默认值取自环境，通常不用传）：

```bash
node scripts/install.mjs [--profile web] [--home ~/.dsh-v021] [--dry-run]
```

只想看看会装到哪里、不落盘：

```bash
node scripts/install.mjs --dry-run
```

### 其他安装方式

**已把仓库 clone 在别处**：直接跑该目录下的 `scripts/install.mjs` 即可（脚本以自身位置推导插件源目录）。

**手动安装**（等价于脚本行为）：

```bash
P=~/.dsh-v021/profiles/web
cp -r lib cordis.patch.yml package.json README.md $P/node_modules/dsh-termux-state/
```

然后编辑 `$P/package.json`：

```jsonc
{
  "dependencies": { "dsh-termux-state": "file:/绝对路径/到/dsh-termux-state" },
  "dsh": { "profile": { "bundles": [ /* ... 其他 bundle ... */, "dsh-termux-state" ] } }
}
```

> **bundle 只在宿主启动时装载**，装完必须重启宿主，否则侧边栏不会出现入口。

### 升级

```bash
cd ~/.dsh-plugins/dsh-termux-state
git pull --ff-only
node scripts/install.mjs
sv restart dsh-web
```

### 卸载

1. 从 profile 的 `package.json` 里删掉 `dependencies["dsh-termux-state"]` 与
   `dsh.profile.bundles` 中的 `"dsh-termux-state"`；
2. 删除 `<DSH_HOME>/profiles/<profile>/node_modules/dsh-termux-state`；
3. 重启宿主；
4. 可选：删除 `<DSH_HOME>/dsh-termux-state/state.json`（充电周期记录与提醒状态）。

## 配置

在 profile 的 `cordis.patch.yml` 里按插件 id（`termux-state`）配置：

```yaml
- id: termux-state
  config:
    refreshSeconds: 60        # 客户端默认刷新间隔（秒），60–3600
    lowBatteryPct: 20         # 低电量微信提醒阈值（百分比），1–100
    wechatAlerts: false       # 低电量微信提醒，默认关闭
    service: dsh-web          # runit 服务名，对应 sv status <name>，缺省 dshweb
    historyLog: null          # 可选：首次启动回填充电时刻用的 JSONL 监控日志路径
```

| 键 | 类型 | 默认 | 范围 / 约束 | 说明 |
|---|---|---|---|---|
| `refreshSeconds` | number | `60` | 60–3600 | 下发给前端的默认刷新间隔；用户在浮层里改过则以 `localStorage` 为准 |
| `lowBatteryPct` | number | `20` | 1–100 | 低电量提醒阈值，需同时开启 `wechatAlerts` |
| `wechatAlerts` | boolean | `false` | 仅 `true` 开启 | 依赖已接入的 DSH-IM 微信机器人，见下文 |
| `service` | string | `dshweb` | `/^[\w.-]{1,64}$/` | runit 服务名。本仓库文档中的示例宿主用的是 `dsh-web`，**按自己机器改** |
| `historyLog` | string \| null | `null` | 非空路径 | 兼容旧监控脚本的 JSONL 日志，用于首次启动回填充电时刻；不需要就留空 |

配置非法时插件启动会报错（校验失败），不会静默使用错误口径。

### 关于低电量微信提醒

默认**关闭**：换机器安装时一般没有接入微信机器人，开着只会让每次告警静默失败。
开启前提（复用 DSH-IM 的微信机器人凭据）：

- `<DSH_HOME>/integrations/dsh-weixin/config.json` 里有 `accounts[0]`（`botId`、`ownerUserId`、`tokenRef`、`baseUrl`）；
- `<DSH_HOME>/.credentials.yaml`（或 `tokenRef` 指向的环境变量）里有对应 token；
- 可选 `<DSH_HOME>/integrations/dsh-weixin/accounts/<botId>/state.json` 提供 `context_token`。

发送走 `POST {baseUrl}/ilink/bot/sendmessage`，与工作区里的 `wechat_push.py` 同一套协议。
提醒文案包含：电量、状态、温度、电压、预计续航、上次充电后已用时长。

## HTTP 接口

两个端点都由宿主 `webServer` 注册，**不额外监听端口**，全部**仅接受回环来源**（非 `127.0.0.1` / `::1` 返回 `403`）。

### `GET /api/dsh-termux-state/snapshot`

| 查询参数 | 作用 |
|---|---|
| 无 | 常规快照，服务端 4s 缓存 |
| `full=1` | 附带进程榜（`cpu.top`） |
| `refresh=1` | 绕过缓存强制重新采集 |

```bash
curl -s 'http://127.0.0.1:3080/api/dsh-termux-state/snapshot?full=1' | jq .
```

返回示例（省略部分字段，实测输出）：

```json
{
  "collectedAt": "2026-11-23T05:25:44.025Z",
  "device": { "model": "SM-F731B", "android": "14", "sdk": "34", "soc": "SM8550",
              "abi": "arm64-v8a", "cores": 7, "maxFreqMhz": 2016, "arch": "arm64" },
  "cpu": { "usagePct": 3.8, "cores": 7, "freqs": [1018, 1018, 1018, 845, 845, 845, 845],
           "top": [], "visibleProcs": 25 },
  "mem": { "available": true, "totalGb": 6.99, "usedGb": 3.01, "availableGb": 3.98,
           "cachedGb": 3.34, "usedPct": 43.1, "swapTotalGb": 3, "swapUsedGb": 0.84, "swapUsedPct": 27.9 },
  "battery": { "available": true, "percent": 49, "status": "DISCHARGING", "charging": false,
               "full": false, "plugged": "UNPLUGGED", "health": "GOOD", "temperatureC": 28.3,
               "voltageV": 3.801, "currentMa": -650, "cycle": 0, "chargeCounterMah": 1681 },
  "thermal": { "available": true, "sensors": 64, "hotspotC": 46.3, "hotspotType": "cpu-1-9",
               "pmicC": 34.1, "batteryC": 28.3, "cpuC": 46.3 },
  "disk": { "available": true, "totalGb": 460.7, "usedGb": 33.8, "freeGb": 426.9, "usedPct": 7.3 },
  "runtimeH": null,
  "service": { "available": true, "name": "dsh-web", "state": "run", "pid": 30168,
               "uptimeSec": 1524, "raw": "run: dsh-web: (pid 30168) 1524s; ..." },
  "caps": { "sv": true, "battery": true },
  "power": { "lastChargeStartAt": "2026-11-22T00:58:51.786Z",
             "lastChargeEndAt": "2026-11-22T02:28:51.954Z",
             "lastFullAt": "2026-11-22T07:50:04.709Z",
             "sinceChargeH": 26.9, "charging": false },
  "alert": { "enabled": false, "thresholdPct": 20, "lastAlertPct": null,
             "lastAlertAt": null, "lastAlertOk": null },
  "config": { "refreshSeconds": 60, "lowBatteryPct": 20, "wechatAlerts": false }
}
```

约定：任何一块能力不可用时，对应子对象返回 `{ "available": false, ... }`，而不是让整个请求失败；
`caps.sv` / `caps.battery` 告诉前端要不要显示服务状态与重启按钮。

### `POST /api/dsh-termux-state/restart`

重启配置里的 runit 服务（默认动作等价于 `sv restart <service>`）。

- 仅 `POST`，否则 `405`；
- 未安装 termux-services（没有 `sv`）时返回 `409`，前端据此提示「本机未安装 termux-services」；
- 成功时**先回 `202 { ok: true, service, scheduled: true }`，250ms 后**才 spawn `sv restart` ——
  因为重启会杀掉正在处理请求的进程，先回包再执行才不会让前端拿到连接错误；
- 前端把请求失败视为正常，随后每 2s 轮询 `/snapshot` 直到服务恢复（最多 90s）。

```bash
curl -s -X POST http://127.0.0.1:3080/api/dsh-termux-state/restart
# {"ok":true,"service":"dsh-web","scheduled":true}
```

安全边界：两个端点都只服务回环地址；重启接口不接收任何参数，服务名只来自宿主配置。

## 数据来源与口径

| 指标 | 来源 | 说明 |
|---|---|---|
| 电池 | `termux-battery-status` | 需要 Termux:API；缺失时整块 `available: false` |
| 内存 / Swap | `/proc/meminfo` | `MemAvailable` 口径计算已用 |
| CPU | `/proc/<pid>/stat` 差分（400ms 采样） | Android 禁止读 `/proc/stat`、`/proc/loadavg`，只能累加当前 uid 可见进程的 `utime+stime`；占比按「核心数 × 采样时长」折算 |
| 频率 | `/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq` | 每核读数，界面显示平均 |
| 温度 | `/sys/class/thermal/thermal_zone*/` | 过滤超范围读数；PMIC 按 `pm8550` 匹配，热点取非 PMIC 的最高温 |
| 存储 | `statfs($HOME)` | 用 `bavail` 算可用，已用 = 总量 − 可用 |
| 设备 | `getprop` + `cpuinfo_max_freq` | 启动时读一次并缓存，之后不变 |
| 服务 | `sv status <service>` | 解析 `run: <name>: (pid N) 123s` |
| 运行时长 | 插件自身采样（+ 可选日志回填） | `/proc/uptime` 被禁止 |

**采样节奏**：宿主后台每 60s 采样一次电量以推进充电周期状态；HTTP 快照有 4s 服务端缓存与并发合并
（同一时刻只跑一次采集），前端仅在浮层打开时按间隔轮询。

## 状态文件

`<DSH_HOME>/dsh-termux-state/state.json`：

```json
{
  "version": 1,
  "lastChargeStartAt": "2026-11-22T00:58:51.786Z",
  "lastChargeEndAt": "2026-11-22T02:28:51.954Z",
  "lastFullAt": "2026-11-22T07:50:04.709Z",
  "charging": false,
  "lastPercent": 49,
  "lastAlertPct": null,
  "lastAlertAt": null,
  "updatedAt": "2026-11-23T05:25:44.025Z"
}
```

删除该文件即重置充电周期记录与提醒状态（下次启动重新开始记录）。

`DSH_HOME` 的解析顺序：环境变量 `DSH_HOME` → `~/.dsh` → `~/.dsh-v021` → `~/.dsh-rc5-test` → 回退 `~/.dsh`。

## 工作原理

```text
┌──────────────────────────── DSH 宿主进程 ────────────────────────────┐
│                                                                      │
│  lib/index.js  插件主体                                               │
│   ├─ ctx.webServer.register()  →  GET  /snapshot  (4s cache)          │
│   ├─ ctx.webServer.register()  →  POST /restart   (先 202 后 spawn)   │
│   ├─ setInterval(60s) 采样 → state.js 推进充电周期 / wechat.js 告警    │
│   └─ Config 校验（~standard vendor schema）                           │
│                                                                      │
│  lib/metrics.js   只读采集：battery / mem / cpu / thermal / disk      │
│  lib/state.js     充电周期状态持久化 + 日志回填                        │
│  lib/wechat.js    复用 DSH-IM 微信机器人凭据发消息                     │
│                                                                      │
│  lib/client.js    浏览器端 bundle（无构建步骤）                        │
│   ├─ window.__ModuleLoader__.load({ id, factory })                    │
│   ├─ slots.inject('sidebar.footer.action') → 入口（order 5）           │
│   ├─ locale.register(NS, { zh, en })                                  │
│   └─ 浮层：打开时按间隔轮询 /snapshot，⏻ 调 /restart 后轮询等恢复       │
└──────────────────────────────────────────────────────────────────────┘
```

设计取舍：

- **只读为主**：除重启服务外不做任何写入；采集全部走 `/proc`、`/sys` 与 Termux:API。
- **降级而非报错**：任何一项能力缺失只影响对应区块，接口永远返回 200 + `available` 标记。
- **先回包后重启**：`sv restart` 会杀掉本进程，所以先写 202，再延迟 spawn。
- **客户端零构建**：手写 bundle，调试时改 `lib/client.js` 即可，省掉打包链路。

## 字体与字号

跟随宿主设置，不写死：

- 字体族：`--dsw-font-family`（用户自定义时优先 `--dsh-font-family-text`），等宽用 `--dsh-font-family-code`；
- 字号：以 14px 为设计基准，所有文字 `calc(var(--dsh-content-font-size, 14px) * 比例)`，
  因此用户把字号调大时插件同步放大；26/22px 的大号读数保持固定。

注意：宿主侧边栏自身用固定 14px，不随字号设置缩放；若插件显得比邻近标签大，可把 `sz()` 改成
`min()` 封顶或退回固定值。

## 开发与调试

```bash
# 1. 改代码：lib/*.js 才是源文件（profile 里的 node_modules 只是安装副本）
# 2. 重新安装到 profile（幂等，可反复执行）
node scripts/install.mjs
# 3. 重启宿主
sv restart dsh-web

# 验证接口
curl -s 'http://127.0.0.1:3080/api/dsh-termux-state/snapshot?refresh=1' | jq .service
```

调试要点：

- 宿主端改动（`index.js` / `metrics.js` / `state.js` / `wechat.js`）**必须重启宿主**；
- 客户端 bundle（`client.js`）同样随宿主启动装载；若在 DSH 检出版本里跑着 `pnpm run dev:web`，
  客户端改动可热更新，否则也是重启；
- 宿主日志：`$PREFIX/var/log/sv/dsh-web/current`（runit）或 `dsh web` 的前台输出；
- 采集器单独试跑（不依赖宿主）：

```bash
node --input-type=module -e "
import('./lib/metrics.js').then(async (m) => {
  console.log(await m.batterySnapshot())
  console.log(await m.memSnapshot())
  console.log(await m.thermalSnapshot())
  console.log(await m.serviceStatus('dsh-web'))
})"
```

目录结构：

```text
.
├── README.md
├── CHANGELOG.md
├── LICENSE
├── package.json          # dsh.bundle.patch / dsh.client 声明
├── cordis.patch.yml      # 作为 profile bundle 挂载时 insert 本插件
├── lib/
│   ├── index.js          # 宿主端：路由、采样、配置校验
│   ├── metrics.js        # 采集器（电池/内存/CPU/温度/存储/服务）
│   ├── state.js          # 充电周期状态
│   ├── wechat.js         # 微信推送
│   └── client.js         # 浏览器端 bundle（手写 __ModuleLoader__）
└── scripts/
    └── install.mjs       # 安装到 profile（幂等）
```

## 故障排查

| 现象 | 排查方向 |
|---|---|
| 侧边栏看不到入口 | profile 的 `package.json` 里是否登记了 `dsh.profile.bundles`；装完是否重启宿主；启动日志里有没有 `dsh-termux-state` 装载失败 |
| 电量为 `—` / `available: false` | 没装 Termux:API App 或缺少 `pkg install termux-api`；手动跑 `termux-battery-status` 验证 |
| 点「重启」提示未安装 termux-services（409） | `command -v sv` 为空；`pkg install termux-services` 后 `sv-enable` 对应服务 |
| 服务区块显示 `status-failed` / 状态 `unknown` | `service` 配置名与实际 runit 服务名不一致，手动 `sv status <name>` 核对 |
| 重启后页面没恢复 | 服务确实没起来：看 `$PREFIX/var/log/sv/<service>/current`；前端最多等 90s 后提示超时 |
| CPU 百分比偏低 | 预期行为：Android 只允许统计当前 uid 可见进程，不含系统整体占用 |
| 低电量不推送 | `wechatAlerts` 默认 `false`；另外需 DSH-IM 微信机器人已接入且 token 可读；`alert.lastAlertError` 会记录失败原因 |
| 接口 403 | 仅接受回环来源；用 `127.0.0.1` 访问（经 `dsh-lan-gateway` 反向代理时源地址为回环，通常可用；直连局域网 IP 会被拒） |
| 读数明显过期 | 默认 4s 服务端缓存；加 `?refresh=1` 强制采集 |

## 已知限制

- **深色主题未做专门适配**：使用宿主 CSS 变量，但仍有部分硬编码色值需要再调；
- **CPU 只覆盖当前 uid 可见进程**，拿不到系统整体占用；
- **温度是启发式挑选**：不同 SoC 的 thermal zone 命名差异大，PMIC 只匹配 `pm8550`；
- **服务状态依赖 termux-services**，未安装时相关区块显示不可用；
- **微信提醒依赖 DSH-IM 机器人**，未接入时开关打开也不会有推送（会记录 `lastAlertError`）；
- **客户端改动无 HMR**（除非在 DSH 检出目录里跑 `dev:web`），一般需要重启宿主。

## 路线图

- [ ] 深色主题色值收敛到宿主 token，去掉硬编码颜色
- [ ] CPU 占用改为可选的「按 uid 分桶」展示，缓解口径歧义
- [ ] 温度按 SoC 提供 zone 映射表（目前是正则启发式）
- [ ] 低电量提醒支持 Webhook / ntfy，降低对微信机器人的依赖
- [ ] 历史曲线（电量 / 温度）落盘与迷你走势图

## 许可证

[MIT](./LICENSE) © 2026 MasterZJJ
