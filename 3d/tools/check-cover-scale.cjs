#!/usr/bin/env node
/**
 * 掩体缩放审查：建模尺寸（cover_refs.json）vs 地图占地（map_v2.json）
 *
 * 为什么需要：Godot 按「地图尺寸 / 建模尺寸」缩放 GLB。比值偏离 1 太多时，
 * 几何会被拉扁或拉长 —— 看起来"粗糙"其实不是细节不够，是**形状被拉伸**。
 * 2026-11-07 就是靠这个脚本发现生态舱 8 件被拉了 2.25~4.32 倍。
 *
 * 用法：node 3d/tools/check-cover-scale.cjs [--limit 1.35]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, '3d/preview/data/cover_refs.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(ROOT, '3d/preview/data/map_v2.json'), 'utf8'));
const gd = fs.readFileSync(path.join(ROOT, '3d/preview/scripts/map_builder.gd'), 'utf8');
const arg = process.argv.indexOf('--limit');
const LIMIT = arg >= 0 ? parseFloat(process.argv[arg + 1]) : 1.35;
// 2026-11-07：3D 相机眼高 1.62m，遮挡下限取 1.70m（玩家胶囊高）。
// 2.5D 的 los() 让每件 cover 都挡光，所以 GLB 低于这个值就是「判定挡、画面不挡」。
const SIGHT_MIN_H = 1.70;

const byKind = {};
for (const c of map.cover) (byKind[c.kind] = byKind[c.kind] || []).push(c);

const rows = [];
for (const [kind, r] of Object.entries(refs)) {
  const list = byKind[kind] || [];
  if (!list.length) { rows.push({ kind, note: '地图无此 kind' }); continue; }
  let worst = null;
  for (const c of list) {
    const sx = c.w / r[0], sz = c.h / r[1];
    const m = Math.max(sx, sz);
    if (!worst || m > worst.ratio) worst = { ratio: +m.toFixed(2), sx: +sx.toFixed(2), sz: +sz.toFixed(2), map: `${c.w}x${c.h}` };
  }
  const hm = gd.match(new RegExp('"' + kind + '":\\s*([0-9.]+)'));
  const hy = hm ? +(+hm[1] / r[2]).toFixed(2) : null;
  rows.push({ kind, n: list.length, tier: list[0].tier, ...worst, hy, ref: `${r[0]}x${r[1]}x${r[2]}` });
}
rows.sort((a, b) => (b.ratio || 0) - (a.ratio || 0));

console.log('kind                        n  tier    横比   纵比  地图w×h   建模w×d×h');
for (const r of rows) {
  if (r.note) { console.log(r.kind.padEnd(27), r.note); continue; }
  const flag = r.ratio > LIMIT ? '  <<< 拉伸超标' : r.hy && (r.hy < 0.8 || r.hy > 1.35) ? '  << 纵向失配' : '';
  console.log(r.kind.padEnd(27),
    String(r.n).padStart(2), (r.tier || '').padEnd(7),
    String(r.ratio).padStart(5), String(r.hy == null ? '-' : r.hy).padStart(5),
    '  ' + r.map.padEnd(9), r.ref.padEnd(18), flag);
}
const bad = rows.filter(r => r.ratio > LIMIT);
const ybad = rows.filter(r => r.hy != null && (r.hy < 0.8 || r.hy > 1.35));
const low = rows.filter(r => r.ref && parseFloat(r.ref.split('x')[2]) < SIGHT_MIN_H - 0.01);
console.log(`\n合计 ${rows.length} kind · 横向 >${LIMIT}x：${bad.length} 件 · 纵向失配：${ybad.length} 件 · 低于眼高 ${SIGHT_MIN_H}m：${low.length} 件`);
if (bad.length) console.log('横向：', bad.map(r => `${r.kind}:${r.ratio}`).join(', '));
if (ybad.length) console.log('纵向：', ybad.map(r => `${r.kind}:${r.hy}`).join(', '));
if (low.length) console.log('低于眼高：', low.map(r => `${r.kind}:${r.ref.split('x')[2]}`).join(', '));
process.exitCode = bad.length || ybad.length || low.length ? 1 : 0;
