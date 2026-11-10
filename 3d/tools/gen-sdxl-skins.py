# -*- coding: utf-8 -*-
"""把重新出图后的高清 SDXL 成品同步成「建模外饰」离线源包（覆盖旧的 256² 糊图）。

来源：assets/scene/v4/tex/*.png —— tools/gen-materials.py 用本地 SDXL 出图后
做了降饱和 / 冷调 / 四向镜像拼贴。这些是**已 grade 且 seamless 的成品**，
不是 3d/assets/refs/ 里那批带光照的概念图（非无缝、UV 会断、光影会脏，不能当 albedo）。

2026-11-07 变更：原脚本把成品 resize 到 256² JPEG 供 61 件掩体 GLB 内嵌，
那是「靠压画质换帧率」的老口径。用户裁定撤销该做法：
  · Godot 侧改为共享材质注入（map_builder.gd::_cover_mat），整船只加载一份高清图；
  · 可见性优化（距离剔除 + 房间级静默）把 draw call 压掉 60%，不再需要降分辨率；
  · 本目录因此改为**离线高清源副本**，边长跟随 assets/scene/v4/tex 的重新出图结果。

运行时并不读本目录：3D 外饰走 3d/preview/assets/textures/cover/。
本目录只在 Blender 重导 GLB 时被 covers_lib.py::_pbr_image() 读到，
该处有 COVERS_EMBED_MAX 保护（默认把内嵌图缩到 512²），
因为 GLB 内嵌贴图已被共享材质覆盖、不参与渲染，限尺寸只为守住 GLB 体积与
Godot 导入纹理数。彻底清掉这些死贴图需要 export_materials='PLACEHOLDER' 重导，
属单独放行事项。

用法： C:\\Python314\\python.exe 3d/tools/gen-sdxl-skins.py
产物： 3d/assets/textures/sdxl/<key>_albedo.jpg + MANIFEST.json
开关： COVERS_SDXL=0 可让 covers_lib.py 完全回退到程序化 PBR（便于 A/B）。
"""
import json
import os
from collections import Counter
from datetime import datetime

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')
OUT = os.path.join(ROOT, '3d', 'assets', 'textures', 'sdxl')

# covers_lib.py 的 PBR key → 本机 SDXL 成品贴图（按材质语义配对）
SKINS = {
    'metal_panel':   ('panel-metal.png',      '金属面板：深色分格 / 铆钉 / 划痕'),
    'brushed_steel': ('crate-steel.png',      '拉丝钢：箱体钢材的冷调拉丝'),
    'shell_white':   ('panel-white.png',      '喷漆白壳：浅色面板'),
    'screen':        ('facility-screen.png',  '设备屏幕：暗底 + 细线 UI'),
    'fabric':        ('fabric-weave.png',     '织物：交叉编织'),
    'hazard':        ('hazard-stripe.png',    '警示斜纹：琥珀 / 深色 45°'),
    'leaf':          ('floor-eco.png',        '生态舱植被表面：斑驳绿'),
    'rubber':        ('floor-carpet.png',     '橡胶 / 地毯：低反光细纹'),
    'wood':          ('table-composite.png',  '复合桌面：暖色细纹'),
}
# glass 保留程序化 albedo：本机没有对应的 SDXL 玻璃成品，硬配会让医疗舱透明件发脏。


def main():
    os.makedirs(OUT, exist_ok=True)
    sizes = []
    for src, _ in SKINS.values():
        p = os.path.join(SRC, src)
        if not os.path.exists(p):
            raise SystemExit('缺少重新出图后的 SDXL 成品：' + p)
        with Image.open(p) as im:
            sizes.append(im.size[0])
    hi = Counter(sizes).most_common(1)[0][0]
    print('[sdxl-skins] 成品边长 %dpx（跟随重新出图的源图，零降采样）' % hi)

    entries = []
    for key, (src, desc) in SKINS.items():
        p = os.path.join(SRC, src)
        im = Image.open(p).convert('RGB')
        orig = im.size
        if im.size != (hi, hi):
            # 正常路径不会进来；仅作形状兜底
            im = im.resize((hi, hi), Image.LANCZOS)
        dst = os.path.join(OUT, key + '_albedo.jpg')
        im.save(dst, 'JPEG', quality=92, optimize=True)
        entries.append({
            'key': key,
            'albedo': '3d/assets/textures/sdxl/%s_albedo.jpg' % key,
            'source': 'assets/scene/v4/tex/' + src,
            'source_size': list(orig),
            'out_size': [hi, hi],
            'bytes': os.path.getsize(dst),
            'desc': desc,
        })
        print('  %-16s <- %-24s %s -> %dx%d JPEG' % (key, src, orig, hi, hi))

    manifest = {
        'generated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'generated_by': '3d/tools/gen-sdxl-skins.py',
        'source_pipeline': 'tools/gen-materials.py（本地 SDXL sdxl-base，同 prompt / 同 seed / 同 grade / 同四向镜像拼贴，取消 1024 BOX 回缩）+ 四向镜像拼贴，见 assets/scene/v4/CREDITS.md',
        'policy': '2026-11-07 用户裁定：重新出高分辨率图覆盖老图、须符合原风格；不靠降分辨率换帧率。本目录为离线高清源副本，运行时走 3d/preview/assets/textures/cover/ 共享材质。',
        'license_note': 'assets/scene/v4/CREDITS.md 记「随仓库 MIT」，3d/ASSETS.md 与 WORKFLOW_SDXL_BLENDER.md 记「CC-BY 4.0」；此处保守沿用 CC-BY 4.0 署名口径，两处口径待统一。',
        'usage': '仅 Blender 重导 GLB 时被 covers_lib.py::_pbr_image() 读取；COVERS_EMBED_MAX（默认 512）会把内嵌图缩档，避免大图进 GLB。',
        'embed_note': '61 件掩体 GLB 内仍内嵌旧 256² 图（515 张，运行时已被共享材质覆盖、属死资产）；彻底清理需 export_materials=PLACEHOLDER 重导，属单独放行事项。',
        'toggle': 'COVERS_SDXL=0 回退到纯程序化 PBR；COVERS_PBR=0 回退到纯色。',
        'out_size': [hi, hi],
        'count': len(entries),
        'total_bytes': sum(e['bytes'] for e in entries),
        'entries': entries,
    }
    with open(os.path.join(OUT, 'MANIFEST.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print('已生成 %d 张 / %d 字节 · MANIFEST.json 已写出' % (manifest['count'], manifest['total_bytes']))


if __name__ == '__main__':
    main()
