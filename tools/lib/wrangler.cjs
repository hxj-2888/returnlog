/* wrangler 调用封装（2026-11-03）
   为什么单独抽一层：Windows 上 `wrangler` 只有 .ps1/.cmd 包装，`spawnSync('wrangler')`
   会 ENOENT（退出码 null）。两个部署脚本（本仓 / 作品集）都要用，逻辑放一处。 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

/* 部署一个目录到 Cloudflare Pages；返回退出码 */
function deployDir(dir, project, extra) {
  const cmd = resolveWrangler();
  const args = ['pages', 'deploy', dir, '--project-name', project,
    '--branch', 'main', '--commit-dirty=true'].concat(extra || []);
  const isWinCmd = /\.cmd$/i.test(cmd);
  const r = spawnSync(isWinCmd ? 'cmd.exe' : cmd,
    isWinCmd ? ['/c', cmd, ...args] : args, { stdio: 'inherit' });
  return r.status;
}

module.exports = { resolveWrangler, deployDir };
