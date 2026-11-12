#!/usr/bin/env node
/* CI 专用的 2.5D 只读基线校验 —— 只适配「仓库检出」场景，不改任何判定规则。
 *
 * 为什么需要它：`tools/sync-baseline.cjs --check` 的快照是在 Windows 工作区生成的，
 * 直接上 Linux runner 会 58 项假红（2026-11-12 实测）：
 *   ① 55 个 assets/scene/v4/facility/_raw/*.png 被 .gitignore 排除（只在本机留档），
 *      CI 检出后不存在 → 被判「缺失」；
 *   ② 3 个 LICENSE.txt 本地是 CRLF，Git 检出为 LF → sha256 不同 → 被判「被改动」。
 *
 * 本脚本的处理：
 *   · 缺失但被 `git check-ignore` 覆盖的文件 → 跳过（本机专属素材，CI 本来就没有）；
 *   · 文本文件同时接受 CRLF / LF 两种换行（同一份内容的两种检出形态）；
 *   · 其余仍逐文件比对 sha256 —— 已入库的基线文件被手改，依然会失败。
 *
 * 口径真源仍是主仓 `tools/sync-baseline.cjs`；本文件只是 CI 适配层，
 * 不修改、不替代本机的 `npm run baseline:check`。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SPEC_PATH = path.join(ROOT, 'BASELINE.sha256.json');
if (!fs.existsSync(SPEC_PATH)) {
  console.error('BASELINE-CI FAIL 找不到 BASELINE.sha256.json');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const files = spec.files || {};
const paths = Object.keys(files);

/* 批量问 git 哪些路径被忽略：一次进程，407 条路径走 stdin。 */
const ignored = new Set();
const gi = spawnSync('git', ['check-ignore', '--stdin'], {
  cwd: ROOT,
  input: paths.join('\n'),
  encoding: 'utf8',
});
if (gi.status === 0 || gi.status === 1) {
  for (const line of String(gi.stdout || '').split('\n')) {
    const p = line.trim().replace(/\\/g, '/');
    if (p) ignored.add(p);
  }
}

const TEXT_RE = /\.(txt|md|markdown|js|cjs|mjs|json|html|htm|css|yml|yaml|gd|py|ps1|sh|xml|svg|toml|ini|cfg)$/i;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let ok = 0;
let skipped = 0;
const fails = [];
for (const rel of paths) {
  const abs = path.join(ROOT, rel);
  const want = files[rel].sha256;
  if (!fs.existsSync(abs)) {
    if (ignored.has(rel)) {
      skipped++;
      continue;
    }
    fails.push('缺失 ' + rel);
    continue;
  }
  const buf = fs.readFileSync(abs);
  if (sha256(buf) === want) {
    ok++;
    continue;
  }
  if (TEXT_RE.test(rel)) {
    const lf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'), 'utf8');
    if (sha256(lf) === want || sha256(crlf) === want) {
      ok++;
      continue;
    }
  }
  fails.push('被改动 ' + rel);
}

console.log('BASELINE-CI ' + (fails.length ? 'FAIL' : 'OK')
  + ' 通过 ' + ok + ' · 跳过(本机专属/git 忽略) ' + skipped + ' · 失败 ' + fails.length);
for (const f of fails.slice(0, 40)) console.log('  ' + f);
if (fails.length > 40) console.log('  …… 另有 ' + (fails.length - 40) + ' 项');
process.exit(fails.length ? 1 : 0);
