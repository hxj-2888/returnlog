#!/usr/bin/env node
/* 共享规范同步：2.5D 是唯一权威，3D 只生成镜像。
 *
 * 用法：
 *   node 3d/tools/sync-docs.cjs            # 生成 3D 镜像
 *   node 3d/tools/sync-docs.cjs --check    # 只校验，不写
 *   node 3d/tools/sync-docs.cjs --source "D:/path/to/新返航录"
 *
 * 生成：
 *   docs/REDLINES.md            ← 2.5D AGENTS.md §一（逐字，无额外头，兼容 agent:contract）
 *   docs/ASSET_GOVERNANCE.md    ← 2.5D docs/ASSET_GOVERNANCE.md（带 source_sha256 头，含层级表附录 B）
 *   3d/CORE_RULES.md            ← 2.5D docs/CORE_RULES.md（规则释义镜像，带 source_sha256 头）
 *
 * 不处理：
 *   docs/ASSET_CLEANUP_LOG.md   ← 各仓本地执行台账
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const si = argv.indexOf('--source');
const SOURCE = path.resolve(si >= 0 && argv[si + 1] ? argv[si + 1] : path.join(ROOT, '..', '新返航录'));

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function redlines(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^##\s+一、红线/.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trimEnd();
}
function ensure(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }
function fail(msg) { console.error('[docs-sync] FAIL ' + msg); process.exit(1); }

const srcAgent = path.join(SOURCE, 'AGENTS.md');
const srcGov = path.join(SOURCE, 'docs', 'ASSET_GOVERNANCE.md');
const srcRules = path.join(SOURCE, 'docs', 'CORE_RULES.md');
if (!fs.existsSync(srcAgent)) fail('源 AGENTS.md 不存在：' + srcAgent);
if (!fs.existsSync(srcGov)) fail('源 ASSET_GOVERNANCE.md 不存在：' + srcGov);
if (!fs.existsSync(srcRules)) {
  fail('源 docs/CORE_RULES.md 不存在：' + srcRules + '（规则释义由 2.5D 先落地并推送，3D 只做镜像）');
}

const srcRedlines = redlines(read(srcAgent));
if (!srcRedlines) fail('源 AGENTS.md 未找到 §一');
const localAgent = redlines(read(path.join(ROOT, 'AGENTS.md')));
if (!localAgent) fail('本仓 AGENTS.md 未找到 §一');

const redPath = path.join(ROOT, 'docs', 'REDLINES.md');
const govPath = path.join(ROOT, 'docs', 'ASSET_GOVERNANCE.md');
const srcGovText = read(srcGov);
const govHash = sha(srcGovText);
const govHeader = `<!-- GENERATED from 新返航录/docs/ASSET_GOVERNANCE.md @ sha256:${govHash}; do not edit; run npm run docs:sync -->\n\n`;
const rulesPath = path.join(ROOT, '3d', 'CORE_RULES.md');
const srcRulesText = read(srcRules);
const rulesHash = sha(srcRulesText);
const rulesHeader = `<!-- GENERATED from 新返航录/docs/CORE_RULES.md @ sha256:${rulesHash}; do not edit; run npm run docs:sync -->\n\n`;

let ok = true;
if (localAgent !== srcRedlines) {
  console.error('[docs-sync] FAIL 本仓 AGENTS.md §一 与 2.5D 不一致；先同步红线，再跑本脚本');
  ok = false;
}

if (CHECK) {
  const curRed = fs.existsSync(redPath) ? read(redPath).trimEnd() : '';
  if (curRed !== srcRedlines) {
    console.error('[docs-sync] FAIL docs/REDLINES.md 与 2.5D §一 不一致');
    ok = false;
  }
  if (!fs.existsSync(govPath)) {
    console.error('[docs-sync] FAIL docs/ASSET_GOVERNANCE.md 缺失');
    ok = false;
  } else {
    const cur = read(govPath);
    const m = cur.match(/^<!-- GENERATED from 新返航录\/docs\/ASSET_GOVERNANCE\.md @ sha256:([0-9a-f]{64});[^\n]*-->\n\n/);
    if (!m) {
      console.error('[docs-sync] FAIL docs/ASSET_GOVERNANCE.md 缺少 GENERATED 头');
      ok = false;
    } else if (m[1] !== govHash) {
      console.error('[docs-sync] FAIL docs/ASSET_GOVERNANCE.md source_sha256 过期');
      ok = false;
    } else if (cur.slice(m[0].length) !== srcGovText) {
      console.error('[docs-sync] FAIL docs/ASSET_GOVERNANCE.md 正文与 2.5D 不一致');
      ok = false;
    }
  }
  if (!fs.existsSync(rulesPath)) {
    console.error('[docs-sync] FAIL 3d/CORE_RULES.md 缺失');
    ok = false;
  } else {
    const cur = read(rulesPath);
    const m = cur.match(/^<!-- GENERATED from 新返航录\/docs\/CORE_RULES\.md @ sha256:([0-9a-f]{64});[^\n]*-->\n\n/);
    if (!m) {
      console.error('[docs-sync] FAIL 3d/CORE_RULES.md 缺少 GENERATED 头');
      ok = false;
    } else if (m[1] !== rulesHash) {
      console.error('[docs-sync] FAIL 3d/CORE_RULES.md source_sha256 过期');
      ok = false;
    } else if (cur.slice(m[0].length) !== srcRulesText) {
      console.error('[docs-sync] FAIL 3d/CORE_RULES.md 正文与 2.5D 不一致');
      ok = false;
    }
  }
  console.log(ok ? '[docs-sync] PASS 共享规范与 2.5D 一致' : '[docs-sync] 结果 FAIL');
  process.exit(ok ? 0 : 1);
}

ensure(redPath);
fs.writeFileSync(redPath, srcRedlines + '\n', 'utf8');
ensure(govPath);
fs.writeFileSync(govPath, govHeader + srcGovText, 'utf8');
ensure(rulesPath);
fs.writeFileSync(rulesPath, rulesHeader + srcRulesText, 'utf8');
console.log('[docs-sync] 已生成 docs/REDLINES.md');
console.log('[docs-sync] 已生成 docs/ASSET_GOVERNANCE.md（source_sha256 ' + govHash.slice(0, 12) + '）');
console.log('[docs-sync] 已生成 3d/CORE_RULES.md（source_sha256 ' + rulesHash.slice(0, 12) + '）');
console.log('[docs-sync] 源：' + SOURCE);
