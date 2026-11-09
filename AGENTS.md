# AGENTS.md — 新返航录 3D 版（独立工程）

> **工程契约**（2026-11-09 · 分离日）。适用对象：本工程根目录 `新返航录 3D 版/` 及其下全部内容。
> 本文件**服从** `3d/ARCHITECTURE.md` 的工程边界声明与根 `README.md` / `SPLIT.md` 的事实口径，不自称数值真源。
>
> **红线保真声明**：下文 §一「红线（违反即回退）」**逐字沿用**原仓 `新返航录/AGENTS.md` §一
> （2026-11-09 工作区版本，共 12 条），**一字未改、一条未删、一条未增**。
> 其中若某条在本工程里不直接适用（如 `file://`、`index.html`、DOM），
> 一律走 §三「适用性映射」解释与落地，**不许回写 §一、不许删红线、不许另起一套宽松口径**。
> §三只是解释层，不能覆盖 §一；两者冲突时以 §一 原文为准并回到上游 2.5D 确认。
>
> **产品口径**：3D 是 2.5D 的**延伸，不是第二条产品线**（§一.11）。
> 本工程把 2.5D 真源以**只读基线**形式随仓带走，目的正是让「改 3D 之前先问 2.5D 里这条在哪」
> 能在本工程内闭环，不需要跨仓猜测，也不允许借「已经独立了」的理由自造规则。
>
> **版本**：3D `V1P-0.1` / `0.1.0`（真源 `3d/version.json`）· 移植基线 `返航录V3.6` / `3.6.0`（只读标识见 `package.json`）。
> **接手顺序**：根 `README.md` → `SPLIT.md` → 本文件 → `3d/README.md` → `3d/HANDOFF.md` → `3d/MIGRATION.md` → `3d/CHANGELOG.md` → 再动代码。
> **分离时刻的现场事实**：玩家除移动外**无法进行任何操作**；门禁有 2 项既有失败。两者均见 §六，本轮只分离、未修复。

## 一、红线（违反即回退）

1. **`file://` 必须可玩。** 禁止 `fetch()`、ES Module（`<script type="module">`）、构建/打包步骤，
   以及任何需要本地服务器才能加载的资源。所有脚本按顺序用经典 `<script>` 加载。
2. **`index.html` 是唯一加载清单。** 新增模块必须按依赖顺序插入，并同步更新 README 的「项目结构」；
   禁止在别处动态注入 `<script>`。当前顺序（与 `index.html` 一致）：
   `config/version → data/map → data/plates → data/names → data/lines → ui/templates → engine/clock → engine/invariants → engine/geo → ai/sanity → ai/traits → t2/space → t2/ai → t2/decision → t2/minigame → game → main → ui/home → ui/replay`。
   **`ai/sanity.js` 必须排在 `ai/traits.js` 之前**：traits 的 `b()` 要读 `SKSanity.TRAIT_GAIN` 做方差压缩，
   `knifeBold / knifeWatcherCap` 也要读理智层的表。
3. **版本单一真源是 `js/config/version.js`（`SKConfig.version = '返航录V3.6'`）。**
   改版本必须同批改 `package.json`（`version` / `gameVersion`）并在 `CHANGELOG.md` 记录；
   界面版本号一律用 `[data-version]` 占位，由脚本填充，禁止散落硬编码。
4. **门禁必须全绿。** 改任何逻辑/数据后跑 `node tools/test-v3.cjs`，失败一律按回归处理；
   报告里必须写本次实跑的「X 通过 / Y 失败」，不得沿用旧读数。
5. **`window.SKV3._t` 调试 API 是门禁契约。** 可以新增方法，但不得删除/改名/改变现有方法语义
   （`state()`、`inv()`、`newGame()`、`kill()`、`tp()`、`openMeeting()`、`events()`、`frames()`、
   `replay()`、`litZone()` 等被 test-v3.cjs 直接依赖）。
   **写夹具时的三条硬规矩**（2026-11-03 各踩过一次，症状都是"断言静默失败、看不出原因"）：
   - `newGame()` 会**整个换掉 G 对象** ⇒ 必须 `t.newGame()` **之后**再 `const g = t.G()`。
     反过来的话后续赋值全打在已被丢弃的旧状态上，会议开不出来、`checkWin` 也不响。
   - `openMeeting()` 不带参数会去找**尸体**；要一场干净的会就写 `t.openMeeting('day')`，
     并且 `startVote() → closeVote() → finishMeeting()` 三步走全，
     少一步就会停在 `discuss` 阶段，`vote` 事件一个都不落（结算页/投票矩阵类断言会因此读 0）。
   - **"把闲人停到某处"必须停在暗舱**（如引擎室 9,52），不要停亮会议室：
     亮区放开后，亮舱里的人能顺着**相连直走廊**看到任意远（亮舱→走廊分支不看距离，只要求 LOS），
     拖尸/出刀/伪装类夹具会因此凭空多出一圈目击者。藏尸夹具就是这样以 2/12 的概率随机失败
     （旧写法停车 30,32），改停暗舱后 0/20。
6. **素材署名不可删。** `assets/scene/cozy`、`assets/scene/rooms` 为 CC-BY 4.0，
   `audio/` 为 CC0；对应的 `LICENSE.txt` / `CREDITS.md` 必须保留，二次分发同样适用。
   `assets/minigame/panel-*.png` 为 Qwen-Image 2.1 生成（Research License **非商用**）。
   **2026-11-09 用户裁定：千问本地模型为唯一出图模型，SDXL 退役。**
   （此前 2026-11-07 的裁定是「SDXL 与千问均可」，现收紧为千问唯一；出图仍须本地生成、
   不调用线上生图。）历史 SDXL 产物保留作风格对照与回退兜底，不再新增 SDXL 出图。
   项目仍为非商用试玩版、不发行，Qwen-Image 2.1 的 Research License
   边界不变 —— 未来发行/商用须换成 Apache-2.0 的 Qwen 1.0 产物或取得商用授权。
   历次裁定见 `assets/minigame/CREDITS.md`；千问出图入口见 §三工具表。
7. **模块边界不许穿透。** 地图数据只放 `js/data/map.js`；几何/寻路只放 `js/engine/geo.js`；
   界面模板只放 `js/ui/templates.js`；图内要素板（小游戏任务面板）只放 `js/data/plates.js`。
   不要在 `game.js` 里复制粘贴这些内容，也不要反向依赖对局状态。
8. **不引运行时第三方依赖。** 游戏必须是 0 依赖静态页面；Node 只用于本地服务器与测试工具。
9. **DOM id 双处同步。** 模板里的 id 在 `js/ui/templates.js` 与 `js/game.js` 都有引用；
   改名必须同批改两处并跑门禁。
10. **中文记录。** 提交信息、文档、注释一律中文；提交格式：`type(scope): 摘要`（feat / fix / docs / chore）。
11. **3D 版是 2.5D 版的延伸，不是第二条产品线。**（2026-11-09 用户裁定）
    除**按键操作（玩家输入映射）**、**维度**、**部分美术素材**这三处外，3D 的一切都是 2.5D 的**移植**：
    判定规则、数值、语料、AI 行为、会议/投票/任务/战斗/结算，一律以 `js/` 为唯一真源。
    **如无必要，不要擅自往 3D 里加 2.5D 没有的东西** —— 新状态、新计数器、新阈值、新系统都算。
    动 3D 之前先问「2.5D 里这条在哪」：
    - 找得到 → 照抄语义，数值读 `rules.json`（由 `js/ai/sanity.js` 等导出），不在 GDScript 里硬编码；
    - 找不到但**确实需要** → 先判断它是不是真·维度产物（A* 网格、第一人称相机、碰撞、LOD 等）；
      是 → 写进 `3d/spec/parity-map.json#allowed_differences` 并写明「为什么 2.5D 不需要」；
      不是 → **先改 2.5D 真源**，再导出/移植，不许只加在 3D。
    落地检查：`npm run 3d:parity:check`（对账覆盖 + 3D 硬编码扫描）+ `3d/MIGRATION.md` §10。
12. **素材优先取自公开网络与开源社区，不自己单独造。**（2026-11-09 用户裁定，四项目统一）
    任何美术 / 音频 / 模型素材，先检索公开素材站与开源社区（Kenney / OpenGameArt / Poly Haven /
    itch.io 免费包 / 公开 wiki 与 ArtStation 参照等），许可合适的直接用；没有合适的才本地生成，
    且**生成前必须先取公开设计参照**（例：军械库参照 SCP:SL 的武器柜 / 挂枪架 / 工作站分类）。
    所有来源必须留痕（URL / 作者 / 许可）进对应 `CREDITS.md` / `LICENSE`，二次分发同样适用。
    本地生成统一走**千问本地模型**（红线 6），SDXL 已退役。

## 二、工程目录职责

| 路径 | 角色 | 可否修改 |
|---|---|---|
| `3d/preview/` | **唯一运行时**：Godot 4.6 工程（`project.godot` / `scenes/` / `scripts/` / `data/` / `assets/`） | 可改（走 §五 流程） |
| `3d/tools/` | 数据导出、资产同步、契约校验（Node / Python / PowerShell，不参与运行时） | 可改（走流程） |
| `3d/spec/` | 契约唯一口径：`parity-map.json` / `port-manifest.json` / `assets.manifest.json` / schema / `conventions.md` | 可改（走流程） |
| `3d/assets/` | 仓库级资产库（模型 / 贴图 / 渲染 / 参照） | 可改，须登记 `3d/ASSETS.md` 与 CREDITS |
| `3d/*.md`、`3d/version.json` | 3D 自己的架构 / 决策 / 迁移 / 交接 / 变更记录 / 版本真源 | 可改（走流程） |
| `js/` | **2.5D 只读基线**：规则 / 数值 / 语料 / AI / 地图的唯一真源镜像，供 `3d/tools/export-*.cjs` 导出、`check-*.cjs` 对账 | **禁止修改** |
| `assets/`、`audio/`、`index.html` | 2.5D 只读基线素材与资料（含 `MANIFEST.json` / `CREDITS.md` / `LICENSE.txt` 署名）；`index.html` 只是 `3d/spec/port-manifest.json` 登记的 `X-ENTRY` 对账对象，**不是 3D 入口** | **禁止修改** |
| `docs/` | **2026-11-09 起移出只读基线**：2.5D 时代的调研 / 交接 / 审查文档已清理（原仓保留），只留 `qwen21/` 千问出图留档（`gen-art-refs.ps1` 的留档目标）；不再参与 `baseline:check` 哈希校验 | 可改（不再属基线） |
| `tools/` | 2.5D 只读基线工具片段（`blender-ship.py` 等）+ 本工程自有的 `sync-baseline.cjs` / `check-all.cjs` | 除这两个新脚本外**禁止修改** |
| `package.json` | 本工程脚本清单；`version` / `gameVersion` 是**上游基线标识**（`3d/tools/export-version.cjs` 依赖），**不是 3D 版本** | 可改 scripts；两个版本字段只由 `baseline:sync` 更新 |
| `BASELINE.sha256.json` | 只读基线哈希清单，由 `sync-baseline.cjs` 生成 | 只由脚本生成 |
| `AGENTS.md`、`README.md`、`SPLIT.md`、`BASELINE.md`、`CHANGELOG.md` | 工程契约 / 说明 / 分离记录 / 基线说明 / 工程级变更 | 按流程追加 |
| `.gitignore` / `.gitattributes` / `.editorconfig` / `LICENSE` | 工程化配置 | 按流程 |

> **为什么根目录仍有 `js/` / `assets/` / `tools/`？**
> 原 3D 工具链、spec 清单、GDScript 注释与全部历史文档都以「仓库根 → `3d/`」两级结构写死路径
> （`ROOT = path.resolve(__dirname,'..','..')` + `path.join(ROOT,'js',...)` / `path.join(ROOT,'3d',...)`）。
> 保留 `3d/` 这一层，等于让**全部导出器、校验器、移植清单、历史文档原样可用**，
> 不必改几百处路径、也不破坏历史记录的可追溯性。详见 `SPLIT.md` §2。

## 三、红线在本工程的适用性映射（解释层，不改 §一）

| 条 | 在本工程如何落地 | 校验 |
|---|---|---|
| 1 | `file://` 要求不适用于 Godot 运行时；但其精神保留：**3D 运行时零插件、零外部服务、无构建步骤**，`--headless` 可直跑自测，不依赖本地服务器 | Godot 无头冒烟 |
| 2 | 「`index.html` 唯一加载清单」映射为 **`3d/preview/project.godot` + `scenes/main.tscn` 是唯一入口**；不动态注入脚本、不加载 `res://` 之外的文件；GDScript 依赖顺序按 `3d/ARCHITECTURE.md` §3 | `npm run 3d:import:check` |
| 3 | 3D 版本真源是 `3d/version.json`；改版本同批改 `package.json` 的**基线标识**（仅由 `baseline:sync` 写）与 `3d/CHANGELOG.md`；界面只读 `Config.label()`，禁止硬编码版本串 | `npm run 3d:export:version` |
| 4 | 门禁集合见 §四。报告**必须写本次实跑 X 通过 / Y 失败**，不得沿用旧读数；§六 的两项既有失败不得伪装成完成 | `npm run check` |
| 5 | 无 DOM，`window.SKV3._t` 不适用；映射为 **Godot 无头自测参数**（`--walktest` / `--mgtest` / `--e2e` / `--speechtest` 等，见 `3d/ARCHITECTURE.md` §7）：可新增，不得删除/改名/改变现有语义 | 对应自测参数 |
| 6 | **完全适用**：`assets/scene/cozy`、`assets/scene/rooms` 为 CC-BY 4.0，`audio/` CC0；署名文件随仓保留，二次分发同样适用；千问本地为唯一出图模型，SDXL 退役；Qwen-Image 2.1 Research License **非商用** | 人工 + `3d/ASSETS.md` |
| 7 | **完全适用并扩展**：规则 / 数值 / 语料只读 `3d/preview/data/*.json`（由 `js/` 导出），GDScript 不抄表；sim / view / ui 分层见 `3d/ARCHITECTURE.md` §3；地图数据只在 `js/data/map.js` → `map.json` 一条链 | `npm run 3d:parity:check` |
| 8 | **完全适用**：Godot 工程 0 插件、0 运行时第三方依赖；`playwright-core` 只服务本机自测脚本 `3d/tools/simdump.cjs`，不进运行时 | 人工 |
| 9 | 「DOM id 双处同步」映射为 **`.tscn` 节点路径 与 GDScript 引用双处同步**；改名同批改两处并跑自测 | 自测 |
| 10 | **完全适用**：提交信息 / 文档 / 注释一律中文，格式 `type(scope): 摘要`（feat / fix / docs / chore）；命令行统一 **PowerShell 7**（`pwsh`） | 人工 |
| 11 | **完全适用，且是本工程存在的前提**：只读基线就是为这条服务的。动 3D 前先在 `js/` 找源头；找得到 → 照抄语义、数值读 `3d/preview/data/rules.json`；找不到但确实需要 → 判断是不是真·维度产物（A* 网格 / 相机 / 碰撞 / LOD 等），是 → 写进 `3d/spec/parity-map.json#allowed_differences` 并写明「为什么 2.5D 不需要」，不是 → **先去上游 2.5D 改真源**，再 `baseline:sync` → 重导 → 移植，不许只加在 3D | `npm run 3d:parity:check` + `npm run 3d:port:check` |
| 12 | **完全适用**：素材优先公开素材站 / 开源社区，来源留痕进 CREDITS；本地生成走千问本地模型且先取公开设计参照 | 人工 |

## 四、命令

| 目的 | 命令 |
|---|---|
| 首次装自测依赖 | `npm i`（仅需 `playwright-core`；`node_modules/` 不入库） |
| 首次导入资源 | `$GODOT --headless --path 3d/preview --editor --quit` |
| 正常游玩 | `$GODOT --path 3d/preview --resolution 1280x720` |
| 无头冒烟 | `$GODOT --headless --path 3d/preview --quit-after 3` |
| 全量数据导出 | `npm run export:all`（map / minigames / space / sim / lines / rules / version） |
| 单条导出 | `npm run 3d:export:map` / `3d:export:minigames` / `3d:export:space` / `3d:export:sim` / `3d:export:lines` / `3d:export:rules` / `3d:export:version` |
| 全量只读门禁 | `npm run check`（assets / import / port / events / lines / parity 串跑） |
| 单条门禁 | `npm run 3d:assets` / `3d:import:check` / `3d:port:check` / `3d:events:check` / `3d:lines:check` / `3d:parity:check` |
| 基线校验 / 刷新 | `npm run baseline:check` / `npm run baseline:sync`（可选 `-- --source <原仓路径>`） |
| 模型同步 | `npm run 3d:sync:models`（`3d/assets/export/*.glb` → `3d/preview/assets/models/`） |
| 千问出图 | `npm run 3d:refs:cabin` / `3d:refs:tasks`（**必须 pwsh 7**，本地生成） |

**Godot 二进制**（本机绝对路径，不在 PATH 上）：

```
标准版  E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe
完整版  E:/ai-tools/godot/Godot_v4.6-stable_mono_win64/Godot_v4.6-stable_mono_win64_console.exe
```

**其余本机环境**（沿用原仓 `AGENTS.md` §二）：Blender 5.2.2 唯一权威版本
`E:\SteamLibrary\steamapps\common\Blender\blender.exe`；千问本地
`E:\ai-models\qwen-image-2.1` + `E:\ai-tools\sdcpp\vulkan\sd-cli.exe`；
Python `C:\Python314\python.exe`；PowerShell 7（`pwsh`，本机 7.6.5）。
调用命令行统一用 **PowerShell 7**，不要用 Windows PowerShell 5.1；仅在脚本确实依赖 POSIX 工具时才另选。

## 五、改动流程

1. **先问「2.5D 里这条在哪」**：在只读基线 `js/` 中检索（`js/game.js` / `js/ai/sanity.js` /
   `js/ai/traits.js` / `js/t2/*` / `js/data/*`）。找得到 → 照抄语义，数值走 `3d/preview/data/*.json`；
   找不到 → 按 §三.11 判维度产物，不许在 GDScript 里自造状态 / 计数器 / 阈值 / 系统。
2. **绝不手改只读基线**：`js/`、`assets/`、`audio/`、`tools/`（除 `sync-baseline.cjs`）与
   `package.json` 的 `version` / `gameVersion` 一律只读。确需上游变更时：
   去原仓 `C:\Users\ASUS\Desktop\新返航录` 改 → 跑原仓门禁 → 本工程 `npm run baseline:sync`
   → `npm run export:all` → `npm run check` → 再移植。
3. **改完必跑**：`npm run check` + 相关 Godot 无头自测；报告写**本次实跑**的「X 通过 / Y 失败」，
   失败按回归处理，不得沿用旧读数（§一.4）。
4. **数据契约变更**：`3d/preview/data/*.json` 的字段增删 / 语义变化必须升 `schema_version` 并写 ADR
   （`3d/DECISIONS.md`）；改了 `js/` 而没重导 → 对账会 FAIL，这是设计，不是 bug。
5. **留痕**：可见变更写 `3d/CHANGELOG.md`，工程级变更写根 `CHANGELOG.md`，决策写 `3d/DECISIONS.md`，
   每次导出记录源文件哈希（导出器已自动写入 `sources`）。
6. **提交**：中文，格式 `type(scope): 摘要`；不提交 `node_modules/` / `.godot/` / 日志 / 本机截图。
7. **验收层不反向驱动执行层**（原仓 `ARCHITECTURE.md` §8，2026-11-09 用户重申）：
   T3 读数（蒙特卡洛 / 胜率 / 救起数 / 门禁与自测结果）只作**事后记录**，
   不得作为当前批「某项改动该做 / 该回滚 / 是否达标」的依据，也不写「某读数 > 0 算通过」。
   T2 改动的论证依据只能是 `js/` 真源语义（写明文件与行号）或「真人会不会这样」。
   门禁与自测只用来回答「有没有写坏」，不用来回答「该不该做」。
   跨批次反馈须显式登记；**agent 不得自行跨批次立项**，建议只走提问清单。

## 六、已知问题与门禁读数（2026-11-09 · 第四批修复后实跑）

> 本节是**事实快照**，不是数值真源；后续每批改动后按 §五.3 重新实跑并更新。

### 6.1 P0 · 玩家除移动外无法操作 —— 已修（第四批）

用户 2026-11-09 现场反馈：进入舱段后 WASD / 鼠标视角可用，**其余交互全部无响应**。
同日第四批（详见 `3d/CHANGELOG.md` 第四批）已修复输入链与动作入口：

- **根因**：交互轮盘打开时 `Input.mouse_mode` 仍是 `CAPTURED`，光标锁在屏幕中心，按钮点不动；
  `--e2e` 又用 `skip_discussion()` 绕过开局会议，造成「门禁绿、真人卡住」。
- **修法**：`main.gd::_want_mouse_visible()` + `_refresh_mouse_mode()` 统一鼠标口径（会议 /
  轮盘 / 小游戏 / 管道 / 设置 / 信息面板任一打开即 `VISIBLE`）；`_input()` 补 2.5D
  `SKSettings.isOpen()` / `G.inspect` / `G.camView` 同款守卫；按 `js/game.js#collectInteractions`
  补齐 3D 缺的 5 类动作（施救 / 查看记录 / 全船监控 / 异形破坏 / 机器人状态）。
- **验证**：`npm run check` 6 通过 / 0 失败；`--actiontest` ACTION OK（鼠标相位 5/5 +
  动作入口 5/5，**不靠 `skip_discussion()` 作弊**）；`SIMTEST 26/0`；7 项 Godot 自测 exit 0。
- 排查入口备查：`main.gd` 的 `_input()` / `_update_interaction()` / `_handle_attack()`、
  `player.gd` 的 `_unhandled_input()`、`project.godot`（**无 `[input]` 段**，按键全硬编码
  `physical_keycode` —— 属允许的输入映射差异，不是缺陷）。

### 6.2 门禁读数（第七批后实跑）

| 门禁 | 结果 | 读数 |
|---|---|---|
| `3d:assets` | ✅ | 0 错误 / 3 提醒（3 项 wip 资产源文件未落地） |
| `3d:import:check` | ✅ | 0 差异 |
| `3d:port:check` | ✅ | 0 错误 / 1 警告（`cover_refs.json` 缺 `schema_version`，legacy） |
| `3d:events:check` | ✅ | EVENTS OK |
| `3d:lines:check` | ✅ | LINES OK |
| `3d:parity:check` | ✅ | 全域 63 synced / 7 adapter / 0 pending（`SKT2AI` 38 synced、`SKT2Decision` 11 synced / 2 adapter）；脚本自报 **18 个**非真源小数 WARN（列前 12），旧写 16 个已更正 |
| **汇总** | ✅ | **6 通过 / 0 失败** |

分离时的 2 项既有失败已清：`rules.json` 重导消除 `sources` SHA 漂移；
`port-manifest.json` 的 `X-BIND` 补认领上游新增的 111 行 `_t` 调试查询接口。
Godot 的 `--simtest` / `--meetingtest` / `--speechtest` 原是 `MEET_PRE` 接入后没更新的坏账
（**原仓同批逐字同样失败**，非本工程回归），本批用 `_finish_meeting()` 夹具修好。

### 6.3 仍未同源（事实登记，不是立项）

> 本节只登记当前已知事实，**不是下一批清单**；方向由用户裁定（见 §五.7）。

1. **行为层读数已失效**：`3d-sim1000.md` 的 1000 局基线（人类 27.1% / 异形 68.9% / 超时 40、
   平均夜 5.71、救起 156）是**第七批之前**代码在 26 夜窗口下的读数；第七批恢复每夜刀额度、
   接通人类开枪并把窗口拨回 15 夜，**该读数不再代表当前代码**。按验收层边界，本批未采新读数，
   也未据旧读数论证任何改动。2.5D 参考 49.9% / 4.72 / 超时 0。
2. **医疗无人机救起链**：代码按 2.5D 补齐但行为未闭环（1000 局救起 0.156/局，2.5D 3.46/局），
   根因未定位，**不标为已解决**。
3. **第七批核实后仍缺的机制**（逐条见 `3d/PORT-DIFF-AUDIT.md` §C）：讨论期陆续投 + 跟票 +
   `rev` 驱动改票的时序、`chaseKnown/chaseSus` 追猎、`lightState` 三态、`startNight` 逐人重置
   20+ 字段、`mindReset` 跨夜字段（credWhy/claimHist/trust/grudge/humanT/ally 等）、
   `CN_SEAT` 中文席位解析、`buildMeetCtx`/`remainMs`、小游戏 14→10 型。
4. **事件层**：`simdiff-20261108.md` —— 两套独立实现，信封 34 vs 40、kind 18 vs 26，第 1 条事件就分歧。
5. **自造数值**：parity 自报 18 个非真源小数 WARN（列前 12）。
6. **验收层自身缺口**：`--mgtest 0/10`、`--taskflowtest`、`--floortest 失败 4`、`--e2e` 超时
   为原仓基线同样失败的既有坏账；`--actiontest` 是状态断言（0 次 `InputEvent` 派发），
   **真实输入链至今没有端到端自动化验收**。

按 §一.4，这些未清项在任何报告里都要如实列出，不得沿用旧读数或伪装完成。
