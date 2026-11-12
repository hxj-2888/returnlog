# 3D 预演资产清单

> 原则：**复制进来的每个文件都要能追到来源、许可、哈希**。
> 完整 SHA256 用于复核；如果改了源文件，必须重新跑 `export-map.cjs` 或重新复制并更新本表。

## 数据

| 文件 | 来源 | SHA256 |
|---|---|---|
| `preview/data/map.json` | 由 `js/data/map.js` 经 `3d/tools/export-map.cjs` 生成（含 `schema_version: 1`） | `a8d634d7e3d1d602ac56444a15c985ddd24d315d793f5bc40071d358e4e5ab9f` |
| `preview/data/minigames.json` | 由 `js/t2/minigame.js` + `js/data/plates.js` 经 `3d/tools/export-minigames.cjs` 生成（26 任务 / 14 玩法 / 板） | `609b60e8ac7547bee3ba807dda7effb0a666479392a02e5155003eab953336c6` |
| `preview/assets/plates/panel-fix.png` | `assets/minigame/panel-fix.png` 的工程内副本 | 见源文件 |

源文件 `js/data/map.js` SHA256：`9d220adcc103aded942fe015f06789e5042e03c858cd382b6e2bda7d19e0a92c`。

## 3D 模型（2026-11-06 · Blender 5.2.2 程序化生成）

生成脚本：`3d/tools/build-3d-assets.py`；全部为原创几何，贴图沿用下方 SDXL 场景材质与
`assets/minigame/panel-*.png`（Qwen 2.1，用户已裁定可用于本非商用项目）。
每件导出物都内嵌贴图，导出后由 `3d/tools/sync-models.cjs` 复制到 `preview/assets/models/`。

| 资产 | 源文件 | 导出物 | 三角面 | GLB SHA256（前 16 位） |
|---|---|---|---|---|
| device_panel_fix | `assets/models/device_panel_fix.blend` | `assets/export/device_panel_fix.glb` | 1838 | `4366718886d08404` |
| device_breaker | `assets/models/device_breaker.blend` | `assets/export/device_breaker.glb` | 510 | `5f907289d9b65f7a` |
| device_oxygen | `assets/models/device_oxygen.blend` | `assets/export/device_oxygen.glb` | 1178 | `bc82ed761b76b0bb` |
| device_pod | `assets/models/device_pod.blend` | `assets/export/device_pod.glb` | 650 | `c598a26fec517a1e` |
| device_transformer | `assets/models/device_transformer.blend` | `assets/export/device_transformer.glb` | 962 | `5d81ea43df79dfbb` |
| device_medbay | `assets/models/device_medbay.blend` | `assets/export/device_medbay.glb` | 974 | `d056cfe038357f29` |
| prop_crate | `assets/models/prop_crate.blend` | `assets/export/prop_crate.glb` | 648 | `2385c1208293a24c` |
| prop_table | `assets/models/prop_table.blend` | `assets/export/prop_table.glb` | 648 | `e364992399e227ec` |
| prop_shelf | `assets/models/prop_shelf.blend` | `assets/export/prop_shelf.glb` | 1080 | `5048b75191e7a461` |
| prop_pipe_run | `assets/models/prop_pipe_run.blend` | `assets/export/prop_pipe_run.glb` | 552 | `a202cb6397711f09` |
| prop_pipe_port | `assets/models/prop_pipe_port.blend` | `assets/export/prop_pipe_port.glb` | 2336 | `85cac12b33787621` |
| char_crew_lowpoly | `assets/models/char_crew_lowpoly.blend` | `assets/export/char_crew_lowpoly.glb` | 8,544 | `1a3ed86dff759626` |
| char_crew_blockout | `assets/models/char_crew_blockout.blend` | `assets/export/char_crew_blockout.glb` | 864 | `b48182690c295fbe` |

面数都低于 `spec/conventions.md` 的 `device 8k / prop 3k` 预算；`npm run 3d:assets` 可复核。

**人物模型（2026-11-11）**：

- `char_crew_lowpoly`：按素材层 `returnlog_assets/unreferenced/qwen21/3d/crew-refs/crew-turnaround_768.png` 建模的
  1.766 m / 8,544 tris / 6 材质（`crew_suit` / `crew_accent` / `crew_gear` / `crew_skin` /
  `crew_face` / `crew_hair`）/ 17 形变骨 / **idle + walk + knife + down** 已导出；
  脚本 `3d/tools/build-crew-rigged-v2.py`。正常对局默认使用它；`--crew-billboard` 回退旧 billboard。
- `char_crew_blockout`：864 tris / 3 材质 / 无骨骼的体块验证件，保留作 fallback 与对比；
  脚本 `3d/tools/build-crew-blockout.py`。
- 参考图：素材层 `returnlog_assets/unreferenced/qwen21/3d/crew-refs/`（完整 768²，本地 3 张）+ `3d/assets/crew_refs/`
  （640px 预览 + `manifest.json`，随仓入库）；Qwen-Image 2.1 本地生成，
  Research License 非商用，模型/seed/prompt 见 manifest；三视图、三配色、制服细节各 1 张。
- 动画：`walk` 为 24fps / 1 秒循环；Godot 侧按移速 4.2 m/s 播 2.9 倍速，避免脚底滑动。
  `knife` 由 `sim.events#knife` 一次性触发，`down` 由 `downed` 状态触发；V-CREW 已标 `ported`（full）。

**2026-11-11 人物重做（第三版）**：

- 拓扑：躯干/四肢从方块拼贴改为截面放样；肩/肘/膝/髋用球体过渡；腰带、护膝、背包、靴子用圆角实体；
  头是 20 段放样头型（下颌/颧骨/后脑），发盖与刘海为独立几何。用户否决的第二版（1,740 tris，
  球体贴照片脸）已整体替换。
- UV/贴图：身体一张 768² 图集（`crew-body_albedo/normal`，glb 内嵌），分区画布
  `3d/tools/crew_atlas.py` 是 UV 唯一真源；脸 768²、头发 768²。全部贴图统一 **768×768**。
- 脸：千问本地 img2img（参考 `crew-turnaround_768.png` 正面头，seed 20261160）出风格化中性脸；
  去掉头发后只取脸区，计划贴到正面 UV；`crew_view._tint_model()` 只给 `crew_suit` 乘席位色，
  不换贴图、不改 `uv1_scale`，其余材质保持 glb 内嵌。
- 旧 512² 平铺贴图（`preview/assets/models/crew_tex/`）保留作历史对照，已不再被 glb 或运行时引用。
- 验收命令：`--crewshot` 输出 `preview/screenshots/crew-lowpoly.png`；
  `render-crew-check.py` 输出 `crew-face-check.png` / `crew-body-check.png` / `crew-full-check.png`。

**材质贴图（2026-11-11 · 千问本地生成，SDXL 已退役）**：

| 用途 | 运行时文件 | 尺寸 | 生成脚本 |
|---|---|---|---|
| 身体图集 albedo | `assets/textures/crew/crew-body_albedo.png`（glb 内嵌） | 768² | `gen-qwen-materials.ps1` + `build-crew-textures-v2.py` |
| 身体图集法线 | `assets/textures/crew/crew-body_normal.png` | 768² | 同上（亮度派生） |
| 脸部 | `assets/textures/crew/crew-face_albedo.png`（glb 内嵌） | 768² | `gen-qwen-crew-face-v2.ps1` + `build-crew-textures-v2.py` |
| 脸部法线 | `assets/textures/crew/crew-face_normal.png` | 768² | 同上 |
| 短发 | `assets/textures/crew/crew-hair_albedo.png`（glb 内嵌） | 768² | `build-crew-textures-v2.py`（512 源放大到 768） |
| 短发法线 | `assets/textures/crew/crew-hair_normal.png` | 768² | 同上 |
| 刀身金属 | `preview/assets/weapons/knife-blade.png` | 384² | 既有刀资产，不在本轮 3D 人物范围 |
| 刀柄橡胶 | `preview/assets/weapons/knife-grip.png` | 384² | 同上 |

- 原始千问方图在 `3d/assets/renders/`（`.gitignore` 已忽略），manifest 同目录；
  768 原图单张约 340 s，因此材质采用 512 原图放大到 768，唯一新出的脸是 512 img2img 后放大。
- 装配：`crew_view.gd::_tint_model()` 只复制 `crew_suit` 材质并设 `albedo_color`；
  15 席共用同一网格/图集，靠 tint 换色。`crew_face` / `crew_hair` / `crew_gear` / `crew_accent` 不参与 tint。
- 许可证：Qwen Research License **非商用**，仅本地生成；商用发布需替换权重或单独授权。
- 验收命令：`--crewshot` 输出 `preview/screenshots/crew-lowpoly.png`；`--probetest`
  会断言 `moving=true → walk`、`moving=false → idle`。
**设备原点约定**：`device_*` 统一用 `base_center`（底面中心），便于按地面/掩体顶面摆放；
`prop_pipe_run` 仍为 `origin`。

## SDXL 设备屏幕（2026-11-06）

本机 16GB 内存 + 8GB 显存，diffusers 路径在加载 `text_encoder_2` 时 `OSError 1455`（页面文件），
sdcpp Vulkan 的 fp16 / q8 / q4 权重分配均 OOM。最终走 **CPU + q2_K** 成功出图：

- 工具：`E:\ai-tools\sdcpp\vulkan\sd-cli.exe`（commit `3be2378`），SDXL base + VAE fp16-fix
- 参数：`--type q2_K --backend cpu --params-backend cpu -W 256 -H 256 --steps 4 --cfg-scale 5 --seed 11`
- 提示词：`sci-fi spacecraft maintenance console screen, very dark glass, faint teal grid, glowing amber traces, no text, no logo, flat front view`
- 原图：`assets/textures/device_screen_task_raw.png`，SHA256 `5f87bdf871e754c020e510ea5762c4233999c656fa1ee4e2a40a0f1c2959f0f6`
- 后处理：`3d/tools/grade-screen.py`（降亮 / 冷调 / 4px 扫描线 / 64px 网格 / 暗角 → 512²）
- 成品：`assets/textures/device_screen_task.png`，SHA256 `55200936222e42e3cc7e22998c75f9090656ff81d0d7e48644127c72aa8d1a6b`
- 使用：`device_oxygen` / `device_pod` / `device_transformer` / `device_medbay` 的屏幕；
  `wire` 用 `panel-fix.png`、`lever` 用 `panel-breaker.png`（既有已裁定素材）。

**注意**：这是低步数、低位宽的小图，只适合当远处/遮罩下的屏幕底纹；要特写级面板仍需在
内存余量足够的机器上用 `3d/tools/gen-panel-texture.py` 跑 768² / 24 步。

## SDXL 管道舱盖（2026-11-06）

- `assets/textures/pipe_hatch_raw.png`：SDXL 256² CPU q2_K / 4 步 / seed 29，
  SHA256 `fde4b035f89e4c9fce054ca33d9d18fb28846deff972e537f65f497a297a16f1`
- `assets/textures/pipe_hatch.png`：经 `3d/tools/grade-pipe.py` 压暗/冷调/同心压痕 → 512²，
  SHA256 `76c22c9f26f38cb290399dd08e4095b18849ab29f5c5e77246461fbc9616eb7a`
- 用途：`prop_pipe_port.glb` 的舱盖金属贴图；2.5D 精灵由 `3d/tools/render-pipe-port.py`
  用 Blender 5.2.2 渲染到 `assets/scene/v4/facility/pipe-port-<room>.png`（8 舱，颜色读
  `js/t2/space.js#PIPE_TINT`）。3/4 预览：`3d/assets/renders/pipe-port-preview.png`。

## 贴图（来自 `assets/scene/v4/tex`）

| 文件 | 源文件 | SHA256 |
|---|---|---|
| `preview/assets/textures/cafeteria-floor.png` | `assets/scene/v4/tex/cafeteria-floor.png` | `0e1551f92abb04a1f18ab1b41af9e9a33cde86a92ae9bb3a288b459cdb22fb47` |
| `preview/assets/textures/crate-steel.png` | `assets/scene/v4/tex/crate-steel.png` | `20807932f25e874977d62e93638f2861dfb6abe6da635970c67a16a270b3f66e` |
| `preview/assets/textures/floor-carpet.png` | `assets/scene/v4/tex/floor-carpet.png` | `05f943143030bf91a13c2c1006266d982c631399d624b23b9d572a6e2cb617df` |
| `preview/assets/textures/floor-eco.png` | `assets/scene/v4/tex/floor-eco.png` | `73974763ecd2477e3c0af6806d6a30e94b3a629ca6ebad7f3354d9d6500665da` |
| `preview/assets/textures/floor-engine.png` | `assets/scene/v4/tex/floor-engine.png` | `62b12f3c35181b0485392b0b6139edf998fc63d6dbe7edc09ed15165411126c2` |
| `preview/assets/textures/floor-grate.png` | `assets/scene/v4/tex/floor-grate.png` | `8fdec8be494560d44401a4c8c71e6b6c605d7e7ff127a0378f3ffc2e73aa2e13` |
| `preview/assets/textures/floor-hazard.png` | `assets/scene/v4/tex/floor-hazard.png` | `a01c7fddaa697602e595793f33af08274a6389c81e9163a07cf3eee2fc0185dd` |
| `preview/assets/textures/floor-lab.png` | `assets/scene/v4/tex/floor-lab.png` | `7340c9e2abdda5ef6576e139552294f3817fbc6a761fb460f36f4759fba72e4e` |
| `preview/assets/textures/floor-lounge.png` | `assets/scene/v4/tex/floor-lounge.png` | `fab57c650d0570253dd8d292fb7bc76b20a86e1592c5151b092523d7205d49d1` |
| `preview/assets/textures/floor-monitor.png` | `assets/scene/v4/tex/floor-monitor.png` | `c00809b015e584043eff56732bda4cec07780c0bf3f997690e7f0e66ed2cc092` |
| `preview/assets/textures/floor-power.png` | `assets/scene/v4/tex/floor-power.png` | `605d64e4d71b8a383c7bb129308d69cf3a8f868be18e23f7aebab4a566f80e1b` |
| `preview/assets/textures/floor-steel.png` | `assets/scene/v4/tex/floor-steel.png` | `9dc2b3ab45617d1aa7cbbab8780b329f0187188821df53b4ffe12d3a2b597f36` |
| `preview/assets/textures/panel-metal.png` | `assets/scene/v4/tex/panel-metal.png` | `fe06357062530aff4a1610e0df96d9b4440aadf1a01f1689352cde639074c15a` |
| `preview/assets/textures/table-composite.png` | `assets/scene/v4/tex/table-composite.png` | `59810b006c3c111f9c71c2fc88267a85f3a86c1ffb0686311ff1cd02bce01e6b` |
| `preview/assets/textures/wall-panel.png` | `assets/scene/v4/tex/wall-panel.png` | `621c04e80e832775ab578d596ef6395b3549e85a1dc052fe69cdfbc9d01cb6ae` |
| `preview/assets/textures/warehouse-floor.png` | `assets/scene/v4/tex/warehouse-floor.png` | `49bbddc19abbc6ee6414be2a08d35c2966326596269e108a8d01fcc9bffbb1f0` |

许可见 `preview/assets/licenses/v4-CREDITS.md`；这些素材按原项目要求保留 CC-BY 4.0 署名。

## 角色

| 文件 | 来源 | SHA256 |
|---|---|---|
| `preview/assets/crew/crew-01.png` | `assets/scene/crew/crew-01.png`（4×5 帧，96×160/帧） | `0c8839a85422f3c7b8ddbcd86c5e4a232811208ce12c06d63701071c099846f5` |

许可见 `preview/assets/licenses/crew-LICENSE.txt`。

## 千问美术素材（2026-11-07 解禁，可用于游戏内；转商用需换图/授权）

| 项 | 值 |
|---|---|
| 模型 | Qwen-Image 2.1 Turbo `Q4_K_M` GGUF + Qwen3-VL-8B `UD-Q4_K_XL` 编码器 + `qwen_image_2.1_vae_bf16` |
| 运行器 | `E:\ai-tools\sdcpp\vulkan\sd-cli.exe`（8GB 显存：`clip=cpu,diffusion=vulkan0,vae=cpu`，不加 `--offload-to-cpu`） |
| 脚本 | `3d/tools/gen-art-refs.ps1`（**必须 pwsh 7**，脚本内有 5.1 硬守卫）· `npm run 3d:refs:cabin` / `3d:refs:tasks` |
| 参数 | 768×768 · Turbo 8 步 · CFG 1.0 · euler · seed 基 20261106 逐张 +1 |
| 许可 | **Qwen Research License（非商用）**。2026-11-07 用户裁定可进本非商用项目运行时；若未来发行/商用须换 SDXL / Qwen 1.0 或另行授权（AGENTS.md §一-6） |
| 产物 | `E:\ai-models\qwen-image-2.1\output\cabin-refs\`（10 张）、`...\task-refs\`（26 张） |
| 留档 | 素材层 `returnlog_assets/unreferenced/qwen21/3d/cabin-refs/`、`task-refs/`，各带 `manifest.json`（模型/seed/prompt/许可/耗时） |

- **10 间舱室表面材质参考**：房间名 / 明暗 / accent 全部运行时读 `map.json`
  （`rooms[].light` 与 `rooms[].theme.glow`，后者由 `export-map.cjs` 从
  `tools/blender-ship.py` 的 `ROOM_THEME` 导出），accent 十六进制现算，脚本里不硬编码。
- **26 个任务控制面板参考**：玩法 `kind`（13 型）→ 视觉语言，元素数 `n`、配色 `color`、
  所在舱室 → 表面语境，全部读 `minigames.json` + `map.json`。
- 实测读数：cabin 10/10（约 97 s/张）、task 26/26（均值 100.1 s/张），0 张坏文件，平均 1.17 MB。
- **已知偏差**：① `n` 只是引导不是约束（`n=3` 画出 5 条），精确数量要靠 Blender 摆或后期裁；
  ② 面板上的微标签是糊出来的伪字符，不能当真实编号用；
  ③ 这批不是无缝贴图（seamless），要接 `tools/gen-materials.py` 那套四向镜像拼贴才能平铺。
- 这些文件**不在任何 `res://` 路径下**，Godot 读不到；要进包先按上面的许可与无缝要求处理。

## 生成物

- `.godot/`、`*.import`、`*.uid` 由 Godot 生成；`.godot/` 已在 `preview/.gitignore` 中忽略，
  `.import` / `.uid` 保留以便导入设置稳定。
- `map.json` 是生成文件；修改 `js/data/map.js` 后必须重新导出。
- `map_v2.json` 由 `3d/tools/build-map-v2.cjs` 从 `map.json` + `tools/ship-layout-plan.json`
  合成（只换 `cover` / `decor`），不是第二份手写真源。

## SDXL 墙饰样张（2026-11-06 19:07 实测）

SDXL 工作流已于 2026-11-12 退役并清理；本机 GPU diffusers 样张仅作历史对照。
真源是 `tools/ship-layout-plan.json` 的 `rooms[].walls[]`（每间独立 prompt / seed / 目录）。

| 资产 | 舱室 / seed | 原图 SHA256 | 成品 SHA256 |
|---|---|---|---|
| `med_vitalscreen` | med / 802 | `447f019286c45e761c144f5664c9c9ae48aaa768bd4e31f4c8eaa6d6cc7354b5` | `5aa0e491efebb352bfb4feac20350cef97380d8031b41ab268bdf11a36d6f093` |
| `fun_neonsign` | fun / 602 | `849ac111abe7ea1f12bf411bfa1c052d2729fc28521758e4a43b5f98fef3d125` | `c7387bb437b6e97b177b1ee7a3b19e3a078e6ce651bd66c74cda42e54b797351` |

- 参数：`D:\ai-models\sdxl-base` fp16 + `vae-fp16-fix`，512² / 12 步 / CFG 6.0，
  `C:\Python314\python.exe` + torch 2.11+cu128 / diffusers 0.42；实测 43.1 s / 36.1 s。
- 后处理：`3d/tools/room-wall-art.py --stage grade`（降亮 / 冷调 / 4px 扫描线 /
  64px 网格 / 暗角 → 512²），口径沿用既有 `grade-screen.py` / `grade-pipe.py`。
- Blender 检查板：`3d/assets/renders/room-wall-all.png`（10 行 × 4 列，
  娱乐室紫色与医疗间青蓝两块已贴真图，其余主题色占位）+
  `3d/assets/models/room_wall_all.blend`；Blender 5.2.2 LTS / EEVEE / 64 samples / 960×901。
- 许可：SDXL 本地生成、项目自产；素材来源口径见 `AGENTS.md` §一-6（2026-11-07 起千问同步可用）。

## 掩体本体 v1 · 生态舱 8 类（2026-11-06）

> 真源：`3d/tools/build-covers-ecosys.py`（程序化，可重跑）；清单：`3d/spec/assets.manifest.json` 的 `ecosys_*`。
> 口径：**1×1 足迹 / 高度 1.0 / 底面中心为原点**；Godot 侧按 `(cover.w, tier 高度, cover.h)` 缩放，碰撞仍由盒体承担。
> 许可：原创（脚本生成），无外部素材、无贴图。

| 资产 | 名称 | 档位 | 高(m) | tris | 大小 |
|---|---|---|---:|---:|---:|
| `ecosys_tree` | 巨树 | anchor | 1.30 | 384 | 43.4 KB |
| `ecosys_tank` | 培养罐 | mid | 0.95 | 552 | 37.5 KB |
| `ecosys_pond` | 水池 | accent | 0.55 | 172 | 22.8 KB |
| `ecosys_shrub` | 灌木花箱 | accent | 0.55 | 304 | 35.2 KB |
| `ecosys_oxygen` | 制氧机 | mid | 0.95 | 284 | 25.2 KB |
| `ecosys_growrack` | 种植架 | mid | 0.95 | 372 | 48.9 KB |
| `ecosys_irrigation` | 灌溉台 | mid | 0.95 | 236 | 21.8 KB |
| `ecosys_climate` | 温控台 | mid | 0.95 | 128 | 14.9 KB |

- 检查板：`3d/assets/renders/covers-ecosys.png`（8 件并排，Blender 5.2.2 EEVEE 64 samples）。
- 引擎内样张：`3d/preview/screenshots/covers-ecosys.png`（`--covershot ecosys`，舱内平视）。
- 复跑：`"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/build-covers-ecosys.py`
  → `node 3d/tools/validate-assets.cjs` → `node 3d/tools/sync-models.cjs` → Godot 导入 → `--arttest`。

## 掩体本体 v1 · 仓库 6 类 / 医疗 7 类（2026-11-06 晚）

> 真源：`3d/tools/build-covers-warehouse.py`、`build-covers-med.py`（共用 `covers_lib.py`，程序化可重跑）。
> 口径：**真实尺寸建模**（footprint 取 map_v2 最常见 w×h，高度取档位），底面中心为原点；
>   Godot 侧按 `3d/preview/data/cover_refs.json` 实测值缩放，碰撞仍由盒体承担。
> 许可：原创（脚本生成），无外部素材、无贴图。

| 资产 | 名称 | 档位 | 建模尺寸 (m) | tris | 大小 |
|---|---|---|---:|---:|---:|
| `warehouse_rack_west` | 重型货架（箱货） | anchor | 1.42 × 7.06 × 1.30 | 840 | 104.6 KB |
| `warehouse_rack_east` | 重型货架（桶装） | anchor | 1.42 × 7.06 × 1.30 | 1140 | 120.3 KB |
| `warehouse_terminal` | 库管终端 | mid | 2.54 × 1.29 × 1.61 | 204 | 27.0 KB |
| `warehouse_pallet` | 托盘货堆 | accent | 0.96 × 0.96 × 0.52 | 156 | 20.2 KB |
| `warehouse_packbench` | 打包台 | mid | 2.60 × 1.40 × 1.43 | 504 | 50.6 KB |
| `warehouse_receiving` | 收货台 | mid | 3.41 × 1.17 × 1.50 | 644 | 64.7 KB |
| `med_surgery` | 手术台 | anchor | 3.00 × 1.65 × 1.28 | 348 | 41.6 KB |
| `med_monitor` | 床旁监护仪 | accent | 0.90 × 0.56 × 0.51 | 304 | 29.1 KB |
| `med_ventilator` | 呼吸机 | accent | 1.15 × 1.09 × 0.57 | 488 | 41.8 KB |
| `med_bed` | 病床 | mid | 2.38 × 1.64 × 0.95 | 324 | 38.6 KB |
| `med_medcab` | 药品柜 | mid | 2.18 × 0.96 × 0.94 | 612 | 66.4 KB |
| `med_sterilizer` | 灭菌柜 | mid | 2.28 × 1.47 × 0.95 | 464 | 40.3 KB |
| `med_supplycart` | 耗材车 | mid | 2.71 × 1.76 × 0.97 | 588 | 56.9 KB |

- 检查板：`3d/assets/renders/covers-{warehouse,med}.png`；引擎内样张同名，在 `3d/preview/screenshots/`。
- 复跑：`blender -b -P 3d/tools/build-covers-<room>.py` → `measure-cover-refs.py`
  → `node 3d/tools/validate-assets.cjs` → `node 3d/tools/sync-models.cjs` → Godot 导入 → `--arttest`。
  **改了模型尺寸一定要重跑 `measure-cover-refs.py`**，否则 Godot 会按旧尺寸缩放。

## 掩体本体 v1 · 军械库 6 类（2026-11-06 深夜）

> 真源：`3d/tools/build-covers-armory.py`；口径同前两批（真实尺寸 / 底面中心原点 / 碰撞走盒体）。

| 资产 | 名称 | 档位 | 建模尺寸 (m) | tris | 大小 |
|---|---|---|---:|---:|---:|
| `armory_gunrack` | 枪架 | anchor | 4.48 × 1.60 × 1.30 | 1332 | 158.3 KB |
| `armory_workbench` | 枪械工作台 | anchor | 3.20 × 1.68 × 1.28 | 472 | 55.2 KB |
| `armory_targetlane` | 射击位 | mid | 2.04 × 1.56 × 0.95 | 376 | 36.8 KB |
| `armory_ammocrate` | 弹药箱堆 | mid | 2.09 × 1.65 × 0.88 | 180 | 22.1 KB |
| `armory_issuedesk` | 发放台 | mid | 2.26 × 1.29 × 0.97 | 324 | 40.3 KB |
| `armory_vise` | 台钳工位 | accent | 1.10 × 1.10 × 0.53 | 240 | 27.4 KB |

- 单件排查：`blender -b -P 3d/tools/cover-shot.py -- armory_gunrack` → `renders/_shot-<kind>-{a,b}.png`。

## 掩体本体 v1 · 余下 6 舱 34 类（2026-11-06 深夜，累计 61/61 kind）

> 真源：`3d/tools/build-covers-rest.py`（按舱跑：`-- bridge|cam|engine|fun|power|transit`）；口径同前三批。

| 资产 | 名称 | 档位 | 建模尺寸 (m) | tris | 大小 |
|---|---|---|---:|---:|---:|
| **驾驶舱** | | | | | |
| `bridge_chair` | 指挥椅 | accent | 0.83 × 0.76 × 0.55 | 192 | 20.1 KB |
| `bridge_column` | 结构柱 | mid | 1.15 × 1.15 × 0.95 | 212 | 20.6 KB |
| `bridge_holoscreen` | 环屏 | mid | 5.00 × 0.63 × 0.95 | 168 | 21.7 KB |
| `bridge_navconsole` | 导航台 | mid | 4.26 × 1.61 × 0.93 | 300 | 31.7 KB |
| `bridge_recorddesk` | 记录台 | mid | 4.40 × 1.30 × 0.96 | 356 | 38.4 KB |
| `bridge_sideboard` | 边柜 | accent | 2.64 × 1.03 × 0.57 | 144 | 17.7 KB |
| `bridge_table` | 指挥圆桌 | anchor | 5.04 × 5.04 × 1.31 | 1064 | 83.4 KB |
| **监控室** | | | | | |
| `cam_archivebox` | 档案箱 | accent | 1.13 × 0.73 × 0.49 | 60 | 8.6 KB |
| `cam_codecrack` | 编解码机架 | accent | 2.00 × 1.42 × 0.55 | 500 | 50.4 KB |
| `cam_opsdesk` | 操作台 | mid | 3.04 × 1.01 × 0.96 | 248 | 25.9 KB |
| `cam_screenwall` | 监控墙 | anchor | 3.60 × 0.84 × 1.30 | 368 | 44.3 KB |
| `cam_servercab` | 服务器柜 | mid | 1.53 × 1.19 × 0.94 | 292 | 29.4 KB |
| **引擎舱** | | | | | |
| `engine_compressor` | 压缩机 | mid | 2.11 × 1.15 × 0.89 | 244 | 24.8 KB |
| `engine_cylinder` | 气缸组 | mid | 2.63 × 1.75 × 0.84 | 700 | 52.9 KB |
| `engine_fusepanel` | 保险面板 | accent | 1.40 × 1.02 × 0.55 | 380 | 42.3 KB |
| `engine_partscart` | 零件车 | mid | 2.31 × 1.76 × 0.92 | 392 | 37.0 KB |
| `engine_reactor` | 反应堆 | anchor | 2.42 × 2.51 × 1.31 | 940 | 62.8 KB |
| `engine_toolbench` | 工具台 | accent | 2.20 × 1.20 × 0.61 | 144 | 18.8 KB |
| **娱乐舱** | | | | | |
| `fun_arcade` | 街机柜 | mid | 2.24 × 1.89 × 0.87 | 184 | 19.6 KB |
| `fun_coffeetable` | 茶几 | accent | 2.00 × 1.20 × 0.62 | 120 | 14.4 KB |
| `fun_gametable` | 游戏桌 | mid | 2.80 × 1.50 × 0.81 | 312 | 29.1 KB |
| `fun_jukebox` | 点唱机 | anchor | 1.44 × 1.22 × 1.30 | 388 | 38.8 KB |
| `fun_racer` | 赛车座 | mid | 1.38 × 1.82 × 0.95 | 252 | 24.5 KB |
| `fun_sofa` | 沙发 | mid | 2.40 × 2.24 × 0.85 | 96 | 13.0 KB |
| `fun_stool` | 吧凳 | accent | 0.82 × 0.83 × 0.55 | 264 | 22.5 KB |
| **配电舱** | | | | | |
| `power_breakerbank` | 断路器排 | mid | 3.03 × 1.54 × 0.97 | 336 | 43.0 KB |
| `power_gauge` | 仪表架 | accent | 0.90 × 0.72 × 0.57 | 240 | 21.5 KB |
| `power_switchgear` | 开关柜 | anchor | 2.44 × 1.79 × 1.31 | 276 | 28.6 KB |
| `power_transformer` | 变压器 | mid | 1.76 × 2.06 × 0.87 | 384 | 31.2 KB |
| **餐厅** | | | | | |
| `transit_diningtable` | 餐桌 | mid | 2.19 × 1.58 × 0.86 | 640 | 44.9 KB |
| `transit_drinkbar` | 饮料台 | anchor | 1.64 × 1.20 × 1.27 | 312 | 33.1 KB |
| `transit_platecart` | 餐盘车 | mid | 1.54 × 1.15 × 0.82 | 460 | 35.5 KB |
| `transit_servicecounter` | 服务台 | mid | 3.25 × 1.12 × 0.97 | 120 | 16.5 KB |
| `transit_trayreturn` | 餐盘回收车 | accent | 1.47 × 0.98 × 0.52 | 248 | 22.9 KB |

- 61 件全部在 **2800** tris 预算内（实际 **124–2760**，合计 **5.12 MB**）。
- 单件排查：`blender -b -P 3d/tools/cover-shot.py -- <kind>`。

## 掩体细节迭代 · 参考图驱动的三条规定（2026-11-07）

> 触发：用户「还是显得太粗糙了，尽量保持和这个场景一样的风格，可以用千问/SDXL 取要素」。
> 参考图：`3d/assets/refs/fun.png`（本地 SDXL · 768×512 · 18 步 · 402 秒；脚本 `gen-cover-refs.py`）。
> **一律本地生成**，不调用线上生图；每舱一张、固定 seed，不批量盲生（一张 7 分钟）。

从参考图里抄下来的三条，比"多加零件"有效得多：

1. **底部内收的踢脚**（toe kick）：柜/沙发/街机底部 8–10cm 缩进 8–12%，
   这是"设计过的家具"和"一个盒子"的分水岭。
2. **外凸的护栏 / 边条**：桌面、台面、柜台在正面和两侧各探出 2–4cm 并压暗一档，
   轮廓立刻有层次；顶板**不要**与柜体同深（同深会从 26° 视角把柜门整块盖住）。
3. **圆角与嵌入灯带**：主体积一律过 `bevel_main()`（12mm / 1 段 / 40° 以上才倒）；
   霓虹条嵌在凹槽里（前后各留 1–2cm 实体），不要直接贴在表面。

已落地：`covers_lib.bevel_main()` 对**全部 61 件**生效（长边 ≥0.30m 且最薄 ≥0.04m 的件，**2 段 16mm 倒角**），
娱乐舱 7 件按参考图重做（点唱机拱顶/竖霓虹/圆格栅、街机外凸控制台/内凹屏、沙发踢脚与压线）。
其余 9 舱先吃倒角这一层，逐舱按各自参考图再补"踢脚 + 边条"。

## 2026-11-07 第二轮 · 全 10 舱本地参考图 + 外壳化 + 尺寸校准

> 参考图：`3d/assets/refs/<room>.{png,json}`，**10 个舱全部出齐**（本地 SDXL，固定 seed，
> 脚本 `3d/tools/gen-cover-refs.py`）。一次加载模型后每舱约 1–2 分钟，别再一张一次起进程。
>
> **2026-11-09 清理**：10 张 `<room>.png` 与 `3d/assets/renders/covers-*.png` 检查板已删除
> （共 21.6 MB，二者都不入 git、运行时不引用）；只保留 `<room>.json` 的模型 / seed / prompt 记录。
> 复现单舱：`C:\Python314\python.exe 3d/tools/gen-cover-refs.py <room>`（如 `fun bridge`）。

### 从 10 张图里收敛出的四条规则（按有效性排序）

1. **浅色外壳 + 深色内嵌面板**：不是通体深灰的「黑铁块」。外壳用 `palette()['shell']`
   （冷白 0.76/0.80/0.83），屏幕/面板保持暗色。
2. **顶部外凸压边、压暗一档**：轮廓才有层次；压边**不要**用主题色铺满整圈，
   试过一次，仓库/配电的琥珀顶框连成黄块，比模型本身还抢眼。主题色只交给发光缝。
3. **嵌入式发光缝**：藏在压边下方 1–2cm，不要贴在表面当浮条。
4. **底部暗色压边**（内收踢脚的替代做法）：只贴底缘、**不垫在底面之下** ——
   后者会让整件长高 7cm，连带 `cover_refs.json` 与 Godot 高度表失配，纵向被压 6~9%。

### 落到代码里的三道工序（全 61 件自动生效）

| 工序 | 位置 | 作用 |
|---|---|---|
| `bevel_main()` | `covers_lib.py` | 2 段 16mm 倒角，带面数预算（为后续工序留 100 tris） |
| `shell_pass()` | `covers_lib.py` | 主体刷白壳 + 顶面压边 + 发光缝 + 底部压边；`ecosys` 与 `bridge_table` 豁免 |
| `depth_ext()` | `covers_lib.py` | 给薄型家具补「后机架 / 床头板」，把地图进深 / 建模进深压到 1.30 以内 |

- `COVERS_SKIPBOARD=1` 可只导出不出检查板（GPU 被 SDXL 占用时用）。
- **改了模型尺寸一定要重跑 `measure-cover-refs.py`**，否则 Godot 会按旧尺寸缩放。

### 两把新工具

- `3d/tools/check-cover-scale.cjs`：建模尺寸 vs 地图占地 vs Godot 高度表，
  输出横向/纵向缩放比，标出 >1.35 的件。靠它发现生态舱 8 件被拉 2.25~4.32 倍。
- `3d/tools/cover-shot.py`：单件特写（18° 前视 + 78° 近俯视）。

### 尺寸校准结果

| 项 | 改前 | 改后 |
|---|---:|---:|
| 生态舱 8 件拉伸比 | 2.25~4.32× | 0.97~1.24× |
| 全 61 件横向 >1.35× | 16 件 | **4 件**（1.36~1.39，属小幅缩放） |
| 纵向失配 | 有 | **0 件** |
| 61 件合计 | — | 6.20 MB，单件 ≤2800 tris |

生态舱已从「1×1 归一化 + 缩放」重写为**真实尺寸建模**并迁到 `covers_lib.py`
（消掉了它自带的一套重复图元函数）；巨树树冠改球簇，避免为守 1.30 档位高度压成飞碟。

### 检查板取景（验收工具修正，不改模型）

`checker_board()` 的 `tilt` 是**相机绕 X 轴旋转角**，俯角 = 90° − tilt。
之前写 26° 实际是 64° 俯视，薄柜全被拍成横条，白白误判了好几轮「模型像白板」；
现在 58°（俯角 32°）+ 横向偏角（相机往 +X 挪 `total_w*0.24` 并 look_at），
才是真正的 3/4 侧视。棚灯此前也降过档（key 1500 / fill 520 / rim 700），避免金属顶面过曝。

### 下一轮（尚未落地）

- 生态舱参考图给的是**多边形容光玻璃围板 + 深色厚基座**，可给树池 / 水池 / 培养罐补八边形发光围板。
- 余下 4 件小幅拉伸（服务台 / 记录台 / 压缩机 / 监护仪）继续补进深。
- 3D 侧 LOD / 合批（127 件各是一个节点）。

### 场景设备点也统一了语言

`map_builder.gd::_build_device()` 原来每个房间放一块**整块主题色立方体**（仓库/配电是刺眼纯黄），
和掩体本体的外壳语言完全脱节。现改为：中性浅壳 + 内收踢脚 + 顶面暗色压边 +
一条主题色发光缝 + 顶部小屏。`--devicetest` 仍通过。

## 2026-11-07 第三轮 · 视线遮挡高度统一到 1.70 m（人眼视角往上）

> ⚠ **2026-11-09 已暂关（本节保留为历史口径）**：`covers_lib.SIGHT_MIN_H` 现默认 **0**
> （环境变量 `COVERS_SIGHT_MIN_H` 可覆盖），新导出的 GLB 不再焊背板；
> **已经导出的 61 件 GLB 与 `cover_refs.json` / `COVER_HEIGHT` 全部原样保留**，
> 由 `map_builder.gd` 的 `COVER_SIGHT_SHELL = false` 在实例化时隐藏 `sight_shell` / `sightglow`。
> 结果：地图里看不到铁板了，但**资产没删、判定没动**，改回 `true` 即恢复。
> 代价：本节「判定挡、画面不挡」的不一致重新出现 —— 正解是按实际顶面高度做 LOS，见同日条目。

> 用户裁定：「仓库的高度得遮住人眼视角……原来能遮挡手电筒和近身视野光亮的物件，
> 都得把高度调整到人眼视角往上」。

### 为什么必须改：判定与画面不一致

- **2.5D** `js/engine/geo.js::los()` 是纯 2D 矩形判定：遍历 `M.cover`，
  线段与任一 cover 矩形相交就返回 false。**没有高度概念**，所以 0.55 m 的茶几
  和 1.30 m 的货架一样，完全挡住手电锥与近身视野。
- **3D** `player.gd` 相机在 **1.62 m**（胶囊 1.70 m），而掩体全部按
  anchor 1.30 / mid 0.95 / accent 0.55 建模 —— 实测 **61/61 件都低于 1.62 m**
  （最低 0.48、最高 1.61）。玩家能从所有家具上方看过去：判定说挡、画面说不挡。

### 口径

- `SIGHT_MIN_H = 1.70`（`covers_lib.py`）：等于玩家胶囊高，眼高 1.62 + 8 cm 余量。
- **2.5D 判定不动**，因此**平衡完全不变**（不跑蒙特卡洛也能确定）。改的只是 3D 视觉/碰撞高度。

### 实现：`sight_extend()`（不拉伸原几何）

在占地的**后缘**补一段到 1.70 的遮挡结构：上下两段暗色背板（中间留主题色发光缝）、
两根落地立柱、顶部横梁。家具本体（茶几 / 水池 / 吧凳 / 货架）保持原比例与细节，
**不做 Y 方向拉伸**——上一轮刚修完占地拉伸，不能再用拉伸制造新的变形。

- 结构件全部用 `P['dark']` 并 `bpy.ops.object.join()` 成**一个** `sight_shell` 网格，
  发光缝单独一个对象：每件只多 2 个绘制节点，避免 127 件 × 5 个节点拖垮帧率。
- `BUDGET_TRIS 2800 → 2950`（`validate-assets.cjs` 的 prop 类硬上限 3000），
  `bevel_main` 的预留从 100 提到 200 tris。
- 之所以背板放在后缘：从相机侧看，家具在前、背板在后，家具仍完整可见，
  但水平视线（1.62 m）被 `sightpanel_hi` 挡住，与 2.5D 的 LOS 一致。

### 链路（顺序不能反）

1. `blender -b -P 3d/tools/build-covers-<room>.py` → 61 件补高
2. `blender -b -P 3d/tools/measure-cover-refs.py` → 重测包围盒（高度全部 ≥1.70）
3. `node 3d/tools/sync-cover-height.cjs` → 把 **COVER_HEIGHT v2 段**按实测重写
   ⚠ **必须先 2 后 3**：Godot 按 `height / refs[kind].高` 做 Y 缩放，
   表若还留着 0.55/0.95，会把补高后的模型**压回矮个子**，遮挡白做。
4. `node 3d/tools/sync-models.cjs` → Godot 导入 → `--arttest` / `--devicetest`
5. `node 3d/tools/sync-cover-height.cjs --check` 与 `check-cover-scale.cjs` 复核

`build-map-v2.cjs` 的 v2 名义高度也改成 `SIGHT_MIN_H`（`TIER_HEIGHT` 只保留档位语义，
不再是运行时高度真源）；**本轮没有重跑该脚本**，以免重新生成布局坐标。

### 新工具

- `3d/tools/sync-cover-height.cjs`：按 `cover_refs.json` 同步 `map_builder.gd` 的
  COVER_HEIGHT v2 段与 `cover_height_v2.gd.txt`；`--check` 只校验。
- `3d/tools/check-cover-scale.cjs`：新增「低于 1.70 m」报警（与缩放比、纵向失配并列）。
- `main.gd --eyeshot <room_id>`：相机放到**人眼 1.62 m 平视**的验收截图
  （`--covershot` 是 2.2 m 俯视，验证不了遮挡），产物 `covers-eye-<room>.png`。

### 读数

61 件实测高度 **1.70–1.74 m**，低于 1.62 m **0 件**，纵向失配 **0 件**，
0 件超 2950 tris 预算；`3d:assets` 0 错误；Godot 导入 0 脚本错误；
`--arttest` 127 件 / 0 不一致；`--devicetest` 通过。

## 2026-11-07 第四轮 · PBR 材质 / 医疗无人机 / 任务点交互修复

> 用户 12:32：「部分舱室的任务仍然不能交互」「建模质量能不能通过多轮迭代达到和 SDXL
> 差不多的材质？我这里没有存储和面数限制」「医疗无人机仍然没有像 SDXL 那样的建模」。

### 一、任务点交互（3D 侧 bug）

- 2.5D 侧**没有问题**：Playwright 探针遍历 26 个任务点，全部「可寻路到达 + 可交互」。
- 3D 侧 3 个点失效：医疗舱「消毒循环」、监控室「监控墙重连 / 操作台」。
  它们落在 cover 矩形里，`_cover_top()` 把设备顶到掩体顶面；掩体统一补到 1.70 m 后，
  设备悬在 **1.72 m**，玩家眼高 1.62 m —— 其余 23 个都在 0.57 m 台座上。
- 修复 `scene_extras.gd::_task_placement()`：被 cover 压住的点沿并集 bbox 四边找
  掩体外侧空位，设备落回 0.57 m，并由 `_pedestal()` 自带同款台座
  （`map_builder._build_device_pedestals` 对 covered 点本来就跳过，不会重复）。
  **不改 map_v2.json 的 points**，2.5D 的 `nearPoint` 坐标保持不动。
- 新增 `main.gd --tasktest`：逐点验证「设备存在 / 不悬高 / 站位能收到交互项」，
  实跑 **26 点 / 0 失败**。

### 二、PBR 材质：判断与实现

**判断**：此前 61 件全是纯色 Principled、**零贴图**，这才是「塑料感」的主因，
加面数不解决。SDXL 概念图是**带光照的 2D 渲染结果**，不能当 albedo 直接贴
（非无缝、UV 边界断裂、光影会脏）。能实时复刻的是它的**材质层次**：
albedo / normal / roughness、emissive 细节、几何倒角与分件。
氛围光、景深、手绘细节属于渲染层，不是建模层，1:1 不现实但可以靠灯光/后期逼近。

**实现**
- `3d/tools/gen-pbr-textures.py`：周期噪声生成**真正 tileable** 的 10 套材质
  （金属面板 / 拉丝钢 / 喷漆白壳 / 屏幕 / 织物 / 警示 / 玻璃 / 叶片 / 橡胶 / 木纹），
  每套 albedo + normal，256² JPEG，共 20 张 / 153 KB。
- `covers_lib.mat()` 建材质时接 Image Texture → Base Color、NormalMap → Normal；
  `glow / mark / red / water` 保持纯色发光与各舱主题色，不接贴图。
  `COVERS_PBR=0` 一键回退纯色做 A/B。
- 面数/存储限制按用户要求放开：`BUDGET_TRIS 2950 → 6000`、
  倒角 **2 段 16mm → 3 段 20mm**、manifest prop 项预算 6000 / textures 20、
  `validate-assets.cjs` 的 prop 上限 3000 → 8000。

**性能教训（重要）**：第一版用 512² PNG + 每材质 3 张图，61 个 GLB 各内嵌十几张，
总体积 200 MB+、Godot 导入上千个重复纹理，帧率 **48 → 10 FPS**。
改成 JPEG + 256² + 去掉 roughness 图（用材质常量）后，总 GLB **54 MB**、
帧率 **91 FPS**，材质纹理仍清晰。
**瓶颈不是存储或面数，是实时渲染的纹理资源数与 draw call**；
若还要上 512²，下一步应做 Godot 侧共享材质（GLB 不内嵌贴图，按材质名注入），
而不是继续往每个 GLB 里塞图。

### 三、医疗无人机

- 旧实现 `scene_extras.gd::_drone()` 只有一个 SphereMesh + 一个 TorusMesh。
- 新脚本 `3d/tools/build-medbot.py`：白色喷漆外壳（双片椭球 + 深色腰带）、
  青色玻璃医疗舱与药包红十字、四组悬浮推进器（环 + 三叶桨 + 推进灯）、
  前脸状态屏与散热格栅、顶部扫描灯与天线、底部扫描锥与机械夹爪。
  **67 件 / 5610 tris / 461.8 KB GLB**，走同一套 PBR 贴图。
- 不走 `L.run()`：那会自动跑 `shell_pass` / `sight_extend`，把悬浮体补上落地背板到 1.70 m。
- `scene_extras._drone()` 改为加载 `medbot.glb`（保留占位体兜底），
  manifest 登记 `medbot`（prop / wip）。

### 四、还能继续迭代的方向（诚实清单）

1. **屏幕 emissive 贴图**：让屏幕/状态灯显示 UI 细节，而不是一整块纯色发光。
2. **磨损 / AO / 污渍**贴图与曲率遮罩，几何上加铆钉、把手、缆线、螺纹。
3. **Godot 侧共享材质** + 反射探针 / SSAO / bloom —— 对「像参考图」的贡献
   很可能比继续加模型细节更大。
4. 逐舱拿本地 SDXL 参考图继续校准分件比例（10 张已出齐）。

## 2026-11-07 第五轮 · 地板口径归位 + 非交互面贴图化

> 用户 13:56：「除了那种需要实时交互的，其他场景都可以用贴图来提升质感。
> 还是一个场景的优化，然后从你的 Demo 中看出来好像特意把地板给换了，
> 没有必要换掉，还是用原来的底图。」

### 一、「地板被换了」的根因（不是换贴图，是换了尺度）

先查清事实链，避免误判：

| 检查项 | 结论 |
|---|---|
| 2.5D `js/data/map.js` 是否改过地板 | **没有**（diff 只动 cover/pipes/facility） |
| 底图 `assets/scene/v4/base-lit.png` 是否被改 | **没有**（仍是 10/31 原件，17,360,427 B） |
| 3D 侧地板贴图文件是否被换 | **没有**（11 张与 `v4/tex/` 逐字节 sha256 相同） |
| **3D 侧地板重复尺度** | **换了** —— 全局 `UV_WORLD_SCALE=4.0`，底图是 per-room（2.8~7.5） |

真因是**同一张表被抄了两份**：`tools/blender-ship.py` 有 `FLOOR_SCALE`/`FLOOR_TINT`，
`map_builder.gd` 又硬编码了一套 `ROOM_TEXTURES` + 全局 4.0。
`floor-lab.png` 内部每循环 9 格，所以 med 单格边长：
底图 `3.0/9 = 0.33 m` vs 3D 原来 `4.0/9 = 0.44 m` —— **差 33%**，观感上就是「另一种地板」。

### 二、修法：单一真源

- **新增 `3d/preview/data/floor_spec.json`**（由 `3d/tools/export-floor-spec.cjs` 生成）：
  每舱的 `tex` / `repeat_m` / `tint` / `metallic` / `roughness`，外加走廊一条。
- `tools/blender-ship.py` **改读这份 JSON**（原来内联的表删掉）。
- `map_builder.gd` 也读这份，删掉 `ROOM_TEXTURES` 与地板用的全局 `UV_WORLD_SCALE`。
  `repeat_m` 直接进 UV：`UV = 世界坐标 / repeat_m`（等价于底图的 Object 坐标 + Mapping Scale）。
- 染色也归位：底图只有 4 个舱有 tint、其余原样；3D 原来给所有舱统一套
  `Color(0.88,0.9,0.94)`，那也是「看起来被换过」的另一半原因。

**新增工具**
- `3d/tools/export-floor-spec.cjs`：真源导出，`--check` 只校验。
- `3d/tools/check-floor-spec.cjs`：三查 —— 与真源一致 / 贴图存在 /
  **`map_builder.gd` 里没有第二份地板表**（卡死「又抄一份」这种漂移）。
- `main.gd --floortest`：**检查场景里真实建出来的 48 个地面网格**的贴图名、
  UV 实际重复周期、材质染色，逐舱与真源对账。

### 三、自测踩的坑（值得记住）

第一版 `--floortest` 写成「拿真源和真源比」（want 和 got 都读同一份 JSON），
**永远相等，注入漂移也照样 0 失败** —— 等于没测。
第二版改成检查真实场景网格后仍测不出，因为**改真源时 3D 侧跟着变，本来就该一致**。
真正要防的是「3D 侧不再读真源」，所以在 `map_builder.gd` 里注入
`repeat_m := 4.0` 写死值，自测立刻报 **10/10 FAIL**；还原后 0 失败。
**教训：验证漂移的测试，必须在「消费端」注入，不能在「生产端」注入。**

### 四、非交互面贴图化（用户指定的路线）

「除了需要实时交互的，其他都可以用贴图提质」——本轮落地四处：

| 部位 | 原状 | 改后 |
|---|---|---|
| 天花板 | `panel-metal`（平均亮度 53/255）+ triplanar | `panel-white`（144/255）+ **平面 UV 2.4 m 一循环** |
| 设备台座 | 纯色（`_material("", ...)`） | `panel-white` / `panel-metal` |
| 墙顶灯带 | 只有墙顶一条 | 新增**天花板一圈灯带**，颜色取 `theme.glow` |
| 天花板补光 | 无 | 新增一盏**朝上**的弱平行光（0.16） |

**天花板原来为什么是死黑**：它在 3.2 m、法线朝下，而所有灯都在 2.6 m 以下 ——
天花板是**背光面**，贴图细节被压光。另外 `triplanar=true` 时 `uv1_scale=0.35`
把贴图放到 2.9 m 一循环，加上朝下的法线选不到 Y 轴投影，结果就是一片纯色。

**验收新增 `main.gd --ceilshot <room>`**：斜视天花板（正下方仰视只能看到舱心那块，
灯带在视野外）。

### 五、顺手修的一个事故

`tools/blender-ship.py` **原本没有 `--dry` 开关**。误以为 `--dry` 能跳过渲染，
结果真的把入库资产 `assets/scene/v4/base-lit.png` 重烘覆盖了
（当前工作区 `map.js` 的 cover 已改 → 底图跟着重排 → **16.6% 像素显著不同**）。
已 `git checkout` 还原，并补上真正的 `--dry`（只建场景不渲染）与 `--out <路径>`
（试渲染写到别处）。**底图是入库资产，重烘必须是显式动作。**


## 2026-11-11 · 美术方向四件套（门 / 保安机器人 / 工业天花板）

> 裁定与规格真源：`3d/docs/art/ART_DIRECTION.md`（2026-11-11 用户拍板）。
> 三件 P0 全部走 **千问本地出材质 → Blender 建模/导出 glb**；门板直接采样 2.5D
> `assets/scene/v4/tex/door-panel.png`，不重新生成。SDXL 未使用。

### 1. 模型（`3d/assets/export/` → `3d/preview/assets/models/`）

| 资产 | 源文件 | 导出物 | 三角面 | 体积 | SHA256（前 16） | 尺寸（m） | 材质/贴图 |
|---|---|---|---:|---:|---|---|---|
| door_frame | `assets/models/door_frame.blend` | `assets/export/door_frame.glb` | 688 | 72 KB | `41c6fd5acc593203` | 2.22 × 0.37 × 3.0 | 2 / 2 |
| door_leaf_l | `assets/models/door_leaf_l.blend` | `assets/export/door_leaf_l.glb` | 448 | 479 KB | `8b609f755535cd42` | 0.9 × 0.219 × 2.485 | 3 / 6 |
| door_leaf_r | `assets/models/door_leaf_r.blend` | `assets/export/door_leaf_r.glb` | 448 | 473 KB | `07f1f550afd4583a` | 0.9 × 0.219 × 2.485 | 3 / 6 |
| secbot | `assets/models/secbot.blend` | `assets/export/secbot.glb` | 3,776 | 685 KB | `ae2379b9b612dc5a` | 0.592 × 0.45 × 1.25 | 5 / 9 |
| ceiling_beam | `assets/models/ceiling_beam.blend` | `assets/export/ceiling_beam.glb` | 36 | 65 KB | `11203f50de7b3c41` | 3.0 × 0.12 × 0.18 | 1 / 2 |
| ceiling_pipe | `assets/models/ceiling_pipe.blend` | `assets/export/ceiling_pipe.glb` | 52 | 19 KB | `5e5aa3e8d2886b8c` | 3.0 × 0.07 × 0.07 | 1 / 2 |
| ceiling_tray | `assets/models/ceiling_tray.blend` | `assets/export/ceiling_tray.glb` | 36 | 65 KB | `a124030949a18924` | 3.0 × 0.255 × 0.07 | 1 / 2 |

- **2026-11-11 晚 v2 门**：`build-door-v2.py` 重建门框为“贯穿墙厚的内衬 + 双面止口压条 +
  门楣实体 + 顶部滑轨/端挡 + 门槛导向槽”；门扇为“核心板 + 双面凹槽面板 + 周边压框 + 吊挂滚轮”，
  不再是贴在墙洞上的方盒。场景路径不变，`scene_extras._build_doors()` 无需改接线。
- 脚本：`build-door-v2.py` / `build-secbot.py` / `build-ceiling-kit.py`；共享材质与导出：
  `art_direction_lib.py`。
- 朝向：Blender +Y 前 → Godot **-Z 前**；门扇原点在门扇中心（场景抬到 1.25 m），门框/梁/管线/线槽原点在
  底/长度中心；脚底 pivot = 0。
- `secbot` 动画：`idle` + `walk`（24fps，51 通道/段），由 `scene_extras._robot()` 加载、
  `secbot_view.gd` 按真实位移切段；缺 glb 时回退旧盒子版。
- 门框 2 个 primitive（门框 + 暗色滑轨）；门扇 3 个 primitive（门板 + 门边 + 暗色五金）；
  天花板套件各 1 个 primitive。

### 2. 门板派生贴图（`3d/assets/textures/art-direction/door/`）

源：2.5D `assets/scene/v4/tex/door-panel.png`（1536²，项目自有资产）。
派生脚本：`derive-door-textures.py`；外侧各裁 2.5%、50% 切左右半幅，每半幅 384×768
画在 **768²** 画布中央（UV 对应 u=0.25..0.75）；emissive 只保留每半幅外侧 10% 的灯槽。

| 文件 | 体积 | SHA256（前 16） | 用途 |
|---|---:|---|---|
| `door_panel_L_albedo.jpg` | 93 KB | `988d44676bd2608e` | 左扇 albedo（768²） |
| `door_panel_L_normal.jpg` | 75 KB | `900a2260fdb12697` | 左扇 normal（768²） |
| `door_panel_L_rough.jpg` | 47 KB | `6103add091c7f6f4` | 左扇 rough（768²） |
| `door_panel_L_emissive.png` | 3 KB | `102001f8f9eed783` | 左扇灯槽自发光（768²） |
| `door_panel_R_albedo.jpg` | 91 KB | `dc4a4777fa46f292` | 右扇 albedo（768²） |
| `door_panel_R_normal.jpg` | 73 KB | `d4cb952264c41535` | 右扇 normal（768²） |
| `door_panel_R_rough.jpg` | 46 KB | `27f618cc08f68bb7` | 右扇 rough（768²） |
| `door_panel_R_emissive.png` | 3 KB | `1818664332ed4df6` | 右扇灯槽自发光（768²） |

### 3. 千问材质（本地生成，Qwen Research License · 非商用）

脚本：`gen-qwen-art-direction.ps1`；原始图在 `3d/assets/renders/qwen-art-direction/`
（`.gitignore` 已忽略整个 `3d/assets/renders/`）。调色/派生：
`grade-art-direction-textures.py`。六张的 prompt 与 seed：

| slug | seed | prompt（尾缀统一省略） | 用途 |
|---|---:|---|---|
| ceiling-deck | 20261132 | `industrial pressed steel ceiling deck panels, dark gunmetal, stamped rectangular panels with recessed seams, subtle grime and fine scratches, matte painted finish` | 天花板顶板 albedo |
| ceiling-beam | 20261133 | `galvanized steel structural beam surface, cool grey metal, worn edges, faint rust at bolt holes, industrial` | 梁/门框/桥架 |
| ceiling-pipe | 20261134 | `painted steel industrial pipe surface, dark grey, clamp marks, oil grime, slightly worn paint` | 管线 |
| secbot-paint | 20261135 | `painted steel armor plate surface, matte dark charcoal, chipped edges, fine wear and faint scratches, flat panel` | 保安装甲漆 |
| secbot-accent | 20261136 | `deep red industrial warning paint, slightly worn matte finish, fine scratches, dark crimson` | 红色识别/目镜 |
| secbot-metal | 20261137 | `dark machined steel joint surface, oiled metal, worn edges, fine machining marks, gunmetal grey` | 关节/爪/脚掌/电击棍 |

尾缀（所有 prompt 必带）：`seamless flat texture map, orthographic top-down view, evenly lit
with no shadow, fills the entire frame edge to edge, no object outline, no background, no
perspective, tileable, high detail`。negative 同 `gen-qwen-materials.ps1`。
`secbot-paint` 首版 prompt 含 "robot"，千问画成了机器人而非平铺材质；已去掉该词并重跑，
当前入库为修正后的平铺钢板。

天花板顶板运行时贴图（`map_builder._ceiling_material()` 读取）：

| 文件 | 体积 | SHA256（前 16） |
|---|---:|---|
| `preview/assets/textures/ceiling-deck.png` | 333 KB | `7017de8ac064074c` |
| `preview/assets/textures/ceiling-deck-normal.png` | 173 KB | `4125a7ad534dc297` |
| `preview/assets/textures/ceiling-deck-rough.png` | 66 KB | `bd8016150372ddcd` |

### 4. 三态声明（`docs/ASSET_GOVERNANCE.md` §1）

- **入库**：是。模型/贴图/脚本在 `3d/assets/**`，运行时副本在 `3d/preview/assets/**`。
- **发布**：否。2.5D 发布白名单 `tools/deploy-config.cjs#ENTRIES` 只含 `index.html` /
  `js` / `audio` / `assets` 等，不含 `3d/`；本轮是 3D 预演本地资产。
- **留盘**：是。原始千问图在 `3d/assets/renders/qwen-art-direction/`（忽略，不随仓）；
  重跑见 `gen-qwen-art-direction.ps1`。

### 5. 接线与验收

- `scene_extras.gd`：`_build_doors()` 优先实例化 `door_frame.glb` + 左右门扇；
  `_apply_door_state()` 的 leaf 类型由 `MeshInstance3D` 放宽到 `Node3D`，开合/碰撞/
  扫描/音效契约不变；缺 glb 回退旧 BoxMesh。
- `scene_extras.gd::_robot()`：优先加载 `secbot.glb`，`secbot_view.gd` 切 `idle/walk`；
  缺 glb 回退旧盒子版。`secbot_view` 只读父节点位移，不碰 sim。
- `map_builder.gd`：顶板改用 `ceiling-deck` 材质；`_add_ceiling_kit()` 按 `room.rect`
  铺主梁（3m 档）、次梁（6m 档）、2 条管线、1 条线槽；全部进 `_ceil_nodes`，
  `set_ceiling_visible()` 仍能整层隐藏；灯带仍随 `set_power` 变暗。
- `godot --headless --path 3d/preview --import`：新 glb/贴图的 `.import` 已生成；
  normal 贴图 `.import` 已设 `compress/normal_map=1`（仅本轮新资产）。
- `scene_extras.gd` / `map_builder.gd` / `secbot_view.gd` 均通过 Godot `--check-only`。
- `npm run baseline:check`：`BASELINE OK`（文件数见本次输出；2.5D 只读基线未动）。
- **全项目编译**：`--crewshot` / `--doorshot` 已实际跑通，人物与门的新 glb 在真实
  `map_v2.json` 场景中加载；编译期剩余的类型推断问题已在 `main.gd` 同批修正。
- **分辨率统一**：本轮所有运行时贴图（人物 / 门 / 门板 / 保安机器人 / 天花板）统一 **768×768**；
  千问原始 512 方图仅在 `3d/assets/renders/` 作为源图保留。

### 6. 验收截图（`3d/preview/screenshots/`）

| 截图 | 内容 |
|---|---|
| `artcheck-door.png` / `artcheck-secbot.png` / `artcheck-ceiling.png` | 独立打光下的三件资产 |
| `artcheck-room-door.png` | 真实 bridge 舱：3D 滑门 + 2.5D 门板（v1 截图，历史） |
| `artcheck-room-ceiling.png` | 真实 bridge 舱：工业顶板 + 梁 + 灯带 |
| `artcheck-room-secbot.png` | 真实 armory 舱：双足保安机器人 + 工业天花板 |
| `door-closed.png` / `door-open.png` | v2 门：关闭两扇合拢 / 打开让出整段门洞（真实 bridge） |
| `crew-lowpoly.png` | 第三版人物 in-game 同框（2.5D billboard / 3D / 换色） |
| `crew-face-check.png` / `crew-body-check.png` / `crew-full-check.png` | 第三版人物近景验收 |
