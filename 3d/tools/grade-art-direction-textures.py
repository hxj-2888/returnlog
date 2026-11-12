"""千问原始材质 → 3D 运行时贴图（裁剪 / 调色 / 派生 normal+rough）。

2026-11-11 统一 768×768：优先读 *_768.png，没有则用 *_512.png 放大到 768。
输入：3d/assets/renders/qwen-art-direction/
输出：
  3d/assets/textures/art-direction/        Blender 构建用（glb 内嵌）
  3d/preview/assets/textures/              天花板顶板运行时材质

用法：C:\\Python314\\python.exe 3d/tools/grade-art-direction-textures.py
"""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, '3d', 'assets', 'renders', 'qwen-art-direction')
OUT = os.path.join(ROOT, '3d', 'assets', 'textures', 'art-direction')
RT = os.path.join(ROOT, '3d', 'preview', 'assets', 'textures')
os.makedirs(OUT, exist_ok=True)
os.makedirs(RT, exist_ok=True)

CROP = 0.78
TEX_SIZE = 768


def load(slug, size=TEX_SIZE):
    path = os.path.join(RAW, '%s_768.png' % slug)
    if not os.path.exists(path):
        path = os.path.join(RAW, '%s_512.png' % slug)
    im = Image.open(path).convert('RGB')
    w, h = im.size
    cw, ch = int(w * CROP), int(h * CROP)
    x, y = (w - cw) // 2, (h - ch) // 2
    im = im.crop((x, y, x + cw, y + ch)).resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def save_rgb(path, arr, quality=90, fmt='jpg'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB')
    if fmt == 'jpg':
        im.save(path, quality=quality, optimize=True)
    else:
        im.save(path, optimize=True)


def save_gray(path, arr, quality=90):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'L')
    im.save(path, quality=quality, optimize=True)


def normal_from_height(h, strength=1.6):
    gy, gx = np.gradient(h.astype(np.float32))
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], axis=-1)


def lum(rgb):
    return rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114


def grade(rgb, sat=0.62, mul=(0.92, 0.96, 1.04), dim=0.90):
    l = lum(rgb)[:, :, None]
    out = l * (1.0 - sat) + rgb * sat
    out = out * np.array(mul, np.float32) * dim
    return np.clip(out, 0, 1)


def rough_from_lum(l, lo=0.38, hi=0.82, base=0.78, k=0.32):
    return np.clip(base - k * l, lo, hi)


def emit_albedo_normal_rough(slug, name, sat=0.62, mul=(0.92, 0.96, 1.04), dim=0.90,
                              nstr=1.6, rough_lo=0.38, rough_hi=0.82, out_dir=OUT):
    alb = grade(load(slug), sat=sat, mul=mul, dim=dim)
    save_rgb(os.path.join(out_dir, name + '_albedo.jpg'), alb, quality=90)
    save_rgb(os.path.join(out_dir, name + '_normal.jpg'), normal_from_height(lum(alb), nstr), quality=92)
    save_gray(os.path.join(out_dir, name + '_rough.jpg'),
              rough_from_lum(lum(alb), rough_lo, rough_hi), quality=90)
    return alb


def main():
    # 天花板顶板：运行时 map_builder 直接读 res://assets/textures/ceiling-deck.png
    deck = grade(load('ceiling-deck'), sat=0.55, mul=(0.80, 0.86, 0.96), dim=0.78)
    save_rgb(os.path.join(RT, 'ceiling-deck.png'), deck, fmt='png')
    save_rgb(os.path.join(RT, 'ceiling-deck-normal.png'), normal_from_height(lum(deck), 1.4), fmt='png')
    save_gray(os.path.join(RT, 'ceiling-deck-rough.png'), rough_from_lum(lum(deck), 0.50, 0.85), quality=88)
    save_rgb(os.path.join(OUT, 'ceiling-deck_albedo.jpg'), deck, quality=90)

    # 梁 / 管线：天花板套件 glb 内嵌
    beam = emit_albedo_normal_rough('ceiling-beam', 'ceiling-beam', sat=0.50,
                                    mul=(0.92, 0.95, 1.00), dim=0.55, nstr=1.4)
    pipe = emit_albedo_normal_rough('ceiling-pipe', 'ceiling-pipe', sat=0.50,
                                    mul=(0.90, 0.93, 0.98), dim=0.60, nstr=1.3)

    # 门框：用梁的钢纹压成深枪灰喷粉金属；0.30 太黑，3D 止口/螺栓会糊进墙里。
    # 公开方法论（PBR 通道实践，依据见 docs/ASSET_GOVERNANCE.md §14 登记表）：
    # 线性乘暗色会把明度方差一起压掉 —— 旧写法 beam * 0.46~0.52 让成品
    # stddev 只剩约 1/255，门框在画面里读作一块纯色板。
    # 改为「只降均值、保留偏离」：按目标均值平移 + 轻色调，钢纹方差原样保留。
    bl = lum(beam)
    frame = np.clip(beam + (0.16 - float(bl.mean())), 0, 1)
    frame = np.clip(frame * np.array([0.94, 0.97, 1.02], np.float32), 0, 1)
    save_rgb(os.path.join(OUT, 'door_frame_albedo.jpg'), frame, quality=90)
    save_rgb(os.path.join(OUT, 'door_frame_normal.jpg'),
             normal_from_height(lum(frame), 1.4), quality=92)

    # 保安机器人：三张材质
    paint = emit_albedo_normal_rough('secbot-paint', 'secbot-paint', sat=0.50,
                                     mul=(0.95, 0.98, 1.02), dim=0.86, nstr=1.2,
                                     rough_lo=0.55, rough_hi=0.80)
    emit_albedo_normal_rough('secbot-accent', 'secbot-accent', sat=0.85,
                             mul=(1.10, 1.00, 1.00), dim=1.05, nstr=1.0,
                             rough_lo=0.45, rough_hi=0.65)
    emit_albedo_normal_rough('secbot-metal', 'secbot-metal', sat=0.55,
                             mul=(0.88, 0.92, 1.00), dim=0.78, nstr=1.2,
                             rough_lo=0.40, rough_hi=0.62)

    meta = {
        'source': '3d/assets/renders/qwen-art-direction/ (768 if present, else 512 upscaled)',
        'license': 'Qwen Research License - NON-COMMERCIAL; local generation only',
        'size': TEX_SIZE,
        'derived': 'crop 78% center, resize 768, grade, normal/rough from luminance',
        'runtime_textures': ['ceiling-deck.png', 'ceiling-deck-normal.png', 'ceiling-deck-rough.png'],
        'build_textures': sorted(os.listdir(OUT)),
    }
    with open(os.path.join(OUT, 'manifest_derived.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('GRADE_DONE', meta['build_textures'])


if __name__ == '__main__':
    main()
