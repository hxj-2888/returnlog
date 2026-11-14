/**
 * 符号类规则的静态断言器（2026-11-14）
 *
 * 为什么需要：112 条规则里有 11 条 verifier=symbolic —— 判据是「存在/形态/顺序」，
 * 静态可查，不必跑一局。以前它们只连了 `targets`（符号），没有任何判定器，
 * 等于「登记了但没人查」。这个工具把那 11 条变成会红的检查。
 *
 * 判据来自账本 `rules[].sym`：
 *   { file: "sim/sim_state.gd", func: "check_win", must: [...], must_not: [...], why }
 *   · file   相对 3d/preview/scripts
 *   · func   可选；给了就只在那个函数体内找（避免「别处有一句」冒充）
 *   · must   全部必须命中（正则）
 *   · must_not 一条都不许命中（正则）——用来查「不该有的过滤/分支」，比如 check_win 不得再过滤 downed
 *
 * 口径：只判「机制在不在、形态对不对」，不判「行为等价」。等价靠 3d:rules:test / 3d:ai:test
 * 与人工评审。别把这个工具的输出当成正确性证明。
 *
 * 用法：
 *   node 3d/tools/check-symbolic.cjs            # 出表
 *   node 3d/tools/check-symbolic.cjs --check    # 有 FAIL 即 exit 1（门禁用）
 *   node 3d/tools/check-symbolic.cjs --json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-mapping-ledger.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const JSONOUT = args.includes('--json');

const ledger = JSON.parse(fs.readFileSync(B.LEDGER_PATH, 'utf8'));
const rules = (ledger.rules || []).filter((r) => r.verifier === 'symbolic');

/** 取函数体：从 `func name(` 到下一个顶层 `func `。找不到返回 null。 */
function bodyOf(text, fn) {
  const m = new RegExp('^func\\s+' + fn + '\\s*\\(', 'm').exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + 1);
  const next = /^func\s+/m.exec(rest);
  return next ? text.slice(m.index, m.index + 1 + next.index) : text.slice(m.index);
}

/** 命中行号（1-based，相对整文件）。 */
function hitsOf(text, re) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) out.push(i + 1);
  return out;
}

const rows = [];
for (const r of rules) {
  const sym = r.sym;
  if (!sym) {
    rows.push({ id: r.id, ok: false, why: 'symbolic 规则没有 sym 断言（登记了但没人查）' });
    continue;
  }
  const p = path.join(SCRIPTS, sym.file);
  if (!fs.existsSync(p)) {
    rows.push({ id: r.id, ok: false, why: '文件不存在：' + sym.file });
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  let scope = text;
  if (sym.func) {
    const body = bodyOf(text, sym.func);
    if (!body) {
      rows.push({ id: r.id, ok: false, why: `${sym.file} 里找不到函数 ${sym.func}` });
      continue;
    }
    scope = body;
  }
  const bad = [];
  const ev = [];
  for (const pat of sym.must || []) {
    let re;
    try {
      re = new RegExp(pat);
    } catch (e) {
      bad.push('正则写错：' + pat);
      continue;
    }
    const hit = hitsOf(scope, re);
    if (!hit.length) bad.push('缺少：' + pat);
    else ev.push(`${pat} @${hit[0]}`);
  }
  for (const pat of sym.must_not || []) {
    let re;
    try {
      re = new RegExp(pat);
    } catch (e) {
      bad.push('正则写错：' + pat);
      continue;
    }
    const hit = hitsOf(scope, re);
    if (hit.length) bad.push(`不该出现：${pat} @${hit[0]}`);
  }
  rows.push({
    id: r.id,
    ok: bad.length === 0,
    file: sym.file,
    func: sym.func || '',
    why: bad.length ? bad.join('；') : sym.why || '',
    evidence: ev,
  });
}

const pass = rows.filter((x) => x.ok).length;
const fail = rows.length - pass;

if (JSONOUT) {
  console.log(JSON.stringify({ total: rows.length, pass, fail, rows }, null, 1));
  process.exit(CHECK && fail ? 1 : 0);
}

console.log(`[sym] 符号类规则 ${rows.length} 条 · PASS ${pass} / FAIL ${fail}`);
for (const x of rows) {
  if (x.ok) {
    console.log(`  OK   ${x.id}  ${x.file}${x.func ? '#' + x.func : ''}  ${x.why}`);
  } else {
    console.log(`  FAIL ${x.id}  ${x.why}`);
  }
}
if (fail) {
  console.log('[sym] 说明：这类断言只覆盖「存在于形态」，不证明行为等价；');
  console.log('[sym] 修法优先改实现（补回机制），不是改断言去迁就现状。');
}
process.exit(CHECK && fail ? 1 : 0);
