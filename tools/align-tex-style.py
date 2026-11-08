# -*- coding: utf-8 -*-
"""高清重出后的「风格回正」：以老图为参考做色彩迁移，只改色调、不动细节。

tools/check-tex-style.py 会挑出跑出原风格的图。分两类原因：
  · floor-eco / floor-carpet：更早批次的老图没有留 prompt，重出时新写了同语义
    prompt，饱和度与老图不在同一档；
  · cafeteria-top / warehouse-floor / warehouse-rack / floor-engine / floor-power：
    老图实际是 --mode reuse 从场景素材派生的（见 assets/scene/v4/CREDITS.md），
    不是 SPECS 里的 SDXL 直出，因此同 prompt + 同 seed 重出后亮度/冷调不同档。

修复不是回去改 prompt（那会连构图一起变），也不是放宽容差（等于承认跑偏），
而是把**老图当作色调参考**，对新高清图做两件事（迭代到达标）：
  1) 饱和度对齐：RGB 向 Rec.709 灰度插值，系数 = 老图平均 S / 新图平均 S；
  2) 逐通道 mean/std 对齐（Reinhard color transfer），同时修正亮度、对比与冷调。

全程在 1536² 原图上做逐像素线性变换，不缩放、不重采样、不引入伪细节，
新出图的原生高频细节完整保留。原图已备份在 tools/_bak/tex-hires-*/。

用法：
  C:\\Python314\\python.exe tools/align-tex-style.py <老图备份目录>
  C:\\Python314\\python.exe tools/align-tex-style.py <老图备份目录> --dry-run
跑完再执行 tools/check-tex-style.py 应全绿（退出码 0）。
"""
import argparse
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')

# 复用风格校验的判据，避免两套口径
_spec = importlib.util.spec_from_file_location(
    'checkstyle', os.path.join(ROOT, 'tools', 'check-tex-style.py'))
_cs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cs)


def sat_of(a):
    mx, mn = a.max(axis=2), a.min(axis=2)
    return float((np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)).mean())


def rec709(a):
    return a[..., 0] * .299 + a[..., 1] * .587 + a[..., 2] * .114


def align(cur, ref):
    """一回合色彩迁移：把亮度（对比）与色度（饱和度/色相）解耦，避免互相打架。

    cur 是 1536² 全分辨率，ref 是 256² 参考；统计量尺度无关，可直接比较。
    早期版本用「逐通道 mean/std + 向灰度插值」两步串行，前者会把饱和度又拉回去，
    floor-carpet（老图 sat 0.429 / 新图 0.19，且对比差 3.7 倍）因此 6 轮不收敛。
    """
    yc, yr = rec709(cur), rec709(ref)
    ch = cur - yc[..., None]                      # 色度分量，保留原有色相结构
    # 1) 亮度均值 / 标准差对齐（修 lum、contrast）
    mc, sc = float(yc.mean()), max(1e-5, float(yc.std()))
    mr, sr = float(yr.mean()), max(1e-5, float(yr.std()))
    scale = float(np.clip(sr / sc, 0.5, 5.0))
    y = (yc - mc) * scale + mr
    # 2) 色度缩放使平均饱和度匹配（二分；在 BOX  pooling 到 256² 的图上求系数，
    #    必须与 check-tex-style.py 的 Image.BOX 口径一致，否则 stride 子采样会高估
    #    饱和度、把系数压小，floor-carpet 这类高饱和老图会一直不收敛）
    step = max(1, cur.shape[0] // 256)
    h, w = y.shape[:2]

    def box_small(a):
        hh, ww = a.shape[:2]
        s = max(1, hh // 256)
        hh -= hh % s
        ww -= ww % s
        a = a[:hh, :ww]
        if a.ndim == 2:
            return a.reshape(hh // s, s, ww // s, s).mean(axis=(1, 3))
        return a.reshape(hh // s, s, ww // s, s, a.shape[2]).mean(axis=(1, 3))

    sy, sch = box_small(y), box_small(ch)
    target = sat_of(ref)
    lo, hi = 0.05, 6.0
    for _ in range(26):
        mid = (lo + hi) * 0.5
        if sat_of(np.clip(sy[..., None] + sch * mid, 0, 1)) < target:
            lo = mid
        else:
            hi = mid
    out = np.clip(y[..., None] + ch * ((lo + hi) * 0.5), 0, 1)
    # 3) 冷调：按参考的 R/B 比例微调 B 通道（幅度限制，避免把色相拽偏）
    rr = float(out[..., 0].mean() / max(1e-6, out[..., 2].mean()))
    tr = float(ref[..., 0].mean() / max(1e-6, ref[..., 2].mean()))
    f = float(np.clip(rr / tr, 0.80, 1.25))
    out[..., 2] = np.clip(out[..., 2] * f, 0, 1)
    return out


def diff(cur, ref):
    """与 check-tex-style.py 同口径的五项偏差（在 256² 上量测）。"""
    def m(a):
        im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGB')
        im = im.resize((256, 256), Image.BOX)
        return _cs.metrics_from_array(np.asarray(im).astype(np.float32) / 255.0)
    o, n = m(ref), m(cur)
    return {
        'lum': abs(o['lum'] - n['lum']),
        'contrast': abs(o['contrast'] - n['contrast']),
        'sat': abs(o['sat'] - n['sat']),
        'rb': abs(o['rb'] - n['rb']),
        'hist': float(-np.log(max(1e-9, np.sqrt(o['hist'] * n['hist']).sum()))),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('backup_dir')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--only', nargs='*', default=[])
    a = ap.parse_args()
    bak = a.backup_dir
    if not os.path.isdir(bak):
        raise SystemExit('备份目录不存在：' + bak)

    targets = a.only or [
        f for f in sorted(os.listdir(bak)) if f.lower().endswith('.png')
        and os.path.exists(os.path.join(TEX, f))
        and (Image.open(os.path.join(TEX, f)).size[0] != Image.open(os.path.join(bak, f)).size[0])
    ]
    # 只处理当前判据下确实偏离的图，已达标的原样保留
    rows = []
    print('%-26s %-9s %-9s %s' % ('文件', '轮次', '结果', '五项偏差'))
    print('-' * 96)
    for f in targets:
        oldp, newp = os.path.join(bak, f), os.path.join(TEX, f)
        ref = np.asarray(Image.open(oldp).convert('RGB').resize((256, 256), Image.BOX),
                         dtype=np.float32) / 255.0
        cur = np.asarray(Image.open(newp).convert('RGB'), dtype=np.float32) / 255.0
        d = diff(cur, ref)
        fails = [k for k, v in d.items() if v > _cs.LIM[k]]
        if not fails:
            print('%-26s %-9s %s' % (f, '-', '已达标，跳过'))
            continue
        rounds = 0
        for i in range(6):
            cur = align(cur, ref)
            rounds = i + 1
            d = diff(cur, ref)
            if not [k for k, v in d.items() if v > _cs.LIM[k]]:
                break
        still = [k for k, v in d.items() if v > _cs.LIM[k]]
        if not a.dry_run:
            Image.fromarray((np.clip(cur, 0, 1) * 255).astype(np.uint8), 'RGB').save(
                newp, 'PNG', optimize=True)
        rows.append({'file': f, 'rounds': rounds, 'before_fails': fails,
                     'after': {k: round(v, 4) for k, v in d.items()},
                     'still_fails': still, 'size': list(Image.open(newp).size)})
        print('%-26s %-9d %-9s %s' % (f, rounds, '达标' if not still else '仍偏离:' + ','.join(still),
                                     ' '.join('%s=%.3f' % (k, d[k]) for k in _cs.LIM)))
    print('-' * 96)
    print('色彩迁移 %d 张，仍偏离 %d 张' % (len(rows), sum(bool(r['still_fails']) for r in rows)))
    if not a.dry_run:
        with open(os.path.join(ROOT, 'tools', 'style-align-report.json'), 'w',
                  encoding='utf-8') as fp:
            json.dump({'generated_by': 'tools/align-tex-style.py',
                       'reference': os.path.relpath(bak, ROOT).replace('\\', '/'),
                       'rows': rows}, fp, ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    sys.exit(main())
