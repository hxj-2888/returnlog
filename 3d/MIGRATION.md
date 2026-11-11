# 3D 迁移施工单（同源 · 仅维度 / 美术 / 输入差异）

> 裁定：**2026-11-08 · 用户** —— 「2.5D 和 3D 之间的推理和发言系统，不会由于地形差异
> 有什么区别，尽量能同步的就全部同步，相当于两套只是一个维度和美术差异，其他均无差异」；
> 补充：「操作按键肯定有所不同，AI 端基本一致」。
> **现行口径**：只允许三处差异 —— ① 维度（3D 场景 / 相机 / 碰撞 / A* / LOS 几何）
> ② 美术素材与呈现 ③ 玩家输入映射（2.5D 键鼠点击 vs 3D WASD+鼠标）。
> **AI 推理、发言、判定规则、语料、数值 100% 同源**，由 `data/rules.json` +
> `data/lines.json` + `spec/parity-map.json` + `tools/check-parity.cjs` 保证。
> 读者：先读本文件 §1–§3，再看 §8 清单、§9 平衡对齐与 §10 同源契约。

---

## 1. 一句话口径

**能迁的是「规则、数值、状态机、事件流」；不能直接搬的是 `js/game.js` 的 DOM/Canvas 编排。**
3D 端用网格 + Godot tick 重新承载同一套模拟，Godot 只负责表现与输入；
**"重新承载"不等于"重新设计"** —— 判定顺序、概率、阈值、语料一律照 `js/` 抄，
2.5D 的 JS 实现是**唯一参考实现 + 平衡试验台**，不把 Node 运行时带进 3D 发行包。
（2026-11-09 用户裁定：3D 是 2.5D 的延伸，不是另一个游戏；见 §10.1 与 ADR-0011。）

```
2.5D 真源 (js/ai/sanity.js / js/t2/space.js / js/data/*.js)
        │  导出（fail-loud，不手抄）
        ▼
3d/preview/data/{sim,space,map_v2,minigames}.json
        │
        ▼
sim/（纯逻辑：网格坐标 / 状态 / 规则 / 事件）──→ view/（3D 节点、HUD、镜头）
        ▲                                              │
        └──────────── intent（移动 / 交互 / 投票）──────┘
```

硬规则（沿用 `3d/ARCHITECTURE.md` §3）：

1. `sim/` 不读节点、不读输入、不读鼠标；输入只进 `intent`。
2. `view/` 不改规则状态；所有变化走 sim 的命令入口。
3. 数值只从 `data/*.json` 进；GDScript 里不写第二份常数。
4. 事件流只追加，不参与判定。
5. 随机只用 sim 内的一处显式 seed。

---

## 2. 迁移边界（逐项）

| 系统 | 2.5D 真源 | 处理 | 说明 |
|---|---|---|---|
| 地图 / 房间 / 走廊 / 墙 / 掩体 / 任务点 | `js/data/map.js` | **已迁** | `map_v2.json`；1 格 = 1 米 |
| 空间数值（门 / 视野 / 站桩 / 电闸 / 管道） | `js/t2/space.js` + `sanity.js` | **已迁** | `space.json`；3D 已用 |
| 任务小游戏（10 型可玩 / 14 型映射） | `js/t2/minigame.js` + `plates.js` | **已迁** | `sequence/sort/valve/code` 暂映射到现有 4 型 |
| 角色规模 / 任务分配 / 任务分值 / 夜长 / 胜负 | `js/game.js` newGame / checkWin / dawn | **B1 已迁** | `sim.json` + `sim_state.gd` |
| 任务进度 / 申请单 / 补给兑换 | `js/game.js` finishDoing / claim / supply | **B1 部分** | 进度与申请单已进 sim；圆桌/补给 UI 仍用本地计数 |
| 可行走网格 / A* / 视线 | `js/engine/geo.js`（169 行） | **B2** | 网格权威的关键；不搬 2D 绘制 |
| 人类 AI（做任务 / 领物资 / 救人 / 躲异形） | `js/game.js` aiHuman（~700 行） | **B2** | 依赖 B2 的 A* |
| 异形 AI / 出刀 / 开枪 / 破坏 / 管道 / 伪装 | `js/game.js` aiAlien + alienPlan（~1500 行） | **B3** | 与战斗、尸体、报告同批 |
| 濒死 / 死亡 / 尸体 / 拖拽 / 搜尸 / 收尸 | `js/game.js` die / drag / loot | **B3** | 事件 schema 与 2.5D 对齐 |
| 医疗无人机 / 保安机器人 / 监控台 | `js/game.js` botTick / medbotTick / secCatch | **B4** | 3D 目前只有静态代理 |
| 电闸 / 断电 / 自动门 / 扫描锁 | `space.js` + `game.js` | **已迁（表现）** | 与 sim 的供电状态在 B4 合并 |
| 会议**结构**：报告 → 讨论窗口 → 投票 → 驱逐 → 公布身份 | `js/game.js` openMeeting / startVote | **B5** | 讨论阶段改成静默等待，不做发言 |
| 会议**发言**：台词、口供、质疑、作证、玩家自由发言 | `js/data/lines.js`（2,087 行）+ startChatter / playerTalk | **S 轨（最后）** | 目标里保留；本轮只准备 schema 与“发言→证据”接口，不写台词逻辑 |
| 复盘 / 设置 / 音效 / HUD | `js/ui/*` + `audio/` | **B6** | 事件流先对齐，再做回放 UI |
| 2.5D 美术（角色图 / 家具 / 房间缩略图 / 底图） | `assets/scene/**` | **不迁** | 3D 继续用现有代理几何与贴图 |
| 2.5D 渲染（DOM / Canvas / 2D 迷雾 / 点击寻路） | `js/game.js` draw*（~2,000 行） | **不迁** | 3D 用自己的镜头与光照 |

---

## 3. 架构决定：网格权威，3D 只做表现

原仓 `docs/3D化审查_20261105.md` 留了 A/B/C 三条路线（GDScript 重写 / JS 权威 / 只做表现）。
本轮按用户裁定走 **A（GDScript 重写）**，但加一条约束：**空间规则仍以 0.6 米网格为权威**。

理由：

- `geo.js` 的可行走网格、A*、LOS 已经把「掩体是硬阻挡、门洞要留净空、船体外不可达」写死了；
  在 3D 物理里重推一遍，会得到第二套判定，AI 与玩家看到的世界会不一致。
- 1 格 = 1 米，网格坐标与 Godot 世界坐标可以直接换算（`Vector3(x, y, z)`）。
- 15 个 agent 在 98×94 的网格上跑 A* 足够快；不需要运行时烘焙导航网格。
- 表现层仍用 `CharacterBody3D` 处理玩家碰撞；AI 的位置由 sim 给，view 只做插值。

**迁移顺序因此是：先 B1 状态机，再 B2 网格 + AI 人类，再 B3 异形与战斗。**
不要先做异形 AI——它依赖寻路、视野、尸体、报告四条底座。

---

## 4. 发言 S 轨之前的连锁影响（必须先知道）

1. **AI 的证据源变了。** 2.5D 的 `sus` 有相当一部分来自「证言 / 口供矛盾 / 辩护 / 可信度」；
   切掉发言后，AI 只剩「亲眼目击 + 尸体信息 + 行为序列」。`TESTIFY / RELIA / MIND / DESC /
   FRAME / WARM / LEADER / ALIBI` 这些表**不导出**，也不要在 GDScript 里重写。
2. **1000 局基线不能直接沿用。** 2.5D 的 74.8% / 25.2% 是在「发言生效」的口径下测的；
   无发言版的投票判断更依赖目击，人类/异形胜率会移动。B5 必须**重新标定**，并登记新基线，
   不能拿旧读数当回归线。
3. **会议仍然保留，但只保留骨架。** 报告 → 静默讨论窗口（`MEET.discuss*` 只作为等待时长）
   → 投票 → 驱逐 → 公布身份。玩家不输入文字；AI 不产生台词。
4. **不要在 3D 里“先随便说两句”。** 一旦出现硬编码台词，就会和以后的发言系统重建撞车；
   需要占位时用 UI 文案（“某人被指认”），不要写角色台词。

---

## 5. 批次与验收

### B1 · 状态机 + 任务回路（✅ 2026-11-08）

- 新增 `3d/tools/export-sim.cjs` → `data/sim.json`（15 席 / 4 异形 / 26 点 / 75 秒 / 45 分）。
- 新增 `scripts/sim/sim_state.gd`：开局、任务分配（1 高难 + 3 普通）、乱序记账、
  申请单、电路修复、夜计时、天亮、三条胜负分支、事件流。
- `main.gd`：HUD 显示夜/倒计时/进度/自己的 4 个任务；设备只对自己的剩余任务开放；
  小游戏玩通写回 sim；结束遮罩；`--simtest`。
- **读数**：`--simtest` **26 通过 / 0 失败**；`--taskflowtest` **ok=true**（真实 E → 小游戏 →
  进度 0→2、tIdx 0→1、卡片收起、解锁）；`--arttest` 127/0；`--floortest` 48/0；
  `--tasktest` 26/0；`--devicetest` 27 设备 / 14 玩法；`--mgtest` 10/10；
  `--interacttest` 全项；`--powertest` 全项；`--e2e` open=true / closed=true / unlocked=true。
- **B1 已知限制（B2 已补）**：当时 14 个 AI 不会动、玩家单人最多 5 分、打不到 45；
  B2 已把网格、AI 人类与任务交互接进来，B3 又把异形/尸体/投票接进来。

### B2 · 网格 + AI 人类（✅ 2026-11-08）

- 新增 `scripts/sim/grid_nav.gd`：按 `js/engine/geo.js` 同一套规则烘焙 0.6m 可行走网格
  （舱室 poly / 走廊 CW/2 / 掩体外扩 0.12 / 墙 0.36），A* 用 `AStarGrid2D`。
  **可走格 5,894，与 2.5D 通行体检完全一致**。
- `sim_state.gd` 加 `pos/path/pathI/doing/taskPt`，开局在会议室 6 格内散开；
  `ai_human.gd` 让 11 个人类 AI 选任务 → 走路 → 站桩 → 完成 → 领申请单 → 换补给；
  玩家申请单/补给也改成 sim 真源（本地变量只做 UI 缓存）。
- 新增 `crew_view.gd`：用 `crew-01.png` 第一帧做 15 个 billboard + 名牌（美术下一批再优化）。
- **读数**：`--navtest` **28/0**（26 任务点 + 出生点 + 网格非空，walkable=5894）；
  `--aittest` 300 秒 AI 自跑：**prog 30/45、tasks 23、qual 11、supply 10**，4 夜结束。
- 限制：agent 之间没有碰撞；billboard 全是同一张图；A* 路径未做 2.5D 的 `smoothPath` 等价平滑。

### B3 · 异形 + 战斗 + 尸体 + 投票（◐ 2026-11-08 最小版）

- 新增 `ai_alien.gd`：找人 → 走到刀程 → 出刀；每夜最多一次破坏（非会议室）；
  附近有别的活人时 7 成概率先不动手（2.5D 理智线的占位）。
- `sim_state.gd`：出刀 → 濒死 12 秒 → 死亡；目击者 7m 内、LOS 通过记 `suspect`；
  破坏 30 秒窗口未修 → 进度 -5；报告尸体 → 5 秒静默投票 → 驱逐 → 公布 `alien` 布尔。
- 玩家：靠近尸体按 E 报告；会议面板点名字投票；故障点站桩 10 秒维修。
- **读数**：`--aittest` knife 6 / kill 6 / meet 5 / eject 5，最终人类靠“异形全部出局”赢；
  `--meetingtest` **ok=true / 14 个投票按钮 / ejected=1**。
- B3 当时的限制（**B4 已补**）：没有开枪、钻管道、拖尸/搜尸；异形不主动刀玩家。
  现在前三项已接、临时保护已撤销，剩下拖尸/藏尸/伪装/完整 mind/sus 仍待接。

### B4 · 设施与机器人 + 玩家战斗（◐ 2026-11-08 主体已接）

- **机器人**：`scripts/sim/bots.gd` 按 2.5D `js/game.js` 4442–4726 落地 —— 保安沿
  `facility.patrol` 四点巡逻（1.6 格/秒）、6 格 + 前方 180° + LOS 抓现行、7.5 格/秒追逐、
  押送到军械库角落拘留 30 秒（每夜 2 次）；医疗无人机从医疗间坞位飞向濒死者，每夜救 2 次。
  `scene_extras.gd` 把两台机器人收进可移动 Node3D，名牌跟着走。
- **参数不出真源**：`SEC_RANGE / DETAIN_TIME / SEC_USES_MAX / BOT_SPEED / SEC_CATCH_SPEED /
  MEDBOT_CHARGES` 与 `SKSanity.SHOT.range` 由 `3d/tools/export-space.cjs` 具名抠进
  `space.json#bot` / `#shoot`，GDScript 不抄数值（COVER_HEIGHT 事故口径）。
- **玩家战斗**：左键出刀（异形，1.35m）/ 右键开枪（人类，9m + 1 发子弹），都走
  `sim.knife / sim.shoot`，因此目击者 suspect、保安抓捕、无人机施救自动生效。
  **B3 里「异形不主动刀玩家」的临时保护已撤销。**
- **钻管道**：`E` 打开出口面板（8 个管道口去掉当前口），点一个真传送；20 秒冷却；
  人类禁用（门禁断言）。**搜尸**：站桩 `STAND.search` 秒转移死者子弹/医疗包/申请单，一具只搜一次。
- **玩家位置同步**：此前玩家走遍全船，sim 里却一直站在出生点；现在每帧把
  `player.global_position` 写回 `sim.me().pos`（押送/濒死/会议期间除外）。
- **读数**：`--bottest` **6/0**（巡逻位移 4.80m、6m 视野抓捕、30s 拘留到期释放、无人机救人）；
  `--b4test` **8/0**（位置同步 / 出口面板 / 真传送 + 冷却 / 人类禁用 / 开枪 / 搜尸 / 会议三段）。
- 未接：机器人 HP 与打机器人、拖尸/藏尸/收尸、供电状态与 sim 合并、击杀加速。

### B5 · 会议（无发言）· 三段相位已接（◐）

- **discuss(35s，可点「直接进入投票」跳过) → vote(5s) → result(3s)**，三段秒数全部读
  `sim.json#rules.MEET`（`discussNight / voteNight / reveal`），不在 GDScript 写死。
- AI 票在讨论结束进入投票相位时才投；玩家票只在 vote 相位有效。
- result 面板显示「谁被驱逐 · 是/不是异形 · 几票」+ **投票矩阵**（谁→谁，最多 8 行）。
- 事件统一到 2.5D 冻结词表：机器人抓捕用 `detain`，管道用 `pipe`；
  `check-events.cjs` 已扩展到扫描 `bots.gd` / `main.gd`，3D 覆盖 **19/31 kind**。
- 验收：`--meetingtest` ok=true（14 按钮 / phase=vote / ejected=1）、`--meetshot` 与
  `--meetshot --meetresult` 两张实拍。**1000 局新基线仍未跑**，单独登记。

### B6 · 开始页（◐ 2026-11-08 已接主 UI）

- `scripts/home_view.gd` + `home_ship_map.gd`：版式 / 文案 / 配色照搬 2.5D
  `js/ui/home.js` + `index.html#pick`；右侧整船蓝图直接读 `map_v2.json`
  （10 舱 / 127 掩体 / 26 任务点 / 8 管道口），选身份高亮对应舱室。
- 选人类 / 异形**真的改变开局**：`sim.new_game(..., p_player_alien)` 会把自己钉进异形池，
  总数仍是 4；旁观者卡暂时禁用（3D 自由相机未接）。
- 无门禁参数时显示开始页；所有 `--xxx` 门禁/截图直接进局；`--role human|alien` 快速开局。
- 验收：`--hometest` 6/0、`--roletest` 4/0、`--homeshot` 实拍。
- 未接：设置面板 / 音量 / 旁观者第 16 人 / 复盘页。

### S 轨 · 发言（◐ 2026-11-08 主链路已接）

- **数据**：`3d/tools/export-lines.cjs` 从 `js/data/lines.js` + `js/ai/sanity.js` +
  `js/ai/traits.js` + `js/t2/decision.js` 导出 `data/lines.json`（62 类 / 1,201 行台词 /
  74 条证据短语 / 20 条组合模板 / 21 张规则表 / 38 组舱室词 / 13 组 parseSpeech 正则）。
  `3d/spec/lines.schema.json` + `check-lines.cjs` **逐字校验**：改了语料没重导会直接 FAIL。
  GDScript 里不写死一句台词、一条中文关键词、一个阈值。
- **运行**：`sim/lines_data.gd`（模板填充 / `{a|b}` 组合槽 / toneOf / parseSpeech）、
  `sim/mind.gd`（sus / cred / warm / reliability / heard 滑动窗口 10 / known / almost / why）、
  `sim/speech.gd`（talkScore 排期 / hot-cold / 整局降权 `1/(1+3n)` / 同场硬去重 /
  连说让位 / 发言→证词→sus / 玩家自由发言 / AI 质疑附议）。
- **UI**：会议 discuss 段显示发言流（玩家金色、系统灰、其余统一浅蓝，**不按阵营标色以免泄露身份**）
  + 自由输入框（Enter 或点「发言」）。会议打开时释放鼠标，按钮和输入框才点得到。
- **玩家发言解析**：`ROOM_WORDS` / 人名长度降序占位 / 席位号 / 6 类 claim /
  support / deny / where / when 全部从 2.5D 源码具名抠出；「我投 X」在讨论期记为意向，
  进投票相位自动落票。
- **修过的坑**：`speech._log("chat", {..., "kind": ...})` 里的业务 `kind` 会覆盖事件信封
  （2.5D `logEvent` 同款问题，§8.1 记过一次），已改名 `ev`。
- **读数**：`--speechtest` **11/0**（讨论 13 条台词 / 无占位符残留 / 无同场复读 /
  玩家解析 `saw_knife` / 证词改听众 sus / 投票意向落票）。
- **未接**：构陷编排 `planAlienDeception` / `planMateBus`、领袖型玩家剧本、
  完整假设层（hypGap / hypMinEvidence）、时间线拆谎。这些依赖 2.5D 的 mind 假设层，
  在 `port-manifest.json` 里如实标 `partial`，不算"完成"。

### B6′ · 剩余系统（✅ 2026-11-08 全部接上）

- 拖尸 / 医疗间救起 / 非公共舱藏尸（`drag_start` / `drag_end` / `drag_away`）；
  机器人 HP（保安 2 / 医疗 1）与打机器人反制（`bot_hit` / `bot_down`）；
  供电状态与 sim 合并（`breaker`）；改票（`vote_change`）；报账（`account`）；
  讨论超时（`meeting_overtime`）；天亮（`night_start`）；第 10 夜终结者（`terminator`）。
- 旁观者第 16 人：自由飞行相机（无碰撞 / 空格 Ctrl 升降），0 号席位交回 AI 控制。
  开始页三张身份卡全部可用。
- 设置（音量 / 鼠标灵敏度 / 本机持久化）与复盘（只读 `sim.events` 的时间轴）；
  20 条 `.ogg` 音效由事件流驱动播放；版本号从 `js/config/version.js` 导出。
- **事件词表 31 / 31 / 31**：`check-events.cjs` 扩展到扫描 `bots.gd` / `speech.gd` / `main.gd`，
  3D 静态覆盖全部 31 个 kind。
- **同 seed 对照夹具**：`node 3d/tools/simdump.cjs --seed N` 导出 2.5D 事件流，
  `$GODOT -- --simdiff <file>` 比对信封字段 / kind 覆盖 / 首个分歧点。
  **规则已同源**（见 §10）；事件序列逐条差异来自维度 / 随机流 / 尚未迁完的
  `parity-map.json#pending` 模块，pending 清零后应逐步收敛（见 `preview/reports/simdiff-*.md`）。
- **基线**：`--sim1000`（可 `--games N` 缩小）跑 3D 自己的批量模拟，报告落 `preview/reports/`，
  **2.5D 当前基线是 1000 局 49.9/50.1（不再是 74.8/25.2）**；3D 仍需单独登记，见 §9。
- 验收：`--b6test` 6/0；全 18 项 3D 门禁 + `3d:lines:check` + `3d:port:check` +
  `3d:events:check` 全绿。

---

## 6. 禁止清单

- ❌ 在 S 轨开工前，不把 `js/data/lines.js`、`startChatter`、`playerTalk`、`buildMeetCtx` 的发言分支搬进 GDScript；先定 schema 与接口。
- ❌ 不在 GDScript 里写 `2` / `1` / `45` / `75` 这类规则数；只查 `sim.json`。
- ❌ 不用 3D 物理当规则权威；网格才是。
- ❌ 不因为“3D 能跑了”就删 2.5D 或改 `index.html`（ADR-0002 仍然有效）。
- ❌ 不在 B2 之前做异形 AI；它会把寻路/视野/尸体的债一次堆起来。

---

## 7. 接手第一小时

```bash
cd "C:/Users/ASUS/Desktop/新返航录"

# 1) 数据契约（改过 sanity/space/map 后必须重跑）
node 3d/tools/export-sim.cjs
npm run 3d:export:map
npm run 3d:export:minigames
npm run 3d:export:space

# 2) 模拟门禁
GODOT="E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe"
"$GODOT" --headless --path 3d/preview -- --simtest     # 期望 26/0
"$GODOT" --headless --path 3d/preview -- --taskflowtest # 期望 ok=true（E → 解题 → 写回进度）
"$GODOT" --headless --path 3d/preview -- --navtest      # 期望 28/0，walkable=5894
"$GODOT" --headless --path 3d/preview -- --aittest      # 300 秒 AI 自跑
"$GODOT" --headless --path 3d/preview -- --meetingtest  # 期望 ok=true
"$GODOT" --headless --path 3d/preview -- --bottest      # 期望 6/0
"$GODOT" --headless --path 3d/preview -- --b4test       # 期望 8/0
"$GODOT" --headless --path 3d/preview -- --hometest     # 期望 6/0
"$GODOT" --headless --path 3d/preview -- --roletest     # 期望 4/0
"$GODOT" --headless --path 3d/preview -- --speechtest    # 期望 11/0
"$GODOT" --headless --path 3d/preview -- --b6test        # 期望 6/0
npm run 3d:export:lines / 3d:lines:check / 3d:export:version
node 3d/tools/simdump.cjs --seed 20261108
"$GODOT" --headless --path 3d/preview -- --simdiff 3d/reports/js-simdump-20261108.json

# 3) 3D 既有门禁
"$GODOT" --headless --path 3d/preview -- --arttest
"$GODOT" --headless --path 3d/preview -- --tasktest
"$GODOT" --headless --path 3d/preview -- --devicetest
"$GODOT" --headless --path 3d/preview -- --mgtest

# 4) 正常游玩（人类视角；11 个 AI 人类也会做任务，4 个异形会刀人/破坏）
"$GODOT" --path 3d/preview --resolution 1280x720 -- --seed 20261108
```

看画面：左上角应出现「第 1 夜 / 全船维修 / 我的任务 / 存活 / 最近事件」；
走到自己的任务设备按 `E`，玩通小游戏后进度 +2 或 +1；靠近尸体按 `E` 报告，
会议面板点名字投票。

---

## 8. 移植准备（2026-11-08 · 本轮只做准备，不动 B2–B6 逻辑）

### 8.1 三个准备件

| 路径 | 性质 | 作用 |
|---|---|---|
| `3d/spec/port-manifest.json` | **人工维护的唯一真源** | 47 个系统逐项登记：源文件/行段、目标、状态、依赖、验收门禁、备注。发言单列 S 轨，美术整类 excluded |
| `3d/tools/check-port-manifest.cjs` | 只读校验器 | ① `js/` 每个文件是否被认领且行覆盖 100%；② `ported/partial` 是否有真实存在的 target；③ 依赖是否存在/成环；④ 数据契约 `schema_version` 与 generator 是否对得上 |
| `3d/spec/events.schema.json` + `3d/tools/check-events.cjs` | 只读校验器 | 冻结事件信封与 31 个 kind；检查 `js/game.js` 的 `logEvent()` 与 `sim_state.gd` 的 `_log()` 是否都在词表里 |

```bash
npm run 3d:port:check
npm run 3d:events:check
```

当前读数（2026-11-08 实跑）：

```
PORT-MANIFEST OK
  系统 47 / 分组 11 / js 22 文件 19765 行
  状态 ported 9 / partial 26 / prepared 0 / reference 4 / excluded 8
  契约 8（stable 7 / legacy 1）
  WARN cover_refs.json 无 schema_version

EVENTS OK
  schema kind 31 / 2.5D 31 / 3D 31（静态全覆盖）

LINES OK
  类别 62 / 模板 1221 行 / WHY 18 类 / 规则 21 张
  发言解析：舱室词 38 / claim 6 类 / 正则 13 组
```

- **ported 7**：地图、席位名、空间数值、自动门、开局状态、胜负、网格/A*。
- **partial 26**：除 ported 外的全部业务系统；其中发言、认知、社交、机器人、设置、
  复盘、音效都已跑通主链路，`partial` 表示仍有待补的编排层（见各系统 notes）。
- **prepared 0**：没有"只列了名、一行代码没写"的系统了。
- **reference 4 / excluded 8**：保留作对照的历史模块 + 美术/DOM/调试层，按裁定不迁。
- **excluded 8**：2.5D 绘制、DOM 模板、场景层、DEV 调试层、入口/加载链、SKV3 绑定、美术素材等。
- **reference 4**：相位时钟、运行时断言、蒙特卡洛、2.5D 门禁——保留作对照，不迁。

**事件信封口径**（这条是准备阶段最有价值的发现）：2.5D 的 `logEvent` 是
`{kind, night, pt(已过秒), t(本夜剩余秒), actor, victim, room, x, y}`，
而且 `Object.assign(defaults, data)` 允许 data 覆盖 kind —— `meeting` 事件实际落盘成
`pre/day/night`。3D 端 `_log()` 已改成同一信封，但 **B5 要用 `meeting + mkind`**，
同 seed diff 时做这条映射；不要复制“data 覆盖 kind”的坑。

### 8.2 准备阶段还没做完的三件事（按优先级）

1. **同 seed 对照夹具**：JS 侧加 `--simdump <seed>`（只跑 AI 对 AI，输出事件 JSON），
   Godot 侧加 `--simdiff <file>`；两边同 seed、同 dt、同 maxNights，diff 首个分歧点。
   这是 B2–B5 唯一可靠的行为护栏，**建议在 B2 动工前完成**。
2. **发言 S 轨的 `lines.json` schema**：台词分类、占位符、去重键、hot/cold 档、许可字段。
   2.5D 第 5/6 批（完整证言 + 语言对称）已于 2026-11-08 收口（899/0），
   数据源已稳定；3D 侧仍只在清单里留了 `planned:3d/preview/data/lines.json`，没有生成。
3. **`cover_refs.json` 补 `schema_version`**：唯一的 legacy 契约；不影响 B2，但应在下一次
   改掩体尺寸时顺手补。

### 8.3 使用方式（避免清单变成 PPT）

- 开工一个批次前：先在 `port-manifest.json` 里找到对应系统，确认 `depends_on` 都已是 ported；
- 只改 `status` 为 `partial` 当且仅当有一个**可重跑的门禁**证明它在 3D 里跑起来了；
- 批次结束：`npm run 3d:port:check` 必须 0 错误；新增源文件必须被某个系统认领，否则直接失败；
- 发言轨（S）开工时，把 `D-LINES` / `S-SPEECH` 从 `prepared` 改成 `partial`，并补
  `lines.json` 契约；在那之前不要在 B2–B5 里写任何角色台词。

### 8.4 本轮明确没做

- 没有移植 B2–B6 的任何逻辑（网格/AI/战斗/机器人/会议/复盘）。
- 没有新增美术、没有改 2.5D、没有替换 2.5D。
- 准备阶段本身没有改 `js/`；随后按用户指令完成 2.5D 第 5/6 批（人类完整证言 + 语言对称），
  `npm test` **899/0**、`lines-audit --strict` **1457/0**。3D 侧没有开始 S 轨。


---

## 9. 平衡对齐（2026-11-08 · 用户质疑 3D 基线）

> 用户：「3D 基线不应该呀，原来的 2.5D 1000 局，已经接近对半开的胜率」。
> 复核：2.5D 重跑 1000 局（seed 20261030）= **49.9% / 50.1% / 超时 0**；
> 3D 当时的 200 局 = **79.0% / 17.5% / 超时 7**。用户是对的，这不是"两套实现
> 不可比"，是 3D 的规则漂移。

### 9.1 诊断链路（可复跑）

```bash
npm run sim                                   # 2.5D 1000 局 → tools/mc-report.md
"$GODOT" --headless --path 3d/preview -- --sim1000 --games 200
```

`--sim1000` 现在输出败因分布、驱逐命中率、存活人数、异形决策拦截计数。
修复前 50 局：**异形全部出局 33 局**、驱逐 204 次（异形 165 / 人类 39），
场均 4.08 次驱逐；2.5D 历史读数是场均 2.9 次驱逐、异形 2.33 次。
结论：**3D 每会必逐，异形撑不到第 4 夜**。

### 9.2 修正的真源项（全部读已导出的数据，不在 GDScript 抄数值）

| 项 | 3D 漂移 | 2.5D 真源 |
|---|---|---|
| 驱逐 | 简单多数 + 平票随机 | 唯一最高票且 ≥ `VOTE.need/lateNeed` |
| 报告 | 不限 | `MEET.reportsPerAgent=2`（全局） |
| 票权 | 人人必投、综合分取最高 | `known/almost/accuse/suspect` + 假说竞争弃权 + 跟票 |
| 发言 | 只进发言流 | 公开点名写回 `accuse`，开会清空 |
| 异形理智 | 25~35 秒冷却 + 目击>0 七成收手 | `KNIFE` 三条硬线 + `boldBase±boldSpan` |
| 目击者 | 全员都算 | 排除 `doing>0`（注意力不在线） |
| 枪声 | 20 格内一律 +1 嫌疑 | 7 格 + LOS 才算目击 |
| 批量模拟 | 0 号空置 | 15 人全 AI 对 AI |
| 人类开枪 | 只有玩家 | AI 按 `SHOT.chaseKnown/chaseSus` 反制 |

### 9.3 仍不能对齐的部分（诚实口径）

> **2026-11-09 第七批核实更正**：下面两条是 11-08 的历史诊断，**与当前代码不符**，
> 保留仅为留痕。逐条读码核实结果见 `3d/PORT-DIFF-AUDIT.md`：
> - 白天 / 开局会议（`_after_meeting` 的 `MEET_PRE`/`MEET_DAY`）、紧急按钮
>   （`open_meeting_kind`）、`settleAccountability`（`sim_state.gd:1613`）**均已接入**；
> - RUSH 逃逸（`_kill_rush_start` / `rushT`）、目标承诺（`ai_alien.gd:290`）、
>   管道突袭（`ai_alien.gd:60`）、异形开枪（`ai_alien.gd:338`）、构陷编排
>   （`speech.gd:106/191/318/321`）**均已接入**；
> - 因此「不启用每夜 1 把刀额度」的前提已不成立，第七批按 `js/game.js:4225/4232/7801`
>   **恢复硬 gate**；26 夜观察窗口也按 `js/game.js:11054-11058` 拨回 15 夜 / 17250 tick。
> 当前真实缺口：`PORT-DIFF-AUDIT.md` §3/§6（讨论期改票时序、`buildMeetCtx`/`remainMs`、
> `lightState` 三态、`startNight` 逐人重置、中文席位解析、追猎分支）。

- **会议链**：白天 / 开局会议（`MEET.discussDay 60 / discussPre 50`）、紧急按钮、
  `settleAccountability` 身份公布追责未迁 → 残局收尾慢，需要更长观察窗口，
  且误逐率仍高于 2.5D（3D ~36% / 2.5D ~20%）。【历史诊断，已失实】
- **异形进攻链**：RUSH 逃逸、目标承诺、管道突袭、异形开枪（`SHOT.alienFireP 0.7`）、
  构陷编排未迁 → 因此**暂不启用 2.5D 的"每夜 1 把刀"额度**（只搬限制会 0 胜）。【历史诊断，已失实】
- 这两组在 `port-manifest.json` 里是 `partial`，不是"完成"。
- **判定改动会挪动随机流**：不同配置的小样本对比不是严格 A/B；正式基线只认
  同一份代码跑满 200/1000 局的报告，不拿 20~50 局的数字调参。
- 修复后读数：200 局（报告已随 2026-11-09 清理移除）人类 36.5% / 异形 61.0% / 超时 5 局（2.5%）。


---

## 10. 同源契约（2026-11-08 用户「其他均无差异」· 2026-11-09 用户「3D 是 2.5D 的延伸」）

> **这一章是 3D 目录的最高约束**，优先级高于 `3d/` 下任何实现说明、README 与 CHANGELOG。
> 与本章冲突的写法一律按本章改；改不动就先停下来问，不要"先实现再补文档"。
> 红线条款同步写在 `AGENTS.md` §一.11，决定记录见 `3d/DECISIONS.md` ADR-0011。

### 10.1 允许差异（只有这三处）

> **总则（2026-11-09 用户裁定，红线级）**
> **3D 版是 2.5D 版的延伸，不是第二条产品线。** 除**按键操作（玩家输入映射）**、
> **维度**、**部分美术素材**三处外，其他都是 2.5D 版的**移植**。
> **如无必要，不要擅自往 3D 版里面加 2D 版没有的东西。**
>
> 判定口径：动 3D 之前先问「2.5D 里这条在哪」。
> ① 找得到 → 照抄语义，数值读 `rules.json`；
> ② 找不到且属真·维度产物（A* 网格 / 第一人称相机 / 碰撞 / LOD / 遮挡剔除）→ 记进
> `parity-map.json#allowed_differences` 并写「为什么 2.5D 不需要」；
> ③ 找不到且不属于维度产物（新状态、新计数器、新阈值、新系统）→ **先改 2.5D 真源**，
> 再导出/移植，不许只加在 3D。
> 违反 ③ 的典型症状：3D 里多出一套「只有 3D 才有的」嫌疑/信誉/节奏变量，
> 跑分和 2.5D 越差越远，却查不到是哪条规则不一样。

| 类别 | 2.5D | 3D |
|---|---|---|
| 维度 | Canvas 2D 俯视 / DOM UI | Godot 4.6 3D 第一人称 / 网格 A* / LOS 几何 |
| 美术 | `assets/scene/**` 底图与贴图 | 代理几何 / Blender 道具 / 3D 光照 |
| 玩家输入 | 键鼠点击、轮盘 | WASD + 鼠标视角、左键出刀 / 右键开枪 / E 交互 |

**AI 端不在此列**：推理、发言、投票、任务、战斗、会议判定一律同源。
**新功能默认先落 2.5D**：只有在 2.5D 里成立、能跑出基线的机制，才允许出现在 3D 里。

### 10.2 真源链

```
js/ai/sanity.js  js/ai/traits.js  js/t2/ai.js  js/t2/decision.js  js/game.js  js/data/lines.js
        │ export-rules.cjs                         │ export-lines.cjs
        ▼                                          ▼
  data/rules.json（48 张表 / 70 函数指纹 /         data/lines.json（62 类台词 /
  发言调度系数 / 源码 SHA）                        词表 / parseSpeech 正则）
        │                                          │
        └──────────── rules_data.gd ───────────────┘
                          │
        mind.gd / speech.gd / sim_state.gd / ai_human.gd / ai_alien.gd
```

- `export-rules.cjs` 对每个 2.5D 纯函数留**源码 SHA + 数值字面量清单**；
  2.5D 改任何阈值而不重导，`check-parity.cjs` 立刻 FAIL。
- `check-parity.cjs` 还交叉校验 `lines.json#rules` 21 张表与 `rules.json` 一致，
  并扫描 3D 推理/发言脚本，拦住自造阈值。
- `spec/parity-map.json` 对 70 个函数逐项对账：**63 synced / 7 adapter / 0 pending**，
  coverage 100%，pending 不伪装成完成。

### 10.3 本轮同步进去的内容

- `rules_data.gd`：GDScript 不再写死推理/发言阈值；`mind.gd#rule` / `speech.gd#_r` 全改读 `rules.json`。
- `speech.gd`：talkScore 8 项系数、combo 概率、整局降权 `1/(1+K·n)`、重挑次数、
  连说上限、连说让位，全部读 `dispatch`；删掉 3D 自造的「同模板最多 2 次」与三处随机分类比例，
  改回 2.5D 的证据驱动固定分支。
- `mind.gd`：数据结构与 2.5D 对齐（`known` 只来自亲眼确证、`why` 改为目标→证据数组、
  `almost={foe,friend}`、性格轴读 `SKTrait`）；补齐 `hypotheses / hypothesisSpread /
  hypothesisEvidence / publicHeat / publicInfluence / pubAccusers / evalAlmost /
  bestSusTarget / bestKnownTarget / bestAlmostTarget / evidenceReason` 等函数。
- `sim_state.gd`：票权层级、假说竞争弃权、跟票全部走 `mind` 的 2.5D 等价函数；
  删除 `suspect` 计数字典这套第二份嫌疑数据。

### 10.4 本轮（2026-11-08 晚 · v1-preview 批）新同步进去的内容

**纯函数对账清零**：`parity-map.json` 从 38 synced / 25 pending → **63 synced / 7 adapter / 0 pending**。
25 个 pending 全部落到 `mind.gd#2.5D 纯函数区`（逐函数对照 `js/ai/sanity.js` / `js/t2/ai.js`，
数值全部读 rules.json）：witnessWeight / escapeCost / exposure / trustEndorseAt / trustObeyGate /
alibiTimeWord / reliaMul / beliefEntropy / disguiseScore / disguiseRisk / credVoteShield /
credTestimony / alibiReach / crimeWindow / evNow / susCut / claimWindow / susAddContradiction /
oldQuantifierWouldFire / knownOverride / affordableAlmostShot / envEstimate / audSusEstimate /
sequenceCue / statementRelation。

**结构对齐**（此前是漂移，本轮修正）：

| 项 | 3D 旧漂移 | 2.5D 真源 |
|---|---|---|
| cred / reliability | 标量 | **按目标索引的字典**（credOf(a,i) / reliaAdd 相对某人） |
| susAdd | 平铺 +2.0 封顶 | 递减增益 `w×(1-old×0.55)`、封顶 1.0、记 susNight + rev |
| susOf 夜读 | 无 | 跨夜存量 ×CARRY.nightReadSec(0.7) |
| reset_night | 每夜清空 cred/relia/known | sus 分类型衰减 / cred 慢衰减 / relia 回归 / **known 长期保留** |
| note_sight | 亮房人人写 known | CONFIRM.nearR 4.5 格内才确证 + MISID 20% 认错 + knownOverride |
| 出刀理智 | Σ权重÷cap(3) 近似 | exposure 纯函数 ÷2 + escapeCost(最近门距) + 光感半径 sightRangeAt |
| 目击者口径 | busy 的人也计数 | watchersAt/exposureAt **完全排除** attention≠online（crowd 例外） |
| 枪击目击 | 听证 heard_shot | noticeAction 目击 saw_shot(0.55) + 红身 saw_red(0.85) |

**行为链迁移**：

- 白天/开局会议：`pre`（开局讨论 50 秒不投票）/ `day`（天亮全员会 60+5 秒，全员回会议室、
  打断任务）/ `night`（报告 35+5 秒）三相位全接 —— 3D 场均会议 3.0 → 5.3 场。
- `settleAccountability` 追责：投对 +cred、投错 −cred/−relia、带头记 wrong_accuse 嫌疑。
- `credBroadcast` 信誉广播：修故障/拖救/做任务 → 目击人类 +cred、异形目击者等值敌对分。
- RUSH 逃逸（放倒后 ×1.5 加速 2 秒，拖尸不加速）、异形开枪（SHOT.alienFireP 0.7）、
  异形补给链（领申请单 → 换子弹 → 翻尸）。
- 红身（RED_BODY 1.5 秒）+ seenBy 追踪（0.5 秒节流 trackNight）。

**2026-11-09 批（构陷 / 领袖 / 位移链）新同步进去的内容**：

- **构陷编排** `planAlienDeception` / `planMateBus`：`FRAME.chance` 假口供、`COFRAME` 附议、
  `SOCIAL.hotMin` 顺势往"正被咬的人"身上泼、反咬（被确证时 0.65 反指确证者）。
- **先发制人** `planFirstAccuse`：`FIRST.chance` 每场会一掷，`saw_red 0.7 / saw_pipe 0.3`，
  只进传闻嫌疑 `FIRST.wgt`，绝不写 `known`。
  **顺序按真源**（js/game.js:5077 → 5098+）：**先**先发制人定调并打 `accuseWhy.opening`，
  **再**算构陷/反咬，且构陷跳过已 opening 的异形。本轮之前的写法是反的
  （构陷在前、opening 无标记），同一只异形会在一场会里被二次改写口供 —— 已修。
- **领袖剧本** `leader_charisma` + `schedule_leader_orders`（pre/day/night 都排）、
  追随者服从/拒绝、`push_endorse` 公开背书、`decide_human_defend` 互相辩护。
- **位移/进攻链**：目标承诺（`HUNT.memorySec` 粘性，不因别人更近就换目标）、
  管道突袭（`PIPE`：目标 >15 格且省 ≥5 格才走，进出管道口 6 格目击写 `saw_pipe`）、
  拖尸藏尸（`_hide_room`）、拆医疗无人机、异形误导报告（每异形 1 次 / 20%）。
- **人类侧**：`_flee_from`（`taskThreat` / `fleeTask`）、把尸体拖进医疗间、合闸指派、
  尸体扫描 / 搜尸、服从或拒绝领袖指令。

**仍未同源**（记入 `parity-map.json#summary.pending_next_batch`）：
白天会议里的改票 / 早投 / 假设层弃权的完整对齐（`VOTE` 的 change 分支）、
`planMateBus` 的 `MISLEAD.bus` 细节、`COFRAME` 附议名额与站位的完整口径。
这些系数已在 rules.json 指纹锁定，补实现不会漂移。

### 10.5 基线（v1-preview 批）

**同 seed 起跑（20261108+g）的四批读数并排**：

| 指标 | 2.5D（120 局） | 3D 100 局（未含构陷/DESC） | 3D 40 局（全量） | 3D 20 局（修顺序后） |
|---|---:|---:|---:|---:|
| 人类胜率 | 47.5% | 68.0% | 20.0% | 20.0% |
| 平均夜 | 4.72 | 3.18 | 6.63 | 5.45 |
| 会议/局 | 10.1 | 5.3 | 9.4 | 8.3 |
| 出刀/局 | 9.1 | 6.1 | 6.7 | 7.3 |
| 刀/夜 | 1.93 | 1.9 | 1.0 | 1.34 |
| 驱逐/局 | 4.73 | 3.9 | 6.5 | 6.0 |
| 人类被逐/局 | 2.88 | 1.79 | 4.70 | 4.15 |
| 驱逐命中率 | 39% | 54.1% | 28.0% | 30.8% |
| 进度/局 | 18.1 | 39.0 | 31.2 | 29.2 |
| 救起/局 | 3.75 | 1.65 | 1.53 | 1.50 |
| `block_cap`/局 | — | 12.6 | 89.8 | 60.5 |

报告：100 / 40 / 20 局小样本（原始报告已随 2026-11-09 清理移除，读数见上表）。

**读数说明（不粉饰）**：

- 构陷/领袖/位移链接上后，胜率从 68% 掉到 20%，**这一批是对的机制、错的平衡**。
  构陷量本身与 2.5D 同源（`FRAME.chance 0.85` × 8.3 场 ≈ 7 次/局，2.5D 是 0.85 × 10.1），
  所以不是"构陷太频繁"，而是**人类手里的反证不够**：3D 的 `known`（确证）写入远少于 2.5D，
  被泼脏水时没有硬证据顶回去 —— 指控质量从 54.1% 掉到 30.8%，同时驱逐量从 3.9 涨到 6.0。
  下一个要查的是 `note_sight` → `CONFIRM.nearR` 这条链在 3D 的 LOS 下到底写了多少条 known。
- **救起是长期缺口**：2.5D 医疗无人机 3.34 次/局（93% 的局至少救一次），3D 只有 1.5 次/局
  （含医疗包）。这条与构陷无关，100 局批就是 1.65 —— 单独一项就能解释 2.5D 与 3D 的存活差。
- **出刀被拦得太多**：`block_cap` 12.6 → 60.5/局，刀/夜 1.9 → 1.34。异形每夜有大量决策
  卡在"目击者 ≥3 / 隐蔽不足"，游戏被拖长到 5.45 夜（2.5D 4.72），会议跟着涨。
- 20 局批把「先发制人 → 构陷」的顺序修回真源（`accuseWhy.opening` 生效、构陷跳过已 opening 的
  异形），`block_cap` 从 89.8 降到 60.5、命中率 28.0% → 30.8%，但胜率没动 —— 说明瓶颈不在这条。

### 10.5.1 下一批的优先级（按证据强度）

> **2026-11-09 第五批更新**：下面第 2 条的代码链已按 2.5D 补齐
> （`3d/CHANGELOG.md` 第五批：每夜电量 / 7 秒读条 / 只救医疗间 / 拖救 AI / start_drag 允许濒死者 /
> AI 抵达医疗间放下），**但行为未闭环**：同 seed 20 局救起仍 1 次（2.5D ≈67），
> 需先加埋点量化触发率，不能标为已解决。整体胜率因每夜状态复位从 20.0% 升到 35.0%。
> 本节保留为历史诊断记录。**第六批事实登记**：`ai_can_see` 已按 `js/game.js:1784
> observerVisionAt` 正向移植（同亮区 / 手电锥 / 朝向 / 相连走廊 LOS），上述「口径差」已消除；
> 该批未采新平衡读数，第 1、3 条的现况未重新观测。改动依据是 2.5D 真源，不是本节读数。

1. `known` 写入量对账：2.5D 2.66 条/局，3D 待测；若远低，查 `ai_can_see` 的 LOS 与
   `CONFIRM.nearR` 在 3D 网格上的实际命中率，而不是调数值。
2. 医疗无人机救起链：2.5D 3.34/局 vs 3D 1.5/局，先看无人机是不是开局就被拆 / 走不到尸体旁。
3. `block_cap`：60.5/局仍高 5 倍，查 `doing>0`（attention=ui）在 3D 的覆盖率 ——
   2.5D 里人类几乎一直在做事，3D 里如果大量时间在走位，目击者表就会长期非空。

### 10.6 命令

```bash
npm run 3d:export:rules      # 改了 js/ 之后必须重跑
npm run 3d:parity:check      # 真源 / 双份表 / 对账覆盖 / 3D 硬编码
npm run 3d:lines:check       # 语料逐字校验
```

### 10.7 自动移植审计与 parseSpeech POC（2026-11-11）

**结论先说**：当前仍是「数据自动导出 + 行为人工移植 + 门禁对账」，不是自动移植。
`3d/reports/portability-audit.md` 把 22 个 JS 文件分成五层：

| 层 | 文件 / 行数 | 能否自动 |
|---|---|---|
| 数据表 / 配置 | 5 文件 / 2265 行 | 已由 `export-*.cjs` 自动导出 |
| 纯逻辑 | 7 文件 / 2631 行 | 可做 IR + codegen；当前未做 |
| 逻辑 + 定时器适配 | `t2/decision.js` 206 行 | 拆掉 `meetLater` 后才能生成 |
| DOM/Canvas UI | 7 文件 / 2716 行 | 必须改共享 UI spec + 双 renderer |
| 运行时 DOM 编排 | `js/game.js` 11917 行 / 438 DOM 引用 | 必须上游拆 core，不能直接翻译 |

**POC（`npm run 3d:poc:speech`）**：

- 2.5D `parseSpeech` 生成 **503 条** fixtures（名称重叠 / 死亡席位 / 补零与中文席位 /
  六类 claim / 否定 / 支持 / 投票 / 否认 / 时段 / 截断 / 300 条确定性 fuzz）；
- Godot 同时跑运行时手写解析器与 POC 生成解析器，当前 **runtime 503/503 /
  generated 503/503**；
- 修复前实测 **90/503 不一致**，暴露并修正了 3D 的 5 个真实偏差：死亡席位被过滤、
  裸补零席位不识别、玩家自己席位未排除、`12号` 子串误命中 `2号`、全文被截到 80 字再解析；
- **边界**：生成器只自动生成词表/正则，控制流是固定算法模板；它不是通用
  JS→GDScript 转译器。真正的行为自动移植需要先把上游拆成 DOM-free core（A/B 层），
  再做 IR 驱动的 codegen；UI 需要共享 UI spec。

**下一步顺序**（未立项，待用户裁定）：扩纯函数 fixtures（`claimWindow` / `seatIndex` /
`treat*`）→ 上游拆会议/报告/投票状态机 → UI spec 先迁会议面板 → 生成物入门禁。

### 10.8 game.js core/UI 审计 + 会议面板 UI spec（2026-11-11 · 第 23 批）

**函数级审计**（`npm run 3d:audit:coreui` → `3d/reports/core-ui-audit.md`）：

| 层 | 函数 | 行数 |
|---|---:|---:|
| core-state（依赖 G / sink） | 196 | 7206 |
| ui（直接 DOM/Canvas） | 47 | 1734 |
| pure（无 DOM / 无 G） | 96 | 1028 |
| adapter（定时器） | 1 | 7 |

混用 DOM + G 的函数 **39 个**；最重的是 `startVote`（202 行 / 13 DOM / 75 state）、
`update`、`syncHud`、`openMeeting`、`closeVote`、`say`。这说明 `game.js` 不能整体翻译，
必须先把 sink（say/logEvent/toast/SND）与时钟注入，再逐个拆 `decide*` / `render*`。

**UI spec**（`3d/spec/ui/meeting-panel.spec.json`）：

- 17 个元素 / 11 个模板 / 3 个状态（discuss / vote / readonly）/ 6 个事件；
- `npm run 3d:ui:check`（已并入 `npm run check`）同时校验 2.5D DOM 与 3D Control：
  17/17 元素、11/11 模板、handler 均存在；
- `npm run 3d:poc:ui` 从同一份 spec 生成 Godot Control POC，验证 17 节点 / 11 模板 /
  3 状态可见性，实测 **7/0**；
- **边界**：POC 不生成业务 handler、不替换 `main.gd`；2.5D DOM 仍是 spec 来源。
  下一步是让 2.5D 也消费 spec（DOM renderer），再逐屏替换 3D 手写 Control。
