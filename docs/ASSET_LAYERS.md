# 资产层级登记表

> 依据 `docs/ASSET_GOVERNANCE.md` §4–§6。**新增任何目录或迭代批次必须在此登记**，未登记的目录按 L2 / L3 的最短保留期处理。
> 三态含义：入库（`.gitignore`）、发布（`tools/deploy-pages.cjs` 的 ENTRIES / SKIP）、磁盘留存（本表保留期）。
> 首次登记：2026-11-11，依据同日全量只读扫描。
> 本表描述**现行状态**。3D 版已于 2026-11-11 通过 `npm run baseline:sync` 同步 SKIP 修复（未手改基线文件），两仓发布白名单一致；同步记录见 `docs/ASSET_GOVERNANCE.md` §8A。

## 已登记目录

| 目录 / 模式 | 层 | 入库 | 发布 | 保留期 | 再生成方式 | 备注 |
|---|---|---|---|---|---|---|
| `js/` | L0 | 是 | 是 | 永久 | 单一真源 | 游戏代码 0.63 MB |
| `audio/` | L0 | 是 | 是 | 永久 | — | 含 CREDITS 署名 |
| `assets/scene/v4/base-lit.png`、`hull-deck.png` | L0 | 是 | 是 | 永久 | `blender-ship.py` 烘焙 | 13.54 / 6.96 MB，P4 压缩目标 |
| `assets/scene/v4/tex/door-panel.png` | L0 | 是 | 是 | 永久 | — | `drawDoors` 运行时采样，唯一例外 |
| `assets/scene/v4/facility/*.png`（无后缀） | L0 | 是 | 是 | 永久 | `tools/fx-post.py` 合成 | 正式图 |
| `assets/scene/bg/`、`crew/`、`station/`、`minigame/`、`portfolio/` | L0 | 是 | 是 | 永久 | — | 运行时资源 |
| `assets/qwen-lib/*.png` | L1 | 否 | **否（P0 已排除）** | 永久 | 千问出图 + `blender-ship.py` | 78.03 MB 烘焙源材质，MANIFEST 兜底 |
| `tools/_qwen_refs/` | L1 | 否 | 否 | 永久 | 色调对齐 bake | 62.11 MB |
| `assets/scene/v4/tex/*`（除 door-panel） | L1 | 否 | 否 | 永久 | Blender/SDXL 复用 | 源材质 |
| `3d/assets/models/*.blend`、`3d/assets/export/*.glb` | L1 | 是 | 否 | 永久 | 建模导出 | Godot 资产 |
| `3d/preview/assets/textures/` | L1 | 否 | 否 | 永久 | 由 `v4/tex` 复制 | Godot 本地依赖，删了工程跑不起来 |
| `3d/preview/assets/models/` | L1 | 是 | 否 | 永久 | — | 836 个文件，无旧版命名残留 |
| `assets/scene/v4/facility/_raw/`、`_raw_fx/` | L2 | 否 | **否（P0 已排除）** | 14 天 | `blender-fx.py` → `fx-post.py` | 渲染中间帧 |
| `tools/screenshots/`、`3d/preview/screenshots/` | L2 | 否 | 否 | 14 天 | 重跑截图脚本 | 175 MB |
| `docs/qwen21/`（cabin-refs / room-skins / surfaces / task-refs） | L2 | 两仓口径待对齐 | 否 | 14 天 | `gen-art-refs.ps1` | 220 MB 生成过程配图 |
| `tools/*-report.md`、`*-results.json`、`mc-results.json` | L2 | 否 | 否 | 14 天 | `npm run sim` / 对应审计脚本 | `.json.gz` 压缩基线属 L5，保留 |
| `_backup/YYYYMMDD_*` | L3 | 否 | 否 | 30 天 | 见 `3d/CHANGELOG.md` 恢复口径 | 主仓 265 MB |
| `tools/_bak/<主题>-YYYYMMDDHHMMSS/` | L3 | 否 | 否 | 30 天 | 对应工具重跑 | 主仓 186 MB |
| `*-c0/c1/c2.png` | **L0′ 运行时变体** | 是 | 否 | **永久（禁止清理）** | — | 3D 工程引用的颜色 / 状态变体；2026-11-11 误清后已还原 |
| `*.blend1` | L3 | 否 | 否 | 30 天 | Blender 自动备份 | 251 个 / 39 MB |
| `android/assets/www/` | L3 | 否 | 否 | 30 天 | `build-apk-assets.cjs` | 44 MB 打包副本 |
| `3d/preview/.godot/imported/*.ctex` | **L0′ 运行时依赖** | 否 | 否 | **禁止直接清** | 须先由 Godot 编辑器重新导入并验证 | 2026-11-11 误清事故，见规范 §8B |
| `docs/` 规范层、`*_planned/`、`_proposals/`、`_reference/` | L5 | 是 | 否 | 永久 | — | 2026-11-04 用户裁定「一切层均进库」 |
| `docs/` 带日期的调研 / 交接 / 审查文档 | L5 | 是 | 否 | 归档后清 | — | 18 篇，改动需 `git rm` |
| `BASELINE.sha256.json`、`*.json.gz`、`.env`、`android/release.keystore` | L5 | 是 | 否 | **永久保留** | — | 凭据与基线，禁止清理 |

## 新登记模板

```
| <目录或模式> | L0–L5 | 是/否 | 是/否 | 永久 / N 天 | <重生成脚本或「无」> | <来源 / 许可 / 恢复口径> |
```

登记时一并确认四处同步：两仓 `.gitignore`、两仓 `tools/deploy-pages.cjs`、`assets/MANIFEST.json`、`BASELINE.sha256.json`（见规范 §7）。
