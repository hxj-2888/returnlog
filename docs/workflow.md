# 命令与改动流程（现行）

> 2026-11-12 分类收缩：合并原 `docs/agent/commands.md` 与 `docs/agent/process.md`，正文口径不变。
> 命令以 `package.json` 为准；本文件只补充本机环境、权威版本与提交前流程。

## 一、常用命令

| 目的 | 命令 |
|---|---|
| 直接试玩 | 双击 `index.html` |
| 本地服务 | `npm start`（`node tools/serve.cjs`，默认 5173） |
| 全量门禁 | `npm test`（即 `node tests/test-v3.cjs`） |
| 门禁依赖 | 本仓 devDependency `playwright-core@^1.64.1`；`npm i` 后 `npm test` 直接可跑（2026-11-04 实测） |
| 指定 Playwright（后备） | 仅当 `node_modules` 缺失时：`PLAYWRIGHT_CORE=/path/to/playwright-core npm test` |
| 蒙特卡洛 | `npm run sim`（1000 局 AI 对 AI，seed 可复现；产出本地 `tests/mc-results.json`，未入库） |
| 调试模式 | `index.html?test`（跳过开局会议）/ `?dev`（DEV 面板）/ `&strict` |

### PowerShell 7（强制）

- **只在需要调用命令行时使用**：能用专用工具、API 或直接编辑完成的操作，直接用对应工具。
- 需要调用命令行时，统一用 **PowerShell 7**：`pwsh` / `pwsh.exe`；**不要用 Windows PowerShell 5.1**（`powershell.exe`）。
- 默认不用 Git Bash / `cmd.exe`；仅当项目脚本明确依赖 POSIX 工具且无法用 PowerShell 等价实现时，先说明原因再使用。
- 多行脚本写成临时 `.ps1`，用 `pwsh -NoProfile -File` 调用；环境变量用 `$env:VAR='...'`，路径含空格时加引号。
- 校验：`pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'` 应输出 7.x（本机 7.6.5）。

## 二、本机环境

| 工具 | 绝对路径 / 说明 |
|---|---|
| Blender | **`E:\SteamLibrary\steamapps\common\Blender\blender.exe`**（Blender 5.2.2 LTS，Steam 版，**唯一权威渲染版本**） |
| 无头渲染 | `"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P tools/blender-ship.py -- --test` |
| 本地 SDXL（**已退役**） | `D:\ai-models\sdxl-base`（fp16）+ `D:\ai-models\vae-fp16-fix`；2026-11-09 起不再新增出图，仅留历史产物回退 |
| 本地千问（**唯一出图模型**） | `E:\ai-models\qwen-image-2.1` + `E:\ai-tools\sdcpp\vulkan\sd-cli.exe`（Qwen-Image 2.1 Turbo，768² / 8 步 / CFG 1.0）；入口在 **3d 副分支** `3d/tools/gen-qwen-room-skins.ps1` / `gen-art-refs.ps1`（主仓不再保留美术管线），**必须 pwsh 7** |
| Python | `C:\Python314\python.exe`（3.14.5，torch 2.11+cu128 / diffusers 0.42 / transformers） |
| Playwright | 本仓 `node_modules/playwright-core`（devDependency `^1.64.1`；`node_modules/` 不入库，`npm i` 复现，驱动系统 Edge） |
| GPU | RTX 5060 Laptop **8GB**；出图统一千问本地（768² / 8 步），SDXL 已退役 |
| 本地 MCP 工具链 | **`F:\AI-MCP\`**：uv 0.13.7 / mcp-for-blender 2.2.7 / `@coding-solo/godot-mcp` 0.1.1；客户端配置 `~\.workbuddy-ai\mcp.json`；GUI 启动 `pwsh -NoProfile -File F:\AI-MCP\scripts\Start-BlenderMCP.ps1` |

> Blender **不在 PATH 上**，也不在 `C:\Program Files` 下 —— 它在 E 盘 Steam 库里。
> 搜索时务必带上 `E:\SteamLibrary\steamapps\common\`，否则会误判“未安装”。

### Blender 权威渲染版本（2026-11-01 定稿，只准用这一个）

| 项 | 值 |
|---|---|
| 路径 | `E:\SteamLibrary\steamapps\common\Blender\blender.exe` |
| 版本 | **Blender 5.2.2 LTS**，build hash `d13f752e3b9c`，build date 2026-09-15 |
| 内置 Python | 3.13.13 |
| 权威来源 | 桌面 `C:\Users\ASUS\Desktop\Blender.lnk` 指向此路径 |
| Steam 依赖 | **免登录**：无 `steam_api64.dll` / `steam_appid.txt`，Steam 未运行也可直接跑 |

渲染前先过版本校验：

```powershell
$BLENDER = "E:\SteamLibrary\steamapps\common\Blender\blender.exe"
& $BLENDER --version | Select-Object -First 1   # 期望：Blender 5.2.2 LTS
```

**禁止事项（违反即视为基线污染）**

1. 禁止使用 Blender 4.x（含临时目录便携包）。
2. 禁止用 `blender-launcher.exe` 启动（Steam 启动器）；一律直接调用 `blender.exe`。
3. 禁止用 `uvx` / `pip install bpy` / 第三方打包版另拉 Blender。
4. 禁止修改 Steam 目录内的 `blender.exe` 与 DLL；升级只走 Steam 正常更新。
5. 禁止把渲染结果先写到临时目录再手工搬运；输出路径必须由脚本决定。

**标准调用模板**

```powershell
$BLENDER = "E:\SteamLibrary\steamapps\common\Blender\blender.exe"
& $BLENDER -b -P tools/blender-ship.py -- --test    # 预览：960×901，约 5s
& $BLENDER -b -P tools/blender-ship.py              # 正式底图：4704×4413，约 11s
& $BLENDER -b --factory-startup -P tools/blender-ship.py   # 完全可复现
```

**渲染规范**

| 项 | 约定 |
|---|---|
| 引擎 | `BLENDER_EEVEE_NEXT`（5.x 名称）；实际只允许在 5.2 上出图 |
| 采样 | 64（预览与正式一致，便于逐像素比对） |
| 分辨率 | 预览 `960×901` / 正式 `4704×4413`；比例必须同步 |
| 版本断言 | 脚本开头硬守卫（`tools/blender-ship.py`：`bpy.app.version < (5,2)` 直接退出） |
| 阴影 | 默认不调；仅在 5.2 复现 `Shadow buffer full` 时调 `scene.eevee.shadow_pool_size` |
| 日志 | 每次渲染写 `tools/logs/<脚本名>-<YYYYMMDD-HHmmss>.log` + `.err` |
| 场景存档 | 正式渲染成功后存 `assets/scene/<版本>/<名称>.blend` |
| 复现性 | 交付写明 Blender 版本 + build hash + 引擎 + 采样 + 分辨率 + 脚本名 |

**已知坑（2026-11-01 复核）**

- `Shadow buffer full` 是 4.5.9 的问题，5.2.2 同场景同参数跑通、日志无告警。
- 4.5.9 便携包缺 `bin\python.exe` 与 `scripts\addons`，已删除，勿再下载。
- `tools/blender-fx.py`、`tools/gen-facility-sprites.py` 目前不落日志，按上表补齐。
- 5.2.2 的 EEVEE 比 4.5.9 略慢（同场景预览 7.9 s vs 5.2 s），属正常。

## 三、改动流程

1. 先读 `README.md`、`AGENTS.md`、`CHANGELOG.md` 最近条目。
2. 小步修改；涉及地图 / 寻路 / 会议 / 输入的改动，先 `npm start` 或直接 `file://` 冒烟。
3. 跑 `npm test`，确认「X 通过 / 0 失败」，并抽查 `tests/screenshots/` 的截图（元素存在 ≠ 像素可见）。
4. 更新 `CHANGELOG.md`（版本号 + 日期 + 实测读数）。
5. 提交并推送：**分支按 `AGENTS.md` §一.13**——2.5D 主线推 `main`，3D 客户端推副分支 `3d`
   （独立仓 `returnlog-3d` 的 `master` 为其镜像），共享数据 / 美术管线随 `main`；
   不得整分支 merge 把 3D 客户端带进 `main`。
   `origin`(GitHub) 是发布目标，`gitee` 是镜像（失败只警告、不拦停）。
