# -*- coding: utf-8 -*-
"""生成高分辨率共享外饰包（撤销 256² 降采样，并跟随重新出图后的源尺寸）。

2026-11-07 用户裁定：不要靠直接压画质换帧率，改用「只对玩家可见处渲染 +
高分辨率贴图只加载一份」；随后追加裁定「重新出高分辨率图覆盖老图，要求符合原风格」。
本脚本产出的贴图由 map_builder.gd 的共享材质表注入到 61 件掩体 GLB，
整船只常驻 ~10 组图，而不是每个 GLB 各内嵌一份。

albedo：直接取 assets/scene/v4/tex/ 重新出图的 SDXL 成品（已 grade + 四向镜像拼贴、
        seamless）。**不 resize**：成品边长由源图自动探测，避免任何插值糊化；
        仅做 JPEG q92 与轻微锐化。老图 1024² 是 1536² 原生出图 BOX 回缩的产物，
        高清重出取消了这步有损回缩。
normal：gen-pbr-textures.py 的程序化法线（256²）用 LANCZOS 放大到成品尺寸后重新归一化。
        法线是低频扰动，放大不引入伪细节；若后续要更高精度可把该脚本的 N 提到成品尺寸重跑。
glass：本机无 SDXL 玻璃成品，沿用程序化 albedo 放大。

用法： C:\\Python314\\python.exe 3d/tools/gen-hires-skins.py [--size 1536]
产物： 3d/preview/assets/textures/cover/<key>_albedo.jpg / <key>_normal.jpg + MANIFEST.json
"""
import argparse
import json
import os
from collections import Counter
from datetime import datetime

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSET_LAYER = os.environ.get('RETURNLOG_ASSET_LAYER') or os.path.join(
    os.path.expanduser('~'), 'Documents', 'returnlog_assets')
SRC = os.path.join(ASSET_LAYER, 'referenced', 'scene-v4-tex')
if not os.path.isdir(SRC):
    SRC = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')
PBR = os.path.join(ROOT, '3d', 'assets', 'textures', 'pbr')
OUT = os.path.join(ROOT, '3d', 'preview', 'assets', 'textures', 'cover')

# covers_lib.py 的 PBR key -> (SDXL 成品文件名, 说明)。glass 走程序化兜底。
ALBEDO = {
    'metal_panel':   ('panel-metal.png',      '金属面板：分格 / 铆钉 / 划痕'),
    'brushed_steel': ('crate-steel.png',      '拉丝钢：箱体钢材冷调拉丝'),
    'shell_white':   ('panel-white.png',      '喷漆白壳：浅色面板'),
    'screen':        ('facility-screen.png',  '设备屏幕：暗底 + 细线 UI'),
    'fabric':        ('fabric-weave.png',     '织物：交叉编织'),
    'hazard':        ('hazard-stripe.png',    '警示斜纹：程序化源图 512² → 1024²'),
    'leaf':          ('floor-eco.png',        '生态舱植被表面：斑驳绿'),
    'rubber':        ('floor-carpet.png',     '橡胶 / 地毯：低反光细纹'),
    'wood':          ('table-composite.png',  '复合桌面：暖色细纹'),
}
KEYS = sorted(set(ALBEDO) | {'glass'})


def save_jpg(im, name, quality=92):
    p = os.path.join(OUT, name + '.jpg')
    im.save(p, 'JPEG', quality=quality, optimize=True)
    return p


def detect_hi():
    """成品边长跟随重新出图的 SDXL 源，取出现次数最多的尺寸，绝不固定写死 1024。"""
    sizes = []
    for src, _ in ALBEDO.values():
        p = os.path.join(SRC, src)
        if not os.path.exists(p):
            raise SystemExit('缺少本机 SDXL 成品：' + p)
        with Image.open(p) as im:
            sizes.append(im.size[0])
    return Counter(sizes).most_common(1)[0][0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=0, help='0 = 自动探测源图边长')
    hi = ap.parse_args().size or detect_hi()
    os.makedirs(OUT, exist_ok=True)
    print('[skins] 成品边长 %dpx（跟随重新出图的源图，不做插值缩放）' % hi)
    entries = []
    for key in KEYS:
        # ---- albedo：重新出图的原生高清 SDXL 成品，零插值 ----
        resized = False
        if key in ALBEDO:
            src, desc = ALBEDO[key]
            p = os.path.join(SRC, src)
            if not os.path.exists(p):
                raise SystemExit('缺少本机 SDXL 成品：' + p)
            im = Image.open(p).convert('RGB')
            orig = list(im.size)
            if im.size != (hi, hi):
                # 高清重出后所有 albedo 源应同尺寸；这里只作形状兜底，正常路径不会进来
                im = im.resize((hi, hi), Image.LANCZOS)
                resized = True
                print('  [warn] %s 源尺寸 %s 与成品 %d 不一致，做了插值对齐' % (key, orig, hi))
            im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=55, threshold=2))
            albedo_src = 'returnlog_assets/referenced/scene-v4-tex/' + src
        else:
            p = os.path.join(PBR, key + '_albedo.jpg')
            im = Image.open(p).convert('RGB').resize((hi, hi), Image.LANCZOS)
            orig = [256, 256]
            resized = True
            desc = '玻璃：本机无 SDXL 成品，程序化 albedo 放大'
            albedo_src = '3d/assets/textures/pbr/' + key + '_albedo.jpg'
        ap = save_jpg(im, key + '_albedo')

        # ---- normal：放大后重新归一化，保持单位法线 ----
        np_path = os.path.join(PBR, key + '_normal.jpg')
        nim = Image.open(np_path).convert('RGB').resize((hi, hi), Image.LANCZOS)
        arr = np.asarray(nim).astype(np.float32) / 127.5 - 1.0
        length = np.sqrt((arr * arr).sum(axis=2, keepdims=True))
        arr = arr / np.maximum(length, 1e-6) * 0.5 + 0.5
        nim = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB')
        np_out = save_jpg(nim, key + '_normal')

        entries.append({
            'key': key,
            'albedo': 'res://assets/textures/cover/%s_albedo.jpg' % key,
            'normal': 'res://assets/textures/cover/%s_normal.jpg' % key,
            'size': [hi, hi],
            'albedo_source': albedo_src,
            'albedo_source_size': orig,
            'albedo_resized': resized,
            'albedo_bytes': os.path.getsize(ap),
            'normal_bytes': os.path.getsize(np_out),
            'desc': desc,
        })
        print('  %-16s %s -> %dx%d %s' % (key, orig, hi, hi,
                                      '(插值)' if resized else '(原生无插值)'))

    manifest = {
        'generated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'generated_by': '3d/tools/gen-hires-skins.py',
        'policy': '2026-11-07 用户裁定：不靠降分辨率换帧率；高分辨率外饰只存一份，由 Godot 共享材质注入，配合距离剔除 / 房间级可见性。随后追加「重新出高分辨率图覆盖老图，须符合原有风格」。',
        'source_pipeline': 'tools/gen-materials.py 同 prompt / 同 seed / 同 NEG / 同 grade / 同 TINT / 同四向镜像拼贴，仅取消 1024 BOX 有损回缩；风格量测见 tools/check-tex-style.py。',
        'out_size': [hi, hi],
        'license_note': '源图来自 assets/scene/v4/CREDITS.md（本地 SDXL 生成，文档记「随仓库 MIT」；3d/ASSETS.md 另记 CC-BY 4.0，口径待统一，保守沿用署名）。',
        'normal_note': 'normal 由 256² 程序化法线 LANCZOS 放大并重新归一化；法线是低频扰动，放大不引入伪细节；如需更细节可把 gen-pbr-textures.py 的 N 提到成品尺寸重跑。',
        'consumer': '3d/preview/scripts/map_builder.gd::_cover_mat()（共享 StandardMaterial3D）',
        'count': len(entries),
        'total_bytes': sum(e['albedo_bytes'] + e['normal_bytes'] for e in entries),
        'entries': entries,
    }
    with open(os.path.join(OUT, 'MANIFEST.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print('已生成 %d 组 / %d 字节 · %s' % (manifest['count'], manifest['total_bytes'], OUT))


if __name__ == '__main__':
    main()
