# -*- coding: utf-8 -*-
"""把 3D 预览侧的「老图 / 糊图」统一升级到高分辨率（覆盖式，带备份）。

用户 2026-11-07 裁定：重新出高分辨率图、覆盖掉那些老图、要求符合原有风格。
主出图在 tools/gen-materials.py（SDXL 同 prompt / 同 seed / 同 grade，
取消 1024² BOX 回缩，成品 1536²）；本脚本负责把成果铺到 3D 预览侧，
并处理几类**不是** SDXL 材质的老图：

  1) preview/assets/textures/*.png 顶层：大多是 assets/scene/v4/tex/ 的同步副本，
     老的是 1024²；直接复制同名新 tex 覆盖（同一张图的原生高清版，风格零漂移）。
  2) preview/assets/textures/panel/ 26 张任务面板：实测是
     E:/ai-models/qwen-image-2.1/output/task-refs/<同名>_768.png 的 512² 缩小版
     （MAE 0.15 / 相关性 1.000）。用千问 768² 原生图直接覆盖，不插值、不换图。
  3) preview/assets/textures/cabin/ 10 张：程序化浅色墙板（规则线条 + 渐变），
     不是 AI 概念图。等比 LANCZOS 重采样到 1536² + 轻锐化，图案尺度随尺寸等比，
     不引入伪细节、不改色调。
  4) 其余 512² 屏幕 / 墙饰图：优先取 3d/assets/textures/ 下的同名源，
     没有则等比放大到 1536²。

覆盖前把全部受影响文件备份到 tools/_bak/preview-tex-<时间戳>/，可一键回滚。
运行完需让 Godot 重新导入：`Godot --headless --path 3d/preview --editor --quit`。

用法： C:\\Python314\\python.exe 3d/tools/upgrade-hires-textures.py [--dry-run]
"""
import argparse
import json
import os
import shutil
from datetime import datetime

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_TEX = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')
DST = os.path.join(ROOT, '3d', 'preview', 'assets', 'textures')
NEW_TEX = os.path.join(ROOT, '3d', 'assets', 'textures')
QWEN_TASKS = r'E:\ai-models\qwen-image-2.1\output\task-refs'
BAK_ROOT = os.path.join(ROOT, 'tools', '_bak')
TARGET = 1536

# 这些不是 tex 同步副本，走各自的升级分支
SKIP_TEX_SYNC = {'ao-soft.png', 'med_vitalscreen.png', 'fun_neonsign.png',
                 'panel-breaker.png', 'panel-task.png'}


def hr(p):
    try:
        return os.path.relpath(p, ROOT).replace('\\', '/')
    except ValueError:
        # 千问原图在 E: 盘，relpath 跨盘会抛错；直接记绝对路径即可
        return p.replace('\\', '/')


def backup(path, bak, seen):
    rel = hr(path)
    if rel in seen:
        return
    seen.add(rel)
    dst = os.path.join(bak, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(path, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    bak = os.path.join(BAK_ROOT, 'preview-tex-' + datetime.now().strftime('%Y%m%d%H%M%S'))
    if not a.dry_run:
        os.makedirs(bak, exist_ok=True)
    seen = set()
    rows = []

    def rec(kind, dst, src, old_size, new_size, note):
        rows.append({'kind': kind, 'dst': hr(dst), 'src': hr(src) if src else None,
                     'old_size': list(old_size), 'new_size': list(new_size), 'note': note})
        print('  [%-10s] %-58s %s -> %s  %s' %
              (kind, hr(dst).replace('3d/preview/assets/textures/', ''),
               '%dx%d' % old_size, '%dx%d' % new_size, note))

    # ---- 1) 顶层 tex 同步副本 -------------------------------------------
    for name in sorted(os.listdir(DST)):
        p = os.path.join(DST, name)
        if not os.path.isfile(p) or not name.lower().endswith('.png'):
            continue
        if name in SKIP_TEX_SYNC:
            continue
        src = os.path.join(SRC_TEX, name)
        if not os.path.exists(src):
            continue
        with Image.open(p) as o, Image.open(src) as n:
            old, new = o.size, n.size
        if old == new:
            continue
        if not a.dry_run:
            backup(p, bak, seen)
            shutil.copy2(src, p)
        rec('tex-copy', p, src, old, new, '同名新 tex 原生高清，零插值')

    # ---- 2) panel/ 26 张：千问 768² 原生原图 -----------------------------
    pdir = os.path.join(DST, 'panel')
    for name in sorted(os.listdir(pdir)):
        if not name.lower().endswith('.png'):
            continue
        stem = name[:-4]
        q = os.path.join(QWEN_TASKS, stem + '_768.png')
        p = os.path.join(pdir, name)
        with Image.open(p) as o:
            old = o.size
        if os.path.exists(q):
            with Image.open(q) as n:
                new = n.size
            if not a.dry_run:
                backup(p, bak, seen)
                Image.open(q).convert('RGB').save(p, 'PNG', optimize=True)
            rec('qwen-native', p, q, old, new, '同一张图的千问 768² 原生版，风格零漂移')
        else:
            # 找不到原图才等比放大（本项目 26 张全部命中，正常不会走这里）
            if not a.dry_run:
                backup(p, bak, seen)
                im = Image.open(p).convert('RGB').resize((TARGET, TARGET), Image.LANCZOS)
                im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=2))
                im.save(p, 'PNG', optimize=True)
            rec('upscale', p, None, old, (TARGET, TARGET), '原图缺失，等比放大兜底')

    # ---- 3) cabin/ 10 张：程序化墙板等比重采样 ---------------------------
    cdir = os.path.join(DST, 'cabin')
    for name in sorted(os.listdir(cdir)):
        if not name.lower().endswith('.png'):
            continue
        p = os.path.join(cdir, name)
        with Image.open(p) as o:
            old = o.size
            im = o.convert('RGB')
        if old[0] >= TARGET:
            continue
        if not a.dry_run:
            backup(p, bak, seen)
        im = im.resize((TARGET, TARGET), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=3))
        if not a.dry_run:
            im.save(p, 'PNG', optimize=True)
        rec('upscale', p, None, old, (TARGET, TARGET), '程序化规则图案等比放大，色调不变')

    # ---- 4) 其余 512² 屏幕 / 墙饰 ---------------------------------------
    for name in sorted(SKIP_TEX_SYNC):
        if name == 'ao-soft.png':
            continue   # alpha 软阴影遮罩，不参与视觉清晰度，保持 512²
        p = os.path.join(DST, name)
        if not os.path.exists(p):
            continue
        with Image.open(p) as o:
            old = o.size
            im = o.convert('RGB')
        # 优先找 3d/assets/textures/ 下同名或 _raw 源
        src = None
        for cand in (os.path.join(NEW_TEX, name),
                     os.path.join(NEW_TEX, 'med', name),
                     os.path.join(NEW_TEX, 'fun', name),
                     os.path.join(NEW_TEX, name[:-4] + '_raw.png')):
            if os.path.exists(cand):
                src = cand
                break
        if src:
            with Image.open(src) as s:
                nsz = s.size
            if nsz[0] > old[0]:
                if not a.dry_run:
                    backup(p, bak, seen)
                    Image.open(src).convert('RGB').save(p, 'PNG', optimize=True)
                rec('source-copy', p, src, old, nsz, '取更高分辨率源图')
                continue
        if old[0] >= TARGET:
            continue
        if not a.dry_run:
            backup(p, bak, seen)
        im = im.resize((TARGET, TARGET), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=2))
        if not a.dry_run:
            im.save(p, 'PNG', optimize=True)
        rec('upscale', p, None, old, (TARGET, TARGET), '无更高源图，等比放大 + 轻锐化')

    report = {
        'generated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'generated_by': '3d/tools/upgrade-hires-textures.py',
        'dry_run': a.dry_run,
        'backup_dir': hr(bak) if not a.dry_run else None,
        'policy': '2026-11-07 重新出高分辨率图覆盖老图、须符合原有风格；优先用同一张图的原生高清版，零风格漂移。',
        'count': len(rows),
        'rows': rows,
    }
    if not a.dry_run:
        with open(os.path.join(BAK_ROOT, 'preview-tex-upgrade-report.json'), 'w',
                  encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print('\n已覆盖 %d 张；备份目录 %s' % (len(rows), hr(bak)))
    else:
        print('\n[dry-run] 将覆盖 %d 张，未写盘' % len(rows))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
