# AGENTS.md — 新返航录 3D 版（独立工程）

> **工程契约**（2026-11-09 · 分离日）。适用对象：本工程根目录 `新返航录 3D 版/` 及其下全部内容。
> 本文件**服从** `3d/ARCHITECTURE.md` 的工程边界声明与根 `README.md` / `BASELINE.md` 的事实口径，不自称数值真源。
>
> **红线保真声明**：下文 §一「红线（违反即回退）」与主仓 `新返航录/AGENTS.md` §一 **逐字一致**。
> 2026-11-11 基线同步：主仓 11-10 新增第 13、14 条，本工程已补齐，共 **14 条**；
> 2026-11-13 再次逐字同步：主仓 T3 迁入 `tests/`，第 4、14 条的门禁入口随上游改为 `tests/test-v3.cjs`，
> 第 11、13 条关于 3D 副分支的措辞回到上游原文。本仓根目录无 `tests/`（2.5D 测试不在只读基线镜像内），
> 实际门禁入口以 `npm run check` 与 `3d/PORTING_PROTOCOL.md` 附录 A 为准；§一 原文不因此改动。
> 其中若某条在本工程里不直接适用（如 `file://`、`index.html`、DOM），
> 一律走 §三「适用性映射」解释与落地，**不许回写 §一、不许删红线、不许另起一套宽松口径**。
> §三只是解释层，不能覆盖 §一；两者冲突时以 §一 原文为准并回到上游 2.5D 确认。
>
> **产品口径**：3D 是 2.5D 的**延伸，不是第二条产品线**（§一.11）。
> 本工程把 2.5D 真源以**只读基线**形式随仓带走，目的正是让「改 3D 之前先问 2.5D 里这条在哪」
> 能在本工程内闭环，不需要跨仓猜测，也不允许借「已经独立了」的理由自造规则。
>
> **版本**：3D `V1P-0.2` / `0.2.0`（真源 `3d/version.json`）· 移植基线 `返航录V3.7` / `3.7.0`（只读标识见 `package.json`）。
> **接手顺序（2026-11-14 统一，只有这一套）**：根 `AGENTS.md` → `docs/ASSET_GOVERNANCE.md` →
> `3d/ARCHITECTURE.md` → **`3d/CORE_RULES.md`（自然语言规则释义，改玩法前先在这里对语义）** →
> `BASELINE.md` → `3d/HANDOFF.md` → `3d/PORTING_PROTOCOL.md` → 任务对应的 `3d/preview/scripts/` 模块。
> `3d/CORE_RULES.md` 是 2.5D `docs/CORE_RULES.md` 的**只读镜像**（`npm run docs:sync` 生成）。
> **规则语义以它为准（设计者口径，2026-11-14 用户裁定）**：`js/` 与 `data/rules.json` 是实现参照，
> 实现与本文不一致时按本文修正实现；**该文档只在设计者明确指示下修改**，任何人不得擅自动文字。
> **2026-11-09 分离时刻的历史事实**：当时玩家除移动外无法操作、门禁有 2 项既有失败；现状与读数见 `3d/HANDOFF.md` 与 `3d/CHANGELOG-2026-11.md`，本文件不再维护 §六。

## 零、AI 读取边界（2026-11-13）

> 目的：只让 AI 读正式内容。**默认不读**测试夹具、导出数据、二进制资产、历史台账与一次性报告；
> 需要时按任务读。本表是 3D 仓读区的**唯一真源**；README 只写指针，不复制。

**默认只读**：本文件 → `3d/ARCHITECTURE.md` → `3d/CORE_RULES.md`（规则释义，先读它） → 任务对应的 `3d/preview/scripts/` 模块。

| 任务 | 读 | 默认不读 |
|---|---|---|
| 玩法 / 判定 / 数值 / 语料 | **`3d/CORE_RULES.md`（先读）** + `3d/preview/scripts/sim/` + `3d/spec/mapping-ledger.json` + 只读基线 `js/` | `3d/preview/scripts/tests/`、`3d/preview/assets/`、`3d/preview/reports/` |
| 界面 / 输入 / 交互 | `3d/preview/scripts/main.gd`、`ui_*`、`minimap.gd` | `3d/preview/scripts/tests/`、`3d/preview/data/` 大 JSON |
| 验收 / 门禁 | `3d/HANDOFF.md` §0.8、当月 `3d/CHANGELOG-*.md` 最新批次 | 历史台账全文、`3d/preview/screenshots/` |
| 数据链 / 导出 | `3d/tools/export-*.cjs` + `3d/spec/*.json` | `3d/preview/data/` 生成物（只读产物，不手改） |
| 美术 / 场景 | `3d/ASSETS.md` + 对应 `CREDITS` | `3d/preview/assets/` 二进制、贴图 |
| 部署 / 发布 | `3d/TEMP_DEPLOY_HANDOFF.md` + `.github/workflows/` | 玩法模块与测试夹具 |

**不要全仓 grep**：先按路径读；需要跨文件证据时再用检索工具。`3d/preview/assets/` 与
`3d/preview/data/` 是生成物/二进制，默认不读、不手改。

## 一、红线（违反即回退）

1. **`file://` 必须可玩。** 禁止 `fetch()`、ES Module（`<script type="module">`）、构建/打包步骤，
   以及任何需要本地服务器才能加载的资源。所有脚本按顺序用经典 `<script>` 加载。
2. **`index.html` 是唯一加载清单。** 新增模块必须按依赖顺序插入，并同步更新 README 的「项目结构」；
   禁止在别处动态注入 `<script>`。当前顺序（与 `index.html` 一致）：
   `config/version → data/map → data/plates → data/names → data/lines → ui/templates → engine/clock → engine/invariants → engine/geo → ai/sanity → ai/traits → t2/space → t2/ai → t2/decision → t2/minigame → game → main → ui/home → ui/replay`。
   **`ai/sanity.js` 必须排在 `ai/traits.js` 之前**：traits 的 `b()` 要读 `SKSanity.TRAIT_GAIN` 做方差压缩，
   `knifeBold / knifeWatcherCap` 也要读理智层的表。
3. **版本单一真源是 `js/config/version.js`（`SKConfig.version = '返航录V3.7'`）。**
   改版本必须同批改 `package.json`（`version` / `gameVersion`）并在 `CHANGELOG.md` 记录；
   界面版本号一律用 `[data-version]` 占位，由脚本填充，禁止散落硬编码。
4. **门禁必须全绿。** 改任何逻辑/数据后跑 `node tests/test-v3.cjs`，失败一律按回归处理；
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
      是 → 写进 3d 副分支的 `3d/spec/parity-map.json#allowed_differences` 并写明「为什么 2.5D 不需要」；
      不是 → **先改 2.5D 真源**，再导出/移植，不许只加在 3D。
    落地检查：在 **3d 副分支**执行 `npm run 3d:parity:check`（对账覆盖 + 3D 硬编码扫描）+
    `3d/PORTING_PROTOCOL.md` §6；主仓只保留 `3d/preview/data` 快照与 `3d/tools/export-*.cjs` 导出链。
12. **素材优先取自公开网络与开源社区，不自己单独造。**（2026-11-09 用户裁定，四项目统一）
    任何美术 / 音频 / 模型素材，先检索公开素材站与开源社区（Kenney / OpenGameArt / Poly Haven /
    itch.io 免费包 / 公开 wiki 与 ArtStation 参照等），许可合适的直接用；没有合适的才本地生成，
    且**生成前必须先取公开设计参照**（例：军械库参照 SCP:SL 的武器柜 / 挂枪架 / 工作站分类）。
    所有来源必须留痕（URL / 作者 / 许可）进对应 `CREDITS.md` / `LICENSE`，二次分发同样适用。
    本地生成统一走**千问本地模型**（红线 6），SDXL 已退役。
13. **分支策略：main 推 2.5D 主线，3D 版推副分支。**（2026-11-10 用户裁定，工程规范）
    - `main` 只承载 **2.5D 主线**（`js/`、`index.html`、2.5D 底图/美术管线、共享数据与文档），
      是 Pages 部署与对外发布的目标分支。
    - **3D 客户端**（`3d/preview/scripts/`、`3d/preview/scenes/` 等 Godot 工程逻辑）只推**副分支**
      （2.5D 仓当前 `3d`；独立仓 `returnlog-3d` 的 `master` 为其镜像），**不得混入 main**。
    - 共享侧（`3d/preview/data/` 导出数据、`floor_spec.json` 等单一真源）
      随 main 同步，保证 2.5D 烘焙与 3D 读同一份数据；3D 资产、美术工具与 `3d/spec`
      在 `3d` 副分支，不再进 main。
    - 同步手法：在 main 上 `git checkout <副分支> -- <2.5D 与共享路径>`（**不含** 3D 客户端目录），
      跑门禁绿后提交推送；避免整分支 merge 把 3D 客户端带进 main。
    - 推送目标：`origin`(GitHub) 为主，`gitee` 为尽力镜像；分支同名歧义时用完整 ref
      （`refs/heads/main:refs/heads/main`）。
14. **必须按已写定的三层架构办事，不得违背。**（2026-11-10 用户裁定，红线级）
    - 架构真源是根 `ARCHITECTURE.md`：层号只有 **T1 工程大层（三域并列）/ T2 机制与执行层 / T3 验收层**；
      层外 R/P 与架构文档栏不占层号、不进依赖链。任何新增/改动**先归层贴标**
      （`definedBy / truth / verify / flag`）再动代码，不得跳过归层直接写实现。
    - **真源唯一、跨层只引用不复制**：数值/语料/地图真源在 T1/T2 对应模块
      （`js/ai/sanity.js`、`js/data/map.js`、`js/data/lines.js` 等）；T2 业务与 3D 移植只读真源或导出，
      不得另立第二份定义。**多父允许、多份定义禁止。**
    - **验收归 T3**：改逻辑/数据必跑门禁与对应体检并留痕（`tests/test-v3.cjs` 等），不得绕过验收层自证。
    - 3D 子项目工程不占根层号（边界见 3D 仓 `3d/ARCHITECTURE.md`），但**仍服从本条真源/归层/验收约束**：
      规则/数值/语料一律自 `js/` 导出移植，不在 GDScript 另立真源。
    - 违反本条视为回归：回退改动并在 `CHANGELOG.md` 记录。


## 二、硬约束（2026-11-11 治理规范，违反即回退）

> 完整制度见 `docs/ASSET_GOVERNANCE.md`；层级登记见 `docs/ASSET_LAYERS.md`；清理台账见 `docs/ASSET_CLEANUP_LOG.md`。

1. **三态声明**：新增任何资产必须显式声明「是否入库 / 是否发布 / 是否留在磁盘」三项状态，并同步四处规则：两仓 `.gitignore`、两仓发布白名单 `tools/deploy-config.cjs`、`assets/MANIFEST.json`、`BASELINE.sha256.json`。
2. **白名单**：禁止在 `assets/`、`js/`、`audio/` 放置 L1–L4 资产；白名单目录下新增文件默认会发布，必须在 `tools/deploy-config.cjs` 的 `SKIP` 中显式排除。发布脚本与门禁共用同一份配置，不得两处各写一套。
3. **发版门禁**：`npm run guard` 必须 PASS，发布暂存体积 ≤ 50 MB，并把本次体积记入 `CHANGELOG.md`；`npm run guard:expired` 每周扫描超期批次。
4. **迭代归档**：旧版本整批移入 L3 命名目录（`_backup/YYYYMMDD_<主题>` 或 `tools/_bak/<主题>-时间戳`）并写恢复口径；保留期为候选帧 7 天、中间产物与截图 14 天、退役批次与 `.blend1` 30 天、L4 缓存随时清。
5. **删除授权（最高优先级）**：未经用户逐项确认，不得删除、移动、重命名任何资产文件；清理必须走规范 §9 六步（冻结 → 完整备份 → 只进回收站 → 每批 ≤10 → 逐批校验 → 写台账）；禁止 `rm` / `del /F` / `shutil.rmtree` / 通配符批量删。禁止以「修改时间久」或「文件名带 v1 / 日期」作为删除依据。
6. **基线契约**：本工程 `js/`、`assets/`、`audio/`、`tools/`、`index.html` 为 2.5D 只读镜像，改上游主仓后再 `npm run baseline:sync`；**`docs/` 已移出基线，可改**；不得为了让门禁变绿直接改镜像文件。
7. **规则同源（2026-11-11 用户裁定）**：3D 直接沿用 2.5D，规则只有一处真源。**禁止在 3D 新增计时器 / 阈值 / 阵营过滤 / 状态分支**；每个规则函数必须在 `3d/spec/mapping-ledger.json` 有映射并保留 `@src`；提交前 `npm run audit:parity:strict` 不得比 `spec/mapping-layers.json#parity_budget` 更差；缺口下降后跑 `--update-baseline` 收紧。逐函数移植流程见 `3d/PORTING_PROTOCOL.md`。

## 三、变更检查清单

- 新增资产：登记层级与保留期 → 声明三态 → 同步四处规则 → L1 写明来源 / 许可 / 再生成脚本
- 版本迭代：旧版本整批归档并写恢复口径 → 候选帧与正式图后缀分离 → 代码只引用正式图
- 发版：`npm run guard` PASS → 发布暂存 ≤ 50 MB → L4 缓存已清 → 超期批次已评估 → `CHANGELOG.md` 记录体积基线
- 改智能体契约：`npm run agent:contract` 校验红线与本仓 `docs/REDLINES.md` 一致；改上游规则后跑 `npm run baseline:check`
- **改技术方案 / 参数 / 美术资产**：先按 `docs/ASSET_GOVERNANCE.md` §14（红线 12 执行细则）检索并登记 ≥2 个公开来源（官方文档 / 开源实现 / 公开素材站），写清比对结论；无登记不得动实现，自研须写明「已检索但无适用方案 + 理由」。灯光、材质、分辨率 / 帧率、渲染缩放、部署方案一律适用。**公开素材文件的直接使用须用户逐项批准；方法论与技术指导可直接吸收**
- **改大文件 / 找函数**：先 `npm run file:map -- --section <函数名片段>` 或 `-- --file main.gd` 定位（不要整文件读），改完跑 `npm run file:check`。调试夹具一律放 `3d/preview/scripts/tests/`，**不得写回 `main.gd`**——`3d/spec/file-budgets.json` 是只许下调的棘轮，`check` 已含此项
- 共享规范：`npm run docs:sync` 从 2.5D 生成 `docs/REDLINES.md` / `docs/ASSET_GOVERNANCE.md`；提交前 `npm run docs:check`
- 改 3D 只读门禁：跑 `npm run check` + `npm run baseline:check` + `npm run guard`；CI 见 `.github/workflows/check.yml`

## 四、分册索引（按需加载，不在本文件展开）

| 分册 | 内容 | 何时读 |
|---|---|---|
| `docs/ASSET_GOVERNANCE.md` | 存储与资产治理规范（含资产层级登记表附录 B） | 涉及资产 / 发布 / 清理 / 新增目录时 |
| `docs/REDLINES.md` | 红线逐字副本（校验基准） | 校验红线时 |
| `3d/HANDOFF.md` | 唯一交接：现行状态、接手陷阱、改动流程（§0.10） | 接手 / 提交前 |
| `3d/PORTING_PROTOCOL.md` | 移植规程 + 红线适用性映射（附录 A）+ 映射裁决（附录 B）+ `buildMeetCtx` 映射（附录 C） | 改玩法规则前 |
| `3d/ARCHITECTURE.md` | 引擎与分层 + 工程目录职责（附录） | 判断可否修改时 |
| `3d/README.md` | 运行方式与常用命令 | 需要跑工具时 |
| `3d/docs/art/ART_HANDOFF.md` | 美术 / 建模交接：权限边界、P0 规格、2.5D 参照物、交付格式 | 接美术 / 建模任务时 |

> **口径优先级**：本文件、`docs/ASSET_GOVERNANCE.md` 与上游主仓 §一 为现行口径；原 `docs/agent/` 分册已于 2026-11-12 并入上述核心文档。第 13、14 条红线（2026-11-10 主仓新增）尚无逐条适用性映射，按 §一 原文执行，不得自行放宽。
