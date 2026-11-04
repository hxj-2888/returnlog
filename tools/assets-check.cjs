#!/usr/bin/env node
/* 资产清单与校验：贴图出仓后（见 .gitignore 的"载荷改造"段落），仓库里不再有这些
   字节，本机磁盘成了唯一副本。本工具生成 assets/MANIFEST.json（路径/字节/sha256），
   并能在任何时候回答"素材是否完好"——出仓的代价必须有对应的可验证性，否则只是把
   问题从"仓库太大"换成"素材会静默丢失"。
   用法：
     node tools/assets-check.cjs --write              生成/更新清单
     node tools/assets-check.cjs                       校验本机素材
     node tools/assets-check.cjs --manifest <path>     用指定清单校验（测试用）
     node tools/assets-check.cjs --from-git <ref>      列出可从 git 历史恢复的命令
   退出码：0 全部匹配；1 有缺失/不符；2 无清单（需 --write）。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(ROOT, 'assets', 'MANIFEST.json');

// 出仓素材的采集范围：与 .gitignore 里新增的三条规则一一对应
const GLOBS = [
  { dir: path.join(ROOT, 'assets', 'scene', 'v4', 'tex'), skip: ['door-panel.png'] },
  { dir: path.join(ROOT, '3d', 'preview', 'assets', 'textures'), skip: [] },
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function collect() {
  const out = [];
  for (const g of GLOBS) {
    if (!fs.existsSync(g.dir)) continue;
    for (const name of fs.readdirSync(g.dir).sort()) {
      if (g.skip.includes(name)) continue;
      const abs = path.join(g.dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      out.push({
        path: path.relative(ROOT, abs).replace(/\\/g, '/'),
        bytes: fs.statSync(abs).size,
        sha256: sha256(abs),
      });
    }
  }
  return out;
}

const args = process.argv.slice(2);
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = k => args.includes(k);

if (has('--write')) {
  const files = collect();
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const doc = {
    generated: new Date().toISOString(),
    note: '以下文件不入 git（.gitignore 的 2026-11-04 载荷改造段落），本机为唯一副本。'
      + '校验：node tools/assets-check.cjs；重生成：--write',
    restoreHint: '2026-11-04 之前入库过的版本仍可从 git 历史取回，见 --from-git',
    count: files.length,
    totalBytes: total,
    files,
  };
  fs.mkdirSync(path.dirname(DEFAULT_MANIFEST), { recursive: true });
  fs.writeFileSync(DEFAULT_MANIFEST, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('[assets] 清单已写入 ' + path.relative(ROOT, DEFAULT_MANIFEST)
    + '：' + files.length + ' 个文件 · ' + (total / 1048576).toFixed(1) + ' MB 出仓在外');
  process.exit(0);
}

if (has('--from-git')) {
  const ref = val('--from-git', '46aa05b');   // 出仓前的最后一个提交
  console.log('[assets] 从 ' + ref + ' 恢复：用 worktree，别用管道重定向（PowerShell 的 > 会重编码，二进制会坏）');
  console.log('  git worktree add ../returnlog-assets ' + ref);
  console.log('  Copy-Item ../returnlog-assets/assets/scene/v4/tex/* assets/scene/v4/tex/ -Exclude door-panel.png');
  console.log('  Copy-Item ../returnlog-assets/3d/preview/assets/textures/* 3d/preview/assets/textures/');
  console.log('  git worktree remove ../returnlog-assets');
  console.log('[assets] 拷回后跑本工具校验 sha256。');
  process.exit(0);
}

const manifestPath = val('--manifest', DEFAULT_MANIFEST);
if (!fs.existsSync(manifestPath)) {
  console.error('[assets] 没有清单：' + manifestPath + '；先跑 node tools/assets-check.cjs --write');
  process.exit(2);
}
const doc = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let missing = 0, wrong = 0;
const bytes = doc.files.length;
for (const f of doc.files) {
  const abs = path.join(ROOT, f.path);
  if (!fs.existsSync(abs)) { console.error('  缺失  ' + f.path); missing++; continue; }
  const st = fs.statSync(abs);
  if (st.size !== f.bytes) { console.error('  长度不符 ' + f.path + ' 期望 ' + f.bytes + ' 实际 ' + st.size); wrong++; continue; }
  if (sha256(abs) !== f.sha256) { console.error('  哈希不符 ' + f.path); wrong++; }
}
console.log('[assets] 校验 ' + doc.files.length + ' 个出仓素材：缺失 ' + missing + '，损坏 ' + wrong
  + '，完好 ' + (doc.files.length - missing - wrong));
if (missing || wrong) {
  console.error('[assets] 素材与清单不一致 —— 出仓的文件只在本机，先修复再继续发布。');
  process.exit(1);
}
console.log('[assets] ✓ 全部匹配（清单生成于 ' + doc.generated + '）');
