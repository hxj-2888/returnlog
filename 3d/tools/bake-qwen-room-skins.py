# -*- coding: utf-8 -*-
"""把千问 768² 舱室图烘焙成 3D 运行时的 1536² 无缝贴图，并按舱切换引用。

2026-11-09 用户裁定：千问为唯一出图模型，SDXL 退役；原「铁板仓 exclusion」解除，
10 舱全部覆盖：bridge / cam / ecosys / transit / fun / med / power / engine / armory / warehouse。
（2026-11-07 曾只覆盖非铁板 6 舱，power/engine/armory/warehouse 保持 SDXL —— 现已作废。）
范围（用户确认）：按舱的墙面 / 墙饰 / 地板 / 设备面板；
掩体 GLB 的 10 组共用外饰是全局材质，不在本次范围内。

**技术红线**：千问输出是带光照的概念图，非 seamless，不能直接当 albedo
（3d/ASSETS.md:118,424-428、WORKFLOW_SDXL_BLENDER.md:8）。因此：
  · 墙面 / 地板 / 墙饰 → 项目同款 grade（降饱和 + 冷调 + 压暗）+ 四向镜像
    拼贴，2×768 = 1536² 原生无插值，REPEAT 平铺无接缝；
  · 设备面板是整块构图，按 bake-refs.py 红线**不镜像**，沿用千问 768² 原图。

设计上只改数据/表、不动 GDScript 逻辑：
  · 墙面 _wall_material() 对 CABIN_QWEN_ROOMS 读 qwen/<rid>/skin1.png
    （2026-11-07 去重复：cabin/<rid>.png 与之同字节，已删，不再单独出图）
  · 墙饰 WALL_SKIN 值走 _material("<name>")           → 值改成 qwen/<rid>/skinN
    （第三张直接复用 qwen/<rid>/floor，skin3 与 floor 同字节，已合并）
  · 地板 floor_spec.rooms[rid].tex 走 _material(tex)   → 值改成 qwen/<rid>/floor.png
  · 面板 panels.json 的 path 是完整 res:// 字符串      → 指到 qwen/<rid>/panel-*.png
铁板 4 舱的这四处值 / 文件全部不写。

用法：
  C:\\Python314\\python.exe 3d/tools/bake-qwen-room-skins.py [--dry-run]
前置：先跑 3d/tools/gen-qwen-room-skins.ps1 出 12 张 768² 原图。
可重复运行（幂等）；覆盖前请先用 tools/_bak/qwen-rooms-*/ 里的备份回滚。
"""
import argparse
import importlib.util
import json
import os
import re
import shutil
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
QWEN_OUT = r'E:\ai-models\qwen-image-2.1\output\room-skins'
TEX = os.path.join(ROOT, '3d', 'preview', 'assets', 'textures')
DATA = os.path.join(ROOT, '3d', 'preview', 'data')
SIZE = 768
OUT = 1536                       # 2 * 768，四向镜像拼贴后不回缩

# 2026-11-09 SDXL 退役：铁板舱 exclusion 解除，10 舱全部走千问。
IRON = []
ROOMS = ['bridge', 'cam', 'ecosys', 'transit', 'fun', 'med',
         'power', 'engine', 'armory', 'warehouse']

# 复用项目自己的 grade / mirror_tile，保证与全部既有贴图同色温、同明度层级
_spec = importlib.util.spec_from_file_location(
    'genmaterials', os.path.join(ROOT, 'tools', 'gen-materials.py'))
gm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gm)


REF_DIR = os.path.join(ROOT, 'tools', '_qwen_refs')


def qwen_dir(rid):
    return os.path.join(TEX, 'qwen', rid)


def ref_path(rid, kind):
    """色调参考持久化在 tools/（不进 res://，不会被 Godot 当贴图导入）。

    首次运行把该舱老墙面 / 老地板另存一份；之后重跑始终以它为参考，
    避免「cabin 已被千问覆盖 → 参考变成千问图 → 色调逐次漂移」。
    """
    return os.path.join(REF_DIR, '%s_%s.png' % (rid, kind))


def raw(rid, kind):
    return os.path.join(QWEN_OUT, '%s-%s_%d.png' % (rid, kind, SIZE))


# 复用上午那轮已验证的迭代式色彩迁移（亮度/色度解耦 + 二分饱和 + 冷调），
# 单步「乘 B 通道」会连带把亮度与饱和度带偏（fun 饱和、transit 亮度实测跑偏）。
# 图案不同导致直方图距离必然大，这里只迭代到亮度/对比/饱和/冷调四项达标。
_aspec = importlib.util.spec_from_file_location(
    'alignstyle', os.path.join(ROOT, 'tools', 'align-tex-style.py'))
ats = importlib.util.module_from_spec(_aspec)
_aspec.loader.exec_module(ats)
TONE_KEYS = ('lum', 'contrast', 'sat', 'rb')


def tone_match(new_im, old_im):
    """以该舱老贴图为色调参考；只改色调，图案仍是千问的。"""
    cur = np.asarray(new_im, dtype=np.float32) / 255.0
    ref = np.asarray(old_im.convert('RGB').resize((256, 256), Image.BOX),
                     dtype=np.float32) / 255.0
    for _ in range(5):
        cur = ats.align(cur, ref)
        d = ats.diff(cur, ref)
        if not [k for k in TONE_KEYS if d[k] > ats._cs.LIM[k]]:
            break
    return Image.fromarray((np.clip(cur, 0, 1) * 255).astype(np.uint8), 'RGB')


def seamless(src, crop=None, delight=False):
    """裁中心去概念图边缘 + 项目 grade + 四向镜像拼贴 -> 1536² 无缝贴图。

    千问 768² 概念图带透视边缘（踢脚线 / 地面 / 顶部光斑），直接四向镜像会
    把边缘构图对称复制成怪图案；按 bake-refs.py 口径先裁中心 88% 再拼贴。

    delight=True（地板用）：千问输出仍带低频光照渐变，镜像拼贴会把渐变放大成
    周期光斑（仓库地板一团团柔光）。走廊格栅干净是因为光照均匀。这里用大半径
    高斯估计照度并做高通归一（a/blur*mean），抹平光照、保留板缝/划痕等高频细节。
    """
    im = Image.open(src).convert('RGB')
    w, h = im.size
    if crop is None:
        m = int(w * 0.06)                       # 中心 88%
        crop = (m, m, w - m, h - m)
    im = im.crop(crop).resize((SIZE, SIZE), Image.LANCZOS)
    arr = gm.grade(np.asarray(im))
    if delight:
        # 必须在镜像拼贴**之前**去光照：否则渐变会被四向镜像复制成周期光斑。
        # 大半径高斯估计照度，高通归一（a/blur*mean），抹平光照、保留板缝/划痕。
        a = arr.astype(np.float32) / 255.0
        blur = np.asarray(Image.fromarray(arr).filter(ImageFilter.GaussianBlur(SIZE // 2)),
                          dtype=np.float32) / 255.0
        blur = np.clip(blur, 0.15, 1.0)
        mean = blur.mean(axis=(0, 1), keepdims=True)
        arr = (np.clip(a / blur * mean, 0, 1) * 255).astype(np.uint8)
    arr = gm.mirror_tile(arr, OUT)
    return Image.fromarray(arr)


def build_textures(dry):
    made = []
    # 覆盖前先读老贴图作为该舱的色调参考（墙 / 地板各一份）
    with open(os.path.join(DATA, 'floor_spec.json'), encoding='utf-8') as fp:
        spec = json.load(fp)
    for rid in ROOMS:
        pw, pf = raw(rid, 'wall'), raw(rid, 'floor')
        for p in (pw, pf):
            if not os.path.exists(p):
                raise SystemExit('缺千问原图：%s（先跑 gen-qwen-room-skins.ps1）' % p)
        d = qwen_dir(rid)
        if not dry:
            os.makedirs(d, exist_ok=True)
        rw, rf = ref_path(rid, 'wall'), ref_path(rid, 'floor')
        if os.path.exists(rw) and os.path.exists(rf):
            old_wall = Image.open(rw).convert('RGB')
            old_floor = Image.open(rf).convert('RGB')
        else:
            # 色调参考必须来自**覆盖前的老图**，且要持久化在 tools/_qwen_refs/。
            # 2026-11-07 去重复后 cabin/<rid>.png 已删除，而 floor_spec 的 tex 已指向
            # qwen/<rid>/floor.png —— 两者都不能再当参考源，否则会拿新图给新图做色调对齐
            # （等于没对齐，还会把上一轮的结果当成基准逐步漂移）。所以这里直接报错。
            raise SystemExit(
                '缺色调参考图：%s / %s\n'
                '先在有旧贴图的提交上跑一次本脚本生成参考，'
                '或从 tools/_bak/ 恢复 cabin/<rid>.png 与旧地板图到 %s。' % (rw, rf, REF_DIR))

        # 墙面：**不再单独写 cabin/<rid>.png**。它与 skin1 是同输入同裁切
        # （seamless(pw) 与 seamless(pw, None) 等价），字节完全相同；
        # 2026-11-07 去重复后 _wall_material() 对 CABIN_QWEN_ROOMS 直接读
        # qwen/<rid>/skin1.png，同一路径只上传一次显存。故这里不产出文件、不记 made。

        # 地板（delight：抹平千问光照渐变，避免镜像拼贴出周期光斑）
        f = tone_match(seamless(pf, delight=True), old_floor)
        if not dry:
            f.save(os.path.join(d, 'floor.png'), 'PNG', optimize=True)
        made.append(('qwen/%s/floor.png' % rid, [OUT, OUT], 'floor'))

        # 墙饰 3 张 + 复用 floor 作 WALL_SKIN 第三张。
        # 原第 3 张 skin3 与 floor 是同输入同裁切（字节相同），已合并删除；
        # 序号保留 skin4 不改名，避免与既有 WALL_SKIN / 文档口径错位。
        c = (SIZE // 4, SIZE // 4, SIZE * 3 // 4, SIZE * 3 // 4)
        for name, base, cr, ref in [
                ('skin1', pw, None, old_wall),
                ('skin2', pw, c, old_wall),
                ('skin4', pf, c, old_floor)]:
            im = tone_match(seamless(base, cr), ref)
            if not dry:
                im.save(os.path.join(d, name + '.png'), 'PNG', optimize=True)
            made.append(('qwen/%s/%s.png' % (rid, name), [OUT, OUT], 'skin'))
    return made


def patch_panels(dry):
    """6 舱设备面板改指向 qwen/<rid>/panel-<slug>.png；原图按红线不镜像。"""
    p = os.path.join(DATA, 'panels.json')
    with open(p, encoding='utf-8') as fp:
        j = json.load(fp)
    changed = []
    for label, old in list(j.get('panels', {}).items()):
        slug = os.path.basename(old).replace('.png', '')
        m = re.match(r'^\d{2}-([a-z]+)-', slug)
        if not m or m.group(1) not in ROOMS:
            continue                     # 铁板 4 舱 / 其它一律不动
        rid = m.group(1)
        src = os.path.join(TEX, 'panel', slug + '.png')
        dst = os.path.join(qwen_dir(rid), 'panel-' + slug + '.png')
        if not os.path.exists(src):
            continue
        new = 'res://assets/textures/qwen/%s/panel-%s.png' % (rid, slug)
        if not dry:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
        j['panels'][label] = new
        changed.append((label, new))
    for it in j.get('provenance', []):
        f = str(it.get('file', ''))
        slug = os.path.basename(f).replace('.png', '')
        m = re.match(r'^\d{2}-([a-z]+)-', slug)
        if m and m.group(1) in ROOMS:
            it['file'] = 'res://assets/textures/qwen/%s/panel-%s.png' % (m.group(1), slug)
    if not dry:
        j['qwen_rooms_override'] = {'included': ROOMS, 'excluded_iron_plate': IRON,
                                    'by': '3d/tools/bake-qwen-room-skins.py',
                                    'note': '重跑 bake-refs.py 后请再跑本脚本恢复按舱挂载'}
        with open(p, 'w', encoding='utf-8') as fp:
            json.dump(j, fp, ensure_ascii=False, indent=2)
    return changed


def patch_floor_spec(dry):
    p = os.path.join(DATA, 'floor_spec.json')
    with open(p, encoding='utf-8') as fp:
        j = json.load(fp)
    changed = []
    for rid in ROOMS:
        r = j['rooms'][rid]
        new = 'qwen/%s/floor.png' % rid
        if r.get('tex') != new:
            r['tex'] = new              # _build_rooms() 会 replace('.png','') 后拼 res://
            changed.append(rid)
    if not dry:
        j.setdefault('note', '')
        j['qwen_rooms_override'] = {'included': ROOMS, 'excluded_iron_plate': IRON,
                                    'by': '3d/tools/bake-qwen-room-skins.py'}
        with open(p, 'w', encoding='utf-8') as fp:
            json.dump(j, fp, ensure_ascii=False, indent=2)
    return changed


def patch_wall_skin(dry):
    """WALL_SKIN 常量表：6 舱指向各自 skin1..4；铁板 4 舱原样保留。

    map_builder.gd 与 patch-wall-skin.py 的 BLOCK 必须同步，
    否则以后重跑补丁会把表写回 SDXL 口径。
    """
    targets = [os.path.join(ROOT, '3d', 'preview', 'scripts', 'map_builder.gd'),
               os.path.join(ROOT, '3d', 'tools', 'patch-wall-skin.py')]
    changed = []
    for p in targets:
        with open(p, encoding='utf-8') as fp:
            s = fp.read()
        orig = s
        # 只在 WALL_SKIN 块内替换：map_builder.gd 是真 tab 前缀，
        # patch-wall-skin.py 的 BLOCK 是字面 "\t" 前缀，行首锚定会漏掉后者。
        start = s.find('const WALL_SKIN := {')
        if start < 0:
            print('  [warn] %s 未找到 WALL_SKIN 块' % os.path.basename(p))
            continue
        end = s.find('\n}', start)
        block = s[start:end if end > 0 else len(s)]
        for rid in ROOMS:
            # 第三张直接指 floor：skin3 与 floor 是同输入同裁切（字节完全相同），
            # 2026-11-07 去重复后不再单独出 skin3.png，WALL_SKIN 复用 floor 的
            # Material 缓存（_material() 的 key 是去 .png 的相对路径）。
            arr = '["qwen/{0}/skin1", "qwen/{0}/skin2", "qwen/{0}/floor", "qwen/{0}/skin4"]'.format(rid)
            pat = r'("' + rid + r'"\s*:\s*)\[[^\]]*\]'
            block, n = re.subn(pat, lambda m, a=arr: m.group(1) + a, block, count=1)
            if n != 1:
                print('  [warn] %s 未找到 %s 的 WALL_SKIN 行' % (os.path.basename(p), rid))
        s = s[:start] + block + s[end if end > 0 else len(s):]
        if s != orig:
            changed.append(os.path.relpath(p, ROOT).replace('\\', '/'))
            if not dry:
                with open(p, 'w', encoding='utf-8', newline='') as fp:
                    fp.write(s)
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    print('[bake-qwen] 覆盖舱:', ', '.join(ROOMS))
    print('[bake-qwen] 铁板仓（不动）:', ', '.join(IRON))
    made = build_textures(a.dry_run)
    pa = patch_panels(a.dry_run)
    fl = patch_floor_spec(a.dry_run)
    ws = patch_wall_skin(a.dry_run)
    print('  生成贴图 %d 张（%d² 无缝，grade + 四向镜像）' % (len(made), OUT))
    print('  panels.json 重定向 %d 项' % len(pa))
    print('  floor_spec.json 重定向 %d 舱: %s' % (len(fl), ', '.join(fl)))
    print('  WALL_SKIN 同步 %d 个文件: %s' % (len(ws), ', '.join(ws)))
    if a.dry_run:
        print('  [dry-run] 未写盘')
        return 0
    report = {
        'generated_by': '3d/tools/bake-qwen-room-skins.py',
        'policy': '2026-11-07 用千问模型覆盖除铁板仓外的 3D 建模贴图（按舱墙面/墙饰/地板/面板）',
        'included': ROOMS, 'excluded_iron_plate': IRON,
        'source': QWEN_OUT, 'out_size': OUT,
        'license': 'Qwen Research License 非商用；本项目为不发行的个人试玩版，2026-11-07 裁定可用于游戏内',
        'textures': made, 'panels': pa, 'floor_spec_rooms': fl, 'wall_skin_files': ws,
    }
    with open(os.path.join(ROOT, 'tools', 'qwen-rooms-report.json'), 'w',
              encoding='utf-8') as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)
    print('  报告 tools/qwen-rooms-report.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
