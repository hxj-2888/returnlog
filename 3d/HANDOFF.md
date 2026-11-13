# 《新返航录 3D 版》交接文档

> 本文是 3D 仓**唯一交接文档**：§0 是现行状态与接手事项，§1 是长期边界与红线口径，
> §2 以后是历史章节（工程文件 / 工具链 / 资产流程），按需回查。
> 读者：下一个接手 3D 的人（可能是另一个会话 / 另一个人）。本文假设你没看过任何对话。
>
> 逐批明细在 `3d/CHANGELOG-2026-11.md`，差异登记在 `3d/docs/audit/PORT-DIFF-AUDIT.md` §C/§E/§J，
> 数据契约在 `3d/spec/`，验收命令见 §0.8。原 `docs/handoff/HANDOFF_2026-11-11.md` 的增量已并入 §0.9（2026-11-12 清理）。
>
> **按需读（2026-11-13）**：接手先读 §0.1 / §0.2 / §0.5 / §0.8 / §0.10（约 300 行）；
> 排障只查 §0.6 症状表；§0.3–§0.4 是历史批次与差异登记；§1 以后按任务回查，不必通读全文。

---

## 0. 最新交接（2026-11-10）

> **一句话现状**：3D 已是 2.5D 的功能移植（判定 / 会议 / 结算 / 小地图 / HUD），已知缺口见 §0.4 与 `spec/mapping-layers.json#parity_budget`。
> 39 项 Godot 自测曾全绿；门禁现值与本次实跑读数见 `3d/CHANGELOG.md` 指向的当月文件最新批次（本文件不复制）。
> 表现层像素排布与人物美术仍是预演级；玩法缺口见 §0.4 与 `spec/mapping-layers.json#parity_budget`。
> 当前工作区未提交项以 `git status` 为准；提交前按 §0.10 审阅。

### 0.1 一分钟上手

```powershell
# 跑起来（Godot 不在 PATH 上）
E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe --path 3d/preview --resolution 1280x720
# 桌面快捷方式「启航路 3D 版」已于 2026-11-10 改指向本工程（旧仓 3d/ 保留未删）

# 全量门禁（7 项，见 `tools/check-all.cjs`）
npm run check
npm run baseline:check        # 只读基线未被手改
npm run 3d:floor:check        # 地板口径单一真源
node 3d/tools/sync-cover-height.cjs --check
```

**数据链（顺序不能反）**：
`js/data/map.js` → `npm run export:all` → `node 3d/tools/build-map-v2.cjs` → `npm run 3d:export:sim`
（`build-map-v2` 之后必须重跑 `export:sim`，否则 `sim.json` 还指着旧的 `map_v2.json` 哈希）

**上游同步**：`npm run baseline:sync` → 上面整条数据链 → `npm run check`。只读基线禁止手改。

### 0.2 现在能玩到什么程度（已验证）

以下都是**本次实跑**，不是"应该能"：

| 能力 | 验收方式 | 读数 |
|---|---|---|
| 开局 → 跳过讨论 → 夜里走动 | `--uitest`（真实窗口 + 真实鼠标） | 跳过按钮在屏内、点击推进、会后位移 3.20 |
| E → 小游戏 → 结算 | `--e2e` / `--taskflowtest` | `open=true kind=wire`；`tIdx 0→1 prog 0→2` |
| 14 型小游戏 | `--mgtest` | `14/14` + 26 个任务标签全通 |
| 异形出刀 | `--knifetest`（真实左键） | `命中=true 剩余刀=0` |
| 异形按 E 放倒 + 轮盘 + F2 DEV | `--probetest` / `npm run 3d:probe`（真实 E / 数字键 / 左键 / F2） | `PROBETEST OK 0 项失败`；DEV 挨枪/死亡/驱逐全无效 |
| 会议：讨论期先投、改票、追责 | `--leadtest` / `--meetingtest` | `5/0` · `ok=true ejected=1` |
| 会议 UI：11 模板 / 时段 / 席位号 / 弃权 / 先投改票 / 跳过投票 / 只读 | `--meetuitest`（真实鼠标点击） | `23/0` |
| 异形挑目标：无全图锁敌 / 25s 记忆 / humanT / 身份轴 / 暴露度 | `--aiporttest` | `13/0` |
| 鼠标口径：Esc 释放 / 点击收回 / 失焦自动释放 | `--mousetest`（真实窗口） | `5/0` |
| 结算页：身份表 + 逐人投票矩阵（按场次分组） | `--settletest` / `--endshot` | `5/0` |
| 局内小地图：短名 / 任务点 / 故障 / 圆桌脉冲 / 玩家 | `--minimaptest` / `--minishot` | `4/0` |
| 证据/情绪/口供：evalAlmost / trust-grudge / claimHist / DESC | `--socialtest` | `6/0` |
| 照明三态 + 电闸证据 | `--powertest` | 常态 8 舱 / 修好全亮 10 / 断电 0；拉闸 3/6/9/9s |
| 保安：追捕/压制/押送/拘留 | `--bottest` | `7/0` |
| 旁观者俯视剖面 | `--specttest` | 飞越隐藏天花板、下穿夹取 0.35 |
| 任务点可达性 | `--tasktest` / `--reachtest` / `--navtest` | `26/0` · `26/0` · `28/0` |

**39 项无头/真实窗口自测全部 exit 0、0 条 `SCRIPT ERROR`**（清单与一键脚本见 §0.8）。

### 0.3 16 个批次 + 2 次修复做了什么（一句话版）

| 批 | 内容 |
|---|---|
| 1 | 基线重同步；**掩体回归 `map.js` 单一真源**（原来源是方案层第二真源） |
| 2 | 小游戏 10→14 型、撤四型降级、**删掉全部失败惩罚**、接上 26 个任务点的专属参数 |
| 3 | 会议 `lead` 带头追责（此前从不写入）+ `quick_report` 快报案怀疑 |
| 4 | 讨论期先投 + 听完改票（`voteLean/castEarlyVotes/reconsiderVotes` + `earlyKept`） |
| 5 | 跨夜逐人复位（`_reset_agent_night` 40 余项）+ `mindReset` 跨夜口径 |
| 6 | 照明 0/1/2 三态 + 电闸两种相反证据（拉闸写 known / 合闸只给 cred） |
| 7 | `chaseKnown/chaseSus` 追猎、中文与补零席位号、白天说"昨晚" |
| 8 | `losWalls`、保安追捕超时放弃 / 压制 0.9s / 押送 1.2s / 拘留目击 |
| 9 | 差异登记（`allowed_differences` 4→9 条）+ 全量验收 |
| 10 | 桌面快捷方式改指向本工程 |
| 11 | 同步最新 2.5D（`STAND` 改值 + 领申请单交互即领 + 掩体 123）+ **出手键提示 / 删 Shift / 交互无反馈 / 旁观者剖面** |
| 12 | **会议 UI 功能同源**：11 模板（六类直接证据）+ 对象/舱室/时段下拉、`01–15` 席位号、弃权、讨论期先投/改票、跳过投票、幽灵/旁观只读、报告地点/发起人/伤者三行、`↓N 条新发言` |
| 13 | **判定层 A 档**：取消异形全图锁敌（只认看得见 / 本夜 25s 记忆）、`humanT`+`HUMANISH`、`saw_red` 5s 节流、`lastBody`/`saw_body_moved`/`near_body`、`aiIdleRoam`+`saw_avoid`、`audSusEstimate` 方向拨正、`note_sight` 重复记账修掉 |
| 修复 | **鼠标口径**：Esc 释放/收回、窗口失焦自动释放（截图工具可拖出窗口）、删除四处无条件 CAPTURED |
| 14 | **结算页**：`#e-ids` 身份表 + `#e-votes` 逐人投票矩阵（终票在 close 按 seq 落账）、`downRoom/deathRoom`、阵亡提示不泄露身份 |
| 15 | **局内小地图**：短名/灯态三态/管道/设施/机器人/个人任务点/故障/圆桌脉冲/玩家/图例；不画他人、不可点击；HUD 补「报告 N · 夜会 N/2」 |
| 16 | **判定层收尾**：身份轴/exposureAt/trait 系数/huntSpotFor、evalAlmost 全量、trust/grudge/patron、claimHist/claim_recall、DESC 单写、构陷/大义灭亲补齐、parity 0 WARN |

### 0.4 差异与剩余（事实登记，不是待办清单）

- **判定层（第 16 批已收尾）**：`humanT` / `seenT` / `redSeen` / `avoidSeen` / `lastBody`、
  身份轴 / `exposureAt` / trait 系数 / `huntSpotFor`、`evalAlmost` 全量、`trust` / `grudge` /
  `patron`、`claimHist` / `claim_recall`、`DESC` 均已同源。
  仅剩 `buildMeetCtx` 为**等价实现**，字段映射见 `PORTING_PROTOCOL.md` 附录 C（不另造对象）。
- **UI 层（会议 / 结算 / 小地图已同源）**：会议功能层第 12 批、结算身份表 + 投票矩阵第 14 批、
  局内小地图 + 报告读数第 15 批。三栏像素布局保留为表现层差异。
- **人物建模**：2026-11-11 已按本地千问参考图（素材层 `returnlog_assets/unreferenced/qwen21/3d/crew-refs/`）建成
  `char_crew_lowpoly`：1.75 m / 1812 tris / 4 材质 / 17 形变骨 / idle+walk；
  正常对局默认使用，`--crew-billboard` 回退旧 billboard，`char_crew_blockout`
  是第二级回退。`walk` 1 秒循环、Godot 侧 2.9× 播放以匹配 4.2 m/s 移速；
  `knife/down` 已补（事件/倒地触发），V-CREW 已标 `ported`（full）。人物仍属美术栏，
  不在判定层加状态；外观不得泄露异形身份。
- **鬼魂模式（2026-11-13 核实：已迁）**：2.5D `die()` 的 `ghost=true` 已同源 —— 玩家由
  `player.set_ghost` 接管（穿墙 / 全视 / 抬头飞），AI 死者走 `sim._ghost_tick`：
  人类幽灵赶路 6.5 格/秒、游荡 2.4 格/秒，任务时长 ×1.6 且受 `ghost_task_cap` 额度限制；
  异形幽灵全局一次正统破坏（`alien_ghost_sab_used`）后游荡。2026-11-13 已把赶路速度误用 2.4
  的偏差按 `js/game.js#aiGhost` 修正。当前无未迁的核心玩法。
- **parity**：15 个 2.5D 源码字面量已登记 `3d/tools/check-parity.cjs#SOURCE_LITERALS`
  （每项带 `js/game.js:行号`，扫描时回读该行验证；2026-11-13 行号随上游 +119 行重登记）；**当前 0 WARN**。
  不导出到 `rules.json`，否则会造出第二份定义；上游改行会直接 FAIL，不会静默放过。

> **2026-11-13 行为实测修正**：代码路径齐全 ≠ 能力等效。12 局同 seed 对照 2.5D 蒙特卡洛，
> 3D 的动作吞吐只有 2.5D 的 6–8 成（刀 5.17 vs 8.58、破坏 5.83 vs 9.5、搜尸 3.0 vs 4.67）；
> 已定位并修复异形「贴近记忆位置、原地空转」的刀循环（`knife_try 10022 → 201`）。
> 人类任务进度（15.1 vs 20.9）与异形实际钻管道（2.75 vs 9.83）仍是真差距，见
> `CHANGELOG-2026-11.md` 最新批次。
>
> **判据**：判定层/UI 层的差异清单已清零；剩余差异只有表现层像素排布、
> 3D 维度产物（A* / 相机 / 碰撞 / LOD）与人物美术。详见
> `PORTING_PROTOCOL.md` 附录 C 与 `spec/parity-map.json#allowed_differences`。

### 0.5 接手陷阱（2026-11-10 现役）

**① 地图只有一个真源。** `cover / facility / points / pipes / rooms / walls` 必须原样来自
`js/data/map.js`（经 `export-map.cjs`）。`tools/ship-layout-plan.json` 只能供 **decor（墙面美术）**，
不许再供 cover —— 之前就是它让 3D 跑了一年 11-06 的旧布局。

**② 上游是活动靶。** 同一天上游把掩体从 120 改到 124 又改到 123。**动数据前后都要**
`baseline:check` 并与上游 diff；只在开头同步一次就会拿到过期数据。

**③ `3d:port:check` 报「行段越界 / N 行未被认领」多半不是漏移植**
——上游删/加了行，`port-manifest.json` 的 `X-BIND` / `V-MINIGAME` 末行要跟着改。
判定方法：看「未被认领」是不是**从某个末行一直连续到文件尾**；是 → 改末行，不是 → 真漏了。

**④ Godot 夹具的四个坑（会让自测"绿着说谎"）：**
- `new_game` 会开 `MEET_PRE`；`_process` 里「会议开着就收掉小游戏卡片」——
  `--mgtest / --devicetest / --taskflowtest / --mgshot` **必须先 `_finish_meeting(sim)`**，
  否则卡片一开就被 cancel（历史症状：`MGTEST 0/10` 却 exit 0）。
- `--walktest` 同理：会议期间 `ui_locked` 把速度钉成 0，测得 `distance=0.0`。
- 真实鼠标/窗口类自测（`--uitest / --meetuitest / --mousetest / --knifetest / --specttest /
  --e2e / --taskflowtest`）**不要加 `--headless`**，并统一 `--resolution 1280x720`；
  无头下没有真实视口/鼠标相位。
- `--settletest / --endshot / --minishot` 是结果页/小地图夹具；截图在本机
  `preview/screenshots/`（已 gitignore），不要当交付物提交。

**⑤ GDScript 类型推断的四个雷（都会让项目直接起不来 → 表现为"卡住"）：**
- `var x := 动态调用()`（`sim.me()` / `sim.agent()` / `sim.rules.n()` 等）必须显式写类型；
- `String(0)` **不存在**这个构造函数（只有 String/StringName/NodePath）；
- `value as Dictionary` 在 value 是 `null` 时运行期报 `Invalid cast`，要置 `{}`；
- 每夜复位的 `_breakerRollN` 存的是**夜号字符串**，置 `0` 会让 `String()` 炸。

**⑥ 3D 的按键/鼠标口径（和 2.5D 不同，别再找 A/B）：**
`WASD` 移动（**没有 Shift 冲刺**，用户 2026-11-10 明确不做）· `E` 交互（多项开轮盘，1-9 直选）·
**鼠标左键出刀**（异形，每夜 1 把）· **鼠标右键开枪** · `P` 设置 ·
**`Esc` 释放/收回鼠标**（切到截图工具/别的窗口会**自动释放**，点击游戏窗口收回）。
`Input.mouse_mode` **只允许** `main._refresh_mouse_mode()` 写；别在子面板里无条件 `CAPTURED`
（第 11 批现场 bug：Esc 释放被下一帧重新捕获）。

**⑦ 会议面板 720p：** `meeting_skip` 必须在标题正下方（逃生阀），其余内容进
`ScrollContainer`；投票列表单独滚动，弃权在列表末尾。改布局后先跑 `--uitest` / `--meetuitest`。

**⑧ 投票事件：** 终票在 `_close_meeting()` 按 `meeting.seq` 写 `vote` 事件；
`cast_vote()` 只写 `vote_change`，**不要恢复逐次 `vote`**（结算页矩阵会重复）。
结算页「谁投了谁」按 seq 分组；会议内按 2.5D「过程不可见」只显示聚合。

**⑨ 规则/对账：** `IDENTITY` 由 `export-rules.cjs` 从 `js/game.js` 导出；
`check-parity.cjs#SOURCE_LITERALS` 的每一项都带 `js/game.js:行号` 并回读验证。
上游改行导致 FAIL 时，**更新引用行号**，不要把 3D 数字改成新阈值。

**⑩ `evalAlmost` 的 why 双职：** 3D 的 `why` 同时存时间线（`saw_agent`/`saw_body_moved`）
与证据；这两类**不算证据种类**，别从 `eval_almost` 里删掉这段排除。
`note_sight` / `note_testimony` 都是**一次事件一条 why**，别再写 `sus_add + _push_why` 双份。

**⑪ 构陷是软证据：** `plan_alien_deception` / `plan_mate_bus` 的 `accuseWhy`
**不标 solid、不写 lead**（2.5D 同口径）；只有 FIRST 先发制人和硬确证进 `ctx.lead`。

**⑫ 读数边界：** `--aittest` 是 2 夜 AI 样本，只作记录；`reports/3d-sim1000.md` 是
第七批之前代码的 1000 局读数，且早于第 13/16 批的判定层改动，**不能与当前代码对比**。
按 §0.10 第 7 条，验收读数不得作为「该不该改」的依据。

**⑬ 截图/机位严禁捕获鼠标（2026-11-11 用户裁定，强制）。**
`--shot / --crewshot / --doorshot / --mgshot / --devshot / --covershot / --ceilshot /
--pipeshot / --meetshot / --endshot / --minishot / --homeshot` 必须走
`_screenshot_mode`：`player.capture_mouse_on_ready=false`、`Input.mouse_mode=VISIBLE`、
`_input()` 不响应、`_exit_tree()` 释放；禁止在截图路径 `CAPTURED` / `warp_mouse`。
实测截图应打印 `CREW_MOUSE mode=0`。`--probetest` / `--mousetest` 是输入链测试，
不是截图，必须单独跑并在结束时恢复 `VISIBLE`。详见 §0.5 ⑬。

**⑭ Godot 自测参数必须放在 `--` 之后（2026-11-11 实跑坑）。**
`main.gd` 用 `OS.get_cmdline_user_args()` 取参数；不写 `--` 时 Godot 会把
`--speechtest` 等当成引擎参数吞掉，表现为**测试一条都没跑、进程也不退出**（很容易被
误判成死循环）。正确写法：
`Godot --headless --path 3d/preview -- --speechtest`；真实窗口类（`--meetuitest` /
`--probetest`）同理，只是去掉 `--headless`。headless 下 GUI 收不到鼠标，`--meetuitest`
会以 `hover=null`、全部点击失败告终——这不是会议 UI 回归，必须用真实窗口跑。

**⑮ 交互半径不是一个数（2026-11-13 现场回归）。** 2.5D 每个交互各用各的半径：
任务点 `nearPoint` **2.6**、管道 `nearPipe` 1.6、补给 `nearSupply` 1.7、监控 `nearMonitor` 1.8、
尸体 2.2、电闸 2.0、故障 `reach.fix` 2.0、破坏 1.7。3D 曾把任务/管道/补给/监控全折成
`reach.fix(2.0)`，玩家站在 2.0–2.6m 按 F 会"毫无反应"。改交互先回
`js/game.js` 找对应的 near* 函数，不要在 `main._collect_offers` 里统一成一个数。

### 0.6 排障索引（症状 → 先看哪）

| 症状 | 先看 |
|---|---|
| 界面卡住 / 按钮点不到 | 面板是不是比视口高（`ScrollContainer`）；`_want_mouse_visible()` 是否覆盖该面板 |
| 鼠标被框在游戏窗口 / 截图拖不出去 | `mouse_released`；`_refresh_mouse_mode()` 是唯一 CAPTURED 入口；失焦应自动释放 |
| 跑完截图后鼠标仍被锁 | 截图必须走 `_screenshot_mode` 并打印 `CREW_MOUSE mode=0`；见 §0.5 ⑬，禁止截图路径 CAPTURED |
| 异形打不到人 | 刀程 1.4m + 朝向；`_player_knife` 的三条 toast（没刀 / 够不到 / 人类没刀） |
| 按 E 没反应 | `_collect_offers()` 为空会 toast；再看半径（设备 2.0 / 圆桌 2.3 / 管道冷却 20s） |
| 会议里投票按钮灰 / 点不动 | `_refresh_meeting_ui` 的 `b.disabled`；讨论期也必须可点（2.5D 先投改票） |
| 结算页没有投票矩阵 | 只有 `sim.over` 才显示；矩阵按 `meeting.seq` 分组，终票在 `_close_meeting` 落事件 |
| 小地图全暗 / 不画 | `minimap.setup` 是否拿到 `map_data`；`sim.light_state` 与房间 `light`；`_room_lit` |
| parity FAIL「源字面量引用失配」 | 上游改行；更新 `check-parity.cjs#SOURCE_LITERALS` 行号，不要改 3D 数值 |
| 改完 AI 后 `--aittest` 读数变化 | 只作记录；不要拿它判断回归（见 §0.5⑫） |
| 数据对不上 | 先跑 §0.1 的完整数据链，再 `npm run check` |
| 小游戏不弹 | 该任务是不是 `qual/med/ammo`（这三项按裁定不弹）；是不是在会议里 |
| 门禁红 | 分三类：契约 schema / 行段越界 / 真的漏移植（见 §0.5③） |

### 0.7 验收读数

> 本文件不保存读数。现行读数只在 `3d/CHANGELOG-2026-11.md` **最新批次**声明一次
> （带实跑时间、seed、局数、`X 通过 / Y 失败`）；历史快照按批次回查 CHANGELOG。
> `--aittest` / `--sim1000` 等平衡读数只作记录，不作验收依据（§0.10 第 7 条）。

### 0.8 接手第一小时（当前版）

```powershell
# 0) 依赖（首次）
cd "C:\Users\ASUS\Desktop\新返航录 3D 版"
npm i                                  # 只装 playwright-core；node_modules 不入库

# 1) 先确认只读基线没被手改；如果上游有新提交，再按 §0.1 同步数据链
npm run baseline:check                 # 期望 BASELINE OK（文件数见本次输出）

# 2) 数据链（只在同步上游 / 改 map.js 后跑；顺序不能反）
npm run export:all
node 3d/tools/build-map-v2.cjs
npm run 3d:export:sim

# 3) 工程门禁
npm run check                          # 期望全部通过（当前集合见 package.json）
npm run 3d:floor:check                 # 期望 FLOOR-SPEC OK（11 项）
node 3d/tools/sync-cover-height.cjs --check

# 4) Godot 39 项自测（真实窗口；Godot 不在 PATH）
$GODOT = 'E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe'
$tests = @(
  'navtest','simtest','meetingtest','speechtest','b4test','leadtest','b6test','aittest',
  'bottest','tasktest','reachtest','floortest','powertest','audiotest','uitest',
  'actiontest','interacttest','knifetest','specttest','mgtest','devicetest',
  'taskflowtest','e2e','walktest','hometest','roletest','meetuitest','aiporttest',
  'mousetest','settletest','minimaptest','socialtest','probetest','crewanimtest',
  'parityfixture','invtest','knifebottest','meetopentest','dragtest'
)
foreach ($t in $tests) {
  & $GODOT --path 3d/preview --resolution 1280x720 -- --$t
  if ($LASTEXITCODE -ne 0) { Write-Host "FAIL $t"; break }
}

# 5) 三张实拍（可选，截图不入库）
& $GODOT --path 3d/preview --resolution 1280x720 -- --meetshot
& $GODOT --path 3d/preview --resolution 1280x720 -- --endshot
& $GODOT --path 3d/preview --resolution 1280x720 -- --minishot
& $GODOT --path 3d/preview --resolution 1280x720 -- --crewshot   # 人物 blockout 同框
& $GODOT --path 3d/preview --resolution 1280x720 -- --doorshot    # 门扇关闭/全开对照
```

**代码阅读顺序（按依赖）**：
1. `3d/preview/scripts/sim/sim_state.gd`：状态 / 会议 / 投票 / 电闸 / 拖尸 / 机器人；
2. `sim/mind.gd`：认知、身份轴、`evalAlmost`、trust/grudge、口供史；
3. `sim/ai_alien.gd` / `sim/ai_human.gd`：挑目标、暴露度、寻人、空闲游荡；
4. `sim/speech.gd` + `sim/lines_data.gd`：发言排期、构陷、辩护、领袖、解析；
5. `main.gd`：HUD / 会议 UI / 结算页 / 鼠标口径 / 自测夹具；
6. `minimap.gd`：局内小地图；`ui_panels.gd`：设置 / 复盘；
7. `3d/tools/export-*.cjs` + `check-*.cjs` + `3d/spec/`：数据链与对账。

**接手第一件事不是写代码**：先跑上面 1–4，确认门禁与自测全绿；任一项不对，
先按 §0.6 排障，不要直接改判定。

### 0.9 2026-11-11 晚 · 玩家能力链路对齐（原专题交接，2026-11-12 并入）

- **能力恒入口**：`_update_interaction()` 每帧更新全部键沿；无对应 offer 时走 `_fallback_action()` 直达模拟层并给精确原因，不再静默。
- **判定单一真源**：`sim_state.can_act(kind, ctx)` 只读返回 `{ok, reason, target}`，`@src` 标注 2.5D 行号；玩家出刀/开枪与 AI 出刀都调它。
- **role 双源清零**：管道 / 出刀 / 刀模型统一读 `sim.me().alien`。
- **输入层**：InputMap 8 个 action；ESC 收口 `_close_topmost()`；`--inputlog` 埋点；轮盘改屏幕中心 8 扇区。
- **DEV 透视 ESP**：F2 方框 + 名牌 + 穿墙（>25m 不画），F3 文字总览默认隐藏；DEV/旁观会议行显示真实身份、尸体卡显示凶手。
- **卡墙根因 2**：`player.gd` 接同一份 nav、`safe_margin=0.04`、不可走区钳回、卡住 0.3s 走 `nearest_free`。
- **验收补洞**：`--abilitytest` 真实 InputEvent 逐键验拖拽/放下/出刀/管道/破坏 + 空场景反馈 + InputMap + 卡墙兜底。

**未完成**：以 `3d/spec/mapping-layers.json#parity_budget` 的 `pending` 项与 `3d/CHANGELOG-2026-11.md`
最新批次为准；本文件不另立缺口清单，也不复制预算数字。

### 0.10 改动流程（3D）

> 2026-11-12 分类收缩：原 `docs/agent/process-3d.md` 并入本节。

1. **先问「2.5D 里这条在哪」**：在只读基线 `js/` 中检索（`js/game.js` / `js/ai/*` / `js/t2/*` / `js/data/*`）。
   找得到 → 照抄语义，数值走 `3d/preview/data/*.json`；找不到 → 按红线 11 判维度产物，不许在 GDScript 自造。
2. **绝不手改只读基线**：`js/`、`assets/`、`audio/`、`tools/`（除 `sync-baseline.cjs`）与 `package.json`
   的 `version` / `gameVersion` 一律只读。确需上游变更：原仓改 → 原仓门禁 → 本工程 `baseline:sync`
   → `export:all` → `check` → 再移植。
3. **改完必跑**：`npm run check` + 相关 Godot 无头自测；报告写本次实跑的「X 通过 / Y 失败」。
4. **数据契约变更**：`3d/preview/data/*.json` 字段增删 / 语义变化必须升 `schema_version` 并写 ADR
   （`3d/DECISIONS.md`）；改了 `js/` 没重导 → 对账 FAIL，这是设计。
5. **留痕**：可见变更写 `3d/CHANGELOG.md`，工程级变更写根 `CHANGELOG.md`，决策写 `3d/DECISIONS.md`。
6. **提交**：中文，格式 `type(scope): 摘要`；不提交 `node_modules/` / `.godot/` / 日志 / 本机截图。
7. **验收层不反向驱动执行层**：T3 读数只作事后记录，不得作为「该不该做 / 该不该回滚」的依据；
   论证依据只能是 `js/` 真源语义（文件 + 行号）或「真人会不会这样」。
8. **截图 / 机位严禁捕获鼠标**：所有 `--shot` / `--crewshot` / `--meetshot` 等必须走 `_screenshot_mode`，
   禁止 `CAPTURED` / `warp_mouse`；详细约束见 §0.5 ⑬。

### 0.11 映射层（2026-11-13）

> 目的：把「这条 2.5D 代码在 3D 里对应哪」从四处手写表 + 门禁猜，收缩成一张账本。

| 文件 | 角色 |
|---|---|
| `3d/spec/mapping-layers.json` | 分层与政策：系统 → 层、整系统默认状态、`parity_budget`。**手写**。 |
| `3d/spec/mapping-ledger.json` | 999 个 2.5D 函数逐条判决（`ported/auto/adapter/not-applicable/pending/unmapped`）。**唯一真源**。 |
| `3d/tools/build-mapping-ledger.cjs` | 只做机械归位：算系统/层、校验目标、算汇总。**不猜状态**。 |
| `3d/tools/map-diff.cjs` | `--section` 并排原文、`--pending` 缺口清单、`--layer/--status` 过滤。 |
| `3d/spec/parity-map.json` | 只剩红线 11 引用的 `allowed_differences` + `truth_sources`；函数判决已并入账本。 |

- 新增/改 2.5D 函数后跑 `npm run map:build`，新函数默认 `unmapped`；判决写进账本再跑 `map:check`。
- `npm run check` 现在共 **9 项**，最后一项是 `map:check`：账本与 2.5D 不一致、目标悬空、缺口超预算都会红。
  `map:check` 同时做**反向覆盖**：`sim/` 里的函数必须要么有 2.5D 来源，要么在 `extras` 登记理由；
  当前 102 个未登记是下一批的归因清单（`mapping-layers.json#reverse`）。
- `audit:parity:strict` 与 `3d:parity:check` 都已改为**只读账本**；`gameplay-parity.json` 已删除
  （备份 `_backup/20261113_retire-gameplay-parity/`），`parity-map.modules` 已移除，
  旧的同名自动配对与 DOM 正则猜测已删除。

---

## 1. 分支与边界（先读这一段，方向错了后面全白做）

| 项 | 口径 |
|---|---|
| 主产品 | 2.5D《新返航录》，上游仓 `C:\Users\ASUS\Desktop\新返航录`，`main` 分支，`file://` 直接可开，`index.html` 是入口 |
| 3D 产品 | **2.5D 的延伸**（Godot 4.6）；**只有按键操作 / 维度 / 部分美术素材**可以不同，其余全部移植，见 `AGENTS.md` §一.11 与 ADR-0011 |
| 本仓分支 | **分离后的 3D 独立仓**，当前分支 `master`（对应上游 `3d` 分支；不是上游的 `main`）。上游的「2.5D 推 main、3D 推副分支」规则在上游仓执行；本仓不得把 3D 客户端合回上游 `main` |
| 仓库状态（2026-11-10） | 最后一次提交 `33cd6a4`（2026-11-09 清理 docs/SDXL 舱室图）；**第 1–16 批与现场修复共 77 个文件未提交**（`js/ assets/` 只读基线未动）。交接/发布前按 §0.10 审阅并提交 |
| 共享的东西 | 地图 / 规则 / 语料 / 空间 / 任务 / 机器人数值**全部**从 `js/` 导出（`3d/tools/export-*.cjs`），推理与发言按 `spec/mapping-ledger.json` 逐函数对账 |
| 不共享的东西 | 只有运行时宿主与呈现：DOM/Canvas vs Godot 场景、输入映射、渲染与 LOD —— 都属"维度"这一条允许差异 |

> ⚠ **不要再把 3D 当"另一个游戏"来写**（2026-11-09 用户裁定）。
> 旧口径「3D 端要重写模拟核心」作废：模拟规则以 `js/` 为唯一真源，3D 侧是**移植**。
> 想加 2.5D 没有的东西，先证明它属于维度产物，否则先在 2.5D 做（`PORTING_PROTOCOL.md` §2）。

**墙的红线**：2.5D 的墙是「零厚度线段 + 0.36 格通行判定 + 12° 正交烘焙投影」。
3D 里墙**必须是有厚度、有高度、有门洞的实体几何**（现状口径：厚 0.34 m / 高 1.16 m，
门洞宽 1.8 格）。斜墙 20 段需要 miter 转角件。不允许把线段直接拉成面片糊过去。
详见原仓 `docs/3D化审查_20261105.md`（本工程 `docs/` 已于 2026-11-09 清理）。

**美术分工（2026-11-09 用户裁定，覆盖 2026-11-07 的旧口径）**：
**千问本地模型为唯一出图模型，SDXL 已退役**（2026-11-07 的「SDXL 与千问均可」已作废）。
出图仍须**本地生成**、不调用线上生图；历史 SDXL 产物只作风格对照与回退兜底，不再新增。
`assets/minigame/panel-*.png` 与千问新出图（Qwen-Image 2.1，Research License **非商用**）
可用于本非商用项目的运行时（断口标注真源 `js/data/plates.js`，来源见
`assets/minigame/CREDITS.md`）；若未来转商用需换图或另行授权。
入口：`npm run 3d:refs:cabin` / `3d:refs:tasks`（**必须 pwsh 7**）。

---

## 2. 本轮新落地的工程文件

| 路径 | 作用 | 已验证 |
|---|---|---|
| `3d/spec/conventions.md` | 单位 / 朝向 / 枢轴 / 命名 / 面数预算 / 与 2.5D 边界的**硬约定** | ✓ |
| `3d/spec/asset.schema.json` | 清单的 JSON Schema（draft-07，只用得到一小部分关键字） | ✓ |
| `3d/spec/assets.manifest.json` | **唯一真源**：29 项资产、状态、源/导出路径、预算、碰撞、许可 | ✓ |
| `3d/spec/godot-import.cfg` | Godot 4.6 glTF 导入参数唯一口径（27 个 key） | ✓ 实测 |
| `3d/tools/validate-assets.cjs` | 清单校验：schema / 命名 / 预算 / 文件落地 / 状态自洽 | ✓ 0 错误 |
| `3d/tools/check-godot-import.cjs` | 拿 `.glb.import` 与预设逐项比对（**只读**） | ✓ 0 差异 |
| `3d/tools/blender-export.py` | Blender 导出预设：单位检查 / 应用修改器与变换 / GLB 内嵌贴图 | ✓ Blender 5.2.2 实测 |
| `3d/tools/smoke-test.py` | 无真资产也能验证导出的自检（造一个带缩放 + 倒角的立方体） | ✓ 44 tris / 4.2 KB |
| `3d/tools/sync-models.cjs` | `3d/assets/export/*.glb` → `3d/preview/assets/models/`（sha1 去重） | ✓ |
| `3d/preview/assets/import-probe/` | 探针 GLB + 由 Godot 真实生成的 `.glb.import`，用作预设参照物 | ✓ |
| `3d/preview/scripts/probe_gi.gd` | 打印 GI 枚举常量并读回导入场景里 `MeshInstance3D.gi_mode` | ✓ gi_mode=0 |
| `package.json` | 新增 `plate:build` / `3d:assets` / `3d:sync:models` / `3d:import:check` | ✓ |
| `tools/plate/` | 「直接操控生成图里的电线」原型：板标注 JSON + 模板 + 编译 + 对齐探针 | ✓ 3/3 接线 |
| `tools/plate-demo.html` | 编译产物，**单文件、图片内联**，双击即开 | ✓ 见 §8 |

**刻意没做**：没有往 `3d/assets/export/` 塞任何占位 GLB；清单 `status=done` 强制要求
源 + 导出物都存在，塞空文件只会让校验失真。

### 命名冲突已规避

`启航路3D版` 分支上已有 `3d/tools/sync-assets.cjs`（同步**贴图/角色图**）。
本轮的同步脚本改名为 `sync-models.cjs`（同步 **.glb 模型**），两者合并时不打架。

---

## 3. 工具链与本机路径（2026-11-05 实测）

```
Blender   E:\SteamLibrary\steamapps\common\Blender\blender.exe   5.2.2 LTS
Godot     E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe  4.6 stable (GL Compatibility)
          E:\ai-tools\godot\Godot_v4.6-stable_mono_win64\...      （要 C# 时才用）
SDXL      E:\ai-tools\sdcpp  (Vulkan) + D:\ai-models\sdxl-base
Qwen      Qwen-Image 2.1 Turbo · Research License · 非商用 · 2026-11-07 解禁，可用于游戏内（转商用需换图/授权）
Node      playwright-core 已装（自动化截图/交互用）
```

```bash
# 首次导入 / 重新导入资源
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview --editor --quit

# 导出管线自检（不需要任何真资产）
"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/smoke-test.py

# 单资产导出
blender -b 3d/assets/models/device_panel_fix.blend \
  -P 3d/tools/blender-export.py -- --out 3d/assets/export/device_panel_fix.glb

# 批量（只导 wip / done 且有源文件的）
blender -b -P 3d/tools/blender-export.py -- --manifest 3d/spec/assets.manifest.json --all
```

---

## 4. 清单现状

`npm run 3d:assets` 读数（2026-11-05）：

```
资产 29 项 · 状态 wip 3 / todo 15 / done 11
分类 ship 5 · room 10 · prop 5 · device 6 · character 2 · fx 1
预算合计 319,064 tris
提醒 3 条：ship_hull / ship_wall_segment / ship_floor_tile 标了 wip 但源文件未落地
```

- `wip` 允许只占位；`done` 会强制检查 `.blend` 与 `.glb` 都在，且面数不超预算。
- 每类面数上限见 `conventions.md` §3：`ship 120k / room 15k / prop 3k /
  device 8k / character 12k / fx 200`。
- 26 个任务点里已核实 **21 个**在 2.5 格内有真实 Blender 道具，
  因此最多 **10 张「设备特写板」**即可覆盖全部任务小游戏（见 `ASSETS.md`、
  `tools/blender-ship.py` 已有全船程序化建模，1391 行）。

---

## 5. 新做一个资产的标准流程

1. 在 `assets.manifest.json` 建条目（`status=todo`，填 `id / category / budget / pivot / collision / license`）。
2. `npm run 3d:assets` → 必须 0 错误。
3. 按 `conventions.md` 建模：米制 / +Y 前 / +Z 上 / 枢轴按字段 / 文件名 = `<id>.blend`。
   导出 `+Y Up`，灯和相机不进资产。
4. 改 `status=wip`，跑 `blender-export.py` 出 `<id>.glb`；面数超预算就在 Blender 里减面，
   **不要直接改清单上限**。
5. `npm run 3d:sync:models` 把 GLB 送进 `3d/preview/assets/models/`。
6. Godot 里按 `3d/spec/godot-import.cfg` 设置导入参数并重新导入；
   碰撞按清单 `collision` 字段在「高级导入设置 → 生成 > 物理」按节点勾。
7. `npm run 3d:import:check` → 必须 0 差异。
8. 全部齐了再改 `status=done`，再跑一次 `npm run 3d:assets`。

---

## 6. 导入预设里的三个坑（都是实测踩出来的）

1. **`meshes/light_baking` 默认是 `1`（Static Lightmaps）**，不是「关」。
   Godot 4.6 枚举实测 `DISABLED=0 / STATIC=1 / DYNAMIC=2`；我们设 0。
   探针验证：改前 `gi_mode=1`，改后 `gi_mode=0`。
2. **Godot 4.6 没有全局 `meshes/create_shapes`**，也没有 `materials/use_external`。
   碰撞是「高级导入设置」里按节点的选项；贴图处理是
   `gltf/embedded_image_handling=1`（Extract Textures）。预设里所有键名都来自
   引擎真实生成的 `.glb.import`，不是照旧文档抄的。
3. **图片相对路径在不同预览环境里会裂**。`tools/plate-demo.html` 现在把 PNG
   编成 data URI 内联（1.62 MB），任何地方双击都能开 —— 见 §8。

---

## 7. 本轮同时收尾：2.5D「AI 推理优化」暂时结项

用户本轮裁定三条：

| 裁定 | 落地 |
|---|---|
| **确信不松绑** | `known` 票在讨论期不被任何发言改动，也不被弃票盾挡；门禁有专门用例 |
| **AI 可以会议中改票** | 依据**别人当场说的话**改：早投 → 证言落地时重估 → 记录 `by / from / to / chg` 到 `m.voteStory`；只在自己的 `sus` 排序内改（`Δ > 0.10`，叠加公开声势上限 0.30），不跟风 |
| **「通胀降判断」不做** | `TESTIFY` 权重不动，`1/(1+3n)` 保持原样 |

门禁：`npm test` → **737 通过 / 0 失败**（新增 9 条改票结构化断言，含
「没有发言就没有改票」「三个人指认后 A 从 X 改到 Y」「确证票不动」）。
模拟：`node tools/monte-carlo.cjs --games 300 --seed 20261030` →
**人类 215 / 异形 85 / 超时 0 = 71.67%**，相对本轮前基线 69.3% 为 **+2.37pp**，
在 ±3pp 护栏内。报表新增三个读数并修了 `simGame` 结果快照漏字段（否则恒 0）：

| 读数 | 每局均值 | 发生过的局 | 最多一局 |
|---|---|---|---|
| `earlyVotes` 早投 | 14.413 票 | 100% | 42 |
| `voteChanges` 依发言改票 | 0.417 次 | 28% | 4 |
| `earlyKept` 早投保留到终局 | 1.320 票 | 56% | 13 |

改票不是每局都发生（28%），这符合「真人只在被说服时才改票」的口径；
确证票始终不动。

**1000 局复核**（`node tools/monte-carlo.cjs --games 1000 --seed 20261030`）：
人类 **714 / 71.40%**、异形 **285 / 28.50%**、超时 **1 / 0.10%**；
95% Wilson 区间 **68.52% ~ 74.11%**。相对 69.33% 基线 **+2.07pp**，仍在 ±3pp 内；
与 300 局的 71.67% 只差 0.27pp，说明样本量加大后结论稳定。
早投 14.121 票/局（100% 局）、改票 0.422 次/局（28.3% 局，最多 6 次）、
早投保留 1.267 票/局。结束原因：维修达成 420 / 异形全出局 294 / 人类全灭 285 / 超时 1。

**2.5D 暂时结项（当时口径）**：不再追加 AI 推理改动。剩余条目移入 backlog（§9）。

### 7.1 当晚追加（22:00 后）：平衡 + 推理继续推进

「暂时结项」随后被用户解除，本轮又做了两批，读数全部重跑：

| 批次 | 内容 | 门禁 | 1000 局人类胜率 |
|---|---|---|---|
| 平衡批次 `1c651c3` / `b1f2ae0` | 幽灵额度 2→1、红身 3→2s、加速 2s / +70%、人类近身视野 2.8→2.3、无人机救治 3→7s + 救起 3s 禁移动、移除异形开局 5s 禁刀 | **748 / 0** | **49.60%**（人类 496 / 异形 504，Wilson 46.51%~52.69%） |
| 推理批次 `d3c1cf7` | G1 envEstimate 接入 `topSus` 破平局；G2 去 soc 性格推断（改 `talkN`）+ LENS.lr 运行时排序；G3 行为序列 / 证言间关系 / 可达性反事实 | **756 / 0** | **48.40%**（人类 484 / 异形 515 / 超时 1，Wilson 45.31%~51.50%） |
| 保真 + 假设层（2026-11-06） | 模拟局同步执行讨论发言；G1/G2/G3 补专段门禁；新增多假说弃权 | **765 / 0** | **56.20%**（人类 562 / 异形 438 / 超时 0，Wilson 53.11%~59.25%） |


**推理批次的量化**：相对平衡批次的 49.60% 为 −1.20pp，在 ±3pp 内。
`reachImpossible` 平均 2.794 次/局（87.8% 的局发生）→ 可达性反事实确实在跑。

### 7.2 2026-11-06：模拟讨论保真 + 假设层

上一版 `startChatter` 里有一句 `if(G.simMode)return`，把三十多个发言回调在
蒙特卡洛里全部跳过 —— 背书、沉默判据、`talkN`、证言间关系因此恒 0。
现在模拟局把 `push` 改成**按同一顺序立即执行**（不排定时器、不复制第二套逻辑），
真实对局仍按时间铺开。于是这些机制第一次真正进入胜率读数。

同批实现**假设层**：`SKT2AI.hypotheses()` 把已有 `sus` 分布显式化成最多 3 个
并列假说（`mind.hyps` 随 `susAdd` 重算，`hypothesisSpread()` 每次实时重算避免用隔夜缓存）；
当前两名权重差 ≤ `MIND.hypGap=0.12` 且第一名 ≥0.25 时，没有确证/指控/准-确证的
人类 AI **弃权**而不是闭眼挑一个。它不新增任何嫌疑分，只改判断结构。

**本批 1000 局机制触达率**（之前恒 0 的那几项全部活了）：
`discussLines` 224.8 条/局（100% 局）、`silentSus` 25.8、`vouchHeard` 2.89、
`statementDamp` 0.437（15% 局）、`hypothesisAbstain` 20.86、`voteChanges` 0.928。
`reachImpossible` 2.527 次/局、`earlyVotes` 13.06 票/局。

**300 局同 seed A/B 归因**（门禁 765/0，A/B 开关对正式口径零影响）：

| 配置 | 人类胜率 | 假设层弃权/局 | 讨论发言/局 |
|---|---:|---:|---:|
| 全开（本批） | **58.67%** | 20.9 | ~225 |
| `--no-discuss 1`（还原旧模拟口径） | 49.67% | 28.3 | 0 |
| `--hypgap -1`（关掉假设层） | 50.67% | 0 | 207.5 |
| `--hypgap 0`（只剩权重完全相等才弃权） | 58.00% | 21.1 | 223.5 |

结论：**+8~9pp 主要来自假设层弃权，不是保真修复本身**。
保真修复单独只值约 +1pp（49.67% → 50.67%，在噪声内），它的作用是把
「背书 / 沉默 / 认错 / 领袖指令」产生的证据摆到台面上，让并列假说有机会形成；
真正改变胜率的是「两个假说难分高下就不投」这条判断结构。
弃权集中在**权重完全相等**的情形（hypgap=0 仍有 21.1 次/局），
因此若嫌 56% 太偏人类，收紧方向不是调小 `hypGap`，而是提高
「第一名最低权重」或要求两条假说都有实证支撑。

**归因用 A/B 开关**（`tools/monte-carlo.cjs`）：
`--no-discuss 1` 还原旧模拟口径，`--hypgap 0` 关掉并列假说弃权。
两个开关只作用于本次运行（模块级变量 / SKSanity 表），不改磁盘真源；
跑 300 局同 seed 对照即可把「保真修复」与「假设层」的贡献拆开。

⚠ **口径断点**：模拟讨论开始真正执行后，本批的胜率与 2026-11-05 及更早的
报告**不可直接横向比较**（讨论里的背书、辩护、认错、领袖指令现在都生效了）。

**注意**：平衡批次把人类胜率从 71.40% 拉到 49.60%（−21.8pp），
这是**有意的大幅位移**，接近 50:50，不是回归。若后续要回调，优先动
无人机 7 秒与幽灵 1 分额度这两个对人类侧最狠的闸门。

新增单一真源：`SKT2Space.GHOST_TASK_CAP`、`SKSanity.RED_BODY.dur`、
`SKSanity.MIND.silentTalk*`、`SKSanity.alibiReach()`、
`SKT2AI.sequenceCue()` / `statementRelation()`；新字段 `agent.talkN` / `agent.stunT`。
遥测新增 `reachImpossible` / `statementDamp`。门禁新增两段 8 条结构化断言读真源。

---

## 8. 「图内要素」原型（本轮唯一做出来的可交互画面）

用户诉求：**不要在图外面再画四根新线，要直接操控千问生成的那张配电板图里的电线。**

- 成品：`tools/plate-demo.html`（单文件，图片内联）。
- 原理：同一张 `panel-fix.png` 画两层，面层用 SVG mask 在**真实电线**上挖三处断口
  （16×30 px），底层是压暗虚化的同一张图当「面板内腔」。点断口两端 →
  mask 收拢 → 原始像素重新露出来，**没有新增任何一根线**。
- 三根线的坐标不是目测的：`tools/plate/snap.cjs` 用 HSV 颜色掩膜 → 局部质心 →
  PCA 主轴求切线角；`probe.cjs` / `zoom.cjs` / `_overlay.cjs` 用来核对对齐。
  最终蓝 `(431,499,125°)`、红 `(466,502,148°)`、黄 `(368,588,-2°)`。
- 交互实测：点两端 → 蓝线接上、缺口合拢、计数 1/3、零控制台报错。
- 之前「莫名其妙的图 / 像 JPG 破图图标」的原因：HTML 里用 `../../assets/minigame/panel-fix.png`
  相对路径，预览面板把 HTML 单独加载时取不到图。已改为编译期内联 + 裁切到接线区
  （`crop [268,378,284,284]`），现在画面以电线为主角。

`npm run plate:build` 从真源 `js/data/plates.js`（板描述唯一真源）重新编译
`tools/plate-demo.html` 并导出 `tools/plate/panel-fix.plate.json` 快照；
`npm run plate:check` 校验真源结构、语义与快照一致性。

**2026-11-06 更新**：这套板描述已落实进 2.5D 运行时（wire 玩法直接操控图内电线，
见根 `CHANGELOG.md` 同日条目）；3D 端做 B 方案（镜头推近 + Control 层）时应复用
`js/data/plates.js` 与 JSON 快照，不要另抄一份断口坐标。

---

## 9. 未做 / 待办（历史章节 · 2026-11-05）

> ⚠ **历史清单，已被第 1–16 批逐条结清或取代；当前交接以 §0 为准。**
> 其中「SDXL 出图」已于 2026-11-09 退役（改千问本地，见 `AGENTS.md` §一.6）；
> 「781/0」「10 型小游戏」「27 设备」等读数均已过期。

**本轮明确不做（用户裁定）**
- 确信 `known` 松绑、通胀降判断、假设层 —— 都不做。
- 3D 建模、渲染、场景装配 —— 本轮只预设工程文件。
- 2.5D 平衡调整 —— 不做。

**3D 方向 backlog**
- A/B 交互演示：A 方案已出片（`3d/preview/screenshots/启航路3D-任务交互对比.mp4`，
  1600×900 / 30fps / 38.2s），**B 方案（镜头推进 + Control 层）未开始**。
- `decor / facility / pipes` 三类场景件还没建。
- 墙体 miter 转角件、门框动画、导航网格（`NavigationRegion3D`）。
- 板原型扩产：从 1 张板 3 根线 → 10 张板约 40 根线；断口 16px → 24px。
  **已完成部分（2026-11-06）**：板 JSON schema 已固化（`tools/plate/plate.schema.json`
  + `validate.cjs`，`npm run plate:check`）；板真源 `js/data/plates.js` 已接进
  **2.5D 运行时**（wire 玩法直接操控图内电线，门禁 781/0）；
  `build.cjs` 从真源编译 demo 并导出 JSON 快照。剩余：为更多任务出独立板
  （**用 SDXL 出图**，见 §1 裁定）、断口 16→24px、`panel-breaker` 的 `lever` 图内化。
- 把 `启航路3D版` 分支与 `main` 合并时，确认 `3d/tools/sync-assets.cjs`（贴图）
  与 `sync-models.cjs`（模型）都保留；A/B 演示的 `demo.gd` 只在分支上。

**2.5D backlog（不删）**
- 2.5s 红体 / 加速解耦：**已由平衡批次完成**（红身 2s、加速 2s / **1.5 倍**，2026-11-06 用户裁定 70%→50%，门禁按真源读取）。
- G3 判断结构：会议时序早前已做；行为序列 / 证言间关系 / 可达性反事实**已在推理批次落地**。
  剩余的是更细的「假设层」（多假说并行维护）与「证言通胀降判断」——后者经用户裁定**不做**。
- 文档漂移治理：清单与规则已出，**正文订正未获批准，未改**。
- 历史遗留：脱湿速度文档里 4 处仍写 2.5，实际 `js/t2/space.js:97` 是 **2.7**；
  `js/game.js` 同处代码注释已顺手订正为 2.7。

---

## 10. 交接检查清单（历史章节 · 2026-11-05）

> ⚠ **历史清单；当前检查清单见 §0.8。** 下列 781/0、10 型小游戏、`plate:check` 等
> 是分离前旧仓口径，不适用于本工程。

```bash
cd "C:/Users/ASUS/Desktop/新返航录"
npm test                    # 期望 781 / 0（2026-11-06 实跑口径）
npm run 3d:assets           # 期望 0 错误 / 3 提醒（提醒都是 wip 缺源，属预期）
npm run plate:check         # 期望 0 错误（板真源 schema + 语义 + 快照一致性）
npm run 3d:import:check     # 期望 0 差异
npm run 3d:sync:models      # 期望 done 资产全部 copy/same，todo 跳过
npm run 3d:export:map       # map.json（schema_version=1）
npm run 3d:export:minigames # minigames.json（10 型 / 26 任务）
npm run plate:build         # 重新生成 tools/plate-demo.html

# 3D 小游戏 / 设备（Godot 不在 PATH）
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe"
"$GODOT" --headless --path 3d/preview -- --mgtest       # 期望 10/10 pass
"$GODOT" --headless --path 3d/preview -- --devicetest  # 期望 27 devices / 10 kinds
"$GODOT" --path 3d/preview --resolution 1280x720 -- --e2e  # 期望 open/closed/unlocked 全 true
```

跑完再打开 `tools/plate-demo.html` 看一眼画面；如果又出现裂图，
先查 `build.cjs` 有没有把图片内联进去，而不是改相对路径。

---

## 11. 2026-11-06 追加：10 型小游戏全量落地 + 3D 场景装配

**状态**：已完成，未提交。工作落在 **`main` 的 `3d/` 目录**（当前工作区还有 2.5D 未提交改动），
没有切到 `启航路3D版`。合并时注意：分支上有 `demo.gd` / `sync-assets.cjs` / A-B 录屏，
本批新增的是 `scripts/minigame/`、`device.gd`、`scene_extras.gd`、
`tools/export-minigames.cjs`、`tools/build-3d-assets.py`、`tools/gen-panel-texture.py`，互不覆盖。

### 已经到了什么程度

- 26 个任务点 + 电闸 = **27 个交互设备**，10 种玩法（wire/place/lever/sync/pour/swap/align/aim/match/level）
  全部可玩；`minigames.json` 是唯一数据入口，2.5D 加任务标签后重跑导出即可。
- `E` 交互走真实输入路径：正对优先、距离次之；相机推近 → 卡片遮罩 → 成功自动收起 / 中断清零。
- 设施、**8 个管道口**（新增生态舱 / 娱乐室；除中央会议室 / 配电室外每舱一个）、
  32 个装饰、22 扇门框已经进 3D；设备按掩体顶面抬升并缩放。
  管道用 `prop_pipe_port.glb`（Blender + SDXL `pipe_hatch`，2336 tris），2.5D 同款精灵由
  `render-pipe-port.py` 渲染到 `assets/scene/v4/facility/pipe-port-<room>.png`。
- Blender 5.2.2 生成 11 件 GLB（设备 6 + 道具 5，含 `prop_pipe_port` 2336 tris），
  其余设备/道具 510–1838 tris，贴图内嵌；
  `3d:assets` 0 错误、`3d:import:check` 0 差异。
- 实测：`--mgtest` 10/10（含失败路径 held_open/closed/canceled 全 true）；
  `--devicetest` 27 devices / 14 kinds；`--e2e` open/closed/unlocked 全 true；
  `--pipeshot` 管道舱盖出图；`npm test` 785/0（2.5D 平衡/管道/26 任务定制批）。
- **2.5D 平衡回调（2026-11-06）**：RUSH 1.5 / 保安 6 格 / 当众合闸 10% / 8 管道；
  1000 局人类 59.5% / 异形 40.5%。随后按用户裁定接入 almost 真实阵营分流 +
  人类 AI 实际视野 + 异形指控队友，1000 局变为 **85% / 15%** —— 这是明确的失衡位移，
  下一步应回调 almost 分流或给异形补偿，不要回退实际视野规则。
- 截图：`3d/preview/screenshots/mg-*.png`（10 型）、`device-*.png`（8 件）、
  `scene-device.png`、`e2e-device-minigame.png`（真实 E 输入）。

### 本批未做 / 交接注意

1. **小游戏没有写回任务进度**：目前是交互切片，完成只收起卡片；下一步在 `main.gd` 的
   `on_done` 里接本地记分（不要直接改 2.5D `game.js`）。
2. **26 任务定制已同步**：2.5D 的 `TASKS`（26 任务 / 14 玩法）进入 `minigames.json#tasks`；
   3D 读取任务标题/提示/配色，新交互 sequence / sort / valve / code 暂时映射到现有 4 型。
   桌面已放 `启航路 3D 版.lnk`（指向 Godot 4.6 标准版 + `3d/preview`）。
3. **SDXL 新屏幕贴图已出低分辨率版**：本机 GPU 路径（diffusers / sdcpp Vulkan）都因
   16GB 内存 + 页面文件不足失败；最终用 `sd-cli --type q2_K --backend cpu -W 256 -H 256
   --steps 4` 出了 `device_screen_task.png`，再经 `grade-screen.py` 调暗加扫描线，已接在
   通用设备屏幕上。要特写级 768² 面板时，换内存余量足够的机器跑
   `3d/tools/gen-panel-texture.py`。
4. **门只有门框**：门扇/自动门/断电扫描锁、导航网格、AI、会议仍未做。
5. **资产体积**：`3d/assets/export` 42MB、`3d/preview/assets/models` 约 84MB（含 Godot 解包贴图），
   提交前先决定是否走 LFS 或只提交源 `.blend` + 校验脚本。
6. 继续用 `--mgtest` / `--devicetest` / `--e2e` 做回归；`--mgshot all` / `--devshot` 出图核对像素，
   不要只看「节点存在」。

---

## 12. 2026-11-06 晚间交接：全船掩体重构 → Godot 主场景接线 → MCP 工具链

> 交接时间：2026-11-06 19:30 · 范围：掩体重构方案、Godot 主场景接 v2、MCP 工具链、SDXL 真图。
> 前置：先读 §1（边界）与 §11（小游戏 / 场景装配现状）。**本节改动全部落在 `main` 的 `3d/`，
> 尚未提交**；工作区同时有另一个会话的 2.5D 平衡改动（根 `CHANGELOG.md` 17:16 批次），
> 提交时请分开，不要混成一个 commit。

### 12.1 一句话现状

10 间舱室的掩体从 **59 件重排到 127 件**（另加 40 件墙饰），方案链 **82/0** 全绿；
Godot 主场景已通过 `map_v2.json` 跑新布局（自测全过，实拍 `preview-v2-pedestal.png`）；
SDXL → grade → Blender 三阶段**真跑通 2 张样张**（其余 38 张待批量）；
MCP 工具链已装 `F:\AI-MCP\`，**唯一剩余阻塞是客户端点「信任」**。

### 12.2 这轮做了什么（按可验证顺序）

| # | 事项 | 产物 | 读数 / 验证 |
|---|---|---|---|
| 1 | 七条设计意见量化为 R1–R8（门厅净空、主通道、占用率、任务可达、分区层次、素材唯一、墙饰合风格） | `tools/ship-layout-spec.cjs` | 规则集中在 `RULES` 一处，改数值只改这里 |
| 2 | 全船 10 间重排，自动避让门 / 通道 / 切角 | `ship-layout-build.cjs` → `ship-layout-plan.json` + `ship-layout-overview.html` | 127 掩体 / 40 墙饰 / 61 房间专属 kind / 平均占用 21.9%（18.4–26.9）/ 22 门 / 26 任务点 |
| 3 | 独立校验器 | `ship-layout-check.cjs` → `ship-layout-report.md` | **82 项断言 / 82 通过 / 0 失败**（R1 20、R2 10、R3 10、R4 10、R5 10、R6 10、R7 1、R8 10、同步 1） |
| 4 | Blender 场景层 | `build-scene-v2.py` → `ship_scene_v2.blend` + `ship-scene-v2.png` | Blender 5.2.2 / **289 对象** / 2.31 s / 按舱室分 Collection |
| 5 | Godot 主场景接 v2 | `build-map-v2.cjs` → `map_v2.json`；`patch-map-builder.cjs` → `map_builder.gd` | cover 127 / decor 40 / points 26 / walls 110；导入 0 脚本错误 |
| 6 | 设备台座收尾 | `patch-map-builder.cjs` 第 5 段 → `_build_device_pedestals()` | 23 个无掩体顶面的任务点补 0.55 m **无碰撞**台座；`arttest 127/0`、`devicetest 27`、`mgtest 10/10` |
| 7 | SDXL 真图全链路 | `room-wall-art.py` 加 `--only`；2 张原图 + 2 张 grade 成品 | 512²/12 步/CFG 6.0，**43.1 s / 36.1 s**，seed 802/602；SHA256 登记 `3d/ASSETS.md` |
| 8 | Blender 风格检查板 | `room-wall-all.png` + `room_wall_all.blend` | 10 行 × 4 列，2 块贴真图、38 块主题色占位；EEVEE 64 samples 960×901 |
| 9 | MCP 工具链 | `F:\AI-MCP\`（181 MB）+ `~/.workbuddy-ai/mcp.json` | uv 0.13.7 / mcp-for-blender 2.2.7 / godot-mcp 0.1.1；`list_installed_plugins` 仍「无连接器」 |
| 10 | 文档与裁定 | ADR-0009 / ADR-0010、`3d/CHANGELOG.md`、`3d/ASSETS.md`、`3d/docs/art/`（SDXL 工作流已退役清理）、`tools/ship-layout-plan.md` §9 | 全部中文、带读数 |

### 12.3 文件地图（新增 / 修改）

**方案链（`tools/`，人工真源 + 生成物分离）**

| 路径 | 性质 | 说明 |
|---|---|---|
| `tools/ship-layout-spec.cjs` | **人工维护** | 规则 / 工作流 / 10 间排布 spec / 风格表。改布局只改这里 |
| `tools/ship-layout-build.cjs` | 生成器 | 自动避让门净空、主通道、管道口、切角；产出下面两个 |
| `tools/ship-layout-plan.json` | 生成物 | 机器可读方案（坐标 / 分区 / asset / prompt / seed / 统计） |
| `tools/ship-layout-overview.html` | 生成物 | 单文件可视化，支持叠加现状 / 聚焦单舱 / 图层开关 |
| `tools/ship-layout-check.cjs` | 校验器（只读） | 82 项断言，非 0 退出即失败 |
| `tools/ship-layout-current.json` | 现状快照 | 从旧示意图抽出，用于前后对比 |
| `tools/ship-layout-plan.md` | 说明 | 七条意见 → 八条规则、逐间设计、落地边界 |

**3D 场景（`3d/`）**

| 路径 | 性质 | 说明 |
|---|---|---|
| `3d/tools/export-layout-v2.cjs` | 生成器 | 方案 → `layout-v2.json`（Blender 端消费） |
| `3d/preview/data/layout-v2.json` | 生成物 | 10 舱 / 127 掩体 / 40 墙饰 / 110 墙段 |
| `3d/tools/build-scene-v2.py` | 生成器 | Blender 5.2.2 建全船场景，带版本守卫 |
| `3d/assets/models/ship_scene_v2.blend` | 生成物 | MCP 活会话可改写的场景起点 |
| `3d/tools/build-map-v2.cjs` | 生成器 | `map.json` + `plan.json` → `map_v2.json`（只换 cover / decor） |
| `3d/preview/data/map_v2.json` | 生成物 | **Godot 主场景实际读的数据**；不是第二真源 |
| `3d/tools/patch-map-builder.cjs` | 幂等补丁 | 5 处改动集中打到 `map_builder.gd`，可重复跑 |
| `3d/preview/scripts/map_builder.gd` | 已修改 | `MAP_PATH`→v2、61 个新 kind 高度、掩体取 theme.mark、40 件墙饰、23 个设备台座 |
| `3d/preview/scripts/scene_extras.gd` | 已修改 | `_cover_top()` 兜底 0.02 → 0.57（对齐台座） |
| `3d/tools/room-wall-art.py` | 工具 | SDXL → grade → Blender 四阶段，默认 dry-run，`--only` 出样张 |
| `3d/assets/textures/<room>/` | 生成物 | 每舱独立目录，禁止跨舱复用 |
| `3d/assets/renders/room-wall-all.png` | 生成物 | 风格检查板 |
| `3d/docs/art/` | 文档 | 美术方向 / 交接 / 管线；SDXL 工作流已退役清理 |
| `3d/preview/screenshots/preview-v2*.png` | 生成物 | 主场景实拍（台座前后各一张，供视觉回归） |

**MCP 与文档**

| 路径 | 性质 | 说明 |
|---|---|---|
| `F:\AI-MCP\` | 工具链 | uv 0.13.7 / mcp-for-blender 2.2.7 / godot-mcp 0.1.1，缓存与 Python 全在 F 盘；`README.md` 有安装自检与连接器状态 |
| `C:\Users\ASUS\.workbuddy-ai\mcp.json` | 客户端配置 | `blender` + `godot` 两个 server，唯一 C 盘例外 |
| 原仓 `docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md` | 调研 | 仓库元数据实拉、许可矛盾、选型理由与排除项 |
| `3d/DECISIONS.md` ADR-0009 / ADR-0010 | 裁定 | 方案层先行 / MCP 装 F 盘与写入授权、场景重构边界 |

### 12.4 怎么跑（照抄，别自己发明）

```bash
# 方案层：改 spec 后重建 + 必跑校验（必须 82/0）
node tools/ship-layout-build.cjs
node tools/ship-layout-check.cjs

# Godot 主场景：数据合成 → 打补丁（幂等）→ 导入自测
node 3d/tools/build-map-v2.cjs
node 3d/tools/patch-map-builder.cjs
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview --editor --quit
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview -- --arttest
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview -- --devicetest
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --headless --path 3d/preview -- --mgtest
# 出主场景实拍（非 headless）
"E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe" --path 3d/preview -- --shot

# Blender 场景层
"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/build-scene-v2.py

# SDXL 样张（C:\Python314 才有 torch/diffusers；默认 dry-run，--execute 才真跑）
"C:/Python314/python.exe" 3d/tools/room-wall-art.py --stage plan
"C:/Python314/python.exe" 3d/tools/room-wall-art.py --stage sdxl --only med_vitalscreen --execute
"C:/Python314/python.exe" 3d/tools/room-wall-art.py --stage grade --room med --execute
"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/room-wall-art.py -- --stage blender --test

# MCP（工具本体在 F 盘，配置在 C 盘客户端约定位置）
pwsh -NoProfile -File F:\AI-MCP\scripts\Start-BlenderMCP.ps1   # 必须在 UI 点过「信任」之后
```

### 12.5 未完成 / 阻塞（按优先级）

1. **MCP「信任」是唯一人工阻塞**：`~/.workbuddy-ai/mcp.json` 已写好，但
   `list_installed_plugins` 仍返回「无连接器」。必须在连接器管理页右上角
   「自定义连接器」对 `blender` / `godot` 点信任并重开会话，之后才能用 MCP 改写
   `ship_scene_v2.blend`。**Agent 无法代做。**
2. **38 张墙饰底图待批量**：`--stage sdxl --execute`（不带 `--only`），约 30 分钟；
   建议逐舱放行，逐张盯伪文字 / 跑题 / 跨舱雷同。
3. ~~**掩体本体仍是盒体 + 贴图 tint**~~ **已全覆盖：61/61 个 kind（2026-11-06 深夜）**，
   **2026-11-07 又做完第二轮细节迭代**。
   四批脚本：`build-covers-ecosys.py`（8，**2026-11-07 已改为真实尺寸并迁入 `covers_lib.py`**）、
   `build-covers-{warehouse,med,armory}.py`（19）、`build-covers-rest.py`（34，按舱跑）。
   `map_builder._add_cover_model()` 按 kind 实例化，尺寸走 `3d/preview/data/cover_refs.json`（实测包围盒，无缺项）。
   第二轮：本地 SDXL 出齐 **10 舱参考图**；`covers_lib.py` 加 `shell_pass()`（浅壳/压边/发光缝）
   与 `depth_ext()`（补进深）两道通用工序；指挥桌改八边形切角；设备点 `_build_device()` 统一外壳语言；
   **生态舱 8 件的 2.25~4.32× 拉伸已修**，全 61 件横向 >1.35× 从 16 降到 4、纵向失配 0。
   读数：单件 ≤2800 tris、合计 **6.25 MB**、0 件超预算；`--arttest` 127 件 / 0 不一致；
   `3d:assets` 0 错误；导入 0 报错。10 舱检查板 + 实机截图全在 `3d/assets/renders/` 与 `3d/preview/screenshots/`。
   改完模型必跑 `measure-cover-refs.py` → `sync-cover-height.cjs` →
   `node 3d/tools/check-cover-scale.cjs`（缩放 + 眼高审查），顺序不能反。
   **2026-11-07 09:55 追加**：所有掩体高度已统一补到 **1.70 m**（`SIGHT_MIN_H`，
   人眼 1.62 m 往上），因为 2.5D 的 `los()` 让每件 cover 无条件挡光、却没有高度概念。
   补的是后缘背板/立柱，**不拉伸家具本体**；验收用 `main.gd --eyeshot <room>`。
   **2026-11-07 12:32 追加**：3D 里 3 个任务设备曾被顶到 1.72 m（玩家够不着），
   已由 `scene_extras._task_placement()` 重定位到掩体外侧台座，新增 `--tasktest`（26/0）。
   全部掩体已接 PBR 贴图（`gen-pbr-textures.py` / `covers_lib.mat()`，256² JPEG），
   医疗无人机换成 67 件 GLB（`build-medbot.py`）。**注意实时帧率**：512² 三图版只有 10 FPS，
   256² 两图版 91~165 FPS；要再上分辨率须先做 Godot 侧共享材质。
   **2026-11-07 13:56 追加**：地板口径已归位到 **单一真源 `3d/preview/data/floor_spec.json`**
   （`blender-ship.py` 与 `map_builder.gd` 同读一份，禁抄第二份）。
   背景：3D 从未换过地板贴图（11 张 sha256 相同），换的是**重复尺度**
   （全局 4.0 vs 底图 per-room 2.8~7.5，med 单格 0.44 m vs 0.33 m）。
   验证用 `main.gd --floortest`（检查真实场景网格）+ `check-floor-spec.cjs`。
   **注意**：`tools/blender-ship.py` 的 `--dry` 是本轮新加的（原本没有，误用会覆盖入库底图）。
   天花板/台座已贴图化，新增 `--ceilshot` 仰视验收。
   **剩下的是别的层面**：墙体/设备贴图、生态舱多边形发光围板、
   LOD 与合批（现在 127 件各是一个节点）。细节与坑见 `3d/ASSETS.md` 2026-11-07 第二轮。
   **2026-11-09 追加（铁板暂关）**：上面那条 1.70 m 统一补高把 61 件家具全焊成等高铁板，
   用户裁定「暂时清掉地图里面的这种铁板方块，不要直接删」。做法是
   `covers_lib.SIGHT_MIN_H` 默认 **0**（`COVERS_SIGHT_MIN_H` 可覆盖）+
   `map_builder.gd` 的 `COVER_SIGHT_SHELL = false` 在实例化时隐藏 `sight_shell` / `sightglow`；
   **GLB、`cover_refs.json`、`COVER_HEIGHT`、碰撞盒、2.5D 判定全部没动**，
   改动前的实际素材备份在 `_backup/20261109_铁板配置/`（不入库）。
   验收：`--arttest` 的 `ART 铁板 hidden=254 可见铁板节点=0`。
   ⚠ 代价：「判定挡、画面不挡」重新出现 —— 下一步按实际顶面高度做 LOS，别再焊背板。
4. **检查板不是可导入资产**：`room_wall_all.blend` 是风格核对板，
   要进 Godot 还得做「贴到真实墙段」的 `<room>_wall.glb`。
5. ~~**2.5D 运行时地图未落地**~~ **已于 19:39 用户放行、当晚落地**：
   `js/data/map.js` 掩体 59 → 127（`tools/sync-map-v2-cover.cjs`），设施 4 处微调，
   门禁 **838/0**、1000 局 **78.8% 持平**（详见根 `CHANGELOG.md` 同日条目）。
   `3d/preview/data/map.json` 仍未改（Godot 读的是 `map_v2.json`）。
   注意：落地时发现新布局与 2.5D 的三处硬约束冲突（任务点不再压掩体 / 圆桌申请单落点被议席占住 /
   成组家具必然留窄缝），已在 `game.js` 里加了兜底与自检口径，改布局前先读那三条注释。
6. **门仍只有门框**：门扇 / 自动门 / 断电扫描锁 / 导航网格仍未做（§11 遗留）。

### 12.6 这轮踩到的坑（照这个避）

| 坑 | 症状 | 正确做法 |
|---|---|---|
| GDScript「警告当错误」 | `The variable type is being inferred from a Variant value` 直接编译失败 | 从 `Dictionary.get()` 取颜色/结构体时写显式类型 + `has()` + `as Color`，别用 `:=` 推断 |
| `blender -b` 起不了 MCP socket | `cannot start server in background mode` | MCP 活会话必须 GUI（`Start-BlenderMCP.ps1`）；批量渲染继续 `-b -P`，两条路分工 |
| `--e2e` 在 headless 下超时 | `E2E open=false` 然后卡住 | **旧布局同样如此**，不是回归；要验交互用 `--devicetest` / `--mgtest` |
| 2.5D 门禁偶发 1–2 项失败 | AI 投票断言随机抖动 | 连跑三次取稳定值（本轮第 3 次 826/0）；别为抖动改逻辑 |
| 切角舱放不下成排道具 | 生成器报「越界/切角」 | 先看 `poly` 不是 `rect`：bridge/ecosys/power/fun/engine 都是切角舱，成排区间要落在直墙段 |
| 墙饰与靠墙家具打架 | 俯视投影重叠 | 墙饰吃进墙面 0.24 格，家具内缩 0.3 格，两者不重叠 |
| `map_v2.json` 被误当第二真源 | 有人手改它 | 它由 `build-map-v2.cjs` 生成；改布局请改 `ship-layout-spec.cjs` 再重建 |
| 台座挡路 | 23 个缺口里 6 个在门净空/主通道 | 台座设 `collide=false`（`_add_box(..., false)`），只做视觉，不占通行 |
| Blender `use_nodes` 弃用警告 | 6.0 会移除 | 5.2.2 上不影响；新脚本照抄现有写法即可，别为警告改 API |

### 12.7 接手第一小时

1. 读 §1 + §12.1 + `AGENTS.md` §一.11，确认「**3D 是 2.5D 的延伸**：只有按键/维度/部分美术可不同，
   其余移植；不要往 3D 加 2.5D 没有的东西」。
2. 跑一遍 12.4 的「方案层 + Godot 自测」六条命令，确认 82/0 与 `arttest/devicetest/mgtest` 全过。
3. 打开 `tools/ship-layout-overview.html` 与 `3d/preview/screenshots/preview-v2-pedestal.png`，
   对着看 10 间舱的分区、门净空、墙饰是否合眼。
4. 若 MCP 已信任：`Start-BlenderMCP.ps1` → 在对话里让 AI 读 `ship_scene_v2.blend` 的
   `get_scene_info`，先只读核对，再改一处墙饰做增量验证。
5. 选一件最不满意的房间（多半是仓库或生态舱），从「掩体本体建模」开始补，别再只调 tint。

### 12.8 交接检查清单（贴进下一位的开工单）

- [ ] `node tools/ship-layout-check.cjs` → **82/0**
- [ ] `node 3d/tools/patch-map-builder.cjs` → 「已是最新，无改动」（幂等）
- [ ] `grep "const MAP_PATH" 3d/preview/scripts/map_builder.gd` → `map_v2.json`
- [ ] Godot 无头导入 → 0 脚本错误
- [ ] `--arttest` → `件数=127` / `不一致=0`
- [ ] `--devicetest` → 27 设备 / 14 玩法
- [ ] `--mgtest` → 10/10
- [ ] `npm test`（2.5D）→ 826/0（偶发抖动连跑三次）
- [ ] `F:\AI-MCP\README.md` 的连接器状态是否已从「无连接器」变为已信任
- [ ] 提交时把 3D 改动与 2.5D 平衡改动**分成两个 commit**
