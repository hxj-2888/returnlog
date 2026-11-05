#!/usr/bin/env node
/* Godot glTF 导入参数核对（启航路 3D 版）
 *
 * 把 3d/spec/godot-import.cfg 的 [params] 与 3d/preview/ 下所有 .glb.import 比对。
 * 只核对预设里列出的 key；uid / md5 / [deps] 这些机器生成项一律忽略。
 * **只读**：不修改任何 .import 文件，差异交给人在编辑器导入面板里改。
 *
 * 用法：node 3d/tools/check-godot-import.cjs [--json]
 * 退出码：0 全部一致（或还没有模型）；1 有差异。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const cfgPath = path.join(root, '3d', 'spec', 'godot-import.cfg');
const preview = path.join(root, '3d', 'preview');

function parseParams(text) {
  const out = {};
  let inParams = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[')) { inParams = line === '[params]'; continue; }
    if (!inParams) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.godot' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.glb.import')) acc.push(p);
  }
  return acc;
}

const preset = parseParams(fs.readFileSync(cfgPath, 'utf8'));
const keys = Object.keys(preset);
const files = walk(preview, []);
const diffs = [];

for (const f of files) {
  const got = parseParams(fs.readFileSync(f, 'utf8'));
  const rel = path.relative(root, f).replace(/\\/g, '/');
  for (const k of keys) {
    if (!(k in got)) { diffs.push({ file: rel, key: k, want: preset[k], got: '(缺失)' }); continue; }
    if (got[k] !== preset[k]) diffs.push({ file: rel, key: k, want: preset[k], got: got[k] });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: diffs.length === 0, models: files.length, keys: keys.length, diffs }, null, 2));
} else {
  console.log('== Godot 导入预设核对 ==');
  console.log('  模型      ' + files.length + ' 个 .glb.import');
  console.log('  预设项    ' + keys.length + ' 个 key（来自 3d/spec/godot-import.cfg）');
  if (!files.length) {
    console.log('\n  还没有正式模型；探针模型是唯一参照物。');
  }
  if (diffs.length) {
    console.log('\n-- 差异 ' + diffs.length + ' 条 --');
    const byFile = {};
    for (const d of diffs) (byFile[d.file] = byFile[d.file] || []).push(d);
    for (const [file, ds] of Object.entries(byFile)) {
      console.log('  ' + file);
      for (const d of ds) console.log('    ' + d.key + '：预设 ' + d.want + ' ≠ 实际 ' + d.got);
    }
    console.log('\n[3d:import] 不一致：请在 Godot 导入面板按预设改后重新导入');
  } else {
    console.log('\n[3d:import] 通过（0 差异）');
  }
}

process.exit(diffs.length ? 1 : 0);
