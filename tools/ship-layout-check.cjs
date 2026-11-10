// =============================================================
// ship-layout-check.cjs · 全船掩体重构方案校验器（只读）
// -------------------------------------------------------------
// 用法：node tools/ship-layout-check.cjs
// 输入：tools/ship-layout-plan.json（方案真源）
//       tools/ship-layout-current.json（现状快照，用于前后对比）
//       tools/ship-layout-overview.html（检查内嵌数据是否与真源同步）
// 输出：tools/ship-layout-report.md + 控制台摘要；有 FAIL 时退出码 1
// 注意：本脚本不改动任何游戏运行时文件（js/data/map.js / map.json）。
// =============================================================

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.dirname(__dirname);
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/ship-layout-plan.json'), 'utf8'));
const CUR = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/ship-layout-current.json'), 'utf8'));
const HTML = fs.readFileSync(path.join(ROOT, 'tools/ship-layout-overview.html'), 'utf8');
const R = P.rules;

const rect = (x, y, w, h) => ({ x, y, w, h });
const overlap = (a, b, eps) => {
  const e = eps === undefined ? 0.02 : eps;
  return a.x < b.x + b.w - e && a.x + a.w > b.x + e && a.y < b.y + b.h - e && a.y + a.h > b.y + e;
};
const contains = (r, px, py, pad) => px >= r.x - (pad || 0) && px <= r.x + r.w + (pad || 0) &&
  py >= r.y - (pad || 0) && py <= r.y + r.h + (pad || 0);
const dPoint = (px, py, r) => Math.hypot(Math.max(r.x - px, 0, px - r.x - r.w), Math.max(r.y - py, 0, py - r.y - r.h));
const dRect = (a, b) => Math.hypot(Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w),
                                   Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h));
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function area(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(s) / 2;
}
function doorRects(room, cfg) {
  const [x0, y0, w, h] = room.rect, hw = cfg.halfWidth, dep = cfg.depth;
  return room.doors.map(d => d[0] === 't' ? rect(d[1] - hw, y0, hw * 2, dep)
    : d[0] === 'b' ? rect(d[1] - hw, y0 + h - dep, hw * 2, dep)
    : d[0] === 'l' ? rect(x0, d[1] - hw, dep, hw * 2)
    : rect(x0 + w - dep, d[1] - hw, dep, hw * 2));
}
function wallNoGo(room) {
  const [x0, y0, w, h] = room.rect, hw = R.door.wallNoGo.half, dep = R.door.wallNoGo.depth;
  return room.doors.map(d => d[0] === 't' ? rect(d[1] - hw, y0, hw * 2, dep)
    : d[0] === 'b' ? rect(d[1] - hw, y0 + h - dep, hw * 2, dep)
    : d[0] === 'l' ? rect(x0, d[1] - hw, dep, hw * 2)
    : rect(x0 + w - dep, d[1] - hw, dep, hw * 2));
}
const pipeRects = room => room.pipes.map(p => rect(p.x - R.pipeClear, p.y - R.pipeClear, R.pipeClear * 2, R.pipeClear * 2));

const checks = [];
function check(rule, room, ok, detail) { checks.push({ rule, room: room || '全船', ok: !!ok, detail: detail || '' }); }

// ---- R1 门厅净空 ------------------------------------------------
for (const r of P.rooms) {
  const dr = doorRects(r, R.door);
  const bad = r.items.filter(it => dr.some(d => overlap(rect(it.x, it.y, it.w, it.h), d)));
  check('R1 门厅净空', r.id, bad.length === 0, bad.length ? '侵入：' + bad.map(b => b.label).join('、') :
    r.doors.length + ' 扇门各 ±' + R.door.halfWidth + '×' + R.door.depth + ' 格净空内 0 件掩体');
  // 「不要离门很近」：门洞线段到最近掩体的距离
  let minGap = Infinity, near = '';
  for (const d of r.doors) {
    const [x0, y0, w, h] = r.rect, c = d[1];
    const seg = d[0] === 't' ? rect(c - 0.9, y0, 1.8, 0.01)
      : d[0] === 'b' ? rect(c - 0.9, y0 + h, 1.8, 0.01)
      : d[0] === 'l' ? rect(x0, c - 0.9, 0.01, 1.8)
      : rect(x0 + w, c - 0.9, 0.01, 1.8);
    for (const it of r.items) {
      const q = dRect(seg, rect(it.x, it.y, it.w, it.h));
      if (q < minGap) { minGap = q; near = d[0] + c + ' ↔ ' + it.label; }
    }
  }
  check('R1 门厅净空', r.id, minGap >= 1.0, '门洞到最近掩体 ' + minGap.toFixed(2) + ' 格（≥1.0）· ' + near);
}

// ---- R2 主通道 --------------------------------------------------
for (const r of P.rooms) {
  const sp = r.spines.map(s => rect(s[0], s[1], s[2], s[3]));
  const bad = r.items.filter(it => sp.some(s => overlap(rect(it.x, it.y, it.w, it.h), s)));
  check('R2 主通道', r.id, bad.length === 0, bad.length ? '压通道：' + bad.map(b => b.label).join('、') :
    r.spines.length + ' 条通道带（宽 ' + R.spineWidth + ' 格）全部畅通');
}

// ---- R3 边界 / 重叠 / 任务点覆盖 ---------------------------------
for (const r of P.rooms) {
  const bad = [];
  for (const it of r.items) {
    const q = rect(it.x, it.y, it.w, it.h);
    const pts = [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h], [q.x + q.w / 2, q.y + q.h / 2]];
    if (!pts.every(p => inPoly(p[0], p[1], r.poly))) bad.push(it.label + '(越界/切角)');
    if (r.tasks.some(t => contains(q, t.x, t.y, 0.12))) bad.push(it.label + '(压任务点)');
  }
  for (let i = 0; i < r.items.length; i++) for (let j = i + 1; j < r.items.length; j++) {
    const a = r.items[i], b = r.items[j];
    if (overlap(rect(a.x, a.y, a.w, a.h), rect(b.x, b.y, b.w, b.h), -0.001)) bad.push(a.label + '×' + b.label + '(重叠)');
  }
  check('R3 边界与重叠', r.id, bad.length === 0, bad.length ? bad.slice(0, 8).join('、') : '多边形内 / 互不重叠 / 不压任务点');
}

// ---- R4 可达性 ---------------------------------------------------
for (const r of P.rooms) {
  const pr = pipeRects(r);
  const bad = [];
  r.tasks.forEach(t => {
    const near = r.items.some(it => dPoint(t.x, t.y, rect(it.x, it.y, it.w, it.h)) <= R.taskReach);
    if (!near) bad.push(t.label + ' 2.5 格内无道具');
  });
  const pipeHit = r.items.filter(it => pr.some(p => overlap(rect(it.x, it.y, it.w, it.h), p)));
  if (pipeHit.length) bad.push('管道口净空被占：' + pipeHit.map(i => i.label).join('、'));
  check('R4 任务点 / 管道口', r.id, bad.length === 0, bad.length ? bad.join('；') :
    r.tasks.length + ' 个任务点全部有真实道具，' + r.pipes.length + ' 个管道口保 ' + R.pipeClear + ' 格净空');
}

// ---- R5 密度（含与现状对比） -------------------------------------
const curBy = {}; CUR.rooms.forEach(r => { curBy[r.id] = r; });
for (const r of P.rooms) {
  const a = area(r.poly), occ = r.items.reduce((s, i) => s + i.w * i.h, 0) / a * 100;
  const old = curBy[r.id] ? curBy[r.id].occ : null;
  const ok = occ >= R.occ.min && occ <= R.occ.max && (old === null || occ >= old);
  check('R5 密度', r.id, ok, occ.toFixed(1) + '%（区间 ' + R.occ.min + '–' + R.occ.max + '%，现状 ' + old + '% → +' + (occ - old).toFixed(1) + 'pp）');
}

// ---- R6 分区 / 层次 / 成组 ---------------------------------------
for (const r of P.rooms) {
  const bad = [];
  if (r.zones.length > R.zone.maxPerRoom) bad.push('分区 ' + r.zones.length + ' > ' + R.zone.maxPerRoom);
  r.zones.forEach(z => {
    const main = new Set(r.items.filter(i => i.zone === z.id && i.tier !== 'accent').map(i => i.kind));
    if (main.size > R.zone.maxMainKinds) bad.push(z.id + ' 主类 ' + main.size + ' > ' + R.zone.maxMainKinds);
  });
  const kindZones = {};
  r.items.forEach(i => { (kindZones[i.kind] = kindZones[i.kind] || new Set()).add(i.zone); });
  Object.keys(kindZones).forEach(k => { if (kindZones[k].size > 1) bad.push('同类跨区：' + k); });
  const tiers = R.tier.filter(t => r.items.some(i => i.tier === t));
  if (tiers.length < 3) bad.push('层次缺档：' + R.tier.filter(t => !tiers.includes(t)).join('/'));
  if (r.stats.cluster < R.zone.clusterMin) bad.push('成组率 ' + r.stats.cluster + ' < ' + R.zone.clusterMin);
  if (r.id === 'fun' && r.stats.cluster < 0.8) bad.push('娱乐室成组率不足 0.8');
  check('R6 分区与层次', r.id, bad.length === 0, bad.length ? bad.join('；') :
    r.zones.length + ' 区 / 主类 ≤' + R.zone.maxMainKinds + ' / 同类不跨区 / 三档齐 / 成组率 ' + r.stats.cluster);
}

// ---- R7 素材唯一性 -----------------------------------------------
const kindOwner = {}, assetSeen = new Set(), wallKindOwner = {}, seedSeen = new Set(), promptOwner = {}, texBad = [];
let dupAsset = 0;
for (const r of P.rooms) {
  r.items.forEach(i => {
    if (kindOwner[i.kind] && kindOwner[i.kind] !== r.id) check('R7 素材唯一', r.id, false, '跨舱室复用 kind：' + i.kind + '（' + kindOwner[i.kind] + '）');
    kindOwner[i.kind] = r.id;
    if (assetSeen.has(i.asset)) { dupAsset++; }
    assetSeen.add(i.asset);
    if (!i.texture.startsWith('3d/assets/textures/' + r.id + '/')) texBad.push(i.asset);
    if (!i.asset.startsWith(r.id + '__')) texBad.push('命名：' + i.asset);
  });
  r.walls.forEach(w => {
    if (wallKindOwner[w.kind] && wallKindOwner[w.kind] !== r.id) check('R7 素材唯一', r.id, false, '跨舱室复用墙饰：' + w.kind);
    wallKindOwner[w.kind] = r.id;
    if (seedSeen.has(w.seed)) check('R7 素材唯一', r.id, false, '墙饰 seed 重复：' + w.seed);
    seedSeen.add(w.seed);
    if (!w.texture.startsWith('3d/assets/textures/' + r.id + '/')) texBad.push(w.asset);
  });
  if (seedSeen.has(r.sdxl.seed)) check('R7 素材唯一', r.id, false, '房间 seed 重复：' + r.sdxl.seed);
  seedSeen.add(r.sdxl.seed);
  if (promptOwner[r.sdxl.prompt]) check('R7 素材唯一', r.id, false, '提示词与 ' + promptOwner[r.sdxl.prompt] + ' 相同');
  promptOwner[r.sdxl.prompt] = r.id;
}
check('R7 素材唯一', '全船', dupAsset === 0 && texBad.length === 0,
  P.stats.kinds + ' 类掩体 + ' + P.stats.wall + ' 件墙饰 · asset 唯一 ' + assetSeen.size + ' 个 · 贴图目录房间专属 ' +
  (texBad.length ? '异常 ' + texBad.length + ' 处' : '0 异常') + (dupAsset ? ' · 重复 asset ' + dupAsset : ''));

// ---- R8 墙面装饰 -------------------------------------------------
for (const r of P.rooms) {
  const bad = [], wn = wallNoGo(r), pr = pipeRects(r);
  const [x0, y0, w, h] = r.rect;
  if (r.walls.length < R.wallsPerRoom.min || r.walls.length > R.wallsPerRoom.max) bad.push('件数 ' + r.walls.length);
  r.walls.forEach(wl => {
    const q = rect(wl.x, wl.y, wl.w, wl.h);
    if (Math.min(wl.w, wl.h) > 0.5) bad.push(wl.label + ' 厚 >0.5');
    const near = Math.min(wl.x - x0, y0 + h - wl.y - wl.h, x0 + w - wl.x - wl.w, wl.y - y0);
    if (near > 0.35) bad.push(wl.label + ' 未贴墙(' + near.toFixed(2) + ')');
    if (wn.some(d => overlap(q, d))) bad.push(wl.label + ' 贴门洞');
    if (pr.some(p => overlap(q, p))) bad.push(wl.label + ' 压管道口');
    if (!wl.prompt.startsWith(r.sdxl.prompt)) bad.push(wl.label + ' 未继承房间风格提示词');
    if (!wl.seed || !wl.asset) bad.push(wl.label + ' 缺 seed/asset');
  });
  if (!r.style || !r.style.palette || !r.style.motif || !r.theme) bad.push('风格 / 主题色字段缺失');
  check('R8 墙面装饰', r.id, bad.length === 0, bad.length ? bad.join('；') :
    r.walls.length + ' 件 · 贴墙 ≤0.24 格 · 避门洞/管道口 · 风格=' + r.style.palette);
}

// ---- R9 / R10 / R11 通行判据（2026-11-07 用户口径） --------------------
// 复用 tools/layout-reach.cjs：与 js/engine/geo.js 同一套 0.6 格网格，
// 防止重跑 ship-layout-build.cjs 后坐标回退、又出现裂缝 / 单通路 / 中心卡脚。
const LR = require('./layout-reach.cjs');
const allItems = P.rooms.flatMap(r => r.items.map(i => ({
  room: r.id, x: i.x, y: i.y, w: i.w, h: i.h, kind: i.kind, label: i.label
})));
const reach = LR.diagnose(allItems);
check('R9 无过不去裂缝', '全船', reach.comps === 1 && reach.islands.length === 0,
  reach.islands.length ? '孤立可走块 ' + reach.islands.length + ' 处：' + reach.islands.map(i => i.room + '(' + i.x + ',' + i.y + ')').join('、')
    : '全局可走网格 ' + reach.comps + ' 个连通分量 · ' + reach.totalCells + ' 格全连通');
for (const r of P.rooms) {
  const d = reach.rooms.find(x => x.id === r.id);
  check('R10 物品间两处通路', r.id, d && d.articNonCorner === 0,
    d ? '核心区割点 ' + d.articNonCorner + ' 处（0 = 至少两处不相交通路）' : '无读数');
  check('R11 中心不卡脚', r.id, d && d.centerRatio >= LR.CENTER_MIN,
    d ? '核心区可走率 ' + (d.centerRatio * 100).toFixed(1) + '%（≥' + LR.CENTER_MIN * 100 + '%）' : '无读数');
}

// ---- HTML 与真源同步 ---------------------------------------------
const m = HTML.match(/var PLAN = (\{[\s\S]*?\});var CUR =/);
let syncOk = false, syncDetail = 'HTML 内找不到 PLAN';
if (m) {
  try {
    const H = JSON.parse(m[1]);
    syncOk = H.meta.version === P.meta.version && H.stats.cover === P.stats.cover && H.rooms.length === P.rooms.length;
    syncDetail = syncOk ? '内嵌 PLAN 与 ship-layout-plan.json 同步（' + P.meta.version + ' / ' + P.stats.cover + ' 件）' : '版本或统计不一致，请重跑 build';
  } catch (e) { syncDetail = 'HTML 内嵌 JSON 解析失败：' + e.message; }
}
check('同步 HTML 预览', '全船', syncOk, syncDetail);

// ---- 汇总 ---------------------------------------------------------
const byRule = {};
checks.forEach(c => { (byRule[c.rule] = byRule[c.rule] || { ok: 0, fail: 0 }).ok += c.ok ? 1 : 0; if (!c.ok) byRule[c.rule].fail++; });
const totalFail = checks.filter(c => !c.ok).length;
const ruleOrder = ['R1 门厅净空', 'R2 主通道', 'R3 边界与重叠', 'R4 任务点 / 管道口', 'R5 密度', 'R6 分区与层次', 'R7 素材唯一', 'R8 墙面装饰',
  'R9 无过不去裂缝', 'R10 物品间两处通路', 'R11 中心不卡脚', '同步 HTML 预览'];

let md = '# 全船掩体重构方案 · 校验报告\n\n';
md += '> 生成：`node tools/ship-layout-check.cjs` · 日期 2026-11-06 · 方案 ' + P.meta.version + '\n';
md += '> 真源 `tools/ship-layout-plan.json` · 可视化 `tools/ship-layout-overview.html` · 现状快照 `tools/ship-layout-current.json`\n';
md += '> **边界**：只校验方案层，不改动 `js/data/map.js` 与 `3d/preview/data/map.json`；落地到运行时需单独放行。\n\n';
md += '## 结论\n\n**' + checks.length + ' 项断言 · ' + (checks.length - totalFail) + ' 通过 / ' + totalFail + ' 失败**' +
      (totalFail === 0 ? '（全绿）' : '（有失败项，勿进入下一步）') + '。\n\n';
md += '| 规则 | 通过 | 失败 |\n|---|---|---|\n';
ruleOrder.forEach(k => { const v = byRule[k] || { ok: 0, fail: 0 }; md += '| ' + k + ' | ' + v.ok + ' | ' + v.fail + ' |\n'; });
md += '\n## 八条方案规则 + 三条通行判据\n\n';
P.rules.decisions.forEach((d, i) => { md += '- **R' + (i + 1) + '** ' + d + '\n'; });
md += '\n## 逐间读数\n\n';
md += '| 舱室 | 掩体 | 墙饰 | 分区 | 占用(现状→方案) | 成组率 | 层次 | 门净空 |\n|---|---|---|---|---|---|---|---|\n';
P.rooms.forEach(r => {
  const old = curBy[r.id] ? curBy[r.id].occ : '—';
  md += '| ' + r.name + ' | ' + r.stats.cover + ' | ' + r.stats.wall + ' | ' + r.zones.length + ' | ' +
        old + '% → **' + r.stats.occ + '%** | ' + r.stats.cluster + ' | ' + r.stats.tiers.length + '/3 | ' +
        r.doors.length + ' 扇全通 |\n';
});
md += '\n合计：掩体 **' + P.stats.cover + '** 件（现状 59）· 墙饰 **' + P.stats.wall +
      '** 件 · 房间专属 kind **' + P.stats.kinds + '** 类 · 平均占用 **' + P.stats.occAvg +
      '%**（现状约 13.5%）· 门 ' + P.stats.doors + ' 扇 · 任务点 ' + P.stats.tasks + ' 个。\n\n';
md += '## 逐条断言明细\n\n';
ruleOrder.forEach(k => {
  const list = checks.filter(c => c.rule === k);
  if (!list.length) return;
  md += '### ' + k + '\n\n';
  list.forEach(c => { md += '- ' + (c.ok ? '✓' : '✗ **FAIL**') + ' `' + c.room + '` ' + c.detail + '\n'; });
  md += '\n';
});
md += '## 工作流（初步，未批量出图）\n\n';
md += P.workflow.title + '：' + P.workflow.steps.map(s => s.n + '.' + s.name).join(' → ') + '。\n\n';
md += P.workflow.note + '\n\n';
md += '反复用约定：\n\n' + P.workflow.antiReuse.map(s => '- ' + s).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'tools/ship-layout-report.md'), md, 'utf8');

console.log('校验：' + checks.length + ' 项 · ' + (checks.length - totalFail) + ' 通过 / ' + totalFail + ' 失败');
ruleOrder.forEach(k => { const v = byRule[k] || { ok: 0, fail: 0 }; console.log('  ' + k.padEnd(18) + v.ok + ' 通过 / ' + v.fail + ' 失败'); });
if (totalFail) {
  checks.filter(c => !c.ok).forEach(c => console.log('  FAIL [' + c.rule + '] ' + c.room + ' · ' + c.detail));
  console.log('已写出 tools/ship-layout-report.md');
  process.exit(1);
}
console.log('已写出 tools/ship-layout-report.md');
