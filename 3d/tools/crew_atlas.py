"""船员 768² 身体图集：UV 分区与语义坐标的唯一来源。

构建脚本（build-crew-rigged.py）和贴图脚本（build-crew-textures.py）都从这里读分区，
避免两边各写一套坐标导致贴图错位。分区使用像素坐标、左上原点；UV 的 V 轴向上。
"""
SIZE = 768

# name: (x0, y0, x1, y1) 像素，已留 8px 间隔
REGIONS = {
    'torso':  (0, 0, 384, 432),
    'arm_l':  (392, 0, 576, 224),
    'arm_r':  (584, 0, 768, 224),
    'boot_l': (392, 232, 576, 400),
    'boot_r': (584, 232, 768, 400),
    'hand_l': (392, 408, 472, 496),
    'hand_r': (480, 408, 560, 496),
    'skin':   (568, 408, 760, 496),
    'leg_l':  (0, 440, 184, 768),
    'leg_r':  (192, 440, 376, 768),
    'gear':   (384, 504, 576, 760),
    'accent': (584, 504, 760, 640),
    'detail': (584, 648, 760, 760),
}

# 身体 UV 的纵向参考（米）：贴图脚本画细节时按这个换算 v
TORSO_Z0, TORSO_Z1 = 0.86, 1.50
ARM_Z0, ARM_Z1 = 0.86, 1.44
LEG_Z0, LEG_Z1 = 0.16, 0.95
BOOT_Z0, BOOT_Z1 = 0.0, 0.30


def region_uv(name, fu, fv):
    """分区内归一坐标 -> Blender UV（V=0 在分区底部）。"""
    x0, y0, x1, y1 = REGIONS[name]
    u = (x0 + fu * (x1 - x0)) / SIZE
    v = 1.0 - (y1 - fv * (y1 - y0)) / SIZE
    return (u, v)


def region_px(name, fu, fv):
    """分区内归一坐标 -> 图集像素（y 向下）。贴图脚本用。"""
    x0, y0, x1, y1 = REGIONS[name]
    return (x0 + fu * (x1 - x0), y1 - fv * (y1 - y0))


def region_size(name):
    x0, y0, x1, y1 = REGIONS[name]
    return (x1 - x0, y1 - y0)
