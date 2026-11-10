# -*- coding: utf-8 -*-
"""幂等补丁：3D 贴图导入改 VRAM 压缩（BPTC/BC7）+ 生成 mipmap。

依据用户 2026-11-07 裁定：「BC7 压缩 + mipmap + 去重复」。

背景（实测，非估算）：
  · 108 张 3D PNG 全部按 Godot 默认 `compress/mode=0`（无损）+ `mipmaps/generate=false`
    导入，1536² 单张 9.4 MB，`RENDER_TEXTURE_MEM_USED` 885 MB（928,203,283 B）。
  · 没有 mipmap，1536² 贴图在远处平铺会闪烁 / 摩尔纹——这是画质问题，不只是显存。

Godot 4.6 实测档位（3d/preview 内逐档重导验证）：
  · mode=0           → 9,437,230 B（1536²×4 未压缩）
  · mode=3           → 9,437,230 B，`vram_texture:false`（不是 VRAM 压缩，勿用）
  · mode=2           → `.s3tc.ctex` 1,572,940 B（DXT1 4bpp + mipmap）
  · mode=2 + high_quality → `.bptc.ctex` 3,145,828 B（BC7 8bpp + mipmap）← 采用

选 BPTC 而非 S3TC：同为 VRAM 原生格式，BC7 对暗部渐变 / 噪点贴图几乎没有色带，
S3TC 的 DXT1 会在舱室暗角出明显色阶；而 BC7 仍有 3 倍压缩收益（9.4 → 3.0 MB）。

`detect_3d/compress_to` 必须归 0：非 0 时 Godot 检测到资源被 3D 使用会二次改档，
造成导入抖动。

用法： C:\\Python314\\python.exe 3d/tools/patch-tex-vram.py [--dry-run]
再次运行输出「已是最新，无改动」。
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEX_DIR = os.path.join(ROOT, '3d', 'preview', 'assets', 'textures')

# (键, 目标值)；顺序固定，便于 diff 时逐行对齐
TARGET = [
    ('compress/mode', '2'),
    ('compress/high_quality', 'true'),
    ('mipmaps/generate', 'true'),
    ('detect_3d/compress_to', '0'),
]


def patch_one(path, dry):
    """返回 (changed_keys, note)。只动 [params] 段里的四个键，其余原样保留。"""
    with open(path, encoding='utf-8') as fp:
        text = fp.read()
    lines = text.split('\n')
    changed = []
    seen = set()
    out = []
    in_params = False
    for ln in lines:
        stripped = ln.strip()
        if stripped.startswith('['):
            in_params = (stripped == '[params]')
        if in_params and '=' in stripped:
            key = stripped.split('=', 1)[0]
            for k, v in TARGET:
                if key == k:
                    seen.add(k)
                    if stripped.split('=', 1)[1] != v:
                        ln = '%s=%s' % (k, v)
                        changed.append(k)
                    break
        out.append(ln)
    # 缺键就补在 [params] 末尾
    missing = [k for k, _ in TARGET if k not in seen]
    if missing:
        idx = out.index('[params]')
        insert_at = idx + 1
        for i in range(idx + 1, len(out)):
            if out[i].strip() == '':
                insert_at = i + 1
                break
        for k in missing:
            v = dict(TARGET)[k]
            out.insert(insert_at, '%s=%s' % (k, v))
            insert_at += 1
            changed.append(k + '(补)')
    if changed and not dry:
        with open(path, 'w', encoding='utf-8', newline='') as fp:
            fp.write('\n'.join(out))
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    files = []
    for base, _dirs, names in os.walk(TEX_DIR):
        for n in names:
            if n.endswith('.png.import'):
                files.append(os.path.join(base, n))
    files.sort()

    touched = 0
    per_key = {}
    for f in files:
        ch = patch_one(f, a.dry_run)
        if ch:
            touched += 1
            for k in ch:
                per_key[k] = per_key.get(k, 0) + 1

    rel = os.path.relpath(TEX_DIR, ROOT)
    if not touched:
        print('[tex-vram] 已是最新，无改动（%d 个 .import）' % len(files))
        return 0
    verb = '待改' if a.dry_run else '已改'
    print('[tex-vram] %s %d / %d 个 .import（%s）' % (verb, touched, len(files), rel))
    for k, _v in TARGET:
        if k in per_key:
            print('   %-24s %d' % (k, per_key[k]))
    if a.dry_run:
        print('[tex-vram] dry-run，未写盘')
    else:
        print('[tex-vram] 下一步：Godot --headless --import 重导，再看 BENCH 的 texture_mem_bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
