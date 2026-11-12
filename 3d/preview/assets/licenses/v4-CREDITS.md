# assets/scene/v4 · 2.5D 底图与门素材

- `base-lit.png`：由 `tools/blender-ship.py` 从 `js/data/map.js` 的房间、墙体、门、
  走廊与 `tex/` 纹理烘焙（Blender 4.5.9 / 5.x 均可，正交 12° 俯角，4704×3850 = 98×82 格）。
  改了地图几何或家具材质后必须重新执行：

  ```bash
  blender -b -P tools/blender-ship.py          # 全分辨率底图
  blender -b -P tools/blender-ship.py -- --test # 960×575 预览（_preview.png）
  ```

- `hull-deck.png`：船体底板，由 `tools/gen-hull.py` 程序化生成（2352×1968 = 98×82 格 × 24px），随仓库 MIT。
- `tex/floor-*.png`、`tex/wall-panel.png`、`tex/cafeteria-floor.png`、`tex/warehouse-floor.png`：
  本仓飞船地面 / 墙面纹理（后两张为 2026-10-30 SDXL 新生成），随仓库 MIT。
- `tex/panel-metal.png`、`tex/crate-steel.png`、`tex/fabric-weave.png`、`tex/table-composite.png`、
  `tex/panel-white.png`、`tex/cafeteria-top.png`、`tex/warehouse-rack.png`：家具 / 掩体表面材质，由 `tools/gen-materials.py` 用本地 **SDXL**
  （`sdxl-base`，768px 出图）生成（2026-10-29），再统一「降饱和 + 冷调 + 四向镜像拼贴 + 回缩 1024」，
  保证 `REPEAT` 平铺无接缝且色温压到既有地板 / 墙面同一档；随仓库 MIT。
- `tex/hazard-stripe.png`、`tex/ao-soft.png`：同工具生成的程序化贴图（琥珀警戒斜纹、接地软阴影 alpha），
  不依赖显卡；随仓库 MIT。
  该工具另有 `--mode reuse` 兜底路径：在没有 SDXL / 显存不足时直接从 `wall-panel`、`floor-carpet`、
  `floor-steel`、`floor-lab` 派生材质，保证 Blender 端始终能出图。
- `tex/door-panel.png`：自动门门板纹理，本仓扩散模型生成（2026-10-29），仅用于本项目；
  游戏内的立式 / 贴地门板由 `js/game.js` 的 `drawDoors()` 动态绘制。
- `_preview.png`：Blender `--test` 预览图，可随时重新生成，不参与运行时加载。

## 2026-11-07 高清重出（覆盖老图）

- `assets/textures/*.png`（顶层）与 `assets/scene/v4/tex/`：由 `tools/gen-materials.py`
  以**同 prompt / 同 seed / 同 grade / 同四向镜像拼贴**重出，仅取消老管线
  「1536² 原生拼贴 BOX 回缩到 1024²」的有损步骤，成品 **1536²**。
  风格双重校验（色调 + 结构相关性）见 `tools/check-tex-style.py`、
  `tools/align-tex-style.py`、`tools/fuse-tex-detail.py`；老图备份在
  `tools/_bak/tex-hires-20261107162523/`。SDXL 本地生成，随仓库 MIT。
- `assets/textures/panel/01..26`（任务面板，768²）：来自本机
  `E:/ai-models/qwen-image-2.1/output/task-refs/<同名>_768.png`，是同一批图原先
  512² 缩小版的**原生高分辨率原图**（实测 MAE 0.15 / 相关性 1.000），非重新出图。
  模型 Qwen-Image 2.1 Turbo，许可 **Qwen Research License · 非商用**；
  本项目为不发行的个人试玩版，按 2026-11-07 裁定可用于游戏内。
  若未来转商用或对外发行，须先替换本目录 26 张图或取得千问商用授权，
  并同步 `assets/minigame/CREDITS.md` 与本文件。
- `assets/textures/cabin/*`（10 张程序化浅色墙板，1536²）：由原有 512² 程序化图
  等比 LANCZOS 重采样，图案与色调不变；不依赖 AI 权重，随仓库 MIT。
- `assets/textures/cover/*`（共享外饰，20 张 1536²）：派生自本文件上述 SDXL 成品，
  由 `3d/tools/gen-hires-skins.py` 生成，见同目录 `MANIFEST.json`。
- 2.5D 底图 `assets/scene/v4/base-lit.png` **未重烘**，与新 tex 存在源/产物不同步；
  重烘属单独放行事项（会改变底图像素与门禁取样）。

## 2026-11-07 晚间 · 千问覆盖非铁板舱的 3D 建模贴图

- 用户裁定：「用千问的模型覆盖一下除了铁板仓的 3D 建模贴图」，并澄清
  「铁板仓的意思就是地板是铁板材质的」。按 `3d/preview/data/floor_spec.json`
  的地板材质实测分组，**保留原 SDXL 贴图的 4 舱**：`power` / `engine` /
  `armory` / `warehouse`（钢板或钢格栅＋琥珀警示边）；
  **换千问的 6 舱**：`bridge` / `cam` / `ecosys` / `transit` / `fun` / `med`。
  掩体 GLB 的 10 组 `assets/textures/cover/` 外饰是整船共用材质、不分舱，
  按用户确认不在本次范围，保持 SDXL 不动。
- **出图**：`3d/tools/gen-qwen-room-skins.ps1`（本地 sdcpp Vulkan，
  Qwen-Image 2.1 Turbo Q4_K_M + Qwen3-VL-8B-Instruct UD-Q4_K_XL，
  768² / Turbo 8 步 / CFG 1.0 / euler / seed 20261107 起），
  6 舱 × 墙面 + 地板 = 12 张，产物 `E:/ai-models/qwen-image-2.1/output/room-skins/`，
  留档素材层 `returnlog_assets/unreferenced/qwen21/3d/room-skins/`（含 manifest）；仓库内不再保留。脚本内硬守卫拒绝铁板 4 舱。
- **加工**：`3d/tools/bake-qwen-room-skins.py`。千问概念图带光照与透视边缘，
  按 `bake-refs.py` 红线**裁中心 88%** 去掉踢脚线 / 地面 / 顶部光斑，
  再套项目同款 grade（降饱和 + 冷调）+ **四向镜像拼贴成 1536² 无缝贴图**，
  并以该舱老贴图为参考做亮度/色度解耦的色调对齐，保证图案换成千问、
  明度与色温仍落在原有冷暗档。设备面板是整块构图，按红线**不镜像**，
  沿用已入库的千问 768² 原生图，只按舱重新挂载。
- **落点**：`assets/textures/cabin/<rid>.png`（6 张墙面）、
  `assets/textures/qwen/<rid>/floor.png` + `skin1..4.png` + `panel-*.png`；
  引用切换只改 `floor_spec.json` / `panels.json` / `WALL_SKIN` 三处数据，
  GDScript 逻辑未动，铁板 4 舱的这四处值与文件全部保持原样。
  重跑 `export-floor-spec.cjs` / `bake-refs.py` / `patch-wall-skin.py` 后
  再跑一次 `bake-qwen-room-skins.py` 即可恢复（幂等）。
- **许可**：上述千问产物为 **Qwen Research License · 非商用**。本项目为不发行的
  个人试玩版，按 2026-11-07 裁定可用于游戏内；未来发行 / 商用须替换成
  SDXL 或 Apache-2.0 的 Qwen 1.0 产物，或取得商用授权，并同步本文件、
  `assets/minigame/CREDITS.md` 与 `README.md` 素材表。出图全程本地、未调用线上生图。
- 覆盖前的原文件备份在 `tools/_bak/qwen-rooms-*/`，可一键回滚。
