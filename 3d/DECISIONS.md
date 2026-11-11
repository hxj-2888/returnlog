# 3D 子项目 ADR

> 只记录**会影响后续实现**的决定。每个决定写清：背景、选择、代价、什么时候可以推翻。

## ADR-0001 · 引擎选 Godot 4.6 stable

- 日期：2026-11-03
- 状态：已采纳
- 背景：机器上有 Blender / SDXL，Godot 只装了 `godot-mcp` 插件、没有编辑器本体。
- 决定：下载 **Godot 4.6 stable 便携版**到 `E:\ai-tools\godot`，项目固定该版本；
  Blender 5.2.2 只做资产管线。
- 代价：需要自己维护便携版路径；Godot 版本升级要重新跑一遍预演自测。
- 推翻条件：如果 3D 端需要大量复用现有 JS 逻辑、且不想重写模拟核心，
  可以重新评估 Three.js；但那时也要接受浏览器/DOM 的长期成本。

## ADR-0002 · 3D 是独立子项目，不挂进 `index.html`

- 日期：2026-11-03
- 状态：已采纳（**2026-11-09 由 ADR-0011 限定**：这里说的是**工程边界**——不挂进 `index.html`、
  不读 DOM、数据显式导出；它**不再**意味着 3D 可以自己长产品内容。产品上 3D 是 2.5D 的延伸。）
- 背景：主项目是零依赖、`file://` 可玩的 2.5D 页面；Godot 工程无法也不应该走同一条加载链。
- 决定：`3d/` 独立；主项目 `index.html` 不引用 3D 脚本；3D 不读主项目 DOM。
- 代价：两个项目要各自跑测试；数据需要显式导出。
- 推翻条件：不做推翻。若未来合并，只能通过“数据契约”合并，不能互相 `<script>` 引用。

## ADR-0003 · 预演尺度 1 格 = 1 米

- 日期：2026-11-03
- 状态：已采纳（预演级）
- 背景：2.5D 是 56px/格；3D 需要一个人能理解的世界尺度。
- 决定：1 格 = 1 米；墙高 3 米；天花板 3.2 米；玩家 4.2 米/秒。
- 代价：42×16 格的会议室在 3D 里非常空，需要家具/灯带填充。
- 推翻条件：正式版如果觉得空间过大，改**全局尺度常量**，不要逐房间改坐标。

## ADR-0004 · 地图数据只走 JSON 导出

- 日期：2026-11-03
- 状态：已采纳
- 背景：`js/data/map.js` 是 IIFE + `window.SKMapData`，Godot 不能直接执行。
- 决定：`3d/tools/export-map.cjs` 是唯一跨项目入口；输出 `3d/preview/data/map.json`。
- 代价：改地图后必须重新导出；JSON 可能落后于源文件。
- 推翻条件：如果将来把地图迁到独立 `.json` 源，导出脚本可以退役。

## ADR-0005 · 角色先用 billboard，不立刻做 3D 模型

- 日期：2026-11-03
- 状态：已采纳（预演级）
- 背景：现有角色是 4×5 帧、96×160/帧的 2D sheet；做 15 个 3D 角色成本很高。
- 决定：预演用 `Sprite3D` + `AtlasTexture` 第一帧，验证比例、可读性、遮挡。
- 代价：近距离会明显“纸片”；转身/阴影/遮挡都要另做。
- 推翻条件：如果玩家 3 米内经常看角色，必须换低模或做多角度 billboard。

## ADR-0006 · Qwen-Image 选 Q3_K_S，放在 E 盘

- 日期：2026-11-03
- 状态：已采纳（下载/试用级）
- 背景：RTX 5060 Laptop 8GB VRAM、16GB RAM；Qwen-Image 是 20B 模型。
  HF 直连 / `hf-mirror.com` 在本机被限速；**ModelScope 有同哈希镜像**（8 路约 5MB/s）。
  社区 GGUF 有 Q2_K ~7.06GB / Q3_K_S ~8.95GB / Q4_K_M ~13.07GB。
- 决定：下载 `city96/Qwen-Image-gguf` 的 **Q3_K_S**（8.95GB），配
  `Comfy-Org/Qwen-Image_ComfyUI` 的 fp8 文本编码器（9.38GB）与 VAE（0.25GB），
  放到 `E:\ai-models\qwen-image`。
- 代价：Q3 有质量损失；8GB 显存仍可能需要 offload，速度未必适合日常出图。
- 推翻条件：如果实测太慢/OOM，降到 Q2_K 或改用 SDXL；如果换 24GB 显卡，升 Q4_K_M。
- 2026-11-03 补记：**Qwen-Image 2.1** 有社区 GGUF（7B 视觉组件，Turbo Q4_K_M 4.20GB +
  Qwen3-VL UD-Q4_K_XL 5.15GB + VAE 0.68GB ≈ 10.02GB），更适合 8GB 显存；
  但 2.1 是 **Qwen Research License（仅研究/评估，商用需授权）**，1.0 才是 Apache-2.0。
- 2026-11-03 晚用户确认：**个人游戏、不发行、代码 MIT** ⇒ 2.1 研究许可可用于内部评估。
  已实际下载并跑通：512 43.08s / 768 角色 87.42s / 1024 501.50s，显存约 5.3GB。
  1.0 下载暂停并保留已下部分，作为将来可能的 Apache-2.0 生产路径。

## ADR-0007 · map.json schema v2：美术主题色与实例变体由导出器复算

- 日期：2026-11-06
- 状态：已采纳
- 背景：3D 场景"重复性太高"——10 间舱共用一套墙面材质、59 件家具同 kind 就是克隆体。
  而 2.5D 底图本来不重复，因为 `tools/blender-ship.py` 有 `ROOM_THEME`（每间房 wall/top/glow/gs/mark）
  与 `variant()`（`room|label|kind` 的 FNV-1a 哈希派生 色调档 / LED / 高度 ±10% / 子部件开关）。
  这两张表只存在于 Python 里，Godot 读不到。
- 决定：`3d/tools/export-map.cjs` 解析 `ROOM_THEME / TINT_SHIFTS / LED_KEYS` 三张表
  （解析不到就报错退出），并复算 `fnv1a32 + variant()`，把结果写进
  `rooms[].theme` / `cover[].v` / `decor[].v`；`map.json` 的 `schema_version` 1 → **2**。
  GDScript 只读结果，**不实现第二份配方**。
- 关键约束：哈希必须与烘焙端**逐位一致**，否则 3D 里那件家具和底图上那件不是同一档变体。
  实测踩到 JS `>>` 是有符号 int32 移位（哈希 ≥2³¹ 翻负），一度让 27/59 件 `hz` 落到假区间；
  全部改 `>>>` 后用 `C:\Python314\python.exe` 跑原实现对账，91 件 × 4 字段 **0 处不符**。
  这条对账要随 `--arttest` 常驻，改哈希或改表都要重跑。
- 代价：导出器多解析一个 Python 文件（正则，非 import，不依赖 bpy）；烘焙端改表名或写法会**报错停下**，
  需要人来同步 —— 这是刻意的，静默兜底正是 COVER_HEIGHT 事故的成因。
- 推翻条件：若将来 `ROOM_THEME` / 变体配方迁进 `js/data/map.js`（成为 JS 侧真源），
  导出器就可以直接读，不必再解析 Python；那时 schema 再升一版。

## ADR-0008 · 空间数值走 space.json，散落数值用具名正则抠

- 日期：2026-11-06
- 状态：已采纳
- 背景：3D 要接门、电闸、管道、站桩时长。这些数在 2.5D 分三处：
  `js/ai/sanity.js`（纯表）、`js/t2/space.js`（纯常量）、`js/game.js`（散在函数里，
  如 `breakerOnTime(){return G.powerFixed?3:4.5}`、`BREAKER_USE_R=2.0`、圆桌 `2.3`、门 `scanT<2`）。
  在 GDScript 里手抄 = 第二个真源。
- 决定：`3d/tools/export-space.cjs` 同时读三处 —— 前两个用 `new Function('window', src)` eval
  （与 `tools/monte-carlo.cjs` 读配置快照同口径），第三个用**具名正则**逐项抠；
  任何一项取不到就抛错退出，产出 `3d/preview/data/space.json`（带三源 SHA1）。
- 代价：`js/game.js` 里那几个数还没有表，正则对写法敏感 —— 改写法会报错，需要回来登记。
  这是**故意的**：宁可构建失败，也不要 3D 拿默认值跑出对不上的手感。
- 推翻条件：若这些数被提进 `SKSanity`（本来就该在表里），正则分支即可删除，
  `space.json` 的 `breaker/door/stand` 改由表直接生成。

## ADR-0009 · 全船掩体重构：方案层先行，七条裁定固化为可校验规则

- 日期：2026-11-06
- 状态：已采纳；**2026-11-06 19:39 用户放行后已落地 2.5D**（`js/data/map.js` 59 → 127，门禁 838/0、1000 局持平，见根 `CHANGELOG.md`）
- 背景：`tools/ship-layout-overview.html` 的「现状 + 3 间预案」只覆盖仓库 / 娱乐室 / 军械库，
  且娱乐室机型散点分布、医疗间等舱室偏空；用户提出七条意见：门厅不挡不贴门、
  空舱继续填充、SDXL 生图 + Blender 渲染工作流、重构掩体分布、墙饰须合风格、
  跨舱室不复用素材、排布别杂乱（同类聚组 + 层次感 + 参考现实建筑设计）。
- 决定：
  1. 新建 `tools/ship-layout-spec.cjs`（人工真源）→ `ship-layout-build.cjs`（自动避让）
     → `ship-layout-plan.json`（数据）→ `ship-layout-overview.html`（可视化），
     配 `ship-layout-check.cjs` 独立校验；**82 项断言 / 82 通过 / 0 失败**。
  2. 七条意见量化为 R1–R8：门厅净空 ±2.2×3.2 格、主通道宽 2.4 格、
     占用率 18–30%、任务点 2.5 格内有道具、每舱 ≤4 分区 / 每区主类 ≤2 /
     同类不跨区 / 三档层次 / 成组率 ≥0.65、素材全房间专属、墙饰 3–5 件且贴墙合风格。
  3. 全 10 间重排：掩体 59 → 127 件、新增 40 件墙饰、平均占用 13.5% → 21.9%；
     医疗间 14.5% → 26.9%，娱乐室改四象限分区。
  4. 初步工作流：`3d/WORKFLOW_SDXL_BLENDER.md` + `3d/tools/room-wall-art.py`
     （plan / sdxl / grade / blender 四阶段，默认 dry-run）。
- 代价：方案与运行时地图暂时分离；`plan.json` 不是 `map.json` 的真源，
  落地时须同步 `js/data/map.js`、重跑门禁与蒙特卡洛（掩体变化影响视线与平衡）。
- 推翻条件：用户明确要「直接改游戏地图」时，把 `plan.json` 的 cover / wall 转成
  `js/data/map.js` 的表并从 spec 生成，取消双份维护；规则数值（净空 / 占用率）如与实际
  观感不符，由用户裁定后改 `RULES` 一处并重跑 build + check，不逐房间改坐标。

## ADR-0010 · MCP 工具链装 F 盘；允许 Blender 活会话写入；场景重构只落场景层

- 日期：2026-11-06（17:34 用户裁定）
- 状态：已采纳并实施
- 背景：ADR-0009 留有「方案层与运行时分离」；开源调研（见原仓
  `docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md`）给出 Blender / Godot 的 MCP 候选。
- 决定：
  1. **安装位置 `F:\AI-MCP\`**：uv 0.13.7（独立 zip）、`mcp-for-blender` 2.2.7
     （`UV_TOOL_DIR` / `UV_CACHE_DIR` / `UV_PYTHON_INSTALL_DIR` 全指向 F 盘）、
     bundled addon 放 `F:\AI-MCP\blender-scripts\addons` 并用 `BLENDER_USER_SCRIPTS` 加载、
     `@coding-solo/godot-mcp` 0.1.1 装 `F:\AI-MCP\godot`。客户端配置
     `~\.workbuddy-ai\mcp.json` 是唯一 C 盘例外（WorkBuddy 约定）。
  2. Godot 选 **Coding-Solo 而非 Godot-MCP-Native**：前者是独立 Node 服务，可完整放 F 盘且
     能用 `GODOT_PATH` 指向 4.6 便携版；Native 插件必须装进 C 盘的 `3d/preview/addons`。
  3. **允许 MCP 在 Blender 对话里写入场景**：不设 `BLENDER_MCP_SAFE_MODE`，
     建模 / 材质 / 渲染 / 保存 / 导出都可用；保留 localhost + 禁用遥测 +
     关闭全部外部资产库与云端 3D 生成。
  4. **场景重构落两层**：① Blender 场景层 `layout-v2.json` + `ship_scene_v2.blend`；
     ② **Godot 主场景接线**（17:51 用户「全权授权」后完成）：`3d/tools/build-map-v2.cjs`
     合成 `map_v2.json`（保留 rooms / walls / points / facility / art，只换
     `cover`=127、`decor`=40），`3d/tools/patch-map-builder.cjs` 幂等把 `MAP_PATH`
     指过去、并入 61 个房间专属 kind 的名义高度、掩体底色改取 `theme.mark`、
     新增 40 件贴墙装饰（取 `theme.glow`）。
     **仍未改** `js/data/map.js`（2.5D 真源）、`map.json`、`main.gd`、`test-v3.cjs`。
  5. 不需要 GLB 坐标转换：GDScript 直读 2.5D 的 (x,y) 落到 Godot 的 (x,z)，
     与既有 `_build_cover()` 完全同口径，走廊 / 玩家 / 任务点不会错位。
- 代价：MCP 客户端点「信任」并重开会话仍需用户操作（`list_installed_plugins` 19:00
  复核仍返回「无连接器」）；`blender -b` 不起 socket；`--e2e` 在 headless 下固有超时
  （旧布局同样 open=false）；2.5D 门禁偶发 1–2 项 AI 投票断言抖动，第三次实跑 **826/0**。
  原「3/26 设备贴地」限制已于 19:00 修掉：`map_builder.gd` 补 23 个 0.55 m 无碰撞
  台座（纯表现层，不进 cover、不占通行），`scene_extras._cover_top()` 兜底对齐 0.57，
  `arttest / devicetest / mgtest` 复跑无回归。
- 推翻条件：若要改 2.5D 运行时地图，需用户单独放行 → `js/data/map.js` 换表 →
  `npm test` 与蒙特卡洛复核（掩体变化影响视线 / 遮挡 / 平衡）→ `export-map.cjs`
  重新导出；~~按 ADR-0002，3D 是独立子产品，不因 2.5D 未改而算未完成。~~
  **2026-11-09 修订（ADR-0011）**：上面这条只对**美术 / 场景几何**成立 —— 3D 的家具与
  掩体布局可以先行走，因为它属于"部分美术素材 + 维度"的允许差异；**判定与行为不允许**：
  新增的规则、状态、阈值必须先落 2.5D。ADR-0002 只保留工程边界含义（不挂 `index.html`）。

## ADR-0011 · 3D 是 2.5D 的延伸：只允许按键 / 维度 / 部分美术三处差异

- 日期：2026-11-09
- 状态：已采纳（红线级，已写入 `AGENTS.md` §一.11 与 `MIGRATION.md` §10.1）
- 背景：构陷/领袖/位移链补齐后，3D 单批冒出多套只有 3D 才有的行为与阈值，
  胜率从 68% 掉到 20%，却查不到究竟哪条规则不一样 —— 根因是"3D 可以自己长东西"
  这条口子一直开着，且 ADR-0002/0010 的"独立子产品"措辞被当成了产品层面的许可。
- 决定（用户原话口径）：
  1. **3D 版是 2.5D 版的延伸**，不是第二条产品线。
  2. 只有**按键操作（玩家输入映射）**、**维度**、**部分美术素材**可以不同；
     其余（判定规则、数值、语料、AI 行为、会议/投票/任务/战斗/结算）全部是**移植**。
  3. **如无必要，不要擅自往 3D 版里面加 2D 版没有的东西。**
  4. 真·维度产物（A* 网格 / 第一人称相机 / 碰撞 / LOD / 遮挡剔除）可以只存在于 3D，
     但必须写进 `3d/spec/parity-map.json#allowed_differences`，并注明"为什么 2.5D 不需要"。
  5. 想加的东西若不属于维度产物 → **先改 2.5D 真源**，再 `npm run 3d:export:*` 导出/移植。
- 代价：3D 侧的"先在 3D 试、试好了再回流"不再允许，每次动 3D 都要先翻 `js/`；
  已有代码要清点一遍：只有 3D 才有的状态/计数器，能落回 2.5D 的落回，落不回的删。
- 推翻条件：用户明确改口；或 3D 要独立成正式产品 —— 那时应另开仓库，
  而不是在 `3d/` 里继续长。


## ADR-0012 · DEV 从「排除」改为「移植」；玩家探针走真实 InputEvent

- 日期：2026-11-10
- 状态：已采纳（用户现场裁定）
- 背景：`port-manifest.json` 的 `S-DEV` 原先把 2.5D 的 DEV 标为 `excluded`，
  理由是「调试 UI，不属于玩家系统」。用户 2026-11-10 现场反馈：作为异形进 3D，
  按 E 打不倒人、也看不出交互做了什么；并要求「DEV 这个开发者选项很有必要」。
- 决定：
  1. `S-DEV` 改为 `partial`：F2 开关、全知卡片栏、无敌（刀 / 枪 / 死亡 / 驱逐 /
     保安抓捕）与玩家探针全部移植；2.5D 的 `SKInvariants` 运行时断言层不迁
     （3D 无对应实现，门禁仍走 `--simtest` 等）。
  2. DEV 的规则语义照 `js/game.js`：先扣刀/子弹再免伤（`:4230-4243`、`:8270-8282`）、
     死亡拦截（`:4287`）、驱逐无效（`:7673-7679`）、保安看不见 DEV 玩家（`:4782`）。
  3. 玩家输入映射允许差异：2.5D 出刀是 `A`（`:7986`），3D 保留左键，并在 E 轮盘
     增加同一个「出刀」动作；E 的选人用 2.5D `stab()` 的「刀程内最近 + 有视线」
     （`:8243-8248`），左键仍走准星并补 `losNow` 同源遮挡判定。
  4. 新增 `--probetest` / `npm run 3d:probe`：用 `Input.parse_input_event` 真按
     E / 1 / 左键 / F2，禁止直接调 sim 或动作函数来冒充玩家输入。
- 代价：3D 多一个 F2 调试面板和 `sim.dev` 标志（只影响玩家受击，不参与 AI 判定）；
  探针必须真实窗口运行（headless 下 `MOUSE_MODE_CAPTURED` 不成立，左键会被
  「先夺回鼠标」分支吃掉，`--mousetest` / `--knifetest` 同一条限制）。
- 推翻条件：用户认为 DEV 不应留在正式包 → 用启动参数或构建开关关掉；
  但不得删除 `--probetest`，它是玩家输入链的回归门禁。


## ADR-0013 · 截图/机位严禁捕获鼠标

- 日期：2026-11-11
- 状态：已采纳（用户现场裁定，强制）
- 背景：自动化截图/自测窗口把系统光标锁进 Godot 窗口，用户无法操作其它窗口；
  根因是 `--shot/--crewshot/--doorshot` 走普通开局路径，`player._ready()` 无条件
  `MOUSE_MODE_CAPTURED`，截图进程又没有释放。
- 决定：
  1. 所有截图/机位参数进入 `_screenshot_mode`：`player.capture_mouse_on_ready=false`，
     `Input.mouse_mode=VISIBLE`，`_input()` 不响应，`_exit_tree()` 再释放；
  2. 截图路径禁止 `CAPTURED` / `warp_mouse` / 任何锁定光标的 API；
  3. `--probetest` / `--mousetest` 是输入链自测，不是截图；若必须 CAPTURED，测完立即恢复
     VISIBLE，并在输出标注 `mouse=CAPTURED`；
  4. 截图运行前确认没有其它 Godot 进程占用鼠标，运行后确认进程退出、光标可见。
- 代价：截图时不能用鼠标转视角；机位改用固定 `Camera3D` / 参数。
- 推翻条件：无。若将来必须用鼠标交互做截图，另开显式输入测试参数并强制释放。
