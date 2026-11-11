> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 四、命令

| 目的 | 命令 |
|---|---|
| 首次装自测依赖 | `npm i`（仅需 `playwright-core`；`node_modules/` 不入库） |
| 首次导入资源 | `$GODOT --headless --path 3d/preview --editor --quit` |
| 正常游玩 | `$GODOT --path 3d/preview --resolution 1280x720` |
| 无头冒烟 | `$GODOT --headless --path 3d/preview --quit-after 3` |
| 全量数据导出 | `npm run export:all`（map / minigames / space / sim / lines / rules / version） |
| 单条导出 | `npm run 3d:export:map` / `3d:export:minigames` / `3d:export:space` / `3d:export:sim` / `3d:export:lines` / `3d:export:rules` / `3d:export:version` |
| 全量只读门禁 | `npm run check`（assets / import / port / events / lines / parity / ui 串跑） |
| 单条门禁 | `npm run 3d:assets` / `3d:import:check` / `3d:port:check` / `3d:events:check` / `3d:lines:check` / `3d:parity:check` / `3d:ui:check` |
| 自动移植审计 | `npm run 3d:audit:port`（只读分层报告，不参与 `check`） |
| core/UI 审计 | `npm run 3d:audit:coreui`（game.js 函数级解耦报告，不参与 `check`） |
| UI spec 契约 | `npm run 3d:ui:check`（已并入 `npm run check`） |
| 自动移植 POC | `npm run 3d:poc:speech`（parseSpeech fixtures + 生成 GDScript，非生产门禁） |
| UI spec POC | `npm run 3d:poc:ui`（会议面板 spec → Godot Control，非生产门禁） |
| 基线校验 / 刷新 | `npm run baseline:check` / `npm run baseline:sync`（可选 `-- --source <原仓路径>`） |
| 玩家探针（真实窗口） | `npm run 3d:probe`（真实 E / 数字键 / 左键 / F2；DEV 无敌与面板） |
| 截图/机位（不捕获鼠标） | `--shot` / `--crewshot` / `--doorshot` 等；共同约束见 §五.8 |
| 模型同步 | `npm run 3d:sync:models`（`3d/assets/export/*.glb` → `3d/preview/assets/models/`） |
| 千问出图 | `npm run 3d:refs:cabin` / `3d:refs:tasks`（**必须 pwsh 7**，本地生成） |

**Godot 二进制**（本机绝对路径，不在 PATH 上）：

```
标准版  E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe
完整版  E:/ai-tools/godot/Godot_v4.6-stable_mono_win64/Godot_v4.6-stable_mono_win64_console.exe
```

**其余本机环境**（沿用原仓 `AGENTS.md` §二）：Blender 5.2.2 唯一权威版本
`E:\SteamLibrary\steamapps\common\Blender\blender.exe`；千问本地
`E:\ai-models\qwen-image-2.1` + `E:\ai-tools\sdcpp\vulkan\sd-cli.exe`；
Python `C:\Python314\python.exe`；PowerShell 7（`pwsh`，本机 7.6.5）。
调用命令行统一用 **PowerShell 7**，不要用 Windows PowerShell 5.1；仅在脚本确实依赖 POSIX 工具时才另选。
