# gen-armory-deck.py · 军械库地板程序化重出（2026-11-10）
# 用户两次否决千问军械库概念图（金色光斑 / 六边形蜂巢感、不像地板）。
# 这里走与 gen-hull.py / gen-pbr-textures.py 同类的程序化顶视无缝甲板：
#   钢底板 + 防滑菱形 tread + 螺栓网格 + 两条平行橡胶通道 + 黄色边线
#   + 同向步枪 stencil + 弹药箱脚印。无六边形、无透视收敛、方向保持可平铺。
# 输出覆盖素材层 referenced/2.5d-preview-textures/qwen/armory/floor.png
# （2026-11-12 起 2.5D 仓不再保留 preview 过期副本；同步到 3D 运行时由部署/同步步骤负责）。
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_LAYER = os.environ.get('RETURNLOG_ASSET_LAYER') or os.path.join(
    os.path.expanduser('~'), 'Documents', 'returnlog_assets')
OUT = os.path.join(ASSET_LAYER, 'referenced', '2.5d-preview-textures', 'qwen', 'armory', 'floor.png')
S = 1536

STEEL = (104, 110, 112)
STEEL_D = (88, 94, 96)
TREAD = (120, 126, 128)
BOLT = (70, 76, 78)
RUBBER = (44, 47, 50)
RUBBER_D = (36, 39, 42)
YELLOW = (214, 178, 58)
STENCIL = (30, 33, 36)
LINE = (150, 156, 158)

im = Image.new('RGB', (S, S), STEEL)
d = ImageDraw.Draw(im)

# 防滑菱形 tread：模块化网格，保证无缝
step = 48
for gy in range(0, S, step):
    for gx in range(0, S, step):
        ox = (gx // step) % 2 * (step // 2)
        cx, cy = gx + ox + step // 2, gy + step // 2
        d.polygon([(cx, cy - 9), (cx + 12, cy), (cx, cy + 9), (cx - 12, cy)], fill=TREAD)
        d.line([(cx - 12, cy), (cx, cy + 9)], fill=STEEL_D, width=2)

# 钢板拼缝 + 螺栓网格（模块化）
panel = 384
for p in range(0, S, panel):
    d.line([(p, 0), (p, S)], fill=STEEL_D, width=3)
    d.line([(0, p), (S, p)], fill=STEEL_D, width=3)
    for by in range(24, S, 96):
        for bx in range(24, S, 96):
            d.ellipse([bx - 4, by - 4, bx + 4, by + 4], fill=BOLT)

# 两条平行橡胶通道（竖直贯通，天然无缝）+ 黄色边线
lanes = [(int(S * 0.16), int(S * 0.36)), (int(S * 0.64), int(S * 0.84))]
for (x0, x1) in lanes:
    d.rectangle([x0, 0, x1, S], fill=RUBBER)
    # 橡胶横纹
    for y in range(0, S, 24):
        d.line([(x0 + 6, y), (x1 - 6, y)], fill=RUBBER_D, width=3)
    d.rectangle([x0 - 6, 0, x0 - 1, S], fill=YELLOW)
    d.rectangle([x1 + 1, 0, x1 + 6, S], fill=YELLOW)


def rifle(cx, cy, ln=150):
    # 顶视同向步枪 stencil（枪口朝上）：枪管+护木+机匣+弹匣+枪托
    d.rectangle([cx - 3, cy - ln // 2, cx + 3, cy - ln // 6], fill=STENCIL)          # 枪管
    d.rectangle([cx - 7, cy - ln // 6, cx + 7, cy + ln // 8], fill=STENCIL)          # 护木/机匣
    d.rectangle([cx - 2, cy - ln // 2 - 12, cx + 2, cy - ln // 2], fill=STENCIL)     # 准星
    d.polygon([(cx + 7, cy + 2), (cx + 26, cy + 10), (cx + 24, cy + 22), (cx + 7, cy + 14)], fill=STENCIL)  # 弹匣
    d.polygon([(cx - 7, cy + ln // 8), (cx + 7, cy + ln // 8), (cx + 10, cy + ln // 2), (cx - 12, cy + ln // 2)], fill=STENCIL)  # 枪托
    d.rectangle([cx - 16, cy - 6, cx - 7, cy + 4], fill=STENCIL)                      # 握把


# 通道内步枪 stencil（竖直等距，mod 无缝）+ 通道间弹药箱脚印
for (x0, x1) in lanes:
    cx = (x0 + x1) // 2
    for cy in range(192, S, 384):
        rifle(cx, cy)
for cy in range(96, S, 384):
    for cx in (int(S * 0.46), int(S * 0.54)):
        d.rectangle([cx - 26, cy - 20, cx + 26, cy + 20], outline=STENCIL, width=4)
        d.line([(cx - 26, cy), (cx + 26, cy)], fill=STENCIL, width=3)
        d.line([(cx, cy - 20), (cx, cy + 20)], fill=STENCIL, width=3)

# 通道口地面标识线（横向短划，mod 无缝）
for y in range(0, S, 384):
    for (x0, x1) in lanes:
        d.rectangle([x0 + 10, y + 8, x1 - 10, y + 14], fill=LINE)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT)
print('[armory-deck] wrote', OUT, im.size)