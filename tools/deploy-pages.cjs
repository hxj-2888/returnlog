/* Cloudflare Pages 部署：白名单暂存 + wrangler pages deploy。
 * 用法： node tools/deploy-pages.cjs [--dry-run]
 * 依赖： wrangler（PATH 或 WRANGLER_CMD 指向 wrangler.cmd）+ CLOUDFLARE_API_TOKEN/ACCOUNT_ID
 *
 * 为什么要暂存：项目根带着 android/（37MB 的 www 副本）、tools/、assets/scene/v4/tex（20MB 烘焙源材质）
 * 与 .git，直接 deploy 会把它们全推上去，既慢又容易撞 Pages 的 25MiB 单文件限制。
 * 白名单只带运行时真正会读的文件；v4/tex 只留 door-panel.png（drawDoors 会采样）。
 * 2026-11-11 治理：assets/qwen-lib/*.png（78 MB 烘焙源）与 facility/_raw_fx/（渲染中间帧）
 * 也已加入 SKIP——它们被 .gitignore 声明「只在本机留档」，此前白名单漏排除导致发布包 124.85 MB。
 * 口径见 docs/ASSET_GOVERNANCE.md；规则真源 tools/deploy-config.cjs；发版前跑 npm run guard。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = process.env.CF_PROJECT || 'returnlog';
const DRY = process.argv.includes('--dry-run');

/* 白名单单一真源：与 tools/asset-guard.cjs 共用 tools/deploy-config.cjs，
 * 避免「.gitignore 已排除、部署白名单却没排除」的规则漂移。
 * 依据 docs/ASSET_GOVERNANCE.md §3 / §7；3D 版 tools/ 属只读基线，需走 baseline:sync。 */
const { ENTRIES, SKIP } = require('./deploy-config.cjs');

function stage(dst) {
  let n = 0, bytes = 0;
  const copy = (rel) => {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) return;
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(src)) copy(path.join(rel, name).replace(/\\/g, '/'));
      return;
    }
    const norm = rel.replace(/\\/g, '/');
    if (SKIP.some(re => re.test(norm))) return;
    const out = path.join(dst, norm);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(src, out);
    n++; bytes += st.size;
  };
  for (const e of ENTRIES) copy(e);
  return { n, bytes };
}

const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'returnlog-pages-'));
const { n, bytes } = stage(stageDir);
console.log('[deploy] 暂存 ' + n + ' 个文件 · ' + (bytes / 1048576).toFixed(1) + ' MB → ' + stageDir);

if (DRY) { console.log('[deploy] --dry-run：不实际上传'); process.exit(0); }

/* Windows 上 `wrangler` 只有 .ps1/.cmd 包装，spawnSync 直接调 'wrangler' 会
   ENOENT（退出码 null）。这里自动找 npm 全局目录里的 wrangler.cmd，
   免得每次都要手写 WRANGLER_CMD。 */
function resolveWrangler() {
  if (process.env.WRANGLER_CMD) return process.env.WRANGLER_CMD;
  if (process.platform !== 'win32') return 'wrangler';
  const cands = [
    path.join(process.env.APPDATA || '', 'npm', 'wrangler.cmd'),
    path.join(process.env.ProgramFiles || '', 'nodejs', 'wrangler.cmd'),
  ];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  return 'wrangler.cmd';
}
const cmd = resolveWrangler();
const args = ['pages', 'deploy', stageDir, '--project-name', PROJECT, '--commit-dirty=true'];
const isWinCmd = /\.cmd$/i.test(cmd);
const r = spawnSync(isWinCmd ? 'cmd.exe' : cmd,
  isWinCmd ? ['/c', cmd, ...args] : args, { stdio: 'inherit', cwd: ROOT });
if (r.status !== 0) {
  console.error('[deploy] wrangler 退出码 ' + r.status);
  process.exit(r.status || 1);
}
console.log('[deploy] 完成 · 生产域名 https://' + PROJECT + '.pages.dev');
