# grade-pipe-ports.py · 把通风口精灵着色到所在舱室地板色调（2026-11-10）
# 用户否决"管道突兀、和旁边不像同一图层、周围突兀色框"。去掉发光外圈后，
# 这里按底图各舱地板平均色对精灵做同色调/luma 接近的分级，使其读成"嵌在地板里的风口"。
# 用法：PYTHONIOENCODING=utf-8 python tools/grade-pipe-ports.py
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, 'assets', 'scene', 'v4', 'base-lit.png')
FAC = os.path.join(ROOT, 'assets', 'scene', 'v4', 'facility')

rects = json.loads(subprocess.run(
    ['node', '-e',
     'const M=new Function("window",require("fs").readFileSync("js/data/map.js","utf8")+";return window.SKMapData;")({});'
     'console.log(JSON.stringify(M.rooms.map(r=>[r.id,r.rect])));'],
    capture_output=True, text=True, cwd=ROOT).stdout)
RECT = {k: v for k, v in rects}

base = np.asarray(Image.open(BASE).convert('RGB'), dtype=float) / 255.0
H, W, _ = base.shape


def luma(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


for room, (x, y, w, h) in RECT.items():
    path = os.path.join(FAC, 'pipe-port-%s.png' % room)
    if not os.path.exists(path):
        continue
    crop = base[int(y / 94 * H):int((y + h) / 94 * H), int(x / 98 * W):int((x + w) / 98 * W)]
    F = crop.reshape(-1, 3).mean(axis=0)
    FL = max(0.06, float(luma(F)))
    chroma = F / FL
    im = np.asarray(Image.open(path).convert('RGBA'), dtype=float) / 255.0
    L = luma(im[..., :3])
    out_L = FL * (0.55 + 0.45 * L)
    out = np.empty_like(im)
    out[..., :3] = np.clip(out_L[..., None] * chroma, 0, 1)
    out[..., 3] = im[..., 3]
    Image.fromarray((out * 255).astype(np.uint8), 'RGBA').save(path)
    print('[grade] %s floor=(%.2f,%.2f,%.2f)' % (room, F[0], F[1], F[2]))