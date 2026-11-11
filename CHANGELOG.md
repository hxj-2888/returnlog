# CHANGELOG — 新返航录 3D 版（工程级）

> 只记**工程级**变更：分离、基线刷新、工具链、契约口径、门禁读数。
> 3D 侧可见变更与移植批次记在 `3d/CHANGELOG.md`，两边不重复。
> 中文记录与提交格式 `type(scope): 摘要` 见 `AGENTS.md` §一.10；
> 门禁报告必须写本次实跑的「X 通过 / Y 失败」（§一.4）。

## 2026-11-11 · 第 20 批：knife/down + V-CREW full + 音频同步 + 红线审查

- **触发**：用户要求补 knife/down、把 V-CREW 标 full；同时发现会议室圆桌旁仍有
  “银翼”2.5D 贴图、截图会抢鼠标、3D 声音系统未同步 2.5D。
- **银翼贴图**：删除 `map_builder._build_preview_actor()` 与 `_system_font()`；
  圆桌旁不再有预览 Sprite3D/Label3D。
- **声音**：`audio.gd` 对齐 2.5D `SND`：`volAt`（18 格 / 保底 0.14）、`TONE`、
  多采样、脚步声/工作声/门自动声/win-lose/刀枪血肉喊叫；补 `sfx-work.ogg`；
  `M` 键开关音效。`--audiotest` 实跑 `d=0→1.00 / 9→0.57 / 18→0.14`。
- **动作**：Blender 补 `knife` + `down`（4 动作 full）；`crew_view` 由
  `sim.events#knife` 触发 knife、`downed` 触发 down；新增无窗口 `--crewanimtest`。
  `port-manifest.json#V-CREW` → **ported（full）**；`char_crew_lowpoly` → **done**。
- **截图鼠标**：所有 `--shot/--crewshot/--doorshot/...` 走 `_screenshot_mode`，
  强制 `MOUSE_MODE_VISIBLE`，不转视角/不误触；退出 `_exit_tree()` 再释放。
  实测 `CREW_MOUSE mode=0`；遗留 Godot 测试进程已清理。
- **截图规范**：`AGENTS.md` §五.8 + `3d/README.md` / `HANDOFF.md` / `ARCHITECTURE.md` /
  `spec/conventions.md` §7 / `DECISIONS.md` ADR-0013 固化“截图严禁捕获鼠标”；
  `--probetest`/`--mousetest` 与截图分开，必须恢复 VISIBLE。
- **红线审查**：新增 `3d/REDLINE-AUDIT.md`；结论 **红线 1–10 通过，11/12 未全过**
  （鬼魂模式、医疗无人机救起行为、1000 局基线、公开设计参照留痕）。
- **门禁**：`npm run check` **6 通过 / 0 失败**；`baseline:check` 454；
  `3d:port:check` 13 ported / 23 partial；`--crewanimtest` / `--simtest` / `--audiotest` 全过。

## 2026-11-11 · 人物参考建模 + walk + 门扇闭合；GitHub 首版

- **触发**：用户 2026-11-11 裁定人物从 billboard 走向 3D 建模；同日现场「仍然是贴图」、
  「门半开」、「现在是漂移状态」，并要求做完上传 GitHub。
- **参考图**：本地千问 `-Set crew` 生成三视图 / 三配色 / 制服细节 3 张（768²，
  Qwen-Image 2.1 Research License 非商用）；完整图在 `docs/qwen21/crew-refs/`，
  随仓 640px 预览 + `manifest.json` 在 `3d/assets/crew_refs/`。
- **建模**：`3d/tools/build-crew-rigged.py` → `char_crew_lowpoly`：
  1.75 m / 1812 tris / 4 材质 / 17 形变骨 / **idle+walk**；浅灰勤务服 + 珊瑚红胸带/护膝、
  短黑发、背包、黑靴，按三视图建。
- **接入**：`crew_view.gd` 默认 lowpoly；`moving=true` 切 walk、静止切 idle，
  walk 1 秒循环按 4.2 m/s 移速播 2.9×；`--crew-billboard` 回退旧 billboard；
  `char_crew_blockout` 是第二级回退；`--crewshot` 输出 `preview/screenshots/crew-lowpoly.png`。
- **门扇**：按 2.5D `doorTick` 修正关闭/打开几何（中线合拢、完全打开让出 1.8 m），
  触发范围改为所有活人；会议/结算期间冻结；`--doorshot` 出 closed/open 对照。
- **GitHub**：`https://github.com/hxj-2888/returnlog-3d`（**private**，master）；
  首次提交 `5b13dc2`（含 1–19 批未提交快照）。
- **门禁**：`npm run check` **6 通过 / 0 失败**；`3d:assets` 0 错误 / 3 旧提醒；
  `3d:import:check` 76 个 `.glb.import` 0 差异；`--probetest` **OK 0 项失败**，
  `CREW_ANIM_SWITCH walk=walk idle=idle`；`--powertest` 门扇 `closed_gap=0.000 / open_gap=1.800`。

## 2026-11-10 · 第 17 批工具：玩家探针 + DEV 契约状态

- **触发**：用户现场「异形按 E 打不倒人 / 不知道交互了什么；DEV 很有必要；你自己写玩家探针」。
- **新增工具**：`3d/tools/player-probe.cjs` + `npm run 3d:probe` —— 用真实 `InputEvent`
  跑 `--probetest`（E / 数字键 / 左键 / F2），必须真实窗口；headless 下
  `MOUSE_MODE_CAPTURED` 不成立（`--mousetest` / `--knifetest` 同一条限制）。
- **契约口径**：`3d/spec/port-manifest.json#S-DEV` 从 `excluded` 改为 `partial`：
  DEV 横栏 / 全知 / 无敌 / 玩家探针已迁，2.5D 的 `SKInvariants` 运行时断言未迁。
  决策见 `3d/DECISIONS.md` ADR-0012；可见变更与实跑读数见 `3d/CHANGELOG.md` 第 17 批。
- **门禁（本次实跑）**：`npm run check` **6 通过 / 0 失败**；Godot **33 项 exit 0**；
  `PROBETEST OK 0 项失败`。未采新平衡读数。

## 2026-11-10 · 移植批（第 1–8 批）+ 桌面快捷方式改指向本工程

- **触发**：用户 2026-11-10「检查三者关系，把 2.5D 里**非美术、非按键操作**的东西
  全部移植到 3D，严格按红线」。三个附件：本工程、`新返航录`（2.5D）、
  桌面 `启航路 3D 版.lnk`。
- **三者关系**（审计结论）：
  - `新返航录` 是 2.5D 真源（只读基线）；本工程是它的**延伸**，不是第二条产品线；
  - 桌面快捷方式**原先指向旧仓 `新返航录\3d\preview`** —— 那是分离前的 3D，
    缺分离后的 6 个修复批（含 P0 输入链修复）。这是「继承有问题」的直接来源。
- **桌面快捷方式**（用户授权「改指向新工程」，旧仓 `3d/` 保留不删）：
  - 旧：`--path "C:\Users\ASUS\Desktop\新返航录\3d\preview"`，工作目录 `新返航录`
  - 新：`--path "C:\Users\ASUS\Desktop\新返航录 3D 版\3d\preview"`，工作目录 `新返航录 3D 版`
  - 目标程序不变（`E:\ai-tools\godot\Godot_v4.6-stable_win64.exe`）；
    从新路径 `--quit-after 180` 冒烟 exit=0、0 条脚本错误。
- **基线**：`baseline:sync` 两次（上游在我工作期间又改了 `js/data/map.js` 120 → 124 件、
  `tools/blender-ship.py`、`assets/scene/v4/base-lit.png`），清单 452 个文件 / 2026-11-10。
  **上游是活动靶**：动数据前后都要 `baseline:check` 并与上游 diff。
- **数据单一真源**：`build-map-v2.cjs` 的 cover 从方案层 `ship-layout-plan.json` 改回
  **原样取 `map.json`（⇒ `js/data/map.js`）**；3D 此前跑的是 11-06 的旧布局（127 件），
  与 2.5D 的 124 件不一致。墙面装饰 40 件仍取方案层（用户裁定：属允许的美术差异）。
- **可见变更与逐批判定口径**见 `3d/CHANGELOG.md` 第 1–9 批；
  **差异登记与全量验收读数**见 `3d/PORT-DIFF-AUDIT.md` §C / §E。
- **门禁（本次实跑）**：`npm run check` **6 通过 / 0 失败**；
  `3d:floor:check` OK、`baseline:check` OK、`sync-cover-height --check` 一致；
  Godot 23 项无头自测全通过（`--taskflowtest` 与 `--floortest` 的既有坏账已清），
  运行期 0 条 `SCRIPT ERROR`。
- **未采新平衡读数**：`3d-sim1000.md` 仍是第七批之前代码的读数（§五.7 验收层边界）。
- **同日第二次同步（16 个文件）**：上游改了 `SKSanity.STAND`（qual 3→0 / ammo 7→5 / med 5→3）、
  领申请单改成 `grantQual` 交互即领、管道口换写实精灵、掩体 124→123。
  3D 已跟（清单 454 个文件），细节见 `3d/CHANGELOG.md` 第 11 批。

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
