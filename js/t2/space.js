/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 空间与资源
 * definedBy : 地图设计构造 / 角色数值 / 渲染几何与配色（域下小类）
 * truth     : js/t2/space.js#SKT2Space
 * verify    : 全量门禁 / tools/map-check.cjs
 * flag      : F  (F=现行事实 / N=规范裁定)
 * note      : 方案 A 第一批＝8 常量；第四批＝几何/数值纯函数与 2 张表；数值与拆分前一致
 * ============================================================== */
/* 空间与资源域 · 运行常量、几何与数值纯函数
   -------------------------------------------------------------
   真源：本文件。第一批（2026-11-04）外提 8 个运行常量；
   第四批（2026-11-04）外提 12 个纯函数与 ROW / PIPE_TINT 两张表。
   函数体与拆分前 js/game.js 逐行一致，仅两处取状态方式改变：
     · 闭包变量 G → 函数开头 const G = global.SKV3._t.G()（用户裁定沿用 _t.G()）
     · 闭包常量 ROW / PIPE_TINT → 本模块内的同名 const
   game.js 保留同名薄委托；ROW 因另有两处使用而保留局部别名引用，
   PIPE_TINT 只被 pipeTint 使用，故 game.js 不再定义（真源唯一）。
   约束：file:// 经典 <script> 直接加载；不引依赖、不读 DOM、不碰定时器与随机流。 */
(function (global) {
  'use strict';

  /* ---- 姿态行 / 管道配色（原 js/game.js 闭包内 const，逐行原样） ---- */
  const ROW={down:0,up:1,left:3,right:4};
  const PIPE_TINT={
    engine:[245,117,51], cam:[61,199,242], armory:[250,184,51], warehouse:[250,199,61],
    transit:[250,204,115], med:[77,209,240], bridge:[242,184,71], ecosys:[87,219,112],
    power:[245,179,41], fun:[224,82,204],
  };

  /* ---- 角色 / 任务数值 ---- */
  /* 幽灵维修额度（2026-11-05 用户裁定 2 → 1 分）。
     注意：这只限制**幽灵能贡献多少分**；任务点本身的分值 ghostTaskPts()
     （hard=2 / normal=1）对所有人生效，不随之改变。
     抽成常量是为了让 game.js 的判定、HUD 文案、门禁探针共用一个真源。 */
  const GHOST_TASK_CAP = 1;
  function ghostTaskPts(p){return p&&p.kind==='hard'?2:1;}
  function ghostTaskCap(){return GHOST_TASK_CAP;}
  function ghostTaskAllowed(a,p){
    return !a||!a.ghost||((a.ghostPts||0)+ghostTaskPts(p)<=GHOST_TASK_CAP);
  }
  function botDead(kind){
    const G=global.SKV3._t.G();
    return kind==='secbot'?!!G.secbotDead:!!G.medbotDead;
  }
  function botHp(kind){
    const G=global.SKV3._t.G();
    if(!G.botHp)G.botHp={secbot:2,medbot:1};
    if(G.botHp[kind]==null)G.botHp[kind]=kind==='secbot'?2:1;
    return G.botHp[kind];
  }

  /* ---- 地图几何（纯入参计算） ---- */
  /* 每条走廊两盏顶灯，配电室拉闸后整条走廊全熄 */
  function corridorLampPos(c){
    let total=0; const segs=[];
    for(let i=0;i<c.pts.length-1;i++){
      const a=c.pts[i],b=c.pts[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      segs.push({a,b,L,s:total,ang:Math.atan2(b[1]-a[1],b[0]-a[0])}); total+=L;
    }
    const at=(f)=>{
      const d=total*f;
      for(const s of segs) if(d<=s.s+s.L||s===segs[segs.length-1]){
        const k=s.L?Math.min(1,Math.max(0,(d-s.s)/s.L)):0;
        return [s.a[0]+(s.b[0]-s.a[0])*k,s.a[1]+(s.b[1]-s.a[1])*k,s.ang];
      }
      return [c.pts[0][0],c.pts[0][1],0];
    };
    return [at(0.28),at(0.72)];
  }
  function corrJoinsRoom(r,c){return !!(r&&c&&(c.a===r.id||c.b===r.id));}

  /* ---- 渲染方向与配色（纯计算，不碰 canvas） ---- */
  function ready(im){return im&&im.complete&&im.naturalWidth>0;}
  function rowForAng(ang){
    const c=Math.cos(ang),s=Math.sin(ang);
    if(Math.abs(c)>=Math.abs(s)) return c>0?ROW.right:ROW.left;
    return s>0?ROW.down:ROW.up;
  }
  function dirAng(a){
    if(!a)return 0;
    if(a.dir==='left')return Math.PI;
    if(a.dir==='up')return -Math.PI/2;
    if(a.dir==='down')return Math.PI/2;
    return 0;
  }
  function workStyle(a){
    if(a._doing==='med')return {c:'#3FBF8C',icon:'cross',glow:'rgba(63,191,140,.12)'};
    if(a._doing==='ammo')return {c:'#E0A94B',icon:'bullet',glow:'rgba(224,169,75,.12)'};
    if(a._doing==='search')return {c:'#7FD3F0',icon:'lens',glow:'rgba(127,211,240,.10)'};
    if(a._doing==='revive')return {c:'#3FBF8C',icon:'cross',glow:'rgba(63,191,140,.12)'};
    if(a._doing==='breaker')return {c:'#7FD3F0',icon:'bolt',glow:'rgba(127,211,240,.12)'};
    return {c:'#F0C674',icon:'wrench',glow:'rgba(240,198,116,.11)'};
  }
  function pipeTint(rid){
    const c=PIPE_TINT[rid]||[168,150,255];
    return {a:(v)=>'rgba('+c[0]+','+c[1]+','+c[2]+','+v+')',
            dim:(v)=>'rgba('+Math.round(c[0]*0.82)+','+Math.round(c[1]*0.82)+','+Math.round(c[2]*0.88)+','+v+')'};
  }
  function k1(p){return p<0.35?p/0.35*0.6:(0.6+(p-0.35)/0.65*0.4);}

  global.SKT2Space = Object.freeze({
    /* 第一批：运行常量（拆分前与 game.js 一致）
       2026-11-07 用户裁定：全体移动速度 4.2 → 4.0，拖尸 2.7 → 2.5。
       game.js 的 moveSpeed() 与 tools/test-v3.cjs 的断言都读这两个真源。 */
    MOVE_SPEED: 4.0,
    DRAG_SPEED: 2.5,
    GHOST_TASK_CAP: GHOST_TASK_CAP,
    SPECT_SPEED: 9,
    DOOR_OPEN_R: 3.0,
    DOOR_CLOSE_R: 3.6,
    DOOR_SPEED: 4.0,
    DOOR_W: 1.8,
    DOOR_PASS: 0.6,
    /* 第四批：真源表 */
    ROW: ROW, PIPE_TINT: PIPE_TINT,
    /* 第四批：几何 / 数值纯函数 */
    ghostTaskPts: ghostTaskPts, ghostTaskAllowed: ghostTaskAllowed,
    ghostTaskCap: ghostTaskCap,
    botDead: botDead, botHp: botHp,
    corridorLampPos: corridorLampPos, corrJoinsRoom: corrJoinsRoom,
    ready: ready, rowForAng: rowForAng, dirAng: dirAng, workStyle: workStyle,
    pipeTint: pipeTint, k1: k1
  });
})(typeof window !== 'undefined' ? window : globalThis);
