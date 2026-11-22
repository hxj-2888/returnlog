# 小游戏任务面板素材 · 来源与许可

> 目录内容：`panel-fix.png`（电路检修口，已标注 3 根可交互电线）、`panel-breaker.png`
> （闸刀开关，未标注，备用于 `lever` 玩法图内化）。
> 用途：`js/t2/minigame.js` 站桩小游戏的「图内要素」玩法底图；
> 断口 / 线标注的唯一真源在 `js/data/plates.js`（不在本目录维护）。

## 生成方式

| 项 | 值 |
|---|---|
| 模型 | Qwen-Image 2.1 Turbo（`unsloth/Qwen-Image-2.1-Turbo-GGUF` · Q4_K_M） |
| 文本编码器 | Qwen3-VL-8B-Instruct（`unsloth` · UD-Q4_K_XL） |
| VAE | `Comfy-Org/Qwen-Image-2.1` |
| 运行器 | stable-diffusion.cpp（Vulkan，本机 RTX 5060 Laptop） |
| 规格 | 768×768 PNG，Turbo 8 步 / CFG 1.0 |

实测参数与观感记录见 `docs/Qwen2.1_生图测试_20261103.md`；
断口坐标由 `tools/plate/snap.cjs`（HSV 掩膜 → 局部质心 → PCA 主轴）求得，非目测。

## task-frame.png（2026-11-06）

> 小游戏页面统一底图：Blender 5.2.2 渲染的控制台框 + SDXL 屏幕贴图。

| 项 | 值 |
|---|---|
| 屏幕贴图 | `3d/assets/textures/device_screen_task.png`（SDXL，CPU q2_K / 4 步） |
| 壳体贴图 | `assets/scene/v4/tex/panel-metal.png`（SDXL 场景材质） |
| 渲染 | `3d/tools/render-task-frame.py`，Blender 5.2.2 EEVEE / 64 samples / 1024×640 |
| 输出 | `assets/minigame/task-frame.png`（RGBA，26 个任务共用；任务色由 `--mg-accent` 区分） |

## breaker-lever.png（2026-11-20 · 电闸拉杆动画素材）

> 运行时路径 `assets/scene/v4/facility/breaker-lever.png`；用途：玩家 / AI 拉闸、合闸时的
> 世界视图专用动画（`js/game.js#drawWork` 的 `lever` 分支），与电路维修的放大工具同一表现口径。

| 项 | 值 |
|---|---|
| 出图 | 千问本地模型（`tools/gen-breaker-lever.ps1`，8 步 / CFG 1.0 / 768×768 / seed 20261120） |
| 后处理 | `tools/cutout-breaker-lever.py`（白底泛洪抠图 + breaker 同档冷调 sat 0.34 / dim 0.86） |
| 原始图 | `<Qwen-Image 模型目录>\output\breaker-lever.png`（本机，不入库） |
| 公开参照登记 | `docs/ASSET_GOVERNANCE.md` §14 · 2026-11-20 电闸拉杆条目 |

**许可**：Qwen Research License —— 非商用，与上方同批裁定一致（用户 2026-11-20 明确
「可以使用千问本地生成图」）。转商用按下方许可与裁定处理。

## 许可与裁定

- **许可**：Qwen Research License —— **非商用**。发行 / 商用需另行取得授权，
  或届时按下方裁定用 SDXL 重出同批图。
- **用户裁定（2026-11-06，2026-11-07 更新）**：
  1. 本项目为非商用试玩版，**千问生成的图可用于游戏内**（解除
     3D 仓 `3d/HANDOFF.md` §1 原先「千问图不进运行时」的限制）。
  2. **2026-11-07 裁定：解除「后续 3D 美图素材一律 SDXL / 千问本地生图暂停」，
     允许使用千问模型生图**，SDXL 与千问均可作为 3D 美术素材来源。

二次分发（若未来转商用）请先替换本目录素材或取得千问商用授权，并同步本文件与
`README.md` 素材表。
