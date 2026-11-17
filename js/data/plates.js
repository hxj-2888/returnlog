/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 小游戏
 * truth     : js/data/plates.js#SKPlates
 * verify    : npm run plate:check / 全量门禁（?test 直接驱动遮罩）
 * flag      : F
 * note      : 2026-11-06 图内要素落实：板描述唯一真源，运行时与原型编译共用
 * ============================================================== */
/* 图内要素板 · 唯一真源
   -------------------------------------------------------------
   用户 2026-11-05 诉求：「不要在图外面再画四根新线，要直接操控生成图里的电线」。
   这里描述的是**图片像素里本来就存在的线**：path/cut 是标注，不是要画的新线。
   运行时用 SVG mask 在 cut 处把原图中段挖掉，接通时合拢遮罩让原图像素自己长回来。

   单一真源约定：
     · 本文件挂 window.SKPlates，index.html 用经典 <script> 加载（file:// 可直接跑）；
     · tools/plate/build.cjs 用 vm 读本文件，编译 tools/plate-demo.html 与 JSON 快照；
     · tools/plate/validate.cjs 按 plate.schema.json 校验本文件；
     · 不要在别处复制板定义。换一张板 = 改这里 + 重新编译，不动渲染代码。
   坐标一律是图片原始像素（0~size），crop 只决定显示时放大哪一块，不改坐标。
   线坐标由 tools/plate/snap.cjs 用 HSV 掩膜 + 局部质心 + PCA 主轴求得，不是目测。 */
(function (global) {
  'use strict';

  var plates = {
    'panel-fix': {
      id: 'panel-fix',
      label: '电路维修 · 断线重接',
      /* 相对 index.html 的路径：游戏运行时与 file:// 都靠它找图，不用 fetch */
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
      ]
    }
  };

  /* 任务名 → 板。没写进来的 wire 型动作走 default()。
     3D 端要复用同一套「哪块板配哪个任务」时读这张表，不要再抄一份。 */
  var byLabel = {
    '电路维修': 'panel-fix',
    '备用配电盘': 'panel-fix',
    '出库扫描': 'panel-fix'
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
