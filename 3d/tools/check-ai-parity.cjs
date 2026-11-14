/**
 * AI 引擎对照器（2026-11-14）
 *
 * 依据：`3d/CORE_RULES.md` 的「附录 A · AI 引擎释义」——按设计者裁定，它是
 * **3D 移植的验收判据（仅实现侧）**：判「3D 有没有照做」，不得用来改正文。
 *
 * 本工具做两层：
 *   ① 覆盖：附录 A 里的每条 H / A 编号，账本 `ai_parity.entries` 必须有对应条目；
 *      反过来，账本里多出来的编号（附录已删）算 STALE。
 *   ② 存在：每条条目声明的 `file` / `func` / `must` 都必须在 3D 实现里命中。
 *
 * 它判的是「机制在不在」，不是「行为对不对」—— 等价性由 `3d:ai:test` 的行为夹具
 * 与人工评审负责。别把这里的 OK 当成「AI 已经移植正确」。
 *
 * 用法：
 *   node 3d/tools/check-ai-parity.cjs            # 出表
 *   node 3d/tools/check-ai-parity.cjs --check    # 有缺失/悬空即 exit 1（门禁用）
 *   node 3d/tools/check-ai-parity.cjs --json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./build-mapping-ledger.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');
const DOC = path.join(ROOT, '3d', 'CORE_RULES.md');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const JSONOUT = args.includes('--json');

const ledger = JSON.parse(fs.readFileSync(B.LEDGER_PATH, 'utf8'));
const idx = ledger.ai_parity || { entries: [] };
const entries = idx.entries || [];

/* 附录 A 的编号清单：只认表格首列 `| H1 |` / `| A1 |` 形态。 */
function appendixIds() {
  if (!fs.existsSync(DOC)) return [];
  const text = fs.readFileSync(DOC, 'utf8');
  const i = text.indexOf('# 附录 A');
  if (i < 0) return [];
  const tail = text.slice(i);
  const ids = new Set();
  for (const m of tail.matchAll(/^\|\s*(H\d+|A\d+)\s*\|/gm)) ids.add(m[1]);
  return [...ids];
}

function bodyOf(text, fn) {
  const m = new RegExp('^func\\s+' + fn + '\\s*\\(', 'm').exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + 1);
  const next = /^func\s+/m.exec(rest);
  return next ? text.slice(m.index, m.index + 1 + next.index) : text.slice(m.index);
}

function hitsOf(text, re) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) out.push(i + 1);
  return out;
}

const want = appendixIds();
const have = entries.map((e) => e.id);
const missingIdx = want.filter((id) => !have.includes(id));
/* U* 是「效用表」条目：附录里的效用表用计划名（拉闸/破坏/…）而非 U 编号，
 * 所以只校验 H/A 的覆盖关系，U 系列不参与「悬空」判断。 */
const staleIdx = have.filter((id) => /^[HA]\d+$/.test(id) && !want.includes(id));

const rows = [];
for (const e of entries) {
  const p = path.join(SCRIPTS, e.file || '');
  if (!e.file || !fs.existsSync(p)) {
    rows.push({ id: e.id, title: e.title, ok: false, why: '文件不存在：' + (e.file || '(空)') });
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  let scope = text;
  if (e.func) {
    const body = bodyOf(text, e.func);
    if (!body) {
      rows.push({ id: e.id, title: e.title, ok: false, why: `${e.file} 里找不到 ${e.func}` });
      continue;
    }
    scope = body;
  }
  const bad = [];
  const ev = [];
  for (const pat of e.must || []) {
    let re;
    try {
      re = new RegExp(pat);
    } catch (err) {
      bad.push('正则写错：' + pat);
      continue;
    }
    const hit = hitsOf(scope, re);
    if (!hit.length) bad.push('缺少：' + pat);
    else ev.push(`${pat}@${hit[0]}`);
  }
  rows.push({
    id: e.id,
    title: e.title || '',
    ok: bad.length === 0,
    file: e.file,
    func: e.func || '',
    why: bad.length ? bad.join('；') : '',
    evidence: ev,
  });
}

const pass = rows.filter((r) => r.ok).length;
const fail = rows.length - pass;
const ok = fail === 0 && missingIdx.length === 0 && staleIdx.length === 0;

if (JSONOUT) {
  console.log(JSON.stringify({ appendix: want.length, indexed: entries.length, pass, fail, missingIdx, staleIdx, rows }, null, 1));
  process.exit(CHECK && !ok ? 1 : 0);
}

console.log(`[ai] 附录 A 编号 ${want.length} 条 · 账本索引 ${entries.length} 条 · 机制命中 ${pass} / 缺失 ${fail}`);
if (missingIdx.length) console.log('  FAIL 附录有、账本没有：' + missingIdx.join(' '));
if (staleIdx.length) console.log('  FAIL 账本有、附录没有（已删/改名）：' + staleIdx.join(' '));
for (const r of rows) {
  if (!r.ok) console.log(`  FAIL ${r.id} ${r.title}  ${r.why}`);
}
if (fail === 0 && !missingIdx.length && !staleIdx.length) {
  const groups = {};
  for (const r of rows) {
    const k = r.id[0] === 'H' ? '人类 H1–H15' : r.id[0] === 'A' ? '异形 A1–A9' : '效用表 U';
    groups[k] = (groups[k] || 0) + 1;
  }
  console.log('  OK   ' + Object.entries(groups).map(([k, v]) => `${k} ${v} 条`).join(' · '));
}
console.log('[ai] 口径：只判「机制在不在」，不判「行为等价」；等价看 3d:ai:test 与人工评审。');
process.exit(CHECK && !ok ? 1 : 0);
