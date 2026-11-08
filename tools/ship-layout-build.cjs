// =============================================================
// ship-layout-build.cjs · 方案生成器
// -------------------------------------------------------------
// 用法：node tools/ship-layout-build.cjs
// 输入：tools/ship-layout-spec.cjs（人工方案）
//       tools/ship-layout-current.json（现状快照，取自旧示意图）
//       3d/preview/data/map.json（房间主题色，schema v2）
// 输出：tools/ship-layout-plan.json     方案真源（机器可读）
//       tools/ship-layout-overview.html 可视化示意图
// 规则：放置时硬避让门厅净空 / 主通道 / 管道口 / 任务点 / 舱室切角；
//       校验器 ship-layout-check.cjs 会再独立复核一遍。
// =============================================================

'use strict';
const fs = require('fs');
const path = require('path');
const { RULES, WORKFLOW, THEMES, SPECS } = require('./ship-layout-spec.cjs');

const ROOT = path.dirname(__dirname);
const CUR = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/ship-layout-current.json'), 'utf8'));
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, '3d/preview/data/map.json'), 'utf8'));

const ROOM_IDS = CUR.rooms.map(r => r.id);
const THEME = {};
MAP.rooms.forEach(r => { THEME[r.id] = r.theme; });

// ---------- 几何小工具 -----------------------------------------
const rect = (x, y, w, h) => ({ x, y, w, h });
function overlap(a, b, eps) {
  const e = eps === undefined ? 0.02 : eps;
  return a.x < b.x + b.w - e && a.x + a.w > b.x + e && a.y < b.y + b.h - e && a.y + a.h > b.y + e;
}
function contains(r, px, py, pad) {
  const p = pad || 0;
  return px >= r.x - p && px <= r.x + r.w + p && py >= r.y - p && py <= r.y + r.h + p;
}
function distPointRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.sqrt(dx * dx + dy * dy);
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(s) / 2;
}
function insideRoom(r, room) {
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
               [r.x + r.w / 2, r.y + r.h / 2]];
  return pts.every(p => inPoly(p[0], p[1], room.poly));
}

// ---------- 硬约束区 -------------------------------------------
function doorRects(room, cfg) {
  const [x0, y0, w, h] = room.rect;
  return room.doors.map(d => {
    const side = d[0], c = d[1], hw = cfg.halfWidth, dep = cfg.depth;
    if (side === 't') return rect(c - hw, y0, hw * 2, dep);
    if (side === 'b') return rect(c - hw, y0 + h - dep, hw * 2, dep);
    if (side === 'l') return rect(x0, c - hw, dep, hw * 2);
    return rect(x0 + w - dep, c - hw, dep, hw * 2);
  });
}
function wallNoGoRects(room) {
  const [x0, y0, w, h] = room.rect;
  const cfg = RULES.door.wallNoGo;
  return room.doors.map(d => {
    const side = d[0], c = d[1], hw = cfg.half, dep = cfg.depth;
    if (side === 't') return rect(c - hw, y0, hw * 2, dep);
    if (side === 'b') return rect(c - hw, y0 + h - dep, hw * 2, dep);
    if (side === 'l') return rect(x0, c - hw, dep, hw * 2);
    return rect(x0 + w - dep, c - hw, dep, hw * 2);
  });
}
function pipeRects(room) {
  return room.pipes.map(p => rect(p.x - RULES.pipeClear, p.y - RULES.pipeClear,
                                 RULES.pipeClear * 2, RULES.pipeClear * 2));
}

// ---------- 单间生成 -------------------------------------------
function buildRoom(base) {
  const id = base.id;
  const spec = SPECS[id];
  if (!spec) throw new Error('缺少 spec：' + id);
  const room = {
    id, name: base.name, rect: base.rect.slice(), poly: base.poly.map(p => p.slice()),
    doors: base.doors.map(d => d.slice()), tasks: base.tasks.map(t => Object.assign({}, t)),
    pipes: base.pipes.map(p => Object.assign({}, p)),
    theme: THEME[id], style: THEMES[id],
    zones: spec.zones.map(z => Object.assign({}, z)),
    spines: spec.spines.map(s => s.slice()),
    design: spec.design,
    sdxl: Object.assign({ room: id, out: '3d/assets/textures/' + id + '/', negative: WORKFLOW.sdxl.negative }, spec.sdxl),
    blender: { scene: '3d/assets/models/' + id + '_wall.blend', render: '3d/assets/renders/' + id + '-wall.png' },
    items: [], walls: []
  };
  const DR = doorRects(room, RULES.door);
  const WN = wallNoGoRects(room);
  const PR = pipeRects(room);
  const SP = room.spines.map(s => rect(s[0], s[1], s[2], s[3]));
  const placed = [];
  const seq = {};

  function assetId(kind, zone) {
    const k = zone + '/' + kind;
    seq[k] = (seq[k] || 0) + 1;
    return id + '__' + zone + '__' + kind + '__' + seq[k];
  }
  function legal(r, isWall) {
    if (!insideRoom(r, room)) return false;
    if (!isWall) {
      if (DR.some(d => overlap(r, d))) return false;
      if (SP.some(s => overlap(r, s))) return false;
      if (PR.some(p => overlap(r, p))) return false;
      if (room.tasks.some(t => contains(r, t.x, t.y, 0.12))) return false;
    } else {
      if (WN.some(d => overlap(r, d))) return false;
      if (PR.some(p => overlap(r, p))) return false;
      if (room.tasks.some(t => contains(r, t.x, t.y, 0.3))) return false;
    }
    for (const q of placed) if (overlap(r, q.rect, -0.001)) return false;
    return true;
  }
  function add(o) {
    const r = rect(o.x, o.y, o.w, o.h);
    if (!legal(r, false)) return false;
    o.asset = assetId(o.kind, o.zone);
    o.texture = '3d/assets/textures/' + id + '/' + o.kind + '.png';
    o.room = id;
    room.items.push(o);
    placed.push({ rect: r, kind: o.kind, zone: o.zone });
    return true;
  }
  function addWall(o) {
    const r = rect(o.x, o.y, o.w, o.h);
    if (!legal(r, true)) return false;
    o.asset = id + '__wall__' + o.kind;
    o.room = id;
    o.texture = '3d/assets/textures/' + id + '/' + o.kind + '.png';
    o.thickness = Math.min(o.w, o.h);
    room.walls.push(o);
    placed.push({ rect: r, kind: o.kind, zone: 'WALL' });
    return true;
  }

  // 1) 大件锚点：原位不合法时允许 ≤1.0 格的小幅让位（不改变分区与设计意图）
  const NUDGE = [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8],
                 [1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0]];
  (spec.anchors || []).forEach(a => {
    if (add(Object.assign({}, a))) return;
    let done = false;
    for (const d of NUDGE) {
      if (add(Object.assign({}, a, { x: +(a.x + d[0]).toFixed(2), y: +(a.y + d[1]).toFixed(2), nudged: true }))) { done = true; break; }
    }
    if (!done) throw new Error(id + ' 锚点非法且无处让位：' + a.kind + ' @' + a.x + ',' + a.y);
  });
  // 2) 环形阵列
  (spec.rings || []).forEach(rg => rg.angles.forEach(deg => {
    const t = deg * Math.PI / 180;
    const x = rg.cx + rg.rx * Math.cos(t) - rg.w / 2;
    const y = rg.cy + rg.ry * Math.sin(t) - rg.h / 2;
    if (!add({ x: +x.toFixed(2), y: +y.toFixed(2), w: rg.w, h: rg.h, kind: rg.kind,
               label: rg.label, zone: rg.zone, tier: rg.tier, form: 'ring' })) {
      throw new Error(id + ' 环椅非法：' + rg.kind + ' @' + x.toFixed(1) + ',' + y.toFixed(1));
    }
  }));
  // 3) 沿墙成排：扫描可用区间，取最居中的合法组
  (spec.rows || []).forEach(row => {
    const [x0, y0, w, h] = room.rect;
    const alongX = row.side === 't' || row.side === 'b';
    // 上/下墙沿 x 排 → 沿墙长度是 w；左/右墙沿 y 排 → 沿墙长度是 h
    const alongLen = alongX ? row.w : row.h;
    const baseGap = (typeof row.gap === 'number') ? row.gap : 0;
    const axisFrom = row.from, axisTo = row.to;
    const groupLen = row.count * alongLen + (row.count - 1) * baseGap;
    if (groupLen > axisTo - axisFrom + 0.001) {
      throw new Error(id + ' 区间放不下 ' + row.count + ' 件 ' + row.kind + '（需 ' + groupLen.toFixed(1) + '，区间 ' + (axisTo - axisFrom).toFixed(1) + '）');
    }
    let best = null;
    for (let gap of [baseGap, Math.max(0.15, baseGap - 0.25), 0.15]) {
      const len = row.count * alongLen + (row.count - 1) * gap;
      const mid = (axisFrom + axisTo) / 2;
      for (let s = axisFrom; s + len <= axisTo + 0.001; s += 0.1) {
        const cand = [];
        for (let i = 0; i < row.count; i++) {
          const a = +(s + i * (alongLen + gap)).toFixed(2);
          cand.push(alongX
            ? rect(a, row.side === 't' ? y0 + 0.3 : y0 + h - 0.3 - row.h, row.w, row.h)
            : rect(row.side === 'l' ? x0 + 0.3 : x0 + w - 0.3 - row.w, a, row.w, row.h));
        }
        // 逐件检查（不把整组一次性塞进 placed，避免自身互相判冲突）
        const snapshot = placed.slice();
        let ok = true;
        for (const c of cand) {
          if (!insideRoom(c, room) || DR.some(d => overlap(c, d)) || SP.some(sp => overlap(c, sp)) ||
              PR.some(p => overlap(c, p)) || room.tasks.some(t => contains(c, t.x, t.y, 0.12)) ||
              snapshot.some(q => overlap(c, q.rect, -0.001))) { ok = false; break; }
          snapshot.push({ rect: c, kind: row.kind, zone: row.zone });
        }
        if (!ok) continue;
        const score = Math.abs(s + len / 2 - mid);
        if (!best || score < best.score) best = { score, cand, gap };
      }
      if (best) break;
    }
    if (!best) {
      const why = [];
      for (let s = axisFrom; s + groupLen <= axisTo + 0.001; s += 0.4) {
        const c = alongX
          ? rect(s, row.side === 't' ? room.rect[1] + 0.3 : room.rect[1] + room.rect[3] - 0.3 - row.h, row.w, row.h)
          : rect(row.side === 'l' ? room.rect[0] + 0.3 : room.rect[0] + room.rect[2] - 0.3 - row.w, s, row.w, row.h);
        const tag = [];
        if (!insideRoom(c, room)) tag.push('越界/切角');
        if (DR.some(d => overlap(c, d))) tag.push('门净空');
        if (SP.some(sp => overlap(c, sp))) tag.push('主通道');
        if (PR.some(p => overlap(c, p))) tag.push('管道口');
        if (room.tasks.some(t => contains(c, t.x, t.y, 0.12))) tag.push('任务点');
        if (placed.some(q => overlap(c, q.rect, -0.001))) tag.push('已有件:' + placed.filter(q => overlap(c, q.rect, -0.001)).map(q => q.kind).join(','));
        why.push('@' + s.toFixed(1) + ' ' + (tag.length ? tag.join('+') : 'OK'));
      }
      throw new Error(id + ' 找不到合法位置：' + row.kind + ' [' + row.from + ',' + row.to + ']\n    ' + why.slice(0, 12).join('\n    '));
    }
    best.cand.forEach((c, i) => {
      add({ x: c.x, y: c.y, w: c.w, h: c.h, kind: row.kind, label: row.label,
            zone: row.zone, tier: row.tier, form: 'row', index: i + 1 });
    });
  });
  // 4) 任务点补配件（保证 2.5 格内有真实道具）
  room.tasks.forEach((t, i) => {
    const near = room.items.some(it => distPointRect(t.x, t.y, rect(it.x, it.y, it.w, it.h)) <= RULES.taskReach);
    if (near) return;
    const dirs = [[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2],
                  [-2.0, 0], [2.0, 0], [0, -2.0], [0, 2.0]];
    let done = false;
    for (const d of dirs) {
      const c = rect(t.x + d[0] - 0.45, t.y + d[1] - 0.45, 0.9, 0.9);
      if (add({ x: c.x, y: c.y, w: c.w, h: c.h, kind: id + '_taskprop' + (i + 1),
                label: t.label + '·操作件', zone: nearestZone(c), tier: 'accent', form: 'taskprop' })) { done = true; break; }
    }
    if (!done) throw new Error(id + ' 任务点无合法操作件：' + t.label);
  });
  // 5) 墙面装饰（贴墙、避开门洞；不合法就沿墙滑动找位置）
  (spec.walls || []).forEach((wl, i) => {
    const [x0, y0, w, h] = room.rect;
    const at = wl.at !== undefined ? wl.at : (wl.from + (wl.span || 2.4) / 2);
    const span = wl.span || 2.4;
    // 墙饰吃进墙面 0.24 格，靠墙家具内缩 0.3 格 → 俯视投影互不重叠
    const mk = (a) => {
      if (wl.side === 't') return rect(a - span / 2, y0 + 0.04, span, 0.24);
      if (wl.side === 'b') return rect(a - span / 2, y0 + h - 0.28, span, 0.24);
      if (wl.side === 'l') return rect(x0 + 0.04, a - span / 2, 0.24, span);
      return rect(x0 + w - 0.28, a - span / 2, 0.24, span);
    };
    let ok = false;
    // 沿整面墙滑动找合法段（切角、门洞、管道口都会把墙面切碎）
    for (let shift = 0; shift <= 12.0 && !ok; shift += 0.2) {
      for (const s of (shift === 0 ? [0] : [-shift, shift])) {
        const r = mk(at + s);
        if (addWall({ x: r.x, y: r.y, w: r.w, h: r.h, kind: wl.kind, label: wl.label,
                      side: wl.side, tier: 'wall', form: 'wall', seed: spec.sdxl.seed + i + 1,
                      prompt: spec.sdxl.prompt + ', ' + wl.label })) { ok = true; break; }
      }
    }
    if (!ok) throw new Error(id + ' 墙饰找不到合法位置：' + wl.kind);
  });

  function nearestZone(c) {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let best = room.zones[0].id, d = Infinity;
    room.zones.forEach(z => {
      const zc = [z.rect[0] + z.rect[2] / 2, z.rect[1] + z.rect[3] / 2];
      const q = Math.hypot(cx - zc[0], cy - zc[1]);
      if (q < d) { d = q; best = z.id; }
    });
    return best;
  }

  // 统计
  const area = polyArea(room.poly);
  const coverArea = room.items.reduce((s, it) => s + it.w * it.h, 0);
  room.stats = {
    area: +area.toFixed(1),
    cover: room.items.length,
    coverArea: +coverArea.toFixed(1),
    occ: +(coverArea / area * 100).toFixed(1),
    wall: room.walls.length,
    zones: room.zones.length,
    doors: room.doors.length,
    kinds: [...new Set(room.items.map(i => i.kind))].length,
    tiers: ['anchor', 'mid', 'accent'].filter(t => room.items.some(i => i.tier === t)),
    cluster: +(room.items.filter(it => clustered(it, room)).length / room.items.length).toFixed(2)
  };
  return room;
}
function edgeDist(a, b) {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.hypot(dx, dy);
}
// 成组：贴墙 ≤1.0 格，或与同分区任意件的边缘净距 ≤2.4 格（不散点）
function clustered(it, room) {
  const [x0, y0, w, h] = room.rect;
  const nearWall = Math.min(it.x - x0, y0 + h - (it.y + it.h), x0 + w - (it.x + it.w), it.y - y0);
  if (nearWall <= 1.0) return true;
  return room.items.some(q => q !== it && q.zone === it.zone &&
    edgeDist(rect(it.x, it.y, it.w, it.h), rect(q.x, q.y, q.w, q.h)) <= RULES.zone.clusterGap);
}

// ---------- 全船 ------------------------------------------------
const rooms = CUR.rooms.map(buildRoom);
const PLAN = {
  meta: {
    title: '新返航录 · 全船掩体重构方案',
    version: RULES.version,
    date: '2026-11-06',
    source: '3d/preview/data/map.json (schema v2) + tools/ship-layout-current.json',
    decisions: RULES.decisions,
    note: '本文件是「方案层」数据，不直接改动 js/data/map.js 或 3d/preview/data/map.json；落地需单独放行。'
  },
  rules: RULES,
  workflow: WORKFLOW,
  themes: THEMES,
  bounds: CUR.bounds,
  scale: CUR.scale,
  corridors: CUR.corridors,
  walls: CUR.walls,
  rooms,
  stats: {
    rooms: rooms.length,
    cover: rooms.reduce((s, r) => s + r.stats.cover, 0),
    wall: rooms.reduce((s, r) => s + r.stats.wall, 0),
    doors: rooms.reduce((s, r) => s + r.stats.doors, 0),
    tasks: rooms.reduce((s, r) => s + r.tasks.length, 0),
    pipes: rooms.reduce((s, r) => s + r.pipes.length, 0),
    occAvg: +(rooms.reduce((s, r) => s + r.stats.occ, 0) / rooms.length).toFixed(1),
    occMin: Math.min(...rooms.map(r => r.stats.occ)),
    occMax: Math.max(...rooms.map(r => r.stats.occ)),
    kinds: [...new Set(rooms.flatMap(r => r.items.map(i => i.kind)))].length
  }
};
fs.writeFileSync(path.join(ROOT, 'tools/ship-layout-plan.json'), JSON.stringify(PLAN, null, 1), 'utf8');

// ---------- 控制台摘要 ------------------------------------------
console.log('方案生成：' + PLAN.stats.rooms + ' 间 / 掩体 ' + PLAN.stats.cover + ' 件 / 墙饰 ' + PLAN.stats.wall +
            ' 件 / 门 ' + PLAN.stats.doors + ' 扇 / 任务点 ' + PLAN.stats.tasks);
console.log('占用率：平均 ' + PLAN.stats.occAvg + '% · 最低 ' + PLAN.stats.occMin + '% · 最高 ' + PLAN.stats.occMax + '%');
rooms.forEach(r => console.log('  ' + r.id.padEnd(10) + r.name.padEnd(8) + ' 件 ' + String(r.stats.cover).padStart(2) +
  ' · 墙饰 ' + r.stats.wall + ' · 区 ' + r.stats.zones + ' · 占用 ' + String(r.stats.occ).padStart(5) + '%' +
  ' · 成组 ' + r.stats.cluster + ' · 层次 ' + r.stats.tiers.length + '/3'));

// =============================================================
// HTML 可视化（单文件、内嵌数据、file:// 可开）
// =============================================================
const planJson = JSON.stringify(PLAN);
const curJson = JSON.stringify({ rooms: CUR.rooms.map(r => ({ id: r.id, name: r.name, cover: r.cover, rect: r.rect, poly: r.poly, doors: r.doors })), corridors: CUR.corridors });

const html = [
'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>新返航录 · 全船掩体重构方案</title>',
'<style>html,body{margin:0;background:#0d1015}#sl-root{background:#0d1015;min-height:100vh}',
'@media(max-width:980px){#sl-root .sl-side{flex:1 1 100%!important;max-height:none!important}}</style></head><body>',
'<div id="sl-root" style="max-width:1240px;margin:0 auto;color:#d8dee8;font:13px/1.6 \'Microsoft YaHei\',\'Noto Sans CJK SC\',system-ui,sans-serif">',
'<style>',
'#sl-root *{box-sizing:border-box}',
'#sl-root .hd{padding:14px 16px 10px;border-bottom:1px solid #242b34}',
'#sl-root .t{font-size:18px;margin:0 0 3px;color:#eef3fa;font-weight:600}',
'#sl-root .sub{color:#7d8794;font-size:12px}',
'#sl-root .badge{display:inline-block;padding:1px 7px;border:1px solid #2f6d5e;border-radius:10px;color:#5ad1c0;font-size:11px;margin-left:6px}',
'#sl-root .wrap{display:flex;gap:12px;padding:12px;align-items:flex-start;flex-wrap:wrap}',
'#sl-root .cv{flex:1 1 660px;min-width:480px;background:#0a0d11;border:1px solid #242b34;border-radius:8px;overflow:hidden}',
'#sl-root .side{flex:0 0 316px;max-height:700px;overflow:auto;border:1px solid #242b34;border-radius:8px;background:#0a0d11}',
'#sl-root .ctrl{display:flex;gap:10px;flex-wrap:wrap;padding:9px 11px;border-bottom:1px solid #242b34;align-items:center}',
'#sl-root .ctrl label{display:flex;gap:4px;align-items:center;font-size:12px;cursor:pointer;color:#9aa5b1}',
'#sl-root .ctrl input{accent-color:#5ad1c0}',
'#sl-root .ctrl select,#sl-root .ctrl button{background:#141b23;color:#c8d2e0;border:1px solid #2c3542;border-radius:4px;padding:3px 7px;font:inherit;font-size:12px}',
'#sl-root svg{width:100%;height:auto;display:block}',
'#sl-root .room{fill:#141a22;stroke:#2c3542;stroke-width:.14}#sl-root .room.hi{stroke:#f0c674;stroke-width:.35}',
'#sl-root .wall{stroke:#3a4553;stroke-width:.22;fill:none}',
'#sl-root .cov{stroke:#0a0d11;stroke-width:.06}#sl-root .cov.hi{stroke:#fff;stroke-width:.18}',
'#sl-root .cur{fill:rgba(140,150,165,.22);stroke:#8b95a3;stroke-width:.12;stroke-dasharray:.5 .3}',
'#sl-root .door{stroke:#f0c674;stroke-width:.5;fill:none}',
'#sl-root .pipe{fill:none;stroke:#a896ff;stroke-width:.2}',
'#sl-root .task{fill:#fff;stroke:#e0574f;stroke-width:.22}#sl-root .task.hard{stroke:#f0c674}',
'#sl-root .tlab{font-size:1.2px;fill:#aab6c5;paint-order:stroke;stroke:#0a0d11;stroke-width:.35px}',
'#sl-root .rlab{font-size:2.1px;fill:#eef3fa;paint-order:stroke;stroke:#0a0d11;stroke-width:.55px;font-weight:600}',
'#sl-root .zlab{font-size:1.25px;fill:#7f8b9a;paint-order:stroke;stroke:#0a0d11;stroke-width:.35px;display:none!important}',
'#sl-root svg:not(.zoom) .clab{display:none}#sl-root svg.zoom .clab{display:inline}#sl-root svg.zoom .rlab{display:none}',
'#sl-root table{width:100%;border-collapse:collapse;font-size:12px}',
'#sl-root th,#sl-root td{padding:5px 7px;border-bottom:1px solid #242b34;text-align:left}',
'#sl-root th{color:#7d8794;font-weight:400;position:sticky;top:0;background:#0a0d11;z-index:1}',
'#sl-root tbody tr{cursor:pointer}#sl-root tbody tr:hover td{background:#141b23}',
'#sl-root tbody tr.on td{background:#18222c}',
'#sl-root .bar{height:6px;background:#1d2530;border-radius:3px;overflow:hidden;min-width:42px;display:inline-block;vertical-align:middle;margin-right:4px}',
'#sl-root .bar i{display:block;height:100%;background:#5ad1c0}',
'#sl-root .ok{color:#57db70}#sl-root .warn{color:#f0c674}',
'#sl-root .detail{padding:10px 12px;font-size:12px;color:#9aa5b1;line-height:1.75;border-top:1px solid #242b34}',
'#sl-root .detail b{color:#e6edf6}#sl-root .detail .k{color:#5ad1c0}',
'#sl-root .detail h4{margin:10px 0 4px;font-size:12px;color:#c8d2e0;font-weight:600}',
'#sl-root .foot{padding:10px 14px 20px;font-size:12px;color:#8d98a6;line-height:1.8;border-top:1px solid #242b34}',
'#sl-root .foot b{color:#c8d2e0}',
'#sl-root .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px 18px;margin-top:6px}',
'#sl-root .legend{display:flex;flex-wrap:wrap;gap:10px;padding:8px 11px;font-size:11px;color:#9aa5b1;border-top:1px solid #242b34}',
'#sl-root .legend i{width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:4px;vertical-align:-1px}',
'</style>',
'<div class="hd"><div class="t">新返航录 · 全船掩体重构方案 <span class="badge">方案层 v2 · 2026-11-06</span></div>',
'<div class="sub" id="meta"></div></div>',
'<div class="wrap"><div class="cv"><div class="ctrl">',
'<label><input type="checkbox" id="cCur">叠加现状</label>',
'<label><input type="checkbox" id="cZone" checked>功能分区</label>',
'<label><input type="checkbox" id="cSpine" checked>主通道</label>',
'<label><input type="checkbox" id="cDoor" checked>门厅净空</label>',
'<label><input type="checkbox" id="cWall" checked>墙面装饰</label>',
'<label><input type="checkbox" id="cTask" checked>任务点 / 管道</label>',
'<label><input type="checkbox" id="cLab" checked>标签</label>',
'<select id="focus"><option value="">全船视图</option></select>',
'</div><svg id="svg" viewBox="-2 -2 102 98"></svg>',
'<div class="legend" id="legend"></div></div>',
'<div class="side"><table><thead><tr><th>舱室</th><th>件 / 墙饰</th><th>占用</th><th>区</th><th>门净空</th></tr></thead><tbody id="rows"></tbody></table>',
'<div class="detail" id="detail"></div></div></div>',
'<div class="foot" id="foot"></div>',
'</div>',
'<script>var PLAN = ' + planJson + ';var CUR = ' + curJson + ';</script>',
'<script>',
'(function(){',
'var NS="http://www.w3.org/2000/svg",root=document.getElementById("sl-root");',
'function el(t,a,x){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(x!=null)e.textContent=x;return e}',
'function h(t,a,x){var e=document.createElement(t);for(var k in (a||{}))e.setAttribute(k,a[k]);if(x!=null)e.textContent=x;return e}',
'function id(s){return root.querySelector("#"+s)}',
'function rgb(a){return "#"+a.map(function(v){var n=Math.round(Math.max(0,Math.min(1,v))*255);return ("0"+n.toString(16)).slice(-2)}).join("")}',
'function hex(c,alpha){var r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16);return "rgba("+r+","+g+","+b+","+alpha+")"}',
'var svg=id("svg");',
'var gCorr=el("g"),gRoom=el("g"),gZone=el("g"),gSpine=el("g"),gDoor=el("g"),gCur=el("g"),gCov=el("g"),gWall=el("g"),gMark=el("g"),gLab=el("g");',
'[gCorr,gRoom,gZone,gSpine,gDoor,gCur,gCov,gWall,gMark,gLab].forEach(function(g){svg.appendChild(g)});',
'// 门厅净空斜纹',
'var defs=el("defs");var pat=el("pattern",{id:"hatch",width:"1.2",height:"1.2",patternUnits:"userSpaceOnUse",patternTransform:"rotate(45)"});',
'pat.appendChild(el("line",{x1:0,y1:0,x2:0,y2:1.2,stroke:"#e0574f","stroke-width":".28","stroke-opacity":".28"}));defs.appendChild(pat);svg.appendChild(defs);',
'id("meta").textContent="数据源 3d/preview/data/map.json（schema v2）· 1 格 ≈ 1 米 · 船体 "+PLAN.bounds.w+"×"+PLAN.bounds.h+" 格 · 方案掩体 "+PLAN.stats.cover+" 件 · 墙饰 "+PLAN.stats.wall+" 件 · 门 "+PLAN.stats.doors+" 扇 · 任务点 "+PLAN.stats.tasks+" · 平均占用 "+PLAN.stats.occAvg+"%";',
'PLAN.corridors.forEach(function(p){gCorr.appendChild(el("polyline",{points:p.map(function(q){return q.join(",")}).join(" "),stroke:"#1b232e","stroke-width":PLAN.scale.corridor_w,"stroke-linejoin":"round","stroke-linecap":"round",fill:"none"}))});',
'var COL={};',
'PLAN.rooms.forEach(function(r){COL[r.id]=rgb((r.theme&&r.theme.mark)||[.6,.7,.8]);',
' var p=el("polygon",{points:r.poly.map(function(q){return q.join(",")}).join(" "),"class":"room"});p.dataset.room=r.id;gRoom.appendChild(p);',
' r.zones.forEach(function(z){',
'  gZone.appendChild(el("rect",{x:z.rect[0],y:z.rect[1],width:z.rect[2],height:z.rect[3],fill:hex(COL[r.id],.055),stroke:hex(COL[r.id],.35),"stroke-width":".1","stroke-dasharray":".5 .35"}));',
'  gZone.appendChild(el("text",{x:z.rect[0]+.5,y:z.rect[1]+1.25,"class":"zlab clab"},z.name));',
' });',
' r.spines.forEach(function(s){gSpine.appendChild(el("rect",{x:s[0],y:s[1],width:s[2],height:s[3],fill:"rgba(90,209,192,.09)",stroke:"rgba(90,209,192,.35)","stroke-width":".1","stroke-dasharray":".35 .3"}))});',
' r.doors.forEach(function(d){var x0=r.rect[0],y0=r.rect[1],w=r.rect[2],hh=r.rect[3],c=d[1],hw=PLAN.rules.door.halfWidth,dep=PLAN.rules.door.depth;',
'  var q=d[0]==="t"?[c-hw,y0,hw*2,dep]:d[0]==="b"?[c-hw,y0+hh-dep,hw*2,dep]:d[0]==="l"?[x0,c-hw,dep,hw*2]:[x0+w-dep,c-hw,dep,hw*2];',
'  gDoor.appendChild(el("rect",{x:q[0],y:q[1],width:q[2],height:q[3],fill:"url(#hatch)",stroke:"#e0574f","stroke-width":".09","stroke-opacity":".4"}));',
'  var a,b;if(d[0]==="t"){a=[c-.9,y0];b=[c+.9,y0]}else if(d[0]==="b"){a=[c-.9,y0+hh];b=[c+.9,y0+hh]}else if(d[0]==="l"){a=[x0,c-.9];b=[x0,c+.9]}else{a=[x0+w,c-.9];b=[x0+w,c+.9]}',
'  gMark.appendChild(el("line",{x1:a[0],y1:a[1],x2:b[0],y2:b[1],"class":"door"}));',
' });',
' r.items.forEach(function(it){',
'  var alpha=it.tier==="anchor"?.92:it.tier==="mid"?.68:.42;',
'  var rc=el("rect",{x:it.x,y:it.y,width:it.w,height:it.h,fill:hex(COL[r.id],alpha),"class":"cov"});rc.dataset.room=r.id;',
'  rc.appendChild(el("title",{},it.label+" · "+it.asset));gCov.appendChild(rc);',
'  if(it.w>=2.2&&it.h>=1.2)gLab.appendChild(el("text",{x:it.x+it.w/2,y:it.y+it.h/2+.4,"class":"tlab clab","text-anchor":"middle"},it.label));',
' });',
' r.walls.forEach(function(w){var rc=el("rect",{x:w.x,y:w.y,width:w.w,height:w.h,fill:COL[r.id],"fill-opacity":.95,stroke:"#0a0d11","stroke-width":.06});',
'  rc.appendChild(el("title",{},w.label+" · "+w.asset));gWall.appendChild(rc)});',
' r.pipes.forEach(function(p){gMark.appendChild(el("circle",{cx:p.x,cy:p.y,r:.9,"class":"pipe"}));gMark.appendChild(el("circle",{cx:p.x,cy:p.y,r:.22,fill:"#a896ff"}))});',
' r.tasks.forEach(function(t){gMark.appendChild(el("circle",{cx:t.x,cy:t.y,r:.5,"class":"task"+(t.hard?" hard":"")}));',
'  var tx=el("text",{x:t.x+.9,y:t.y+.45,"class":"tlab clab"},t.label);gLab.appendChild(tx)});',
' gLab.appendChild(el("text",{x:r.rect[0]+r.rect[2]/2,y:r.rect[1]+r.rect[3]/2,"class":"rlab","text-anchor":"middle"},r.name));',
'});',
'// 现状层（默认关）',
'CUR.rooms.forEach(function(r){r.cover.forEach(function(c){var q=el("rect",{x:c.x,y:c.y,width:c.w,height:c.h,"class":"cur"});q.appendChild(el("title",{},r.name+" 现状："+c.label));gCur.appendChild(q)})});',
'gCur.style.display="none";',
'// 右侧表格',
'var rows=id("rows");',
'PLAN.rooms.forEach(function(r){var tr=h("tr");tr.dataset.room=r.id;',
' tr.innerHTML="<td>"+r.name+"</td><td>"+r.stats.cover+" / "+r.stats.wall+"</td><td><span class=\\"bar\\"><i style=\\"width:"+Math.min(100,r.stats.occ*3)+"%\\"></i></span>"+r.stats.occ+"%</td><td>"+r.stats.zones+"</td><td class=\\"ok\\">✓ "+r.stats.doors+"</td>";',
' tr.onmouseenter=function(){hi(r.id)};tr.onmouseleave=function(){hi(null)};tr.onclick=function(){show(r.id,tr)};rows.appendChild(tr);',
' var op=h("option",{value:r.id},r.name);id("focus").appendChild(op);',
'});',
'function hi(rid){[].forEach.call(svg.querySelectorAll(".room,.cov"),function(e){if(rid)e.classList.toggle("hi",e.dataset.room===rid);else e.classList.remove("hi")})}',
'function show(rid,tr){[].forEach.call(rows.children,function(x){x.classList.toggle("on",x.dataset.room===rid)});',
' var r=PLAN.rooms.filter(function(x){return x.id===rid})[0],c=COL[rid];',
' var s="<b>"+r.name+"</b> · "+r.rect[2]+"×"+r.rect[3]+" 格 · 掩体 "+r.stats.cover+" 件 / 墙饰 "+r.stats.wall+" 件 · 占用 <span class=\\"k\\">"+r.stats.occ+"%</span> · 分区 "+r.stats.zones+" 个 · 成组率 "+r.stats.cluster+"<br>";',
' s+="<b>风格</b>："+r.style.palette+"；"+r.style.mood+"；题材 "+r.style.motif+"<br><br>";',
' s+="<h4>排布思路</h4>"+r.design+"<br>";',
' s+="<h4>功能分区</h4>";r.zones.forEach(function(z){s+="<span class=\\"k\\">"+z.id+" "+z.name+"</span> · "+z.role+"<br>"});',
' s+="<h4>掩体（按分区聚组）</h4>";r.zones.forEach(function(z){var its=r.items.filter(function(i){return i.zone===z.id});',
'  if(!its.length)return;s+=z.id+"："+its.map(function(i){return i.label+"×"+its.filter(function(q){return q.kind===i.kind}).length}).filter(function(v,i,a){return a.indexOf(v)===i}).join("、")+"<br>"});',
' s+="<h4>墙面装饰（"+r.walls.length+" 件 · 房间专属素材）</h4>"+r.walls.map(function(w){return w.label}).join("、")+"<br>";',
' s+="<h4>SDXL 提示词方向</h4><span style=\\"color:#7d8794\\">"+r.sdxl.prompt+"</span><br>seed "+r.sdxl.seed+" · 输出 "+r.sdxl.out+"<br>";',
' s+="<h4>主通道 / 门厅净空</h4>"+r.stats.doors+" 扇门各留 ±"+PLAN.rules.door.halfWidth+" × "+PLAN.rules.door.depth+" 格净空，"+r.spines.length+" 条主通道带（宽 "+PLAN.rules.spineWidth+" 格）贯穿。";',
' id("detail").innerHTML=s;',
'}',
'// 图层开关',
'[["cCur",gCur,true],["cZone",gZone],["cSpine",gSpine],["cDoor",gDoor],["cWall",gWall],["cTask",gMark],["cLab",gLab]].forEach(function(p){',
' id(p[0]).onchange=function(e){var on=p[2]?!e.target.checked:e.target.checked;p[1].style.display=on?"":"none"}});',
'id("focus").onchange=function(e){var rid=e.target.value;svg.classList.toggle("zoom",!!rid);',
' if(!rid){svg.setAttribute("viewBox","-2 -2 "+(PLAN.bounds.w+4)+" "+(PLAN.bounds.h+4));return}',
' var r=PLAN.rooms.filter(function(x){return x.id===rid})[0];',
' svg.setAttribute("viewBox",(r.rect[0]-3)+" "+(r.rect[1]-3)+" "+(r.rect[2]+6)+" "+(r.rect[3]+6));',
' show(rid,null)};',
'// 图例',
'var lg=id("legend");',
'[["分区底色","rgba(90,209,192,.15)"],["主通道","rgba(90,209,192,.4)"],["门厅净空（禁放）","rgba(224,87,79,.5)"],["anchor 大件","#5ad1c0"],["mid 中件","rgba(90,209,192,.55)"],["accent 配件","rgba(90,209,192,.3)"],["墙面装饰","#f0c674"],["现状（叠加）","rgba(140,150,165,.4)"]].forEach(function(p){',
' var s=h("span");s.innerHTML="<i style=\\"background:"+p[1]+"\\"></i>"+p[0];lg.appendChild(s)});',
'// 页脚：规则 + 工作流',
'var f="<b>七条裁定 → 八条可校验规则</b><div class=\\"grid\\">";',
'PLAN.rules.decisions.forEach(function(d,i){f+="<div>R"+(i+1)+" · "+d+"</div>"});f+="</div>";',
'f+="<br><b>素材唯一性</b>：kind / asset / 提示词 / seed / 贴图目录全部房间专属；共 "+PLAN.stats.kinds+" 类掩体、"+PLAN.stats.wall+" 件墙饰，跨舱室零引用。<br>";',
'f+="<b>初步工作流</b>："+PLAN.workflow.title+" → " + PLAN.workflow.steps.map(function(s){return s.n+"." + s.name}).join(" → ")+"；";',
'f+="命令与参数见 <b>3d/WORKFLOW_SDXL_BLENDER.md</b> 与 <b>tools/ship-layout-plan.md</b>。<br>";',
'f+="<span style=\\"color:#7d8794\\">边界：本文件是方案层预览，未改动 js/data/map.js 与 3d/preview/data/map.json；校验读数见 tools/ship-layout-report.md（node tools/ship-layout-check.cjs）。</span>";',
'id("foot").innerHTML=f;',
'show("fun",null);',
'})();',
'</script></body></html>'
].join('\n');
fs.writeFileSync(path.join(ROOT, 'tools/ship-layout-overview.html'), html, 'utf8');
console.log('已写出 ship-layout-plan.json 与 ship-layout-overview.html');
