#!/usr/bin/env node
/* 3D 全量只读门禁聚合（本工程自有工具）
 *
 * 为什么要自己串：npm 的 `&&` 串联会在第一个失败处停下，而红线 §一.4 要求报告写出
 * 「本次实跑 X 通过 / Y 失败」的完整读数。这里逐项跑完、不中断，最后统一汇总。
 *
 * 只调用只读 check 脚本，不写任何数据、不重导、不改变工作区。
 * 用法：node tools/check-all.cjs（或 npm run check）
 * 退出码：0 = 全绿；1 = 至少一项失败（失败项照样全部跑完）
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECKS = [
  ['3d:assets', '3d/tools/validate-assets.cjs'],
  ['3d:import:check', '3d/tools/check-godot-import.cjs'],
  ['3d:port:check', '3d/tools/check-port-manifest.cjs'],
  ['3d:events:check', '3d/tools/check-events.cjs'],
  ['3d:lines:check', '3d/tools/check-lines.cjs'],
  ['3d:parity:check', '3d/tools/check-parity.cjs'],
  ['3d:ui:check', '3d/tools/check-ui-spec.cjs'],
  // 大文件棘轮：单文件/单函数行数上限 + tests/ 外不得出现调试夹具（2026-11-12）
  ['file:check', '3d/tools/filemap.cjs', ['--check']],
  // 映射账本：2.5D 全部函数必须逐条有判决，缺口只许收敛（2026-11-13）
  ['map:check', '3d/tools/build-mapping-ledger.cjs', ['--check']],
  // 规则判定：按 3d/CORE_RULES.md 正文核对导出数值，不等即 FAIL（2026-11-14）
  ['audit:rules', '3d/tools/audit-rules.cjs', ['--check']],
];

const KEY = /(OK|FAIL|PASS|WARN|通过|失败|错误|差异|提醒|ERR )/;
const results = [];

for (const [name, script, args] of CHECKS) {
  const r = spawnSync(process.execPath, [script, ...(args || [])], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const code = r.status === null ? 1 : r.status;
  const text = ((r.stdout || '') + '\n' + (r.stderr || '')).split(/\r?\n/).filter(Boolean);
  const hints = text.filter(l => KEY.test(l)).slice(-3);
  results.push({ name, code });
  console.log(`── ${name} : ${code === 0 ? '通过' : '失败'} (exit ${code})`);
  hints.forEach(l => console.log('   ' + l.trim().slice(0, 160)));
  if (r.error) console.log('   进程错误：' + r.error.message);
}

const pass = results.filter(x => x.code === 0).length;
const fail = results.length - pass;
const d = new Date();
const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
console.log(`门禁汇总（${stamp} 实跑）：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项：' + results.filter(x => x.code !== 0).map(x => x.name).join('、'));
  console.log('按 AGENTS.md §一.4：如实记录本次读数，失败按回归处理，不得沿用旧读数。');
}
process.exit(fail ? 1 : 0);
