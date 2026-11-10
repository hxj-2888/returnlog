"""按舱生成**家具参考图**（本地 SDXL · 单张 · 用于 3D 建模取要素）。

与 `D:\ai-models\gen_sdxl_batch.py` 的区别：
  那个是给 2.5D 像素素材用的（挂了 pixel-art-xl LoRA、32×32 俯视）；
  这里是给 3D 掩体建模看的**概念参考**：不要像素化、要能看清分件与倒角，
  所以不挂 LoRA、用 768×512 与 18 步。

口径（与 `3d/WORKFLOW_SDXL_BLENDER.md`、AGENTS §一-6 一致）：
  · 只用本地 `D:\\ai-models\\sdxl-base` + `vae-fp16-fix`，不调用线上生图；
  · 每舱一张、固定 seed 可复现；输出到 `3d/assets/refs/<room>.png`；
  · 提示词绑定该舱 `theme.mark/glow` 的色相，避免串风格。

用法：
  C:\\Python314\\python.exe 3d/tools/gen-cover-refs.py fun bridge
"""
import json
import os
import sys
import time

os.environ.setdefault('HF_HUB_OFFLINE', '1')
import torch  # noqa: E402
from diffusers import AutoencoderKL, StableDiffusionXLPipeline  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, '3d', 'assets', 'refs')
MODEL = r'D:\ai-models\sdxl-base'
VAE = r'D:\ai-models\vae-fp16-fix'

W, H = 768, 512
STEPS = 18
CFG = 6.5

BASE = ('game asset reference sheet, isometric three-quarter view, '
        'dark industrial sci-fi spaceship interior furniture, ')
STYLE = (', brushed dark metal and matte panels, subtle panel seams, rounded edges, '
         'neon accent strips, neutral dark grey studio background, soft studio lighting, '
         'clean readable silhouettes, high detail, no text')
NEG = ('text, watermark, signature, blurry, low contrast, people, characters, clutter, '
       'fisheye, extreme perspective, oversaturated, cartoon, pixel art')

JOBS = {
    'fun': ('seven separate recreation-room pieces: a curved jukebox with chrome arch and round '
            'speaker grille, an arcade cabinet with protruding sloped control deck and lit marquee, '
            'a racing simulator seat, a low two-seat sofa, a game table with rails and felt top, '
            'a round bar stool, a low coffee table; magenta and cyan accents', 300101),
    'bridge': ('seven separate bridge pieces: a large circular command table with a central '
               'holographic column, an octagonal structural column, a low sideboard cabinet, '
               'a command chair, a navigation console with three angled screens, a long record '
               'desk with two monitors, a curved holo screen bank; amber and warm brass accents',
               300102),
    'warehouse': ('six separate warehouse pieces: tall industrial pallet racking with crates and '
                  'barrels, a logistics terminal desk with two screens, a pallet stack, a packing '
                  'bench with pegboard, a roller conveyor receiving station with scan arch; amber '
                  'and hazard-yellow accents', 300103),
    'med': ('six separate medical bay pieces: an operating table with overhead monitor arm, a '
            'bedside vital-signs monitor on a stand, a ventilator cart with gas cylinders, a '
            'hospital bed with side rails and IV pole, a glass-door medicine cabinet, a autoclave '
            'sterilizer with round door; clean white and cyan accents', 300104),
    'armory': ('six separate armory pieces: a long rifle rack with three tiers of rifles, a '
               'gunsmith workbench with vise, a shooting lane barrier with paper target, stacked '
               'ammunition crates, an issue counter with steel grille, a bench vise station; amber '
               'warning accents', 300105),
    'cam': ('five separate security-room pieces: a six-unit codec rack with status LEDs, stacked '
            'archive boxes, a 3x3 video wall with an operator desk beneath it, a server cabinet '
            'with louvered door, an operations desk with two monitors; cold blue and cyan accents',
            300106),
    'engine': ('six separate engine-room pieces: a cylindrical reactor core with two glowing ring '
               'bands and coolant pipes, a bank of four vertical cylinders, an air compressor with '
               'horizontal tank and pressure gauge, a fuse panel cabinet with two rows of breakers, '
               'a three-tier parts cart, a low tool bench with vise mount; orange and teal accents',
               300107),
    'power': ('four separate power-distribution pieces: a floor-standing instrument rack with two '
              'gauge dials, a switchgear cabinet with three doors and busbar, a transformer with '
              'cooling fins and insulators, a breaker bank with twelve lever handles; amber and '
              'hazard-yellow accents', 300108),
    'transit': ('five separate mess-hall pieces: a beverage counter with two drink machines and '
                'cup tower, a tray-return cart with three slanted rails, a round dining table with '
                'two attached stools, a service counter with a glass sneeze guard, a two-tier '
                'plate cart with stacked trays; warm amber and cream accents', 300109),
    'ecosys': ('eight separate hydroponics-bay pieces: a large tree in an octagonal planter, '
               'twin glass cultivation tanks on a shared plinth, a long rectangular water pond '
               'with raised rim, low shrub planters with glowing flowers, an oxygen generator with '
               'two gas cylinders, a three-tier seedling rack, an irrigation console with water '
               'tank, a climate control desk with angled screen; botanical green and cyan accents',
               300110),
}


def load_pipe():
    vae = AutoencoderKL.from_pretrained(VAE, torch_dtype=torch.float16)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL, vae=vae, torch_dtype=torch.float16, variant='fp16',
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
    return pipe


def main(rooms):
    os.makedirs(OUT_DIR, exist_ok=True)
    pipe = load_pipe()
    done = []
    for rid in rooms:
        if rid not in JOBS:
            print('[refs] 跳过未知舱室 %s' % rid)
            continue
        subject, seed = JOBS[rid]
        prompt = BASE + subject + STYLE
        t0 = time.time()
        g = torch.Generator(device='cuda').manual_seed(seed)
        img = pipe(prompt=prompt, negative_prompt=NEG, width=W, height=H,
                   num_inference_steps=STEPS, guidance_scale=CFG, generator=g).images[0]
        path = os.path.join(OUT_DIR, '%s.png' % rid)
        img.save(path)
        dt = time.time() - t0
        meta = {'room': rid, 'seed': seed, 'steps': STEPS, 'size': [W, H],
                'sec': round(dt, 1), 'prompt': prompt, 'negative': NEG}
        with open(os.path.join(OUT_DIR, '%s.json' % rid), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        done.append({'room': rid, 'png': os.path.relpath(path, ROOT).replace('\\', '/'),
                     'sec': round(dt, 1)})
        print('[refs] %-10s %.1fs -> %s' % (rid, dt, path))
    print('[refs] RESULT ' + json.dumps(done, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1:] or ['fun'])
