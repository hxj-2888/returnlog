#!/usr/bin/env node
/* 运行留痕（2026-11-14）—— 每次判定都留一份可复核的 manifest。
 *
 * 为什么需要它：`audit:rules` 与 `3d:rules:test` 的结论此前只打到 stdout，
 * 关掉终端就没了。「这次真的跑过、跑的是哪份代码、哪份规则」无法复核，
 * 于是「先斩后奏」就没有凭据。
 *
 * 落点：3d/reports/runs/<kind>-latest.json（最近一次，供人看）
 *       3d/reports/runs/<kind>-history.jsonl（只增不改，供追溯）
 * 这些是生成物，已被 .gitignore 排除，不入库。
 *
 * verdict 三态（对齐 spec-kit bug 流程）：verified / partial / failed。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNS = path.join(ROOT, '3d', 'reports', 'runs');
const SCRIPTS = path.join(ROOT, '3d', 'preview', 'scripts');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** 代码指纹：3d/preview/scripts 下全部 .gd 的路径 + 内容，按路径排序后整体哈希。 */
function codeSha() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.gd')) files.push(p);
    }
  };
  if (!fs.existsSync(SCRIPTS)) return '';
  walk(SCRIPTS);
  files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(path.relative(ROOT, f).replace(/\\/g, '/'));
    h.update(fs.readFileSync(f));
  }
  return h.digest('hex').slice(0, 16);
}

/** 规则正文指纹：与 mapping-ledger 的 rules_source_sha256 同一口径（去 GENERATED 头）。 */
function rulesSha() {
  const p = path.join(ROOT, '3d', 'CORE_RULES.md');
  if (!fs.existsSync(p)) return '';
  const body = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/^<!-- GENERATED from[^\n]*-->\n\n?/, '');
  return sha256(body);
}

function record(kind, payload) {
  fs.mkdirSync(RUNS, { recursive: true });
  const row = Object.assign({
    kind,
    at: new Date().toISOString(),
    code_sha: codeSha(),
    rules_sha: rulesSha(),
    node: process.version,
  }, payload);
  const latest = path.join(RUNS, kind + '-latest.json');
  fs.writeFileSync(latest, JSON.stringify(row, null, 1) + '\n', 'utf8');
  fs.appendFileSync(path.join(RUNS, kind + '-history.jsonl'), JSON.stringify(row) + '\n', 'utf8');
  return latest;
}

module.exports = { record, codeSha, rulesSha, RUNS };

if (require.main === module) {
  const t = process.argv[2];
  if (!t) {
    console.log(JSON.stringify({ code_sha: codeSha(), rules_sha: rulesSha(), runs: RUNS }, null, 1));
    process.exit(0);
  }
  console.log('用法：node 3d/tools/run-record.cjs   # 打印当前代码/规则指纹');
}
