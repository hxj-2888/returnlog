/* 一键发布 · 新返航录（2026-11-03）
 *
 * 一条命令跑完五件事：
 *   ① 门禁（--fast 跳过）  ② APK：同步 www → 构建 → 传 GitHub Release
 *   ③ Cloudflare Pages 主站  ④ GitHub + Gitee（本仓）
 *   ⑤ 作品集：素材同步 → 部署 → 提交推送（GitHub + Gitee）
 *
 * 用法：
 *   npm run ship                      # 全量
 *   node tools/ship.cjs --fast        # 跳过门禁（只发不测，慎用）
 *   node tools/ship.cjs --only=web    # 只发主站（可用逗号组合：web,apk / web,portfolio）
 *   node tools/ship.cjs --msg "feat: ..."
 *
 * 设计原则：
 *   · 每步独立可失败、失败即停，并打印可单独重跑的命令；
 *   · 只在**有变化**时提交；APK 与 android/assets/www 已被 .gitignore 排除；
 *   · 作品集只拷 4 个素材（缩略图 / 演示视频 / 封面 / 二维码），不搬整份构建。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const zlib = require('zlib');
const { deployDir } = require('./lib/wrangler.cjs');

const ROOT = path.resolve(__dirname, '..');
const PAGE_PROJECT = process.env.CF_PROJECT || 'returnlog';
const PORTFOLIO_DIR = process.env.PORTFOLIO_DIR || path.resolve(ROOT, '..', 'portfolio');
const PAGE_PORTFOLIO = process.env.CF_PORTFOLIO_PROJECT || 'portfolio-ji';
const APK_TAG = 'returnlog-v3';
const APK_FILE = path.join(ROOT, 'android', 'ReturnLog.apk');
const WIN = process.platform === 'win32';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (k, d) => {
  const hit = argv.find(a => a.startsWith(k + '='));
  return hit ? hit.slice(k.length + 1) : d;
};
const FAST = has('--fast');
const ONLY = val('--only', 'apk,web,portfolio').split(',').map(s => s.trim()).filter(Boolean);
const DO = k => ONLY.includes(k);
const MSG = val('--msg', '');

const results = [];
let step = 0;
const TOTAL = 1 + (DO('apk') ? 3 : 0) + (DO('web') ? 2 : 0) + (DO('portfolio') ? 3 : 0);

/* 走 shell 的命令（node 脚本、wrangler 之类的整行命令） */
function shell(cmdline, cwd, capture) {
  const r = spawnSync(WIN ? 'cmd.exe' : 'sh', WIN ? ['/c', cmdline] : ['-c', cmdline],
    capture ? { encoding: 'utf8', cwd: cwd || ROOT, maxBuffer: 64 * 1024 * 1024 }
      : { stdio: 'inherit', cwd: cwd || ROOT });
  if (capture) return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
  return { status: r.status == null ? 1 : r.status };
}
/* 直接 exec（**不经过 shell**）：中文/括号/引号的提交信息走这条路才不会被打散。
   git.exe / gh.exe 在 PATH 上，Node 能直接解析 .exe。 */
function args(file, list, cwd, capture) {
  const r = spawnSync(file, list,
    capture ? { encoding: 'utf8', cwd: cwd || ROOT, maxBuffer: 64 * 1024 * 1024 }
      : { stdio: 'inherit', cwd: cwd || ROOT });
  if (capture) return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
  return { status: r.status == null ? 1 : r.status };
}
/* 提交并推送（本仓与作品集共用）；只 add 指定路径，避免把别人的未跟踪文件卷进来 */
function commitAndPush(dir, paths, msg, hint) {
  if (paths && paths.length) {
    const r = args('git', ['add', '--'].concat(paths), dir);
    if (r.status !== 0) fail('git add 失败', hint);
  }
  /* 看**已暂存**的内容，而不是 `git status`（后者把别人的未跟踪文件也算成"有改动"，
     结果 commit 时 nothing to commit 直接失败）。 */
  const staged = args('git', ['diff', '--cached', '--name-only'], dir, true).out.trim();
  if (staged) {
    if (args('git', ['commit', '-q', '-m', msg], dir).status !== 0) fail('git commit 失败', hint);
    console.log('[ship] 已提交：' + msg);
  } else console.log('[ship] ' + path.basename(dir) + ' 无改动，跳过提交');
  pushRemote('origin', dir, true);
  pushRemote('gitee', dir, false);
}
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const REMOTE_LABEL = { origin: 'GitHub', gitee: 'Gitee' };
/* 认证坏了和链路坏了必须分开报。凭据失效时 git 会想找终端要账号密码，而这里是
   spawnSync 没有 TTY，失败信息长得像网络问题，于是出现"GitHub 明明上去了却报推送失败"。 */
/* 预检只区分"凭据坏了"和"链路坏了"，并把它作为路由决策的输入：
   凭据问题与通道无关，直接判死；链路问题不能在这里 bail out，否则默认通道一抖，
   连"换一条通道"的机会都被跳过了（这正是以前"GitHub 推不上去"的形态）。 */
function preflight(remote, dir, label) {
  const r = args('git', ['-c', 'credential.interactive=false', 'ls-remote', '--exit-code', remote, 'HEAD'], dir, true);
  if (r.status === 0) return 'ok';
  const out = (r.out || '').trim();
  if (/could not read Username|Authentication failed|terminal prompts disabled|Permission denied|403/i.test(out)) {
    console.error('[ship] ✗ ' + label + ' 认证失败（不是网络）：' + (remote === 'origin' ? '跑 `gh auth login`' : '重新输入 Gitee 账号/令牌'));
    return 'auth';
  }
  console.log('[ship] ' + label + ' 预检默认通道不通（' + (out.split('\n').pop() || '') + '），把兜底通道排到前面');
  return 'transport';
}
/* 代理地址从 git 配置读，不写死某台机器。本仓配的是 http.https://github.com.proxy。 */
function configuredProxy(dir) {
  return args('git', ['config', '--get', 'http.https://github.com.proxy'], dir, true).out.trim();
}
const DIRECT_ARGV = ['-c', 'http.proxy=', '-c', 'https.proxy=',
  '-c', 'http.https://github.com.proxy=', '-c', 'http.https://gitee.com.proxy='];
/* URL 级键优先于通用 http.proxy，所以"走代理"必须连 gitee 的 URL 级空值一起覆盖。 */
function proxyArgv(proxy) {
  return ['-c', 'http.proxy=' + proxy, '-c', 'https.proxy=' + proxy, '-c', 'http.https://gitee.com.proxy=' + proxy];
}
/* 双通道：默认沿用按域名分流的 git 配置（github=代理 0.9s、gitee=直连 0.3s），
   第二条互为兜底。实测两条各有单独失效的时刻：直连推 GitHub 曾 21s 超时，
   同一时刻 Gitee 直连 13s 成功；改回代理 2.6s 就上去。所以传输层错误要换通道重试，
   而不是原样重敲三次。 */
function routesFor(remote, dir) {
  const inherited = { name: '按配置', argv: [] };
  const proxy = configuredProxy(dir);
  if (remote === 'gitee') return proxy ? [inherited, { name: '走代理', argv: proxyArgv(proxy) }] : [inherited];
  return [inherited, { name: '直连', argv: DIRECT_ARGV }];
}
const TRANSFER_ERR = /Failed to connect|Could not connect|Could not resolve|timed out|Connection refused|Connection reset|Recv failure|Send failure|RPC failed|curl \d+|empty reply|hung up unexpectedly|Encountered end of file|error: 5\d\d/i;
/* 兜底通道不能盲试：先探测，探测不通就跳过，省掉一次必然失败的 20s 硬撞。
   探测必须用 push --dry-run 而不是 ls-remote —— 前者走 git-receive-pack 的 POST，
   后者只是 GET，两种能力会在同一时刻分化（实测同一分钟内 GET 通、POST 撞 21s 连接超时，
   几分钟后两条又都 1.4s 通）。--dry-run 只协商、不改远端，代价约 1.4s。
   结论修正：GitHub 直连不是"能读不能写"，而是可达性随 DNS 当次返回的 IP 抖动。 */
function probeRoute(remote, dir, argv) {
  const r = args('git', argv.concat(['-c', 'http.lowSpeedLimit=1000', '-c', 'http.lowSpeedTime=8',
    '-c', 'credential.interactive=false', 'push', '--dry-run', remote, 'main']), dir, true);
  return r.status === 0;
}
function pushRemote(remote, dir, fatal) {
  const label = REMOTE_LABEL[remote] || remote;
  const hint = 'git push ' + remote + ' main';
  const pre = preflight(remote, dir, label);
  if (pre === 'auth') {
    if (fatal) fail('推送 ' + label + ' 失败（凭据）', hint);
    results.push({ name: '推送 ' + label, ok: false });
    return;
  }
  const routes = routesFor(remote, dir);
  const order = pre === 'transport' ? routes.slice(1).concat(routes.slice(0, 1)) : routes;
  const notes = [];
  for (const route of order) {
    if (route.name !== routes[0].name && route.name === '直连' && !probeRoute(remote, dir, route.argv)) {
      notes.push('·直连：探测不通（GitHub 直连常是能读不能写），不做无谓的 20s 硬撞');
      continue;
    }
    const t0 = Date.now();
    const r = args('git', route.argv.concat(['push', remote, 'main']), dir, true);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const out = (r.out || '').trim();
    if (r.status === 0) {
      const switched = route !== routes[0];
      console.log('[ship] ✓ 已推送 ' + label + ' ·' + route.name + ' 通道 ' + secs + 's' + (switched ? '（兜底生效）' : ''));
      if (switched) {
        console.log('[ship]   默认通道此刻不通：' + (route.name === '直连'
          ? '代理 ' + (configuredProxy(dir) || '未配置') + ' 没起或正在切节点'
          : '直连被 DNS/路由卡住') + '；下次发布仍会先试默认通道');
      }
      results.push({ name: '推送 ' + label, ok: true });
      return;
    }
    notes.push('·' + route.name + '（' + secs + 's）：' + (out.split('\n').pop() || '退出码 ' + r.status));
    /* 非传输层错误（non-fast-forward、权限、hook 拒绝）换通道也没用，立刻停手报告。 */
    if (!TRANSFER_ERR.test(out)) {
      notes.push('（非传输层错误，不再换通道）');
      break;
    }
    console.log('[ship] ' + label + ' ·' + route.name + ' 传输失败，换通道…');
    sleepSync(1200);
  }
  console.error('[ship] ✗ ' + label + ' 推送失败：\n  ' + notes.join('\n  '));
  /* 提示按"默认通道是什么"来给，而不是在报错文本里找关键字：git 的死代理报错里
     只有 via 127.0.0.1，没有"代理"两个字，按词匹配会漏。 */
  const proxy = configuredProxy(dir);
  if (remote !== 'gitee' && proxy) {
    console.error('[ship]   提示：默认通道是代理 ' + proxy + '，确认 Clash Verge 在跑且混合端口没漂；' +
      '恢复后单跑 ' + hint + '（直连兜底此刻也不可用，GitHub 直连常是能读不能写）');
  } else {
    console.error('[ship]   提示：默认走直连；确认本机能出网后单跑 ' + hint);
  }
  if (fatal) fail('推送 ' + label + ' 失败', hint);
  results.push({ name: '推送 ' + label, ok: false });
}
function log(m) { console.log('\n[ship] ' + m); }
/* 蒙特卡洛原始局已改为 .json.gz 入库（.json 被 .gitignore 排除，实测压缩省 94%）。
   发布前重压一次，避免仓里的压缩档比本机 json 旧——这一步不做，压缩档就会静默失真。 */
function packSimArtifacts(dir) {
  let packed = 0;
  for (const rel of ['tools/mc-results.json', 'tools/mc-results-E.json']) {
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs);
    const gz = zlib.gzipSync(src, { level: 9 });
    fs.writeFileSync(abs + '.gz', gz);
    packed++;
    console.log('[ship] 压缩 ' + rel + ' ' + (src.length / 1048576).toFixed(2) + ' MB -> '
      + (gz.length / 1048576).toFixed(2) + ' MB');
  }
  if (!packed) console.log('[ship] 无仿真原始局可压缩（跳过）');
}
function ok(name, t0) { results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('[ship] ✓ ' + name + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)'); }
function summary() {
  if (!results.length) return;
  console.log('\n[ship] 结果');
  for (const r of results) console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.name + (r.ms ? '  ' + (r.ms / 1000).toFixed(1) + 's' : ''));
}
function fail(name, hint) {
  results.push({ name, ok: false });
  console.error('\n[ship] ✗ ' + name + ' 失败' + (hint ? '\n        可单独重跑：' + hint : ''));
  summary();
  process.exit(1);
}

/* 门禁依赖 playwright-core：本仓没装时自动找几个常见位置（不写死某一台机器） */
function ensurePlaywright() {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  const user = process.env.USERPROFILE || process.env.HOME || '';
  const cands = [
    path.join(ROOT, 'node_modules', 'playwright-core'),
    path.join(user, '.workbuddy-ai', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'playwright-core'),
  ];
  for (const c of cands) {
    if (c && fs.existsSync(c)) { process.env.PLAYWRIGHT_CORE = c; return c; }
  }
  return null;
}

function main() {
  /* ① 门禁 */
  log('步骤 ' + (++step) + '/' + TOTAL + ' · 门禁');
  /* 出仓素材完整性：只警告不拦停。这些贴图是烘焙/重渲源件，deploy 的 SKIP 规则
     本来就不上传它们，缺了不影响站点上线；但它们是"本机唯一副本"，缺了会影响下次重烘焙。 */
  const ac = shell('node tools/assets-check.cjs', ROOT, true);
  if (ac.status === 2) console.log('[ship] 无 assets/MANIFEST.json，跳过出仓素材校验（可 --write 生成）');
  else if (ac.status !== 0) console.log('[ship] ⚠ 出仓素材与清单不一致（不影响部署，影响后续重烘焙）：\n'
    + ac.out.trim().split('\n').slice(0, 6).join('\n'));
  else console.log('[ship] ✓ 出仓素材 ' + (ac.out.match(/校验 (\d+)/) || [])[1] + ' 项与清单一致');
  const pw = ensurePlaywright();
  if (pw) console.log('[ship] playwright-core: ' + pw);
  if (FAST) console.log('[ship] --fast：跳过门禁');
  else {
    const t0 = Date.now();
    const { out } = shell('node tools/test-v3.cjs', ROOT, true);
    const m = out.match(/结果：(\d+) 通过 \/ (\d+) 失败/);
    if (!m || +m[2] !== 0) {
      /* 没匹配到"结果："也要把输出尾巴打出来，否则失败了什么都看不到 */
      const bad = out.split('\n').filter(l => /FAIL|结果：|Error|error/.test(l));
      console.error((bad.length ? bad : out.split('\n').slice(-25)).join('\n'));
      fail('门禁', 'node tools/test-v3.cjs');
    }
    console.log('[ship] 门禁 ' + m[1] + ' 通过 / 0 失败');
    ok('门禁', t0);
  }

  /* ② APK */
  if (DO('apk')) {
    log('步骤 ' + (++step) + '/' + TOTAL + ' · APK：同步网页资源');
    let t0 = Date.now();
    if (shell('node tools/build-apk-assets.cjs').status !== 0) fail('APK 资源同步', 'node tools/build-apk-assets.cjs');
    ok('APK 资源同步', t0);

    log('步骤 ' + (++step) + '/' + TOTAL + ' · APK：构建');
    t0 = Date.now();
    const r = spawnSync('cmd.exe', ['/c', 'build.cmd'], { stdio: 'inherit', cwd: path.join(ROOT, 'android') });
    if (r.status !== 0) fail('APK 构建（缺 JDK17/SDK34/7-Zip 时用 --only=web,portfolio）', 'cd android && build.cmd');
    console.log('[ship] APK ' + (fs.statSync(APK_FILE).size / 1048576).toFixed(1) + ' MB');
    ok('APK 构建', t0);

    log('步骤 ' + (++step) + '/' + TOTAL + ' · APK：上传 GitHub Release ' + APK_TAG);
    t0 = Date.now();
    /* 一律走 no-shell 的 args()：路径带空格/引号时走 cmd 会被 gh 当字面量，
       报 "no matches found for \"C:\\...\\ReturnLog.apk\"" */
    if (args('gh', ['release', 'view', APK_TAG], ROOT, true).status !== 0) {
      if (args('gh', ['release', 'create', APK_TAG, '--title', '返航录 APK',
        '--notes', '自动发布 ' + new Date().toISOString().slice(0, 10)]).status !== 0)
        fail('APK 发布', 'gh release create ' + APK_TAG);
    }
    if (args('gh', ['release', 'upload', APK_TAG, APK_FILE, '--clobber']).status !== 0)
      fail('APK 上传', 'gh release upload ' + APK_TAG + ' android/ReturnLog.apk --clobber');
    ok('APK 上传', t0);
  }

  /* ③ 主站 + 本仓推送 */
  if (DO('web')) {
    log('步骤 ' + (++step) + '/' + TOTAL + ' · Cloudflare Pages：' + PAGE_PROJECT);
    let t0 = Date.now();
    if (shell('node tools/deploy-pages.cjs').status !== 0) fail('主站部署', 'node tools/deploy-pages.cjs');
    ok('主站部署', t0);

    log('步骤 ' + (++step) + '/' + TOTAL + ' · 推送本仓：GitHub + Gitee');
    t0 = Date.now();
    const msg = MSG || ('chore(ship): 一键发布 ' + new Date().toISOString().slice(0, 10));
    packSimArtifacts(ROOT);
    args('git', ['add', '-A'], ROOT);
    commitAndPush(ROOT, null, msg, 'git commit -m "..."');
    ok('本仓推送', t0);
  }

  /* ④ 作品集 */
  if (DO('portfolio')) {
    log('步骤 ' + (++step) + '/' + TOTAL + ' · 作品集：同步素材');
    let t0 = Date.now();
    if (!fs.existsSync(PORTFOLIO_DIR)) {
      console.log('[ship] 未找到 ' + PORTFOLIO_DIR + '，跳过作品集');
    } else {
      const maps = [
        ['assets/portfolio/returnlog-thumb.png', 'assets/projects/returnlog.png'],
        ['assets/portfolio/returnlog-demo.mp4', 'assets/projects/returnlog-demo.mp4'],
        ['assets/portfolio/returnlog-demo-poster.jpg', 'assets/projects/returnlog-demo-poster.jpg'],
        ['assets/portfolio/returnlog-qr.png', 'assets/qr/returnlog.png'],
      ];
      let copied = 0;
      for (const [src, dst] of maps) {
        const s = path.join(ROOT, src), d = path.join(PORTFOLIO_DIR, dst);
        if (!fs.existsSync(s)) { console.log('[ship] 缺素材 ' + src); continue; }
        fs.mkdirSync(path.dirname(d), { recursive: true });
        if (fs.existsSync(d) && fs.statSync(d).size === fs.statSync(s).size) continue;
        fs.copyFileSync(s, d); copied++; console.log('[ship] 拷贝 ' + dst);
      }
      console.log('[ship] 作品集素材更新 ' + copied + ' 个');
      ok('作品集素材', t0);

      log('步骤 ' + (++step) + '/' + TOTAL + ' · 作品集：部署 ' + PAGE_PORTFOLIO);
      t0 = Date.now();
      const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-pages-'));
      for (const entry of ['index.html', 'projects.json', 'css', 'js', 'assets', 'projects', 'functions', '_headers']) {
        const s = path.join(PORTFOLIO_DIR, entry);
        if (fs.existsSync(s)) fs.cpSync(s, path.join(stage, entry), { recursive: true });
      }
      const code = deployDir(stage, PAGE_PORTFOLIO, []);
      fs.rmSync(stage, { recursive: true, force: true });
      if (code !== 0) fail('作品集部署', 'wrangler pages deploy <stage> --project-name ' + PAGE_PORTFOLIO);
      ok('作品集部署', t0);

      log('步骤 ' + (++step) + '/' + TOTAL + ' · 作品集：推送 GitHub + Gitee');
      t0 = Date.now();
      const pmsg = MSG || ('chore(sync): 更新新返航录素材 ' + new Date().toISOString().slice(0, 10));
      /* 只 add 我们真正改的那 4 个素材 —— 作品集仓库里常有别人的未跟踪文件 */
      const paths = ['assets/projects/returnlog.png', 'assets/projects/returnlog-demo.mp4',
        'assets/projects/returnlog-demo-poster.jpg', 'assets/qr/returnlog.png'];
      commitAndPush(PORTFOLIO_DIR, paths, pmsg, 'cd ../portfolio && git commit -m "..."');
      ok('作品集推送', t0);
    }
  }

  summary();
  console.log('\n[ship] 全部完成');
  console.log('  主站   https://' + PAGE_PROJECT + '.pages.dev');
  if (DO('portfolio') && fs.existsSync(PORTFOLIO_DIR)) console.log('  作品集 https://' + PAGE_PORTFOLIO + '.pages.dev');
  if (DO('apk')) console.log('  APK    https://github.com/hxj-2888/returnlog/releases/download/' + APK_TAG + '/ReturnLog.apk');
}

main();
