#!/usr/bin/env node
/* 模块边界静态守卫（2026-11-23）
 *   1. js/view/* 只读 G，不得写入 G.<prop> = ...（除了表现缓存 G.taskKey）
 *   2. js/engine/audio.js 不得直接读写 window.G 或 document.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];

const viewDir = path.join(ROOT, 'js', 'view');
if (fs.existsSync(viewDir)) {
  for (const f of fs.readdirSync(viewDir)) {
    if (!f.endsWith('.js')) continue;
    const lines = fs.readFileSync(path.join(viewDir, f), 'utf8').split(/\r?\n/);
    lines.forEach((l, idx) => {
      if (/\bG\.[A-Za-z_]\w*\s*=[^=]/.test(l) && !/\bG\.(taskKey|waves|fx|clickFx|banner|devAt)\s*=/.test(l)) {
        errors.push(`js/view/${f}:${idx + 1} 疑似写入对局状态 G.*: ${l.trim()}`);
      }
    });
  }
}

const audioPath = path.join(ROOT, 'js', 'engine', 'audio.js');
if (fs.existsSync(audioPath)) {
  const src = fs.readFileSync(audioPath, 'utf8');
  if (/\bdocument\./.test(src)) errors.push('js/engine/audio.js 不得直接访问 document.');
}

const simDir = path.join(ROOT, 'js', 'sim');
if (fs.existsSync(simDir)) {
  for (const f of fs.readdirSync(simDir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(simDir, f), 'utf8');
    if (/\bdocument\./.test(src)) errors.push(`js/sim/${f} 不得直接访问 document.`);
  }
}

if (errors.length) {
  console.error('[boundary] FAIL:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('[boundary] PASS（表现层只读 / 音频与仿真层无 DOM 依赖）');
