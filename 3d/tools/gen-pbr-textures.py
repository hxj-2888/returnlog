"""程序化生成 tileable PBR 贴图（albedo / roughness / normal）。

为什么不用 SDXL 直接出贴图：SDXL 概念图不是无缝的，贴到几何上会在 UV 边界断裂；
而且它画的是「渲染结果」，已经带了光照和阴影，再当 albedo 用会脏。
这里用**周期噪声 + 程序化图案**生成真正 tileable 的材质图，
再由 Blender 的 Principled BSDF 接 Base Color / Roughness / Normal 导出 GLB。

产物：3d/assets/textures/pbr/<name>_{albedo,normal}.jpg（256²，JPEG）
用法：C:\\Python314\\python.exe 3d/tools/gen-pbr-textures.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, '3d', 'assets', 'textures', 'pbr')
N = 256   # 2026-11-07：61 个 GLB 各内嵌贴图，512² 时 Godot 导入上千纹理、帧率 48→10 FPS
os.makedirs(OUT, exist_ok=True)


def wrap_noise(cells, seed, n=N):
    """周期低频噪声：网格点 wrap 采样，天然 tileable。"""
    rng = np.random.default_rng(seed)
    g = rng.random((cells, cells)).astype(np.float32)
    x = np.linspace(0, cells, n, endpoint=False)
    xi = np.floor(x).astype(int)
    xf = (x - xi).astype(np.float32)
    x1 = (xi + 1) % cells
    y = x.copy()
    yi = np.floor(y).astype(int)
    yf = (y - yi).astype(np.float32)
    y1 = (yi + 1) % cells
    top = g[np.ix_(yi, xi)] * (1 - xf[None, :]) + g[np.ix_(yi, x1)] * xf[None, :]
    bot = g[np.ix_(y1, xi)] * (1 - xf[None, :]) + g[np.ix_(y1, x1)] * xf[None, :]
    return top * (1 - yf[:, None]) + bot * yf[:, None]


def fine(seed, n=N):
    rng = np.random.default_rng(seed)
    return rng.random((n, n)).astype(np.float32)


def rgb(base, noise, amp=0.10):
    """base: (r,g,b) 0~1；noise: n×n 0~1（ centered around 0 by caller）"""
    arr = np.zeros((N, N, 3), dtype=np.float32)
    for k in range(3):
        arr[:, :, k] = base[k] * (1.0 + amp * noise)
    return np.clip(arr, 0, 1)


# glTF 原生支持 JPEG；噪声类 albedo 用 PNG 压缩率极差（每张 300KB+），
# 61 个 GLB 各内嵌十几张会涨到 200MB。JPEG q88 能压到 ~40KB 且肉眼无差。
def save_rgb(name, arr):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB').save(
        os.path.join(OUT, name + '.jpg'), quality=88, optimize=True)


def save_gray(name, arr):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'L').save(
        os.path.join(OUT, name + '.jpg'), quality=92, optimize=True)


def normal_from_height(h, strength=2.2):
    gy, gx = np.gradient(h.astype(np.float32))
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    out = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], axis=-1)
    return out


def emit(name, alb, rough, height, nstr=2.2):
    # 只出 albedo + normal。roughness 用材质常量（covers_lib.mat 里已有），
    # 省掉 1/3 的纹理资源；Godot 侧不必为每张图再开一个 sampler。
    save_rgb(name + '_albedo', alb)
    save_rgb(name + '_normal', normal_from_height(height, nstr))


def metal_panel():
    """深色金属面板：4×4 分格、板缝、铆钉、磨损与细划痕。"""
    n1 = wrap_noise(8, 11) - 0.5
    n2 = wrap_noise(32, 12) - 0.5
    n3 = fine(13) - 0.5
    h = 0.5 + 0.35 * n1 + 0.18 * n2 + 0.06 * n3
    yy, xx = np.mgrid[0:N, 0:N]
    seam = np.zeros((N, N), dtype=np.float32)
    for k in range(1, 4):
        p = k * N // 4
        seam[max(0, p - 2):p + 2, :] = 1.0
        seam[:, max(0, p - 2):p + 2] = 1.0
    rivet = np.zeros((N, N), dtype=np.float32)
    for i in range(4):
        for j in range(4):
            cx, cy = i * N // 4 + 12, j * N // 4 + 12
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            rivet += np.clip(1 - d / 5.0, 0, 1)
    # 水平细划痕（周期性，用 sin + 噪声）
    scratch = (np.sin(yy * 0.42 + wrap_noise(6, 14) * 6.0) > 0.985).astype(np.float32) * 0.10
    shade = 1 + 0.22 * (h - 0.5) - 0.42 * seam + 0.25 * np.clip(rivet, 0, 1) + scratch
    alb = rgb((0.24, 0.27, 0.31), shade - 1)
    rough = np.clip(0.55 + 0.20 * (h - 0.5) + 0.16 * seam, 0, 1)
    emit('metal_panel', alb, rough, h - 0.35 * seam + 0.25 * np.clip(rivet, 0, 1), 2.6)


def brushed_steel():
    """拉丝钢：沿 X 的细条纹 + 低频色差。"""
    rng = np.random.default_rng(21)
    row = rng.random(N).astype(np.float32)
    # 让首尾也接得上（tileable）
    row = 0.5 * (row + np.roll(row, 1))
    lines = np.repeat(row[:, None], N, axis=1)
    low = wrap_noise(6, 22) - 0.5
    fine_n = fine(23) - 0.5
    h = 0.5 + 0.62 * (lines - 0.5) + 0.20 * low + 0.08 * fine_n
    alb = rgb((0.46, 0.50, 0.54), h - 0.5, amp=0.55)
    rough = np.clip(0.34 + 0.22 * (lines - 0.5) + 0.12 * low, 0, 1)
    emit('brushed_steel', alb, rough, h, 1.5)


def shell_white():
    """喷漆外壳：浅灰白 + 细颗粒 + 稀疏竖向面板缝。"""
    n1 = wrap_noise(12, 31) - 0.5
    n2 = fine(32) - 0.5
    h = 0.5 + 0.18 * n1 + 0.10 * n2
    yy, xx = np.mgrid[0:N, 0:N]
    seam = np.zeros((N, N), dtype=np.float32)
    for k in (1, 3):
        p = k * N // 4
        seam[:, max(0, p - 1):p + 1] = 1.0
    alb = rgb((0.76, 0.80, 0.83), (h - 0.5) * 0.5 - 0.10 * seam, amp=0.55)
    rough = np.clip(0.42 + 0.14 * n1 + 0.10 * seam, 0, 1)
    emit('shell_white', alb, rough, h - 0.20 * seam, 1.2)


def screen():
    """设备屏幕：暗底 + 扫描线 + 网格 + UI 亮块。"""
    yy, xx = np.mgrid[0:N, 0:N]
    alb = np.zeros((N, N, 3), dtype=np.float32)
    alb[:] = (0.035, 0.075, 0.10)
    scan = ((yy % 6) < 2).astype(np.float32)
    alb[:, :, 2] += scan * 0.055
    grid = ((xx % 64 < 1) | (yy % 64 < 1)).astype(np.float32)
    alb += grid[:, :, None] * np.array([0.02, 0.09, 0.12], dtype=np.float32)
    # 几块 UI 数据条
    for i, (y0, x0, w) in enumerate([(60, 40, 120), (100, 40, 80), (60, 300, 150),
                                     (220, 300, 90), (380, 40, 200)]):
        alb[y0:y0 + 10, x0:x0 + w] += np.array([0.05, 0.24, 0.30], dtype=np.float32)
    rough = np.full((N, N), 0.24, dtype=np.float32)
    emit('screen', alb, rough, scan * 0.25 + grid * 0.15, 0.8)


def fabric():
    """织物：交叉编织。"""
    yy, xx = np.mgrid[0:N, 0:N]
    weave = (np.sin(xx * 0.45) * np.sin(yy * 0.45) + 1) * 0.5
    n = wrap_noise(24, 41) - 0.5
    h = 0.5 + 0.35 * (weave - 0.5) + 0.15 * n
    alb = rgb((0.30, 0.40, 0.50), h - 0.5, amp=0.5)
    rough = np.clip(0.86 + 0.08 * n, 0, 1)
    emit('fabric', alb, rough, h, 2.0)


def hazard():
    """警示斜纹（黄黑 45°）。"""
    yy, xx = np.mgrid[0:N, 0:N]
    stripe = (((xx + yy) // 32) % 2).astype(np.float32)
    n = fine(51) - 0.5
    dark = np.array([0.10, 0.11, 0.12], dtype=np.float32)
    yellow = np.array([0.88, 0.66, 0.16], dtype=np.float32)
    alb = dark[None, None, :] * (1 - stripe[:, :, None]) + yellow[None, None, :] * stripe[:, :, None]
    alb *= (1 + 0.08 * n)[:, :, None]
    rough = np.clip(0.60 + 0.12 * stripe, 0, 1)
    emit('hazard', alb, rough, stripe, 1.0)


def glass():
    """玻璃：淡青 + 竖向高光 + 细噪点。"""
    n = wrap_noise(10, 61) - 0.5
    yy, xx = np.mgrid[0:N, 0:N]
    gleam = np.clip(1 - np.abs(xx - N * 0.32) / 34.0, 0, 1) ** 2
    alb = rgb((0.60, 0.78, 0.84), n * 0.3 + gleam * 0.45, amp=0.6)
    rough = np.clip(0.10 + 0.06 * n, 0, 1)
    emit('glass', alb, rough, n + gleam * 0.3, 0.7)


def leaf():
    """植物：斑驳绿 + 叶脉。"""
    n1 = wrap_noise(16, 71) - 0.5
    n2 = fine(72) - 0.5
    yy, xx = np.mgrid[0:N, 0:N]
    vein = (np.abs(xx - N / 2) < 2).astype(np.float32)
    side = ((np.abs(((xx + yy * 0.5) % 48) - 24) < 1.2)).astype(np.float32)
    h = 0.5 + 0.45 * n1 + 0.15 * n2
    base = np.array([0.20, 0.44, 0.24], dtype=np.float32)
    alb = base[None, None, :] * (1 + 0.55 * (h - 0.5))[:, :, None]
    alb += (vein + side * 0.35)[:, :, None] * np.array([0.06, 0.12, 0.04], dtype=np.float32)
    rough = np.clip(0.72 + 0.12 * n1, 0, 1)
    emit('leaf', alb, rough, h + vein * 0.2, 1.8)


def rubber():
    n = fine(81) - 0.5
    h = 0.5 + 0.5 * n
    alb = rgb((0.09, 0.10, 0.11), h - 0.5, amp=0.8)
    rough = np.clip(0.90 + 0.05 * n, 0, 1)
    emit('rubber', alb, rough, h, 1.0)


def wood():
    yy, xx = np.mgrid[0:N, 0:N]
    grain = np.sin(xx * 0.06 + wrap_noise(8, 91) * 5.0) * 0.5
    n = wrap_noise(12, 92) - 0.5
    h = 0.5 + 0.30 * grain + 0.20 * n
    alb = rgb((0.50, 0.36, 0.21), h - 0.5, amp=0.7)
    rough = np.clip(0.74 + 0.10 * n, 0, 1)
    emit('wood', alb, rough, h, 1.4)


if __name__ == '__main__':
    for fn in (metal_panel, brushed_steel, shell_white, screen, fabric,
               hazard, glass, leaf, rubber, wood):
        fn()
        print('[pbr]', fn.__name__)
    files = sorted(os.listdir(OUT))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in files) / 1024.0
    print('[pbr] %d files, %.0f KB -> %s' % (len(files), total, OUT))
