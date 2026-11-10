# -*- coding: utf-8 -*-
"""图案漂移修复：以老图保结构、以重新出图的高清图补细节（detail transfer）。

背景：tools/check-tex-style.py 量测色调，但色调一致不等于风格一致。
本批 17 张 SDXL 重出里有 7 张老图其实是 `--mode reuse` 派生 / 无 prompt 的
早期批次，同 prompt + 同 seed 重出后**图案整张换掉**（灰度结构相关性 ≈ 0）：
cafeteria-top / warehouse-floor / warehouse-rack / floor-engine /
floor-power / floor-eco / floor-carpet。
例如 floor-carpet 老图是「深蓝 + 琥珀圆形装饰地毯」，重出成了「深青绿网格」。

处理不是退回老图（那样就没有「重新出高清图」了），也不是保留新图案
（风格跑偏），而是把两者融合：
  · 老图 LANCZOS 放大到 1536² —— 保留原图案、原色调、原明度层级；
  · 新出图（已过 align-tex-style.py 色调对齐）取高频残差 new - blur(new)；
  · 老图 + 高频残差 × weight —— 补回 SDXL 真实生成的划痕 / 颗粒 / 质感，
    抵消插值放大的柔化，视觉上不糊。
高频均值为 0，因此不会改变色调；结构相关性回到接近 1.0。

用法：
  C:\\Python314\\python.exe tools/fuse-tex-detail.py <老图备份目录> [--weight 0.35]
跑完请重跑 check-tex-style.py + 结构相关性检查，并重新生成
3d/tools/gen-hires-skins.py / gen-sdxl-skins.py 的产物。
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')
CORR_MIN = 0.60          # 低于此值视为图案已换掉
PROBE = 128
OUT_SIZE = 1536


def gray_struct(path):
    a = np.asarray(Image.open(path).convert('RGB').resize((PROBE, PROBE), Image.BOX),
                   dtype=np.float64) / 255.0
    return a[..., 0] * .299 + a[..., 1] * .587 + a[..., 2] * .114


def corr(a, b):
    return float(((a - a.mean()) * (b - b.mean())).mean() /
                 max(1e-9, a.std() * b.std()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('backup_dir')
    ap.add_argument('--weight', type=float, default=0.35)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    bak = a.backup_dir
    rows = []
    for f in sorted(os.listdir(bak)):
        if not f.lower().endswith('.png'):
            continue
        oldp, newp = os.path.join(bak, f), os.path.join(TEX, f)
        if not os.path.exists(newp):
            continue
        o, n = gray_struct(oldp), gray_struct(newp)
        c0 = corr(o, n)
        if abs(c0) >= CORR_MIN:
            continue
        # ao-soft 是纯 alpha 遮罩（RGB 全黑），灰度方差为 0，不参与
        if o.std() < 1e-6 or n.std() < 1e-6:
            continue

        old_hi = Image.open(oldp).convert('RGB').resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
        new_hi = Image.open(newp).convert('RGB')
        if new_hi.size != (OUT_SIZE, OUT_SIZE):
            new_hi = new_hi.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
        low = new_hi.filter(ImageFilter.GaussianBlur(radius=6))
        base = np.asarray(old_hi, dtype=np.float32)
        nh = np.asarray(new_hi, dtype=np.float32)
        nlow = np.asarray(low, dtype=np.float32)
        detail = nh - nlow                          # 均值为 0 的高频残差
        out = np.clip(base + detail * a.weight, 0, 255).astype(np.uint8)
        fused = Image.fromarray(out, 'RGB')
        c1 = corr(o, np.asarray(
            fused.resize((PROBE, PROBE), Image.BOX).convert('L'), dtype=np.float64) / 255.0)
        if not a.dry_run:
            fused.save(newp, 'PNG', optimize=True)
        rows.append({'file': f, 'corr_before': round(c0, 4), 'corr_after': round(c1, 4),
                     'weight': a.weight, 'size': [OUT_SIZE, OUT_SIZE]})
        print('  %-26s 结构相关性 %.3f -> %.3f  (老图保结构 + 新图高频 × %.2f)'
              % (f, c0, c1, a.weight))
    print('共处理 %d 张%s' % (len(rows), '（dry-run 未写盘）' if a.dry_run else ''))
    if not a.dry_run:
        with open(os.path.join(ROOT, 'tools', 'tex-detail-fusion-report.json'), 'w',
                  encoding='utf-8') as fp:
            json.dump({'generated_by': 'tools/fuse-tex-detail.py',
                       'reference': os.path.relpath(bak, ROOT).replace('\\', '/'),
                       'weight': a.weight, 'rows': rows}, fp, ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
