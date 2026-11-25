/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T3
 * domain    : HUD 与任务列表表现层
 * definedBy : 只读渲染左上角任务清单、顶部进度/人数/电态、底部操作提示条
 * truth     : js/view/hud.js#SKHud
 * verify    : npm test
 * flag      : F
 * note      : P1 从 js/game.js 拆出；只读 G，绝不反向修改判定状态
 * ============================================================== */
(function (global) {
  'use strict';

  const HUD_EL = {};
  function hudEl(id) {
    const cached = HUD_EL[id];
    if (cached && cached.isConnected) return cached;
    return (HUD_EL[id] = document.getElementById(id));
  }

  function hudText(id, v) {
    const el = hudEl(id);
    if (!el) return null;
    const s = String(v);
    if (el.textContent !== s) el.textContent = s;
    return el;
  }

  function renderTaskList(ctx) {
    const G = ctx.getG();
    const M = ctx.M;
    const box = document.getElementById('tasks');
    if (!box || !G) return;
    const me = G.me, key = me.tIdx + '|' + me.tasks.join(',');
    if (G.designMode) {
      const dk = 'design|' + M.points.length;
      box.classList.add('design');
      if (G.taskKey === dk) return;
      G.taskKey = dk;
      let h = '<div class="th">设计者 · ' + M.points.length + ' 个任务点全开放</div>';
      M.points.forEach((p, n) => {
        h += '<div class="tr ' + (p.kind === 'hard' ? 'hard' : 'normal') + '">'
          + '<span class="no">' + String(n + 1).padStart(2, '0') + '</span>'
          + '<span class="tag">' + (p.kind === 'hard' ? '高难' : '普通') + '</span>'
          + '<span class="loc">' + ctx.roomNameById(p.room) + '</span>'
          + '<span class="nm">' + p.label + '</span></div>';
      });
      box.innerHTML = h;
      return;
    }
    box.classList.remove('design');
    if (G.taskKey === key) return;
    G.taskKey = key;
    let h = '<div class="th">本局任务 · 目标舱室</div>';
    me.tasks.forEach((ti, n) => {
      const p = M.points[ti];
      if (!p) return;
      const done = n < me.tIdx, now = n === me.tIdx;
      h += '<div class="tr ' + (p.kind === 'hard' ? 'hard' : 'normal') + (done ? ' done' : '') + (now ? ' now' : '') + '">'
        + '<span class="no">' + String(n + 1).padStart(2, '0') + '</span>'
        + '<span class="tag">' + (p.kind === 'hard' ? '高难' : '普通') + '</span>'
        + '<span class="loc">' + ctx.roomNameById(p.room) + '</span>'
        + '<span class="nm">' + p.label + '</span></div>';
    });
    box.innerHTML = h;
  }

  function sync(ctx) {
    if (ctx.isSim()) return;
    const G = ctx.getG();
    if (!G) return;
    const M = ctx.M;
    const WIN_PTS = ctx.winPts;
    const GHOST_TASK_CAP = ctx.ghostTaskCap;
    const spectator = !!G.spectMode;
    const pers = hudEl('personal');
    if (pers) pers.classList.toggle('hide', spectator);
    hudText('pg', G.prog);
    const pgmax = hudEl('pgmax');
    if (pgmax && pgmax.textContent !== String(WIN_PTS)) pgmax.textContent = WIN_PTS;
    const pgi = hudEl('pgi');
    if (pgi) {
      const w = Math.min(100, G.prog / WIN_PTS * 100) + '%';
      if (pgi.style.width !== w) pgi.style.width = w;
    }
    const bar = hudEl('bar');
    if (bar) bar.classList.toggle('soon', !G.over && G.prog >= Math.round(WIN_PTS * 0.75));
    hudText('tm', Math.max(0, G.t).toFixed(0));
    hudText('nt', G.night);
    const alive = G.agents.filter(a => a.alive).length;
    const hum = G.agents.filter(a => a.alive && !a.alien).length;
    const ali = G.agents.filter(a => a.alive && a.alien).length;
    hudText('alive', alive);
    hudText('hum', hum);
    hudText('ali', ali);
    hudText('dn', (G.dev || G.spectMode) ? G.agents.filter(a => a.downed && a.alive).length : 0);
    hudText('tk', G.me.tIdx);
    hudText('ql', G.me.qual);
    hudText('qp', G.me.qualPending || 0);
    const qh = hudEl('qual-hint');
    if (qh) qh.classList.toggle('hide', !(G.me.qualPending > 0));
    hudText('bl', G.me.bullet);
    hudText('md', G.me.medkit);
    hudText('rp', Math.max(0, G.me.reportLeft | 0));
    const mtEl = hudEl('mt');
    if (mtEl) {
      hudText('mt', Math.max(0, (G.nightMeets || 0)));
      const cap = global.SKSanity.MEET.perNight;
      const full = (G.nightMeets || 0) >= cap;
      const col = full ? '#FF8A80' : '';
      if (mtEl.style.color !== col) mtEl.style.color = col;
    }
    const pwr = hudEl('pwr');
    if (pwr) {
      const off = G.lightState === 2;
      hudText('pwr', off ? '全船断电' : (G.powerFixed ? '照明已修复' : '照明正常'));
      pwr.classList.toggle('off', off);
      pwr.classList.toggle('full', !off && G.powerFixed);
    }
    if (spectator) {
      const tl = document.getElementById('tasks');
      if (tl) tl.innerHTML = '';
    } else renderTaskList(ctx);

    const dl = document.getElementById('dmgline');
    if (dl) {
      if (!G.dmg.length) {
        if (!dl.classList.contains('hide')) dl.classList.add('hide');
      } else {
        dl.classList.remove('hide');
        const dtxt = '<b>故障</b> ' + G.dmg.map(d =>
          ctx.roomNameById(d.room) + '「' + d.label + '」 ' + Math.max(0, Math.ceil(d.left)) + 's').join(' · ');
        if (dl.__txt !== dtxt) { dl.__txt = dtxt; dl.innerHTML = dtxt; }
      }
    }
    const roleEl = document.getElementById('role');
    if (roleEl) {
      const txt = G.designMode ? '设计者 · 纯净视图 · 世界已冻结' :
        (spectator ? '旁观者 · 不参与对局' :
        (ctx.seatNo(G.me) + ' ' + G.me.name + ' · ' + (G.me.alien ? '内鬼' : '人类') +
          (!G.me.alive ? ' · 幽灵' : (G.me.downed ? ' · 濒死' :
          (G.me.detained ? ' · 被擒 ' + Math.max(0, Math.ceil(G.me.detainedT || 0)) + 's' : '')))));
      if (roleEl.textContent !== txt) roleEl.textContent = txt;
    }
    const tip = document.getElementById('tip');
    if (tip) {
      let t = G.designMode
        ? (G.sabPick
          ? '破坏选择：点击舱室按钮或按 1–9 直达 · ESC 取消 · 设计者模式不限次数'
          : (G.pipePick
            ? '地道选择：点击出口按钮或按 1–8 直达 · ESC 取消 · 设计者模式无冷却'
            : (G.camView
              ? '监控台：ESC 退出 · 配电室拉闸会切断全部 ' + M.rooms.length + ' 路信号'
              : '设计者纯净：点击穿墙飞行（6.5 格/秒） · W 交互（' + M.points.length + ' 任务点 / ' + M.pipes.length + ' 管道口 / 电闸 / 监控 / 领单 / 补给全开） · H 破坏 · ESC 暂停')))
        : spectator
        ? '旁观者：点击地面飞行（9 格/秒 · 穿墙 · 全知） · ESC 暂停/设置'
        : (G.sabPick
        ? '破坏选择：点击舱室按钮或按 1–9 直达 · ESC 取消 · 每夜一次'
        : (G.pipePick
          ? '地道选择：点击出口按钮或按 1–8 直达 · ESC 取消 · 内鬼专用'
          : (G.camView
            ? '监控台：ESC 退出 · 配电室拉闸会切断全部 ' + M.rooms.length + ' 路信号'
            : (G.sabTarget && G.me.alien && !G.me.sabUsed
              ? '破坏目标：' + ctx.roomNameById(G.sabTarget.room) + '「' + G.sabTarget.label + '」· 进入舱室自动下手 · 30 秒内可被修复'
              : (!G.me.alive
                ? '幽灵态：点击穿墙移动 · W 维修任务（1.6×，额度 ' + (GHOST_TASK_CAP - (G.me.ghostPts || 0)) + ' 分）· 不能修故障/报告/投票/搜尸'
                : (G.me.downed
                  ? '你已濒死：等队友 F 施救，或被拖进医疗间'
                  : (G.me.detained
                    ? '被保安机器人锁住：' + Math.max(0, Math.ceil(G.me.detainedT || 0)) + ' 秒后自动释放 · 不能移动'
                    : (G.me.alien
                      ? '移动=点击地面 · W 交互/钻道 · A 出刀 · B 开枪 · H 破坏 · R 报告 · S 搜尸 · D 拖/放 · ESC 暂停'
                      : '移动=点击地面 · W 交互（多目标按 1-9） · R 报告 · S 搜尸 · D 拖/放 · F 施救 · B 开枪 · ESC 暂停'))))))));
      if (!spectator && !G.designMode && (G.me.stunT || 0) > 0)
        t = '刚被无人机救起：' + Math.max(0, Math.ceil(G.me.stunT)) + ' 秒内不能移动 · E 仍可交互';
      if (tip.textContent !== t) tip.textContent = t;
    }
  }

  global.SKHud = { renderTaskList: renderTaskList, sync: sync, hudText: hudText };
})(window);
