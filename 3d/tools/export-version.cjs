/* 版本单一真源导出：js/config/version.js + package.json → 3d/preview/data/version.json
 * 用法：node 3d/tools/export-version.cjs
 * fail-loud：SKConfig.version 与 package.json.gameVersion 不一致就退出码 1。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'preview', 'data', 'version.json');
const VER = 'js/config/version.js';
const PKG = 'package.json';
const sha1 = p => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);

const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, VER), 'utf8'))(win);
const C = win.SKConfig;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, PKG), 'utf8'));
if (!C || !C.version) throw new Error('SKConfig.version 取不到');
if (C.version !== pkg.gameVersion) {
  throw new Error(`版本漂移：${VER}=${C.version} / ${PKG}.gameVersion=${pkg.gameVersion}`);
}
const out = {
  schema_version: 1,
  name: C.name,
  version: C.version,
  build: C.build,
  license: C.license,
  repos: C.repos || {},
  semver: pkg.version,
  sources: { [VER]: sha1(path.join(ROOT, VER)), [PKG]: sha1(path.join(ROOT, PKG)) },
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`version.json 已生成：${C.version} / ${pkg.version} / build ${C.build}`);
