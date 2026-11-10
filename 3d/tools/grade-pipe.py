# =============================================================
# grade-pipe.py · SDXL 管道舱盖贴图后处理
# -------------------------------------------------------------
# 输入：3d/assets/textures/pipe_hatch_raw.png（SDXL 256²）
# 输出：3d/assets/textures/pipe_hatch.png（512² 暗金属 + 同心环 + 铆钉）
# 说明：SDXL 只负责金属表面的脏污/划痕纹理；圆环、螺栓、格栅由 Blender 几何提供，
#       所以这里只做“压暗 + 去饱和 + 冷调 + 极轻的径向磨损”，不画具体结构。
# =============================================================
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEX = os.path.join(ROOT, '3d', 'assets', 'textures')
RAW = os.path.join(TEX, 'pipe_hatch_raw.png')
OUT = os.path.join(TEX, 'pipe_hatch.png')


def main():
    if not os.path.exists(RAW):
        raise SystemExit('缺少 SDXL 原图：' + RAW)
    im = Image.open(RAW).convert('RGB').resize((512, 512), Image.BICUBIC)
    a = np.asarray(im).astype(np.float32) / 255.0
    lum = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114

    # 金属：低饱和、暗、偏冷；保留 SDXL 的划痕/脏污方向
    a = (lum[..., None] * 0.55 + a * 0.20) * np.array([0.72, 0.80, 0.92], np.float32)
    a = np.clip(a * 0.55 + 0.045, 0.0, 1.0)

    # 极轻的径向磨损：外圈更脏（舱盖经常被踩）
    yy, xx = np.mgrid[0:512, 0:512].astype(np.float32)
    r = np.sqrt((xx - 256) ** 2 + (yy - 256) ** 2) / 256.0
    a *= (0.92 + 0.10 * np.clip(r, 0, 1))[..., None]

    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype('uint8'))
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    draw = ImageDraw.Draw(img, 'RGBA')
    # 两道很淡的同心压痕，帮助 Blender 圆环定位（不是新结构）
    for rad in (196, 150):
        draw.ellipse([256 - rad, 256 - rad, 256 + rad, 256 + rad],
                     outline=(120, 130, 140, 42), width=2)
    img.save(OUT)
    print('wrote', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
