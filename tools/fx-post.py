# =============================================================
# fx-post.py · 把 Blender 渲出来的原始帧做成游戏能直接用的贴图
# -------------------------------------------------------------
# 为什么拆成两步：Blender 自带的 Python 没有 PIL，
# 而"翻转 / 裁切 / 接地阴影 / 图集拼接"这些用 PIL 写最省事。
# 分工：blender-fx.py 只负责**渲染**，本脚本只负责**后处理**。
#
# 用法： C:\Python314\python.exe tools/fx-post.py
# 输入： assets/scene/v4/facility/_raw_fx/*.png
# 输出： assets/scene/v4/facility/supply-{ammo,med}.png   512² RGBA（含接地阴影）
#        assets/scene/v4/facility/fx-{weld,arc}.png        1024² RGB 2×2 帧图集
# =============================================================
import glob
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'scene', 'v4', 'facility')
RAW = os.path.join(OUT, '_raw_fx')
SIZE = 512
FRAMES = 4


def flip(im):
    """Blender 的正交相机里世界 +Y 在图上方，游戏的屏幕 Y 与世界 Y 同向，
    所以必须上下翻转，否则道具的"正面"会跑到贴图上边。"""
    return im.transpose(Image.FLIP_TOP_BOTTOM)


def prop(name, shadow=True):
    src = os.path.join(RAW, name + '.png')
    if not os.path.exists(src):
        print('  [skip] 缺 %s' % os.path.basename(src))
        return
    im = flip(Image.open(src).convert('RGBA'))
    bb = im.split()[3].getbbox()
    if bb:
        im = im.crop(bb)
    w, h = im.size
    k = (SIZE * 0.90) / max(w, h)
    im = im.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)

    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    ox = (SIZE - im.size[0]) // 2
    oy = (SIZE - im.size[1]) // 2 - int(SIZE * 0.02)
    canvas.alpha_composite(im, (ox, max(0, oy)))

    if not shadow:
        canvas.save(os.path.join(OUT, name + '.png'))
        print('  prop %s.png（%d×%d → 512²，无接地阴影：手持工具）' % (name, w, h))
        return
    # 接地阴影：椭圆高斯压在物体底部，和 gen-facility-sprites 的 compose_sprite 同一做法
    sh = Image.new('L', (SIZE, SIZE), 0)
    sd = sh.load()
    cx, cy = SIZE / 2, SIZE / 2 + im.size[1] / 2 - SIZE * 0.02
    rx, ry = im.size[0] * 0.50, im.size[1] * 0.17
    yy, xx = np.ogrid[:SIZE, :SIZE]
    mask = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) <= 1.0
    sh = Image.fromarray((mask * 150).astype('uint8')).filter(ImageFilter.GaussianBlur(SIZE * 0.035))
    shadow = Image.new('RGBA', (SIZE, SIZE), (4, 7, 11, 0))
    shadow.putalpha(sh)
    out = Image.alpha_composite(shadow, canvas)
    out.save(os.path.join(OUT, name + '.png'))
    print('  prop %s.png（%d×%d → 512²，含接地阴影）' % (name, w, h))


def atlas(name):
    frames = []
    for i in range(FRAMES):
        p = os.path.join(RAW, '_%s_%d.png' % (name, i))
        if not os.path.exists(p):
            print('  [skip] 缺 %s' % os.path.basename(p))
            return
        frames.append(flip(Image.open(p).convert('RGB')))
    sheet = Image.new('RGB', (1024, 1024), (0, 0, 0))
    for i, im in enumerate(frames):
        sheet.paste(im.resize((512, 512), Image.LANCZOS), ((i % 2) * 512, (i // 2) * 512))
    sheet.save(os.path.join(OUT, name + '.png'))
    print('  atlas %s.png（%d 帧 → 1024²）' % (name, FRAMES))


def main():
    print('[fx-post] 道具')
    for n in ('supply-ammo', 'supply-med'):
        prop(n)
    # 手持工具：不烘接地阴影（它是在手里的，不是摆在地上的）
    prop('tool-wrench', shadow=False)
    print('[fx-post] 特效图集')
    for n in ('fx-weld', 'fx-arc'):
        atlas(n)


main()
