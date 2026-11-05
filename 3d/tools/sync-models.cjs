#!/usr/bin/env node
/* 把仓库级资产库 3d/assets/export/*.glb 同步到 Godot 工程的 res:// 里。
 *
 * 为什么要复制而不是让 Godot 直接读仓库根目录：
 *   Godot 的 res:// 根是 3d/preview，工程外的文件它看不到；
 *   而资产库要独立于编辑器工程存在（分支、备份、许可都一样）。
 *   所以「仓库级真源 → 工程级副本」这一步必须脚本化，不能靠手动拖。
 *
 * 只复制清单里 status = done / wip 且导出物真实存在的项；
 * 用 sha1 比对，内容一致就跳过，不制造无意义的 git 改动。
 *
 * 与 `3d/tools/sync-assets.cjs`（启航路 3D 版分支上的贴图同步）分工：
 *   那个管贴图/角色图，这个管 .glb 模型。两者不共用文件名，合并分支时不会打架。
 *
 * 用法：node 3d/tools/sync-models.cjs [--force] [--dry]
 * 退出码：0 成功；1 清单校验失败或文件缺失。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(root, '3d', 'spec', 'assets.manifest.json');
const srcDir = path.join(root, '3d', 'assets', 'export');
const dstDir = path.join(root, '3d', 'preview', 'assets', 'models');

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force');
const sha1 = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');

const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rows = [];

for (const a of man.assets) {
  if (!['done', 'wip'].includes(a.status)) continue;
  const src = path.join(root, '3d', 'assets', a.export);
  const dst = path.join(dstDir, path.basename(a.export));
  if (!fs.existsSync(src)) {
    if (a.status === 'done') { console.error('[3d:sync] ERROR done 资产缺导出物：' + a.id); process.exit(1); }
    rows.push({ id: a.id, action: 'skip', why: 'no-export' });
    continue;
  }
  const s = sha1(src);
  const d = fs.existsSync(dst) ? sha1(dst) : null;
  const same = d === s;
  rows.push({ id: a.id, action: same && !force ? 'same' : (dry ? 'would-copy' : 'copy'), sha1: s.slice(0, 12) });
  if (!(same && !force) && !dry) {
    fs.mkdirSync(dstDir, { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

console.log('== 3D 资产同步 ==');
console.log('  源 ' + path.relative(root, srcDir).replace(/\\/g, '/'));
console.log('  目标 ' + path.relative(root, dstDir).replace(/\\/g, '/'));
for (const r of rows) console.log('  ' + r.id.padEnd(28) + r.action + (r.why ? ' (' + r.why + ')' : ''));
if (!rows.length) console.log('  还没有可同步的资产（清单里全是 todo）。');
console.log(dry ? '[3d:sync] 预演，未写文件' : '[3d:sync] 完成');
