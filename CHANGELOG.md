# CHANGELOG — 新返航录 3D 版（工程级）

> 只记**工程级**变更：分离、基线刷新、工具链、契约口径、门禁读数。
> 3D 侧可见变更与移植批次记在 `3d/CHANGELOG.md`，两边不重复。
> 中文记录与提交格式 `type(scope): 摘要` 见 `AGENTS.md` §一.10；
> 门禁报告必须写本次实跑的「X 通过 / Y 失败」（§一.4）。

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
