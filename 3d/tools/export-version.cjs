/* 版本导出：3d/version.json（3D 自己的版本真源）
 *           + js/config/version.js + package.json（2.5D 移植基线，只读，写入 base 字段）
 *         → 3d/preview/data/version.json
 * 用法：node 3d/tools/export-version.cjs
 *
 * 为什么两份版本号：3D 是 2.5D 的延伸，但不是同一个发布物。共用「返航录V3.x」
 * 会让 issue / 提交 / 截图说不清说的是哪一套。3D 走 V1P-<major>.<minor>，
 * 2.5D 仍是 返航录V3.x，互不占号。
 *
 * fail-loud（任一不满足 → 退出码 1）：
 *   ① SKConfig.version 与 package.json.gameVersion 不一致（2.5D 自身漂移）
 *   ② 3d/version.json 的 version 不符合 V1P-<major>.<minor>
 *   ③ version 与 semver 的数字部分不一致（V1P-0.1 ↔ 0.1.0）
 *   ④ 3d/version.json 缺 product / channel / build
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'preview', 'data', 'version.json');
const SELF = '3d/version.json';
const VER = 'js/config/version.js';
const PKG = 'package.json';
/* 与 export-rules.cjs 同口径：读文本 + CRLF→LF 归一，避免工作区/检出换行差异误报 */
const sha1 = p =>
  crypto
    .createHash('sha1')
    .update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex')
    .slice(0, 12);

const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, VER), 'utf8'))(win);
const C = win.SKConfig;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, PKG), 'utf8'));
if (!C || !C.version) throw new Error('SKConfig.version 取不到');
if (C.version !== pkg.gameVersion) {
  throw new Error(`2.5D 版本漂移：${VER}=${C.version} / ${PKG}.gameVersion=${pkg.gameVersion}`);
}

const V3 = JSON.parse(fs.readFileSync(path.join(ROOT, SELF), 'utf8'));
for (const k of ['product', 'version', 'semver', 'channel', 'build']) {
  if (!V3[k]) throw new Error(`${SELF} 缺字段 ${k}`);
}
const m = /^V1P-(\d+)\.(\d+)$/.exec(V3.version);
if (!m) throw new Error(`${SELF}.version 不符合 V1P-<major>.<minor>：${V3.version}`);
if (V3.semver !== `${m[1]}.${m[2]}.0`) {
  throw new Error(`${SELF} 版本号不一致：version=${V3.version} / semver=${V3.semver}`);
}

const out = {
  schema_version: 2,
  name: C.name,
  product: V3.product,
  version: V3.version,
  semver: V3.semver,
  channel: V3.channel,
  build: V3.build,
  license: C.license,
  repos: C.repos || {},
  base: { version: C.version, semver: pkg.version },
  sources: {
    [SELF]: sha1(path.join(ROOT, SELF)),
    [VER]: sha1(path.join(ROOT, VER)),
    [PKG]: sha1(path.join(ROOT, PKG)),
  },
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(
  `version.json 已生成：${out.version} / ${out.semver}（preview）· 基线 ${out.base.version} / ${out.base.semver} · build ${out.build}`
);
