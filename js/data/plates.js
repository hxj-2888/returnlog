/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 小游戏
 * truth     : js/data/plates.js#SKPlates
 * verify    : npm run plate:check / tests/plate-overlay.cjs / 全量门禁
 * flag      : F
 * note      : 图内要素板唯一真源；运行时与原型编译、叠加核准共用
 * ============================================================== */
/* 图内要素板 · 唯一真源
   -------------------------------------------------------------
   用户 2026-11-05 诉求：「不要在图外面再画四根新线，要直接操控生成图里的电线」。
   2026-11-19 扩到全部 26 个任务：一张贴图 + 若干热点 + 一个动词
   （tap / tapSeq / hold / holdBand / drag / aim），不再有记忆型玩法。

   单一真源约定：
     · 本文件挂 window.SKPlates，index.html 用经典 <script> 加载（file:// 可直接跑）；
     · tests/plate/build.cjs 用 vm 读本文件，编译快照与原型页；
     · tests/plate/validate.cjs 按 plate.schema.json 校验本文件；
     · tools/plate-overlay.cjs 把热点叠在图上出对照图（坐标核准用）。
     · 不要在别处复制板定义。换一张板 = 改这里 + 重跑 plate:check。

   坐标一律是图片原始像素（0~size），crop 只决定显示时放大哪一块，不改坐标。
   热点 box ≥28×28 像素（W3C 最小目标尺寸）；命中区允许比视觉大。
   `hole` 可选：拖动类任务的洞开在**缺口**上（零件原位不动），不放时洞=热点。
   `to` / `toR`：拖动目标中心与容差半径（图片像素）。
   `band`：长按到位的亮带，[下沿, 上沿] 按热点高度的百分比；`lanes`：节奏点按的轨道。 */
(function (global) {
  'use strict';

  var plates = {
    /* ---------- 电路板：仍是「直接接图里的线」 ---------- */
    'panel-fix': {
      id: 'panel-fix',
      label: '电路维修 · 断线重接',
      image: 'assets/minigame/panel-fix.png',
      size: [768, 768],
      crop: [268, 378, 284, 284],
      cut: { w: 16, h: 30 },
      ember: { r: 4.6, hit: 18 },
      wires: [
        {
          id: 'w-blue', color: '#4FA3D8', width: 12,
          path: 'M463,475 L452,480 L441,486 L432,497 L426,509 L421,522 L418,533',
          cut: { x: 431, y: 499, angle: 125 }
        },
        {
          id: 'w-red', color: '#D8483C', width: 12,
          path: 'M486,473 L479,488 L472,496 L466,502 L458,508 L450,516 L444,528 L442,540',
          cut: { x: 466, y: 502, angle: 148 }
        },
        {
          id: 'w-amber', color: '#D9A227', width: 7,
          path: 'M345,589 L358,588 L368,588 L380,587 L395,586',
          cut: { x: 368, y: 588, angle: -2 }
        }
      ],
      /* 拖动 / 顺序点按共用这三个断口：位置就是图里真实的三个缺口 */
      spots: [
        { id: 'slot-blue', shape: 'point', x: 431, y: 499, w: 46, h: 46, order: 1, role: 'slot' },
        { id: 'slot-red', shape: 'point', x: 466, y: 502, w: 46, h: 46, order: 2, role: 'slot' },
        { id: 'slot-amber', shape: 'point', x: 368, y: 588, w: 46, h: 46, order: 3, role: 'slot' },
        /* 零件车的三个零件：拖到上面三个缺口；洞开在缺口上，零件原位不动 */
        { id: 'part-1', shape: 'rect', x: 296, y: 420, w: 44, h: 44, order: 4, role: 'part', to: [431, 499], toR: 36, hole: { x: 409, y: 477, w: 44, h: 44 } },
        { id: 'part-2', shape: 'rect', x: 300, y: 596, w: 44, h: 44, order: 5, role: 'part', to: [368, 588], toR: 36, hole: { x: 346, y: 566, w: 44, h: 44 } },
        { id: 'part-3', shape: 'rect', x: 486, y: 430, w: 44, h: 44, order: 6, role: 'part', to: [466, 502], toR: 36, hole: { x: 444, y: 480, w: 44, h: 44 } }
      ]
    },

    /* ---------- 弹药箱：6 颗子弹 ---------- */
    'supply-ammo': {
      id: 'supply-ammo',
      label: '弹药清点 · 逐颗点按',
      image: 'assets/scene/v4/facility/supply-ammo.png',
      size: [512, 512],
      crop: [66, 50, 380, 380],
      skin: 'dirty',
      spots: [
        { id: 'ammo-1', shape: 'rect', x: 75, y: 162, w: 46, h: 156, role: 'bullet', order: 1 },
        { id: 'ammo-2', shape: 'rect', x: 138, y: 162, w: 46, h: 156, role: 'bullet', order: 2 },
        { id: 'ammo-3', shape: 'rect', x: 201, y: 162, w: 46, h: 156, role: 'bullet', order: 3 },
        { id: 'ammo-4', shape: 'rect', x: 264, y: 162, w: 46, h: 156, role: 'bullet', order: 4 },
        { id: 'ammo-5', shape: 'rect', x: 327, y: 162, w: 46, h: 156, role: 'bullet', order: 5 },
        { id: 'ammo-6', shape: 'rect', x: 390, y: 162, w: 46, h: 156, role: 'bullet', order: 6 }
      ],
      /* 靶道校准：准星沿子弹这一排来回扫，亮带压在第 4 颗上 */
      lanes: [{ x: 70, y: 155, w: 372, h: 190, band: [0.55, 0.67], period: 1.55 }]
    },

    /* ---------- 电闸柜：3 根加热管 + 两个拨钮 + 一个旋钮 ---------- */
    breaker: {
      id: 'breaker',
      label: '电闸柜 · 加热管与拨钮',
      image: 'assets/scene/v4/facility/breaker.png',
      size: [512, 512],
      crop: [24, 12, 464, 464],
      spots: [
        { id: 'tube-1', shape: 'rect', x: 324, y: 148, w: 84, h: 42, order: 1, role: 'tube', band: [56, 76] },
        { id: 'tube-2', shape: 'rect', x: 324, y: 192, w: 84, h: 42, order: 2, role: 'tube', band: [56, 76] },
        { id: 'tube-3', shape: 'rect', x: 324, y: 236, w: 84, h: 42, order: 3, role: 'tube', band: [48, 68] },
        { id: 'sw-1', shape: 'rect', x: 166, y: 214, w: 40, h: 42, order: 4, role: 'switch' },
        { id: 'sw-2', shape: 'rect', x: 162, y: 288, w: 40, h: 42, order: 5, role: 'switch' },
        { id: 'knob', shape: 'circle', x: 450, y: 232, r: 19, order: 6, role: 'knob' }
      ]
    },

    /* ---------- 舱门板：4 条竖向灯带 + 4 层横向板面 ---------- */
    'door-panel': {
      id: 'door-panel',
      label: '舱门板 · 灯带与封条',
      image: 'assets/scene/v4/tex/door-panel.png',
      size: [1536, 1536],
      crop: [0, 0, 1536, 1536],
      skin: 'off',
      spots: [
        { id: 'strip-lt', shape: 'rect', x: 0, y: 148, w: 126, h: 232, order: 1, role: 'strip', band: [58, 78] },
        { id: 'strip-rt', shape: 'rect', x: 1000, y: 144, w: 126, h: 232, order: 2, role: 'strip', band: [58, 78] },
        { id: 'strip-lb', shape: 'rect', x: 0, y: 674, w: 126, h: 136, order: 3, role: 'strip', band: [54, 74] },
        { id: 'strip-rb', shape: 'rect', x: 1000, y: 674, w: 126, h: 136, order: 4, role: 'strip', band: [54, 74] },
        { id: 'deck-1', shape: 'rect', x: 150, y: 150, w: 840, h: 152, order: 5, role: 'shelf', band: [58, 72] },
        { id: 'deck-2', shape: 'rect', x: 150, y: 330, w: 840, h: 160, order: 6, role: 'shelf', band: [58, 72] },
        { id: 'deck-3', shape: 'rect', x: 150, y: 520, w: 840, h: 160, order: 7, role: 'shelf', band: [58, 72] },
        { id: 'deck-4', shape: 'rect', x: 150, y: 710, w: 840, h: 160, order: 8, role: 'shelf', band: [58, 72] }
      ]
    },

    /* ---------- 监控台：双屏 + 键盘 ---------- */
    monitor: {
      id: 'monitor',
      label: '监控台 · 屏幕与键盘',
      image: 'assets/scene/v4/facility/monitor.png',
      size: [512, 512],
      crop: [40, 8, 432, 300],
      spots: [
        { id: 'scr1-t', shape: 'rect', x: 148, y: 40, w: 56, h: 36, order: 1, role: 'channel', fx: { k: 'lit', lit: 1.35 } },
        { id: 'scr1-b', shape: 'rect', x: 148, y: 80, w: 56, h: 34, order: 2, role: 'channel', fx: { k: 'lit', lit: 1.35 } },
        { id: 'scr2-t', shape: 'rect', x: 212, y: 40, w: 74, h: 36, order: 3, role: 'channel', fx: { k: 'lit', lit: 1.35 } },
        { id: 'scr2-b', shape: 'rect', x: 212, y: 80, w: 74, h: 34, order: 4, role: 'channel', fx: { k: 'lit', lit: 1.35 } },
        { id: 'key-1', shape: 'rect', x: 96, y: 128, w: 28, h: 30, order: 5, role: 'key' },
        { id: 'key-2', shape: 'rect', x: 129, y: 128, w: 28, h: 30, order: 6, role: 'key' },
        { id: 'key-3', shape: 'rect', x: 162, y: 128, w: 28, h: 30, order: 7, role: 'key' },
        { id: 'key-4', shape: 'rect', x: 195, y: 128, w: 28, h: 30, order: 8, role: 'key' },
        { id: 'key-5', shape: 'rect', x: 228, y: 128, w: 28, h: 30, order: 9, role: 'key' },
        { id: 'tape-1', shape: 'rect', x: 300, y: 126, w: 34, h: 30, order: 10, role: 'tape', to: [172, 58], toR: 30, hole: { x: 156, y: 42, w: 32, h: 32 } },
        { id: 'tape-2', shape: 'rect', x: 340, y: 132, w: 34, h: 30, order: 11, role: 'tape', to: [240, 58], toR: 30, hole: { x: 224, y: 42, w: 32, h: 32 } },
        { id: 'tape-3', shape: 'rect', x: 380, y: 126, w: 34, h: 30, order: 12, role: 'tape', to: [240, 100], toR: 30, hole: { x: 224, y: 84, w: 32, h: 32 } },
        { id: 'panel-1', shape: 'rect', x: 82, y: 122, w: 62, h: 44, order: 13, role: 'panel' },
        { id: 'panel-2', shape: 'rect', x: 150, y: 122, w: 62, h: 44, order: 14, role: 'panel' },
        { id: 'panel-3', shape: 'rect', x: 218, y: 122, w: 62, h: 44, order: 15, role: 'panel' },
        { id: 'panel-4', shape: 'rect', x: 286, y: 122, w: 62, h: 44, order: 16, role: 'panel' }
      ]
    },

    /* ---------- 医疗箱：两条锁扣 + 中央箱盖 ---------- */
    'supply-med': {
      id: 'supply-med',
      label: '医疗箱 · 锁扣与补液',
      image: 'assets/scene/v4/facility/supply-med.png',
      size: [512, 512],
      crop: [20, 16, 470, 470],
      skin: 'dirty',
      spots: [
        { id: 'latch-top', shape: 'rect', x: 56, y: 50, w: 400, h: 44, order: 1, role: 'latch' },
        { id: 'latch-bot', shape: 'rect', x: 56, y: 338, w: 400, h: 46, order: 2, role: 'latch' },
        { id: 'lid', shape: 'rect', x: 190, y: 148, w: 128, h: 146, order: 3, role: 'lid', band: [42, 58] },
        { id: 'stain-1', shape: 'rect', x: 78, y: 104, w: 72, h: 62, order: 4, role: 'stain' },
        { id: 'stain-2', shape: 'rect', x: 252, y: 96, w: 72, h: 62, order: 5, role: 'stain' },
        { id: 'stain-3', shape: 'rect', x: 352, y: 196, w: 72, h: 62, order: 6, role: 'stain' },
        { id: 'stain-4', shape: 'rect', x: 104, y: 238, w: 72, h: 62, order: 7, role: 'stain' },
        { id: 'stain-5', shape: 'rect', x: 276, y: 252, w: 72, h: 62, order: 8, role: 'stain' }
      ]
    },

    /* ---------- 医疗无人机：三条机械臂 ---------- */
    medbot: {
      id: 'medbot',
      label: '医疗无人机 · 探针校准',
      image: 'assets/scene/v4/facility/medbot.png',
      size: [512, 512],
      crop: [16, 14, 478, 440],
      spots: [
        { id: 'probe-1', shape: 'rect', x: 56, y: 384, w: 48, h: 48, order: 1, role: 'probe', to: [132, 168], toR: 34, hole: { x: 112, y: 148, w: 40, h: 40 } },
        { id: 'probe-2', shape: 'rect', x: 232, y: 398, w: 48, h: 48, order: 2, role: 'probe', to: [250, 214], toR: 34, hole: { x: 230, y: 194, w: 40, h: 40 } },
        { id: 'probe-3', shape: 'rect', x: 408, y: 384, w: 48, h: 48, order: 3, role: 'probe', to: [368, 168], toR: 34, hole: { x: 348, y: 148, w: 40, h: 40 } }
      ]
    },

    /* ---------- 扳手：三个受力点 ---------- */
    'tool-wrench': {
      id: 'tool-wrench',
      label: '扳手 · 三个螺栓',
      image: 'assets/scene/v4/facility/tool-wrench.png',
      size: [512, 512],
      crop: [8, 160, 496, 200],
      spots: [
        { id: 'bolt-1', shape: 'rect', x: 288, y: 214, w: 48, h: 48, order: 1, role: 'bolt' },
        { id: 'bolt-2', shape: 'rect', x: 192, y: 236, w: 48, h: 48, order: 2, role: 'bolt' },
        { id: 'bolt-3', shape: 'rect', x: 78, y: 232, w: 48, h: 48, order: 3, role: 'bolt' }
      ]
    },

    /* ---------- 闸刀：三段行程 ---------- */
    'panel-breaker': {
      id: 'panel-breaker',
      label: '闸刀 · 三段行程',
      image: 'assets/minigame/panel-breaker.png',
      size: [768, 768],
      crop: [214, 30, 348, 720],
      spots: [
        { id: 'lever-1', shape: 'rect', x: 352, y: 150, w: 68, h: 116, order: 1, role: 'lever', fx: { k: 'slide', dy: 0.22 } },
        { id: 'lever-2', shape: 'rect', x: 352, y: 292, w: 68, h: 116, order: 2, role: 'lever', fx: { k: 'slide', dy: 0.22 } },
        { id: 'lever-3', shape: 'rect', x: 352, y: 434, w: 68, h: 116, order: 3, role: 'lever', fx: { k: 'slide', dy: 0.22 } }
      ]
    },

    /* ---------- 生态通风口：4 片通风叶 ---------- */
    'pipe-port-ecosys': {
      id: 'pipe-port-ecosys',
      label: '生态通风口 · 四片通风叶',
      image: 'assets/scene/v4/facility/pipe-port-ecosys.png',
      size: [512, 512],
      crop: [40, 90, 432, 320],
      spots: [
        { id: 'vent-1', shape: 'rect', x: 94, y: 156, w: 38, h: 180, order: 1, role: 'vent', fx: { k: 'slide', dx: -0.18, dim: 0.80 } },
        { id: 'vent-2', shape: 'rect', x: 156, y: 156, w: 38, h: 180, order: 2, role: 'vent', fx: { k: 'slide', dx: -0.18, dim: 0.80 } },
        { id: 'vent-3', shape: 'rect', x: 218, y: 156, w: 38, h: 180, order: 3, role: 'vent', fx: { k: 'slide', dx: -0.18, dim: 0.80 } },
        { id: 'vent-4', shape: 'rect', x: 280, y: 156, w: 38, h: 180, order: 4, role: 'vent', fx: { k: 'slide', dx: -0.18, dim: 0.80 } }
      ]
    },
    /* ---------- 2026-11-19 新增六张板（Qwen-Image 2.1 本地出图，参照登记见 ASSET_GOVERNANCE §14）---------- */
    'tank-gauge': {
      id: 'tank-gauge',
      label: '生命维持罐 · 表盘与阀轮',
      image: 'assets/scene/v4/facility/tank-gauge.png',
      size: [768, 768],
      crop: [100, 110, 560, 540],
      skin: 'dirty',
      spots: [
        { id: 'gauge-1', shape: 'rect', x: 362, y: 347, w: 66, h: 66, order: 1, role: 'gauge', band: [44, 62] },
        { id: 'gauge-2', shape: 'rect', x: 362, y: 422, w: 66, h: 66, order: 2, role: 'gauge', band: [44, 62] },
        { id: 'gauge-3', shape: 'rect', x: 362, y: 497, w: 66, h: 66, order: 3, role: 'gauge', band: [40, 58] },
        { id: 'valve-1', shape: 'rect', x: 485, y: 360, w: 80, h: 80, order: 4, role: 'valve' },
        { id: 'valve-2', shape: 'rect', x: 580, y: 280, w: 80, h: 80, order: 5, role: 'valve' }
      ]
    },
    galley: {
      id: 'galley',
      label: '餐台 · 托盘与餐具',
      image: 'assets/scene/v4/facility/galley.png',
      size: [768, 768],
      crop: [70, 80, 640, 620],
      skin: 'dirty',
      spots: [
        { id: 'tray-1', shape: 'rect', x: 435, y: 155, w: 130, h: 90, order: 1, role: 'dish' },
        { id: 'tray-2', shape: 'rect', x: 435, y: 225, w: 130, h: 80, order: 2, role: 'dish' },
        { id: 'sink', shape: 'rect', x: 315, y: 365, w: 150, h: 110, order: 3, role: 'dish' },
        { id: 'cup-utensil', shape: 'rect', x: 135, y: 345, w: 80, h: 90, order: 4, role: 'dish' },
        { id: 'cup-metal', shape: 'rect', x: 215, y: 370, w: 60, h: 80, order: 5, role: 'dish' }
      ]
    },
    'rec-table': {
      id: 'rec-table',
      label: '娱乐桌 · 发光键位',
      image: 'assets/scene/v4/facility/rec-table.png',
      size: [768, 768],
      crop: [50, 120, 660, 510],
      spots: [
        { id: 'key-1', shape: 'rect', x: 215, y: 360, w: 70, h: 60, order: 1, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } },
        { id: 'key-2', shape: 'rect', x: 295, y: 320, w: 70, h: 60, order: 2, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } },
        { id: 'key-3', shape: 'rect', x: 300, y: 410, w: 70, h: 60, order: 3, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } },
        { id: 'key-4', shape: 'rect', x: 370, y: 285, w: 70, h: 60, order: 4, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } },
        { id: 'key-5', shape: 'rect', x: 430, y: 235, w: 70, h: 60, order: 5, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } },
        { id: 'key-6', shape: 'rect', x: 425, y: 200, w: 70, h: 60, order: 6, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } },
        { id: 'key-7', shape: 'rect', x: 495, y: 240, w: 70, h: 60, order: 7, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } },
        { id: 'key-8', shape: 'rect', x: 435, y: 305, w: 70, h: 60, order: 8, role: 'key', fx: { k: 'press', s: 0.92, lit: 1.30, glow: true } }
      ]
    },
    /* ---------- 点唱机：四个音键（2026-11-19 Qwen-Image 2.1 本地出图，登记见 ASSET_GOVERNANCE §14）---------- */
    jukebox: {
      id: 'jukebox',
      label: '点唱机 · 四个音键',
      image: 'assets/scene/v4/facility/jukebox.png',
      size: [512, 512],
      crop: [30, 110, 460, 300],
      spots: [
        { id: 'key-1', shape: 'rect', x: 84, y: 214, w: 76, h: 76, order: 1, role: 'key', fx: { k: 'press', clip: 'circle', dy: 0.02, s: 0.95, lit: 1.18, glow: true } },
        { id: 'key-2', shape: 'rect', x: 162, y: 214, w: 76, h: 76, order: 2, role: 'key', fx: { k: 'press', clip: 'circle', dy: 0.02, s: 0.95, lit: 1.18, glow: true } },
        { id: 'key-3', shape: 'rect', x: 245, y: 212, w: 76, h: 76, order: 3, role: 'key', fx: { k: 'press', clip: 'circle', dy: 0.02, s: 0.95, lit: 1.18, glow: true } },
        { id: 'key-4', shape: 'rect', x: 329, y: 214, w: 76, h: 76, order: 4, role: 'key', fx: { k: 'press', clip: 'circle', dy: 0.02, s: 0.95, lit: 1.18, glow: true } }
      ]
    },
    /* ---------- 变压器：三个芯仓螺栓（2026-11-19 Qwen-Image 2.1 本地出图）---------- */
    transformer: {
      id: 'transformer',
      label: '变压器 · 三枚芯螺栓',
      image: 'assets/scene/v4/facility/transformer.png',
      size: [512, 512],
      crop: [40, 100, 450, 330],
      spots: [
        { id: 'bolt-1', shape: 'rect', x: 129, y: 199, w: 72, h: 72, order: 1, role: 'bolt', fx: { k: 'turn', clip: 'circle', deg: -90, dim: 0.35 } },
        { id: 'bolt-2', shape: 'rect', x: 247, y: 196, w: 72, h: 72, order: 2, role: 'bolt', fx: { k: 'turn', clip: 'circle', deg: -90, dim: 0.35 } },
        { id: 'bolt-3', shape: 'rect', x: 359, y: 201, w: 72, h: 72, order: 3, role: 'bolt', fx: { k: 'turn', clip: 'circle', deg: -90, dim: 0.35 } }
      ]
    },
    surgery: {
      id: 'surgery',
      label: '手术台 · 探针校准',
      image: 'assets/scene/v4/facility/surgery.png',
      size: [768, 768],
      crop: [100, 50, 500, 650],
      spots: [
        { id: 'probe-1', shape: 'rect', x: 265, y: 445, w: 70, h: 70, order: 1, role: 'probe', to: [390, 420], toR: 36, hole: { x: 370, y: 400, w: 40, h: 40 } },
        { id: 'probe-2', shape: 'rect', x: 465, y: 330, w: 70, h: 70, order: 2, role: 'probe', to: [470, 265], toR: 36, hole: { x: 450, y: 245, w: 40, h: 40 } },
        { id: 'probe-3', shape: 'rect', x: 165, y: 195, w: 70, h: 70, order: 3, role: 'probe', to: [450, 430], toR: 36, hole: { x: 430, y: 410, w: 40, h: 40 } }
      ]
    },
    'target-lane': {
      id: 'target-lane',
      label: '靶道 · 滑轨与亮带',
      image: 'assets/scene/v4/facility/target-lane.png',
      size: [768, 768],
      crop: [20, 220, 740, 340],
      spots: [
        { id: 'rail', shape: 'rect', x: 370, y: 350, w: 60, h: 60, order: 1, role: 'rail' }
      ],
      lanes: [{ x: 30, y: 250, w: 720, h: 290, band: [0.46, 0.57], period: 1.55 }]
    },
    shelf: {
      id: 'shelf',
      label: '货架 · 四层校准',
      image: 'assets/scene/v4/facility/shelf.png',
      size: [768, 768],
      crop: [140, 80, 480, 600],
      skin: 'dirty',
      spots: [
        { id: 'deck-1', shape: 'rect', x: 220, y: 235, w: 300, h: 70, order: 1, role: 'deck', band: [58, 74] },
        { id: 'deck-2', shape: 'rect', x: 220, y: 345, w: 300, h: 70, order: 2, role: 'deck', band: [58, 74] },
        { id: 'deck-3', shape: 'rect', x: 220, y: 460, w: 300, h: 70, order: 3, role: 'deck', band: [58, 74] },
        { id: 'deck-4', shape: 'rect', x: 220, y: 555, w: 300, h: 70, order: 4, role: 'deck', band: [58, 74] }
      ]
    }
  };

  /* 任务名 → 板。26 个任务一一对应，不留「图外控件」。
     3D 端要复用同一套「哪块板配哪个任务」时读这张表，不要再抄一份。 */
  var byLabel = {
    '电路维修': 'panel-fix',
    '保险盘接线': 'panel-fix',
    '零件车': 'panel-fix',
    /* 变压器换芯用专用变压器板（tapSeq 顺序拆三枚芯螺栓）——
       旧映射先落在断线板上（看起来在连电线），后改扳手螺栓板（视觉不贴），现在有专门板。 */
    '变压器换芯': 'transformer',
    '弹药清点': 'supply-ammo',
    '库存盘点': 'shelf',
    '靶道校准': 'target-lane',
    '配餐台盘点': 'galley',
    '引擎组同步': 'breaker',
    '温控面板': 'breaker',
    '氧气循环': 'pipe-port-ecosys',
    '培养罐补液': 'tank-gauge',
    '药柜': 'supply-med',
    '餐台清洁': 'galley',
    '手术台校准': 'surgery',
    '工具台': 'tool-wrench',
    '工作台': 'tool-wrench',
    '消毒循环': 'panel-breaker',
    '货箱封条': 'door-panel',
    '出库扫描': 'door-panel',
    '货架校准': 'shelf',
    '监控墙重连': 'monitor',
    '操作台': 'monitor',
    '录像归档': 'monitor',
    '娱乐桌': 'rec-table',
    '点唱机': 'jukebox'
  };

  var api = {
    schema: 1,
    plates: plates,
    byLabel: byLabel,
    forLabel: function (label) {
      var id = label && byLabel[label];
      return id ? (plates[id] || null) : null;
    },
    /* fix / revive 这类没有具体任务点的动作，也用同一块板 */
    defaultPlate: function () { return plates['panel-fix']; },
    get: function (id) { return plates[id] || null; }
  };

  global.SKPlates = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
