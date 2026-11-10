/* 把「全船掩体重构 v2」的掩体表同步进 2.5D 主游戏的地图真源 js/data/map.js。
 * ------------------------------------------------------------
 * 依据：3d/DECISIONS.md ADR-0009（方案层先行，落地需单独放行）
 *       用户 2026-11-06 19:39「执行本项目的掩体重构任务 / 两块都做」= 放行。
 * 口径：
 *   · 只换 `cover`（59 → 127）。`decor` 在 2.5D 不参与渲染（game.js 不读 M.decor），保持原样。
 *   · 数据来源 `3d/preview/data/map_v2.json`（Godot 主场景实际读的那份），
 *     不再从 plan 二次推导 —— 两端口径必须一模一样。
 *   · 新掩体压住了 3 个设施 / 1 条保安巡逻线，按“最近的空地”微调，写死在 FIXES 里并逐条注释。
 *   · 只改数据，不改任何规则；跑完必须 `npm test` + 1000 局蒙特卡洛（掩体影响视线与通行）。
 *
 * 用法：node tools/sync-map-v2-cover.cjs [--check]
 *   --check 只校验不写盘（用于 CI / 交接自检）。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');
const MAP = path.join(DIR, 'js', 'data', 'map.js');
const V2 = path.join(DIR, '3d', 'preview', 'data', 'map_v2.json');
const CHECK = process.argv.includes('--check');

function loadMap() {
  const src = fs.readFileSync(MAP, 'utf8');
  const win = {};
  new Function('window', src)(win);
  return { src, data: win.SKMapData };
}

/* 设施微调（新掩体压住旧坐标）。每一条都必须是“舱内、无掩体、离墙 ≥0.6”。 */
const FIXES = [
  /* 手术台 53.2–56.8 × 84.4–86.4 压住医疗无人机 (55, 85.6)；
     挪到同舱右侧空地，仍在手术区与消毒柜之间。 */
  { room: 'med', label: '医疗无人机', from: [55, 85.6], to: [58.9, 85.3] },
  /* 枪架三连 76–90 × 76.1–77.7 压住军械补给点 (78.2, 76.6)；
     挪到工作台与靶道之间的空地，仍靠军械库中部。 */
  { room: 'armory', label: '军械补给点', from: [78.2, 76.6], to: [83.6, 68.2] },
  /* 主控台 78.4–81.4 × 35.3–36.7 压住监控台 (79.35, 36)；
     挪到主控台上方的空地，仍面向监控墙。 */
  { room: 'cam', label: '监控台', from: [79.35, 36], to: [80.6, 33.0] },
];

/* 保安巡逻：旧矩形 (80.6,68)-(86.4,76.4) 的南边正好穿过三连枪架；
   整条线收进工作台以北的空带，仍是舱内闭环。 */
const SECBOT = {
  room: 'armory',
  to: { x: 86.6, y: 69.4 },
  patrol: [[79.6, 67.8], [86.6, 67.8], [86.6, 69.4], [79.6, 69.4]],
};

function inRect(x, y, c, pad) {
  return x > c.x - pad && x < c.x + c.w + pad && y > c.y - pad && y < c.y + c.h + pad;
}

function checkFacilities(data, cover) {
  const bad = [];
  for (const f of data.facility) {
    const hit = cover.find(c => inRect(f.x, f.y, c, 0.2));
    if (hit) bad.push(`${f.label} 压在「${hit.label}」上`);
  }
  for (const p of data.points) {
    const hit = cover.find(c => inRect(p.x, p.y, c, 0.15));
    if (hit) bad.push(`任务点「${p.label}」压在「${hit.label}」上`);
  }
  for (const p of data.pipes) {
    const hit = cover.find(c => inRect(p.x, p.y, c, 0.2));
    if (hit) bad.push(`${p.room} 管道口压在「${hit.label}」上`);
  }
  return bad;
}

function main() {
  const { src, data } = loadMap();
  const v2 = JSON.parse(fs.readFileSync(V2, 'utf8'));
  const cover = v2.cover.map(c => ({
    room: c.room, x: +c.x.toFixed(2), y: +c.y.toFixed(2),
    w: +c.w.toFixed(2), h: +c.h.toFixed(2), kind: c.kind, label: c.label,
    /* zone/tier 只给 coverAudit 判「同组家具」用；2.5D 渲染不读这两个字段 */
    zone: c.zone || '', tier: c.tier || '',
  }));

  /* 先按 FIXES 挪设施，再统一校验 —— 顺序不能反，否则校验看到的是旧坐标。 */
  const moved = [];
  for (const f of FIXES) {
    const t = data.facility.find(x => x.label === f.label && x.room === f.room);
    if (!t) throw new Error('找不到要挪的设施：' + f.label);
    if (Math.abs(t.x - f.from[0]) > 0.01 || Math.abs(t.y - f.from[1]) > 0.01)
      console.log('提示：' + f.label + ' 的当前坐标与脚本记录不同，按脚本目标点写入');
    t.x = f.to[0]; t.y = f.to[1];
    moved.push(f.label + ' → (' + f.to.join(', ') + ')');
  }
  const bot = data.facility.find(x => x.kind === 'secbot' && x.room === SECBOT.room);
  if (bot) {
    bot.x = SECBOT.to.x; bot.y = SECBOT.to.y; bot.patrol = SECBOT.patrol;
    moved.push('保安巡逻 → ' + JSON.stringify(SECBOT.patrol));
  }

  const bad = checkFacilities(data, cover);
  if (bad.length) {
    console.error('校验失败：');
    for (const b of bad) console.error('  · ' + b);
    process.exit(2);
  }

  const before = data.cover.length;
  data.cover = cover;

  const body = '  global.SKMapData = ' + JSON.stringify(data) + ';\n';
  const head = src.slice(0, src.indexOf('  global.SKMapData = '));
  const tail = '})(typeof window !== \'undefined\' ? window : globalThis);\n';
  const out = head + body + tail;

  if (CHECK) {
    console.log('--check：不写盘。' + before + ' → ' + cover.length + ' 件掩体，设施校验 0 冲突。');
    return;
  }
  fs.writeFileSync(MAP, out);
  console.log('已写回 js/data/map.js：掩体 ' + before + ' → ' + cover.length +
    '；设施微调 ' + moved.length + ' 条');
  for (const m of moved) console.log('  · ' + m);
  console.log('下一步：npm test（门禁）→ node tools/monte-carlo.cjs --games 1000');
}

main();
