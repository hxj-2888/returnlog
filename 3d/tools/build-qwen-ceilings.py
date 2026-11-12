"""千问原始顶板图 → 3D 运行时分舱天花板贴图（裁剪 / 调色 / 派生 normal+rough）。

2026-11-12 用户裁定：十舱各出一张千问顶板图；配电室(power)/引擎(engine)
按「默认拉闸亮度」调色 —— 画面亮度对齐断电档观感（约 0.19~0.21 均值），
其余舱对齐常态工业顶板（0.42~0.58，医疗最亮）。运行时灯光逻辑零改动。

输入：3d/assets/renders/qwen-ceilings/<room>_768.png   （gen-qwen-ceilings.ps1 产出）
输出：3d/preview/assets/textures/qwen/<room>/ceiling.png + -normal.png + -rough.png

亮度实现：调色（sat/mul）后按舱目标均值自动缩放曝光（clamp 0.70~1.15），
避免逐舱手调 dim 漂移。normal/rough 由亮度派生（沿用 grade-art-direction-textures.py）。

用法：C:\\Python314\\python.exe 3d/tools/build-qwen-ceilings.py [--only power,engine]
"""
import json
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, '3d', 'assets', 'renders', 'qwen-ceilings')
RT = os.path.join(ROOT, '3d', 'preview', 'assets', 'textures', 'qwen')

CROP = 0.90   # 顶板图全出血无缝，宽裁保留板缝节奏（78% 会裁掉面板边框）
TEX_SIZE = 768

# 公开方法论（PBR 通道实践，依据见 docs/ASSET_GOVERNANCE.md §14 登记表）：
# albedo 需要足够明度方差，normal / rough 由亮度派生；单纯线性曝光会把方差一起压掉，
# 低照度舱室里就读成一块纯色板（2026-11-12 实测成品 stddev 仅 8~10/255）。
TARGET_LUM_STD = 0.10  # 目标明度标准差 ≈ 25.5/255；只放大偏离，不改均值与色相

# room -> (目标均值亮度, 饱和度, 通道乘色, normal 强度)
# 拉闸亮度：power/engine 目标 0.21/0.19（断电档观感），饱和略高保留警示色点缀
ROOMS = {
    'bridge':    (0.46, 0.52, (0.90, 0.94, 1.04), 1.4),
    'cam':       (0.44, 0.50, (0.88, 0.94, 1.06), 1.4),
    'ecosys':    (0.42, 0.54, (0.90, 1.00, 0.92), 1.5),
    'power':     (0.21, 0.68, (1.04, 0.98, 0.88), 1.5),
    'transit':   (0.45, 0.52, (1.00, 0.96, 0.90), 1.4),
    'fun':       (0.43, 0.56, (0.96, 0.90, 1.06), 1.3),
    'med':       (0.58, 0.42, (0.94, 0.97, 1.02), 1.2),
    'engine':    (0.19, 0.62, (1.06, 0.96, 0.86), 1.6),
    'armory':    (0.42, 0.50, (0.96, 0.98, 0.90), 1.5),
    'warehouse': (0.44, 0.52, (0.90, 0.95, 1.04), 1.4),
}


def load(room):
    path = os.path.join(RAW, '%s_768.png' % room)
    if not os.path.exists(path):
        path = os.path.join(RAW, '%s_512.png' % room)
    im = Image.open(path).convert('RGB')
    w, h = im.size
    cw, ch = int(w * CROP), int(h * CROP)
    x, y = (w - cw) // 2, (h - ch) // 2
    im = im.crop((x, y, x + cw, y + ch)).resize((TEX_SIZE, TEX_SIZE), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def save_rgb(path, arr, fmt='png'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB')
    im.save(path, optimize=True)


def save_gray(path, arr):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'L').save(path, optimize=True)


def normal_from_height(h, strength=1.4):
    gy, gx = np.gradient(h.astype(np.float32))
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], axis=-1)


def lum(rgb):
    return rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114


def rough_from_lum(l, lo=0.50, hi=0.85, base=0.80, k=0.34):
    return np.clip(base - k * l, lo, hi)


def build(room):
    target, sat, mul, nstr = ROOMS[room]
    rgb = load(room)
    # 降饱和 + 通道乘色（theme 方向），再按目标均值自动收曝光
    l0 = lum(rgb)[:, :, None]
    out = l0 * (1.0 - sat) + rgb * sat
    out = out * np.array(mul, np.float32)
    mean = float(lum(out).mean())
    scale = float(np.clip(target / max(mean, 1e-4), 0.70, 1.15))
    out = np.clip(out * scale, 0, 1)
    # 保均值 / 保色相的明度方差增强：只放大偏离，不动用户裁定的 target 亮度
    # （含 power/engine 的 0.21/0.19 拉闸档）。normal / rough 随后由增强后的亮度派生。
    l = lum(out)
    lm, ls = float(l.mean()), float(l.std())
    boost = float(np.clip(TARGET_LUM_STD / max(ls, 1e-4), 1.0, 4.0))
    l2 = np.clip((l - lm) * boost + lm, 0.0, 1.0)
    out = np.clip(out * (l2[:, :, None] / np.maximum(l[:, :, None], 1e-4)), 0.0, 1.0)
    save_rgb(os.path.join(RT, room, 'ceiling.png'), out)
    save_rgb(os.path.join(RT, room, 'ceiling-normal.png'),
             normal_from_height(lum(out), nstr))
    save_gray(os.path.join(RT, room, 'ceiling-rough.png'),
              rough_from_lum(lum(out)))
    return {'room': room, 'raw_mean': round(mean, 3), 'target': target,
            'exposure': round(scale, 3), 'final_mean': round(float(lum(out).mean()), 3),
            'contrast_boost': round(boost, 3),
            'final_lum_std': round(float(lum(out).std()), 4)}


def main():
    only = []
    if '--only' in sys.argv:
        only = [s.strip() for s in sys.argv[sys.argv.index('--only') + 1].split(',')]
    rooms = [r for r in ROOMS if not only or r in only]
    stats = []
    for r in rooms:
        src = os.path.join(RAW, '%s_768.png' % r)
        if not os.path.exists(src) and not os.path.exists(os.path.join(RAW, '%s_512.png' % r)):
            print('SKIP %s（缺原始图，先跑 gen-qwen-ceilings.ps1）' % r)
            continue
        stats.append(build(r))
    meta = {
        'source': '3d/assets/renders/qwen-ceilings/ (768 native)',
        'license': 'Qwen Research License - NON-COMMERCIAL; local generation only',
        'size': TEX_SIZE,
        'derived': 'crop 78% center, resize 768, sat/mul grade, auto exposure to target mean, normal/rough from luminance',
        'breaker_brightness_rooms': ['power', 'engine'],
        'note': 'power/engine 目标均值 0.21/0.19 = 默认拉闸亮度调色（用户 2026-11-12 裁定）',
        'items': stats,
    }
    with open(os.path.join(RAW, 'manifest_derived.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    for s in stats:
        print('CEIL {room}: raw={raw_mean} target={target} exposure={exposure} final={final_mean}'.format(**s))
    print('CEILINGS_DONE', len(stats))


if __name__ == '__main__':
    main()
