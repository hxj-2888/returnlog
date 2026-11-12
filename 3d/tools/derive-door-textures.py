"""从 2.5D door-panel.png 派生 3D 门板贴图（albedo / normal / rough / emissive）。

门板是用户点名的 2.5D 真源，不重新生成；2026-11-11 统一为 768×768：
  · 外侧各裁 2.5%（避免与 3D 门柱双层竖框）
  · 50% 处切左右两扇
  · 每扇 1:2 画在 768² 画布的中央 384×768 区（UV 对应 u=0.25..0.75）
  · 从亮度派生 normal / roughness，从高饱和琥珀/青色像素派生 emissive 灯槽

用法：C:\\Python314\\python.exe 3d/tools/derive-door-textures.py
输出：3d/assets/textures/art-direction/door/
license：门板原图来自 2.5D 项目自有资产；派生图同许可。
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(os.path.dirname(ROOT), '新返航录', 'assets', 'scene', 'v4', 'tex', 'door-panel.png')
OUT = os.path.join(ROOT, '3d', 'assets', 'textures', 'art-direction', 'door')
os.makedirs(OUT, exist_ok=True)

W, H = 384, 768
SIZE = 768
PANEL_X = (SIZE - W) // 2
FILL = np.array([0.035, 0.038, 0.042], np.float32)


def save_rgb(name, arr, quality=90, fmt='jpg'):
    canvas = np.tile(FILL, (SIZE, SIZE, 1))
    canvas[:, PANEL_X:PANEL_X + W, :] = arr
    im = Image.fromarray((np.clip(canvas, 0, 1) * 255).astype(np.uint8), 'RGB')
    path = os.path.join(OUT, name + '.' + fmt)
    if fmt == 'jpg':
        im.save(path, quality=quality, optimize=True)
    else:
        im.save(path, optimize=True)
    return path


def save_gray(name, arr, quality=90):
    canvas = np.full((SIZE, SIZE), 0.5, np.float32)
    canvas[:, PANEL_X:PANEL_X + W] = arr
    im = Image.fromarray((np.clip(canvas, 0, 1) * 255).astype(np.uint8), 'L')
    path = os.path.join(OUT, name + '.jpg')
    im.save(path, quality=quality, optimize=True)
    return path


def normal_from_height(h, strength=2.0):
    gy, gx = np.gradient(h.astype(np.float32))
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], axis=-1)


def emissive_mask(rgb):
    """只保留灯槽的高饱和琥珀/青色；锈迹/拉丝不算。"""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mx = np.max(rgb, axis=-1)
    mn = np.min(rgb, axis=-1)
    sat = np.where(mx > 1e-5, (mx - mn) / np.maximum(mx, 1e-5), 0.0)
    amber = (r > g) & (g >= b) & (sat > 0.52) & (mx > 0.42)
    cyan = (b > g) & (g >= r) & (sat > 0.48) & (mx > 0.42)
    # 灯槽只在每半幅的最外侧 10%；中缝的暖色高光不是灯，不能发光
    h, w = rgb.shape[:2]
    edge = np.zeros((h, w), dtype=bool)
    edge[:, :max(1, int(w * 0.10))] = True
    edge[:, int(w * 0.90):] = True
    amber &= edge
    cyan &= edge
    out = np.zeros_like(rgb)
    out[amber] = np.array([1.0, 0.58, 0.12], np.float32)
    out[cyan] = np.array([0.10, 0.86, 1.0], np.float32)
    return out


def main():
    im = Image.open(SRC).convert('RGB')
    arr = np.asarray(im).astype(np.float32) / 255.0
    h, w, _ = arr.shape
    # 外侧各裁 2.5%（实测竖框在 2.5%/97.4%，裁掉后不会和 3D 门柱叠两层）
    x0 = int(round(w * 0.025))
    x1 = int(round(w * 0.975))
    arr = arr[:, x0:x1, :]
    mid = arr.shape[1] // 2
    halves = {'L': arr[:, :mid, :], 'R': arr[:, mid:, :]}
    for side, half in halves.items():
        alb = np.asarray(Image.fromarray((half * 255).astype(np.uint8)).resize(
            (W, H), Image.LANCZOS)).astype(np.float32) / 255.0
        # 轻微降饱和/压暗，贴合低照度场景；保留门板身份
        lum = alb[:, :, 0] * 0.299 + alb[:, :, 1] * 0.587 + alb[:, :, 2] * 0.114
        alb = np.clip(lum[:, :, None] * 0.18 + alb * 0.82, 0, 1)
        alb = np.clip(alb * 0.85, 0, 1)
        save_rgb('door_panel_%s_albedo' % side, alb, quality=91)
        height = lum
        nrm = normal_from_height(height, 2.0)
        save_rgb('door_panel_%s_normal' % side, nrm, quality=92)
        rough = np.clip(0.78 - 0.32 * lum, 0.38, 0.82)
        save_gray('door_panel_%s_rough' % side, rough, quality=90)
        emi = emissive_mask(alb)
        save_rgb('door_panel_%s_emissive' % side, emi, fmt='png')
        print('DOOR_TEX %s albedo/normal/rough/emissive %dx%d (canvas %dx%d)' % (side, W, H, SIZE, SIZE))
    print('DOOR_TEX_DONE ->', OUT)


if __name__ == '__main__':
    main()
