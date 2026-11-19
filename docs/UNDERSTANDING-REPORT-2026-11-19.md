# 了解报告 · 开工前（任务系统 + AI 推理）

> **状态**：只读审查报告，**未改任何游戏代码**（2026-11-19）
> **阅读范围**：`AGENTS.md` 全文、`ARCHITECTURE.md` 全文、`docs/REDLINES.md` 全文、
> `docs/workflow.md` 全文、`docs/acceptance.md` 全文、`docs/00-先导-游戏体验.md`、
> `README.md`、`CHANGELOG.md` 最新批次、`docs/CORE_RULES.md` R4~R20 + 附录 A、
> `docs/ASSET_GOVERNANCE.md` §14、`index.html` 加载清单、`package.json`、
> `js/` 相关模块、`tests/test-v3.cjs` 小游戏与认知段。
> **结论**：两条任务都能做，但有 4 个硬约束必须先处理（文件预算、共享门禁、资产治理、配置平等）；
> T1 已拍 B（补 6 张新板），A1 已按你的纠正改为双极轴，A12 徘徊待拍。

---

## 1. 阅读记录（文件 → 它约束了什么）

| 文件 | 读到的关键约束 | 对本任务的影响 |
|---|---|---|
| `AGENTS.md` §零 | 默认只读 `AGENTS → ARCHITECTURE → CORE_RULES → js/`；不默认读 `tests/`、`assets/` 二进制 | 本次按任务破例读了 tests 与 assets，只为审查，不作为日常读取路径 |
| `AGENTS.md` §一 | **16 条红线**（见第 3 节） | 两条任务的合规矩阵见第 3 节 |
| `AGENTS.md` §二 | 资产三态、白名单、删除授权、基线契约 | 6 张新板必须走三态声明与发布白名单，不能直接丢进 `assets/` |
| `ARCHITECTURE.md` | 三层（T1/T2/T3）+ 三域；真源唯一、跨层只引用不复制；批内回写禁止 | 新模块先归层贴标；T 模型只能有一份数值真源 |
| `docs/REDLINES.md` | 红线逐字副本，与 `AGENTS.md` §一有哈希契约 | 改红线必须 `agent:contract:write` 同步 |
| `docs/workflow.md` | 命令、本机环境、改动流程 | 门禁 `npm test`、`plate:check`、`t3:check`、`ci:gate`；提交格式 |
| `docs/acceptance.md` | T3 真源/读数分离、三段式、单一现值、导出同步 | 每批必须写「改动 → 读数 → 下一批依据」；3D 快照要重导 |
| `CORE_RULES` R4.5/R4.6 | 难度只靠简单动作 × 重复次数；不靠记忆；输数字不许字母 | 任务系统删除 `match/sequence/code` 的规范依据 |
| `CORE_RULES` R11~R14 | 证据、嫌疑、信任、发言、投票的现行口径 | AI 双分模型要逐条替换，不能另立第二套判据 |
| `CORE_RULES` R20 | AI 与玩家配置平等；判据只能一份定义 | T/E 必须对玩家与 AI 同时生效，不能给 AI 另写阈值 |
| `ASSET_GOVERNANCE` §14 | 任何资产/参数改动前，至少 2 个公开来源 + 比对 + 留痕 | 6 张新板生成前必须先检索并登记，不能直接跑图 |
| `index.html` | 唯一加载清单，经典 `<script>` 顺序 | 新模块必须插入；`sanity.js` 必须早于 `traits.js` |
| `package.json` | 0 运行时依赖；脚本命令 | 不新增第三方库；门禁/导出命令以它为准 |
| `CHANGELOG.md` 最新批 | 门禁 1044/0；MC 52.3%；本批改动格式 | 报告里引用读数必须带批次与实跑时间 |

---

## 2. 架构地图

### 2.1 三层

| 层 | 回答 | 本任务的落点 |
|---|---|---|
| **T1 工程大层** | 靠什么做到（三域并列） | AI 拟人化（认知/发言）、玩家决策（任务小游戏） |
| **T2 机制与执行层** | 是什么 / 怎么做 | `js/ai/sanity.js`（数值）、`js/t2/ai.js`（认知）、`js/t2/minigame.js`（小游戏）、`js/data/plates.js`（板） |
| **T3 验收层** | 事后看到什么 | `tests/test-v3.cjs`、`CHANGELOG.md`、`3d/preview/data/*.json` |

### 2.2 三域

- **AI 拟人化**：感知、记忆、推测、发言、保留底牌。双分模型属于这一域。
- **空间与资源**：移动、地图、数值、时间预算、胜利条件。徘徊修复属于这一域的走位部分。
- **玩家决策**：小游戏、会议、投票、结伴、弃修。任务系统改造属于这一域。

### 2.3 加载顺序（红线 2）

```
config/version → data/map → data/plates → data/names → data/lines →
ui/templates → engine/clock → engine/invariants → engine/geo → engine/assets →
engine/body → ai/sanity → ai/traits → t2/space → t2/ai → t2/decision →
t2/minigame → game → main → ui/home → ui/replay
```

- 新增 `js/t2/plate-task.js` 必须插在 `t2/minigame.js` **之前**（minigame 运行时调用它）。
- 新增 AI 模块若拆 `js/ai/trust.js`，必须插在 `ai/sanity.js` **之后**、`t2/ai.js` **之前**。
- 任何新模块都要同步 README「项目结构」。

### 2.4 模块边界（红线 7）

- 地图数据只放 `js/data/map.js`；几何/寻路只放 `js/engine/geo.js`；
  界面模板只放 `js/ui/templates.js`；**图内要素板只放 `js/data/plates.js`**。
- 所以 6 张新板的坐标、热点、皮肤**只能**写进 `plates.js`，不能写进 `plate-task.js` 或 `minigame.js`。
- AI 数值（T/E 的权重、阈值、衰减）**只能**写进 `js/ai/sanity.js`；
  `t2/ai.js` 只放函数，`game.js` 只放调用。

### 2.5 文件预算（棘轮）

| 文件 | 现值 | 预算 | 状态 |
|---|---:|---:|---|
| `js/game.js` | 12,598 | 12,582 | **超 16 行** |
| `js/t2/minigame.js` | 1,272 | 1,236 | **超 36 行** |
| `js/ai/sanity.js` | 1,251 | 1,251 | **刚好顶格** |
| `js/t2/ai.js` | 925 | 925 | **刚好顶格** |
| `js/data/lines.js` | 2,130 | 豁免 | 语料不受限 |

**结论**：
- 任务系统删 12 个 builder 后，`minigame.js` 预计降到 ~900，能回到预算内；
  `plate-task.js` 是新文件（默认 1,200 额度），不挤占。
- AI 双分模型会往 `sanity.js` / `t2/ai.js` 加代码，但这两个文件已顶格。
  **必须先删旧表/旧函数（CRED/ALMOST/IDENTITY/sus 相关）再写新表**，净增必须 ≤0；
  否则要先外提（例如把 `t2/ai.js` 的证言/拆谎段拆到新模块）。
- 徘徊修复在 `game.js`，只加几十行，但 `game.js` 已超 16 行；必须先找抵消项
  （例如把 `aiIdleRoam` 外提到 `js/t2/space.js` 或新 `js/t2/idle.js`）。

---

## 3. 红线合规矩阵（16 条）

| # | 红线 | 任务系统怎么守 | AI 推理怎么守 |
|---:|---|---|---|
| 1 | `file://` 可玩 | 新板用 `<img src>`/SVG `<image href>`，不 `fetch` | 不引入任何网络/模块加载 |
| 2 | `index.html` 唯一清单 | `plate-task.js` 按顺序插入，README 同步 | 若拆 `trust.js`，同样插入；不动态注入 |
| 3 | 版本单一真源 | 本批不改版本号 | 同左 |
| 4 | 门禁全绿 | 每批跑 `plate:check` + 小游戏用例；收官跑全量 | 每批跑认知/发言用例；收官跑全量 + 1000 局 |
| 5 | `_t` 调试 API | 只新增探针（`plate.spots` / `verb`），不删旧方法 | 只新增 `belief/emo/lock`，旧字段 P3 前保留镜像 |
| 6 | 素材署名 / 千问唯一 | 6 张新板本地千问生成，`CREDITS.md` 留痕 | 不涉及资产 |
| 7 | 模块边界 | 板数据只进 `plates.js`；引擎独立成 `plate-task.js` | 数值只进 `sanity.js`；函数进 `t2/ai.js` |
| 8 | 0 运行时依赖 | 不引第三方库 | 同左 |
| 9 | DOM id 双处同步 | 卡片结构不变，热点用 class/data 属性，不改现有 id | 不改 UI id |
| 10 | 中文记录 | 注释/提交中文，`feat(task): ...` | `feat(ai): ...` |
| 11 | 3D 是移植 | 重导 `minigames.json`，跑 parity | 重导 `rules.json` / `lines.json`，跑 parity |
| 12 | 公开素材优先 | 生成前按 §14 检索 ≥2 个参照并登记 | 方法论可吸收，不引代码 |
| 13 | 分支策略 | 2.5D 推 `main`；3D 客户端不混入 | 同左 |
| 14 | 三层架构 / 真源唯一 | 先归层贴标再写实现 | 先归层贴标；T/E 只有一份定义 |
| 15 | AI 与玩家配置平等 | 小游戏只影响玩家操作，AI 走同一 `finishDoing` | T/E 对玩家与 AI 同一判据，不给 AI 另写阈值 |
| 16 | 不显露个人信息/工具名 | 文档/注释/提交不写工具名 | 同左 |

---

## 4. 数值真源与验收体系

### 4.1 真源

| 内容 | 唯一真源 | 说明 |
|---|---|---|
| 数值 / 判据 | `js/ai/sanity.js` | 现有 CRED / IDENTITY / ALMOST / HUNT / SPEECH 等 |
| 认知函数 | `js/t2/ai.js` | `mindReset` / `susAdd` / `evalAlmost` / `identityAxis` / `topSus` |
| 语料 | `js/data/lines.js` | 62 类、1,221 条；不受行数上限 |
| 地图 / 任务点 | `js/data/map.js` | 26 个任务点、8 高难 / 18 普通 |
| 板 | `js/data/plates.js` | 目前只有 `panel-fix` 一块 |
| 版本 | `js/config/version.js` | V3.7 |

### 4.2 门禁与体检

| 命令 | 作用 | 何时跑 |
|---|---|---|
| `npm test` | 全量门禁（当前 1044/0） | 跨模块 / ≥3 点改动 / 收官 |
| `npm run plate:check` | 板数据校验 | 改 `plates.js` / 新板 |
| `npm run t3:check` | 台账 / 真源 / 导出体检 | 改台账 / 导出 |
| `npm run agent:contract` | 16 条红线与副本一致性 | 改红线 |
| `npm run file:check:js` | 文件行数棘轮 | 改 `js/` |
| `npm run sim` | 1000 局蒙特卡洛 | 平衡改动 |
| `npm run 3d:export:*` | 3D 快照重导 | 改 T2 真源 |
| `npm run ci:gate` | 门禁 + flaky 集 | 提交前 |

### 4.3 当前读数

- 全量门禁：**1044 通过 / 0 失败**（2026-11-19 本机实跑，日志 `tools/_gate-hard-task-20261119c.log`）。
- 蒙特卡洛：**1000 局，人类 52.3% / 异形 47.7%**（seed 20261119，95%CI 49.2~55.38）。
- T3 体检：10 PASS / 0 FAIL / 3 WARN（存量债）。
- 红线契约：PASS（16 条，哈希一致）。
- 工作区：24 个未提交改动（前几批的功能与文档），**开工前建议先做一次 checkpoint 提交**。

### 4.4 导出链

```
js/ai/sanity.js + ai/traits.js + t2/*.js → 3d/preview/data/rules.json
js/data/map.js                           → map.json / map_v2.json / layout-v2.json
js/data/lines.js                         → lines.json
js/t2/minigame.js#TASKS                  → minigames.json
```

改 T2 真源后必须按 `acceptance.md §6.2`：改 `js/` → 跑门禁 → 重导 → `t3:check` → 台账写实际重导文件名。

---

## 5. AI 认知现状与改造点

### 5.1 九条轴（现状）

| 轴 | 含义 | 写入 | 读取 |
|---|---|---:|---:|
| `sus` | 嫌疑 0~1 | 42 处 | 35 处 |
| `cred` | 信誉 −0.5~1.2（已双极） | 6 处 | 12 处 |
| `known` | 亲眼确证 | 目击分支 | 45 处 |
| `almost` | 准-确证（存了一份可推导的状态） | `evalAlmost` | 21 处 |
| `trust` | 感恩（个人） | `trustAdd` | 8 处 |
| `grudge` | 记仇（个人） | `grudgeAdd` | 6 处 |
| `warm` | 聊得来 | 会议 | 5 处 |
| `reliability` | 证言可信度 | `reliaAdd` | 5 处 |
| `humanT` | 异形眼里的"像人度" | `humanishAdd` | 15 处 |

### 5.2 决策栈（现状）

```
sus ─┐
cred ─┼→ beliefOf = max(sus, axisThreat(cred)) → 投票 / 开枪 / 点名
known ─┘        ↑
trust/grudge ──┘（只影响投票的两条支路）
```

问题：`identityAxis` 只吃 `cred`，`beliefOf` 又用 `max(sus, −cred)` 临时合流；
同一个人的"可疑"与"可信"可以同时很高，AI 在不同决策里读不同的账。

### 5.3 双分模型（含你对轴向的纠正）

**最终口径**：信任分定为 **±1** 双极轴。它是把既有 `cred` ±0.5 刻度整体放大 2 倍，
**所有加减分权重与阈值同步 ×2**，所以语义位移与 ±0.5 版一致。

```
T ∈ [−1, +1]   +1 完全信任 · 0 中立 · −1 确认异形并锁死
正轴：可信行为（做任务/修好/合闸/施救/拖入医疗间/被辩护）
负轴：可疑或伪装行为（假做/假修/弃修/拖尸/拖离/开枪/被拘留/远距目击）
锁定：近距离（≤4.5 格）目击异形专属行为 → T=−1，永久不可回升
```

- `h = (T+1)/2` 供现有判定公式使用；人类敌对 `=1−h`，异形敌对 `=h`。
- 起始 `T0 = 2×identityPrior−1`（约 +0.46），`0` 是 50/50，不是开局默认。
- 非锁定下限 `−0.80`（h=0.10）；远处目击单次上限 `0.90`（h 轴 0.45）。
- 更新在 h 轴沿用旧手感：可疑 `h−=w(0.45+0.55h)`，可信 `h+=w(0.45+0.55(1−h))`；
  T 轴位移是 `2w`（刻度同步），权重仍读 `EV_W`/`CRED.gains`。
- 情绪 `E ∈ [−1,+1]`：怨/惧/恩/亲；只在 `T` 模糊时有权重
  （`λ_eff=λ·(1−|T|)`），只改投票/开枪的目标偏好，不改身份判断；锁定目标情绪权重为 0。

### 5.4 发言与受体（现状缺口）

- `say()` 只广播，没有 `to`（受话人）/`about`（被谈论者）。
- `ctx.testimony` 有 `li`（哪个听众），但没有"这句话说给谁听"。
- 发言后果只有被指控者 `grudge` 与投票结果 `ACCOUNT`；背书说错、目击被证伪没有代价。
- 26 个任务里只有 9 个行为有专属目击台词，亲社会行为 0 个；受害者能说出口的是 0 个。
- 方案见 `docs/AI-DEED-SPEECH-PLAN.md`（行为总线 + 言语行为 + pledge）。

### 5.5 迁移与预算

- P0 双写影子（旧轴照跑，记录分歧率）→ P1 身份读 T → P2 情绪读 E → P3 删旧轴 → P4 校准。
- `sanity.js` / `t2/ai.js` 已顶格：必须先删 `CRED/ALMOST/IDENTITY` 与旧 `sus` 函数，
  再写 `belief/emo/lock`，净增 ≤0；不够就把证言/拆谎段外提到新模块。
- 门禁：`_t.state()` 在 P3 前保留 `sus/cred/known` 镜像，P3 后改 `belief/emo/lock`。

### 5.6 人类 AI 徘徊（你现场指出的）

**根因**（`js/game.js#aiIdleRoam`）：

1. 空闲且没有故障 / 申请单 / 可信同伴 / 要躲的人时，走
   `M.rooms[随机]` + `randIn(r)`；`randIn` 在房间**矩形内均匀取点**，不排除贴墙与角落。
2. 到达后**没有停留时间**：下一帧 `!a.path` 就再抽一个房间，于是"角落 → 另一个角落"。
3. 抽的是**全船随机房间**，不看距离，经常跨半张图来回走。

**修法**：空闲锚点（离墙 ≥2 格、排除角落、优先桌边/终端）+ 到达停留 4~9 秒 +
就近优先（当前舱/相邻舱，附近没人且无危险才跨图）；躲人时给就近安全点，不再给随机角落。
**验收**：`tools/track-ai.cjs --sessions 6 --sec 120` 对比改前改后，空闲移动总距离与
贴墙/角落取点次数下降 ≥50%，无新增卡死；门禁全绿。

---

## 6. 任务系统现状与改造点

### 6.1 26 个任务、14 种玩法

| 玩法 | 数量 | 任务 | 是否图上作业 |
|---|---:|---|---|
| place | 4 | 零件台 / 工具架 / 工作台 / 货箱封条 | 否 |
| sort | 3 | 餐台清洁 / 后厨盘点 / 弹药清点 | 否 |
| sequence | 3 | 娱乐桌 / 点唱机 / 操作台 | 否 |
| code | 3 | 监控墙重连 / 录像归档 / 出库扫描 | 否 |
| sync | 2 | 引擎组同步 / 温控面板 | 否 |
| wire | 2 | 电路维修 / 备用配电盘 | **是** |
| pour | 2 | 氧气循环 / 培养罐补液 | 否 |
| match | 2 | 药柜 / 库存盘点 | 否（纯记忆） |
| swap / align / valve / aim / level | 各 1 | 换芯 / 手术台 / 消毒 / 靶道 / 货架 | 否 |

**只有 2/26 真正在贴图上操作。**

### 6.2 记忆型（用户要求清零）

- `match` 2 个：药柜、库存盘点（翻牌配对）。
- `sequence` 3 个：娱乐桌、点唱机、操作台（看一行符号，按另一行）。
- `code` 3 个：监控墙、录像归档、出库扫描（看编号敲键盘）。
- 共 8 个；规范依据是 R4.5「不靠记忆力」。

### 6.3 资产

- 可用 8 张：`panel-fix`(768)、`breaker`(512，3 根红管)、`door-panel`(1536，4 条灯带)、
  `monitor`(512，双屏)、`supply-ammo`(512，6 颗子弹)、`supply-med`(512)、
  `tool-wrench`(512)、`panel-breaker`(768，一直未启用)。
- `task-frame.png` 只作卡片背景；`cozy/furniture` 是 32~96px 像素画，不可用。
- 6 张新板：`tank-gauge` / `galley` / `rec-table` / `surgery` / `target-lane` / `shelf`，
  各 768×768，服务 11 个任务。

### 6.4 6 张新板与资产治理

生成前必须按红线 12 + `ASSET_GOVERNANCE §14`：

1. **检索** ≥2 个独立公开来源（官方文档 / 开源项目 / 公开素材站 / 社区实践），
   写清「公开方案怎么做 / 本项目现状 / 差在哪 / 采纳哪条」；
2. **留痕**进 `docs/ASSET_GOVERNANCE.md §14.4` 与 `assets/minigame/CREDITS.md`
   （URL、作者/机构、许可、检索日期）；
3. **才生成**：本地千问、768²、8 步、CFG 1.0；不调用线上生图；
4. 生成后标坐标、跑 `plate:check`、截图实测。

### 6.5 引擎 / 门禁 / 预算

- 新引擎 `js/t2/plate-task.js`：一张贴图 + 热点 + 6 动词（tap / tapSeq / hold / holdBand / drag / aim）+ 3 皮肤（cut / dirty / off）。
- `minigame.js` 删 12 个 builder，预计 1,272 → ~900；`plate-task.js` 新文件 ~360 行。
- 门禁 `MGSOLVE` 按 verb 求解；删 `sequence===3` / `matchMax` 断言；新增「无 match/sequence/code」、
  「每任务 spots≥n」、「tapSeq 编号可见」等断言。
- 3D 重导 `minigames.json`。

---

## 7. 多智能体协作协议

### 7.1 分工

| 角色 | 负责任务 | 理由 |
|---|---|---|
| **主线（我）** | AI 推理：T/E 双分、行为总线、发言受体、徘徊修复 | 需要持续取舍、跨模块判断 |
| **子智能体** | 任务系统：`plate-task.js`、`minigame.js`、`plates.js`、6 张新板接入 | 规格已写死（26 行迁移表 + 验收），文件独立 |

### 7.2 文件所有权

| 文件 | 归属 |
|---|---|
| `js/game.js`、`js/ai/sanity.js`、`js/ai/traits.js`、`js/t2/ai.js`、`js/t2/decision.js`、`js/data/lines.js` | 主线 |
| `js/t2/minigame.js`、`js/t2/plate-task.js`、`js/data/plates.js`、`assets/minigame/*` | 子智能体 |
| `tests/test-v3.cjs`、`index.html`、`docs/CORE_RULES.md`、`CHANGELOG.md`、`3d/preview/data/*` | 主线 |
| `tests/test-plate.cjs`（子智能体自测） | 子智能体 |

**硬规则**：子智能体不得改共享文件；需要改时只报告“要改哪一行”，由主线落。
**原因**：当前工作树有 24 个未提交改动，不适合开 `git worktree`；同工作区只能靠文件所有权隔离。

### 7.3 验收串行

- 代码可以并行；**浏览器门禁串行**（两个 Edge 同时跑会互相拖慢，日志也容易混）。
- 子智能体每批跑 `node --check` + `plate:check` + 自测 `tests/test-plate.cjs`；
  主线合并后跑全量 `npm test` 并写读数。
- 代理不提交；主线按批 commit（`feat(task): ...` / `feat(ai): ...`）。

### 7.4 冲突与回滚

- 每批一个 commit；出问题只回退该批。
- 子智能体越界改共享文件 → 立即回退该文件并重派。
- 任何一批导致门禁失败且 30 分钟内定位不到 → 回退该批，不带着红门禁继续。

---

## 8. 施工顺序（建议）

| 批次 | 主线（AI） | 子智能体（任务） |
|---|---|---|
| **P0** | 双写 `belief/emo/lock` 影子，旧轴照跑；300 局分歧率 | 搭 `plate-task.js`，只接电路维修一个任务 |
| **P1** | 身份读 T；跑 1000 局 | 迁移电力/引擎 7 个任务；`plate:check` |
| **P2** | 情绪读 E；投票/开枪/救援 | 迁移监控/仓储/医疗 8 个任务；删 3 个记忆型 |
| **P3** | 删旧轴；重写门禁 | 迁移剩余 11 个任务；6 张新板生成/标注 |
| **P4** | 校准（3 种子 ×1000 局） | 全量门禁 + 3D 重导 |
| **P5** | 行为总线 + 发言受体 | 文档与截图 |

**注意**：P0 的 6 张新板生成不在引擎验证前做；先把现有板跑通，再按 §14 检索/生成。

---

## 9. 风险清单

| 风险 | 后果 | 对策 |
|---|---|---|
| `sanity.js` / `t2/ai.js` 顶格 | 新模型加不进去 | 先删旧表/旧函数，净增 ≤0；不够就外提 |
| `game.js` 超 16 行 | 徘徊修复没地方放 | 把 `aiIdleRoam` 外提到 `t2/space.js` 或新 `idle.js` |
| 共享门禁 | 两个代理同时改 `test-v3.cjs` 必冲突 | 门禁归主线；子智能体写独立自测 |
| 6 张新板语义不匹配 | 玩家觉得"在弹药箱上修氧气" | 按迁移表逐张核对；先出灰度截图再定稿 |
| 资产治理 | 未检索就生成 → 违反红线 12 | P5 前先做 §14 检索与登记 |
| 双分模型平衡位移 | 胜率大幅漂移 | P0 影子对比 + 3 种子 A/B，不直接切 |
| 情绪导致乱开枪 | 人类自相残杀 | E 只在 T 模糊时有权重；锁定目标免疫；候选集硬护栏 |
| 徘徊修复影响 AI 效率 | 任务完成率下降 | `track-ai.cjs` 对比；只改空闲段，不碰任务/追击 |

---

## 10. 待拍板

完整 22 条见 `docs/DECISION-REGISTER-2026-11-19.md`。已拍：

- **T1 = B**：补 6 张新板。
- **A1 = 双极轴**：`T ∈ [−1,+1]`，正轴可信、负轴可疑、锁定 −1；权重与阈值按 ±0.5 旧刻度 ×2。
- **A12 待定**：空闲锚点 + 停留 + 就近优先（建议 a）。

---

## 11. 开工状态（2026-11-19 10:40）

| 项 | 状态 |
|---|---|
| 文档刻度 | 已统一为 ±1；模型、决策清单、本报告三处一致 |
| AI P0 影子 | `js/t2/trust.js` 已落地；`_t.trustShadow` 探针实测通过，页面零报错 |
| 任务系统 P1 | 子智能体进行中：`plate-task.js` 引擎 + `supply-ammo` 板 + 「弹药清点」tap 竖切 |
| 共享门禁 | 已加 `k==='plate'` 的 tap/tapSeq 求解分支；全量门禁待子智能体交付后跑 |
| 文件预算 | `game.js` 因探针 +1 行（临时超 17）；任务系统删 builder 后会回落 |
| 徘徊修复 | 排在 AI P1（与删旧认知代码同批，用腾出的行数抵），避免现在硬塞 `game.js` |

其余按清单逐条拍；拍完我按第 8 节开工。
