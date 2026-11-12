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
    落地检查：`npm run 3d:parity:check`（对账覆盖 + 3D 硬编码扫描）+ `3d/PORTING_PROTOCOL.md` §6。
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
    - 共享侧（`3d/tools/` 美术管线、`3d/preview/data/` 导出数据、`floor_spec.json` 等单一真源）
      随 main 同步，保证 2.5D 烘焙与 3D 读同一份数据。
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
    - **验收归 T3**：改逻辑/数据必跑门禁与对应体检并留痕（`tools/test-v3.cjs` 等），不得绕过验收层自证。
    - 3D 子项目工程不占根层号（边界见 3D 仓 `3d/ARCHITECTURE.md`），但**仍服从本条真源/归层/验收约束**：
      规则/数值/语料一律自 `js/` 导出移植，不在 GDScript 另立真源。
    - 违反本条视为回归：回退改动并在 `CHANGELOG.md` 记录。
