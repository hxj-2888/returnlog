# AGENTS.md — 新返航录（试玩版 · 返航录V3）

> **架构节点**（2026-11-04 · 按根 `ARCHITECTURE.md` 贴标）：本文件属 **文档栏**（跨会话团队契约），不隶属 T1/T2/T3；`flag: N`（红线与流程）/ `F`（读数）。
> **本文件服从 `ARCHITECTURE.md`，不自称真源**。下文「权威口径（2026-11-04 校对）」按 **F 档现行事实快照** 解读：读数台账见 `CHANGELOG.md` 最新批次；`tools/mc-report.md` 已废弃；数值真源在 `js/ai/sanity.js` 与 `js/data/map.js`。
> 现行架构为**三层**：T1 工程大层（AI 拟人化 ‖ 空间与资源 ‖ 玩家决策）→ T2 机制与执行层（原 L2+L3 合并同类）→ T3 验收层；层外参考层 R 与预增层 P 已于 2026-11-12 收口归档（不占层号、不进依赖链），待办只记 `CHANGELOG.md`；体验层移出架构图，见 `docs/00-先导-游戏体验.md`。
> §三文件地图的「层」列将在档 1 重构时换为 `T1/T2/T3 + domain`；**§一红线原文保留**；命令与改动流程见 `docs/workflow.md`，历史踩坑记录保留为附录。

> **当前版本**：返航录V3.7（2026-11-11）· `package.json` 3.7.0
> **一句话**：11 人类 vs 4 异形的实时太空船对抗网页游戏；零依赖前端、无构建、`file://` 可直接运行。
> **接手顺序**：本文件 → README（一页）→ `CHANGELOG.md` 最新批次；历史分卷按需读。
> **权威口径（2026-11-12 校正 · T3 验收层规范落地）**：
> **数值 / 语料 / 地图的唯一真源在 T2 模块**（`js/ai/sanity.js`、`js/data/map.js`、`js/data/lines.js` 等）；
> `CHANGELOG.md` 是 **T3 读数载体**，只记「本批改了什么 → 读数怎么变」，不是真源。
> `tools/mc-report.md` **已废弃**（磁盘上不存在；历史引用只作对照，不得当作现行基线）。
> **现行基线 / 门禁现值只在 `CHANGELOG.md` 最新批次的「读数变化」段声明一次**，须带实跑时间、
> seed、局数与 `X 通过 / Y 失败`；本文件与其余文档一律写指针，不复制数值。
> 各批 74.8 / 78.8 / 49.9 / 57.6 / 59.5 等胜率、838 / 899 / 914 / 918 等门禁数均为**历史读数**，
> 只作对照，禁止当现行基线或跨批直接相减；跨批只比同批 A/B 两臂。
> T3 细则 `docs/acceptance.md`；体检 `npm run t3:check`；红线契约 `npm run agent:contract`。
> 出仓素材以 `assets/MANIFEST.json` 为准，校验：`node tools/assets-check.cjs`。

> **接手顺序（2026-11-13 收敛）**：读区见 §零；改台账 / 读数 / 导出时再读 `docs/acceptance.md`；
> 跑命令 / 提交时读 `docs/workflow.md`；资产治理按任务读 `docs/ASSET_GOVERNANCE.md`。
## 零、AI 读取边界（2026-11-13 · AI 可读性清理）

> 目的：主仓只让 AI 读正式内容。**默认不读**测试/夹具/报告/二进制/历史分卷；需要时按任务读。
> 本表是读区的**唯一真源**；README 只写指针，不复制。

**默认只读**：本文件 → `ARCHITECTURE.md` → **`docs/CORE_RULES.md`（规则的设计口径，先读）** → `docs/00-先导-游戏体验.md` → 任务对应的 `js/` 模块。

| 任务 | 读 | 默认不读 |
|---|---|---|
| 玩法 / 数值 / 语料 | **`docs/CORE_RULES.md`（先读，规则语义以它为准）** + `js/` + `docs/00` + 相关真源 | `tests/`、`tests/reports/`、`assets/`、`android/`、`tools/` |
| 验收 / 门禁 | `docs/acceptance.md` + `tests/` + `CHANGELOG.md` 最新批次 | `assets/`、`android/` |
| 美术 / 资产 | `assets/MANIFEST.json` + 对应 `CREDITS` + 本地素材仓 | `js/`、`tests/` |
| 发布 / 部署 | `tools/` 发布脚本 + `package.json` | `tests/`、`assets/` 二进制 |
| 3D | 3D 副分支 / 独立仓 | 本仓 `3d/preview/data` 以外的 2.5D 模块 |

**默认不读**：`tests/`（T3 可执行与夹具）、`tests/reports/`、`assets/` 二进制、`android/`、
`tools/` 美术/发布、`docs/changelog-history-*.md`（历史分卷）。
**不要全仓 grep**：先按路径读；需要跨文件证据时再用 SearchWorkspace。

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
3. **发版门禁**：`npm run guard` 必须 PASS，`node tools/deploy-pages.cjs --dry-run` 暂存体积 ≤ 50 MB，并把本次体积记入 `CHANGELOG.md`；`npm run guard:expired` 每周扫描超期批次。
4. **迭代归档**：旧版本整批移入 L3 命名目录（`_backup/YYYYMMDD_<主题>` 或 `tools/_bak/<主题>-时间戳`）并写恢复口径；保留期为候选帧 7 天、中间产物与截图 14 天、退役批次与 `.blend1` 30 天、L4 缓存随时清。
5. **删除授权（最高优先级）**：未经用户逐项确认，不得删除、移动、重命名任何资产文件；清理必须走规范 §9 六步（冻结 → 完整备份 → 只进回收站 → 每批 ≤10 → 逐批校验 → 写台账）；禁止 `rm` / `del /F` / `shutil.rmtree` / 通配符批量删。禁止以「修改时间久」或「文件名带 v1 / 日期」作为删除依据。
6. **基线契约**：3D 版 `js/`、`assets/`、`audio/`、`tools/`、`index.html` 为 2.5D 只读镜像，改上游主仓后再 `npm run baseline:sync`；**`docs/` 已移出基线，可改**；不得为了让门禁变绿直接改镜像文件。

## 三、变更检查清单

- 新增资产：登记层级与保留期 → 声明三态 → 同步四处规则 → L1 写明来源 / 许可 / 再生成脚本
- 版本迭代：旧版本整批归档并写恢复口径 → 候选帧与正式图后缀分离 → 代码只引用正式图
- 发版：`npm run guard` PASS → `deploy --dry-run` ≤ 50 MB → L4 缓存已清 → 超期批次已评估 → `CHANGELOG.md` 记录体积基线
- 改智能体契约：`npm run agent:contract` 校验红线与本仓 `docs/REDLINES.md` 一致；改 §一 后先 `npm run agent:contract:write`
- 改门禁 / CI：跑 `npm run ci:gate`（test-v3 + `tests/flaky-assertions.txt`）；未登记失败不得加白名单，只能按回归处理
- 改台账 / 读数 / 导出快照：`npm run t3:check`（T3 验收层体检，细则 `docs/acceptance.md`）；发版前跑 `npm run t3:check:strict`
- **改技术方案 / 参数 / 美术资产**：先按 `docs/ASSET_GOVERNANCE.md` §14（红线 12 执行细则）检索并登记 ≥2 个公开来源（官方文档 / 开源实现 / 公开素材站），写清比对结论；无登记不得动实现，自研须写明「已检索但无适用方案 + 理由」。灯光、材质、分辨率 / 帧率、渲染缩放、部署方案一律适用。**公开素材文件的直接使用须用户逐项批准；方法论与技术指导可直接吸收**

## 四、分册索引（按需加载，不在本文件展开）

| 分册 | 内容 | 何时读 |
|---|---|---|
| `docs/ASSET_GOVERNANCE.md` | 存储与资产治理规范（含资产层级登记表附录 B） | 涉及资产 / 发布 / 清理 / 新增目录时 |
| `docs/acceptance.md` | **T3 验收层执行规范（现行）**：真源/读数分离、三段式、单一现值、导出快照、存量债 | 改台账 / 读数 / 导出 / 体检时 |
| `docs/REDLINES.md` | 红线逐字副本（校验基准） | 校验红线时 |
| `docs/workflow.md` | 命令、本机环境、Blender 权威版本、改动流程 | 需要跑工具 / 提交前 |

> **口径优先级**：本文件与 `docs/ASSET_GOVERNANCE.md` 为现行口径；分册为历史原文逐字搬迁，仅供查阅，冲突时以现行口径为准并回写更新。
