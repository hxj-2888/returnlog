# =============================================================
# room-wall-art.py · 舱室墙面装饰「SDXL 生图 → Blender 渲染」初步管线
# -------------------------------------------------------------
# 真源：tools/ship-layout-plan.json（由 ship-layout-build.cjs 生成）
# 本脚本只消费方案数据，不修改任何地图 / 游戏逻辑。
#
# 系统 Python（C:\Python314\python.exe）：
#   python 3d/tools/room-wall-art.py --stage plan
#   python 3d/tools/room-wall-art.py --stage sdxl --room med            # 默认 dry-run
#   python 3d/tools/room-wall-art.py --stage sdxl --room med --execute  # 真出图
#   python 3d/tools/room-wall-art.py --stage grade --room med --execute
#
# Blender 5.2.2（唯一权威渲染版本）：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/room-wall-art.py -- --stage blender --room fun --test
#
# 防复用：每间房独立目录 / 独立 prompt / 独立 seed / 独立模型名，
#         脚本不设 shared/ 目录，也不允许把 A 舱贴图路径写给 B 舱。
# =============================================================
import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLAN = os.path.join(ROOT, 'tools', 'ship-layout-plan.json')
TEX_ROOT = os.path.join(ROOT, '3d', 'assets', 'textures')
RENDER_DIR = os.path.join(ROOT, '3d', 'assets', 'renders')
MODEL_DIR = os.path.join(ROOT, '3d', 'assets', 'models')

# 主路径：本机 2026-10-27 实测跑通的 GPU diffusers
#   D:\ai-models\gen_sdxl_batch.py · 512²/12 步 · 约 70~80 s/张 · output/sdxl_run.json
# 模型目录是 diffusers fp16 变体（不是 GGUF），VAE 必须换 fp16-fix 否则出纯黑图。
SDXL_MODEL = r'D:\ai-models\sdxl-base'
SDXL_VAE = r'D:\ai-models\vae-fp16-fix'
SIZE = 512
STEPS = 12
CFG = 6.0
# 低内存兜底：sdcpp CPU q2_K 需要 SDXL GGUF。本机 D:\ai-models\gguf 目前只有
# Z-Image / Qwen 的 GGUF，没有 SDXL GGUF —— 未补齐前 --backend sdcpp 会直接报错停下，
# 不会拿一个跑不通的命令去出图。
SDCLI = r'E:\ai-tools\sdcpp\vulkan\sd-cli.exe'
SDCPP_GGUF = r'D:\ai-models\gguf\sdxl\sdxl-base-q2_K.gguf'

try:
    import bpy
    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False


def load_plan():
    with open(PLAN, encoding='utf-8') as f:
        return json.load(f)


def room_of(plan, rid):
    rooms = [r for r in plan['rooms'] if (not rid or r['id'] == rid)]
    if not rooms:
        raise SystemExit('找不到舱室：' + str(rid))
    return rooms


def out_raw(room, wall):
    return os.path.join(TEX_ROOT, room['id'], wall['kind'] + '_raw.png')


def out_png(room, wall):
    return os.path.join(TEX_ROOT, room['id'], wall['kind'] + '.png')


# ---------------- 阶段 1/2/3：系统 Python ----------------
def cmd_plan(plan, rid):
    for room in room_of(plan, rid):
        print('%s %-6s seed=%-5d 墙饰 %d 件 · %s' %
              (room['id'], room['name'], room['sdxl']['seed'], len(room['walls']), room['style']['palette']))
        for w in room['walls']:
            print('   %-24s seed=%-5d -> %s' % (w['kind'], w['seed'], os.path.relpath(out_png(room, w), ROOT)))
    print('\n提示：wall[].prompt 已继承该舱室风格提示词，seed 全局唯一；禁止跨舱复用。')


def diffusers_jobs(plan, rid, only=''):
    only_set = set(s.strip() for s in only.split(',') if s.strip())
    jobs = []
    for room in room_of(plan, rid):
        os.makedirs(os.path.join(TEX_ROOT, room['id']), exist_ok=True)
        for w in room['walls']:
            if only_set and w['kind'] not in only_set:
                continue
            jobs.append((room, w, out_raw(room, w)))
    return jobs


def run_diffusers(jobs):
    try:
        import torch
        from diffusers import StableDiffusionXLPipeline, AutoencoderKL
    except ImportError as e:
        raise SystemExit('[room-wall-art] diffusers 路径需要 C:\\Python314\\python.exe（torch / diffusers / Pillow）：' + str(e))
    import time
    vae = AutoencoderKL.from_pretrained(SDXL_VAE, torch_dtype=torch.float16)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        SDXL_MODEL, vae=vae, torch_dtype=torch.float16, variant='fp16',
        use_safetensors=True, add_watermarker=False, low_cpu_mem_usage=True)
    pipe.to('cuda')
    pipe.set_progress_bar_config(disable=True)
    for obj in (pipe, pipe.vae):
        for fn in ('enable_slicing', 'enable_tiling'):
            f = getattr(obj, fn, None)
            if callable(f):
                try:
                    f()
                except Exception:
                    pass
    for room, wall, out in jobs:
        t = time.time()
        gen = torch.Generator('cuda').manual_seed(wall['seed'])
        img = pipe(prompt=wall['prompt'], negative_prompt=room['sdxl']['negative'],
                   height=SIZE, width=SIZE, num_inference_steps=STEPS,
                   guidance_scale=CFG, generator=gen).images[0]
        img.save(out)
        print('   [%s] %-24s seed=%-5d %.1fs -> %s' %
              (room['id'], wall['kind'], wall['seed'], time.time() - t, os.path.relpath(out, ROOT)))
    del pipe
    try:
        import gc
        gc.collect()
        torch.cuda.empty_cache()
    except Exception:
        pass


def run_sdcpp(jobs):
    if not os.path.exists(SDCPP_GGUF):
        raise SystemExit('[room-wall-art] 本机暂无 SDXL GGUF（%s）。'
                         '请改用默认的 --backend diffusers，或先转换权重再跑 sdcpp。' % SDCPP_GGUF)
    for room, wall, out in jobs:
        cmd = [SDCLI, '-m', SDCPP_GGUF, '--vae', SDXL_VAE,
               '--type', 'q2_K', '--backend', 'cpu', '--params-backend', 'cpu',
               '-W', '256', '-H', '256', '--steps', '4', '--cfg-scale', '5',
               '--seed', str(wall['seed']), '-p', wall['prompt'],
               '-n', room['sdxl']['negative'], '-o', out]
        subprocess.run(cmd, check=True)
        print('   [%s] %s -> %s' % (room['id'], wall['kind'], os.path.relpath(out, ROOT)))


def cmd_sdxl(plan, rid, execute, backend, only=''):
    jobs = diffusers_jobs(plan, rid, only)
    if not jobs:
        raise SystemExit('[room-wall-art] 没有匹配的墙饰（--room=%s --only=%s）' % (rid, only))
    spec = ('%d² / %d 步 / CFG %s（GPU fp16）' % (SIZE, STEPS, CFG)) if backend == 'diffusers' \
        else '256² / 4 步 / CFG 5.0（CPU q2_K，需 SDXL GGUF）'
    print('后端：%s · 模型 %s · VAE %s · %s · %d 张' %
          (backend, SDXL_MODEL, SDXL_VAE, spec, len(jobs)))
    for room, wall, out in jobs:
        print('  [%s] %-24s seed=%-5d -> %s' %
              (room['id'], wall['kind'], wall['seed'], os.path.relpath(out, ROOT)))
    if not execute:
        print('\n[dry-run] 未实际出图。加 --execute 才调用 %s。' %
              ('GPU diffusers' if backend == 'diffusers' else 'sd-cli CPU q2_K'))
        return
    if backend == 'diffusers':
        run_diffusers(jobs)
    else:
        run_sdcpp(jobs)


def grade_one(src, dst, room):
    from PIL import Image, ImageEnhance, ImageDraw
    im = Image.open(src).convert('RGB').resize((512, 512), Image.LANCZOS)
    # 降亮 + 冷调（贴墙装饰不能抢掩体与任务点的视觉焦点）
    im = ImageEnhance.Brightness(im).enhance(0.72)
    r, g, b = im.split()
    r = r.point(lambda v: int(v * 0.92))
    b = b.point(lambda v: min(255, int(v * 1.08)))
    im = Image.merge('RGB', (r, g, b))
    # 扫描线 + 网格，呼应既有 device_screen_task.png / pipe_hatch.png 的处理口径
    d = ImageDraw.Draw(im, 'RGBA')
    for y in range(0, 512, 4):
        d.line([(0, y), (512, y)], fill=(0, 0, 0, 28), width=1)
    for x in range(0, 512, 64):
        d.line([(x, 0), (x, 512)], fill=(120, 190, 210, 18), width=1)
    # 暗角
    vig = Image.new('L', (512, 512), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse((-90, -90, 602, 602), fill=255)
    im = Image.composite(im, Image.new('RGB', (512, 512), (8, 11, 15)), vig.resize((512, 512)))
    im.save(dst)
    return dst


def cmd_grade(plan, rid, execute):
    for room in room_of(plan, rid):
        for w in room['walls']:
            src, dst = out_raw(room, w), out_png(room, w)
            print('[grade] %s -> %s %s' % (os.path.relpath(src, ROOT), os.path.relpath(dst, ROOT),
                                           '' if execute else '(dry-run)'))
            if execute:
                if not os.path.exists(src):
                    print('   跳过：缺原图，请先跑 --stage sdxl --execute')
                    continue
                grade_one(src, dst, room)
                print('   完成')


# ---------------- 阶段 4：Blender ----------------
def blender_main(argv):
    if tuple(bpy.app.version[:2]) < (5, 2):
        raise SystemExit('[room-wall-art] 需要 Blender 5.2+，当前 %s；权威路径 '
                         'E:\\SteamLibrary\\steamapps\\common\\Blender\\blender.exe' % bpy.app.version_string)
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', default='blender')
    ap.add_argument('--room', default='')
    ap.add_argument('--test', action='store_true')
    args = ap.parse_args(argv)
    if args.stage != 'blender':
        raise SystemExit('[room-wall-art] Blender 端只接 --stage blender')
    plan = load_plan()
    rooms = room_of(plan, args.room)
    os.makedirs(RENDER_DIR, exist_ok=True)
    os.makedirs(MODEL_DIR, exist_ok=True)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except Exception:
            continue
    scene.eevee.taa_render_samples = 64
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world.color = (0.04, 0.05, 0.07)

    CARD_W, CARD_H, GAP = 2.6, 1.7, 0.42
    cols = 4
    max_rows = len(rooms)
    total_w = cols * CARD_W + (cols - 1) * GAP
    total_h = max_rows * CARD_H + (max_rows - 1) * GAP

    for ri, room in enumerate(rooms):
        theme = room['theme'] or {}
        mark = [max(0.0, min(1.0, v)) for v in theme.get('mark', [0.6, 0.7, 0.8])]
        glow = [max(0.0, min(1.0, v)) for v in theme.get('glow', [0.5, 0.6, 0.7])]
        for ci, wall in enumerate(room['walls'][:cols]):
            x = ci * (CARD_W + GAP) + CARD_W / 2 - total_w / 2
            y = total_h / 2 - ri * (CARD_H + GAP) - CARD_H / 2
            bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, 0))
            obj = bpy.context.object
            obj.name = wall['asset']
            obj.scale = (CARD_W, CARD_H, 1.0)
            mat = bpy.data.materials.new(wall['asset'])
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Base Color'].default_value = (mark[0], mark[1], mark[2], 1)
            try:
                bsdf.inputs['Emission Color'].default_value = (glow[0], glow[1], glow[2], 1)
                bsdf.inputs['Emission Strength'].default_value = 0.22
            except Exception:
                pass
            png = out_png(room, wall)
            if os.path.exists(png):
                tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
                tex.image = bpy.data.images.load(png)
                mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
            else:
                print('[room-wall-art] 尚无贴图（用主题色占位）：' + os.path.relpath(png, ROOT))
            obj.data.materials.append(mat)
            # 发光边框，区分每间房的 accent（风格锁的可视核对）
            bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, -0.01))
            frame = bpy.context.object
            frame.name = wall['asset'] + '__frame'
            frame.scale = (CARD_W + 0.12, CARD_H + 0.12, 1.0)
            fm = bpy.data.materials.new(frame.name)
            fm.use_nodes = True
            fb = fm.node_tree.nodes.get('Principled BSDF')
            fb.inputs['Base Color'].default_value = (glow[0] * 0.35, glow[1] * 0.35, glow[2] * 0.35, 1)
            frame.data.materials.append(fm)

    cam_data = bpy.data.cameras.new('wall-art-cam')
    cam = bpy.data.objects.new('wall-art-cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, 0, 30)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(total_w * 1.08, total_h * 1.08)
    scene.camera = cam

    light_data = bpy.data.lights.new('wall-art-light', type='AREA')
    light = bpy.data.objects.new('wall-art-light', light_data)
    scene.collection.objects.link(light)
    light.location = (0, 0, 12)
    light_data.energy = 2600
    light_data.size = max(total_w, total_h)

    if args.test:
        scene.render.resolution_x, scene.render.resolution_y = 960, 901
    else:
        scene.render.resolution_x, scene.render.resolution_y = 1440, 1352
    scene.render.resolution_percentage = 100
    tag = args.room or 'all'
    out_png_path = os.path.join(RENDER_DIR, 'room-wall-' + tag + '.png')
    scene.render.filepath = out_png_path
    bpy.ops.render.render(write_still=True)
    blend = os.path.join(MODEL_DIR, 'room_wall_' + tag + '.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print('[room-wall-art] 渲染：' + os.path.relpath(out_png_path, ROOT))
    print('[room-wall-art] 场景：' + os.path.relpath(blend, ROOT))
    print('[room-wall-art] Blender %s · EEVEE · 64 samples · %s' %
          (bpy.app.version_string, '%d×%d' % (scene.render.resolution_x, scene.render.resolution_y)))


# ---------------- 入口 ----------------
def cli_main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', choices=['plan', 'sdxl', 'grade'], default='plan')
    ap.add_argument('--room', default='')
    ap.add_argument('--backend', choices=['diffusers', 'sdcpp'], default='diffusers')
    ap.add_argument('--only', default='', help='只处理指定 kind 的墙饰，便于出样张')
    ap.add_argument('--execute', action='store_true', help='真跑；默认 dry-run 只打印命令')
    args = ap.parse_args(argv)
    plan = load_plan()
    if args.stage == 'plan':
        cmd_plan(plan, args.room)
    elif args.stage == 'sdxl':
        cmd_sdxl(plan, args.room, args.execute, args.backend, args.only)
    else:
        cmd_grade(plan, args.room, args.execute)


if __name__ == '__main__':
    tail = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if IN_BLENDER:
        blender_main(tail)
    else:
        cli_main(tail)
