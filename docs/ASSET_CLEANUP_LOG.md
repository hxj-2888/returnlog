# 资产清理执行台账

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
| 2026-11-11 | L4 缓存 + L3 退役/时间戳备份 + 过期调试输出（✅ 全批次） | 新返航录 | 2037 | 857.83 MB | 见 RESTORE_MAP.csv | backups/2026-11-11/cleanup-full/ + quarantine/2026-11-11/ | RESTORE.md 一键还原 / tracked 用 git restore | WorkBuddy | 339 批全通过 · 体积一致 |
| 2026-11-12 | A 档死音效 + L2/L4 可再生成输出（tools 截图/原始帧/日志 + APK 解包副本） | 新返航录 | 794 | 116.61 MB | — | `C:\Users\ASUS\Documents\returnlog_cleanup_20261112\backup\新返航录\` | 隔离区原样移回 / `git checkout HEAD -- <路径>` | ZCode | 80 批全通过 · 备份全量哈希校验一致 |
| 2026-11-13 | 主仓出清：3D 资产/工具/spec + 素材源包 + 一次性夹具（✅ 全批） | 新返航录 | 610 | 202.7 MB | — | `C:\Users\ASUS\Documents\returnlog_cleanup_20261113\backup\新返航录\` | 素材层/隔离区原样移回；tracked 用 `git checkout HEAD -- <路径>` | Qoder | 616/616 备份哈希一致（+5 MC 补遗） |

### 2026-11-12 · A 档死音效 + B 档可再生成输出/缓存（主仓）

- 层级 / 保留期到期：L0 例外（4 个零引用死音效，见下）+ L2 截图与中间产物 + L4 日志 / 保留期已到
- 范围与依据（详见 `docs/资产耦合图谱_20261112.md` §3/§4）：
  - `audio/sfx-death.ogg`、`sfx-submit.ogg`、`sfx-tick.ogg`、`sfx-vote.ogg` —— 4 个 / ~0.03 MB，全仓（js / index.html / tools）零引用；`sfx-click.ogg` **不在本批**（同日已接线 SND 表，见附带代码改动）
  - `tools/screenshots/` 146 个 / 60.08 MB —— `test-v3.cjs` / `ux-audit.cjs` / `shots-facility.cjs` 输出，重跑即再生
  - `tools/_crew_raw/` 300 个 / 10.54 MB —— `blender-crew.py` 输出（192×320 渲染帧），Cycles 可重渲
  - `tools/_hires-preview/` 13 个 / 1.23 MB；`tools/logs/` 53 个 / 0.64 MB（L4）
  - `android/assets/www/` 278 个 / 44.08 MB —— `build-apk-assets.cjs` 输出副本（L3，未入库）
- 冻结确认：794 个 / 116.61 MB，逐文件 `relpath,bytes,sha256` 落盘 `freeze_新返航录.csv`（仓外备份区）
- 备份路径：`C:\Users\ASUS\Documents\returnlog_cleanup_20261112\backup\新返航录\`（确认方式：全量 SHA256 逐一比对一致）
- 处理方式：隔离区（回收站 API 受环境策略限制，沿用 11-11 的「原样移动」口径：`fs.renameSync` 同卷改名，无删除 API）→ `C:\Users\ASUS\Documents\returnlog_cleanup_20261112\quarantine\2026-11-12\新返航录\<相对路径>`
- 批次：每批 ≤10，共 80 批（`batches_新返航录.csv`）
- 逐批校验：每批移动后核对存在性 / 字节数 / 批首文件哈希，错误 0；空目录壳自底向上 `rmdir` 移除（仅空目录，无文件删除）
- 恢复口径：隔离区原样移回 → 仓外备份副本 → Git 历史（tracked 文件，`git checkout HEAD -- <路径>`；tracked 删除当前呈未提交 D 状态，等用户结账）
- 清理后基线校验：`npm run guard` **PASS**（发布包 280 个 / 45.57 MB，较清理前 −4 文件 / −0.02 MB，即 4 个死音效退出发布面）；主仓无 `BASELINE.sha256.json`，以 git status + guard 代替
- **有意未动**：`tools/_sfx/`（184 个 / 9.95 MB）—— `master-sfx.py` 的输入、CC0 原始音效包、许可留痕源头，建议登记 L1 保留，**待用户裁定**
- 附带代码改动（A 档接线，用户批准）：`js/game.js` SND 表接线 `click`（FILE / TONE / 导出三项，+5 行，11917 → 11922）；`tools/test-v3.cjs` 音频池断言 12 → 13 类同步。门禁实跑：**916 PASS**，与改动相关的断言全过
- 门禁抖动记录（非回归）：test-v3 在本机 headless Edge 下每轮随机失败 3~4 条时序敏感断言；HEAD 与改后各跑一轮，失败集完全不同（HEAD：反常拖尸×2 / 保安拘留 2.6 格；改后：拖尸 0.00 / 藏尸×2），二分证明与本次改动无关，与 `AGENTS.md` §一.5 记录的夹具抖动史同源
- 下游待办 → **2026-11-12 已办结（WorkBuddy 续办）**：3D 仓 `npm run baseline:sync` 实跑「文件 2 个已更新 / 437 个内容相同跳过；清单 443 个文件；上游标识 返航录V3.7 / 3.7.0」，拉入 `js/game.js`（11917 → 11922 行）与 `tools/test-v3.cjs`；`3d/spec/port-manifest.json` 的 X-BIND 行段末值 **11917 → 11922**（只改末值，notes 追加本次同步记录，认领语义不变，沿用 11-10/11-11 两次先例）。复跑门禁：`3d:port:check` 0 错 / 1 条既有 legacy WARN（js 22 文件 19936 行）、`baseline:check` OK 443（快照 2026-11-12）、`agent:contract` PASS、`guard` PASS。音频 4 个死文件 sync 未从 3D 仓删除（sync 设计为不删除），是否同步移除仍待 3D 仓另行裁定

### 2026-11-13 · 主仓出清（3D 资产/工具/spec + 素材源包 + 一次性夹具）

- 层级 / 保留期到期：3D L1/L2 资产与工具、L2 测试夹具、L1 源包；按 §9 保留期登记，未到期前只移不删。
- 冻结确认：`freeze-20261113.tsv` 616 文件 / 196.7 MB（含 11 个保留的 T3 导出链脚本）；
  `freeze-20261113-supplement.tsv` 补遗 5 个 `tools/_mc-*.json` / 6.1 MB；共 610 文件移出主仓。
- 完整备份：`C:\Users\ASUS\Documents\returnlog_cleanup_20261113\backup\新返航录\`
  （616 文件逐一 SHA256 校验一致；5 个 MC 补遗另复制到 `backup/新返航录/tools/`）。
- 处理方式：只移不删（系统回收站 API 受环境策略限制，沿用 2026-11-11/11-12 的「同卷原样移动」口径）：
  - 3D：`3d/assets` 231 文件 / 99.9 MB → `returnlog_assets/3d/assets/`；
    `3d/tools` 65 文件 → `returnlog_assets/3d/tools-archive-20261113/`，主仓保留 11 个
    `export-*.cjs` / `build-map-v2.cjs` / `check-floor-spec.cjs`；
    `3d/spec` 8 文件 + `3d/WORKFLOW_SDXL_BLENDER.md` → `returnlog_assets/3d/spec-archive-20261113/`。
  - 源包：`tools/_qwen_refs` 20 文件 / 62.1 MB → `returnlog_assets/unreferenced/qwen-refs/`；
    `tools/_sfx` 184 文件 / 9.9 MB → `returnlog_assets/referenced/audio-source/`；
    `tools/master-sfx.py` 的 `RAW` 改指素材层（可用 `RETURNLOG_SFX_RAW` 覆盖）。
  - 夹具/产物：15 个 tracked 实验/演示 → `quarantine/tools-lab/`；
    93 个 local 截图/探针/日志/bench + 5 个 `_mc-*.json` → `quarantine/tools-local/`。
- 批次：A（3D）3 组；B（源包）2 组；C（夹具/产物）2 组；共 7 组，逐组核对存在性/体积/抽样哈希，错误 0。
- 逐批校验：616/616 备份哈希一致；空目录壳自底向上 `rmdir`（仅空目录，无文件删除）。
- 恢复口径：素材层/隔离区原样移回 → 仓外备份副本 → Git 历史（tracked 用 `git checkout HEAD -- <路径>`）。
- 清理后门禁：`npm run ci:gate` **919 通过 / 3 失败**（3 条均属已登记抖动，PASS）；
  `npm run t3:check` **13 PASS / 0 WARN / 0 FAIL**；`npm run guard` PASS；
  `node tools/assets-check.cjs` 0 缺失；`npm run agent:contract` PASS。
  主仓 tracked 870 → 380 文件，tracked 体积 194 MB → 49 MB。
- 3D 分支：`origin/3d` 已推送 `0a22bcf`（同步 `js/data/map.js`、`js/game.js`、12 个
  `3d/preview/data` 快照、`3d/spec/port-manifest.json` X-BIND 到 11947、`BASELINE.sha256.json`）；
  `3d:port:check` 0 错误 / 1 旧警告，`3d:parity:check` exit 0（13 条既有硬编码 WARN）。
- **有意未动**（下一批待用户裁定）：`tools/blender-*.py` / `gen-*.py` / `master-sfx.py` 等美术管线、
  `android/` 平台壳、`assets/` 二次引用审计（unreferenced/raw/portfolio）；
  T3 正式门禁、`3d/preview/data` 快照、`3d/tools/export-*.cjs` 导出链保留。

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

## 2026-11-12 产物出仓（截图 / Godot 缓存 / 重复素材）

- 范围：**3,336 文件 / 约 1.13 GB**。2.5D `tools/screenshots` 16 MB、`3d/preview/.godot` 383 MB；3D `3d/preview/screenshots` 85 MB、`3d/docs/audit/player-study-20261112` 24 MB、`3d/preview/.godot` 544 MB、`assets/qwen-lib` 41 张 PNG 79 MB。
- 去向：`returnlog_assets/screenshots/{2.5d-tools,3d-preview,player-study-20261112}`、`caches/{godot-2.5d-stale,godot-3d}`、`unreferenced/qwen-lib-baseline-mirror`；逐文件 SHA256 追加到 `asset-layer-manifest.tsv`（5,570 行）。
- 运行时处理：3D `.godot` 移出后以 junction 指回 `caches/godot-3d`；Godot 无头冒烟 exit 0、`simtest 26/0`。2.5D `.godot` 是过期缓存，无联接。
- 同步修正：`PLAYER_STUDY_20261112.md` 截图路径改素材层；3D `assets/qwen-lib` 只留 README/清单，`baseline` 由 448 重建为 **407**；治理规范 §8B/附录 B 同步。
- 校验：T3 13 PASS / 0 WARN / 0 FAIL；`guard` PASS；3D `check` 7/0、`simtest` 26/0、`navtest` 28/0、`tasktest` 26/0、`baseline` 407 OK、`docs:check` PASS。
- 注意：`caches/godot-3d` 是运行时依赖，不得直接清；`unreferenced/` 永久删除仍需用户逐项确认。

## 2026-11-12 素材引用复核（搬移后，只读核验）

- **目的**：确认移入 `unreferenced/` 的过期副本没有被游戏运行时引用，避免“清理导致缺图”。
- **方法**：把移出的每个文件名 / 精确路径在两仓的 `js/`、`3d/preview`、`3d/spec`、`3d/tools`、`tools`、`index.html`、`css` 中反查；再跑运行时门禁。脚本 `returnlog_report_cleanup_20261112/audit-references.cjs`。
- **2.5D 结果**：运行时只读 `assets/scene/v4/tex/door-panel.png`（`js/game.js:8840`）；`3d/preview/assets/*` 与 `assets/qwen-lib/*` 零运行时引用。同名文件在 `audio/`、`assets/minigame/`、`assets/scene/cozy/` 另有真实副本。实跑 `npm test` **919 通过 / 0 失败、控制台零报错**。
- **3D 结果**：旧 `textures/panel/*` 26 张与 6 张根图无精确路径引用；`panels.json` 全部指向 `qwen/<room>/panel-*.png`；动态材质只读保留的 `panel-metal` / `panel-white` / `wall-panel`。实跑 `--devicetest` exit 0、`--mgtest 14/14`、`--audiotest` exit 0、`--tasktest 26/0`、`--simtest 26/0`，无缺失资源报错。
- **发现（非本轮引入）**：`panel-breaker.png` / `panel-task.png` 本就不存在，`device.gd:235` 用 `ResourceLoader.exists` 回退纯色，`port-manifest.json:216` 已登记“lever 图内化未做”；`cabin/<room>.png` 有 6 张缺失，但当前 10 舱全部命中 `CABIN_QWEN_ROOMS`，该 fallback 不会执行，属未来新增舱室的潜在缺口。
- **构建引用边界**：`qwen-lib/`、`scene-v4-tex/`、`2.5d-preview-textures/qwen/` 是 Blender 构建读取，保留在 `referenced/`；已修 `gen-armory-deck.py`（写 `referenced/2.5d-preview-textures`）与 `gen-qwen-room-skins.ps1`（写 `unreferenced/qwen21/3d`），防止生成脚本把旧目录重新造回来。
- **残留**：`3d/preview/.godot/imported` 仍有被移出贴图的 `.ctex` 缓存；它不被场景/脚本按路径引用，属可清理缓存，尚未动。
- **结论**：`unreferenced/` 中的过期副本**未参与游戏运行时**；本次搬移没有造成运行时缺图或资源加载报错。

## 2026-11-12 素材库二次分类（referenced / unreferenced）

- 结构：素材层拆为 `returnlog_assets/referenced/`（引用素材库，258 MB）、`returnlog_assets/unreferenced/`（未引用素材库，482 MB）、`returnlog_assets/release/`（发布产物 45 MB）。
- `referenced/`：`qwen-lib/` 43 文件、`scene-v4-tex/` 3 文件、`2.5d-preview-textures/qwen/` 103 文件（Blender 烘焙读取的 10 舱 floor/skin1）。
- `unreferenced/`：`qwen21/` 172 文件、`models/2.5d-preview-stale/` 1,672、`textures/2.5d-preview-stale/` 129、`textures/3d-unreferenced/` 64、`2.5d-preview-assets/` 48。
- 清单：`asset-layer-manifest.tsv` 2,234 条 `dest` 全部改到新路径，逐条存在性校验 0 缺失。
- 脚本：`blender-ship.py` / `gen-materials.py` / `blender-fx.py` / `gen-{hires,sdxl}-skins.py` 读 `referenced/`；`gen-art-refs.ps1` 写 `unreferenced/qwen21`；3D `baseline:sync` 4 文件 / 448 清单。
- 校验：T3 10 PASS / 3 WARN / 0 FAIL；`agent:contract` PASS；`guard` PASS；`assets-check` 0 缺失；3D `check` 7/0、`floor:check` 11 项、`baseline` 448 OK、`docs:check` PASS。

## 2026-11-12 预览件清空 + v4 tex 源贴图出仓

- 范围：2.5D `3d/preview/assets/{audio,crew,plates,import-probe}` 51 文件 / 3.8 MB + `assets/scene/v4/tex/{ao-soft,floor-grate,wall-panel}.png` 3 文件 / 7.3 MB，合计 **54 文件**。
- 去向：`returnlog_assets/2.5d-preview-assets/`、`returnlog_assets/scene-v4-tex/`；逐文件 SHA256 追加到 `asset-layer-manifest.tsv`（累计 2,234 行）。
- 引用处理：`assets/scene/v4/tex` 运行时只保留 `door-panel.png`；`tools/blender-ship.py`、`tools/blender-fx.py`、`tools/gen-materials.py`、`3d/tools/gen-{hires,sdxl}-skins.py` 改为优先读素材层（保留仓内回退）。
- 同步修正：`assets/MANIFEST.json` 移除最后 3 条（3 → 0），`assets-check` 0 缺失；3D `baseline:sync` 拉入 6 个镜像文件（448 清单）。
- 校验：T3 10 PASS / 3 WARN / 0 FAIL；`agent:contract` PASS；`guard` PASS；3D `check` 7/0、`floor:check` 11 项、`baseline` 448 OK、`docs:check` PASS。
- 保留：2.5D `3d/preview/assets/licenses/`（署名不可删）；`assets/scene/v4/facility/*` 运行时资产未动。

## 2026-11-12 素材源出仓（models + qwen-lib）

- 范围：2.5D `3d/preview/assets/models/` 1,672 文件 / 141 MB + `assets/qwen-lib/` 43 文件 / 79 MB，合计 **1,715 文件**。
- 去向：`C:\Users\ASUS\Documents\returnlog_assets\models\2.5d-preview-stale\`、`qwen-lib\`；逐文件 SHA256 追加到 `asset-layer-manifest.tsv`（累计 2,183 行）。
- 引用处理：`tools/blender-ship.py` 与 2.5D `3d/tools/build-3d-assets.py` 改为优先读 `RETURNLOG_ASSET_LAYER`（默认 `%USERPROFILE%\Documents\returnlog_assets`），保留仓内回退；3D `baseline:sync` 同步更新镜像工具（3 文件 / 448 清单）。
- 同步修正：2.5D `assets/MANIFEST.json` 移除 40 条 qwen-lib 条目（43 → 3），`node tools/assets-check.cjs` 3/0；治理规范 L1 示例与附录 B 改为素材层路径。
- 校验：T3 10 PASS / 3 WARN / 0 FAIL；`agent:contract` PASS；`guard` PASS；3D `check` 7/0、`floor:check` 11 项、`baseline` 448 OK、`docs:check` PASS。
- 未动：2.5D `3d/preview/assets/{audio,plates,crew,import-probe}`、`assets/scene/v4/tex` 与 `3d/spec/*` 过期副本。

## 2026-11-12 贴图出仓（素材层）

- 范围：2.5D `3d/preview/assets/textures/` 232 文件 / 253 MB + `docs/qwen21/` 89 文件 / 118 MB；3D `docs/qwen21/` 83 文件 / 104 MB + 零引用运行贴图 64 文件（6 张根图 + 旧 `panel/`，含 `.import`）。合计 **468 文件**。
- 去向：`C:\Users\ASUS\Documents\returnlog_assets\`（`textures/2.5d-preview-stale/`、`textures/3d-unreferenced/`、`qwen21/2.5d/`、`qwen21/3d/`）；逐文件 SHA256 / 原路径见 `returnlog_assets/asset-layer-manifest.tsv`。
- 引用判定：3D 运行贴图按 `res://` 字面量 + 动态路径（`qwen/<rid>/`、`cover/`、`cabin/`、`floor_spec`、`panels.json`）核对；**被引用的 131 张保留原位**，未引用的才移出。
- 同步修正：2.5D `assets/MANIFEST.json` 移除 28 条预览贴图条目（71 → 43），`node tools/assets-check.cjs` 43/0；两仓 `gen-art-refs.ps1` 留档目标改到素材层；治理规范附录 B 与相关文档引用同步。
- 校验：T3 10 PASS / 3 WARN / 0 FAIL；`agent:contract` PASS；`guard` PASS；3D `check` 7/0、`floor:check` 11 项、`baseline` 448 OK、`simtest` 26/0、`docs:check` PASS。
- 未动：3D 运行目录中仍有 131 张被引用贴图；2.5D `3d/preview/assets/models/`（141 MB）、`assets/qwen-lib/`（79 MB）与 `3d/spec/*` 过期副本待下一轮判定。

## 2026-11-12 文档分类收缩（docs 扁平化）

- 范围：2.5D 11 件（`docs/agent/commands.md`、`process.md`、`BRANCHES.md`、`PORTING_CONTRACT.md`、`ASSET_LAYERS.md`、`_planned/` 5 件、`_reference/README.md`）；3D 9 件（`docs/agent/` 5 件、`3d/docs/audit/PORT-DIFF-AUDIT.md`、`3d/docs/README.md`、`SPLIT.md`、`docs/ASSET_LAYERS.md`）。合计 **20 件**。
- 冻结/备份：`C:\Users\ASUS\Documents\returnlog_report_cleanup_20261112\backup\{shrink-2.5d,shrink-3d}\`，逐文件 SHA256 比对一致。
- 处理：移动至 `...\quarantine\{shrink-2.5d,shrink-3d}\<相对路径>`（2.5D 11 件分两批、3D 9 件一批）；原文件缺失 0；未永久删除。空目录 `docs/agent`、`docs/_planned`、`docs/_reference`、`docs/_proposals` 已移除。
- 合并去向：`commands+process → docs/workflow.md`；`BRANCHES → README 附录`；`ASSET_LAYERS → docs/ASSET_GOVERNANCE.md 附录 B`；`acceptance/REDLINES → docs/`；`applicability+PARITY_DECISIONS → 3d/PORTING_PROTOCOL.md 附录 A/B`；`PORT-DIFF-AUDIT §J → 附录 C`；`process-3d → 3d/HANDOFF.md §0.10`；`directory-roles → 3d/ARCHITECTURE.md 附录`。
- 保留：3D `3d/docs/audit/PLAYER_STUDY_20261112.md` 与其截图（当日现场调研，未纳入本轮）；`3d/docs/art/` 三份美术文档按贴图线暂缓。
- 校验：T3 `10 PASS / 3 WARN / 0 FAIL`；`agent:contract` PASS（`6df0f075a21422b9`）；`guard` PASS；3D `check` 7/0、`baseline` 448 OK、`docs:check` PASS。

## 2026-11-12 文档二次清理（过期 3d 快照 + 平衡报告）

- 范围：2.5D `3d/` 8 份过期快照文档（`ARCHITECTURE` / `ASSETS` / `CHANGELOG` / `DECISIONS` / `HANDOFF` / `MIGRATION` / `README` / `spec/conventions`）+ `tools/_mc-*.md` 10 份平衡调研报告 + 3D `docs/handoff/HANDOFF_2026-11-11.md` + `docs/audit/REDLINE-AUDIT.md` + `docs/migration/MIGRATION.md`，合计 **21 件**。
- 冻结/备份：`C:\Users\ASUS\Documents\returnlog_report_cleanup_20261112\backup\{stale-3d-docs-2.5d,mc-reports-2.5d,handoff-3d,redline-audit-3d,migration-3d}\`，逐文件 SHA256 比对一致。
- 处理：移动至 `...\quarantine\{stale-3d-docs-2.5d,mc-reports-2.5d,handoff-3d,redline-audit-3d,migration-3d}\<相对路径>`，每批 ≤10；原文件缺失 0；未永久删除。
- 恢复：隔离区原样移回 → 备份副本 → Git 历史（tracked 文件当前 `git status` 为 `D`）。
- 保留：2.5D `3d/preview/data/`、`3d/tools/`、`3d/assets/` 共享侧；`3d/WORKFLOW_SDXL_BLENDER.md`（贴图管线，用户指示暂缓）；`3d/spec/*` 仍为过期副本，待下一轮单独判定。
- 校验：T3 9 PASS / 4 WARN / 0 FAIL；`agent:contract` PASS（`6df0f075a21422b9`）；`guard` PASS（45.57 MB）；3D `check` 7/0、`baseline` 446 OK、`docs:check` PASS。

## 2026-11-12 报告清理（T3 保留，报告删除）

- 范围：2.5D 22 件（19 份带日期 md + `docs/agent/baseline-history.md` + `tools/mc-results*.json.gz`）；3D 19 件（`3d/preview/reports/` 5 份、`3d/reports/` 10 份生成报告、`AUDIT_CORE_MECHANICS*` 2 份、`资产耦合图谱_20261112.md`、`baseline-history-3d.md`）。
- 另清 5 件历史/退役件：2.5D `docs/agent/architecture.md`、`docs/agent/filemap.md`、`docs/_proposals/G1/ARCHITECTURE.md`；3D `3d/docs/art/WORKFLOW_SDXL_BLENDER.md`、`3d/docs/plan/PLAN_INPUT_COMBAT_UI_20261111.md`。合计 **46 件**。
- 冻结/备份：`C:\Users\ASUS\Documents\returnlog_report_cleanup_20261112\backup\{2.5d,3d,obsolete-2.5d,obsolete-3d}\`，46 件，逐文件 SHA256 比对一致。
- 处理：移动至 `...\quarantine\{2.5d,3d,obsolete-2.5d,obsolete-3d}\<相对路径>`，每个 manifest 每批 ≤10；原文件缺失 0；未永久删除。
- 恢复：隔离区原样移回 → 备份副本 → Git 历史（tracked 文件当前 `git status` 为 `D`）。
- 校验：T3 `9 PASS / 4 WARN / 0 FAIL`（C3b 已改为「历史分册已清理」PASS）；`agent:contract` PASS；`guard` PASS；3D `check` 7/0、`baseline` 446 OK、`docs:check` PASS、`guard` PASS。
- 共享规范自动化：2.5D `agent:contract:write` 生成 `docs/agent/REDLINES.md`；3D `docs:sync` / `docs:check` 从 2.5D 生成 `REDLINES.md` / `ASSET_GOVERNANCE.md`，CI 已接入 `docs:check`。
- 保留：T3 `docs/agent/acceptance.md` + `tools/check-t3.cjs` + CHANGELOG 读数；`ASSET_LAYERS.md` 3D 专属行保留为本地附录。
