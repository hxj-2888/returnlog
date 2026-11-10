# =============================================================
# gen-panel-texture.py · 3D 设备屏幕贴图（本地 SDXL）
# -------------------------------------------------------------
# 复用 tools/gen-materials.py 的加载 / 显存流式上卡管线，只换提示词与输出目录。
# 输出：3d/assets/textures/device_screen_task.png
#      3d/assets/textures/device_screen_med.png
# 用法：C:\Python314\python.exe 3d\tools\gen-panel-texture.py
#      加 --only device_screen_task 只出一张。
# 注意：2026-11-07 用户裁定解除「一律 SDXL / 千问暂停」；本脚本仍走 SDXL 高分辨率管线。
# 本机 16GB 内存 / 8GB 显存的可用兜底（2026-11-06 实测出图）：
#   sd-cli.exe --type q2_K --backend cpu --params-backend cpu \
#     -W 256 -H 256 --steps 4 ... -o 3d/assets/textures/device_screen_task_raw.png
#   C:\Python314\python.exe 3d/tools/grade-screen.py
# diffusers 的 768² 路径留给内存余量足够的机器。
# =============================================================
import argparse
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, '3d', 'assets', 'textures')
SIZE = 768

JOBS = {
    'device_screen_task': (
        'sci-fi spacecraft maintenance console screen, very dark glass with faint teal '
        'grid lines and glowing amber circuit traces, thin data bars, small target '
        'reticles and gauge arcs, no readable words, no logo, flat front view, even '
        'lighting, high detail, subtle scanlines'),
    'device_screen_med': (
        'sci-fi medical bay monitor screen, very dark glass with soft cyan vital-sign '
        'waveforms, small white readout bars and a faint body scan silhouette, no '
        'readable words, no logo, flat front view, even lighting, clean and clinical'),
}


def load_materials_module():
    path = os.path.join(ROOT, 'tools', 'gen-materials.py')
    spec = importlib.util.spec_from_file_location('genmaterials', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*', default=[])
    ap.add_argument('--steps', type=int, default=24)
    args = ap.parse_args()
    names = [n for n in (args.only or list(JOBS)) if n in JOBS]
    os.makedirs(OUT, exist_ok=True)

    gm = load_materials_module()
    import numpy as np
    import torch
    from PIL import Image

    pipe = gm.build_pipe()
    embeds = gm.encode_all(pipe, [JOBS[n] for n in names])
    gm.drop_text_encoders(pipe)
    for n, emb in zip(names, embeds):
        # gen-materials.py 的 CPU 文本编码器路径产出 fp32 CPU 张量；
        # UNet 是 fp16，必须同时转 device 与 dtype（2026-11-07 同步修订）。
        pe, npe, pooled, npooled = [t.to(device='cuda', dtype=torch.float16) for t in emb]
        image = pipe(
            prompt_embeds=pe, negative_prompt_embeds=npe,
            pooled_prompt_embeds=pooled, negative_pooled_prompt_embeds=npooled,
            height=SIZE, width=SIZE, num_inference_steps=args.steps,
            guidance_scale=6.0,
            generator=torch.Generator('cuda').manual_seed(20261106 + len(n)),
        ).images[0]
        arr = gm.grade(np.asarray(image.convert('RGB')))
        path = os.path.join(OUT, n + '.png')
        Image.fromarray(arr).save(path)
        print('  wrote %s (SDXL %dpx)' % (os.path.basename(path), SIZE), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
