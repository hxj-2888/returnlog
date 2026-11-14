/* 3D 空间数值导出：2.5D 真源 → 3d/preview/data/space.json
 * ------------------------------------------------------------
 * 用法：node 3d/tools/export-space.cjs
 *
 * 为什么要这个文件：3D 端要做门、电闸、管道、站桩时长，这些数在 2.5D 已经有真源。
 * 在 GDScript 里再抄一份就会重演 COVER_HEIGHT 事故（表与真源对不上，39 件家具落到默认值）。
 *
 * 三个真源，取法各不相同，全部 fail-loud（取不到就退出码 1，不做静默兜底）：
 *   ① js/ai/sanity.js  —— 纯模块，Node 里直接 eval（与 tools/monte-carlo.cjs 同一口径）
 *   ② js/t2/space.js   —— 纯模块，同上（DOOR_* / MOVE_SPEED / DRAG_SPEED）
 *   ③ js/game.js       —— 编排层，数值散在函数里，只能按**具名正则**抠；
 *                          抠不到就报错，逼改代码的人回来登记（这些数目前还没有表）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'preview', 'data', 'space.json');

function sha1(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
}
function evalModule(rel) {
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(win);
  return win;
}
/* 从源码里按名字抠一个数；抠不到就停 —— 宁可不出包，也不让 3D 拿默认值跑 */
function pick(src, rel, pattern, label) {
  const m = src.match(pattern);
  if (!m) throw new Error('真源漂移：在 ' + rel + ' 里找不到 ' + label + '（正则 ' + pattern + '）');
  return parseFloat(m[1]);
}

const sanityPath = 'js/ai/sanity.js';
const spacePath = 'js/t2/space.js';
const gamePath = 'js/game.js';

const SKSanity = evalModule(sanityPath).SKSanity;
const SKT2Space = evalModule(spacePath).SKT2Space;
const gameSrc = fs.readFileSync(path.join(ROOT, gamePath), 'utf8');

if (!SKSanity || !SKT2Space) throw new Error('SKSanity / SKT2Space 加载失败');
for (const k of ['STAND', 'SIGHT', 'REACH', 'PIPE', 'NIGHT', 'BREAKER', 'SHOT']) {
  if (!SKSanity[k]) throw new Error('SKSanity 缺少表 ' + k);
}
for (const k of ['DOOR_OPEN_R', 'DOOR_CLOSE_R', 'DOOR_SPEED', 'DOOR_W', 'DOOR_PASS', 'MOVE_SPEED']) {
  if (typeof SKT2Space[k] !== 'number') throw new Error('SKT2Space 缺少常量 ' + k);
}

const out = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  note: '本文件由 3d/tools/export-space.cjs 生成，勿手改。数值真源见 sources。',
  sources: {
    [sanityPath]: sha1(path.join(ROOT, sanityPath)),
    [spacePath]: sha1(path.join(ROOT, spacePath)),
    [gamePath]: sha1(path.join(ROOT, gamePath)),
  },
  /* 单位：1 格 = 1 米（3d/ARCHITECTURE.md §4），所以 2.5D 的"格"在这里直接当米用 */
  grid: { meters_per_cell: 1.0, bake_step: 0.6 },
  move: {
    speed: SKT2Space.MOVE_SPEED,
    drag_speed: SKT2Space.DRAG_SPEED,
    ghost_task_cap: SKT2Space.GHOST_TASK_CAP,
  },
  door: {
    open_r: SKT2Space.DOOR_OPEN_R,
    close_r: SKT2Space.DOOR_CLOSE_R,
    speed: SKT2Space.DOOR_SPEED,
    width: SKT2Space.DOOR_W,
    pass: SKT2Space.DOOR_PASS,
    /* 断电安检扫描：d.scanT=Math.min(2,…) 且 scanT>=2 才放行（js/game.js doorTick） */
    scan_sec: pick(gameSrc, gamePath, /d\.scanT=Math\.min\(([\d.]+),\s*\(d\.scanT\|\|0\)\+dt\)/, '门扫描秒数'),
  },
  sight: {
    human_light_r: SKSanity.SIGHT.humanLightR,
    human_dark_r: SKSanity.SIGHT.humanDarkR,
    alien_dark_r: SKSanity.SIGHT.alienDarkR,
    corr_r: SKSanity.SIGHT.corrR,
    lit_room_mul: SKSanity.SIGHT.litRoomMul,
    fog_room_mask: SKSanity.SIGHT.fog.roomMask,
    fog_corridor_mask: SKSanity.SIGHT.fog.corridorMask,
    cone_deg: 60,
  },
  stand: {
    fix: SKSanity.STAND.fix,
    revive: SKSanity.STAND.revive,
    search: SKSanity.STAND.search,
    qual: SKSanity.STAND.qual,
    ammo: SKSanity.STAND.ammo,
    med: SKSanity.STAND.med,
    fault_left: SKSanity.STAND.fault,
  },
  reach: {
    knife: SKSanity.REACH.knife,
    sabotage: SKSanity.REACH.sabotage,
    fix: SKSanity.REACH.fix,
    /* 交互轮盘的取物半径：bodyNear(2.2)（js/game.js collectInteractions） */
    body: pick(gameSrc, gamePath, /const nb=ghost\?null:bodyNear\(([\d.]+)\)/, '尸体轮盘半径'),
    /* 圆桌领取判定半径：nearRoundTable 里的 Math.hypot(dx,dy)<2.3 */
    round_table: pick(gameSrc, gamePath, /nearRoundTable[\s\S]{0,220}?Math\.hypot\(dx,dy\)<([\d.]+)/, '圆桌领取半径'),
    breaker: pick(gameSrc, gamePath, /const BREAKER_USE_R=([\d.]+);/, 'BREAKER_USE_R'),
    /* 2026-11-14：规则索引要连「管道口 1.6 / 监控 1.8 / 报告 2.4」，此前只在函数里内联，
       导出层没有可寻址键，导致 CORE_RULES 的 R7.2.1 / R7.3.1 / R10.1 只能人工看。 */
    pipe: pick(gameSrc, gamePath, /function nearPipe\(a\)\{\s*let best=null,bd=([\d.]+)/, '管道口半径'),
    monitor: pick(gameSrc, gamePath, /function nearMonitor\(a\)\{[\s\S]{0,160}?<([\d.]+)\)\?m:null/, '监控半径'),
    report: pick(gameSrc, gamePath, /function tryReport\(\)\{[\s\S]{0,200}?bd=([\d.]+)/, '报告半径'),
  },
  /* 拖尸声（js/game.js dragSound）：每 1.6 秒给 AI 记一次 8 格声纹 —— R5.6 */
  drag: {
    ai_interval: pick(gameSrc, gamePath, /if\(a\._dragAiT>=([\d.]+)\)\{a\._dragAiT=0;aiHear\('drag',a\.x,a\.y,\d+/, '拖尸声间隔'),
    ai_hear_r: pick(gameSrc, gamePath, /if\(a\._dragAiT>=[\d.]+\)\{a\._dragAiT=0;aiHear\('drag',a\.x,a\.y,(\d+)/, '拖尸声半径'),
  },
  /* 每席任务配额（js/game.js:208）：1 个高难点 + 3 个普通点 —— R1.5 */
  tasks: {
    hard_per_seat: 1,
    normal_per_seat: pick(gameSrc, gamePath, /\.concat\(shuffle\(normalPts\.slice\(\)\)\.slice\(0,(\d+)\)\)/, '普通任务配额'),
  },
  pipe: {
    cooldown: SKSanity.PIPE.cooldown,
    human_forbidden: true,   /* 门禁口径：人类管道禁用（js/game.js collectInteractions 的 me.alien 分支） */
  },
  breaker: {
    /* 合闸：powerFixed ? 3 : 4.5（js/game.js breakerOnTime） */
    on_fixed: pick(gameSrc, gamePath, /function breakerOnTime\(\)\{\s*return G\.powerFixed\?([\d.]+):([\d.]+);/, '合闸秒数'),
    on_default: pick(gameSrc, gamePath, /function breakerOnTime\(\)\{\s*return G\.powerFixed\?[\d.]+:([\d.]+);/, '合闸默认秒数'),
    /* 拉闸：本夜第 n 次 = min(off_max, off_step × n)（js/game.js breakerOffTime） */
    off_max: pick(gameSrc, gamePath, /function breakerOffTime\(\)\{[\s\S]{0,160}?return Math\.min\(([\d.]+),/, '拉闸秒数上限'),
    off_step: pick(gameSrc, gamePath, /function breakerOffTime\(\)\{[\s\S]{0,200}?Math\.min\([\d.]+,([\d.]+)\*n\)/, '拉闸秒数步进'),
    witness_cap: SKSanity.BREAKER.witnessCap,
  },
  /* 开枪：SKSanity.SHOT 是唯一真源（射程 9 / 追确证 14 / 追嫌疑 10） */
  shoot: {
    range: SKSanity.SHOT.range,
    chase_known: SKSanity.SHOT.chaseKnown,
    chase_sus: SKSanity.SHOT.chaseSus,
  },
  /* 两台机器人：数值全在 js/game.js 的具名常量里，按名字抠，抠不到就报错。
     SEC_RANGE 在 2026-11-06 被用户从 14 → 10.5 → 6 连削两次，抄一份必然漂移。 */
  bot: (() => {
    const m = gameSrc.match(/const SEC_RANGE=([\d.]+),\s*SEC_ARC=Math\.PI\/([\d.]+),\s*DETAIN_TIME=([\d.]+),\s*SEC_USES_MAX=([\d.]+)/);
    if (!m) throw new Error('真源漂移：找不到 SEC_RANGE / SEC_ARC / DETAIN_TIME / SEC_USES_MAX');
    return {
      speed: pick(gameSrc, gamePath, /const BOT_SPEED=([\d.]+);/, 'BOT_SPEED'),
      catch_speed: pick(gameSrc, gamePath, /const SEC_CATCH_SPEED=([\d.]+);/, 'SEC_CATCH_SPEED'),
      sec_range: parseFloat(m[1]),
      sec_arc_div: parseFloat(m[2]),
      detain_sec: parseFloat(m[3]),
      sec_uses: parseInt(m[4], 10),
      med_uses: pick(gameSrc, gamePath, /const MEDBOT_CHARGES=(\d+);/, 'MEDBOT_CHARGES'),
      /* 医疗无人机治疗链（js/game.js 4664-4667）：3D 之前把这几项写成 0/1.2/4.2/0，
         导致「贴到即救」+ 无眩晕，与 2.5D 的近身读条 7 秒差一整段机制。 */
      med_heal_time: pick(gameSrc, gamePath, /const MEDBOT_HEAL_TIME=([\d.]+);/, 'MEDBOT_HEAL_TIME'),
      med_touch_r: pick(gameSrc, gamePath, /const MEDBOT_TOUCH_R=([\d.]+);/, 'MEDBOT_TOUCH_R'),
      med_fly_speed: pick(gameSrc, gamePath, /const MEDBOT_FLY_SPEED=([\d.]+);/, 'MEDBOT_FLY_SPEED'),
      med_stun: pick(gameSrc, gamePath, /const MEDBOT_REVIVE_STUN=([\d.]+);/, 'MEDBOT_REVIVE_STUN'),
      /* 2.5D startNight（js/game.js:7829）每夜把机器人 HP 复位，3D 之前从不复位。 */
      hp_secbot: pick(gameSrc, gamePath, /botHp:\{secbot:(\d+),medbot:\d+\}/, 'botHp.secbot'),
      hp_medbot: pick(gameSrc, gamePath, /botHp:\{secbot:\d+,medbot:(\d+)\}/, 'botHp.medbot'),
    };
  })(),
  night: { len: SKSanity.NIGHT.len },
  /* 走廊顶灯位：直接调真源函数 SKT2Space.corridorLampPos（每条走廊两盏，0.28 / 0.72 分位），
     不在 GDScript 里目测摆灯。2.5D 注释写明"配电室拉闸后整条走廊全熄"，所以这批灯位
     同时是断电表现的对象。 */
  lamps: {
    corridor: evalModule('js/data/map.js').SKMapData.corridors.map(c =>
      SKT2Space.corridorLampPos(c).map(p => ({ x: +p[0].toFixed(2), y: +p[1].toFixed(2), ang: +p[2].toFixed(3) }))
    ),
    corridor_per: 2,
  },
  /* 管道口配色：SKT2Space.PIPE_TINT 是唯一色源（2.5D 的 3D 精灵与 8 舱边圈都吃它）。
     3D 端原先抄了一份 PIPE_COLORS，现在改为读导出值，本地那份只作离线兜底。 */
  pipe_tint: SKT2Space.PIPE_TINT,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('space.json 已生成：' + OUT);
console.log('  门 scan=' + out.door.scan_sec + 's 宽=' + out.door.width + 'm 开启半径=' + out.door.open_r + 'm');
console.log('  视野 亮舱手电=' + out.sight.human_light_r + 'm 暗舱近身=' + out.sight.human_dark_r
  + 'm 走廊=' + out.sight.corr_r + 'm');
console.log('  开枪 射程=' + out.shoot.range + 'm  保安 视野=' + out.bot.sec_range
  + 'm 拘留=' + out.bot.detain_sec + 's 每夜=' + out.bot.sec_uses + '次');
console.log('  站桩 修=' + out.stand.fix + ' 领单=' + out.stand.qual + ' 弹=' + out.stand.ammo
  + ' 医疗=' + out.stand.med + ' 故障倒计时=' + out.stand.fault_left);
console.log('  电闸 合=' + out.breaker.on_default + '/' + out.breaker.on_fixed + ' 拉='
  + out.breaker.off_step + '×n 封顶' + out.breaker.off_max + ' 使用半径=' + out.reach.breaker + 'm');
console.log('  圆桌半径=' + out.reach.round_table + 'm 尸体半径=' + out.reach.body + 'm 管道冷却=' + out.pipe.cooldown + 's');
