# 新返航录 3D 版

> **独立工程** · 2026-11-09 从 `C:\Users\ASUS\Desktop\新返航录\` 分离
> 3D 版本 **`V1P-0.1` / `0.1.0`**（真源 `3d/version.json`）· 移植基线 **`返航录V3.6` / `3.6.0`**
> 引擎 **Godot 4.6 stable**（GL Compatibility）· 状态：**垂直切片 / 预演，不是正式 3D 客户端**
> ⚠ 当前现场状态：**玩家除移动外无法进行任何操作**（见 §4）。本轮只做分离，未修此问题。

## 1. 这是什么

把原仓的 `3d/` 子项目整体拆成一个**能独立打开、独立跑门禁、独立提交**的工程。
2.5D 的规则 / 数值 / 语料 / 地图真源以**只读基线**随仓带走，
目的是让「3D 是 2.5D 的延伸，不是第二条产品线」这条红线在本工程内仍然可闭环：
改 3D 之前能就地查到 2.5D 源头，而不需要跨仓猜，也不允许借「已经独立了」自造规则。

**边界**：运行时只有 `3d/preview/`（Godot 工程）。根目录的 `js/`、`assets/`、`audio/`、`tools/`
不是 3D 代码，是只读基线镜像，**禁止修改**（`AGENTS.md` §二 / `BASELINE.md`）。

## 2. 快速开始

```powershell
# 0) 本机一次性自测依赖（playwright-core，供 3d/tools/simdump.cjs 用）
npm i

# 1) Godot 二进制（不在 PATH 上）
$GODOT = "E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe"

# 2) 首次导入资源
& $GODOT --headless --path 3d/preview --editor --quit

# 3) 正常游玩（先出开始页，选人类 / 异形再点「进入舱段」）
& $GODOT --path 3d/preview --resolution 1280x720

# 4) 只读门禁 / 全量数据导出
npm run check
npm run export:all
```

命令行统一 **PowerShell 7**（`pwsh`）；完整命令表与本机环境路径见 `AGENTS.md` §四。

## 3. 目录

| 路径 | 内容 |
|---|---|
| `3d/preview/` | **唯一运行时**：`project.godot` / `scenes/` / `scripts/`（GDScript）/ `data/`（导出 JSON）/ `assets/` |
| `3d/tools/` | 数据导出、资产同步、契约校验（Node / Python / PowerShell） |
| `3d/spec/` | 契约唯一口径：`parity-map.json` / `port-manifest.json` / `assets.manifest.json` / schema / 约定 |
| `3d/assets/` | 仓库级资产库：模型 GLB / 贴图 / 渲染 / 参照图 |
| `3d/*.md`、`3d/version.json` | 3D 架构 / 决策 / 迁移 / 交接 / 资产台账 / 变更记录 / 版本真源 |
| `js/`、`assets/`、`audio/`、`tools/`、`index.html` | **2.5D 只读基线**（见 `BASELINE.md`），供 `3d/tools/export-*.cjs` 与 `check-*.cjs` 使用；`index.html` 只是移植清单登记的对账对象，不是 3D 入口 |
| `docs/` | 2026-11-09 起移出基线：仅留 `qwen21/` 千问出图留档；2.5D 时代文档已清理（原仓保留） |
| `package.json` | 本工程脚本清单；`version` / `gameVersion` 是上游基线标识，不是 3D 版本 |
| `AGENTS.md` | 工程契约：**§一 逐字沿用原仓 12 条红线**，§三 是本工程的适用性映射 |
| `SPLIT.md` / `BASELINE.md` / `CHANGELOG.md` | 分离记录 / 基线说明 / 工程级变更 |

> 为什么根目录还留着 `js/` 和 `3d/` 两层？见 `SPLIT.md` §2 —— 这是为了让原工具链与
> spec 清单里写死的「仓库根 → `3d/`」路径**原样可用**，不改几百处路径、不破坏历史记录。

## 4. 当前已知问题（2026-11-09 现场事实）

| 级别 | 问题 | 状态 |
|---|---|---|
| **P0** | 进入舱段后 WASD / 鼠标视角有效，**E 交互、左键出刀、右键开枪、搜尸、管道、会议等全部无响应** | 未修。排查入口见 `AGENTS.md` §6.1 与 `SPLIT.md` §5 |
| P1 | `npm run 3d:port:check`：**1 错误** —— `js/game.js` 111 行未被认领（首行 11767） | 上游遗留，未修 |
| P1 | `npm run 3d:parity:check`：**FAIL** —— `rules.json` 的 `sources` SHA 与 2.5D 真源不一致（改了 `js/` 未重导） | 上游遗留，未修 |

分离前后的门禁读数逐项一致，**分离没有引入新回归**。按 `AGENTS.md` §一.4，
在这两项转绿之前，任何报告都必须如实写出实跑的失败数，不得沿用旧读数或伪装完成。

## 5. 文档索引

| 想找什么 | 看哪里 |
|---|---|
| 红线、命令、改动流程、门禁读数 | `AGENTS.md` |
| 为什么这样拆、随迁 / 未随迁清单、后续待办 | `SPLIT.md` |
| 只读基线怎么刷新、怎么校验没被改 | `BASELINE.md` |
| 3D 预演做了什么、怎么跑各档自测 | `3d/README.md` |
| 引擎选型、分层硬规则、坐标尺度 | `3d/ARCHITECTURE.md` |
| 接手顺序、历次交接结论 | `3d/HANDOFF.md` |
| 2.5D → 3D 移植批次与 §10 同源口径 | `3d/MIGRATION.md` |
| ADR 决策台账 | `3d/DECISIONS.md` |
| 素材来源 / 许可 / SHA256 | `3d/ASSETS.md`、`assets/CREDITS.md`、`audio/CREDITS.md` |
| 3D 侧可见变更 | `3d/CHANGELOG.md`；工程级变更 | 根 `CHANGELOG.md` |

## 6. 与原仓的关系

- 原仓 `C:\Users\ASUS\Desktop\新返航录\` **保持原样**：本工程是**复制分离**，不是剪切；
  分离时原仓有 55 项未提交 / 未跟踪改动，已一并带入新工程（见 `SPLIT.md` §4）。
- 3D 不再从原仓读取任何文件；`npm run baseline:sync` 是**唯一**的上游刷新入口。
- 2.5D 继续在原仓独立演进；本工程只在需要时刷新基线并重跑导出 / 对账。
- 原仓的 `3d/` 目录暂留作对照与回退兜底，**是否移除由用户裁定**（`SPLIT.md` §5），
  本轮未删除任何原仓文件。
