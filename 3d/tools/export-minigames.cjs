#!/usr/bin/env node
/* 把 2.5D 的小游戏真源导出成 3D 端可读的 JSON。
 *
 * 真源：
 *   js/t2/minigame.js#SKMiniGame.data  —— 任务名→玩法、动作兜底、提示、保底时长
 *   js/data/plates.js#SKPlates         —— 图内要素板（断口坐标 / 电线路径）
 *
 * 输出：3d/preview/data/minigames.json
 *      3d/preview/assets/plates/*.png（板图副本，路径改写为 res://）
 *
 * 用法：node 3d/tools/export-minigames.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const repo = path.resolve(__dirname, '..', '..');
const outDir = path.join(repo, '3d', 'preview', 'data');
const outFile = path.join(outDir, 'minigames.json');
const plateDir = path.join(repo, '3d', 'preview', 'assets', 'plates');

const stubEl = () => ({
  style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
  appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector() { return null; }
});
const sandbox = {
  window: {},
  document: {
    addEventListener() {},
    createElement: stubEl,
    createElementNS: stubEl,
    head: { appendChild() {} },
    body: { appendChild() {} },
  },
  performance: { now: () => 0 },
  requestAnimationFrame() { return 0; },
  cancelAnimationFrame() {},
  setTimeout() { return 0; },
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(rel) {
  const file = path.join(repo, rel);
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
  return { file, hash: crypto.createHash('sha1').update(code).digest('hex').slice(0, 12) };
}

const miniSrc = load('js/t2/minigame.js');
const plateSrc = load('js/data/plates.js');

const mini = sandbox.SKMiniGame && sandbox.SKMiniGame.data;
const plates = sandbox.SKPlates;
if (!mini) throw new Error('SKMiniGame.data 不存在：2.5D 小游戏没有暴露只读数据出口');
if (!plates) throw new Error('SKPlates 不存在');

const errors = [];
for (const kind of mini.kinds) {
  if (!mini.hint[kind]) errors.push(`玩法 ${kind} 缺 HINT 文案`);
}
for (const [label, kind] of Object.entries(mini.byLabel)) {
  if (!mini.kinds.includes(kind)) errors.push(`任务「${label}」映射到未知玩法 ${kind}`);
}
for (const kind of Object.values(mini.arch)) {
  if (!mini.kinds.includes(kind)) errors.push(`动作兜底映射到未知玩法 ${kind}`);
}
if (mini.kinds.length < 10) errors.push(`玩法数量应 ≥10，实际 ${mini.kinds.length}`);
const tasks = mini.tasks || {};
if (Object.keys(tasks).length !== 26) errors.push(`任务定制数应为 26，实际 ${Object.keys(tasks).length}`);
for (const [label, cfg] of Object.entries(tasks)) {
  if (!mini.kinds.includes(cfg.k)) errors.push(`任务「${label}」使用未知玩法 ${cfg.k}`);
  if (!cfg.hint) errors.push(`任务「${label}」缺独立提示`);
}
if (errors.length) {
  console.error('[3d] 小游戏数据校验失败：\n  ' + errors.join('\n  '));
  process.exit(1);
}

/* 板图复制到 3D 工程内：Godot 只能读 res://，不能沿着 ../.. 出工程。
   版式坐标仍是原图像素，不改任何数值，只改运行时路径。 */
fs.mkdirSync(plateDir, { recursive: true });
const exportedPlates = {};
for (const [id, p] of Object.entries(plates.plates)) {
  const src = path.join(repo, p.image);
  if (!fs.existsSync(src)) {
    console.warn(`[3d] 板图缺失，跳过：${p.image}`);
    continue;
  }
  const base = path.basename(p.image);
  fs.copyFileSync(src, path.join(plateDir, base));
  exportedPlates[id] = Object.assign({}, p, {
    image: `res://assets/plates/${base}`,
    imageSource: p.image,
  });
}

const out = {
  schema_version: 1,
  generatedBy: '3d/tools/export-minigames.cjs',
  sources: { minigame: miniSrc.hash, plates: plateSrc.hash },
  kinds: mini.kinds,
  tasks: tasks,
  byLabel: mini.byLabel,
  arch: mini.arch,
  hint: mini.hint,
  fallback: mini.fallback,
  plates: {
    schema: plates.schema,
    plates: exportedPlates,
    byLabel: plates.byLabel,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('[3d] minigames.json ->', path.relative(repo, outFile));
console.log('[3d] kinds=%d labels=%d plates=%d',
  out.kinds.length, Object.keys(out.byLabel).length, Object.keys(exportedPlates).length);
