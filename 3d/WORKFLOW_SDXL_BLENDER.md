# 舱室墙面装饰 · SDXL 本地生图 → Blender 渲染（初步工作流）

> 建立日期：2026-11-06 · 状态：**整条链路已实测：SDXL 真出 2 张样张 → grade → Blender 渲染；其余 38 张待批量**
> 触发：用户对 `tools/ship-layout-overview.html` 总体思路的第 3 / 5 / 6 条意见，
> 以及最后补充的「排布别杂乱、同类聚组、有层次感」。
> 与 `AGENTS.md` §一-6 一致（2026-11-07 更新）：**千问模型生图已解禁**，
> SDXL 与千问均可作为 3D 美术素材来源；本管线仍以 SDXL 为主，千问出图走
> `3d/tools/gen-art-refs.ps1`（tileable albedo 仍须四向镜像拼贴，不能拿概念图直接贴）。

---

## 1. 这条管线解决什么

| 问题 | 管线里的做法 |
|---|---|
| 59 件掩体在 3D 端共用 3 张材质、每件一个盒子 → 铁板感 | 每间房**独立贴图目录 + 独立提示词 + 独立 seed**，先做 40 件墙面装饰打样 |
| 允许加墙饰但怕串风格 | 墙饰 `prompt` 强制继承该舱室 `sdxl.prompt`，配色绑定 `rooms[].theme.mark/glow` |
| 不要跨舱室引用同一素材 | kind / asset / 贴图 / seed / 模型名全部带房间 id；脚本不设 `shared/` 目录 |
| 本机 SDXL 到底哪条路能跑 | **GPU diffusers fp16 + vae-fp16-fix**（已实测）；sdcpp q2_K 需要 SDXL GGUF，本机暂无，未启用 |

**已完成**：`plan.json` 写好每间房的提示词 / seed / 输出路径 / Blender 场景名；
SDXL（`--execute` 真出 2 张样张）→ grade（2 张 512² 成品）→ Blender 检查板
（10 行 × 4 列，娱乐室紫色与医疗间青蓝两块贴真图、其余 38 块主题色占位）
**三阶段全部实测通过**。其余 38 张墙饰底图待批量，逐舱放行后跑
`--stage sdxl --execute`（不带 `--only`）即可。

> 一处修正：初稿把 `D:\ai-models\sdxl-base` 直接喂给 `sd-cli --model`。该目录是
> **diffusers fp16 变体**（含 `model_index.json` / `unet` / `text_encoder*`），不是 GGUF；
> 且 `D:\ai-models\gguf` 里只有 Z-Image / Qwen 权重。故主路径改为本机 2026-10-27
> 实测跑通的 `D:\ai-models\gen_sdxl_batch.py` 口径，sdcpp 降级为「补齐 GGUF 后」的兜底。

---

## 2. 目录与命名（防复用硬约定）

```
tools/ship-layout-plan.json                  方案真源：rooms[].walls[] / sdxl / blender
3d/tools/room-wall-art.py                   本管线唯一脚本（系统 Python + Blender 双入口）
3d/assets/textures/<room>/<kind>_raw.png    SDXL 原图（512²）
3d/assets/textures/<room>/<kind>.png        grade 后成品（512²，降亮/冷调/扫描线）
3d/assets/renders/room-wall-<room|all>.png  Blender 风格检查板
3d/assets/models/room_wall_<room|all>.blend 场景存档，可重开复核
```

- `<room>` 取 `bridge / cam / ecosys / power / transit / fun / engine / med / armory / warehouse`。
- `<kind>` 已带房间前缀（如 `med_vitalscreen`），**不设公共贴图目录**。
- 每件墙饰独立 `seed = 房间基 seed + 序号`，全船 10 个基 seed + 40 个墙饰 seed 互不重复
  （`node tools/ship-layout-check.cjs` 的 R7 会校验）。
- 同类功能也要重画：两间房都有「屏」，各出各的图，不复制贴图文件。
- 通用地板 / 墙面材质（`assets/scene/v4/tex`）是既有 CC-BY 4.0 底材，**不属于**本管线的复用对象。

---

## 3. 环境与版本（照抄 `AGENTS.md`，不要另找）

| 项 | 值 |
|---|---|
| SDXL 主路径 | `D:\ai-models\sdxl-base`（diffusers **fp16 变体**）+ `D:\ai-models\vae-fp16-fix` |
| 出图参数 | GPU diffusers · **512² / 12 步 / CFG 6.0** · 约 **70–80 秒/张**（本机 `output/sdxl_run.json` 实测） |
| Python | `C:\Python314\python.exe`（3.14.5，torch 2.11+cu128 / diffusers 0.42 / Pillow） |
| 低内存兜底 | `E:\ai-tools\sdcpp\vulkan\sd-cli.exe`（commit `3be2378`）CPU q2_K / 256² / 4 步；**需 SDXL GGUF，本机暂无，脚本会直接报错停下** |
| 高质量路径 | `3d/tools/gen-panel-texture.py`（768² / 24 步，留给内存余量足够的机器） |
| Blender | `E:\SteamLibrary\steamapps\common\Blender\blender.exe`，**5.2.2 LTS 唯一权威版本** |
| 渲染 | `BLENDER_EEVEE_NEXT` / 64 samples / 预览 960×901、正式 1440×1352 |
| GPU | RTX 5060 Laptop 8GB；`VRAM free 0.00` 属正常，别因此换版本 |

两个必须记住的坑（来自 `D:\ai-models\gen_sdxl.py`）：
① SDXL 原版 VAE 在 fp16 下会出**纯黑/纯灰图**，必须换 `vae-fp16-fix`；
② 必须 `variant="fp16"` + `low_cpu_mem_usage=True`，fp32 UNet 在 8GB 卡上装不下。
脚本开头有硬守卫 `bpy.app.version < (5,2)` → `SystemExit`；禁止 4.x / launcher.exe / pip bpy。

---

## 4. 五步流程

| 步 | 做什么 | 命令 |
|---|---|---|
| 1 | 方案定稿、校验全绿 | `node tools/ship-layout-check.cjs` → 期望 **82 通过 / 0 失败** |
| 2 | 列出每间房的墙饰 / seed / 输出 | `C:\Python314\python.exe 3d\tools\room-wall-art.py --stage plan` |
| 3 | SDXL 本地生图（逐舱放行） | `... --stage sdxl --room med --execute`（默认 `--backend diffusers`） |
| 4 | 后处理定调（降亮 / 冷调 / 扫描线 / 网格 / 暗角 → 512²） | `... --stage grade --room med --execute` |
| 5 | Blender 建模 + 渲染风格检查板 | `"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/room-wall-art.py -- --stage blender --room med --test` |

去掉 `--room` 即全船 10 间 / 40 件。`--test` 出 960×901 预览，正式去掉即 1440×1352。
渲染日志按 `AGENTS.md` 规范写 `tools/logs/<脚本名>-<YYYYMMDD-HHmmss>.log` + 同名 `.err`。

**dry-run 默认**：不加 `--execute` 只打印任务清单，不加载模型、不改图。
40 张 × 约 70–80 秒 ≈ 50 分钟，务必逐舱放行、逐舱肉眼验收，不要一次跑完。
`--backend sdcpp` 在未补齐 SDXL GGUF 前会明确报错，不会静默拿错权重出图。

### 本机实测（2026-11-06）

- `python 3d/tools/room-wall-art.py --stage plan` → 10 舱 / 40 件墙饰 / seed 全列出 ✓
- `--stage sdxl --room med`（dry-run）→ 4 张任务、后端 diffusers、512²/12 步 ✓
- `--stage grade --room med`（dry-run）→ 4 条后处理路径 ✓
- `blender -b -P ... -- --stage blender --room fun --test` → **exit 0**，2.17 s，
  `3d/assets/renders/room-wall-fun.png`（960×901）+ `3d/assets/models/room_wall_fun.blend`；
  因无贴图，4 块板用 `theme.mark` 淡紫占位、`theme.glow` 发光边框。
  日志有两条 `Material.use_nodes` 的 Blender 6.0 弃用警告，5.2.2 上不影响结果。
- **19:07 追加真图实测**：`--stage sdxl --only med_vitalscreen,fun_neonsign --execute`
  → 两张 512² 原图（43.1 s / 36.1 s，seed 802 / 602）；`--stage grade --room med|fun
  --execute` → 两张 512² 成品（SHA256 见 `3d/ASSETS.md`）；
  `blender -b -P ... -- --stage blender --test` → **exit 0**，出
  `3d/assets/renders/room-wall-all.png`（10 行 × 4 列，两块贴真图、其余主题色占位）
  与 `room_wall_all.blend`。**SDXL → grade → Blender 三阶段全通，不再是 dry-run。**
- 仍未做：其余 38 张墙饰底图（按舱逐批放行后可一次跑完）。

---

## 5. 风格锁（第 5 条意见）

每间房的 `style` 来自 `map.json` 的 `rooms[].theme`（ADR-0007 的导出结果），
`room-wall-art.py` 在 Blender 里用 `theme.mark` 做板底色、`theme.glow` 做发光边框。
出图口径沿用既有 `device_screen_task.png` / `pipe_hatch.png`：暗底、细线、无文字、平视正投影，
不另起一套画风。

| 舱室 | 配色 | 墙饰题材 |
|---|---|---|
| bridge | 暖白 / 深棕 / 琥珀 | 返航航线星图、舰徽铭牌、席次铭牌、会议规程屏 |
| cam | 冷白蓝 / 深蓝 / 青蓝 | 舱位编号图、值班班次表、布线示意、状态灯带 |
| ecosys | 淡绿 / 墨绿 / 翠绿 | 植物铭牌、水循环示意、浇灌刻度、湿度计面板 |
| power | 暖黄 / 暗褐 / 琥珀 | 高压警示条、单线接线图、载荷铭牌、回路编号 |
| transit | 米黄 / 暖褐 / 橙黄 | 菜单板、配餐规程、排队标识、配给告示 |
| fun | 淡紫 / 深紫 / 品红 | 霓虹招牌、机台编号、游戏海报、安全提示 |
| engine | 暖橙 / 暗红褐 / 橙红 | 高温警示、检修铭牌、缸体管线图、压力表盘 |
| med | 冷白 / 灰蓝 / 青蓝 | 生命体征屏、急救流程图、消毒规程、药品编号 |
| armory | 暖灰黄 / 暗褐 / 琥珀 | 武器条例铭牌、弹药标识、安全规程、靶道刻度 |
| warehouse | 中性灰白 / 钢灰 / 暖黄 | 货位编号牌、出库流程图、区域标识、安全载荷牌 |

负向提示词统一排除文字 / logo / 人物 / 杂乱物件 / 暖色日光 / 木质 / 奇幻，
避免生成可读伪字与跑题装饰。墙饰厚 ≤0.24 格、贴墙、避开门洞与管道口，
**不占地面通行**（`ship-layout-check.cjs` 的 R8 逐件校验）。

---

## 6. 与既有资产工程的关系

- 本管线是 `3d/ASSETS.md` 里「SDXL 设备屏幕 / 管道舱盖」两条既有管线的**同一路数**，
  只是把对象换成墙面装饰、把粒度从「一张通用图」改成「每舱一套」。
  既有两条走的是 sdcpp CPU q2_K 小图；本管线主路径改走 GPU diffusers（见 §1 修正说明）。
- 后处理口径沿用 `3d/tools/grade-screen.py` / `grade-pipe.py`（降亮、冷调、扫描线、暗角）。
- 真要进 Godot 时，按 `HANDOFF.md` §5 的标准流程：manifest 建条目 → `npm run 3d:assets`
  → 导出 GLB → `npm run 3d:sync:models` → `npm run 3d:import:check`（0 差异）。
  本轮的 `.blend` 只是**风格检查板**，不是可导入的房间资产。

---

## 7. 未完成（下一批，需放行）

1. 其余 **38 张**墙饰底图批量出图与逐张肉眼验收（2 张样张已通，尤其要盯伪文字、
   跑题、跨舱雷同）。命令：`--stage sdxl --execute`（不带 `--only` 即全船 40 张），
   预计约 30 分钟；仍建议逐舱放行。
2. 把检查板升级为「贴到真实墙段」的房间资产，导出 `<room>_wall.glb`。
3. 掩体本体的房间专属材质：目前 `plan.json` 只保证 asset / kind 唯一，
   3D 端仍要给 127 件掩体各自建模或至少各自贴图，不能继续三张材质走天下。
4. 把新掩体表落进 `js/data/map.js` → `3d/tools/export-map.cjs` → `map.json`
   （**会动游戏地图与平衡，必须单独放行**；当前 `plan.json` 是方案层，不改运行时）。
5. 高质量 768² / 24 步复跑；如需 sdcpp 兜底，先补 SDXL GGUF 权重。

---

## 8. MCP 已接入：缩短「改一点 → 重跑 → 看图」的循环（**工具已装，客户端信任待用户操作**）

2026-11-06 17:34 用户裁定「可以装，放 F 盘，允许 MCP 在 Blender 对话里写入场景」。
工具链已落 `F:\AI-MCP\`（uv 0.13.7 / mcp-for-blender 2.2.7 / godot-mcp 0.1.1，
含 Python 与缓存均不占 C 盘），配置在 `~\.workbuddy-ai\mcp.json`，
Blender GUI 用 `F:\AI-MCP\scripts\Start-BlenderMCP.ps1` 启动。
**需在连接器管理页点「信任」并重开会话后，MCP 才会在对话里生效。**
调研结论见 `docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md`，裁定见 ADR-0010。摘要：

- Blender 侧事实标准是 `ahujasid/mcp-for-blender`（原 `blender-mcp`，MIT、33.4k stars、
  2026-11-04 仍在更新），可在活会话里 `look` / `get_scene_info` 自检，替代全量重跑；
  Godot 侧更贴本项目的是 `yurineko73/Godot-MCP-Native`（原生 GDScript、插件本体零依赖、
  推荐 4.5+、MIT），可读编辑器日志 / 重导入 / 查 UID。
- **实测**：Blender 5.2.2 + `BLENDER_USER_SCRIPTS=F:\AI-MCP\blender-scripts` 下 addon
  注册成功；Godot MCP stdio `initialize` 握手成功；`blender -b` 下 addon 按设计拒绝起
  socket（批量渲染仍走 `-b -P`，MCP 活会话必须 GUI）。
- **权限已按裁定放开**：未设 `SAFE_MODE`，写入场景（建模 / 材质 / 渲染 / 保存 / 导出）可用；
  仍锁 localhost:9876、`DISABLE_TELEMETRY=true`，并在 GUI 启动脚本里把 Poly Haven /
  Sketchfab / Poly Pizza / Hyper3D / Hunyuan3D / Tripo / Meshy 全部置 False。
- 分工不变：批量出图与正式渲染继续走 `room-wall-art.py` 脚本（可复现、写日志），
  MCP 只做活会话增量改写与自检，产物落 `.blend` / `.glb` 后照跑
  `npm run 3d:assets` / `3d:import:check`。
- 场景重构起点：`3d/assets/models/ship_scene_v2.blend`（由 `3d/tools/build-scene-v2.py`
  按 `layout-v2.json` 生成，10 舱 / 289 对象 / 按舱室分 Collection），信任 MCP 后可在
  对话里直接按舱室改写。
- **Godot 主场景已接上 v2 布局**（`map_v2.json` + `patch-map-builder.cjs`）：
  127 掩体 / 40 墙饰 / 房间专属材质，无头导入 0 脚本错误、`--arttest` 与
  `--mgtest`、`--devicetest` 全过，实拍图 `3d/preview/screenshots/preview-v2.png`。
  2.5D 真源与 `main.gd` 按 ADR-0002 保持不动。
