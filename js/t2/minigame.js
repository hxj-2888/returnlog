/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 小游戏
 * truth     : js/t2/minigame.js#SKMiniGame
 * verify    : 全量门禁（?test 自动解题）/ 真实试玩
 * flag      : F
 * note      : 2026-11-05 接入：站桩动作改为遮罩小游戏；高难 8 型各一、普通按舱室归类
 * ============================================================== */
/* 小游戏
   -------------------------------------------------------------
   高难 8 个任务点各占一个独立玩法；普通 18 个按舱室与名称归类复用。
   玩法原型与 tools/minigame-preview.html 同源（那边是设计台，这里是运行时）。
   设计约束（用户 2026-11-05 裁定）：
     · UI 遮罩盖住大半屏幕 → 做任务时看不见有人走近（attention='ui'）
     · **没有限时**：计时只是「保底」——到点自动算完成，不是"完不成就清零"
     · 中断（Esc / 点中断）→ 进度清零，必须重做
     · 样式令牌与 js/ui/templates.js 一致（#12161E / #2A3240 / #DDE3EC / #F0C674）
     · 目标时长（普通玩家）：普通 4~6s、高难 8~10s、电路维修 9~12s
   本文件不读对局状态、不写任何分数；完成/中断通过回调交回 game.js。 */
(function (global) {
  'use strict';

  /* 26 个任务点 → 独立配置（2026-11-06 用户裁定：普通任务也单独定制）。
     底层仍是可复用的交互原型，但每个任务有自己的步数 / 符号 / 颜色 / 规则参数 / 提示，
     不再只是"按舱室归类复用"。高难 8 个保持 2.5D 的独特玩法；
     普通任务从 10 型里选最贴任务语义的一型，并给出独立配置。 */
  /* 26 个任务全部是「一张贴图 + 若干热点 + 一个动词」。
     没有记忆型玩法：顺序点按的编号直接画在图上（.pord 徽章），不靠记。
     难度只靠「简单动作 × 重复次数」，不收窄窗口、不藏线索（R4.5）。 */
  const TASKS = {
    /* ---- 电力 · 电闸柜 ---- */
    '引擎组同步': { k:'plate', plate:'breaker', verb:'holdBand', use:'tube', n:3, dur:2.2,
      color:'#F5A64A', hint:'三根加热管各自按住升到亮带再松手；过头会自己退回来' },
    '温控面板': { k:'plate', plate:'breaker', verb:'holdBand', use:'tube', n:2, dur:1.9,
      band:[62,72], color:'#3DC7F2', hint:'两路温控按住升到亮带再松手；亮带更窄一格' },
    '消毒循环': { k:'plate', plate:'panel-breaker', verb:'hold', use:'lever', n:3, hold:0.9,
      color:'#00E5B0', hint:'把闸刀分三段按住推到底，每段充满即到位' },

    /* ---- 维修 · 电路板 / 扳手 ---- */
    /* 2026-11-20 用户裁定：电路维修最多 5 处断口，取消「3 处锁死 × 2 组」的旧设计。
       板数据里有 5 根真实电线，n 取满 5（不再靠重复组数加难）。 */
    '电路维修': { k:'wire', n:5, color:'#E0574F',
      hint:'直接操控面板图里的五处断线：点一头 → 再点另一头，接错不重置' },
    '保险盘接线': { k:'wire', n:2, color:'#F0C674',
      hint:'接回保险盘上的两处断线；接错不重置' },
    '零件车': { k:'plate', plate:'panel-fix', verb:'drag', use:'part', n:3,
      color:'#73A7FF', hint:'把三个零件拖回电路板上的虚线缺口；拖歪不重置' },
    '变压器换芯': { k:'plate', plate:'transformer', verb:'tapSeq', use:'bolt', n:3,
      color:'#B07CFF', hint:'按图上的 1→2→3 依次拆下三枚旧芯螺栓；点错不重置' },
    '工具台': { k:'plate', plate:'tool-wrench', verb:'tapSeq', use:'bolt', n:3,
      color:'#5AD1C0', hint:'按 1→2→3 把工具挂回三个卡位' },
    '工作台': { k:'plate', plate:'tool-wrench', verb:'hold', use:'bolt', n:3, hold:1.1,
      color:'#F5A64A', hint:'按住三个螺栓拧紧，充满即到位' },

    /* ---- 生态 · 通风与补液 ---- */
    '氧气循环': { k:'plate', plate:'pipe-port-ecosys', verb:'tapSeq', use:'vent', n:4,
      color:'#57DB70', hint:'按图上的 1→2→3→4 依次打开四片通风叶；点错不重置' },
    '培养罐补液': { k:'plate', plate:'tank-gauge', verb:'holdBand', use:'gauge', n:1, dur:2.6,
      color:'#00E5B0', hint:'按住注液，液面进入亮带再松手；过头会退回来' },

    /* ---- 医疗 · 医疗箱 / 无人机 ---- */
    '药柜': { k:'plate', plate:'supply-med', verb:'hold', use:['latch','lid'], n:3, hold:1.0,
      color:'#5AD1C0', hint:'按住三个锁扣直到充满，柜门才开' },
    '手术台校准': { k:'plate', plate:'surgery', verb:'drag', use:'probe', n:3,
      color:'#00E5B0', hint:'把三根探针拖回手术台的虚线接口；拖歪不重置' },
    '餐台清洁': { k:'plate', plate:'galley', verb:'tap', use:'dish', n:5,
      color:'#F5A64A', hint:'逐处点掉台面上的五处污渍' },
    '配餐台盘点': { k:'plate', plate:'galley', verb:'tapSeq', use:'dish', n:5,
      color:'#F0C674', hint:'按编号 1→5 依次核对五处餐位' },

    /* ---- 娱乐 · 监控台改的桌面 ---- */
    '娱乐桌': { k:'plate', plate:'rec-table', verb:'tap', use:'key', n:4,
      color:'#E052CC', hint:'点亮桌面上的四个位置，凑齐一局' },
    '点唱机': { k:'plate', plate:'rec-table', verb:'tapSeq', use:'key', n:4,
      color:'#B07CFF', hint:'按编号 1→4 依次按下四个音键' },

    /* ---- 监控 · 双屏与键盘 ---- */
    '监控墙重连': { k:'plate', plate:'monitor', verb:'tapSeq', use:'channel', n:4,
      color:'#3DC7F2', hint:'按编号 1→4 依次重连四个通道格' },
    '操作台': { k:'plate', plate:'monitor', verb:'tap', use:'key', n:5,
      color:'#73A7FF', hint:'逐格点按五个按键，把操作台跑一遍' },
    '录像归档': { k:'plate', plate:'monitor', verb:'drag', use:'tape', n:3,
      color:'#5AD1C0', hint:'把三盘录像拖进屏幕上的虚线档位' },

    /* ---- 军械 · 弹药箱 ---- */
    '弹药清点': { k:'plate', plate:'supply-ammo', verb:'tap', use:'bullet', n:5,
      color:'#F0C674', hint:'逐颗点按箱里的子弹，清点 5 颗' },
    '靶道校准': { k:'plate', plate:'target-lane', verb:'aim', n:4,
      color:'#E0574F', hint:'准星扫进亮带时点击，连中 4 次；脱靶不扣进度' },

    /* ---- 仓储 · 舱门板与货位 ---- */
    '库存盘点': { k:'plate', plate:'shelf', verb:'hold', use:'deck', n:4, hold:0.7,
      color:'#F5A64A', hint:'逐格按住清点四个库存位，充满即记数' },
    '货架校准': { k:'plate', plate:'shelf', verb:'holdBand', use:'deck', n:4, dur:2.4,
      color:'#F0C674', hint:'四层货架各自按住顶到亮线；过头会退回来' },
    '货箱封条': { k:'plate', plate:'door-panel', verb:'hold', use:'strip', n:4, hold:0.8,
      color:'#F0C674', hint:'按住四条封条压紧，充满即封好' },
    '出库扫描': { k:'plate', plate:'door-panel', verb:'hold', use:'strip', n:4, hold:0.7,
      color:'#73A7FF', hint:'逐条按住扫过四条灯带，充满即完成一条' }
  };

  const BY_LABEL = {};
  for (const k in TASKS) BY_LABEL[k] = TASKS[k].k;
  /* 动作兜底：摸不到具体点位时按动作类型选 */
  const ARCH = {
    fix: 'wire', revive: 'wire',
    task: 'place', search: 'place', qual: 'place', ammo: 'place', med: 'place',
    breaker: 'lever'
  };
  /* 图内任务的通用兜底提示；每个任务自己的提示在 TASKS[label].hint。 */
  const HINT = {
    wire: '点断口这头 → 再点那头，直接把图里的线接回去；接错线不重置',
    place: '零件 → 槽位，形状要对上；放错不重置',
    lever: '按住不放直到充满；松手保持进度',
    plate: '点按 / 长按 / 拖动贴图上标出的位置；做错不重置，进度不清零'
  };

  const CSS = `
  /* z-index 必须高于 #v3-root（9999），否则遮罩被画在画布下面 ——
     DOM 里 open=true、元素也 visible，但玩家一个字都看不见（2026-11-05 实测）。
     仍低于设置面板（10010）与复盘（10005）：那两层是模态，该压住小游戏。 */
  #mg{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;
    background:rgba(3,6,11,.62);font-family:system-ui,"Microsoft YaHei",sans-serif}
  #mg.on{display:flex}
  /* 2026-11-19 晚用户裁定：板图直接占满整张屏幕，不再露出背后的铁板与外框；
     HUD 改为浮层（顶部标题+步骤、时间提示在任务栏上方、底部提示与中断）。 */
  #mg .card{position:relative;width:100vw;height:100vh;border:0;border-radius:0;
    background:#05080D;display:block;overflow:hidden;color:#DDE3EC;box-shadow:none}
  #mg .hd{position:absolute;left:0;right:0;top:0;z-index:6;display:flex;align-items:center;
    justify-content:space-between;padding:10px 14px 6px;border:0;font-size:13px;font-weight:600;
    color:#F0C674;background:linear-gradient(rgba(5,8,13,.78),rgba(5,8,13,0));
    text-shadow:0 1px 3px rgba(0,0,0,.85)}
  #mg .tm{position:absolute;left:0;right:0;top:38px;z-index:6;text-align:center;font-size:12px;
    color:#F0C674;font-variant-numeric:tabular-nums;text-shadow:0 1px 4px #000}
  #mg .hd span{font-size:11px;font-weight:400;color:#8FA6C0;font-variant-numeric:tabular-nums}
  #mg .hd strong{flex:1 1 auto}
  #mg .hd #mg-s{color:#F0C674;margin-right:10px}
  #mg .bar{position:absolute;left:0;right:0;top:60px;z-index:6;height:3px;background:rgba(34,40,51,.55)}
  #mg .bar i{display:block;height:100%;background:#F0C674;width:100%}
  #mg .bd{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;
    align-items:center;gap:12px;padding:0;overflow:hidden}
  #mg .tip{position:absolute;left:0;right:0;bottom:46px;z-index:6;font-size:11.5px;color:#C9D3E1;
    min-height:17px;text-align:center;text-shadow:0 1px 4px #000;pointer-events:none}
  #mg .tip.bad{color:#E08A86}#mg .tip.good{color:#F0C674}
  #mg .ft{position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;
    justify-content:space-between;align-items:center;padding:8px 14px;border:0;font-size:11px;
    color:#C9D3E0;background:linear-gradient(rgba(5,8,13,0),rgba(5,8,13,.82))}
  #mg button{background:#1D2530;color:#DDE3EC;border:1px solid #313B4B;border-radius:8px;
    padding:6px 12px;font-size:12px;font-family:inherit;cursor:pointer}
  #mg button:hover{border-color:#F0C674;color:#F0C674}
  #mg .wire{position:relative;display:flex;justify-content:space-between;gap:40px;width:68%;height:180px}
  #mg .col{display:flex;flex-direction:column;justify-content:space-around}
  #mg .port{width:46px;height:28px;border-radius:6px;border:1px solid #313B4B;background:#0D1117;
    position:relative;cursor:pointer}
  #mg .port::after{content:"";position:absolute;inset:6px 10px;border-radius:2px;background:currentColor}
  #mg .port.sel{border-color:#F0C674}#mg .port.done{opacity:.4;cursor:default}
  #mg .port[data-c="t"]{color:#00E5B0}#mg .port[data-c="a"]{color:#F0C674}
  #mg .port[data-c="r"]{color:#E0574F}#mg .port[data-c="b"]{color:#73A7FF}
  #mg .port[data-c="g"]{color:#B07CFF}#mg .port[data-c="v"]{color:#5AD1C0}
  /* 当前该操作的东西给一圈呼吸光：玩家一眼看到「下一步点哪」 */
  #mg .port.hint,#mg .blk.hint,#mg .slot.hint,#mg .cd.hint{
    box-shadow:0 0 0 2px rgba(240,198,116,.55);animation:mgpulse 1.1s ease-in-out infinite}
  @keyframes mgpulse{0%,100%{box-shadow:0 0 0 2px rgba(240,198,116,.35)}
    50%{box-shadow:0 0 0 3px rgba(240,198,116,.75)}}
  #mg svg.ln{position:absolute;inset:0;pointer-events:none}
  #mg .grid{display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,46px);gap:7px}
  #mg .slot{border:1px dashed #3A4454;border-radius:7px;display:flex;align-items:center;
    justify-content:center;color:#5C6678;font-size:16px;cursor:pointer;position:relative}
  /* 槽位画形状水印：旧版答案藏在 dataset.s 不画出来，玩家只能点错反推（信息缺失≠难度）。 */
  #mg .slot::before{content:attr(data-s);position:absolute;color:#4E5B70;font-size:14px;opacity:.55}
  #mg .slot.sel-hint{border-color:#F0C674;background:rgba(240,198,116,.10)}
  #mg .slot.sel-hint::before{color:#F0C674;opacity:1}
  #mg .slot.filled{border-style:solid;border-color:#4A3C1E;background:rgba(240,198,116,.08);color:#F0C674}
  #mg .slot.filled::before{content:none}
  #mg .slot.decoy::before{color:#8A6A4A}
  #mg .tray{display:flex;gap:7px}
  #mg .blk{width:56px;height:30px;border-radius:7px;border:1px solid #313B4B;background:#0D1117;
    color:#DDE3EC;font-size:15px;cursor:pointer}
  #mg .blk.sel{border-color:#F0C674}#mg .blk.used{opacity:.25;cursor:default}
  #mg .row{display:flex;align-items:center;gap:14px}
  #mg .rail{width:22px;height:140px;border-radius:11px;background:#0D1117;border:1px solid #313B4B;
    position:relative;overflow:hidden}
  #mg .rail i{position:absolute;left:0;right:0;bottom:0;background:#F0C674;height:0}
  #mg .lever svg{width:126px;height:140px;overflow:visible}
  #mg .arm{transition:transform .06s linear;transform-origin:63px 116px}
  #mg .spark{opacity:0}#mg .fire .spark{opacity:1}
  /* 图内要素板：两层都引用同一张图，断口是面层的 mask，不是新增线条 */
  #mg .plate-wrap{position:relative;width:min(330px,84%);aspect-ratio:1/1;flex:0 0 auto;
    overflow:hidden;background:transparent}
  #mg .plate-svg{display:block;width:100%;height:100%}
  #mg .plate-under{filter:blur(7px) brightness(.34) saturate(.7)}
  #mg .cut-rect{transition:transform .42s cubic-bezier(.2,.8,.2,1)}
  #mg .ember-hit{cursor:pointer}
  @keyframes mghalo{0%{transform:scale(1);opacity:.5}70%{opacity:.12}100%{transform:scale(2.4);opacity:0}}
  #mg .plate-halo{transform-box:fill-box;transform-origin:center;animation:mghalo 1.7s ease-out infinite}
  #mg button.plate-peek{position:absolute;right:14px;bottom:52px;z-index:7;padding:4px 10px;font-size:11px}
  /* 图内任务热点（js/t2/plate-task.js）：点击层盖在贴图上，坐标是百分比；
     洞的收缩交给 .spot-hole 的过渡，原图像素自己长回来 */
  #mg .plate-spots{position:absolute;inset:0}
  #mg .pspot{position:absolute;border-radius:8px;background:transparent;cursor:pointer;
    transition:background .15s}
  #mg .pspot:hover{background:rgba(240,198,116,.10)}
  #mg .pspot.done{pointer-events:none}
  #mg .spot-hole{transition:transform .42s cubic-bezier(.2,.8,.2,1);
    transform-box:fill-box;transform-origin:center}
  #mg .spot-pop{transform-box:fill-box;transform-origin:center;
    animation:mgpop .52s ease-out forwards}
  @keyframes mgpop{0%{opacity:.9;transform:scale(.55)}100%{opacity:0;transform:scale(1.7)}}
  /* 完成态的图内位移（js/t2/plate-task.js#fxDone）：整块贴图在热点里被搬走 / 旋开 / 压下，
     底下露出的暗图就是空位；不新增图形，只动这张图的一块像素 */
  #mg .plate-moved{pointer-events:none}
  #mg .pmoved image{transform-box:view-box;
    transition:transform .46s cubic-bezier(.2,.8,.2,1),filter .46s ease}
  #mg .pglow{filter:blur(7px);animation:mgGlow .9s ease-out forwards}
  @keyframes mgGlow{0%{opacity:0}45%{opacity:.5}100%{opacity:.24}}
  /* 六动词的公共反馈：编号徽章 / 拖动 / 亮带 / 准星 / 顺序点错 */
  #mg .pspot.pdrag{cursor:grab;touch-action:none}
  #mg .pspot.pdrag.dragging{cursor:grabbing;z-index:3}
  #mg .pspot.idle{pointer-events:none;opacity:.32}
  #mg .pspot.holding{background:rgba(240,198,116,.16)}
  #mg .pord{position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;
    background:rgba(10,14,20,.84);color:var(--mg-accent);font-size:10px;font-style:normal;
    line-height:16px;text-align:center;pointer-events:none;border:1px solid var(--mg-accent)}
  #mg .ptarget{position:absolute;border-radius:50%;border:2px dashed var(--mg-accent);
    opacity:.8;pointer-events:none;box-sizing:border-box}
  #mg .pfill,#mg .pband{pointer-events:none}
  #mg .pspot.shake{animation:mgshake .28s ease-in-out}
  @keyframes mgshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
  #mg .pspot.paim{cursor:crosshair}
  #mg .paim-band{position:absolute;top:0;bottom:0;background:rgba(240,198,116,.20);
    border-left:1px solid var(--mg-accent);border-right:1px solid var(--mg-accent);pointer-events:none}
  #mg .paim-mk{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;
    background:var(--mg-accent);box-shadow:0 0 8px var(--mg-accent);pointer-events:none}
  #mg .pspot.paim.hit{background:rgba(240,198,116,.22)}
  /* 2026-11-06：每任务独立主题色；只改强调色，不改卡片骨架 */
  #mg{--mg-accent:#F0C674}
  #mg .hd strong,#mg .hd #mg-s{color:var(--mg-accent)}
  #mg .bar i{background:var(--mg-accent)}
  #mg .tip.good{color:var(--mg-accent)}
  #mg button:hover{border-color:var(--mg-accent);color:var(--mg-accent)}
  `;

  let node = null, api = null;

  function ensure() {
    if (node) return node;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    node = document.createElement('div');
    node.id = 'mg';
    node.innerHTML =
      '<div class="card"><div class="hd"><strong id="mg-t">小游戏</strong>' +
      '<span id="mg-s">—</span></div>' +
      '<div class="tm" id="mg-tm">—</div><div class="bar"><i id="mg-p"></i></div><div class="bd" id="mg-b"></div>' +
      '<div class="ft"><span id="mg-f">—</span><button id="mg-a">中断（进度清零）</button></div></div>';
    /* 2026-11-06 补：这个按钮此前只有样子、没有绑定，点它不会中断。
       与 Esc 走同一条口径：不结算、进度清零、回调交回 game.js。 */
    node.querySelector('#mg-a').addEventListener('click', function () {
      if (!api || api.done) return;
      const cancel = api.onCancel;
      close();
      if (cancel) cancel();
    });
    document.body.appendChild(node);
    return node;
  }

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffled(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function tip(txt, bad) {
    const h = node && node.querySelector('.tip');
    if (!h) return;
    h.textContent = txt;
    h.className = 'tip' + (bad === true ? ' bad' : bad === 'good' ? ' good' : '');
  }

  function close() {
    if (api && !api.done) (global.__SK_CLOSE = global.__SK_CLOSE || []).push(new Error().stack);
    if (api) {
      api.done = true;
      if (api.raf) cancelAnimationFrame(api.raf);
      if (api.anim) cancelAnimationFrame(api.anim);
    }
    api = null;
    if (node) node.classList.remove('on');
  }

  function settle(ok, msg) {
    if (!api || api.done) return;
    if (ok && api.need > 0 && (api.have || 0) < api.need) {
      (global.__SK_PREMATURE = global.__SK_PREMATURE || []).push(msg + "\n" + new Error().stack);
    }
    api.done = true;
    if (api.raf) cancelAnimationFrame(api.raf);
    if (api.anim) cancelAnimationFrame(api.anim);
    api.raf = api.anim = 0;
    const mine = api, cb = ok ? api.onDone : api.onCancel;
    tip(msg, ok ? 'good' : true);
    const fire = function () {
      if (mine.fired) return;
      mine.fired = true;
      if (cb) cb();
    };
    if (!ok) {
      fire();
      const b = el('button', null, '关闭');
      b.style.marginTop = '8px';
      b.onclick = function () { close(); };
      node.querySelector('#mg-b').appendChild(b);
      return;
    }
    setTimeout(function () { if (api === mine) close(); fire(); }, 700);
  }

  /* 没有限时：这里只是**保底**。到点自动算完成，绝不清零 ——
     玩家慢慢做也做得完，快的人靠解谜提前结束。 */
  function tick() {
    if (!api || api.done) return;
    const el2 = (performance.now() - api.t0) / 1000;
    const left = api.limit - el2;
    if (left <= 0) { settle(true, '保底时间到 · 任务自动完成'); return; }
    node.querySelector('#mg-tm').textContent = '保底 ' + Math.ceil(left) + 's';
    node.querySelector('#mg-p').style.width = Math.min(100, el2 / api.limit * 100).toFixed(1) + '%';
    api.raf = requestAnimationFrame(tick);
  }
  /* 步骤进度：让玩家随时知道「还差几步」。total 由各玩法自己定。 */
  function setProg(done, total, msg) {
    if (!api) return;
    api.have = done; api.need = total;
    const s = node && node.querySelector('#mg-s');
    if (s) s.textContent = total ? (Math.min(done, total) + ' / ' + total) : '—';
    if (msg) tip(msg);
  }
  /* 难度档：normal / hard / circuit（电路维修单独一档） */
  function tierN(normal, hard, circuit) {
    const t = api && api.tier;
    return t === 'circuit' ? (circuit == null ? hard : circuit) : t === 'hard' ? hard : normal;
  }
  /* 当前任务的独立配置；没有配置时回退到旧默认值。 */
  function cfg(key, def) {
    return api && api.cfg && api.cfg[key] != null ? api.cfg[key] : def;
  }
  /* 给「下一步该动的东西」加高亮；传 null 清空 */
  function hintEl(e, on) {
    if (!e) return;
    if (on) e.classList.add('hint'); else e.classList.remove('hint');
  }

  /* ---------- 接线 · 图内要素（2026-11-06 落实） ----------
     用户口径：「不要在图外面再画四根新线，要直接操控生成图里的电线」。
     板描述唯一真源在 js/data/plates.js：path / cut 都是图片像素坐标，
     path 只用于接通瞬间的一道电流脉冲，断口靠 mask 挖掉原图中段，
     接通时遮罩合拢、原图像素自己长回来 —— 全程不新增任何一根线。
     没有加载板数据时回退到旧的「两端端口 + SVG 连线」，保证 file:// 降级可玩。 */
  function buildWire(bd) {
    const P = global.SKPlates;
    const plate = P && (P.forLabel(api.label) || P.defaultPlate());
    if (plate && plate.wires && plate.wires.length) { buildPlate(bd, plate); return; }
    buildWireClassic(bd);
  }

  function buildPlate(bd, plate) {
    const NS = 'http://www.w3.org/2000/svg';
    const [W, H] = plate.size;
    const crop = plate.crop || [0, 0, W, H];
    const CW = plate.cut.w, CH = plate.cut.h;
    const ER = plate.ember.r, HIT = plate.ember.hit;
    /* 难度档只决定「启用几处断口」，不改动板数据：普通 2 / 高难 3 / 电路 5 */
    const pick = shuffled(plate.wires.map(function (_, i) { return i; }))
      .slice(0, Math.max(1, Math.min(plate.wires.length, cfg('n', tierN(2, 3, 5)))));
    const wires = pick.map(function (i) { return plate.wires[i]; });
    const state = wires.map(function () { return { held: -1, done: false }; });
    let heldWire = -1;
    /* 分组重接机制保留给以后要用「重复次数」抬难度的板；电路维修已改成 5 处真实断口，
       cfg.rounds 缺省为 1，不再走复位重接。 */
    const ROUNDS = Math.max(1, cfg('rounds', 1));
    let round = 1;

    function s(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }
    function endsOf(w) {
      const a = w.cut.angle * Math.PI / 180;
      const dx = Math.cos(a), dy = Math.sin(a), d = CH / 2 + 2.5;
      return [[w.cut.x - dx * d, w.cut.y - dy * d],
              [w.cut.x + dx * d, w.cut.y + dy * d]];
    }

    const wrap = el('div', 'plate-wrap');
    /* 与 plate-task 同一口径：整块板图完整装进屏幕（contain），上下让出 HUD 浮层高度。
       cover 会把 crop 放大推出屏幕，断口/线头就落到看不见的地方（2026-11-20 用户裁定改回）。 */
    const cw = crop[2], ch = crop[3];
    const availW = (bd.clientWidth || 720) - 16, availH = (bd.clientHeight || 440) - 128;
    const sc = Math.min(availW / cw, availH / ch);
    wrap.style.width = (cw * sc).toFixed(1) + 'px';
    wrap.style.height = (ch * sc).toFixed(1) + 'px';
    wrap.style.aspectRatio = cw + ' / ' + ch;
    const svg = s('svg', { 'class': 'plate-svg', viewBox: crop.join(' '),
      preserveAspectRatio: 'xMidYMid meet' });
    const defs = s('defs', {});
    const mask = s('mask', { id: 'mgCutMask', maskUnits: 'userSpaceOnUse',
      x: 0, y: 0, width: W, height: H });
    mask.appendChild(s('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
    const cuts = s('g', { 'class': 'plate-cuts' });
    mask.appendChild(cuts);
    defs.appendChild(mask);
    const grad = s('radialGradient', { id: 'mgCutGrad' });
    grad.appendChild(s('stop', { offset: '0%', 'stop-color': '#000' }));
    grad.appendChild(s('stop', { offset: '52%', 'stop-color': '#000' }));
    grad.appendChild(s('stop', { offset: '100%', 'stop-color': '#fff' }));
    defs.appendChild(grad);
    /* 图只挂一份，底层虚化副本用 <use> 引用；href 是相对 index.html 的路径 */
    const img = s('image', { id: 'mgPlateSrc', href: plate.image,
      x: 0, y: 0, width: W, height: H });
    defs.appendChild(img);
    svg.appendChild(defs);
    svg.appendChild(s('use', { href: '#mgPlateSrc', 'class': 'plate-under' }));
    const face = s('use', { href: '#mgPlateSrc', 'class': 'plate-face',
      mask: 'url(#mgCutMask)' });
    svg.appendChild(face);
    const embers = s('g', { 'class': 'plate-embers' });
    const pulses = s('g', { 'class': 'plate-pulses' });
    svg.appendChild(embers);
    svg.appendChild(pulses);
    wrap.appendChild(svg);

    const peek = el('button', 'plate-peek', '按住看原图');
    bd.appendChild(wrap);
    bd.appendChild(peek);

    function setCuts() {
      cuts.innerHTML = '';
      wires.forEach(function (w) {
        const r = s('rect', {
          x: w.cut.x - CW / 2, y: w.cut.y - CH / 2,
          width: CW, height: CH, fill: 'url(#mgCutGrad)', 'class': 'cut-rect'
        });
        r.style.transformOrigin = 'center';
        r.style.transformBox = 'fill-box';
        r.style.transform = 'rotate(' + w.cut.angle + 'deg)';
        cuts.appendChild(r);
      });
    }
    function setEmbers() {
      embers.innerHTML = '';
      wires.forEach(function (w, i) {
        if (state[i].done) return;
        endsOf(w).forEach(function (p, k) {
          const x = p[0], y = p[1], held = state[i].held === k;
          embers.appendChild(s('circle', { cx: x, cy: y, r: ER + 2,
            fill: w.color, opacity: .35, 'class': 'plate-halo' }));
          embers.appendChild(s('circle', { cx: x, cy: y, r: ER + 2.4,
            fill: 'rgba(4,7,11,.72)' }));
          embers.appendChild(s('circle', { cx: x, cy: y, r: ER + 1.4,
            fill: 'none', stroke: w.color, 'stroke-width': held ? 2.2 : 1.5 }));
          embers.appendChild(s('circle', { cx: x, cy: y, r: held ? 2.9 : 2.1,
            fill: held ? '#FFF1CE' : '#F0C674' }));
          const hit = s('circle', { cx: x, cy: y, r: HIT, fill: 'transparent',
            'class': 'ember-hit', 'data-i': i, 'data-k': k });
          hit.addEventListener('click', function (e) {
            e.stopPropagation();
            onEnd(i, k);
          });
          embers.appendChild(hit);
        });
      });
    }
    function repair(i) {
      const w = wires[i];
      state[i].done = true; state[i].held = -1; heldWire = -1;
      const rect = cuts.children[i];
      if (rect) rect.style.transform = 'rotate(' + w.cut.angle + 'deg) scaleX(0)';
      /* 电流脉冲只是特效，沿标注路径跑一趟，不是新画的一根线 */
      const pulse = s('path', { d: w.path, fill: 'none', stroke: '#BFF7E6',
        'stroke-width': 2.2, 'stroke-linecap': 'round' });
      pulse.style.strokeDasharray = '26 480';
      pulses.appendChild(pulse);
      if (pulse.animate) {
        pulse.animate(
          [{ strokeDashoffset: 480, opacity: .95 }, { strokeDashoffset: -40, opacity: 0 }],
          { duration: 620, easing: 'cubic-bezier(.2,.7,.2,1)' }
        ).onfinish = function () { if (pulse.parentNode) pulse.parentNode.removeChild(pulse); };
      } else {
        setTimeout(function () { if (pulse.parentNode) pulse.parentNode.removeChild(pulse); }, 620);
      }
      setEmbers();
      const done = state.filter(function (st) { return st.done; }).length;
      if (done === wires.length && round < ROUNDS) {
        /* 这一组接完、还没到总组数：断口复位重接（同一张图、同样的线头位置），
           只重复次数变多。进度条仍按「当前组」的 3 处走（门禁读 0/3），组数靠文案说明。 */
        round++;
        state.forEach(function (st) { st.held = -1; st.done = false; });
        heldWire = -1;
        cuts.innerHTML = ''; pulses.innerHTML = '';
        setCuts(); setEmbers();
        setProg(0, wires.length,
          '第 ' + round + ' / ' + ROUNDS + ' 组：断口已复位，再把这几处接一遍');
        return;
      }
      setProg(done, wires.length,
        done === wires.length ? (ROUNDS > 1 ? '第 ' + round + ' / ' + ROUNDS + ' 组 · 全部接通' : '全部接通')
          : '接上了 · 还有 ' + (wires.length - done) + ' 处断口');
      if (done === wires.length) settle(true, '接线完成 · 任务成功');
    }
    function onEnd(i, k) {
      if (!api || api.done) return;
      const st = state[i];
      if (st.done) return;
      /* 捏住 A 的一头却点了 B 的端头 = 串错线：只松开手、提示，不清已接好的进度
         （2026-11-09 用户裁定取消「接错不重置」惩罚）。 */
      if (heldWire >= 0 && heldWire !== i) {
        state[heldWire].held = -1; heldWire = -1; setEmbers();
        tip('接错线 · 已接的保留，重新捏这头', true); return;
      }
      if (st.held === k) {
        st.held = -1; heldWire = -1;
        setEmbers(); tip('松开线头 · 这头那头都行'); return;
      }
      if (st.held >= 0) { repair(i); return; }
      st.held = k; heldWire = i;
      setEmbers(); tip('已捏住这头 · 点另一头接上（接错线不重置）');
    }
    function setPeek(on) {
      face.setAttribute('mask', on ? 'none' : 'url(#mgCutMask)');
      peek.textContent = on ? '原图（没有断口）' : '按住看原图';
    }
    peek.addEventListener('pointerdown', function (e) { e.preventDefault(); setPeek(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) {
      peek.addEventListener(t, function () { setPeek(false); });
    });

    setCuts();
    setEmbers();
    setProg(0, wires.length, ROUNDS > 1
      ? '共 ' + ROUNDS + ' 组、每组 ' + wires.length + ' 处断口：点一头 → 再点另一头，接一组复位再接下一组'
      : '共 ' + wires.length + ' 处断口：点断口这头 → 再点那头，接错线不重置');
  }

  /* ---------- 接线 · 旧版（无板数据时的降级玩法） ---------- */
  function buildWireClassic(bd) {
    /* 条数按档位：普通 4 / 高难 5 / 电路维修 6 —— 电路维修就是"线最多"的那一档 */
    const ALL = ['t', 'a', 'r', 'b', 'g', 'v'];
    const cols = ALL.slice(0, tierN(4, 5, 6));
    const box = el('div', 'wire');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ln');
    const lc = el('div', 'col'), rc = el('div', 'col');
    let sel = null, pairs = [];
    setProg(0, cols.length, '共 ' + cols.length + ' 条线：先点左端，再点右边同色的那一端');
    cols.forEach(function (c) {
      const p = el('div', 'port'); p.dataset.c = c;
      p.onclick = function () {
        if (api.done || p.classList.contains('done')) return;
        if (sel) hintEl(sel, false);
        sel = p; p.classList.add('sel'); hintEl(p, true);
        tip('已选左端（' + (pairs.length + 1) + ' / ' + cols.length + '）：点右边同色的端口');
      };
      lc.appendChild(p);
    });
    shuffled(cols).forEach(function (c) {
      const p = el('div', 'port'); p.dataset.c = c;
      p.onclick = function () {
        if (api.done || !sel || p.classList.contains('done')) return;
        if (p.dataset.c !== sel.dataset.c) {
          sel.classList.remove('sel', 'hint'); sel = null;
          tip('颜色不对 · 已接的保留，另选同色端', true); return;
        }
        const a = sel; a.classList.remove('sel'); a.classList.remove('hint');
        a.classList.add('done'); p.classList.add('done');
        pairs.push([a, p]); sel = null; draw();
        setProg(pairs.length, cols.length,
          pairs.length === cols.length ? '全部接通' : '已接 ' + pairs.length + ' / ' + cols.length + ' 条，继续');
        if (pairs.length === cols.length) settle(true, '接线完成 · 任务成功');
      };
      rc.appendChild(p);
    });
    box.appendChild(lc); box.appendChild(rc); box.appendChild(svg);
    bd.appendChild(box);
    function draw() {
      const bb = box.getBoundingClientRect(); svg.innerHTML = '';
      pairs.forEach(function (pr) {
        const X = pr[0].getBoundingClientRect(), Y = pr[1].getBoundingClientRect();
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M' + (X.right - bb.left) + ' ' + (X.top - bb.top + X.height / 2) +
          ' C' + (X.right - bb.left + 40) + ' ' + (X.top - bb.top + X.height / 2) + ',' +
          (Y.left - bb.left - 40) + ' ' + (Y.top - bb.top + Y.height / 2) + ',' +
          (Y.left - bb.left) + ' ' + (Y.top - bb.top + Y.height / 2));
        p.setAttribute('stroke', '#F0C674');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke-width', '2');
        svg.appendChild(p);
      });
    }
  }

  /* ---------- 放置 ---------- */
  function buildPlace(bd) {
    /* 零件数按任务配置；槽位永远多一个诱饵 */
    const shapes = cfg('shapes', ['▲', '●', '■', '◆', '✦', '✚']);
    const N = Math.max(2, Math.min(cfg('n', tierN(4, 5, 5)), shapes.length - 1));
    const need = shuffled(shapes.slice(0, N));
    const decoy = shapes.filter(function (s) { return need.indexOf(s) < 0; })[0];
    const slots = shuffled(need.concat([decoy]));
    const wrap = el('div', null);
    const grid = el('div', 'grid'), tray = el('div', 'tray');
    let sel = null, placed = 0;
    /* 槽位水印 + 选中高亮：把"点错反推"变成"看清楚再点"的执行挑战；诱饵仍要辨认。 */
    setProg(0, N, '共 ' + N + ' 个零件：槽位上标着形状，先点下方零件，再点同一个形状的槽（有一个诱饵槽）');
    const clearSlotHints = function () {
      Array.prototype.forEach.call(grid.children, function (d) { d.classList.remove('sel-hint'); });
    };
    slots.forEach(function (s) {
      const d = el('div', 'slot'); d.dataset.s = s;
      if (s === decoy) d.classList.add('decoy');
      d.onclick = function () {
        if (api.done || !sel || d.classList.contains('filled')) return;
        if (d.dataset.s !== sel.dataset.s) {
          sel.classList.remove('sel', 'hint'); sel = null; clearSlotHints();
          tip('形状不符 · 已放的保留，每个零件只认一个槽', true); return;
        }
        d.classList.add('filled'); d.textContent = sel.dataset.s;
        sel.classList.add('used'); sel.classList.remove('sel', 'hint'); sel = null; clearSlotHints();
        placed++;
        setProg(placed, N, placed === N ? '全部归位' : '已放置 ' + placed + ' / ' + N + '，继续');
        if (placed === N) settle(true, '放置完成 · 任务成功');
      };
      grid.appendChild(d);
    });
    shuffled(need).forEach(function (s) {
      const b = el('button', 'blk', s); b.dataset.s = s;
      b.onclick = function () {
        if (api.done || b.classList.contains('used')) return;
        if (sel) hintEl(sel, false);
        sel = b; b.classList.add('sel'); hintEl(b, true);
        clearSlotHints();
        Array.prototype.forEach.call(grid.children, function (d) {
          if (!d.classList.contains('filled') && d.dataset.s === s) d.classList.add('sel-hint');
        });
        tip('已选零件「' + s + '」：点高亮的同形状槽位');
      };
      tray.appendChild(b);
    });
    wrap.appendChild(grid); wrap.appendChild(tray);
    bd.appendChild(wrap);
  }

  /* ---------- 拉闸 / 合闸 ---------- */
  function buildLever(bd) {
    const row = el('div', 'row lever');
    const rail = el('div', 'rail'), fill = el('i');
    rail.appendChild(fill);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 126 140');
    svg.innerHTML = '<rect x="24" y="114" width="78" height="12" rx="6" fill="#0D1117" stroke="#313B4B"/>' +
      '<g class="arm"><rect x="58" y="34" width="10" height="86" rx="5" fill="#1B2432" stroke="rgba(240,198,116,.5)"/>' +
      '<circle cx="63" cy="36" r="13" fill="#0D1117" stroke="#F0C674" stroke-width="2"/></g>' +
      '<g class="spark"><path d="M63 28 L55 46 L66 44 L58 62" fill="none" stroke="#FFB020" stroke-width="2.4" stroke-linecap="round"/></g>';
    const hold = el('button', null, '按住不放 · 拉到底');
    row.appendChild(rail); row.appendChild(svg); row.appendChild(hold);
    bd.appendChild(row);
    setProg(0, 1, '按住按钮不放，直到拉杆转到底（约 ' + cfg('hold', 1.2) + ' 秒）');
    let charge = 0, held = false, last = 0, fire = 0;
    const arm = svg.querySelector('.arm');
    hold.addEventListener('pointerdown', function (e) { e.preventDefault(); held = true; });
    hold.addEventListener('pointerup', function () { held = false; });
    hold.addEventListener('pointercancel', function () { held = false; });
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      if (held && charge < 1) charge = Math.min(1, charge + dt / cfg('hold', 1.2));
      /* 2026-11-09 取消「松手保持进度」：松手保持已充进度，可分多次按住 */
      fill.style.height = (charge * 100).toFixed(0) + '%';
      arm.style.transform = 'rotate(' + (-70 * charge).toFixed(1) + 'deg)';
      if (fire > 0) { fire -= dt; if (fire <= 0) svg.classList.remove('fire'); }
      if (charge >= 1) {
        svg.classList.add('fire'); fire = .4;
        setTimeout(function () { settle(true, '电闸已到位'); }, 120);
        return;
      }
      api.anim = requestAnimationFrame(loop);
    }
    api.anim = requestAnimationFrame(loop);
  }

  /* ---------- 三通道同步 ---------- */

  /* ---------- 注液 / 注气 ---------- */

  /* ---------- 换芯 ---------- */

  /* ---------- 三点对准 ---------- */

  /* ---------- 准星保持 ---------- */

  /* ---------- 图标配对 ---------- */

  /* ---------- 层高对齐 ---------- */

  /* ---------- 顺序记忆（2026-11-06 新增） ---------- */

  /* ---------- 分拣（2026-11-06 新增） ---------- */

  /* ---------- 阀门（2026-11-06 新增） ---------- */

  /* ---------- 密码 / 编号（2026-11-06 新增） ---------- */

  const BUILD = {
    wire: buildWire, place: buildPlace, lever: buildLever
  };

  function kindOf(action, label) {
    if (label && BY_LABEL[label]) return BY_LABEL[label];
    return ARCH[action] || 'place';
  }

  /* 保底时长（秒）：到点自动完成，**不是**限时。
     按任务类别给：普通 10、高难 16、电路维修 20。
     目标解谜时间由玩法步数控制（普通 4~6s / 高难 8~10s / 电路 9~12s），
     保底留了约 2 倍的余量，手慢的人也做得完。 */
  const FALLBACK = { normal: 10, hard: 16, circuit: 20 };

  function open(action, opts) {
    ensure();
    close();
    opts = opts || {};
    const kind = kindOf(action, opts.label);
    const tier = opts.tier || 'normal';
    const task = (opts.label && TASKS[opts.label]) || null;
    api = {
      done: false, raf: 0, anim: 0, kind: kind, tier: tier, label: opts.label || null,
      cfg: task || {},
      limit: Math.max(3, opts.fallback || (task && task.fallback) ||
        FALLBACK[tier] || FALLBACK.normal),
      t0: performance.now(), onDone: opts.onDone, onCancel: opts.onCancel
    };
    node.style.setProperty('--mg-accent', (task && task.color) || '#F0C674');
    node.querySelector('#mg-t').textContent = opts.title || '任务';
    node.querySelector('#mg-f').textContent = (task && task.hint) || HINT[kind];
    node.querySelector('#mg-s').textContent = '—';
    node.querySelector('#mg-tm').textContent = '保底 ' + api.limit + 's';
    node.querySelector('#mg-p').style.width = '0%';
    const bd = node.querySelector('#mg-b');
    bd.innerHTML = '';
    node.classList.add('on');
    bd.appendChild(el('div', 'tip', HINT[kind]));
    /* 图内任务（k:'plate'）：板数据唯一真源在 js/data/plates.js，
       引擎是 js/t2/plate-task.js；引擎接不了（贴图缺失 / 动词未实现）就回退旧玩法。 */
    if (kind === 'plate') {
      const P = global.SKPlateTask;
      const plate = global.SKPlates ? global.SKPlates.forLabel(opts.label) : null;
      if (plate && P && P.build) {
        const host = {
          el: el, cfg: cfg, setProg: setProg, settle: settle, tip: tip, api: api,
          fallback: function () {
            if (api && api.done) return;
            bd.innerHTML = '';
            bd.appendChild(el('div', 'tip', HINT.place));
            buildPlace(bd);
          }
        };
        if (P.build(bd, plate, task || {}, host) !== false) {
          api.raf = requestAnimationFrame(tick);
          return kind;
        }
      }
      /* 降级：贴图缺失时仍可玩，只是不在图上作业（file:// 无图也不卡死） */
      bd.innerHTML = '';
      bd.appendChild(el('div', 'tip', HINT.place));
      buildPlace(bd);
      api.raf = requestAnimationFrame(tick);
      return kind;
    }
    (BUILD[kind] || buildPlace)(bd);
    api.raf = requestAnimationFrame(tick);
    return kind;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !api || api.done) return;
    api.done = true;
    if (api.raf) cancelAnimationFrame(api.raf);
    if (api.anim) cancelAnimationFrame(api.anim);
    const cancel = api.onCancel;
    close();
    if (cancel) cancel();
  });

  global.SKMiniGame = Object.freeze({
    open: open,
    close: close,
    kindOf: kindOf,
    isOpen: function () { return !!api && !api.done; },
    /* 只读数据出口：3D 端 / tools 用它导出同一张「任务→玩法」表与保底时长，
       不复制常量。这里只暴露数据，不暴露任何构建函数或对局状态。 */
    data: Object.freeze({
      byLabel: BY_LABEL,
      tasks: TASKS,
      arch: ARCH,
      hint: HINT,
      fallback: FALLBACK,
      /* plate 不进 BUILD（它由 js/t2/plate-task.js 引擎接），但它是合法的
         任务玩法，必须出现在只读数据出口里，否则 3D 导出会判「未知玩法」。 */
      kinds: Object.freeze(Object.keys(BUILD).concat(['plate']))
    })
  });
})(typeof window !== 'undefined' ? window : globalThis);
