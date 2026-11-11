/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 交互 UI
 * truth     : js/ui/templates.js#v3-root
 * verify    : 门禁 DOM 断言
 * flag      : F  (F=现行事实 / N=规范裁定)
 * 说明      : 本注释只作架构标注，不改变任何运行逻辑；多父只引用不复制。
 * ============================================================== */
/* =============================================================
 * SKUITemplates · 游戏界面样式与结构模板（返航录V3 · 2026-10-29）
 * -------------------------------------------------------------
 * 职责：   集中存放 `#v3-root` 的 CSS 与 HTML 字符串，供 js/game.js 注入页面。
 * 不变量： · 纯字符串常量，不读 DOM、不执行逻辑；
 *          · 与 js/game.js 的 DOM id 一一对应（改 id 必须同批改这里与 game.js）。
 * 依赖：   无。
 * 对外：   window.SKUITemplates = { CSS, HTML }
 * ============================================================= */
(function (global) {
  'use strict';

  const CSS = String.raw`html,body{margin:0;height:100%;background:#080A0F;overflow:hidden;
    font-family:system-ui,"Microsoft YaHei",sans-serif;color:#DDE3EC}
  #cv{display:block;width:100vw;height:100vh}
  #hud{position:fixed;left:14px;top:12px;font-size:12.5px;line-height:1.75;
    background:rgba(14,18,25,.88);border:1px solid #29303D;border-radius:10px;
    padding:9px 12px;min-width:196px}
  #hud b{color:#F0C674;font-weight:500}
  #bar{height:6px;background:#222833;border-radius:3px;margin:5px 0 7px;overflow:hidden}
  #bar i{display:block;height:100%;background:linear-gradient(90deg,#3FBF8C,#F0C674);width:0}
  #tip{position:fixed;left:14px;bottom:12px;font-size:12px;color:#FFE0A3;line-height:1.7;
    background:linear-gradient(90deg,rgba(62,38,6,.95),rgba(28,22,12,.88));
    border:1px solid #B9892F;border-left:4px solid #FFB020;border-radius:8px;
    padding:7px 12px 7px 10px;box-shadow:0 0 22px rgba(255,176,32,.16);
    max-width:calc(100vw - 420px);text-shadow:0 1px 2px rgba(0,0,0,.7)}
  #tip::before{content:"操作";display:inline-block;margin-right:8px;padding:0 6px;
    background:#FFB020;color:#1A1306;border-radius:4px;font-weight:700;font-size:11px;
    letter-spacing:1px;vertical-align:1px}
  #tasks{margin-top:8px;border-top:1px solid #2B3442;padding-top:7px;font-size:11.5px}
  #qual-hint{color:#F0C674;font-weight:600}
  #tasks .th{color:#8A94A3;letter-spacing:1.5px;font-size:10.5px;margin-bottom:3px}
  #tasks .tr{display:flex;gap:6px;align-items:baseline;padding:2px 0;color:#B7C2D0;line-height:1.45}
  #tasks .tr .no{color:#5E6B7C;font-variant-numeric:tabular-nums;min-width:15px}
  #tasks .tr .tag{flex:0 0 auto;font-size:9.5px;padding:0 4px;border-radius:3px;border:1px solid #4A5568;color:#8FA6C0}
  #tasks .tr.hard .tag{color:#FF9A90;border-color:#7A3530;background:rgba(90,28,26,.35)}
  #tasks .tr.normal .tag{color:#8CC6F0;border-color:#2E587A;background:rgba(22,50,76,.35)}
  #tasks .tr .loc{color:#F0C674}
  #tasks .tr .nm{color:#DDE3EC;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tasks .tr.now{background:rgba(240,198,116,.08);border-radius:4px;padding-left:2px}
  #tasks .tr.done{opacity:.42}
  #tasks .tr.done .nm{text-decoration:line-through}
  /* 设计者纯净模式：26 个任务点全列出来，必须可滚动，否则把左半屏盖满 */
  #tasks.design{max-height:42vh;overflow-y:auto;scrollbar-width:thin}
  #tasks.design .th{color:#63E0A8}
  .ov{position:fixed;inset:0;background:rgba(6,8,12,.86);display:flex;
    align-items:center;justify-content:center;backdrop-filter:blur(2px)}
  .card{background:#12161E;border:1px solid #2A3240;border-radius:14px;padding:22px 26px;
    min-width:420px;max-width:560px}
  .card h2{margin:0 0 4px;font-size:16px;font-weight:500;color:#fff}
  .card .sub{color:#7C8798;font-size:12px;margin-bottom:14px}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-top:1px solid #1F2733;font-size:13px}
  .row span:first-child{color:#8A94A3}
  .row b{color:#F0C674;font-weight:500}
  .btns{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap}
  /* 结算页的两块表（2026-11-03）：身份表 + 投票矩阵，复用复盘页的配色口径 */
  #end .card{max-height:86vh;overflow:auto;padding-bottom:0}
  /* T2（2026-11-05）：身份表 / 投票矩阵可以滚，但主操作按钮必须始终在第一屏。
     .card 本身就是滚动容器，sticky 直接生效；底色用卡片同色，滚过表格时不透字。
     卡片底部内边距归零，由按钮条自带下边距，避免表格行从按钮条下方漏出来。 */
  #end .card .btns{position:sticky;bottom:0;z-index:2;background:#12161E;
    margin-top:12px;padding:10px 0 16px;border-top:1px solid #1F2733}
  .eblk{margin-top:12px;text-align:left}
  .eh{font:600 12px/1.6 system-ui;color:#8ea0b5;letter-spacing:.5px}
  .etbl{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;font:500 11px/1.6 system-ui}
  .etbl .row{width:100%;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
  .chip{padding:1px 6px;border-radius:8px;background:#141a22;border:1px solid #2a3442;color:#c8d4e2}
  .chip.ali{border-color:#7a3b39;color:#ff9a90}
  .chip.hum{border-color:#2f4a5c;color:#9fd8ef}
  .chip.dead{opacity:.6}
  .chip.ex{border-color:#8a6a2a;color:#f0c674}
  .mtg{width:100%;margin-top:6px;padding-top:4px;border-top:1px dashed #24303e;color:#8ea0b5}
  button{background:#1D2530;color:#DDE3EC;border:1px solid #313B4B;border-radius:8px;
    padding:8px 14px;font-size:13px;cursor:pointer;font-family:inherit}
  button:hover{background:#26313F;border-color:#43536B}
  button.p{background:#2A4A6B;border-color:#3C6690}
  .who{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .who button{padding:6px 11px;font-size:12.5px}
  .vote-skip{width:100%;margin-top:8px;padding:8px 12px;font-size:12.5px}
  .hide{display:none}
  .mtg{display:grid;grid-template-columns:1fr 1.05fr .95fr;gap:14px;width:min(1180px,94vw);
    height:min(620px,86vh)}
  .mtg .col{background:#12161E;border:1px solid #2A3240;border-radius:14px;padding:16px 18px;
    display:flex;flex-direction:column;min-height:0}
  .mtg .ch{font-size:12px;color:#8A94A3;letter-spacing:2px;margin-bottom:10px}
  .mtg .mid h2{margin:0 0 4px}
  /* 2026-11-08：发言区包一层 wrapper，用来放"↓ N 条新发言"提示。
     发言区不再强制滚底，玩家往上翻时新消息只提示条数。 */
  .mtg .col.say .say-wrap{flex:1;position:relative;min-height:0;min-width:0;display:flex}
  #m-say{flex:1;overflow-y:auto;font-size:13px;line-height:1.9;padding-right:4px;min-width:0}
  #m-new{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);display:none;
    padding:4px 12px;border-radius:999px;border:1px solid #F0C674;background:rgba(18,22,30,.96);
    color:#F0C674;font-size:12px;cursor:pointer;z-index:5;white-space:nowrap}
  #m-new.on{display:block}
  #m-say .ln{margin-bottom:6px;color:#C9D1DB;word-break:break-word}
  #m-say .ln b{color:#8FA6C0;font-weight:500;margin-right:8px}
  #m-say .ln.me b{color:#F0C674}
  /* T8（2026-11-05）：点名玩家的发言，左侧加金条 + 极淡底色，便于扫读 */
  #m-say .ln.hit{box-shadow:inset 2px 0 0 #F0C674;background:rgba(240,198,116,.07);
    padding-left:8px;border-radius:0 4px 4px 0}
  #hud .surv b{font-variant-numeric:tabular-nums}
  #hud #hum{color:#8FD3F0}
  #hud #ali{color:#FF8A80}
  #pwr.off{color:#FF6B61 !important}
  #pwr.full{color:#7FE3B4 !important}
  #cam{z-index:8}
  #cam .cam-panel{background:#070C12;border:1px solid #24405A;border-radius:14px;
    padding:14px 16px 12px;box-shadow:0 24px 80px rgba(0,0,0,.65);max-width:calc(100vw - 28px)}
  .cam-head{display:flex;align-items:baseline;justify-content:space-between;gap:18px;margin-bottom:9px}
  .cam-title{font-size:14px;letter-spacing:2px;color:#BFE9F7}
  .cam-sub{font-size:10.5px;color:#5E7286;letter-spacing:1px}
  .cam-right{display:flex;gap:14px;align-items:baseline;font-size:11px;color:#8A94A3}
  #cam-state{color:#5FE0A8}
  #cam-state.cut{color:#FF6B61}
  #camcv{display:block;width:min(1080px,calc(92vw - 32px));height:auto;border-radius:8px;
    background:#04070B;border:1px solid #16222E}
  .cam-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;
    margin-top:9px;font-size:11px;color:#6D7C8D}
  .cam-foot b{color:#BFE9F7;font-weight:500}
  .cam-foot button{padding:5px 10px;font-size:11.5px}
  #wheel{z-index:9;background:rgba(6,8,12,.62)}
  .wheel-card{position:relative;width:min(520px,92vw);height:min(520px,92vw);border-radius:50%;
    background:radial-gradient(circle at 50% 50%,rgba(26,34,45,.98),rgba(9,13,19,.97) 70%);
    border:1px solid #33465C;box-shadow:0 24px 90px rgba(0,0,0,.7),inset 0 0 40px rgba(60,90,120,.12)}
  .wheel-title{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#F0C674;
    font-size:14px;letter-spacing:3px;text-align:center;line-height:1.6;pointer-events:none}
  .wheel-sub{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);color:#6D7C8D;
    font-size:11px;letter-spacing:1px;white-space:nowrap}
  #wheel-opts{position:absolute;inset:0}
  #wheel-opts button{position:absolute;transform:translate(-50%,-50%);width:150px;padding:8px 9px;
    display:flex;align-items:center;gap:7px;justify-content:flex-start;white-space:nowrap}
  #wheel-opts .pn{display:inline-flex;width:17px;height:17px;border-radius:50%;align-items:center;
    justify-content:center;background:rgba(240,198,116,.18);color:#F0C674;font-size:10px;flex:0 0 auto}
  #wheel-opts .pl{font-size:12px;color:#DDE3EC;overflow:hidden;text-overflow:ellipsis}
  #pipe{z-index:8}
  .pipe-card{width:min(520px,88vw);min-width:0}
  .pipe-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
  .pipe-list button{display:flex;align-items:center;gap:9px;text-align:left;padding:10px 11px}
  .pipe-list .pn{color:#A896FF;font-variant-numeric:tabular-nums;font-size:11px}
  .pipe-list .pr{color:#DDE3EC;font-size:13px}
  .pipe-list .pd{margin-left:auto;color:#6D7C8D;font-size:10.5px}
  .pipe-card .sub{margin-bottom:2px}
  #sabot .pipe-list .pn{color:#FF9A90}
  #dmgline{margin-top:8px;border-top:1px solid #4A2320;padding-top:6px;
    font-size:11.5px;color:#FF9A90;line-height:1.55;max-width:236px}
  #dmgline b{color:#FF6B61;font-weight:500}
  .inp{display:flex;gap:8px;margin-top:10px}
  .inp input{flex:1;background:#0D1117;border:1px solid #313B4B;border-radius:8px;
    color:#DDE3EC;padding:8px 10px;font-size:13px;font-family:inherit;outline:none}
  .inp input:focus{border-color:#F0C674}
  .vote .who{flex:0 0 auto;max-height:52%;overflow-y:auto}
  .vote #m-tally{flex:1;overflow-y:auto;margin-top:10px}
  #m-tally{margin-top:12px}
  .tl-h{font-size:12px;color:#8A94A3;margin-bottom:4px}
  .tl{display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid #1F2733;font-size:12.5px}
  .tl b{color:#F0C674;font-weight:500}
  .tl-note{margin-top:10px;font-size:12.5px;color:#C9D1DB;line-height:1.6}
  .ex-role{font-weight:700;letter-spacing:.5px}
  .ex-role.ali{color:#FF8A80}
  .ex-role.hum{color:#8FD3F0}
  #devline{color:#7FD3F0}
  /* DEV 总览：顶部横栏（2026-10-31 从右侧竖栏改横栏）。
     横栏贴顶铺满，所以 #hud 在 DEV 开启时要整体下移（syncDevUi 里写 style.top），
     不允许横栏压住左上角的维修/存活信息。 */
  #dev{position:fixed;left:0;right:0;top:0;z-index:6;
    background:linear-gradient(180deg,rgba(8,12,18,.95),rgba(8,12,18,.80));
    border-bottom:1px solid #22303F;box-shadow:0 10px 26px rgba(0,0,0,.42);
    padding:4px 10px 5px;display:flex;flex-direction:column;gap:3px;
    font-size:11.5px;line-height:1.4;pointer-events:none}
  /* #dev 是 ID 选择器、.hide 是类选择器：只写 .hide{display:none} 会被 #dev{display:flex}
     盖掉，横栏会永远挂在顶部（2026-10-31 踩过）。这里显式补一条同 ID 优先级的隐藏规则。 */
  #dev.hide{display:none}
  /* 标题行必须 flex-shrink:0：两排卡会把容器压扁，第一次渲染时标题被卡片吃掉半行 */
  #dev .dt{color:#7FD3F0;letter-spacing:1.4px;font-size:10px;display:flex;gap:12px;
    align-items:baseline;flex:0 0 auto;min-height:15px;white-space:nowrap}
  /* 15 张卡固定排成两排（8 + 7）：不再横向滚动 —— 横滑条既点不动（父层
     pointer-events:none），又逼着玩家去拖一条 4px 的细条。两排直接全部可见。 */
  #dev-rows{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));
    gap:4px 5px;pointer-events:auto}
  #dev .dr{min-width:0;background:rgba(16,24,34,.86);border:1px solid #1E2A38;
    border-radius:7px;padding:3px 6px 4px;display:flex;flex-direction:column;gap:0}
  #dev .dr .top{display:flex;gap:5px;align-items:baseline;justify-content:space-between}
  #dev .dr b{color:#C9D1DB;font-weight:500;font-size:11px}
  #dev .dr span{color:#7C8798;font-size:9.5px}
  #dev .dr i{color:#5E6B7C;font-style:normal;font-size:9.5px;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}
  #dev .dr u{color:#8FD3F0;text-decoration:none;font-size:9.5px;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}
  #dev .dr.al b{color:#E0574F}
  #dev .dr.al u{color:#FF9E96}
  #dev .dr.dead{opacity:.5}
  #dev .dr.me{border-color:#4A3C1E}
  #dev .dr.me b{color:#F0C674}
  #dev .dt2{color:#5E6B7C;font-size:10px}
  @media (max-width:1100px){#dev-rows{grid-template-columns:repeat(5,minmax(0,1fr))}}
  @media (max-width:760px){#dev-rows{grid-template-columns:repeat(3,minmax(0,1fr))}}
  #dragtag{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);font-size:12px;
    color:#F0C674;background:rgba(10,14,20,.88);border:1px solid #4A3C1E;border-radius:8px;
    padding:4px 12px;z-index:5}
  #invfail{position:fixed;left:50%;top:10px;transform:translateX(-50%);font-size:12px;color:#FF8A80;
    background:rgba(40,8,8,.94);border:1px solid #7A2A2A;border-radius:8px;padding:6px 12px;z-index:50}
  #body .card{width:min(460px,88vw)}
  #body .row{display:flex;justify-content:space-between;gap:18px;padding:7px 0;
    border-top:1px solid #1F2733;font-size:13px;align-items:flex-start}
  #body .row span:first-child{color:#8A94A3;flex:0 0 auto}
  #body .row b{color:#F0C674;font-weight:500;text-align:right;word-break:break-word}
  #body .bd-note{margin-top:12px;font-size:12px;color:#7C8798;line-height:1.7}
  #body .bd-bad{color:#E0574F}
  @keyframes qpop{0%{transform:scale(1)}35%{transform:scale(1.9);color:#FFF3C4;text-shadow:0 0 12px #F0C674}100%{transform:scale(1)}}
  #hud b.pop{display:inline-block;animation:qpop .75s ease}
  #m-say .ln.sys{color:#7C8798;font-size:12px}
  #m-tpl{margin-top:8px;border-top:1px solid #1F2733;padding-top:7px}
  #m-tpl .tpl-row{display:flex;gap:6px;margin-bottom:6px}
  #m-tpl select{flex:1;min-width:0;background:#0D1117;border:1px solid #313B4B;border-radius:6px;
    color:#DDE3EC;padding:4px 6px;font-size:11.5px;font-family:inherit;outline:none}
  #m-tpl select#m-tpl-when{flex:0 0 96px}
  #m-tpl select:focus{border-color:#F0C674}
  #m-tpl-btns{display:flex;flex-wrap:wrap;gap:5px}
  #m-tpl-btns button{padding:4px 8px;font-size:11px;background:#18222E;border-color:#2B3B4C;color:#AFC0D2}
  #m-tpl-btns button:hover{background:#223142;border-color:#3F5870}
  #m-tpl .tpl-hint{font-size:10px;color:#5E7280;margin-top:5px;line-height:1.4}`;

  const HTML = String.raw`<canvas id="cv"></canvas>
<div id="hud">
  <div>维修 <b><span id="pg">0</span> / <span id="pgmax">45</span></b></div>
  <div id="bar"><i id="pgi"></i></div>
  <div>剩余 <b id="tm">120</b> 秒 · 第 <b id="nt">1</b> 夜 · <b id="pwr">照明正常</b></div>
  <div class="surv">存活 <b id="alive">15</b> 人 · 人类 <b id="hum">11</b> · 异形 <b id="ali">4</b></div>
  <div>你是 <b id="role">人类</b><span id="dnwrap" class="hide"> · 濒死 <b id="dn">0</b> 人</span></div>
  <div id="personal">任务 <b id="tk">0</b>/4 · 申请单 <b id="ql">0</b> · 待领 <b id="qp">0</b> · 弹 <b id="bl">0</b> · 包 <b id="md">0</b> · 报告 <b id="rp">2</b>/2 · 会议 <b id="mt">0</b>/2<span id="qual-hint" class="hide"> · 回圆桌领取</span></div>
  <div id="tasks"></div>
  <div id="dmgline" class="hide"></div>
  <div id="devline" class="hide">DEV <b>无敌 · 全知</b> · 断言 <b id="inv">0</b> 失败</div>
</div>
<div id="tip">移动=点击地面 · W 交互（多目标按 1-9 选择） · A 出刀 · S 搜尸/查看 · D 收尸 · F 施救 · R 报告 · B 开枪 · H 破坏 · V 监控 · T 视野 · C 相机 · M 音效 · ESC 暂停</div>
<div id="dragtag" class="hide">拖拽中 · 按 G 放下</div>
<div id="invfail" class="hide"></div>
<div id="dev" class="hide">
  <div class="dt"><span>DEV · 全知总览</span><span class="dt2">F2 关闭 · 攻击与驱逐对你无效 · 尸体信息显示凶手 · 每人资源见卡片</span></div>
  <div id="dev-rows"></div>
</div>

<div id="body" class="ov hide"><div class="card">
  <h2 id="b-t">尸检记录</h2><div class="sub" id="b-s"></div>
  <div id="b-rows"></div>
  <div class="bd-note" id="b-note">搜查会花掉一点时间，夜里也一样。</div>
  <div class="btns"><button class="p" id="b-close">关闭 (X / Esc)</button></div>
</div></div>

<div id="pipe" class="ov hide"><div class="card pipe-card">
  <h2>地道 · 选择出口</h2><div class="sub" id="pipe-sub">异形专用 · 选择要去的那一端</div>
  <div class="pipe-list" id="pipe-list"></div>
  <div class="btns"><button id="pipe-cancel">取消 (Esc)</button></div>
</div></div>

<div id="sabot" class="ov hide"><div class="card pipe-card">
  <h2>破坏 · 选择目标舱室</h2><div class="sub" id="sabot-sub">每夜一次 · 抵达目标舱室后损毁设备 · 30 秒内未修复则维修进度 -5</div>
  <div class="pipe-list" id="sabot-list"></div>
  <div class="btns"><button id="sabot-cancel">取消 (Esc)</button></div>
</div></div>

<div id="wheel" class="ov hide"><div class="wheel-card">
  <div class="wheel-title">选择交互</div>
  <div id="wheel-opts"></div>
  <div class="wheel-sub">数字键 / 点击选择 · ESC 取消</div>
</div></div>

<div id="cam" class="ov hide"><div class="cam-panel">
  <div class="cam-head">
    <div><span class="cam-title">全船监控</span> <span class="cam-sub">CCTV · 10 路画面</span></div>
    <div class="cam-right"><span id="cam-state">● 信号正常</span><span id="cam-meta"></span></div>
  </div>
  <canvas id="camcv" width="1080" height="620"></canvas>
  <div class="cam-foot"><span>画面只显示在场人员与倒地者，不显示身份 · 配电室拉闸会切断全部信号</span>
    <button id="cam-close">关闭 (V / Esc)</button></div>
</div></div>

<div id="meet" class="ov hide"><div class="mtg">
  <div class="col say">
    <div class="ch">发言</div>
    <div class="say-wrap">
      <div id="m-say"></div>
      <button id="m-new" title="有新发言，点击跳到最新">↓ 新消息</button>
    </div>
    <div id="m-tpl" class="hide">
      <div class="tpl-row">
        <select id="m-tpl-target" title="指定玩家"></select>
        <select id="m-tpl-room" title="指定舱室"></select>
        <select id="m-tpl-when" title="口供时段">
          <option value="">不指定时段</option>
          <option value="recent">刚才</option>
          <option value="night">整晚</option>
        </select>
      </div>
      <div id="m-tpl-btns">
        <button data-tpl="accuse">怀疑</button>
        <button data-tpl="vote">投他</button>
        <button data-tpl="support">作证</button>
        <button data-tpl="pipe">看见钻管道</button>
        <button data-tpl="red">看见红光</button>
        <button data-tpl="knife">看见出刀</button>
        <button data-tpl="sabotage">看见破坏设备</button>
        <button data-tpl="bot">看见机器人停摆</button>
        <button data-tpl="breaker">看见拉闸</button>
        <button data-tpl="where">我在…</button>
        <button data-tpl="deny">不是我</button>
      </div>
      <div class="tpl-hint">先选对象 / 舱室，再点模板；模板会直接发出，并按规则进入 AI 的证据与发言链。「看见钻管道」只会在真正有管道口的舱室附带地点；证据模板不选舱室就不声称地点。「我在… / 不是我」不选舱室时用你当前所在舱室，时段（刚才 / 整晚）只作用于这两项口供。</div>
    </div>
    <div class="inp"><input id="m-text" placeholder="自由发言，回车发送"><button id="m-send">发送</button></div>
  </div>
  <div class="col mid">
    <h2 id="m-title">紧急会议</h2>
    <div class="sub" id="m-sub"></div>
    <div id="m-rows">
      <div class="row"><span>报告地点</span><b id="m-room">—</b></div>
      <div class="row"><span>发起报告</span><b id="m-by">—</b></div>
      <div class="row"><span id="m-vic-l">伤者</span><b id="m-vic">—</b></div>
    </div>
    <div class="row"><span>阶段</span><b id="m-ph">讨论</b></div>
    <div class="btns"><button id="m-skip">跳过讨论</button></div>
  </div>
  <div class="col vote">
    <div class="ch">投票</div>
    <div class="who" id="m-who"></div>
    <button id="m-skip-vote" class="vote-skip hide" title="结束剩余投票时间；已选目标保留，未选视为弃权">跳过投票</button>
    <div id="m-tally"></div>
  </div>
</div></div>

<div id="end" class="ov hide"><div class="card">
  <h2 id="e-t">结束</h2><div class="sub" id="e-s"></div>
  <!-- 结算页不再只给一行字（2026-11-03 调研报告 P1-4）：
       身份表 + 投票矩阵都在事件流里，只差渲染；点「复盘」仍是完整时间轴。 -->
  <div class="eblk"><div class="eh">本局身份</div><div id="e-ids" class="etbl"></div></div>
  <div class="eblk"><div class="eh">谁投了谁</div><div id="e-votes" class="etbl"></div></div>
  <div class="btns"><button class="p" id="e-r">再来一局</button>
    <button id="e-rep">复盘</button><button id="e-save">保存回放</button></div>
</div></div>

<div id="pause" class="ov hide"><div class="card">
  <h2>已暂停</h2><div class="sub">单机模式 · 夜里的倒计时和 AI 都已冻结</div>
  <div class="row"><span>继续游戏</span><b>ESC / P</b></div>
  <div class="row"><span>当前进度</span><b id="p-info">—</b></div>
  <div class="row"><span>版本</span><b data-version>返航录V3</b></div>
  <div class="btns">
    <button class="p" id="p-resume">继续</button>
    <button id="p-set">设置</button>
    <button id="p-restart">重开本局</button>
    <button id="p-exit">退出到开始页</button>
  </div>
</div></div>`;

  global.SKUITemplates = Object.freeze({ CSS: CSS, HTML: HTML });
})(typeof window !== 'undefined' ? window : globalThis);
