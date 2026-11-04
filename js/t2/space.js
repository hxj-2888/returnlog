/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 空间与资源
 * definedBy : 地图设计构造 / 角色数值
 * truth     : js/t2/space.js#SKT2Space
 * verify    : 全量门禁 / tools/map-check.cjs
 * flag      : F  (F=现行事实 / N=规范裁定)
 * note      : 方案 A 按三域切的第一个试点模块；数值与拆分前 game.js 完全一致
 * ============================================================== */
/* 空间与资源域 · 运行常量（方案 A 第一批，2026-11-04）
   -------------------------------------------------------------
   真源：本文件。以下数值原样来自 js/game.js 闭包内的 const，一个未改。
   game.js 保留同名局部别名引用本模块，因此下游代码无需改动、行为不变。
   约束：file:// 经典 <script> 直接加载；不引依赖、不读 DOM、不写状态。 */
(function (global) {
  'use strict';
  global.SKT2Space = Object.freeze({
    MOVE_SPEED: 4.2,
    DRAG_SPEED: 2.7,
    SPECT_SPEED: 9,
    DOOR_OPEN_R: 3.0,
    DOOR_CLOSE_R: 3.6,
    DOOR_SPEED: 4.0,
    DOOR_W: 1.8,
    DOOR_PASS: 0.6
  });
})(typeof window !== 'undefined' ? window : globalThis);
