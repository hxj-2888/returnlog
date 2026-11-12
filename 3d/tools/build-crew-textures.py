"""船员贴图加工：千问原始图 → 运行时 512 身体贴图 / 头部脸+发际线贴图。

输入（均已本地千问生成，原始图在 3d/assets/renders/，.gitignore 忽略）：
  qwen-materials/crew-{fabric,webbing,leather,skin}_512.png
  qwen-crew-face/crew-face_512_s20261141.png   （正面中性脸，无表情）
  qwen-crew-face/crew-hair_512.png             （短发材质）

输出：
  preview/assets/models/crew_tex/crew-*.png             运行时身体 albedo（512²）
  assets/textures/crew/crew-*_normal.png                身体法线（供 glb 内嵌）
  assets/textures/crew/crew-face_albedo.png             头部 UV 贴图（脸+发际线）
  assets/textures/crew/crew-face_normal.png             头部法线

用法：C:\\Python314\\python.exe 3d/tools/build-crew-textures.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, '3d', 'assets', 'renders')
FACE_DIR = os.path.join(RAW, 'qwen-crew-face')
BODY_OUT = os.path.join(ROOT, '3d', 'preview', 'assets', 'models', 'crew_tex')
TEX_OUT = os.path.join(ROOT, '3d', 'assets', 'textures', 'crew')
os.makedirs(BODY_OUT, exist_ok=True)
os.makedirs(TEX_OUT, exist_ok=True)

BODY = [('crew-fabric', 1.25), ('crew-webbing', 1.35),
        ('crew-leather', 1.6), ('crew-skin', 0.8)]


def load_body(slug, size=512, crop=0.78):
    im = Image.open(os.path.join(RAW, 'qwen-materials', slug + '_512.png')).convert('RGB')
    w, h = im.size
    cw, ch = int(w * crop), int(h * crop)
    x, y = (w - cw) // 2, (h - ch) // 2
    return np.asarray(im.crop((x, y, x + cw, y + ch)).resize((size, size), Image.LANCZOS)).astype(np.float32) / 255.0


def normal_from_height(h, strength):
    gy, gx = np.gradient(h.astype(np.float32))
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], axis=-1)


def body_textures():
    for slug, strength in BODY:
        alb = load_body(slug)
        Image.fromarray((np.clip(alb, 0, 1) * 255).astype(np.uint8), 'RGB').save(
            os.path.join(BODY_OUT, slug + '.png'), optimize=True)
        h = alb[:, :, 0] * .299 + alb[:, :, 1] * .587 + alb[:, :, 2] * .114
        n = normal_from_height(h, strength)
        Image.fromarray((np.clip(n, 0, 1) * 255).astype(np.uint8), 'RGB').save(
            os.path.join(TEX_OUT, slug + '_normal.png'), optimize=True)
        print('CREW_TEX', slug, '512 albedo + normal')


def face_and_hair():
    face_im = Image.open(os.path.join(FACE_DIR, 'crew-face_512_s20261141.png')).convert('RGB')
    w, h = face_im.size
    corners = [face_im.crop((0, 0, 30, 30)), face_im.crop((w - 30, 0, w, 30)),
               face_im.crop((0, h - 30, 30, h)), face_im.crop((w - 30, h - 30, w, h))]
    bg = np.mean([np.asarray(c).reshape(-1, 3).mean(axis=0) for c in corners], axis=0)
    cheek = face_im.crop((int(w * 0.30), int(h * 0.48), int(w * 0.38),
                          int(h * 0.58))).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    canvas = Image.new('RGB', (512, 512), cheek)
    fx0, fy0, fx1, fy1 = int(w * 0.20), int(h * 0.04), int(w * 0.80), int(h * 0.90)
    FW, FH = 210, 280
    face = face_im.crop((fx0, fy0, fx1, fy1)).resize((FW, FH), Image.LANCZOS)
    arr = np.asarray(face).astype(np.float32)
    dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    alpha = np.clip((dist - 14.0) / 38.0, 0, 1)
    mask = Image.new('L', (FW, FH), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, FW - 1, FH - 1), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(5))
    a = np.asarray(mask).astype(np.float32) / 255.0 * alpha
    px, py = 256 - FW // 2, 256 - FH // 2
    base = np.asarray(canvas.crop((px, py, px + FW, py + FH))).astype(np.float32)
    out = arr * a[:, :, None] + base * (1 - a[:, :, None])
    canvas.paste(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB'), (px, py))

    hair_im = Image.open(os.path.join(FACE_DIR, 'crew-hair_512.png')).convert('RGB')
    hw, hh = hair_im.size
    hair_im = hair_im.crop((int(hw * 0.05), int(hh * 0.02), int(hw * 0.95),
                            int(hh * 0.90))).resize((512, 512), Image.LANCZOS)
    # Blender UV：图像顶行 = V=1；发际线在 V≈0.70，顶部/后脑是头发。
    u = np.linspace(0, 1, 512, endpoint=False)[None, :]
    v_img = 1.0 - np.linspace(0, 1, 512, endpoint=False)[:, None]
    curve = 0.705 - 0.035 * np.cos((u - 0.5) * np.pi * 2)
    front = v_img > curve
    back = ((u < 0.295) | (u > 0.705)) & (v_img > 0.30)
    mask_img = Image.fromarray(((front | back).astype(np.uint8) * 255), 'L').filter(
        ImageFilter.GaussianBlur(3))
    m = np.asarray(mask_img).astype(np.float32)[:, :, None] / 255.0
    out = np.asarray(canvas).astype(np.float32) * (1 - m) + np.asarray(hair_im).astype(np.float32) * m
    out = np.clip(out * 0.97, 0, 255)
    canvas = Image.fromarray(out.astype(np.uint8), 'RGB')
    canvas.save(os.path.join(TEX_OUT, 'crew-face_albedo.png'), optimize=True)
    a = out / 255.0
    l = a[:, :, 0] * .299 + a[:, :, 1] * .587 + a[:, :, 2] * .114
    gy, gx = np.gradient(l)
    nx, ny, nz = -gx * 0.7, -gy * 0.7, np.ones_like(l)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / ln * .5 + .5, ny / ln * .5 + .5, nz / ln * .5 + .5], axis=-1)
    Image.fromarray((np.clip(n, 0, 1) * 255).astype(np.uint8), 'RGB').save(
        os.path.join(TEX_OUT, 'crew-face_normal.png'), optimize=True)
    print('CREW_FACE face+hair ->', TEX_OUT)


if __name__ == '__main__':
    body_textures()
    face_and_hair()
