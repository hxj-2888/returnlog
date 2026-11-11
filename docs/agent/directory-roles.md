> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 二、工程目录职责

| 路径 | 角色 | 可否修改 |
|---|---|---|
| `3d/preview/` | **唯一运行时**：Godot 4.6 工程（`project.godot` / `scenes/` / `scripts/` / `data/` / `assets/`） | 可改（走 §五 流程） |
| `3d/tools/` | 数据导出、资产同步、契约校验（Node / Python / PowerShell，不参与运行时） | 可改（走流程） |
| `3d/spec/` | 契约唯一口径：`parity-map.json` / `port-manifest.json` / `assets.manifest.json` / schema / `conventions.md` | 可改（走流程） |
| `3d/assets/` | 仓库级资产库（模型 / 贴图 / 渲染 / 参照） | 可改，须登记 `3d/ASSETS.md` 与 CREDITS |
| `3d/*.md`、`3d/version.json` | 3D 自己的架构 / 决策 / 迁移 / 交接 / 变更记录 / 版本真源 | 可改（走流程） |
| `js/` | **2.5D 只读基线**：规则 / 数值 / 语料 / AI / 地图的唯一真源镜像，供 `3d/tools/export-*.cjs` 导出、`check-*.cjs` 对账 | **禁止修改** |
| `assets/`、`audio/`、`index.html` | 2.5D 只读基线素材与资料（含 `MANIFEST.json` / `CREDITS.md` / `LICENSE.txt` 署名）；`index.html` 只是 `3d/spec/port-manifest.json` 登记的 `X-ENTRY` 对账对象，**不是 3D 入口** | **禁止修改** |
| `docs/` | **2026-11-09 起移出只读基线**：2.5D 时代的调研 / 交接 / 审查文档已清理（原仓保留），只留 `qwen21/` 千问出图留档（`gen-art-refs.ps1` 的留档目标）；不再参与 `baseline:check` 哈希校验 | 可改（不再属基线） |
| `tools/` | 2.5D 只读基线工具片段（`blender-ship.py` 等）+ 本工程自有的 `sync-baseline.cjs` / `check-all.cjs` | 除这两个新脚本外**禁止修改** |
| `package.json` | 本工程脚本清单；`version` / `gameVersion` 是**上游基线标识**（`3d/tools/export-version.cjs` 依赖），**不是 3D 版本** | 可改 scripts；两个版本字段只由 `baseline:sync` 更新 |
| `BASELINE.sha256.json` | 只读基线哈希清单，由 `sync-baseline.cjs` 生成 | 只由脚本生成 |
| `AGENTS.md`、`README.md`、`SPLIT.md`、`BASELINE.md`、`CHANGELOG.md` | 工程契约 / 说明 / 分离记录 / 基线说明 / 工程级变更 | 按流程追加 |
| `.gitignore` / `.gitattributes` / `.editorconfig` / `LICENSE` | 工程化配置 | 按流程 |

> **为什么根目录仍有 `js/` / `assets/` / `tools/`？**
> 原 3D 工具链、spec 清单、GDScript 注释与全部历史文档都以「仓库根 → `3d/`」两级结构写死路径
> （`ROOT = path.resolve(__dirname,'..','..')` + `path.join(ROOT,'js',...)` / `path.join(ROOT,'3d',...)`）。
> 保留 `3d/` 这一层，等于让**全部导出器、校验器、移植清单、历史文档原样可用**，
> 不必改几百处路径、也不破坏历史记录的可追溯性。详见 `SPLIT.md` §2。
