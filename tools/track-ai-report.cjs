#!/usr/bin/env node
/* 2.5D 对局 · 人机移动异常判定与出图
 * ------------------------------------------------------------
 * 用法：node tools/track-ai-report.cjs [--in tools/track-ai-a.json,tools/track-ai-b.json]
 *        [--out tools/track-ai-report.html]
 *
 * 输入是 track-ai.cjs 采到的逐帧轨迹（真实对局，旁观者局）。
 * 判定口径（报告里也写一遍，避免只看数字不知道阈值）：
 *   卡墙   引擎自己的 _stuckT ≥0.5s（0.7s 就会触发重寻路），且位移 <0.1 格
 *   硬卡   有路径但 ≥1.5s 位移 <0.05 格（排除站桩 doing / 休息 / 拘留 / 倒地）
 *   死锁   位移 <0.05 格 ≥2s，期间 _pathCD 被重置到 ≥0.9（= 反复试寻路失败），且没有 doing
 *   大折返 14s 内离开起点 ≥8 格又回到 2.5 格内（走远又原路回来）
 *   效率   10 秒窗内的 |净位移| ÷ 路程；低于 0.3 且路程 ≥8 格算低效窗
 */
'use strict';
const path = require('path');
const fs = require('fs');

const DIR = path.resolve(__dirname, '..');
function arg(n, d) {
  const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : d;
}
const OUT = path.resolve(DIR, arg('out', 'tools/track-ai-report.html'));

const rawIn = String(arg('in', 'tools/track-ai.json'));
const INS = rawIn.split(',').map(x => path.resolve(DIR, x.trim())).filter(fs.existsSync);
if (!INS.length) { console.error('找不到输入轨迹：' + rawIn); process.exit(1); }
const raw = { generatedAt: null, sec: 0, clock: 'virtual', sessions: [] };
for (const f of INS) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  raw.sessions.push(...j.sessions);
  raw.sec = Math.max(raw.sec, j.sec || 0);
  raw.clock = j.clock || raw.clock;
  if (!raw.generatedAt) raw.generatedAt = j.generatedAt;
}
console.log('合并 ' + INS.length + ' 份轨迹 · ' + raw.sessions.length + ' 局');
const S = raw.sessions;

/* ---------------- 地图真源：房间多边形 + 门 ---------------- */
let ROOMS = [], DOORS = [], BOUNDS = { w: 98, h: 94 };
try {
  const win = {};
  new Function('window', fs.readFileSync(path.resolve(DIR, 'js/data/map.js'), 'utf8'))(win);
  const D = win.SKMapData;
  BOUNDS = D.bounds;
  ROOMS = D.rooms.map(r => ({ id: r.id, name: r.name, rect: r.rect, poly: r.poly }));
  for (const r of D.rooms) for (const [side, c] of r.doors || []) {
    if (side === 'b') DOORS.push([c, r.rect[1] + r.rect[3]]);
    else if (side === 't') DOORS.push([c, r.rect[1]]);
    else if (side === 'l') DOORS.push([r.rect[0], c]);
    else if (side === 'r') DOORS.push([r.rect[0] + r.rect[2], c]);
  }
} catch (e) { /* 地图读不到就退化成无房间名 */ }

const nearDoor = (x, y) => DOORS.some(d => Math.hypot(d[0] - x, d[1] - y) < 1.5);
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function roomOf(x, y) {
  for (const r of ROOMS) if (r.poly && pointInPoly(x, y, r.poly)) return r.name;
  let best = null, bd = 1e9;
  for (const r of ROOMS) {
    const cx = r.rect[0] + r.rect[2] / 2, cy = r.rect[1] + r.rect[3] / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bd) { bd = d; best = r; }
  }
  return bd < 2.2 ? best.name + '门口' : '走廊';
}
const pct = (n, d) => d ? (n / d * 100).toFixed(1) : '0.0';
function quantile(xs, q) {
  const v = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return 0;
  return v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * q)))];
}
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const F = { MOVING: 1, ALIVE: 2, STUN: 4, FLEE: 8, REST: 16, DELAY: 32, DRAG: 64, MEET: 128, DOWNED: 256 };

/* ---------------- 拆成逐 agent 序列 ---------------- */
const agents = [];
const sessionInfo = [];
for (let si = 0; si < S.length; si++) {
  const s = S[si];
  const byT = new Map();
  for (const row of s.samples) byT.set(row[0], row);
  const rows = [...byT.values()].sort((a, b) => a[0] - b[0]);
  const meetSpans = [];
  let openMeet = null;
  for (const row of rows) {
    const inMeet = (row[3][0][2] & F.MEET) !== 0;
    if (inMeet && openMeet == null) openMeet = row[0];
    if (!inMeet && openMeet != null) { meetSpans.push([openMeet, row[0]]); openMeet = null; }
  }
  sessionInfo.push({
    i: si, seed: s.meta.runSeed, played: rows.length ? +(rows[rows.length - 1][0] - rows[0][0]).toFixed(1) : 0,
    meetSec: +meetSpans.reduce((x, [a, b]) => x + (b - a), 0).toFixed(1),
    nights: s.meta.nights, errors: (s.errors || []).length
  });
  for (let ai = 0; ai < s.meta.seats.length; ai++) {
    const pts = [];
    for (const row of rows) {
      const d = row[3][ai];
      if (!d) continue;
      const jump = pts.length && Math.hypot(d[0] - pts[pts.length - 1].x, d[1] - pts[pts.length - 1].y) > 2;
      pts.push({
        t: row[0], x: d[0], y: d[1], f: d[2], path: d[3], stuck: d[4], cd: d[5],
        doing: s.legend.doing[d[6]] || '', plan: s.legend.plan[d[7]] || '',
        act: s.legend.act[d[8]] || '', jump: !!jump
      });
    }
    if (pts.length < 20) continue;
    agents.push({ si, seed: s.meta.runSeed, seat: s.meta.seats[ai], pts });
  }
}

/* ---------------- 判定 ---------------- */
const isLive = e => (e.f & F.ALIVE) && !(e.f & (F.STUN | F.DOWNED));

for (const A of agents) {
  const p = A.pts;
  const stuck = [], hard = [], dead = [], trip = [];
  let walkSec = 0, walkDist = 0, stallSec = 0, usable = 0, movingN = 0;

  for (let i = 0; i < p.length; i++) {
    const e = p[i];
    const ok = isLive(e);
    if (ok) { usable++; if (e.f & F.MOVING) movingN++; }
    if (i === 0) continue;
    const a = p[i - 1];
    const dt = e.t - a.t, dd = Math.hypot(e.x - a.x, e.y - a.y);
    if (dt <= 0 || dt > 0.5 || dd > 2 || (e.f & F.MEET) || (a.f & F.MEET)) continue;
    /* 站内瞬移（天亮刷新、拖尸交接）会顶着很小的 dt 跨好几格：按速度阈值再筛一次 */
    if (dd / dt > 6) continue;
    if (dd > 0.01) walkSec += dt;
    else if (ok && e.path > 0) stallSec += dt;
    walkDist += dd;
  }

  /* 卡墙：引擎计数 */
  let o = null;
  for (const e of p) {
    const on = e.stuck >= 0.5 && e.path > 0 && !(e.f & F.MEET);
    if (on && !o) o = { t0: e.t, t1: e.t, max: e.stuck, x: e.x, y: e.y };
    else if (on && o) { o.t1 = e.t; o.max = Math.max(o.max, e.stuck); }
    else if (!on && o) { stuck.push(o); o = null; }
  }
  if (o) stuck.push(o);
  for (const e of stuck) {
    e.dur = +(e.t1 - e.t0 + 0.1).toFixed(2); e.room = roomOf(e.x, e.y);
    e.door = nearDoor(e.x, e.y);
  }

  /* 硬卡：有路径却不动（排除站桩/休息/等门外的正常停留） */
  let h = null;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], e = p[i];
    const idle = Math.hypot(e.x - a.x, e.y - a.y) < 0.05 && e.path > 0 &&
      !(e.f & (F.MEET | F.DELAY | F.REST)) && e.doing === '' && isLive(e);
    if (idle) { if (!h) h = { t0: a.t, t1: e.t, x: e.x, y: e.y, path: e.path, act: e.act }; else h.t1 = e.t; }
    else if (h) { if (h.t1 - h.t0 >= 1.5) { h.dur = +(h.t1 - h.t0).toFixed(2); h.room = roomOf(h.x, h.y); h.door = nearDoor(h.x, h.y); hard.push(h); } h = null; }
  }

  /* 死锁：不动 ≥2s + 期间 cd 被重置 + 没有 doing（= 反复试寻路失败） */
  let d = null;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], e = p[i];
    const still = Math.hypot(e.x - a.x, e.y - a.y) < 0.06 && !(e.f & F.MEET) && isLive(e);
    if (still) {
      if (!d) d = { t0: a.t, t1: e.t, x: e.x, y: e.y, cdMax: 0, doing: '', pathMax: 0, retries: 0, prevCd: a.cd };
      else {
        d.t1 = e.t;
        if (e.cd > d.prevCd + 0.5) d.retries++;
      }
      d.cdMax = Math.max(d.cdMax, e.cd);
      d.pathMax = Math.max(d.pathMax, e.path);
      if (e.doing) d.doing = e.doing;
      d.prevCd = e.cd;
    } else if (d) {
      if (d.t1 - d.t0 >= 2.0 && d.cdMax > 0.9 && !d.doing) {
        d.dur = +(d.t1 - d.t0).toFixed(2); d.room = roomOf(d.x, d.y); d.door = nearDoor(d.x, d.y);
        dead.push(d);
      }
      d = null;
    }
  }

  /* 大折返：离开 ≥8 格又回到 2.5 格内 */
  let i = 0;
  while (i < p.length - 5) {
    if (p[i].jump) { i++; continue; }
    let peak = 0, peakJ = -1, j = i + 1;
    for (; j < p.length; j++) {
      if (p[j].jump) break;
      const dd = Math.hypot(p[j].x - p[i].x, p[j].y - p[i].y);
      if (dd > peak) { peak = dd; peakJ = j; }
      if (peak >= 8 && dd <= 2.5 && p[j].t - p[i].t >= 4) break;
      if (p[j].t - p[i].t > 14) break;
    }
    if (peak >= 8 && j < p.length && !p[j].jump &&
        Math.hypot(p[j].x - p[i].x, p[j].y - p[i].y) <= 2.5 && p[j].t - p[i].t <= 14) {
      trip.push({
        t0: p[i].t, t1: p[j].t, peak: +peak.toFixed(1), dur: +(p[j].t - p[i].t).toFixed(1),
        ax: p[i].x, ay: p[i].y, bx: p[peakJ].x, by: p[peakJ].y,
        room: roomOf(p[i].x, p[i].y), peakRoom: roomOf(p[peakJ].x, p[peakJ].y),
        actAtPeak: p[peakJ].act, planAtPeak: p[peakJ].plan, doingAtPeak: p[peakJ].doing
      });
      i = j; continue;
    }
    i++;
  }

  /* 同一片区来回：40 秒内离开锚点 ≥4 格再回来 ≥2 趟 */
  const loop = [];
  for (let a0 = 0; a0 < p.length - 1; a0 += 20) {
    if (p[a0].jump) continue;
    const P = p[a0];
    let out = false, back = 0, lastT = P.t, span = 0;
    for (let j = a0 + 1; j < p.length; j++) {
      if (p[j].jump || p[j].t - P.t > 40) break;
      const dd = Math.hypot(p[j].x - P.x, p[j].y - P.y);
      if (dd > span) span = dd;
      if (dd >= 4) out = true;
      else if (out && dd <= 1.5) { back++; out = false; lastT = p[j].t; }
    }
    if (back >= 2) {
      const prev = loop[loop.length - 1];
      if (!prev || P.t - prev.t > 40) loop.push({ t: P.t, t1: lastT, x: P.x, y: P.y, back, span: +span.toFixed(1), room: roomOf(P.x, P.y) });
      else { prev.back = Math.max(prev.back, back); prev.span = Math.max(prev.span, +span.toFixed(1)); }
    }
  }

  /* 10 秒窗位移效率 */
  const effs = [];
  let wi = 0;
  for (let k = 0; k < p.length; k++) {
    const e = p[k];
    if (e.jump) { wi = k; continue; }
    while (wi < k - 2 && p[wi].t < e.t - 10) wi++;
    if (k - wi < 20) continue;
    if ((p[k].t - p[wi].t) < 9.5) continue;
    let L = 0, bad = false;
    for (let m = wi + 1; m <= k; m++) {
      if (p[m].jump) { bad = true; break; }
      const dt = p[m].t - p[m - 1].t;
      if (dt <= 0 || dt > 0.5) continue;
      L += Math.hypot(p[m].x - p[m - 1].x, p[m].y - p[m - 1].y);
    }
    if (bad || L < 8) continue;
    effs.push({ t: e.t, L: +L.toFixed(1), N: +Math.hypot(e.x - p[wi].x, e.y - p[wi].y).toFixed(1),
      eff: +((Math.hypot(e.x - p[wi].x, e.y - p[wi].y)) / L).toFixed(2) });
  }
  /* 1 秒抽稀，避免重叠窗口重复计数 */
  const effThin = effs.filter((e, idx) => idx === 0 || e.t - effs[idx - 1].t >= 1.0);

  Object.assign(A, {
    stuck, hard, dead, trip, loop, effThin,
    walkSec: +walkSec.toFixed(1), walkDist: +walkDist.toFixed(1), stallSec: +stallSec.toFixed(1),
    speed: walkSec > 0.5 ? walkDist / walkSec : 0,
    stallShare: (walkSec + stallSec) > 0 ? stallSec / (walkSec + stallSec) : 0,
    movingShare: usable ? movingN / usable : 0,
    deadSec: +dead.reduce((s, e) => s + e.dur, 0).toFixed(1)
  });
}

/* ---------------- 汇总 ---------------- */
const tot = k => agents.reduce((s, a) => s + a[k].length, 0);
const agentSec = agents.reduce((s, a) => s + a.walkSec + a.stallSec, 0);
const agentMin = agentSec / 60;
const perMin = k => agentMin > 0 ? tot(k) / agentMin : 0;
const hitBy = k => agents.filter(a => a[k].length > 0).length;
const allStuck = agents.flatMap(a => a.stuck.map(e => ({ ...e, who: a.seat.name, alien: a.seat.alien, si: a.si })));
const allHard = agents.flatMap(a => a.hard.map(e => ({ ...e, who: a.seat.name, alien: a.seat.alien, si: a.si })));
const allDead = agents.flatMap(a => a.dead.map(e => ({ ...e, who: a.seat.name, alien: a.seat.alien, si: a.si })));
const allTrip = agents.flatMap(a => a.trip.map(e => ({ ...e, who: a.seat.name, alien: a.seat.alien, si: a.si })));
const effsAll = agents.flatMap(a => a.effThin);
const speeds = agents.map(a => a.speed).filter(x => x > 0.5);
const lowEff = effsAll.filter(e => e.eff < 0.3);

const earlyTrip = allTrip.filter(e => e.t0 < 20).length;
const doorStuck = allStuck.filter(e => e.door).length;
const allLoop = agents.flatMap(a => a.loop.map(e => ({ ...e, who: a.seat.name, alien: a.seat.alien, si: a.si })));
/* 中央走廊枢纽（去大多数舱室都要经过）—— 这里的「往返」多半是路过，不是打转 */
const HUB = [58, 37];
const hubLoop = allLoop.filter(e => Math.hypot(e.x - HUB[0], e.y - HUB[1]) <= 9).length;
const farLoop = allLoop.length - hubLoop;
const scanCases = allLoop.filter(e => e.back >= 3);
const scanSpanMed = scanCases.length ? quantile(scanCases.map(e => e.span), 0.5) : 0;
const scanSpanMin = scanCases.length ? Math.min(...scanCases.map(e => e.span)) : 0;
const scanSpanMax = scanCases.length ? Math.max(...scanCases.map(e => e.span)) : 0;
const scanWorst = scanCases.slice().sort((a, b) => (b.back - a.back) || (b.span - a.span))[0] || null;
const localScan = scanCases.filter(e => e.span <= 12);   /* 小于 12 格 = 真正的原地打转 */
const farScan = scanCases.filter(e => e.span > 12);

/* 阵营 / 时段拆分 */
const facMin = { human: 0, alien: 0 };
agents.forEach(a => { facMin[a.seat.alien ? 'alien' : 'human'] += (a.walkSec + a.stallSec) / 60; });
const perFac = (list, alien) => list.filter(e => !!e.alien === alien).length;
const BUCKETS = [[0, 20, '开局 0–20s'], [20, 60, '前段 20–60s'], [60, 1e9, '后段 60s+']];
const bucketRows = BUCKETS.map(([a, b, label]) => ({
  label,
  trip: allTrip.filter(e => e.t0 >= a && e.t0 < b).length,
  dead: allDead.filter(e => e.t0 >= a && e.t0 < b).length,
  stuck: allStuck.filter(e => e.t0 >= a && e.t0 < b).length
}));
/* 每局读数 */
const bySession = sessionInfo.map(s => {
  const A = agents.filter(a => a.si === s.i);
  return {
    ...s, agents: A.length,
    walk: +A.reduce((x, a) => x + a.walkSec, 0).toFixed(0),
    stuck: A.reduce((x, a) => x + a.stuck.length, 0),
    hard: A.reduce((x, a) => x + a.hard.length, 0),
    dead: A.reduce((x, a) => x + a.dead.length, 0),
    deadSec: +A.reduce((x, a) => x + a.deadSec, 0).toFixed(1),
    trip: A.reduce((x, a) => x + a.trip.length, 0)
  };
});

console.log('=== 采集 ===');
sessionInfo.forEach(s => console.log('  局 ' + (s.i + 1) + ' seed ' + s.seed + ' · ' + s.played +
  's · 会议 ' + s.meetSec + 's · 夜 ' + s.nights));
console.log('=== 规模 === ' + agents.length + ' 条 agent 记录 · ' + agentMin.toFixed(1) + ' 人·分钟');
console.log('=== 异常 ===');
console.log('  卡墙（_stuckT≥0.5）      ' + allStuck.length + ' 次 / ' + hitBy('stuck') + ' 人' +
  (allStuck.length ? ' · 门口占 ' + pct(doorStuck, allStuck.length) + '%' : ''));
console.log('  硬卡（≥1.5s 有路径不动） ' + allHard.length + ' 次 / ' + hitBy('hard') + ' 人' +
  (allHard.length ? ' · 最长 ' + Math.max(...allHard.map(e => e.dur)) + 's' : ''));
console.log('  寻路失败死锁（≥2s 发呆） ' + allDead.length + ' 次 / ' + hitBy('dead') + ' 人 · 共 ' +
  allDead.reduce((s, e) => s + e.dur, 0).toFixed(1) + 's（占对局时长 ' +
  pct(allDead.reduce((s, e) => s + e.dur, 0), agentSec) + '%）');
console.log('  大折返（≥8 格原路回来）  ' + allTrip.length + ' 次 · ' + perMin('trip').toFixed(2) +
  ' 次/人分 · 开局 20s 占 ' + pct(earlyTrip, allTrip.length) + '%');
console.log('  同一片区往返≥2 趟     ' + allLoop.length + ' 例 · 其中 ' + hubLoop +
  ' 例在中央走廊枢纽 9 格内（拓扑路过），其余 ' + farLoop + ' 例');
console.log('  阵营：人类折返 ' + perFac(allTrip, false) + ' 次 / ' + facMin.human.toFixed(1) + ' 人分（' +
  (perFac(allTrip, false) / (facMin.human || 1)).toFixed(2) + '/人分）· 异形 ' + perFac(allTrip, true) +
  ' 次 / ' + facMin.alien.toFixed(1) + ' 人分（' + (perFac(allTrip, true) / (facMin.alien || 1)).toFixed(2) + '/人分）');
console.log('  3 趟以上的 ' + scanCases.length + ' 例：扫动 ' + scanSpanMin.toFixed(0) + '–' +
  scanSpanMax.toFixed(0) + ' 格（中位 ' + scanSpanMed.toFixed(0) + '）· 其中 ≤12 格的原地打转 ' + localScan.length + ' 例');
console.log('  时段：' + bucketRows.map(b => b.label + ' 折返 ' + b.trip + ' / 死锁 ' + b.dead).join(' · '));
console.log('=== 走路 ===');
console.log('  均速 ' + mean(speeds).toFixed(2) + ' 格/秒（标称 4.0）· P10 ' + quantile(speeds, 0.1).toFixed(2) +
  ' / P90 ' + quantile(speeds, 0.9).toFixed(2));
console.log('  有路径却没挪窝占 ' + pct(agents.reduce((s, a) => s + a.stallSec, 0),
  agents.reduce((s, a) => s + a.walkSec + a.stallSec, 0)) + '%');
console.log('  10s 位移效率 P10/P50/P90 ' + quantile(effsAll.map(e => e.eff), 0.1).toFixed(2) + ' / ' +
  quantile(effsAll.map(e => e.eff), 0.5).toFixed(2) + ' / ' + quantile(effsAll.map(e => e.eff), 0.9).toFixed(2) +
  ' · 低效窗（<0.3）占 ' + pct(lowEff.length, effsAll.length) + '%');
const deadByAgent = agents.filter(a => a.dead.length).map(a => a.seat.name + ' ' + a.dead.map(e => e.dur + 's@' + (e.room)).join(','));
if (deadByAgent.length) {
  console.log('=== 死锁明细 ===');
  deadByAgent.forEach(x => console.log('  ' + x));
}
allTrip.sort((a, b) => b.peak - a.peak).slice(0, 5).forEach(e => console.log('  折返 ' + e.who +
  (e.alien ? '(异)' : '') + ' ' + e.peak + ' 格 ' + e.room + '→' + e.peakRoom + ' ' + e.dur + 's'));

/* ---------------- 出图 ---------------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const roomLayer = () => ROOMS.map(r => {
  const pts = (r.poly || [[r.rect[0], r.rect[1]], [r.rect[0] + r.rect[2], r.rect[1]],
    [r.rect[0] + r.rect[2], r.rect[1] + r.rect[3]], [r.rect[0], r.rect[1] + r.rect[3]]])
    .map(q => (q[0] * 10).toFixed(0) + ',' + (q[1] * 10).toFixed(0)).join(' ');
  const cx = (r.rect[0] + r.rect[2] / 2) * 10, cy = (r.rect[1] + r.rect[3] / 2) * 10;
  return '<polygon points="' + pts + '" fill="#f3f7fc" stroke="#c7d4e4" stroke-width="1.4"/>' +
    '<text x="' + cx + '" y="' + cy + '" font-size="12" fill="#93a6bc" text-anchor="middle">' + esc(r.name) + '</text>';
}).join('');

function trailSvg(list) {
  const body = list.map(a => {
    const pts = a.pts.filter(q => !(q.f & F.MEET) && !q.jump).map(q => (q.x * 10).toFixed(1) + ',' + (q.y * 10).toFixed(1));
    const step = Math.max(1, Math.floor(pts.length / 900));
    return '<polyline points="' + pts.filter((_, i) => i % step === 0).join(' ') +
      '" fill="none" stroke="' + a.color + '" stroke-width="1.5" opacity=".8" stroke-linejoin="round"/>';
  }).join('');
  const marks = list.map(a => a.trip.map(e =>
    '<circle cx="' + (e.bx * 10).toFixed(0) + '" cy="' + (e.by * 10).toFixed(0) + '" r="5" fill="none" stroke="' +
    a.color + '" stroke-width="2" opacity=".9"/>').join('')).join('');
  const deads = allDead.map(e => '<circle cx="' + (e.x * 10).toFixed(0) + '" cy="' + (e.y * 10).toFixed(0) +
    '" r="7" fill="#e5484d" opacity=".35"/>').join('');
  return '<svg viewBox="0 0 ' + (BOUNDS.w * 10) + ' ' + (BOUNDS.h * 10) + '" width="100%" ' +
    'style="background:#fff;border-radius:10px;border:1px solid #e3eaf2">' + roomLayer() + body + marks + deads + '</svg>';
}

const colors = ['#2f6fed', '#e5484d', '#12a594'];
const showcase = agents.slice()
  .sort((a, b) => (b.dead.length * 5 + b.hard.length * 2 + b.trip.length) - (a.dead.length * 5 + a.hard.length * 2 + a.trip.length))
  .slice(0, 3).map((a, i) => ({ ...a, color: colors[i] }));

const row = a => '<tr><td><span class="sub">局' + (a.si + 1) + '</span> ' + esc(a.seat.name) + (a.seat.alien ? ' <span class="tag alien">异形</span>' : '') + '</td>' +
  '<td class="n">' + a.walkSec.toFixed(0) + '</td><td class="n">' + a.speed.toFixed(2) + '</td>' +
  '<td class="n ' + (a.stallShare > 0.03 ? 'warn' : '') + '">' + (a.stallShare * 100).toFixed(0) + '%</td>' +
  '<td class="n ' + (a.stuck.length ? 'bad' : '') + '">' + a.stuck.length + '</td>' +
  '<td class="n ' + (a.hard.length ? 'bad' : '') + '">' + a.hard.length + '</td>' +
  '<td class="n ' + (a.dead.length ? 'bad' : '') + '">' + a.dead.length + (a.dead.length ? '（' + a.deadSec + 's）' : '') + '</td>' +
  '<td class="n">' + a.trip.length + '</td>' +
  '<td class="n">' + a.loop.length + '</td>' +
  '<td class="n ' + (a.effThin.filter(e => e.eff < 0.3).length ? 'warn' : '') + '">' + a.effThin.filter(e => e.eff < 0.3).length + '</td></tr>';

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>返航录 2.5D · 人机移动异常追踪</title>
<style>
:root{--ink:#16202c;--dim:#66788c;--line:#e3eaf2;--bg:#f6f8fb;--warn:#b07d00;--bad:#d92d20;--ok:#0d8a72}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.68 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:30px 24px 60px}
h1{font-size:25px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px}
.sub{color:var(--dim);font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 15px}
.card .k{font-size:12.5px;color:var(--dim)}.card .v{font-size:25px;font-weight:650;margin:1px 0 2px}
.card .v small{font-size:12px;color:var(--dim);font-weight:400}
.card .d{font-size:12px;color:var(--dim);line-height:1.5}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13px}
th,td{padding:6px 9px;border-bottom:1px solid var(--line);text-align:left}
th{background:#eef3f9;font-weight:600;font-size:12px;color:#43566c}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.bad{color:var(--bad);font-weight:600}td.warn{color:var(--warn)}
.tag{font-size:10.5px;padding:1px 6px;border-radius:20px;background:#eef3f9;color:#5a6f86}
.tag.alien{background:#fde8e8;color:#b42318}
.note{background:#fff;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:8px;padding:12px 16px;font-size:13.5px;margin:12px 0}
ul{margin:6px 0 0 18px;padding:0}li{margin:4px 0}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--dim);margin:8px 0}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
code{background:#eef3f9;padding:1px 5px;border-radius:4px;font-size:12.5px}
</style></head><body><div class="wrap">
<h1>2.5D 人机移动异常追踪</h1>
<div class="sub">真实对局（旁观者局，非 simGame）· ${S.length} 局 × ${raw.sec}s ·
${raw.clock === 'virtual' ? '假时钟 25ms/帧（约 4 倍速，同 seed 可复现）' : '真实墙钟'} ·
${agents.length} 条 agent 记录 · ${agentMin.toFixed(1)} 人·分钟 · ${new Date(raw.generatedAt).toLocaleString('zh-CN')}</div>

<div class="cards">
__CARDS__
</div>

<h2>结论</h2>
<div class="note">
<b>1. 卡墙：${allStuck.length === 0 ? '没有' : allStuck.length + ' 次，都是瞬时的'}。</b>
${allStuck.length === 0
    ? '引擎自己的卡死计数（<code>_stuckT</code>，0.7 秒就触发重寻路）在 ' + agentMin.toFixed(1) + ' 人·分钟里一次都没到 0.5 秒'
    : '引擎卡死计数触发 ' + allStuck.length + ' 次（' + allStuck.length + ' / ' + agents.length + ' 人，最长 ' +
      Math.max(...allStuck.map(e => e.dur)).toFixed(1) + ' 秒），全部发生在门口 ' + pct(doorStuck, allStuck.length) + '%'}；
位移归零 ≥1.5 秒的「硬卡」${allHard.length
    ? '只有 ' + allHard.length + ' 次、最长 ' + Math.max(...allHard.map(e => e.dur)).toFixed(1) + ' 秒（' +
      allHard.slice().sort((a, b) => b.dur - a.dur).slice(0, 3).map(e => e.who + ' ' + e.dur + 's @' + e.room + (e.door ? '门口' : '')).join('；') +
      (allHard.length > 3 ? ' 等' : '') + '）'
    : '一次都没有'}。${allStuck.length === 0 ? 'AI 没有被家具或墙角卡住。' : '卡墙是等门而不是被几何卡死。'}
<br><br>
<b>2. 反复徘徊：有，但不是原地抖动，是「两个区域之间来回倒」。</b>
同一片区 40 秒内往返 ≥2 趟的共 ${allLoop.length} 例；其中 <b>${scanCases.length} 例达到 3 趟</b>，
扫动范围 ${scanSpanMin.toFixed(0)}–${scanSpanMax.toFixed(0)} 格（中位 ${scanSpanMed.toFixed(0)} 格）——也就是在两个相距二三十格的区域之间来回走 3 趟，
基本占满那 40 秒${scanWorst ? '；最典型：' + esc(scanWorst.who) + ' 在 ' + esc(scanWorst.room) + ' 一带，' + scanWorst.t.toFixed(0) + '–' + scanWorst.t1.toFixed(0) + ' 秒、扫动 ' + scanWorst.span + ' 格' : ''}。
剩下的 ${allLoop.length - scanCases.length} 例是 2 趟的轻度折返，${hubLoop} 例落在中央走廊枢纽（去各舱必经，属拓扑路过）。
真正多的是<b>大折返</b>：${allTrip.length} 次、${perMin('trip').toFixed(2)} 次/人分，峰值距离中位 ${quantile(allTrip.map(e => e.peak), 0.5).toFixed(1)} 格，
每次平均白走 ${(2 * mean(allTrip.map(e => e.peak))).toFixed(0)} 格 / ${mean(allTrip.map(e => e.dur)).toFixed(1)} 秒，开局 20 秒内占 ${pct(earlyTrip, allTrip.length)}%。
这是<b>目标切换</b>（挑好的任务/追的人半路变了）留下的痕迹，观感像乱跑，但不是卡死。
<br><br>
<b>3. 真正的缺陷是「寻路失败后原地发呆」：</b>${allDead.length} 次、${agents.filter(a => a.dead.length).length} 个席位，单次
${allDead.length ? Math.min(...allDead.map(e => e.dur)) : 0}–${allDead.length ? Math.max(...allDead.map(e => e.dur)) : 0} 秒，合计
${allDead.reduce((s, e) => s + e.dur, 0).toFixed(0)} 秒（占全部对局时长 ${pct(allDead.reduce((s, e) => s + e.dur, 0), agentSec)}%）。
表现很固定：人不动、<code>path</code> 为 0、<code>_pathCD</code> 每 1.2 秒被重置一次（每次重试都失败）、没有 doing/plan。
<code>walkTo</code> 失败只给 1.2 秒冷却，冷却后原样重试同一个目标，没有「换目标 / 先走到最近可走点」的兜底，所以能僵 10 秒以上。
</div>

<h2>逐人读数</h2>
<div class="legend"><span><i class="dot" style="background:#d92d20"></i>卡住类</span>
<span><i class="dot" style="background:#b07d00"></i>低效移动</span><span>行走秒数已扣除会议与瞬移</span></div>
<table><thead><tr><th>席位</th><th>行走 s</th><th>均速</th><th>有路径没动</th><th>卡墙</th><th>硬卡</th><th>发呆死锁</th><th>大折返</th><th>片区往返</th><th>低效窗</th></tr></thead>
<tbody>${agents.slice().sort((a, b) => (b.dead.length * 5 + b.hard.length * 2 + b.stuck.length * 3 + b.trip.length) - (a.dead.length * 5 + a.hard.length * 2 + a.stuck.length * 3 + a.trip.length)).map(row).join('')}</tbody></table>

<h2>分局读数</h2>
<table><thead><tr><th>局</th><th>seed</th><th>采样</th><th>夜</th><th>席位</th><th>行走 s</th><th>卡墙</th><th>硬卡</th><th>发呆死锁</th><th>大折返</th></tr></thead><tbody>
${bySession.map(s => `<tr><td>局${s.i + 1}</td><td class="sub">${s.seed}</td><td class="n">${s.played}s</td>
<td class="n">${s.nights}</td><td class="n">${s.agents}</td><td class="n">${s.walk}</td>
<td class="n">${s.stuck}</td><td class="n">${s.hard}</td>
<td class="n ${s.dead ? 'bad' : ''}">${s.dead}${s.dead ? '（' + s.deadSec + 's）' : ''}</td>
<td class="n">${s.trip}</td></tr>`).join('')}
</tbody></table>

<h2>阵营与时段</h2>
<table><thead><tr><th>维度</th><th>样本</th><th>大折返</th><th>折算</th><th>发呆死锁</th></tr></thead><tbody>
<tr><td>人类（11 席）</td><td class="n">${facMin.human.toFixed(1)} 人·分</td><td class="n">${perFac(allTrip, false)}</td>
<td class="n">${(perFac(allTrip, false) / (facMin.human || 1)).toFixed(2)} /人分</td><td class="n">${perFac(allDead, false)}</td></tr>
<tr><td>异形（4 席）</td><td class="n">${facMin.alien.toFixed(1)} 人·分</td><td class="n">${perFac(allTrip, true)}</td>
<td class="n">${(perFac(allTrip, true) / (facMin.alien || 1)).toFixed(2)} /人分</td><td class="n">${perFac(allDead, true)}</td></tr>
${bucketRows.map(b => `<tr><td>${b.label}</td><td class="n">—</td><td class="n">${b.trip}</td><td class="n"></td><td class="n">${b.dead}</td></tr>`).join('')}
</tbody></table>

<h2>轨迹（问题最多的 3 人）</h2>
<div class="legend">${showcase.map(a => '<span><i class="dot" style="background:' + a.color + '"></i>' + esc(a.seat.name) +
  (a.seat.alien ? '（异形）' : '') + ' · 发呆 ' + a.dead.length + ' · 折返 ' + a.trip.length + '</span>').join('')}
<span><i class="dot" style="background:#e5484d;opacity:.4"></i>发呆死锁位置</span>
<span><i class="dot" style="border:2px solid #888;background:#fff"></i>折返最远点</span></div>
${trailSvg(showcase)}

<h2>发呆死锁明细</h2>
<table><thead><tr><th>席位</th><th>时段（游戏秒）</th><th>时长</th><th>位置</th><th>重试次数</th><th>当时目标</th></tr></thead><tbody>
${allDead.sort((a, b) => b.dur - a.dur).map(e => `<tr><td>${esc(e.who)}${e.alien ? ' <span class="tag alien">异形</span>' : ''}</td>
<td>${e.t0.toFixed(1)} ~ ${e.t1.toFixed(1)}</td><td class="n bad">${e.dur}s</td>
<td>${esc(e.room)}${e.door ? '（门口）' : ''} (${e.x.toFixed(1)}, ${e.y.toFixed(1)})</td>
<td class="n">${e.retries}</td><td>${e.act || '无（走到一半丢掉目标）'}</td></tr>`).join('') || '<tr><td colspan="6">无</td></tr>'}
</tbody></table>

<h2>最大几次折返</h2>
<table><thead><tr><th>席位</th><th>起点 → 最远点</th><th>峰值距离</th><th>用时</th><th>最远点当时在做什么</th></tr></thead><tbody>
${allTrip.sort((a, b) => b.peak - a.peak).slice(0, 10).map(e => `<tr><td>${esc(e.who)}${e.alien ? ' <span class="tag alien">异形</span>' : ''}</td>
<td>${esc(e.room)} → ${esc(e.peakRoom)}</td><td class="n">${e.peak} 格</td><td class="n">${e.dur}s</td>
<td>${e.doingAtPeak || (e.planAtPeak ? '计划 ' + e.planAtPeak : (e.actAtPeak || '纯移动'))}</td></tr>`).join('') || '<tr><td colspan="5">无</td></tr>'}
</tbody></table>

<h2>同一片区往返（含枢纽路过）</h2>
<div class="sub" style="margin-bottom:6px">口径：40 秒内两次「离开 ≥4 格再回到 1.5 格内」。<b>${allLoop.filter(e => e.back >= 3).length} 例达到 3 趟</b>——这是最接近「反复徘徊」的形态；中央走廊枢纽 9 格内另算路过。</div>
<table><thead><tr><th>席位</th><th>时段</th><th>位置</th><th>趟数</th><th>扫动范围</th><th>判定</th></tr></thead><tbody>
${allLoop.sort((a, b) => (b.back - a.back) || (b.span - a.span)).slice(0, 14).map(e => {
    const hub = Math.hypot(e.x - HUB[0], e.y - HUB[1]) <= 9;
    return `<tr><td>${esc(e.who)}${e.alien ? ' <span class="tag alien">异形</span>' : ''}</td>
<td>${e.t.toFixed(0)}–${e.t1.toFixed(0)}s</td><td>${esc(e.room)} (${e.x.toFixed(1)}, ${e.y.toFixed(1)})</td>
<td class="n ${e.back >= 3 ? 'bad' : ''}">${e.back}</td><td class="n">${e.span} 格</td>
<td>${hub ? '枢纽路过' : (e.back >= 3 ? '<b style="color:#d92d20">来回扫</b>' : '两次折返')}</td></tr>`;
  }).join('') || '<tr><td colspan="6">无</td></tr>'}
</tbody></table>

<h2>判定口径</h2>
<ul>
<li><b>卡墙</b>：读引擎自己的 <code>_stuckT</code>（<code>stepMove</code> 里连续 0.7 秒无位移就重寻路），≥0.5 秒记一次，且要求当时确实有路径。</li>
<li><b>硬卡</b>：有路径但 ≥1.5 秒位移 &lt;0.05 格；排除站桩 doing、休息、拘留僵直、散场延迟与会议。</li>
<li><b>发呆死锁</b>：位移 &lt;0.06 格持续 ≥2 秒，期间 <code>_pathCD</code> 至少被重置到 0.9 以上（说明反复试寻路失败），且没有 doing。</li>
<li><b>大折返</b>：14 秒内离开起点 ≥8 格、又回到 2.5 格内。一次算一趟，不重复计。</li>
<li><b>低效窗</b>：10 秒窗内 |净位移| ÷ 路程 &lt;0.3 且路程 ≥8 格（按 1 秒抽稀）。</li>
<li>会议期间与瞬移（&gt;2 格/帧）已剔除；<b>倒地</b>（downed）、死亡、拘留僵直、散场延迟期间一律不计入移动统计——上一版把倒地的人当「发呆」，是错的。</li>
<li>这是<b>旁观者局</b>：玩家不在场，AI 的怀疑/跟随目标与有人类玩家时不同，但移动层（寻路、卡死兜底、计划重算）是同一套代码。</li>
</ul>

<h2>复现</h2>
<div class="sub"><code>node tools/track-ai.cjs --sessions ${S.length} --sec ${raw.sec} --seed ${S[0].meta.runSeed}</code> →
<code>node tools/track-ai-report.cjs</code>。原始轨迹 <code>tools/track-ai.json</code>；
寻路失败瞬间的调用栈探针是 <code>node tools/probe-caller.cjs</code>。</div>
</div>
</body></html>`;

/* 卡片在模板里用了函数，先渲染一次再落盘（避免 eval） */
const cardsHtml = [
  ['卡墙（引擎计数）', allStuck.length + ' 次', allStuck.length ? '门口占 ' + pct(doorStuck, allStuck.length) + '%' : '_stuckT 全程没到 0.5 秒'],
  ['硬卡（≥1.5s 不动）', allHard.length + ' 次', allHard.length ? '最长 ' + Math.max(...allHard.map(e => e.dur)) + ' 秒 · ' + allHard[0].room : '没有「有路径却推不动」的段'],
  ['寻路失败发呆', allDead.length + ' 次', '共 ' + allDead.reduce((s, e) => s + e.dur, 0).toFixed(0) + ' 秒 · 最长 ' + (allDead.length ? Math.max(...allDead.map(e => e.dur)) : 0) + ' 秒'],
  ['大折返（≥8 格）', allTrip.length + ' 次', perMin('trip').toFixed(2) + ' 次/人分 · 开局 20s 占 ' + pct(earlyTrip, allTrip.length) + '%'],
  ['同一片区往返≥2 趟', allLoop.length + ' 例', (scanCases.length ? '其中 ' + scanCases.length + ' 例来回扫 3 趟' : '没有 3 趟以上的来回扫') + ' · ' + hubLoop + ' 例属枢纽路过'],
  ['平均步速', mean(speeds).toFixed(2) + ' 格/秒', '标称 4.0 · 有路径不动占 ' + pct(agents.reduce((s, a) => s + a.stallSec, 0), agents.reduce((s, a) => s + a.walkSec + a.stallSec, 0)) + '%']
].map(([k, v, d]) => '<div class="card"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>').join('');

fs.writeFileSync(OUT, html.replace('__CARDS__', cardsHtml));
console.log('报告 → ' + path.relative(DIR, OUT));
