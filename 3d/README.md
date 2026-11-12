# 新返航录 3D 预演（独立子项目）

> 状态：**2.5D 的功能移植**（判定 / 会议 / 结算 / 小地图 / HUD 已同源；
> 已知缺口见 `HANDOFF.md` §0.4 与 `spec/gameplay-parity.json#budget`）。门禁现值与本次实跑读数只在
> `3d/CHANGELOG.md` 指向的当月文件最新批次声明，本文件不复制。仍是本地预演、不发行。
> **接手先读 `HANDOFF.md` §0（最新交接）与 §0.8（第一小时清单）**；
> 红线 / 移植约束以两仓 `AGENTS.md` §一与 `docs/REDLINES.md` 为现行口径；历史审查快照已清理。
> 创建：2026-11-03 晚。引擎：**Godot 4.6 stable**（`89cea1439`，GL Compatibility）。
> 2026-11-04 早补：完整版（含 .NET / `GodotSharp`）已装，GDScript 工程两份编辑器读数一致，见 §3。
> 主项目 2.5D 的 `file://` 红线**不适用**于本目录；这里不通过 `index.html` 加载。

## 1. 这个预演回答什么问题

1. 现有 2.5D 的**地图数据**能不能直接升维成 3D 可走场景？
2. 现有**表面贴图**（地板 / 墙面 / 家具）在 3D 里还能不能用？
3. 现有**角色行走图**能不能先以 billboard 形式复用，还是要立刻做 3D 模型？
4. 真正的 **WASD + 鼠标视角** 在这个尺度下是否顺手？
5. 2.5D 的 `game.js` 代码能不能直接搬？答案：**不能直接搬，只能搬数据与规则口径**。

## 1.5 同源口径（2026-11-08 用户裁定）

**2.5D 与 3D 只允许三处差异：维度（3D 场景 / 相机 / 碰撞 / A* / LOS）、美术、
玩家输入映射（键鼠点击 vs WASD+鼠标）。AI 推理、发言、判定规则、语料、数值全部同源。**

> **总则（2026-11-09 用户裁定，红线级，见 `AGENTS.md` §一.11 / ADR-0011）**
> **3D 版是 2.5D 版的延伸，不是第二条产品线。** 除按键操作、维度、部分美术素材外，
> 其他都是 2.5D 的移植。**如无必要，不要擅自往 3D 版里加 2D 版没有的东西** ——
> 新状态、新计数器、新阈值、新系统都算。要加真·维度产物（A* / 相机 / 碰撞 / LOD）
> 就写进 `spec/parity-map.json#allowed_differences` 并说明「为什么 2.5D 不需要」；
> 不属于维度产物的，**先改 2.5D 再导出**，不许只加在 3D。

- `data/rules.json`：从 `js/ai/sanity.js` / `js/ai/traits.js` / `js/t2/ai.js` /
  `js/t2/decision.js` / `js/game.js` 导出的 **48 张规则表 + 70 个纯函数源码指纹 +
  pickLine/startChatter/sayStreakOK 调度系数**；GDScript 里不再写死推理/发言阈值。
- `data/lines.json`：62 类台词、词表、parseSpeech 正则（逐字校验，见 `npm run 3d:lines:check`）。
- `spec/parity-map.json`：70 个 2.5D 纯函数逐项对账，**63 synced / 7 adapter / 0 pending**，
  覆盖 100%；剩余"未同源"只有白天改票/早投、`MISLEAD.bus` 细节、`COFRAME` 名额
  （见 `summary.pending_next_batch`），不伪装成完成。
- `npm run 3d:parity:check`：改了任一 `js/` 真源没重导 → FAIL；`lines.json#rules` 与
  `rules.json` 出现第二套数值 → FAIL；3D 脚本出现自造阈值 → WARN。
- `npm run 3d:audit:port`：只读审计 22 个 JS 文件，按「数据表 / 纯逻辑 / 适配 / DOM-UI /
  运行时 DOM」分层；报告已清理（2026-11-12），需要时跑 `npm run 3d:audit:port` 生成。当前结论：数据表已自动导出；
  纯函数可做 IR + codegen；`game.js`（12k 行 / 438 DOM 引用）与 UI 必须先上游解耦，不能直接翻译。
- `npm run 3d:poc:speech`：`parseSpeech` 差分 POC。2.5D 生成 503 条 fixtures，Godot 同时跑
  运行时手写解析器与 POC 生成解析器；当前 **runtime 503/503 / generated 503/503**。
  **边界**：词表/正则自动生成，控制流仍是固定模板；通用 JS→GDScript 转译尚未实现。
- `npm run 3d:audit:coreui`：`game.js` 函数级 core/UI 解耦审计。341 个具名函数中
  `core-state` 196 / 7206 行、`ui` 47 / 1734 行、`pure` 96 / 1028 行；混用 DOM+G 39 个。
  报告已清理（2026-11-12），需要时跑 `npm run 3d:audit:coreui` 生成。
- `npm run 3d:ui:check`：会议面板 UI spec（`3d/spec/ui/meeting-panel.spec.json`）↔
  2.5D DOM 17/17 ↔ 3D Control 17/17 ↔ 模板 11/11；已并入 `npm run check`。
- `npm run 3d:poc:ui`：从同一份 spec 生成 Godot Control 面板，验证 17 节点 / 11 模板 /
  3 状态可见性（7/0）。**不生成 handler、不替换运行时**；2.5D DOM 仍是 spec 来源。
- 同源契约与逐函数移植规程见 `PORTING_PROTOCOL.md`。

### 版本号（2026-11-09）

3D 是 2.5D 的延伸，但**不是同一个发布物**，版本号不共用 —— 否则 issue、提交、截图里
分不清说的是哪一套。

| | 真源 | 格式 | 当前 |
|---|---|---|---|
| 2.5D | `js/config/version.js` + `package.json.gameVersion` | `返航录V3.x` / `3.x.0` | `返航录V3.7` / `3.7.0` |
| 3D | `3d/version.json` | `V1P-<major>.<minor>` / `major.minor.0` | `V1P-0.2` / `0.2.0` |

- 两个号互不占位：3D 用 `V1P-` 前缀，2.5D 继续走 `返航录V3.x`，谁也不挤谁。
- `npm run 3d:export:version` 合成 `preview/data/version.json`，其中 `base` 字段自动写入
  当前的 2.5D 版本（**不手写**，防漂移），用来回答「这一版 3D 是从哪个 2.5D 基线移植的」。
- 门禁会拦：`version` 不符合 `V1P-<major>.<minor>`；`version` 与 `semver` 数字不一致
  （`V1P-0.2` ↔ `0.2.0`）；2.5D 自身 `SKConfig.version ≠ package.json.gameVersion`。
- 首页品牌行读 `Config.label()`（返回 `V1P-0.2`），GDScript 里不许再写版本字符串。
- 这是**发布标识**的差别，不是机制差异，所以不进 `spec/parity-map.json#allowed_differences`
  ——那个列表只放维度 / 美术 / 输入三类真差异，别把版本号混进去稀释红线。

## 2. 已实现

- `js/data/map.js` → `3d/preview/data/map.json`（10 舱室 / 11 走廊 / 110 墙体线段 / 123 掩体 / 26 任务点）。
- **26 个任务点 + 电闸**已落成 3D 设备（27 个交互点，14 种玩法全覆盖），设备优先用
  `3d/assets/export/*.glb`，缺失时程序化兜底；按掩体顶面自动抬升，正面朝向舱室中心。
- **14 型基础交互全部移植**（`scripts/minigame/`）：wire / place / lever / sync / pour /
  swap / align / aim / match / level / sequence / sort / valve / code；2.5D 的
  2026-11-06 **26 任务定制**通过 `minigames.json#tasks` 同步到 3D：
  任务标题 / 提示 / 配色按任务读取。卡片遮罩、保底倒计时、中断清零、失败重来与 2.5D 同口径。
- `E` 交互 + 相机推近 + 小游戏遮罩 + 完成后自动收回；正对优先、距离次之选设备。
- 设施（电闸 / 医疗无人机 / 保安机器人 / 补给点 / 监控台）、**8 个管道口**（除中央会议室 / 配电室外每舱一个）、
  32 个装饰、22 扇门框；管道用 `prop_pipe_port.glb`（Blender + SDXL 舱盖贴图），2.5D 同款精灵由 Blender 渲染。
- 房间多边形铺地板 + 天花板；走廊按中心线铺 3.2 格宽地面；墙体按线段生成盒体碰撞。
- 掩体按 `cover` 矩形生成盒体碰撞，高度按 `kind` 映射。
- `CharacterBody3D` 玩家：**WASD 移动、鼠标视角、Shift 加速、Esc 释放鼠标**；不再点击地面。
- 手电 `SpotLight3D`、房间 `OmniLight3D`、环境雾、2D 角色 `Sprite3D` billboard。
- HUD：控制提示、当前舱室、FPS、最近设备提示；自动截图模式；无头移动/碰撞/小游戏/设备自测。
- **模拟核心 B1（2026-11-08）**：`scripts/sim/sim_state.gd` 接「开局 → 任务 → 天亮 → 胜负」主回路，
  数据来自 `data/sim.json`（`3d/tools/export-sim.cjs`）。HUD 显示夜/倒计时/维修进度/自己的 4 个任务；
  小游戏玩通写回进度；`--simtest` 26/0。**只搬非发言规则**，AI / 战斗 / 会议在后续批次接入；
  现行边界见 `AGENTS.md` §一.11 / `PORTING_PROTOCOL.md`，逐批记录见 `CHANGELOG-2026-11.md`。
- **移植准备（2026-11-08）**：`spec/port-manifest.json` 把 2.5D 的 22 个 js 文件 / 19,765 行
  逐项登记为 47 个系统（当前 ported 9 / partial 26 / prepared 0 / reference 4 / excluded 8），
  `npm run 3d:port:check` 校验「无未认领文件 / 行覆盖 100% / target 存在 / 依赖无环 / 契约版本」。
  发言单列 S 轨，美术整类 excluded。
- **B2 · 网格 + AI 人类（2026-11-08）**：`grid_nav.gd` 按 `geo.js` 同规则烘焙 0.6m 网格，
  **walkable=5894（与 2.5D 一致）**；11 个人类 AI 会做任务/领申请单/换补给；
  `crew_view.gd` 用 crew-01 做 15 个 billboard。`--navtest` 28/0、`--aittest` prog 30/45。
- **B3 · 异形 + 尸体 + 投票（最小版）**：异形追踪/出刀、破坏 30 秒窗口、玩家/AI 维修、
  濒死 12 秒、报告尸体、投票、驱逐/公布 alien 布尔。`--meetingtest` ok=true。
- **B6 · 开始页（2026-11-08）**：`home_view.gd` + `home_ship_map.gd` 把 2.5D 主页
  （品牌 / 标题 / 三张身份卡 / 统计 chips / 手电光斑 / 整船蓝图）照搬过来；蓝图直接读
  `map_v2.json`，选身份高亮对应舱室。**选人类 / 异形真的改变开局**（异形总数仍是 4）。
  无门禁参数时显示，`--role human|alien` 可跳过。`--hometest` 6/0、`--roletest` 4/0。
- **B4 · 机器人 + 玩家战斗 + 管道 + 搜尸（2026-11-08）**：`bots.gd` 让保安机器人四点巡逻
  （6m 视野抓现行 → 押送 → 拘留 30 秒 / 每夜 2 次）、医疗无人机飞去救濒死者（每夜 2 次）；
  玩家左键出刀 / 右键开枪 / `E` 钻管道选出口 / `E` 搜尸；玩家位置每帧同步进 sim。
  **B3 的「异形不刀玩家」保护已撤销**。`--bottest` 6/0、`--b4test` 8/0。
- **B5 · 会议三段相位（2026-11-08）**：`discuss(35s，可跳过) → vote(5s) → result(3s)`，
  秒数读 `sim.json#rules.MEET`。第 12 批起会议 UI 功能层同源：8 个一键模板 + 对象/舱室下拉、
  `01–15` 席位号、弃权、讨论期先投/改票、跳过投票、幽灵/旁观只读；结果页按 2.5D
  「过程不可见」只公布聚合票数与门槛（逐人矩阵在结算页，第 14 批已迁）。`--meetshot` 三态实拍、
  `--meetuitest` 23/0。
- **S 轨 · 发言（2026-11-08）**：`export-lines.cjs` 从 2.5D 四个真源导出 `data/lines.json`
  （62 类 / 1,201 行台词 / 74 证据短语 / 21 规则表 / 发言解析词表）；`lines_data.gd` +
  `mind.gd` + `speech.gd` 接模板填充、hot-cold、组合槽、去重、talkScore 排期、证词→嫌疑、
  玩家自由发言与 AI 质疑；会议 discuss 段显示发言流 + 输入框。`--speechtest` 11/0。
- **B6′ · 剩余系统（2026-11-08）**：拖尸/藏尸/医疗救起、机器人 HP 与反制、供电合并、
  改票/报账/讨论超时/天亮/终结者、旁观者第 16 人自由相机、设置与复盘面板、
  20 条 `.ogg` 事件音效、版本号单一真源。**事件词表 31/31/31 静态全覆盖**。`--b6test` 6/0。
- **UI 收尾（2026-11-10 第 12–15 批）**：会议 11 模板（六类直接证据 + 时段）/席位号/弃权/先投改票/跳过投票/只读；
  结算页身份表 + 逐人投票矩阵；局内小地图（短名/灯态/任务点/故障/圆桌脉冲/玩家/图例，
  不画他人、不可点击）；HUD 报告余量 + 夜会场次。`--meetuitest` / `--settletest` /
  `--minimaptest` 全绿。
- **判定层收尾（2026-11-10 第 16 批）**：身份轴 / `exposureAt` / trait 系数 / `huntSpotFor`、
  `evalAlmost` 全量、`trust`/`grudge`/`patron`、`claimHist`/`claim_recall`、`DESC`、
  构陷/大义灭亲编排补齐；parity 的 20 个源字面量带 `js` 行号回读校验，**0 WARN**。
  `--socialtest` 6/0、`--aiporttest` 13/0。

## 3. 快速运行

> CI：push/PR `master` 跑 `.github/workflows/check.yml`（`npm run check` + `baseline:check` + `agent:contract` + `guard`）。

```bash
# 便携版 Godot（不在 PATH 上）—— 标准版
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe"
# 完整版（含 .NET，2026-11-04 装）——要上 C# 时用这一份
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_mono_win64/Godot_v4.6-stable_mono_win64_console.exe"

# 首次导入资源
"$GODOT" --headless --path 3d/preview --editor --quit

# 正常游玩（先出开始页，选人类/异形再点「进入舱段」）
"$GODOT" --path 3d/preview --resolution 1280x720
```

# 数据契约（2.5D 真源 → 3D JSON，三个导出器全部 fail-loud）
npm run 3d:export:map        # map.json v2：含 rooms[].theme 与 cover[].v / decor[].v 美术变体
npm run 3d:export:minigames  # minigames.json（14 型 / 26 任务）
npm run 3d:export:space      # space.json：门/视野/站桩/电闸/管道/补给 全部数值（含 22 个走廊灯位）
npm run 3d:export:sim        # sim.json：角色规模/任务分值/夜长/胜负 + 非发言规则表（不导出发言表）
npm run 3d:port:check        # 移植清单校验：js 全覆盖 / target 存在 / 依赖无环 / 契约版本
npm run 3d:export:lines      # js/data/lines.js + sanity + traits + decision → data/lines.json
npm run 3d:lines:check       # 逐字校验语料契约（改了语料没重导直接 FAIL）
npm run 3d:export:version    # js/config/version.js + package.json → data/version.json
npm run 3d:export:rules      # ★ 推理/发言全量真源 → data/rules.json（改 js/ 后必跑）
npm run 3d:parity:check      # ★ 2.5D↔3D 同源校验：真源/双份表/函数对账/3D 硬编码
npm run 3d:events:check      # 事件词表校验：schema 31 / 2.5D 31 / 3D 31 kind / 信封 pt+t
npm run 3d:audit:port        # 只读可移植性审计：纯逻辑 / DOM-UI / 运行时耦合分层
npm run 3d:audit:coreui      # game.js 函数级 core/UI 解耦审计（341 函数 / 39 混用）
npm run 3d:ui:check          # 会议面板 UI spec ↔ 2.5D DOM ↔ 3D Control 契约
npm run 3d:poc:speech        # parseSpeech 差分 POC：JS↔运行时↔生成 GDScript 同 fixtures
npm run 3d:poc:ui            # 会议面板 spec → Godot Control POC（结构/模板/状态）
npm run 3d:simdump           # 导出 2.5D 同 seed 事件流（可加 -- --seed N）

# 断电 / 交互 / 美术 三组无头自测
"$GODOT" --headless --path 3d/preview -- --powertest     # 灯 10+22、环境光、补光、门扫描 2s、拉闸 3/6/9/9
"$GODOT" --headless --path 3d/preview -- --interacttest  # 轮盘共存项、站桩结算、人类管道=0
"$GODOT" --headless --path 3d/preview -- --arttest       # 主题色 10/10、色调 5 档、设备顶面一致性

# 模拟核心门禁（B1：开局 / 任务分值 / 乱序记账 / 天亮 / 三条胜负分支）
"$GODOT" --headless --path 3d/preview -- --simtest         # 期望 26/0
"$GODOT" --headless --path 3d/preview -- --taskflowtest    # 期望 ok=true（E → 解题 → 写回进度）

# B2/B3：网格 / AI 人类 / 异形 / 会议
"$GODOT" --headless --path 3d/preview -- --navtest         # 期望 28/0，walkable=5894
"$GODOT" --headless --path 3d/preview -- --aittest         # 300 秒 AI 自跑：prog>0 / 刀 / 会议 / 驱逐
"$GODOT" --headless --path 3d/preview -- --meetingtest     # 期望 ok=true，14 个投票按钮
"$GODOT" --headless --path 3d/preview -- --bottest         # 期望 7/0（巡逻/抓捕/拘留/救人）
"$GODOT" --headless --path 3d/preview -- --b4test          # 期望 8/0（位置/管道/开枪/搜尸/会议）
"$GODOT" --headless --path 3d/preview -- --hometest        # 期望 6/0（三张卡 + 图元 + 高亮）
"$GODOT" --headless --path 3d/preview -- --roletest        # 期望 4/0
"$GODOT" --headless --path 3d/preview -- --speechtest       # 期望 17/0（发言链路 + 模板 11/11）
"$GODOT" --headless --path 3d/preview -- --b6test           # 期望 6/0（剩余系统）
"$GODOT" --headless --path 3d/preview -- --parityfixture    # 期望 0 项失败（4 机制行为夹具，夹具由 2.5D _t 运行时导出）
"$GODOT" --headless --path 3d/preview -- --invtest          # 期望 0 项失败（SKInvariants 44 条断言 + 正反双向对照）
"$GODOT" --headless --path 3d/preview -- --knifebottest     # 期望 0 项失败（刀击机器人的守卫/红身/保安转向）
"$GODOT" --headless --path 3d/preview -- --meetopentest     # 期望 0 项失败（报案播报 + 开场定调/附议）
"$GODOT" --headless --path 3d/preview -- --dragtest          # 期望 0 项失败（拖行 0.62 / 视图 bodyPos / 抢修名额）
# 大文件改动（2026-11-12 起）：先定位、再改、别整文件读
npm run file:map                                  # 全仓结构总览（行数/函数数/夹具占比）
npm run file:map -- --section dragtest            # 按名取函数原文（带行号）
npm run file:check                                # 预算棘轮：单文件/单函数上限 + tests/ 外禁夹具
# 调试夹具住在 3d/preview/scripts/tests/（6 个模块），main.gd 只保留分发，不放实现

"$GODOT" --headless --path 3d/preview -- --sim1000 --games 200  # 3D 批量基线（含败因/驱逐/异形决策遥测）
"$GODOT" --headless --path 3d/preview -- --simdiff 3d/reports/js-simdump-20261108.json（人类/异形开局）
"$GODOT" --path 3d/preview --resolution 1280x720 -- --homeshot            # 开始页实拍
"$GODOT" --path 3d/preview --resolution 1280x720 -- --meetshot            # 讨论页（发言流）实拍
"$GODOT" --path 3d/preview --resolution 1280x720 -- --meetshot --meetvote # 投票页实拍
"$GODOT" --path 3d/preview --resolution 1280x720 -- --meetshot --meetresult # 身份公布页
"$GODOT" --path 3d/preview --resolution 1280x720 -- --shot --wait 30       # 30 秒后的 AI 场景
"$GODOT" --path 3d/preview --resolution 1280x720 -- --role alien           # 跳过开始页快速开局

# 熄灯对照图（同机位）
"$GODOT" --path 3d/preview --resolution 1280x720 -- --shot
"$GODOT" --path 3d/preview --resolution 1280x720 -- --shot --blackout

# 美术素材生成（千问本地模型 · 2026-11-07 解禁，可用于游戏内；须本地生成）
# ⚠ 必须用 PowerShell 7：脚本含中文注释，Windows PowerShell 5.1 按 GBK 解码 UTF-8 源码会解析失败
#   （脚本开头有硬守卫，5.1 下直接 FATAL）。项目规则也统一要求 pwsh（AGENTS.md §二）。
# 房间名/明暗/主题色读 map.json，任务玩法 kind/元素数 n/配色读 minigames.json —— 脚本里不硬编码。
npm run 3d:refs:cabin        # 10 间舱室表面材质参考，768×768，约 97 s/张
npm run 3d:refs:tasks        # 26 个任务控制面板参考，同上
pwsh -File 3d/tools/gen-art-refs.ps1          # 两套一起跑
pwsh -File 3d/tools/gen-art-refs.ps1 -Limit 2 # 只跑前两张（试跑用）
pwsh -File 3d/tools/gen-art-refs.ps1 -Size 512 # 草稿档，约 47 s/张
# 产物 E:\ai-models\qwen-image-2.1\output\{cabin-refs,task-refs}\
# 留档 docs\qwen21\{cabin-refs,task-refs}\（含 manifest.json：模型/seed/prompt/许可/耗时）
```

操作：`WASD` 移动 · `E` 交互 / 出刀（多项时 `1-9` 选轮盘项，ESC 取消）· 鼠标左键出刀 ·
鼠标右键开枪 · `F2` DEV（全知 + 无敌 + 玩家探针）· 鼠标视角 · `Esc` 释放鼠标。

> ⚠ 键位与 2.5D 不一致且**暂无法统一**：2.5D 已把交互并入 `W`、出刀是 `A`，但 3D 的 `W` 是前进键。
> 这里保留 `E` 交互（FPS 惯例），并把出刀同时挂到左键与 E 轮盘；语义与 2.5D 的
> `collectInteractions` / `stab()` 一致，只有键不同。E 的选人是「刀程内最近 + 有视线」，
> 左键仍走准星，两者都过同一套 `sim.knife` 结算。

### 截图与自测

```bash
# 中央会议室机位
"$GODOT" --path 3d/preview --resolution 1280x720 -- --shot

# 走廊机位
"$GODOT" --path 3d/preview --resolution 1280x720 -- --shot --corridor

# WASD 位移（期望 1 秒约 4.2 米）
"$GODOT" --headless --path 3d/preview -- --walktest

# 走廊撞墙（期望约 1.1 米后停住，而不是 4.2 米）
"$GODOT" --headless --path 3d/preview -- --walktest --corridor --wall
```

2026-11-03 实测：

- `WALK_TEST distance=4.198524`（speed 4.2，1 秒；最终会议室机位）；
- 走廊撞墙 `distance=1.139070`（在墙前停住）；
- 截图输出在 `user://preview.png` / `user://preview-corridor.png`，实际路径会打印 `SHOT_PATH=`；
  仓库内留档：`3d/preview/screenshots/bridge.png` / `corridor.png`。

### 14 型小游戏与设备交互（2026-11-06）

```bash
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe"

# 数据契约：地图 + 小游戏（2.5D 真源 → 3D JSON）
npm run 3d:export:map
npm run 3d:export:minigames

# 14 型小游戏无头自测（期望 14/14 pass）
"$GODOT" --headless --path 3d/preview -- --mgtest

# 27 个交互点 / 14 种玩法 + E 交互开关自测
"$GODOT" --headless --path 3d/preview -- --devicetest

# 14 型小游戏截图（输出 3d/preview/screenshots/mg-<kind>.png）
"$GODOT" --path 3d/preview --resolution 1280x720 -- --mgshot all

# 设备特写（0,4,7,8,13,26 = sync/pour/wire/swap/align/lever）
"$GODOT" --path 3d/preview --resolution 1280x720 -- --devshot 0,4,7,8,13,26

# 管道舱盖特写（输出 screenshots/pipe-port-3d.png）
"$GODOT" --path 3d/preview --resolution 1280x720 -- --pipeshot

# 真实输入 E2E：走到设备前 → 按 E → 遮罩 → 解题 → 自动收起
"$GODOT" --path 3d/preview --resolution 1280x720 -- --e2e

# 玩家探针（2026-11-10）：真实 E / 数字键 / 左键 / F2，验「异形按 E 能放倒人」+ DEV 无敌。
# 必须真实窗口：headless 下 MOUSE_MODE_CAPTURED 不成立，左键会被“先夺回鼠标”分支吃掉。
npm run 3d:probe

# 人物 blockout 同框验收（2026-11-11）：2.5D billboard / 3D 体块 / 1.75m 标尺
"$GODOT" --path 3d/preview --resolution 1280x720 -- --crewshot

# 门扇闭合/全开对照（2026-11-11）：closed 时中线合拢，open 时让出整段门洞
"$GODOT" --path 3d/preview --resolution 1280x720 -- --doorshot

# 默认就是 3D 体块；要回退旧 billboard 用 --crew-billboard
"$GODOT" --path 3d/preview --resolution 1280x720 -- --role alien --crew-billboard

# 任务点**站位可达性**（2026-11-09）：逐点扫描半径内的可走格子，
# 查「走过去站得下、且仍在交互半径内」——tasktest 是传送验证，查不出走不到的点
"$GODOT" --headless --path 3d/preview -- --reachtest

# 音频链路（2026-11-09）：背景音乐文件 / 导入循环 / 感知音量曲线 / 音乐与音效是否各管各的
"$GODOT" --headless --path 3d/preview -- --audiotest
```

> **截图/机位硬约束（`HANDOFF.md` §0.5 ⑬）**：所有 `--shot / --crewshot / --doorshot /
> --mgshot / --devshot / --covershot / --ceilshot / --pipeshot / --meetshot /
> --endshot / --minishot / --homeshot` 一律使用 `MOUSE_MODE_VISIBLE`，
> **禁止捕获鼠标、禁止转视角、禁止误触攻击**；进程退出时 `_exit_tree()` 再释放。
> 截图自测应打印 `CREW_MOUSE mode=0（0=VISIBLE）`；若为 2 说明捕获了，立即停跑修复。
> `--probetest` / `--mousetest` 是输入链自测，不是截图，必须与截图/机位分开跑。

实测（2026-11-09 复跑）：`--reachtest` **26 点 / 走不到 0**（改钳位距离前是 3 个走不到）；
`--audiotest` **文件=true 时长=151.2s 导入循环=true 播放=true**、档 0.35 → 增益 0.48（−6.4dB）、Master 回到 0dB；
`--e2e` 先收束开局讨论再注 E，`E2E open=true`（旧写法在开局讨论还开着时注 E，永远 open=false）；
`--mgtest` **14/14 pass**；`--tasktest` 26 点 0 失败；`--interacttest` 全绿。
`--actiontest`（2026-11-09 第四批新增）：真实输入链自测，**鼠标相位 5/5 + 2.5D 动作入口 5/5**，
不靠 `skip_discussion()` 绕过开局会议；修的是「轮盘打开了却点不动」这类门禁测不到的缺陷。
`--devicetest` 2026-11-10 实跑已回到 `open=true locked=true` / `closed=true unlocked=true`
（此前记的 `open=false` 是 `_ready` 当帧夹具问题，已在第 16 批前修掉）。
`--probetest`（2026-11-10 新增）：`PROBE ① [attack]` → `E 濒死=true 刀=0` →
`左键 濒死=true` → `轮盘选 1 濒死=true` → `F2 dev=true 面板=true` →
`DEV 挨枪/死亡/驱逐全部无效`，`PROBETEST OK 0 项失败`。
截图留档：`screenshots/mg-*.png`、`screenshots/device-*.png`、`screenshots/e2e-device-minigame.png`；
DEV 实拍在同一次探针里输出 `user://probe-dev.png`（实际路径打印 `PROBESHOT_PATH=`）。

## 4. 资产复用结论

| 资产 | 结论 | 说明 |
|---|---|---|
| `js/data/map.js` | **可直接复用** | 通过 `3d/tools/export-map.cjs` 导出 JSON；房间 / 走廊 / 墙 / 掩体 / 任务点都能升维 |
| `assets/scene/v4/tex/*.png` | **可直接复用** | 地板 / 墙面 / 金属 / 桌面材质；3D 里按世界坐标平铺或 triplanar |
| `assets/scene/crew/crew-*.png` | **先做 billboard** | 4×5 帧、96×160/帧；当前用第一帧做 `Sprite3D`，只验证比例与可读性 |
| `assets/scene/cozy` 32×32 家具 | **只适合 billboard / 贴花** | 不是 3D 模型；要做真 3D 家具需 Blender 重做 |
| `assets/scene/v4/base-lit.png` | **不可直接复用** | 俯视烘焙底图；3D 需要重新打光/材质 |
| `js/game.js` | **不可直接搬** | DOM/Canvas 2D 编排；只能复用规则、数值表、事件 schema，代码要重写 |
| `js/ai/sanity.js` / `js/data/lines.js` | **可数据化复用** | 建议导出 JSON，作为 3D 模拟核心的配置；台词仍走同一套语料 |

## 5. 目录

```
3d/
  README.md                 本文件（垂直切片说明）
  HANDOFF.md                ★ 唯一交接文档（接手先读 §0；专题增量并入 §0.9）
  ARCHITECTURE.md           引擎/分层/数据/资产管线
  DECISIONS.md              ADR（为什么这样选）
  ASSETS.md                 素材来源、许可、哈希
  CHANGELOG.md              子项目变更索引（当月文件见下）
  CHANGELOG-2026-11.md      2026-11 台账（82 批；最新批次见文件顶部）
  PORTING_PROTOCOL.md       移植规程 + 红线适用性 / 映射裁决 / buildMeetCtx 映射（附录 A–C）
  docs/
    audit/                  留档报告（默认现跑生成、不入库）
    art/                    ART_DIRECTION / ART_HANDOFF / CHARACTER_ART_PIPELINE
  spec/
    conventions.md          单位/命名/预算/边界的硬约定
    asset.schema.json       清单 schema
    assets.manifest.json    ★ 资产清单，唯一真源（29 项）
    port-manifest.json      ★ 移植清单，唯一真源（47 个系统 / 源行段 / 目标 / 状态 / 门禁）
    events.schema.json      事件信封 + 31 个 kind 词表（与 2.5D logEvent 对齐）
    godot-import.cfg        Godot 4.6 glTF 导入参数口径
  assets/
    models/                 .blend 源文件（2026-11-06 起 11 件设备/道具）
    export/                 .glb 导出物
    textures/               预留：SDXL 设备屏幕贴图（见 CHANGELOG 的内存限制说明）
  tools/
    export-map.cjs          map.js → map.json（唯一跨项目地图入口）
    export-minigames.cjs    minigame.js + plates.js → minigames.json
    build-3d-assets.py      Blender 5.2.2 程序化设备/道具建模
    gen-panel-texture.py    SDXL 设备屏幕贴图（768² 高质量路径）
    grade-screen.py         把 SDXL 小图压成暗色扫描线屏幕（256²→512²）
    grade-pipe.py           把 SDXL 小图压成暗金属管道舱盖贴图
    render-pipe-port.py     2.5D 管道精灵（8 舱，Blender 5.2.2 正交渲染）
    validate-assets.cjs     清单校验（npm run 3d:assets）
    check-godot-import.cjs  导入参数核对（npm run 3d:import:check）
    export-space.cjs        sanity.js + space.js + game.js → space.json（B4 起含 shoot / bot 两段）
    export-sim.cjs          sanity.js + space.js + names.js → sim.json（非发言规则，B1 起）
    export-rules.cjs         ★ sanity + traits + t2/ai + t2/decision + game → rules.json
    check-parity.cjs         ★ 同源校验（真源 SHA / 函数指纹 / 对账表 / 硬编码扫描）
    export-lines.cjs         lines.js + sanity + traits + decision → lines.json
    export-version.cjs       version.js + package.json → version.json
    simdump.cjs              2.5D 同 seed 事件流导出（--simdiff 的上游）
    check-lines.cjs          语料逐字校验（npm run 3d:lines:check）
    check-port-manifest.cjs 移植清单校验（npm run 3d:port:check）
    check-events.cjs        事件词表校验（npm run 3d:events:check；扫 3 个产生事件的脚本）
    blender-export.py       Blender 导出预设
    smoke-test.py           无真资产的导出自检
    sync-models.cjs         .glb → preview（npm run 3d:sync:models）
  preview/
    project.godot           Godot 4.6 工程
    scenes/main.tscn        唯一入口场景
    scripts/main.gd         场景装配 / HUD / E 交互 / 战斗 / 管道 / 会议 / 自测
    scripts/home_view.gd    开始页（2.5D 版式照搬）与身份选择
    scripts/home_ship_map.gd 开始页整船蓝图（读 map_v2.json，自绘）
    scripts/ui_panels.gd     设置面板 + 复盘时间轴
    scripts/audio.gd         事件流驱动的 20 条 .ogg 音效
    scripts/config.gd        版本单一真源（data/version.json）
    scripts/sim/sim_state.gd 模拟核心：开局/任务/夜/刀/尸体/投票/胜负（纯逻辑）
    scripts/sim/grid_nav.gd  0.6m 网格 + AStarGrid2D（walkable=5894）
    scripts/sim/ai_human.gd  人类 AI：任务 / 申请单 / 补给 / 维修 / 报告
    scripts/sim/ai_alien.gd  异形 AI：追踪 / 出刀 / 每夜一次破坏
    scripts/sim/bots.gd      保安巡逻 / 抓捕拘留 / 医疗无人机施救
    scripts/sim/rules_data.gd ★ 推理/发言规则真源读取器（类级缓存）
    scripts/sim/lines_data.gd 台词语料 / 模板填充 / 玩家发言槽位解析
    scripts/sim/mind.gd      sus / cred / warm / reliability / heard 窗口
    scripts/sim/speech.gd    发言排期 / 去重 / 广播 / 玩家自由发言
    data/lines.json          62 类台词 + 21 规则表（S 轨唯一真源快照）
    data/rules.json          ★ 48 张规则表 / 70 函数指纹 / 发言调度系数（同源唯一真源）
    data/version.json        版本号（V1P-0.2 / 0.2.0，base 记 2.5D 移植基线）
    scripts/sim/crew_view.gd 15 个 billboard + 名牌（美术下一批）
    scripts/sim/README.md   sim 模块布局、依赖顺序与接口
    scripts/player.gd       WASD + 鼠标视角 + 手电
    scripts/map_builder.gd  地图升维 / 碰撞 / 灯光
    scripts/device.gd       任务点设备（模型 / 朝向 / 镜头落点）
    scripts/scene_extras.gd 设施 / 管道 / 装饰 / 门框 / 设备清单
    scripts/minigame/       遮挡层 + 14 型玩法（mg_*.gd）
    data/map.json           由 export-map.cjs 生成（schema_version=1）
    data/minigames.json     由 export-minigames.cjs 生成
    data/sim.json           由 export-sim.cjs 生成（开局/分值/夜长/会议；发言表另见下）
    assets/models/          Blender GLB 副本 + Godot 导入设置
    assets/plates/          panel-fix.png（图内要素板，res:// 路径）
    assets/import-probe/     探针 GLB + 引擎真实生成的 .glb.import
    assets/                 复制的贴图、角色图、许可证
```

> 分支口径：3D 工作分支是 **`3d`**（2.5D 仓；独立仓 `returnlog-3d` 的 `master` 为镜像；历史分支 `启航路3D版` 已不再推进）；
> `main` 只保留 2.5D 与 `3d/` 构建输入快照（不含 3D 客户端脚本），**不占用主分支**。
> 3D 是 2.5D 的**延伸**（不是"两套并行产品"），见 `HANDOFF.md` §1 与 `AGENTS.md` §一.11。

## 6. 已知限制

**除美术外的系统都已接入主链路；下面列的是"接了但还没做到 2.5D 那么细"的部分。**

- **S 轨编排层**：构陷编排 `planAlienDeception` / `planMateBus`、领袖型玩家剧本、
  完整假设层（hypGap / hypMinEvidence）、时间线拆谎未迁；目前发言是"六类说服策略 +
  证词→嫌疑 + 玩家自由发言"的完整链路，不是 2.5D 那 1,784 行调度逐行照搬。
- **AI 认知**：sus / cred / warm / reliability / heard 滑动窗口已接，但没有 2.5D 的
  `envEstimate` 假说竞争与 `MISID` 误认模型。
- 机器人 HP 与反制已接，但没有"机器人被修好"的回路；BGM 是 `.m4a`，Godot 不支持，未接。
- 设置面板有音量滑块与本机持久化，音效无 3D 空间衰减；复盘只读 `sim.events`，
  不载入外部回放 JSON。
- 舱外甲板仍可走；碰撞盒未按 2.5D 口径收缩；家具仍是盒体代理。
- 角色默认已切 `char_crew_lowpoly`（1.75 m / 1812 tris / 17 骨 / idle+walk）；
  参考图在素材层 `returnlog_assets/unreferenced/qwen21/3d/crew-refs/`。`--crew-billboard` 回退旧单帧 billboard，
  `char_crew_blockout` 只作模型缺失时的第二级回退；四动作 idle/walk/knife/down 已齐，
  V-CREW 标 `ported`（full）。
- 事件词表静态 31/31/31 全覆盖，但**同 seed 一局内不一定 31 种都触发**；
  `--simdiff` 报告会如实列出该局两边的 kind 差与首个分歧点。
- 灯光是预演级；**SDXL 新贴图只有 256² 低步数版**（内存余量不足），
  特写级 768² 面板仍需换机器重跑。
- **平衡读数**：只认 `CHANGELOG-2026-11.md` 最新批次；历史 200 / 1000 局数值随报告清理
  （2026-11-12）失效，本文件不复述。需要新基线时跑 `--sim1000`（A* 每帧都跑，约 1 小时／1000 局）。
- **平衡对齐**：2026-11-08 的 9 处真源漂移已逐项修正（驱逐门槛、报告额度、票权层级、
  发言→票权、KNIFE 理智线、注意力过滤、枪声证人、全 AI 模拟口径、人类 AI 开枪），
  明细见 CHANGELOG 对应批次。

## 7. 下一里程碑

1. **美术优化（用户已点名，下一批）**：2.5D 底图"铁板子太多、圆桌变方桌、会议室地毯没了"；
   3D 保安机器人太小/被遮挡、15 个 crew 全是同一张 billboard、天花板蓝色条纹。
   保持 2.5D / 3D 同一帧源（`floor_spec.json`），不拆成两套材质。
2. **移植缺口补完**：待办只认 `3d/spec/gameplay-parity.json#budget` 与
   `PORTING_PROTOCOL.md` 附录 B；补完后重跑 `--sim1000` 登记新基线。
3. **S 轨编排层补完**：构陷 / 领袖剧本 / 完整假设层 / 时间线拆谎（与上项同一批）。
4. **完整 1000 局基线**：在空闲机器上跑 `--sim1000`（不带 `--games`），登记新基线。
5. **补高质量屏幕贴图**：按红线 6 用千问本地重出（768²）；SDXL 已退役，不再新增。
