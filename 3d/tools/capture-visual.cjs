/* 视觉证据采集：逐条跑 3d/spec/visual-cases.json，把游戏内截图收进
 *   3d/reports/visual/<时间戳>/<tag>.png + manifest.json
 *
 * 为什么单独一条链路（不是门禁）：
 *   Godot 的 `--headless` 用 dummy 渲染驱动，`get_viewport().get_texture().get_image()`
 *   实测返回 **null**（2026-11-14 探针确认），`main.gd:796` 也写着
 *   `if args.has("--shot") and DisplayServer.get_name() != "headless"`。
 *   所以截图只能在「有渲染」的进程里出图 —— 本机可以，CI runner 不行（要上 xvfb +
 *   软件渲染，渲染结果与真机不同，像素比对反而更容易假红）。
 *
 * 定位：**证据**，不是判据。
 *   判据走 headless 的状态断言（run_rule_fixtures / audit-rules），确定性强、能进 CI；
 *   截图负责「状态全对但画面不对」这一类：遮挡、裁切、贴图缺失、光照全黑、天花板没隐藏。
 *   出图后由视觉模型（Agent）看图给结论，写进同目录 visual-report.md。
 *
 * 用法：
 *   node 3d/tools/capture-visual.cjs               # 全部用例
 *   node 3d/tools/capture-visual.cjs --only meeting,blackout
 *   node 3d/tools/capture-visual.cjs --timeout 90
 *   CI=1 时直接 SKIP（无渲染环境），exit 0 —— 不假装验过。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('./run-record.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT = path.join(ROOT, '3d', 'preview');
const CASES = require(path.join(ROOT, '3d', 'spec', 'visual-cases.json')).cases;
const OUT_ROOT = path.join(ROOT, '3d', 'reports', 'visual');

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only=')) || args.find((a, i) => args[i - 1] === '--only');
const only = onlyArg
  ? String(onlyArg.includes('=') ? onlyArg.split('=')[1] : onlyArg).split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const TIMEOUT = (() => {
  const a = args.find((x) => x.startsWith('--timeout='));
  return a ? Number(a.split('=')[1]) : 90;
})();

const CANDIDATES = [
  process.env.GODOT_BIN,
  'E:/ai-tools/godot/Godot_v4.6-stable_win64.exe',
  'C:/Program Files/Godot/Godot_v4.6-stable_win64.exe',
  '/usr/local/bin/godot',
  '/usr/bin/godot',
  'godot',
].filter(Boolean);

if (process.env.CI) {
  console.log('[visual] SKIP CI 环境没有渲染上下文（headless 取不到帧缓冲），视觉证据只在本机采。');
  process.exit(0);
}

const godot = CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p) || p === 'godot';
  } catch (e) {
    return false;
  }
});
if (!godot) {
  console.error('[visual] 找不到 Godot（可用 GODOT_BIN 指定）。');
  process.exit(2);
}

/* 与 run-rule-fixtures 同口径：`SHOT_PATH=<绝对路径>`，由 main.gd 打印 */
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(OUT_ROOT, ts);
fs.mkdirSync(outDir, { recursive: true });

const picked = only ? CASES.filter((c) => only.includes(c.tag)) : CASES;
if (!picked.length) {
  console.error('[visual] 没有匹配的用例（--only 传了 ' + only.join(',') + '）');
  process.exit(2);
}

const results = [];
for (const c of picked) {
  const t0 = Date.now();
  const r = spawnSync(godot, ['--path', PROJECT, '--', ...(c.args || [])], {
    encoding: 'utf8',
    timeout: TIMEOUT * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = /SHOT_PATH=(.+)/.exec(out);
  const src = m ? m[1].trim() : '';
  const dst = path.join(outDir, c.tag + '.png');
  let ok = false;
  let why = '';
  if (!src) {
    why = '没打印 SHOT_PATH（多半是渲染上下文不可用或参数被吞）';
  } else if (!fs.existsSync(src)) {
    why = 'SHOT_PATH 指向的文件不存在：' + src;
  } else {
    fs.copyFileSync(src, dst);
    ok = fs.statSync(dst).size > 1024;
    if (!ok) why = '图片过小（<1KB），疑似空帧';
  }
  results.push({
    tag: c.tag,
    intent: c.intent,
    args: c.args || [],
    ok,
    why,
    png: ok ? path.relative(ROOT, dst).replace(/\\/g, '/') : '',
    bytes: ok ? fs.statSync(dst).size : 0,
    ms: Date.now() - t0,
  });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c.tag}  ${ok ? fs.statSync(dst).size + ' B' : why}`);
}

const manifest = {
  schema_version: 1,
  ts,
  code_sha: R.codeSha(),
  rules_sha: R.rulesSha(),
  engine: path.basename(godot),
  note: '视觉证据不进门禁；结论由视觉模型看图后写在同目录 visual-report.md。',
  verdict: results.every((x) => x.ok) ? 'captured' : 'incomplete',
  cases: results,
};
const mp = path.join(outDir, 'manifest.json');
fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const okN = results.filter((x) => x.ok).length;
console.log(
  `[visual] ${okN}/${results.length} 张已采集 · code_sha=${manifest.code_sha} · ${path
    .relative(ROOT, mp)
    .replace(/\\/g, '/')}`
);
process.exit(okN === results.length ? 0 : 1);
