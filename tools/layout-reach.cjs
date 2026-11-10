/* 布局通行体检 / 修复：裂缝、双通路、中心卡脚
 * ------------------------------------------------------------
 * 用户 2026-11-07 三条口径：
 *   1. 地图不要出现「过不去的裂缝」——全局可行走网格必须只有一个连通分量；
 *   2. 一个房间之内，除角落外，物品之间至少保证两处通路——非角落区域不能有割点；
 *   3. 中心太撑，到了中心之后很多卡脚的地方——房间 label 周围要有足够可走采样点。
 *
 * 网格口径与 js/engine/geo.js 完全一致：GS=0.6、掩体四周外扩 0.12、墙线 0.36。
 * 本工具只微调 cover 的 x/y（不动 w/h/kind/label/zone/tier，不动任何几何与规则），
 * 并把结果统一回写 4 份数据，避免「方案层 / 2.5D / 3D」三处漂移。
 *
 * 用法：
 *   node tools/layout-reach.cjs              诊断（写 tools/layout-reach-report.md）
 *   node tools/layout-reach.cjs --json       只输出诊断 JSON
 *   node tools/layout-reach.cjs --check      严格校验，不达标退出码 1
 *   node tools/layout-reach.cjs --fix        自动微调并回写（先备份到 tools/_bak/）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAP_JS = path.join(ROOT, 'js', 'data', 'map.js');
const PLAN_JSON = path.join(ROOT, 'tools', 'ship-layout-plan.json');
const V2_JSON = path.join(ROOT, '3d', 'preview', 'data', 'map_v2.json');
const LAYOUT_JSON = path.join(ROOT, '3d', 'preview', 'data', 'layout-v2.json');
const REPORT = path.join(ROOT, 'tools', 'layout-reach-report.md');

global.window = global;
require(path.join(ROOT, 'js', 'data', 'map.js'));
const M = window.SKMapData;
const GS = 0.6;
const GW = Math.ceil(M.bounds.w / GS);
const GH = Math.ceil(M.bounds.h / GS);
const CELLS = GW * GH;

const PLAN = JSON.parse(fs.readFileSync(PLAN_JSON, 'utf8'));
const RULES = PLAN.rules;
const roomById = Object.fromEntries(M.rooms.map(r => [r.id, r]));
const planRoomById = Object.fromEntries(PLAN.rooms.map(r => [r.id, r]));

// ---------- 与 geo.js 同口径的几何 ----------
function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function d2seg(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
function inCorr(x, y) {
  const CW = M.scale.corridor_w;
  for (const c of M.corridors) for (let i = 0; i < c.pts.length - 1; i++) {
    const a = c.pts[i], b = c.pts[i + 1];
    if (d2seg(x, y, a[0], a[1], b[0], b[1]) <= CW / 2) return true;
  }
  return false;
}
const roomPolys = M.rooms.map(r => r.poly);
const covRects = covers => covers.map(c => [c.x - .12, c.y - .12, c.x + c.w + .12, c.y + c.h + .12]);
function cellWalkable(gx, gy, cov) {
  const x = (gx + .5) * GS, y = (gy + .5) * GS;
  let ok = false;
  for (const poly of roomPolys) if (inPoly(x, y, poly)) { ok = true; break; }
  if (!ok && inCorr(x, y)) ok = true;
  if (ok) for (const c of cov) if (x > c[0] && x < c[2] && y > c[1] && y < c[3]) { ok = false; break; }
  if (ok) for (const w of M.walls) if (d2seg(x, y, w[0][0], w[0][1], w[1][0], w[1][1]) < .36) { ok = false; break; }
  return ok;
}
function buildWalk(covers) {
  const cov = covRects(covers);
  const walk = new Uint8Array(CELLS);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++)
    walk[gy * GW + gx] = cellWalkable(gx, gy, cov) ? 1 : 0;
  return walk;
}
/** 只重算被移动掩体影响的两块区域，供贪心搜索高频调用。 */
function patchedWalk(walk, covers, oldC, newC) {
  const w = Uint8Array.from(walk);
  const cov = covRects(covers);
  const regions = [oldC, newC].map(c => {
    const gx0 = Math.max(0, Math.floor((c.x - 1.2) / GS));
    const gy0 = Math.max(0, Math.floor((c.y - 1.2) / GS));
    const gx1 = Math.min(GW - 1, Math.ceil((c.x + c.w + 1.2) / GS));
    const gy1 = Math.min(GH - 1, Math.ceil((c.y + c.h + 1.2) / GS));
    return [gx0, gy0, gx1, gy1];
  });
  for (const [gx0, gy0, gx1, gy1] of regions)
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++)
      w[gy * GW + gx] = cellWalkable(gx, gy, cov) ? 1 : 0;
  return w;
}
const freeAt = (walk, x, y) => {
  const gx = Math.floor(x / GS), gy = Math.floor(y / GS);
  return gx >= 0 && gy >= 0 && gx < GW && gy < GH && walk[gy * GW + gx] === 1;
};

// ---------- 连通分量 / 割点 ----------
function components(walk) {
  const seen = new Uint8Array(CELLS), out = [];
  for (let i = 0; i < CELLS; i++) {
    if (!walk[i] || seen[i]) continue;
    const q = [i]; seen[i] = 1; const cells = [];
    while (q.length) {
      const k = q.pop(); cells.push(k);
      const gx = k % GW, gy = (k - gx) / GW;
      const nb = [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const nk = ny * GW + nx;
        if (seen[nk] || !walk[nk]) continue;
        seen[nk] = 1; q.push(nk);
      }
    }
    out.push(cells);
  }
  return out.sort((a, b) => b.length - a.length);
}
/** Tarjan：返回该格集的割点集合（顶点不相交双路径的反面）。 */
/* 用定长数组代替 Map：修复搜索要跑上万次诊断，Map 的哈希开销是主要瓶颈。 */
const _disc = new Int32Array(CELLS), _low = new Int32Array(CELLS);
const _parent = new Int32Array(CELLS), _apArr = new Uint8Array(CELLS);
function articulationPoints(cellSet) {
  _disc.fill(0); _parent.fill(-2); _apArr.fill(0);
  const ap = new Set();
  let time = 0;
  const neigh = u => {
    const gx = u % GW, gy = (u - gx) / GW, out = [];
    if (gx + 1 < GW) out.push(u + 1);
    if (gx - 1 >= 0) out.push(u - 1);
    if (gy + 1 < GH) out.push(u + GW);
    if (gy - 1 >= 0) out.push(u - GW);
    return out;
  };
  function dfs(u) {
    _disc[u] = ++time; _low[u] = time;
    let children = 0;
    for (const v of neigh(u)) {
      if (!cellSet.has(v)) continue;
      if (!_disc[v]) {
        children++; _parent[v] = u; dfs(v);
        _low[u] = Math.min(_low[u], _low[v]);
        const isRoot = _parent[u] === -1;
        if ((isRoot && children > 1) || (!isRoot && _low[v] >= _disc[u])) { _apArr[u] = 1; ap.add(u); }
      } else if (v !== _parent[u]) {
        _low[u] = Math.min(_low[u], _disc[v]);
      }
    }
  }
  for (const u of cellSet) if (!_disc[u]) { _parent[u] = -1; dfs(u); }
  return ap;
}
/* 「除了角落」按房间边缘带理解：贴墙一圈内的单格窄道不算房间内通路不足，
 * 只要求房间核心区（家具之间）不存在割点，即任意两点之间至少有两条不相交通路。
 * 边缘距离按**房间多边形**算，不用外接矩形：本船房间是八边形切角，
 * 用 rect 会把切角附近的贴边窄道误判成「房间核心区只有一条路」。 */
const EDGE_BAND = 2.6;
let _edgeDist = null;
function edgeDistance() {
  if (_edgeDist) return _edgeDist;
  const cr = cellRoomIndex(), arr = new Float32Array(CELLS).fill(Infinity);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const k = gy * GW + gx, ri = cr[k];
    if (ri < 0) continue;
    const x = (gx + .5) * GS, y = (gy + .5) * GS, poly = M.rooms[ri].poly;
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      best = Math.min(best, d2seg(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
    arr[k] = best;
  }
  _edgeDist = arr;
  return arr;
}
function isCorner(room, gx, gy) {
  return edgeDistance()[gy * GW + gx] < EDGE_BAND;
}
/* 「中心太撑」按房间核心区（去掉贴墙 2.5 格边缘带）的可走率衡量：
 * 中心摆大件 anchor 是设计（bridge 圆桌、ecosys 巨树），不该要求中心那个点能站人；
 * 但核心区整体不能被家具撑满，否则玩家走到中间只能在夹缝里挪、到处卡脚。 */
function centerRatio(room, ri, walk) {
  const cr = cellRoomIndex();
  let ok = 0, total = 0;
  for (let k = 0; k < CELLS; k++) {
    if (cr[k] !== ri) continue;
    const gx = k % GW, gy = (k - gx) / GW;
    if (isCorner(room, gx, gy)) continue;
    total++;
    if (walk[k]) ok++;
  }
  return total ? +(ok / total).toFixed(3) : 1;
}
/* 每格属于哪间房，只算一次，供高频 diagnose 复用（原来每房都要全图 inPoly）。 */
let _cellRoom = null;
function cellRoomIndex() {
  if (_cellRoom) return _cellRoom;
  const arr = new Int16Array(CELLS).fill(-1);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = (gx + .5) * GS, y = (gy + .5) * GS;
    for (let ri = 0; ri < M.rooms.length; ri++)
      if (inPoly(x, y, M.rooms[ri].poly)) { arr[gy * GW + gx] = ri; break; }
  }
  _cellRoom = arr;
  return arr;
}
/** 一次遍历得到 10 间房各自的可走格集（只取主连通块内的格）。 */
function allRoomCells(walk, compOf) {
  const cr = cellRoomIndex(), sets = M.rooms.map(() => new Set());
  for (let k = 0; k < CELLS; k++)
    if (walk[k] && cr[k] >= 0 && compOf[k] === 0) sets[cr[k]].add(k);
  return sets;
}

// ---------- 诊断 ----------
const CENTER_MIN = 0.45;   // 核心区可走率下限：中心可以摆 anchor，但不能撑满
function diagnose(covers, givenWalk) {
  const walk = givenWalk || buildWalk(covers);
  const comps = components(walk);
  const compOf = new Int16Array(CELLS).fill(-1);
  comps.forEach((cells, ci) => cells.forEach(k => { compOf[k] = ci; }));
  const islands = comps.slice(1).map(cells => {
    let sx = 0, sy = 0;
    for (const k of cells) { sx += (k % GW + .5) * GS; sy += ((k - k % GW) / GW + .5) * GS; }
    const cx = sx / cells.length, cy = sy / cells.length;
    const r = M.rooms.find(rr => inPoly(cx, cy, rr.poly));
    return { size: cells.length, x: +cx.toFixed(1), y: +cy.toFixed(1), room: r ? r.id : 'corridor' };
  });
  const roomSets = allRoomCells(walk, compOf);
  const rooms = M.rooms.map((room, ri) => {
    const cells = roomSets[ri];
    const ap = articulationPoints(cells);
    let articNonCorner = 0;
    const samples = [];
    for (const k of ap) {
      const gx = k % GW, gy = (k - gx) / GW;
      if (!isCorner(room, gx, gy)) { articNonCorner++; if (samples.length < 10) samples.push([+((gx + .5) * GS).toFixed(1), +((gy + .5) * GS).toFixed(1)]); }
    }
    const cr = centerRatio(room, ri, walk);
    return { id: room.id, cells: cells.size, articNonCorner, articSamples: samples, centerRatio: cr };
  });
  const failedRooms = rooms.filter(r => r.articNonCorner > 0 || r.centerRatio < CENTER_MIN);
  const islandCells = islands.reduce((s, i) => s + i.size, 0);
  const centerDeficit = rooms.reduce((s, r) => s + Math.max(0, CENTER_MIN - r.centerRatio), 0);
  const articTotal = rooms.reduce((s, r) => s + r.articNonCorner, 0);
  const score = islands.length * 500 + islandCells * 20 + articTotal * 40 + centerDeficit * 400;
  const ok = islands.length === 0 && articTotal === 0 && failedRooms.length === 0;
  return { walk, comps: comps.length, totalCells: comps.reduce((s, c) => s + c.length, 0), islands, rooms, articTotal, centerDeficit, score, ok };
}

// ---------- 硬约束（移动不得破坏 R1/R2/R3/R4） ----------
const rectOf = c => ({ x: c.x, y: c.y, w: c.w, h: c.h });
const overlap = (a, b, eps = 0.02) =>
  a.x < b.x + b.w - eps && a.x + a.w > b.x + eps && a.y < b.y + b.h - eps && a.y + a.h > b.y + eps;
const dRect = (a, b) => Math.hypot(
  Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w),
  Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h));
function doorRects(room) {
  const [x0, y0, w, h] = room.rect, hw = RULES.door.halfWidth, dep = RULES.door.depth;
  return room.doors.map(d => d[0] === 't' ? { x: d[1] - hw, y: y0, w: hw * 2, h: dep }
    : d[0] === 'b' ? { x: d[1] - hw, y: y0 + h - dep, w: hw * 2, h: dep }
      : d[0] === 'l' ? { x: x0, y: d[1] - hw, w: dep, h: hw * 2 }
        : { x: x0 + w - dep, y: d[1] - hw, w: dep, h: hw * 2 });
}
function outsideCorners(c, room) {
  const pts = [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]];
  return pts.filter(p => !inPoly(p[0] - .03, p[1] - .03, room.poly) && !inPoly(p[0] + .03, p[1] + .03, room.poly)).length;
}
function legal(covers, idx, nx, ny) {
  const c = covers[idx], room = roomById[c.room], pr = planRoomById[c.room];
  if (!room) return false;
  const nc = { ...c, x: nx, y: ny }, nr = rectOf(nc);
  /* 配电室电闸目击走廊：test-v3.cjs:1865-1868 把目击者硬编码在 x=51 / y=53~55，
   * 只有这一小条站位能 aiCanSee 到闸杆。挪动区内掩体会让「拉闸确证 / 合闸信任」
   * 与目击认错遥测共 7 条断言连锁失败（A/B 实测 849/0 → 842/7）。
   * 列为禁改区：区内掩体不许移走，区外掩体也不许移进来。 */
  const BZ = { x: 49, y: 52, w: 4, h: 4 };
  const inZone = r => r.x < BZ.x + BZ.w && r.x + r.w > BZ.x && r.y < BZ.y + BZ.h && r.y + r.h > BZ.y;
  if (c.room === 'power' && (inZone(rectOf(c)) || inZone(nr))) return false;
  /* R3（与 ship-layout-check.cjs:97-104 完全同口径）：四角 + 中心必须严格落在
   * 房间多边形内；互不重叠用 eps=-0.001（比 0 更严），不能只看「出界角数不增加」。 */
  const pts = [[nc.x, nc.y], [nc.x + nc.w, nc.y], [nc.x, nc.y + nc.h],
    [nc.x + nc.w, nc.y + nc.h], [nc.x + nc.w / 2, nc.y + nc.h / 2]];
  if (!pts.every(p => inPoly(p[0], p[1], room.poly))) return false;
  for (let j = 0; j < covers.length; j++) {
    if (j === idx || covers[j].room !== c.room) continue;
    const q = rectOf(covers[j]);
    if (nr.x < q.x + q.w + .001 && nr.x + nr.w > q.x - .001 &&
      nr.y < q.y + q.h + .001 && nr.y + nr.h > q.y - .001) return false;
  }
  if (pr) {
    if (doorRects(room).some(d => overlap(nr, d))) return false;
    if (pr.spines.some(s => overlap(nr, { x: s[0], y: s[1], w: s[2], h: s[3] }))) return false;
    if (pr.pipes.some(p => overlap(nr, { x: p.x - RULES.pipeClear, y: p.y - RULES.pipeClear, w: RULES.pipeClear * 2, h: RULES.pipeClear * 2 }))) return false;
    for (const t of pr.tasks || [])
      if (nr.x - .12 <= t.x && t.x <= nr.x + nr.w + .12 && nr.y - .12 <= t.y && t.y <= nr.y + nr.h + .12) return false;
  }
  for (const p of M.points) if (p.room === c.room && nr.x - .15 < p.x && p.x < nr.x + nr.w + .15 && nr.y - .15 < p.y && p.y < nr.y + nr.h + .15) return false;
  for (const f of M.facility) if (f.room === c.room && nr.x - .2 < f.x && f.x < nr.x + nr.w + .2 && nr.y - .2 < f.y && f.y < nr.y + nr.h + .2) return false;
  for (const p of M.pipes) if (p.room === c.room && nr.x - .2 < p.x && p.x < nr.x + nr.w + .2 && nr.y - .2 < p.y && p.y < nr.y + nr.h + .2) return false;
  // R4：本房任务点 2.5 格内仍要有道具
  const trial = covers.slice(); trial[idx] = nc;
  for (const p of M.points) if (p.room === c.room) {
    let hit = false;
    for (const q of trial) if (q.room === c.room && dRect(rectOf(q), { x: p.x, y: p.y, w: 0, h: 0 }) <= RULES.taskReach) { hit = true; break; }
    if (!hit) return false;
  }
  return true;
}

// ---------- 贪心修复 ----------
const OFFSETS = [];
for (const step of [0.6, 1.2, 1.8, 2.4, 3.0]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]])
  OFFSETS.push([+(dx * step).toFixed(2), +(dy * step).toFixed(2)]);
function problemCovers(covers, d) {
  const hot = [];
  for (const is of d.islands) hot.push({ room: is.room, x: is.x, y: is.y, rad: 4 });
  for (const r of d.rooms) {
    const room = roomById[r.id];
    if (!room) continue;
    if (r.centerRatio < CENTER_MIN) hot.push({ room: r.id, x: room.label[0], y: room.label[1], rad: 4.5 });
    for (const s of r.articSamples) hot.push({ room: r.id, x: s[0], y: s[1], rad: 2.5 });
  }
  const scored = [];
  covers.forEach((c, i) => {
    let best = Infinity;
    for (const h of hot) {
      if (h.room !== c.room) continue;
      const dx = Math.max(0, Math.abs((c.x + c.w / 2) - h.x) - c.w / 2);
      const dy = Math.max(0, Math.abs((c.y + c.h / 2) - h.y) - c.h / 2);
      const d2 = Math.hypot(dx, dy) - h.rad;
      if (d2 < best) best = d2;
    }
    if (best < Infinity) scored.push([i, best]);
  });
  scored.sort((a, b) => a[1] - b[1]);
  // 每间有问题的房间至少保留 2 件候选，避免候选被前一间房吃光
  const picked = [], perRoom = {};
  for (const [i] of scored) {
    const rid = covers[i].room;
    if ((perRoom[rid] || 0) >= 4) continue;
    perRoom[rid] = (perRoom[rid] || 0) + 1;
    picked.push(i);
    if (picked.length >= 16) break;
  }
  return picked;
}
function repair(covers, maxRounds = 40) {
  let cur = covers.map(c => ({ ...c }));
  let walk = buildWalk(cur);
  let d = diagnose(cur, walk);
  const changes = [];
  for (let round = 0; round < maxRounds && !d.ok; round++) {
    const cand = problemCovers(cur, d);
    let best = null;
    for (const idx of cand) {
      const c = cur[idx];
      for (const [dx, dy] of OFFSETS) {
        const nx = +(c.x + dx).toFixed(2), ny = +(c.y + dy).toFixed(2);
        if (nx < 0 || ny < 0) continue;
        const trial = cur.slice(); trial[idx] = { ...c, x: nx, y: ny };
        if (!legal(trial, idx, nx, ny)) continue;
        const w2 = patchedWalk(walk, trial, c, trial[idx]);
        const d2 = diagnose(trial, w2);
        const s = d2.score + 0.5 * Math.hypot(dx, dy);
        if (s < d.score - 1e-6 && (!best || s < best.s)) best = { idx, nx, ny, walk: w2, diag: d2, s };
      }
    }
    if (!best) break;
    const old = { ...cur[best.idx] };
    cur[best.idx] = { ...cur[best.idx], x: best.nx, y: best.ny };
    walk = best.walk; d = best.diag;
    changes.push({ room: old.room, label: old.label, from: [old.x, old.y], to: [best.nx, best.ny], score: +d.score.toFixed(1) });
  }
  return { covers: cur, changes, diag: d };
}

// ---------- 回写 ----------
const keyOf = c => [c.room, c.kind, c.label, (+c.x).toFixed(2), (+c.y).toFixed(2)].join('|');
function writeBack(before, after) {
  const map = new Map();
  before.forEach((c, i) => {
    const a = after[i];
    if (a.x !== c.x || a.y !== c.y) map.set(keyOf(c), [a.x, a.y]);
  });
  if (!map.size) return { changed: 0, files: [] };
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const bak = path.join(ROOT, 'tools', '_bak', 'layout-' + stamp);
  fs.mkdirSync(bak, { recursive: true });
  const targets = [MAP_JS, PLAN_JSON, V2_JSON, LAYOUT_JSON].filter(p => fs.existsSync(p));
  targets.forEach(p => fs.copyFileSync(p, path.join(bak, path.basename(p))));

  // 1) js/data/map.js：保留头注释与 IIFE 尾，只替换 SKMapData.cover
  const src = fs.readFileSync(MAP_JS, 'utf8');
  const win = {}; new Function('window', src)(win);
  const data = win.SKMapData;
  let n = 0;
  data.cover = data.cover.map(c => {
    const hit = map.get(keyOf(c));
    if (!hit) return c;
    n++; return { ...c, x: hit[0], y: hit[1] };
  });
  const head = src.slice(0, src.indexOf('  global.SKMapData = '));
  const tail = '})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(MAP_JS, head + '  global.SKMapData = ' + JSON.stringify(data) + ';\n' + tail, 'utf8');

  const patchArr = arr => arr.map(c => {
    const hit = map.get(keyOf(c));
    return hit ? { ...c, x: hit[0], y: hit[1] } : c;
  });
  // 2) 方案层 items
  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, 'utf8'));
  plan.rooms.forEach(r => { r.items = patchArr(r.items); });
  fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 1), 'utf8');
  // 3) 3D 主场景
  const v2 = JSON.parse(fs.readFileSync(V2_JSON, 'utf8'));
  v2.cover = patchArr(v2.cover);
  fs.writeFileSync(V2_JSON, JSON.stringify(v2, null, 2), 'utf8');
  // 4) 场景布局导出（若有 cover）
  if (fs.existsSync(LAYOUT_JSON)) {
    const lv = JSON.parse(fs.readFileSync(LAYOUT_JSON, 'utf8'));
    if (Array.isArray(lv.cover)) { lv.cover = patchArr(lv.cover); fs.writeFileSync(LAYOUT_JSON, JSON.stringify(lv, null, 2), 'utf8'); }
  }
  return { changed: n, files: targets.map(p => path.relative(ROOT, p)), backup: path.relative(ROOT, bak) };
}

// ---------- 报告 ----------
function report(d, changes, writeInfo) {
  let md = '# 布局通行体检 · 裂缝 / 双通路 / 中心卡脚\n\n';
  md += '> 生成：`node tools/layout-reach.cjs` · 口径 `GS=0.6` / 掩体外扩 `0.12` / 墙线 `0.36`，与 `js/engine/geo.js` 一致。\n';
  md += '> 判据：全局连通分量 = 1（无过不去的裂缝）；房间核心区（去贴墙 2.5 格）无割点 = 物品间至少两处通路；核心区可走率 ≥ ' + CENTER_MIN * 100 + '%（中心不卡脚）。\n\n';
  md += '## 结论\n\n' + (d.ok ? '**全绿**' : '**未达标**') + ' · 连通分量 ' + d.comps + ' · 孤岛 ' + d.islands.length +
    ' 处 · 非角落割点 ' + d.articTotal + ' 处 · 中心缺口 ' + d.centerDeficit.toFixed(2) + '\n\n';
  md += '| 舱室 | 可走格 | 非角落割点 | 中心可走率 |\n|---|---:|---:|---:|\n';
  d.rooms.forEach(r => md += '| ' + r.id + ' | ' + r.cells + ' | ' + r.articNonCorner + ' | ' + (r.centerRatio * 100).toFixed(1) + '% |\n');
  if (d.islands.length) {
    md += '\n## 孤立可走块（过不去的裂缝）\n\n';
    d.islands.forEach(i => md += '- `' + i.room + '` 中心 (' + i.x + ', ' + i.y + ') · ' + i.size + ' 格\n');
  }
  if (changes && changes.length) {
    md += '\n## 本轮微调（只改 x/y，几何与规则不动）\n\n';
    changes.forEach(c => md += '- `' + c.room + '` ' + c.label + '：(' + c.from.join(', ') + ') → (' + c.to.join(', ') + ') · 剩余罚分 ' + c.score + '\n');
  }
  if (writeInfo && writeInfo.changed) {
    md += '\n## 回写\n\n同步 ' + writeInfo.changed + ' 件到：' + writeInfo.files.join('、') + '；备份 `' + writeInfo.backup + '`。\n';
  }
  md += '\n> 若重跑 `tools/ship-layout-build.cjs` 会从 spec 重新生成坐标，需再执行一次 `--fix`；`ship-layout-check.cjs` 的 R9/R10/R11 会挡住回退。\n';
  return md;
}

// ---------- CLI / 模块导出 ----------
module.exports = { diagnose, repair, buildWalk, freeAt, CENTER_MIN, GS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const before = M.cover.map(c => ({ ...c }));
  const d = diagnose(before);
  if (args.includes('--json')) { console.log(JSON.stringify({ ...d, walk: undefined }, null, 2)); process.exit(0); }
  if (args.includes('--check')) {
    console.log('连通分量 ' + d.comps + ' · 孤岛 ' + d.islands.length + ' · 非角落割点 ' + d.articTotal +
      ' · 中心缺口 ' + d.centerDeficit.toFixed(2));
    if (!d.ok) { d.rooms.filter(r => r.articNonCorner || r.centerRatio < CENTER_MIN).forEach(r => console.log('  FAIL ' + r.id + ' 割点 ' + r.articNonCorner + ' 中心 ' + (r.centerRatio * 100).toFixed(1) + '%')); process.exit(1); }
    console.log('通行体检通过'); process.exit(0);
  }
  if (args.includes('--fix')) {
    const r = repair(before);
    const info = writeBack(before, r.covers);
    fs.writeFileSync(REPORT, report(r.diag, r.changes, info), 'utf8');
    console.log('修复：' + r.changes.length + ' 次微调 · 回写 ' + info.changed + ' 件 · 结果 ' + (r.diag.ok ? '全绿' : '仍未达标'));
    console.log('连通分量 ' + r.diag.comps + ' · 孤岛 ' + r.diag.islands.length + ' · 非角落割点 ' + r.diag.articTotal + ' · 中心缺口 ' + r.diag.centerDeficit.toFixed(2));
    r.changes.forEach(c => console.log('  · ' + c.room + ' / ' + c.label + ' (' + c.from.join(',') + ') → (' + c.to.join(',') + ')'));
    if (info.backup) console.log('备份：' + info.backup);
    console.log('报告：tools/layout-reach-report.md');
    process.exit(r.diag.ok ? 0 : 2);
  }
  fs.writeFileSync(REPORT, report(d), 'utf8');
  console.log('连通分量 ' + d.comps + ' · 可走格 ' + d.totalCells + ' · 孤岛 ' + d.islands.length +
    ' · 非角落割点 ' + d.articTotal + ' · 中心缺口 ' + d.centerDeficit.toFixed(2) + (d.ok ? ' · 全绿' : ' · 未达标'));
  d.islands.forEach(i => console.log('  孤岛 ' + i.room + ' (' + i.x + ',' + i.y + ') ' + i.size + ' 格'));
  d.rooms.forEach(r => { if (r.articNonCorner || r.centerRatio < CENTER_MIN) console.log('  ' + r.id + ' 割点 ' + r.articNonCorner + ' 中心 ' + (r.centerRatio * 100).toFixed(1) + '%'); });
  console.log('报告：tools/layout-reach-report.md');
}
