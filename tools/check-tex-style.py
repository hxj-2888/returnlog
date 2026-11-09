# -*- coding: utf-8 -*-
"""高清重出后的「风格一致性」量化校验。

用户 2026-11-07 裁定：重新出高分辨率图覆盖老图，**要求符合原有的风格**。
本脚本把「风格」拆成四个与分辨率无关的可量测量，在统一缩到 256² 后比较
备份老图与新图，避免被「分辨率变高 ⇒ 统计值变了」误导：

  · 亮度均值  mean_lum     —— 老管线 grade 把明度压到地板/墙面同一档
  · 对比度    std_lum      —— (a-0.5)*0.92+0.44 的对比压缩
  · 饱和度    mean_sat     —— lum*0.52 + a*0.48 的降饱和
  · 冷调      r/b ratio    —— TINT(0.80,0.86,0.98) 的蓝偏
  · 直方图    bhattacharyya —— 整体色调分布距离（0=完全一致，1=完全不同）

用法：
  C:\\Python314\\python.exe tools/check-tex-style.py <老图备份目录>
  C:\\Python314\\python.exe tools/check-tex-style.py tools/_bak/tex-hires-20261107162523

退出码 0 = 全部在容差内；2 = 有图跑出原风格（会列出具体项）。
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')
PROBE = 256

# 容差：按老管线 grade 的参数浮动量给，宁可略宽，只抓真正跑偏的图
LIM = {
    'lum': 10.0,      # 0~255 亮度均值差
    'contrast': 10.0,  # 亮度标准差差
    'sat': 0.075,      # 平均饱和度差
    'rb': 0.10,        # R/B 比差
    'hist': 0.30,      # 直方图 Bhattacharyya 距离
}


def metrics_from_array(a):
    """a：float32 RGB 0~1，已统一到 PROBE²。供 align-tex-style.py 复用同一套判据。"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = r * 0.299 + g * 0.587 + b * 0.114
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    # 灰度直方图（32 bin），归一化后用 Bhattacharyya 系数
    h, _ = np.histogram((lum * 255).astype(np.uint8), bins=32, range=(0, 256))
    h = h.astype(np.float64) / max(1.0, h.sum())
    return {
        'lum': float(lum.mean() * 255),
        'contrast': float(lum.std() * 255),
        'sat': float(sat.mean()),
        'rb': float(r.mean() / max(1e-6, b.mean())),
        'hist': h,
    }


def metrics(path):
    im = Image.open(path).convert('RGB')
    if im.size != (PROBE, PROBE):
        im = im.resize((PROBE, PROBE), Image.BOX)
    a = np.asarray(im).astype(np.float32) / 255.0
    m = metrics_from_array(a)
    m['size'] = Image.open(path).size
    return m


def main():
    if len(sys.argv) < 2:
        raise SystemExit('用法：check-tex-style.py <老图备份目录>')
    bak = sys.argv[1]
    if not os.path.isdir(bak):
        raise SystemExit('备份目录不存在：' + bak)
    old = sorted(f for f in os.listdir(bak) if f.lower().endswith('.png'))
    print('%-26s %-11s %-11s | %7s %7s %7s %7s %7s | %s'
          % ('文件', '老尺寸', '新尺寸', '亮度Δ', '对比Δ', '饱和Δ', '冷调Δ', '直方距', '判定'))
    print('-' * 118)
    bad = []
    rows = []
    for f in old:
        newp = os.path.join(TEX, f)
        if not os.path.exists(newp):
            print('%-26s %s' % (f, '新图缺失'))
            bad.append((f, '新图缺失'))
            continue
        o, n = metrics(os.path.join(bak, f)), metrics(newp)
        d = {
            'lum': abs(o['lum'] - n['lum']),
            'contrast': abs(o['contrast'] - n['contrast']),
            'sat': abs(o['sat'] - n['sat']),
            'rb': abs(o['rb'] - n['rb']),
            'hist': float(-np.log(max(1e-9, np.sqrt(o['hist'] * n['hist']).sum()))),
        }
        fails = [k for k, v in d.items() if v > LIM[k]]
        ok = not fails
        if not ok:
            bad.append((f, ','.join(fails)))
        print('%-26s %-11s %-11s | %7.2f %7.2f %7.3f %7.3f %7.3f | %s'
              % (f, '%dx%d' % o['size'], '%dx%d' % n['size'],
                 d['lum'], d['contrast'], d['sat'], d['rb'], d['hist'],
                 'OK' if ok else '偏离:' + ','.join(fails)))
        rows.append({'file': f, 'old_size': list(o['size']), 'new_size': list(n['size']),
                     **{k: round(v, 4) for k, v in d.items()}, 'ok': ok})
    print('-' * 118)
    print('共 %d 张，风格达标 %d 张，偏离 %d 张' % (len(rows), len(rows) - len(bad), len(bad)))
    if bad:
        for f, why in bad:
            print('  偏离 %-26s %s' % (f, why))
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
