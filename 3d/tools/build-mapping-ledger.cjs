#!/usr/bin/env node
/* 映射账本生成器 —— 把「2.5D 全部函数」变成一张可检索、可对账、只许收敛的表。
 *
 * 为什么存在（2026-11-13）：此前函数映射散在四处 —— port-manifest（系统行区间）、
 * gameplay-parity（386 条手写）、parity-map（70 条纯函数）、以及门禁里的
 * 「同名自动配对 + DOM 正则猜 not-applicable」等隐式分支。同一件事有多个来源，
 * 判决靠 if 猜。本工具把最后一类彻底去掉：
 *
 *   分层：3d/spec/mapping-layers.json（系统 → 层 + 整系统状态政策，手写）
 *   判决：3d/spec/mapping-ledger.json（每个 2.5D 函数一条，唯一真源）
 *   本工具只做机械归位：算系统、算层、校验目标、算汇总；**不猜状态**。
 *
 * 用法：
 *   node 3d/tools/build-mapping-ledger.cjs                  # 重建账本（保留已有判决）
 *   node 3d/tools/build-mapping-ledger.cjs --check           # 只校验（门禁用，漂移即 exit 1）
 *   node 3d/tools/build-mapping-ledger.cjs --src <2.5D 仓>   # 指定真源仓
 *   node 3d/tools/build-mapping-ledger.cjs --update-budget   # 收紧缺口预算（只许降）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SPEC = path.join(ROOT, '3d', 'spec');
const LAYERS_PATH = path.join(SPEC, 'mapping-layers.json');
const LEDGER_PATH = path.join(SPEC, 'mapping-ledger.json');
const MANIFEST_PATH = path.join(SPEC, 'port-manifest.json');
const GD_SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : '';
}
const SRC = path.resolve(argValue('--src') || path.join(ROOT, '..', '新返航录'));
const CHECK = args.includes('--check');
const UPDATE_BUDGET = args.includes('--update-budget');
const ALLOW_RISE = args.includes('--allow-budget-rise');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
}

function runJson(script, argv) {
  const r = spawnSync(process.execPath, [script, ...argv], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error('子进程失败：' + script + '\n' + (r.stderr || ''));
  }
  return JSON.parse(r.stdout);
}

function snake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]/g, '_').toLowerCase();
}

/* ---------- 分母 / 分子 ---------- */
function jsInventory() {
  const tool = path.join(SRC, 'tools', 'filemap-js.cjs');
  if (!fs.existsSync(tool)) throw new Error('缺少 2.5D 函数索引：' + tool);
  const j = runJson(tool, ['--json']);
  return {
    files: j.files.length,
    lines: j.files.reduce((a, f) => a + f.lines, 0),
    funcs: j.files.flatMap((f) =>
      f.funcs.map((x) => ({
        src: f.file + ':' + x.name, file: f.file, name: x.name, start: x.start, end: x.end,
      }))
    ),
  };
}

function gdInventory() {
  const j = runJson(path.join(ROOT, '3d', 'tools', 'filemap.cjs'), ['--json']);
  const byKey = new Map();
  const byName = new Map();
  for (const f of j.files) {
    for (const x of f.funcs) {
      const rec = { key: f.file + ':' + x.name, file: f.file, name: x.name, start: x.start };
      byKey.set(rec.key, rec);
      if (!byName.has(rec.name)) byName.set(rec.name, []);
      byName.get(rec.name).push(rec);
    }
  }
  return { byKey, byName };
}

/* ---------- 系统 → 层 ---------- */
function systemIndex(manifest, layers) {
  const fileSystem = new Map();
  const ranges = [];
  const systems = new Map(manifest.systems.map((s) => [s.id, s]));
  for (const s of manifest.systems) {
    for (const src of s.source || []) {
      if (Array.isArray(src.lines) && src.lines.length === 2) {
        ranges.push({ id: s.id, file: src.file, a: src.lines[0], b: src.lines[1] });
      } else if (!fileSystem.has(src.file)) {
        fileSystem.set(src.file, s.id);
      }
    }
  }
  return { fileSystem, ranges, systems, groupLayer: layers.group_layer, policy: layers.system_policy || {} };
}

function systemOf(file, start, idx) {
  const r = idx.ranges.find((x) => x.file === file && start >= x.a && start <= x.b);
  if (r) return r.id;
  return idx.fileSystem.get(file) || null;
}

/* ---------- 账本构建 ---------- */
function build() {
  const layers = readJson(LAYERS_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const idx = systemIndex(manifest, layers);
  const js = jsInventory();
  const prev = fs.existsSync(LEDGER_PATH) ? readJson(LEDGER_PATH) : null;
  const entryId = (e) => e.src + (e.occ ? '#' + e.occ : '');
  const prevBy = new Map(((prev && prev.entries) || []).map((e) => [entryId(e), e]));

  const entries = [];
  const added = [];
  const seen = new Map();
  for (const fn of js.funcs) {
    const occ = (seen.get(fn.src) || 0) + 1;
    seen.set(fn.src, occ);
    const id = occ === 1 ? fn.src : fn.src + '#' + occ;
    const system = systemOf(fn.file, fn.start, idx);
    const group = system ? idx.systems.get(system).group : '';
    const layer = idx.groupLayer[group] || 'UNCLASSIFIED';
    const old = prevBy.get(id);
    let status = 'unmapped';
    let target = '';
    let note = '';
    if (old) {
      status = old.status;
      target = old.target || '';
      note = old.note || '';
    } else {
      const pol = system ? idx.policy[system] : null;
      if (pol) {
        status = pol.status;
        note = pol.reason;
      } else {
        note = '新增函数待判决';
      }
      added.push(id);
    }
    const e = { src: fn.src };
    if (occ > 1) e.occ = occ;
    Object.assign(e, { system: system || '', layer, status, target, note });
    entries.push(e);
  }
  entries.sort((a, b) => (a.src + '#' + (a.occ || 1)).localeCompare(b.src + '#' + (b.occ || 1)));

  const extras = (prev && prev.extras) || [];
  const byStatus = {};
  const byLayer = {};
  for (const e of entries) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    byLayer[e.layer] = byLayer[e.layer] || { total: 0 };
    byLayer[e.layer].total++;
    byLayer[e.layer][e.status] = (byLayer[e.layer][e.status] || 0) + 1;
  }

  const gd = gdInventory();
  const missing = entries.filter(
    (e) => /^[\w./-]+\.gd:[A-Za-z_]\w*$/.test(e.target) && !gd.byKey.has(e.target)
  );

  return {
    ledger: {
      schema_version: 1,
      note:
        '总映射账本：2.5D 全部函数的唯一判决表。status 只认本表，门禁不再按函数名或正则猜。' +
        '新增函数由 build 自动登记为 unmapped，判决须手写并跑 npm run map:build。',
      denominator: { tool: 'tools/filemap-js.cjs', files: js.files, functions: js.funcs.length, lines: js.lines },
      budget: (prev && prev.budget) || { unmapped: byStatus.unmapped || 0, pending: byStatus.pending || 0 },
      extras,
      entries,
      summary: { total: entries.length, by_status: byStatus, by_layer: byLayer, targets_missing: missing.length },
    },
    added,
    missing,
    gd,
  };
}

/* ---------- 序列化：每条判决一行，便于 diff ---------- */
function serialize(l) {
  const q = (v) => JSON.stringify(v);
  const out = [];
  out.push('{');
  out.push('  "schema_version": 1,');
  out.push('  "note": ' + q(l.note) + ',');
  out.push('  "generated_by": "3d/tools/build-mapping-ledger.cjs",');
  out.push('  "denominator": ' + q(l.denominator) + ',');
  out.push('  "budget": ' + q(l.budget) + ',');
  out.push('  "extras": [');
  l.extras.forEach((e, i) => out.push('    ' + q(e) + (i < l.extras.length - 1 ? ',' : '')));
  out.push('  ],');
  out.push('  "entries": [');
  l.entries.forEach((e, i) => out.push('    ' + q(e) + (i < l.entries.length - 1 ? ',' : '')));
  out.push('  ],');
  const summary = JSON.stringify(l.summary, null, 1).split('\n');
  out.push('  "summary": ' + summary[0]);
  for (let i = 1; i < summary.length; i++) out.push('  ' + summary[i]);
  out.push('}');
  return out.join('\n') + '\n';
}

/* ---------- 反向覆盖：3D sim 里的函数要么有 2.5D 来源，要么登记为自有 ---------- */
const AGENT_FIELDS = [
  'alive', 'downed', 'ghost', 'ghostPts', 'knife', 'bullet', 'detained', 'redT', 'rushT',
  'sabUsed', 'deathCause', 'deathRoom', 'bodyPos', 'bodyGone', 'downedT', 'qual', 'medkit',
  'stunT', 'draggedBy', 'drag', 'searched', 'reported', 'sabRoom', 'sabT',
];
const WRITE_RE = new RegExp('\\["(' + AGENT_FIELDS.join('|') + ')"\\]\\s*=');
const SCRIPT_ROOT = path.join(ROOT, '3d', 'preview', 'scripts');

function reverseCoverage(ledger) {
  const targets = new Set(
    (ledger.entries || []).map((e) => e.target).filter((t) => /^[\w./-]+\.gd:[A-Za-z_]\w*$/.test(t))
  );
  const extras = new Set((ledger.extras || []).map((e) => e.target));
  const gd = gdInventory();
  const cache = new Map();
  const linesOf = (rel) => {
    if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(SCRIPT_ROOT, rel), 'utf8').split(/\r?\n/));
    return cache.get(rel);
  };
  const rows = [];
  for (const [key, rec] of gd.byKey) {
    if (!rec.file.startsWith('sim/')) continue;
    if (targets.has(key) || extras.has(key)) continue;
    const src = linesOf(rec.file);
    let end = rec.start;
    while (end < src.length && (src[end] === '' || /^\s/.test(src[end]))) end++;
    const body = src.slice(rec.start - 1, end).join('\n');
    const priv = rec.name.startsWith('_');
    if (priv && !WRITE_RE.test(body)) continue;
    rows.push(key);
  }
  return rows.sort();
}

function counts(l) {
  const s = l.summary.by_status;
  return (
    'MAP LEDGER ' + l.summary.total + ' 函数 · ' +
    ['ported', 'auto', 'adapter', 'not-applicable', 'pending', 'unmapped']
      .map((k) => k + ' ' + (s[k] || 0))
      .join(' / ')
  );
}

function diffEntries(a, b) {
  const id = (e) => e.src + (e.occ ? '#' + e.occ : '');
  const problems = [];
  const bm = new Map(b.map((e) => [id(e), e]));
  for (const e of a) {
    const x = bm.get(id(e));
    if (!x) { problems.push('新增未登记：' + id(e)); continue; }
    for (const k of ['status', 'target', 'note']) {
      if ((e[k] || '') !== (x[k] || '')) problems.push(id(e) + ' 的 ' + k + ' 与账本不一致');
    }
  }
  const am = new Map(a.map((e) => [id(e), e]));
  for (const e of b) if (!am.has(id(e))) problems.push('账本残留（2.5D 已无此函数）：' + id(e));
  return problems;
}

function main() {
  const { ledger, added, missing, gd } = build();
  const layers = readJson(LAYERS_PATH);
  const text = serialize(ledger);
  const s = ledger.summary.by_status;
  const unregistered = reverseCoverage(ledger);

  if (CHECK) {
    let ok = true;
    if (!fs.existsSync(LEDGER_PATH)) {
      console.error('[map] FAIL 缺少 3d/spec/mapping-ledger.json，先跑 npm run map:build');
      process.exit(1);
    }
    const committed = readJson(LEDGER_PATH);
    const problems = diffEntries(ledger.entries, committed.entries || []);
    if (problems.length) {
      ok = false;
      console.error('[map] FAIL 账本与 2.5D 现状不一致（' + problems.length + ' 项）：');
      for (const p of problems.slice(0, 12)) console.error('  - ' + p);
      if (problems.length > 12) console.error('  …共 ' + problems.length + ' 项；跑 npm run map:build 重建');
    }
    const b = committed.budget || {};
    for (const k of ['unmapped', 'pending']) {
      if ((s[k] || 0) > (b[k] || 0)) {
        ok = false;
        console.error('[map] FAIL ' + k + ' ' + (s[k] || 0) + ' 超过预算 ' + (b[k] || 0) + '（缺口只许收敛）');
      }
    }
    if (missing.length) {
      ok = false;
      console.error('[map] FAIL ' + missing.length + ' 个映射目标在 3D 里不存在：');
      for (const m of missing.slice(0, 10)) console.error('  - ' + m.src + ' → ' + m.target);
    }
    const rbudget = (layers.reverse || {}).budget_unregistered_sim;
    if (rbudget != null && unregistered.length > rbudget) {
      ok = false;
      console.error('[map] FAIL 3D sim 里新增 ' + (unregistered.length - rbudget) +
        ' 个既无 2.5D 来源、也未在 extras 登记的函数（' + unregistered.length + ' > 预算 ' + rbudget + '）：');
      for (const k of unregistered.slice(-10)) console.error('  - ' + k);
    }
    if (!ok) process.exit(1);
    // 系统/分层是机械字段：判决不变时不阻断，但要对齐 port-manifest，避免账本里的定位信息变旧。
    const cm = new Map((committed.entries || []).map((e) => [e.src + (e.occ ? '#' + e.occ : ''), e]));
    const meta = ledger.entries.filter((e) => {
      const c = cm.get(e.src + (e.occ ? '#' + e.occ : ''));
      return c && (c.system !== e.system || c.layer !== e.layer);
    });
    if (meta.length) {
      console.log('[map] WARN ' + meta.length + ' 条的系统/分层与当前 port-manifest 不一致（跑 npm run map:build 刷新；不影响判决）');
    }
    console.log(counts(ledger) + ' / 目标悬空 0 / 反向未登记 ' + unregistered.length +
      '（预算 ' + ((layers.reverse || {}).budget_unregistered_sim ?? '-') + '）/ 预算 ' + JSON.stringify(b));
    return;
  }

  fs.writeFileSync(LEDGER_PATH, text, 'utf8');
  console.log(counts(ledger));
  console.log('[map] 已写入 ' + path.relative(ROOT, LEDGER_PATH));
  console.log('[map] 反向未登记 sim 函数：' + unregistered.length + '（预算 ' +
    ((layers.reverse || {}).budget_unregistered_sim ?? '-') + '）');
  if (missing.length) {
    console.error('[map] 警告：' + missing.length + ' 个目标在 3D 里不存在');
    for (const m of missing.slice(0, 10)) console.error('  - ' + m.src + ' → ' + m.target);
  }
  if (added.length) {
    console.log('[map] 新增 ' + added.length + ' 个函数（默认 unmapped）：' + added.slice(0, 8).join(', ') + (added.length > 8 ? ' …' : ''));
  }
  if (UPDATE_BUDGET) {
    const before = ledger.budget;
    const next = { unmapped: s.unmapped || 0, pending: s.pending || 0 };
    if (!ALLOW_RISE && (next.unmapped > before.unmapped || next.pending > before.pending)) {
      console.error('[map] 拒绝抬升预算：' + JSON.stringify(before) + ' → ' + JSON.stringify(next) + '（缺口只许收敛；确需抬升加 --allow-budget-rise 并写 CHANGELOG 理由）');
      process.exit(1);
    }
    ledger.budget = next;
    fs.writeFileSync(LEDGER_PATH, serialize(ledger), 'utf8');
    console.log('[map] 预算已收紧：' + JSON.stringify(before) + ' → ' + JSON.stringify(next));
  }
  if (missing.length) process.exit(1);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[map] FAIL ' + e.message);
    process.exit(1);
  }
}

module.exports = {
  build, serialize, systemIndex, systemOf, snake, readJson,
  jsInventory, gdInventory, reverseCoverage, counts, LEDGER_PATH, LAYERS_PATH, MANIFEST_PATH, SRC, ROOT,
};
