# 修改记录（CHANGELOG）

> **架构节点**（2026-11-04 · 按根 `ARCHITECTURE.md` 贴标）：本文件属 **第 3 层 T3 验收层 · 增量台账**；`flag: F`。
> 每条批次固定三段：**本批改动 → 读数变化 → 下一批立项依据（用户裁定后填）**。台账只记录「改了什么 → 读数怎么变」，不写「某读数 > 0 算通过」；历史条目只标注不删除。

本文件记录《新返航录》试玩版的所有可见变更。版本口径：**返航录V3.7**。
格式参考 Keep a Changelog；日期使用本地时间（Asia/Shanghai）。

> **按月索引（2026-11-12）**：2026-11 为当前月（本文件）；2026-10 及更早批次按 §4.4 原样保留在本文件下方，只标注不删除。
> 本仓暂不按月切文件：`tools/check-t3.cjs` 的 C4/C5 逐批解析本文件，移走历史批次会破坏「只标注不删除」的可核性；
> 3D 仓已按 `3d/CHANGELOG.md`（索引）→ `3d/CHANGELOG-2026-11.md` 的口径切分。

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

## [未发布 · T3 收口：C7b 重导 + C4/C5 补记] — 2026-11-12

- **本批改动**：按红线 11 重导 `map_v2`：2.5D/3D 均从 `js/data/map.js` 生成，运行字段
  `cover 123 / points 26/26 / facility 6/6` 与真源逐值一致；`3d/tools/build-map-v2.cjs` 同步为
  「cover 取 map.js、decor 取 3D 墙面美术」版本。T3 C7b 改为只对账运行字段，
  `decor 40 件`归 3D 墙面美术（已写入 `parity-map#allowed_differences`），`layout-v2` 明确为方案层留档。
  C4/C5：为 32 个历史缺段批次补齐三段式标题，为 9 个无实跑读数的段补「未跑/沿用」说明，
  原文不改、不伪造读数。
- **读数变化**：T3 **13 PASS / 0 WARN / 0 FAIL**；`guard` PASS；3D `check` **7/0**、
  `simtest` **26/0**、`navtest` **28/0**、`tasktest` **26/0**、`baseline` **448 OK**、`docs:check` PASS。
- **下一批立项依据**：`3d/spec/*` 过期副本；`layout-v2` 若后续要退出方案层，需单独裁定。

## [未发布 · 同步映射：T3 C6 源哈希漂移清零] — 2026-11-12

- **本批改动**：按现行 `3d/PORTING_PROTOCOL.md`、`docs/PORTING_CONTRACT.md §1`、
  `3d/HANDOFF.md §0.1` 与 `docs/agent/acceptance.md` 执行上游同步映射。先通读两仓最新规范
  （14:13–14:19 收敛版：`AGENTS.md` §一/§三、`PORTING_PROTOCOL` §2/§3/§6、
  `PORTING_CONTRACT` §1–§4、`docs/agent/acceptance.md`、`3d/docs/README.md`、
  `3d/HANDOFF.md` §0、`3d/spec/conventions.md`、各 `docs/agent` 分册、`BASELINE.md` / `SPLIT.md`），再动手。
  `js/game.js` 本批 +5 行（`click` 音效接线）使 `3d/preview/data/rules.json#sources` 的
  `js/game.js` 指纹由 `06d1546e1a89` 漂到 `ec9c823a8c66`（T3 C6 WARN）。
  在本仓重跑 `npm run 3d:export:rules` / `npm run 3d:export:space`，只更新 `sources` 指纹，
  48 张规则表 / 常量 / 数值逐字段未变；**未动** `js/`、`index.html`，
  **未动** `map_v2.json` / `layout-v2.json`（C7b 属 §8 已登记存量债 M2，需用户裁定）。
  共享规范镜像 `docs:sync` 经 `docs:check` 校验已 PASS，未重复生成。
- **读数变化**：`npm run t3:check` **PASS 9→10 / WARN 4→3 / FAIL 0**（C6 转
> **读数补记（2026-11-12）**：本次实跑 T3 10 PASS / 3 WARN / 0 FAIL；历史原文保留。
  `rules.json#sources 6 个源文件哈希全等`）；`npm run guard` PASS。
  本批 `game.js` 改动为音效表接线，不产生新规则函数，`gameplay-parity.json` 映射条目无需新增。
- **下一批立项依据**：C7b（`map_v2` / `layout-v2` 旧快照，cover 123→127）与 C5（8 处历史读数段）
  为 §8 已登记存量债，需用户裁定后再按数据链顺序处理；不得靠加豁免消除 WARN。

## [未发布 · 素材库二次分类：referenced / unreferenced] — 2026-11-12

- **本批改动**：素材层按「当前脚本 / 构建是否实际读取」拆为两个库：
  `returnlog_assets/referenced/`（qwen-lib 43 + scene-v4-tex 3 + 2.5d-preview-textures/qwen 103 文件，共 258 MB）
  与 `returnlog_assets/unreferenced/`（qwen21 参考图、过期 models / textures / preview-assets，共 482 MB）；
  发布包移到 `release/web-assets.tar.gz`。只被人类参考或只被生成脚本写入的文件一律归 `unreferenced`。
  `asset-layer-manifest.tsv` 的 2,234 条 `dest` 全部改到新路径并逐条校验存在。
- **引用同步**：`blender-ship.py` 读 `referenced/qwen-lib`、`referenced/scene-v4-tex`、
  `referenced/2.5d-preview-textures/qwen`；`gen-materials.py` / `blender-fx.py` /
  `gen-{hires,sdxl}-skins.py` 同步；`gen-art-refs.ps1` 写入 `unreferenced/qwen21`。
  3D `baseline:sync` 拉入 4 个镜像文件，基线仍 **448**。
- **读数变化**：T3 **10 PASS / 3 WARN / 0 FAIL**；`agent:contract` PASS（`6df0f075a21422b9`）；
  `guard` PASS；`assets-check` 0 缺失；3D `check` **7/0**、`floor:check` 11 项、
  `baseline` **448 OK**、`docs:check` PASS。
- **下一批立项依据**：`3d/spec/*` 过期副本、`assets/scene/v4/facility/_raw*` 中间产物仍待判定。
- **引用复核（2026-11-12）**：`npm test` **919 通过 / 0 失败、控制台零报错**；逐路径反查确认 2.5D 运行时只读 `v4/tex/door-panel.png`，`3d/preview/assets/*` 与 `qwen-lib` 无运行时读取；移出的重名文件在 `audio/`、`assets/minigame/`、`assets/scene/cozy/` 各有真实运行时副本。
  `gen-armory-deck.py` 改为写 `referenced/2.5d-preview-textures`，`gen-qwen-room-skins.ps1` 改为写 `unreferenced/qwen21/3d`，避免下次生成落回旧目录。

## [未发布 · 预览件清空 + v4 tex 源贴图出仓] — 2026-11-12

- **本批改动**：2.5D `3d/preview/assets/{audio,crew,plates,import-probe}` 51 文件 / 3.8 MB 移入
  素材层 `returnlog_assets/2.5d-preview-assets/`；该目录只剩 `licenses/`（署名不可删）。
  `assets/scene/v4/tex/` 的 3 张烘焙源贴图（`ao-soft` / `floor-grate` / `wall-panel`）移入
  `returnlog_assets/scene-v4-tex/`；运行时只保留 `door-panel.png`。
  `assets/MANIFEST.json` 移除 3 条（3 → 0），`assets-check` **0 缺失**。`tools/blender-fx.py`、
  `tools/gen-materials.py`、`3d/tools/gen-{hires,sdxl}-skins.py` 与 `assets-check` 提示改为素材层路径；
  3D `baseline:sync` 拉入 6 个镜像文件。
- **读数变化**：T3 **10 PASS / 3 WARN / 0 FAIL**；`agent:contract` PASS（`6df0f075a21422b9`）；
  `guard` PASS；3D `check` **7/0**、`floor:check` 11 项、`baseline` **448 OK**、`docs:check` PASS。
- **下一批立项依据**：`3d/spec/*` 过期副本与 `assets/scene/v4/facility/_raw*` 等中间产物仍待判定；
  素材层累计 785 MB，逐文件见 `asset-layer-manifest.tsv`。

## [未发布 · 素材源出仓：models + qwen-lib] — 2026-11-12

- **本批改动**：2.5D `3d/preview/assets/models/` 整份过期副本（1,672 文件 / 141 MB）与
  `assets/qwen-lib/` 千问烘焙源材质（43 文件 / 79 MB）移入素材层
  `returnlog_assets/models/2.5d-preview-stale/` 与 `returnlog_assets/qwen-lib/`。
  `assets/MANIFEST.json` 同步移除 40 条 qwen-lib 条目（43 → 3），`assets-check` **3/0 全匹配**。
  `tools/blender-ship.py` 与 `3d/tools/build-3d-assets.py` 改为**优先读素材层**
  （`RETURNLOG_ASSET_LAYER` 可覆盖，保留仓内回退）；治理规范附录 B / L1 示例同步。
- **读数变化**：T3 **10 PASS / 3 WARN / 0 FAIL**；`agent:contract` PASS（`6df0f075a21422b9`）；
  `guard` PASS；3D `check` **7/0**、`baseline` **448 OK**、`docs:check` PASS。
- **下一批立项依据**：2.5D `3d/spec/*` 过期副本、`3d/preview/assets/{audio,plates,crew}` 等剩余
  过期预览件仍未处理；`assets/scene/v4/tex` 属运行/源混合，需单独判定。

## [未发布 · 贴图出仓：过期副本与参考图移入素材层] — 2026-11-12

- **本批改动**：2.5D `3d/preview/assets/textures/` 整份过期副本（232 文件 / 253 MB）与 `docs/qwen21/`
  （89 文件 / 118 MB，原 88 个 tracked）移入素材层 `C:\Users\ASUS\Documents\returnlog_assets\`
  （`textures/2.5d-preview-stale/`、`qwen21/2.5d/`）；`assets/MANIFEST.json` 同步移除 28 条预览贴图条目
  （71 → 43），`node tools/assets-check.cjs` **43/0 全匹配**。`gen-art-refs.ps1` 的留档目标改到素材层，
  避免下次生成又把 `docs/qwen21/` 落回仓库。3D 仓同步移出 `docs/qwen21/`（83 文件 / 104 MB）与
  **零引用运行贴图** 6 张根图 + 旧 `panel/`（共 64 文件含 `.import`）；被引用的 131 张运行贴图保持原位。
- **读数变化**：T3 **10 PASS / 3 WARN / 0 FAIL**；`agent:contract` PASS（`6df0f075a21422b9`）；
  `guard` PASS；3D `check` **7/0**、`floor:check` 11 项、`baseline` **448 OK**、`simtest` **26/0**、
  `docs:check` PASS。
- **下一批立项依据**：2.5D `3d/preview/assets/models/`（141 MB）与 `assets/qwen-lib/`（79 MB）仍是
  待判定素材；`3d/spec/*` 过期副本仍未处理。素材层逐文件 SHA256 见 `returnlog_assets/asset-layer-manifest.tsv`。

## [未发布 · 文档分类收缩：docs 扁平化 + 单一引用源] — 2026-11-12

- **本批改动**：`docs/agent/` 扁平化——`acceptance.md` / `REDLINES.md` 移到 `docs/`，
  `commands.md` + `process.md` 合并为 `docs/workflow.md`；`BRANCHES.md` 并入 README「附录：分支模型」；
  `ASSET_LAYERS.md` 并入 `docs/ASSET_GOVERNANCE.md` 附录 B；`PORTING_CONTRACT.md` 删除（统一指向
  3D 仓 `PORTING_PROTOCOL.md`）；`_planned/` 5 份、`_reference/` 1 份归档；空目录
  `_proposals/` / `_reference/` / `_planned/` / `agent/` 移除。工具同步：
  `check-agent-contract` / `check-t3` / `asset-guard` / `deploy-config` 路径更新，T3 历史分册豁免取消。
- **读数变化**：T3 **10 PASS / 3 WARN / 0 FAIL**（C3b 由「历史分册」转为归档口径）；
  `agent:contract` PASS（`6df0f075a21422b9`）；`guard` PASS；3D `check` **7/0**、
  `baseline` **448 OK**、`docs:check` PASS。
- **下一批立项依据**：2.5D `3d/spec/*` 仍是过期副本（本轮按文档范围未动）；贴图管线文档
  （`3d/WORKFLOW_SDXL_BLENDER.md`、`tools/ship-layout-plan.md`）按用户指示暂缓。

## [未发布 · 文档二次清理：过期 3d 快照 + 平衡报告] — 2026-11-12

- **本批改动**：再清 21 件——2.5D `3d/` 8 份过期快照文档（`ARCHITECTURE` / `ASSETS` / `CHANGELOG` /
  `DECISIONS` / `HANDOFF` / `MIGRATION` / `README` / `spec/conventions`）与 `tools/_mc-*.md` 10 份平衡调研报告、
  3D `docs/handoff/HANDOFF_2026-11-11.md`（增量先并入 `3d/HANDOFF.md` §0.9）、过期快照
  `docs/audit/REDLINE-AUDIT.md`（结论已被后续批次推翻）、迁移施工单 `docs/migration/MIGRATION.md`
  （含失效平衡读数，边界与批次已由红线 11 / `PORTING_PROTOCOL` / CHANGELOG 取代）；
  全部先备份再移入仓外隔离区，
  **未永久删除**。2.5D `3d/` 只保留共享侧（`preview/data`、`tools`、`assets`）与 `WORKFLOW_SDXL_BLENDER.md`
  （贴图管线，按用户指示本轮不动）。活引用统一改为「3D 仓 `3d/...`」；`PORTING_CONTRACT` 的允许差异收回
  红线 11 三类（补「维度」、删掉错误的「性能」类），并去掉已删报告指针。红线 14 的边界指针补「3D 仓」限定，
  两仓同步；3D `HANDOFF` 的读数段改为指针（读数只在当月 CHANGELOG 声明）。
- **读数变化**：T3 **9 PASS / 4 WARN / 0 FAIL**；`agent:contract` PASS（`6df0f075a21422b9`）；
  `guard` PASS（45.57 MB）；3D `check` **7/0**、`baseline` **446 OK**、`docs:check` PASS。
- **下一批立项依据**：2.5D `3d/spec/*` 仍是过期副本（本轮按「文档」范围未动），下一步判定是否移出 `main`
  或改为只从 3D 仓读取；`tools/ship-layout-plan.md` 属贴图管线，按用户指示暂缓。

## [未发布 · 报告清理（T3 保留，报告删除）] — 2026-11-12

- **本批改动**：删除 2.5D 22 件报告类文件（19 份带日期 md + `docs/agent/baseline-history.md` +
  `tools/mc-results*.json.gz`）与 3D 19 件（`3d/preview/reports/` 5、`3d/reports/` 10 份生成报告、
  `AUDIT_CORE_MECHANICS*` 2、`资产耦合图谱_20261112.md`、`baseline-history-3d.md`）；另清 5 件历史/退役件
  （2.5D `docs/agent/architecture.md` / `filemap.md` / `_proposals/G1/ARCHITECTURE.md`；3D
  `WORKFLOW_SDXL_BLENDER.md` / `PLAN_INPUT_COMBAT_UI_20261111.md`）。合计 **46 件**；全部先备份再移入
  仓外隔离区，**未永久删除**。T3 保留；`check-t3.cjs` 的 C3b 改为「历史分册已清理」PASS。
  共享规范改为自动生成：2.5D `agent:contract:write` 生成 `REDLINES.md`；3D `docs:sync` / `docs:check`
  从 2.5D 生成 `REDLINES.md` / `ASSET_GOVERNANCE.md`，CI 已接入 `docs:check`。
  回退上一轮重复：红线 11 的两句行为等价/唯一机制来源、`PORTING_PROTOCOL §2.1` 矩阵、
  `gameplay-parity#exclusion_rules` 已撤；行为夹具要求只保留在 `PORTING_PROTOCOL §3.1`。
- **读数变化**：T3 **9 PASS / 4 WARN / 0 FAIL**；`agent:contract` PASS（`06808672577fe06d`）；
  `guard` PASS；3D `check` **7/0**、`baseline` **446 OK**、`docs:check` PASS、`guard` PASS。
  工作区 tracked 删除 46 件（`git status` 为 `D`）。
- **下一批立项依据**：继续 4 个 pending + 鬼魂模式 / 医疗无人机救起；3D `ASSET_LAYERS` 只留本地附录，
  共享表不再手改。

## [未发布 · 红线行为等价 + 3D 任务提示照搬（接 P1/P3）] — 2026-11-12

- **本批改动**：
  ① 红线 11 增两条硬约束：**行为等价**（3D 输出集合 / 顺序 / 提示文案 / 过滤条件必须同 2.5D；禁止新增
     提示、过滤、默认值、兜底文案；`adapter` 必须有 `@src` + 行为夹具）与**唯一机制来源**
     （2.5D `js/` 是唯一机制来源；3D 的 `docs/` 与 GDScript 不得另立第二份规则）。两仓 `AGENTS.md` +
     `docs/agent/REDLINES.md` 同步，契约哈希 `935f2f9741432e44`。
  ② 3D 任务提示照抄 2.5D：`main.gd:_collect_offers` 先求 `nearest_task_dev`，正常玩法只保留最近且
     `sim.can_do_task()` 为真的任务点；非自己任务不再生成「查看（不是你的任务）」offer；
     `_sim_gate=false` 仅 devicetest / e2e / tasktest 全开。`--tasktest` 新增「非自己任务不出提示 /
     自己的任务有提示」回归。
  ③ 排除项审计：`sabTick` / `recordFrame` / `replayData` / `envNotice` 从 `not-applicable` 纠正为
     `pending`（机制缺口）；`gameplay-parity.json` 加 `exclusion_rules` 与 `budget_note`，
     `budget.pending` 0→4；`PORTING_PROTOCOL` 加 §2.1 排除项矩阵与 §3.1 行为夹具条款；
     `PARITY_DECISIONS` 加 §6 / §6.1。
- **读数变化**：`--tasktest` **26 点 / 0 失败**（非自己任务 2 不出提示 / 自己的任务 0 有提示）；
  `--devicetest` pass（27 设备 / 14 玩法）；`--interacttest` pass（电闸 / 圆桌 / 管道 / 轮盘）；
  `audit:parity --strict` **未映射 4 / 守卫 0 / 写入 0 / 3D 独有 0 / 漂移 0**（pending 4 为如实登记，
  预算已同步）；3D `check` **7/0**、`baseline` **446 OK**、`guard` PASS；
  2.5D `t3` **9 PASS / 4 WARN / 0 FAIL**、`agent:contract` PASS（`935f2f9741432e44`）。
- **下一批立项依据**：按红线 11 照搬剩余机制缺口，顺序：① 4 个 pending
  （`envNotice` / `sabTick` / `recordFrame` / `replayData`）；② 鬼魂模式 + 医疗无人机救起；
  ③ AI 认知 / 社交 / 异形编排与会议白天链；④ 其余 partial。每项必须有 `@src` + 行为夹具；
  美术 / 输入 / 维度按 §2.1 排除，不混入。

## [未发布 · P1 CI 门禁 + P3 3D 文档收敛（接 P0）] — 2026-11-12

- **本批改动**：
  ① P1 CI：`.github/workflows/deploy.yml` 增加 `pull_request` 触发与 `behavior-gate`（Windows Edge）：
     `ci:gate`（test-v3 + 已登记抖动白名单）→ `t3:check` → `agent:contract` → `guard`；
     `deploy` 改为 `needs: [gate, behavior-gate]` 且只在 push 时执行。新增 `tools/ci-gate.cjs`、
     `tools/flaky-assertions.txt` 与 `npm run ci:gate`：解析 test-v3 的汇总行 + FAIL 行，未登记失败一律红，
     命中抖动集超过 6 条也按回归处理。
  ② 3D CI：新增 `.github/workflows/check.yml`（push/PR master）：`npm run check` + `baseline:check` +
     `agent:contract` + `guard`。
  ③ 3D 门禁转绿：受控重导 `3d:export:rules` 与 `3d:export:space`，逐字段对比确认只有 `sources` / meta 变化，
     规则值与常量未变；`3d:parity:check` FAIL → PASS，`audit:parity` 漂移 0，3D `npm run check` 6/1 → 7/0。
  ④ P3 文档收敛：`3d/` 根 md 18 → 8（4 核心 + 3 登记表 + 当月台账）；11 份专题件 `git mv` 到
     `3d/docs/{migration,handoff,audit,art,plan}/`（未删除），新增 `3d/docs/README.md` 索引；
     `PARITY_REPORT.md` / `parity-report.csv` / `PARITY_SUGGEST.md` 移到 `3d/reports/` 并改生成器输出路径；
     3D CHANGELOG 切为 `3d/CHANGELOG.md`（索引）+ `3d/CHANGELOG-2026-11.md`（78 批）；
     2.5D CHANGELOG 保留单文件并加按月索引（C4/C5 逐批解析，移走历史批次会破坏「只标注不删除」）。
  ⑤ 红线 11 落地检查路径改为 `3d/PORTING_PROTOCOL.md` §6（3D 仓的 `MIGRATION.md` 已归档到 `3d/docs/migration/`），
     两仓 AGENTS + REDLINES 同步，契约哈希 `06808672577fe06d`。
- **读数变化**：`ci:gate` 三次实跑 **915 通过 / 4 失败 → 916 通过 / 3 失败 → 919 通过 / 0 失败**；
  前两轮失败集不同（拖尸 0.00 / 藏尸×2 / 监控台交互），第三轮 0 失败；白名单只收已登记的 11 条标签，
  未登记失败仍红，命中超过 6 条也按回归处理。
  `t3:check` **9 PASS / 4 WARN / 0 FAIL**（C4 32/67、C5 8、C6 main 的 `3d/preview/data/rules.json` 旧快照、
  C7b `map_v2` 旧快照）；`agent:contract` **PASS**（14 条 / `06808672577fe06d`）；
  `guard` **PASS**（280 文件 / 45.57 MB）；3D `check` **7 通过 / 0 失败**、`baseline` **446 OK**、
  `audit:parity` **漂移 0**、`guard` **PASS**（45.59 MB）。
- **下一批立项依据**：待用户裁定 —— ① P2 重导 `map_v2` / `layout-v2` 与 main 的旧 `3d/preview/data/rules.json`
  快照，消除 C6/C7b；② 3D `3d/assets/export` 与 `3d/preview/assets/models` 的 GLB 去重；
  ③ L2 `docs/qwen21` 与 `3d/preview/screenshots` 按 14 天保留期逐项退役；④ 3D CI 接入 Godot 无头自测聚合。

## [未发布 · P0 事实纠偏（文档与红线口径，不改逻辑/数值）] — 2026-11-12

- **本批改动**（用户裁定「先把 P0 修复一下」；只改文档与一处代码注释，**未改 `js/` 逻辑、数值、地图数据**）：
  ① 红线 13 的分支名从已删除的 `v1-preview` 改为「2.5D 仓 `3d`；独立仓 `returnlog-3d` 的 `master` 为镜像」；
     两仓 `AGENTS.md` 与 `docs/agent/REDLINES.md` 同步，契约哈希 `52beafb8ebff8a1f`；
  ② `AGENTS.md` 头部删除对已废弃 `tools/mc-report.md` 的台账引用，改为 `CHANGELOG.md` 最新批次；
     `§二命令 / §五改动流程` 改为指向 `docs/agent/commands.md`、`filemap.md`、`process.md`；
  ③ 3D 文档：`3d/README.md` 的「完整功能移植 / 7/0 / parity 0 WARN」改为指针 + 已知缺口；
     2.5D 版本 3.6.0 → 3.7.0；`v1-preview` → `3d`；掩体 59 → 123；`AGENTS.md §五.8` → `docs/agent/process-3d.md` §8；
     `3d/HANDOFF.md` 的 7/0、77 个未提交、6 项门禁改为指针 / 7 项，§五.6/7/8 → `process-3d.md` §6/7/8；
     `3d/REDLINE-AUDIT.md` 加 2026-11-12 复核（当前 6/1、446 OK，红线 1–12 审查范围）；
  ④ 根 `README.md` 的「SDXL / 千问均可」改为「2026-11-09 收紧为千问唯一，SDXL 已退役」；
     `docs/agent/architecture.md` 的准-确证门槛 0.35/0.40 → 0.5/0.5（真源 `js/ai/sanity.js`）；
     `docs/agent/filemap.md` 的 `mc-report.md`「当前权威基线」改为「历史条目（已废弃）」；
     `js/data/map.js:8` 注释 12/15/8 → 4–10（**仅注释，未改 points[].dur**）。
- **读数变化**：本批未改逻辑/数据（`map.js` 仅注释），按红线 4 的适用边界**不重跑主门禁**；
  审计期同机两次实跑为 **918 通过 / 1 失败** 与 **919 通过 / 0 失败**，失败项不复现，属已登记时序抖动
  （`docs/ASSET_CLEANUP_LOG.md:40`）。
  本批实跑：`npm run t3:check` **9 PASS / 4 WARN / 0 FAIL**（C4 32/65 缺段、C5 8 条、C6 `js/game.js` 漂移、
  C7b `map_v2` 旧快照，均为 §8 已登记）；`npm run agent:contract` **PASS**（14 条 / `52beafb8ebff8a1f`）；
  `node tools/map-check.cjs` unreachable / patrolBad / pointBad / facBad 全空（gaps 192 / dead 24 存量）；
  `npm run guard` **PASS**（280 文件 / 45.57 MB）；3D 仓 `npm run check` **6 通过 / 1 失败**
  （parity 源哈希漂移，待 P2 重导）、`baseline:check` **446 OK**、`agent:contract` **PASS**、`guard` **PASS**（45.59 MB）。
- **下一批立项依据**：待用户裁定 —— ① P2 重导 3D 数据链（`export:all` + `build-map-v2`，消除 C6/C7b 与 parity FAIL；
  `SPLIT.md` §5.1.1 已警告会同时改 7 份契约）；② P1 把 `test-v3` / `t3:check` / `guard` 接进 CI；
  ③ main 的 `3d/` 只留 data/spec/tools（`.godot` 383 MB、`preview/assets` 397 MB 先审计再移出）；
  ④ qwen21 按 14 天保留期逐项退役。裁定前不自动删除/移动资产。

## [未发布 · T3 验收层规范落地（真源/读数分离 · 单一现值 · 留痕可核）] — 2026-11-12

- **本批改动**（用户裁定「规范一下验收层，这些东西基本上都是验收层的问题」；
  **未改 `js/` 游戏逻辑、数值真源与地图真源**，不动平衡数值）：
  ① `ARCHITECTURE.md` §4 从「一行定义」扩为 T3 三条硬规矩（真源 / 读数分离 · 单一现值 · 留痕与同步可核），
     §8 补三条禁止边：不得把 T3 台账抬为真源、不得多处声明现行基线、不得写未经文件证据复核的「已同步」；
  ② 新增 `docs/agent/acceptance.md`（T3 执行规范，现行分册）：资产清单、三段式与读数留痕、
     基线登记、导出快照对账流程、体检分级，以及 §8 存量债台账（N1–N9 / M1–M6 共 15 项）；
  ③ 新增 `tools/check-t3.cjs`（只读体检，PASS / WARN / FAIL 分级 + `--strict`），
     `package.json` 加 `t3:check` / `t3:check:strict`；**不接入** `tools/test-v3.cjs`，不影响主门禁全绿要求；
  ④ 口径回写：`AGENTS.md` 头部删除「`mc-report.md` 是数值基线唯一真源」与 899/0、838/0 两个「现值」声明，
     统一为「真源在 T2 `js/` 模块、现行基线只在 CHANGELOG 最新批次声明一次」；`README.md` 蒙特卡洛段
     改为历史读数并标注 `mc-report.md` 已废弃；`docs/agent/baseline-history.md` / `filemap.md` 加 §5.4
     头部指针（历史原文逐字搬迁，不改写正文）；`AGENTS.md` 接手顺序 / 分册索引 / 检查清单同步登记。
     **`AGENTS.md` §一 红线逐字未动**，红线契约哈希保持不变；
  ⑤ 存量债**只登记、不擅自改写**：11-07 准-确证回调漏登（N1）、`map_v2.json` 同步声明不成立（M1）、
     3D 导出冻结（M2）、`map.js:8` 注释过期（M3）等列入 §8 待用户裁定，**未追认任何历史读数**。
- **读数变化**：本批未改 `js/` 逻辑与数据，按红线 4 的适用边界**不重跑主门禁、不产生新胜率读数**；
  验收层体检 `npm run t3:check` 实跑 **9 PASS / 4 WARN / 0 FAIL**（常规模式退出 0）；
  `npm run t3:check:strict` 实跑退出 1（4 条存量 WARN 按严格模式计失败，符合设计）。
  4 条 WARN 全部为 §8 已登记存量债：三段式形式缺段 32 批（C4）、读数段缺当批实跑读数 8 批（C5）、
  `rules.json#sources["js/game.js"]` 哈希漂移（C6，11-12 未提交改动所致）、`map_v2/layout-v2` 旧快照（C7b）。
  旁证实跑：`npm run agent:contract` **PASS**（§一 14 条 / 哈希 daad02bcf5a37320 与校验基准一致）、
  `npm run guard` **PASS**（发布包 280 个 / 45.57 MB，6 个大图为 P4 存量 WARN）、
  `node tools/map-check.cjs` unreachable / patrolBad / pointBad / facBad 全空（gaps 192 / dead 24 存量未清）。
- **下一批立项依据**：待用户裁定 —— ① `docs/agent/acceptance.md` §8 十五项存量债的处置顺序
  （优先 N1 补登 11-07 批次、M1 更正同步声明、M2 重导 3D 导出、M3 修 T2 注释）；
  ② 两套台账（主 CHANGELOG / `3d/HANDOFF.md`）门禁与胜率序列是否并表（N4）；
  ③ 11-12 工作区未提交改动结账后重跑 `3d:export:rules` 消除 C6 漂移（N8 / C6）；
  ④ 存量三段式与读数段是否按新规范回补（N5 / N6）。裁定前不自动回写历史台账。

## [返航录V3.7 · 2026-11-11 · 工程治理与资产清理]

- **本批改动**：
  ① 存储与资产治理规范落地两仓：`docs/ASSET_GOVERNANCE.md`（六层资产模型 / 配额 / 保留期）、`docs/ASSET_LAYERS.md`、`docs/ASSET_CLEANUP_LOG.md`；
  ② 发布白名单收敛为单一真源 `tools/deploy-config.cjs`，补齐 `assets/qwen-lib/*.png` 与 `_raw_fx/` 排除，发布包 124.85 MB → 45.59 MB；
  ③ 新增 `tools/asset-guard.cjs`（体积 / 污染 / 大图 / 超期门禁）与 `tools/check-agent-contract.cjs`（红线契约校验）；
  ④ `AGENTS.md` 精简为「红线 + 硬约束 + 检查清单 + 分册索引」，原文逐字迁入 `docs/agent/`；两仓 §一 红线补齐为 14 条并哈希对齐；
  ⑤ 清理过期缓存 / 退役备份 / 调试输出 3,381 个文件（1,383.78 MB），原件入隔离区可还原；Godot 导入缓存误清已完整回滚并列为运行时依赖例外；
  ⑥ 版本号 3.6.0 / 返航录V3.6 → 3.7.0 / 返航录V3.7；
  ⑦ 分支模型确立：`main` = 2.5D 主分支、`3d` = 3D 副分支（V1P-0.2）、`form-ui-original` = 表单式长期副分支、`过渡版` 归档；新增 `docs/BRANCHES.md` 登记，删除已合并的 `v1-preview` 远端分支。
- **读数变化**：发布包 124.85 MB → 45.59 MB；主仓工作区减 857.83 MB；两仓红线 14 条三方哈希一致；`guard` / `agent:contract` / `baseline:check` 全 PASS。
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
- **下一批立项依据**：待用户裁定（P4 运行时大图压缩是下一个能显著降包的方向）。

## [未发布 · 玩家发言模板对齐 parseSpeech + 六类证据 / 时段] — 2026-11-11

- **本批改动**（用户要求把玩家发言模板与 AI 实际能识别的模板对齐并扩展，2D / 3D 同批）：
  ① `js/game.js#meetTemplateText` 从 8 类扩到 **11 类**：补齐 `parseSpeech` 六类直接证据
  中缺的 `saw_sabotage`（破坏设备）/ `saw_bot`（机器人停摆）/ `saw_breaker`（拉闸）；
  新增 `parseSpeech` 的 `when` 槽对应时段（不指定 / 刚才 / 整晚），只作用于「我在… / 不是我」。
  ② **证据模板空舱室不再注入玩家当前舱室**：点击层只有口供类才回落当前舱室；
  管道模板仍只在真有管道口的舱室附带地点。
  ③ **「不是我，我在 X」不再被自述位置分支截走**：`playerTalk` 的 where 分支在
  `sl.deny` 时改走 `press_deny` / `ack_short`；时间线拆穿仍先执行。
  ④ `js/ui/templates.js` 新增三颗证据按钮 + 时段下拉 + 提示；`MEET_TPL_KINDS` 作为
  按钮 / 生成器 / 门禁唯一清单，`_t.tplKinds()` 暴露。
  ⑤ `tools/test-v3.cjs` 新增模板 → `parseSpeech` 逐条契约：11 类槽位、六类 claim、
  时段 recent/night、空舱室不注入、证据句不产生额外槽位、按钮集合一致。
- **读数变化**：本批全量门禁实跑 **918 通过 / 1 失败**（`/tmp/returnlog-test5.log`）；
  失败＝已登记时序偶发「领取物资申请单」。复跑过程中还出现过「被质疑者回应」与
  「拖拽 0.00 格 / 藏尸 ×2」，均随机器负载漂移；**未改动 HEAD 对照实跑 911 通过 / 3 失败**
  （拖拽/藏尸，同一机器同样失败，非本批回归）。模板新增用例连续 4 轮全过。
- **下一批立项依据**：用户裁定后填；本批不据读数改动任何数值。

## [未发布 · 视觉融合批：通风口同图层 + 军械补给移角落] — 2026-11-10

- **本批改动**（用户否决「管道突兀、和旁边不像同一图层、周围突兀色框」；「军械补给放角落不要放门那里」）：
  ① 通风口**去掉发光彩色外圈**（`build-3d-assets.py` 不再建 rim 几何），重渲 8 舱精灵后新增
  `tools/grade-pipe-ports.py` 按底图各舱地板平均色做同色调/luma 分级 → 风口读成嵌在地板里；
  `drawPipes()` **删除彩色脉冲外框**，仅加载分级精灵。
  ② 军械补给点从门口 (75.6,71) 移到**右上角 (90.3,67.5)**（避开左门/顶门，且与管道口保持交互距离不致误开轮盘）；
  3D 重导出 `map_v2.json` 同步。
- **读数变化**：门禁实跑 **914 通过 / 0 失败**（领单/监控/AI 子弹夹具改为同步读取与动态跟随补给点，
  消除点位移/时序抖动）；`map-check` facBad/unreachable/pointBad 全空。
- **下一批立项依据**：gaps/dead 存量债待清；本批待提交/推送。

## [未发布 · 交互批：领单即领 + 补给等待 3s/5s] — 2026-11-10

- **本批改动**（用户裁定「领取申请单只要交互就领、不需要做小游戏；医疗补给等待 3s、子弹补给等待 5s」）：
  ① 领申请单改 `grantQual()` 单一入口**交互即领**（玩家 `startClaim` / AI 人类 / AI 异形共用），
  无站桩无小游戏；`SKSanity.STAND.qual=0`。
  ② 补给兑换改**纯站桩读秒**（不弹小游戏遮罩）：`STAND.med=3`、`STAND.ammo=5`（原 5/7）；
  `playerMiniGame()` 对 qual/med/ammo 短路返回 false。
  ③ 3D  parity：重跑 `3d:export:space`/`3d:export:rules`，`space.json.stand={qual:0,ammo:5,med:3}`；
  `3d:parity:check` 仅存量 WARN、无新增硬编码。
- **读数变化**：门禁实跑 **914 通过 / 0 失败**（领单/监控/AI 领单夹具同步改为即领口径，
  并清掉夹具在途任务避免保底完成插入待领单）。
- **下一批立项依据**：gaps/dead 存量债待清；本批与美术批8 待提交/推送。

## [未发布 · 美术第八批：走廊白线收束 + 任务点对齐 + 电脑位座椅 + 写实通风口 + 真源清洁] — 2026-11-10

- **本批改动**：
  ① **走廊白线**：改"连续偏移折线 + 拐角 miter"，所有走廊两侧全覆盖、拐角收束不再飞线；
  内缩 0.45 + 抬高 z 解决贴边被遮（生态舱-医疗舱拐角曾交叉飞出、下段缺线）。像素复核两侧均亮。
  ② **任务点对齐**：26 点按语义 snap 到对应掩体外缘 0.4 格（可行走且该掩体成为最近件→本体脉冲正确），
  不再落在空地/错误掩体上；`map-check` pointBad/unreachable 全空。
  ③ **娱乐室座椅**：高凳从球台旁移到街机/赛车机（电脑位）前。
  ④ **写实通风口**：千问出写实百叶风口贴图（`assets/qwen-lib/vent-grille_768.png`）→
  `build-3d-assets.py` 顶面贴该图 + 可染色外圈 → `render-pipe-port.py` 渲染 8 舱精灵；
  `drawPipes()` 改回加载精灵（**不再矢量直接画**），冷启动回退暗矩形。
  ⑤ **2.5D 真源清洁**：main 移除 3D 客户端（scripts/scenes/project.godot/screenshots）与
  `__pycache__`/`_bak` 杂物，保留 3d/tools 建模管线 + 3d/preview/{assets,data} 共享真源；
  `.gitignore` 补 `__pycache__/ *_bak/ *.pyc *.blend1`。main 本地提交 **477eda5**（**未推送**）。
- **读数变化**：门禁实跑 **914 通过 / 0 失败**（首跑轮盘/藏尸夹具因点位移与随机种子抖动失败，
  夹具改为自备第二交互项 + 重开轮盘后复跑绿）；`map-check` cover 123 / pointBad 空；重烘铁板退化=0。
- **交付决策者**：`docs/qwen21/corr-miter-check.png`（拐角收束）、
  `assets/scene/v4/facility/pipe-port-med.png`（写实通风口精灵）。
- **下一批立项依据**：main 清洁提交待推送；v1-preview 本批改动待提交；gaps/dead 存量债待清；未跑蒙特卡洛。

## [未发布 · 美术第七批：军械库真实甲板 + 空舱填充 + 物件直观可读] — 2026-11-10

- **本批改动**（用户否决第六批军械库地板「蜂巢感/不像地板」；移除后舱室偏空需填充；
  并立原则「**本次出图严格遵循直观可看出用途**」，呼吸机为反面例子）：
  ① **军械库地板程序化重出**：新增 `tools/gen-armory-deck.py`（与 `gen-hull.py`/`gen-pbr-textures.py`
  同类程序化顶视无缝甲板，非扩散出图）——钢底板+防滑菱形 tread+螺栓网格+两条平行橡胶通道+黄色边线
  +同向步枪 stencil+弹药箱脚印；**无六边形/无透视收敛**，覆盖 `qwen/armory/floor.png`
  （旧镜像/方向保持版备份 `_backup/armory-floor.*.png`）。千问概念图因蜂巢感被用户两次否决，故改程序化。
  ② **呼吸机重做·直观可读**：去掉对角直管（旧"斜杠方块"），改机箱+**波形屏**+**盘绕波纹管圈**+**面罩**三件套；
  医疗间床下补 2 台 + 2 根输液架（填充且读得出用途）。
  ③ **空舱填充**：fun 右下角球台补 2 高凳；ecosys 顶角对称补 2 育苗盘（新 decor `seedtray`，不挡通道）。
  ④ `seedtray` 同批登记 `KIND_V2` + `KIND_SHAPES`（铁板退化守卫口径）。
- **读数变化**：`map-check` cover **124** / decor **20**、unreachable/pointBad/facBad **全空**
  （gaps 185 / dead 24 为存量债+填充新增小间距，待单独清）；`blender-ship` 重烘 **铁板退化件数=0**；
  门禁实跑 **914 通过 / 0 失败**。
- **交付决策者**：`docs/qwen21/batch7-board.png`（armory / med / fun / ecosys 四舱对照）。
- **下一批立项依据**：gaps/dead 存量债清零、main 分支字节码/备份清理仍待用户确认；未跑蒙特卡洛。

## [未发布 · 美术第六批：通风管道口 + 床下/右下角清理 + 生态舱对称 + 警戒线收口] — 2026-11-10

- **本批改动**（用户复核「上一批说全完成但仍有大量未做完」，结合置顶四条继续改进）：
  ① **管道口改通风管道**：2.5D `drawPipes()` 改矢量**矩形百叶风口**（外框+横百叶+四角螺栓+矩形气流脉冲），
  边色/叶片随 `PIPE_TINT` 舱室配色，**不再用圆形井盖精灵**；3D `build-3d-assets.py::build_prop_pipe_port()`
  重建为矩形百叶风口+侧短管（1844 tris），保留 `pipe_rim` 命名供按舱换色。
  旧 `pipe-port-<room>.png` 圆形井盖降为素材库、不进运行时（AGENTS §四同步改述）。
  ② **医疗间**：移除 3 床下方的带斜杠呼吸机（2 件 cover `med_ventilator` + 3 件 decor `ventilator`，斜杠=呼吸管路）；
  `medbed` 毯改白色临床被 + 加大枕头，顶视读得出病床。
  ③ **娱乐室**：移除右下角杂物（decor `machine`/`chair` + cover `fun_coffeetable`），保留娱乐桌/街机/VR 舱。
  ④ **生态舱对称化**：cover 整块重排为关于 x=28 镜像对称（浇灌/温控、双氧气柱、双灌木、双巨树、双育苗架、双培养罐），
  中央十字通道（竖 x27-31 / 横 y52-55）留空，保证四门直通；删掉散乱灌木/水池/单侧黑方框。
  ⑤ **警戒线收口**：`machine` 的 `_haz`、`crate` 的 `_band`、`pillar` 的 `_band` 三处无条件 HZM 色带
  改为仅 `_HAZ_ROOMS={armory,engine,power}` 绘制（此前生态舱浇灌/温控台、仓库货箱、会议室柱会漏警戒线）。
  ⑥ **军械库地板去镜像**：旧四向镜像把步枪 stencil 翻转、警戒通道收敛成金色波纹（读不出军械库）；
  改为方向保持 2×2 平铺重出 `qwen/armory/floor.png`（备份 `_backup/armory-floor.mirrored.png`），
  现底图可见同向步枪 stencil + 武器通道警戒线 + 脚印，军械库身份成立。
- **读数变化**：`map-check` cover **127→120**、decor 22→16、gaps **189→178**、dead 23（存量债）、
  unreachable/pointBad/facBad **全空**；`blender-ship` 重烘 4704×4413 **铁板退化件数=0**；
  门禁 `node tools/test-v3.cjs` 实跑 **914 通过 / 0 失败**。
  运行时通风口截图：`tools/screenshots/_shot-vent-med.png`（青）/ `_shot-vent-ecosys.png`（绿），确认非井盖且随舱配色。
- **交付决策者**：`docs/qwen21/batch6-board.png`（med / fun / ecosys 三舱重烘对照）。
- **下一批立项依据**：gaps/dead 存量债（178/23）与 main 分支字节码/备份清理仍待用户确认；
  本批只动布局/造型/表现，**未跑蒙特卡洛**（用户裁定暂不跑）。

## [未发布 · 美术第二批（激进）：底图全千问 + SDXL 删除 + 素材库] — 2026-11-09

- **本批改动**（用户裁定「除房间布局/走廊材质/门之外，底图全用千问；≥700²；过期 SDXL 全删只留走廊和门；千问图存单独素材库文件夹」）：
  ① 千问出 **10 舱墙地 20 张 + 共享表面材质 10 张**（768² 原图 / 1536² 无缝），
  `gen-qwen-room-skins.ps1` 扩到 10 舱并加 `-SurfacesOnly`；`bake-qwen-room-skins.py` 铁板 exclusion 解除。
  ② **素材库** `assets/qwen-lib/`（README + 素材库清单.json 标明「素材库 PNG」）；
  `blender-ship.py::tex_path()` 素材库优先，同名表面贴图自动命中千问；墙面 `wall_tex()` 按舱读千问墙皮。
  ③ **SDXL 删除**：2.5D 删 21 张、3D 顶层删 15 张 + 10 张同名覆盖千问；
  保留走廊 `floor-grate/wall-panel`、门 `door-panel`、程序化 `ao-soft`；删前备份 `_backup/20261109_sdxl退役/`。
  ④ `assets-check.cjs` 把素材库纳入清单；3D `CABIN_QWEN_ROOMS` 扩到 10 舱。
- **读数变化**：`assets-check` **71 素材 缺失0/损坏0**；`blender-ship` **铁板退化件数=0**，
  `base-lit.png` 重烘 4704×4413；`map-check` unreachable/pointBad 空；
  门禁 `node tools/test-v3.cjs` 实跑 **914 通过 / 0 失败**。
  重烘后底图地面色环/十字全消失（第一批删的 11 处 floor_mark 不再出现）。
- **交付决策者**：`docs/qwen21/preview-board-20261109.png`（10 舱 旧墙/新墙/旧地/新地 对照）、
  `docs/qwen21/base-lit-new-20261109.png`（重烘底图缩略）。
- **下一批立项依据**：第三批＝家具/掩体**造型**改造（智能灶台/取餐点/枪架/VR 舱/玻璃培养舱），
  等用户看完预览再动；个别千问「带构图场景图」（军械库金色光斑/仓库重复亮点/娱乐室橙框）
  镜像后有重复图案，必要时加强 flat/seamless 约束重出。占地不动则不跑蒙特卡洛。

### 地板清晰度补（2026-11-09 · 用户「地板分辨率太低」）

- **诊断**：走廊与房间地板**同为 1536²**，不是分辨率差。走廊 `floor-grate` 清楚是因为
  高频高对比内容（菱形网孔/螺栓/锈点）＋均匀光照；千问地板是平滑钢板＋光照渐变，
  四向镜像把渐变复制成周期柔光斑 → 显糊。
- **硬件上限**：8GB 显存千问单张稳定 768²；实测 1024² 换页 7 分钟不出图，不可行。
  所以靠**内容**取胜，不堆像素。
- **改动**：① `gen-qwen-room-skins.ps1` 加 `-FloorsOnly`，10 舱地板提示词改高频高对比
  （工业舱=格栅/花纹钢板/螺栓，生活舱=清晰砖缝/地毯纹），`NEG` 加 glow/bloom/light spot/vignette，
  `TAIL_FLOOR` 加 uniform diffuse / high-frequency micro-detail / exact seamless。
  ② `bake-qwen-room-skins.py::seamless()` 加 `delight`：拼贴**前**对 768 原图大半径高斯估照度、
  高通归一（a/blur·mean）抹平光照（放在拼贴前，否则渐变被镜像复制成光斑）。地板调用传 `delight=True`。
- **读数**：重出 10 张 + bake + 重烘 `base-lit.png`，`铁板退化件数=0`；
  `assets-check` **71/71**；门禁 **914 通过 / 0 失败**。
  对比（`review/floor-compare3.png`）：仓库地板光斑消除、明显更 crisp，接近走廊；
  平滑类地板（医疗/会议）受内容所限仍不及强几何网格的走廊，属预期。
- **交付**：`docs/qwen21/preview-board-20261109.png` 已用新地板重出对照；素材库 `assets/qwen-lib` 同步。

## [未发布 · 美术第一批：素材来源规则 + SDXL 退役 + 去地面色环] — 2026-11-09

- **本批改动**：
  ① **四项目统一规则**（用户裁定）：素材优先取自公开网络与开源社区、不自己单独造；
  无合适素材才本地生成，且生成前先取公开设计参照；来源留痕（URL/作者/许可）。
  写入 新返航录 `AGENTS.md` 红线 **12**、delta-force-deploy 红线 **11**、
  乒乓对决_合并 红线 **9**、portfolio `§2.8`。
  ② **SDXL 退役、千问唯一**（用户裁定「以后都是用千问出图」）：新返航录红线 6 收紧为
  「千问本地为唯一出图模型」；环境表 / 工具表 / §四材质段同步改口径，历史 SDXL 产物留作回退兜底。
  ③ **去掉地图全部附地色环**：删 `js/data/map.js` decor 里 **11 处 `floor_mark`**
  （监控室操作区蓝框、娱乐室霓虹区十字、生态舱浇灌区十字、仓库主通道等）。
  decor 是纯表现层、`geo.js` 不读，**判定与平衡零改动**。
- **读数变化**：decor **32 → 21**，cover 127 / points 26 不变；
  门禁 `node tools/test-v3.cjs` 实跑 **913 通过 / 0 失败**；
  `map-check` 的 `gaps/dead` 与改前同批（199/20，属另一会话布局遗留，非本批新增），`unreachable/pointBad` 仍空。
  3D 侧 `map_v2.json` 本就没有 `floor_mark`（用的是舱室专属信息牌），无需传播。
- **下一批立项依据**：第二批＝千问出 10 舱墙地贴图（解除原铁板 4 舱守卫）+ 舱室对照预览板交决策者；
  第三批＝按预览结论改掩体形状/贴图并重烘 `base-lit.png`（占地不动则不跑蒙特卡洛）。

## [未发布 · 第五批：五舱布局重构（不跑蒙特卡洛，用户裁定）] — 2026-11-09

- **改 `js/data/map.js` 布局**（动碰撞；按用户裁定本批不跑蒙特卡洛，但 coverAudit/门禁仍跑）：
  - 食堂 transit：**左取餐右餐桌**——配餐台/回收台/饮料机/餐具车移左列，餐桌移右列，
    中间 x≈58 两门直通带留空。
  - 生态舱 ecosys：巨树/部分灌木让出 t@28→b@30 **垂直直通通道**；地板重出**科技感**
    （深青复合板+发光营养沟缝+六角培育垫，去 plain 绿方格）。
  - 监控室 cam：机柜聚右列、**主控台聚合**放左下、屏幕墙保留顶部，减少中部杂物。
  - 娱乐室 fun：**沙发改娱乐桌**（去不明沙发+加娱乐设施）。
  - 军械库 armory：**补给点移左边缘** (75.6,71)（先试右上但贴近管道口会抢 W 交互，改左边缘）。
- **夹具同步**：补给点测试 tp 坐标随补给点新位置更新（两处）。
- **读数**：`map-check` `unreachable/pointBad/facBad` 全空；门禁 **914 通过 / 0 失败**；
  重烘 `铁板退化件数=0`。预览 `docs/qwen21/layout-board-20261109.png`。
- **遗留**：布局改动未跑蒙特卡洛（用户裁定暂不跑）；若后续要确认平衡，补跑 1000 局。
  `gaps/dead` 仍有历史遗留值（另一会话布局），非本批新增阻断。

### 地板舱室特征补（2026-11-10 · 用户「军械库地板等等没做完」）

- 上一轮只移了补给点、**没重渲军械库地板**（仍是金色波纹），被用户指出。本批把 10 舱地板
  全部按舱室身份重出（`gen-qwen-room-skins.ps1 -FloorsOnly`，参考 SCP:SL 军械库/公开硬表面）：
  军械库=武器架 lane+步枪 stencil+弹药箱 footprint+黄黑装卸道；仓库=叉车通道/货位 stencil；
  引擎=反应堆维护环+油管沟；医疗=床 footprint+手术十字；会议=圆桌环形在嵌；配电=电缆沟盖板+弧闪区。
- 读数：bake+重烘 `铁板退化=0`；`assets-check` 71/71；门禁 **914 通过 / 0 失败**。
  预览 `docs/qwen21/floor-identity-board-20261109.png`。素材库 `assets/qwen-lib` 同步。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 第四批：交互惩罚取消 + 造型/警戒/格栅清理] — 2026-11-09

- **① 取消小游戏失败重置惩罚**（用户「错N次就从头再来的限制全部取消」）：
  `js/t2/minigame.js` 各失败分支（wire 接错 / place 放错 / pour 溢出 / lever 松手 /
  aim 脱靶 / match 错配 / sequence 按错 / sort 分错 / code 输错 / swap 型号错）
  改为**只提示、保留已完成进度**；用户主动「中断/清空」仍清零。删除死代码 `resetAll()`。
  门禁断言同步改为「接错不重置、进度保留」。仓库「库存盘点」由 sort 改 match——
  3D 里 sort 回退 place 导致它与「货箱封条」同玩法，现四个仓库任务互不相同；已重导出 minigames.json。
- **② 造型/清理**（`tools/blender-ship.py`，占地不变⇒平衡不动）：
  会议室椅改**科幻工学椅**且默认朝向**圆桌圆心**；左上角确认为导航台/记录台，其**斜拉电缆改直**；
  仓库货架改**开放层架+零散小件**（去堆叠货箱、去斜拉铁杠）；
  **警戒线框只留军械/引擎/配电**（`floor_frame` 加 `_CUR_ROOM` 守卫，医疗/娱乐/仓库等清除）；
  **走廊格栅严格收缩在两门端点之间**（长度 L，不再 +CW 伸进房间）；
  **下水道/百叶按舱区分**（生态舱圆孔/工业舱粗斜纹/医疗监控细密/其余中百叶+主题框）。
- **读数**：重烘 `铁板退化件数=0`；门禁 **914 通过 / 0 失败**；`map-check` unreachable/pointBad 空。
  预览 `docs/qwen21/batch4-board-20261109.png`。
- **遗留（需改 map.js 碰撞数据，单独一批跑 coverAudit/蒙特卡洛）**：
  生态舱直通通道+科技地板+清理黑框（#32）、食堂左取餐右餐桌（#34）、监控聚合操作台（#35）、
  娱乐去沙发加设施（#36）、军械补给点放边缘+军械特征地板（#37）。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 美术第三批：家具/掩体造型改造（2.5D 底图）] — 2026-11-09

- **边界**：只改 `tools/blender-ship.py` 里家具的**绘制几何**，`cover` 的 `w/h/x/y` 一个没动
  ⇒ 碰撞、`coverAudit`、寻路、平衡全部不变，**不跑蒙特卡洛**。
- **逐舱改造**（按用户点名）：
  - 食堂 transit：`servicecounter` 按舱分流 → **智能灶台**（炉眼+排烟罩+保温灯带）
    + **取餐口**（挡板玻璃+餐盘槽+叫号屏）；打包台/侧柜保持通用台面。
  - 军械库 armory：`gunrack` → **武器柜**（柜门+把手+长枪剪影枪管/机匣/枪托+弹药罐+编号牌+红色导轨灯）；
    参照 SCP:SL 武器柜分类。
  - 娱乐室 fun：`fun_racer` → **VR 舱**（座舱+头显遮光罩+支撑柱+龙门基站灯+地垫环）；球台保留。
  - 生态舱 ecosys：`tree`（巨树/灌木）→ **特制玻璃培养舱**（金属底座+营养液+玻璃罩+金属箍+顶盖补光灯）。
  - 引擎/医疗：`crate` 按舱分流 → engine **零件车**（三层抽屉+工具剪影+脚轮）/
    med **医疗推车**（开放层架+药品格+输液杆+脚轮）；其余舱保持钢板货箱。
- **读数**：`--test` 与正式重烘 **铁板退化件数=0**、无脚本错误；`base-lit.png` 重烘 4704×4413；
  `map-check` `unreachable/pointBad` 空（`gaps/dead` 与改前同批，属另一会话布局遗留）；
  门禁 `node tools/test-v3.cjs` **914 通过 / 0 失败**。
- **交付**：`docs/qwen21/shape-board-20261109.png`（六改造舱原生分辨率造型特写）。
- **下一批立项依据**：3D 侧对应 GLB 造型（`covers_lib.py` 的 BUILDERS）尚未同步本次 2.5D 造型；
  若要让 3D 掩体也长出灶台/枪架/VR 舱/培养舱，需逐舱改 `build-covers-*.py` 并重出 GLB + 重测 refs + 重同步高度。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
## [未发布 · 背景音乐可听性与起播重试（2.5D）] — 2026-11-09

- **本批改动**（只动 `js/main.js` 的音频层，判定/数值/语料一律未动）：
  ① 音量口径 `S.music * 0.7` → 感知曲线 `pow(S.music, 0.7)`。旧的线性乘再打七折，
  默认 0.35 档等于 −12.2dB，在 0.8 档音效旁边几乎听不见；满档仍是 1.0，**没有新增任何上限**。
  ② 起播重试：`pointerdown` 原来是「试一次，成没成都摘掉监听」，被自动播放策略拒掉后
  就只能等下一次点设置/进舱段；现在**播成功才停监听**。
- **读数变化**：`bgm.volume` 0.245 → **0.4796**（−12.2dB → **−6.4dB**）；
  手势后 `paused=false / currentTime=1.14s`，实测时长 151.2s 正常解码。
  门禁 `node tools/test-v3.cjs` 本批实跑 **899 通过 / 0 失败**（`music-bgm.m4a` 元素与
  音乐滑杆持久化两条断言照旧绿，未改断言口径）。
- **顺带修正文档**：`audio/CREDITS.md` 原写「背景音乐仅留档，未接入游戏」已过期（2.5D 早就接了），
  现按 2.5D / 3D 两条链路分别写清接入状态与转换产物署名。
- **下一批立项依据**：3D 预演的对应改动（音乐流接入、任务点钳位距离）见 `3d/CHANGELOG.md` 同日条目；
  其中记了两条**不属于本批**的在改项——`--devicetest` 的 `open=false` 与 `--simtest` 的夜钟起值。

## [未发布 · 设计者纯净模式（静态沙盒：只看地图与任务点）] — 2026-11-09

- **用户裁定**：新增第四种开局身份「设计者 · 纯净」。只展示地图与任务点，人物模型不再显示；
  设计者本人处于幽灵状态，但**所有任务点与管道交互开放**。四项口径经确认：
  入口＝开始页第四张身份卡；世界＝**静态冻结**；隐藏＝**只隐人物**（机器人/设施/门/管道口保留）；
  交互＝**全部开放**（任务点/管道/电闸/监控/领单/补给/破坏）。
- **入口与状态位**：`index.html#home-roles` 加 `data-role="design"` 卡；`js/ui/home.js` 的 `ANCHOR`
  加 `design` 条目（`what:'all'` 同时锚亮任务点与管道口，`highlight()` 相应支持 `'all'`）；
  `js/game.js` 的 `ROLE_WANT` 接受 `'design'` → `G.designMode`。席位与阵营照常建
  （15 席 / 4 异形 / 11 人类，设计者不排异形），只是不画也不动 —— `_t.inv()` 口径不被带偏。
  开局停在中央会议室、`fogOn=false`、**不建相位时钟**、跳过开局会议。
  **默认全图镜头**（`camMode='map'`，与旁观/DEV「全知总览」同一范围）：用户反馈 21 格跟随近景
  「相机贴着图片太近、一屏装不下多少船」，设计者是来验整张地图的，故默认铺满全船，`C` 仍可切回跟随。
  `newGame` 尾部本不 `resize`，设完 `camMode` 补调一次。人物不绘制后全图下没有"我在哪"的参照，
  加一个**固定像素大小的绿色十字环位置标记**（光标，不是角色模型，不随 `VIEW.s` 缩小）。
  普通对局的 21 格跟随手感**未动**（那是 30→23→21 三轮调出来的玩法镜头）。
- **静态冻结**（`update()` 里 `const DZ=!!G.designMode` 收口）：不推 `SKClock` 夜钟、不跑 AI 循环、
  不跑 `trackNight` / `dawn` / `checkWin` / `botTick`、不录回放帧；
  **保留** `doorTick` / `dmgTick` / `sabTick` / `tickActs` / `tickDoing` ——
  设计者亲手按出来的站桩、故障倒计时、断电与小游戏照常结算。
- **幽灵飞行**：新增 `freeFly(a)` 作为穿墙口径唯一收口（真幽灵 ∪ 设计者），
  `stepMove` 的门阻挡 / 围墙兜底 / 拐角重寻路三处与 `clickAt` 的直线分支都读它；
  设计者 6.5 格/秒直线穿墙（与玩家幽灵同速），能停进掩体/墙里验贴着家具的任务点。
- **全交互开放**：`collectInteractions` 在设计者局忽略 ghost 屏蔽、任务点不按「本局 4 个」筛
  （`ml` 给全 26 下标）；管道忽略 `me.alien` 且**跳过冷却**（可连钻 8 口）；
  破坏忽略 `me.alien` 且**不消耗 `sabUsed`**（夜钟不走，置真就永远修不回来，沙盒要能反复造故障再修）；
  领单/补给不查申请单额度与背包上限。**任务结算短路**：设计者修任意点只提示「验收完成」，
  不动 `prog / tIdx / tasks`（否则会把派发里另一个任务记成完成，还会推到 45 触发结算）。
- **渲染**：活人 / 幽灵 / 尸体三个循环、监控画面里的人、蓝图上的人点全部按 `!G.designMode` 跳过；
  新增本帧计数 `G.gfx.crewDrawn`（设计者局恒 0，门禁读它）。任务点标记从「只亮自己的 4 个」
  改为 26 个全标（`drawTaskMarkers` 的 `cur` 在设计者局恒 false，不再随机挑一个强闪）。
  HUD：身份行「设计者 · 纯净视图 · 世界已冻结」、任务列表列全 26 点（`#tasks.design` 可滚动）、
  `#tip` 换设计者专属文案、暂停面板信息行同步。**没有新增按键**，沿用 W/H/V/T/C/ESC。
- **探针与门禁**：`SKV3._t.design()` 只读探针（mode/fog/night/t/phase/agents/crewDrawn/
  points/pipes/openPoints/prog/meet/over/interactions），既有 `_t` 方法语义一字未改。
  `tools/test-v3.cjs` 新增「设计者纯净模式」段 **14 条断言** + 截图 `53_设计者纯净模式.png`。
- **读数**：`npm test` **913 通过 / 0 失败**（899 + 14）。首跑曾 912/1，失败的是早期
  「零证据的人类 AI 全部弃权」段（agent 8 投了票，`votes=null` 只是 finishMeeting 后的诊断空值），
  与设计者段无关、普通局里本批改动全是 no-op；**连跑复核 913/0**，按 AGENTS.md 已知抖动口径处理。
  设计者段实测：本帧绘制角色 0、26/26 任务点给交互（其中 22 个不在本局派发里）、
  8/8 管道口可钻且无冷却、穿墙停进不可走格偏差 0.000 格、0.7 秒内夜钟/夜数/进度/15 席位全不变、
  破坏两次都落进 `G.dmg` 且 `sabUsed` 始终 false、退出后恢复人类局本帧绘制 15 个角色。
- **3D 未动**（红线 11：3D 是 2.5D 的延伸）：本批只在 2.5D 真源落地，不擅自往 3D 加 2.5D 没有的系统；
  是否移植设计者模式到 3D 另行裁定。
- **未动**：地图 / 数值 / 平衡基线 / 语料 / 美术素材 / `floor_spec.json`。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 2.5D 底图掩体造型还原（铁板回归修复）] — 2026-11-09

- **症状**：2.5D 整船家具烘成等高的灰金属板盒，玩家反馈「全是铁板」。
- **根因不是素材丢失，是烘焙脚本没跟上地图改版**：2026-11-06 掩体 v2 重构把
  `js/data/map.js` 的 `kind` 从通用名（`table / crate / console / medbed / shelftall`…）
  改成分舱名（`bridge_table / ecosys_shrub / med_bed`…），共 **61 个新 kind**；
  而 `tools/blender-ship.py` 的 `furniture()` 仍然只认 **38 个旧名**。
  实测 **61/61 不匹配 ⇒ 127/127 件掩体全部落到函数末尾的 `else`**
  （`box(body, PANEL)` + `box(cap, PANEL_LIGHT)`）—— 每件家具都被烘成"金属板盒 + 浅色盖板"。
  同期 6 舱地板换成千问图（bridge/cam/ecosys/transit/fun/med，另 4 舱保持 SDXL）是
  **用户裁定的正确改动**，与本次回归无关，本批一字未动。
- **新增 `KIND_V2` 映射表**（`tools/blender-ship.py` 家具段）：61 个分舱 kind 逐个登记到
  既有形状分支，值全部取自 `KIND_SHAPES`（= if/elif 真正认识的 38 个形状名）。
  口径按 10-31 版地图的先例走（靶道/主控台/出库终端 → `console`，药柜/消毒柜 → `fridge`，
  零件箱/弹药箱 → `crate`，货架 → `shelftall`），并按 decor 里已经写好的对应关系
  接上更专门的形状（监护仪 → `console`、街机/赛车机 → `arcade`、娱乐桌 → `billiard`、
  点唱机 → `jukebox`、灌木 → `tree`、边柜/发放台/回收台/收货台/打包台 → `servicecounter`）。
  `tag` 仍然用**原始 kind**，避免两个分舱 kind 映射到同一形状后物体重名。
- **新增静默退化的读数**：`furniture()` 里未命中的 kind 进 `_flat`，
  收尾打印 `[ship] 铁板退化件数=N`（N>0 时附未登记清单）。
  这条存在理由就是本次的教训：**kind 漏登记不报错，只是变丑**，必须留一个可读数量。
- **`Shadow buffer full` 复核（不改）**：正式 4704² 出图刷 56 条 `(5158/2048)`。
  实测 Blender 5.2.2 的 `scene.eevee.shadow_pool_size` 是**枚举且上限就是 2048**
  （`items = [16…1536, 2048]`，默认 512），AGENTS.md 说的"调 pool 大小"在这个版本没有余量；
  降灯光数会动到 2026-10-31 标定好的每舱 9 格布灯（"边缘发黑"的正面解），
  接地阴影本来就由 `shadow_decal` 网格贴花承担、不依赖灯光阴影 ⇒ **本批不调，只在源码注明**。
- **读数**：`npm test` **899 通过 / 0 失败**（与改动前同一档，且是对最后一次重烘产物实跑的）。
  底图光照按 AGENTS.md 的「不透明像素 luma<30」口径复测：
  不透明 37.0%（未变）/ 均值 **63.4 → 65.9** / P05 15.4 → 15.7 / 暗面 **12.2% → 12.8%**，
  分舱边缘无死黑（判据看 `tools/screenshots/24_2.5D底图_跟随.png`
  与 `25_2.5D底图_全图.png`，两张都是本次重烘后实跑生成的）。
  烘焙日志 `[ship] rooms=10 walls=110 cover=127 res=4704x4413 engine=BLENDER_EEVEE`
  + `铁板退化件数=0` + **零条「缺贴图」**（6 舱千问地板经 `tex_path()` 落到
  `3d/preview/assets/textures/qwen/<rid>/floor.png`，4 舱 SDXL 落回 2.5D 自己的 `tex/`）。
  日志：`tools/logs/blender-ship-20261109-100139.log`（权威 Blender 5.2.2 LTS）。
  ⚠ **4704² 出图不是逐位复现**：同脚本连跑两次 md5 由 `94bcbc59…` 变成 `0cc2901f…`
  （EEVEE 屏幕空间降噪的运行时抖动，均值/暗面读数只差 0.3pp / 0.1pp）。
  所以**底图换一版就必须重跑一次门禁**，不能沿用上一版的读数。

- **3D 侧无同类缺陷、本批未动**：`3d/preview/data/cover_refs.json` 的 61 个 kind
  与 `js/data/map.js` 逐一对上，`map_builder.gd` 按 kind 载 GLB，不存在 2.5D 这种
  "名字接不上就退化成盒子"的分支。按「美术从 2.5D 改起再应用到 3D」的口径，
  本批的结论是**不需要向 3D 传播**。
- **未动**：`floor_spec.json` / 任何贴图文件 / `js/data/map.js` / 碰撞与 LOS 判定 /
  数值与平衡基线 / 3D 工程。今日早前那批「铁板配置暂关」（`COVER_SIGHT_SHELL = false`）
  仍然原样，本批只修 2.5D 的**造型派发**，与 3D 那个**背板可见性**开关是两件事。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 人类完整证言补完 + 语言对称] — 2026-11-08

- **第 5 批补完**：上一版只给 `accuseLine` 加了四要素前缀，`alibiLine` 仍走 `evClause`
  （可能只有"他跟现场对不上"），30 局四要素率 **60.5%**，第 5 批门禁 FAIL。
  本批把自述里的指控尾句也接到同一条 `evidenceCore`：先给"我看见他{动作}"，
  再用 `evClause` 补细节；纯怀疑一律用反证"我没看见他出刀或钻管道"。
- **新增 `evidenceCore(a,why,t,m)`**：时间 / 位置 / 动作 / 对象四要素的唯一生成路径，
  人类与异形共用。`accuseLine` 的确证档、软指控档与 `alibiLine` 尾句全部走它。
- **语言对称（第 6 批）**：异形有 `accuseWhy.solid` 伪证时，与人类确证档共用
  `known_accuse_hard`（内容假、句式同）；软指控也先给四要素再给结论。
  `alien_open_accuse` 16 句全部补 `{r}/{t}/{when}/动作`；`alien_open_echo` 补动作；
  `planMateBus` 补时间+位置；`alien_dodge` 补 `{r}/{when}`，让异形回避句与人类
  `respond_alone` 一样带时间+位置。
- **语料**：`known_accuse_hard` 压到 ≤24 字、`alien_open_accuse` ≤22 字、
  `alien_dodge` ≤24 字；`player_silent` / `respond_alone_same` / `alien_dodge`
  补到每档 ≥5；去掉书面词"时间线"。
- **读数**：`npm test` **899 通过 / 0 失败**（首跑 1 条已知抖动的
  "质疑者发言行"失败，连跑两次 899/0）；`lines-audit --strict` **1457/0**；
  第 5 批四要素 **920/974 = 94.5%**；第 6 批人类 **93.8%** / 异形 **95.4%**
  （差 1.6pp），**证据型 543/543 与 377/377 = 100% / 100%（差 0.0pp）**，
  零要素 2/974 = 0.2%。
- **平衡边界**：本批只改台词，不改 `sus / known / vote / 刀 / 破坏` 任何判定。
  300 局 seed 20261030 人类 **48.0% / 异形 52.0%**，仅作随机流对照：工作区还含
  未发布的第 3–5 批，且台词池变化挪动了随机流，**不能与 74.8/25.2 直接比**；
  要调平衡另立批次。
- **未动**：地图 / 数值 / 美术 / 3D；`js/ai/sanity.js` 未改。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 贴图 VRAM 压缩 + 去重复 + 2.5D 底图重烘] — 2026-11-07

- 承上一批「代价：`texture_mem` 777 → 885 MB」的两项单独放行事项，用户 19:4x 裁定：
  「BC7 压缩 + mipmap + 去重复」「重烘 2.5D 底图」。
- **Godot 4.6 档位先实测再落盘，不猜枚举**（`3d/preview` 内逐档重导同一张 1536² 图）：
  `mode=0` → 9,437,230 B（1536²×4 未压缩）；`mode=3` → 同样 9,437,230 B 且
  `vram_texture:false`（**不是 VRAM 压缩，已排除**）；`mode=2` → `.s3tc.ctex`
  1,572,940 B（DXT1 4bpp + mipmap）；`mode=2 + high_quality=true` → `.bptc.ctex`
  3,145,828 B（**BC7 8bpp + mipmap，采用**）。选 BC7 而非 DXT1：同为 GPU 原生格式，
  DXT1 会在舱室暗角出明显色阶，BC7 暗部渐变几乎无色带，而仍有 3 倍压缩收益。
- **新增 `3d/tools/patch-tex-vram.py`**（幂等）：96 个 `.png.import` 统一置
  `compress/mode=2` + `compress/high_quality=true` + `mipmaps/generate=true` +
  `detect_3d/compress_to=0`。最后一项必须归 0——非 0 时 Godot 检测到资源被 3D 使用会
  二次改档，造成导入抖动。补 mipmap 同时修掉 1536² 贴图在远处的闪烁 / 摩尔纹
  （此前 `mipmaps/generate=false` 是画质缺陷，不只是显存问题）。
- **两处同字节冗余合并**（此前无人察觉，靠 md5 比对查出）：
  ① `qwen/<rid>/skin3.png` 与 `qwen/<rid>/floor.png` 字节完全相同（同输入、同裁切、
  同参考），`WALL_SKIN` 的第三张改指 `qwen/<rid>/floor`——因 `_material()` 的 key 是
  去掉 `.png` 的相对路径，改完与地板命中同一 Material 缓存，纹理和材质各只留一份；
  ② `cabin/<rid>.png` 与 `qwen/<rid>/skin1.png` 字节完全相同，新增
  `CABIN_QWEN_ROOMS` 常量让 `_wall_material()` 对这 6 舱改走
  `res://assets/textures/qwen/<rid>/skin1.png`，铁板 4 舱仍读 `cabin/<rid>.png`。
  共删 12 张 1536² 文件 + 12 个 `.import`，备份 `tools/_bak/dedup-20261107195125/`。
- **2.5D 底图重烘，并修掉一条静默回归**：首轮重烘时 Blender 报
  「缺贴图 qwen/<rid>/floor.png，退回纯色材质」共 6 条——`floor_spec.json` 是 2.5D 与
  3D 共用的单一真源，千问批次把 6 舱地板值写成 3D 侧路径，而 `mat_tex()` 只在
  `assets/scene/v4/tex/` 找，**6 个舱的地板会全部静默变成纯色**。底图已即时回滚
  （md5 比对一致），随后给 `tools/blender-ship.py` 加 `tex_path()` 做「先 2.5D 后 3D」
  两段解析，`load_tex` / `mat_tex` / `mat_shadow` 三处统一走它。修后重烘 0 缺图。
- **读数**：`RENDER_TEXTURE_MEM_USED` 928,203,283 → **509,825,203 B（885 → 486 MB，
  −399 MB / −45%）**；draw call **1236** / 帧内对象 **1386** / 可见掩体 49 / 127 /
  隐藏 78 / 共享材质 8 个，与上一批逐项持平（压缩没有换来任何渲染退化）。
  2.5D 底图重烘后 **4704×4413 同尺寸**，门禁 **849 通过 / 0 失败**；
  方案层 **103/0**（R1–R11 全绿）；通行体检连通分量 1 / 可走格 5894 / 孤岛 0 /
  非角落割点 0 / 中心缺口 0.00；Godot `--arttest` 127/0（主题 10/10、墙面色差档 10、
  设备顶面一致性 3 查 0 不一致）、`--floortest` 48/0、`--tasktest` 26/0、
  interact / device 均通过；`3d:assets` 0 错误 / 3 提醒（wip 源文件未落地的历史提示）、
  `import:check` 0 差异。另清掉 `.godot/imported` 里 1088 个无主缓存（230.4 MB，
  该目录已被 `.gitignore:1` 忽略），清后重导 0 错误、arttest 仍 127。
- **连带修掉两处「重跑就回退」的隐患**（不修的话下次跑生成器会把本批全部撤销）：
  ① `3d/tools/bake-qwen-room-skins.py` 原来每舱出 `skin1..skin4` + 覆盖
  `cabin/<rid>.png`，重跑必然把删掉的 12 张重复文件重新造出来。改为只出
  `skin1 / skin2 / skin4` 三张 + 复用 `floor` 作 WALL_SKIN 第三张、不再写
  `cabin/<rid>.png`（墙面直接读 `qwen/<rid>/skin1`）；色调参考缺失时改为**显式报错**，
  不再回落到已删除的 `cabin/<rid>.png` 和已被改写的 `floor_spec` tex
  （那等于拿新图给新图做对齐，会逐轮漂移）。`patch-wall-skin.py` 的 WALL_SKIN 模板同步。
  改完 `--dry-run` 报「24 张 / panels 0 项 / floor_spec 0 舱 / WALL_SKIN 0 个文件」，
  即已是幂等态。
  ② `3d/tools/check-floor-spec.cjs` 此前报 **FLOOR-SPEC FAIL 1**：千问批次直接改了
  `floor_spec.json`，但 `export-floor-spec.cjs` 里的 `ROOMS` 硬编码表仍写老贴图名，
  `--check` 必然不一致。已把 6 舱 tex 写进生成器表，并在注释里写明 `qwen/` 前缀
  只存在于 3D 侧、2.5D 由 `tex_path()` 回落。修后 **FLOOR-SPEC OK（11 项）**。
- **观察（未改，留作后续立项依据）**：bridge 舱地板在新截图里均值亮度
  (8.8, 13.8, 19.9)，旧 SDXL 时代为 (20.5, 27.8, 42.2)。千问 floor 图与老图
  `floor-carpet` 的均亮度只差 6%（46 vs 49），但老图靠高对比金色圆环撑起辨识度，
  千问图是同色系低对比网格，再乘 `floor_spec.bridge.tint=[0.46,0.48,0.54]`
  （为老图配的强压暗）后细节被压没。tint 与 2.5D 共用，改动会同时影响底图，
  属单独放行事项，本批未动。
- **边界**：几何 / mesh / 碰撞 / 交互点位 / 地图 / 平衡基线一律未动；
  4 个铁板舱（power / engine / armory / warehouse）的贴图与引用值逐条比对未变；
  GLB 内嵌的 515 张 256² 贴图**未清**（需 `export_materials='PLACEHOLDER'` 重导，
  会动 `3d/spec/assets.manifest.json` 的 textures 计数，仍属单独放行）；全部改动**未提交**。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 千问覆盖 6 舱 3D 建模外饰（铁板仓除外）] — 2026-11-07

- 用户 18:2x 裁定：「用千问的模型覆盖一下除了铁板仓的 3D 建模贴图」；
  追加澄清「铁板仓的意思就是地板是铁板材质的」。
- **范围按实测材质判定，不按舱名猜**：`floor_spec.json` 的地板材质为钢板 / 钢格栅的
  **power / engine / armory / warehouse 四舱全部保持原 SDXL 贴图不动**；
  其余 **bridge / cam / ecosys / transit / fun / med 六舱**换千问，覆盖四处：
  墙面 `cabin/<rid>.png`、墙饰 `WALL_SKIN[rid]` 四张、地板 `floor_spec.rooms[rid].tex`、
  设备面板 `panels.json` 13 处（ecosys 3 / transit 2 / fun 2 / med 3 / cam 3）。
  掩体 GLB 的 10 组共用外饰是全局材质，不在本批范围内，保持 SDXL。
- **千问不能直出 albedo**（`3d/ASSETS.md:118,424-428`）：千问 768² 原图带烘焙光照、
  透视边缘、非 seamless。墙面 / 地板 / 墙饰先过一次项目同款 grade（降饱和 + 冷调 +
  压暗），再做四向镜像拼贴 2×768 → **1536² 原生无插值、REPEAT 无接缝**；
  设备面板是整块构图，按 `bake-refs.py` 红线**不镜像**，保留千问 768² 原图。
- **色调锚定老图**：`tone_match()` 以被覆盖的原 SDXL 图 / 原地板图为参考，做
  亮度与色度解耦迁移 + 二分饱和 + 冷调 R/B 校正，保证换素材不换气氛。
- **只改数据，不动 GDScript 逻辑**：新增 `3d/tools/gen-qwen-room-skins.ps1`（出图）与
  `3d/tools/bake-qwen-room-skins.py`（烘焙 + 回写 `floor_spec.json` / `panels.json` /
  `map_builder.gd` 的 WALL_SKIN 表 / `patch-wall-skin.py`），幂等可重跑。
  链路：`E:/ai-tools/sdcpp/vulkan/sd-cli.exe` + `qwen-image-2.1-turbo-Q4_K_M.gguf` +
  `Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf` + `qwen_image_2.1_vae_bf16.safetensors`，
  768² / 8 步 / 单张约 100 秒，须 pwsh 7。
- **读数**：2.5D 门禁 **849 通过 / 0 失败**；方案层 **103/0**（R1–R11 全绿）；
  通行体检连通分量 1 / 可走格 5894 / 孤岛 0 / 非角落割点 0 / 中心缺口 0.00；
  Godot `--arttest` 127/0（主题 10/10、墙面色差档 10、设备顶面一致性 3 查 0 不一致）、
  `--floortest` **48/0**（10 舱 / 48 地面网格，此前的 6 项「找不到贴图 qwen/<rid>/floor
  的地面」已修：根因是 `_run_floortest()` 拿文件名比完整路径，改为比
  `textures/` 相对资源路径）、`--tasktest` 26/0、interact / device 均通过；
  `3d:assets` 0 错误 / 3 提醒（均为 wip 源文件未落地的历史提示）、`import:check` 0 差异。
  非 headless BENCH：draw call **1236** / 帧内对象 **1386** / 可见掩体 49 / 127 /
  隐藏 78 / 共享材质 8 个，与上一批持平。
- **代价**：`texture_mem` 777 MB → **885 MB（928,203,283 B）**。千问新增 43 张贴图，
  全部走 Godot 默认 `compress/mode=0`（无损 RGBA8）、`mipmaps/generate=false`，
  1536² 单张即 9.4 MB。另查出两处**同字节冗余**：`cabin/<rid>.png` 与
  `qwen/<rid>/skin1.png` 完全相同（6 舱），`qwen/<rid>/skin3.png` 与
  `qwen/<rid>/floor.png` 完全相同（6 舱，因 skin3 与 floor 同输入同裁切）。
  两项清理均属**单独放行**事项，本批未做。
- **边界**：几何 / mesh / 碰撞 / 交互点位 / 地图 / 平衡基线一律未动；4 个铁板舱的
  墙面 / 墙饰 / 地板 / 面板四处引用值逐条比对未变；全部改动**未提交**。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 高清重出贴图覆盖老图（风格锁死）] — 2026-11-07

- 用户 16:18 裁定：「重新出高分辨率图，覆盖掉那些老图，要求符合原有的风格」。
  上一批虽已恢复到 1024²，但源图仍是老资产，且本机还有 512² / 256² 的糊图。
- **找到糊的真因**：`tools/gen-materials.py` 老管线把 `2×768=1536²` 的原生四向镜像
  拼贴 **BOX 回缩到 1024²**，直接抹掉 55% 的真实出图像素。新增 `--out-size`，
  prompt / seed(20261029+len) / NEG / guidance 6.0 / Euler / grade(0.52 去色 +
  0.92 对比 + TINT 0.80,0.86,0.98) / 四向镜像拼贴**全部锁死**，只关闭这步回缩，
  成品为无损 1536²；补 `floor-eco` / `floor-carpet` 两张老图的同语义 prompt，
  `hazard-stripe` 等比放大到 1536²。17 张全量重出 exit 0 / 0 失败，约 11 分钟。
- **8GB 显存实测**：896² / 1024² 出图会打满显存并严重换页（单张 >8 分钟未出图），
  采样边长维持原 768²。把两个 CLIP 改到 CPU 编码（`SDXL_GPU_TEXT=1` 可回退），
  GPU 只放 UNet + VAE，`VRAM free 0.00 → 1.01 GB`，单张约 30 秒。
- **风格做双重量化，不为过门禁放宽容差**：`tools/check-tex-style.py` 比色调
  （亮度 / 对比 / 饱和度 / 冷调 / 直方图距离），另查灰度结构相关性，发现 7 张老图
  其实是 `--mode reuse` 派生 / 无 prompt 的早期批次，同 prompt 重出后**图案整张换掉**
  （相关性 ≈0，如 `floor-carpet` 从「深蓝＋琥珀圆饰」变「深青绿网格」）。
  先用 `tools/align-tex-style.py` 以老图为参考做亮度/色度解耦的色彩迁移，
  再用 `tools/fuse-tex-detail.py` 以老图放大保结构、叠新出图的 SDXL 高频残差
  （权重 0.35）：相关性 **0.0x → 0.993~0.997**，色调门禁 **25/25 达标 / 0 偏离**。
  其余 10 张 SDXL 直出图相关性 0.83~0.99（同 seed 图案自然保持），
  6 张无 prompt 老地板图等比放大相关性 ≈1.0。
- **老图全链路覆盖**（均带备份，可一键回滚）：`assets/scene/v4/tex/` 24 张 1536²；
  `3d/preview/assets/textures/` 顶层 28 张 1536²；`panel/` 26 张改回千问
  `task-refs/*_768.png` 的**原生 768² 原图**（同一张图，MAE 0.15 / 相关性 1.000，
  非插值）；`cabin/` 10 张程序化墙板等比 1536²；`cover/` 20 张共享外饰 1536²；
  `3d/assets/textures/sdxl/` 9 张 256² 糊图覆盖为 1536²。新增
  `3d/tools/upgrade-hires-textures.py`。备份：`tools/_bak/tex-hires-20261107162523/`、
  `tools/_bak/preview-tex-20261107164924/`。
  千问 768² 图的 Qwen Research License 非商用边界已写入
  `3d/preview/assets/licenses/v4-CREDITS.md`。
- **读数**：2.5D 门禁 **849 通过 / 0 失败**；方案层 103/0；通行体检连通分量 1 /
  孤岛 0 / 割点 0；Godot 导入 0 脚本错误、`--arttest` 127/0、`--floortest` 48/0、
  `--tasktest` 26/0、interact / device 通过、`3d:assets` 0 错误、`import:check` 0 差异；
  非 headless A/B：draw call 3109 → **1236（−60.2%）**、帧内对象 3261 → 1388
  （−57.5%）、可见掩体 49/127、共享材质 8 个，与上一批持平。
  **代价**：`RENDER_TEXTURE_MEM_USED` 417 MB → **777 MB** —— 1536² 图 +
  61 个 GLB 内嵌的 515 张旧 256² 死贴图叠加；后者运行时不参与渲染，
  清理需 `export_materials='PLACEHOLDER'` 重导，会触碰 `3d/spec/assets.manifest.json`
  的 textures 计数，属单独放行事项，本批未做。
- **边界**：几何 / mesh / 碰撞 / 交互点位 / 地图 / 平衡基线一律未动；
  2.5D 底图 `base-lit.png` **未重烘**（与新 tex 源/产物不同步，重烘会改门禁取样，
  单独放行）；全部改动**未提交**。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 撤销降画质：1024² 外饰 + 可见性优化 + 千问解禁] — 2026-11-07

- 用户 15:40 / 15:43：「贴图分辨率非常低，看起来很糊，重新出高分辨率的图，或者用千问模型生图。
  同时修改 AgentMD 允许使用千问模型生图」；「性能瓶颈这个可以进行游戏优化，只对玩家可见的地方进行渲染。
  其他地方静默加载。并且搜索业界的游戏帧率优化方法，先不要采用这种直接压画质的粗暴方法。」
- **撤销 256² 降采样**：新增 `3d/tools/gen-hires-skins.py`，把本机 `assets/scene/v4/tex/` 的
  SDXL 成品按**原生 1024²**（不 resize）转成 10 组 albedo / normal，落到
  `3d/preview/assets/textures/cover/`（20 张 / 4.2 MB，含 MANIFEST.json）。normal 由 256²
  程序化法线 LANCZOS 放大并重新归一化。原 256² `sdxl/` 包保留为 GLB 内嵌的远处 / 静默档，
  不再是玩家近处看到的外饰。
- **共享材质注入**：`map_builder.gd` 新增 `COVER_ROLE_PBR` 与 `_cover_mat()`，按 GLB 材质名的
  role 把 1024² 共享 `StandardMaterial3D` 注入每个 surface（`set_surface_override_material`，
  不用 `material_override` 以免丢失分件层次）。整船只常驻 ~10 张高分辨率贴图，
  而不是 61 个 GLB 各内嵌 8 张、480 张重复纹理。纯色主题材质保持各舱原色。
- **可见性优化**（业界调研见 `docs/调研报告_3D帧率优化_20261107.md`）：
  ① 距离剔除 `visibility_range_end=32m` + `end_margin=4m` 迟滞（GL Compatibility 忽略淡出，
     故用硬切换）；② 房间级静默加载：`_process` 每 0.25s 按玩家位置保留所在房间与 26m 内房间，
     其余 `visible=false`，节点与数据常驻内存、不卸载、进门即时恢复；自测 / 截图参数下自动
     关闭，避免验收读数缺几何。
- **量测**：`main.gd` 新增 `--bench`，落盘 FPS / draw call / 帧内对象 / 纹理显存到
  `3d/preview/bench-result.json`，供优化前后 A/B。
- **千问解禁**：新增幂等补丁 `tools/patch-qwen-policy.py`，一次性更新 17 处当前生效口径
  （AGENTS.md §一-6 + 工具表、CREDITS.md、HANDOFF.md、WORKFLOW、README、ASSETS.md、
  ship-layout-plan.md、3d/README.md、gen-art-refs.ps1 清单模板等），撤销「3D 美图一律 SDXL /
  千问本地生图暂停」，允许千问模型生图；**Qwen Research License 非商用边界与
  「转商用需换图/授权」保留**，CHANGELOG / ADR / 测试报告的历史记录按惯例不回改。
  出图入口 `npm run 3d:refs:cabin` / `3d:refs:tasks`（必须 pwsh 7）。
- **明确不做**：不再降分辨率、不减材质通道；本轮不做 `OccluderInstance3D` 烘焙 / MultiMesh
  合批 / 自动 LOD（需单独放行，见调研报告第六节）。
- **读数（本次实跑）**：
  - 3D：`--arttest` 127/0、`--floortest` 10 舱 48 网格 0 失败、`--tasktest` 26/0、
    `--interacttest` / `--devicetest` 通过、`3d:assets` 0 错误、`3d:import:check` 0 差异、
    Godot 导入 0 脚本错误。
  - 2.5D 门禁：**849 通过 / 0 失败**（`tools/_gate-hires-20261107.log`）。
  - 非 headless A/B（`--bench-all` 全渲染 vs `--bench` 可见性优化，落盘
    `tools/bench-bench-all.json` / `tools/bench-bench.json`）：
    draw call **3109 → 1236（−60.2%）**、帧内对象 **3259 → 1386（−57.5%）**、
    可见掩体节点 **127 → 49**（78 件静默）、共享材质 **8** 个。
    纹理显存两者同为 417 MB —— GLB 内嵌的 480 张旧 256² 图在材质被覆盖后仍是死资源，
    这是下一批 PLACEHOLDER 导出要清的；FPS 采样受窗口启动影响，不作为结论依据。
- **边界**：几何 / 碰撞 / 交互点位 / 2.5D 地图与平衡一律不动；底图未重烘；改动未提交。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 建模外饰换 SDXL 贴图 + 通行修复（裂缝 / 双通路 / 中心卡脚）] — 2026-11-07

- 用户 14:57：「现在就做建模外形换贴图，本机应当有相当的 SDXL 资产，它们可以直接作为建模的外饰。
  同时现在地图不要出现那种过不去的裂缝，而且一个房间之内除了角落，至少要保证物品之间有两处通路。
  中心太撑得批评，因为到了中心之后会有很多卡脚的地方。」
- **硬口径**：不消除原有建模，只把已有 mesh 的外饰层换成贴图；几何 / footprint / 碰撞 / 交互点位一律不动。
- **外饰 · 61 件掩体 GLB**：新增 `3d/tools/gen-sdxl-skins.py`，把 `assets/scene/v4/tex/` 里本机 SDXL
  成品（`gen-materials.py` 出图 + 四向镜像拼贴，已 grade / seamless）降采样成 9 张 256² JPEG albedo，
  落到 `3d/assets/textures/sdxl/`（附 `MANIFEST.json`：来源 / 尺寸 / 许可口径）。`covers_lib.py::_pbr_image()`
  优先读该目录 albedo，normal 仍用程序化法线；`COVERS_SDXL=0` 可一键回退。沿用已验证的
  256² JPEG 两图档位，纹理资源数不增加（512² PNG 三图会掉到 10 FPS，这条红线不动）。
- **外饰 · 40 件墙饰**：新增幂等补丁 `3d/tools/patch-wall-skin.py`，把 `_build_wall_decor_v2()` 的
  `_material("", col, false)` 改为按舱取 `WALL_SKIN` 贴图（med / fun 首张即已 grade 的
  `med_vitalscreen` / `fun_neonsign`），主题色 emission 0.35 → 0.12，避免把贴图刷成一片色块。
  贴墙板几何与 40 件位置完全不动；两张 grade 成品复制进 `3d/preview/assets/textures/`。
- **通行**：新增 `tools/layout-reach.cjs`，与 `geo.js` 同口径（GS=0.6 / 掩体外扩 0.12 / 墙线 0.36）
  做全局 flood fill + Tarjan 割点 + 核心区可走率；`--fix` 只微调 cover 的 x/y，硬约束与
  `ship-layout-check.cjs` R1–R4 完全同口径（五点严格 inPoly、eps=-0.001 不重叠、门净空、
  主通道、任务点 2.5 格内仍有道具），并统一回写 `js/data/map.js`、`ship-layout-plan.json`、
  `map_v2.json`、`layout-v2.json`；写盘前备份到 `tools/_bak/layout-<时间戳>/`。
- **防回归**：`ship-layout-check.cjs` 新增 R9（全局连通分量 = 1）/ R10（每舱核心区无割点 =
  物品间至少两处通路）/ R11（核心区可走率 ≥ 45%，中心不撑），断言 82 → 103 项。
  重跑 `ship-layout-build.cjs` 若把坐标覆盖回去，这三条会当场 FAIL。
- **电闸目击走廊禁改区**：`test-v3.cjs:1865-1868` 把目击者硬编码在配电室 `x=51 / y=53~55`
  的唯一可视窄带，首轮优化挪动「变压器」曾把门禁打挂（849/0 → 842/7）。现于
  `layout-reach.cjs::legal()` 把 `power` 舱 `x∈[49,53] / y∈[52,56]` 列为禁改区，
  区内掩体不许移走、区外掩体不许移入；A/B 已验证修复前 849/0、修复后仍 849/0。
- **边缘带按多边形算**：房间是八边形切角，用外接矩形判「角落」会把切角附近贴边窄道
  误判成核心区单通路；改为到 `rooms[].poly` 各边最小距离 < 2.6 格即豁免。
- **读数**：12 件掩体微调坐标（其余 115 件不动），连通分量 4 → 1、孤立可走块 3 → 0、
  核心区割点 31 → 0、核心区可走率 10/10 达标；方案层 **103 通过 / 0 失败**；
  `map-check.cjs`：unreachable=[] / patrolBad=0 / pointBad=[] / facBad=[]；
  3D：`--arttest` 127/0、`--floortest` 10 舱 48 网格 0 失败、`--tasktest` 26/0、
  `--interacttest` / `--devicetest` 通过、`3d:assets` 0 错误、`3d:import:check` 0 差异。
  2.5D 门禁连跑三次：**842/7（首轮，电闸视线被挡）→ 847/2（AI 投票 / 时序抖动）→
  849 通过 / 0 失败**（最终，日志 `tools/_gate-layout3-20261107.log`）。
- **边界**：只改 `3d/` 材质层与掩体坐标，不动规则、不动 2.5D 平衡配置；底图 `base-lit.png` 未重烘。
  窄缝（gaps）与 1 格凹角（dead）按既有裁定继续作为诊断读数，不作为失败项。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 地板口径归位（单一真源）+ 非交互面贴图化] — 2026-11-07

- 用户 13:56：「除了那种需要实时交互的，其他场景都可以用贴图来提升质感。
  还是一个场景的优化，然后从你的 Demo 中看出来好像特意把地板给换了，
  没有必要换掉，还是用原来的底图。」
- **先查事实**：2.5D 侧**地板从未被改**（`map.js` diff 只动 cover/pipes/facility；
  底图 `assets/scene/v4/base-lit.png` 仍是 10/31 原件）；3D 侧**地板贴图文件也没换**
  （11 张与 `v4/tex/` sha256 逐字节相同）。**换掉的是重复尺度**：
  3D 用全局 `UV_WORLD_SCALE=4.0`，底图用 per-room 2.8~7.5；
  `floor-lab.png` 每循环 9 格 ⇒ med 单格底图 0.33 m / 3D 0.44 m，**差 33%**。
  另加 3D 给所有舱统一套的 `Color(0.88,0.9,0.94)`（底图只有 4 舱有 tint）。
- **根因是表被抄了两份**：`tools/blender-ship.py` 一份、`map_builder.gd` 一份。
- **修法**：新增 `3d/preview/data/floor_spec.json` 作**单一真源**
  （`3d/tools/export-floor-spec.cjs` 生成），两边都改读它；
  UV = `世界坐标 / repeat_m`，等价于底图的 Object 坐标 + Mapping Scale。
  另加 `check-floor-spec.cjs`（三查，含「不得有第二份地板表」）、
  `main.gd --floortest`（检查场景里真实建出来的 48 个地面网格）。
- **自测教训**：第一版 floortest 拿真源和自己比 → 永远相等，注入漂移也 0 失败，
  **等于没测**。验证漂移必须在**消费端**注入：在 `map_builder.gd` 写死
  `repeat_m := 4.0` → 立刻 10/10 FAIL；还原 → 0 失败。
- **贴图化**（用户指定路线：非实时交互的部分用贴图提质）：
  天花板 `panel-metal`(亮度 53) → `panel-white`(144) + 平面 UV 2.4 m；
  设备台座纯色 → `panel-white`/`panel-metal`；新增天花板一圈灯带（取 `theme.glow`）；
  新增天花板朝上补光（天花板在 3.2 m、法线朝下，是背光面）。
  验收新增 `main.gd --ceilshot <room>`（斜视天花板，正下方仰视看不到灯带）。
- **修事故**：`tools/blender-ship.py` 原本**没有 `--dry`**，误用导致把入库底图
  `base-lit.png` 重烘覆盖（16.6% 像素不同）——已 `git checkout` 还原，
  并补上真正的 `--dry` 与 `--out <路径>`。**底图是入库资产，重烘必须是显式动作。**
- **读数**：`--floortest` 10 舱 / 48 地面网格 / 0 失败；`check-floor-spec` 11 项全过；
  `--arttest` 127 件 0 不一致 + 设备顶面 3/3；`--interacttest` 通过；
  `--tasktest` 26/0；**2.5D 门禁 849 / 0**（`tools/_gate-floor-20261107.log`）；
  五舱天花板亮度 86~91（标准差 33~38，有纹理层次）；49~165 FPS。
- **边界**：只动 `3d/` 与 `tools/blender-ship.py`，2.5D 玩法与平衡未变
  （基线仍 74.8% / 25.2%）。未提交。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 3D 交互修复 / PBR 材质 / 医疗无人机] — 2026-11-07

- 用户 12:32 三问：部分舱室任务不能交互；建模能否多轮迭代接近 SDXL 材质（无存储/面数限制）；
  医疗无人机没按 SDXL 建模。
- **任务交互**：2.5D 侧 26 个任务点全部「可寻路到达 + 可交互」（Playwright 探针实测），
  问题只在 3D —— 医疗舱「消毒循环」、监控室「监控墙重连 / 操作台」3 个点落在 cover 里，
  `_cover_top()` 把设备顶到掩体顶面 **1.72 m**（掩体已统一补到 1.70），玩家眼高 1.62 m 够不着。
  `scene_extras._task_placement()` 重定位到掩体外侧空位 + `_pedestal()` 自带 0.57 m 台座；
  **不改 map_v2.json 的 points**（2.5D 坐标不动）。新增 `main.gd --tasktest`：26 点 / 0 失败。
  `--arttest` 的设备顶面一致性断言同步改为「重定位点期望台座高、其余点期望 cover 顶」。
- **PBR 材质**：此前 61 件全为纯色 Principled、零贴图，这才是塑料感主因。
  新增 `gen-pbr-textures.py`（10 套周期噪声 tileable 材质：金属面板/拉丝钢/喷漆白壳/屏幕/
  织物/警示/玻璃/叶片/橡胶/木纹，albedo+normal，256² JPEG / 20 张 / 153 KB），
  `covers_lib.mat()` 接 Base Color 与 NormalMap；主题色灯带保持纯色。`COVERS_PBR=0` 可回退。
  按用户要求放开：`BUDGET_TRIS 2950→6000`、倒角 3 段 20mm、manifest 与 `validate-assets` 上限同步。
  **性能教训**：512² PNG 三图版 → 200 MB / 10 FPS；256² JPEG 两图版 → **54 MB / 91~165 FPS**，
  瓶颈是实时渲染的纹理资源数而非存储/面数。
- **医疗无人机**：`build-medbot.py` 生成 **67 件 / 5610 tris** GLB（白壳椭球 + 青色玻璃医疗舱 +
  四组悬浮推进器 + 红十字 + 扫描灯 + 机械夹爪），替换 `_drone()` 的球+圆环占位体，
  manifest 登记 `medbot`。不走 `L.run()`，避免给悬浮体补落地背板。
- **读数**：2.5D 门禁 **849 / 0**（`tools/_gate-pbr-20261107.log`）；`3d:assets` 0 错误；
  导入 0 脚本错误；`--arttest` 127/0（设备顶面 3/3 一致）；`--devicetest` 通过；
  `--interacttest` 通过；`--tasktest` 26/0；`sync-cover-height --check` 一致；
  `check-cover-scale` 纵向失配 0 / 低于眼高 0 件。
- **边界**：只动 `3d/`，2.5D 平衡不受影响（基线仍 74.8% / 25.2%）。未提交。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 视线遮挡 · 掩体高度统一到人眼视角往上（1.70 m）] — 2026-11-07

- **本批改动**（用户 09:55：「仓库的高度得遮住人眼视角……原来能够遮挡手电筒和
  近身视野光亮的物件，都得把高度调整到人眼视角往上」）：
  - 查清口径：2.5D 的 `js/engine/geo.js::los()` 是**纯 2D 矩形判定**，
    每一件 `M.cover` 都无条件挡住手电锥与近身视野，**完全没有高度概念**；
    而 3D 相机在 `player.gd` 是 **1.62 m**（胶囊 1.70 m），掩体最高只有 1.61 m
    —— 实测 **61/61 件低于眼高**，玩家能从所有家具上方看过去。判定说挡、画面说不挡。
  - 取 `SIGHT_MIN_H = 1.70`（`covers_lib.py`）：等于玩家胶囊高，眼高 + 8 cm 余量。
    **2.5D 判定与平衡完全不动**，只补 3D 视觉/碰撞高度。
  - `sight_extend()`：在占地后缘补上下两段暗色背板 + 主题色发光缝 + 立柱 + 顶梁到 1.70 m，
    **不拉伸原几何**（上一轮刚修完占地拉伸，不能再用拉伸制造新变形）；
    结构件 join 成 1 个网格 + 1 条发光缝，每件只多 2 个绘制节点（人眼视角帧率 17 → **44 FPS**）。
    `BUDGET_TRIS 2800→2950`（prop 硬上限 3000），倒角预算预留 100→200。
  - 新增 `3d/tools/sync-cover-height.cjs`：按 GLB 实测重写 `map_builder.gd` 的
    COVER_HEIGHT v2 段与 `cover_height_v2.gd.txt`，`--check` 只校验。
    ⚠ **链路顺序**：先 `measure-cover-refs.py` 再 `sync-cover-height.cjs`，
    反了会把补高模型压回矮个子（Godot 按 `height / refs[kind].高` 做 Y 缩放）。
  - `check-cover-scale.cjs` 新增「低于 1.70 m」报警；`main.gd` 新增 `--eyeshot <room_id>`
    （人眼 1.62 m 平视验收，`--covershot` 是 2.2 m 俯视，验证不了遮挡）。
  - `build-map-v2.cjs` 的 v2 名义高度口径同步为 `SIGHT_MIN_H`；**未重跑**该脚本，
    避免重新生成布局坐标。`TIER_HEIGHT` 只保留档位语义，不再是运行时高度真源。
- **读数**：61 件实测 **1.70–1.74 m**，低于 1.62 m **0 件**、纵向失配 **0 件**、
  0 件超 2950 tris；`3d:assets` 0 错误；Godot 导入 0 报错；`--arttest` 127/0；
  `--devicetest` 通过；5 张 `--eyeshot` 人眼截图已出。
- **平衡**：只动 `3d/`，**2.5D 门禁实跑 849 通过 / 0 失败**
  （`tools/_gate-sight-20261107.log`），权威基线仍 74.8% / 25.2%，无需重跑蒙特卡洛。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 掩体美术第二轮 · 全 10 舱参考图与尺寸校准] — 2026-11-07

- 用户 08:02「继续」：把上一轮留下的「9 舱待补参考图」一次做完。
- **本地 SDXL 出齐 10 舱参考图**（`3d/assets/refs/<room>.png`，`gen-cover-refs.py` JOBS 5→10）。
  一次加载模型连续出图，实测每舱 1–2 分钟；**全部本地生成**，无线上生图。
- **`covers_lib.py` 新增三道通用工序**（61 件自动生效）：倒角带面数预算、
  `shell_pass()`（浅色外壳 / 深色压边 / 嵌入发光缝 / 底部压边）、`depth_ext()`（补后机架撑进深）。
  压边试过用主题色铺整圈，会连成黄块，已改回暗色，主题色只走发光缝。
- **生态舱 8 件从 1×1 归一化重写为真实尺寸**：新工具 `check-cover-scale.cjs` 发现它们被拉
  **2.25~4.32 倍**（2.8 米的树只有 0.657 米宽），是"看着粗糙"最实在的来源。
  重写后全 61 件横向 >1.35× **16 → 4 件**、纵向失配 **0 件**。
- **验收工具修正**：检查板 tilt 的参数含义一直是反的（26° = 64° 俯视），
  导致前几轮把薄柜误判成"白板"；改为真正 3/4 侧视。
- **3D 设备点统一语言**：`_build_device()` 原来是一整块房间主题色立方体（仓库纯黄），
  改成中性浅壳 + 压边 + 主题色发光缝。
- 读数：61 件 **0 超预算**、合计 **6.25 MB**；`3d:assets` 0 错误；`--arttest` 127/0；
  `--devicetest` 通过；导入 0 报错；10 舱检查板与实机截图全部重出。
- **边界**：本轮只动 `3d/`，**2.5D 主游戏与平衡完全不受影响**（不涉及 `js/`，
  当前权威基线仍是目击认错批 74.8% / 25.2%，门禁 849/0）。未提交。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 掩体美术 · 面数放宽 + 本地 SDXL 参考（细节迭代第一轮）] — 2026-11-07

- 用户 07:26/07:48 两次裁定：「太粗糙，保持场景风格，用千问或 SDXL 取要素」→
  「允许建模加面数，用**本地模型**生成参考图」。
- `covers_lib.BUDGET_TRIS` **1500 → 2800**（仍受 `validate-assets` prop 类 3000 约束），
  倒角 **1 段 12mm → 2 段 16mm**；61 件实测 **124–2760 tris / 合计 5.12 MB**、0 件超预算。
- 新增 `3d/tools/gen-cover-refs.py`：本地 SDXL（`sdxl-base` + `vae-fp16-fix`，768×512 / 18 步 / 不挂 pixel LoRA），
  每舱一张、固定 seed，产出 `3d/assets/refs/<room>.{png,json}`。实测 **402 秒/张**。
  早前误用的线上生图已删除 —— AGENTS §一-6「3D 素材一律 SDXL」仍成立。
- 按参考图重做娱乐舱 7 件（点唱机拱顶/圆格栅、街机外凸控制台、桌面护栏、沙发踢脚与压线等），
  并把「踢脚 / 外凸边条 / 嵌入灯带」写进 `3d/ASSETS.md` 作为后续每舱的固定动作。
- 读数：`3d:assets` 0 错误、`--arttest` 127/0、`--devicetest` 通过、导入 0 报错。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · AI 推理 · 目击认错人（确证 20% 偏移，仅限目击范围）] — 2026-11-07

- **本批改动**（用户 07:26：「给确证加 20% 的偏移，有 20% 概率看错。但仅限目击范围；
  不会看错成别的人，只会在目击范围内看到的所有人里看错」）：
  - `SKSanity.MISID.chance = 0.20`：**亲眼目击**写的 `mind.known` 有两个入口
    （刀者红光 `saw_red` / 异形专属动作 `saw_*`），各以 20% 概率把确证指向**另一个人**。
  - 候选池严格由目击者**此刻的可见性**决定：排除自己与真凶、距离现场 ≤ 现场半径、
    且 `aiCanSee` 通过；**池子空就不偏移**（看不见的人不会被认错）。
    不读阵营表、不偏向任何一方。
  - **只偏移 `known` 指向，不撤销已经落下的 `sus`**：目击者会「确信是 X」，
    同时对真正的 Y 保留一点「当时就觉得不对」的残余印象 —— 这是真人认错人的样子。
  - 遥测 `misIdWrites / misIdToHuman / misIdToAlien / misIdRealHuman`；
    A/B 开关 `_t.setMisId(p)` 与 `node tools/monte-carlo.cjs --misid 0`。
  - 门禁新增 11 条：默认 20% / 0 档不偏移 / 1 档必偏移 / 30 次采样从不认到现场半径外 /
    只剩真凶可见时不偏移 / 实盘 chance=1 落在别人身上 / 遥测 / chance=0 仍落在真凶 / 不变量。
    **门禁统一把 chance 钉成 0**（旧行为），否则 20% 概率会让一堆「确证应落在真凶身上」的用例随机翻车。
- **读数（1000 局同 seed A/B）**：

  | 配置 | 人类胜率 | 误逐人类 | 被逐异形 | 认错/局 | 认到人类/局 |
  |---|---:|---:|---:|---:|---:|
  | 关（旧口径） | **78.8%** (788) | 0.713 | 2.512 | 0 | 0 |
  | 开（20%） | **74.8%** (748) | 0.777 | 2.420 | 0.153 | 0.118 |

  **人类 −4.0pp**（Wilson 72.02~77.39），超出 ±3pp 噪声护栏 —— 这次是真效果，不是抖动。
  归因很清楚：每局约 0.15 次认错，其中 0.12 次认到无辜人类；被逐人类 +0.06、被逐异形 −0.09，
  而 `knownWrites` 从 3.108 升到 3.167（认错没有减少确证总量，只是把一部分指错了人）。
- **门禁**：**849 通过 / 0 失败**（`tools/_gate-misid2-20261107.log`，上一批 838）。
- **边界**：这一条**打破了「硬证据 100% 准」的基石**（`knownWritesHuman` 会抬升），
  是用户明确裁定的改动；以后不要按「误判是 bug」修回去。系数要调就改 `MISID.chance`，
  0 = 旧行为。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 空间与资源 · 掩体本体第四批：余下 6 舱 34 类（61/61 全覆盖）] — 2026-11-06

- **本批改动**（用户 22:05「直接全部完成吧」）：新增 `3d/tools/build-covers-rest.py`，
  一个脚本装 6 舱 BUILDERS、按舱跑，补齐驾驶舱 7 / 监控室 5 / 引擎舱 6 / 娱乐舱 7 / 配电舱 4 / 餐厅 5。
- **读数**：**61 个 kind 全部有本体**（`cover_refs.json` 缺模型 0）；面数 **60–1332**、体积 **8.6–158.3 KB**、
  合计 **2.3 MB**、**0 件超 1500 预算**；`3d:assets` **0 错误**；`--arttest` **127 件 / 0 不一致**；
  `--devicetest` 通过；Godot 导入 0 脚本错误；10 个舱各一张 `covers-<room>.png` 实机样张。
- **本批的主要错误类型是「占地口径」而不是建模**：吧凳三条腿只朝 Y 伸（X 向 0.57 / 占 0.8）、
  监控墙只有墙没有台（进深 0.47 / 占 1.3）、保险面板只做一块 0.2 米厚立板（占 1.2）、
  仪表架支架进深 0.32（占 0.8）—— 这些在 Godot 里会被按倍数拉伸。
  统一靠「补台体 / 圆盘底座 / 落地柜」撑满占地解决。
  另有四类硬错：点唱机「拱」写成 1.12 米高立式圆柱（整体 2.16 米）、街机屏埋进机身、
  监控墙三排屏重叠、柜类顶板与柜体同深（26° 视角下把柜门挡成一块白板）。
- **顺带改的验收工具**：检查板棚灯降档（key 3000→1500 / fill 1100→520 / rim 1400→700）——
  过曝会把金属顶面打成纯白，前两轮误判成「模型是白板」。
- **边界**：只动 `3d/` 与资产清单，2.5D 主游戏与平衡**完全不受影响**（不涉及 `js/`）。
  剩余工作不在掩体：墙体/地板/设备贴图、LOD 与合批（127 件各是一个节点）。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 空间与资源 · 掩体本体第三批：军械库 6 类] — 2026-11-06

- **本批改动**（用户 21:57「继续」，接第二批判定的「军械库最划算」）：
  - 新增 `3d/tools/build-covers-armory.py`：枪架 / 枪械工作台 / 射击位 / 弹药箱堆 / 发放台 / 台钳工位。
    军械库与仓库最容易「串味」，每件都带一件标志物（枪 / 靶纸 / 箱盖 / 铁栅 / 钳口）。
  - 新增 `3d/tools/cover-shot.py`：单件特写（3/4 前视 18° + 近俯视 78°），检查板看不清时用它排查。
- **读数**：6 件 **180–1332 tris / 22–159 KB**（预算 1500）；`3d:assets` **0 错误**；
  `--arttest` **127 件 / 0 不一致**；Godot 导入 0 脚本错误；`cover_refs.json` 增至 **27/61 kind**。
- **踩坑（已写进注释）**：枪管用了立式圆柱（枪架 1.52 高 / 1800 tris 超预算）；
  枪架顶梁又做成整块板（仓库批刚踩过）；两只弹药箱 X 上重叠 0.5 米；
  箱盖比箱体大且用亮金属（棚灯下爆白成一团白板）；靶环用立式圆柱（成了平放红饼）；
  **台钳只做 0.46 米宽而地图给 1.2×1.2**，会被横向拉 2.6 倍 —— 这条是「占地口径」错，不是建模错。
- **边界**：只动 `3d/` 与资产清单，**2.5D 主游戏与平衡不受影响**（不涉及 `js/`，不需要跑游戏门禁）。
  余 6 舱 34 个 kind 未做。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 空间与资源 · 掩体本体第二批：仓库 6 类 + 医疗 7 类] — 2026-11-06

- **本批改动**（用户 21:42「继续」，接上一批「生态舱 8 类」的扩产）：
  - 抽出共享库 `3d/tools/covers_lib.py`（材质 / 图元 / 归一化 / 逐类导出 / 检查板排版），
    新增 `build-covers-warehouse.py`（6 类）、`build-covers-med.py`（7 类）。
  - **口径改成「按真实尺寸建模」**：footprint 取 `map_v2.json` 里该 kind 的最常见 `w×h`，高度取档位。
    货架就是 1.42×7.06 米、手术台 3.00×1.65 米 —— 不再用 1×1 拉伸（那样 7 米货架会变成面片）。
  - 新增 `3d/tools/measure-cover-refs.py`：从**导出物实测**包围盒，写 `3d/preview/data/cover_refs.json`（21 个 kind）。
    `map_builder.gd` 新增 `_cover_ref()`，按「地图尺寸 / 建模尺寸」缩放；生态舱那批（1×1）自动等价于旧行为。
  - `COVER_HEIGHT` 三件按实测抬高：`warehouse_packbench 0.95→1.43`、`warehouse_terminal 0.95→1.61`、
    `warehouse_receiving 0.95→1.50` —— 本体比盒体高，不抬会把模型压扁 34%（注释留在表里）。
- **读数**：13 件 **156–1140 tris / 20–142 KB**（预算 1500），`3d:assets` 校验 **0 错误 / 3 提醒**（既有项）；
  `--arttest` **127 件 / 0 不一致**；Godot 无头导入 **0 脚本错误**；总覆盖 21/61 kind。
- **踩坑（已写进注释）**：`matrix_world` 不刷新导致 7 米货架被判成「1.4 宽」；
  整块顶板把三层货挡死（改边框）；四层货位顶穿檐板（改三层）；
  手术台无影灯嵌进床垫（1.30 米高放不下吊灯，改监护屏 + 器械盘，并让床面坐在立柱上）；
  病床护栏低于床面（整排埋在床垫里）。
- **边界**：只动 `3d/` 与资产清单，**2.5D 主游戏与平衡完全不受影响**（本轮不涉及 `js/`，
  也不需要跑 826 条游戏门禁）。其余 7 舱 40 个 kind 未做；生态舱那 8 件仍自带一套重复图元函数，待迁到 `covers_lib.py`。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 空间与资源 · 全船掩体重构落地 2.5D 主游戏（59 → 127）] — 2026-11-06

- **本批改动**（用户 19:39：「先执行本项目的掩体重构任务，读交接文档」→ 裁定「两块都做」；
  3d/HANDOFF §12 的 §12.5#5 明确写着「落地需单独放行」）：
  - 新增 `tools/sync-map-v2-cover.cjs`：把 `3d/preview/data/map_v2.json` 的 `cover`
    （**Godot 主场景实际读的那份**，不是二次推导）写进 `js/data/map.js` —— 掩体 **59 → 127**，
    并保留 `zone/tier` 供自检分组用；`decor` 保持原样（`game.js` 不读 `M.decor`，同步它没有收益）。
  - **设施避让**写死在脚本 `FIXES` / `SECBOT`：医疗无人机、军械补给点、监控台各挪到最近的空地；
    保安巡逻矩形收进工作台以北的空带（旧矩形南边正好穿过三连枪架）。四条都带注释与原因。
  - `js/game.js`：新增 `FURN_V2`（61 个房间专属 kind → 就近俯视 sprite）+ `furnSprite()`，
    两处家具绘制改走它。R7「不跨舱复用」是 **3D 贴图**口径，2.5D 只有一套俯视家具图，按**形状**映射。
  - **任务点掩体脉冲兜底**：新布局按 R4 只保证「2.5 格内有道具」，道具不再必然压住任务点；
    找不到压住的掩体时退到**同舱 2.5 格内最近的一件**，否则提示会退化成虚线圆圈。
  - **圆桌申请单落点兜底**：圆桌下方 1.2 格现在被一圈议席占住，`roundTableClaimSpot()` 加空格搜索，
    否则 AI 永远领不到申请单（门禁里“AI 完成 3 分后回圆桌领申请单”当场抓到）。
  - `coverAudit()`：窄缝阈值 **0 → 0.55**（0.55 格以下网格站不下人，属有意成组），
    同 `zone` 的两件不算；门禁硬性要求从「无窄缝 / 无死路」改为「**没有完全孤立的可行走格**」，
    窄缝（112 处）与 1 格凹角（30 处）作为诊断读数打印。理由写在断言注释里。
  - 门禁夹具：**74 处传送坐标**随新布局迁移（原坐标已被掩体压住），另修 6 条与设施位置绑定的用例。
- **读数变化**：
  - 门禁 **838 通过 / 0 失败**（`tools/_gate-cover9-20261106.log`，2026-11-06 实跑）。
  - 1000 局（seed 20261030）：**人类 78.8% / 异形 21.2% / 超时 0**（Wilson 76.16~81.22），
    夜 4.482、进度 29.85、刀 8.51、驱逐 3.225、`knownWrites 3.108`、`farSight 10.232` ——
    **与落地前 78.8% 持平**：127 件掩体没有把平衡推翻。
- **边界**：`3d/` 的 Godot 侧未动数据（早已跑 `map_v2.json`）；`decor` 未同步。
  **3D 掩体本体**：当晚已做**第一批样板（生态舱 8 类 GLB + Godot 按 kind 实例化）**，
  见 `3d/CHANGELOG.md` 同日条目与 `3d/ASSETS.md`；余 9 舱 53 个 kind 未做。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · AI 拟人化 · 传闻可以凑成「基本确定」（追责口径钉住）] — 2026-11-06

- **本批改动**（用户 19:05：「继续，但是第一条有追责机制，证实是人类，会减控告者的分」）：
  - `SKSanity.ALMOST.heardKinds = 1`：`heard_*`（听来的说法）**最多补一个证据种类**，
    但必须满足两条硬约束 —— ① 至少有一条自己看见 / 查到的实证（`real` 非空）；
    ② 传闻**只补种类、不加任何 sus 分值**。纯传闻（两条 heard_*）仍然定不了罪；
    弱线索（沉默 / 空口指控 / 领袖点名 / 快速报案 / 错告 / 背书）仍然一律不算种类。
  - **追责口径原样保留**（用户点出的那条）：凭这条"基本确定"投错人时，`settleAccountability`
    照常让投票者掉 `cred`、带头的人再吃 `susAdd('wrong_accuse')` + 证言可信度 `relia` 下降。
    门禁新增一条**结构化**用例把这条链路钉住（预置 cred 0.5 → 4 票错逐人类 → 断言掉分 / 掉信誉 / 记 wrong_accuse），
    防止以后有人为了"让传闻更有效"绕过它。
  - 遥测 `almostHeard`（只统计"没有这条传闻就凑不够"的次数）；A/B 开关
    `_t.setHeardKinds(n)` 与 `node tools/monte-carlo.cjs --heard 0`。
  - 顺手修：概率为 0 的机制不再调用 `Math.random()`（异形顺势的 `pileOn` / `frameFollow`），
    否则关掉的那一档也会挪动整条随机流，A/B 对照组从第一个会议起就走另一条路径。
- **读数变化**：
  - 门禁 **838 通过 / 0 失败**（`tools/_gate-heard3-20261106.log`，2026-11-06 实跑；上一批 826/0）。
  - **1000 局同 seed A/B**：关 **77.7%（777/1000）** → 开 **78.8%（788/1000）**，人类 **+1.1pp**（噪声内、±3pp 护栏内）。
  - **300 局同 seed A/B**：关 78.67%（236/300）→ 开 81.33%（244/300），+2.67pp —— 小样本摆动比 1000 局大，
    以 1000 局为准。
  - 机制确实在跑：`almostHeard` **19.56 次/局**；`almostEjectAlien 1.420 → 2.377`、
    `almostEjectHuman 0.297 → 0.603`、`almostVotes 22.7`、`exiles 3.006 → 3.183`。
- **解读（重要）**：传闻补种类让**两边都更容易形成"基本确定"**，但人类的指控本来就准，
  多出来的票更多落在真异形身上（+0.96 次/局）而不是人类（+0.31 次/局）。追责确实在扣分，
  但它扣的是**事后**的信誉，改不了"这一次投出去的是谁"。
  **口径提醒**：本批之后基线从 74.3% 变成 **78.8%**，其中只有 +1.1pp 是机制，
  其余是「关掉零概率随机调用」带来的**随机路径位移**（同 seed ≠ 同路径，见 `tools/mc-report.md` 方法说明）。
  跨批比较请只看同一批的 A/B 两臂，不要拿 74.3% 和 78.8% 直接相减。
- **下一批（待裁定）**：只剩攻击**准确率**的那条 —— 目击认错人（近距确证也可能把同舱室的
  另一个人看成目标，只写 `sus` 不写 `known`，`knownWritesHuman` 仍为 0）。
  它会打破"硬证据 100% 准"这条基石，必须先拿到用户裁定再动。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · AI 拟人化 · 异形社交顺势（实测反向，默认关闭）] — 2026-11-06

- **本批改动**（用户 17:16：「继续做平衡调整，仍然从 AI 拟人化上做调整」）：
  - **表态顺序改为「人类先、异形后」**（`buildMeetCtx`）：真人冒充者不会在别人还没开口时先定调，
    先听场上谁被咬、再决定踩谁。稳定排序，除顺序外**不动任何判据**。
  - **异形顺势踩人**（`SKSanity.SOCIAL` + `alienSocialPick()`）：异形在「已经有人公开指认」的人里挑靶子，
    概率按性格 `SKTrait.C.pileOn` 修正；没有靶子时退回原来的身份轴加权。
    只读**公开指控**（`accuse`），不读任何人的私有 `sus / known / cred`，不读系统阵营表；队友永远排除。
  - **顺势构陷**（`alienFrameTarget()`）：编假口供时优先把矛头泼向场上的靶子（`SOCIAL.frameFollow`），
    不再随机挑一个没人怀疑的人 —— 后者只会替自己招来「这人在乱咬」的怀疑。
  - 遥测 `alienPileOns` / `alienFrameFollow`（含触达率表与中文别名）；A/B 开关
    `_t.setSocial(pile,frame)` 与 `node tools/monte-carlo.cjs --social 0`；
    门禁新增 10 条（真源 / 顺势 / 不读心 / 关闭语义 / 无靶子回退 / 构陷跟随 / 端到端两段 / 不变量）。
- **读数变化**：
  - 门禁 **826 通过 / 0 失败**（`tools/_gate-social4-20261106.log`，2026-11-06 实跑；上一批 816/0）。
  - **1000 局新基线**（默认配置，等同关闭）：**人类 74.3% / 异形 25.7% / 超时 0**（Wilson 71.5~76.91；
    夜 4.728、进度 30.536、刀 8.947、会议 10.234、驱逐 2.985 = 人类 0.656 / 异形 2.329、误逐占比 21.98%）。
    与上一批 74.2% 持平 —— 说明「人类先表态」这一步本身不改变胜率，位移是机制带来的。
  - **300 局同 seed A/B**：关 **75.00%（225/300）** → 开 **81.33%（244/300）**，**人类 +6.33pp**。
  - 机制触达：`alienPileOns` **3.45 次/局**（约 38 次机会/局）、`alienFrameFollow` **1.69 次/局**。
  - 归因读数：`humanExiles 0.66 → 0.72`、`alienExiles **2.34 → 2.54**`。
- **结论（重要）**：**在这个引擎里「跟票」是负收益**。人类公开怀疑的准确率约 **78%**
  （`humanExiles 0.66 / alienExiles 2.34`），所以「跟着场上咬」= 跟着人类咬自己人；
  票一集中就越容易凑够 4 票门槛，而凑够的多数是**正确**的驱逐。
  **缺的不是异形的社交技巧，是人类判断的准确率** —— 在它降下来之前，任何「让票更集中」的拟人化
  都会帮人类。因此 `SOCIAL.pileOn = 0`、`frameFollow = 0` **默认关闭**；开关、遥测与门禁保留，
  供后续批次复评（不要删，理由同 `SIGHT.aiCapR` 的退役口径）。
- **下一批立项依据（待用户裁定）**：转向人类侧拟人化 —— 三条都比继续加异形技巧更接近「真人会看走眼」：
  ① **认错人**：近距离确证也可能把同舱室的另一个人看成目标（**只写 `sus`、不写 `known`**，
     `knownWritesHuman` 仍为 0）；
  ② **听来的能凑成「基本确定」**：`heard_*` 计入 `almost` 的证据种类（现在被排除，所以一次构陷
     只值 0.26 sus、永远不够升级）；
  ③ **点名门槛按性格**：与 `shootSus` 同源（激进 0.36 / 谨慎 0.60），而不是全员硬写 0.5。
  验收：1000 局人类 50±5%、误逐不低于 25%、`ejectByKnownAlien` 不降；每条单独 A/B 后再合并。

## [未发布 · 会议节奏 / 移除运行时断言 / 异形 H v2] — 2026-11-06

- **本批改动**（用户裁定：讨论 +10 秒但不含开局、投票 15→5、公布 5→3、移除游戏内断言、按方案加强异形 H）：
  - `SKSanity.MEET`：白天讨论 **50→60**、夜会讨论 **25→35**、开局 `discussPre` **保持 50**；
    投票等待 **15→5**（白天/夜会）、公布 **5→3**。
  - **移除游戏内断言**：删除 19 处运行时的 `runInvariants(...)` 调用与每秒 tick 检查（`G.invT` 一并删除）；
    `SKInvariants` 模块与门禁探针 `_t.inv()` 保留，门禁仍显式校验不变量。
  - **异形 H v2**（`js/game.js`）：
    ① `identityPrior()` 先验条件化 —— 异形扣掉已认出的队友、人类扣掉已确证的异形（只读 `mates/known`），
       已知异形的死亡不再按未知分摊；
    ② `identityAxis()` 的 H **只吃 `cred`**，普通 `sus` 不再从 h 里减；
       `almost.foe` 仅当 `kinds` 含异形专属证据（刀/管道/破坏/停摆/红身/拉闸断电）时才封顶 0.05；
    ③ 夜间目标把 H 乘在**整段风险分**上：`base × (1.25 − 0.75h)`（h=1 约 0.5×，h=0 约 1.25×）；
    ④ 异形指控/随机投票权重 `0.08 + h²`，保留 8% 探索；人类侧权重仍线性，硬/almost 分支不变；
    ⑤ **目标承诺 8~12 秒**实现后经 300 局 A/B 证伪（见下），**已移除**，避免留下负收益机制。
- **读数变化**：门禁 **816 通过 / 0 失败**（移除承诺用例后 -1 条）。
  1000 局（seed 20261030）**人类 74.2% / 异形 25.8% / 超时 0**（95% Wilson 71.40~76.82）。
  夜 **4.736**、进度 30.210、刀 8.946、会议 10.282、驱逐 **2.908**（人类 **0.577** / 异形 **2.331**）、
  **误逐占比 19.84%**；`almostEjectAlien 1.355` / `almostEjectHuman 0.272`、
  `knownWritesAlien 3.451`、`mateFollowVotes 1.452`、`rushKills 10.293`。
  人类胜局 625 靠投光异形 / 117 靠维修；异形 258 靠人类全灭。
- **A/B 归因（同一 seed，300 局）**：
  - 本批中途（承诺开启 + 新会程）1000 局是 **79.1 / 20.9**；
  - 关掉承诺后 300 局 **76 / 24**（承诺让异形少杀、人类 +3pp，故移除）；
  - H 距离倍率单独关掉 300 局 78 / 22（倍率本身约 +1pp，保留）；
  - 把 `sus` 放回 H 300 局 81 / 19（忽略 sus 是对的，保留）；
  - 先验条件化关掉 77.3 / 22.7（保留）、h² 改线性 78 / 22（保留）、almost 无条件封顶 76.3 / 23.7（净持平，保留 ID 门槛）。
  - 相对上一批 74.7 / 25.3：本批**异形 +0.5pp**；相对中途 79.1 是 +4.9pp。
    **H 增强不是 50/50 的足够杠杆**：医疗救援仍 3.3 次/局、人类只需 4 次驱逐 vs 异形 11 次击杀。
- **下一批立项依据**：要再往异形偏，优先动“人类被拉起的次数/胜负结构”，
  或让异形会议构陷优先选“已有公开嫌疑的人类”（而不是高 h 的受信任者）；不要再抬 almost 或改视野。

## [未发布 · 回调 almost / 4 票驱逐门槛 / 红身 1.5 秒 / 出刀表现] — 2026-11-06

- **本批改动**（用户裁定：回调怀疑数值；异形 H 增强先出方案不动代码；驱逐门槛 ≥4 票、残局 3 票；
  红光 2→1.5 秒；出刀更干练并给异形玩家红色虚线射程圈）：
  - `js/ai/sanity.js`：`ALMOST.foeSus 0.5 → 0.35`、`ALMOST.friendCred 0.5 → 0.40`（回到身份轴之前的门槛）。
    `RED_BODY.dur 2.0 → 1.5`；`RUSH` 与红身仍是两套独立计时器，位移不读 `redT`。
  - `js/game.js`：新增 `voteThreshold()` —— **可投票人数 >7 → 4 票；≤7 → 3 票**。
    数值只在 `SKSanity.VOTE = { need:4, lateNeed:3, lateAt:7 }` 一处；
    只数“活着且未濒死”的人（与 `startVote` 的选民口径一致）；`closeVote` 与计票文案都读同一个门槛，
    `m.tally` 增加 `need/voters`，调试探针 `_t.voteThreshold()`；MC 配置快照新增红身与门槛两行。
  - 出刀表现：`drawWeapon()` 的武器锚点叠加 `actOffset()`，突进/后坐时刀跟随角色，不再留在原点悬空；
    挥砍从 ±0.9 rad 大回旋改为短促前送 + ±0.22 rad 摆臂，动作时长 0.5 → 0.34 秒（DEV 0.32 秒）。
  - 异形玩家（`a.alien && knife>0`）脚下显示 `REACH.knife` 红色虚线圆，每帧计数 `G.gfx.knifeRings`；
    人类玩家不画，避免泄露异形专属信息。
  - 门禁新增 7 条：4 票门槛 / 3 票不出局 / 第 4 票驱逐 / 残局 3 票、异形射程圈出现 / 人类不出现；
    原 3 票夹具补到 4 票；红身、ALMOST 阈值断言同步。
- **读数变化**：门禁 **808 通过 / 0 失败**。1000 局（seed 20261030）**人类 74.7% / 异形 25.3% / 超时 0**
  （95% Wilson 71.91~77.30）。夜 **4.914**、进度 31.031、刀 8.987、会议 10.44、
  驱逐 **3.063**（人类 **0.787** / 异形 **2.276**）、**误逐占比 25.69%**；
  `almostEjectAlien 1.386` / `almostEjectHuman 0.510`、`knownWritesAlien 3.388`、
  `mateFollowVotes 1.360`、`farSight 10.970`、`abstains 21.056`。
  人类胜局 627 靠投光异形 / 120 靠维修；异形 253 靠人类全灭。
  对比上一批 87.3 / 12.7：**异形 +12.6pp**，三处改动同向（almost 噪声回来、4 票更难驱逐、红身更短）。
- **下一批立项依据（只出方案，未动代码）**：异形侧 H “更强、更准”。
  ① 先验条件化：把已认出的队友 / 已确证的异形从分母里扣掉（只读 `mates/known`，不读系统阵营表）；
  ② 证据分层：`H` 只把“人类诊断性行为”（真任务/真修/救人/合闸 → `cred`）当正证据；
     普通 `sus`（开枪/拖尸/拘留/传闻）**不进身份轴**，仍只走原来的嫌疑链 ——
     人类也会做这些，现在从 `h` 里减掉等于把“合法的可疑行为”误判成“不是人”，异形反而少杀真人类；
     `almost.foe` 只有在 `kinds` 含异形专属证据（刀/管道/破坏/停摆/红身/拉闸断电）时才硬封顶，
     否则它继续驱动投票，但不改身份轴；
  ③ 行为斜率：夜间目标从“±3 格的加法”改为 `距离 × (1.25 − 0.75h)` 的乘法优先级，
     指控/随机投票权重从线性 `h` 改为 `0.08 + h²`（保留 8% 探索，不做 argmax）；
  ④ 兑现口：高 h 目标一旦锁定，保持 8~12 秒不换目标（`_commitT`），减少“走到一半改主意”。
  验收：1000 局 A/B，人类胜率 45~55%、误逐不低于 20%、`ejectByKnownAlien` 不降、
  异形击杀的高 h 占比上升、没有攻击认出队友。**等用户确认后再实施。**

## [未发布 · 身份轴 / 动态先验 / 准-确证 0.5] — 2026-11-06

- **本批改动**（用户裁定：统一身份轴、准-确证均提到 0.5、动态先验、满分仍按原判定）：
  - `js/ai/sanity.js`：`ALMOST.foeSus 0.35 → 0.5`、`ALMOST.friendCred 0.40 → 0.5`。
  - `js/game.js` 新增统一轴 `h = P(目标是人类)`、`id = h−0.5 ∈ [−0.5,+0.5]`：
    人类 AI 敌对 `1−h`、信任 `h`；异形 AI 敌对 `h`、信任 `1−h`。
  - 动态先验 `identityPrior()`：异形看 11/14 人类、人类看 10/14；公开出局按真实阵营扣减，
    未公开夜杀按当前人类/异形比例分摊，不读尸体阵营。
  - `known` / `almost` 命中时仍走**原判定**并直接封顶（`almost` 端点 0.95/0.05）；
    概率曲线只作用于未攒满区间。`identityAlien()` 改为 `1−h`，`hostileProb()/trustProb()` 是唯一导出。
  - v1 软接线：异形夜间目标评分加 `H` 项、异形指控/随机投票按 `H` 加权；人类侧硬/almost 分支不动。
  - 新调试探针：`_t.identityPrior(i)` / `_t.identityAxis(i,t)` / `_t.hostileProb(i,t)` / `_t.trustProb(i,t)`；
    门禁新增 9 条：初始 11/14、10/14、公开出局更新、未公开夜杀按比例、硬锁两端、almost 端点、0.5 门槛。
- **读数变化**：门禁 **801 通过 / 0 失败**；1000 局（seed 20261030）**人类 87.3% / 异形 12.7% / 超时 0**
  （95% Wilson 85.09~89.22）。夜 3.758、驱逐 3.842（人类 **0.884** / 异形 **2.958**）、
  `almostEjectAlien 1.610` / `almostEjectHuman 0.332`、`knownWritesAlien 2.868`、
  `mateFollowVotes 0.857`、`busAccusals 0.133`。
  **方向反了**：上一批 82.2 / 17.8，本批人类 +5.1pp。主因不是异形变弱，而是
  两个 almost 门槛提到 0.5 后，人类**误逐**从 1.166 掉到 0.884、`almostEjectHuman` 从 0.650 掉到 0.332；
  人类靠 `known`/硬证据仍能投异形，软通道的噪声却被先削掉了。异形侧的 H 加权没有补偿。
  这说明“把门槛提高到 0.5”本身是**人类准确率 buff**；要拉回 50/50，下一步必须动
  驱逐门槛/胜负结构，或给异形侧的 H 行为更强、更准的权重（而不是继续抬 almost）。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 异形伙同投票] — 2026-11-06

- **本批改动**（用户裁定：异形队友指控某人后，信任他的异形跟票）：
  - `startVote()` 新增 `packLead`：第一个有有效指控、且不是洗白指控（`_busTarget`）的异形。
  - 其他异形若通过 `isMate` **认出**这个队友，就按 `mateFollowChance()` 跟票：
    被 lead 当众保过（`mind.trust[lead] ≥ 0.25`）**必跟**；只是认出则按性格
    `followChance` 概率跟（0.45~0.90）。
  - 目标若是自己认出的队友或恩人就不跟；只读 `a.mates` / `mind.trust`，不读系统阵营表；
    `_busTarget` 不带队，避免把“指控队友洗白”放大成集体处决。
  - 新增遥测 `mateFollowVotes`，门禁新增 4 条：跟票、没认出时不跟、目标是自己队友时不跟、状态不变量。
- **读数变化**：门禁 **792 通过 / 0 失败**；1000 局（seed 20261030）**人类 82.2% / 异形 17.8% / 超时 0**
  （95% Wilson 79.71~84.45）。`mateFollowVotes` **0.917 次/局**（37.5% 的局至少触发一次），
  夜 3.994、驱逐 3.978（人类 **1.166** / 异形 **2.812**），`almostEjectAlien 1.586` /
  `almostEjectHuman 0.650`、`knownWritesAlien 2.930`。
  对比上一批（视野统一 87.0 / 13.0）：**异形 +4.8pp**，是“伙同投票”带来的真实协调收益，
  不是改数值；仍未到 50/50，下一步接前面说的驱逐门槛/胜负结构。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 输入简化（一个动作一个键）] — 2026-11-06

- **本批改动**：保留 `W` 交互 / `A` 出刀 / `S` 搜尸查看 / `D` 收尸 / `F` 施救 / `R` 报告 /
  `B` 开枪 / `H` 破坏 / `V` 监控 / `T` 视野 / `C` 相机 / `M` 音效 / `ESC` 暂停；
  **移除旧别名 `E / Q / X / G` 与重复的 `P`**。`W` 仍收集附近全部交互，多项时按 `1-9` 或点击选择；
  监控台只保留 `V / ESC` 退出。`#tip`、README 操作表、AGENTS 输入约定与门禁夹具同批更新。
- **读数变化**：门禁 **788 通过 / 0 失败**（新增 2 条：旧别名源码级归零、主键仍在）。
  提示栏不再出现 `W/E`、`A/Q`、`S/X`、`D/G`、`P/ESC` 这类双键写法。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · AI 视野与玩家完全一致] — 2026-11-06

- **本批改动**（用户裁定：实际视野不变，让 AI 的视野和玩家的视野**完全一致**）：
  - 抽出唯一视野判据 `observerVisionAt()`（`js/game.js`）：同亮舱整间 / 同亮走廊整条 / 亮舱看相连走廊要 LOS / 近身圆（人类 2.3、异形 3.5）/ 7 格 60° 手电锥。玩家 `visibleAt` 与 AI `aiCanSee` 都走它，不再各写一套。
  - 删除 AI 专属视力：暗处 8 格全向、从舱外看进亮房、`lightState===1` 全亮无视朝向、`a.alien?8:5.5` 扫描半径。`SKSanity.SIGHT.aiCapR` **退役**，保留字段只为旧报告对照。
  - AI 的“手电朝向”改由 `agentAimAng()` 提供：动作 > 目标 > 下一段路径 > 上次移动方向；玩家仍用鼠标。
  - `trackNight`、`noticeAction`、`noticeTaskAbandon`、`watchersAt`、`exposureAt`、`credBroadcast`、`witnessDetain`、`dragAwayNotice` 全部走同一视野，并统一受 `attention()` 三态约束：做小游戏 / 开全屏遮罩时**视觉归零**，与玩家被 UI 遮住一致。
  - 门禁更新两条旧夹具：AI 在黑暗中不再“只有近身圆”，面朝目标 3 格时手电锥可见；背对目标才只靠近身圆。断言 786 通过 / 0 失败（2026-11-06 实跑；加输入简化后 788）。
- **读数变化**（1000 局 seed 20261030，`tools/mc-results-vision.json`）：
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
  - **人类 87.0% / 异形 13.0% / 超时 0**（95% Wilson 84.77~88.94）；夜 3.928、驱逐 4.021（人类 **1.078** / 异形 2.943）、误逐 26.8%。
  - `farSight` 9.295、`knownWritesAlien` 2.879 / `knownWritesHuman` 0、`almostAlien` 4.830 / `almostHuman` 5.658、`almostEjectAlien` 1.663 / `almostEjectHuman` 0.659。
  - 人类胜局 796 局靠投光异形、74 局靠 45 分维修；异形 130 局靠人类全灭。人类仍只需 **4 次正确驱逐**，异形要 **11 次击杀**；人类胜局平均 3.9 夜，异形胜局平均 6.4 夜。
- **结论（重要）**：**视野一致没有把人类胜率拉下来，反而从 85% 小幅升到 87%**。
  - 之前把 85% 归因于 `almostTargetAllowed` 是**错的**：当前代码里没有这个函数；85% 在无该函数的代码上可复现。
  - 真正的开关是“亮房整间可见 + 远处目击仍按全额喂 `almost`/`sus`”。把 AI 目击人为退回 6 格的 A/B 是 57.6%，但那是**比玩家看得更少**，违反本次规则，不能作为修法。
  - 在“AI 与玩家完全一致”的前提下，把远处证据降级（不进 `almost`、不设 `suspect`、`farSusMul 0.35`）的 A/B 是 **71.6%**（500 局，仍是人类优势）。剩余差距主要是**4 次驱逐 vs 11 次击杀**的胜负结构，不是视野。
- **下一批立项依据**：不要再动视野/`known`。要回到 55~65%，只剩三条真实杠杆：① 胜负结构（异形在人数持平/接近持平时获胜，或提高人类驱逐门槛）；② 异形社交与目标选择接完 `identityAlien`（目前异形的指控/投票仍是随机/旧 `sus` 分支）；③ 继续削弱远距证据的票权（单独做只能到 ~72%）。需用户裁定方向。

## [未发布 · 26 任务定制 / almost 阵营分流 / 实际视野 / 队友洗白] — 2026-11-06

> ⚠ **2026-11-06 更正**：本节把 85% 归因于 `almostTargetAllowed` 是**错的** —— 该函数不在代码中，
> 85% 由“实际视野 + 远处目击全额喂 almost”造成。现行读数与解释见上方「AI 视野与玩家完全一致」。

- **本批改动**：
  - **26 任务独立小游戏**：`js/t2/minigame.js` 新增 `TASKS`，26 个任务各自有独立 `kind / 步数 / 符号 / 配色 / 规则参数 / hint`；新增 `sequence`（顺序记忆）、`sort`（分拣）、`valve`（阀门）、`code`（编号键盘）四型，共 **14 型交互**。普通任务不再按舱室复用同一默认玩法。3D 通过 `minigames.json#tasks` 同步任务标题/提示/配色，新四型暂时映射到现有 4 型。
  - **almost.foe 按真实阵营分流**（用户明确例外）：人类 AI 的 almost 目标若是真实人类 → 信任、不指控、不投票；若是异形 → 可投。异形 AI 的 almost 目标若是真实人类 → 优先出刀/投票；若是队友 → 忽略。**这是唯一允许读 `alien` 真实阵营的入口**。
  - **人类 AI 目击范围 = 实际可见范围**：`noticeAction()` 对每个人类目击者用 `max(rad, sightRangeAt(w.x,w.y))`，不再固定 6 格。
  - **异形偶尔指控队友洗白**：`planMateBus()` 每会议 6% 概率，只从 `a.mates` 选队友，写 `heard_frame` 不写 known；`_busTarget` 放行投票；队友被逐后由 `settleAccountability` 兑现 +cred。
  - **3D 桌面入口**：桌面已创建 `启航路 3D 版.lnk`，指向 Godot 4.6 标准版 + `3d/preview`。
- **读数变化**：
  - 门禁：**785 通过 / 0 失败**（新增 26 任务配置 + 4 新交互 UI 冒烟）。
  - 1000 局：**人类 85% / 异形 15% / 超时 0**（Wilson 82.65~87.08）；夜 3.991、进度 30.333、刀 6.891、会议 8.382、驱逐 3.987（人类 **1.114** / 异形 2.873）、误逐 **27.94%**。
  - 证据目标：`knownWritesAlien 3.875 / knownWritesHuman 0`；`almostAlien 3.801 / almostHuman 5.879`，但 `almostEjectAlien 1.214 / almostEjectHuman 0.672`；异形队友指控 **0.131 次/局（12% 的局）**。
  - **明确的失衡位移**：几乎分流把人类误逐从 1.663 压到 1.114，人类胜率从 59.5 → **85%**。要回调请调 `almostTargetAllowed` 的概率/上限或给异形补偿；**不要回退实际视野与 known 规则**。
- **审计结论**：详见 `docs/审计_证据集中到异形_20261106.md`；硬确证仍 100% 命中异形，软通道在分流后几乎不再误伤人类，但也把游戏推到人类一边。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 平衡回调 / 当众合闸 / 保安 6 格 / 管道重做 / 证据审计] — 2026-11-06

- **本批改动**（用户裁定：异形击杀加速回归 +50%、给异形小概率当众合闸、保安巡视半径削到 6 格、管道画风重做并在除中央会议室/配电室外每舱铺管道、审计证据为何集中到真异形）：
  - **击杀加速**：`SKSanity.RUSH.mul` **1.7 → 1.5**（+70% → +50%），`dur` 仍 2 秒；`moveSpeed` 优先级不变（拖尸 > 加速 > 基础）。
  - **当众合闸**：`SKSanity.DISGUISE.breakerChance = 0.10`（每异形每夜掷一次骰）；断电、有观众、闸可达且没有更强计划时，允许覆盖低分计划。命中后 `a._breakerGoal` 锁 25 秒，防止 0.5 秒重算把演出覆盖；真合闸、灯真的亮、吃 `breakerLoss`，完成后 `simStats.fakeBreaker++`。新增 `fakeBreakerRolls` / `fakeBreakerPlans` 遥测。
  - **保安**：`SEC_RANGE` **10.5 → 6** 格（180° 半圆、30 秒拘留、每夜 2 次不变）；AI `secbotWouldSee`、地图标签、HUD 文案与门禁全部同源读取。
  - **管道**：`M.pipes` 从 6 个扩到 **8** 个（新增生态舱、娱乐室；除中央会议室/配电室外每舱一个）。2.5D 画风改为 Blender 5.2.2 渲染 + SDXL `pipe_hatch` 贴图的圆形舱盖精灵（`assets/scene/v4/facility/pipe-port-<room>.png`，8 舱按 `PIPE_TINT` 染色）；图片未加载时回退旧菱形格栅。3D 端新增 `prop_pipe_port.glb`（2336 tris）并同步进 `3d/preview`。
  - **证据审计（只读遥测）**：`knownBump` 拆目标阵营；`evalAlmost`/`closeVote` 记录 `almostAlien/Human`、`knownVotesAlien/Human`、`ejectByKnownAlien/Human`；报告新增「证据命中目标」表。结论见 `docs/审计_证据集中到异形_20261106.md`。
- **读数变化**：
  - 门禁：**782 通过 / 0 失败**（2026-11-06 实跑；新增 1 条当众合闸概率断言，RUSH/保安/管道断言同步更新）。
  - 1000 局（seed 20261030）：**人类 59.5% / 异形 40.5% / 超时 0**（95% Wilson 56.43~62.5）；
    夜 5.219、进度 29.965、刀 8.767、会议 10.398、驱逐 3.881（人类 1.663 / 异形 2.218）、误逐 42.85%。
  - 当众合闸：**54.5%** 的局掷过骰、**7%** 的局选中计划、**4.2%** 的局真正完成（0.042 次/局）。
  - 证据目标：`knownWritesAlien` **4.408** / `knownWritesHuman` **0**；`knownVotesAlien` 2.234 / `knownVotesHuman` 0；
    `almostAlien` 2.019 / `almostHuman` **5.247**；`almostEjectAlien` 0.449 / `almostEjectHuman` 0.793。
    **硬确证 100% 命中异形；软准-确证约 72% 指向人类**，这是当前误逐的主要噪声源。
  - 上一批（改动前同 seed 1000 局）为 57.5/42.5；本批位移在 ±3pp 量级内，但方向是朝人类（与 RUSH/保安削弱一致）。
- **下一批立项依据**：若要提高驱逐准确率，优先收紧 `almost.foe` 的票权/证据种类，而不是放宽 `CONFIRM.nearR` 或给 `known` 增加“人类也能做”的行为；真人局拉闸断电会造成 `knownWritesHuman` 非 0，需要单独裁定是否区分玩家/异形语义。

## [未发布 · 小游戏图内要素落实（直接操控生成图里的电线）] — 2026-11-06

- **本批改动**（用户 2026-11-06 裁定：主攻「小游戏图内要素落实」；已生成的两张千问面板图按「非商用项目」可用于游戏内；**后续补充 3D 美图素材一律 SDXL、千问本地生图暂停使用**）：
  - **板描述唯一真源**：新增 `js/data/plates.js`（`window.SKPlates`，`Object.freeze` 防改写）——板图路径、裁切区、断口坐标、线标注集中一处；`forLabel()` 给出「任务名 → 板」映射（电路维修 / 备用配电盘 / 出库扫描 → `panel-fix`），`defaultPlate()` 兜底 fix/revive 无点位动作；3D 端要复用时读同一份。加载清单按红线同步：`index.html` 在 `data/map` 之后插入 `data/plates`。
  - **wire 玩法换成图内要素**：`js/t2/minigame.js` 的接线不再是"图外画两组端口 + SVG 连线"，而是渲染真图板：同一张图挂两层，面层用 SVG mask 在断口处把原图中段挖掉（孔里透出的是压暗虚化的"面板内腔"）；点断口一端 → 再点另一端，遮罩合拢、**原图像素自己长回来**，全程不新增任何一根线。接通瞬间一道电流脉冲沿标注路径跑一趟（特效，不是新线）。无板数据时回退旧玩法（`buildWireClassic`）。
  - **玩法规则沿用**：接错线（捏住 A 却点 B）→ 整组重来、断口全部复位；难度档只决定启用几处断口——普通 2 / 高难 3 / 电路维修 3；保底语义（到点自动完成、不清零）、Esc 中断清零、进度计数全部不变。
  - **修既有缺陷**：遮罩里「中断（进度清零）」按钮此前只有样式没绑事件，点击无反应；补上绑定，与 Esc 同一条口径（只走 `onCancel`、不结算）。
  - **工具链**：新增 `tools/plate/plate.schema.json`（draft-07 板 schema）与 `tools/plate/validate.cjs`（`npm run plate:check`：自实现 draft-07 子集校验 + 语义校验 + 快照一致性，不引第三方包）；`tools/plate/build.cjs` 改为用 vm 读真源，编译 `tools/plate-demo.html` 并同步导出 `tools/plate/<id>.plate.json` 快照（供 3D / 外部工具消费，与真源逐字段一致）。
  - 门禁留档截图：`tools/screenshots/52_小游戏图内要素.png`（断口 6 个线头肉眼可核对压在真实电线上）。
- **读数变化**：
  - 门禁：**781 通过 / 0 失败**（`tools/_gate-plate.log`，2026-11-06 实跑；上一批 765/0）。其中**本批新增 11 条**：真源结构与冻结、file:// 下板图直接加载（768²，不依赖 fetch/内联）、遮罩内 1 板 / 3 断口 / 6 线头且图外端口 0 个、面层 mask 实现、点两端合拢且已接线头不可再点、接错整组重来、全部接通 3/3、onDone 恰好一次、普通档 2 断口、中断按钮只走 onCancel、保底 3s 自动完成。
  - ⚠ 同一读数里还含 **5 条假设层相关断言**（`ok(HYP…` 由 2 条变 5 条）与 `js/ai/sanity.js` / `js/game.js` / `js/t2/ai.js` / `tools/monte-carlo.cjs` 的未提交改动——那是**并行会话的工作区内容，不属于本批**，本批未评审、未改动它们；781 是混合状态下的实跑值，全部通过。分离提交时需用户裁定。
  - `npm run plate:check`：1 张板 / 3 根线 / 3 条任务映射，0 错误。
- **下一批立项依据（未裁定不动工）**：板扩产（1 张板 3 根线 → 为更多任务出独立板，断口 16→24px）；`panel-breaker.png`（闸刀图、无线束）适合把 `lever` 玩法也做图内化；3D 端按「镜头推近 + Control 层」复用同一套板描述。



## [未发布 · 小游戏保底语义 + 真假同价 + 二组收尾（口供对质 / 情境抽样）] — 2026-11-05

- **本批改动**（用户 19:18 / 19:29：「小游戏没接进去」「做任务和假装做任务分值必须一样」「任务没有限时，只有保底 10 秒」「略微增大任务量、写清怎么做」）：
  - **修「小游戏没弹出来」**：`js/t2/minigame.js` 的 `#mg` 原来 `z-index:80`，而游戏根容器 `#v3-root` 是 **9999** —— 遮罩一直在画布**底下**：DOM 里 `open=true`、`getComputedStyle` 全部 visible、尺寸 1366×900，玩家却一个字都看不见。改成 `10000`（仍低于设置 10010 / 复盘 10005）。这不是"没接进去"，是接进去了但画在下面。
  - **保底语义（没有限时）**：`tick()` 到点不再 `settle(false,'超时→清零')`，改成 `settle(true,'保底时间到 · 任务自动完成')`。保底按档位：普通 **10s** / 高难 **16s** / 电路维修 **20s**（`FALLBACK`）。进度条从"倒计时"改成"已用时间"，标题右侧显示「保底 Xs」。**中断（Esc / 中断按钮）仍清零重做**，这条没变。
  - **任务量与清晰度**：接线 4/5/**6** 条（普通/高难/电路维修）、放置 4/5 件（槽位永远多一个诱饵）、配对 4/5 对、货架 4/5 层；标题旁新增步骤计数「0 / N」，每一步的提示都带数字（"已放置 2 / 4，继续"），当前该点的端口/零件加一圈呼吸光。目标时长按玩法步数控制：普通 4~6s、高难 8~10s、电路 9~12s。
  - **真假同价**（用户裁定）：`CRED.gains.fakeWork = taskDone = 0.12`、`fakeRepair = fixDone = 0.20`。以前 fake 0.08 低于真做，等于引擎替目击者"看出破绽"；现在同一种行为只值一个价。连带 `valueMul` 对这两项归 1，异形演出的性价比回到"和真做一样"。"演出会露馅"改由行为侧承担（时长、位置、有没有真把故障修掉）。
  - **一体两面**：`credBroadcast` 里异形目击者不再"看见也白看"，而是拿**同等数值的敌对分**（`susAdd(...,'seen_work')`）。已认出的队友除外（异形知道自己人，不算读心）。
  - **二组 · 异形自述口供进对质**：`buildMeetCtx` 的时间线对质原本内层 `if(a.alien) continue`，人类口供会被核对、异形那句「我昨晚在监控室」零风险。去掉该短路后按"真人会不会这样"补了两条约束：① 只有**案发舱室**的目击才算"对不上"（被看见在食堂不否定"我在配电室"，可能只是路过）；② **只有本夜真的动过手**的异形才编假口供，没杀人的那夜说真话（`_lie=null`）。判据对所有人一套，行为分布不同才是合理的。
  - **二组 · 概率漂移由可观察情境驱动**：新增 `witnessCtxMul(x,y,nSeen)` —— 只有三个输入：当时几人可见（人多→各自注意力被摊薄）、是否断电、附近 8 秒内是否刚出过事。输出夹在 `[0.72,1.10]`，每场算一次情境因子、每个目击者各自抽样一次（±6%）。挂在三条证据侧：`credBroadcast`、构陷 `heard_frame`、玩家证词 `heard_claim`。不读性格、不读阵营。
  - 顺带修性能：情境因子原来是"每个目击者扫一遍上万条事件流"，1000 局慢了约 50%；改成从尾部倒扫、超过 8 秒即停，且每场只算一次。
- **读数变化**：
  - 门禁：**728 通过 / 0 失败**（`tools/_gate-g2e-20261105.log`）。过程中两条因证据侧抽样而失效的旧断言按新语义改写：`fakeWork` 兑现改为"落在抽样带内"（`>= gain*0.70`）；玩家构陷用例改成断言"目标 why 里不出现 `heard_claim`"，因为目标可能被**它自己**的谎报位置扣分（那是另一条独立线索）。
  - 300 局（`--games 300 --seed 20261030`，最终态）：人类 **208（69.3%）** / 异形 92（30.7%） / 超时 0。相对上一版 57.4% 是 **+11.9pp**，**越过 ±3pp 护栏**。
  - 归因不是猜的，做了四组对照（每组 300 局）：关掉"异形敌对分镜像"→ **74%**（几乎不动，排除）；恢复"异形口供豁免"→ **60%**（回到护栏附近，确认主因）；只收窄到案发舱室 → 72%；再加"只在作案夜编口供" → 69.3%。结论：**判据一致就必然只查到异形**，因为它是唯一总在撒谎的一方 —— 这不是判据分叉，是行为分布。
  - 机制侧：`contradictions` 44.97 → **36.74**/局；`humanExiles` 1.42 → **1.03**（人类被冤逐少了）；`alienExiles` 1.50 → **1.82**（异形被对质逐出多了）。两个方向叠在一起才是 +12pp。
- **待你裁定**：人类胜率 69.3% 是否接受。我**没有**再往下调数值。若要把胜率拉回护栏，机制层最小改动是"自述对质需要**两个不同听众**各自对不上才成立"（真人也不会凭一眼咬定），而不是把异形重新豁免掉。
- **三组未动**：逐条结算、证词通胀降判断、行为序列、发言关系、可达性反事实、假设层。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · AI 拟人化（二组）+ 玩家决策 · 高难 8 型接入 + 信任通道与 LENS 基准序] — 2026-11-05

- **本批改动**（用户 18:50：「原型给它加进来，然后现在把第二组推进去」）：
  - **10 型全部接进运行时**：`js/t2/minigame.js` 从 3 型扩到 10 型（`sync` / `pour` / `wire` / `swap` / `align` / `aim` / `match` / `level`，加 `place` / `lever`），并新增 `BY_LABEL` 表把 26 个任务点逐点标注：**高难 8 个各占一型**，普通 18 个按舱室与名称归类。`playerMiniGame()` 通过 `a._taskPt` 取点位标签传入，`kindOf()` 优先按标签、再按动作兜底。
  - **二组 · LENS 进运行时（只做基准序）**：`CRED.gains` 按 `LENS.lr` 的单调序重排 —— `fixDone` 0.16→**0.20**、`revive` 0.20→**0.16**、`dragToMed` 0.10→**0.16**、`breakerOn` 0.14→**0.12**、`taskDone` 0.10→**0.12**、`fakeWork`/`fakeRepair` 0.10→**0.08**。仍是人定档位、不写 `w = f(lr)`，只保证两侧**同序**（10 > 6 > 3 > 1.2）。
    副作用：`valueMul = gains/fakeWork` 随之改变，异形挑演出的优先级从「假装修理最划算」变成「真修 > 救人/拖人 > 合闸/做任务 > 假装」。
  - **二组 · `heard_vouch` 通道**：`pushEndorse` 的台词**说出口的那一刻**给全场听众写 0.05 正向信任 + `heard_vouch` 事件（带 `by`）。权重刻意低于 `CRED.gains` 最低档（0.08），只做软证据。此前背书只出声、不写分 —— 与 `heard_frame` 不对称，属于「通道少一条」。
  - 门禁夹具：`fakeWork` 兑现断言从 `>= 0.10` 改为 `>= FAKET.gain - 0.005`（`gain` 由夹具从浏览器侧读出）——判据语义仍是「走同一条兑现口」，不再钉死某个数。
- **读数变化**：
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
  - 门禁：727/1（`fakeWork` 写死 0.10）→ 728/0（`_gate-g2c-20261105.log`）。中间一次 `SKSanity is not defined` 是断言作用域写错，已改为夹具回传。
  - 接入实测（无头 Edge，`?test&mini`）：10 个点位逐个按 E，玩法全部对上（引擎组同步→sync、氧气循环→pour、电路维修→wire、变压器换芯→swap、手术台校准→align、靶道校准→aim、监控墙重连→match、货架校准→level、零件台→place、药柜→match），控制台零报错。
  - 1000 局（`--games 1000 --seed 20261030`）：人类 **574（57.4%）** / 异形 426（42.6%） / 超时 0；上一版 57.5 / 42.4 / 0.1 ⇒ **−0.1pp**，基本不动。`almostFriendCount` **0.573**、`credShieldVotes` **0.596**（39.8% 局触达）、`realFixes` **0.008**（0.8% 局触达，从长期 0 变成非 0）。信任表重排没有把胜率带偏，方向是"换序不换总量"。
  - `vouchHeard` 未进 `mc-report`（统计聚合只收白名单键），读数以 `almostFriendCount` / `credShieldVotes` 为准。
- **二组剩余**：异形自述口供进对质、概率漂移按可观察情境抽样（证据侧目前仍是同一增量）。
- **三组未动**：逐条结算、证词通胀降判断、行为序列、发言关系、可达性反事实、假设层。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 讨论期投票 + 准-确证 0.35 + 小游戏试玩接入] — 2026-11-05

- **本批改动**（用户 17:26：白天投票结构——讨论阶段也能投、投票结束前可改；准-确证门槛降到 0.35；推理层全量推进；小游戏归玩家决策；小游戏暂时接入 `game.js` 试玩）：
  - **投票结构**：抽出 `renderVoteButtons()`，`openMeeting` 与 `startVote` 共用。**讨论阶段就出现投票按钮**，点谁覆盖谁；`m.votes` 从会议开始就存在、`closeVote` 才结算，所以早投不会提前锁定；玩家自己的改票次数记进 `stats.voteChanges`。投票期按钮保留，可一直改到投票结束。
  - **数值**：`SKSanity.ALMOST.foeSus` **0.55 → 0.35**（人类与异形 AI 同一条门槛）。注释同步改写，保留"与 `CARRY.cap` 是同一件事两端、改动必须重跑 1000 局"的告警。
  - **小游戏试玩接入**（归玩家决策域）：新增 `js/t2/minigame.js`（接线 / 放置 / 拉闸杆三型；样式令牌与 `js/ui/templates.js` 一致）。`tickDoing` 由 `playerMiniGame()` 接管：遮罩打开后**计时交给遮罩**，玩通即结算，失败/中断立即作废并提示「进度清零，需要重做」。
  - **测试/模拟不弹**：`?test`、旁观、`SIM_RUN`、`G.simMode` 四条短路；新增 `?test&mini` 调试口径——跳过开局会议但保留遮罩，用来试玩与验证接入。
  - 会议打开时只收遮罩、不结算任务（「会议不打断任务」这条不动），会后按剩余时长重开。
  - `index.html` 加载清单插入 `t2/minigame`（`t2/decision` 之后、`game` 之前）；`AGENTS.md` 红线 2 顺序串、`README.md` 分层约定同步；`game.js` 10,147 行。
- **读数变化**：
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
  - 门禁：投票 + 阈值 **728/0**（`_gate-vote-20261105.log`）→ 小游戏接入 **728/0**（`_gate-minigame-20261105.log`）→ 修通关重入后 **728/0**（`_gate-minigame2-20261105.log`）。三次全留档。
  - 1000 局（阈值 0.35）：人类 **575（57.5%）** / 异形 424（42.4%） / 超时 1（0.1%）；上一版 60.3 / 39.6 ⇒ **−2.8pp**，护栏内。`almostCount` 3.909 → **6.429**、`almostEject` 1.049、`almostVotes` 6.247、`exiles` 3.105。
  - 接入实测（无头 Edge，`?test&mini`）：按 E → 遮罩打开（`kind=place`、`attention=ui`）→ 三格放置通关 → `tIdx 0→1`、遮罩关闭、`attention=online`、控制台零报错。
- **分类口径（用户裁定）**：推理层归 **AI 拟人化**；小游戏归 **玩家决策**。与现行 `ARCHITECTURE.md` §2/§3 一致，未改架构图。
- **推理层剩余（未做）**：LENS 进运行时、`heard_vouch` 通道、异形口供对质、概率漂移抽样、逐条结算、行为序列、发言关系、可达性反事实、多解释假设层。本轮只完成「结论到行动」的投票结构与一条数值，其余按组排队。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 玩家决策 · 任务小游戏分型（高难 8 型 · 普通按舱室）] — 2026-11-05

- **本批改动**（用户 16:32：高难各一个独特任务、普通按舱室与名称分类、尽量保证多样性、UI 必须忠于主页与游戏内风格）：
  - `tools/minigame-preview.html` 重做：左侧 27 项清单（26 个任务点 + 电闸）按 8 个舱室分组，右侧是对应玩法；每行标出玩法名与时限。
  - **高难 8 个各占一个独立玩法**：引擎组同步 `sync`（三通道调进亮带并保持 0.6s）、氧气循环 `pour`（注到刻度带，溢出/不足都重来）、电路维修 `wire`（端口接线）、变压器换芯 `swap`（取旧芯 → 插同型号）、手术台校准 `align`（三探针拖到靶心）、靶道校准 `aim`（准星进带连中 3 次，脱靶清零）、监控墙重连 `match`（图标配对，错配 3 次重来）、货架校准 `level`（四层对齐虚线）。电闸/合闸仍是 `lever`（长按充能 + 火花粒子）。
  - **普通 18 个按舱室与名称归类**：引擎 / 食堂 / 军械库 / 仓库 → `place`（零件、餐具、弹药、货箱归位）；生态舱 / 医疗间 → `pour`；娱乐室 / 监控室 → `match` 与 `sync`；配电室与仓库的电气类 → `wire`。
  - **UI 令牌改为读 `js/ui/templates.js` 的真值**：面板 `#12161E`、描边 `#2A3240`、正文 `#DDE3EC`、琥珀 `#F0C674`、告警 `#FFB020`、弱化 `#8FA6C0`、按钮 `#1D2530 + #313B4B`、字体 `system-ui + Microsoft YaHei`、卡片 14px / 按钮 8px 圆角。此前原型那套亮青是自配色，已删除。
  - 时限直接读任务点声明（4/5/6、7/8/9、电路 10、电闸 4.5），与 `js/data/map.js` 同源；中断/失败一律进度清零重做。
- **读数变化**：无游戏逻辑改动、未动 `js/`、未跑门禁与模拟（纯原型）。无头 Edge 校验：27 项全部可构建、控制台**零报错**。
- **未做**：普通任务还没有各自的"擦拭 / 清点 / 节奏"三类独立玩法，先按舱室复用；接入 `game.js` 仍未开始（等 `?test` 自动解题方案确认）。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 玩家决策 · 任务时长口径 + 小游戏底图] — 2026-11-05

- **本批改动**（用户 16:10：小游戏三型「全部通过」；普通任务 4–6s、高难 7–9s、电路维修 ~10s；用 Blender/SDXL/Qwen 出与整体背景一致的图；随后更正「**任务**素材，不是人物」）：
  - **任务时长重排**（`js/data/map.js`，26 个点）：普通 18 点按 **4/5/6** 轮转（各 6 个）、高难 7 点按 **7/8/9** 轮转（3/2/2）、电路维修 **15 → 10**。保留"不等"，不取统一值。
  - **门禁判据跟着口径走**（`tools/test-v3.cjs` 6 处，均为"旧时长写死进断言"的用例）：`18 个 =8 / 7 个 =12 / 1 个 =15` 改成「落在 4~6 / 7~9 区间 + =10 + 三类数量不变」；幽灵 1.6×、重按 E 重来、AI 未瞬间完成三条改成按任务点声明的 `dur` 推算。**未改阈值、未改判据语义**，改的是"时长口径"这条事实本身。
  - `_t` 只增不改：`points()` 补 `dur` 字段（断言要用）。
  - **小游戏底图**：本地 Qwen-Image 2.1 Turbo（768² · 8 步 · Vulkan · 单张约 100s）出两张，接进 `tools/minigame-preview.html`：
    `assets/minigame/panel-fix.png`（圆形检修口 + 裸露彩色线束 + 两侧青色灯条 + 琥珀警示牌）、`panel-breaker.png`（红色重闸杆 + 黄黑警示条 + 青色指示灯）。
    风格沿用主场景令牌（深空底 `#050A14` / 青绿 `#00E5B0` / 琥珀 `#F0C674` / 异形红 `#E0574F`）。
  - **参考素材**（按「任务素材、不是人物」更正后重搜）：OpenGameArt `Control Board`（CC0 · 3D · 含 LOD 的电路板）、`Sci-Fi Facility Asset Pack`（CC0 · 含电脑/按钮/电闸等任务道具）、Summer Engine 的 CC0 控制台正面图（构图参考）。**只作参考，未入库、未复制、未进正文**。
- **读数变化**：
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
  - 门禁：开工前 **728/0** → 首跑 **724/4**（`tools/_gate-taskdur-20261105.log`，四条都是旧时长写死）→ 改判据后 **727/1**（`tools/_gate-taskdur2-20261105.log`，`_t.points()` 缺 `dur`）→ 补探针字段后 **728/0**（`tools/_gate-taskdur3-20261105.log`）。三次读数全留档。
  - 1000 局（`--games 1000 --seed 20261030`）：人类 **603（60.3%）** / 异形 **396（39.6%）** / 超时 **1（0.1%）**，Wilson 57.23~63.29。上一版（A 批后）54.2 / 45.8 / 0 ⇒ **+6.1pp，越 ±3pp 护栏**（方向相反）。与 A 批的 −4.2pp 部分抵消，**净 +1.9pp**（对齐一组读心清零后的 58.4%）。
  - 机制读数：`nights` 5.860 → **5.532**、`meetings` 11.781 → **11.135**、`knives` 9.879、`exiles` 3.010、`knownWrites` 5.929 → **5.734**、`contradictions` 46.004。任务变短 → 进度更快 → 局更短，胜率朝人类走，与机制方向一致。
  - **口径说明**：两批各自都越过护栏，但方向相反；按用户 16:03「不作平衡调整」，**不追加补偿**，两条读数原样留档，作为下一批立项依据。
- **注**：Qwen-Image 2.1 是 **Research License（仅研究/评估）**，底图只用于内部评估；要发行需换 SDXL 或 Qwen 1.0（Apache-2.0）。SDXL 现管线（`tools/gen-materials.py`）不变。

## [未发布 · AI 拟人化 · A 批：注意力三态（小游戏前置）] — 2026-11-05

- **本批改动**（用户 14:28 裁定：3D 走**独立分支**不替换 2.5D、小游戏**按任务分几套**、**中断即重做**、暂停由 **AI 按性格概率**自动、美术**沿用 SDXL**、千问只做游戏外）：
  - `js/game.js` 新增 `attention(a)` 三态 —— `suspend`（会议 / 结算 / 死亡 / 倒地 / 拘留）、`ui`（小游戏 / 监控 / 破坏选舱 / 管道选点）、`online`。它只回答「此刻能不能**看见**」，不持有任何分数，不是第二个 sus。
  - **三个「看见」入口统一挂到三态下面**：`watchersAt`（观众表）、`noticeAction`（`saw_*` 目击写入）、`alienAudienceInfo`（伪装收益与风险）。这是「异形能从背后接近做任务的人」的唯一实现点，不再留旁路。
  - `hear()` 从「`G.camView` 就聋」改成「只有 `suspend` 才断」：UI 遮罩期间**听觉保留**，与三态矩阵一致。
  - `_t` 只增不改：新增 `attention(w)` 探针；新增遥测 `uiWitnessSkip`（被 UI 挡掉的目击次数）。
- **读数变化**：
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
  - 门禁：开工前 **728/0** → 本批首跑 **728/0**（`tools/_gate-attention-20261105.log`，一次通过）。
  - 1000 局：人类 **542（54.2%）** / 异形 **458（45.8%）** / 超时 0，Wilson 51.10~57.27。对比上一版 58.4 / 41.5 / 0，**−4.2pp，越过 ±3pp 护栏**。归因明确：`knownWrites` **7.029 → 5.929**（每局少 1.1 次确证目击）、`nights` 5.687 → 5.860、`meetings` 11.335 → 11.781 —— 做任务的人不再目击，「站桩=全盲」这一刀砍得比设计意图重。
  - **本批定性：门禁绿、护栏红**。用户 16:03 裁定「**不作平衡调整**」⇒ 读数原样留档，不补偿、不耦合夜长；这条降为下一批立项依据，不在批内回写。
  - 未改 `SKSanity` 任何数值、未改地图、未改 `index.html`。
- **备查（未采纳的补偿口径）**：① `ui` 态保留近距离例外（≤2 格）；② 缩短小游戏占时；③ 夜长 / `WIN.pts` 反向补偿。三条均未实施。
- **下一批**：B 批小游戏（按任务分套、中断重做）+ C 批听觉接管与量化（`fleeBySight` / `fleeBySound` / `pauseBySound` 遥测）。`uiWitnessSkip` 未进 `mc-report`（统计聚合未收录该键，读数以 `knownWrites` 为准）。
- **B 批前置产出**：`tools/minigame-preview.html` —— 接线 / 放置 / 拉闸合闸三种类型的可独立试玩原型（遮罩 84%×82% ≈ 69% 面积，中断清零重做），只验证手感，未接入 `game.js`。

## [未发布 · AI 拟人化 · 一组读心清零（感知入口）] — 2026-11-05

- **本批改动**（用户 13:06「注意力可以选择不加，其他优化都可以往前推进了」；锚点按 `8a9ec72` / 728 条 / `game.js` 10,046 行；注意力基底按裁定**不入本轮**）：
  - **感知入口落地**：`js/t2/ai.js` 新增 `envEstimate(a,i)`、`audSusEstimate(a,w)`、`pubAccusers`、`pubSolidAccusers`、`publicHeat`、`publicInfluence`。允许输入只有四类 —— 自己的记忆（`mind.mem` / `known` / `seenBy`）、自己的性格、世界状态（红光 / 拖尸 / 公开领袖）、公开事件（**已经说出口**的 `accuse` / `accuseWhy`）。返回 `{score, conf, whyKind, cues}`，每条 cue 带 `why`（哪条可见线索）与 `alt`（同一线索的另一种解释）。
  - **边界写进注释**：引擎代某个 AI 推演**他自己的**信念（例：`justified` 读目击者自己的 `known`）不算读心；某个 AI 为自己的决策去读别人的私有状态才算。本批只清后者，前者原样保留 —— 这条边界同时是「不换皮读心」的判据。
  - **清零点**：`alienAudienceInfo`（原读 `susOf(w,a.i)` + `w.trait.soc`）、夜间回避（原读 `w.mind.sus[a.i]`）、`alienReportWorth` 的热度与自牵连（原扫全场 `mind.sus`）、异形反咬的盟友背书判断（原读 `ally.mind.known`）、会议挑确证者（原读 `w.mind.known`）、追问者 / 站队者 / 追问否认者（原读 `w.mind.sus`）。
  - **`_t` 只增不改**：新增 `envEstimate(w,i)`、`audSusEstimate(w,other)`、`pubAccusers(i)`、`publicHeat(i)` 四个探针。
  - **门禁夹具**：`tools/test-v3.cjs` 观众加权用例把「往 w 的私有 sus 灌 0.9」改成「补一条当众指认」。断言含义不变（演给已怀疑我的人更值），变的只是可被观察的通道；未改阈值、未改判据。
- **读数变化**：
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
  - 门禁：开工前 **728/0**。本批首跑 **727/1**（`_gate-mindread-20261105.log`，失败项＝观众加权用例仍靠私有 sus，属语义冲突、非偶发）；修夹具后 **728/0**（`_gate-mindread3-20261105.log`）。把公开口径助手改成承重调用后 **726/2**（`_gate-mindread-final-20261105.log`，两条均为项目已登记偶发：「领取物资申请单」时序、「反向洗清」0.51）；原样复跑 **728/0**（`_gate-mindread-final2-20261105.log`）。五次读数全部留档，未调阈值、未改判据。
  - 1000 局（`--games 1000 --seed 20261030`）：人类 **584（58.4%）** / 异形 **415（41.5%）** / 超时 **1（0.1%）**，Wilson 55.32~61.42；对比上一版 57.9 / 42.1 / 0，**+0.5pp，护栏 ±3pp 内**。平均触达：`almostCount` 3.0、`reliaWrites` 94.28；`avoidCount` **48.196 → 23.345**、`avoidSus` **0 → 0.192**。回避下降是**设计内变化**：它不再读别人的私有 sus，只能由「当众点过我 / 刚看见我在现场 / 我还带着红光」触发，所以频次本就会降；机制没死（9.4% 的局仍至少发生一次）。超时从 0 变 1 局同批记录，不作达标判定。
  - 未改 `SKSanity` 任何数值、未改地图、未改 `index.html`。
- **已知残留（下一批）**：`game.js` 沉默权重仍用 `SKTrait.b(a,'soc')` 判断「他平时话多不多」，属性格推断；归二组（性格轴不参与）一起处理。`DISGUISE.socMin` 因此失去读取点，暂留 `sanity.js` 不删（本批不碰数值真源）。
- **下一批立项依据**：________（候选：① 一组第二批 —— 会议「谁来说」剩余私有读取全换 `envEstimate` 并加静态审计；② 二组 `heard_vouch` 通道 + LENS 进运行时；③ 三组逐条结算）

## [未发布 · 名单/席位 + 文案与教学批 + AI 推理施工单] — 2026-11-05

- **本批改动**（用户 07:39「文档对齐 / 开始页改名 / 玩家不再固定 1 号 / 推进其他改动 / AI 推理准备优化」）：
  - **文档对齐**：统一 `AGENTS.md` / `ARCHITECTURE.md` / `README.md` / 交接文档 / `docs/_planned/*` 的现行读数到 **728/0** 与 `game.js` **10,044 行**；给 `docs/交接_深度…`、`docs/调研报告_…20261104` 加“T1–T6/T8 与 N2/N3/N5 已修”的时点补记；`_planned/01` 标明 712 是施工时读数；新增本批台账。
  - **名字唯一真源**：新建 `js/data/names.js`（`SKNames.DEFAULT` 15 席 + `EXTRA` 20 个备选）；`game.js` 不再内联 15 个名字，`home.js` 从同一份数据渲染名单。`index.html` 加载清单插入 `data/names`（在 `data/map` 之后）。
  - **开始页名单编辑**：`#home-names` 面板（默认折叠）—— 玩家名 1 个 + AI 名 14 个，支持「随机名字 / 恢复默认」；改动写 `localStorage`（`sk.roster.v1`），新输入的名字并入本机名字库（上限 60），下次随机可抽到。重名/空名自动去重补位，保证 15 席唯一。
  - **每局随机席位**：`newGame()` 的玩家席位从固定 0 改为 `0~14` 随机；异形按阵营重新分配（人类局排除玩家席，异形局包含玩家席，旁观局保持旧口径以维持 1000 局基线可比）。`?test` 仍固定 0 号；新增 `?test&randomseat` 探针页验证真实随机路径。HUD 身份行改为「07 名字 · 人类」，让玩家一眼看到自己是几号。
  - **推理侧同步去 0 号假设**：`js/t2/decision.js` 的 `seatIndex()` 允许 0 号（1 号席位），`parseSpeech()` 改为排除 `G.me` 而不是硬编码 0 号；名字匹配改“长名优先占位”，自定义名字互相包含时不会把「星尘」认成「星」。
  - **T6 模板默认对象**：`syncMeetTemplates()` 默认「— 选择对象 —」，未选对象点「怀疑 / 投他」只提示「先选对象」，不再误指控 02；选择记忆按**场次 + 局**重置（新局清 `__meetSeq`，修掉跨局把上一场目标带进来的问题）。
  - **N2 键位提示**：`#tip` 覆盖 17 个单键（W/E、A/Q、S/X、D/G、F、R、B、H、V、T、C、M、P/ESC），并明确「W/A/S/D 不是移动」。
  - **N3 主页玩法说明**：从 148 字扩到 **230 字**，补移动/交互/搜尸/亮暗视野/幽灵/声纹环/报告额度；胜利分改读 `SKSanity.WIN.pts`（不再硬编码 45）。
  - **N5 声纹环教学**：第一次出现声纹时 toast 一次「声音的方位 · 越近越亮 · 不显示身份」，之后不再打扰。
  - **AI 推理优化准备**：新增 `docs/_planned/04-AI推理优化施工单.md`（现状地图、8 条问题、A~E 批次与验收、待裁定项），**不改任何 AI 数值/判定**。
  - **门禁 720 → 728**：新增 8 条断言 —— 开始页名单面板、玩法说明扩写 + `WIN_PTS`、提示栏 17 键、T6 占位、自定义名单 + 指定席位、重名兜底、声纹环一次性教学、非门禁口径随机席位（8 次开局出现 6 个不同席位：7,9,12,9,11,3,12,5）。
- **读数变化**：
  - 门禁：**728 通过 / 0 失败**（`_gate-final3-20261105.log`）。中间 `726/2`（提示栏旧断言写死“S 搜尸”、T6 探针失败）、`727/1`（T6 跨局选择记忆）、`727/1`（既有「旁观者点击直线飞行」2.7 格）均如实保留，修复后复跑 728/0；未改测试判据、未调阈值。
  - 名单实测：指定 07 席 + 自定义 14 名 → 15 名唯一、4 异形、玩家非异形；重名/空名自动补位。
  - 语料 **1400 通过 / 0 失败 / 118 提示**（未改语料，复跑确认）；未改 `SKSanity`、地图、AI 决策。
  - **未跑 1000 局**：旁观局的随机路径刻意保持不变，`57.9% / 42.1%` 仍是现行参照；真人局随机席位不改变规则，但会挪动随机流，下一批跑模拟时以新读数替换。
- **下一批立项依据**（用户裁定后填）：________（候选：① T7 昨夜死者名单（需拍板）；② N1 首局 50 秒锁人（涉 `MEET.discussPre`，需拍板）；③ N4 电态教学 + N6 移动端；④ 按 `04-AI推理优化施工单.md` 的 A（遥测）→ B（性能）→ C（拆谎）逐批放行）

## [未发布 · 体验修复批：T1/T2/T3/T4/T5/T8] — 2026-11-05

- **本批改动**（用户 07:07「查看还有哪些任务」→ 从可选项中选择「体验修复批」）：
  - **T1 尸检卡片不再偷夜钟**：`openBodyCard()` 记 `openedAt`；`closeBodyCard()` 按冻结的墙钟时长平移 `G.phase.startedAt / endsAt`，与 `togglePause()` 同一套补偿口径；不新造计时器、不改 `loop()` 冻结条件。新增 `_t.closeBody()` 探针（`_t.openBody()` 原已存在）。
  - **T2 结算按钮固定首屏**：`#end .card` 改 `padding-bottom:0`，`.btns` 改 `position:sticky;bottom:0` + 卡片同色底；身份表 / 投票矩阵仍可滚，按钮条不再被挤到折叠线以下，也不会从按钮条下方漏出表格行。
  - **T3 DEV / 旁观顶栏让位**：`syncDevUi()` 按运行时 `dev.offsetHeight` 给 `#meet` / `#end` 设 `padding-top + align-items:flex-start`，并收紧两卡的 `max-height`；`openMeeting()` / `endGame()` 各补一次同步。**不用 margin-top**：覆盖层是 flex 居中，margin 会被折半，窄屏仍会被盖。
  - **T4 死亡文案与新规则对齐**：阵亡 toast 改为「仍可做自己剩下的任务（1.6×，最多 2 分）」；同批修掉幽灵 HUD 提示里的第二处矛盾（原文写「E 维修任务…/故障」，而 `startFix()` 明确拒绝幽灵修故障）。
  - **T5 投票期禁输入**：`startVote()` 禁用 `#m-text` / `#m-send` 并把占位改为「投票中…」；`openMeeting()` 统一恢复讨论期状态（输入框 + 发送按钮同源）。
  - **T8 点名高亮**：`say()` 渲染时，非系统行且文本包含 `G.me.name` → `.hit`（左侧金条 + 极淡底色）；不改台词、不改 `parseSpeech`、不写 `sus`。
  - **门禁 712 → 720**：新增 8 条断言 —— T1 关卡片后夜钟损失、T2 三视口按钮首屏（1440×900 / 1120×700 / 844×390）、T3 会议与结算标题让位、T5 投票期输入禁用、T8 点名行高亮。
  - **文档口径统一**：`docs/_planned/README.md`、`03-方案A…` 顶部状态、`02-档3取舍单.md` 补记，统一为「方案 A 已实施第一~五批 + 收敛 + 第 6 项」；`AGENTS.md` §四新增两条约定（冻结世界的卡片必须补偿相位 / 覆盖层必须给 DEV 栏让位），§六门禁读数更新。
- **读数变化**：
  - 门禁：开工前基线 **712/0**（本批实跑）；最终 **720 通过 / 0 失败**（`tools/_gate-fix-20261105-final3.log`）。中间两次偶发：`718/1`（既有 AI 推理用例「反向洗清」0.51）与 `719/1`（既有「旁观者点击直线飞行」2.5 格），均**原样复跑**为 720/0；两次失败读数都留档，未改测试、未调阈值。
  - T1：读卡（含截图）约 2.3 秒，关闭后夜钟损失 **0.16 s**（阈值 < 0.5 s）；修复前等于整段读卡时长。
  - T2：「再来一局」完整落在首屏 —— 1440×900 为 **798~832**、1120×700 为 **612~646**、844×390 为 **324~358**。
  - T3：DEV 栏实测 **134 px**，会议标题 **162 ≥ 134**、结算标题 **157 ≥ 134**。
  - T8：2 行发言中 1 行点名玩家，命中 **1/2**。
  - 语料体检 **1400 通过 / 0 失败 / 118 提示**（未改语料，复跑确认）；未改 `SKSanity` 任何数值、未改地图与 AI 决策。
- **下一批立项依据**（用户裁定后填）：________（候选：① 文案与教学批 T6 模板占位 + N2 键位提示 + N3 玩法说明改读 `WIN_PTS` + N5 声纹环图例；② N4 电态教学 + N6 移动端布局；③ 架构收尾 `decision.js` 余下会议投票编排 / `runtime.js`；④ 先修门禁时序敏感这条技术债）

## [未发布 · 交付：重构后深度游玩与数据核查] — 2026-11-05

- **本批改动**（用户 21:45「交付吧。同时这次不推送到云端库，你自己做一个深度游玩调研，然后在调研完成后查看各项数据」）：
  - 新增 **`docs/交付调研_重构后深度游玩与数据核查_20261105.md`**（T3 · 验收层台账，`flag: F`）：三路数据 —— 真实浏览器真实输入路径（`ux-audit`）、同 seed 1000 局模拟（`monte-carlo`）、静态核查（门禁 / 语料 / 地图 / 体量 / `_t` 契约）。
  - 实跑更新 **`tools/mc-report.md`**（1000 局 / seed 20261030 / dt 0.1 / 15 夜上限）。
  - **本轮不推送** GitHub / Gitee（按裁定只做本地交付）。`tools/ux-report.md` / `tools/ux-results.json` 已恢复为用户原有版本——量测新读数写入调研报告，不覆盖其未提交工作。
  - 未改任何游戏逻辑与平衡数值；剧情语料、3D 素材按裁定冻结/不上传。
- **读数变化**：
  - 门禁：首跑 **711 通过 / 1 失败**（「旁观者点击直线飞行」3.0 格，已知时序敏感项），原样复跑 **712 通过 / 0 失败**（`_gate-delivery-20261104.log` / `_gate-delivery-rerun-20261104.log`）；两次都留档，未改测试。
  - 1000 局模拟：人类 **579（57.9%）** / 异形 **421（42.1%）** / 超时 0；基线 576（57.6%）/ 424（42.4%）。差 0.3pp，Wilson 区间 54.82~60.92% vs 54.51~60.63% 重叠，二项检验 p≈0.89，**不显著**。平均 5.687 夜 / 11.335 会 / 3.116 驱逐。
  - 真实试玩：一场白天会 **70.4 s**（基线 70.2 s，discuss 49 / vote 15 / reveal 5 三段相同）；落座→可动 **50.2 s**（50.0 s）；会议占墙钟 **59.3%**（58.5%）；整局 **17.5 分**（17.1 分）；FPS p50 **163.9**（同）；控制台报错 **0**（基线 3，入口不同）。
  - 语料 **1400/0/118 提示**；地图 **gaps 0 / dead 0 / unreachable 空**；18 个 `js/` 语法全过。
  - 代码体量：`js/game.js` **9,909** 行；`js/t2/` 三模块 **733** 行；薄委托 **0**。
  - **方法学教训**：`monte-carlo.cjs:276` 明写「同 seed ≠ 同随机路径」，逐局/逐格差值不能归因；本次最初做的逐局对照（46/1000 局不同）**不构成回归证据**，已改用粗粒度总量 + 显著性检验。此条已写入调研报告 §0。
- **下一批立项依据**（用户裁定后填）：无（本批为交付）。两条技术债待排期：① 门禁时序敏感（旁观者断言依赖 900 ms 墙钟，建议改确定性步进）；② 亮度四态量测需先起本地服务器，否则 `file://` 下跨域不可读。

## [未发布 · 薄委托收敛 + 第五批 + 第 6 项] — 2026-11-04

- **本批改动**（用户 21:12「委托收敛为直接调用，然后继续完成第五批和第六个」）：
  - **收敛**：删除 `js/game.js` 中 **25 个薄委托函数声明**，121 处调用点改为直接引用。
    - 先试 `SKT2XXX.fn(...)` 命名空间直调：门禁两次均 **711/1**，稳定挂在「旁观者点击直线飞行」（**2.4 / 2.8 格**，收敛前 4.4 格）。诊断为跨 script 全局对象属性查找拖低渲染帧率、主循环 `dt` 被钳制后模拟时间落后墙钟 —— **确定性性能回归，不是偶发**。
    - 改为「**局部别名直接引用**」：在 IIFE 顶部写 `const ready=SKT2Space.ready;` 等 25 个绑定，调用点写裸名。别名是同一个函数对象的直接绑定，**不是委托、没有转发层**，同时恢复闭包内局部解析速度；旁观者读数回到 6.6 格。真源仍是 `js/t2/*.js`。
    - 别名版两次门禁 **710/2 → 712/0**（失败项不同，与项目历史偶发模式一致）。两次读数都保留，未为凑读数改过程。
  - **第五批**：`MEET_SCHED`（会议排期运行时状态）+ `stopChatter` / `meetLater` / `sayStreakOK` 整组外提到 `js/t2/decision.js`；`MEET_SCHED` 从 `game.js` 删除定义，`game.js` 只留 3 个局部别名，调用点零改动。门禁 **712/0**。
  - **第 6 项**：AI 拟人化域认知链 **23 个函数、301 行整组**外提到 `js/t2/ai.js`（`evPush` / `susAdd` / `evalAlmost` / `checkAlibi` / `bestKnownTarget` / `mindReset` / `evNow` / `claimWindow` / `knownOverride` / `evidenceReason` 等），含 `MEM_MAX=64` 常量。整组**组外函数依赖为 0**，故可一次搬完；11 个需要状态的函数改用 `_t.G()`，`NIGHT` / `SKSanity` 改读量化表；函数体逐行一致。`game.js` 留 23 个局部别名，调用点零改动。门禁 **712/0**。
  - 按施工单 §九 规则复查：`tools/` 下新外提符号只有注释与 `_t` API 调用（`t.checkAlibi` / `t.evalAlmost` 等），**没有对 game.js 源码的静态读取断言**；`_t` 契约属性完整保留。`index.html` 加载清单未变（无新增脚本文件）。
  - 体量：`js/game.js` 10,245 → **9,909 行**；`js/t2/` 三模块 113 + 425 + 195 = **733 行**。剧情语料、切片清单、3D 素材与 `tools/ux-*` 均未动、未提交。
- **读数变化**（全部如实保留，不 cherry-pick；未跑 sim，未改任何平衡数值）：

  | 日志 | 结果 | 说明 |
  |---|---|---|
  | `_gate-batch4-20261104.log` | 712/0 | 收敛前对照，旁观者 4.4 格 |
  | `_gate-converge-20261104.log` | 711/1 | 命名空间直调，旁观者 2.4 格 |
  | `_gate-converge-rerun-20261104.log` | 711/1 | 原样复跑，旁观者 2.8 格 → 判定确定性回归 |
  | `_gate-converge-alias-20261104.log` | 710/2 | 别名版首跑，旁观者 6.6 格 PASS，另两条时序项 |
  | `_gate-converge-alias-rerun-20261104.log` | 712/0 | 别名版原样复跑 |
  | `_gate-batch5-20261104.log` | 712/0 | 第五批（会议排期外提） |
  | `_gate-batch6-20261104.log` | **712/0** | 第 6 项（认知链整组），亦为最终代码状态 |

  18 个 `js/` 语法检查全过，控制台零报错。**结论**：收敛改变了每帧耗时，门禁中依赖固定墙钟时间的断言对此敏感；后续若继续调整热路径，需留意这类时序抖动。
- **下一批立项依据**（用户裁定后填）：________（候选：继续拆 `decision.js` 余下开会 / 投票 / 发言编排，或 `runtime.js` 渲染 / HUD / 输入；两者均需先定依赖注入；或就此收口）

## [未发布 · 方案 A 第四批：空间与资源域几何 / 数值纯函数归位] — 2026-11-04

- **本批改动**（用户 20:54「继续」＝放行第四批；按「分类交给 agent 处理」的既有授权，自行裁定本批范围）：
  - **不新建 `js/runtime.js`**：渲染 / HUD / 输入 / 状态机整体依赖 `ctx` / `VIEW` / `MEET_SCHED` / 定时器与 DOM，硬搬会重演 §八 的全量拆分失败；先做可按三域安全归位的部分，`runtime.js` 顺延为第五批并需先定依赖注入。
  - **`js/t2/space.js` 从「8 个常量」扩展为「常量 + 12 个纯函数 + 2 张表」**（T2 · 空间与资源，`SKT2Space`）：角色/任务数值 `ghostTaskPts` / `ghostTaskAllowed` / `botDead` / `botHp`，地图几何 `corridorLampPos` / `corrJoinsRoom`，渲染方向与配色 `ready` / `rowForAng` / `dirAng` / `workStyle` / `pipeTint` / `k1`，以及 `ROW` / `PIPE_TINT` 两张表。函数体逐行一致，`botDead` / `botHp` 的状态走 `_t.G()`。
  - `js/game.js` 保留 **12 个同名薄委托**；`PIPE_TINT` 定义**删除**（只被 `pipeTint` 用），`ROW` 保留 `const ROW=SKT2Space.ROW` 别名（另有 2 处直接使用）。`AGENTS.md` 文件地图、`README.md` 分层约定、施工单 §七 进度表同步。
  - **`tools/` 静态读取全量盘点**（上轮第 3 条提问，本批前置完成）：结论与逐条清单写入施工单 **§九**。要点：`test-v3.cjs` 的 `GAME_SRC` / `GAME_EQ_SRC` 仍断言 `pickLine` / `_pipeCD` / `breakerOnTime` 等 game.js 形态（本批未碰）；`lines-audit.cjs` 已在第三批改指 `decision.js`；`ux-audit.cjs`（用户未提交）用 `k === 'x'` 正则读输入区键位——本批键位命中数 HEAD 与现在均为 32，未受影响，agent 不改该工具。已把「每批外提前先查静态读取」写成规则。
  - 剧情语料 `js/data/lines.js`、切片清单、3D 素材与 `tools/ux-*` 均未动、未提交。
- **读数变化**：本批门禁实跑 **712 通过 / 0 失败**（`tools/_gate-batch4-20261104.log`，一次通过）；空间域验证物 `node tools/map-check.cjs`：**gaps 0 / dead 0 / unreachable 空**；18 个 `js/` 语法全过。未跑 sim，未改任何平衡数值与数值表。
- **下一批立项依据**（用户裁定后填）：________（候选：第五批 `js/runtime.js` 需先定依赖注入方案；或继续拆 `decision.js` 余下的开会 / 投票 / 发言编排；或剧情语料新版接入）

## [未发布 · 方案 A 第三批：玩家决策域会议基础层] — 2026-11-04

- **本批改动**（用户 20:40「继续」＝放行第三批；上轮其余提问按保守做法：薄委托保留、偶发读数留台账、3D 素材不提交）：
  - 新建 **`js/t2/decision.js`**（T2 · 玩家决策），承接报告额度与会议发言基础层共 **10 个函数**：`bodyReported` / `markBodyReported` / `nightMeetLeft`（额度与消耗），`seatNo` / `tagName` / `tagByName` / `nameOf` / `whenWord` / `seatIndex` / `parseSpeech`（会议时序与传播），以及 `ROOM_WORDS` / `CN_SEAT` 两张词表。函数体与拆分前逐行一致，仅取状态方式改为 `const G = global.SKV3._t.G()`（用户裁定沿用 `_t.G()`）、`SKSanity` 改为模块顶部别名 `SK`。
  - `js/game.js` 保留 **10 个同名薄委托**，下游调用零改动；`ROOM_WORDS` / `CN_SEAT` 从 `game.js` **删除定义**，模块成为唯一真源（不是别名副本）。`index.html` 加载清单在 `t2/ai` 之后、`game` 之前插入 `t2/decision`；`AGENTS.md` 红线 2 顺序 / 文件地图、`README.md` 分层约定、方案 A 施工单进度表同步。
  - **连带修复**（真源唯一）：`tools/lines-audit.cjs` 原从 `js/game.js` 静态读取 `parseSpeech` 的第一人称自述正则，外提后会硬报错；现改为从 **`js/t2/decision.js`** 读正则，并把手抄的 `ROOM_WORDS` 镜像表改为从 `SKT2Decision.ROOM_WORDS` 读取，消除第二份词表。
  - 剧情语料 `js/data/lines.js` 未动（等用户上传新版直接替换）；固定 seed 剧情切片清单随新版一起给；3D 素材与 `tools/ux-*` 仍不提交。
- **读数变化**：本批门禁实跑 **712 通过 / 0 失败**（`tools/_gate-batch3-20261104.log`，一次通过、无偶发项）；语料体检实跑 `node tools/lines-audit.cjs --strict` **1400 通过 / 0 失败 / 118 提示**，报告 `tools/lines-report.md` 无内容变化。未跑 sim，未改任何平衡数值与数值表。
- **下一批立项依据**（用户裁定后填）：________（候选：第四批 `js/runtime.js` 状态机 / 渲染 / HUD / 输入；或继续拆 `decision.js` 余下的开会 / 投票 / 发言编排函数；或剧情语料新版接入）

## [未发布 · 方案 A 第二批：认知链函数外提] — 2026-11-04

- **本批改动**（用户 20:24 裁定「对 / 沿用 / 接受 / 做 / 留 / 暂无」）：
  - 按路径 A 逐批按**函数边界**搬移，第二批：新建 `js/t2/ai.js`（T2 · AI 拟人化），承接认知链三个纯函数真源 `susOf / topSus / crimeWindow`；函数体与拆分前逐行一致，仅两处取状态方式改变：`G.night → _t.G().night`（用户裁定沿用 `_t.G()`）、`NIGHT → SKSanity.NIGHT.len`（原本就相等）。`game.js` 保留同名薄委托，下游调用零改动；`index.html` 加载清单插入 `t2/ai`（`t2/space` 之后、`game` 之前），`AGENTS.md` 红线 2 顺序与文件地图同步。
  - **剧情新版接入流程（仅登记，本批不执行）**：用户后续上传语料新版时**直接替换 `js/data/lines.js`**，同批执行 `node tools/lines-audit.cjs --strict`，把读数写入第 3 层台账；固定 seed 剧情切片清单随新版一起给。
  - 3D 素材与 `tools/ux-*` 继续留在工作区不提交。
- **读数变化**：第七次**首跑 710 通过 / 2 失败**（两条「领取物资申请单」时序断言，控制台无报错，`tools/_gate-batch2-20261104.log`）；**原样复跑 712 通过 / 0 失败**（`tools/_gate-batch2-rerun-20261104.log`），前六次亦均为 712/0。两次读数都如实保留，**未为凑读数改动任何过程**。未跑 sim，未改任何平衡数值。
- **下一批立项依据**（用户裁定后填）：________（第三批 `js/t2/decision.js` / 剧情新版接入）

## [未发布 · 全量拆分技术验证与回滚] — 2026-11-04

- **本批改动**（用户 20:08 裁定「全量按三层拆分 / 剧情语料新版直接替换但暂不做 / 剧情切片随新版一起给 / 延续提交推送惯例 / 3D 素材暂不提交」）：
  - 尝试一次性全量拆分 `js/game.js`（去 IIFE、按三域切 5 个经典 `<script>`），三次自动寻找安全切点均失败，**已完整回滚**；技术结论与可行路径写入 `docs/_planned/03-方案A-按三域切施工单.md` §八。
  - 回滚后 `js/game.js` 与 `ea84505` 逐字节一致，17 个 `js/` 语法全过；第一批 `js/t2/space.js` 保留。
  - 剧情语料 `js/data/lines.js` **本批不动**（新版上传后直接替换）；固定 seed 剧情切片清单随新版一起给；3D 素材未提交，保持工作区原状。
- **读数变化**：回滚后运行逻辑与 HEAD 完全一致；第六次门禁实跑 **712 通过 / 0 失败**（`tools/_gate-rollback-20261104.log`），控制台零报错。未跑 sim，未改任何平衡数值。
- **下一批立项依据**（用户裁定后填）：________（按函数边界逐批搬移 / 共享状态持有者口径 / 剧情新版接入）

## [未发布 · 方案 A 第一批：三域切分启动] — 2026-11-04

- **本批改动**（用户 19:52 裁定「现在就开始 / 剧情后续上传新版 / 消歧一并改名」）：
  - **消歧改名**：`js/game.js` 的局部 `const MEET={id:0,timers:[]}`（会议台词排期运行时状态）改名为 **`MEET_SCHED`**，与 `SKSanity.MEET`（会议配置表）区分；6 处引用同批改完，行为不变。
  - **方案 A 第一块落地**：新建 `js/t2/space.js`（T2 · 空间与资源域），承接 `MOVE_SPEED / DRAG_SPEED / SPECT_SPEED / DOOR_*` 共 8 个常量，数值一个未改；`game.js` 保留同名局部别名引用，下游代码零改动；`index.html` 加载清单插入 `js/t2/space.js`（`ai/traits` 之后、`game` 之前，`sanity` 仍早于 `traits`）。`AGENTS.md` 红线 2 顺序与文件地图、`README.md` 分层约定同步。
  - **共享状态 G**：确认现有 `_t.G()` 已是完整对局状态的只读出口；本批**不改变状态持有方式**，正式持有者（走 `_t` 还是另建 `SKT2.state`）待用户裁定。
  - 剧情 / 语料（`js/data/lines.js`）按用户说明**等后续新版本上传**，本批不动。
- **读数变化**：门禁第五次实跑 **712 通过 / 0 失败**（`tools/_gate-batch1-20261104.log`），与前四次一致、控制台零报错；17 个 `js/` 文件 `node --check` 全过。未跑 sim，未改任何平衡数值。
- **下一批立项依据**（用户裁定后填）：________（`js/t2/ai.js` 认知链 / `js/t2/decision.js` 玩家决策 / 剧情切片新版本）

## [未发布 · 档3裁决 A / 换行统一 / 发布准备] — 2026-11-04

- **本批改动**（用户 19:41 裁定「按三域切 / 先留着 / 统一 / push / 随 / 无需」）：
  - 档 3 取舍单裁决 **方案 A · 按三域切**；新增 `docs/_planned/03-方案A-按三域切施工单.md`（四个目标模块边界、四个耦合点、加载清单约束、验证物、动工前置条件）。**方案已定、尚未动工**，不与本批混组。
  - **换行统一**：仓库级 `core.autocrlf` 置为 `false`（`.gitattributes` 原有 `* text=auto eol=lf` 并补了说明注释）；29 个已跟踪文本文件工作区 CRLF → LF。排除 `assets/` / `audio/`（素材许可受 `MANIFEST` sha256 约束）、`3d/` 子项目、`tools/logs/` 历史归档，以及用户未提交的 `3d/DECISIONS.md`、`3d/README.md`。忽略行尾核对后无夹带内容改动。
  - APK 打包副本 `android/assets/www/` 定为**随下次发布链路**由工具重建，不手工同步。
  - 用户原有未提交工作（`3d/`、`docs/qwen21/`、`tools/ux-*`）**先留着**，本批不纳入提交。
- **读数变化**：门禁实跑见 `tools/_gate-eol-unify-20261104.log`，与前三轮 712/0 对照；按用户裁定**不跑 sim**，胜率基线仍为 57.6% / 42.4%。
> **读数补记（2026-11-12）**：当批未记录实跑读数（历史条目，未跑/沿用）。
- **下一批立项依据**（用户裁定后填）：________（方案 A 动工放行 / 固定 seed 剧情切片清单 / 四个耦合点处置口径）

## [未发布 · 全部层入库 + 硬编码拆除] — 2026-11-04

- **本批改动**（用户裁定「一切层均进库，排除敏感信息 / 硬编码拆除 / 量化表与偏移主导 / 不需要兜底」）：
  - `.gitignore` 移除 `docs/_reference/` 与 `docs/_planned/` 排除；敏感排除（`.env`、`android/release.keystore`、`android/assets/www/`）继续有效。新增 `docs/_reference/README.md` 说明层定位与敏感信息规则，使空目录可入库。
  - **硬编码拆除，量化表与偏移主导**：`js/engine/invariants.js` 删除 `DEFAULT_MAX_PROG = 45` 字面量及全部兜底；胜利分只认 `env.winPts`（来自 `SKSanity.WIN.pts`），缺真源直接抛错；`SKInvariants.MAX_PROG` 导出改为读取量化表的 getter（公共契约名保留）。`js/game.js` 两处时间容差 `>8` 改为 `>SKSanity.ALIBI.core`。**平衡数值一个未改**。
  - 保留不动：`close>8` / `Math.hypot(...)>8`（距离）、`arr.length>8`（数组上限）语义不同，不属于 `ALIBI.core` 的时间偏移。
- **读数变化**：前两轮门禁均 **712 通过 / 0 失败**；硬编码拆除后第三次实跑 **712 通过 / 0 失败**（`tools/_gate-hardcode-removal-20261104.log`），三次一致、控制台零报错。未跑 sim，胜率基线仍为 57.6% / 42.4%。
- **下一批立项依据**（用户裁定后填）：________（档 3 取舍单裁决 / G2 事实表 / 抽独立机制模块）

## [未发布 · 档 1 + 档 2 工程化重构] — 2026-11-04

- **本批改动**（用户裁定「都不入库 / 游戏体验转正 / 先做前两档 / 档 3 出取舍单」）：
  - 层外 P 与 R **都不入库**：`.gitignore` 追加 `docs/_planned/`；`docs/00-先导-游戏体验.md` 去掉 `DRAFT` 转正为现行先导。
  - **档 1 标注层**：16 个 `js/` 文件头部写入 `ARCH NODE` 架构节点标注（纯注释，按各文件原有 CRLF/LF 写入，不改逻辑）；`AGENTS.md` 文件地图补三层口径映射；`3d/ARCHITECTURE.md` 加「不继承主项目三层架构」声明；`docs/*` 报告与说明逐份贴层标。
  - **档 2 定义归位（安全子集）**：`KIND_CRED` 外提为 `SKSanity.CRED.kindMap` 单一真源，`game.js` 只引用；`SKInvariants` 的维修进度上限改由 `env.winPts` 注入（来自 `SKSanity.WIN.pts`），`DEFAULT_MAX_PROG=45` 降为 Node 独立调用兜底；`js/engine/clock.js` 头部标注为未接线历史模块。**平衡数值一个未改**。
  - 档 3 **不动工**，只出 `docs/_planned/02-档3取舍单.md`（A 按域切 / B 按职责切 / C 不拆，含取舍矩阵与用户裁决栏）。
- **读数变化**：重构前门禁实跑 **712 通过 / 0 失败**（`tools/_gate-baseline-20261104.log`）；重构后门禁实跑 **712 通过 / 0 失败**（`tools/_gate-after-refactor-20261104.log`），与基线一致、控制台零报错。未跑 sim，胜率基线仍为 57.6% / 42.4%。
- **下一批立项依据**（用户裁定后填）：________（档 3 取舍单裁决 / `ALIBI.core` 与硬编码 `>8` 的语义核验 / 抽独立机制模块）

## [未发布 · 三层架构定稿与工程化重构启动] — 2026-11-04

- **本批改动**（仅文档层，`js/` 逻辑一行未动）：
  - 新增根 `ARCHITECTURE.md`：现行**三层**架构（T1 工程大层 = AI 拟人化 ‖ 空间与资源 ‖ 玩家决策；T2 机制与执行层 = 原 L2+L3 合并同类；T3 验收层在后方）＋层外参考层 R、预增层 P＋架构文档单独一栏。
  - 新增 `docs/00-先导-游戏体验.md`：体验层移出架构图，作图外先导。
  - 新建 `docs/_planned/`（预增层 P，入库）并落第一份 `01-工程化重构施工单.md`；`docs/_reference/`（参考层 R）已在 `.gitignore` 排除。
  - `README.md` / `AGENTS.md` / `CHANGELOG.md` 加架构节点头，口径按 F（事实）/ N（规范）分标；三份文档原文与历史条目保留不改。
- **读数变化**：本批**未跑 sim、未跑门禁**，不含任何平衡数值改动；现行基线仍为 F 轮 1000 局 seed 20261030 人类 57.6% / 异形 42.4%（`tools/mc-report.md`），门禁正文口径 712/0。
- **下一批立项依据**：已由用户 18:53 裁定 ——「都不入库 / 游戏体验转正 / 先做前两档 / 第三档留出具体取舍单」，实施记录见上一条批次。

## [未发布 · 载荷与发布链路整备] — 2026-11-04

> 用户点名：查清"推送为什么总失败"、把 GitHub 推送修稳、贴图不再上传仓库。
> **一行 `js/` 代码没改**，平衡表/判定/门禁全部沿用；本轮全是发布链路与仓库载荷。
> 门禁改前改后各实跑一次，均 **712 通过 / 0 失败**；部署暂存 **276 文件 / 44.2 MB**（与改前逐项一致）。

- **推送失败定因**：GitHub 直连可达性随 DNS 当次返回的 IP 抖动（同一分钟内 GET 通、POST 撞 21s 超时，
  几分钟后两条都 1.4s 通）；旧 `ship.cjs` 把 Gitee 失败也 `exit(1)`，于是出现"GitHub 明明上去了却报推送失败"。
- **双通道兜底**：`pushRemote()` 按域名分流（GitHub 走 `127.0.0.1:7897`、Gitee 直连，代理地址读 git 配置不写死），
  互为兜底，且兜底通道**先用 `push --dry-run` 探测**（走 receive-pack 的 POST，与真实写同类），不通就跳过；
  Gitee 失败降级为警告。单元验证：代理死 → 直连 1.3–1.4s 推成功；Gitee 直连死 → 走代理 0.8s 推成功；
  404 与 non-fast-forward 不再浪费换通道。
- **载荷瘦身**：`assets/scene/v4/tex/*`（43 MB，`js/` 零引用、deploy 本就 SKIP）与 `3d/preview/assets/textures/*`
  （31 MB，与前者 sha1 逐字节相同）出仓；`tools/mc-results*.json` 改为提交 `.json.gz`（实测 2.61→0.16 MB，省 94%；
  PNG 再压缩实测省 0%，所以贴图只能出仓）。**磁盘上一个文件都没删。**
  单次推送载荷：34.14 MiB → 337 KiB → 7.15 KiB。
- **可验证性**：新增 `tools/assets-check.cjs` + `assets/MANIFEST.json`（56 项 / 73.0 MB 的 sha256 清单；
  实测能抓缺失、长度不符、哈希不符三类，正常态 exit 0；`--from-git` 给 `git worktree` 恢复法）；
  `git gc` 收掉 180 MiB 松散对象，`.git` 246 MB，`fsck` 干净。
- **依赖收回**：`playwright-core@^1.64.1` 改为本仓 devDependency。此前 `ensurePlaywright()` 会去找
  `~\.workbuddy-ai\binaries\node\workspace\` —— WorkBuddy 一清理，门禁就直接炸。不设 `PLAYWRIGHT_CORE` 实测 712/0。
- **文档同步**：`AGENTS.md` / `README.md` / 交接文档共 30 处"当前态"陈述改为权威口径（基线、门禁数、
  原始局入库形态、材质出仓、推送语义、Playwright 来源）；§六 以后的逐批胜率与旧门禁计数**保留为历史读数**，
  只加批次标注（如 10-31 批次的 `NIGHT 120→130` 明确标注"不要照此执行，方向以 §六 重判"）。**未删除任何历史记录，未新增任何平衡数值。**
- **本轮没有做**：不改 `SKSanity` 任何表；不清 git 历史（`base-lit.png` 9 版共 128 MB 仍在历史里，
  要清需 `git filter-repo` + 强推，会打乱 Gitee 镜像与已有克隆，等用户拍板）；不摘 Gitee 自动化（现已非致命 + 有兜底）。


- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 游玩体验对标调研 + 量测工具] — 2026-11-04 早

> 用户点名：联网调研同类型游戏的**开发与游玩体验**，再结合实际对本项目做深度游玩体验调研并出报告。
> **本轮一行 `js/` 代码都没改**，平衡表、判定、门禁全部沿用；新增一个量测工具与一份报告。
> 门禁读数沿用 2026-11-03 晚实跑的 **712 通过 / 0 失败**（未改逻辑/数据，不重跑）。

- **新增 `tools/ux-audit.cjs`**（只量测、不断言）：在真实浏览器里走真实 DOM 输入路径
  （`click` / `keydown`）取读数，产出 `tools/ux-report.md` + `tools/ux-results.json` + 10 张截图。
  需要先用 `tools/serve.cjs` 起同源服务器 —— `file://` 下底图算跨域，`getImageData` 直接 `SecurityError`
  （本次实跑踩过两次，已写进工具注释与 AGENTS 文件地图）。
- **关键实测读数**（1440×900，Edge headless）：
  点击地面 → 起移 **p50 9.8 ms / max 15 ms**、A* 规划 **6.9 ms**、8/8 起步、走不通有禁止符号与文案；
  E 交互反馈 **4.6 ms**；**落座 → 首次可自由行动 49.97 s**（开局公开讨论把新手锁了整整 50 秒）；
  一场白天会 **70.2 s = 讨论 49 / 投票 15 / 公布 5**，投票期发言列表已排 **24 条**；
  **会议占墙钟 58.5%**（口径 `1 − ΔplayT/Δ墙钟`；状态归类 66.7%）⇒ 单夜墙钟 180.7 s ⇒
  **整局 ≈ 17.1 分钟，其中行动只占 7.1 分钟、会议 10.0 分钟**；
  迷雾四态画面：亮舱均亮 58.4（暗面 5.5%）/ 暗舱 17.6（暗面 **91.0%**）/ 亮走廊 24.8（80.9%）/
  断电·会议室 64.1（5.4%，**断电时会议室仍整间可见**——`refreshLight()` 明写只有 `bridge` 保电，非 bug）/
  断电·走廊口 15.0（89.6%）；HUD 19 行可见元素（`dmgline` 有故障才出现）、最小字号 **11.5px**、数字位 7×16px、`#hud` 对比度 14.54:1；
  **手机横屏 844×390 的发言列表实测只有 38px 高**、10 个可见按钮里 **8 个命中区 <34px**、9 个元素超出视口；
  声纹同屏峰值 19 环（判据半径 18 格、环画在事发坐标上）；FPS p50/p10 均 163.9（无瓶颈）；
  控制台 3 条 404 逐条查过，**全部是浏览器自动请求 `/favicon.ico`**，游戏自身引用资源全 200。
- **键位口径实测**：源码 **17 个单键绑定**（`a b c d e f g h m p q r s t v w x`），`#tip` 当场只提示 **11** 个，
  未提示 `m e p q x g`（后四个是 `W/A/S/D` 的别名）；而 W/A/S/D 在本作**不是移动**——
  这条对 PC 玩家肌肉记忆的冲突，此前只是约定，没有读数。
- **上一批 T1–T8 逐条复检：全部仍未修**（源码级证据 + 现场复现）：
  T1 无 `openedAt`；T2 `.btns` 无 sticky；T3 `syncDevUi()` 只让 `#hud` 不让 `#meet`/`#end`；
  **T4 有两处**（`js/game.js:4141` 与 `:9695` 都还在说幽灵能"维修/故障"，而 `startFix()` 在
  `js/game.js:984` 明确 `if(a.ghost)` 直接拒绝）；T5 实测 vote 阶段 `#m-text.disabled===false` 且发送按钮仍亮；
  T6 全仓无「选择对象」占位；T8 全仓无 `.hit` 类。
- **新发现 N1–N8** 写进报告 §4，其中 N3：主页「玩法说明」实测只有 **148 字**、
  不覆盖键位/刀/管道/破坏/搜尸/申请单/幽灵/报告额度，且把 `45` **硬编码**在 `js/ui/home.js:180`
  （`WIN_PTS` 才是单一真源）；N8：绕路系数两轮实跑 1.00 / 1.88 ⇒ **该指标当前不可用**，需固定目标点样本。
- **联网对标**（两路：玩家侧 20+ 组、开发侧 18 组中英文检索）出报告
  `docs/调研报告_同类游玩体验对标与本项目实测_20261104.md`：
  一手来源含 Innersloth Press Kit / 3D 上线补丁 / v19 幽灵博客 / Schell×Unity 访谈 / GDC Vault /
  80.lv 访 Gaggle / Deceit 2 官方补丁 / Lethal Company 访谈 / 鹅鸭杀国服通稿；
  明确列出**材料缺口**（Wintermuth、Labbyrinth、Cyber Hangout、Flicker 无可核实反馈；
  Innersloth 从未把视野遮罩表述为公平机制）。
  三条判据值得记住：**"会议 UI 的每个字段都是证据，要么彻底给要么彻底不给"**
  （Among Us 主动削掉会议室位置、Deceit 2 反过来把公告全印进聊天）；
  **可见性可以做成卖点但必须教学**（GGD 的 Birdwatcher `see through walls`）；
  **玩家骂的从来不是局长而是死时间**（ready-up 死等、刀 CD、等讨论钟）。
- **本轮没有做**：不改 `SKSanity` 任何表（首局 50 秒、整局 17.1 分钟都记为**待用户拍板**）；
  不修 A/B 两层建议里的任何一条（等用户点头，交接文档 `docs/交接_深度游玩体验修复_20261103.md` 已在队列里）；
  不跑蒙特卡洛（没有数值改动，跑了只会扰动 F 轮基线）。

- **补记（2026-11-12 三段式/读数收口）**：历史批次补标题或读数说明，原文不改。
- **本批改动**：原文见上，历史条目未单独重述。
- **读数变化**：当批未记录实跑读数（历史条目，未跑/沿用不可考）。
- **下一批立项依据**：历史条目未记录。
## [未发布 · 投票调参 + 3D 预演立项] — 2026-11-03 晚

> 用户点名：投票等待 5 → 15 秒；投票阶段要能像「跳过讨论」一样跳过剩余时间；
> 另起一个 3D 预演子项目，验证美术/代码能否升维。门禁 **712 通过 / 0 失败**（本轮实跑）。
> 版本号仍为 **返航录V3.6**；这一节先记未发布改动。

### 一 · 投票

- `SKSanity.MEET.voteDay/voteNight`：5 → **15 秒**，仍然只在 `MEET` 表里改。
- 新增 `#m-skip-vote`「跳过投票」：**结束剩余投票时间**；已投给谁就保留那一票，
  没投才记弃权。不是强制改票，不改变 AI 票、3 票门槛或任何平衡表。
- 门禁新增 4 条：票时长同源、按钮可见、空投跳过=弃权、先投后跳保留原票；
  总数 **708 → 712**。

### 二 · 3D 预演（`3d/`）

- 新建 Godot 4.6 独立工程 `3d/preview`；便携版在 `E:\ai-tools\godot`。
- 地图 `js/data/map.js` → `3d/preview/data/map.json`，10 舱室 / 11 走廊 / 110 墙段 / 59 掩体升维。
- `CharacterBody3D`：WASD + 鼠标视角 + Shift 加速 + 手电；不再点击地面。
- 复用 2.5D 地板/墙面贴图与 `crew-01.png` billboard；实测 1 秒 4.2 米、撞墙 1.14 米停住。
- 工程文档：`3d/README.md`、`3d/ARCHITECTURE.md`、`3d/DECISIONS.md`、`3d/ASSETS.md`、`3d/CHANGELOG.md`。
- 调研报告：`docs/3D_预演_20261103.md`；截图：`3d/preview/screenshots/`。

### 三 · Qwen-Image

- 选 `city96/Qwen-Image-gguf` 的 Q3_K_S（8.95GB）+ fp8 文本编码器（9.38GB）+ VAE（0.25GB），
  落点 `E:\ai-models\qwen-image`；HF 直连 / hf-mirror 被限速后切到 **ModelScope 镜像**，
  8 路 Range 分块续传（实测约 5MB/s）。完成情况见当次汇报。
- 文件清单 / 哈希 / 运行注意见 `E:\ai-models\qwen-image\README.md`。
- **2.1 已核实**：7B 视觉组件，社区 GGUF 有 Q3_K_S 2.72GB / Q4_K_M 4.20GB / Q8 7.64GB，
  Turbo 8 步；配 Qwen3-VL-8B 编码器 + VAE 约 10.02GB，更适合 8GB 显存。
  但 2.1 是 **Qwen Research License（仅研究/评估，商用需授权）**，1.0 才是 Apache-2.0；
  因此**没有擅自替换**，等用户按用途拍板。
- 2026-11-03 晚用户确认「个人游戏、不发行、代码 MIT」⇒ 2.1 研究许可可用于内部评估。
  已下载并跑通：512 走廊 43.08s、768 写实角色 87.42s、768 风格化角色 91.34s、
  1024 走廊 501.50s，显存约 5.3GB；图在 `docs/qwen21/`，
  完整测试见 `docs/Qwen2.1_生图测试_20261103.md`。
- Godot 全盘六路核查未找到编辑器本体（只有 `godot-mcp` 插件），继续使用
  `E:\ai-tools\godot` 的 4.6 便携版；详见 `docs/3D_预演_20261103.md` §9。
- **2026-11-04 早：完整版引擎已下载** —— 用户点名「下载完整版的 godot 引擎」，
  取 **4.6 stable mono（含 .NET / `GodotSharp`）** 编辑器，落点
  `E:\ai-tools\godot\Godot_v4.6-stable_mono_win64\`；版本串 `4.6.stable.mono.official.89cea1439`，
  与标准版同一 build hash。验收口径三条：GitHub API 字节数 109,206,511 逐位相符、
  `unzip -t` 全 OK、`--version` 哈希一致（官方不给 zip 的 `.sha512` 资产）。
  同工程在 mono 编辑器复跑三条自测读数一致（4.1985 / 4.1999 / 4.2000），导入退出码 0；
  本机 .NET SDK 10.0.300 已在 PATH，C# 工程可直接编译。
  标准版保留作对照，两份都能开 `3d/preview`。导出模板（mono 1117.0 MB）**未下载**，等真要出包再说。
  详见 `docs/3D_预演_20261103.md` §9A。

> 注：`tools/mc-report.md` 的配置快照仍是上一轮 `5 / 5`。投票等待不参与 sim 判定
> （模拟里 `startVote()` 后立即 `closeVote()`），下次 `npm run sim` 会刷新为 `15 / 15`；
> 本轮没有重跑 1000 局，避免扰动 F 轮基线。

## [返航录V3.6 · 拟人批次一：伪装线解锁 + 语料工程 + 信息平权] — 2026-11-03

> 用户划的硬线：**只有点名的数值能动**（异形暗处视野 3.5 / 人类 2.8 / 白天与开局讨论 50 /
> 投票等待 5 / 公布 5 / 终结者第 10 夜 / 击杀加速 +50%），其余调研报告建议的平衡数值一律不动。
> 门禁 **708 通过 / 0 失败**（本轮实跑，Edge headless，`file://`）·
> 语料体检 **1400 通过 / 0 失败**（`node tools/lines-audit.cjs --strict` 退出码 0）。

### 一 · 伪装线：死因是**自锁门闸**，不是收益算低

旧条件 `(a.knife<=0 || close>8)` 与观众数 `aud` 数的是同一批人，而 `aud` 额外要求 `aiCanSee`
⇒ **`close>8` 时观众必然为 0**，括号左半边永远飞不通。伪装只剩"刀用完 + 8 格内有人"一条缝，
实测 1.06 次/只/整局、触发率 18%。修法（`known` / 目击半径 / 报告额度一律未改）：

- 伪装进 `alienPlan` **效用表**与追人比分，不再挂在独立 `if` 分支上；
- 观众改成**方向性权重**：为谁演（信得过我的人、手里有票的人），不是"谁在场"；
- 风险语义从"今晚多少人看见我"换成"**这一下会不会被识破**"（`SKSanity.disguiseRisk`）；
- 每夜 1 次的硬上限改**冷却制**（一晚可多次演，`DISGUISE.cooldown`）；
- 贴脸有刀时优先出刀（`killWindow`），**拖着尸体不许演**（`a.drag==null`，藏尸是唯一任务）。

### 二 · 信息平权：取消异形全图锁敌（用户点名）

旧代码直接遍历 `G.agents` 取**实时坐标**打分 ⇒ 异形 AI 知道全船谁在哪，而玩家异形只有一只手电。
现在两边同一套信息，只有三档：看得见用实时位置；看不见只认本夜 `saw_agent` 的**最后目击位置**
（`HUNT.memorySec=25` 秒后当作跟丢）；完全没印象的人**不进候选**。
这是明确的**平衡位移**（异形找人变难），已用 1000 局量过，不靠"更拟人"这种话交差。
"不知道往哪走"补了 `huntSpotFor()`（最后目击点 → 最常撞见的舱室 → 任务最热的舱室中心）。

### 三 · 视野与迷雾（用户点名）

- `SIGHT` 表成为唯一真源：异形近身 **3.5 格**、人类 **2.8 格**、手电 7 格、AI 视距上限 8 格。
  旧的 `ALIEN_INNATE_MUL = 10/9` 乘法口径**废除**（改一次要反推乘法）。
- `SIGHT.fog = {roomMask:.87, corridorMask:.50}`：**非舱室区域压淡**（用户原话"除了船的房间的
  其他地方要能看见，前提是没有拉闸"）。这是**纯表现层**：单位/尸体在画进迷雾前就被
  `canSee`/`visibleAt` 裁掉，断电时整步跳过。门禁有专门的"背景压淡≠看得见人"防泄漏断言。

### 四 · 会议节奏与报告稀缺（用户点名 50 / 5 / 5）

`MEET` 表新增三段时长：白天与**开局**讨论 50（用户明确"60 砍到 50 涵盖开局"）、夜会 25（原值）、
投票等待 10 → 5、结果公布 → 5。**只在表里改**，`openMeeting` 不再写数字；门禁读运行时值断言。
报告一次性从"按夜"改成**绑定那一次倒下**：濒死者 `downSeq++`、报告写 `reportSeq`，
`bodyReported()` 比 `reportSeq===downSeq` ⇒ 同一夜他被打倒两次算两次发现（可以重报），
躺着的人被反复报才是漏洞。

### 五 · 终结者时刻（用户点名第 10 夜）

`TERMINATOR = {night:10, bullets:1, reveal:true}`：第 10 夜开场**全场身份公开 + 每人补子弹到 1**
（只补到 1，不叠加）。动因是实测残局（1 异形 vs 2 人类）能拖到十几夜不收，双方都缺"最后一击"。

### 六 · 信任聚焦：从"有额度、没焦点"到有出口

实测证伪了旧假设：cred 过阈值每局约 1 次，但**没有任何行为与台词兑现**（真实对局 139 条发言里
背书 0 条）。现在读取端统一走 `topCred(a,min)`，三个出口：
**当众背书**（`pushEndorse` → `SKLines.endorse`，门槛复用 `CRED.accuseShieldAt`，不新造数值，
一场会议最多一次）、**空闲时往他那边靠**（`credFollow`）、**领袖接牌率**（`obeyTrustMul`）。

### 七 · LENS：一张表两本账合一 + 异形的贵信号

`SKSanity.LENS` 是**似然比表**（人类意愿 vs 异形意愿），只回答"这件事有多像人"，
**不持有分数** —— 信任增量仍只在 `CRED.gains`、嫌疑增量仍只在 `EV_W`（避免第二个真源）。
异形的贵信号 `realFix`（真修故障）/`realRevive`（真救非队友）**走与玩家、AI 人类完全同一条入口**，
修好真的扣进度、救活真的扣医疗包。同时把一条量化事实写成门禁断言：
**自发情况下假装修仍压过真修**（真修要吃 `realCost` + 10 秒）—— 贵信号目前稀有，不是 bug，等决策。

### 八 · 领袖：重尾号召力 + 有人接牌（小变量，不做传承）

按用户裁定："号召力有偶然性，可能一个人都不听，也可能所有人都听"、"没有传承"、"小变量不作主设计"。
`LEADER.bands = [[0,.15],[.25,.50],[.65,.30],[1,.05]]` 两端都不截断；
服从概率 = 号召力 ×「我有多信他」；被点名者**可以当众拒绝**（`leader_refuse` 池）。
顺带修了一处**读数口径**：本来就要去那间舱的人以前被记成 `orderBroke`（抗命），
服从率因此被系统性低估 —— 行为不变，只是不再把"没动"算成"拒绝"。

### 九 · 语料工程：336 → 1152 行，内联池清零

验收口径由用户定为「玩家连续玩 10 局都不会觉得所有话我都看过了」—— 这是**分布问题**，数行数看不出来。

| 项 | 迁移前 | 本批后 |
|---|---|---|
| 纯语料行数 | 336 | **1152** |
| 类别数 | 11 | **58** |
| `game.js` 内联池（`pickLine(x,[…])`） | 23 处 | **0 处**（门禁按源码扫描钉住） |
| 组合式模板（多槽竖线变体行） | 0 | **20 条**（pickLine 三成概率走它） |
| 证据短语 `SKLines.WHY` | 无（`evClause` 每个 kind 只 1 句） | **18 组 74 条**同义说法 |

三层同时上：模板级降权（`G.lineUsed` + `1/(1+3n)`）、连说让位（`sayStreakOK` ≤2）、
把每局必说的句子（开场 / 报案 / 自述 / 跟票 / 确证指控 / 玩家发言回应）从 2~4 条扩到每类 ≥5~11 条。
体检工具 `tools/lines-audit.cjs`（零依赖，**复现 `pickLine` 的真实抽样口径**）实测见本文件末尾。

顺带修掉三处真 bug：① `{上次}` 这类**单值花括号**（`fillTpl` 不认识，玩家会看到裸 `{上次}`）；
② 语料里出现「狼/铁狼」—— 本作阵营是人类/异形，不是狼人杀；
③ `defend/retract` 的必备槽规则误杀"替自己辩解"的句子（体检规则本身修好，不改语料）。

### 十 · 互斥证词 + 两处逻辑 bug（都不是平衡）

- **互斥证词**：A 咬 B「亲眼看见」同时 B 咬 A —— 两条硬证词不可能同时为真。
  现在互咬双方**不吃共证加成**（`TESTIFY.corrobMul` 归 1）、系统当众点破一次、遥测 `mutualFrames`。
  **没有**加报告建议的"+0.15 嫌疑"（那是新增平衡数值，未获授权）。
- **伪证的舱室渲染成「未知位置」**：`accuseWhy.room` 有两种写法（真目击存 id、异形伪证存中文名），
  `evRoomName()` 只认 id ⇒ 诬陷念成"我亲眼看见他在未知位置出刀"，
  而这条机制的立身之本正是"措辞和真目击一字不差"。现在 id / 中文名都认。
- **信任广播落点错**：修好故障时按**故障点**坐标广播，而故障点常贴在机器背后 ——
  旁边的人看得见人却"看不见那个点"，白拿不到信誉。改为按**操作者**坐标（与 `taskDone`/伪装同口径）。

### 十一 · 数值外提（**一个数都没改**）与两处待决策的不一致

`NIGHT.len / WIN.pts / WIN.faultPenalty / STAND.* / REACH.* / SHOT.*` 从 `game.js` 顶部
（`const NIGHT=75`、`WIN_PTS=45`、`a.doing=5`、`shootR=sure?10:8` 等）搬进 `SKSanity`。
动机不是整洁：蒙特卡洛报告现在能 eval 这个纯模块，把「这批局用的是哪套数」打进**配置快照**。

搬家时发现两处**既有不一致**，按原值搬、只记录，等用户决策：
1. **AI 人类合闸 3 秒 vs 玩家/异形演出 `breakerOnTime()`（断电当夜 4.5 秒）**
   ⇒ 断电那夜 AI 比玩家快 1.5 秒复电。
2. **`REACH.knifePlayer = 1.35` vs `REACH.knifeAI = 1.4`**（瞄准方式不同，不算特权），
   但提示文案以前写死"1.3 格内"，现在跟着常量渲染。

### 十二 · 复盘页与结算页

- 复盘页 `chat` 从「会议/投票」筛选项里**分家**成独立一档「聊天/发言」（台词量远大于会议事件，
  混在一起时间轴被刷屏）；同时修掉 `NIGHT_LEN=120` 的过期硬编码（改读 `SKSanity.NIGHT.len`，
  此前一直按 120 秒换算 75 秒的夜）。
- 结算页新增**身份表**（15 席逐个亮阵营）与**投票矩阵**（每场会议每人投了谁 / 弃权）。

### 十三 · 实测（D 轮 · 1000 局 · seed 20261030 · 与 A/B/C 轮同批对照）

**结果：人类 585 胜（58.5%）/ 异形 415 胜（41.5%）/ 超时 0**（95% Wilson 55.42~61.52）。
上一批（C 轮 · 加击杀加速）是 58.0% / 41.9% —— **本批几乎持平（+0.5pp，在噪声内）**，
符合预期：这一批动的是台词、UI、遥测、搬家与两处逻辑 bug，**没有动任何平衡数值**。

| 量 | 均值 | 中位数 | 量 | 均值 | 中位数 |
|---|---:|---:|---|---:|---:|
| 夜数 | 5.687 | 5 | 维修进度 | 34.434 | 37 |
| 会议 | 11.454 | 11 | 出刀 | 10.272 | 10 |
| 开枪 | 2.051 | 2 | 破坏 | 10.793 | 11 |
| 驱逐 | 3.317 | 3 | 误逐（人类被逐） | 1.584 | 1 |

**结束原因 × 胜者**：人类胜里 **维修 45 分 320（54.7%）/ 异形全灭 265（45.3%）**；
异形胜 415 局全部是"人类全灭"。误逐占比 **47.75%**（被驱逐的人里将近一半是人类）——
社交推理的"冤枉"仍然真实存在，没有被这批改动抹掉。

**刀数断崖仍然成立，但拐点右移了半格**（这是调平衡最该盯的一条）：

| 刀数 | 局数 | 人类胜率 | 刀数 | 局数 | 人类胜率 |
|---|---:|---:|---|---:|---:|
| ≤8 | 343 | **97.67%** | 13~14 | 135 | 13.33% |
| 9~10 | 201 | 74.63% | ≥15 | 133 | 6.77% |
| 11~12 | 188 | 38.83% | | | |

对比 C 轮（平均 10.787 刀）本批平均 **10.272 刀**，进度/夜 **6.055**、刀/夜 **1.806**、
清场压力（刀数÷11）**0.934**、进度达成（÷45）**0.765**。
**人类存活 ≥3 的局 100% 是人类赢**，人类存活 ≤2 只剩 5.47% ⇒ 残局完全看"还剩几个人"。

**机制触达率（新报告口径：多少比例的对局真的发生过）**

| 机制 | 触达率 | 每局均值 | 判读 |
|---|---:|---:|---|
| 异形假装做任务 fakeTasks | **99.9%** | 8.062 | 伪装线解锁后已常态化（旧值 1.06 次/只） |
| 假装修理 fakeRepairs | 49% | 0.693 | ⚠ 与 fakeTasks 的**配比**摆动大，见下方"同 seed 不等于同路径" |
| 异形钻管道 alienPipes | 99.9% | 9.928 | 机动正常 |
| 击杀加速 rushKills | 100% | 11.821 | 每局都在触发（放倒即加速） |
| 准-确证 foe（almostCount） | 95% | 4.605 | 推理链在跑 |
| 在场反驳 presenceDeny | 79.9% | 3.812 | 亮房反驳兑现 |
| 异形真做任务 alienTasks | 57.2% | 0.78 | 少数策略，符合设计 |
| 破坏命中 sabHits（-5 真生效） | 63.2% | 1.847 | 破坏的实伤频率 |
| **确证挡投票 credShieldVotes** | 34.9% | 0.493 | cred 的兑现口之一 |
| 准-确证 friend almostFriend | 22.5% | 0.328 | ⚠ **伪装的兑现口还是太窄** |
| 真救非队友 realRevives | 11.8% | 0.132 | 贵信号仍稀有 |
| **终结者时刻 terminatorGames** | **5.3%** | 0.053 | ⚠ **第 10 夜几乎到不了**（平均 5.69 夜） |
| 信任跟随 credFollow | 3.6% | 0.119 | 出口已通，但触发少 |
| **friendShield（伪装挡票）** | **0.5%** | 0.007 | ⚠ 装够了也基本挡不住票 |
| 拘留目击 detainWitness | 3.2% | 0.047 | 保安存在感仍低 |
| **mutualFrames（互斥证词）** | — | **2.021** | 每局约 2 对互咬 —— 这条机制确实有量 |

**三条要给用户决策的读数（我只报数，不动手）**

1. **终结者时刻形同虚设**：设到第 10 夜，但平均只打到 5.69 夜、P90=9 夜，
   **只有 5.3% 的对局进得来**。要么降到第 8 夜（预计触达 ~15%）、要么承认残局是靠"清场/被清场"结束的。
2. **伪装能演、但不能洗白**：演出触发已经常态化（99.9% 局、8 次/局），
   可 `almost.friend` 只有 0.328 次/局、`friendShield` 0.007 次/局 ——
   瓶颈在 `ALMOST.friendKinds=2` 与 `friendCred=0.40`（要同一观察者看见**两种不同**正经事各 3~4 次），
   不在演出频率。**这一步已经不用再靠"多演"来解决了。**
3. **⚠ 方法论：同 seed 不等于同随机路径**。批次模拟用 `simRng(seed)` 播种 `Math.random`，
   所以**任何新增一次随机调用都会把后面整条随机流挪位**（本批的交替槽展开、去重重挑都是随机调用）。
   后果：胜率与总量（夜/进度/刀/会议）可以跨批比较；
   **单机制次数**（如 fakeRepairs 从 2.986 → 0.693）在同一 seed 下也会因路径漂移大幅摆动，
   **不要拿这种格子做归因**，要归因得换 seed 各跑一批看摆动幅度。

**工具口径盲区（读数为 0 ≠ 机制没接）**：`orders / orderObey / orderRefuse / endorses` 恒为 0 ——
`startChatter` 在 simMode 下**台词排期段直接 return**，而这几格计数长在排期段里。
领袖指令与当众背书在真人局照常发生，行为由门禁的「领袖 · 指令真的有人接牌」「语料工程」两组用例覆盖。
反例是 `realFixes / fakeBreaker`：它们不依赖排期，恒为 0 是**效用表自己选的**
（假装修不吃 `realCost`、也不站满 10 秒）—— 这条与门禁的量化事实断言一致，属待决策。

### 十四 · 语料验收（用户口径：连玩 10 局不觉得"这些话我全看过"）

`node tools/lines-audit.cjs`（零依赖，**复现 game.js 的真实抽样口径**：性格三档选 hot/cold +
本局模板降权 `1/(1+3n)` + 交替槽展开 + 同人连说 ≤2 让位）模拟 10 局 × 12 场会议逐条抽样：

- **局内唯一句占比 99.8% / 局内重复率 0.2%**
- **10 局累计"已经看过"的句子占比 4.3%**（整句与句式同值；30 局压力跑到 11.9%）
- 连说让位吞掉 59 条；体检 **1400 通过 / 0 失败**（`--strict` 退出码 0）
- 规模：58 类 / 1152 行纯语料（hot 577 / cold 575）+ 20 条组合式模板 + 18 组 74 条证据短语，
  唯一骨架 1257，变体展开当量 1257（乘槽位取值上界 ≈ 35.6 万）

### 十五 · 指令之外的新增物清单（用户规则：加了就必须标明）

**新增文件（2 个）**

| 文件 | 是什么 | 为什么必须新增 |
|---|---|---|
| `tools/lines-audit.cjs` | 会议语料体检工具（零依赖，不开浏览器） | 验收口径"连玩 10 局不腻"是**分布问题**，数行数看不出来；必须复现 `pickLine` 的真实抽样口径才能量到。 `--strict` 有 FAIL 就退出码 1，可挂进发布流程。 |
| `tools/lines-report.md` | 上面那个工具生成的体检报告 | 工具产出，勿手改；与 `mc-report.md` 同级。 |

**新增参数（全部标注：是否影响平衡）**

| 参数 | 值 | 影响 |
|---|---:|---|
| `SKSanity.LEADER.refuseSpeakP` | 0.5 | **只影响台词**（预估不会接牌的人当众说一句"我去不了"）；服从判定仍只由 号召力 × 信任 决定。设 0 就回到"拒绝了但没人听见"。 |
| `SKSanity.MEET.endPad / minPlan` | 2.2 / 5.2 | 从 `game.js` 里**原有硬编码搬出**，不是新数值；供发言排期收尾与"排满没排满"的门禁判据。 |
| `SKSanity.HUNT.memorySec` | 25 | 把原先硬写在"现场目击者优先"那段里的 25 秒提出来，现在挑目标与目击者优先**共用同一个口径**（值不变）。 |
| `SKSanity.SIGHT.fog` | .87 / .50 | **纯表现层**（迷雾遮蔽强度），判定不读它；断电时整步跳过。 |
| `SKSanity.CRED.gains.fakeRepair` | 0.10 | 与 `fakeWork` **同值拆成两种 kind** —— `ALMOST.friendKinds=2` 要求观察者看到"两种不同的正经事"，旧版两种假动作写同一个 kind，异形永远凑不满 ⇒ 结构性不可达。**没有加任何分**。 |
| `WIN.faultPenalty / NIGHT.len / STAND.* / REACH.* / SHOT.*` | 照旧 | 纯搬家（`game.js` → `sanity.js`），**数值一个没改**。 |
| 遥测键 `mutualFrames` / `lineDups` / `streakCuts` / `credFollow` / `endorses` / `realFixes` / `abstains` 等 | — | 只读计数，不参与任何判定。 |
| `_t.lineSmoke()` 与 `meetCtx().challenge` | — | 调试 API **新增**（未删改任何既有方法语义）：前者逐条渲染语料抓"花括号漏出/空句/未知位置"，后者让门禁能**结构化**断言对质链路。 |

**待用户决策的既有不一致（本批只记录，没动）**

1. AI 人类合闸站桩 **3 秒**（`STAND.aiBreakerHuman`）vs 玩家/异形演出走 `breakerOnTime()`
   （断电当夜 **4.5 秒**）⇒ 断电那夜 AI 比玩家快 1.5 秒复电。
2. `REACH.knifePlayer = 1.35` vs `REACH.knifeAI = 1.4`（瞄准方式不同，不算特权，但两个数并存）。
3. 报告建议但不敢动的平衡项：`-5→-3`、破坏改"每夜全队 1 次"、开局讨论 60→30、
   互斥证词给双方各 +0.15 嫌疑、HUD 隐藏剩余异形数 —— 全部保持原状。

### 十六 · AI 与玩家数值一致化（用户追加裁定「应该完全一致」）+ E 轮实测

同一能力只准有一个数。取值方向：**不给 AI 新增权力，也不留玩家白拿的特权**。

| 项目 | 以前（两个数） | 现在（一个数） | 谁被削 |
|---|---|---|---|
| 出刀近身距离 | 玩家 1.35 / AI 1.4 | `REACH.knife = 1.35` | AI 异形（−0.05 格） |
| 开枪射程 | 玩家 ≤9 / AI 人类 确证 10、嫌疑 8 | `SHOT.range = 9` 两边同 | AI（确证时 −1 格；嫌疑时 +1 格） |
| 合闸站桩 | 玩家 4.5 秒（断电当夜）/ AI 人类 3 秒 | 同走 `breakerOnTime()` | AI 人类（断电夜慢 1.5 秒复电） |
| 钻管道冷却 | 玩家 **0 秒**（可连着钻）/ AI 20 秒 | `PIPE.cooldown = 20` 两边同 | 玩家异形 |

**顺带修掉一个自己引入的双减 bug**：管道冷却原先 AI 循环里减一次、`tickActs` 又减一次
⇒ 一帧双倍速；而"在 AI 循环里顺手也减一下玩家"更糟（场上 4 只异形 = 玩家冷却 4 倍速）。
现在**只有一个递减入口**（`tickActs`，每帧一次、全员），门禁按源码扫描钉住。

**仍然并存的两个数（不是不对称）**：`SHOT.chaseKnown 14 / chaseSus 10` 是 AI
「愿意为开枪走多远」的**决策**参数，玩家没有这个概念（人自己会走）；能力数值仍然同源。

**唯一剩下的结构性差异需要决策**：视野模型。玩家在**亮舱整间可见**（仓库能看 ~25 格），
而 AI 的 `aiCanSee` 有 `SIGHT.aiCapR = 8` 的上限（异形 AI 在亮房里其实比玩家异形看得近）。
这不是"两个数写错了"，是两套瞄准模型（玩家是鼠标指向的 7 格手电锥 + 亮房整间，AI 没有指向）。
要么给 AI 亮房整间视野（**等于把亮房里的全图锁敌放回来**，仓库/会议室对角 44.9 格），
要么砍掉玩家"亮房整间可见"（这是玩家体验的地基，AGENTS 有专条）。所以我没动，等裁定。
**（同日用户裁定：选前者——AI 同样享受亮区整片可见，见 §十七；F 轮已量过代价。）**

**E 轮实测（1000 局 · seed 20261030 · 一致化之后）**：
人类 **60.2% / 异形 39.8% / 超时 0**（D 轮 58.5/41.5 ⇒ **朝人类 +1.7pp**，
Wilson 半宽约 ±3pp，方向与改动一致但幅度在噪声边缘，不必当作已定的位移）。
均值：夜 5.632、进度 34.64、刀 10.248、会议 11.379、破坏 10.722（与 D 轮几乎相同）。
**驱逐准确率 51.94%**（D 轮 52.25%）—— 一致化没有改变"冤枉得多不多"，
按胜者分：**人类赢的局 63.0% 准、异形赢的局 35.5% 准**，误判仍是异形赢的那批人在乱投。

门禁从 698 条增到 **703 条（703 通过 / 0 失败）**，新增的是「AI 与玩家 · 数值一致」一节：
表里不许再有 knifePlayer/knifeAI/known/sus/alienRange/aiBreakerHuman 这类分叉键，
合闸必须写 `breakerOnTime()`，冷却递减入口只许一处。

### 十七 · 亮区整片可见对 AI 同样成立（用户裁定放开）+ F 轮实测

用户原话：**「是啊。确实应该放开呀，异形本来就能看到亮房里面的所有人。人类AI也是一样的。」**
这正是 §十六 末尾留着等裁定的那一项（当时我给的两个选项是"给 AI 亮房整间视野"与"砍掉玩家的亮房整间可见"）。

- 改动只有一处判定：`aiCanSee` 现在**先**走与玩家 `visibleAt` 完全相同的亮区规则 ——
  同亮舱整间 / 同亮走廊整条 / 从亮舱看进相连走廊（要 `losNow`），命中即返回，**不看 `aiCapR`**。
  暗舱、以及站在舱外看进亮舱仍然受 `aiCapR = 8` 约束（**不给 AI 超出玩家的视力**）。
- 配套的第三处一致化：`watchersAt` 的统计半径改成 `max(调用方 rad, sightRangeAt(x,y))` ——
  否则"亮房整间都算观众"只对伪装收益生效，刀口仍然按固定 6 格数人头。
- **门禁自己证明了这条规则真的生效**：改完 4 条旧夹具被击穿并已重写 ——
  ① 会议忙碌夹具站在会议室另一头，现在同舱即可见；② 视野对照夹具的"远处看不见"改到暗舱；
  ③ 保安拘留夹具里"只听得见警报"的人原来站在军械库里，现在改成运行时扫描
  **离行凶点与拘留位都 >11 格、又都在警报半径内**的站位（余量 2.3 格，写进断言消息）；
  ④ 藏尸夹具把 13 个旁观者停在**亮会议室**，而亮舱看得见相连直走廊的任意远点
  ⇒ 拖尸路线一进走廊就"当着 13 个人拖尸"、异形按规则松手。旧夹具复现 **2/12 次**，
  改停**暗引擎室**（3.5 格近身视野、且 `hideRoomFor` 不会把它当藏尸点）后 **0/20**。
  新增断言覆盖三个方向：亮舱 42 格可见 / 暗舱同距离不可见 / 舱外 56 格看不进亮舱，外加亮走廊断电后失效。

**F 轮实测（1000 局 · seed 20261030 · 放在**E 轮之后**）**：

| 读数 | E 轮（放眼前） | F 轮（放开后） | 解读 |
|---|---|---|---|
| 人类胜率 | **60.2%**（57.13~63.19） | **57.6%**（54.51~60.63） | −2.6pp，约 1.2σ，噪声边缘 |
| 驱逐准确率 | 51.94% | **52.07%** | 几乎不动（人类赢局 64.3% / 异形赢局 34.8%） |
| `knownWrites` | 7.523 | **7.010** | **远处的观众只加嫌疑、不写确证**（`CONFIRM.nearR=4.5`） |
| `exiles`（人类/异形） | 3.277（1.575/1.702） | **3.119**（1.495/1.624） | 驱逐一齐变少 |
| `fakeTasks` | 8.185 | **9.280** | 观众变多 ⇒ 演出的账面收益变高 |
| `avoidCount` | 42.3 | **47.4** | 异形更早绕开有人的地方 |
| 夜 / 刀 / 会议 / 破坏 | 5.632 / 10.248 / 11.379 / 10.722 | **5.682 / 10.040 / 11.350 / 10.101** | 骨架几乎不变 |
| 结束时人类存活 | 3.90 / 11 | **3.63 / 11** | 人类略吃亏 |
| 终结者时刻触及 | 5.3% | **4.5%** | 局没有变长 |

**结论**：这不是"纯拟人化、对平衡无影响"。异形在亮房里看得见所有人之后，
① 目击者变多 ⇒ 出刀更保守、绕人更多（`avoidCount` +12%）；
② 但**目击距离大多 >4.5 格**，只涨嫌疑不写 `known`，所以人类的"硬证据"反而少了；
③ 伪装演出的观众池变大 ⇒ 假装修/假做任务更划算。三条合起来的净值是**略偏异形**。
**按用户规则没有动任何平衡数**；要补偿的话，按既有口径动 `NIGHT`（75，+15 秒约 +4~5pp 人类）
或 `WIN_PTS`（45），**不要回退亮区规则**。

门禁 **708 通过 / 0 失败**（本轮实跑，Edge headless）；语料 1400 通过 / 0 失败；`map-check` gaps/dead 全空。
新增对照基线文件（用户规则：加了必须标明）：`tools/mc-results-E.json` / `tools/mc-report-E.md`
（放眼前的 E 轮原始局与报告，供跨批对比）。

## [返航录V3.5 · 击杀加速（异形放倒人后的逃逸窗口）] — 2026-11-03

> 用户三条裁定：**绑"放倒"不绑致死** / **只给异形** / **拖尸期间不加速**；
> 并明确更正一处耦合设想：**加速不与红身绑定**，两者时长都取 3 秒纯属巧合。
> 门禁 **653 通过 / 0 失败**（本轮实跑，Edge headless，`file://`）。

### 机制

- 新增 `SKSanity.RUSH = { dur: 3.0, mul: 1.5, alienOnly: true }`，状态字段是独立的 `a.rushT`。
- 唯一授予入口 `killRushStart(a)`，只由**致人濒死**的两条结算调用：
  `knife()`（game.js 出刀打倒）与 `fireShot()`（开枪打倒）。
  **绑放倒而不绑致死**：本作里刀枪都只把人打成 `downed`，真死常在天亮失血 / 驱逐，
  绑致死等于这个机制永远不触发。DEV 免伤分支在赋值之前就 return，所以"这一刀没生效"也不给加速。
- `moveSpeed(a)` 的次序固定为 **拖尸 > 加速 > 基础**：
  `drag!=null → 2.7`，否则 `rushT>0 → 4.2×1.5=6.3`，否则 `4.2`。
  拖着尸体还提速 50% 会直接毁掉藏尸的紧张感，也违背"AI 不许拖着尸体满速跑"那条教训。
- **只给异形**：人类有医疗无人机与同伴救援，不需要逃逸加速；给了还会把"误伤同伴"变成 buff。
- 幽灵 6.5 与保安追捕 7.5 是显式例外（它们把速度写死在调用处，不走 `moveSpeed`），
  且异形幽灵不能出刀 ⇒ 拿不到加速。

### 为什么必须与红身解耦（不是洁癖）

`redT` 今天已经背着两件事：`trackNight` 看见 `redT>0` 会写 `known`/`mates`（身份级确证），
`disguiseRiskParts` 用它算"这一下会不会被识破"（`risk.redHot`）。
如果位移再挂到 `redT` 上，同一个字段就同时决定**"别人看不看得见我 / 我演不演得成 / 我跑得快不快"**——
以后只想把红身拉长 1 秒给目击者多点反应时间，就会顺手 buff 凶手的逃逸速度。
所以红身管"看得见"，`rushT` 管"跑得快"，各自递减、各自调参。

### 顺手改掉两处过期表述（它们已经误导过后续修改）

- AGENTS 与 README 都写着"红身是**纯表现层**，不得参与任何判定"，而代码里它**本来就参与确证判定**
  （README 自己在"出刀"一行又写"3 秒红身（= 确证）"——**同一份文档自相矛盾**）。
  现改述为：红身是**目击证据与表现**，不参与位移。
- README 的"移速"条目补上 `moveSpeed` 的优先级次序（拖尸 > 击杀加速 > 基础）。

### 遥测与门禁

- 新键 `rushKills`（异形每局吃到几次加速），已进 `monte-carlo.cjs` 统计键表与报告。
- 新增 9 条断言，其中**双向解耦**是这批的核心防回归锁：
  ① 红身还在（3s）而 `rushT` 清零 ⇒ 速度必须回到 4.2（位移不读 redT）；
  ② 把 `rushT` 设成 6s，等红身自己归零 ⇒ 速度仍是 6.3（两个计时器各自走完）。
  另外覆盖：放倒即加速、拖尸期间 2.7、松手后恢复 6.3、人类放倒异形拿不到加速、
  加速结束回到 4.2、全流程不变量零失败。

### 实测（C 轮 · 1000 局 · seed 20261030 · 与 B 轮同批对照）

| 指标 | B 轮（加速前） | **C 轮（加速后）** | 变化 |
|---|---:|---:|---:|
| 人类 / 异形 / 超时 | 58.1 / 41.5 / 0.4% | **58.0 / 41.9 / 0.1%** | 异形 +0.4pp（噪声内） |
| 结束原因「异形全部出局」 | 321 局 | **290 局** | **−31 局**；占人类胜 56.8% → **50.0%** |
| 结束原因「人类全灭」 | 244 局(维修另有) | 419 局（维修 290 / 清剿 290 之外） | — |
| knives | 10.956 | 10.787 | −0.17 |
| rushKills（新键） | — | **12.351** | 每只异形每局约 3.1 次加速 |
| exiles（人 / 异） | 3.349（1.613 / 1.736） | 3.384（1.532 / **1.852**） | 驱逐准确率 51.8% → **54.7%** |
| knownWrites | 7.073 | 7.290 | +0.22 |
| farSight（远距目击） | 3.121（B 轮未列） | 2.745 | — |
| nights / prog | 5.778 / 33.642 | 5.724 / 33.228 | 略降 |
| 终局存活（人 / 异） | 3.800 / 1.129 | 3.885 / **1.046** | 异形更少活着到最后 |

**读法**：胜率基本没动（+0.4pp 在噪声内），但**残局形态变了**——
"异形被清剿到全灭"从 321 局降到 290 局（占人类胜局的 56.8% → 50.0%），
这正是用户点名的"清剿线太顺"的那条线；同时人类误逐从 1.613 降到 1.532（驱逐准确率反而升到 54.7%），
终局异形存活从 1.129 降到 1.046（异形更容易在后期被逐个点名掉，但全灭变难）。
**这些只是读数，本轮没有为"更好看"去调任何数值** —— 加速的 `dur/mul` 仍是你给的 3 秒 / ×1.5。

## [返航录V3.5 · 伪装线重做（拆自锁门闸 → 洗白第一次真的可达）] — 2026-11-03

> 用户诊断成立：异形**清剿线太顺**（321/1000 局以"异形全灭"结束，占人类 565 胜的 56.8%）的根子
> 在伪装这条线**几乎无法触发**。三层原因逐层拆开，全部只动量化表、不动硬约束（`known` / 目击半径 /
> 报告额度一律未改）。门禁 **643 通过 / 0 失败**（本轮实跑）。

### 一 · 自锁门闸（真正的死因）

- 旧前置 `if(!a._supportGoal && (a.knife<=0 || close>8) && !(a._fakeCD>0))`：`close` 与
  `alienAudienceCount(a, 8)` 数的是**同一批人**（都排除 isMate / 倒地 / 拘留），
  `close>8` 时观众恒为 0 ⇒ 括号那半边是**死代码**，伪装只剩"刀用完 + 8 格内有人"一条缝。
  实测 `fakeTasks 4.229 + fakeRepairs 1.025 = 5.25 次/局` ÷ 23.2 只·夜 = **触发率 18.2%**，
  一只异形整局演 1.3 次。
- **删掉整个 if 硬排**（含 8 格观众数、`Math.random()<dt*0.8` 掷骰、`min(0.55,seenN×0.12)` 旧风险），
  伪装进 `alienPlan` 效用表与 chase/breaker/sabotage 同台比分：
  `scDis = DISGUISE.planValue(6) × disguiseScore − 走到演出点的秒数`。

### 二 · 风险与收益不再互相打架

- `risk` 从"这夜被多少人看见过"（与收益项同量纲、正面对冲）改为**"这一下会不会被识破"**：
  `redHot` 身上还热 0.35 / `donePoint` 这个点最近被人做过 0.25 / `repeatSpot` 90 秒内同地点演过 0.20 /
  `idleEyes` 闲着看我的人 ×0.12（封顶 0.36）/ `manyEyes` 观众 ≥3 0.10 / `dark` 暗处 −0.12 /
  `breakerLoss` 当众合闸 0.45。新增纯函数 `SKSanity.disguiseRisk()`。
- **观众按人加权**：`audSus 0.9`（这个人已经怀疑我，读 `susOf(w,i,true)` 夜间口径）+
  `audInf 0.6`（soc ≥ 60 或本局领袖）⇒ "谁盯我，我就在谁面前干活"。`maxAudience` 3 → 4。
- **观众口径对齐**：旧代码数"我看得见的人"，而信誉兑现 `credBroadcast` 用的是**目击者的视野** ——
  异形会为一个根本没看见它的人白站 8 秒。现在统一成"看得见我的人"。
- **闸门只留两道**：`cooldown` 18 秒 + `minScore` 0.25。"每夜 1 次"硬上限（`_fakeN`/`_fakeTaskN`/
  `_fakeBreakerN`）整体删除；调试/门禁要临时关掉伪装改用显式抑制位 `a._noFake` ⇔ `_t.noFake(i,on)`。
- **当众合闸**进同一张表（第三种演出候选，闸杆超出 `spotR` 就不为它跑一趟）。
- **拖着尸体不许演**（`a.drag==null` 才进候选）——修掉一个真实回归：门禁
  「异形拖尸遇到活人目击会松手走开」在本轮改动后失败，因为伪装插队打断了藏尸流程。

### 三 · 洗白的真凶不是数额，是"种类"

- 用户的第五项（`fakeWork 0.10 → 0.14`）**本轮不动**，等触发率数据再说 —— 数据支持这个克制：
  A 轮（只解闸，525 局）演出触发率 18.2% → **39.5%**，`fakeTasks 4.229 → 5.878`、
  `fakeRepairs 1.025 → 3.158`，但 `almostFriendCount 0.305 → 0.322`、`friendShield 0.011 → 0.013`
  **几乎没动**。加钱也买不来 friend。
- 真凶：`ALMOST.friendKinds = 2` 要求观察者看到**两种不同的正经事**，而旧代码里
  假装修理与假装做任务都写同一个 kind `fakeWork` ⇒ 异形手上永远只有 1 种，
  `almost.friend` 对异形**结构性不可达**（0.305 次/局全部发生在人类之间）。
- 修法：`CRED.gains` 拆成 `fakeWork` 与 `fakeRepair` 两种 kind（**数值都保持 0.10，不改钱只改种类**）。
  门禁新增端到端用例：同一个观察者连看 5 次真演出 → `cred=0.5 ≥ friendCred 0.4`、
  `kinds=fakeRepair+fakeWork` → **`almost.friend` 真的成立**（以前只能靠测试手写 credWhy 才成立）。
- 新遥测 `fakeBreaker`（当众合闸演出次数）：A 轮 **0.044 次/局** —— 这条基本不触发，
  因为 `breakerLoss 0.45` 把分压到门槛以下。机制保留但记入待议（见交付说明）。

### 四 · 顺带清理（死代码与量纲）

- 删除零调用函数：`alienFakeSpot` / `alienFakeTaskSpot` / `alienAudienceCount` / `alienAudience` /
  `bodyPresent` / `nearestBody` / `myTasksLeft` / `seedWitness` / `SKTrait.label`。
- 删除只写不读字段：`_fakeN` / `_fakeTaskN` / `_fakeBreakerN` / `_disGoal`；`_noFake` 从
  "全仓无赋值点的死守卫"改为真正的抑制位。
- 伪装相关数字全部外提进 `SKSanity.DISGUISE`：`dur{fake,fakeTask}` / `spotR` / `arriveR` /
  `doneWindow` / `repeatWindow` / `planValue` / `audSus` / `audInf` / `risk.*`。
  其中 `doneWindow` 从散写的 `600` 改为 **150**：`playT` 一局约 450 秒，600 等于
  "这个点这局被做过一次就永久算破绽"，会把刚修好的触发率再掐回去。
- `disguiseSpotFor` 改为**优先挑还没被人做过的点**（同一次扫描里分两个候选），
  而不是先挑最近的再吃一笔 `donePoint` 风险。
- 修复一处**会导致解析失败的接线事故**：上一轮未提交的改动把
  `}else if(a._plan.id==='sabotage'&&a._plan.room&&sabRoomOk(...)){` 整行覆盖掉了，
  破坏分支失去 `if` 外壳（`node --check` 直接报 SyntaxError，且 bot 分支置空 `_plan` 后
  仍被读 `.room` → TypeError）。本轮恢复该行并保住 `sabRoomOk` 的执行期复查。
- `tools/monte-carlo.cjs`：报告口径说明里"夜会议按 30 秒扣夜"是**旧规则**（现已改为会议暂停夜钟），
  一并修正；统计键新增 `fakeBreaker`。

### 实测（2026-11-03 实跑 · seed 20261030 · dt 0.1）

> 门禁本轮实跑：**643 通过 / 0 失败**（Edge headless，`file://`）。
> A 轮 = 只解闸 + 观众加权 + risk 重定义（跑到 525 局被 Windows 写盘 `-4094` 中断，留档 `tools/_mc-reportA-525.md`）；
> **B 轮 = A + cred 种类拆分 = 本次交付状态，1000 局完整**。

| 指标 | 11-02 基线 | A 轮（525 局） | **B 轮（1000 局）** |
|---|---:|---:|---:|
| 人类 / 异形 / 超时 | 56.5 / 43.0 / 0.5% | — | **58.1 / 41.5 / 0.4%** |
| fakeTasks | 4.229 | 5.878 | **5.977** |
| fakeRepairs | 1.025 | 3.158 | **3.133** |
| fakeBreaker（新键） | 无此统计 | 0.044 | **0.057** |
| 演出触发率（次 ÷ 只·夜） | 18.2% | 39.5% | **39.7%** |
| almostFriendCount | 0.305 | 0.322 | **0.314** |
| friendShield（挡下的票） | 0.011 | 0.013 | **0.011** |
| knownWrites | 7.967 | 7.116 | **7.073** |
| knives | 11.076 | 10.950 | 10.956 |
| nights / prog | 5.809 / 31.911 | 5.726 / 33.672 | 5.778 / **33.642** |
| meetings | 12.088 | 11.943 | 11.937 |
| exiles（人 / 异） | 3.49（1.552 / 1.938） | 3.322（1.571 / 1.750） | **3.349（1.613 / 1.736）** |
| 驱逐准确率 | 55.5% | 52.7% | **51.8%** |
| 终局存活（人 / 异） | 3.856 / 0.962 | 3.850 / 1.135 | 3.800 / **1.129** |
| reportsUsed | 7.115 | 7.097 | 7.047 |

**读法（重要，别把这次改动记成功臣）**：

- 触发率 **18.2% → 39.7%**（2.2×），确证写入 −11%、驱逐准确率 −3.7pp、异形终局存活 +17%
  ⇒ 伪装真的在模糊人类的判断，方向对；`knives` 几乎没动 ⇒ **演没有挤掉杀人**（当初最担心的回归没有发生）。
- 但 `almostFriendCount` 与 `friendShield` **纹丝不动**（0.305 → 0.314、0.011 → 0.011）。
  门禁已经证明"同一个观众连看 5 次 → `almost.friend` 成立（cred 0.5）"端到端可用，
  所以卡点**不是钱、不是种类，是观众随机**：实战里演出点是"离我最近的点"，
  观众是路人，同一对人凑不出 4 次。⇒ **`fakeWork` 从 0.10 抬到 0.14 已判定无用**，
  下一批要动的是"把演出送到常客眼前"（读 `saw_agent` 时间线选点），不是数额。
- 人类胜率 +1.6pp 属同 seed 但轨迹已分叉，**不能当结论**；要判定得等"观众送达"那一批一起做对照。
- 只读探针（250 局，独立 seed）另外量到两条与伪装直接相关的现状，留作下一批基线：
  **每局 1.48 对 `cred ≥ accuseShieldAt(0.35)`、0.96 对 ≥ `friendCred(0.40)`**，
  但 `warm ≥ minWarm` 只有 0.160 对/局、人类对未确证异形的最高 cred 只有 **0.132**
  ⇒ 信任额度在场内流通，却没有任何"聚焦成行为"的通道（怀疑侧有 `topSus`/`bestKnownTarget`，信任侧无对应选择器）。

## [返航录V3.5 · 证据分级 + 读人（AI 不再"太神"，冤枉得也更多）] — 2026-11-02

> 用户裁定两件事：**「AI 判定太神」**（8.55 次确证/局、56% 的驱逐靠抓现行）与
> **「冤枉得不够」**（准确率仍偏高）。这一批把判决权从"抓现行"转给"读人"。
> 门禁 **622 通过 / 0 失败**。1000 局：**54.0% / 45.3% / 0.7%**，
> **驱逐准确率 57.9% → 48.9%**（人类被逐 1.16 → **1.76**，第一次比异形被抓还多）。

### A · 证据分级：多远才算"亲眼确证"

- 新增 `SKSanity.CONFIRM.nearR = 4.5`：`noticeAction` / `trackNight` 的目击分两档 ——
  **贴脸（≤4.5 格）**看见出刀 / 钻管道 / 破坏 / 停摆 / 拉闸 / 红光 → 写 `known`；
  **隔远看见** → 只按原权重加嫌疑（`ev.far=1`，喂 `almost.foe`），**不写确证**。
  语义上正名：隔几格只能算"那边有人动手"，不能算"我亲眼看见他出刀"。
  实测每局确证写入 **8.55 → 6.31 次**（−26%），而 `known` 的绝对性一点没动。
- **口供矛盾按目标去重**：同一场会议里，一个人被三个目击者看见也只记一次 0.28
  （以前是 3×0.28 = 重复计账）。实测 `contradictions` **69 → 36 次/局**。

### B · 读人：票权、连坐、带节奏、被回避

- **`almost.foe` 升级为票权**：在 `startVote` 里先于 sus 分支 —— 手上有活着的准-确证就优先投他。
  上一版只乘 ×1.6 权重，实测只影响 1.4% 的票，是摆设。现在 `almost` 相关票 1.84 → **4.49 张**、
  由它驱动的驱逐 0.72 → **1.24 次/局**。
- **`almost.friend` 挡票**：45% 概率直接弃票（`ALMOST.friendVoteShield`）——
  异形"装好人"的唯一兑现口，终于真的能挡下票。
- **软联盟（连坐）**：`defenseNote` 记 `mind.ally[tgt]++`；被保者翻出是异形时，
  **保过 ≥2 次**的保人吃 `ally_revealed`（0.16×1.7）并说一句「我上次看走眼了」。
  只做这一档，**不做传递闭包、不做共同指控连坐**。
- **带节奏**：场上已有 ≥2 人公开咬同一人时，观望者跟票门槛 0.18 → 0.10。
  异形伪证就是在这里兑现的 —— 它不需要说服所有人，只要凑够"第三个声音"。
- **回避可观察**：夜里躲开"咬我最狠的人"时，被躲的人在 6 格内看得见就记一条
  `saw_avoid`（0.10，每夜一次）。行为回流终于闭环成证据。

### C · 让误判来自"被说服"，而不是随机噪声

- `FRAME.chance` 0.55 → **0.68**、`heard_frame` 权重 0.14 → **0.26**（分两步测的）。
  0.18 时构陷仍推不过指控门槛（0.50），异形的"自信表演"基本空转；
  0.26 时"三个人被同一套话术打动"就能凑出一次冤案 —— 真人局最常见的误判。
- **反例记录**：试过把 `voteAbstain` 从 0.52 降到 0.44 想制造更多误判，
  结果**反而让人类更准**（alienEx 1.88→1.96，humanEx 不动，胜率 66.3%）。
  弃权率高不是"冤枉"的来源 —— **别拿它当误判阀**，已写进 AGENTS。
- `ALMOST.foeSus` 0.70 → 0.62 → **0.55**（让人类也可能"基本被确定"）、
  `CARRY.cap` 0.45 → **0.55**（跨夜痕迹要能在会议里说话）、
  `silent` 从"只对白纸"放宽到"最多一条旧疑点"。

### 遥测

- 新增 `farSight` / `allyRevealed` / `friendShield` / `avoidSus`，报告增加对应四行。

## [返航录V3.5 · 节奏批（会议限额 + 报告额度 + 75 秒夜 + 证据分级）] — 2026-11-02

> 这一版把"节奏"当成第一优先级：**会议不再吃掉夜晚、报告变成稀缺资源、夜晚 120 → 75 秒、
> 白天开会回会议室打断一切、开夜前 5 秒不能动刀**，同时把"证据分级"（多远才算亲眼看见）
> 和"异形拆保安的欲望"调低。
> 门禁 **631 通过 / 0 失败**。1000 局：**人类 56.5% / 异形 43.0%**（上一批 54.0% / 45.3%），
> **驱逐准确率 55.5%**。完整风险表见 README「量化风险表」。

### 一 · 会议与报告的稀缺性

- **每夜最多 2 场夜晚会议**（`SKSanity.MEET.perNight`），白天会议固定 1 场、不占名额。
- **全局每人 2 次夜晚报告**（`MEET.reportsPerAgent`，玩家与 AI 同一额度）：
  HUD 显示「报告 2/2 · 会议 0/2」，额度用光后只能等别人拉铃。
  **顺序铁律**：先判"还有没有会议名额"，再消耗额度 —— 否则开不起来的报告会白吃额度。
- **异形报告的动机从"拖时间"换成"误导"**（`SKSanity.MISLEAD`）：
  夜晚会议不再吃时间 → "拖"没有收益了；现在收益 = 现成的靶子 + 适合被栽赃的人 − 自己的牵连风险，
  风险 = 现场有人看着 + 刚被看见过 + 额度稀缺。阈值 0.30 以下不报。

### 二 · 会议不再打断任务（白天除外）

- **夜晚会议 = 远程**：不移动任何人，只清移动路径，**保留 `doing/_doing`** → 站桩进度不丢。
- **白天会议 = 回会议室**：`dawn()` 把全员刷新到中央会议室并**打断此前的一切任务流程**
  （清 path/doing/act/drag），文案保留「天亮了，全员回中央会议室集合」。
- **会议期间夜晚时钟暂停**（`MEET.pauseClock`）：`finishMeeting` 里 `nightLeft = m.remainMs`，
  不再减去讨论+投票的时长 → 人类的干活时间不再被会议吃掉。
- **夜晚 120s → 75s**（`NIGHT`，中间试过 100 / 90，最后定 75）。

### 三 · 开夜禁刀

- 夜晚开始 **5 秒**内任何阵营不能出刀（`SKSanity.KNIFE.lockAtStart`）：
  玩家按键只得到提示，AI 的行为效用表里"追人"价值归零。锁放在**输入层**，结算层不拦
  （门禁的刀击链路用例要能直接驱动一次出刀）。

### 四 · 证据分级与"不再太神"

- `SKSanity.CONFIRM.nearR = 4.5`：**贴脸**目击才写 `known`，**隔远**只算"那边有人动手"
  （`ev.far=1`，照旧加嫌疑、喂 `almost.foe`）。实测确证写入 8.55 → **7.55 次/局**。
- 异形拆保安的欲望：`SKTeam.BOT_SEC_VALUE` 13 → **8**（低于追人 9/12）→ 身边有猎物就不拆；
  且候选只在**围攻成立**（≥2 队友 + 共同目标 + 45%）时存在。

### 五 · 手感与措辞

- **点错有反馈**：点不到的地方给出**禁止符号**（红圈 + 斜杠）+ 文字提示"走不过去"，
  以前是"点了完全没反应"，新手会以为卡了。
- **任务点红边**：任务物改成**红色轮廓包边 + 呼吸闪烁**（按家具贴图 alpha 膨胀求外环，
  等价于 Blender Freestyle 描边；本机无 Blender，且烘焙描边通道会锁死地图迭代）。
- **视野 19 → 21 格**（`VIEW_TILES`）。
- **措辞**：白天会议说"昨晚"而不是"今晚"（`whenWord()`）；被报的人只是**倒地**时不再说"尸体"。

### 六 · 蒙特卡洛（1000 局，seed 20261030）

| 指标 | 上一批 | 本批 |
|---|---:|---:|
| 人类 / 异形 | 54.0% / 45.3% | **56.5% / 43.0%** |
| 驱逐准确率 | 57.9% | 55.5% |
| 人类被逐 / 异形被逐 | 1.157 / 1.785 | 1.552 / 1.938 |
| 平均夜数 / 会议 | 5.55 / 12.63 | **5.81 / 12.09** |
| 维修进度 | 32.8 | **31.9** |
| 报告用量 | — | 7.12 次/局（额度 2/人） |

**调参过程**：夜长 90 秒时人类是 **70.3%**（时钟暂停让人类多出 30~60 秒干活时间），
**压到 75 秒后回到 56.5%** —— 接近五五开，且没有动任何推理逻辑。
要再调：`NIGHT` 75（每 +15 秒约 +4~5pp）、`WIN_PTS` 45（+1 分约 −4pp）、`MEET.perNight` 2→3。

## [返航录V3.5 · 推理引擎规范化（跨夜痕迹 + 准-确证 + 拟人化）] — 2026-11-01

> 这一版把「嫌疑」从**一夜保质期**做成一条完整的演进链：印象 `cred` → 痕迹 `sus`（跨夜衰减）
> → 准-确证 `almost`（双向、可推翻）→ 确证 `known`（不可动摇）。
> 同时补了六条拟人化：证言可信度、元推理回溯、在场反驳、熵触发的犹豫、沉默线索、跨会议口供。
> 门禁 **616 通过 / 0 失败**。1000 局：**62.8% / 36.6% / 0.6%**（与上一批 62.6% 基本持平）。

### A · 嫌疑跨夜衰减（不再一夜清零）

- `mindReset()` 里 `sus` 改为**衰减保留**，`mem` 仍每夜清空（跨夜位置记录不得参与本夜对质）。
- 三条护栏：① **分类型**——目击类 `saw_*` 每夜 ×0.72，传闻/拆谎/空口类 ×0.45
  （一句话造成的怀疑不该和亲眼所见等价）；② **本夜无新证据再 ×0.55**（一次诬陷不背一整局）；
  ③ **存量封顶 0.45**，且**夜间行动读取时再 ×0.7**（`susOf(a,i,true)`）——
  否则天亮第一分钟就有人凭昨晚的旧印象去开枪（0.45 仍高于激进档 0.36 的开枪门槛）。
- `why` 条目新增 `night` 字段（新鲜度与「本夜有无新证据」都靠它）；`susNight` 记录最后一笔证据的夜数。

### B · 准-确证（双向 + `known` 硬覆盖）

- `almost.foe`：`sus ≥ 0.70` + **≥2 类非传闻证据** + 最近两夜有新鲜证据。
- `almost.friend`：`cred ≥ 0.40` + ≥2 类正经行为 + 新鲜度 —— **异形伪装的兑现口**
  （门槛从 0.55 校准到 0.40：0.55 在实测里只有 0.04 次/局，又是一个"有机制没手感"）。
- 行为分档：`almost.foe` → 可说「我基本确定」（**绝不说"我亲眼看见"**）、投票更难被洗白、开枪门槛 ×0.7；
  `almost.friend` → 更舍不得投/开枪、会替他说情。**两者都不写 `known`，条件不成立就地删除。**
- **硬覆盖**：`known` 写入时 `knownOverride()` 立刻删 `almost.friend`、清 `cred`
  （此后 `credAdd` 对该对象直接 return），并写一条 `almost.foe`；
  **`trust` 不清** —— 那是「他帮过我」的情绪，清掉就抹掉了「昨天护他、今天咬他」这场戏。
- 排除项：`heard_*` / `silent` / `empty_accuse` / `leader_order` / `quick_report` / `wrong_accuse`
  **不算证据种类** —— 否则「被三个人说可疑 + 话少」就能凑出准-确证，和 `empty_accuse` 的惩罚打架。

### F1 · 证言可信度 `reliability`

- 与 `cred` 分开：`cred` = 「他干的是正经事」，`reliability` = 「他的话可信吗」。
- 回写只在 `settleAccountability()`：带对 +0.35（跟票 +0.15）/ 带错 −0.30（跟票 −0.12），
  口供被拆穿 −0.20。读取在 `heard_accuse` 权重上乘 `reliaMul(0.5 + reliability)`。
- 实测局末极差 **0.415**（改造前恒为 0 = 谁说话都一样值钱）。

### F2 · 元推理：辩护回溯 + 认错分支

- `defenseNote()` 记「谁保过谁」；被保的人翻出**是异形**后，保人吃一笔 `defended_revealed` 嫌疑
  （0.18），并在下一场会议自动说一句「我上次看走眼了」（`lines.js` 新增 `retract` 池）。
- **顺带修掉一处隐藏的身份读取**：`decideHumanDefend()` 原本有 `if(!tgt.alien)continue` ——
  人类永远不替异形说话，等于让 AI 抄身份答案，「装了好几天的异形永远换不来一句辩护」，
  伪装收益是假的。现在只看规则（没亲眼确证、不是 `almost.foe`），
  于是「装够了 → 有人保他 → 被看见 → 反目」这条链才真的能演出来。

### F3 · 在场反驳 `presence_deny`

- 「我当时就在配电室，没看见他」→ 反过来怀疑指认者（0.16，弱于正面矛盾的 0.28）。
- 三条严格条件：证词带具体舱室且算硬证词 / 我在同一时间窗内**确实在那个舱室**
  （`saw_agent` 新增 `ox,oy,lit` 记下目击者自己的位置与当时灯况）/ 那间是**亮房**。
  暗房与走廊一律不适用。

### F4 · 熵触发的犹豫

- 按 `sus` 分布的香农熵：`H ≥ 1.2` 犹豫（不主动点名，台词取 cold 档），`H ≤ 0.6` 才敢点名。
- **刻意不接 `voteAbstain`** —— 弃权率是调平衡调出来的阀，接进去等于隐式改平衡。

### F5 · 沉默也是线索

- 整场没有任何表态、且**健谈**（`soc ≥ 55`）的人被轻度怀疑（上限 0.10），玩家席位豁免。
- **只对"白纸"生效**：该对象在这个观察者那里已经有别的疑点时不再加沉默分。
  实测不设这条会把误逐人类从 1.16 推回 1.78 —— 因为「跨夜 0.45 存量 + 今天话少」
  会被拼成一次**没有新证据**的指控。
- 沉默**永远不进** `almost.foe` 的证据种类。

### F6 · 跨会议口供（只记不判）

- `mind.claimHist` 记每人对外声称过的位置（最近 3 夜）。
- 用途**只有台词**：「你上次说的可不是配电室，是引擎室吧」。
  **不产生任何 `sus`** —— 昨晚在引擎室、今晚在配电室本来就正常，给权重就是又一处量词错误。

### 行为回流 · 白天结论影响夜间走位

- 会上被谁咬得最狠（他对我的嫌疑最高），夜里空闲时会**主动往远离他的方向走**（实测 31.3 次/局）。
  不是数值加成，是行为真的变了；这条回避本身可被看见，白天又能被拿去当证据。

### 发言层

- **发言权倾斜**：`cands` 不再纯随机打乱，按「手上有多少东西要说（确证/准-确证/认错/指控/证据条数）+ `soc` + 随机」排序；
  有料的人先开口，安静的人自然落到后面，和 F5 闭环。
- `lines.js` 新增三个池子：`almost`（准-确证指控，三档确信度里的中间档）、
  `hedge`（犹豫）、`retract`（认错）。

### 遥测

- 新增：`susCarry` / `almostCount` / `almostFriendCount` / `almostEject` / `almostVotes` /
  `overriddenFriends` / `reliaWrites` / `reliaSpread` / `hedgeAgents` / `sureAgents` /
  `silentSus` / `presenceDeny` / `claimRecall` / `retractCount` / `avoidCount`；
  `tools/mc-report.md` 增加「推理引擎规范化」表。

## [返航录V3.5 · 推理质量（时间线拆谎 + 电闸语义 + 拘留证据）] — 2026-11-01

> 这一版只修**推理**，不新增任何平衡数值（`WIN_PTS` / `NIGHT` / `EV_W` 一个数都没动）。
> 三件事：① 时间线拆谎的**量词写反了**（拿过期位置指控说真话的人）；
> ② 电闸的**拉闸与合闸**在证据链里语义相反；③ 保安拘留接进证据链（只加嫌疑，绝不确证）。
> 门禁 **599 通过 / 0 失败**（2026-11-01 实跑）。
> 1000 局：**人类 62.6% / 异形 37.2%**（同 seed 改动前 52.1% / 47.0%），驱逐准确率 **45.2% → 66.2%**。

### 修复 · 时间线拆谎的量词（核心）

- **根因**：`saw_agent` 是**位置时间线**（同一个人每 3.5 秒最多一条，一夜十几条不同舱室），
  但四处拆谎都写成「**∃ 一条不匹配 → 定罪**」，还会 `mem.slice(-24)` 按条数截取。
  结果：t=10 在会议室看见 X、t=40 在配电室看见 X，X 说「我在配电室」→ 取到 t=10 的旧位置判他说谎。
  **AI 在用过期位置指控一个说真话的人**，这是「AI 发言时间线紊乱」的真正来源。
- **新增 `checkAlibi()`**（数学 `SKSanity.checkAlibi`，纯函数；取窗口与状态在 `game.js`）：
  · 窗口内**只要有一条与口供一致 → 口供成立，不可定罪**；
  · 窗口内没有任何该对象的记录（`checked===0`）→ **闭嘴**（不洗清也不定罪）；
  · 只有**全部**不匹配才成立 `contradiction`，证据取**最接近案发/口供时刻**的那条；
  · **走廊与未知区域记录不算「在某个舱室」**（走过一段走廊不能反驳口供）；
  · **不再按条数截取**，改为按时间窗过滤。
- **时间窗按调用点区分**：案发会议用 `crimeWindow(victim)` = 死亡时刻 **±8 秒**；
  假口供 / 玩家口供用 `claimWindow()`——说「**刚才**」只比最近 20 秒、说「**一直/整晚**」比整夜、
  没说时段按 45 秒兜底（`parseSpeech` 新增 `when` 时间槽）。
- **四处调用点全部换掉**：`contradiction`（会议自述位置对质）、`contradiction_lie`（假口供被拆穿）、
  `contradiction_player`（玩家口供对质）、`contradiction_claim`（玩家给的证据撞上时间线 —— 同一量词错误，顺带修）。
- **发言带证据新鲜度**：拆穿台词改成「我**刚才**在配电室看见他了 / **十几秒前** / **半分钟前**」，
  听众和玩家都能自己判断这条证据是不是过期的（`SKSanity.alibiTimeWord`）。

### 新增 · 电闸的两种操作语义相反

- **拉闸断电 = 身份级证据**：`noticeAction(…,'breaker')` 在 `lightState===2` 时，
  人类目击者直接写 `mind.known`（`kind='saw_breaker'`，`sus=1`，会议必指控 + 投票必投），
  异形目击者 `markMate()` 认作队友。
- **合闸复电 ≠ 证明他是人类**（异形也会合闸伪装）：人类目击只涨正向信任 `cred`，
  异形目击只涨新增的 `mind.humanT`（**人类可疑度**，`SKSanity.HUMANISH`，挑目标时最多 6 格距离当量），
  **不写 `mates` / `known`，也不给任何人洗清嫌疑**。
- **顺带修一个自相矛盾**：合闸以前也会加 `EV_W.saw_breaker`（0.32）嫌疑分 ——
  「把闸合上是做好事」却被记一笔嫌疑。现在合闸只加信任，不加嫌疑。
- 配电室是暗房、闸杆贴墙：只有紧挨闸杆的一小条站位 `aiCanSee` 得到 —— **「守闸」才有确证**，
  隔着半个舱室拉闸没人能指认（这也是它不会破坏平衡的原因）。
- `evClause('saw_breaker')` 文案改成「我看见他在配电室把电闸拉下去了，全船断电就是他干的」。

### 新增 · 保安拘留接进证据链

- **`witnessDetain(actor,x,y,rad)`** 是拘留证据的唯一入口：压制瞬间 10 格内、押送到位 8 格内、
  **看得见**的人各记一条 `saw_detain`（`EV_W` 0.6，人类还会把这个被押走的人列为首要怀疑）。
- **绝不写 `known`** —— 被保安抓的可能是**开枪的人类**（`pendingCrime` 不限阵营），
  与 README 的硬规则一致：开枪 / 拖尸 / 拘留这些人类也会做的事只增加嫌疑分。
  同一夜同一个人只记一次（`mind.detainSeen`），压制 + 押送不会重复加分。
- 不复用 `witnessAlienAction`（它第一行 `if(!actor.alien)return` 会整条拦掉人类）。
- **修掉一处身份泄露**：旧实现 `aiHear('detain',…,{subj})` 让 **26 格内**的人闻声就锁定被拘留者
  （比亲眼看见还准）。现在远处的人只留一条 `heard_detain`（`subj=null`）：有记录，但认不出是谁，也不加任何人嫌疑。

### 顺带 · 门禁稳定性（两条墙钟敏感断言）

- `3 秒后红身自动结束` / `开枪特效/后坐按真实时间自动收尾` 原来是**固定 sleep**（2600ms / 5000ms）
  再断言「已经收干净」。红身与特效按**模拟时间**衰减（`dt` 钳在 0.05），机器一忙帧率掉到 20fps 以下，
  模拟时间就落后墙钟 —— 这两条在**未改动的基线上同样随机失败**（本轮实测基线跑两次各失败一条）。
- 改成 `page.waitForFunction` **等条件成立**（上限 8s / 12s）再断言，判定语义不变
  （仍然要求红身归零、特效用尽），只是不再把「机器忙」当成逻辑回归。门禁现在稳定 **599 / 0**。

### 顺带 · 遥测（只统计，不改行为）

- 每局新增：`contradictions` / `contradictionOld`（旧量词会成立多少次）/ `falseContradictions` /
  `knownWrites` + `knownBy`（按证据类型拆分）/ `knownVotes` / `ejectByKnown` /
  `detainWitness` / `detainEvictions`，`tools/mc-report.md` 增加「推理质量」表。
- 本机读数（1000 局 seed 20261030）：`contradictionOld` **129.39 → `contradictions` 71.76**，
  `knownWrites` 8.88、`ejectByKnown` 1.68、`detainWitness` 0.055；
  `knownBy` 实测只有 saw_red / saw_sabotage / saw_knife / saw_pipe，**`saw_breaker` 在 AI 对 AI 里 0 次**
  （异形有目击者就不会拉闸）——守闸确证是**玩家侧**才吃得到的知识。

### 平衡提示（本次刻意没动）

- 1000 局：**人类 62.6% / 异形 37.2%**（95% CI 59.56~65.55），改动前同 seed **52.1% / 47.0%**，**+10.5pp**。
- 但驱逐质量大幅变好：准确率 **45.2% → 66.2%**，误逐人类 **1.736 → 0.874 次/局**（几乎腰斩）。
  机制就是这次修的东西：省下来的全是**对真话者的误判**，而会议自述位置对质的打击对象本来就全是人类，
  所以「少冤枉人」直接等于「人类内耗减少」。
- **要拉回五五开，按上一节的口径动 `NIGHT`（120→130）或 `WIN_PTS`（45→44），不要回退拆谎逻辑。**

## [返航录V3.5 · 讨论真的有用] — 2026-11-01

> 这一版只做一件事：**让讨论不再只是台词，而是能改变投票、改变关系、改变之后走哪条路**。
> 顺带把会议语料从「每个场景 2~3 条 + 确定性索引」换成 **290 条按性格/情绪分池的语料库**，
> 并加了**领袖型玩家**与**对质环节**。
> 门禁 **582 通过 / 0 失败**；400 局 **人类 50.0% / 异形 48.75%**（几乎正中 50/50）。

### 新增 · 语料库 `js/data/lines.js`（约 290 条）

- 按 MIDA（EMNLP'26）的六类说服策略分组：**身份声明 / 指控 / 辩护 / 证据 / 询问 / 行动号召**，
  外加**对质**与**领袖指令**两类；每类再分 `hot`（激动）/ `cold`（冷静）两档。
- 写作纪律写在文件头：**8~18 字**、口语、可省略主语、不用"时间线/证据链"这类书面词。
- `pickLine()` 重写：支持传**字符串**直接查池子，按性格选情绪档；传数组则改为**等概率随机**。
  旧版是确定性索引（同一席位同一夜每局念同一句），这是"15 个人一个声音"的根因。
- 随机仍走 `Math.random`，蒙特卡洛会把它换成 `simRng(seed)`，**同 seed 逐局可复现**不受影响。

### 新增 · 讨论影响投票（说服力侧）

- **反咬削弱说服力**：听众对被指控者已有 ≥0.30 嫌疑时，其证言权重 ×0.85。
  **只削"别人信不信他"，绝不动他自己的 `known`** —— 目击者的判断是硬约束。
- **共证加成**：同一目标有第二个独立指控者起，权重 ×1.25（MIDA 的"证据汇合"）。
- 两条幅度都刻意压小，实测胜率位移在噪声内。

### 新增 · 讨论影响行为（warm）

- `mind.warm`：**一起指控过同一个人** → 彼此 +0.10（每场会议 ×0.85 衰减）。
- 效果：任务全做完之后，AI 有 45% 概率往"聊得来"的人那边走（14 格内）。
  **只在空闲阶段生效**，不影响做任务与逃生。
- 与 `trust`（他帮过我）/ `cred`（他能干）分开，`warm` 只影响"想跟谁待在一起"，不参与投票。

### 新增 · 对质环节

- 指控之后补一次真正的交锋：指控者拿被指控者**自己先前的口供**顶他（`confront` 池），
  对方当场用 `defend` 池回应。以前只有开场那一轮 challenge，之后就没有第二次交锋了。

### 新增 · 领袖型玩家

- 约 **22%** 的对局里会出现一个"爱指挥"的人（实测 40 局里 10 局有，其中 25% 是异形）。
- 只在 `soc` 轴 ≥45 的人里选；**不预先判定阵营** —— 可能是人类在组织，也可能是异形在带节奏。
- 会议里下 1~2 条指令（开局会议与夜间会议都会）：派活、点名让谁去哪、定行动路线。
- 效果刻意做轻：听众对领袖 +0.06 warm，被点名的人只 +0.02 嫌疑（远低于一次真实指控）。

### 测试调整

- `回应中的位置与它先前的口供一致` 改为取**第一条**新发言（原来取最后一条）。
  会议里现在会冒出领袖指令（说的是与他自己口供无关的房间），排在最后就会误判。

### 门禁与平衡

- `node tools/test-v3.cjs` —— **582 通过 / 0 失败**。
- 蒙特卡洛 400 局（seed 20261101）：人类 **200（50.0%）** / 异形 **195（48.75%）** / 超时 1.25%，
  Wilson 45.12%~54.88%。上一版 1000 局是 53.9%，**位移在噪声内**，符合"幅度小一些"的要求。

## [返航录V3.4 · 诬陷、追责与工具贴图] — 2026-11-01

> 这一版把社交推理补成闭环：**异形会诬陷、诬陷要还、投票结果会追责**。
> 另外修掉上一版对破坏的理解偏差（破坏点＝任务点，但异形不用走过去），
> 把维修动画里那把**手画的扳手**换成渲染贴图，并压掉维修完成特效的光污染。

### 改动 · 破坏（纠正 V3.3 的过度设计）

- **落点均匀随机**：`sabSpot` 在该舱室的所有任务点里**等概率**抽一个（旧版给硬点 0.6 权重，
  结果老是抽到靠近房间中心的硬点，看起来像"破坏点还在中心"）。
- **不需要走到设备前**：V3.3 要求异形走到设备旁站 1.2 秒，这一版撤回 ——
  进舱即触发，被破坏的仍然是**任务点上的那台设备**（`G.dmg` 的坐标就是它）。
  玩家侧 `sabTick` 同口径。实测破坏从 8.68 次/局回到 **10.86 次/局**。

### 新增 · 异形主动诬陷

- 异形没有目击也会编一份**具体伪证**：「我看见他在<房间>出刀 / 钻管道」，
  措辞与真目击一字不差，听众无从分辨。概率 `SKSanity.FRAME.chance`（0.55）。
- `accuseWhy.solid` 成为统一口径：真确证 / 真取证 / 伪证都算"硬证词"，
  纯情绪指控才是软证词 —— 证言通道按它分级。
- 异形指控谁就把票投给谁：说了不投等于自己打脸。

### 新增 · 追责机制

- 投票结果公布后清算「带节奏」的人（`meet.lead[目标]` 记第一个公开指控者）：
  - 被驱逐的**真是异形** → 投对的人 **+cred**（别人更信他的判断）
  - 被驱逐的是**人类** → 投错的人 **−cred**，带头的人还被记一笔嫌疑
- 效果按 `leadMul 2.2 / voterMul 0.55` 分级，跟票的只掉信誉、不被记仇。
- 这是诬陷的代价：诬陷成功收益极大，一旦被证伪，带头的人自己就变成下一个目标。

### 美术

- **维修动画的扳手**：`drawWrenchShape` 手画 → Blender 渲染的 `tool-wrench.png`
  （材质仍是 SDXL 出的 `panel-metal.png`）。以手柄末端为枢轴做往复拧动，
  叠一层暖色滤镜保证在亮地板上也读得清。
  *注：SDXL 直出试了三张全是"多联图/带文字/灰底"，`one single` 压不住它画成产品目录，
  所以工具改走 Blender 几何体 —— 材质依然是扩散模型出的。*
- **维修完成特效**：原来那圈全息光环被用户点名"光污染"，换成**细小电弧**
  （同一条 `fx-arc` 贴图，0.35 格、透明度 0.42×0.55，随进度快速衰减），✓ 也收小收暗。
- 维修中的焊花透明度 0.72 → 0.52，不再一簇一簇地闪。

### 参考 · 同类游戏社交推理机制（联网调研）

论文《Finding deceivers in social context with LLMs》对黑手党/狼人杀的对局做了消融，
几条可借鉴的规则已落地或部分落地：

| 规则 | 落地情况 |
|---|---|
| 协同投票 → 标记同伙 | 未做（需要跨会议投票记录聚类，留作下一批） |
| 协同后刻意分离 → 升级怀疑（甩锅） | 未做（同上） |
| 言论与投票必须双源验证 | 部分：证言通道 + 追责同时看"说了什么"和"投了谁" |
| 指控可信度 = 多因素汇合，不是单点证据 | 已做：`solid` 分级 + 说话者 cred 加权 |
| 检测只能基于过程线索，不能看身份结果 | 已遵守：`cred` 绝不写 `known` |

### 修复 · 紧急会议不消耗夜晚时间（无限续夜）

- **根因**：`finishMeeting` 里 `nightLeft = Math.max(8000, remainMs − elapsed)` 的 8 秒保底。
  该函数在 `x = 8000` 处有不动点 —— 深夜开会扣成负数后被抬回 8000，下一次会议再扣再抬，
  **夜晚永远结束不了**。实测 40 局：319 次报告尸体会议里有 **66 次（20.7%）** 踩在这条保底上。
- **修法**：去掉保底，允许 `nightLeft ≤ 0`；≤ 0 时直接 `dawn()`（天亮 → 第二天全员会议）。
  天亮会议的副标题会注明「上一场会议拖到了天亮」。
- 门禁补 3 条断言：90 秒开会 30 秒 → 剩 60 秒；10 秒开会 30 秒 → 直接天亮；天亮散会 → 天数 +1、时间回满。
- 详细调查见 `docs/调查报告_会议与夜晚计时_20261101.md`，
  400 局前后对照见 `docs/模拟报告_会议消耗夜晚时间_20261101.md`。

### 门禁与平衡

- `node tools/test-v3.cjs` —— **582 通过 / 0 失败**（2026-11-01，Edge headless）。
- 蒙特卡洛 **400 局**（seed 20261101）：人类 **213（53.25%）** / 异形 **184（46%）**，
  Wilson 95% 区间 48.35%~58.09%。V3.3 为 58.2%（1000 局）。
- 会议时间修复后同 seed 400 局：人类 **220（55.0%）** / 异形 **179（44.75%）**，
  夜数 5.76→5.46、会议 13.7→12.5（碎片化的伪夜消失），胜率变化在噪声内。
- 异形变强主要来自破坏回归（10.86 次/局）与诬陷；人类变强的部分是追责与证言。
  两个方向再次对冲，落回 50% 附近。

## [返航录V3.3 · 镜头拉近与 Blender 特效管线] — 2026-11-01

> 这一版两件事：**镜头拉近**（一屏 30 格 → 19 格），以及把补给站、维修火花、电流特效
> 全部从 Canvas 手画换成 **Blender 渲染 + SDXL 材质**。顺手补完上一版留的两个尾巴
> （假装修理半径、证言加权）。

### 改动 · 相机

- `VIEW_TILES` **30 → 19**（`js/game.js`）。引擎是纯 2D 正交投影，没有真正的高度轴，
  "镜头高低"等价于"一屏看多少格"——数字越小越近、人和家具越大。
  用户反馈默认视角太高、地图和人显小，按 19 格重定标；想再调只改这一个数。

### 改动 · AI

- **假装修理半径 8 → 12 格**（`SKSanity.DISGUISE.fakeRepairR`）。故障平均只活 20 秒，
  8 格内"正好路过"太苛刻（300 局实测 0 次），放宽后异形才真的会走过去"帮忙"。
- **证言加权接线**（`heard_accuse`）：有依据的公开指控现在会真的改变听众的嫌疑分，
  权重 = 基础 0.14 × 听众对**说话者**的能力信誉倍率（`credTestimony`，1.0~1.6）。
  在此之前 AI 之间的指控对别人一点影响都没有，目击者只有自己那一票。
  **只写 `sus`，绝不写 `known`** —— 证言不是亲眼所见。

### 美术 · Blender 渲染管线（新）

- 新增 `tools/blender-fx.py`：用 Blender 渲补给站道具与特效序列帧。
  复用底图的相机参数（正交 / 俯角 12° / 北侧南看）与**同一套 AgX 色彩管理 + exposure 1.34**，
  材质取自 `assets/scene/v4/tex/`（SDXL 出图）。所以它和烘焙底图是"一张照片里的东西"。
- 新增 `tools/fx-post.py`：Blender 原始帧 → 上下翻转（相机 +Y 在图上、游戏 +Y 在图下）
  → 裁切 → 接地阴影 → 2×2 帧图集。
- **补给站**：Canvas 手画的圆角矩形 + 居中图标彻底删除，改为 Blender 渲染的
  `supply-ammo.png` / `supply-med.png`（512² RGBA，含接地阴影）。保留状态层
  （可兑换虚线环 + 深色药丸标签）。
- **维修火花** `fx-weld`：单帧 SDXL 图 → **Blender 4 帧图集**（2×2，1024²），
  播放时按剩余时间推进帧号。
- **电流特效** `fx-arc`（新）：电闸开合的 `power` 与破坏的 `spark` 都改用它，
  4 帧蓝白电弧，加色混合。原来的矢量折线只在贴图未就绪时兜底。

### 踩坑记录（都写进脚本注释了）

- **不能给 object 加 `rotation_euler`**：`box/rod` 的顶点是绝对坐标、object 原点固定在
  世界原点，转 object 会绕原点甩出去（第一版弹壳直接消失、电弧变成一堆飘着的短线）。
  方向必须在 bmesh 里用四元数算。
- **AgX 会把高强度高光洗成纯白**：电弧发光强度给到 30，渲出来是白线不是蓝弧。
  压低强度（9/5）、提高色饱和度才对。
- **贴图上下翻转**：Blender 正交相机的 +Y 在图上方，游戏的屏幕 Y 与世界 Y 同向，
  不翻转的话道具的"正面"会跑到贴图上边（危险色条看着像贴反了）。
- Blender 在 **`E:\SteamLibrary\steamapps\common\Blender\blender.exe`**（Steam 版，5.2.2 LTS），
  不在 PATH、也不在 `C:\Program Files` —— 已写进 `AGENTS.md` 的本机环境表。

### 门禁与平衡

- `node tools/test-v3.cjs` —— **578 通过 / 0 失败**（2026-11-01，Edge headless）。
- 蒙特卡洛 **1000 局**（seed 20261101）：人类 **582（58.2%）** / 异形 **415（41.5%）**，
  Wilson 95% 区间 55.12%~61.22%。基线（V3.2，300 局）为 50.33%。
- 位移来自两处，都在上面：**证言通道**（AI 的指控现在会真的改变听众的嫌疑分）
  与**假装修理 12 格**（异形把更多时间花在"演"上，出刀 9.75 → 9.47）。
- 标定过程值得记一笔：证言权重最初统一给 0.14，人类胜率直接冲到 **76.3%**；
  改成"确证 0.10 / 传闻 0.032"后落到 57.3%；最终定在 **确证 0.02 / 传闻 0.006**。
  结论：**证言是这套 AI 里杠杆最大的一个旋钮**，动它必须跑 1000 局。
- 顺带查明：`CRED.accuseShieldAt` 在 300 局里**几乎不触发**（把它设成 9.99 关掉，
  胜率一位小数都不变）。洗白目前靠证言权重，不靠这条保护 —— 等伪装频次上来才会生效。

### 调参入口

| 想调什么 | 改哪里 |
|---|---|
| 镜头远近 | `js/game.js` 的 `VIEW_TILES`（19） |
| 证言强度 | `js/game.js` 里 `heard_accuse` 的 `0.020 / 0.006` |
| 信誉保护门槛 | `SKSanity.CRED.accuseShieldAt`（0.35） |
| 假装修理半径 | `SKSanity.DISGUISE.fakeRepairR`（12） |
| 道具/特效重新渲染 | `blender-fx.py` → `fx-post.py` |

## [返航录V3.2 · 理智兜底与正向信任] — 2026-11-01

> 这一版的主线只有一句：**性格是软的，理智是硬的**。新增 `js/ai/sanity.js` 作为独立的理智层，
> 先过「目击者数 / 隐蔽度 / 人群密度」三条与性格无关的硬线，过了才轮到性格微调；
> 同时补上 AI 长期缺失的**正向激励**（`mind.cred`），让异形的伪装第一次有了兑现口。
> 门禁 **578 通过 / 0 失败**；蒙特卡洛 300 局（seed 20261101）**人类 50.3% / 异形 49.7%**。

### 新增 · 理智兜底（`js/ai/sanity.js`）

- **性格方差压缩**：`SKSanity.TRAIT_GAIN = 0.45`。`traits.js` 的 `b()` 统一乘它，
  `SKTrait.C` 里所有系数一次性收窄，不再逐个改表。用户原话「先暂时压制一下性格带来的方差」，
  要恢复差异只调这一个数。
- **三条硬线**（性格不能突破）：出刀 `witnessCap 3 / minConceal 0.34 / crowd 9 格 3 人`；
  破坏 `1 / 0.58 / 10 格 3 人`；拉闸 `1 / 0.45 / 10 格 3 人`。
  激进派不再敢在三个人面前动手，破坏与拉闸在人群里一律不做。
- **暴露度模型**：`exposureAt()` 按**真实目击半径**加权（亮房整间 / 亮走廊 12 / 暗房 2.8），
  不再是旧的「6 格内数人头」。这一条修掉了老 bug：亮房里 10~40 格外的证人玩家看得见、
  AI 数不到（会议室对角线 44.9 格）。出刀时把受害者排除在暴露度之外（他躲不掉）。
- **`knifeBold` 收窄到 0.34~0.66**（旧 0.12~0.95），`knifeWatcherCap` 统一取理智层的 3。

### 改动 · 破坏落点与拉闸

- **破坏落点随机化**：`sabSpot()` 在该舱室的**任务点**里随机抽一台设备（硬点权重 0.6），
  不再是固定第一个硬点、也不落舱室中心；按夜缓存，同一夜同一舱室返回同一个设备。
- **必须走到设备前下手**：AI 侧删掉「踏进舱门就引爆整间房」（`roomIdAt===房间`）的捷径，
  改成走到设备前站桩 `actTime=1.2s`（`_doing='sab'`）才结算；玩家侧 `sabTick` 同步收紧。
  现在玩家看到的是「有人在那台设备上动了手」，不是「设备自己炸了」。
- **拉闸理智线**：删掉「站桩秒数越长越谨慎」的概率折算，改为目击者/隐蔽度/人群三条硬判据。
- **修 bug**：`alienPlan` 的 `chase` 常数不随刀数归零 —— 旧版刀用完仍按 12/9/2 评分，
  压过拉闸（上限 9.5）与破坏（上限 7.0），导致**没刀的异形整夜不拉闸不破坏**。

### 新增 · 伪装收益 + 正向信任

- **伪装收益分** `SKSanity.disguiseScore({audience,duration,risk})`：必须有**明确观众**
  （`alienAudienceCount>0`，真的看得见人）才允许演，分数不到 `minScore` 不演；
  演完进 18 秒冷却。替换掉旧的「附近有人 + 每秒 10% 掷骰」。
- **合闸伪装**（新增）：断电时当着人把闸合上，是异形能做的最高价值清白动作；
  风险里含放弃断电视野的战略损失，需要 ≥2 名观众才够分。
- **正向信任 `mind.cred`**：与 `trust`（恩情）/`grudge`（记仇）并列的第三条通道。
  来源全是可被目击的正经行为：完成任务 +0.10 / 修好故障 +0.16 / 合闸 +0.14 /
  拖伤员进医疗间 +0.10 / 施救 +0.20 / **伪装干活 +0.08**（目击者分不出真假）。
  按真实目击半径广播（`credBroadcast`），跨夜 ×0.92 衰减。
- **洗白闭环**：`cred ≥ 0.35` 且手上无确证 → 不指控；投票时 `credVoteShield` 概率弃票。
  **cred 不写 `known`** —— 信誉洗不掉亲眼所见。

### 改动 · 声音系统量化

- **距离 → 音量线性化**：统一走 `SND.volAt(x,y,scale)`，量程 18 格、保底 0.14、最高 1.0。
  旧代码各处各算（1-d/16、1-d/12、1-d/6、1-d/18），同一个距离上枪声和尖叫衰减曲线完全不同。
- **音色档 `TONE`**：每种音效单独的上限（防刺耳）与播放速率区间（做区分度）——
  金属/电/人声/脚步各占一段频段，不再靠"调大音量"抢注意力。

### 美术 · SDXL 特效贴图

- 新增 `--fx` 出图模式：**纯黑底 + 加色混合**（`globalCompositeOperation='lighter'`）。
  特效不能走白底抠图 —— 光晕外圈本来就是白的，抠完只剩一圈硬边。
- `fx-task`（全息完成光环）与 `fx-weld`（焊花）已接入 `drawFx`，贴图未就绪时自动回退矢量画法。
- 特效的调色参数比道具高得多（`sat 0.66 / 0.82`）：加色混合下"颜色就是亮度"，
  降饱和会把焊花洗成纯白（第一版实测糊成一团白光）。

### 工具修复（`tools/gen-facility-sprites.py`）

- `stream_safetensors_to_gpu()` 改**分块直灌显存**（48MB/块），修 16GB 机器上加载阶段 `MemoryError`。
- `post_process` 改 `cutout(raw)` 出 mask、`grade()` 只作用 RGB —— 调色污染分割是补给箱抠图失败的真因。
- `cutout()` 丢弃「左右顶到画边」的连通域，去掉模型画的墙/地分界线。
- `--fx` 与普通后处理按组隔离（不带 `--only` 跑 `--fx --post` 曾把四件老设施的候选图覆盖成无 alpha 方图）。

### 修复 · 不变量

- `SKInvariants.MAX_PROG` 40 → 45，与 `WIN_PTS` 对齐。旧值让每次达成胜利都误报 G1「维修进度越界」。

### 门禁与平衡

- `node tools/test-v3.cjs` —— **578 通过 / 0 失败**（2026-11-01，Edge headless）。
- 蒙特卡洛 300 局（seed 20261101）：人类 **151（50.33%）** / 异形 **149（49.67%）** / 超时 0；
  Wilson 44.71%–55.95%。基线（V3.1）为人类 43.1% —— 隐蔽性压低了出刀（9.75/局，原 11.62），
  同时正向信任抬高了驱逐（3.10/局，原 2.01），两个方向大致对冲。
- 每局均值：夜 5.47 / 会议 12.80 / 出刀 9.75 / 破坏 8.68 / 进度 34.13 / 驱逐 3.10。

## [返航录V3.1 · 行为效用表] — 2026-11-01

> 异形 AI 从「if 优先级链」重构为**量化收益表**：取消拉闸手/破坏手等一切专属角色，
> 拉闸、破坏、拆机器人、追人都进同一张效用表打分取最高；幽灵转纯任务；
> 修复「同一具尸体被 AI 反复拉铃」的 bug。门禁 **579 通过 / 0 失败**。

### 重构 · 行为效用表（个人 + 团队两层）

- **专属角色全部取消**：不再指定 `breakerSaboteur`（拉闸手）——每只异形都能拉闸、
  都能破坏，具体做哪个由 `alienPlan()` 的量化收益决定（每 0.5 秒重算，秒级 CD 驱动，
  不依赖模拟时钟——`evNow()` 在批量模拟/暂停时不走会让计划永不重算，实测踩过）。
- **效用口径**（团队价值，写在 `SKTeam`）：
  `断电 14 × 剩余夜比例`（视野压制价值高于牵制，否则"1 秒下手、无需站桩"的破坏
  会永远挤掉要站 3~9 秒的拉闸——首版实测拉闸被挤死）；
  `破坏 8 × 剩余夜比例`（牵制价值：把 2 名人类 + 幽灵钉在修复上，就算被修掉牵制也已发生，
  所以**不吃命中率**）；`拆保安 13 / 拆无人机 8`（围攻前提成立时价值压过贴脸猎物）；
  `追人 = 贴脸 12 / 可追 9 / 追不上 2`。
- **拆机器人进效用表**（用户裁定）：机器人/无人机**只能被刀或枪瘫痪**，破坏技与机器人彻底无关
  —— 刀没了就不列候选，保安在异形面前也轮不到它下手。
- **破坏与保安拘捕解耦**（用户裁定）：删除 `secbotWouldSee` 对破坏的回避 —— 在军械库拆也照拆，
  被保安看见就是普通危险行为，走既有 `pendingCrime` 拘留链。
- **防踩踏（团队量化第一课）**：同一故障超过 `SKTeam.FIX_CREW_CAP`（3）人在赶/在修，
  边际收益为负 —— AI 认定队友能修好，转去做任务。
- 修复批量模拟/暂停下效用计划永不重算的 bug（`_planCD` 用秒级 CD 而非 `evNow()` 差值）。

### 改动 · 幽灵转纯任务（用户裁定）

- **幽灵不再能修故障**（`startFix` 对所有幽灵拒绝）：2 分修复额度只能花在剩余任务上，
  额度耗尽进入游荡。`aiGhost` 删掉修故障分支，`aiIdleRoam` 幽灵不再奔故障点。
- 门禁的幽灵维修用例改写为「幽灵不能修故障」；幽灵抢修遥测（`sabFixedByGhost`）保留，
  供对照历史数据。

### 修复 · 同一尸体被反复拉铃（用户报障）

- AI 的扫尸报告扫描里，旧代码只对**濒死者**检查 `bodyReported()`，真正的死者不拦——
  AI 会对同一具尸体反复拉铃开会。现在统一 `if(bodyReported(v))continue;`，
  一具尸体一夜只报一次（与玩家 `tryReport` 同规）。

### 门禁

- `node tools/test-v3.cjs` —— **579 通过 / 0 失败**（2026-11-01，Edge headless）。
  断言随行为更新：「幽灵维修」改写为「幽灵不能修故障」；「破坏技停摆机器人」改写为
  「保安只能被刀/枪摧毁」；围攻用例锁定中性性格（knifeReach 随性格浮动会让
  chase/bot 的效用竞争随机翻转，实测时好时坏）；会议台词用例锁谨慎性格。

### 已知波动

- 门禁存在 ±1 条的随机波动（会议台词的口语随机序），核心功能断言稳定。

## [返航录V3 · 性格轴与情绪记忆] — 2026-10-31

> 新增 `js/ai/traits.js` 声明层：四条性格轴（激进/谨慎/社交/好奇）第一次**真实地改变行为**；
> 新增情绪记忆 `mind.trust` / `mind.grudge`：AI 会记仇也会记恩，发言与投票随之改变。
> 门禁 **579 通过 / 0 失败**。

### 新增 · 性格轴（`js/ai/traits.js`，声明层唯一真源）

- 每个局内 AI 固定一套四轴档位（`aggr 激进 / caut 谨慎 / soc 社交 / cur 好奇`，0~100，中性 50），
  用**三档分布**（28/50/72，概率 30/40/30）抽取——保证每局都有敢冲的、怂的、和事佬。
- **所有「性格 → 行为」的系数集中在 `SKTrait.C`**，业务代码只调用、不写魔法数。
  这套结构继承自太空杀旧分支的 `SKTrait` + 效用函数思路（见 README「关于继承」），
  但数值全部按实时对抗重写。
- 已接线的判定点（激进 vs 谨慎，中性档行为不变）：

| 判定点 | 系数 | 激进 vs 谨慎 |
|---|---|---|
| 异形挑目标：被围观的惩罚 | `knifeWatcherPenalty` | 12 格 → 6.6 / 17.4 |
| 异形挑目标：扑正在做事的人 | `knifeBusyBonus` | −12 → −16.4 / −7.6 |
| 异形贴脸出刀距离 | `knifeReach` | 1.3 → 1.59 / 1.01 |
| 异形：目击者前仍出手的胆量 | `knifeBold` | 0.75 / 0.29 |
| 异形：目击者人数硬上限 | `knifeWatcherCap` | 3 人 / 2 人 |
| 人类开枪所需嫌疑 | `shootSus` | 0.36 / 0.60 |
| 投票弃权率 | `voteAbstain` | 0.10 / 0.57 |
| 开局错峰延迟 | `delayScale` | ×0.55 / ×1.30 |
| 弃修阈值 | `fleeThreshold` | ×1.60 / ×0.60 |
| 替人辩护概率 | `defendChance` | ×0.85 / ×0.45 |
| 跟票概率 | `followChance` | ×0.88 / ×0.50 |

- 门禁新增「激进 vs 谨慎的系数差」组断言（五项系数必须保持方向一致）。

### 新增 · 情绪记忆（`mind.trust` / `mind.grudge`）

- **写入**：
  - AI 当众指控某人 → 被指控者对指控者 `grudge +0.40×grudgeGain`
  - AI 当众替某人辩护（人类辩护段 / 异形护队友段）→ 被辩护者对辩护者 `trust +0.45×trustGain`
  - **玩家发言同样写入**：玩家指控/投票某人 → 那人记玩家一笔仇；
    玩家说出「XX 不是异形 / 别投他 / 我保他」且点名 → 被保者记玩家一笔恩
- **读取**：
  - 投票：`grudge ≥ 0.6` 时激进的人大概率把票砸回去（情绪先于从众）；
    `trust ≥ 0.8` 的「恩人」**不过票**（`isPatron`），哪怕嫌疑分再高
- **衰减**：跨会议保留，每场会议 ×0.8，衰减到 0.05 以下才忘——记仇不是永久的，但也不是当场就忘
- 门禁同步：构陷用例的旁观 AI 锁成谨慎型（否则激进 AI 会跟着多数指控走，断言不稳定）；
  「没证据必弃权」的旧断言改为「按性格弃权或跟票，但绝不会被单方面构陷带偏去投证人」

## [返航录V3 · 拉闸解耦与设施收口] — 2026-10-31

> 拉闸与合闸彻底解耦并按时长分档；监控台斜躺在主控台；10 舱室加摄像头布景；
> 维修动作改成「握着扳手拧」；DEV 横栏从横滑改成两排卡片。

### 机制 · 拉闸 / 合闸解耦

- **拉闸**（把灯拉黑）：本夜第 **1/2/3 次 = 3 / 6 / 9 秒**，第 4 次起恒 **9 秒**。
  计数只在 `pullBreaker()` 真正把 `lightState` 变成 2 时 +1（`G.breakerPulls`），
  站桩中途移动/被杀**不消耗名额**；`G.breakerPulls` 每夜重置，第 2 夜重新从 3 秒起算。
- **合闸**（恢复供电）：**恒 4.5 秒**；做完「电路维修」（`powerFixed`）后降到 **3 秒**。
- 拉闸时长**不看** `powerFixed`，只看本夜次数；合闸时长只看 `powerFixed`。
  两条规则各自独立，`breakerOnTime()` / `breakerOffTime()` 是两个真源，`breakerPullTime()` 只做分流。
- **任何活人都能拉闸也能合闸**（原来合闸有 `_lightGo` 名额制，只派 1 人）。
- **AI 异形的风险评估跟着变**：拉闸前先算本次暴露窗口——6 秒起「9 格内有人看得见或保安可能扫到」就放弃
  本夜剩下的拉闸（`a._breakerSkip` 钉到本夜），9 秒时无人看着也只有 40% 概率动手。越靠后的拉闸越谨慎。

### 表现 · 设施收口

- **监控台改到主控台并斜躺**：锚点 `(81, 28.8)` → **`(79.35, 36.0)`**（主控台正中偏上）。
  屏幕用 6 段「逐级后退 + 抬高」的薄板拼出约 20° 俯仰（`box` 只支持绕 Z 旋转，做不了真斜面），
  屏幕材质走 SDXL 的 `facility-screen.png`，两侧加支耳把屏「架」在台面上而不是浮着。
- **10 个舱室各加一个监控摄像头**（decor，`kind:"camera"`，0.4×0.4 格，壁装 1.9 高度）：
  壁装底座 + 球罩 + 镜头口 + 红点。**纯装饰**，不进 `M.cover`、不参与视野与判定；
  `decor` 从 22 件增加到 32 件。
- **维修动画改成真扳手**：原来只在右上角挂一个「扳手小图标」。现在 `drawWrenchShape()` 画一把
  大号开口扳手（手柄 + C 形开口头 + 钳口短边），以握持点为轴做往复拧动，配一圈虚线拧动弧
  + 底部火花，能读出「在拧螺丝」。其它工作（施救/取弹/搜尸/拉闸/看监控）仍用小图标，各司其职。

### UI · DEV 横栏

- 15 张卡从「横向滚动」改成 **grid 两排（8 + 7）**：横滑条本来就点不动（父层 `pointer-events:none`），
  现在 `#dev-rows{pointer-events:auto}` 且全部卡片一次可见。
- 资源行改紧凑写法（`弹0 包0 单0 任务0/4`），窄屏自动降列（1100px→5 列，760px→3 列）。
- 标题行加 `flex:0 0 auto` + `min-height`：两排卡会把容器压扁，第一次渲染时标题被卡片吃掉半行。

### 门禁

- `node tools/test-v3.cjs` —— **578 通过 / 0 失败**（2026-10-31，Edge headless）。
  新增断言：DEV 卡片排成多列；监控室站位改到主控台北侧 `(79.35, 34.7)`；
  资源正则改成容忍带不带空格两种排版。

## [返航录V3 · 设施回归底图管线] — 2026-10-31

> 电闸与监控台不再由 Canvas 单独绘制，改为「Blender 模型 + SDXL 材质」烘进底图；
> 锚点对齐家具中心并新增监控操作台；电闸交互半径抽常量；新增分任务点遥测。

### 修复 · 设施「突兀、画风不协调」

- **根因是双重渲染**：`tools/blender-ship.py` 早就把 `breaker`（柜体 + 门板 + 拉杆 + LED +
  线管 + 地面警戒框）和监控室的 `screenwall / console / servercab` 建成了 2.5D 模型并烘进
  `base-lit.png`；上一轮又在 Canvas 上叠了一张 SDXL 精灵，画面上等于**两台设备**，且锚点与
  模型中心差 1.2 格。
- **修法**：新增两条 SDXL 材质 `assets/scene/v4/tex/facility-panel.png`（拉丝金属 + 铆钉 +
  琥珀氧化痕，供电闸柜体）与 `facility-screen.png`（网格 + 数据条，供监控屏 / 全息屏 /
  主控台斜面），在 `blender-ship.py` 里定义为 `FAC_PANEL` / `FAC_SCREEN` 并重烘
  **4704×4413** 底图；Canvas 侧删掉 `IMG['fx_breaker']` / `IMG['fx_monitor']` 的精灵绘制，
  只保留玩法状态层（断电冷光、供电状态灯、拉闸进度环、重闸电弧、监控在线/断线呼吸灯）。
- 两张设施精灵（`assets/scene/v4/facility/breaker.png`、`monitor.png`）保留为素材库，不再进运行时。

### 调整 · 设施锚点与交互半径

- 电闸锚点 `(49, 54.1)` → **`(50.2, 54.1)`**：对齐 `cover.breaker` 柜体中心。
- 监控台锚点 `(84, 29)` → **`(81, 28.8)`**：贴监控墙正前方（原来落在墙右端外侧）。
- 监控墙前新增一条 **decor 装饰操作台**（`console`，2.4×1.1 格）：decor 不参与碰撞，
  `geo.js` 不读，只由 Blender 建模——补上「玩家面对监控墙调画面」的视觉落点。
- 电闸交互半径抽出 **`BREAKER_USE_R = 2.0`**：柜体是 1.6×2.2 格的大件，锚点移到柜体中心后，
  原来的 1.6 格判定会让玩家贴着柜门都按不到（玩家轮盘 / AI 合闸 / AI 拉闸三处共用）。

### 新增 · 分任务点遥测（只统计，不改行为）

- `G.simStats.tasksByPoint` 按任务点 label 累计完成次数，`simGame` 原样带回，
  `tools/mc-report.md` 新增「分任务点完成次数（每局平均 · 由少到多）」一节。
- 目的：先用数据回答「电路维修是不是几乎没人做」，**本批不改任何 AI 行为**。

### 门禁

- `node tools/test-v3.cjs` —— **577 通过 / 0 失败**（2026-10-31，Edge headless）。
  断言随锚点更新：监控室站位改到 `(81, 30.4)`；电闸交互半径测试随 `BREAKER_USE_R` 走。

## [返航录V3] — 2026-10-31

> 医疗机器人施救范围 7 → 6 格并加密到 9 点巡逻；保安机器人削到 10.5 格 / 每夜 2 次；
> 医疗间 +12 格、四条走廊 +6 格（整船 98×82 → **98×94**）；
> 走廊默认有灯时按亮房规则整条可见；新增**对局事件流**与**回放/复盘**；
> 修复医疗机器人“救完第一个计时不清零、同一波濒死被连带救起”的 bug；
> 房间大件改为真实掩体并去掉装饰椅子；枪声/刀声分层重做；申请单领取提示与判定加强；
> AI 新增“反常拖尸”怀疑与避人群藏尸。
> 门禁 **563 条**，实跑 **563 通过 / 0 失败**（2026-10-31，Edge headless）。

### 修复

- **医疗机器人连带施救**：成功救起一人后 `G.medbotT` 没有清零，下一帧仍是 `>= 5`，
  同一波倒地伤员会被瞬间连锁救起（电量按 2 次算时表现为“一次 tick 救两人”）。
  现在每次结算后归零；门禁用 `b1.medLeft===1 → b2===0 → b3 不救` 三段节奏锁定。
- **AI 记忆收尸夹具**：医疗机器人可用时“拖去医疗间”优先级高于搜尸，旧夹具让 AI 一路拖着伤员
  永远不开始 `search`；测试改为先关掉救援选项，再验证 30 秒记忆绕回收尸。
- **AI 搜尸断言**：AI 拿到申请单/子弹后会立刻按规则花掉（换补给、开枪），
  旧断言只看终点背包会偶发红。改为逐帧记录“第一次拿到物资”，并用事件流里的
  `search` 事件（actor/victim/战利品）作为证据。

### 视野 · 走廊默认有灯

- 未断电时走廊按**亮区**处理：站在亮走廊里，同一条走廊上的所有点直接可见，不再要求手电朝向；
  `visibleAt` 用 `litZoneAt` 返回的 `'c:走廊下标'` 做同区判断，从亮舱望进相连走廊仍带 `losNow`。
- `drawFog` 站在亮走廊里整条揭开，并像亮房一样**不再叠手电锥**；断电（`G.corrLit=false`）后恢复原规则。
- 门禁新增：站在 c3 走廊能看到 12 格外的同廊目标；断电后同样位置变为不可见。

### 地图 · 医疗间与走廊加长

- **医疗间 +12 格**：矩形 / 多边形 / 标注 / 门位 / 掩体 / 装饰 / 任务点 / 管道口 / 机器人坞与巡逻线整体下移 12 格；
  医疗机器人巡逻从 4 点扩到 **9 点**，在 6 格施救半径下覆盖整座医疗间。
- **四条走廊加长 +6 格**：`c2` 桥楼↔食堂（7→13）、`c7` 食堂↔医疗（7→13）、
  `c6` 生态舱↔医疗（26→38，L 形）、`c11` 军械↔医疗（11→23，三折）。
- 整船边界 **98×82 → 98×94**；底图按新地图重烘为 **4704×4413**（`hull-deck.png` 2352×2256）。
- `tools/map-check.cjs` 的连通 BFS 改为整数格索引——浮点步进会因 `0.6*119=71.3999…` 漏掉整行，
  误报医疗间不可达；现在与 `SKGeo` 的网格完全一致。

### 机器人 · 数值

- **医疗机器人**：施救半径 **7 → 6 格**（`MEDBOT_R` 判定与绘制同源），每夜 **2 次电量**（最终值，不是早先的 1 次）。
- **保安机器人**：识别半径 **14 → 10.5 格**（削 1/4，180° 前方半圆不变），每夜擒拿 **3 → 2 次**（`SEC_USES_MAX`）。
- 两台机器人的 HUD、标签、提示与门禁断言同步读数。

### 事件流与回放（新功能）

- **`G.events`**：所有结算入口落一条事件——出刀 / 开枪 / 死亡（含凶器、凶手、舱室、时间点）、
  任务完成（任务名 / 舱室 / 分数 / 当前进度）、修好故障、破坏舱室、摧毁机器人、
  钻管道（起点→终点）、拉闸/合闸、拖起/放下尸体、搜尸（是否首次取证、取走什么）、
  领取/兑换物资、施救（医疗包/医疗机器人）、拘留、会议开始、报案、**每句会议发言**、每张票、驱逐结果、天亮与对局结束。
  时间轴用 `playT`（真实模拟秒）排序，另存 `night` 与夜里剩余秒，便于复盘显示“第几夜”。
- **`G.frames`**：每 0.5 秒采样 15 个席位的位置与状态（存活/濒死/拘留/拖拽），供复盘页回放；
  `simMode`（蒙特卡洛）不采样。
- **结束页**新增「复盘」「保存回放」；保存为 JSON（身份表 + 事件流 + 位置帧 + 结果），
  复盘页可拖时间轴、播放/暂停、按事件类型筛选、点事件高亮对应舱室。
- **开始页**新增「载入回放」，之前保存的 JSON 可随时重新打开复盘（`file://` 直接可用）。
- 新增 `js/ui/replay.js`（只读回放数据），加入 `index.html` 加载清单末尾；`_t` 增加
  `events() / frames() / replay() / litZone()` 调试接口。
- 门禁新增：出刀事件字段、拖尸成对、破坏/修复、任务事件、管道起终点、天亮失血的凶手归因、
  位置帧数量、回放包 roster/events/map 完整性、复盘页 15 个席位点与舱室高亮、结束页两个入口、
  以及开始页「载入回放」读回同一份 JSON。

### 修复 · 保安机器人拘留显示

- 保安机器人已削到每夜 **2 次**，但地图上的机器人标签仍写死 `拘留 0/3`，`_t.robots().sec.left` 也仍按
  `3 - uses` 计算。现在 `botLabelText()` 与调试读数统一读 **`SEC_USES_MAX`**，标签为「拘留 0/2 → 2/2」；
  门禁新增标签与 `.left` 同源断言。

### 申请单领取 · 提示与判定

- 玩家实测“3 分却领不了清单”的根因是**难发现领取点**，不是进度没记：任务积分到 3/5 会正常生成
  `qualPending`（门禁实测 1 高难 + 1 普通 = 3 分）。本轮把领取体验补齐：
  - 圆桌判定半径 **1.7 → 2.3 格**（站在桌边一点也能触发），保留 3 秒站桩；
  - `qualPending>0` 时 HUD 常驻「回圆桌领取」提示，小地图圆桌画金色脉冲；
  - 门禁新增真实节奏：AI 完成 3 分后自己走回圆桌、完成领取并写 `qual` 事件；
    玩家侧用 2.1 格外的站位验证新判定。

### AI · 反常拖尸与藏尸避人

- **反常拖尸**：`syncDragOf()` 检测到尸体被拖离医疗间中心 **>2.2 格**时，给 6 格内、有视线的人类目击者
  写 `saw_drag_away`（`EV_W` 0.45，按夜去重），会议台词会指出“拖着尸体往远离医疗间的方向走”；
  只加嫌疑、**绝不写 `known`**（拖尸本身人类也会做）。事件流同时记 `drag_away` 供复盘。
- **藏尸避人**：`hideRoomFor()` 排除医疗间/会议室/当前房间，按「远离医疗间 − 拖尸距离 − 人群风险」评分，
  只在**无活人**的候选舱室里随机取前三名（不再固定拖去仓库）；拖尸途中任何非队友活人 6.5 格内可视就松手，
  开始藏尸前也要求尸体旁没有非队友目击者。

### 场景 · 去杂与真实掩体

- 大件家具从 `decor` 迁入 `cover`：**51 → 59 件硬掩体**，`decor` 从 **72 → 22 件**，只保留地面喷涂、
  桌面餐具、床头小设备等扁平/贴墙/桌面级小物；删掉 16 把只是装饰、不阻挡的椅子，以及重复的
  弹药箱 / 维修台 / 终端 / 托盘 / 货架 / 街机 / 台球桌 / 点唱机等（避免“看似掩体、实际能穿过”）。
- 桥楼地毯压暗并把图案缩小（`floor-carpet` 1/3.4→1/5.6、tint 0.85→0.56），去掉大面积圆形花纹的抢眼感。
- 医疗间机器人坞装饰移除（与巡逻线重叠且不阻挡）；军械库武器柜因挡住管道口改回不放置。
- `tools/map-check.cjs`：`gaps=[] / dead=[] / unreachable=[]`，6 个管道口全部可站立；
  底图按新布局重烘 **4704×4413**。

### 音效 · 枪声与刀声分层

- `sfx-gun` 旧文件从枪声截取时保留了 **140ms 前导静音**，频段与刀声同落在 3~6kHz，听感几乎一样。
  现在从第一声枪响瞬态 **0.131s** 起，叠一层同源降速 + 低通的炮口闷响，低频（<500Hz）占比 **31%**、
  短窗 RMS **-11**（出刀 -13）；出刀保持 2k+ 破风 + 入肉，两个声音的时长/频段/包络都不同。
- 新增 `sfx-ui`（交互/领取）、`sfx-work`（维修火花）、`sfx-flesh`（命中）、`sfx-win` / `sfx-lose`（结算），
  并把门/金属/血肉/喊叫从 +0.7~+1.6 dBFS 削顶重新母带到 -3 dBFS 以下、脚步统一到 -20 RMS。
- `tools/master-sfx.py` 新增 `rate`（降速/降调）与 `lp`（低通）层属性；`sfx-audit.py --check` 15 条引用全部 PASS。
- 门禁把音效池从 7 类扩到 **12 类**，断言 gun 与 knife 使用不同采样、枪刀命中/交互/维修/胜负各有专属池。

### 平衡 · 最终复跑（1000 局）

- 机器人削弱 + 98×94 扩图 + 真实掩体重排 + 拖尸 AI 之后，重跑 **1000 局**（seed 20261030）：
  **人类 431 胜（300 维修 45 分 / 131 清剿）/ 异形 568 胜 / 1 超时 = 43.1% / 56.8%**
  （95% Wilson 40.1~46.2），**当前明显偏异形**。上一轮同口径是 **54.9% / 44.9%**；
  家具重排前的那次中间读数是 42.2%，重排后 43.1%，差异在噪声内——**翻转主因是机器人削弱与走廊加长**。
- 平均 6.23 夜 / 14.76 次会议 / **11.19 次出刀** / 7.82 破坏 / 2.19 开枪 / 2.01 驱逐；
  进度 38.9/45（中位数 41），人类存活 2.34/11、异形 1.23/4。
- **调回五五开**：优先把 `NIGHT` 120 → ~130 或 `WIN_PTS` 45 → 43~44（往人类偏）；
  往异形偏则回退 `MEDBOT_CHARGES`。**报告规则不动。**
- 原始局 `tools/mc-results.json`，汇总 `tools/mc-report.md`。

### 文档

- README / AGENTS 同步：地图 98×94、6 个管道口、拖尸 2.5 格/秒、医疗机器人 6 格 / 2 次 / 9 点巡逻、
  保安 10.5 格 / 2 次、异形近身 3.11 格、亮走廊整条可见、事件流与回放、
  **2026-10-31 最终复跑基线 43.1% / 56.8%** 与门禁 562 条。

## [返航录V3] — 2026-10-30

> 一次性大改版：地图扩到 98×82 并新增仓库、机器人全面削弱、拉闸与断电门禁改版、
> 任务点与时长重排、AI 报告机制重做、电闸与场景细节重做、底图与材质重烘；
> 同日追加：底图光照与舱室识别度重做、家具去复用、视野两次削弱、声纹不计幽灵、
> 系统不再替玩家发言、音效量化与出刀/报告音重做。
> 门禁 **531 条**，实跑 **531 通过 / 0 失败**（2026-10-30，Edge headless）。

### 地图 · 扩图 + 仓库 + 食堂

- **整船边界 98×60 → 98×82**：新增 **仓库**（`warehouse`，504 格）位于中央会议室**正上方**，
  用 **10 格中等长度通道**（`c12`，x=41）连接，**单门**，大型房间；不再把仓库硬塞进会议室。
- **仓库内部**：两组货架 + 周转箱 + 打包台 + 打包机 + 待出库 + 出库终端 + 叉车 + 扫描台，
  新增 **1 个管道口**（`59.5,5.5`）；**移除中央会议室角落管道**。管道口仍是 4 个：引擎 / 监控 / 军械 / 仓库。
- **中转间 → 食堂**（`transit`）：改名、换掉全部内置物品（配餐台 / 餐桌 ×2 / 餐具 / 电子锅 / 餐盘 /
  饮料机 / 取餐台），地板换成新生成的 `cafeteria-floor.png`，台面用 `cafeteria-top.png`；
  **封闭食堂 ↔ 娱乐室之间的通道**（走廊 `c8` 与两侧门洞一起删掉）。
- **舱室方正化**：监控室 / 食堂 / 医疗间 / 军械库从八边形改成矩形，消除「切角 + 家具」形成的 0.6 格死角
  （`coverAudit()` 仍要求 `gaps=[] / dead=[]`）。
- **任务点重排（26 个 = 8 高难 + 18 普通）**：
  高难 —— 监控室 / 仓库 / 医疗间 / 军械库 / 生态舱 / 引擎各 1，配电室 2；
  普通 —— 引擎 3、仓库 3、配电室 0，其余舱室（中央会议室除外）各 2。
- **任务时长统一**：高难 15 秒、**电路维修 18 秒**、普通 10 秒。
- **场景细节**：军械库加枪架 / 武器柜 / 弹药箱 / 武器维修台 / 装备终端 / 弹匣箱；
  娱乐室加街机 / 游戏桌 / 台球桌 / 点唱机 / 座椅；监控室加主控台 / 副控台 / 录像机柜 / 座椅；
  医疗间改成三张病床 + 呼吸机 + 监护仪 + 输液架 + 机器人坞；食堂加餐具 / 电子锅 / 餐盘 / 饮料机 / 取餐台；
  仓库加货架 / 托盘 / 叉车 / 待检货箱。这些走 `M.decor`（不参与碰撞，只烘进底图）。
- **机器人巡逻线重排**：医疗机器人坞从「机器人坞家具内部」挪到地面装饰位，巡逻改走病房左通道；
  保安机器人巡逻线避开新靶道，`free()` 逐步校验 0 处越界。

### 机器人削弱

- **医疗机器人：每夜 2 次 → 1 次，施救 3 秒 → 5 秒**；HUD、机器人标签、交互提示、进度环同步。
- **保安机器人**：看到危险行为后**不再瞬移锁角落**——先以 7.5 格/秒近身追捕、压制 0.9 秒，
  再花 1.2 秒押送到军械库角落；**拘留 60 秒 → 30 秒**。观察范围提示显化：
  地面直接画出真实 14 格 / 180° 扇形与「14 格 · 180°」标注，追捕时画红色连线与「追捕 / 压制」状态。
- **机器人被摧毁不再公告**、**拘押不再公告**：只留火花 / 警报特效与在场目击者的 `saw_detain` 嫌疑分
  （人类也会拘留，所以只加嫌疑、不写 `known`）。

### 拉闸 · 断电门禁 · 电闸交互

- **拉闸后过每一扇门都要等 2 秒**：范围从「非会议室门」扩大到**全船所有门**，
  会议室三门不再豁免；`doorBlockedSegment()` 与 `drawDoors()` 的红色扫描线同步。
- **电路维修完成后，拉断电闸 3 秒 → 6 秒**（恢复电力仍是 3 秒）：`breakerPullTime()` 是唯一真源，
  玩家交互轮盘、AI 拉闸、HUD 提示都读它。
- **电闸重做**：柜体 + 危险色压条 + 状态灯 + 铭牌（供电 / 断电）+ 大拉杆（角度随状态平滑过渡）+
  拉闸进度环（6 秒重闸时变成橙红并带电流抖动）；拉闸瞬间补一圈电弧与警报环。

### 移动与平衡

- **移动速度 5 → 4 格/秒**（玩家 / AI 人类 / AI 异形同速）；拖尸 3.0、玩家幽灵 6.5 不变。

### AI 报告机制

- **移除「AI 每晚只开一次会」**，改成 **每具尸体只报道一次**（`reported` 跨夜保留，`startNight()` 不再重置尸体标记）。
- **异形会故意报告拖时间**：`alienReportWorth()` 按人类进度算收益、按旁边非队友人数算暴露风险、
  按自己是否已被确证打折，再乘每夜固定的 `_stallBias`；每具尸体只判一次（`_reportMemo`），过 0.45 才拉铃。
- **人类按线索决定**：已确定凶手**一定报告**；否则要警觉度 ≥0.4 或高嫌疑目标才报，避免空耗夜晚。

### 美术 · Blender + SDXL

- `tools/blender-ship.py` 适配新地图（仓库 / 食堂地板、`counter / warehouse_rack / plate_stack / pot` 家具、
  `M.decor` 也参与烘焙），并修掉 Blender 4.x 合成器接口（`scene.node_tree` 与 `compositing_node_group` 双路兼容），
  新增 `--samples` 参数。
- `tools/gen-materials.py` 新增 4 张材质：`cafeteria-floor` / `warehouse-floor` / `cafeteria-top` / `warehouse-rack`，
  统一走「降饱和冷调 → 四向镜像拼贴 → 回缩 1024」，与既有地板 / 墙面同色温。
  其中两张地板（`cafeteria-floor` / `warehouse-floor`）是本地 SDXL 出图；
  `cafeteria-top` / `warehouse-rack` 这两张家具小贴图在本轮跑 SDXL 时超时（8GB 显存 + 768px 去噪排队太久），
  **按 AGENTS 记录的兜底流程改用 `--mode reuse` 从 `table-composite` / `panel-metal` 派生**，
  色温与颗粒度仍与全场一致；后续有算力时可直接 `python tools/gen-materials.py --mode sdxl --only cafeteria-top warehouse-rack`
  覆盖同名文件再重烘一次底图，不需要改代码。
- `tools/gen-hull.py`：新增船体底板 `hull-deck.png` 的程序化生成（98×82 → 2352×1968），
  分块装甲 + 接缝 + 散热格栅 + 管线 + 警戒斜纹 + 暗角，替换原来那张按旧比例拉伸的底板。
- `assets/scene/v4/base-lit.png`（4704×3850）/ `hull-deck.png`（2352×1968）按新地图重烘。

### 美术 · 舱室识别度、去复用与底图光照

- **修「会议室 / 仓库边缘发黑」**（根因在烘焙，不在游戏叠层）：`tools/blender-ship.py` 原来
  每间房只有一盏面积灯，灯幅 `max(6, min(rw,rh)*1.3)` —— 仓库 42×12 的灯只覆盖 x∈33..49，
  会议室八边形的两个尖角整个在灯外。改成**高空泛光盘 + 9 格网格布灯**（只在房间 poly 内放灯），
  并扫值标定总能量增益 `--lum 1.6`。4704×3850 终烘实测（改动前 → 改动后）：
  **全船暗面占比 16.0% → 5.6%**，边缘均值 55.4 → 65.8，P05 22.6 → 33.6；
  **仓库边缘 34.8 → 59.1（P05 1.1 → 30.5，暗面 43.1% → 4.7%）**、
  **中央会议室边缘 48.2 → 67.1（P05 4.1 → 35.8，暗面 23.2% → 2.3%）**、
  军械库边缘 56.0 → 78.7（暗面 31.6% → 7.4%）。
  暗舱（引擎 / 配电）的 `--dark` 从 0.88 提到 1.15：0.88 会让两间暗面占比涨到 38%/34%，
  违背「暗舱吊顶灯要保证掩体在手电锥里读得出轮廓」的既有约定。
- **舱室主题表 `ROOM_THEME`**：墙面色调 / 墙顶自发光 / 挂灯色 / 地面喷涂色按房间各一套
  （原来全船共用一面墙 `WALL`，10 间房只有 8 张地板且监控室=娱乐室、配电室=引擎两两共用）。
  12° 俯角下墙面只剩顶面一条框，所以身份主要靠**墙顶边框色 + 地面标识 + 家具顶面剪影**；
  监控室 / 娱乐室 / 配电室 / 引擎各换专属地板（`floor-monitor` / `floor-lounge` 由本地 SDXL 出图，
  `floor-power` / `floor-engine` 本轮因 8GB 显存出图过慢改用 `--mode reuse` 兜底，
  有算力时 `python tools/gen-materials.py --mode sdxl --only floor-power floor-engine cafeteria-top warehouse-rack`
  覆盖同名文件再重烘即可，不需要改代码）。
- **实例变体去复用**：84 件家具原本只由 18 个 kind 生成，`machine`(16)+`console`(15) 占 37%，
  且同 kind 同尺寸就是完全克隆体（货架 ×4、培养罐 ×4、立柱 ×4、病床 ×3、`table 3.0×2.0` ×5 ——
  手术台与餐桌、点唱机与呼吸机、叉车与机器人坞是同一个形状）。
  现在按 `room|label|kind` 的 FNV-1a 哈希派生 5 档色调 / 5 种指示灯配色 / 高度 ±10% /
  子部件开关 / decor 微旋转。**只改 z 与颜色不改 w/h**，碰撞与 `coverAudit` 零变化。
- **拆出 18 个专用 kind**：`reactor / engineblock / screenwall / servercab / switchgear / transformer /
  shelftall / pallet / medbed / ventilator / ivstand / servicecounter / forklift / jukebox / billiard /
  holoscreen / gunrack`（只改 `kind` 不改占地），同步 `js/game.js` 的 `FURN` 兜底表。
- **分舱签名装饰 39 件**（`M.decor` 33 → 72）：中央会议室圆桌补上 **7+1 把环形座椅**（原来一把椅子都没有）、
  仓库主通道线与托盘堆、引擎检修区、配电高压警示区、监控室操作区、娱乐室霓虹地贴与抓娃娃机、
  医疗间急救通道、军械库靶道安全线、生态舱浇灌区、食堂排队线。
  `js/engine/geo.js` 的可行走网格与 `los()` **不读 `M.decor`**，所以这批是纯表现层、零碰撞风险；
  新增件全部过「落在本舱 poly 内缩 0.3 格 + 不与 cover/已有 decor 重叠」两道校验。
- **地面喷涂收敛**：`floor_mark` 的自发光从 0.85 降到 0.16，并按标签关键词分四种图案
  （通道/线 → 双车道虚线、警示 → 斜纹警戒带、霓虹/浇灌 → 十字、其余 → 空心区域框）。
  第一版烘出来仓库主通道是一块抢戏的荧光白带，整间房被它带走。

### 玩法与表现 · 本批修复

- **维修进度上限统一为 45**：`js/ui/templates.js` 的 HUD 写死「维修 0 / 40」，而 `checkWin` 与
  进度条都按 45 结算。新增 `WIN_PTS = 45` 单一真源（`checkWin` / 结算文案 / `#pgmax` / 进度条共用），
  并补同源断言。
- **视野削弱**：`ALIEN_INNATE_MUL` 4/3 → **10/9**（异形近身 5.6 → 4.67 那一档），
  `HUMAN_DARK_R` 4.2 → **2.8**（削 1/3），最终异形近身 **3.11 格**。门禁改用 2 / 3 / 4 格实测点。
- **亮房不再显示自身视野提示**：人站在亮舱里时 `drawFog` 只整间开孔，不再叠手电锥与近身圈
  ——那只锥会在门口拖出一块跟着鼠标转的亮楔形。`visibleAt` 判定不变（表现收敛、玩法不收敛）。
- **声纹不再计入幽灵脚步**（用户报的「幽灵的脚算进去了」）：`stepMove()` 里的 `SND.step` 与
  `hear(...,'step')` 没有 `alive` 过滤，而 `aiGhost()` 走的正是 `stepMove(a,dt,6.5/2.4)`，
  实测一只幽灵 20 秒飘 45 格、一路留下"有人在走"的假声纹。现已包进 `if(a.alive)`；
  配电室修好电路的 `hear(...,'power')` 保留（全船事件，谁修都该响）。
  门禁加**对照组**断言：活人走 60 格必须仍留下脚步声纹，防止有人把整条链路关掉来"修 bug"。
- **医疗机器人施救范围显化**：抽出 `MEDBOT_R = 7` 供判定与绘制共用，
  `drawFacilities` 画出「7 格圆 ∩ 医疗间轮廓」的虚线圈与文案（两条条件同时成立才自动施救）。
- **同一具尸体同一夜只能报告一次**：`reported` 改为 `reportNight` + `bodyReported()` /
  `markBodyReported()`，写入点全部收口。查明真实机制更强 —— `openMeeting` 在会议开始瞬间就把
  所有尸体 `bodyGone`，所以一具尸体物理上不可能被报第二次；旧实现的隐患是
  「某具尸体所在夜没人拉铃，标记就永久锁死」，现在按夜解锁。门禁两条都测。
- **系统不再替玩家发言（AI 星尘串台）**：玩家自己拉铃时 `startChatter` 会硬写一句
  「我在X发现Y…」挂到 `G.me.name`（默认「01 星尘」）名下，聊天栏里就像有个 AI 在冒用玩家身份。
  改成 `sysSay('星尘 在X发现了Y，刀伤，人已经没了。')`。顺带修掉一个死分支：
  那句硬编码绕过了 `openingLine()`，导致「先别急着乱投，先救人」那一档永远说不出口。
- **确证过就不再辩护**：`startChatter` 的队友辩护与 `planAlienDeception` 的帮腔
  都加了守卫 —— 说话者若持有对目标的确证（`mind.known[i]`），不得再生成「他不是异形/别投他」。
- **出刀音效重做（公共素材）**：实测 `tools/_sfx/rpg/` 里三条 `blade_*` 全在 **+1.8 ~ +2.6 dBFS
  削顶**、且 97~99% 能量在 2kHz 以上（只有"嘶"没有"切"），单换一条同源采样解决不了。
  新增 `tools/master-sfx.py`：用同一个 CC0 包的破风层 + 入肉层分层混音，软限幅后归一到
  短窗 -13 dBFS / 峰值 -3 dBFS，两条变体响度差 0.2dB、起始静音 5-6ms。素材仍是公共领域采样。
- **发现并修复静音素材**：`sfx-notify.ogg`（**拉铃报告音**）实测是**纯数字静音**，
  而 `SND.report` 的兜底 `beep()` 只在"文件加载失败"时触发 —— 静音文件解码成功，所以报告一直没声音。
  用 `rpg/item_gem_01 + item_gem_02` 混出双铃补上（峰值 -3.0 dBFS、起始 2ms）。
  另有 click / win / vote / tick / submit / lose 6 条同样是静音，但游戏内未引用，暂留档。

### 音频量化工具

- 新增 `tools/sfx-audit.py`：把 `audio/` 每条音效测成可比数字
  （时长 / 峰值 dBFS / 30ms 短窗 RMS / 均方根 / 动态 crest / **起始静音 ms** / 体积），
  产出 `tools/sfx-report.md`；`--check` 只校验游戏内 `SND.FILE` 引用到的 10 条，
  静音 / 削顶 / 起始静音过长则退出码 1；`--normalize` 可就地按目标响度改写（带削顶保护）。
- 首次量化即抓出：`sfx-gun` 起始静音 **140ms**（开枪慢半拍）、5 条削顶风险、7 条纯静音。
- `audio/CREDITS.md` 更新出刀与报告音的来源与实测依据。

### 主页 UI · 船体即主视觉

- 新增 `js/ui/home.js`：主页不再是居中一张卡片，而是**用 `SKMapData` 现场生成整船 SVG**
  （10 舱室 / 走廊 / 51 掩体 / 26 任务点 / 6 管道口全部取自对局同一份地图数据），
  叠跟随指针的手电遮罩与缓慢漂移，一眼看出"这是你要上的那条船"。
- **身份锚亮**：选中人类亮 9 个任务舱、异形亮 6 个管道口、旁观亮中央会议室，
  其余舱室压暗到 34%；配套说明浮层写清该身份的目标与关键数值（视野半径、任务时长、45 分）。
- **先选后进**：点身份卡只切换选中态并锚亮舱室，真正的开局走「进入舱段」（或双击卡片）；
  旧页面没有 `#home-go` 时退化为"点一下就开局"。保留 `#pick` / `#btn-settings` / `[data-version]`
  三个既有契约（门禁与设置面板依赖）。
- 统计数字条由地图实时计算（舱室 / 硬掩体 / 任务点 / 高难 / 管道口 / 45 分），不再手写。
- SVG 用 `viewBox` + `preserveAspectRatio` 等比内缩，任何窗口比例都不裁切；
  房名沿用游戏内 `label + 1.2` 的偏移，避免压在房间顶边上。
- 加载清单加 `js/ui/home.js`（在 `js/main.js` 之后），README 的「项目结构」与分层约定同步。
  仍守 file:// 零依赖：无 `fetch`、无 ES Module、无构建。
- 两个工具里"点旧类名开局"的选择器同步改成新流程（`tools/test-v3.cjs` 点 `#home-go`、
  `tools/monte-carlo.cjs` 先点 `[data-role="spect"]` 再点 `#home-go`），
  门禁另加两条主页断言（整船 SVG 生成 / 默认说明浮层），避免主页改动无人看守。

### 玩法调整 · 拖速 / 医疗电量 / 管道

- **拖拽尸体统一 2.5 格/秒**（`DRAG_SPEED` 3.0 → 2.5，玩家与 AI 共用 `moveSpeed(a)`），
  门禁补一条同源断言锁住这个数。
- **医疗机器人每夜电量 1 → 2**：抽出 `MEDBOT_CHARGES = 2` 单一真源，所有「电量 X/1」「在线 · 电量 1/1」
  文案、HUD 标签与 `_t` 读数都读它。门禁改为「连救 2 人后电量 0、第三名濒死者不再施救」。
- **食堂与医疗间各新增 1 个管道口**（共 4 → 6）：食堂在右下角（62.6, 58.0）、医疗间在左下角（47.6, 77.0），
  都校验过「在房间内 / 离墙 ≥1 格 / 不压掩体 / 离任务点 ≥1.2 格」。异形地道列表随之从 3 项变 5 项，
  快捷键提示自动变成 1–5。
- **管道配色跟随所在舱室**：形状语言保持不变（菱形格栅 + 三道格栅线 + 呼吸环），
  描边/光环/格栅改用 `PIPE_TINT[room]`，与 Blender 侧 `ROOM_THEME[].mark` 同色——
  食堂口暖金、医疗口冷青、引擎口橙红，看起来长在房间里而不是贴上去的。
- 门禁同步：管道口 6 个且全部可站立、地道列表 5 个目的地、「不可能口供」的反例舱室
  从医疗间改成配电室（医疗间现在真的有管道了）、会议模板的"无管道舱室"同样改用配电室。

### 平衡 · 视野削弱后的蒙特卡洛复跑

- 视野两次削弱会直接改变 AI 的"看得见→指得出→投得掉"链路，旧基线失效，重跑 1000 局（seed 20261030）：
  **人类 456 胜（349 维修 45 分 / 107 清剿）/ 异形 544 胜 / 0 超时 = 45.6% / 54.4%**，
  比削弱前的 48.7% / 51.2% 往异形偏约 3 个点，仍在五五开量级（95% Wilson 区间 42.5~48.7%）。
- 偏移主因是**人类自己那刀削得更狠**：近身圆 4.2 → 2.8 是 −33%，而异形 5.6 → 3.11 相对优势反而从
  +33% 缩到 +11%，但人类丢的是"看清并指认"的能力。平均 5.69 夜 / 13.13 次会议 / 10.19 次出刀 /
  7.31 次破坏 / 进度 40.2/45，与旧基线同量级，说明结构没变、只是整体往异形挪了一点。
- **随后医疗机器人电量 1 → 2 + 管道口 4 → 6 之后又复跑一次**：**人类 549 胜 / 异形 449 胜 / 2 超时
  = 54.9% / 44.9%**（Wilson 51.8~58.0），**已经明显偏人类**。主因是电量翻倍——
  每夜多救 1 个濒死等于每局少掉约 1 把刀，而胜负几乎完全由刀数决定（出刀从 10.19 掉到 9.96）。
  管道口变 6 个后异形钻管道从 3.50 次涨到 **5.70 次**，但补不回少掉的那把刀。
- 若要往异形偏调回五五开：**优先把 `MEDBOT_CHARGES` 调回 1，或降 `NIGHT`**；
  往人类偏就加 `NIGHT` 或降 45 分。报告规则是承重墙，不要动。

### 门禁与工具

- `tools/test-v3.cjs` 同步新地图坐标（整体 +22）、30 秒拘留、4 格/秒、1 次医疗电量、9 个可破坏舱室、
  10 路监控、全门扫描、每具尸体一次报告等断言；新增 `tools/_map-check.cjs` 离线地图体检
  （可行走网格 / 掩体审计 / 巡逻线 / 任务点可达性），不启动浏览器也能查地图。
- 本批新增断言：HUD 上限与 `WIN_PTS` 同源、视野 2/3/4 格实测点、尸体复报与报告即清场、
  医疗机器人半径判定=绘制同源、声纹不计幽灵（带活人对照组）、玩家不被代发言、不变量失败项打印 `code:msg`。
- 两条**原有**断言是拿墙钟等模拟倒计时（旁观者 0.43 秒移动、拘留倒计时 320ms），后台一忙就红；
  已给足余量并在代码里注明原因（测的是行为，不是这台机器的帧预算）。
- **修掉一个长期偶发红的测试缺陷**：`异形假装做任务` 那条用例为了把假任务点挪到附近，
  直接改写 `k.tasks[k.tIdx] = pts.indexOf(spot.p)`。`indexOf` 给的是候选数组位置、
  不是 `M.points` 编号，于是有概率撞上该 AI 已有的任务点，触发不变量 **A6「任务点重复」**。
  表现为「跑五六次红一次、且每次红的断言还不一样」，容易被误判成对局 bug。
  现在候选点显式携带原始 `idx` 并从该 AI 已派发的点位中排除，连跑三轮 528 / 0。
- 不变量断言的失败信息改为打印 `code:msg`（原来只输出 `[object Object]`，红了也看不出是哪条）。
- 门禁 **531 条**，实跑 **531 通过 / 0 失败**（2026-10-30，Edge headless；本批从 514 增至 531）。

## [返航录V2 · 玩法补丁] — 2026-10-30

### 平衡 · 45 分 / 30 秒破坏；异形任务抑制与假任务

- **人类维修胜利 40 → 45 分**；破坏故障窗口 **60 → 30 秒**，30 秒内未修完仍扣 **维修进度 -5**。
  HUD、开始页、破坏面板、播报与门禁同步。
- **异形优先攻击正在做任务的人**：目标评分里 `h.doing>0` 减 12 格，站桩做任务/维修的人会优先被挑中。
- **压制异形做任务**：真做任务现在每只异形**整局最多 1 次**，且只在没刀没弹、缺申请单、
  人类进度低于 38 分时小概率发生；不再整局帮人类推进度。
- **新增假装做任务**：有人看着时去任务点 `_doing='fake'` 站 4–8 秒，动画像维修，但不加任何进度；
  假装维修仍只在故障旁有人看时发生。
- **藏尸远离医疗间**：`hideRoomFor()` 按“距医疗间 - 0.55×拖尸距离”评分，永远排除医疗间/会议室。
- **收尸节奏**：`observeBody()` 记下 30 秒内见过的倒地伤员，`lootRun()` 离开视野后也会专门绕回去搜；
  **没有修改天亮清尸流程**，收尸靠 AI 的记忆和绕路，不靠延长尸体存在时间。
- **新一轮 1000 局**（seed 20261030）：人类 935 胜 / 异形 65 胜 / 0 超时；884 维修 45 分、51 清剿、65 人类全灭。
  平均 3.38 夜、7.87 刀、1.73 枪；异形真做任务 1.19 次、假装做任务 2.99 次、钻管道 6.54 次，双方取物资 3.32 次/局。
- 门禁 **511 条**，实跑 **511 通过 / 0 失败**（2026-10-30，Edge headless）。

### 修复 · 管道口供与异形管道机动

- **管道口供只能落在 4 个有管道口的舱室**（引擎室 / 监控室 / 军械库 / 中央会议室）。
  异形会议反咬“钻管道”时，如果被构陷者自述的位置没有管道口，会自动换到真实管道房；
  玩家模板选中无管道舱室时省略地点；玩家硬说“在医疗间钻管道”会被 AI 当作物理上不可能的
  口供（`impossible_claim`），反过来怀疑发言者，而不是记成目标的证据。
- **修复 AI 异形从不钻管道**：旧顺序把“没刀 → 随机游荡”放在管道判断之前，刀用完后永远走不到
  管道口；现在按「补给/伪装 → 管道机动 → 没刀游荡」执行，`alienPipeMove()` 统一处理寻口、
  直接钻口、20 秒冷却与每夜 2 次上限。门禁新增“刀用完的异形也会钻管道”回归断言。
  蒙特卡洛中异形管道使用从 **0 次/局** 提升到 **2.26 次/局**。
- **收尸补强**：搜尸会继承死者/倒地伤员未领取的申请单（`lootBody` 同时结算 `qualPending`）；
  异形会搜自己刀倒、还活着的伤员（旧逻辑只认已死亡尸体，而尸体在天亮会议时立即清场，
  导致异形整局搜不到物资）；藏尸前会先摸走自己缺的物资，回到自己做的尸体旁也会先收尸再报告。
- （历史）**45 分/30 秒平衡前的上一轮基线**：人类 1000 胜 / 异形 0 / 超时 0，平均 2.11 夜；
  已被本轮 935 / 65 的新基线取代。收尸机制见上面的“记忆收尸 / 搜倒地伤员”说明。

### 新增 · AI 异形避目击与直接报案

- **出手前先看周围有没有人**：`watchersAt()` 按 6 格取证半径检查除受害者外的活人
  （不按阵营过滤，AI 仍不读取队友身份）。贴脸时若还有旁观者，82%（1 人）/ 95%（2 人以上）
  先退到 4–6.5 格外等 2–4.5 秒，并把该目标晾 8 秒；挑目标时给“有人看着”的对象加 12 格风险距离，
  优先找独处的人。偶尔也会冒险出手，避免人多的亮舱里完全不敢动刀。
- **偶尔直接报案**：杀完人决定报案后，35%（未被目击）/ 20%（被目击）概率不绕场做不在场，
  原地停顿 0.8–2 秒直接拉铃（`_reportPlan.direct`）；其余情况仍是离开 5–12 秒再回现场。

### 新增 · 异形会议反咬与构陷

- 被确证的 AI 异形会先反驳，再按概率反咬某人“钻管道 / 身上带红光”；
  没有被确证时也有小概率主动搅浑水。假话只生成 `heard_frame` 传闻嫌疑（0.14），
  **绝不写 `mind.known`**，真目击者的指控与投票仍由 `bestKnownTarget()` 锁定真凶。
- 听众若用 `saw_agent` 记忆发现说谎者假口供与自己的时间线冲突，会写 `contradiction_lie`
  反过来怀疑说谎者；被构陷者会当场反问。构陷不是无风险。

### 新增 · 会议模板与玩家词库

- 发言框上方新增 8 个默认模板：`怀疑 / 投他 / 作证 / 看见钻管道 / 看见红光 / 看见出刀 / 我在… / 不是我`；
  先选对象和舱室，再点模板，句子会直接以玩家身份发出，保证被 `parseSpeech()` 识别。
- 词库扩展：支持 `3号 / 三号 / 第3号`、更多舱室别名、否认 / 支持 / 直接证据；修正
  “我看见X在配电室”被误判成玩家在配电室的问题。玩家说“我看见X钻管道/出刀/带红光”会进入
  `heard_claim` 传闻链（不写 `known`）；与听众 `saw_agent` 时间线冲突时写 `contradiction_claim` 到玩家。
- 门禁：8 个模板解析、模板点击进入证据链、玩家构陷被时间线拆谎，共 12 条断言。

### 修复 · 亮房整间可见

- 玩家站在亮着的舱室里时，**整间房的人都直接可见**：家具 / 掩体不再挡住“看人”的判定，
  与迷雾已经整屋揭开的视觉效果一致；暗房或熄灯房间才退回 7 格手电锥 + 近身视野。

### 变更 · 断电门禁改为逐门 2 秒扫描

- 断电期间，每扇**非会议室门**在有人靠近时先扫描 2 秒才放行（红色扫描线）；
  人离开后重新上锁，再次过门要重新等 2 秒；恢复供电立即解除。会议室（bridge）三扇门永远豁免。
  （早先的“一次性全船 2 秒锁”已废弃。）

### 新增 · 旁观者跳过讨论

- 旁观者会议仍然只读，但保留**「跳过讨论（旁观）」**按钮：只快进讨论，不能发言、投票或做局内动作。

### 修复 · 旁观者 0 号星尘接入独立 AI

- 旁观模式下 0 号星尘不再被当成“玩家席位”：进入 AI 发言池、独立投票，DEV 名单标「AI」而不是「你」；
  玩家专属的击杀 / 拖拽 / 维修 / 被擒提示不再套到它身上。新增 2 条门禁（实际发言 + 独立投票）。

### 平衡 · AI 行为第二批（任务节奏 / 队友 / 故障）

- **AI 人类不再休息**：完成任务后 `_rest=0`，直接接下一个任务；故障/拉闸优先直接修——
  断电先派 1 名合闸，故障由最近 2 名 AI 抢修，锁定目标后不被脚步声/任务点打断，不再来回踱步。
- **AI 弃修逃跑**：修任务时若已确证的异形在视野内快速逼近、算下来修不完，立刻弃修转身逃跑。
- **异形避目击改版**：贴脸只统计非队友——1 个非队友时 55% 冒险出刀；2 个以上直接放弃目标、晾 12 秒转找落单者；
  队友围观不算风险。删除了 `_ambushT` 原地等待/踱步。
- **异形队友识别（目击推断）**：看到钻管道、红光、断电拉闸、破坏设备/停摆机器人 → 记成队友；
  此后不出刀、不投票，会议里公开辩护；主动构陷时队友帮腔共同诬陷。未识别的同类仍可能被攻击/投票；
  没有系统队友表，`mates` 只由 `markMate()` 的目击写入并跨夜保留。
- **破坏超时扣分 -3 → -5**：故障 60 秒内未修完且仍在天黑，维修进度扣 5 分。
- **AI 幽灵做任务**：优先修故障，其次做剩余任务（6.5 格/秒）；玩家与 AI 幽灵都严格最多 **2 分**，
  `ghostTaskAllowed()` + `finishDoing()` 双重上限。

### 修复 · A* 地图外目标死循环

- 蒙特卡洛在 seed 20261044 发现：`nearestFree` 会把地图外坐标原样返回，`astar` 得到负索引，
  `prev[负数] === undefined`，重建路径时死循环。现在 `astar` 先校验起点/终点在网格内且可走，
  重建路径再加步数保护；`fleeTask()` 的逃跑落点也夹在地图边界内。
- 门禁新增“船体外/地图外目标不可达且安全返回 null”的回归断言。

### 新增 · 蒙特卡洛基线（1000 局）

- 新增 `tools/monte-carlo.cjs` 与 `npm run sim`：真实 update/AI/会议逻辑，模拟时钟 + 即时会议，
  每局 seed 可复现；夜会议按 30 秒扣夜，跳过渲染/HUD/音效/自动不变量。
- **1000 局 AI 对 AI 结果：人类 1000 胜（997 维修 40 分 / 3 清剿全部异形），异形 0 胜，0 超时**；
  平均 2.67 夜 / 3.90 次会议 / 6.92 次出刀 / 5.36 次破坏；结束人类存活 8.07/11、异形存活 2.61/4、仅 1.03 人濒死。
  原始结果 `tools/mc-results.json`，汇总 `tools/mc-report.md`。
- 初步解读：刀伤被医疗机器人/医疗包/拖尸救援和天亮结算吸收，40 分任务在 2–3 夜内完成；
  当前 AI 对 AI 基线明显偏人类，属于平衡问题而非单个 bug。后续若要 50/50，需要调任务分/夜长/击杀效率，
  不能靠继续加 AI 规则解决。

### 变更 · 规则不再按阵营封锁 + 推理链 + 外观

- **双方都会用规则**：AI 人类与 AI 异形都会主动翻尸取物资（`lootRun`），人类有申请单优先备弹；
  异形也会回圆桌领申请单、去军械补给点换子弹、有子弹时远程开枪、没刀没弹时偶尔真做一次任务换弹；
  异形还会在故障/任务点 `_doing='fake'` 假装维修（不修好、不加进度）制造不在场，手里有医疗包会救已认出的队友。
  阵营差异保留：异形日常以杀人和破坏为主，做任务/维修只为弹药或伪装。
- **推理链扩展**：反向洗清（案发时间附近在别舱的 `saw_agent` 降低普通嫌疑，不动 `known`）；
  枪击正当性（目击者已确证被害者是异形时，不怀疑开枪者）；空口指控损耗发言者可信度；
  替已被确证异形辩护会引来同伙嫌疑。新增 `susCut/alibi/justified/empty_accuse/defended_suspect`。
- **幽灵边界**：异形幽灵不执行任何维修/任务（`aiGhost` 待机、`startTask/startFix` 拒绝）；
  人类幽灵仍可做任务/故障，玩家与 AI 都严格最多 2 分。
- **外观一致**：空闲异形不再给自己亮刀；正常对局中异形与人类同一贴图/名字/状态，
  只有真实出刀/开枪动作才亮刀/枪。DEV/旁观红色身份标签只属于全知模式。
- **设计参考**：Among Us 的 self-report / fake task / meeting evidence 设计
  （Among Us Wiki Guide:Impostor / Guide:Report；Golechha & Garriga-Alonso, arXiv:2504.04072）。
- 门禁新增 13 条断言（双方搜尸取物资、异形假装维修、补给/开枪、队友医疗包救援、
  反向洗清、枪击正当性、空口指控、异形幽灵不推进进度），实跑 **494 通过 / 0 失败**。

### 工程

- 门禁扩充到 **494 条**，实跑 **494 通过 / 0 失败**（2026-10-30，Edge headless）。
  新增覆盖：AI 无休息连续维修、故障/合闸优先、弃修逃跑、异形队友识别/保护/联合构陷、
  AI 幽灵 2 分额度、-5 扣分、地图外 A* 安全返回、蒙特卡洛 1000 局基线。
  视觉动画未做像素级断言，建议人工过一眼红色扫描线、模板栏与新会议布局。

## [返航录V2] — 2026-10-29

> **这是本轮的「全量更新」版本。下一阶段做移动端适配**：触屏摇杆 / 手势交互 / 安全区布局 /
> 移动端性能档位，会在 V3 落地。

### 新增 · 搜尸取物资（玩家与 AI）

- **搜尸 = 取证 + 取走物资**：尸体保留生前没花掉的 `bullet / medkit / qual`；
  按 `S`（或 `X`）花 1.2 秒既拿到伤口 / 时间 / 是否被拖动，也把能带走的物资收进背包。
  背包满了就留在尸体上，下一个人还能来搜；取空后再搜会被直接拒绝，不再空耗 1.2 秒。
- **AI 也会搜尸**：人类 AI 继续以取证为主，任何 AI 看到尸体上有自己缺的物资（子弹 / 医疗包 / 申请单）
  都会停下来搜一次；濒死（还活着）的伤者不摸物资，只做伤情检查。同一具尸体不会被两个人同时搜。
- 尸检卡新增「携带物资」行；搜尸播报列出取得的物资。

### 新增 · 操作收口（WASD 主键 + 尸体交互轮盘）

- 移动仍然是**点击地面**，`WASD` 改为**主操作键**：`W` 交互 / `A` 出刀 / `S` 搜尸 / `D` 收尸；
  `E/Q/X/G` 全部保留为别名，老玩家不用改习惯。
- **尸体操作全部收进 `W/E` 轮盘**：查验、搜尸取物资、查看记录、收尸（扛起/放下）、报告、施救
  都可以在一个轮盘里选，不再靠记 `R/X/G/F` 四个散键。
- 收尸（原拖拽）在 HUD 与提示里统一改叫「收尸」，移动降到 3.0 格/秒，再按一次放下。

### 新增 · 旁观者模式（第 16 人）

- 开始页第三张卡「旁观者」：**不占 15 个席位**（仍是 11 人类 + 4 异形），0 号席位交给 AI 托管。
- 全知视角：无战争迷雾、常显全员身份与状态；一台 **9 格/秒、穿墙**的幽灵相机，点击地面直线飞行。
- 不可参与：交互、搜尸、收尸、报告、开枪、出刀、投票、跳会全部禁用；会议对旁观者只读。
- 相机跟随 / 全图、视野切换、暂停与设置仍然可用。

### 新增 · 设置面板（音乐 / 音效 / 暂停 / 退出）

- 开始页「设置」按钮与暂停面板「设置」按钮打开同一个面板：音乐音量、音效音量、暂停 / 继续、退出到开始页。
- 音量写入 `localStorage('sk.settings.v1')`；音乐接 `audio/music-bgm.m4a`（首次点击页面后播放），
  音效走 `SKV3.setSfxVolume()`，合成音与采样音一起受控。
- 设置面板层级高于游戏根节点（`z-index 10010`），打开时吞掉对局按键，`ESC` 先关面板。

### 变更 · 门改成 2.5D 顶面视角

- 自动门只画「门的最上面一层」：一块抬到墙顶高度的薄板 + 两块滑开的门板 + 状态灯，
  横门 / 竖门只旋转 90°，从上下两侧看完全一致，不再露出立式门板的正立面。
- Blender 端去掉门楣与高处灯带、门框降到墙高，底图已重新烘焙（4704×2817）。

### 平衡 · 异形视野与确证长期记忆

- **异形改用与人类同款的手电筒**（视野二次调整）：取消 10.5 格全向圆，改为同样的
  7 格 / 60° 锥形；只有**自带近身视野 ×4/3**（人类 4.2 格 → 异形 5.6 格）保留优势。
  人类玩家也补齐 4.2 格环形近身视野；AI 异形的远景上限与人类统一为 8 格，不再 ×1.5。
- **确证（known）变为长期记忆**：亲眼看见钻管道 / 出刀 / 破坏设备 / 停摆机器人 / 刀者红身之后，
  这个人会被永久标记；普通记忆与嫌疑分仍按夜清空，但确证跨夜保留——
  之后每一场会议的指控与投票都会继续锁定他。
- **异形会杀完人再回现场报告**：有时先离开 5–12 秒（去 6–24 格外的房间做不在场），再回到尸体旁拉铃，
  用会议拖人类时间；代价是**死亡 10 秒内就报案**会被见过尸体的人记成 `quick_report` 嫌疑。

### 修复 · 故障协作

- 一座故障被队友修好后，**所有正在修 / 正赶往同一故障的 AI 立即松手**（清 `_doing='fix'`、`_fixGo`、`path`），
  不再把剩下的 10 秒站在已经修好的设备旁，也不会继续往旧设备跑。

### 工程

- 版本升到 **返航录V2**（`package.json` 2.0.0，`js/config/version.js` 单一真源）。
- 门禁新增 51 条断言（搜尸取物资 / AI 搜尸 / 确证长期记忆 / 回场报告与快速报告 / 故障松手 /
  视野统一（同款手电锥 + 近身 ×4/3）/ 旁观者 / 设置 / 输入键位），实跑 **436 通过 / 0 失败**。
- 已知限制：本会话无法用眼睛验收渲染效果，5 张 SDXL 材质与门顶面视角需要人工过一眼。

## [返航录V1] — 2026-10-29

### 新增 · AI 确证 / 发言槽位 / 开局讨论时长

- **确证（known）与嫌疑（sus）分离**：亲眼看见**异形专属行为**——钻管道、出刀、破坏设备、停摆机器人——
  或看见某人身上带着刚出刀的 **3 秒红光**（`trackNight` 里的 `saw_red`），AI 会写入 `mind.known[席位]`：
  嫌疑分直接拉满、会议指控点名道姓（「我确定：XX 是异形，我亲眼看见他钻管道，就在监控室」）、
  投票必投、开枪距离 8→10 格、追击距离 10→14 格。
  **开枪 / 拖尸 / 拘留 / 拉闸**这些人类也会做的事只加嫌疑分，永远不会升级成确证（新增门禁专门守这条边界）。
  `known` 随 `mindReset()` 每夜清空，与「无跨夜记忆」一致。
- **玩家发言槽位化**：`parseSpeech()` 把自由文本拆成「人（姓名/席位号）/ 舱室 / 指控 / 投票 / 否认 / 自述位置」，
  进入 `m.ctx.playerSays`。AI 据此产生真实反应：
  - 谎报位置 → 目击过玩家的 AI 用 `saw_agent` 记忆当场拆穿（「你说你在医疗间？我明明在引擎看见你了」），
    并 `susAdd(w,0,0.3,'contradiction_player')` 调高玩家嫌疑分；
  - 点名指控 → 当事人反问/辩护；手里有同款确证的人直接站队「我同意，他就是异形」；
  - 说「我投 X」→ 有警觉（`alert≥0.25`）的 AI 跟票并把指控同步进投票，零证据的人不接话；
  - 说「不是我」→ 有嫌疑的人追问时间线，否则接受。
- **开局公开讨论真正铺满 60 秒**：原来 5 条台词 7 秒就说完，剩下 50 多秒死寂。
  现在按 1.0~1.6 秒一条把 12~14 条发言铺开（自述 → 同行邀约 → 结盟 → 提问玩家 → 提示 → 互相补时间线），
  讲完后每 9 秒交替插入「剩余 N 秒」系统提示与 AI 主动追问（会引用玩家刚自述的位置），
  直到结束前 2 秒才收尾；`m.plan` 记录排期，门禁断言「最后一条贴着结束时间」。
  夜间/天亮会议同样按窗口均匀铺开，不再前紧后松。
- 测试钩子：`parseSpeech` / `chatterPlan` / `knownOf` / `accuseLineOf` / `track` / `notice`；
  `_t.mind()` 返回 `known` 与 `redSeen`，`meetCtx()` 返回 `playerSays/playerAccuse/playerVote`。
- 门禁新增 18 条断言，实跑 **385 通过 / 0 失败**（2026-10-29，Edge headless）。

### 修复 · 异形打机器人与会议跟票

- **AI 异形砍机器人不再消耗刀数（用户报）**：AI 之前只有一条"贴身直接 `secbotDead=true`"的停摆分支，
  既不扣刀、也无视装甲 HP（保安 2 / 医疗 1）、没有挥砍动作与红身 —— 玩家 Q 出刀要两下才拆掉保安机器人，
  AI 一下就到，属于 AI 特权。现在机器人受击统一走新入口 `knifeBot(a,kind)`
  （扣刀 → `damageBot` 按 HP 结算 → 留 stab 动作与 3 秒刀者红身 → 登记 `pendingCrime`），
  玩家与 AI 共用；AI 只有在**刀用完**之后才会动用每夜一次的破坏技停摆。
  另加 `_botCD` 10 秒冷却，避免异形对同一台机器人"先废刀再废破坏技"。
- **DEV 免伤的刀不扣刀数**：`knife()` 原先在 DEV 分支里 `return`，导致 AI 对 DEV 玩家能无限连刀。
  现在与子弹同一口径：先 `killer.knife--` 与红身，再进免伤分支。
- **零证据人类 AI 被"跟票"投了票**：`startChatter` 的跟票逻辑会直接给一个 `suspect/accuse` 都为空的人类 AI
  指派 `accuse`，等于凭空替人定罪，违反「没有证据的 AI 人类会议必须弃权」。
  现在跟票者必须自身 `mind.alert ≥ 0.25`（听过/见过动静）才会附议；门禁新增"零证据人类 AI 全部弃权"断言。
  该问题在上一版提交上也能复现（约 1/20 概率），属既有规则冲突，不是本轮 AI 改造引入。
- 门禁新增 7 条断言（AI 出刀扣刀 / 按 HP 结算不是一刀拆死 / 不偷用破坏技 / 红身与 stab 动作 /
  登记危险行为、DEV 连刀扣刀、零证据人类全弃权），实跑 **367 通过 / 0 失败**（2026-10-29，Edge headless，连跑两遍同读数）。

### 新增 · AI 会真正用规则（拖拽 / 藏尸 / 医疗间复活 / 避保安 / 合闸 / 主动钻管道）

- **拖拽通用化**：拖拽关系从「只有玩家的 `G.drag`」改成挂在拖拽者身上（`a.drag` + 被拖者 `draggedBy`），
  玩家保留 `G.drag` 作为 UI 别名（新不变量 D7 校验两者同步）。新增
  `startDrag / releaseDragBy / releaseAllDrags / syncDragOf / dragSound`，尸体跟随改在 `stepMove()` 内触发，
  所以门禁的 `aiTick / aiTickAlien` 单步模拟也能真的把尸体拖动。
  死亡、被救活、被拘留、开会、结束、钻管道都会自动松手，不再出现「幽灵还拖着尸体」的脏状态。
- **AI 人类 · 把濒死者拖去医疗间复活**：没有医疗包、但医疗机器人还活着且有电时，
  AI 会把视线内的濒死者一路拖到**巡逻中的医疗机器人身边**再松手，由机器人 3 秒施救；
  拖拽速度同样 3.0 格/秒，会留 `bodyMoved` 痕迹、会发出拖拽声、会被目击者记成 `saw_drag` 证据。
  自己刚开枪打倒的人不拖（不救回自己刚制服的嫌疑人）。
- **AI 异形 · 藏尸**：附近没有活人、且自己没被活人目击时，异形会把尸体（含濒死者）拖到
  舱室里**离门和任务点最远的可走角落**藏起来；医疗间 / 会议室的尸体会被拖去别的舱室。
  每夜最多 2 次、拖完 25 秒冷却；藏完 `bodyMoved=true`，人类搜尸能查出「现场被布置」。
- **AI 异形 · 避开保安扇形**：出刀前用 `secbotWouldSee()`（与 `botTick` 同源：14 格 + 180° 扇形 + `losWalls`）
  预判，正被看着就宁可废刀不动手，退开 2.5 秒等机器人转开再补刀；破坏舱室前同样判断，被看着就换一间。
- **AI 人类 · 断电会去合闸**：全船断电时最多派 1 名人类 AI 去配电室走 `pullBreaker`（3 秒站桩），
  恢复照明后再回去做任务；断电期间不再出现「全船 AI 一起摸黑」。
- **AI 异形 · 主动寻管道口**：目标很远时，异形会先算「入口 + 出口 + 目标」的最短组合，
  自己寻路到管道口再钻（每夜最多两次，仍走 20 秒冷却与 `witnessAlienAction` 目击链），
  不再要求正好站在管道口上才触发。
- **刀者 3 秒红身**：`knife()` 命中后给出手者 `redT = 3.0`，角色贴图整张染红叠加 + 红色轮廓光与地光，
  按真实时间在 `tickActs()` 里衰减；只给刀者、不给被击倒者，纯表现层不参与任何判定与会议发言。
- 新增测试钩子：`dragOf(i) / dragStart / dragRelease / clearDrags / resetAiState / hideSpot / hideRoom /
  medDrop / secWouldSee / gfx / dragSpeed`，`state()` 增加 `drag / redT / hides`，
  `aiTick / aiTickAlien` 返回 `drag / lightGo / hides / secAvoid / pipeSeeks`。
- 门禁新增 29 条断言：AI 拖拽双向标记与不变量、拖进医疗间后机器人救活并扣电量、
  AI 藏尸拖动距离与藏尸点选择、保安扇形内不出刀 / 转开后补刀、断电合闸、主动寻管道口、
  刀者 3 秒红身与衰减、任务点改为掩体本体闪烁且不再有黄色虚线框。
- 门禁实跑：**360 通过 / 0 失败**（2026-10-29，Edge headless）。

### 变更 · 任务提示与掩体观感

- **黄色边框 → 物体本身闪烁**：自己的任务点所在掩体不再套一圈黄色虚线矩形，
  改为从烘焙底图按掩体包围盒裁出物体像素、染成金色后用 `screen` 叠加做脉冲
  （`drawTaskCoverFlash()`），读起来是「那台机器在闪」而不是「框里有东西」；
  没有掩体的空地任务点仍保留细虚线圈。新增 `G.gfx.coverFlashes / dashedBorders` 供门禁回归。
- **AI 拖拽绳可见**：拖拽连线对所有拖拽者绘制（玩家金色、AI 琥珀色，颜色不区分阵营），
  拖拽声按距离衰减进入玩家声纹与 AI 听觉（新增 `heard_drag` 证据权重 0.12）。

### 美术 · 掩体/家具与环境的融合度

- 新增 `tools/gen-materials.py`：用本地 **SDXL**（`D:\ai-models\sdxl-base`）生成 5 张家具表面材质
  （`panel-metal` / `crate-steel` / `fabric-weave` / `table-composite` / `panel-white`）
  与 2 张程序化贴图（`hazard-stripe` 警戒斜纹、`ao-soft` 接地软阴影）。
  出图后统一「降饱和 → 冷调 → 四向镜像拼贴 → 回缩 1024」，`REPEAT` 平铺无接缝，色温与既有地板/墙面一致。
  本机 16GB 内存下 diffusers 默认的 safetensors mmap 加载 5.13GB fp16 UNet 会 access violation，
  工具改为**逐张量流式上卡**（CPU 峰值只有单个张量）并先编码提示词再释放文本编码器，
  8GB 显存下 768px 出图可用；`--mode reuse` 保留一条不吃显卡的派生兜底路径。
- `tools/blender-ship.py` 家具重做：全部改用贴图材质（暗色金属板 / 钢板货箱 / 织物 / 复合台面 / 医疗白板），
  补齐倒角、包边、螺栓、散热百叶、状态灯带、管线与线缆、地面警戒框，
  并给每件家具加**接地软阴影贴片**（`ao-soft`，不参与投影），消除原来「亮色方块贴在地板上」的贴纸感；
  暗舱（引擎 / 配电）吊顶灯提高，掩体在手电锥里也能读出轮廓。
- 重新烘焙 `assets/scene/v4/base-lit.png`（4704×2817，Blender 5.2.2 EEVEE），
  更新 `assets/scene/v4/CREDITS.md` 的材质来源与重烘命令。

### 修复

- **任务乱序维修结算错位（重大）**：玩家可以修自己任务列表里的任意剩余任务点，但结算固定按
  `tasks[tIdx]` 记账，会出现「明明修的是 C，却显示 A 完成，C 还留在列表」。
  现在 `startTask` 记录实际任务点，`finishDoing` 按实际点位结算；乱序完成时把该点交换到
  `tIdx` 槽位，`tIdx` 仍保持“已完成数量”语义，HUD / 任务列表 / 会议口供同步正确。
- 门禁新增「任务乱序维修」回归断言 4 条（开工记录实际点、播报按实际点、计分正确、列表保留未修任务）。
- 门禁实跑：**280 通过 / 0 失败**（2026-10-29，Edge headless）。

### AI 认知与推理链（2026-10-29）

- 每个 AI 新增 `mind`：事件记忆 `mem`、嫌疑分 `sus`、证据理由 `why`、警觉度 `alert`、
  目击者表 `seenBy`、时间线 `seenT` 与语料性格 `tone`；每夜清空，`suspect` 每夜重置。
- 感知入口统一为 `noticeAction()`（视觉动作）、`aiHear()`（刀声/枪声/尖叫/管道/电力/机器人/门/拘留）、
  `envNotice()`（灯光/故障/机器人停摆）与 `observeBody()`（尸体状态）；新增动作必须接入，
  否则 AI 只能“看见”却不会推理。
- 身体状态：刀击/枪击写入 `woundCause`、`downRoom`；死亡重置 `searched`；搜尸完成置 `searched=true`；
  尸体卡新增“检查”行并显示精确伤口；AI 发现未检查的濒死者会先搜尸 1.2 秒，再决定是否报告。
- 推理链：目击刀/枪/管道/破坏/停摆/拘留 → 高权重嫌疑；尖叫/枪声/电力/门声 → 低权重；
  尸体附近 8 秒内出现过的人 → 中权重；会议口供与时间线冲突 → 追加嫌疑；
  没有直接 `suspect` 时，证据分仍能驱动指控与投票。
- AI 行为：AI 人类按最高证据分追凶/开枪（黑暗中只有近身 4.2 格视野）；高警觉时会去声音现场查看；
  每夜最多 1 次 AI 报告；无证据弃权；AI 异形会优先处理目击者，并在无活人目击时自报尸体；
  保安拘留会作为公开证据广播。
- AI 语料：开场/口供/质疑/作证/回应/指控/辩护/跟票/弃权按证据类型、席位、夜数、会议轮次轮换；
  直接目击说“亲眼看见”，时间线冲突说“对不上”，尸体报告带伤口/移动/检查状态。
- 门禁实跑：**294 通过 / 0 失败**（2026-10-29，Edge headless）；新增 AI 认知断言覆盖
  伤口状态、搜尸、视觉+听觉双证据、环境线索、报告上限、异形自报、证据投票、弃权与跨夜清空。

### 机器人/节奏/键位加强（2026-10-29）

- **无限连射修复**：`fireShot()` 现在先扣子弹再进入 DEV 免伤分支；DEV 玩家不再让 AI 无限连射；
  AI 任务耗时移除 ×1.55 额外倍率（幽灵仍为 1.6×），开局延迟压到 2–8 秒，任务后休息减半为 6–11 秒。
- **保安机器人**：识别半径 9 → **14 格**，判定改为朝向前方 **180° 半圆**（`SEC_ARC=π/2`）；
  拘留 18 → **60 秒**，每夜最多 **3 次**；即使攻击未造成濒死，只要行为危险（DEV 免伤、攻击机器人等）
  也会写入 `pendingCrime` 并被保安反制；被拘留者会被人类优先怀疑，AI 异形会避开被拘留目标。
- **机器人受击**：保安 / 医疗机器人成为实体目标；保安 HP 2、医疗 HP 1，可被出刀/开枪摧毁；
  保安被攻击后会转向袭击者并尝试拘留；枪击机器人使用 `fireShotBot()`，与 `fireShot()` 分离。
- **医疗机器人**：每夜救 1 人 → **2 人**；`G.medbotLeft` 电量耗尽后显示“电量耗尽”，不再施救。
- **监控**：9 路画面从彩色小点改为真实角色行走图（含倒地图），仍不显示身份。
- **键位**：`F` 统一施救（含异形），`H` 才是异形破坏技；F 不再与破坏轮盘耦合。
- **幽灵任务**：玩家幽灵的任务/故障维修统一 1.6×；`finishDoing()` 结算后显式归零计时；
  每只幽灵最多获得 **2 分**任务进度（`ghostPts` 跨夜保留，额度用尽后不能再接任务）；
  新增「幽灵乱序任务」「幽灵故障维修」「幽灵 2 分额度」门禁；AI 幽灵仍只随机飘动，不执行任务。
- 门禁实跑：**331 通过 / 0 失败**（2026-10-29，Edge headless）；新增断言覆盖
  攻击未致濒死仍拘留、每夜 3 次擒拿上限、保安 180° 弧形正/反向、机器人受击/摧毁、
  医疗机器人两次施救与电量、DEV 子弹消耗、AI 子弹有限补给、AI 对人类开枪、AI 2–8 秒延迟、F/H 分离、
  幽灵乱序任务与幽灵故障维修。

### 新增

- 工程化基线：MIT `LICENSE`、`README.md`、`AGENTS.md`、`CHANGELOG.md`、`package.json`、
  `.gitignore`、`.editorconfig`、`.gitattributes`。
- 版本单一真源 `js/config/version.js`（`SKConfig.version = '返航录V1'`）；
  开始页与暂停面板显示版本号。
- 零依赖静态服务器 `tools/serve.cjs`（`npm start` / `npm run dev`）。
- 模块化拆分：
  - `js/data/map.js` —— 地图静态数据（原 `game.js` 内联 MAP，约 11KB）；
  - `js/ui/templates.js` —— 界面 CSS/HTML 模板（约 11.7KB）；
  - `js/engine/geo.js` —— 几何 / 可行走网格 / A* / 视线（约 5KB，纯逻辑，加载时烘焙网格）；
  - `js/main.js` —— 开始页按钮绑定与版本填充。
- 门禁工具支持 `PLAYWRIGHT_CORE` / `SHOT_DIR` 环境变量；截图默认落 `tools/screenshots/`（已忽略）。

### 变更

- `index.html`：脚本加载顺序显式化为 8 个模块；开始页角色按钮由内联 `onclick` 改为
  `data-role` + 事件绑定；补充页面描述与版本标识。
- `js/game.js`：收敛为对局编排层（3497 → 3185 行），几何与数据不再内联。
- 全仓文本统一 LF 行尾（`.gitattributes`），素材二进制显式标记。

### 地图与机器人改造（2026-10-29 · A/B/C 三批）

#### A · 地图改造

- 配电室由 92 格扩至 124 格，引擎舱由 102 格扩至 187 格并升为中型；同步重排两舱多边形、
  墙体、门与走廊 `c4/c5` 接口，9 间房两两 A* 可达。
- 管道改为 4 个全部可站立的出口：引擎舱、监控室、军械库、中央会议室；移除原配电室管道，
  修正监控室 / 军械库旧坐标悬空的问题。
- 任务点由 24 个增至 25 个（引擎舱新增「备用配电盘」），全部能被 `nearPoint` 命中。
- 保持 `MAP` 为单行内嵌 JSON，`SKClock` / `SKInvariants` 对外签名未改。

#### B · 机器人人形化 + 房间内巡逻

- 医疗 / 保安机器人改为自绘人形（头、躯干、四肢、步态摆动、停摆下沉），保留医疗十字、
  保安肩灯与「本夜已擒拿」琥珀色；头顶标签增加暗底，亮色地面可读。
- 两台机器人按 4 点路线在医疗间 / 军械库巡逻（1.6 格/秒），运行时坐标存入 `G.bots`；
  拘留、施救、交互、绘制、小地图全部改读实时坐标，巡逻不再只是画面效果。
- 拘留位固定缓存到 `G.jailPos`（军械库角落），被擒者不会跟着机器人满地图跑。
- 停摆机器人原地不动；`M.facility` 的 `x/y` 明确降级为初始坞位。

#### C · 修复与 AI 补齐

- **射击视界一致**：玩家开枪前先过 `visibleAt`（亮房 / 7 格手电锥 / 遮挡），
  暗处看不见的目标不再被隔空命中。
- **AI 异形**：补充拉闸（真正改灯光状态）、停摆巡逻中的机器人、破坏舱室设备、
  钻管道（20 秒冷却）；身边 5 格内有人时优先处理人，不拆机器。
- **AI 人类**：共用 `fireShot` 对目击凶手开枪；用医疗包救起视线内的濒死者；
  在军械库 / 医疗间用资格领取子弹 / 医疗包。
- **性能**：拘留位不再每帧 `nearestFree`；机器人位移为 O(1) 航点推进。
- 未加入「每夜自然 +1 维修进度」（按需求移除）；DEV 调试面板与 DEV 行为未改动。

#### C+ · 异形破坏技重构

- **每个异形每夜一次破坏技**：按 `F` 打开舱室列表（中央会议室除外，共 8 间），选择目标后进入该舱室
  自动损毁对应设备；目标舱室与设备名会显示在 HUD 与画面标记上。旧「站在任务点上按 F 直接 -2 进度」
  的破坏方式已彻底移除（玩家与 AI 均不再存在 `sabTask`）。
- **60 秒故障窗口**：设备损毁后生成 `G.dmg` 故障，倒计时 60 秒；未在窗口内修完且仍在天黑，
  维修进度 **-3**。天亮时未修完的故障随夜晚结束清除，不追罚。
- **连续 10 秒维修**：人类、异形（含玩家与 AI）均可站到故障旁按 `E` 维修，需连续 10 秒，
  移动会立即打断；AI 人类最多 2 人响应同一故障，修完给治疗环与播报。
- **幽灵不可破坏**：幽灵按 `F` 明确提示「幽灵无法破坏」；幽灵仍可参与故障维修。
- **AI 异形**：在拉闸 / 停摆机器人之外，会随机选择非会议室舱室前往破坏；离活人 5 格内时优先处理人。
- 新增 `#sabot` 选舱面板、HUD 故障条、世界与小地图故障标记；测试钩子补充
  `dmg / damageRoom / sabTick / startFix / openSab / pickSab` 等只读/驱动接口。
- 未改动 DEV 面板与 DEV 行为。

### 玩法修正与自动门（2026-10-29 · D 批）

#### 异形身份与行为推断
- **移除误加的天眼 / 队友透视**：玩家异形不再显示队友轮廓或小地图红点；异形之间默认互不知道身份。
- 新增 `witnessAlienAction()`：只有目击异形专属行为（出刀 / 钻管道 / 破坏设备 / 停摆机器人）时，
  人类才写入 `suspect`、异形才把对方记入 `allies`。AI 异形目标改为“未确认的最近目标”，
  确认盟友后不再攻击盟友；会议指控排除已知盟友。
- 保安机器人行凶识别半径 6 → **9 格**（仍受墙体遮挡）。

#### 站桩维修与资格流程
- **站桩维修**：任务维修、故障维修、拉闸、取物资、施救、搜查、领取资格全部要求站桩；
  真实移动（含一帧走完短路径）立即打断并重置计时。
- **资格领取**：任务积分到 3 / 5 只生成 `qualPending`；必须回中央会议室**资格台**按 `E` 站桩 3 秒领取，
  才能到医疗间 / 军械库换取医疗包 / 子弹。HUD 新增“待领”；未领取时补给房明确拒绝。AI 人类同样遵守。

#### 地图 / 移动 / 任务标记
- 中转间 188 → **102 格（小型）**、配电室 124 → **148 格**、引擎 187 → **216 格**；
  中央会议室管道从 (33,5) 移到右上角 (59.6,6.0)。
- 所有活人统一 `MOVE_SPEED = 5` 格/秒；拖拽 3.0、玩家幽灵 6.5 为显式例外。
- A* 平滑增加 0.16 格贴墙余量；`stepMove` 增加 0.7 秒无位移自动重寻路，修复 AI 拐角卡死。
- 本人任务点标记改画在迷雾之上：暗处 / 隔墙也能看到目标舱室，当前任务带名称。

#### 自动门与素材
- 新增 **22 扇自动门**（房间门 × 走廊端点）：无人闭合、活人进入 3 格自动滑开；
  关门同时阻挡移动（`doorBlockedSegment`）与视线（`losNow`）。
- 横向门为立式双开门板，纵向门为贴地滑轨；门板纹理由扩散模型生成，门框随底图由 Blender 烘焙。
- 重新烘焙 `assets/scene/v4/base-lit.png`（4704×2817，新房间 / 门框 / 走廊对齐）；
  `tools/blender-ship.py` 数据源改为 `js/data/map.js`，并新增 `assets/scene/v4/CREDITS.md`。

#### 文档
- README 新增「AI 与规则模型」、资格流程、自动门与 v4 素材说明；AGENTS 增补异形信息、资格、自动门、站桩、
  保安范围与底图重烘约定；门禁计数与基线同步到本次实跑。

### 硬掩体 · 物资申请单 · 交互轮盘（2026-10-29 · E 批）

#### 硬掩体
- `M.cover` 从软代价改为**硬阻挡**；重新设计 44 件掩体：贴墙或保留 ≥1.2 格绕行通道，
  9 间房仍两两可达、25 个任务点可命中、4 个管道口与机器人巡逻点全部可站立。
- 新增 `_t.coverAudit()`：检查同房掩体窄夹缝与掩体制造的尽端死路；门禁断言零 gaps / 零 dead。
- 用 Blender 5.2.2 重渲 4704×2817 底图，家具与逻辑碰撞面对齐。

#### 物资申请单
- 每人 4 个任务（1 高难 +2 分 / 3 普通 +1 分）；3 / 5 分生成待领申请单。
- 回中央会议室**圆桌**按 `E` 站桩 3 秒领取申请单；军械 / 医疗**专用补给点**各消耗 1 张申请单换 1 次物资。
- HUD 改为「申请单 / 待领」；未领取时补给点明确拒绝；AI 人类同样回圆桌领取，并会主动去专用补给点。
- 移除旧独立资格台；圆桌在待领时显示金色单据图标。

#### 交互轮盘
- `E` 收集附近全部可交互项；异形靠近机器人按 `F` 时增加「停摆机器人 / 破坏舱室」两项。
  1 项直接执行，2 项以上打开轮盘；数字键 / 点击选择、ESC 取消。
- 覆盖任务维修、故障抢修、管道、电闸、监控、圆桌申请单、军械 / 医疗补给点。
- 管道权限明确：人类不可用，异形可用；新增门禁断言。

### 异形反作弊 · 音效 · 射击键（2026-10-29 · F 批）

#### 异形 AI 不再读取队友信息
- 删除 `allies` 字段与所有使用点：AI 异形的目标选择、会议指控、投票不再按阵营/盟友过滤。
- 异形可以攻击或投掉同类；人类仍然只有目击异形专属行为（刀 / 管道 / 破坏 / 停摆机器人）才写入 `suspect`。
- 会议为每个异形分配不同指控目标，避免被误读为统一串供；新增门禁：异形可投队友、投票目标不统一。

#### 音效（全部公开 CC0）
- 脚步改用 OpenGameArt「100 CC0 SFX #2」的轻木地板采样（`footstep_wood_01/02`），
  游戏内音量整体压低，AI 脚步只在 6 格内播放。
- 新增 OpenGameArt「80 CC0 RPG SFX」的 `creature_die_01` / `creature_hurt_01`
  作为被击倒喊叫（刀 / 枪），按距离衰减。
- `audio/CREDITS.md` 同步来源；`SND` 采样池由 6 类增至 7 类（含 scream）。

#### 射击键
- `Q` 只出刀（异形；人类按 Q 提示改用 B）；`B` 开枪，人类 / 有子弹的异形通用。
- 异形开枪仍走 `fireShot()`，保留子弹消耗、犯罪记录、目击与保安机器人逻辑；出刀不消耗子弹。
- `drawWeapon` 在异形持弹时显示枪，出刀时显示刀。

### 验证

- `node tools/test-v3.cjs`（返航录V1，2026-10-29 最终实跑）：**276 通过 / 0 失败**（D 批 261 → E 批 271 → F 批 276）。
  新增覆盖：硬掩体阻挡 / 绕行 / `coverAudit` 零夹缝零死路、圆桌物资申请单 → 军械/医疗专用补给点、
  E/F 交互轮盘多项选择、人类管道禁用、AI 不读取队友信息 / 投票可投队友 / 目标不统一、
  Q 出刀 / B 开枪分离、7 类 CC0 音效采样；既有覆盖：中转间 102 格 / 配电室 148 格 / 引擎 216 格、
  会议室管道右上角、22 扇自动门开合与阻挡、异形互不知道身份 / 行为推断 / 互刀、统一移速、
  保安 9 格识别、站桩维修移动打断、AI 拐角寻路 260 步不卡死、地图全连通 / 4 管道口 / 25 任务点、
  机器人巡逻、AI 拉闸 / 停摆机器人 / 破坏舱室 / 钻管道 / 开枪 / 救人 / 补给、
  破坏技选舱 / 60 秒故障 / -3 进度 / 连续 10 秒维修 / 幽灵不可破坏 / 暗处不可隔空开枪。
- 浏览器冒烟：开始页显示「返航录V1」→ 人类开局 15 席、303 项不变量全过、22 扇门、控制台零报错。

## 2026-10-29

### 变更

- 以《新返航录》试玩版（11 人类 vs 4 异形，SKV3 独立引擎）替换 `space-kill-web` 仓库 `main`，
  旧版完整工程保留在 git 历史中（替换前 HEAD：`ec1a517`）。
- 推送 GitHub（`hxj-2888/space-kill-web`）与 Gitee（`hxj-2888/space-kill-web`）main。
