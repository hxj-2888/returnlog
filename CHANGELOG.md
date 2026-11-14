# 修改记录（CHANGELOG）

> **架构节点**（2026-11-04 · 按根 `ARCHITECTURE.md` 贴标）：本文件属 **第 3 层 T3 验收层 · 增量台账**；`flag: F`。
> 每条批次固定三段：**本批改动 → 读数变化 → 下一批立项依据（用户裁定后填）**。台账只记录「改了什么 → 读数怎么变」，不写「某读数 > 0 算通过」；历史条目只标注不删除。

本文件记录《新返航录》试玩版的所有可见变更。版本口径：**返航录V3.7**。
格式参考 Keep a Changelog；日期使用本地时间（Asia/Shanghai）。

> **分卷（2026-11-13）**：本文件只保留**最新 6 批 + 索引**；2026-11 其余批次 → `docs/changelog-history-2026-11.md`；
> 2026-10 及更早 → `docs/changelog-history-2026-10.md`。`tools/check-t3.cjs` 的 C4/C5 同时解析三份，
> 历史只标注不删除；现行基线仍只在最新批次的「读数变化」段。

## [未发布 · AI 引擎释义：规则文本的附录 A] — 2026-11-14

- **本批改动**：把 2.5D 现行实现的 AI 决策结构抽成自然语言，**并入 `docs/CORE_RULES.md` 作为「附录 A」**
  （先以 `docs/AI_ENGINE.md` 独立成文，同日按设计者裁定并入正文，`---` 分隔线隔开、原独立文件删除）。
  **它不升格为权威**：附录开头明确写「R0–R19 的下属说明，不是权威文本，不参与裁定，不构成验收判据；
  与正文冲突以正文为准」。
  内容：通用决策骨架、人类 AI 15 步优先级链（H1–H15）、异形主循环 + 效用表
  （拉闸 14·left / 破坏 8·left / 拆机器人 8·left / 出刀 12·9·2 / 伪装 planValue·score）、
  团队量化表 `SKTeam`（FIX_CREW_CAP 3、BREAKER_VALUE 14、SABOTAGE_VALUE 8、BOT_* 8）、
  性格系数 `SKTrait`（四轴 + 10 条缩放公式）、认知与投票函数索引、3D 对照点、维护规则。
- **为什么需要**：`CORE_RULES.md` 只覆盖玩家可感知的结果（视野 / 伤害 / 投票顺序 / 性格系数），
  **没有覆盖 AI 怎么选目标、怎么算分**。因此 `ai_alien.gd:_decide`、`ai_human.gd` 的决策链
  在规则里没有条目可锚定，行为不对时只能靠玩出来。本文补这一层，供 3D 移植对照。
- **口径**：本文不是规则原本、不是正确性裁判。与 `CORE_RULES.md` 冲突以其为准；
  2.5D 实现本身可疑时**由设计者裁定**，本文跟随实现更新，不得反向论证设计。
- **行号可回读**：全文锚点（`js/game.js` 15 处、`js/ai/traits.js` 3 处、`js/ai/sanity.js` 8 处）
  已逐条回读校对，修正了 13 处概括行号 + 1 处表头行号（`traits.js:63→61`）。
- **读数变化**：无——本批只新增文档，未动 `js/`、未改数值、未动门禁。
  本次实跑：`npm run agent:contract` PASS；`npm run t3:check` PASS / WARN 1（与上批同）。
- **连带改动**：`3d/CORE_RULES.md` 镜像由 `docs:sync` 重生成（`source_sha256 3d64275d7c4e`），
  `docs:check` PASS；映射账本的规则复核基线随之推进到同一哈希；3D `PORTING_PROTOCOL.md`
  头部指引改指向「附录 A」。
- **下一批立项依据**：待用户圈定「哪些 AI 行为值得配判据」。规则未覆盖的部分若要进自动验收，
  需先有对应 R 条目（由设计者决定是否补）。

## [未发布 · 自动化审阅前置：公开来源登记] — 2026-11-14

- **本批改动**：`docs/ASSET_GOVERNANCE.md §14.4` 追加 **9 条** 2026-11-14 公开来源登记
  （spec-kit / Voyager / Agent0 / phalanxduel / GameTest / reflexion / OpenHands /
  Stryker Mutator / autoresearch），每条写清「URL / 作者或机构 / 许可 / 可引用结论 / 对应本项目问题」，
  并在表后注明：一律按 §14.4 第②条作为**方法论与技术指导**吸收，未下载、未采用其代码或素材文件；
  `phalanxduel`（AGPL-3.0）与 `autoresearch`（仓库未声明许可）**只读文档、不引任何代码**；
  mutation score 的阈值属项目自有契约（§14.3 自研豁免），不以公开来源为依据。
- **为什么先做这条**：§14.2 第四步要求「无登记不得改参数、不得生成资产、不得提交」，
  而 §14.1 把所有涉及门禁 / CI 流程的工程方案都纳入适用范围。规则索引与审阅闭环属工程方案，
  故先补登记再动实现。
- **读数变化**：无——本批只改文档，未动 `js/`、未改数值、未动门禁逻辑。
  本次实跑：`npm run t3:check` **PASS 12 / WARN 1 / FAIL 0**（WARN 为 §8 已登记存量债）；
  `npm run agent:contract` PASS（§一 14 条 / `46b1376b1edb04cf`，与 `docs/REDLINES.md` 一致）。
- **下一批立项依据**：3D 侧已在 `3d/spec/mapping-ledger.json` 落地 `rules` 索引段（112 条）；
  下一步给条目填 `verifier` / `targets`，先做数值类三向比对（`docs/CORE_RULES.md` R16 ↔
  `3d/preview/data/rules.json#tables` ↔ GDScript 是否读导出）。

## [未发布 · 核心规则释义文档（供逐行评审）] — 2026-11-14

- **本批改动**：新增 `docs/CORE_RULES.md`，把现行 2.5D 的玩法规则提炼成自然语言，按
  「对局骨架 / 时间轴 / 胜负 / 玩家操作 / 移动与视野 / 任务与资源 / 设施 / 战斗与尸体 / 破坏 /
  报告与会议 / 认知与证据 / 嫌疑与信任 / 发言 / 投票 / 性格系数 / 数值总表」分章，逐条标注 `js/` 行号。
  **文档定位（2026-11-14 用户裁定）**：本文是规则设计的**自然语言权威文本**；`js/` 是实现参照，
  实现与本文不一致时按本文语义修正实现。**本文只在设计者明确指示下修改**；评审只做批注。
  另按同批裁定新增 R19：美术 / 建模 / 音频**只保留提示词**，提示词是资产的设计口径；
  R19 收录 **86 条提示词正文**（角色参考 / 面部 / 家具参照 / 天花板 / 材质与装甲 / 房间墙面 / 界面道具），
  `3d/assets/**/manifest*.json` 的 `prompt` 只作生成时的执行快照。
  未改任何代码、数值或门禁。
- **读数变化**：`npm run t3:check` **PASS 12 / WARN 1 / FAIL 0**（WARN 为本条改动尚未提交的台账提示）；
  纯文档改动，不涉及运行时读数。
- **下一批立项依据**：等待设计者逐行评审 `docs/CORE_RULES.md`；评审意见按条目编号批注，
  只有设计者明确说要改才动文字；若裁定规则变更，先改本文，再改 `js/`，再重导 3D 数据链。

## [未发布 · T3 申请单用例改判 claim 事件] — 2026-11-13

- **本批改动**：`tests/test-v3.cjs` 的「AI 人类完成 3 分后会自己回圆桌领取申请单」不再断言末值 `qual>=1`，
  改为断言 `progress>=3 && qualPending===0 && claims>=1`，并把现存张数与换到的弹/包写进用例文案。
  原因：`grantQual`（`js/game.js:4349`）领到申请单后，AI 站在军械库/医疗间补给点会按既有玩法用申请单换弹药或医疗包
  （`js/game.js:4397` / `4408`），末值 `qual` 取决于随机分到的任务点是否落在补给点附近 —— 原断言把
  「有没有回圆桌领过」误写成「领到的还剩几张」，2026-11-13 CI 在 `6828a82` 上以
  `progress=7 / 待领 0 / 申请单 0` 判红，属断言口径问题，非玩法回归。`claim` 事件由 `grantQual` 记账，是行为真靶点。
- **读数变化**：隔离探针（同一页面连跑 AIQN 用例）**60 次 60 过**，恒为 `progress=7 / claims=2 / qual=1`；
  全套实跑 `920 通过 / 3 失败`（3 条均命中 `tests/flaky-assertions.txt` 已登记抖动集），
  `npm run ci:gate` **PASS**；`file:check:js` 22 文件 / 20,099 行 / 最大 `js/game.js` 12,065 行未变。
- **下一批立项依据**：等待 CI 在 `main` 复跑确认绿灯；后续若要把「AI 会在补给点花申请单」也纳入门禁，
  应另写独立用例并固定 `bullet/medkit` 初值，不并入本条。

## [未发布 · DEV 全图卡顿：底图纹理超限 + HUD/面板重排] — 2026-11-13

- **本批改动**：① 运行期把 `v4/base-lit.png`（4704×4413）预缩放到 4096×3843 的离屏副本再绘制；
  原图在副本生成后释放，`draw()` / `drawCams()` 统一走 `rtImg()`，`assets()` 仍报告源尺寸并新增 `rtW/rtH/texLimit`；
  门禁新增「运行时副本 ≤ 4096」断言。② DEV 身份/凶手标签改为离屏精灵，玩家名字量测加缓存，
  幽灵光晕改为预渲染贴图；DEV 卡片从「每 30 帧重建 innerHTML」改为一次性建卡 + 原地改文本 + 墙钟 500ms 刷新；
  ③ `syncHud` 缓存节点并只在值变化时写 DOM，避免每帧重排。
- **读数变化**：`npm run ci:gate` **923 通过 / 0 失败**（2026-11-13 实跑）；`npm run t3:check`
  **13 PASS / 0 WARN / 0 FAIL**；`npm run guard` PASS（279 文件 / 45.75 MB）；`node tools/assets-check.cjs` 0 缺失；
  `npm run agent:contract` PASS。性能实测（1920×1080 dpr2 · 4× CPU 降速 · DEV + 8 幽灵）：
  6 轮中 4 次单帧 >120ms（最坏 1001ms）→ **0 次**；布局次数 **440 → 23 / 6s**，布局耗时 **0.407 → 0.022s / 6s**，
  帧均值 **13.7 → 11.0ms**。另登记 2 条既有 AI 随机抖动（`目击案发时在别处` / `异形后手表态`）：
  前者 24 次单用例探针 23 过 / 1 次净嫌疑 0.591（`alibi_clear` 已命中、`accuse=null`），
  后者单用例 30 次 30 过、全套实跑偶发 2/4 不跟靶；两者均非本批逻辑回归，
  而是帧时序变快后 AI 随机流位置变化触发的既有概率分支。
- **下一批立项依据**：3D 分支同步本次 `js/game.js` 与 `3d/preview/data/rules.json` 源哈希；
  继续评估把静态底图/房间遮暗层做视口级离屏缓存，进一步降低 DEV 全图模式的每帧合成成本。
  公开依据：`docs/ASSET_GOVERNANCE.md` §14.4「Canvas 大图预缩放」「Canvas 尺寸上限」「大图超纹理上限的实测症状」。

## [未发布 · AI 读区收口：tests/ 收容 + README/CHANGELOG 分卷] — 2026-11-13

- **本批改动**：① README 缩到一页（项目结构/门禁清单拆到 `docs/README-details.md`，不默认读）；
  ② `AGENTS.md` 新增 §零「AI 读取边界」作为读区唯一真源，默认不读 tests/reports/assets/android/历史分卷；
  ③ `CHANGELOG.md` 只留最新 6 批 + 索引，2026-11 其余 90 批 → `docs/changelog-history-2026-11.md`，
  2026-10 及更早 9 批 → `docs/changelog-history-2026-10.md`；`tests/check-t3.cjs` 的 C4/C5 改为同时解析三份；
  ④ T3 可执行测试/夹具/报告/plate 收进 `tests/`（test-v3、monte-carlo、map-check、ci-gate、check-t3、
  check-agent-contract、flaky、plate、reports、mc-results.json.gz）；`package.json`、`tools/ship.cjs`、
  `.github/workflows/deploy.yml`、AGENTS/docs 路径同步；`tests/screenshots`/日志/默认输出加入 .gitignore。
  ⑤ `npm run agent:contract:write` 同步 §一 路径，红线契约 PASS。
- **读数变化**：`npm run ci:gate` **922 通过 / 0 失败**（2026-11-13 实跑）；`npm run t3:check`
  **13 PASS / 0 WARN / 0 FAIL**；`npm run guard` PASS；`node tools/assets-check.cjs` 0 缺失；
  `npm run agent:contract` PASS；主仓 tracked **383 文件 / 49 MB**。
- **下一批立项依据**：美术管线（`tools/blender-*.py` / `gen-*.py` / `master-sfx.py`）、`android/` 平台壳、
  `assets/portfolio` 与未引用 `assets/scene/{rooms,station,bg}` 外移到本地素材仓/发布层；
  需同步 `tools/ship.cjs`、`build-apk-assets.cjs`、`android/build.cmd` 的 `.env`/APK 路径后再跑发布链。

## [未发布 · 主仓出清：3D 资产/工具 + 素材源包 + 一次性夹具] — 2026-11-13

- **本批改动**：按 2026-11-13 用户边界执行主仓出清（T3 正式门禁留主仓）：
  ① 3D 资产 231 文件 / 99.9 MB、3D 工具 54 文件 / 0.7 MB、`3d/spec` 8 文件 / 0.1 MB
  移出 main，进 `returnlog_assets/3d/` 与 `origin/3d` 副分支；3D 分支已同步
  `js/data/map.js`、`js/game.js`、12 个 `3d/preview/data` 快照、`3d/spec/port-manifest.json`
  的 X-BIND 行段到 11947、`BASELINE.sha256.json`，远端 3D 部署提交保留。
  ② `tools/_qwen_refs` 20 文件 / 62.1 MB → 素材层 `unreferenced/qwen-refs`；
  `tools/_sfx` 184 文件 / 9.9 MB → 素材层 `referenced/audio-source`；
  `tools/master-sfx.py` 的 `RAW` 改指素材层（`RETURNLOG_SFX_RAW` 可覆盖）。
  ③ 15 个 tracked 实验/演示 + 93 个 local 截图/探针/日志/bench + 5 个 `_mc-*.json`
  → `returnlog_cleanup_20261113/quarantine/`。
  保留：T3 正式门禁、`3d/preview/data` 快照、`3d/tools/export-*.cjs` 导出链、发布链。
  `README.md` / `AGENTS.md` / `docs/workflow.md` / `package.json` / `docs/REDLINES.md` 同步。
- **读数变化**：`npm run ci:gate` **919 通过 / 3 失败**（3 条均属已登记时序抖动，PASS）；
  `npm run t3:check` **13 PASS / 0 WARN / 0 FAIL**；`npm run guard` PASS；
  `node tools/assets-check.cjs` 0 缺失；`npm run agent:contract` PASS；
  主仓 tracked **870 → 380 文件**，tracked 体积 **194 MB → 49 MB**；
  3D 分支 `0a22bcf` 已推送，`3d:port:check` 0 错误 / 1 旧警告，`3d:parity:check` exit 0。
- **下一批立项依据**：美术管线（`tools/blender-*.py` / `gen-*.py` / `master-sfx.py`）、
  `android/` 平台壳、`assets/` 二次引用审计（unreferenced/raw/portfolio）待用户逐项裁定；
  3D 分支的 3D 资产/工具已由副分支持有，主仓只留 T3 快照与导出链。


## [未发布 · 交互锚点：监控台 / 电闸贴回家具] — 2026-11-13

- **本批改动**：`js/data/map.js` 的两个静态设施锚点回到对应家具上 ——
  `facility.monitor` `(80.6,33)` → `(80.4,36.0)`（`cam_opsdesk` 主控台台面中心），
  `facility.breaker` `(50.2,54.1)` → `(49.6,57.45)`（右侧 `power_breakerbank` 电闸组前缘）。
  两者都是 2026-11-10 分支同步把掩体重排前的旧坐标带回来的回归：监控台落在房间中段、
  电闸落在变压器过道，交互提示与设施状态都悬在地面。电闸状态层（供电/断电文字、状态灯、
  闪电图标）同步改画到闸组柜面；锚点保留在闸组前缘的可行走格，暗房里的目击视线不被柜体挡住。
  另把 4 个会闪到相邻设备的任务点微调到目标家具上（均在原站位 0.4 格内，站立点 nearestFree ≤0.6 格）：
  培养罐补液→培养罐、温控面板→温控台、货架校准→货架②医疗、电路维修→电控柜。
  `tools/test-v3.cjs` 新增「26 个任务点贴家具 ≤0.6 格 / 静态设施锚点贴对应家具」断言，
  并按新锚点更新电闸目击、交互轮盘夹具；监控室夹具的任务替换位改为去重选取
  （旧写法把多个 cam 任务映射到同一个 far0，随机任务表已含 far0 时会误触 A6「任务点重复」，
  已从 `tests/flaky-assertions.txt` 移除该条假抖动）；`3d/preview/data/map.json`、`map_v2.json`
  与 `rules.json#sources` 由既有导出链重生成。
- **读数变化**：`node tests/test-v3.cjs` / `npm run ci:gate` 均 **922 通过 / 0 失败**
  （2026-11-13 实跑，控制台零报错）；监控室夹具 **20/20** 复跑无 A6；
  `tools/map-check.cjs` 设施可达 `facBad []`、任务点可达 `pointBad []`；
  另跑 **1000 局**蒙特卡洛（seed `20261113`、dt 0.1、上限 15 夜）：
  **人类 525 胜 / 52.50%（95% Wilson 49.40%~55.58%）、异形 475 胜 / 47.50%、超时 0**；
  详细表 `tests/reports/mc-1000-2026-11-13.md`，逐局 CSV `tests/reports/mc-1000-2026-11-13.csv`，
  原始局 `tests/mc-results.json.gz`（1000 行；报告是 T3 读数快照，不是基线）。
  `npm run t3:check` **13 PASS / 0 WARN / 0 FAIL**（本批收口）。
- **下一批立项依据**：掩体布局再调整时，设施锚点与「贴家具」断言必须同批改；
  3D 客户端在副分支，`3d:parity:check` 需在副分支/3D 仓执行，本仓只保证导出数据同源。


## [未发布 · 走廊灯：拐角与长段补灯 + 搜尸遮罩核验] — 2026-11-12

- **本批改动**：`js/t2/space.js#corridorLampPos` 从「每条走廊固定 2 盏（28%/72%）」
  改为「按弧长均布（上限 4.2 格）+ **每个内拐点强制一盏**」。旧实现下
  `c6`（38 格、1 个拐角）两灯相距 16.7 格、`c11`（23 格、2 个拐角）相距 10.1 格，
  而 `drawCorridorLights` 的光池半径只有 2.35 格 —— 长走廊中段和拐角必然死黑。
  灯距上限取 `2×2.35 - 0.5`，保证走廊上任意点都在光池里；配电室拉闸全熄仍由
  `G.corrLit` 控制，未改判定。
- **读数变化**：走廊灯 22 → 45 盏；沿全部 11 条走廊按 0.25 格采样，
  「到最近灯的最大距离」从 **8.4 格降到 2.00 格**（< 光池半径 2.35）。
  当批实跑：走廊采样脚本 **1 通过 / 0 失败**（11 条走廊 × 0.25 格步长，共 1,940 个采样点）。
  另核验：`playerMiniGame` 的 `NO_MG_ACT` 已含 `search`，真实按键 `S` 实测
  `me._doing='search'`、`me._mg=false`、`SKMiniGame.isOpen()=false` —— 搜尸不再弹遮罩
  （若仍在旧页面复现，是浏览器缓存，强制刷新即可）。
- **下一批立项依据**：走廊灯只影响 2.5D 渲染（3D 侧自带灯光），不产生移植项；
  3D 已按 §0.1 重跑 `baseline:sync → export:all → build-map-v2 → export:sim`，
  并重登记 `check-parity` 的 15 条源码字面量行号（`js/game.js` 因 `NO_MG_ACT` 前移 1 行）。


## [未发布 · 修复：走廊拐角黑块 + 搜尸误弹小游戏] — 2026-11-12

- **本批改动**：① 搜尸/查看伤情不再弹小游戏：`playerMiniGame` 把 `search` 加入
  `NO_MG_ACT`（与领单/补给/破坏同列），仍保留 1.2s 站桩与移动打断；新增 `_t.mgAllowed()`
  与回归断言「搜尸不弹小游戏；维修任务仍可弹」。
  ② 走廊拐角黑块：Blender 底图按段烘焙走廊地板，折点处缺角露出背景，运行时被迷雾压黑。
  `tools/blender-ship.py` 在每个折点补一块 `2CW×2CW` 同材质格栅后重烘
  `assets/scene/v4/base-lit.png`；原图备份在素材层 `unreferenced/renders/base-lit-20261112-before-corner-fix.png`。
  ③ 地道口增加暖黄呼吸指示灯：深色灯座 + 热芯 + 小范围暖光晕，按 3.6 rad/s 慢呼吸，
  不画大色框；位置在通风口边缘，随镜头缩放。
  ④ 3D 侧同步：`port-manifest` 的 X-BIND 末行更新到 11946，`3d:export:rules` 重导
  `rules.json` 源哈希，`baseline` 保持 407；3D 自身无 `search` 小游戏入口，不需改判定。
- **读数变化**：`npm run ci:gate` **920 通过 / 0 失败**；T3 **13 PASS / 0 WARN / 0 FAIL**；
  `guard` PASS；3D `check` **7/0**、`baseline` **407 OK**、`docs:check` PASS。
- **下一批立项依据**：走廊补角只处理折点地面；若后续新增斜廊/非 90° 折角，需按同一
  `2CW×2CW` 口径检查底图与碰撞；搜尸策略不扩展到其他站桩动作，除非用户另行裁定。


## [未发布 · 产物出仓：截图 / Godot 缓存 / 重复素材] — 2026-11-12

- **本批改动**：把纯产物与重复素材移出项目仓库，共 **3,336 文件 / 约 1.13 GB**：
  2.5D `tools/screenshots`（16 MB）、`3d/preview/.godot`（383 MB）；
  3D `3d/preview/screenshots`（85 MB）、`3d/docs/audit/player-study-20261112`（24 MB）、
  `3d/preview/.godot`（544 MB）、`assets/qwen-lib` 的 41 张 PNG 镜像（79 MB）。
  截图与缓存进入素材层 `screenshots/`、`caches/`；3D `.godot` 用目录联接（junction）指向
  `caches/godot-3d`，运行时照常读取。3D `assets/qwen-lib` 只留 README 与素材库清单，
  `baseline` 相应重建为 **407**；`PLAYER_STUDY_20261112.md` 的截图路径改指素材层。
- **读数变化**：T3 **13 PASS / 0 WARN / 0 FAIL**；`guard` PASS；3D `check` **7/0**、
  `simtest` **26/0**、`navtest` **28/0**、`tasktest` **26/0**、`baseline` **407 OK**、
  `docs:check` PASS；Godot 无头冒烟 exit 0。
- **下一批立项依据**：`unreferenced/` 中过期副本尚未永久删除，需用户逐项确认；`caches/godot-3d` 是运行时依赖，不得直接清。

