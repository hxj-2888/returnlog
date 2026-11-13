#!/usr/bin/env node
/* 映射检索与左右对照 —— 不读整份源码，也能回答「这条在 3D 里对应哪一行」。
 *
 * 数据只来自 3d/spec/mapping-ledger.json（唯一判决表）；本工具不猜、不匹配。
 *
 * 用法：
 *   node 3d/tools/map-diff.cjs --section <函数名片段>   并排打印 2.5D 原文与 3D 目标原文
 *   node 3d/tools/map-diff.cjs --pending                还剩哪些缺口（unmapped + pending）
 *   node 3d/tools/map-diff.cjs --layer T2-COGNITION     按层列条目
 *   node 3d/tools/map-diff.cjs --status adapter         按状态列条目
 *   node 3d/tools/map-diff.cjs --stats                  分层/状态汇总
 *   node 3d/tools/map-diff.cjs --json                   机器可读
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-mapping-ledger.cjs');

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : '';
}
const LIMIT = args.includes('--all') ? Infinity : 40;

const ledger = B.readJson(B.LEDGER_PATH);
const entries = ledger.entries || [];

function loadModels() {
  const js = B.jsInventory();
  const jsByKey = new Map();
  const seen = new Map();
  for (const f of js.funcs) {
    const occ = (seen.get(f.src) || 0) + 1;
    seen.set(f.src, occ);
    jsByKey.set(occ === 1 ? f.src : f.src + '#' + occ, f);
  }
  const gdJson = JSON.parse(
    require('child_process').spawnSync(process.execPath, [path.join(B.ROOT, '3d/tools/filemap.cjs'), '--json'], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    }).stdout
  );
  const gdByKey = new Map();
  for (const f of gdJson.files) for (const x of f.funcs) gdByKey.set(f.file + ':' + x.name, { ...x, file: f.file });
  return { jsByKey, gdByKey };
}

const cache = new Map();
function linesOf(rel, root) {
  const p = path.join(root, rel);
  if (!cache.has(p)) cache.set(p, fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n'));
  return cache.get(p);
}
function block(rel, start, end, root) {
  const ls = linesOf(rel, root);
  const out = [];
  for (let i = start - 1; i < Math.min(end, ls.length); i++) {
    out.push(String(i + 1).padStart(6) + '  ' + ls[i]);
  }
  return out.join('\n');
}

function idOf(e) {
  return e.src + (e.occ ? '#' + e.occ : '');
}
function gdTarget(e) {
  const m = /^([\w./-]+\.gd):([A-Za-z_]\w*)$/.exec(e.target || '');
  return m ? { file: m[1], name: m[2] } : null;
}

function showSection(needle) {
  const hits = entries.filter((e) => idOf(e).includes(needle) || e.target.includes(needle));
  if (!hits.length) {
    console.error('未找到映射条目：' + needle);
    process.exit(2);
  }
  const models = loadModels();
  for (const e of hits.slice(0, 10)) {
    const [file, name] = e.src.split(':');
    const jsFn = models.jsByKey.get(idOf(e)) || models.jsByKey.get(e.src);
    console.log(
      '===== ' + idOf(e) + ' · ' + e.layer + '/' + (e.system || '-') + ' · ' + e.status + ' ====='
    );
    console.log('2.5D → ' + e.src + (e.target ? '   3D → ' + e.target : '   （无 3D 目标）'));
    if (e.note) console.log('note: ' + e.note);
    if (jsFn) {
      console.log('--- 2.5D ' + file + ':' + jsFn.start + '-' + jsFn.end + ' ---');
      console.log(block(file, jsFn.start, jsFn.end, B.SRC));
    }
    const t = gdTarget(e);
    const g = t ? models.gdByKey.get(t.file + ':' + t.name) : null;
    if (g) {
      console.log('--- 3D ' + t.file + ':' + g.start + '-' + g.end + ' ---');
      console.log(block(t.file, g.start, g.end, B.ROOT + '/3d/preview/scripts'));
    } else if (e.target) {
      console.log('--- 3D：目标不是 .gd 函数（' + e.target + '）---');
    }
    console.log('');
  }
  if (hits.length > 10) console.log('…另有 ' + (hits.length - 10) + ' 条命中（用更精确的片段）');
}

function list(filter, title) {
  const hits = entries.filter(filter);
  const byLayer = {};
  for (const e of hits) {
    byLayer[e.layer] = byLayer[e.layer] || [];
    byLayer[e.layer].push(e);
  }
  console.log(title + '：' + hits.length + ' 条');
  let shown = 0;
  for (const layer of Object.keys(byLayer).sort()) {
    const list = byLayer[layer];
    console.log('\n## ' + layer + '（' + list.length + '）');
    for (const e of list) {
      if (shown++ >= LIMIT) { console.log('  …（省略，--all 看全部）'); return; }
      console.log('  ' + e.status.padEnd(14) + idOf(e).padEnd(44) + (e.target || ''));
    }
  }
}

function stats() {
  console.log('账本：' + ledger.summary.total + ' 个 2.5D 函数 / 目标悬空 ' + ledger.summary.targets_missing);
  console.log('状态：' + JSON.stringify(ledger.summary.by_status));
  console.log('\n层                        合计  ported  auto  adapter  n-a  pending  unmapped');
  for (const [k, v] of Object.entries(ledger.summary.by_layer).sort()) {
    console.log(
      k.padEnd(24) + String(v.total).padStart(6) +
      String(v.ported || 0).padStart(8) + String(v.auto || 0).padStart(6) +
      String(v.adapter || 0).padStart(9) + String(v['not-applicable'] || 0).padStart(5) +
      String(v.pending || 0).padStart(9) + String(v.unmapped || 0).padStart(10)
    );
  }
}

if (args.includes('--json')) {
  console.log(JSON.stringify(ledger, null, 1));
} else if (argValue('--section')) {
  showSection(argValue('--section'));
} else if (args.includes('--pending')) {
  list((e) => e.status === 'unmapped' || e.status === 'pending', '缺口（unmapped + pending）');
} else if (argValue('--layer')) {
  const l = argValue('--layer');
  list((e) => e.layer === l, '层 ' + l);
} else if (argValue('--status')) {
  const s = argValue('--status');
  list((e) => e.status === s, '状态 ' + s);
} else {
  stats();
}
