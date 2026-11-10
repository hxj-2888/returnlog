#!/usr/bin/env node
/**
 * 把 COVER_HEIGHT 表的 v2 段同步为 GLB 实测高度。
 *
 * 为什么：Godot 按 `height / cover_refs[kind].高` 做 Y 缩放。
 * 2026-11-07 起所有掩体由 covers_lib.sight_extend() 补到 SIGHT_MIN_H=1.70
 * （眼高 1.62 + 余量），如果表还留着旧的 0.55/0.95，会把模型**压回矮个子**，
 * 视线遮挡就白做了。改完模型必跑这个脚本。
 *
 * 用法：node 3d/tools/sync-cover-height.cjs [--check]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GD = path.join(ROOT, '3d/preview/scripts/map_builder.gd');
const TXT = path.join(ROOT, '3d/preview/scripts/cover_height_v2.gd.txt');
const REFS = path.join(ROOT, '3d/preview/data/cover_refs.json');
const SIGHT_MIN_H = 1.70;
const check = process.argv.includes('--check');

const refs = JSON.parse(fs.readFileSync(REFS, 'utf8'));
const gd = fs.readFileSync(GD, 'utf8');
const BEGIN = '# === v2 房间专属 kind（由 3d/tools/build-map-v2.cjs 生成）BEGIN ===';
const END = '# === v2 房间专属 kind END ===';
const a = gd.indexOf(BEGIN);
const b = gd.indexOf(END);
if (a < 0 || b < 0) throw new Error('找不到 COVER_HEIGHT v2 段的 BEGIN/END 标记');

const seg = gd.slice(a, b);
let changed = 0;
const seen = new Set();
const out = seg.replace(/^(\t")([a-z0-9_]+)("\s*:\s*)([0-9.]+)(,.*)$/gm, (m, p1, kind, p3, val, tail) => {
  if (!refs[kind]) return m;
  seen.add(kind);
  const h = +refs[kind][2].toFixed(2);
  if (Math.abs(h - parseFloat(val)) < 0.005) return m;
  changed++;
  return `${p1}${kind}${p3}${h.toFixed(2)},  # GLB 实测（≥${SIGHT_MIN_H.toFixed(2)} 视线遮挡下限）`;
});
const missing = Object.keys(refs).filter(k => !seen.has(k));
const newGd = gd.slice(0, a) + out + gd.slice(b);

if (missing.length) {
  console.error('[cover-height] v2 段缺少 kind：', missing.join(', '));
  process.exitCode = 1;
}
const below = Object.entries(refs).filter(([, r]) => r[2] < SIGHT_MIN_H - 0.01);
console.log(`[cover-height] ${seen.size} 项 · 需更新 ${changed} 项 · 低于 ${SIGHT_MIN_H}m：${below.length} 件`);
if (below.length) console.log('  低于下限：', below.map(([k, r]) => `${k}:${r[2]}`).join(', '));

if (check) {
  if (changed) { console.log('[cover-height] --check：表与实测不一致'); process.exitCode = 1; }
  else console.log('[cover-height] --check：一致');
} else {
  fs.writeFileSync(GD, newGd);
  // 同步生成脚本的核对片段（不重跑 build-map-v2.cjs，避免改动布局坐标）
  if (fs.existsSync(TXT)) {
    const t = fs.readFileSync(TXT, 'utf8');
    const t2 = t.replace(/^(\t")([a-z0-9_]+)("\s*:\s*)([0-9.]+)(,.*)$/gm,
      (m, p1, kind, p3, val, tail) => refs[kind]
        ? `${p1}${kind}${p3}${refs[kind][2].toFixed(2)},  # GLB 实测`
        : m);
    fs.writeFileSync(TXT, t2);
  }
  console.log('[cover-height] 已写入 map_builder.gd / cover_height_v2.gd.txt');
}
