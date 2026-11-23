# 变更记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
版本号与 `package.json` 一致，仓库 tag 形如 `v0.2.0`。

## 0.2.0 — 首个公开发布

首个提交到 GitHub 的版本，能力基线：

**侧边栏与浮层**

- 在 `sidebar.footer.action`（设置上方，`order: 5`）挂载入口；展开态显示「电量 / CPU / 内存」三枚胶囊，
  收起态显示电池图标 + 百分比 + 两条迷你条。
- 详情浮层：设备、处理器（含 Top 3 进程）、内存/Swap、电池（电量/温度/电压/电流/健康/循环）、
  充电周期（上次充电结束 / 已用 / 预计剩余）、温度（PMIC / 电池 / CPU）、存储、服务状态。
- 颜色语义：电量 ≤20% 黄、≤10% 红；CPU ≥85% 红；内存 ≥90% 红。
- Esc 键或点击外部关闭；打开浮层立即刷新一次。
- 中英文案跟随宿主导航语言。

**采集**

- 电池走 `termux-battery-status`；内存读 `/proc/meminfo`；CPU 用 `/proc/<pid>/stat` 差分
  （Android 禁读 `/proc/stat`，口径为当前 uid 可见进程）；温度读 `/sys/class/thermal`；
  存储用 `statfs($HOME)`；设备信息 `getprop` 启动时缓存一次。
- 任意能力缺失时对应区块返回 `available: false`，不影响其它指标。

**充电周期与提醒**

- `<DSH_HOME>/dsh-termux-state/state.json` 持久化充电开始 / 结束 / 充满时刻与上次提醒百分比。
- 首次启动可选从 `historyLog` 的 JSONL 日志回填充电时刻。
- 低电量微信提醒：默认关闭；≤ 阈值触发，每再降 5% 才重复，充电中不提醒；
  复用 DSH-IM 微信机器人凭据（`ilink/bot/sendmessage`）。

**接口与配置**

- `GET /api/dsh-termux-state/snapshot`：4s 服务端缓存、并发合并；`full=1` 带进程榜、`refresh=1` 强制采集。
- `POST /api/dsh-termux-state/restart`：先回 `202` 再 spawn `sv restart`；无 `sv` 时返回 `409`。
- 两个端点均仅接受回环来源。
- 配置校验：`refreshSeconds`（60–3600）、`lowBatteryPct`（1–100）、`wechatAlerts`（默认 `false`）、
  `service`（默认 `dshweb`）、`historyLog`（默认 `null`）。
- 客户端刷新间隔可选 1 / 30 / 60 分钟，存 `localStorage`。

**打包与安装**

- 手写 `__ModuleLoader__` 客户端 bundle，无构建步骤。
- `scripts/install.mjs`：幂等安装到 profile（复制文件、登记 `file:` 依赖与 `bundles` 条目），
  支持 `--profile` / `--home` / `--dry-run`。
- 补齐项目文档：README、本变更记录、MIT 许可证。
