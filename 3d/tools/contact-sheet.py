#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""contact-sheet.py · 把一批出图拼成总览图，方便一眼看完并判断风格是否重复。

用法：
    python 3d/tools/contact-sheet.py <图片目录> <输出png> [--cols N] [--cell 512] [--label 名称]

说明：
  - 只拼 *_768.png（跳过 512 草稿与 manifest），按文件名排序。
  - 每格下方标文件名（去掉后缀），左上角标序号。
  - 输出目录不存在会自动建。
"""
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print('FATAL 需要 Pillow：C:/Python314/python.exe -m pip install pillow')
    sys.exit(1)


def find_font():
    for p in (r'C:\Windows\Fonts\segoeui.ttf', r'C:\Windows\Fonts\arial.ttf',
              r'C:\Windows\Fonts\msyh.ttc'):
        if os.path.exists(p):
            return p
    return None


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    cols, cell = 5, 512
    args = sys.argv[3:]
    i = 0
    while i < len(args):
        if args[i] == '--cols':
            cols = int(args[i + 1]); i += 2
        elif args[i] == '--cell':
            cell = int(args[i + 1]); i += 2
        else:
            i += 1

    files = sorted(f for f in os.listdir(src) if f.lower().endswith('.png') and not f.startswith('_'))
    if not files:
        print('FATAL %s 里没有 png' % src)
        sys.exit(1)

    label_h = 26
    fp = find_font()
    font = ImageFont.truetype(fp, 17) if fp else ImageFont.load_default()

    rows = (len(files) + cols - 1) // cols
    W = cols * cell
    H = rows * (cell + label_h)
    sheet = Image.new('RGB', (W, H), (16, 18, 22))
    dr = ImageDraw.Draw(sheet)

    for idx, name in enumerate(files):
        r, c = divmod(idx, cols)
        x, y = c * cell, r * (cell + label_h)
        im = Image.open(os.path.join(src, name)).convert('RGB')
        im.thumbnail((cell, cell))
        sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        dr.rectangle([x, y + cell, x + cell, y + cell + label_h], fill=(24, 27, 33))
        stem = os.path.splitext(name)[0]
        dr.text((x + 8, y + cell + 4), '%02d  %s' % (idx + 1, stem), fill=(214, 220, 230), font=font)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.save(out)
    print('[contact-sheet] %d 张 · %dx%d 格 · cell=%d -> %s' % (len(files), cols, rows, cell, out))
    print('[contact-sheet] 尺寸 %dx%d px' % (W, H))


if __name__ == '__main__':
    main()
