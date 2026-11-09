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
  const TASKS = {
    '引擎组同步': { k:'sync', n:3, hold:0.6, targets:[[16,28],[46,60],[33,49]], color:'#F5A64A',
      hint:'三条引擎通道各自调进亮带，并同时保持 0.6 秒' },
    '零件台': { k:'place', n:4, shapes:['▲','●','■','◆','✦','✚'], color:'#73A7FF',
      hint:'把四种零件按形状放回对应槽位；放错整组重来' },
    '工具架': { k:'place', n:4, shapes:['✦','✚','◈','◇','▲','■'], color:'#5AD1C0',
      hint:'工具按形状归位；注意有一个诱饵槽' },
    '备用配电盘': { k:'wire', n:2, color:'#F0C674',
      hint:'接回配电盘上的两处断线；接错整组重来' },
    '氧气循环': { k:'pour', lo:58, hi:72, rate:32, color:'#57DB70',
      hint:'把氧气注到 58~72 的亮带内再松手' },
    '培养罐补液': { k:'pour', lo:44, hi:56, rate:44, color:'#00E5B0',
      hint:'补液到 44~56 之间再松手；溢出或不足都重来' },
    '温控面板': { k:'sync', n:2, hold:0.8, targets:[[25,40],[55,70]], color:'#3DC7F2',
      hint:'两路温控同时进入亮带并保持 0.8 秒' },
    '电路维修': { k:'wire', n:3, color:'#E0574F',
      hint:'直接操控面板图里的三处断线；接错整组重来' },
    '变压器换芯': { k:'swap', color:'#B07CFF',
      hint:'先取出旧芯，再插入同型号新芯' },
    '餐台清洁': { k:'sort', n:5, bins:['餐具','垃圾'], items:['盘','杯','叉','纸','壳'],
      assign:[0,0,0,1,1], color:'#F5A64A',
      hint:'把餐台上的东西分进「餐具 / 垃圾」两个筐' },
    '后厨盘点': { k:'sort', n:5, bins:['食材','器具'], items:['菜','肉','锅','刀','罐'],
      assign:[0,0,1,1,0], color:'#F0C674',
      hint:'按食材 / 器具分拣后厨物资' },
    '娱乐桌': { k:'sequence', n:4, symbols:['◈','◇','▣','▤'], color:'#E052CC',
      hint:'记住亮起的顺序，再按同样顺序点一遍' },
    '点唱机': { k:'sequence', n:5, symbols:['♪','♫','●','▲','■'], color:'#B07CFF',
      hint:'按点唱机提示的音符顺序依次按下' },
    '手术台校准': { k:'align', n:3, tol:0.022, color:'#00E5B0',
      hint:'把三个探针拖进虚线靶心；这次容差更小' },
    '药柜': { k:'match', n:4, icons:['◈','◇','▣','▤','◐','◑'], color:'#5AD1C0',
      hint:'翻两瓶药，图标相同即配对；错 3 次整组重来' },
    '消毒循环': { k:'valve', n:3, color:'#00E5B0',
      hint:'把三个阀门转到各自的刻度线；每点一次转 15°' },
    '靶道校准': { k:'aim', hits:3, speed:58, zone:7, color:'#E0574F',
      hint:'准星进亮带时点击，连中 3 次；这次准星更快' },
    '工作台': { k:'place', n:5, shapes:['✦','✚','◈','◇','▣','▲'], color:'#F5A64A',
      hint:'把五件工具按形状归位；槽位里有一个诱饵' },
    '弹药清点': { k:'sort', n:5, bins:['子弹','弹壳'], items:['5.56','9mm','.45','壳','箱'],
      assign:[0,0,0,1,1], color:'#F0C674',
      hint:'把子弹和弹壳分开清点' },
    '监控墙重连': { k:'code', code:'4271', clue:'屏幕角落的旧编号：4 - 2 - 7 - 1',
      color:'#3DC7F2', hint:'按旧编号重连监控墙；输错从头来' },
    '操作台': { k:'sequence', n:4, symbols:['▣','▤','◐','◑'], color:'#73A7FF',
      hint:'按操作台提示的顺序依次按下四个键' },
    '录像归档': { k:'code', code:'317', clue:'档案盒侧面：A - 3 - 7',
      color:'#5AD1C0', hint:'把录像归到正确档号；输错从头来' },
    '货架校准': { k:'level', n:5, tol:2.5, color:'#F0C674',
      hint:'把五层货架拖到同一条虚线，容差 ±2.5%' },
    '库存盘点': { k:'sort', n:4, bins:['在库','缺货'], items:['A','B','C','D'],
      assign:[0,1,0,1], color:'#F5A64A',
      hint:'按在库 / 缺货把库存分到两个筐' },
    '货箱封条': { k:'place', n:4, shapes:['✚','✦','◈','●','▲','■'], color:'#F0C674',
      hint:'选择正确形状的封条，封住四个货箱' },
    '出库扫描': { k:'code', code:'8142', clue:'出库单号：8 - 1 - 4 - 2',
      color:'#73A7FF', hint:'按出库单号完成扫描；输错从头来' }
  };
  const BY_LABEL = {};
  for (const k in TASKS) BY_LABEL[k] = TASKS[k].k;
  /* 动作兜底：摸不到具体点位时按动作类型选 */
  const ARCH = {
    fix: 'wire', revive: 'wire',
    task: 'place', search: 'place', qual: 'place', ammo: 'place', med: 'place',
    breaker: 'lever'
  };
  const HINT = {
    wire: '点断口这头 → 再点那头，直接把图里的线接回去；接错线整组重来',
    place: '零件 → 槽位，形状要对上；放错整组重来',
    lever: '按住不放直到充满；松早了整组重来',
    sync: '把三条通道都调进亮带并保持 0.6 秒',
    pour: '注到亮带内再松手；溢出或不足都重来',
    swap: '先取出旧芯，再插入同型号新芯',
    align: '把三个探针拖到虚线靶心',
    aim: '准星进带时点击，连中 3 次；脱靶清零',
    match: '翻两张，图标相同即配对；错配 3 次整组重来',
    level: '拖动四层货架，全部对齐到虚线',
    sequence: '按提示顺序依次按下；按错整组重来',
    sort: '先点物品，再点它应该去的筐；分错会记一次错误',
    valve: '点阀门旋转，把指针转到刻度线；三个都到位即完成',
    code: '按提示编号在键盘上输入；输错从头开始'
  };

  const CSS = `
  /* z-index 必须高于 #v3-root（9999），否则遮罩被画在画布下面 ——
     DOM 里 open=true、元素也 visible，但玩家一个字都看不见（2026-11-05 实测）。
     仍低于设置面板（10010）与复盘（10005）：那两层是模态，该压住小游戏。 */
  #mg{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;
    background:rgba(3,6,11,.62);font-family:system-ui,"Microsoft YaHei",sans-serif}
  #mg.on{display:flex}
  #mg .card{width:min(84vw,760px);height:min(82vh,540px);
    background:linear-gradient(rgba(10,14,20,.84),rgba(10,14,20,.92)),
      url("assets/minigame/task-frame.png") center/cover no-repeat,#12161E;
    border:1px solid #2A3240;
    border-radius:14px;display:flex;flex-direction:column;overflow:hidden;color:#DDE3EC;
    box-shadow:0 18px 48px rgba(0,0,0,.55)}
  #mg .hd{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;
    border-bottom:1px solid #2A3240;font-size:13px;font-weight:600;color:#F0C674}
  #mg .hd span{font-size:11px;font-weight:400;color:#8FA6C0;font-variant-numeric:tabular-nums}
  #mg .hd strong{flex:1 1 auto}
  #mg .hd #mg-s{color:#F0C674;margin-right:10px}
  #mg .bar{height:3px;background:#222833}
  #mg .bar i{display:block;height:100%;background:#F0C674;width:100%}
  #mg .bd{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;padding:14px;overflow:hidden}
  #mg .tip{font-size:11.5px;color:#8FA6C0;min-height:17px;text-align:center}
  #mg .tip.bad{color:#E08A86}#mg .tip.good{color:#F0C674}
  #mg .ft{display:flex;justify-content:space-between;align-items:center;padding:7px 13px;
    border-top:1px solid #2A3240;font-size:11px;color:#8FA6C0}
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
    justify-content:center;color:#5C6678;font-size:16px;cursor:pointer}
  #mg .slot.filled{border-style:solid;border-color:#4A3C1E;background:rgba(240,198,116,.08);color:#F0C674}
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
  #mg .rows{display:flex;flex-direction:column;gap:12px;width:78%}
  #mg .rrow{display:flex;align-items:center;gap:10px}
  #mg .rlab{width:54px;font-size:11px;color:#8FA6C0;flex:0 0 auto}
  #mg .rtrack{position:relative;flex:1;height:24px;display:flex;align-items:center}
  #mg .rtrack .band{position:absolute;top:3px;bottom:3px;background:rgba(240,198,116,.16);
    border:1px solid #4A3C1E;border-radius:4px}
  #mg .rtrack .ln{position:absolute;left:0;right:0;height:2px;background:#222833}
  #mg .rtrack input[type=range]{position:relative;width:100%;margin:0;accent-color:#F0C674;background:transparent}
  #mg .pourbin{display:flex;align-items:flex-end;gap:14px}
  #mg .vessel{width:58px;height:150px;border:1px solid #313B4B;border-radius:6px;background:#0D1117;
    position:relative;overflow:hidden}
  #mg .vessel .fill{position:absolute;left:0;right:0;bottom:0;height:0;
    background:linear-gradient(180deg,rgba(240,198,116,.75),rgba(240,198,116,.22))}
  #mg .vessel .zone{position:absolute;left:0;right:0;border-top:1px dashed rgba(240,198,116,.7);
    border-bottom:1px dashed rgba(240,198,116,.7);background:rgba(240,198,116,.07)}
  #mg .ticks{font-size:10px;color:#8FA6C0;display:flex;flex-direction:column;justify-content:space-between;height:150px}
  #mg .swap{display:flex;align-items:center;gap:16px}
  #mg .socket{width:70px;height:90px;border:1px solid #313B4B;border-radius:8px;background:#0D1117;
    display:flex;align-items:center;justify-content:center}
  #mg .core{width:54px;height:74px;border-radius:6px;display:flex;align-items:center;justify-content:center;
    font-size:10px;color:#0A0D13;font-weight:600}
  #mg .core.old{background:#6B7280}#mg .core.c1{background:#00E5B0}
  #mg .core.c2{background:#E0574F}#mg .core.c3{background:#73A7FF}
  #mg .board{position:relative;width:76%;height:168px;border:1px solid #2A3240;border-radius:8px;touch-action:none;
    background:repeating-linear-gradient(0deg,transparent 0 21px,rgba(255,255,255,.04) 21px 22px),
      repeating-linear-gradient(90deg,transparent 0 21px,rgba(255,255,255,.04) 21px 22px)}
  #mg .probe{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;
    border:2px solid #F0C674;background:rgba(240,198,116,.15);cursor:grab}
  #mg .tgt{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;
    border:1px dashed rgba(0,229,176,.7)}
  #mg .range{position:relative;width:78%;height:112px;border:1px solid #2A3240;border-radius:8px;
    background:#0D1117;overflow:hidden;cursor:crosshair}
  #mg .range .zone{position:absolute;top:0;bottom:0;left:46%;width:8%;
    background:rgba(240,198,116,.16);border-left:1px solid #4A3C1E;border-right:1px solid #4A3C1E}
  #mg .range .mk{position:absolute;top:0;bottom:0;width:2px;background:#F0C674;left:0}
  #mg .cards{display:grid;grid-template-columns:repeat(4,58px);gap:7px}
  #mg .cd{height:58px;border:1px solid #313B4B;border-radius:8px;background:#0D1117;cursor:pointer;
    display:flex;align-items:center;justify-content:center;font-size:17px;color:#3B4658}
  #mg .cd.up{color:#F0C674;border-color:#4A3C1E;background:rgba(240,198,116,.07)}
  #mg .cd.done{color:#00E5B0;border-color:#1F5A49;background:rgba(0,229,176,.06);cursor:default}
  #mg .shelf{position:relative;width:76%;height:176px;border:1px solid #2A3240;border-radius:8px;
    background:#0D1117;touch-action:none}
  #mg .shelf .tline{position:absolute;left:0;right:0;border-top:1px dashed rgba(240,198,116,.55)}
  #mg .lv{position:absolute;left:0;right:0;height:12px;background:#1B2432;border-top:2px solid #8FA6C0;
    cursor:ns-resize}
  #mg .lv i{position:absolute;right:6px;top:-9px;font-size:9px;color:#8FA6C0;font-style:normal}
  /* 图内要素板：两层都引用同一张图，断口是面层的 mask，不是新增线条 */
  #mg .plate-wrap{position:relative;width:min(330px,84%);aspect-ratio:1/1;flex:0 0 auto;
    border:1px solid #2A3240;border-radius:10px;overflow:hidden;background:#05080D;
    box-shadow:0 12px 34px rgba(0,0,0,.6)}
  #mg .plate-svg{display:block;width:100%;height:100%}
  #mg .plate-under{filter:blur(7px) brightness(.34) saturate(.7)}
  #mg .cut-rect{transition:transform .42s cubic-bezier(.2,.8,.2,1)}
  #mg .ember-hit{cursor:pointer}
  @keyframes mghalo{0%{transform:scale(1);opacity:.5}70%{opacity:.12}100%{transform:scale(2.4);opacity:0}}
  #mg .plate-halo{transform-box:fill-box;transform-origin:center;animation:mghalo 1.7s ease-out infinite}
  #mg button.plate-peek{padding:4px 10px;font-size:11px;margin-top:-4px}
  /* 2026-11-06：每任务独立主题色；只改强调色，不改卡片骨架 */
  #mg{--mg-accent:#F0C674}
  #mg .hd strong,#mg .hd #mg-s{color:var(--mg-accent)}
  #mg .bar i{background:var(--mg-accent)}
  #mg .tip.good{color:var(--mg-accent)}
  #mg button:hover{border-color:var(--mg-accent);color:var(--mg-accent)}
  /* 顺序记忆 */
  #mg .seq{display:flex;gap:10px;align-items:center;justify-content:center}
  #mg .seq .s{width:54px;height:46px;border:1px solid #313B4B;border-radius:8px;background:#0D1117;
    display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--mg-accent)}
  #mg .seq .s.on{border-color:var(--mg-accent);background:rgba(240,198,116,.10)}
  #mg .seqrow{display:flex;gap:8px;justify-content:center}
  /* 分拣 */
  #mg .sortrow{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:520px}
  #mg .sortitem{min-width:62px;height:38px;border:1px solid #313B4B;border-radius:8px;background:#0D1117;
    color:#DDE3EC;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer}
  #mg .sortitem.sel{border-color:var(--mg-accent);color:var(--mg-accent)}
  #mg .sortitem.used{opacity:.25;cursor:default}
  #mg .bins{display:flex;gap:12px;justify-content:center}
  #mg .bin{min-width:120px;height:46px;border:1px dashed #3A4454;border-radius:9px;background:#0D1117;
    color:#8FA6C0;font-size:12px;cursor:pointer}
  #mg .bin:hover{border-color:var(--mg-accent);color:var(--mg-accent)}
  /* 阀门 */
  #mg .valves{display:flex;gap:26px;justify-content:center;align-items:center}
  #mg .valve{width:92px;height:92px;border-radius:50%;border:2px solid #313B4B;background:#0D1117;
    position:relative;cursor:pointer;flex:0 0 auto}
  #mg .valve .needle{position:absolute;left:50%;top:9px;width:3px;height:32px;background:var(--mg-accent);
    border-radius:2px;transform-origin:50% 100%;transform:translateX(-50%) rotate(var(--ang,0deg))}
  #mg .valve .tick{position:absolute;left:50%;top:2px;width:7px;height:4px;background:#8FA6C0;
    transform-origin:50% 44px;transform:translateX(-50%) rotate(var(--tgt,0deg))}
  #mg .valve.ok{border-color:var(--mg-accent);box-shadow:0 0 0 2px rgba(240,198,116,.18)}
  /* 密码 */
  #mg .codebox{display:flex;gap:10px;align-items:center;justify-content:center}
  #mg .coded{width:42px;height:48px;border:1px solid #313B4B;border-radius:8px;background:#0D1117;
    display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--mg-accent)}
  #mg .keypad{display:grid;grid-template-columns:repeat(5,42px);gap:7px;justify-content:center}
  #mg .keypad button{width:100%;height:36px;padding:0;font-size:13px}
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
      '<span id="mg-s">—</span><span id="mg-c">—</span></div>' +
      '<div class="bar"><i id="mg-p"></i></div><div class="bd" id="mg-b"></div>' +
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
    node.querySelector('#mg-c').textContent = '保底 ' + Math.ceil(left) + 's';
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
    /* 难度档只决定「启用几处断口」，不改动板数据：普通 2 / 高难 3 / 电路 3 */
    const pick = shuffled(plate.wires.map(function (_, i) { return i; }))
      .slice(0, Math.max(1, Math.min(plate.wires.length, cfg('n', tierN(2, 3, 3)))));
    const wires = pick.map(function (i) { return plate.wires[i]; });
    const state = wires.map(function () { return { held: -1, done: false }; });
    let heldWire = -1;

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
    function resetAll() {
      state.forEach(function (st) { st.held = -1; st.done = false; });
      heldWire = -1;
      pulses.innerHTML = '';
      setCuts();
      setEmbers();
      setProg(0, wires.length, '接错线 → 整组重来，断口全部复位');
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
      setProg(done, wires.length,
        done === wires.length ? '全部接通' : '接上了 · 还有 ' + (wires.length - done) + ' 处断口');
      if (done === wires.length) settle(true, '接线完成 · 任务成功');
    }
    function onEnd(i, k) {
      if (!api || api.done) return;
      const st = state[i];
      if (st.done) return;
      /* 捏住 A 的一头却点了 B 的端头 = 串错线，和旧玩法一样整组重来 */
      if (heldWire >= 0 && heldWire !== i) { resetAll(); tip('接错线 → 整组重来', true); return; }
      if (st.held === k) {
        st.held = -1; heldWire = -1;
        setEmbers(); tip('松开线头 · 这头那头都行'); return;
      }
      if (st.held >= 0) { repair(i); return; }
      st.held = k; heldWire = i;
      setEmbers(); tip('已捏住这头 · 点另一头接上（接错线整组重来）');
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
    setProg(0, wires.length,
      '共 ' + wires.length + ' 处断口：点断口这头 → 再点那头，接错线整组重来');
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
          pairs = []; svg.innerHTML = '';
          Array.prototype.forEach.call(box.querySelectorAll('.port'), function (x) {
            x.classList.remove('done', 'sel', 'hint');
          });
          sel = null; setProg(0, cols.length, '颜色不对 → 整组重来，从中断处重新接线'); return;
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
    setProg(0, N, '共 ' + N + ' 个零件：先点下方零件，再点形状相符的槽位（有一个槽是诱饵）');
    slots.forEach(function (s) {
      const d = el('div', 'slot'); d.dataset.s = s;
      d.onclick = function () {
        if (api.done || !sel || d.classList.contains('filled')) return;
        if (d.dataset.s !== sel.dataset.s) {
          Array.prototype.forEach.call(grid.children, function (x) { x.classList.remove('filled'); x.textContent = ''; });
          Array.prototype.forEach.call(tray.children, function (x) { x.classList.remove('used', 'sel', 'hint'); });
          placed = 0; sel = null; setProg(0, N, '形状不符 → 整组重来，每个零件只认一个槽'); return;
        }
        d.classList.add('filled'); d.textContent = sel.dataset.s;
        sel.classList.add('used'); sel.classList.remove('sel', 'hint'); sel = null; placed++;
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
        tip('已选零件「' + s + '」：点形状相符的槽位');
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
      if (!held && charge > 0) charge = Math.max(0, charge - dt * 2.4);
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
  function buildSync(bd) {
    const targets = cfg('targets', [[18, 32], [48, 62], [34, 50]]);
    const N = Math.max(1, Math.min(cfg('n', 3), targets.length));
    const holdSec = cfg('hold', 0.6);
    const init = cfg('init', [12, 74, 26]);
    const rows = el('div', 'rows'), inputs = [];
    for (let i = 0; i < N; i++) {
      const r = el('div', 'rrow'), lab = el('span', 'rlab', '通道 ' + (i + 1));
      const tr = el('div', 'rtrack'), band = el('i', 'band'), ln = el('i', 'ln');
      band.style.left = targets[i][0] + '%';
      band.style.width = (targets[i][1] - targets[i][0]) + '%';
      tr.appendChild(ln); tr.appendChild(band);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '100';
      inp.value = String(init[i] == null ? 20 : init[i]);
      tr.appendChild(inp);
      inputs.push(inp);
      r.appendChild(lab); r.appendChild(tr); rows.appendChild(r);
    }
    bd.appendChild(rows);
    setProg(0, N, '共 ' + N + ' 条通道：调进亮带并同时保持 ' + holdSec + ' 秒');
    let hold = 0, last = 0;
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      let inside = 0;
      inputs.forEach(function (inp, i) {
        const v = +inp.value;
        if (v >= targets[i][0] && v <= targets[i][1]) inside++;
      });
      const all = inside === N;
      hold = all ? hold + dt : 0;
      if (all) tip('保持 ' + hold.toFixed(1) + ' / ' + holdSec + ' s', 'good');
      setProg(inside, N, '');
      if (hold >= holdSec) { settle(true, '通道同步 · 任务成功'); return; }
      api.anim = requestAnimationFrame(loop);
    }
    api.anim = requestAnimationFrame(loop);
  }

  /* ---------- 注液 / 注气 ---------- */
  function buildPour(bd) {
    const bin = el('div', 'pourbin');
    const vessel = el('div', 'vessel'), fill = el('i', 'fill'), zone = el('i', 'zone');
    const lo = cfg('lo', 52), hi = cfg('hi', 68), rate = cfg('rate', 38);
    zone.style.bottom = lo + '%';
    zone.style.height = (hi - lo) + '%';
    vessel.appendChild(fill); vessel.appendChild(zone);
    const ticks = el('div', 'ticks');
    ['100', '75', '50', '25', '0'].forEach(function (t) { ticks.appendChild(el('span', null, t)); });
    const hold = el('button', null, '按住注液 · 松开确认');
    bin.appendChild(vessel); bin.appendChild(ticks);
    bd.appendChild(bin); bd.appendChild(hold);
    setProg(0, 1, '按住注液，落在 ' + lo + '~' + hi + ' 之间再松手');
    let v = 0, held = false, last = 0;
    hold.addEventListener('pointerdown', function (e) { e.preventDefault(); held = true; });
    hold.addEventListener('pointerup', function () {
      if (!held || !api || api.done) return;
      held = false;
      if (v > hi) settle(false, '注过头了 → 整组重来');
      else if (v < lo) settle(false, '注得不够 → 整组重来');
      else settle(true, '配比到位 · 任务成功');
    });
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      if (held && v < 100) v = Math.min(100, v + dt * rate);
      fill.style.height = v.toFixed(0) + '%';
      api.anim = requestAnimationFrame(loop);
    }
    api.anim = requestAnimationFrame(loop);
  }

  /* ---------- 换芯 ---------- */
  function buildSwap(bd) {
    const box = el('div', 'swap'), sock = el('div', 'socket');
    const oldc = el('div', 'core old', '旧芯');
    sock.appendChild(oldc);
    const tray = el('div', 'tray');
    const colors = ['c1', 'c2', 'c3'];
    const target = colors[rnd(3)];
    let removed = false;
    oldc.onclick = function () {
      if (!api || api.done || removed) return;
      removed = true; oldc.remove();
      tip('旧芯已取出，选一枚同型号新芯');
    };
    shuffled(colors).forEach(function (c) {
      const b = el('button', 'core ' + c, c === 'c1' ? 'A 型' : c === 'c2' ? 'B 型' : 'C 型');
      b.style.width = '56px'; b.style.height = '32px'; b.style.border = '1px solid #313B4B'; b.style.cursor = 'pointer';
      b.onclick = function () {
        if (!api || api.done || !removed) return;
        if (c !== target) { settle(false, '型号不对 → 整组重来'); return; }
        sock.appendChild(el('div', 'core ' + c, '新芯'));
        settle(true, '换芯完成 · 任务成功');
      };
      tray.appendChild(b);
    });
    box.appendChild(sock); box.appendChild(tray);
    bd.appendChild(box);
    setProg(0, 2, '第一步：点「旧芯」把它取出来');
  }

  /* ---------- 三点对准 ---------- */
  function buildAlign(bd) {
    const board = el('div', 'board'), probes = [], tgts = [];
    const N = Math.max(1, Math.min(4, cfg('n', 3)));
    const TOL = cfg('tol', 0.026);
    for (let i = 0; i < N; i++) {
      const tx = 16 + rnd(62), ty = 14 + rnd(56);
      const t = el('div', 'tgt');
      t.style.left = tx + '%'; t.style.top = ty + '%';
      board.appendChild(t); tgts.push({ x: tx, y: ty });
    }
    for (let j = 0; j < N; j++) {
      const p = el('div', 'probe');
      p.style.left = (8 + j * 32) + '%';
      p.style.top = (72 - j * 16) + '%';
      board.appendChild(p); probes.push(p);
    }
    bd.appendChild(board);
    setProg(0, N, '把 ' + N + ' 个金色探针拖进虚线圆圈，全部进才算过');
    let drag = null;
    function pos(e) {
      const bb = board.getBoundingClientRect();
      return { x: (e.clientX - bb.left) / bb.width * 100, y: (e.clientY - bb.top) / bb.height * 100 };
    }
    board.addEventListener('pointerdown', function (e) {
      const t = e.target;
      if (!t.classList.contains('probe')) return;
      drag = t; t.setPointerCapture(e.pointerId); e.preventDefault();
    });
    board.addEventListener('pointermove', function (e) {
      if (!drag || !api || api.done) return;
      const p = pos(e);
      drag.style.left = Math.max(0, Math.min(100, p.x)) + '%';
      drag.style.top = Math.max(0, Math.min(100, p.y)) + '%';
      check();
    });
    board.addEventListener('pointerup', function () { drag = null; });
    board.addEventListener('pointercancel', function () { drag = null; });
    function check() {
      const near = probes.map(function (p, k) {
        return Math.hypot(parseFloat(p.style.left) - tgts[k].x, parseFloat(p.style.top) - tgts[k].y) < TOL * 100;
      });
      const got = near.filter(Boolean).length;
      setProg(got, N, '对准 ' + got + ' / ' + N + ' —— 拖到虚线圆圈里');
      if (near.every(Boolean)) settle(true, '评定通过 · 任务成功');
    }
  }

  /* ---------- 准星保持 ---------- */
  function buildAim(bd) {
    const rng = el('div', 'range'), zone = el('div', 'zone'), mk = el('div', 'mk');
    const need = cfg('hits', 3), speed = cfg('speed', 46), zw = cfg('zone', 8);
    const zlo = 50 - zw / 2, zhi = 50 + zw / 2;
    zone.style.left = zlo + '%';
    zone.style.width = zw + '%';
    rng.appendChild(zone); rng.appendChild(mk);
    bd.appendChild(rng);
    setProg(0, need, '准星进亮带时点击，连中 ' + need + ' 次');
    let hits = 0, dir = 1, x = 0, last = 0;
    function loop(ts) {
      if (!api || api.done) return;
      if (!last) last = ts;
      const dt = Math.min(.05, (ts - last) / 1000); last = ts;
      x += dir * dt * speed;
      if (x > 96) { x = 96; dir = -1; }
      if (x < 0) { x = 0; dir = 1; }
      mk.style.left = x + '%';
      api.anim = requestAnimationFrame(loop);
    }
    rng.onclick = function () {
      if (!api || api.done) return;
      if (x >= zlo && x <= zhi) {
        hits++; setProg(hits, need, '命中 ' + hits + ' / ' + need);
        if (hits >= need) settle(true, '靶道校准完成 · 任务成功');
      } else { hits = 0; setProg(0, need, '脱靶 → 计数清零，等准星进带再点'); }
    };
    api.anim = requestAnimationFrame(loop);
  }

  /* ---------- 图标配对 ---------- */
  function buildMatch(bd) {
    /* 配对数按任务配置 */
    const icons = cfg('icons', ['◈', '◇', '▣', '▤', '◐', '◑']);
    const N = Math.max(2, Math.min(cfg('n', tierN(4, 5, 5)), icons.length));
    const pool = icons.slice(0, N);
    const deck = shuffled(pool.concat(pool));
    const grid = el('div', 'cards');
    let open = [], lock = false, pairs = 0, miss = 0;
    setProg(0, N, '共 ' + N + ' 对：翻两张，图案相同即配对（错 3 次整组重来）');
    deck.forEach(function (ic) {
      const c = el('div', 'cd', '·');
      c.dataset.ic = ic;
      c.onclick = function () {
        if (!api || api.done || lock || c.classList.contains('done') || c.classList.contains('up')) return;
        c.classList.add('up'); c.textContent = ic; open.push(c);
        if (open.length < 2) return;
        const a = open[0], b = open[1];
        if (a.dataset.ic === b.dataset.ic) {
          a.classList.add('done'); b.classList.add('done'); open = []; pairs++;
          setProg(pairs, N, pairs === N ? '全部匹配' : '已配对 ' + pairs + ' / ' + N + '，继续');
          if (pairs === N) settle(true, '全部接通 · 任务成功');
        } else {
          lock = true; miss++;
          setTimeout(function () {
            if (!api || api.done) return;
            a.classList.remove('up'); b.classList.remove('up');
            a.textContent = '·'; b.textContent = '·';
            open = []; lock = false;
            if (miss >= 3) settle(false, '错配 3 次 → 整组重来');
            else tip('配错了（' + miss + ' / 3）—— 记一下位置重来', true);
          }, 420);
        }
      };
      grid.appendChild(c);
    });
    bd.appendChild(grid);
  }

  /* ---------- 层高对齐 ---------- */
  function buildLevel(bd) {
    const shelf = el('div', 'shelf'), line = el('div', 'tline');
    const target = 42;
    const tol = cfg('tol', 3);
    line.style.top = target + '%';
    shelf.appendChild(line);
    const n = Math.max(2, Math.min(5, cfg('n', tierN(4, 5, 5))));
    const base = n === 5 ? [14, 30, 48, 66, 84] : (n === 4 ? [20, 34, 58, 72] : [22, 46, 70]);
    const bars = [];
    base.forEach(function (v, i) {
      const b = el('div', 'lv'), g = el('i', null, 'L' + (i + 1));
      b.style.top = v + '%'; b.appendChild(g); shelf.appendChild(b); bars.push(b);
    });
    bd.appendChild(shelf);
    setProg(0, bars.length, '把 ' + bars.length + ' 层货架拖到同一条虚线（±' + tol + '%）');
    let drag = null;
    function pct(e) {
      const bb = shelf.getBoundingClientRect();
      return (e.clientY - bb.top) / bb.height * 100;
    }
    shelf.addEventListener('pointerdown', function (e) {
      const t = e.target.closest ? e.target.closest('.lv') : null;
      if (!t) return;
      drag = t; t.setPointerCapture(e.pointerId); e.preventDefault();
    });
    shelf.addEventListener('pointermove', function (e) {
      if (!drag || !api || api.done) return;
      drag.style.top = Math.max(0, Math.min(92, pct(e))) + '%';
      check();
    });
    shelf.addEventListener('pointerup', function () { drag = null; });
    shelf.addEventListener('pointercancel', function () { drag = null; });
    function check() {
      const ok = bars.map(function (b) { return Math.abs(parseFloat(b.style.top) - target) <= tol; });
      const got = ok.filter(Boolean).length;
      setProg(got, bars.length, '齐平 ' + got + ' / ' + bars.length + ' 层 —— 拖到同一条虚线');
      if (ok.every(Boolean)) settle(true, bars.length + ' 层齐平 · 任务成功');
    }
  }

  /* ---------- 顺序记忆（2026-11-06 新增） ---------- */
  function buildSequence(bd) {
    const all = cfg('symbols', ['◈', '◇', '▣', '▤', '◐', '◑']);
    const n = Math.max(2, Math.min(cfg('n', 4), all.length));
    const seq = shuffled(all.slice(0, n));
    const show = el('div', 'seq');
    const targets = [];
    seq.forEach(function (s) {
      const d = el('div', 's', s);
      show.appendChild(d); targets.push(d);
    });
    const row = el('div', 'seqrow');
    const buttons = [];
    shuffled(all.slice(0, n)).forEach(function (s) {
      const b = el('button', 'blk', s);
      b.onclick = function () {
        if (!api || api.done) return;
        if (s !== seq[idx]) {
          idx = 0;
          targets.forEach(function (x) { x.classList.remove('on'); });
          setProg(0, n, '顺序错了 → 从头再来');
          tip('顺序错了 → 从头再来', true);
          return;
        }
        targets[idx].classList.add('on');
        idx++;
        setProg(idx, n, idx === n ? '顺序正确' : '已按 ' + idx + ' / ' + n);
        if (idx >= n) settle(true, '顺序校验通过 · 任务成功');
      };
      row.appendChild(b); buttons.push(b);
    });
    bd.appendChild(el('div', 'tip', '亮起的顺序就是答案；按错从头来'));
    bd.appendChild(show);
    bd.appendChild(row);
    setProg(0, n, '按提示顺序依次按下 ' + n + ' 个符号');
  }

  /* ---------- 分拣（2026-11-06 新增） ---------- */
  function buildSort(bd) {
    const bins = cfg('bins', ['合格', '废料']);
    const items = cfg('items', ['A', 'B', 'C', 'D', 'E']);
    const assign = cfg('assign', items.map(function (_, i) { return i % bins.length; }));
    const n = Math.min(items.length, assign.length);
    let sel = -1, placed = 0, miss = 0;
    const row = el('div', 'sortrow');
    const itemBtns = [];
    items.slice(0, n).forEach(function (s, i) {
      const b = el('button', 'sortitem', s);
      b.onclick = function () {
        if (!api || api.done || b.classList.contains('used')) return;
        itemBtns.forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel'); sel = i;
        tip('已选中「' + s + '」：点它应该去的筐');
      };
      row.appendChild(b); itemBtns.push(b);
    });
    const binsRow = el('div', 'bins');
    const binBtns = bins.map(function (name, bi) {
      const b = el('button', 'bin', name);
      b.onclick = function () {
        if (!api || api.done || sel < 0) return;
        if (assign[sel] !== bi) {
          miss++;
          tip('分错了（' + miss + ' / 3）—— 再想想', true);
          if (miss >= 3) settle(false, '分错 3 次 → 整组重来');
          return;
        }
        itemBtns[sel].classList.add('used');
        itemBtns[sel].classList.remove('sel');
        sel = -1; placed++;
        setProg(placed, n, placed === n ? '全部分拣完成' : '已分拣 ' + placed + ' / ' + n);
        if (placed === n) settle(true, '分拣完成 · 任务成功');
      };
      binsRow.appendChild(b);
      return b;
    });
    bd.appendChild(el('div', 'tip', '先点物品，再点筐；错 3 次整组重来'));
    bd.appendChild(row);
    bd.appendChild(binsRow);
    setProg(0, n, '把 ' + n + ' 件物品分进「' + bins.join(' / ') + '」');
  }

  /* ---------- 阀门（2026-11-06 新增） ---------- */
  function buildValve(bd) {
    const n = Math.max(2, Math.min(4, cfg('n', 3)));
    const angles = cfg('angles', [45, 135, 225, 315]).slice(0, n);
    const cur = new Array(n).fill(0);
    const row = el('div', 'valves');
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const v = el('div', 'valve');
      const tick = el('i', 'tick');
      tick.style.setProperty('--tgt', angles[i] + 'deg');
      const needle = el('i', 'needle');
      v.appendChild(tick); v.appendChild(needle);
      v.onclick = function () {
        if (!api || api.done) return;
        cur[i] = (cur[i] + 15) % 360;
        needle.style.setProperty('--ang', cur[i] + 'deg');
        update();
      };
      row.appendChild(v); nodes.push(v);
    }
    function diff(a, b) {
      return Math.abs((a - b + 540) % 360 - 180);
    }
    function update() {
      let ok = 0;
      nodes.forEach(function (v, i) {
        const hit = diff(cur[i], angles[i]) <= 12;
        v.classList.toggle('ok', hit);
        if (hit) ok++;
      });
      setProg(ok, n, '阀门到位 ' + ok + ' / ' + n);
      if (ok === n) settle(true, '管路压力稳定 · 任务成功');
    }
    bd.appendChild(el('div', 'tip', '点阀门每次转 15°；把指针转到顶部刻度线'));
    bd.appendChild(row);
    setProg(0, n, '校准 ' + n + ' 个阀门');
  }

  /* ---------- 密码 / 编号（2026-11-06 新增） ---------- */
  function buildCode(bd) {
    const code = String(cfg('code', '4271'));
    let entered = '';
    bd.appendChild(el('div', 'tip', cfg('clue', '按提示编号输入')));
    const box = el('div', 'codebox');
    const cells = [];
    for (let i = 0; i < code.length; i++) {
      const c = el('div', 'coded', '·');
      box.appendChild(c); cells.push(c);
    }
    const pad = el('div', 'keypad');
    function reset(msg) {
      entered = '';
      cells.forEach(function (c) { c.textContent = '·'; });
      setProg(0, code.length, msg || '从头开始');
    }
    for (let d = 0; d <= 9; d++) {
      const b = el('button', 'blk', String(d));
      b.onclick = function () {
        if (!api || api.done) return;
        entered += String(d);
        if (!code.startsWith(entered)) { reset('编号不对 → 从头开始'); tip('编号不对 → 从头开始', true); return; }
        cells[entered.length - 1].textContent = String(d);
        setProg(entered.length, code.length, '已输入 ' + entered.length + ' / ' + code.length);
        if (entered.length === code.length) settle(true, '编号正确 · 任务成功');
      };
      pad.appendChild(b);
    }
    const clr = el('button', 'blk', '清空');
    clr.onclick = function () { if (api && !api.done) reset('已清空'); };
    pad.appendChild(clr);
    bd.appendChild(box);
    bd.appendChild(pad);
    setProg(0, code.length, '输入 ' + code.length + ' 位编号');
  }

  const BUILD = {
    wire: buildWire, place: buildPlace, lever: buildLever, sync: buildSync, pour: buildPour,
    swap: buildSwap, align: buildAlign, aim: buildAim, match: buildMatch, level: buildLevel,
    sequence: buildSequence, sort: buildSort, valve: buildValve, code: buildCode
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
    node.querySelector('#mg-c').textContent = '保底 ' + api.limit + 's';
    node.querySelector('#mg-p').style.width = '0%';
    const bd = node.querySelector('#mg-b');
    bd.innerHTML = '';
    node.classList.add('on');
    bd.appendChild(el('div', 'tip', HINT[kind]));
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
      kinds: Object.freeze(Object.keys(BUILD))
    })
  });
})(typeof window !== 'undefined' ? window : globalThis);
