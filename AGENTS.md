# AGENTS.md — 新返航录 3D 版（独立工程）

> **版本**：3D `V0.1`（真源 `3d/version.json`）· 移植基线 `返航录V1.0`（只读标识见 `package.json`）。
> **接手顺序**：本文件 → `docs/ASSET_GOVERNANCE.md` → `3d/ARCHITECTURE.md` → `3d/CORE_RULES.md`（规则语义唯一真源，不得擅改）→ `BASELINE.md` → `3d/HANDOFF.md` → `3d/PORTING_PROTOCOL.md`。

## ⚡ 首要红线（所有 AI 必读 · 置顶速览）

1. **禁止从开发仓直接 `git push`**：公开推送只能把公开文件同步到 `exports/returnlog-3d` 后运行 `publish-public.cjs`，禁止 `--no-verify`；提交前必须通过脱敏检查。
2. **分支隔离与远端唯一**：3D 客户端只推 GitHub `origin/3d` 副分支（`master` → `origin/3d`），严禁混入 2.5D `main`；**Gitee 提交已废除**，不再维护或推送。
3. **只读基线禁改**：`js/`、`assets/`、`audio/`、`tools/`、`index.html` 为 2.5D 镜像，禁改；改规则先改 2.5D 再 `npm run baseline:sync`。
4. **删除/清理需逐项授权**：未经用户确认不得删除/移动/重命名资产；禁止 `rm` / `del /F` / 通配符批量删。
5. **规则同源 + 门禁 + 中文**：不在 GDScript 另立数值/状态真源；改动后跑对应门禁；提交信息与文档一律中文（`type(scope): 摘要`）。

## 零、AI 读取边界

- **默认只读**：本文件 → `3d/ARCHITECTURE.md` → `3d/CORE_RULES.md` → 任务对应的 `3d/preview/scripts/` 模块。
- **默认不读**：`3d/preview/assets/`、`3d/preview/data/` 大 JSON、`3d/preview/scripts/tests/`、`3d/preview/reports/`、历史台账与截图。不要全仓 grep，先按路径读。

| 任务 | 读 |
|---|---|
| 玩法 / 判定 / 数值 / 语料 | `3d/CORE_RULES.md` + `3d/preview/scripts/sim/` + `3d/spec/mapping-ledger.json` + `js/` |
| 界面 / 输入 / 交互 | `3d/preview/scripts/main.gd`、`ui_*`、`minimap.gd` |
| 验收 / 门禁 | `3d/HANDOFF.md` §0.8、当月 `3d/CHANGELOG-*.md` 最新批次 |
| 数据链 / 导出 / 美术 / 部署 | `3d/tools/export-*.cjs` + `3d/spec/*.json` / `3d/ASSETS.md` / `3d/TEMP_DEPLOY_HANDOFF.md` + `.github/workflows/` |

> 说明：下文 `## 一、红线` 与主仓逐字一致（供 `npm run agent:contract` 校验，不得删改）；3D 适用性映射见 `3d/PORTING_PROTOCOL.md` 附录 A。

## 一、红线（违反即回退）

1. **`file://` 必须可玩。** 禁止 `fetch()`、ES Module（`<script type="module">`）、构建/打包步骤，
   以及任何需要本地服务器才能加载的资源。所有脚本按顺序用经典 `<script>` 加载。
2. **`index.html` 是唯一加载清单。** 新增模块必须按依赖顺序插入，并同步更新 README 的「项目结构」；
   禁止在别处动态注入 `<script>`。当前顺序（与 `index.html` 一致）：
   `config/version → data/map → data/plates → data/names → data/lines → ui/templates → engine/clock → engine/invariants → engine/geo → engine/assets → engine/body → ai/sanity → ai/traits → t2/space → t2/ai → t2/decision → t2/minigame → game → main → ui/home → ui/replay`。
   **`ai/sanity.js` 必须排在 `ai/traits.js` 之前**：traits 的 `b()` 要读 `SKSanity.TRAIT_GAIN` 做方差压缩，
   `knifeBold / knifeWatcherCap` 也要读理智层的表。
3. **版本单一真源是 `js/config/version.js`（`SKConfig.version = '返航录V0.5'`）。**
   改版本必须同批改 `package.json`（`version` / `gameVersion`）并在 `CHANGELOG.md` 记录；
   界面版本号一律用 `[data-version]` 占位，由脚本填充，禁止散落硬编码。
4. **门禁必须全绿。** 改任何逻辑/数据后按改动规模跑门禁，失败一律按回归处理；
   报告里必须写本次实跑的「X 通过 / Y 失败」，不得沿用旧读数。
   - **默认全量**：本次改动 **≥3 点**，或触及跨模块 / 红线 / 契约 / 数值基线时，
     跑 `node tests/test-v3.cjs`，全绿方可收口。
   - **小改动只跑对应门禁**（2026-11-19 用户裁定）：用户本次修改要求 **< 3 点**时，
     可不重跑全量门禁，只跑与改动内容直接对应的门禁子集（改板 → `npm run plate:check`、
     改读数 / 台账 → `npm run t3:check`、改红线 → `npm run agent:contract` 等），
     报告写明本次实跑项与读数即可；**对应门禁同样必须全绿**，失败一律按回归处理，
     不得借本条跳过验收层。
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
    - 推送目标：仅推送 `origin`（GitHub）；**`gitee` 镜像已于 2026-11-26 废除，不再维护与推送**；分支同名歧义时用完整 ref
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
15. **AI 与玩家配置平等，不得出现性能差异。**（2026-11-18 用户裁定，红线级；规则正文见 `docs/CORE_RULES.md` R20）
    - **唯一允许的差异是决策系统**：玩家由人的输入驱动，AI 由启发式与概率驱动；除此之外
      同配置、同判据、同数值、同时间预算。玩家有的 AI 必须有，AI 有的玩家必须有：
      视野（含濒死与被拖动期间）、移动速度、搜查 / 尸检、拖尸、报告、开枪、破坏、拉闸、
      领取补给、维修、任务、会议发言与投票、暂停与恢复。
    - **判据只能有一份定义**：视野 `observerVisionAt`、速度 `moveSpeed`、报告距离 `MEET.reportR`、
      搜查时长 `LOOT.aiSearchTime` / `STAND.search`。禁止为 AI 另写距离 / 半径 / 概率，
      也不得为玩家另开一套。要改就改 `js/` 真源，双方同时生效。
    - **同一事件两侧都要能看见**：尸体被拖动时不可搜查（`draggedBy==null` 对双方同一条）；
      濒死与被拖期间保有视野；全屏遮罩只挡视线不挡听觉。
    - **新增参数先过三问**：① 玩家有没有对应能力？② 这是不是同一判据的第二份定义？
      ③ 是否写进 `js/` 真源？三问有一问答不上，不得动实现。
    - 违反本条视为回归：回退改动并在 `CHANGELOG.md` 记录。
16. **不显露个人信息、生成工具 / Agent 名称与密钥。**（2026-11-18 用户裁定，红线级）
    - **不得出现**：真实邮箱（任何个人邮箱域名）、手机号、身份证号、真实姓名、住址、社交账号；
      以及任何**生成工具 / Agent / 模型 / 平台的品牌名**。
    - **本条文自身也不列举这些名称** —— 列举等于再写一遍，规则不能自己违规。
      要判断某个词是否属于此类，只看一条标准：**它是"东西的名字"，还是"谁在替我干活"**。
      前者保留（素材授权方、开源引擎、渲染与测试工具、`assets` 许可要求保留的署名），后者一律删除。
    - 范围包括文档、注释、提交信息、`CREDITS`、交接文档、代码字符串与配置注释。
    - **密钥、口令、keystore、`.env` 一律只留本机**，由 `.gitignore` 兜底（现有条目：
      `.env`、`android/release.keystore`）；仓库内只写变量名（如 `secrets.PUBLISH_ASSETS_TOKEN`）。
    - **提交身份用 noreply 邮箱**（`<用户名>@users.noreply.github.com`），提交信息不写工具名。
    - 违反视为回归：清除内容、必要时重写受影响的历史，并在 `CHANGELOG.md` 记录清理范围。

## 二、硬约束（违反即回退）

> 完整制度见 `docs/ASSET_GOVERNANCE.md`；层级登记见 `docs/ASSET_LAYERS.md`；清理台账为仓外本地文件（`~/.returnlog-cleanup/<repo>-ASSET_CLEANUP_LOG.md`，不入库）。

1. **三态声明**：新增资产须声明「入库 / 发布 / 磁盘留存」，同步 `.gitignore`、`tools/deploy-config.cjs`、`assets/MANIFEST.json`、`BASELINE.sha256.json`。
2. **白名单**：禁止在 `assets/`、`js/`、`audio/` 放 L1–L4 资产；白名单下新增非发布文件须在 `tools/deploy-config.cjs` 的 `SKIP` 中显式排除。
3. **发版门禁**：`npm run guard` 必须 PASS（发布暂存 ≤ 50 MB），体积记入 `CHANGELOG.md`。
4. **删除授权**：未经用户逐项确认，不得删除/移动/重命名任何资产；清理走规范 §9 六步与系统回收站。
5. **基线契约**：`js/`、`assets/`、`audio/`、`tools/`、`index.html` 为 2.5D 只读镜像（`docs/` 已移出基线可改）；改上游后跑 `npm run baseline:sync`。
6. **规则同源**：禁止在 3D 新增计时器 / 阈值 / 阵营过滤 / 状态分支；规则函数须在 `3d/spec/mapping-ledger.json` 有映射并保留 `@src`，提交前 `npm run audit:parity:strict` 不得退步。

## 三、变更检查清单

- **改代码 / 数据**：先读 `3d/CORE_RULES.md`；大文件用 `npm run file:map -- --section <片段>` 定位，改完跑 `npm run file:check` + `npm run check` + `npm run baseline:check` + `npm run guard`。
- **改技术方案 / 参数 / 美术**：先按 `docs/ASSET_GOVERNANCE.md` §14 检索并登记 ≥2 个公开来源并写清比对结论。
- **改契约 / 共享规范**：`npm run agent:contract`（校验红线与 `docs/REDLINES.md` 一致）；`npm run docs:sync` / `npm run docs:check`。
- **发布 / 推送**：禁止从 dev 仓直推；同步公开物到 `exports/returnlog-3d` 后运行 `publish-public.cjs`，禁止 `--no-verify`。

## 四、公开物脱敏规范（红线级）

- 公开仓只放产品代码、运行素材、`LICENSE`、简短 `README`、必要部署配置及经脱敏的规范/设计文档（`AGENTS.md`、`3d/ARCHITECTURE.md`、`3d/docs/` 等）；`tools/`、`tests/`、交接台账（`HANDOFF*`、`ART_HANDOFF*`）、`audit/`、`changelog-history-*`、`CLAUDE.md` 仍留本地。
- 默认禁传：本机路径/用户名/设备信息、局域网 IP/端口、凭据/资源 ID、私人邮箱/手机号、AI 工具痕迹、日志；历史泄露按「单条纯净提交」重建并强推。

## 五、分册索引与多模型入口（预留）

| 分册 | 用途 |
|---|---|
| `docs/ASSET_GOVERNANCE.md` / `docs/REDLINES.md` | 资产治理规范 / 红线逐字校验基准 |
| `3d/HANDOFF.md` / `3d/PORTING_PROTOCOL.md` | 现行状态交接 / 移植规程与红线映射 |
| `3d/ARCHITECTURE.md` / `3d/docs/art/ART_HANDOFF.md` | 3D 架构边界 / 美术建模交接 |

> **多模型入口（预留空位）**：后续按需补充 `CLAUDE.md`、`GEMINI.md`、`.cursor/rules/`、`.github/copilot-instructions.md` 薄入口文件（仅放首屏 5 条红线 + 指向本文件，不进公开导出仓）。
