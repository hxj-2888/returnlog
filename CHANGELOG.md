# CHANGELOG — 新返航录 3D 版（工程级）

> 只记**工程级**变更：分离、基线刷新、工具链、契约口径、门禁读数。
> 3D 侧可见变更与移植批次记在 `3d/CHANGELOG.md`，两边不重复。
> 中文记录与提交格式 `type(scope): 摘要` 见 `AGENTS.md` §一.10；
> 门禁报告必须写本次实跑的「X 通过 / Y 失败」（§一.4）。

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
  胜率 20% → 15%；据此补齐其余项后同 seed 复跑两次。失败与修正都写进 `3d/CHANGELOG.md` 第五批。
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
