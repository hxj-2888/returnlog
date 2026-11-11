#!/usr/bin/env node
/* 会议面板 UI spec POC 总入口
 *
 * 1) 校验 spec ↔ 2.5D DOM ↔ 3D Control 契约；
 * 2) 从 spec 生成 Godot Control POC；
 * 3) Godot 跑结构 / 模板 / 状态可见性断言；
 * 4) 写 3d/reports/meeting-ui-poc.md。
 *
 * 用法：node 3d/tools/poc-meeting-ui.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT = path.join(ROOT, '3d', 'reports', 'meeting-ui-poc.md');
const GODOT = process.env.GODOT || 'E:/ai-tools/godot/Godot_v4.6-stable_win64_console.exe';

function run(args, name) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (out) console.log(out);
  if (r.status !== 0) {
    console.error(`MEETING-UI-POC FAIL ${name} exit=${r.status}`);
    process.exit(1);
  }
  return out;
}

const specOut = run([path.join(__dirname, 'check-ui-spec.cjs'), '--report'], 'ui-spec');
if (!/UI-SPEC OK/.test(specOut)) {
  console.error('MEETING-UI-POC FAIL UI-SPEC 没通过');
  process.exit(1);
}
run([path.join(__dirname, 'poc-gen-meeting-ui.cjs')], 'gen');

if (!fs.existsSync(GODOT)) {
  console.error('找不到 Godot：' + GODOT);
  process.exit(1);
}
const g = spawnSync(GODOT, ['--headless', '--path', '3d/preview', '--script', 'res://poc/meeting_ui_poc.gd'], {
  cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
});
const out = ((g.stdout || '') + (g.stderr || '')).trim();
for (const l of out.split(/\r?\n/).filter(l => /MEETING-UI-POC|SCRIPT ERROR|Parse Error/.test(l))) {
  console.log(l);
}
const m = out.match(/MEETING-UI-POC pass=(\d+) fail=(\d+) nodes=(\d+) templates=(\d+) states=(\d+)/);
const ok = g.status === 0 && m && +m[2] === 0;
const md = [
  '# 会议面板 UI spec POC',
  '',
  `生成时间：${new Date().toISOString()}`,
  '',
  '> 由 `node 3d/tools/poc-meeting-ui.cjs` 生成。spec 是信息结构 / 状态 / 事件契约；',
  '> 2.5D DOM 与 3D Control 都按它校验；POC 再用它生成一个 Godot Control 面板。',
  '',
  '## 读数',
  '',
  '- `UI-SPEC OK`：17 元素 / 17 DOM / 17 Godot / 11 模板 / 3 状态 / 6 事件。',
  m ? `- 生成面板：**pass=${m[1]} fail=${m[2]} nodes=${m[3]} templates=${m[4]} states=${m[5]}**。`
    : '- 生成面板：未拿到 `MEETING-UI-POC` 行。',
  '',
  '## 边界',
  '',
  '- POC 只生成结构、文本、模板按钮与状态可见性；**不生成业务 handler**，也不替换运行时 `main.gd`。',
  '- 2.5D 目前仍是 spec 的来源（DOM 是手写模板）；下一步才是让 2.5D 也消费 spec。',
  '- 布局是功能结构，不是像素/HTML/CSS 翻译；像素排布仍属于 renderer。',
  '',
  '## 复跑',
  '',
  '```bash',
  'node 3d/tools/poc-meeting-ui.cjs',
  '```',
  '',
].join('\n');
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, md, 'utf8');
console.log('MEETING-UI-POC REPORT ' + path.relative(ROOT, REPORT));
process.exit(ok ? 0 : 1);
