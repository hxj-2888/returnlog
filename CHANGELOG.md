# CHANGELOG — 新返航录 3D 版（工程级）

> 只记**工程级**变更：分离、基线刷新、工具链、契约口径、门禁读数。
> 3D 侧可见变更与移植批次记在 `3d/CHANGELOG.md`，两边不重复。
> 中文记录与提交格式 `type(scope): 摘要` 见 `AGENTS.md` §一.10；
> 门禁报告必须写本次实跑的「X 通过 / Y 失败」（§一.4）。

## 2026-11-09 · 清理：`docs/` 移出基线 + SDXL 舱室图与旧批次读数

- **范围**（用户裁定「本次同步先到此为止」）：只做清理，不改执行层判定、不采新读数、不拉上游。
- **图片**：删 `3d/assets/refs/*.png` 10 张（4.6 MB，本地 SDXL 舱室参考图）与
  `3d/assets/renders/covers-*.png` 10 张（17 MB，由前者派生的掩体检查板）。
  两者都不入 git、运行时不引用；`<room>.json` 的模型 / seed / prompt 保留，可按 `gen-cover-refs.py` 重生。
- **文档**：删 `docs/` 下 25 个 2.5D 时代文档（调研 / 交接 / 审查 / 审计 / 施工单，323 KB），
  原仓 `C:\Users\ASUS\Desktop\新返航录\docs\` 完整保留；`docs/` 自此移出只读基线。
- **旧读数**：删 `3d/preview/reports/3d-simbatch-{15,20,30,40,100,200}.md`（6 个）；
  `3d/CHANGELOG.md` 与 `3d/MIGRATION.md` 内的引用改为内联读数并标注「报告已清理」。
  保留 `3d-sim1000.md`（当前基线）与 `simdiff-20261108.md`（契约对照夹具）。
- **工具**：`tools/sync-baseline.cjs` 把 `docs` 移出基线目录，新增 `--rebuild`（只缩范围：
  不连上游、不复制文件，对保留文件逐个校验哈希，任一漂移即拒绝）。清单 555 → **451**，
  保留项哈希全部一致。
- **未同步**：核对时上游已有 21 项内容差异 + 3 项新增（含 `js/data/map.js`、`js/t2/minigame.js`），
  按「同步先到此为止」未拉取；需要时再走 `baseline:sync` + `export:all` + `check`。
- 详见 `BASELINE.md` §6、`SPLIT.md` §3 / §4。

## 2026-11-09 · 第七批：回归 2.5D 真源，先拨乱反正

- **核实优先**：逐条读码核对四域（AI 推理 / 出手 / 发言 / 会议），推翻前几批留下的
  失实契约；完整清单落 `3d/PORT-DIFF-AUDIT.md`（含真源行号与核实附录）。
- **核心发现**：这些模块函数级大多已同源（`SKT2AI` 38 synced、`SKT2Decision` 11 synced/2 adapter、
  `rules.json#tables.SKSanity` 42 张表），真问题是「接线断开 + 为读数加的额外限制 + 契约失实」。
  尤其「进攻链未齐所以不启用每夜 1 把刀」的前提被证伪（RUSH / 管道突袭 / 目标承诺 /
  异形开枪 / 构陷编排全已接入）。
- **执行层按真源恢复 5 处**：每夜刀额度 gate、人类 AI 开枪死代码接线、`heard` 整局滑动窗口、
  `vote_change` 只在真改票时记、观察窗口 26 夜→15 夜（17250 tick）。每项写明 `js/` 行号。
- **修 `--b6test` 夹具**（原断言依赖上述 bug 造出的假事件），未回退任何判定。
- **文档拨正**：`port-manifest.json` 8 条 notes、`MIGRATION §9.3` 标注历史诊断。
- **验收（回归防护）**：`npm run check` 6/0、`BASELINE OK 555`、红线 12 条逐字一致、
  16 项有断言自测通过；4 项既有坏自测如实列出（原仓同样失败，非本批回归）。
- **边界**：未采新平衡读数、未以读数论证改动、未写达标线、未自行立项；原仓零改动。
- 详见 `3d/CHANGELOG.md` 第七批。

## 2026-11-09 · 第六批：AI 视野正向移植 + 验收层边界登记

- **feat(port)**：`ai_can_see` 按 2.5D `js/game.js:1784 observerVisionAt` 重写
  （同亮区整片 / 亮舱↔相连走廊 LOS / 近身圆 / 7 格 60° 手电锥 / `agentAimAng` 朝向），
  并补 `litZoneAt`(L10644)、`corrJoinsRoom`(`js/t2/space.js:71`)、`G.corrLit`(L686)。
  12 个调用点改传观察者 agent；`grid_nav.gd` 只公开只读查询，几何不复制到规则层。
  玩家朝向由 view 层写 `aimAng`（intent），sim 不读鼠标。
- **docs(arch)**：`AGENTS.md` §五 新增第 7 条「验收层不反向驱动执行层」——T3 读数只作事后记录，
  T2 改动依据只能是 `js/` 真源或「真人会不会这样」；门禁/自测只回答「有没有写坏」；
  跨批次反馈须显式登记、agent 不自行立项。§一 12 条红线仍逐字未动。
- **docs(correct)**：更正第五批把 20 局读数写成改动因果依据的措辞（原仓 `ARCHITECTURE.md` §8
  批内回写禁止），改为「唯一依据是真源行号，读数只作事后记录」；两处 CHANGELOG 均已改。
- **边界**：本批未采新的平衡读数，未以读数 / 门禁结果论证任何改动，未列下一批立项。
- **回归防护（T3 事后登记）**：`npm run check` 6/0、13 项 Godot 自测 exit 0、
  `BASELINE OK 555`。原仓零改动。

## 2026-11-09 · 第五批：行为层根因 ② 医疗无人机救起链完整移植

- **fix(balance)**：诊断出 5 处与 2.5D 不一致（电量不按夜复位、无 7 秒治疗读条、
  全船找目标而非只救医疗间、飞行/触摸半径硬编码、无救起眩晕与事件字段），
  并补上 3 处连带缺口（人类 AI 拖濒死者进医疗间、`start_drag` 允许拖濒死者、
  AI 抵达医疗间后主动放下）。
- **feat(truth)**：`export-space.cjs` 新增 6 个 `MEDBOT_*` / `botHp` 具名常量导出并重导
  `space.json`；所有数值仍只读 `data/*.json`，未在 GDScript 自造。
- **test**：修 `--bottest` / `--b4test` / `--b6test` 三个既有坏账（`MEET_PRE` 接入后未更新，
  原仓逐字同样失败）；`npm run check` 6/0，12 项 Godot 自测 exit 0。
- **过程留痕**：第一次只做「每夜复位 + 7 秒读条」却保留全船目标，20 局救起 30 → 3、
  胜率 20% → 15%；补齐项全部以 `js/game.js` 真源行号为依据，读数仅为事后记录。
  **第六批更正**：本条原文把读数写成改动的因果依据，违反原仓 `ARCHITECTURE.md` §8 批内回写禁止，已改正。
- **最终读数（20 局）**：人类胜率 **20.0% → 35.0%**、平均夜 **5.45 → 4.55**（2.5D 4.72）、
  存活人类 1.30 → 1.50。但**救起 30 → 1**：改善来自每夜状态复位，医疗救援链代码补齐后
  实测仍几乎不触发，根因未定位，**不标为已解决**，下一批先加埋点量化触发率。
- 原仓零改动。

## 2026-11-09 · 第四批：参照 2.5D 补齐玩家动作全集与输入链

- **feat(port)**：以 `js/game.js#collectInteractions` 为准，补齐 3D 缺失的 5 类动作入口
  （施救 / 查看尸检伤情记录 / 全船监控 / 异形破坏 / 机器人状态），全部复用已有 `sim` 判定
  与 `space.json` 数值，未自造状态 / 计数器 / 阈值。`sim_state.gd` 新增 `player_revive()`
  / `player_sabotage()`，把玩家记账收口到与 AI 同一条完成链。
- **fix(input)**：新增 `main.gd::_want_mouse_visible()` + `_refresh_mouse_mode()` 统一鼠标口径，
  修复「交互轮盘打开时鼠标仍 CAPTURED、按钮点不动」；`_input()` 补 2.5D 同款面板按键守卫。
- **fix(gate)**：重导 `rules.json` 消除 `sources` SHA 漂移；`port-manifest.json` 的 `X-BIND`
  补认领上游新增的 111 行 `_t` 调试接口；`MIGRATION.md` §10.2 的旧对账数字改为 63/7/0。
- **test**：新增 `--actiontest` 真实输入链自测（不用 `skip_discussion()` 作弊）；修
  `--simtest` / `--meetingtest` / `--speechtest` 三个既有坏自测（`MEET_PRE` 接入后没更新），
  新增 `_finish_meeting()` 夹具把会议正常走完。原仓同批逐字同样失败，已确认非本批回归。
- **读数**：`npm run check` **6 通过 / 0 失败**（分离时 2 项既有失败已清）；
  `SIMTEST 26/0`、`ACTION OK`、`--interacttest` / `--mgtest` / `--tasktest` /
  `--devicetest` / `--navtest` / `--meetingtest` / `--speechtest` 全部 exit 0。
- 原仓零改动；3D 侧逐批明细见 `3d/CHANGELOG.md` 第四批。

## 2026-11-09 · 工程分离（3D `V1P-0.1` / `0.1.0` · 移植基线 `返航录V3.6` / `3.6.0`）

- **feat(split)**：从 `C:\Users\ASUS\Desktop\新返航录\` **复制分离**出独立工程
  `C:\Users\ASUS\Desktop\新返航录 3D 版\`；原仓零删除、零改写，`3d/` 暂留作对照与回退兜底。
- **feat(split)**：原 `3d/` 整体保留层级，使全部 `3d/tools/export-*.cjs` / `check-*.cjs`、
  Python 资产脚本、`3d/spec/*.json` 清单、GDScript 注释与历史文档里的
  「仓库根 → `3d/`」路径**原样可用**，未改一处路径、未改一行 GDScript。
- **feat(baseline)**：随仓带入 2.5D 只读基线（`js/`、`assets/`、`audio/`、`docs/`、`tools/` 片段）；
  另随迁 `index.html` 作为 `3d/spec/port-manifest.json` 登记的 `X-ENTRY` 只读对账对象（缺它 `3d:port:check` 会多报 1 条 ERR）；
  新增 `tools/sync-baseline.cjs`（刷新 + 防篡改校验）与 `tools/check-all.cjs`（门禁汇总），
  生成 `BASELINE.sha256.json`（555 个文件）。
- **docs(split)**：新增根 `AGENTS.md`（**§一 逐字沿用原仓 12 条红线**，§三 为本工程适用性映射）、
  `README.md`、`SPLIT.md`、`BASELINE.md`、本文件；独立 `package.json` / `.gitignore` / git 仓库。
- **docs(split)**：记录分离时刻的现场事实 ——
  ① 玩家除移动外无法进行任何操作（**P0，未修**，排查入口见 `AGENTS.md` §6.1）；
  ② 门禁实跑 **4 通过 / 2 失败**，与原仓逐项一致，失败为上游未提交改动遗留
  （`3d:port:check` 1 错 1 警；`3d:parity:check` FAIL），未修、未掩盖。
- **本批未改任何游戏逻辑、未重导任何数据**，3D 行为与分离前完全一致；
  分离是否成功以「门禁读数与原仓逐项一致」验证，详见 `SPLIT.md` §5.1。
