# =============================================================
# grade-screen.py · SDXL 设备屏幕后处理
# -------------------------------------------------------------
# 输入：3d/assets/textures/device_screen_task_raw.png（SDXL 256² 原图）
# 输出：3d/assets/textures/device_screen_task.png（512²，暗色扫描线/网格）
# 为什么后处理：256² + q2_K 的 SDXL 小图偏亮、偏抽象；直接当屏幕会糊成彩条。
# 这里只做“降亮 + 冷调 + 扫描线 + 网格 + 暗角”，不画任何具体 UI 文字。
# =============================================================
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEX = os.path.join(ROOT, '3d', 'assets', 'textures')
RAW = os.path.join(TEX, 'device_screen_task_raw.png')
OUT = os.path.join(TEX, 'device_screen_task.png')


def main():
    if not os.path.exists(RAW):
        raise SystemExit('缺少 SDXL 原图：' + RAW)
    im = Image.open(RAW).convert('RGB').resize((512, 512), Image.BICUBIC)
    a = np.asarray(im).astype(np.float32) / 255.0
    lum = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114

    # 降亮：保留彩条的方向信息，但压到“暗舱屏幕”的明度层级
    base = np.array([0.020, 0.032, 0.052], np.float32)
    a = base[None, None, :] + (lum[..., None] * 0.22 + a * 0.16)
    a = np.clip(a, 0.0, 1.0)

    # 扫描线（每 4px 压暗 14%）+ 64px 网格（压暗 8%）
    yy = np.arange(512)[:, None]
    xx = np.arange(512)[None, :]
    scan = np.where((yy % 4) < 2, 0.86, 1.0).astype(np.float32)
    grid = np.where((xx % 64 == 0) | (yy % 64 == 0), 0.80, 1.0).astype(np.float32)
    a *= (scan * grid)[..., None]

    # 暗角
    cx = cy = 256.0
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / 362.0
    vig = np.clip(1.0 - 0.55 * r ** 2, 0.25, 1.0).astype(np.float32)
    a *= vig[..., None]

    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype('uint8'))
    # 极轻的柔光，避免彩条边缘像坏点
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    draw = ImageDraw.Draw(img, 'RGBA')
    draw.rectangle([18, 18, 494, 494], outline=(90, 190, 190, 70), width=1)
    draw.text((30, 30), 'SYS / TASK', fill=(120, 210, 200, 140))
    img.save(OUT)
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
