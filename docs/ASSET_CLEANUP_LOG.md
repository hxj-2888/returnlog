# 资产清理执行台账

> **本仓本地执行台账**：不参与共享规范同步；2.5D 主仓同名文件是另一份执行记录。
> 依据 `docs/ASSET_GOVERNANCE.md` §9。每次清理必须按六步执行并在此登记，**未登记不得视为完成**。
> 台账只记事实，不记计划；本文件建立于 2026-11-11，**截至建立时尚未执行任何删除操作**。

## 执行六步（每次逐项打勾）

1. [ ] 冻结：批次不再写入，记录路径 / 数量 / 体积 / 层级 / 保留期到期日
2. [ ] 完整备份：`robocopy /E /COPYALL` 或等价方式复制到仓外，确认成功
3. [ ] 只进回收站：使用系统回收站；禁止 `rm` / `del /F` / `shutil.rmtree` / 通配符批量删
4. [ ] 小批执行：每批 ≤ 10 个文件，逐批核对路径
5. [ ] 逐批校验：数量、体积、抽样哈希；任一失败立即停止
6. [ ] 记录：填写下表；清理后跑 `BASELINE.sha256.json` 校验

## 台账

| 日期 | 批次 / 层级 | 仓库 | 文件数 | 释放体积 | 保留期到期 | 备份位置 | 恢复方式 | 执行人 | 校验结果 |
|---|---|---|---:|---:|---|---|---|---|---|
| 2026-11-11 | L4 缓存 + L3 退役/时间戳备份 + 过期调试输出（✅ 全批次） | 新返航录 3D 版 | 1344 | 525.95 MB | 见 RESTORE_MAP.csv | backups/2026-11-11/cleanup-full/ + quarantine/2026-11-11/ | RESTORE.md 一键还原 / tracked 用 git restore；3D 版另跑 --rebuild 收缩基线 | WorkBuddy | 339 批全通过 · 体积一致 |
| 2026-11-12 | 游离文件 A 档（演示视频出仓保留 + 一次性转储隔离） | 新返航录 3D 版 | 2 | 51.74 MB | — | `C:\Users\ASUS\Documents\returnlog_cleanup_20261112\`（backup + retained 双份） | retained/quarantine 原样移回 | ZCode | 备份全量哈希校验一致 · baseline:check OK 443 |

### 2026-11-12 · 游离文件 A 档（依据 `docs/资产耦合图谱_20261112.md` §4-A）

- 层级 / 保留期到期：未登记游离文件（本批同时补登记，见 ASSET_LAYERS.md）
- 范围：
  - `返航录3D_演示_68s.mp4`（51.63 MB，未入库，全仓零引用，曾为全仓最大文件）→ **出仓保留**，不是清理：目标 `C:\Users\ASUS\Documents\returnlog_cleanup_20261112\backup\retained\新返航录 3D 版\`
  - `tmp_pending_dump.txt`（0.10 MB，未入库，`js/game.js` 函数一次性转储）→ 隔离 `C:\Users\ASUS\Documents\returnlog_cleanup_20261112\quarantine\2026-11-12\新返航录 3D 版\`
- 冻结确认：2 个 / 51.74 MB，`freeze_新返航录 3D 版.csv`
- 备份路径：`backup\新返航录 3D 版\`（确认方式：全量 SHA256 比对一致）
- 处理方式：隔离 / 出仓保留（`fs.renameSync` 同卷原样移动，非删除）；tmp dump 已完成并核验哈希
- ⚠ 未竟项（2026-11-12 续办排查后仍未解决）：mp4 出仓移动被外部进程占用（`EBUSY`），**原文件仍在仓内**；备份副本 `backup\新返航录 3D 版\返航录3D_演示_68s.mp4` 已全量 SHA256 校验一致（`EA5D59DA…736` / 54,141,926 字节），「出仓留档」的保全目的已由备份副本达成，缺的只是把仓内原文件移走释放 51.63 MB。
  - 续办实测：源文件与备份哈希一致；`Move-Item` 与独占打开均报「文件正由另一进程使用」。按用户授权逐批结束可疑进程并每次复测：ZCode 全部进程（7:33–7:42 批 10 个，其余自行退出）、Chrome 11-11 22:07 批后台渲染进程 7 个及主进程、explorer 文件夹窗口与桌面进程（系统已自动重启）、`dllhost` ×3、`GameViewer`、`SearchHost` —— **均未释放句柄**。
  - 剩余嫌疑：Windows Search 内容过滤链（`SearchFilterHost` ×5 / `SearchProtocolHost` / `SearchIndexer`）或 Defender 实时扫描等系统级句柄；`Stop-Service WSearch` 与 `Stop-Process` 对这些进程均因权限不足失败（`Cannot open 'WSearch' service`），当前会话无管理员权限，故无法在不停机情况下释放。
  - 后续一步（重启后，或在资源监视器「关联的句柄」中手动结束该 mp4 的持有者后执行；单文件、一条 rename）：
    `Move-Item -LiteralPath 'C:\Users\ASUS\Desktop\新返航录 3D 版\返航录3D_演示_68s.mp4' -Destination 'C:\Users\ASUS\Documents\returnlog_cleanup_20261112\backup\retained\新返航录 3D 版\'`
    执行后核对目标 SHA256 与体积，再把本条与 `docs/ASSET_LAYERS.md` 改为「已出仓」。
  - 期间未对任何文件做删除；`retained` 目录保持为空，留给原文件直接移入（避免与副本同名冲突）。
- 逐批校验：1 批 2 文件，tmp dump 哈希一致；mp4 以备份哈希代替校验
- 恢复口径：retained 移回仓内即恢复演示视频；quarantine 移回即恢复转储（本为一次性产物，无需恢复）
- 清理后基线校验：`npm run baseline:check` **OK 443**（两个文件均不在基线清单内，基线无感）；3D 仓门禁其余项未受影响

### 2026-11-12 · 续办记录（基线同步，非清理）

- 来源：主仓 `docs/ASSET_CLEANUP_LOG.md` 同日「下游待办」。
- 执行：`npm run baseline:sync` → 2 个文件更新（`js/game.js` 11917 → 11922 行、`tools/test-v3.cjs`），437 个内容相同跳过；`BASELINE.sha256.json` 重建为 443 个文件（快照 2026-11-12，上游 返航录V3.7 / 3.7.0）；`package.json` 上游标识同步。
- `3d/spec/port-manifest.json` X-BIND 行段末值 11917 → 11922（只改末值，notes 追加本次同步记录，认领语义不变）。
- 门禁复跑：`3d:port:check` OK（0 错 / 1 条既有 legacy WARN，js 22 文件 19936 行）、`baseline:check` OK 443、`agent:contract` PASS、`guard` PASS。
- 未竟项仍在：根目录 `返航录3D_演示_68s.mp4` 出仓未成（系统级进程占用），详见上方「游离文件 A 档」的未竟项条目（含续办排查记录与后续一条命令）。

## 单次执行明细模板

```
### YYYY-MM-DD · <批次名>
- 层级 / 保留期到期：L? / YYYY-MM-DD
- 冻结确认：...
- 备份路径：<仓外绝对路径>  （确认方式：文件数 / 体积比对）
- 处理方式：系统回收站（非永久删除）
- 批次：每批 ≤10，共 N 批
- 逐批校验：数量 / 体积 / 抽样哈希
- 恢复口径：回收站 → 备份副本 → Git 历史（仅已入库文件）
- 清单：逐文件路径另附于本次执行记录，或引用 `专项检查_明细_*.csv` 的筛选结果
- 清理后基线校验：npm run baseline:check（3D 版）/ git status（主仓）
```

## 禁止事项

- 不得删除 L0 运行时资产、`.env`、`android/release.keystore`、`*.json.gz` 基线、`BASELINE.sha256.json`、`.git/`、L5 规范层文档。
- 不得在 `assets/` 白名单目录内删文件而不检查 `tools/deploy-pages.cjs`。
- 不得以「修改时间久」或「文件名带 v1 / 日期」作为删除依据。

### 2026-11-11 · 首次清理执行

- 范围：专项清单中全部 `✅ 可清` 批次（L4 缓存 + 到期项 + 用户授权提前清理的 L3 退役/时间戳备份、`.blend1`、报告输出、门禁日志）；逐文件见 `清理目标清单_执行版_2026-11-11.csv`。
- 冻结确认：执行前 3,381 个源文件全部存在，清单与体积已固化。
- 完整备份：`backups/2026-11-11/cleanup-full/`（3,381 个 / 1,383.78 MB，体积校验一致）。
- 处理方式：系统回收站 API 被环境安全策略禁用，改用 `Move-Item` **原样移动**到 `quarantine/2026-11-11/<项目>/<相对路径>`，**未做永久删除**。
- 批次与校验：每批 ≤10 个，共 339 批；逐批校验存在性 / 体积 / 抽样 SHA256，错误 0；项目内目标残留 0。
- 恢复口径：`quarantine/2026-11-11/RESTORE.md` + `RESTORE_MAP.csv` 一键还原；隔离区与备份副本为两份独立副本，任意一份可用。
- 清理后校验：两仓 `npm run guard` PASS（45.59 MB）、`npm run agent:contract` PASS（红线 14 条哈希 `4838f60b0992b6e0`）；3D 版 `node tools/sync-baseline.cjs --rebuild` 保留 424 / 移出 32，`npm run baseline:check` OK 425 个文件。
- 已入库文件：本仓 tracked 文件在 `git status` 显示为 `D`（删除未提交），原样移回即可恢复；若已提交删除，用 `git checkout HEAD -- <相对路径>`。
- 未纳入：`⚠️ 需确认` 批次（screenshots / `docs/qwen21/` / APK 打包副本 / `_raw*` / `_qwen_refs` 等）与 `⛔ 保留` 资产，本轮一律未动。

## 2026-11-11 回滚记录（事故复盘）

- 现象：清理后从桌面快捷方式进入 3D 版，模型在、贴图全空。
- 根因：`3d/preview/.godot/imported/*.ctex` 被误判为 L4 可重建缓存并移出；Godot 运行时直接读这些 `.ctex`，源 PNG 不会自动重新导入。
- 回滚：两仓共 2,298 个 `.ctex`（879.88 MB）+ 36 个 `*-c0/c1/c2.png`（7.56 MB）已从隔离区原样还原，`imported/` 恢复 1,071 / 1,227 个，候选帧各 18 个，0 错误。
- 校验：3D 版 `baseline:check` OK 443；两仓 `guard` / `agent:contract` PASS。
- 规则修正：规范新增 §8B 与 L0′ 运行时依赖层；`docs/ASSET_LAYERS.md` 与四份清单 CSV 中这两批次改标 ⛔ 保留；`RESTORE_MAP.csv` 标注还原状态。
- 剩余隔离：1,047 个 / 496.34 MB（退役备份、时间戳备份、`.blend1`、报告输出、门禁日志），不影响运行。

## 2026-11-12 素材引用复核（3D 侧）

- 结论：移入素材层 `unreferenced/` 的过期副本未参与 3D 运行时；完整证据与两仓结果见主仓 `docs/ASSET_CLEANUP_LOG.md` 同名条目。
- 3D 实跑：`--devicetest` exit 0、`--mgtest 14/14`、`--audiotest` exit 0、`--tasktest 26/0`、`--simtest 26/0`，无缺失资源报错。
- 已知非本轮缺口：`panel-breaker.png` / `panel-task.png` 本就不存在（`device.gd` 回退，`port-manifest` 已登记）；`cabin/<room>` 6 张缺失属未启用的 qwen 全覆盖回退分支。
- 残留：`3d/preview/.godot/imported` 有被移出贴图的 `.ctex` 缓存，不被路径引用，尚未清理。

## 2026-11-12 报告清理（T3 保留，报告删除）

- 范围：3D 19 件（`3d/preview/reports/` 5 份、`3d/reports/` 10 份生成报告、`AUDIT_CORE_MECHANICS*` 2 份、`资产耦合图谱_20261112.md`、`baseline-history-3d.md`）；2.5D 22 件同批（见主仓台账）。
- 另清 2 件历史/退役件：`3d/docs/art/WORKFLOW_SDXL_BLENDER.md`、`3d/docs/plan/PLAN_INPUT_COMBAT_UI_20261111.md`；合计 **21 件**。
- 冻结/备份：`C:\Users\ASUS\Documents\returnlog_report_cleanup_20261112\backup\{3d,obsolete-3d}\`，21 件，逐文件 SHA256 比对一致。
- 处理：移动至 `...\quarantine\{3d,obsolete-3d}\<相对路径>`，每个 manifest 每批 ≤10；原文件缺失 0；未永久删除。
- 恢复：隔离区原样移回 → 备份副本 → Git 历史（tracked 文件当前 `git status` 为 `D`）。
- 校验：`check` 7/0、`baseline` 446 OK、`docs:check` PASS、`agent:contract` PASS、`guard` PASS；报告可用 `npm run 3d:audit:port` / `3d:audit:coreui` / `3d:poc:speech` / `audit:parity` 重新生成。
- 共享规范自动化：`npm run docs:sync` 从 2.5D 生成 `docs/agent/REDLINES.md` / `docs/ASSET_GOVERNANCE.md`；`npm run docs:check` 已接入 CI。
- 保留：`PARITY_DECISIONS.md` / `applicability-3d.md` 等裁决与规范；`3d/reports/js-simdump-20261108.json` 为数据夹具，非报告，未动。
