# 修改记录（CHANGELOG）

> **架构节点**（2026-11-04 · 按根 `ARCHITECTURE.md` 贴标）：本文件属 **第 3 层 T3 验收层 · 增量台账**；`flag: F`。
> 每条批次固定三段：**本批改动 → 读数变化 → 下一批立项依据（用户裁定后填）**。台账只记录「改了什么 → 读数怎么变」，不写「某读数 > 0 算通过」；历史条目只标注不删除。

本文件记录《新返航录》试玩版的所有可见变更。版本口径：**返航录V3.7**。
格式参考 Keep a Changelog；日期使用本地时间（Asia/Shanghai）。

> **分卷（2026-11-13）**：本文件只保留**最新 5 批 + 索引**；2026-11 其余批次 → `docs/changelog-history-2026-11.md`；
> 2026-10 及更早 → `docs/changelog-history-2026-10.md`。`tools/check-t3.cjs` 的 C4/C5 同时解析三份，
> 历史只标注不删除；现行基线仍只在最新批次的「读数变化」段。

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

