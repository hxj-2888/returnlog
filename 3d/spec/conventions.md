# 3D 资产约定（启航路 3D 版）

> 这份文件是**硬约定**，不是建议。`3d/tools/validate-assets.cjs` 会按它检查清单。
> 单位、朝向、枢轴三条只要错一条，模型进引擎就是歪的，别指望在 Godot 里补。

## 1. 单位与坐标

| 项 | 约定 | 说明 |
|---|---|---|
| 长度单位 | **米** | Blender 场景单位设为 Metric / Scale 1.0；导出到 glTF 仍是米 |
| 网格 | 1 米 = 1 单位 | 2.5D 的「格」是 1 米；墙厚 0.34、墙高 1.16 是既有口径，3D 墙体按同样数字建 |
| Blender 朝向 | **+Y 前，+Z 上** | 建模时角色面朝 +Y |
| Godot 朝向 | **-Z 前，+Y 上** | glTF 导出勾选 `+Y Up`，引擎里不需要再转 90° |
| 枢轴位置 | 见 `pivot` 字段 | `origin` = 世界原点对齐（墙体/地板）；`base_center` = 底面中心（家具/设备）；`socket` = 交互点（门把手、面板中线） |

## 2. 命名

```
资产 id     ^[a-z][a-z0-9_]{2,39}$        例：device_panel_fix
Blender 源  models/<id>.blend
导出物      export/<id>.glb
贴图        textures/<id>_<用途>.png        例：device_panel_fix_basecolor.png
```

- 一个 `.blend` 只出一个 `.glb`；需要多个部件时用 Collection 分组，导出时按 Collection 拆。
- 贴图只允许 **PNG**；颜色贴图带 `_basecolor`，法线 `_normal`，粗糙度/金属度合并为 `_orm`（R=AO, G=Rough, B=Metallic）。
- 不允许在文件名里出现中文、空格、大写字母。

## 3. 面数与材质预算

| 类别 | 三角面上限 | 材质槽上限 | 备注 |
|---|---|---|---|
| `ship` | 120 000 | 6 | 船体、外壳、舷窗；远景可用 LOD2 |
| `room` | 15 000 | 4 | 单舱室套件（墙/地/顶/固定家具） |
| `prop` | 3 000 | 2 | 箱子、桌子、管线、货架 |
| `device` | 8 000 | 3 | 26 个任务点对应的可交互设备 |
| `character` | 12 000 | 2 | 低模船员，骨骼 ≤ 40 |
| `fx` | 200 | 1 | 面片特效（红光、火花） |

超预算的模型**不进 `export/`**：先在 Blender 里减面，或申请把上限写进清单再改。

## 4. 导出与导入

```bash
# 单个导出（Blender 5.2.2 LTS）
blender -b 3d/assets/models/device_panel_fix.blend \
  -P 3d/tools/blender-export.py -- --out 3d/assets/export/device_panel_fix.glb

# 按清单批量导出（只导 status = wip / done 的）
blender -b -P 3d/tools/blender-export.py -- --manifest 3d/spec/assets.manifest.json --all
```

导入 Godot 的键名与取值写在 `3d/spec/godot-import.cfg`，由
`npm run 3d:import:check` 逐个 `.glb.import` 核对（只读、只报错、不改文件）。
口径经 Godot 4.6 stable 无头导入实测（探针：`3d/preview/assets/import-probe/`）：

- `meshes/light_baking = 0`（Disabled；引擎默认是 1 = Static Lightmaps）
- `meshes/generate_lods = true`、`meshes/create_shadow_meshes = true`
- `gltf/embedded_image_handling = 1`（Extract Textures，Godot 4.6 默认）
- `nodes/root_scale = 1.0`；`blender-export.py` 已应用变换，不再二次缩放
- **碰撞不是全局导入项**：在「高级导入设置 → 生成 > 物理」按节点勾选，
  或导入后挂 `StaticBody3D` + `CollisionShape3D`，依据清单的 `collision` 字段

## 5. 清单是唯一真源

- 任何进 `export/` 的文件**必须**在 `3d/spec/assets.manifest.json` 里有条目。
- `status` 的含义：
  - `todo`：只占位，文件可以不存在；
  - `wip`：源文件存在，导出物可有可无；
  - `done`：**源 + 导出都必须存在**，且面数不超预算（校验脚本会卡）；
  - `blocked`：缺依赖（例如等贴图重绘），必须写 `notes`。
- 改清单后跑 `npm run 3d:assets`；不通过就不许提交。
- 导出物进 Godot 前跑 `npm run 3d:sync:models`（仓库级真源 → `3d/preview/assets/models/`），
  贴图由 `3d/tools/sync-assets.cjs`（3D 分支）同步，两者不互相覆盖。

## 6. 与 2.5D 的边界

- **3D 是 2.5D 的延伸，不是第二条产品线**（AGENTS.md §一.11）；共享地图、数值、语料、
  规则与音频基线，只允许按键操作、维度、部分美术三类差异。
- 墙在 3D 里**必须是实体几何**（有厚度、有高度、有门洞），不允许用 2.5D 的零厚度线段糊过去。
- 本地生成统一走**千问**（SDXL 已退役）；千问参考图可进入 3D **设计参考**流程
  （`docs/qwen21/crew-refs/`、`3d/assets/crew_refs/`），但运行时只加载导出的 GLB/贴图，
  不直接读参考图；模型/seed/prompt/许可必须登记 `ASSETS.md` / `CREDITS.md`。


## 7. 截图 / 机位

- **严禁截图操作捕获鼠标**（AGENTS.md §五.8，2026-11-11 用户裁定）。
- 截图/机位参数统一走 `_screenshot_mode`：`player.capture_mouse_on_ready=false`、
  `Input.mouse_mode=VISIBLE`、`_input()` 不响应、`_exit_tree()` 释放；
  禁止 `Input.mouse_mode=CAPTURED` / `Input.warp_mouse()`。
- 截图运行前确认没有其它 Godot 进程占用鼠标；运行后确认进程退出、光标可见。
- 截图是**本机验收图**，按 `.gitignore` 不入库；`--probetest`/`--mousetest` 是输入链自测，
  不是截图，必须单独跑并恢复 `VISIBLE`。
