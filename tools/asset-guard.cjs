#!/usr/bin/env node
/* 资产治理门禁 —— docs/ASSET_GOVERNANCE.md §6 / §10
 *
 * 用法：
 *   node tools/asset-guard.cjs              发布体积 / 白名单污染 / 运行时大图
 *   node tools/asset-guard.cjs --expired    列出超过保留期的 L2 / L3 批次（只报告，不删除）
 *
 * 退出码：发布体积 > 50 MB 或白名单内出现非运行时资产 → 1；其余为警告，不阻断。
 * 与 tools/deploy-pages.cjs 共用 tools/deploy-config.cjs，避免两处规则漂移。
 * 本脚本只读，绝不删除任何文件；清理必须走规范 §9 六步并经用户确认。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ENTRIES, SKIP } = require('./deploy-config.cjs');

const ROOT = path.resolve(__dirname, '..');
const MAX_PUB_MB = 50;    // 规范 §6：P0 发布包上限
const MAX_BITMAP_MB = 1;  // 规范 §6：单张运行时位图上限
const EXPIRED = process.argv.includes('--expired');
const DAY = 86400000;

/* 不允许出现在发布包内的层级（即使文件存在，也必须被 SKIP 排除） */
const FORBIDDEN = [
  [/^assets\/qwen-lib\/.*\.png$/, 'L1 烘焙源材质'],
  [/^assets\/scene\/v4\/tex\/(?!door-panel\.png$)/, 'L1 源材质'],
  [/^assets\/scene\/v4\/facility\/_raw(_fx)?\//, 'L2 渲染中间帧'],
  [/(^|\/)screenshots\//, 'L2 调试截图'],
  [/^_backup\//, 'L3 退役备份'],
  [/(^|\/)_bak\//, 'L3 旧版备份'],
  [/\.blend1$/, 'L3 Blender 自动备份'],
  [/(^|\/)\.godot\/|(^|\/)__pycache__\/|\.pyc$|\.log$|\.err$/, 'L4 缓存'],
  [/\.md$/, 'L5 文档'],
];
const BITMAP = /\.(png|jpe?g|webp)$/i;

const RETENTION = [
  { name: 'L3 退役/暂关备份 _backup/', re: /^_backup\//, days: 30 },
  { name: 'L3 时间戳迭代备份 tools/_bak/', re: /^tools\/_bak\//, days: 30 },
  { name: 'L3 Blender 自动备份 .blend1', re: /\.blend1$/, days: 30 },
  { name: 'L2 原始帧 _raw/_raw_fx', re: /(^|\/)_raw(_fx)?\//, days: 14 },
  { name: 'L2 调试截图 screenshots/', re: /(^|\/)screenshots\//, days: 14 },
];

function mb(n) { return (n / 1048576).toFixed(2); }
function norm(p) { return p.split(path.sep).join('/'); }

function walk(roots, cb) {
  const visit = (rel) => {
    const abs = path.join(ROOT, rel);
    let st;
    try { st = fs.statSync(abs); } catch { return; }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs)) visit(norm(path.join(rel, name)));
      return;
    }
    cb({ rel: norm(rel), size: st.size, mtime: st.mtimeMs });
  };
  roots.forEach(visit);
}

function guardPublish() {
  const files = [];
  walk(ENTRIES, (f) => {
    if (SKIP.some(re => re.test(f.rel))) return;
    files.push(f);
  });
  const total = files.reduce((s, f) => s + f.size, 0);
  const pollution = [];
  for (const f of files) {
    for (const [re, label] of FORBIDDEN) {
      if (re.test(f.rel)) { pollution.push(`${f.rel} (${label})`); break; }
    }
  }
  const big = files.filter(f => BITMAP.test(f.rel) && f.size > MAX_BITMAP_MB * 1048576)
                   .sort((a, b) => b.size - a.size);

  console.log(`[guard] 发布包 ${files.length} 个文件 / ${mb(total)} MB（上限 ${MAX_PUB_MB} MB）`);
  console.log(`[guard] 白名单污染 ${pollution.length} 项`);
  pollution.slice(0, 20).forEach(x => console.log('  - ' + x));
  console.log(`[guard] 运行时位图 >${MAX_BITMAP_MB} MB：${big.length} 个`);
  big.slice(0, 15).forEach(f => console.log(`  - ${f.rel} ${mb(f.size)} MB`));

  let fail = false;
  if (total > MAX_PUB_MB * 1048576) {
    console.error(`[guard] FAIL 发布包超过 ${MAX_PUB_MB} MB 上限`);
    fail = true;
  }
  if (pollution.length) {
    console.error('[guard] FAIL 白名单内存在非运行时资产，请同步 tools/deploy-config.cjs');
    fail = true;
  }
  if (big.length) console.log('[guard] WARN 大图属 P4 资产优化项，不阻断本次发版');
  console.log(fail ? '[guard] 结果 FAIL' : '[guard] 结果 PASS');
  process.exit(fail ? 1 : 0);
}

function guardExpired() {
  const now = Date.now();
  const all = [];
  walk(['_backup', 'tools', 'assets', 'docs', '3d'], f => all.push(f));
  console.log('[guard:expired] 超保留期批次（只报告，不删除；清理须走规范 §9 六步）');
  console.log('[guard:expired] 例外：3d/preview/.godot/imported/*.ctex 与 *-c0/c1/c2.png 属运行时依赖，禁止清理（规范 §8B）');
  let found = 0;
  for (const r of RETENTION) {
    const hit = all.filter(f => r.re.test(f.rel) && (now - f.mtime) > r.days * DAY);
    if (!hit.length) continue;
    found += hit.length;
    const bytes = hit.reduce((s, f) => s + f.size, 0);
    console.log(`  ${r.name}：${hit.length} 个 / ${mb(bytes)} MB / 保留期 ${r.days} 天`);
  }
  if (!found) console.log('  无超期批次');
  console.log('[guard:expired] 逐文件明细见 docs/ASSET_GOVERNANCE.md 附录 B 与清理台账');
}

if (EXPIRED) guardExpired(); else guardPublish();
