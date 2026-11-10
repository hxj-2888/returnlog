#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""bake-refs.py · 把千问出的参考图烘焙成 3D 运行时贴图

来源：E:\\ai-models\\qwen-image-2.1\\output\\{cabin-refs,task-refs}\\*_768.png
产物：3d/preview/assets/textures/cabin/<room>.png      （墙面，无缝可平铺）
      3d/preview/assets/textures/panel/<slug>.png      （设备面板，整块构图）
      3d/preview/data/panels.json                      （任务名 → 面板文件名映射）

两类图的处理方式**必须不同**，理由写在下面：
  · 舱室图是"墙面材质参考"，要贴到 3D 的墙上重复使用 ⇒ 裁中心 72%（去掉画面边缘的
    烘焙透视）→ 四向镜像拼贴成无缝 → 缩到 512。
    注意：这里**不做降饱和/冷调**（与 tools/gen-materials.py 不同）。舱室图上的 accent
    就是房间身份色（来自 map.json 的 theme.glow），压饱和等于把区分度抹掉。
  · 任务面板图是"一块控制面板的构图"，不是可平铺表面 ⇒ 只缩放到 512，不镜像。
    镜像会把旋钮和断口复制成对称图案，直接毁掉玩法可读性。

映射不另写一份规则：直接读生成器自己写的 manifest.json（里面有 id=任务名 与 file=文件名），
避免 slug 生成式在两处漂移（COVER_HEIGHT 那类事故的根因就是第二份表）。

许可：源图 Qwen-Image 2.1 Turbo（Qwen Research License，非商用）。
      本脚本产物会进 res:// 运行时 ⇒ 素材性质从"游戏外参考"变成"运行时素材"，
      与 panel-*.png 同一裁定口径：个人项目不发行可用，**若转商用需替换成 SDXL 产物**。
      见 AGENTS.md §一-6 与 3d/ASSETS.md。

用法：
    C:/Python314/python.exe 3d/tools/bake-refs.py [--size 512] [--src <目录>] [--dry]
"""
import io
import json
import os
import sys
import hashlib

# Windows 控制台默认 GBK，中文与上标单位会直接 UnicodeEncodeError；显式改 UTF-8
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

try:
    from PIL import Image
except ImportError:
    print('FATAL 需要 Pillow')
    sys.exit(1)

# __file__ = <repo>/3d/tools/bake-refs.py → 要上溯三级才是仓库根
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_ROOT = r'E:\ai-models\qwen-image-2.1\output'
OUT_TEX = os.path.join(REPO, '3d', 'preview', 'assets', 'textures')
OUT_DATA = os.path.join(REPO, '3d', 'preview', 'data')

CENTER_KEEP = 0.72   # 舱室图裁中心比例：边缘透视最重，先裁掉再镜像


def arg(name, default):
    for i, a in enumerate(sys.argv):
        if a == name and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def sha1(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()[:12]


def mirror_tile(im):
    """四向镜像拼贴成无缝：原图 → 右镜像 → 下镜像 → 对角镜像，再整体缩一半。"""
    w, h = im.size
    out = Image.new('RGB', (w * 2, h * 2))
    out.paste(im, (0, 0))
    out.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    out.paste(im.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
    out.paste(im.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.FLIP_TOP_BOTTOM), (w, h))
    return out


def center_crop(im, keep):
    w, h = im.size
    cw, ch = int(w * keep), int(h * keep)
    return im.crop(((w - cw) // 2, (h - ch) // 2, (w - cw) // 2 + cw, (h - ch) // 2 + ch))


def main():
    size = int(arg('--size', '512'))
    src_root = arg('--src', SRC_ROOT)
    dry = '--dry' in sys.argv
    cabin_src = os.path.join(src_root, 'cabin-refs')
    task_src = os.path.join(src_root, 'task-refs')

    for d in (cabin_src, task_src):
        if not os.path.isdir(d):
            print('FATAL 找不到来源目录 %s（先跑 pwsh -File 3d/tools/gen-art-refs.ps1）' % d)
            sys.exit(1)

    if not dry:
        os.makedirs(os.path.join(OUT_TEX, 'cabin'), exist_ok=True)
        os.makedirs(os.path.join(OUT_TEX, 'panel'), exist_ok=True)
        os.makedirs(OUT_DATA, exist_ok=True)

    # ---------------- ① 舱室墙面 ----------------
    cabins = []
    for name in sorted(os.listdir(cabin_src)):
        if not name.endswith('_768.png') or name.startswith('_'):
            continue
        room = name.rsplit('_', 1)[0]
        src = os.path.join(cabin_src, name)
        im = center_crop(Image.open(src).convert('RGB'), CENTER_KEEP)
        im = mirror_tile(im)
        # 镜像后是 2 倍画布，缩到 size 即等效单块 size/2 的重复单元
        im = im.resize((size, size), Image.LANCZOS)
        dst = os.path.join(OUT_TEX, 'cabin', room + '.png')
        if not dry:
            im.save(dst)
        cabins.append({'room': room, 'file': 'res://assets/textures/cabin/%s.png' % room,
                       'src': src, 'src_sha1': sha1(src), 'px': '%dx%d' % (size, size),
                       'ops': 'center_crop(%.2f) + mirror_tile + resize' % CENTER_KEEP})

    # ---------------- ② 任务面板 ----------------
    manifest_path = os.path.join(task_src, 'manifest.json')
    if not os.path.isfile(manifest_path):
        print('FATAL 缺 %s —— 生成器没写出清单，无法建立任务名→面板映射' % manifest_path)
        sys.exit(1)
    man = json.load(io.open(manifest_path, encoding='utf-8'))
    panels, mapping = [], {}
    for it in man.get('items', []):
        src = it.get('file', '')
        if not os.path.isfile(src):
            print('  SKIP 缺源文件 %s' % src)
            continue
        slug = os.path.splitext(os.path.basename(src))[0].replace('_768', '')
        im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
        dst = os.path.join(OUT_TEX, 'panel', slug + '.png')
        if not dry:
            im.save(dst)
        rel = 'res://assets/textures/panel/%s.png' % slug
        mapping[it['name']] = rel
        panels.append({'task': it['name'], 'kind': it.get('kind'), 'accent': it.get('accent'),
                       'file': rel, 'src': src, 'src_sha1': sha1(src),
                       'ops': 'resize only（面板是整块构图，不镜像）'})

    if not dry:
        out = {
            'schema_version': 1,
            'generated_by': '3d/tools/bake-refs.py',
            'source_model': man.get('model'),
            'license': ('Qwen Research License (non-commercial). 已进 res:// 运行时：'
                        '与 assets/minigame/panel-*.png 同一裁定口径，转商用需换 SDXL。'),
            'size': size,
            'panels': mapping,
            'provenance': panels,
        }
        with io.open(os.path.join(OUT_DATA, 'panels.json'), 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
            f.write('\n')

    print('[bake-refs] 舱室墙面 %d 张 · 任务面板 %d 张 · 运行时尺寸 %d px 见方' % (len(cabins), len(panels), size))
    print('[bake-refs] 解码内存估算 ≈ %.1f MB（%d 张 × %d px 见方 × 4B）' % (
        (len(cabins) + len(panels)) * size * size * 4 / 1048576.0, len(cabins) + len(panels), size))
    if dry:
        print('[bake-refs] --dry：未写文件')


if __name__ == '__main__':
    main()
