# Qwen-Image 2.1 生图测试（2026-11-03 晚）


> **架构节点**（档 1 · 根 `ARCHITECTURE.md`）：`文档栏 · 跨会话团队契约` · `flag: F`；说明性材料，不自称真源；设计依据以根 `ARCHITECTURE.md` 为准。

> 目的：在 RTX 5060 Laptop 8GB / 16GB RAM 上实际跑一次 Qwen-Image 2.1 Turbo，
> 判断它能否用于 3D 子项目的概念图 / 贴图试验。
> 用途：个人、不发行；模型许可是 **Qwen Research License**（非商用，发行/商用需单独授权）。

## 1. 用的东西

| 项 | 值 |
|---|---|
| 扩散模型 | `unsloth/Qwen-Image-2.1-Turbo-GGUF` 的 `Q4_K_M`（4.20GB） |
| 文本编码器 | `unsloth/Qwen3-VL-8B-Instruct-GGUF` 的 `UD-Q4_K_XL`（5.15GB） |
| VAE | `Comfy-Org/Qwen-Image-2.1` 的 `qwen_image_2.1_vae_bf16.safetensors`（0.68GB） |
| 运行器 | stable-diffusion.cpp `sd-cli.exe` Windows Vulkan 预编译版（commit 3be2378） |
| 采样 | Turbo 固定 8 步、CFG 1.0、euler、`--sigmas qwen-image-2.1-turbo` |
| 显存分配 | 文本编码器 CPU、扩散模型 Vulkan0（RTX 5060）、VAE CPU |
| 关键参数 | 不使用 `--offload-to-cpu`；显式 `--backend clip=cpu,diffusion=vulkan0,vae=cpu` |

## 2. 实测读数

| 分辨率 | 总耗时 | 采样 | VAE（CPU） | 显存 | 备注 |
|---:|---:|---:|---:|---:|---|
| 512×512 | **43.08s** | 10.75s | 29.08s | ~5.4GB | 可做草稿 |
| 768×768 角色 | **87.42s** | ~23.6s（约 3s/步） | 63.81s | ~5.0GB | 日常迭代甜点 |
| 768×768 风格化角色 | **91.34s** | ~24.4s | 66.96s | ~5.0GB | 更接近游戏概念图 |
| 1024×1024 | **501.50s** | 376.74s（51.1s/步） | 121.42s | ~5.3GB | 概念图可用 |

- 1024 的 Vulkan0 计算缓冲约 **2.4GB**，模型 4.0GB；8GB 显存可用。
- `--offload-to-cpu` 在 1024 下反而出现显存分配失败；改成显式 backend 后稳定。
- 文本编码器 CPU 编码约 **3 秒**（Qwen3-VL 8B，UD-Q4_K_XL）。

## 3. 图

- [512×512 走廊](file:///C:/Users/ASUS/Desktop/%E6%96%B0%E8%BF%94%E8%88%AA%E5%BD%95/docs/qwen21/corridor_512.png)
- [1024×1024 走廊](file:///C:/Users/ASUS/Desktop/%E6%96%B0%E8%BF%94%E8%88%AA%E5%BD%95/docs/qwen21/corridor_1024.png)
- [768×768 角色](file:///C:/Users/ASUS/Desktop/%E6%96%B0%E8%BF%94%E8%88%AA%E5%BD%95/docs/qwen21/character_768.png)
- [768×768 风格化角色](file:///C:/Users/ASUS/Desktop/%E6%96%B0%E8%BF%94%E8%88%AA%E5%BD%95/docs/qwen21/character_stylized_768.png)

提示词：

> A dark sci-fi spaceship corridor interior, brushed metal wall panels with cyan light strips,
> steel grate floor, atmospheric haze, first-person view, game environment concept art,
> highly detailed, no people, no text

## 4. 观感

- **优点**：透视、金属墙板、青蓝色灯带、格栅地面、雾气的层次都对；1024 下没有明显结构崩坏，
  和 3D 预演的暗调飞船方向一致。对“游戏环境概念图”这个用途，第一张就能用。
- **不足**：整体偏暗，中间调细节少；1024 的 8.4 分钟对日常迭代太慢；512 的 43 秒只适合草稿。
- **角色（写实提示）**：768 的全身宇航员构图、白色服/红色条带/背包、站姿和材质都稳定，
  没有明显肢体崩坏；但偏写实摄影感，不是 2.5D 像素/描边风。
- **角色（风格化提示）**：同一 768 模型把提示词改成“简化形体、平涂+软阴影、清晰剪影”后，
  输出明显转向游戏概念图：白色/红色分块、黑面罩、干净轮廓，已经可以作为 2.5D/低模角色的
  设计参考。说明风格控制是有效的，但直接当 sprite 仍需描边/像素化处理。
- **结论**：Qwen 2.1 Turbo 适合做**概念图/气氛图/贴图参考**；要直接产出可用的 3D 贴图，
  还需要更高分辨率、放大、去噪和人工修。透明背景/编辑能力尚未测。

## 5. 许可

- Qwen 2.1 / Turbo 是 **Qwen Research License**：仅研究/评估，非商用；商用需单独授权。
- 游戏代码按 MIT **不会**改变模型许可；个人不发行可以按研究/评估使用。
- 如果以后要发行（即使免费），需要重新确认模型与输出许可，或改用 1.0（Apache-2.0）/SDXL。

## 6. 复现

```powershell
powershell -File E:\ai-models\qwen-image-2.1\run_preview.ps1
```

脚本、模型哈希、说明见 `E:\ai-models\qwen-image-2.1\README.md`。
