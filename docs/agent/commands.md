> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 二、命令

| 目的 | 命令 |
|---|---|
| 直接试玩 | 双击 `index.html` |
| 本地服务 | `npm start`（`node tools/serve.cjs`，默认 5173） |
| 全量门禁 | `npm test`（即 `node tools/test-v3.cjs`） |
| 门禁依赖 | 本仓 devDependency `playwright-core@^1.64.1`；`npm i` 后 `npm test` 直接可跑（2026-11-04 实测） |
| 指定 Playwright（后备） | 仅当 `node_modules` 缺失时：`PLAYWRIGHT_CORE=/path/to/playwright-core npm test` |
| 蒙特卡洛 | `npm run sim`（1000 局 AI 对 AI，seed 可复现；汇总 `tools/mc-report.md` **入库**；原始局 `tools/mc-results.json` 是本地工作文件，入库形态为 `tools/mc-results.json.gz`） |
| 调试模式 | `index.html?test`（跳过开局会议）/ `?dev`（DEV 面板）/ `&strict` |

### PowerShell 7（强制）

- **只在需要调用命令行时使用**：能用专用工具、API 或直接编辑完成的操作，直接用对应工具，不要为了用命令行而用命令行。
- 需要调用命令行时，统一用 **PowerShell 7**：`pwsh` / `pwsh.exe`；**不要用 Windows PowerShell 5.1**（`powershell.exe`）。
- 默认不用 Git Bash / `cmd.exe`；仅当项目脚本明确依赖 POSIX 工具且无法用 PowerShell 等价实现时，先说明原因再使用。
- 多行脚本写成临时 `.ps1`，用 `pwsh -NoProfile -File` 调用；环境变量用 `$env:VAR='...'`，路径含空格时加引号。
- 校验：`pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'` 应输出 7.x（本机 7.6.5），不是 5.1。

### 本机环境（后续 Agent 直接照这个用，**不要再说"Blender 没装"**）

| 工具 | 绝对路径 / 说明 |
|---|---|
| Blender | **`E:\SteamLibrary\steamapps\common\Blender\blender.exe`**（Blender 5.2.2 LTS，Steam 版，**唯一权威渲染版本**，见下节） |
| 无头渲染 | `"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P tools/blender-ship.py -- --test` |
| 本地 SDXL（**已退役**） | `D:\ai-models\sdxl-base`（fp16）+ `D:\ai-models\vae-fp16-fix`；2026-11-09 起不再新增出图，仅留作历史产物回退兜底 |
| 本地千问（**唯一出图模型**） | `E:\ai-models\qwen-image-2.1` + `E:\ai-tools\sdcpp\vulkan\sd-cli.exe`（Qwen-Image 2.1 Turbo，768² / 8 步 / CFG 1.0）；入口 `3d/tools/gen-qwen-room-skins.ps1` / `gen-art-refs.ps1`，**必须 pwsh 7** |
| Python | `C:\Python314\python.exe`（3.14.5，装了 torch 2.11+cu128 / diffusers 0.42 / transformers） |
| Playwright | 本仓 `node_modules/playwright-core`（devDependency `^1.64.1`；`node_modules/` 不入库，`npm i` 复现，驱动系统 Edge）。2026-11-04 前曾寄生在 `~\.workbuddy-ai\binaries\node\workspace\`，已收回本仓 |
| GPU | RTX 5060 Laptop **8GB**。出图统一千问本地（768² / 8 步）；SDXL 已退役，其历史耗时（768² 8~9 分钟）仅留档。出图前会 `VRAM free 0.00`，属正常 |
| 本地 MCP 工具链 | **`F:\AI-MCP\`**（2026-11-06 用户裁定「装在 F 盘」）：uv 0.13.7 / mcp-for-blender 2.2.7 / `@coding-solo/godot-mcp` 0.1.1，缓存与 Python 也全在 F 盘；客户端配置 `~\.workbuddy-ai\mcp.json`（唯一 C 盘例外）。GUI 启动：`pwsh -NoProfile -File F:\AI-MCP\scripts\Start-BlenderMCP.ps1`。详见 `F:\AI-MCP\README.md` 与 `docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md` |

> Blender **不在 PATH 上**，也不在 `C:\Program Files` 下 —— 它在 E 盘 Steam 库里。
> 搜索时务必带上 `E:\SteamLibrary\steamapps\common\`，否则会误判"未安装"。
> 桌面上的 `Blender.lnk` 指向的就是这个路径。

### Blender 权威渲染版本（2026-11-01 定稿，**只准用这一个**）

**权威二进制**

| 项 | 值 |
|---|---|
| 路径 | `E:\SteamLibrary\steamapps\common\Blender\blender.exe` |
| 版本 | **Blender 5.2.2 LTS**，build hash `d13f752e3b9c`，build date 2026-09-15 |
| 内置 Python | 3.13.13（`5.2\python\bin\python.exe` 完整，含 4334 个文件） |
| 权威来源 | 桌面 `C:\Users\ASUS\Desktop\Blender.lnk` 指向此路径；**判断标准以这个 lnk 为准** |
| Steam 依赖 | **免登录**：目录内无 `steam_api64.dll`、无 `steam_appid.txt`，Steam 未运行也可直接跑 |

渲染前先过版本校验，任何一步不符就停手：

```powershell
$BLENDER = "E:\SteamLibrary\steamapps\common\Blender\blender.exe"
& $BLENDER --version | Select-Object -First 1   # 期望：Blender 5.2.2 LTS
```

**禁止事项（违反即视为基线污染，须回退并记录）**

1. 禁止使用 Blender 4.x（4.0–4.5，含临时目录里的便携包）——`%TEMP%\blender\blender-4.5.9-windows-x64` 已于 2026-11-01 删除，历史日志归档在 `tools/logs/legacy-4.5.9/`
2. 禁止用 `blender-launcher.exe` 启动（它是 Steam 启动器，会去拉 Steam）；一律直接调用 `blender.exe`
3. 禁止用 `uvx` / `pip install bpy` / 第三方打包版另拉一份 Blender 当渲染器
4. 禁止修改 Steam 目录内的 `blender.exe` 与 DLL；升级只走 Steam 正常更新，改完需重新登记 build hash
5. 禁止把渲染结果先写到临时目录再手工搬运；输出路径必须由脚本决定

**标准调用模板**

```powershell
$BLENDER = "E:\SteamLibrary\steamapps\common\Blender\blender.exe"
& $BLENDER -b -P tools/blender-ship.py -- --test    # 预览：960×901，约 5s
& $BLENDER -b -P tools/blender-ship.py              # 正式底图：4704×4413，约 11s
& $BLENDER -b --factory-startup -P tools/blender-ship.py   # 需要完全可复现时（不吃用户偏好/插件）
```

**渲染规范**

| 项 | 约定 |
|---|---|
| 引擎 | `BLENDER_EEVEE_NEXT`（5.x 名称）。脚本保留 `for eng in ('BLENDER_EEVEE_NEXT','BLENDER_EEVEE')` 兜底，但**实际只允许在 5.2 上出图** |
| 采样 | 64（预览与正式一致，便于逐像素比对） |
| 分辨率 | 预览 `960×901` / 正式 `4704×4413`；两者比例必须同步，改一个必须改另一个 |
| 版本断言 | 脚本开头必须有硬守卫（已实现于 `tools/blender-ship.py`：`bpy.app.version < (5,2)` 直接 `SystemExit` 并打印权威路径）；新增渲染脚本照抄这一段 |
| 阴影 | 默认**不需要调**（5.2 上同场景已无告警）；仅在 5.2 复现 `Shadow buffer full` 时才调 `scene.eevee.shadow_pool_size` |
| 日志 | 每次渲染写 `tools/logs/<脚本名>-<YYYYMMDD-HHmmss>.log` + 同名 `.err`；**不再新增** `tools/_blendN.log` 这类累加命名 |
| 场景存档 | 正式渲染成功后存一份 `assets/scene/<版本>/<名称>.blend`（`bpy.ops.wm.save_as_mainfile`），保证可重开复核 |
| 复现性 | 交付里写明：Blender 版本 + build hash + 引擎 + 采样 + 分辨率 + 脚本名 |

**已知坑（2026-11-01 复核）**

- **`Shadow buffer full` 是 4.5.9 的问题，不在 5.2.2 复现**：2026-10-31 用 4.5.9 的 8 次出图每次刷 52 条（4961/2048）；2026-11-01 用 5.2.2 同场景同参数（`--test`，960×901，EEVEE，64 samples）跑通，**日志里一条都没有**。若以后在 5.2 上再出现，才需要调 `scene.eevee.shadow_pool_size`
- 4.5.9 便携包 `4.5\python` 只有 `DLLs`+`lib`、缺 `bin\python.exe`，且没有 `scripts\addons`，会报 `Unable to find the Python binary, the multiprocessing module may not be functional!` —— 包已删除，勿再下载
- `tools/blender-fx.py`、`tools/gen-facility-sprites.py` 目前不落日志，按上表补齐
- 5.2.2 的 EEVEE 比 4.5.9 略慢（同场景预览 7.9 s vs 5.2 s），属正常，不要为此换成旧版

**清理记录（2026-11-01）**

- 删除 `%TEMP%\blender\`（4.5.9 便携包 + 399 MB 安装包，共 **784.5 MB**）
- 8 组 4.5.9 渲染日志（`tools/_blend*.log|.err`，16 个文件）归档到 `tools/logs/legacy-4.5.9/`，附 `README.md` 说明来源与已知问题
- 新增 `tools/check-blender.ps1` 与 `tools/blender-ship.py` 的 5.2 版本守卫，防止再次误用旧版出图
