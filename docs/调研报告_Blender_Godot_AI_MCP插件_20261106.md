# 调研报告 · Blender / Godot 的 AI（MCP）接入插件

> 日期：2026-11-06 · 状态：**调研完成 → 17:34 用户放行，工具链已装 `F:\AI-MCP\`；
> MCP 客户端「信任」仍待用户操作**。裁定与边界见 `3d/DECISIONS.md` ADR-0010、§9。
> 触发：用户要求「先去开源社区找一下 Blender 的 AI 接入 MCP 插件，以及让 AI 接入 Godot
> 更方便的插件，来优化工作流程」。
> 方法：GitHub REST API 实拉仓库元数据（stars / license / pushed_at）+ 逐个读 README
> + Godot Asset Library 条目 + 项目官网。**读数时间 2026-11-06，会过期，采用前需复核。**
> 归类：本文件属第 3 层验收层之外的调研记录，与 `docs/调研报告_*.md` 同列；
> 按 `ARCHITECTURE.md` §8「agent 不得自行跨批次立项」，本轮只给选项与代价，不动工。

---

## 1. 结论先行

| 端 | 首选 | 备选 | 不推荐 |
|---|---|---|---|
| Blender | **`ahujasid/mcp-for-blender`**（原 `blender-mcp`）：事实标准、MIT、极活跃 | `dhakalnirajan/blender-open-mcp`：本地模型优先 | 官方基金会并无 AI MCP；小众 fork 不值当 |
| Godot | **`yurineko73/Godot-MCP-Native`**：原生 GDScript、插件本体零依赖、MIT、推荐 4.5+ | `Coding-Solo/godot-mcp`：最主流但 2026-04 后停更，胜在轻 | `GDAI MCP`（付费闭源）、`yanhuifair/Godot-MCP`（许可矛盾 + 281 工具）、`ee0pdt/Godot-MCP`（停更一年半） |

**一句话**：Blender 只有一家真正成熟；Godot 反而有更好的选择 —— 不必用最老的那个，
原生插件在「零依赖 / Godot 4.6 / 中文工具链 / 渐进式工具发现」上都更贴本项目。

**但接之前必须解决三件事**：本机没有 `uv`（Blender MCP 的前置）、
`~/.workbuddy-ai/mcp.json` 尚不存在、以及一整套红线约束（见 §6）。
因此本轮**只交付调研与建议配置，不写配置、不装插件**。

---

## 2. Blender 侧：两个真仓库

### 2.1 `ahujasid/mcp-for-blender`（原 `blender-mcp`）— 首选

| 项 | 实测值 |
|---|---|
| 仓库 | `https://github.com/ahujasid/mcp-for-blender`（旧名 `blender-mcp` 会重定向） |
| 许可 | **MIT** |
| 活跃度 | **33,442 stars / 3,041 forks / 50 open issues**；`pushed_at` **2026-11-04**（两天前） |
| 语言 / 主页 | Python / `https://www.mcp-for-blender.com/` |
| 版本要求 | **Blender 3.0+**、Python 3.10+、需要 **uv**（PyPI 包名 `mcp-for-blender`，`uvx blender-mcp` 仍兼容旧配置） |
| 架构 | Blender 内 `addon.py` 起 TCP socket（`localhost:9876`，JSON over TCP）↔ 外部 MCP Server ↔ AI 客户端 |
| 9 个工具 | `execute_blender_code`、`look`（viewport / camera / angles / wireframe / xray / render）、`get_scene_info`、`generate_3d`、`search_assets`、`import_asset`、`get_addon_status`、`disable_telemetry`、`record_trajectory_feedback` |
| 非官方声明 | README 明写「第三方集成，与 Blender Foundation 无隶属关系」 |

**对本管线最有用的两个能力**：
- `look` 能在活会话里出多视角 / 相机 / 线框 / X-ray / 渲染图，让 AI **自己核对结果**，
  替代现在「`blender -b -P` 全量重跑 → 出 PNG → 人眼看图 → 改脚本」的循环；
- `get_scene_info` 直接读场景对象清单，可用来核对 40 件墙饰是否都贴到了墙上、
  颜色是否落在 `rooms[].theme` 上。

**必须锁死的风险**（README 自己列了）：
1. `execute_blender_code` **默认可执行任意 Python**；socket 无认证、无加密 →
   必须 `BLENDER_MCP_SAFE_MODE=1`、`BLENDER_HOST=localhost`，禁止 `Allow Remote Connections`。
2. 遥测默认收集匿名使用记录（版本 / 工具名 / 耗时 / 系统）→ `DISABLE_TELEMETRY=true`。
3. `search_assets` / `import_asset` 会拉 Poly Haven（CC0）、Sketchfab、
   **Poly Pizza（约 69% 为 CC-BY，需署名）**；`generate_3d` 走 Meshy / Tripo /
   Hunyuan3D 等云端 3D 生成。**这两类都要关掉** —— 前者撞 `AGENTS.md` §一-6 的
   素材署名红线，后者是用户已裁定的「3D 美图一律 SDXL」之外的新素材来源，
   而且外部资产更容易造成「跨舱室复用同一素材」。
4. 只跑**一个** MCP Server 实例；复杂请求要拆步。
5. Windows 上 GUI 客户端不继承终端 PATH，`"command": "uvx"` 可能 `spawn uvx ENOENT`
   → 需 `cmd /c uvx ...` 或写绝对路径。

**5.2 兼容性**：README 只写 3.0+，但社区已有 2026-10-26 的「Blender 5.2 MCP 安装与连通」
实操记录；本轮**未在本机 5.2.2 上实测连通**，列为放行后第一项验证。

### 2.2 `dhakalnirajan/blender-open-mcp` — 本地模型备选

| 项 | 实测值 |
|---|---|
| 仓库 / 许可 | `https://github.com/dhakalnirajan/blender-open-mcp` · **MIT** |
| 活跃度 | 122 stars / 35 forks / 13 issues；`pushed_at` 2026-10-27 |
| 定位 | **Local-first**：LLM 后端可切 Ollama / LM Studio / llama.cpp / 任意 OpenAI 兼容端点，运行时可换 |
| 架构 | Blender addon（TCP 9876）+ FastMCP Server（HTTP `localhost:8000/mcp` 或 stdio） |
| 工具 | `blender_get_scene_info` / `create_object` / `set_material` / `render_image` / `execute_code` + PolyHaven + LLM provider 切换 |

价值在「不依赖云端 LLM」，和本项目「SDXL 本地出图」的路线气质一致；
但生态与自检能力远小于 2.1，且同样有 `blender_execute_code` 与 PolyHaven 下载面。
**结论：备选，不作为首选。**

> 另有 `2132660698/blender_mcp_new`、`xiguadaddy/blender-mcp`（进程分离架构）等，
> 规模与维护度都不及上述两者，仅登记不展开。

---

## 3. Godot 侧：四个仓库 + 一个付费产品

| 项目 | Stars / Forks / Issues | 许可 | 最后推送 | 版本 / 依赖 | 定位 |
|---|---|---|---|---|---|
| **`yurineko73/Godot-MCP-Native`** | 872 / 76 / 20 | MIT | 2026-08-03 | Godot 4.x（推荐 **4.5+**）、**插件本体零依赖** | 首选 |
| `Coding-Solo/godot-mcp` | **6,535** / 525 / 75 | MIT | **2026-04-16** | Node ≥18、`GODOT_PATH` | 主流但停更 7 个月 |
| `yanhuifair/Godot-MCP` | 49 / 6 / 2 | **AGPL-3.0**（API 实拉） | 2026-10-23 | Node ≥18、stdio、覆盖 4.6/4.7 | 281 工具，不推荐 |
| `ee0pdt/Godot-MCP` | 621 / 65 / 25 | MIT | **2025-03-19** | Node + GDScript 插件 | 停更一年半 |
| `GDAI MCP`（gdaimcp.com） | — | **闭源，$19 一次性** | — | Godot 4.2+ | 不符合「开源」 |

### 3.1 首选：`Godot-MCP-Native`（Godot Asset Library #5125）

- 仓库 `https://github.com/yurineko73/Godot-MCP-Native`，Asset Library 条目 2026-07-27 提交，
  标注 **Tools 4.6**；README 自述「Godot 原生 HTTP 实现 MCP Server，无需 Node.js / 额外依赖」。
- **155 个工具**（30 核心 + 125 扩展）：节点 / 脚本 / 场景 / 编辑器 / 调试 / 项目六大类；
  含 `get-editor-logs`、`reimport-resources`、`get-import-metadata`、`get-resource-uid-info`、
  `audit-project-health`、`run-project-test`、`get-editor-screenshot`。
- 暴露 `http://localhost:9080/mcp`；支持 `auth_enabled` + `auth_token`；
  headless 可 `godot --editor --path <proj> -- --mcp-server --mcp-port=9080`。
- 提供 `gdmcp CLI`：**渐进式工具发现**（约 33 个域命令），避免把 155 个 schema 一次性
  塞进模型上下文 —— 这一点比「281 工具」方案更实用。
- 代价：Claude Desktop 连接 HTTP 模式需 `npx mcp-remote` 桥接（插件本体仍零依赖）；
  README 未给默认 bind address，需实测确认只监听 localhost。

### 3.2 备选：`Coding-Solo/godot-mcp`

- `npx @coding-solo/godot-mcp`，`GODOT_PATH` 可精确指向本机
  `E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe`。
- 能力偏「启动编辑器 / 运行项目 / 抓控制台输出 / 场景与节点 CRUD / UID（4.4+）」，
  用 bundled `godot_operations.gd` 执行复杂操作。
- **项目内已有历史接触**：`3d/DECISIONS.md` ADR-0001 与 `docs/3D_预演_20261103.md`
  都记过「机器上只装了 `godot-mcp` 插件、没有编辑器本体」—— 当时缺的是编辑器，
  现在 4.6 便携版已就位，这个插件才真正能用。
- 缺点：`pushed_at` 2026-04-16，75 个 open issues，功能深度不及 3.1；
  胜在最轻、最稳、文档最清楚，适合当**只读 / 冒烟级**接入。

### 3.3 两个需要标红的发现

1. **许可矛盾**：`yanhuifair/Godot-MCP` 的 2026-06 推广文写 **MIT**，
   但 2026-11-06 GitHub API 实拉 `license.spdx_id = AGPL-3.0`。
   采用前必须复核 LICENSE；且不得把其源码并入本仓（本仓代码是 MIT）。
   另外 281 工具 / 26 分类会显著撑大上下文，README 自己也建议用 CLI 渐进发现。
2. **GDAI MCP 不是开源**：$19 一次性买断，功能最全（GDScript 编辑 / 自动截图 /
   模拟输入 / 端到端测试），但与「去开源社区找」的前提不符，本轮排除。

---

## 4. 对现有工作流到底能优化什么

现行管线（`3d/WORKFLOW_SDXL_BLENDER.md`）：

```
plan.json → SDXL 出图 → grade → blender -b -P room-wall-art.py → .blend / .png
          → sync-models.cjs → Godot --headless --editor --quit 导入
          → check-godot-import.cjs（比对 .glb.import）
```

| 现在的痛点 | MCP 能补的 | 对应工具 |
|---|---|---|
| Blender 每改一点就要**全量重跑** `-b -P`，中间态看不见 | 在**活着的 Blender 会话**里增量改、即时看 | `execute_blender_code`、`look`、`get_scene_info` |
| 墙饰是否贴墙 / 配色是否合 theme 只能靠最终 PNG 肉眼判断 | 读场景对象清单 + 多视角 / X-ray 自检 | 同上 |
| Godot 导入报错要翻 `.godot/` 日志、手工改 `.import`、再重导 | 读编辑器日志 / 重导入 / 查 UID / 项目健康巡检 | `get-editor-logs`、`reimport-resources`、`get-import-metadata`、`get-resource-uid-info`、`audit-project-health` |
| 无头自测（WASD / 碰撞 / 截图）要写一堆 `--e2e` 参数 | 跑项目 + 抓运行时输出 + 截图闭环 | `run-project`、`get-debug-output`、`get-editor-screenshot` |

**建议的工作流分工（未采纳，仅提案）**：
- **批量出图 / 正式渲染仍走脚本**（可复现、可写日志、可比对像素）；
- **MCP 只用于「交互调试与自检」**：改一处 → 看一眼 → 确认 → 存 `.blend` → 再走既有校验；
- Godot 侧把 `--headless --editor --quit` 与 `check-godot-import.cjs` 保留为**门禁**，
  MCP 只做「读日志 / 定位问题」，不替代门禁。

这样不会破坏 `AGENTS.md` 要求的「复现性：写清 Blender 版本 + build hash + 引擎 + 采样
+ 分辨率 + 脚本名」，也不会让 AI 的即时改动变成不可追溯的产物。

---

## 5. 本机前置条件实测（2026-11-06）

| 项 | 结果 |
|---|---|
| `uv` / `uvx` | **均未安装** → Blender 首选方案的前置缺失；须用官方 installer（`winget install --id=astral-sh.uv -e`），**不要 `pip install uv`** |
| Node.js | v22.22.2 ✓（Godot MCP 要求 ≥18） |
| Godot | `E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe` 存在 ✓（可直接作 `GODOT_PATH`） |
| Blender | 5.2.2 LTS ✓（唯一权威版本） |
| `~/.workbuddy-ai/mcp.json` | **不存在** → 尚无 MCP 配置；新建后还需在连接器管理页点「信任」才生效 |

---

## 6. 红线：接之前必须锁死（对应 `AGENTS.md` / `3d/DECISIONS.md`）

1. **只作用于 3D 子项目工具链**，绝不进 2.5D 运行时：`file://` 可玩、
   `index.html` 唯一脚本清单、0 运行时第三方依赖三条不能破。
2. **Blender 唯一权威版本 5.2.2 LTS**：MCP 连接的是用户手动打开的 Blender，
   接入第一步用 `get_addon_status` 读版本并断言 `>= (5,2)`；
   禁止 4.x / `blender-launcher.exe` / `pip install bpy` / 任何第三方打包版。
3. **禁用外部素材库**：关闭 Poly Haven / Sketchfab / Poly Pizza 下载与云端 3D 生成
   （CC-BY 署名、跨舱室复用、以及用户已裁定的「3D 美图一律 SDXL」）。
   千问本地生图已于 2026-11-07 解禁（本调研时的旧约束，现按 AGENTS.md §一-6 新裁定执行）。
4. **安全开关**：`BLENDER_MCP_SAFE_MODE=1`、`DISABLE_TELEMETRY=true`、
   `BLENDER_HOST=localhost`、端口 9876 不对外；Godot 侧 `auth_enabled=true` + 强 token。
5. **产物仍走既有门禁**：任何 MCP 改动最终都要落 `.blend` / `.glb`，再跑
   `npm run 3d:assets`、`npm run 3d:import:check`（0 差异）；MCP 不是验收通道。
6. **素材署名不可删**、`3d/ASSETS.md` 的 SHA256 / 许可表照常维护。
7. **本轮不写配置**：不新建 `~/.workbuddy-ai/mcp.json`、不装 uv、不装插件、不改工程文件。

---

## 7. 建议配置片段（**仅供参考，未写入任何文件，待放行**）

Blender（需先装 uv；Windows 下把 `uvx` 换成 `cmd /c uvx` 或绝对路径）：

```json
{
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["mcp-for-blender"],
      "env": {
        "BLENDER_HOST": "localhost",
        "BLENDER_PORT": "9876",
        "BLENDER_MCP_SAFE_MODE": "1",
        "DISABLE_TELEMETRY": "true"
      }
    }
  }
}
```

Godot 首选（插件装进 `3d/preview/addons/godot_mcp`，启用插件并开认证）：

```json
{
  "mcpServers": {
    "godot-mcp": {
      "url": "http://localhost:9080/mcp",
      "headers": { "Authorization": "Bearer <本地强 token>" }
    }
  }
}
```

Godot 轻量备选：

```json
{
  "mcpServers": {
    "godot": {
      "command": "npx",
      "args": ["@coding-solo/godot-mcp"],
      "env": { "GODOT_PATH": "E:\\ai-tools\\godot\\Godot_v4.6-stable_win64_console.exe" }
    }
  }
}
```

---

## 8. 放行后的落地顺序与验收

1. 装 uv（官方 installer）→ 在本机 Blender 5.2.2 里装 `mcp-for-blender` addon，
   先只读验证 `get_addon_status` 版本 + `get_scene_info`，**不执行任何写操作**。
2. 装 `Godot-MCP-Native` 到 `3d/preview`，开 `auth_enabled`，用 `gdmcp --json doctor`
   验证；再跑一次既有 `--headless --editor --quit` 导入，对比 `check-godot-import.cjs`。
3. 用 `room_wall_fun.blend` 做首个端到端用例：MCP 读场景 → 核对 4 块墙饰位置/颜色
   → 存盘 → 重跑 `npm run 3d:assets` 与 `3d:import:check`，必须 0 错误 / 0 差异。
4. 全程记录日志到 `tools/logs/`，把结论追加进 `3d/CHANGELOG.md`；
   若任何一步破坏 §6 红线，回退并登记。

---

## 9. 用户裁定与落地结果（2026-11-06 17:34 后）

用户答复：「**可以装，然后放在 F 盘。允许 MCP 在 Blender 对话里写入场景。
这些完成之后可以进行场景重构了。**」

| 待定项 | 裁定 / 实际做法 |
|---|---|
| 是否安装 | **放行**，且工具全部放 `F:\AI-MCP\`（约 196 MB）；唯一 C 盘例外是客户端约定位置的 `~\.workbuddy-ai\mcp.json` |
| Godot 选哪套 | 采用 **Coding-Solo**（`@coding-solo/godot-mcp` 0.1.1）：独立 Node 服务可完整放 F 盘、`GODOT_PATH` 指向 4.6 便携版；Native 插件必须进 C 盘项目 `addons/`，与「放 F 盘」冲突，留作后续升级 |
| 写入权限 | **放开**：不设 `BLENDER_MCP_SAFE_MODE`；保留 localhost / 禁遥测 / 关闭全部外部资产库与云端 3D 生成 |
| 场景重构 | 已产出 `layout-v2.json` + `ship_scene_v2.blend` + 俯视预览（见 `tools/ship-layout-plan.md` §9） |

**实测**：uv 0.13.7、`mcp-for-blender` 2.2.7、Blender 5.2.2 addon 注册成功
（F 盘 `BLENDER_USER_SCRIPTS` 生效、内置 requests 2.32.3）、Godot MCP stdio `initialize`
握手成功并识别 4.6 console exe。addon 在 `blender -b` 下按设计拒绝起 socket，
故 MCP 活会话必须走 GUI 启动脚本 `F:\AI-MCP\scripts\Start-BlenderMCP.ps1`。

**仍需用户操作**：在 WorkBuddy 连接器管理页右上角「自定义连接器」对
`blender` / `godot` 两个 server 点「信任」，并重开会话 —— 之后才能在对话里
直接对 `ship_scene_v2.blend` 写入场景。本轮 Agent 无法代做这一步。

**Godot 接线已完成**（17:51「全权授权」后）：`build-map-v2.cjs` 合成
`map_v2.json`（保留 rooms/walls/points/facility/art，只换 cover=127、decor=40），
`patch-map-builder.cjs` 幂等切换 `MAP_PATH`、并入 61 个新 kind 高度、掩体取
`theme.mark`、新增 40 件贴墙装饰。GDScript 沿用 `(x,y)→(x,z)` 口径，无需 GLB
坐标转换。实测：无头导入 0 脚本错误、`--arttest` 件数=127 / 不一致=0、
`--mgtest` 10/10、`--devicetest` 27 设备全过、`--shot` 出主场景实拍图、
2.5D 门禁 826/0。详见 `tools/ship-layout-plan.md` §9 与 ADR-0010。

**仍按架构保留**：`js/data/map.js` / `map.json` / `main.gd` / `test-v3.cjs` 未改
（ADR-0002：3D 是独立子产品，不替换 2.5D）。若要同步进 2.5D 主产品，需另行放行
并重跑门禁与蒙特卡洛。

---

## 10. 来源（均为本轮实际访问）

- `https://github.com/ahujasid/mcp-for-blender`（README / API）· `https://www.mcp-for-blender.com/`
- `https://github.com/dhakalnirajan/blender-open-mcp`（README / API）
- `https://github.com/yurineko73/Godot-MCP-Native`（README / API）
- `https://godotengine.org/asset-library/asset/5125`（Asset Library 条目）
- `https://github.com/Coding-Solo/godot-mcp`（README / API）
- `https://github.com/yanhuifair/Godot-MCP`（API）+ `https://www.gcores.com/articles/216308`（功能与许可说法）
- `https://github.com/ee0pdt/Godot-MCP`（API）
- `https://gdaimcp.com/`（定价与功能）
- 本机：`AGENTS.md`、`3d/DECISIONS.md` ADR-0001、`3d/WORKFLOW_SDXL_BLENDER.md`、
  `docs/3D_预演_20261103.md`
