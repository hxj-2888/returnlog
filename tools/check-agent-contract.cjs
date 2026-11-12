#!/usr/bin/env node
/* 红线契约校验 —— 智能体指令文件改进方案 P3 / P4
 *
 * 用法：
 *   node tools/check-agent-contract.cjs
 *   node tools/check-agent-contract.cjs --compare "<另一仓 AGENTS.md 路径>"
 *
 * 校验：本仓 AGENTS.md §一 红线与 docs/REDLINES.md 逐字一致；
 *       传 --compare 时，再校验另一仓 §一 红线哈希与本仓一致。
 * 只读，不修改任何文件。两仓红线若漂移（如主仓新增条目未同步），退出码 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
function redlines(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => /^##\s+一、红线/.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trimEnd();
}
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

const agentPath = path.join(ROOT, 'AGENTS.md');
const basePath = path.join(ROOT, 'docs', 'REDLINES.md');
if (!fs.existsSync(agentPath)) {
  console.error('[agent-contract] FAIL 缺少 AGENTS.md');
  process.exit(1);
}
const cur = redlines(read(agentPath));
if (!cur) {
  console.error('[agent-contract] FAIL 未在 AGENTS.md 找到 §一 红线');
  process.exit(1);
}
if (argv.includes('--write')) {
  fs.mkdirSync(path.dirname(basePath), { recursive: true });
  fs.writeFileSync(basePath, cur + '\n', 'utf8');
  console.log('[agent-contract] 已生成 docs/REDLINES.md');
}
if (!fs.existsSync(basePath)) {
  console.error('[agent-contract] FAIL 缺少 docs/REDLINES.md（可加 --write 生成）');
  process.exit(1);
}
const base = read(basePath).trimEnd();

const h1 = hash(cur);
const h2 = hash(base);
const count = (cur.match(/^\d+\.\s/gm) || []).length;
console.log(`[agent-contract] AGENTS.md §一：${count} 条 / ${h1.slice(0, 16)}`);
console.log(`[agent-contract] REDLINES.md  ：${h2.slice(0, 16)}`);

let fail = false;
if (cur !== base) {
  console.error('[agent-contract] FAIL §一 与 docs/REDLINES.md 不一致');
  fail = true;
}
const ci = argv.indexOf('--compare');
if (ci >= 0 && argv[ci + 1]) {
  const p = argv[ci + 1];
  if (!fs.existsSync(p)) {
    console.error(`[agent-contract] FAIL 对比文件不存在：${p}`);
    fail = true;
  } else {
    const other = redlines(read(p));
    if (!other) {
      console.error('[agent-contract] FAIL 对比文件未找到 §一 红线');
      fail = true;
    } else {
      const h3 = hash(other);
      console.log(`[agent-contract] 对比仓 §一   ：${h3.slice(0, 16)}`);
      if (h3 !== h1) {
        console.error('[agent-contract] FAIL 两仓红线不一致，请同步 §一 后重跑');
        fail = true;
      }
    }
  }
}
console.log(fail ? '[agent-contract] 结果 FAIL' : '[agent-contract] 结果 PASS（红线与校验基准一致）');
process.exit(fail ? 1 : 0);
