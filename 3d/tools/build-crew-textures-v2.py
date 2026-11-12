"""船员 768² 贴图：身体图集 + 脸 + 头发。

输入（本地千问 768² 原图，3d/assets/renders/）：
  qwen-materials/crew-{fabric,webbing,leather,skin}_768.png
  qwen-crew-face/crew-face_768_s*.png     正面中性脸（候选）
  qwen-crew-face/crew-hair_768.png        短发材质

输出（全部 768×768，glb 内嵌）：
  ../../assets/textures/crew/crew-body_albedo.png
  ../../assets/textures/crew/crew-body_normal.png
  ../../assets/textures/crew/crew-face_albedo.png
  ../../assets/textures/crew/crew-face_normal.png
  ../../assets/textures/crew/crew-hair_albedo.png
  ../../assets/textures/crew/crew-hair_normal.png

用法：
  C:\\Python314\\python.exe 3d/tools/build-crew-textures-v2.py [--face 文件名]
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, '3d', 'assets', 'renders')
TEX = os.path.join(ROOT, '3d', 'assets', 'textures', 'crew')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crew_atlas as AT  # noqa: E402

os.makedirs(TEX, exist_ok=True)
S = AT.SIZE


def load(name, folder='qwen-materials'):
    """优先 768² 原图；没有则用 512² 千问原图放大到 768（最终贴图始终 768²）。"""
    path = os.path.join(RAW, folder, name)
    if not os.path.exists(path) and '_768.' in name:
        alt = os.path.join(RAW, folder, name.replace('_768.', '_512.'))
        if os.path.exists(alt):
            path = alt
    im = Image.open(path).convert('RGB')
    if im.size != (S, S):
        im = im.resize((S, S), Image.LANCZOS)
    return im


def center_crop(im, frac=0.86):
    w, h = im.size
    cw, ch = int(w * frac), int(h * frac)
    x, y = (w - cw) // 2, (h - ch) // 2
    return im.crop((x, y, x + cw, y + ch))


def fill_region(atlas, name, im, crop=0.86, darken=1.0, tint=None):
    x0, y0, x1, y1 = AT.REGIONS[name]
    w, h = x1 - x0, y1 - y0
    im = center_crop(im, crop).resize((w, h), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32) * darken
    if tint is not None:
        arr *= np.array(tint, np.float32)
    atlas.paste(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB'), (x0, y0))


def P(name, fu, fv):
    return AT.region_px(name, fu, fv)


def R(name, fu0, fv0, fu1, fv1):
    x0, y1 = P(name, fu0, fv0)
    x1, y0 = P(name, fu1, fv1)
    return (int(min(x0, x1)), int(min(y0, y1)), int(max(x0, x1)), int(max(y0, y1)))


def normal_from_height(lum, strength=0.9):
    gy, gx = np.gradient(lum.astype(np.float32))
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(lum)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5,
                     nz / ln * 0.5 + 0.5], axis=-1)


def save_rgb(path, arr):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB').save(path, optimize=True)


def draw_torso(atlas, dr):
    # 领口 / 下摆 / 侧缝 / 后中缝
    dr.rectangle(R('torso', 0.0, 0.965, 1.0, 1.0), fill=(44, 47, 52, 190))
    # 下摆只留一道缝线，不画深色横带：这段在胯部会露出来，深带会像尿布。
    dr.line(R('torso', 0.0, 0.040, 1.0, 0.040), fill=(92, 96, 102, 90), width=2)
    for x in (R('torso', 0.25, 0, 0.25, 1), R('torso', 0.75, 0, 0.75, 1)):
        dr.line((x[0], x[1], x[0], x[3]), fill=(82, 86, 92, 120), width=2)
    for x in (R('torso', 0.006, 0, 0.006, 1), R('torso', 0.994, 0, 0.994, 1)):
        dr.line((x[0], x[1], x[0], x[3]), fill=(78, 82, 88, 120), width=2)
    # 肩线
    box = R('torso', 0.03, 0.905, 0.97, 0.955)
    dr.arc(box, 190, 350, fill=(80, 84, 90, 120), width=2)
    # 拉链：中缝 + 齿 + 拉头
    x = P('torso', 0.5, 0.5)[0]
    y0 = P('torso', 0.5, 0.94)[1]
    y1 = P('torso', 0.5, 0.34)[1]
    dr.line((x, y0, x, y1), fill=(34, 36, 40, 230), width=4)
    for y in range(int(y0) + 4, int(y1), 7):
        dr.line((x - 5, y, x + 5, y), fill=(150, 154, 160, 140), width=1)
    dr.rounded_rectangle((x - 7, int(y1) - 4, x + 7, int(y1) + 12), radius=3,
                         fill=(120, 124, 130, 220), outline=(30, 32, 36, 255), width=1)
    # 胸袋
    for fu in (0.31, 0.69):
        box = R('torso', fu - 0.10, 0.52, fu + 0.10, 0.68)
        dr.rounded_rectangle(box, radius=5, fill=(96, 100, 106, 45),
                             outline=(78, 82, 88, 150), width=2)
        fy = P('torso', fu, 0.655)[1]
        dr.line((box[0] + 3, fy, box[2] - 3, fy), fill=(76, 80, 86, 150), width=2)
        dr.rounded_rectangle((box[0] + 2, box[1] + 2, box[2] - 2, int(fy)), radius=4,
                             fill=(112, 116, 122, 18))
        dr.ellipse((P('torso', fu, 0.61)[0] - 2, int(fy) + 5,
                    P('torso', fu, 0.61)[0] + 2, int(fy) + 9), fill=(52, 55, 60, 200))
    # 腰袋
    for fu in (0.30, 0.70):
        box = R('torso', fu - 0.09, 0.18, fu + 0.09, 0.36)
        dr.rounded_rectangle(box, radius=5, fill=(94, 98, 104, 40),
                             outline=(80, 84, 90, 130), width=2)
        fy = P('torso', fu, 0.33)[1]
        dr.line((box[0] + 2, fy, box[2] - 2, fy), fill=(78, 82, 88, 140), width=2)
    # 侧腰阴影 + 下摆折痕
    arm = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arm)
    for box in (R('torso', 0.0, 0.55, 0.10, 0.86), R('torso', 0.90, 0.55, 1.0, 0.86)):
        ad.ellipse(box, fill=(20, 22, 26, 38))
    ad.rectangle(R('torso', 0.0, 0.02, 1.0, 0.10), fill=(20, 22, 26, 30))
    arm = arm.filter(ImageFilter.GaussianBlur(14))
    atlas.paste(arm, (0, 0), arm)
    # 名牌（不做可读文字，只做一块深色布标）
    box = R('torso', 0.60, 0.76, 0.70, 0.82)
    dr.rounded_rectangle(box, radius=2, fill=(58, 61, 66, 220),
                         outline=(150, 154, 160, 120), width=1)
    for k in range(3):
        yy = box[1] + 4 + k * 5
        dr.line((box[0] + 4, yy, box[2] - 4, yy), fill=(190, 194, 200, 90), width=1)
    # 缝线
    for x in (R('torso', 0.25, 0, 0.25, 1), R('torso', 0.75, 0, 0.75, 1)):
        for y in range(x[1] + 6, x[3] - 6, 9):
            dr.line((x[0] + 2, y, x[0] + 2, min(y + 4, x[3])), fill=(210, 214, 220, 70), width=1)


def draw_arm(atlas, dr, name, outer_left=True):
    # 袖口
    dr.rectangle(R(name, 0.0, 0.0, 1.0, 0.075), fill=(40, 43, 48, 220))
    dr.line(R(name, 0.0, 0.08, 1.0, 0.08), fill=(190, 194, 200, 110), width=2)
    # 肘部加强布
    box = R(name, 0.12, 0.44, 0.88, 0.58)
    dr.rounded_rectangle(box, radius=6, fill=(98, 102, 108, 48),
                         outline=(80, 84, 90, 150), width=2)
    for y in range(box[1] + 6, box[3] - 4, 8):
        dr.line((box[0] + 5, y, box[2] - 5, y), fill=(150, 154, 160, 45), width=1)
    # 外侧 / 内侧缝
    for fu in (0.02, 0.98):
        x = P(name, fu, 0.5)[0]
        for y in range(12, 210, 9):
            dr.line((x, y, x, y + 4), fill=(205, 208, 214, 70), width=1)
    # 肩部褶
    ad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    adx = ImageDraw.Draw(ad)
    adx.ellipse(R(name, 0.0, 0.70, 1.0, 1.0), fill=(20, 22, 26, 35))
    ad = ad.filter(ImageFilter.GaussianBlur(12))
    atlas.paste(ad, (0, 0), ad)


def draw_leg(atlas, dr, name, outer_left=True):
    # 裤脚收口
    dr.rectangle(R(name, 0.0, 0.0, 1.0, 0.06), fill=(45, 48, 53, 220))
    for k in range(4):
        fv = 0.06 + k * 0.025
        y = P(name, 0.5, fv)[1]
        dr.line(R(name, 0.04, fv, 0.96, fv), fill=(90, 94, 100, 90), width=1)
    # 大腿侧袋（外侧）
    fu = 0.76 if outer_left else 0.24
    box = R(name, fu - 0.17, 0.52, fu + 0.17, 0.74)
    dr.rounded_rectangle(box, radius=6, fill=(94, 98, 104, 45),
                         outline=(78, 82, 88, 155), width=2)
    fy = P(name, fu, 0.70)[1]
    dr.line((box[0] + 3, fy, box[2] - 3, fy), fill=(76, 80, 86, 160), width=2)
    dr.rounded_rectangle((box[0] + 3, box[1] + 3, box[2] - 3, int(fy)), radius=5,
                         fill=(110, 114, 120, 20))
    # 护膝下方加强
    box = R(name, 0.10, 0.40, 0.90, 0.50)
    dr.rounded_rectangle(box, radius=5, fill=(92, 96, 102, 35),
                         outline=(78, 82, 88, 90), width=1)
    # 内侧 / 外侧缝
    rx0, ry0, rx1, ry1 = AT.REGIONS[name]
    for fu2 in (0.02, 0.98):
        x = P(name, fu2, 0.5)[0]
        for y in range(ry0 + 15, ry1 - 15, 9):
            dr.line((x, y, x, y + 4), fill=(205, 208, 214, 65), width=1)
    # 膝 / 臀部的软阴影
    ad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    adx = ImageDraw.Draw(ad)
    adx.ellipse(R(name, 0.0, 0.38, 1.0, 0.58), fill=(18, 20, 24, 40))
    adx.ellipse(R(name, 0.0, 0.90, 1.0, 1.0), fill=(18, 20, 24, 35))
    ad = ad.filter(ImageFilter.GaussianBlur(13))
    atlas.paste(ad, (0, 0), ad)


def draw_boot(atlas, dr, name):
    # 鞋底
    dr.rectangle(R(name, 0.0, 0.0, 1.0, 0.16), fill=(28, 29, 32, 235))
    dr.line(R(name, 0.0, 0.16, 1.0, 0.16), fill=(150, 152, 158, 130), width=2)
    # 鞋带区
    box = R(name, 0.34, 0.22, 0.66, 0.80)
    dr.rounded_rectangle(box, radius=5, fill=(30, 31, 35, 120),
                         outline=(120, 122, 128, 90), width=1)
    for y in range(box[1] + 6, box[3] - 4, 8):
        dr.line((box[0] + 4, y, box[2] - 4, y), fill=(170, 172, 178, 155), width=1)
    # 鞋头 / 侧面磨痕
    ad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    adx = ImageDraw.Draw(ad)
    adx.ellipse(R(name, 0.05, 0.75, 0.45, 0.98), fill=(190, 192, 198, 28))
    adx.ellipse(R(name, 0.55, 0.06, 0.95, 0.35), fill=(10, 11, 13, 70))
    ad = ad.filter(ImageFilter.GaussianBlur(8))
    atlas.paste(Image.composite(ad, Image.new('RGBA', (S, S)), ad), (0, 0), ad)


def draw_hand(atlas, dr, name):
    dr.rectangle(R(name, 0.0, 0.0, 1.0, 0.16), fill=(34, 36, 40, 220))
    box = R(name, 0.18, 0.32, 0.82, 0.72)
    dr.rounded_rectangle(box, radius=5, fill=(55, 58, 62, 100),
                         outline=(110, 112, 118, 70), width=1)
    for y in range(box[1] + 5, box[3] - 3, 7):
        dr.line((box[0] + 4, y, box[2] - 4, y), fill=(150, 152, 158, 60), width=1)


def draw_gear(atlas, dr):
    # 皮革底 + 缝线 + 五金
    gx0, gy0, gx1, gy1 = AT.REGIONS['gear']
    for fu in (0.03, 0.97):
        x = P('gear', fu, 0.5)[0]
        for y in range(gy0 + 10, gy1 - 10, 10):
            dr.line((x, y, x, y + 5), fill=(190, 192, 198, 60), width=1)
    for fv in (0.04, 0.96):
        y = P('gear', 0.5, fv)[1]
        for x in range(gx0 + 10, gx1 - 10, 10):
            dr.line((x, y, x + 5, y), fill=(190, 192, 198, 50), width=1)
    # 背包面板分割
    for fv in (0.30, 0.62):
        y = P('gear', 0.5, fv)[1]
        dr.line(R('gear', 0.05, fv, 0.95, fv), fill=(70, 73, 78, 120), width=2)
    # 腰带孔
    x = P('gear', 0.5, 0.5)[0]
    for k in range(4):
        yy = P('gear', 0.5, 0.12 + k * 0.10)[1]
        dr.ellipse((x - 4, yy - 4, x + 4, yy + 4), outline=(140, 142, 148, 110), width=2)


def draw_detail(atlas, dr):
    # 金属扣：深灰底 + 高光边
    dr.rectangle((0, 0, S, S), fill=(55, 58, 63, 0))
    box = R('detail', 0.10, 0.10, 0.90, 0.90)
    dr.rounded_rectangle(box, radius=8, fill=(90, 94, 100, 255),
                         outline=(180, 184, 190, 200), width=3)
    dr.rounded_rectangle((box[0] + 10, box[1] + 10, box[2] - 10, box[3] - 10),
                         radius=5, outline=(40, 42, 46, 230), width=4)


def draw_accent(atlas, dr):
    # 织带横向纹 + 边缘磨损（只画在 accent 分区内）
    ax0, ay0, ax1, ay1 = AT.REGIONS['accent']
    for y in range(ay0, ay1, 6):
        dr.line((ax0, y, ax1, y), fill=(255, 255, 255, 18), width=1)
    ad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    adx = ImageDraw.Draw(ad)
    adx.rectangle(R('accent', 0.0, 0.0, 1.0, 0.06), fill=(30, 18, 16, 100))
    adx.rectangle(R('accent', 0.0, 0.94, 1.0, 1.0), fill=(30, 18, 16, 100))
    ad = ad.filter(ImageFilter.GaussianBlur(4))
    atlas.paste(ad, (0, 0), ad)
    # 肩章：一块偏红的补丁，让几何肩章有明确色块
    box = R('accent', 0.52, 0.58, 0.94, 0.92)
    dr.rounded_rectangle(box, radius=5, fill=(196, 74, 68, 255),
                         outline=(90, 28, 26, 230), width=3)
    dr.line((box[0] + 8, box[1] + 14, box[2] - 8, box[1] + 14),
            fill=(240, 232, 218, 170), width=2)


def build_body(face_skin_rgb):
    atlas = Image.new('RGBA', (S, S), (33, 35, 39, 255))
    fabric = load('crew-fabric_768.png')
    webbing = load('crew-webbing_768.png')
    leather = load('crew-leather_768.png')
    skin = load('crew-skin_768.png')

    fill_region(atlas, 'torso', fabric, crop=0.90, darken=0.84,
                tint=(0.94, 0.95, 0.98))
    fill_region(atlas, 'arm_l', fabric, crop=0.80, darken=0.83,
                tint=(0.94, 0.95, 0.98))
    fill_region(atlas, 'arm_r', fabric, crop=0.80, darken=0.83,
                tint=(0.94, 0.95, 0.98))
    fill_region(atlas, 'leg_l', fabric, crop=0.78, darken=0.82,
                tint=(0.94, 0.95, 0.98))
    fill_region(atlas, 'leg_r', fabric, crop=0.78, darken=0.82,
                tint=(0.94, 0.95, 0.98))
    fill_region(atlas, 'boot_l', leather, crop=0.72, darken=0.34)
    fill_region(atlas, 'boot_r', leather, crop=0.72, darken=0.34)
    fill_region(atlas, 'hand_l', leather, crop=0.45, darken=0.30)
    fill_region(atlas, 'hand_r', leather, crop=0.45, darken=0.30)
    fill_region(atlas, 'gear', leather, crop=0.72, darken=0.36)
    fill_region(atlas, 'accent', webbing, crop=0.80, darken=0.86,
                tint=(1.0, 0.90, 0.88))
    fill_region(atlas, 'detail', leather, crop=0.35, darken=0.32)
    fill_region(atlas, 'skin', skin, crop=0.55, darken=1.0)

    # 颈部肤色向脸边缘色靠拢，避免头/颈两截色
    x0, y0, x1, y1 = AT.REGIONS['skin']
    reg = np.asarray(atlas.crop((x0, y0, x1, y1)).convert('RGB')).astype(np.float32)
    lum = reg.mean(axis=2, keepdims=True)
    tone = np.array(face_skin_rgb, np.float32).reshape(1, 1, 3)
    reg = np.clip(reg * 0.35 + (tone * 0.85 + lum * 0.15) * 0.65, 0, 255)
    atlas.paste(Image.fromarray(reg.astype(np.uint8), 'RGB'), (x0, y0))

    # 在 RGBA 图上画细节：先合成到 RGB，再直接画
    rgb = atlas.convert('RGB')
    dr = ImageDraw.Draw(rgb, 'RGBA')
    draw_torso(rgb, dr)
    draw_arm(rgb, dr, 'arm_l', True)
    draw_arm(rgb, dr, 'arm_r', False)
    draw_leg(rgb, dr, 'leg_l', True)
    draw_leg(rgb, dr, 'leg_r', False)
    draw_boot(rgb, dr, 'boot_l')
    draw_boot(rgb, dr, 'boot_r')
    draw_hand(rgb, dr, 'hand_l')
    draw_hand(rgb, dr, 'hand_r')
    draw_gear(rgb, dr)
    draw_detail(rgb, dr)
    draw_accent(rgb, dr)

    rgb.save(os.path.join(TEX, 'crew-body_albedo.png'), optimize=True)
    a = np.asarray(rgb).astype(np.float32) / 255.0
    lum = a[:, :, 0] * .299 + a[:, :, 1] * .587 + a[:, :, 2] * .114
    n = normal_from_height(lum, 1.0)
    save_rgb(os.path.join(TEX, 'crew-body_normal.png'), n)
    print('CREW_BODY atlas %dx%d' % (S, S))


def face_skin_color(face):
    w, h = face.size
    pts = [face.getpixel((4, h // 2)), face.getpixel((w - 5, h // 2)),
           face.getpixel((w // 2, 6)), face.getpixel((w // 2, h - 7))]
    return tuple(int(sum(p[i] for p in pts) / 4) for i in range(3))


def strip_hair(im):
    """脸贴图只负责脸；把上半部头发换成额头肤色，头发由独立发盖几何表现。"""
    arr = np.asarray(im).astype(np.float32)
    h, w = arr.shape[:2]
    cheek = arr[int(h * 0.60):int(h * 0.72), int(w * 0.40):int(w * 0.60)].reshape(-1, 3)
    skin = cheek.mean(axis=0)
    skin_lum = float(skin.mean())
    lum = arr.mean(axis=2)
    top = np.zeros((h, w), dtype=bool)
    top[:int(h * 0.46), :] = True
    # 发盖几何覆盖头顶：只清到发际线附近，别把额头压到眉毛上，
    # 否则脸贴图会留下一圈棕色发际带。
    mask = np.zeros((h, w), dtype=bool)
    mask[:int(h * 0.30), :] = True
    mask[:int(h * 0.55), :int(w * 0.06)] = True
    mask[:int(h * 0.55), int(w * 0.94):] = True
    m = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(max(4, w // 70)))).astype(np.float32)[..., None] / 255.0
    grad = np.linspace(0.92, 1.03, h, dtype=np.float32)[:, None, None]
    fill = skin.reshape(1, 1, 3) * grad
    out = arr * (1.0 - m) + fill * m
    out[:, :, 0] *= 1.035
    out[:, :, 2] *= 0.965
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def stylize_face(im):
    """把千问/参考脸压成手绘游戏贴图：柔化、压对比、轻微颗粒。"""
    im = im.filter(ImageFilter.GaussianBlur(1.8))
    arr = np.asarray(im).astype(np.float32)
    # 局部对比压一点，避免照片式高反差
    arr = 128 + (arr - 128) * 0.82
    # 轻微色彩量化，贴近手绘
    quant = ImageOps.posterize(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), 6)
    out = Image.blend(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), quant, 0.30)
    h, w = out.size[1], out.size[0]
    noise = np.random.default_rng(7).normal(0, 2.2, (h, w, 1)).repeat(3, axis=2)
    arr = np.asarray(out).astype(np.float32) + noise
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')


def build_face(src):
    im = Image.open(src).convert('RGB')
    # 背景色取四角均值，抠掉纯色背景，保留脸
    w, h = im.size
    corners = [im.crop((0, 0, 24, 24)), im.crop((w - 24, 0, w, 24)),
               im.crop((0, h - 24, 24, h)), im.crop((w - 24, h - 24, w, h))]
    bg = np.mean([np.asarray(c).reshape(-1, 3).mean(axis=0) for c in corners], axis=0)
    arr = np.asarray(im).astype(np.float32)
    dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    mask = np.clip((dist - 18.0) / 52.0, 0, 1)
    ys, xs = np.where(mask > 0.3)
    if len(xs) == 0:
        xs0, ys0, xs1, ys1 = 0, 0, w, h
    else:
        xs0, xs1 = int(xs.min()), int(xs.max()) + 1
        ys0, ys1 = int(ys.min()), int(ys.max()) + 1
    # 收一点边，避免背景残留
    pad = int(min(xs1 - xs0, ys1 - ys0) * 0.02)
    xs0, ys0 = min(w - 1, xs0 + pad), min(h - 1, ys0 + pad)
    xs1, ys1 = max(xs0 + 1, xs1 - pad), max(ys0 + 1, ys1 - pad)
    head = im.crop((xs0, ys0, xs1, ys1))
    head_alpha = mask[ys0:ys1, xs0:xs1]
    skin = face_skin_color(head)
    head = strip_hair(head)
    # 只取“发际线→下巴”的脸区，让脸真正铺满头部 UV（头发交给几何发盖）
    hw, hh = head.size
    fx0, fy0 = int(hw * 0.06), int(hh * 0.22)
    fx1, fy1 = int(hw * 0.94), int(hh * 0.94)
    face = head.crop((fx0, fy0, fx1, fy1))
    a = Image.fromarray((head_alpha[fy0:fy1, fx0:fx1] * 255).astype(np.uint8), 'L')
    fw = int(S * 0.92)
    fh = int(S * 0.98)
    face = face.resize((fw, fh), Image.LANCZOS)
    face = stylize_face(face)
    a = a.resize((fw, fh), Image.LANCZOS).filter(ImageFilter.GaussianBlur(5))
    canvas = Image.new('RGB', (S, S), skin)
    # 肤色画布轻微上下渐变，避免纯色块
    grad = np.linspace(0.97, 1.03, S, dtype=np.float32)[:, None, None]
    canvas = Image.fromarray(np.clip(
        np.asarray(canvas).astype(np.float32) * grad, 0, 255).astype(np.uint8), 'RGB')
    px = (S - fw) // 2
    py = int(S * 0.01)
    base = canvas.crop((px, py, px + fw, py + fh))
    base = Image.composite(face, base, a)
    canvas.paste(base, (px, py))
    # 轻微均匀肤色（抵消脸部抠图的色偏），再压暗一档，贴近 2.5D 的暖肤色
    arr = np.asarray(canvas).astype(np.float32)
    tone = np.array(skin, np.float32)
    arr = arr * 0.90 + tone.reshape(1, 1, 3) * 0.10
    arr *= np.array([0.93, 0.88, 0.84], np.float32)
    canvas = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')
    # 颈部肤色取最终画布边缘，保证脸/颈一致
    edge = np.asarray(canvas.crop((2, S // 2 - 20, 20, S // 2 + 20))).reshape(-1, 3)
    skin = tuple(int(v) for v in edge.mean(axis=0))
    canvas.save(os.path.join(TEX, 'crew-face_albedo.png'), optimize=True)
    a = np.asarray(canvas).astype(np.float32) / 255.0
    lum = a[:, :, 0] * .299 + a[:, :, 1] * .587 + a[:, :, 2] * .114
    n = normal_from_height(lum, 0.32)
    save_rgb(os.path.join(TEX, 'crew-face_normal.png'), n)
    print('CREW_FACE %dx%d skin=%s src=%s' % (S, S, skin, os.path.basename(src)))
    return skin


def build_hair(src):
    im = Image.open(src).convert('RGB')
    im = center_crop(im, 0.88).resize((S, S), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32) * 0.72
    # 压到深棕黑，但保留发丝高光（全黑会变成头盔）
    lum = arr.mean(axis=2, keepdims=True)
    arr = np.clip(arr * 0.55 + lum * np.array([0.30, 0.26, 0.23], np.float32), 0, 255)
    im = Image.fromarray(arr.astype(np.uint8), 'RGB')
    im.save(os.path.join(TEX, 'crew-hair_albedo.png'), optimize=True)
    a = arr / 255.0
    l = a[:, :, 0] * .299 + a[:, :, 1] * .587 + a[:, :, 2] * .114
    n = normal_from_height(l, 0.8)
    save_rgb(os.path.join(TEX, 'crew-hair_normal.png'), n)
    print('CREW_HAIR %dx%d src=%s' % (S, S, os.path.basename(src)))


def pick_face(face_arg):
    folder = os.path.join(RAW, 'qwen-crew-face')
    if face_arg:
        return os.path.join(folder, face_arg)
    cands = sorted([n for n in os.listdir(folder)
                    if n.startswith('crew-face-v2_512') and n.endswith('.png')])
    if cands:
        return os.path.join(folder, cands[0])
    cands = sorted([n for n in os.listdir(folder)
                    if n.startswith('crew-face_768') and n.endswith('.png')])
    if cands:
        return os.path.join(folder, cands[0])
    old = os.path.join(folder, 'crew-face_512_s20261141.png')
    if os.path.exists(old):
        return old
    raise SystemExit('缺少脸参考图：先跑 3d/tools/gen-qwen-crew-face-768.ps1')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--face', default='')
    ap.add_argument('--hair', default='')
    args = ap.parse_args()
    face_src = pick_face(args.face)
    hair_src = args.hair or os.path.join(RAW, 'qwen-crew-face', 'crew-hair_768.png')
    if not os.path.exists(hair_src):
        hair_src = os.path.join(RAW, 'qwen-crew-face', 'crew-hair_512.png')
    skin = build_face(face_src)
    build_hair(hair_src)
    build_body(skin)


if __name__ == '__main__':
    main()
