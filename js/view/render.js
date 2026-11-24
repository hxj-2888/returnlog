/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T3
 * domain    : Canvas 2.5D 渲染表现层
 * definedBy : 地图底图 / 设施 / 角色 / 动作特效 / 小地图 / 战争迷雾
 * truth     : js/view/render.js#SKRender
 * verify    : npm test
 * flag      : F
 * note      : P1 从 js/game.js 拆出；只读对局状态 G，通过 R 注入渲染上下文
 * ============================================================== */
(function (global) {
  "use strict";

  function create(R) {
    let G = null;
    let dpr = R.getDpr ? R.getDpr() : (global.devicePixelRatio || 1);
    const {
      cv, ctx, M, IMG, VIEW, ROW, SX, SY, WX, WY, CW,
      ready, mapReady, rtImg, furnSprite, roomIdAt, roomNameById,
      camFocus, updateCamera, bodyNear, bodyPos, botPos, breakerPuller,
      collectInteractions, doorScanRule, inKnifeArc, isMyMate, lastAlienEvo,
      losNow, nearPoint, observerVisionAt, renderDevPanel, roundTableClaimSpot,
      roundTableCover, secJail, shotAimAng, supplyCoolLeft, actOffset, canSee,
      visibleAt, seatNo, tagName, corridorLampPos, pipeTint, rowForAng, dirAng, workStyle, k1,
      inCorr, roomAt, losWalls, DOOR_SCAN_TIME,
      ALIEN_DARK_R, HUMAN_DARK_R, HUMAN_LIGHT_R,
      MEDBOT_CHARGES, MEDBOT_COOLDOWN, MEDBOT_HEAL_TIME, SEC_ARC, SEC_RANGE, SEC_USES_MAX
    } = R;
    let BREAKER_LEVER=0;
    let PAT={};
    function patFor(r){
      const key=r.id+'|'+VIEW.s.toFixed(2);
      if(PAT[key])return PAT[key];
      const im=IMG['fl_'+r.id]||IMG['fl_transit'];
      if(!ready(im))return null;
      const p=ctx.createPattern(im,'repeat');
      const k=VIEW.s/32;
      if(p&&p.setTransform) p.setTransform(new DOMMatrix([k,0,0,k,0,0]));
      PAT[key]=p; return p;
    }
    
    /* ---------------- 渲染 ---------------- */
    /* 2.5D 底图：Blender 正交俯视（12° 倾角）渲出的整船，含地面/墙面/家具。
       贴图没加载完时退回老 cozy 平铺，保证首帧不空。 */
    function drawLegacyMap(){
      for(const c of M.corridors){
        ctx.strokeStyle='#1A2029';ctx.lineWidth=CW*VIEW.s;ctx.lineCap='butt';ctx.lineJoin='round';
        ctx.beginPath();c.pts.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));ctx.stroke();
        ctx.strokeStyle='#2A323E';ctx.lineWidth=1;
        ctx.beginPath();c.pts.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));ctx.stroke();
      }
      for(const r of M.rooms){
        const lit=G.lit[r.id];
        ctx.beginPath();r.poly.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));ctx.closePath();
        ctx.save();ctx.clip();
        const pat=patFor(r);
        if(pat){ctx.fillStyle=pat;}
        else{ctx.fillStyle=lit?'#1E2632':'#12171E';}
        ctx.fillRect(SX(r.rect[0])-2,SY(r.rect[1])-2,(r.rect[2]+4)*VIEW.s,(r.rect[3]+4)*VIEW.s);
        if(!lit){ctx.fillStyle='rgba(3,5,9,.62)';ctx.fillRect(SX(r.rect[0])-2,SY(r.rect[1])-2,(r.rect[2]+4)*VIEW.s,(r.rect[3]+4)*VIEW.s);}
        ctx.restore();
        ctx.strokeStyle=lit?'#39434F':'#22272F';ctx.lineWidth=1.5;ctx.stroke();
      }
      for(const c of M.cover){
        const im=IMG['fu_'+furnSprite(c.kind)];
        if(ready(im)){
          const ar=im.naturalWidth/im.naturalHeight;
          let w=c.w*VIEW.s, h=w/ar;
          const maxH=(c.h+0.9)*VIEW.s;
          if(h>maxH){h=maxH;w=h*ar;}
          ctx.drawImage(im,SX(c.x+c.w/2)-w/2,SY(c.y+c.h)-h,w,h);
        }else{
          ctx.fillStyle='#2E3742';ctx.beginPath();
          ctx.rect(SX(c.x),SY(c.y),c.w*VIEW.s,c.h*VIEW.s);ctx.fill();
        }
      }
    }
    /* 每条走廊两盏顶灯，配电室拉闸后整条走廊全熄 */
    function drawCorridorLights(T){
      if(!G)return;
      for(const c of M.corridors){
        for(const p of corridorLampPos(c)){
          const x=SX(p[0]),y=SY(p[1]);
          if(G.corrLit){
            const rad=ctx.createRadialGradient(x,y,0,x,y,2.35*VIEW.s);
            rad.addColorStop(0,'rgba(140,235,250,.20)');
            rad.addColorStop(0.45,'rgba(110,205,240,.09)');
            rad.addColorStop(1,'rgba(90,180,230,0)');
            ctx.fillStyle=rad;
            ctx.beginPath();ctx.ellipse(x,y,2.35*VIEW.s,1.25*VIEW.s,0,0,7);ctx.fill();
          }
          ctx.save();ctx.translate(x,y);ctx.rotate(p[2]);
          ctx.fillStyle=G.corrLit?'rgba(196,246,255,.92)':'rgba(54,61,70,.95)';
          ctx.fillRect(-0.34*VIEW.s,-0.085*VIEW.s,0.68*VIEW.s,0.17*VIEW.s);
          if(G.corrLit){
            ctx.fillStyle='rgba(255,255,255,'+(0.55+0.25*Math.sin(T*3+p[0])).toFixed(2)+')';
            ctx.fillRect(-0.26*VIEW.s,-0.045*VIEW.s,0.52*VIEW.s,0.09*VIEW.s);
          }
          ctx.restore();
        }
      }
    }
    /* 人形机器人：脚在 (x,y)，总高约 1.15 格（与船员视觉同高）。
       自绘而不用船员素材：设施要能随时改配色/停摆态，且机器人没有 4 向行走图。 */
    function drawRobotBody(T,x,y,s,o){
      const dead=!!o.dead, face=o.face<0?-1:1, moving=!dead&&!!o.moving;
      const swing=moving?Math.sin(T*8):0;
      /* 身体颠簸 0.03 格；停摆时头部下沉 0.1 格，腿不摆 */
      const bob=moving?Math.abs(Math.sin(T*8))*0.03*s:0;
      const sink=dead?0.1*s:0;
      const base=dead?'#5B6572':o.base;
      const dark=dead?'#39404A':'rgba(12,16,21,.97)';
      ctx.save();ctx.translate(x,y);ctx.scale(face,1);
      ctx.fillStyle='rgba(0,0,0,.32)';
      ctx.beginPath();ctx.ellipse(0,0,.34*s,.12*s,0,0,7);ctx.fill();
      ctx.lineCap='round';
      /* 两条腿：前后摆动 */
      ctx.strokeStyle=base;ctx.lineWidth=.11*s;
      ctx.beginPath();ctx.moveTo(-.09*s,-.42*s+bob*.5);
      ctx.lineTo(-.09*s+swing*.16*s,0);ctx.stroke();
      ctx.beginPath();ctx.moveTo(.09*s,-.42*s+bob*.5);
      ctx.lineTo(.09*s-swing*.16*s,0);ctx.stroke();
      /* 手臂与腿反相摆动 */
      ctx.strokeStyle=dead?'#4E5663':base;ctx.lineWidth=.09*s;
      ctx.beginPath();ctx.moveTo(-.19*s,-.74*s+bob);
      ctx.lineTo(-.24*s-swing*.10*s,-.48*s+bob);ctx.stroke();
      ctx.beginPath();ctx.moveTo(.19*s,-.74*s+bob);
      ctx.lineTo(.24*s+swing*.10*s,-.48*s+bob);ctx.stroke();
      /* 躯干 + 头 */
      ctx.fillStyle=dark;ctx.strokeStyle=base;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(-.21*s,-.84*s+bob,.42*s,.44*s,4);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(0,-1.0*s+bob+sink,.155*s,0,7);ctx.fill();ctx.stroke();
      /* 目镜 */
      ctx.fillStyle=dead?'rgba(90,100,115,.5)':o.accent;
      ctx.fillRect(-.08*s,-1.01*s+bob+sink,.16*s,.045*s);
      if(o.kind==='medbot'){
        /* 胸口十字 */
        ctx.fillStyle=dead?'#5B6572':o.accent;
        ctx.fillRect(-.05*s,-.69*s+bob,.1*s,.22*s);
        ctx.fillRect(-.11*s,-.63*s+bob,.22*s,.1*s);
      }else{
        /* 肩部警示条 + 胸前指示灯 */
        ctx.fillStyle=dead?'#5B6572':'#F0C674';
        ctx.fillRect(-.21*s,-.82*s+bob,.16*s,.055*s);
        ctx.fillStyle=dead?'#5B6572':o.accent;
        ctx.beginPath();ctx.arc(.08*s,-.64*s+bob,.035*s,0,7);ctx.fill();
      }
      ctx.restore();
    }
    /* 医疗机器人（2026-11-22 改为接地行走，不再悬浮）：贴地阴影 + 行走颠簸。 */
    function drawMedDrone(T,x,y,s,o){
      const dead=!!o.dead, exhausted=!!o.exhausted, moving=!dead&&!!o.moving;
      const bob=moving?Math.abs(Math.sin(T*8))*0.04*s:0;
      const cy=y-(dead?0.12*s:0.22*s)+bob;
      const base=dead?'#5B6572':(exhausted?'#8A6A45':'#3FBF8C');
      const accent=dead?'#4E5663':(exhausted?'#D4B070':'#7FE3B4');
      ctx.save();
      /* 地面阴影：贴地行走 */
      ctx.fillStyle='rgba(0,0,0,'+(dead?0.34:0.26)+')';
      ctx.beginPath();ctx.ellipse(x,y-0.02*s,0.34*s,0.13*s,0,0,7);ctx.fill();
      const img=IMG['fx_medbot'];
      if(ready(img)){
        const w=1.56*s, h=1.56*s;
        ctx.globalAlpha=dead?0.5:0.98;
        ctx.drawImage(img,x-w/2,cy-h*0.58,w,h);
        ctx.globalAlpha=1;
      }else{
        drawRobotBody(T,x,y,s,{kind:'medbot',dead:dead,face:o.face||1,
          moving:moving,base:base,accent:accent});
      }
      /* 侧灯：在线=呼吸绿灯，电量耗尽=琥珀慢闪 */
      const blink=exhausted?(0.35+0.35*Math.sin(T*4)):(0.55+0.35*Math.sin(T*3));
      ctx.fillStyle='rgba('+(exhausted?'212,176,112':'127,227,180')+','+blink.toFixed(2)+')';
      ctx.beginPath();ctx.arc(x+0.28*s,cy-0.10*s,0.045*s,0,7);ctx.fill();
      /* 治疗光束：悬停在伤员身边时持续拉住（不是读条瞬间才闪一下） */
      if(o.healing&&o.target){
        const tx=SX(o.target.x), ty=SY(o.target.y)-0.30*s;
        const sx0=x, sy0=cy+0.16*s;
        const flick=0.55+0.28*Math.sin(T*13);
        const bg=ctx.createLinearGradient(sx0,sy0,tx,ty);
        bg.addColorStop(0,'rgba(200,255,228,.78)');
        bg.addColorStop(1,'rgba(127,227,180,'+(0.20*flick).toFixed(2)+')');
        ctx.strokeStyle=bg;ctx.lineWidth=Math.max(2,0.085*s);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(sx0,sy0);ctx.lineTo(tx,ty);ctx.stroke();
        for(let k=0;k<3;k++){
          const p=((T*1.7+k*0.33)%1);
          ctx.fillStyle='rgba(210,255,236,'+(0.5*(1-p)).toFixed(2)+')';
          ctx.beginPath();
          ctx.arc(sx0+(tx-sx0)*p,sy0+(ty-sy0)*p,0.055*s,0,7);ctx.fill();
        }
        ctx.strokeStyle='rgba(127,227,180,'+(0.34+0.34*Math.sin(T*9)).toFixed(2)+')';
        ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(tx,ty+0.30*s,0.56*s,0.30*s,0,0,7);ctx.stroke();
      }
      ctx.restore();
    }
    /* 机器人标签的唯一文案源：保安拘留次数必须读 SEC_USES_MAX，不能再写死 3 */
    function botLabelText(f,dead){
      const left=G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft;
      const exhausted=f.kind==='medbot'&&!dead&&left<=0;
      const cd=f.kind==='medbot'&&!dead&&!exhausted&&(G.medbotCD||0)>0?Math.ceil(G.medbotCD):0;
      return f.label+(dead?' · 停摆':(exhausted?' · 电量耗尽':
        (f.kind==='medbot'?(cd?' · 冷却 '+cd+'s':' · 电量 '+left+'/'+MEDBOT_CHARGES):
          (f.kind==='secbot'?' · 拘留 '+((G.secbotUses||0))+'/'+SEC_USES_MAX:' · 在线'))));
    }
    function drawBotLabel(f,x,y,s,dead){
      const text=botLabelText(f,dead);
      const left=G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft;
      const exhausted=f.kind==='medbot'&&!dead&&left<=0;
      ctx.font='500 9.5px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      const w=ctx.measureText(text).width+10,h=13,ly=y+0.62*s;
      /* 医疗间地面偏亮，纯文字标签会糊进底图，加一层暗底保证可读 */
      ctx.fillStyle=(dead||exhausted)?'rgba(8,11,16,.55)':'rgba(8,11,16,.72)';
      ctx.beginPath();ctx.roundRect(x-w/2,ly-h/2,w,h,4);ctx.fill();
      ctx.strokeStyle=(dead||exhausted)?'rgba(190,160,100,.35)':'rgba(126,142,164,.35)';
      ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=dead?'rgba(170,180,195,.75)':(exhausted?'rgba(230,190,120,.9)':'rgba(225,238,248,.92)');
      ctx.fillText(text,x,ly+0.5);
    }
    /* 设施：电闸 / 监控台 / 医疗无人机 / 保安机器人 / 拘留区 */
    function drawFacilities(T){
      const s=VIEW.s;
      for(const f of M.facility){
        /* 机器人按巡逻运行时坐标画，设施表里的 x/y 只是初始位 */
        const rp=(f.kind==='medbot'||f.kind==='secbot')?botPos(f.kind):null;
        const x=SX(rp?rp.x:f.x),y=SY(rp?rp.y:f.y);
        if(f.kind==='breaker')drawFacBreaker(f,x,y,s,T);
        else if(f.kind==='monitor')drawFacMonitor(f,x,y,s,T);
        else if(f.kind==='supply')drawFacSupply(f,x,y,s,T);
        else if(f.kind==='medbot')drawFacMedbot(f,x,y,s,T);
        else if(f.kind==='secbot')drawFacSecbot(f,x,y,s,T);
      }
      /* 拘留区：保安机器人旁边的红色虚线角笼 */
      const jail=secJail();
      if(jail){
        const jx=SX(jail[0]),jy=SY(jail[1]);
        const busy=G.agents.some(a=>a.detained&&a.alive);
        ctx.save();
        ctx.setLineDash([4,3]);
        ctx.strokeStyle=busy?'rgba(255,107,97,.6)':'rgba(120,136,154,.22)';
        ctx.lineWidth=1.2;
        ctx.beginPath();ctx.ellipse(jx,jy,0.52*s,0.34*s,0,0,7);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle=busy?'rgba(255,150,140,.75)':'rgba(120,136,154,.35)';
        ctx.font='500 9px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('拘留区',jx,jy-0.5*s);
        ctx.restore();
      }
    }
    /* 电闸柜：手柄、状态灯与拉闸进度（drawFacilities 拆分第二批） */
    function drawFacBreaker(f,x,y,s,T){
        if(f.kind==='breaker'){
          const off=G.lightState===2;
          /* 电闸优化：柜体 + 危险色边框 + 大拉杆（角度随供电状态平滑过渡）+
             状态灯 + 拉闸进度环。6 秒重拉闸时进度环变成橙红并带电流抖动。 */
          const pull=breakerPuller();
          const lever=off?1:0;
          BREAKER_LEVER+= (lever-BREAKER_LEVER)*Math.min(1,0.16);
          const ang=-0.62+BREAKER_LEVER*1.22;
          ctx.save();ctx.translate(x,y);
          /* 柜体本体交给底图（2026-10-31 改）：
             tools/blender-ship.py 的 breaker 分支早就烘了柜体 + 门板 + 拉杆 + LED 灯带 +
             线管 + 地面框，面板材质换成 SDXL 的 facility-panel.png。Canvas 只画玩法状态层
             —— 断电冷光、供电状态灯、拉闸进度环、重闸电弧。以前这里再画一台柜子（或叠一张
             SDXL 精灵），会跟底图那台叠成两台设备，玩家看到的就是「突兀」。 */
          if(off){
            const g0=ctx.createRadialGradient(0,0,0,0,0,1.05*s);
            g0.addColorStop(0,'rgba(70,150,190,.28)');
            g0.addColorStop(1,'rgba(70,150,190,0)');
            ctx.fillStyle=g0;ctx.beginPath();ctx.arc(0,0,1.05*s,0,7);ctx.fill();
          }
          const blink=off?(0.50+0.35*Math.sin(T*6)):(0.60+0.30*Math.sin(T*2.2));
          /* 状态层落在闸组台面上：锚点是闸组前缘（贴家具），柜体在锚点 +y 方向 */
          ctx.fillStyle=(off?'rgba(127,211,240,':'rgba(127,227,180,')+blink.toFixed(2)+')';
          ctx.beginPath();ctx.arc(-0.46*s,0.55*s,0.085*s,0,7);ctx.fill();
          ctx.fillStyle='rgba(205,216,230,.90)';
          ctx.font='600 '+Math.max(8,0.17*s).toFixed(1)+'px system-ui';
          ctx.textAlign='left';ctx.textBaseline='middle';
          ctx.fillText(off?'断电':'供电',-0.32*s,0.55*s);
          /* 拉闸进度环 */
          if(pull&&pull.p>0){
            const hot=pull.heavy;
            ctx.strokeStyle=hot?'rgba(255,150,60,.92)':'rgba(127,211,240,.92)';
            ctx.lineWidth=3;ctx.lineCap='round';
            ctx.beginPath();ctx.arc(0,0,0.86*s,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,pull.p));
            ctx.stroke();
            if(hot){
              for(let k=0;k<3;k++){
                const aa=T*9+k*2.1, rr=0.62*s+Math.sin(T*13+k)*0.06*s;
                ctx.strokeStyle='rgba(255,214,140,'+(0.35+0.35*Math.sin(T*17+k)).toFixed(2)+')';
                ctx.lineWidth=1.4;
                ctx.beginPath();
                ctx.moveTo(Math.cos(aa)*rr,Math.sin(aa)*rr);
                ctx.lineTo(Math.cos(aa+0.5)*rr*1.12,Math.sin(aa+0.5)*rr*1.12);
                ctx.stroke();
              }
            }
          }
          drawIcon('bolt',off?'#7FD3F0':'#F0C674',0.40*s,0.60*s,0.30*s,0);
          ctx.restore();
        }
    }

    /* 监控台：屏幕阵与信号状态（drawFacilities 拆分第二批） */
    function drawFacMonitor(f,x,y,s,T){
        if(f.kind==='monitor'){
          const cut=G.lightState===2;
          ctx.save();ctx.translate(x,y);
          /* 监控台本体同样交给底图（2026-10-31 改）：监控室的 screenwall（多屏拼接墙）、
             console（主控台）、servercab（备份机柜）都是 Blender 模型，屏幕内容用 SDXL 的
             facility-screen.png。Canvas 只画「这台还能不能调画面」的读数：在线呼吸灯 /
             断线红点 + 一层屏光。以前这里再叠一张屏幕精灵，等于墙上多出一台设备。 */
          if(!cut){
            const gg=ctx.createRadialGradient(0,-0.62*s,0,0,-0.62*s,1.15*s);
            gg.addColorStop(0,'rgba(95,224,168,.18)');
            gg.addColorStop(1,'rgba(95,224,168,0)');
            ctx.fillStyle=gg;ctx.beginPath();ctx.arc(0,-0.62*s,1.15*s,0,7);ctx.fill();
          }else{
            const gr=ctx.createRadialGradient(0,-0.62*s,0,0,-0.62*s,0.95*s);
            gr.addColorStop(0,'rgba(190,60,50,.22)');
            gr.addColorStop(1,'rgba(190,60,50,0)');
            ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,-0.62*s,0.95*s,0,7);ctx.fill();
          }
          const mblink=cut?(0.55+0.35*Math.sin(T*8)):(0.45+0.30*Math.sin(T*2.6));
          ctx.fillStyle=cut?('rgba(255,107,97,'+mblink.toFixed(2)+')')
            :('rgba(95,224,168,'+mblink.toFixed(2)+')');
          ctx.beginPath();ctx.arc(0,-0.92*s,0.075*s,0,7);ctx.fill();
          ctx.restore();
        }
    }

    /* 补给点：弹药 / 医疗两型箱体与余量提示（drawFacilities 拆分第二批） */
    function drawFacSupply(f,x,y,s,T){
        if(f.kind==='supply'){
          /* ---- 补给站（2026-11-01 改 Blender 渲染）----
             旧实现是 Canvas 手画的圆角矩形 + 居中图标 + 上方 9px 文字：
             在 12° 俯角的烘焙底图上，它就是一张贴在地上的 UI 按钮 ——
             没有顶面、没有厚度、不受光，和旁边的货箱病床完全不是一套画法。
             现在本体来自 tools/blender-fx.py：SDXL 材质 + 与底图**同一台相机、
             同一套三点光、同一套 AgX 色彩管理**，所以它和底图是一张照片里的东西。
             这里只留状态层（可兑换虚线环 + 深色药丸标签），不再画本体。 */
          const ammo=f.item==='ammo';
          const im=IMG[ammo?'fx_supply_ammo':'fx_supply_med'];
          const gw=1.62*s;
          const me0=G.me||null;
          const cd=supplyCoolLeft(f.item);
          const ready0=!G.spectMode&&!!me0&&cd<=0&&(me0.qual|0)>0&&
            (ammo?(me0.bullet|0)<1:(me0.medkit|0)<1);
          if(ready(im)){
            /* 贴图里已经烘了接地阴影，锚点往上抬一点让影子落在交互点上 */
            ctx.drawImage(im,x-gw/2,y-gw/2-0.06*s,gw,gw);
          }else{
            /* 冷启动兜底：贴图还没加载完时给一个最小可读的占位，不要留空 */
            ctx.fillStyle='rgba(10,14,20,.9)';
            ctx.strokeStyle=ammo?'#6B4E19':'#1F5A46';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.roundRect(x-0.54*s,y-0.48*s,1.08*s,0.82*s,4);ctx.fill();ctx.stroke();
          }
          if(ready0){
            ctx.save();
            ctx.strokeStyle=(ammo?'rgba(250,184,51,':'rgba(127,227,180,')+
              (0.34+0.20*Math.sin(T*3.2)).toFixed(2)+')';
            ctx.lineWidth=Math.max(1.2,0.030*s);
            ctx.setLineDash([0.15*s,0.12*s]);ctx.lineDashOffset=-T*0.9*s;
            ctx.beginPath();ctx.ellipse(x,y,0.78*s,0.56*s,0,0,7);ctx.stroke();
            ctx.restore();
          }
          const lbl=cd>0?(f.label+' · 冷却 '+Math.ceil(cd)+'s'):f.label;
          ctx.font='500 9.5px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          const tw0=ctx.measureText(lbl).width+10, th0=13;
          ctx.fillStyle='rgba(8,11,16,.72)';
          ctx.beginPath();ctx.roundRect(x-tw0/2,y+0.62*s-th0/2,tw0,th0,4);ctx.fill();
          ctx.fillStyle=cd>0?'rgba(180,190,205,.88)':(ammo?'rgba(255,224,163,.94)':'rgba(198,245,228,.94)');
          ctx.fillText(lbl,x,y+0.62*s+0.5);
        }
    }

    /* 医疗无人机：机体、旋翼与救治状态（drawFacilities 拆分第二批） */
    function drawFacMedbot(f,x,y,s,T){
        if(f.kind==='medbot'){
          const dead=!!G.medbotDead;
          const left=G.medbotLeft==null?MEDBOT_CHARGES:G.medbotLeft;
          const exhausted=!dead&&left<=0;
          const b=G.bots&&G.bots.medbot;
          ctx.save();
          if(!dead&&!exhausted){
            /* 覆盖范围显化：整间医疗间（呼吸虚线沿房间轮廓）。
               改成无人机后不再有「以机器人为圆心的 6 格圆」——它会自己飞过去，
               玩家只要记住一条规则：人落在医疗间里就有人来救。 */
            const mr=M.rooms.find(r=>r.id==='med');
            if(mr){
              ctx.beginPath();
              mr.poly.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));
              ctx.closePath();
              ctx.fillStyle='rgba(63,191,140,.045)';ctx.fill();
              ctx.setLineDash([0.22*s,0.26*s]);ctx.lineDashOffset=-T*10;
              ctx.strokeStyle='rgba(127,227,180,'+(0.34+0.16*Math.sin(T*2.2)).toFixed(2)+')';
              ctx.lineWidth=1.6;ctx.stroke();
              ctx.setLineDash([]);
            }
          }
          drawMedDrone(T,x,y,s,{dead:dead,exhausted:exhausted,
            face:b?b.face:1,moving:!!(b&&b.moving),healing:!!(b&&b.healing),
            target:G.medbotTarget!=null?G.agents[G.medbotTarget]:null});
          if(G.medbotT>0&&!dead&&!exhausted){
            /* 治疗进度环：贴合地面行走机身，按 MEDBOT_HEAL_TIME 走满才拉起 */
            const p=Math.min(1,G.medbotT/MEDBOT_HEAL_TIME);
            ctx.strokeStyle='rgba(200,255,228,.26)';ctx.lineWidth=1.6;
            ctx.beginPath();ctx.arc(x,y-0.22*s,0.66*s,0,7);ctx.stroke();
            ctx.strokeStyle='rgba(127,227,180,'+(0.42+0.34*Math.sin(T*10)).toFixed(2)+')';
            ctx.lineWidth=2.8;ctx.lineCap='round';
            ctx.beginPath();ctx.arc(x,y-0.22*s,0.66*s,-Math.PI/2,-Math.PI/2+Math.PI*2*p);ctx.stroke();
          }else if((G.medbotCD||0)>0&&!dead&&!exhausted){
            /* 20 秒救援冷却环：琥珀色倒计时弧，提示机器人正在冷却 */
            const p=Math.min(1,G.medbotCD/MEDBOT_COOLDOWN);
            ctx.strokeStyle='rgba(240,198,116,.22)';ctx.lineWidth=1.4;
            ctx.beginPath();ctx.arc(x,y-0.22*s,0.62*s,0,7);ctx.stroke();
            ctx.strokeStyle='rgba(240,198,116,.85)';
            ctx.lineWidth=2.4;ctx.lineCap='round';
            ctx.beginPath();ctx.arc(x,y-0.22*s,0.62*s,-Math.PI/2,-Math.PI/2+Math.PI*2*p);ctx.stroke();
          }
          drawBotLabel(f,x,y,s,dead);
          ctx.restore();
        }
    }

    /* 保安机器人：机体、巡逻朝向、拘留状态与名牌（drawFacilities 拆分第二批） */
    function drawFacSecbot(f,x,y,s,T){
        if(f.kind==='secbot'){
          const dead=!!G.secbotDead;
          const used=!!G.secbotUsed;
          const b=G.bots&&G.bots.secbot;
          ctx.save();
          if(!dead){
            const scan=T*0.9;
            const fa=b&&Number.isFinite(b.ang)?b.ang:0;
            const bx=b?b.x:f.x, by=b?b.y:f.y;
            /* 观察范围显化：与 botTick 同源 —— 以脚底 (bx,by) 为圆心、SEC_RANGE 格 180° 扇形，
               按 losWalls 做射线遮挡裁剪（墙体挡视线，门洞可看穿），确保标注与实际判定一致。 */
            const N=36;
            ctx.save();
            ctx.beginPath();ctx.moveTo(x,y);
            for(let i=0;i<=N;i++){
              const ang=(fa-SEC_ARC)+(SEC_ARC*2)*i/N;
              let t=SEC_RANGE;
              for(let st=0.25;st<=SEC_RANGE;st+=0.25){
                const px=bx+Math.cos(ang)*st, py=by+Math.sin(ang)*st;
                if(!losWalls(bx,by,px,py)){t=st;break;}
              }
              ctx.lineTo(SX(bx+Math.cos(ang)*t),SY(by+Math.sin(ang)*t));
            }
            ctx.closePath();
            ctx.fillStyle='rgba(255,107,97,.05)';ctx.fill();
            ctx.strokeStyle='rgba(255,107,97,.30)';ctx.lineWidth=1.4;ctx.stroke();
            ctx.save();ctx.clip();
            ctx.strokeStyle='rgba(255,107,97,.38)';ctx.lineWidth=1.8;
            ctx.beginPath();ctx.arc(x,y,SEC_RANGE*s*0.72,scan-0.34,scan+0.34);ctx.stroke();
            ctx.beginPath();ctx.arc(x,y,SEC_RANGE*s*0.72,scan+Math.PI-0.34,scan+Math.PI+0.34);ctx.stroke();
            ctx.restore();
            ctx.restore();
            ctx.fillStyle='rgba(255,180,170,.75)';ctx.font='500 8px system-ui';ctx.textAlign='center';
            ctx.fillText(SEC_RANGE+' 格 · 180°',x,y-0.55*s-3.2*s);
            if(G.secbotT>0){
              ctx.strokeStyle='rgba(255,107,97,'+(0.5+0.4*Math.sin(T*16)).toFixed(2)+')';ctx.lineWidth=2.6;
              ctx.beginPath();ctx.arc(x,y-0.55*s,(1.1+0.8*(1.6-G.secbotT))*s,0,7);ctx.stroke();
            }
          }
          /* 已擒拿过的当晚转琥珀色，保留原有"本夜用过"的信息。
             机体优先用 SDXL 出的 2.5D 贴图（站立 3/4 视角，与 crew 立绘同一套语言） */
          const simg=IMG['fx_secbot'];
          if(ready(simg)){
            const w=1.05*s, h=1.50*s;
            ctx.globalAlpha=dead?0.42:0.98;
            ctx.drawImage(simg,x-w/2,y-h*0.93,w,h);
            ctx.globalAlpha=1;
            if(dead){
              /* 停摆：机身压暗 + 一道斜向裂纹提示，避免和在线状态混淆 */
              ctx.strokeStyle='rgba(150,160,175,.55)';ctx.lineWidth=1.4;
              ctx.beginPath();ctx.moveTo(x-0.26*s,y-0.35*s);ctx.lineTo(x+0.24*s,y-1.02*s);ctx.stroke();
            }
            if(used&&!dead){
              ctx.fillStyle='rgba(201,164,107,.85)';
              ctx.beginPath();ctx.arc(x+0.30*s,y-1.18*s,0.07*s,0,7);ctx.fill();
            }
          }else{
            drawRobotBody(T,x,y,s,{kind:'secbot',dead:dead,face:b?b.face:1,
              moving:!!(b&&b.moving),base:used?'#8A6A45':'#FF6B61',
              accent:used?'#C9A46B':'#FFB4A8'});
          }
          if(G.secCatch&&!dead){
            const cd=G.secCatch, tgt=G.agents[cd.i];
            if(tgt){
              const tx=SX(tgt.x),ty=SY(tgt.y);
              ctx.strokeStyle='rgba(255,107,97,'+(0.55+0.3*Math.sin(T*14)).toFixed(2)+')';
              ctx.lineWidth=2;ctx.setLineDash([5,3]);
              ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
              ctx.strokeStyle='rgba(255,180,170,.85)';ctx.lineWidth=1.5;
              ctx.beginPath();ctx.arc(tx,ty,1.15*s,0,7);ctx.stroke();
              ctx.fillStyle='rgba(255,190,180,.9)';ctx.font='600 9px system-ui';ctx.textAlign='center';
              ctx.fillText(cd.phase==='chase'?'追捕':'压制',tx,ty-1.5*s);
            }
          }
          drawBotLabel(f,x,y,s,dead);
          ctx.restore();
        }
    }

    /* 地道口：菱形格栅 + 呼吸光环。
       形状语言全船统一（菱形 + 三道格栅 + 呼吸环），配色跟随所在舱室的主题色，
       这样食堂口是暖金、医疗口是冷青、引擎口是橙红，看起来长在房间里而不是贴上去的。
       颜色值与 tools/blender-ship.py 的 ROOM_THEME[].mark 对齐。 */
    /* 方案 A 第四批：ROW / PIPE_TINT 真源在 js/t2/space.js#SKT2Space；PIPE_TINT 本文件不再定义。 */
    function drawPipes(T){      const s=VIEW.s;
      for(const q of M.pipes){
        const x=SX(q.x),y=SY(q.y);
        const tint=pipeTint(q.room);
        /* 写实通风口精灵（千问贴图 + Blender 渲染，边圈已按舱室染色）。 */
        const im=IMG['pipe_'+q.room], size=1.9*s;
        if(ready(im)){
          ctx.drawImage(im,x-size/2,y-size/2,size,size);
        }else{
          ctx.fillStyle='rgba(10,12,16,.96)';
          ctx.strokeStyle=tint.a('.85');ctx.lineWidth=1.4;
          ctx.beginPath();ctx.roundRect(x-0.75*s,y-0.55*s,1.5*s,1.1*s,0.12*s);ctx.fill();ctx.stroke();
        }
        /* 地道口指示灯：灯座 + 热芯 + 暖黄光晕，慢呼吸闪烁；不用大色框。 */
        const lx=x+0.62*s, ly=y-0.46*s;
        const pulse=Math.pow(0.5+0.5*Math.sin(T*3.6+(q.x+q.y)*0.17),2.2);
        const glowA=0.22+0.78*pulse;
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        const glow=ctx.createRadialGradient(lx,ly,0,lx,ly,0.62*s);
        glow.addColorStop(0,'rgba(255,242,196,'+(0.82*glowA).toFixed(3)+')');
        glow.addColorStop(0.28,'rgba(255,190,96,'+(0.38*glowA).toFixed(3)+')');
        glow.addColorStop(1,'rgba(255,146,40,0)');
        ctx.fillStyle=glow;
        ctx.beginPath();ctx.arc(lx,ly,0.62*s,0,7);ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.fillStyle='rgba(12,12,10,.92)';
        ctx.beginPath();ctx.arc(lx,ly,0.14*s,0,7);ctx.fill();
        ctx.strokeStyle='rgba(255,198,108,'+(0.55+0.35*pulse).toFixed(3)+')';
        ctx.lineWidth=Math.max(1,0.016*s);
        ctx.stroke();
        ctx.fillStyle='rgba(255,246,214,'+(0.55+0.45*pulse).toFixed(3)+')';
        ctx.beginPath();ctx.arc(lx-0.015*s,ly-0.015*s,0.055*s,0,7);ctx.fill();
        ctx.restore();
        /* 2026-11-10：不再画彩色脉冲外框（用户否决"突兀色框"）；精灵已按舱室地板色调分级。 */
      }
    }
    /* 圆桌上的物资申请单：有待领时显示金色单据与脉冲环 */
    function drawReqTable(T){
      const t=roundTableCover(); if(!t)return;
      const x=SX(t.x+t.w/2), y=SY(t.y+t.h/2);
      const pend=G.me.qualPending||0, s=VIEW.s;
      const a=pend?0.55+0.25*Math.sin(T*4.5):0.24;
      ctx.save();ctx.translate(x,y-0.08*s);
      ctx.globalAlpha=pend?1:0.55;
      ctx.fillStyle='rgba(240,198,116,.92)';
      ctx.fillRect(-0.12*s,-0.17*s,0.24*s,0.32*s);
      ctx.strokeStyle='rgba(255,244,210,.95)';ctx.lineWidth=1;
      ctx.strokeRect(-0.12*s,-0.17*s,0.24*s,0.32*s);
      ctx.strokeStyle='rgba(90,66,20,.8)';ctx.lineWidth=.8;
      for(let i=0;i<3;i++){
        ctx.beginPath();ctx.moveTo(-0.07*s,(-0.09+i*0.075)*s);ctx.lineTo(0.07*s,(-0.09+i*0.075)*s);ctx.stroke();
      }
      if(pend){
        ctx.strokeStyle='rgba(240,198,116,'+a.toFixed(2)+')';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,0.48*s,0,7);ctx.stroke();
        ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        const label='物资申请单 · 待领 '+pend;
        const w=ctx.measureText(label).width+14,ly=-0.76*s;
        ctx.fillStyle='rgba(30,22,6,.88)';
        ctx.beginPath();ctx.roundRect(-w/2,ly-9,w,18,5);ctx.fill();
        ctx.strokeStyle='rgba(240,198,116,.7)';ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle='#FFE8B0';ctx.fillText(label,0,ly+0.5);
      }
      ctx.restore();
    }
    /* 自动门：横向门用立式双开门板，纵向门用贴地滑轨；无人闭合、有人靠近滑开。 */
    /* 自动门：2.5D 只画「门的顶面」。
       相机固定从北侧俯视，立式门板会露出一整块正立面、从上下两侧看还不一样；
       这里统一成一块被抬到墙顶高度的薄板（两块门板左右滑开），
       横门 / 竖门只是旋转 90°，看上去始终是"门的最上面那一层"。 */
    function drawDoors(T){
      if(!G||!G.doors)return;
      const s=VIEW.s, im=IMG['door'], readyIm=ready(im);
      const LIFT=0.24*s;              /* 与墙顶在 12° 俯视下的屏幕位移对齐 */
      for(const d of G.doors){
        const cx=SX(d.x), cy=SY(d.y), open=d.open;
        const len=d.w*s, dep=0.40*s;
        /* 断电/破坏安检：门在有人等待时显示 2.5 秒红色扫描 */
        const scanActive=doorScanRule(d);
        const scanT=scanActive?
          Math.max(0,Math.min(DOOR_SCAN_TIME,d.scanT||0)):0;
        const scanning=scanT>0&&scanT<DOOR_SCAN_TIME;
        const locked=scanActive&&scanT<DOOR_SCAN_TIME;
        /* 地面滑轨 / 门槛：贴地，给"这里能过去"的方向感 */
        ctx.save();
        ctx.translate(cx,cy);
        if(!d.horiz)ctx.rotate(Math.PI/2);
        ctx.fillStyle='rgba(6,9,13,.55)';
        ctx.beginPath();ctx.roundRect(-len/2-0.06*s,-dep/2,len+0.12*s,dep,2);ctx.fill();
        ctx.fillStyle='rgba(255,176,32,.10)';
        ctx.fillRect(-len/2,-dep/2+0.5,len,Math.max(1,0.02*s));
        ctx.restore();
        /* 门顶面 */
        ctx.save();
        ctx.translate(cx,cy-LIFT);
        if(!d.horiz)ctx.rotate(Math.PI/2);
        /* 侧面厚度：只留 2px 暗边，不画正立面 */
        ctx.fillStyle='rgba(0,0,0,.55)';
        ctx.beginPath();ctx.roundRect(-len/2,-dep/2+2,len,dep,2);ctx.fill();
        ctx.fillStyle='rgba(24,31,40,.98)';
        ctx.beginPath();ctx.roundRect(-len/2,-dep/2,len,dep,2);ctx.fill();
        ctx.strokeStyle='rgba(120,140,160,.38)';ctx.lineWidth=1;
        ctx.beginPath();ctx.roundRect(-len/2,-dep/2,len,dep,2);ctx.stroke();
        ctx.save();
        ctx.beginPath();ctx.rect(-len/2+1,-dep/2+1,len-2,dep-2);ctx.clip();
        const slide=open*(len/2+0.04*s), alpha=1-open*0.55;
        if(readyIm){
          const sw=im.naturalWidth/2, sh=im.naturalHeight;
          ctx.globalAlpha=alpha;
          ctx.drawImage(im,0,0,sw,sh,-len/2-slide,-dep/2,len/2,dep);
          ctx.drawImage(im,sw,0,sw,sh,slide,-dep/2,len/2,dep);
          ctx.globalAlpha=1;
        }else{
          ctx.fillStyle='#4A5563';
          ctx.fillRect(-len/2-slide,-dep/2,len/2,dep);
          ctx.fillRect(slide,-dep/2,len/2,dep);
        }
        if(open<0.5){
          ctx.strokeStyle='rgba(255,170,90,'+(0.45+0.25*Math.sin(T*5+d.x)).toFixed(2)+')';
          ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(0,-dep/2+1);ctx.lineTo(0,dep/2-1);ctx.stroke();
        }
        ctx.restore();
        if(scanning){
          /* 2 秒红色安检扫描：一条亮线沿门板从左扫到右 + 红色脉冲底 */
          const sx=-len/2+len*(scanT/DOOR_SCAN_TIME);
          ctx.save();
          ctx.beginPath();ctx.rect(-len/2,-dep/2,len,dep);ctx.clip();
          ctx.fillStyle='rgba(255,44,34,'+(0.13+0.09*(0.5+0.5*Math.sin(T*18))).toFixed(2)+')';
          ctx.fillRect(-len/2,-dep/2,len,dep);
          const sg=ctx.createLinearGradient(sx-0.12*s,0,sx+0.12*s,0);
          sg.addColorStop(0,'rgba(255,40,30,0)');
          sg.addColorStop(0.5,'rgba(255,96,72,.95)');
          sg.addColorStop(1,'rgba(255,40,30,0)');
          ctx.fillStyle=sg;ctx.fillRect(sx-0.12*s,-dep/2,0.24*s,dep);
          ctx.strokeStyle='rgba(255,150,130,.95)';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(sx,-dep/2);ctx.lineTo(sx,dep/2);ctx.stroke();
          ctx.restore();
        }
        /* 顶面高光 + 状态灯：从哪一侧看都一样 */
        ctx.strokeStyle='rgba(200,225,245,.34)';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(-len/2,-dep/2+0.5);ctx.lineTo(len/2,-dep/2+0.5);ctx.stroke();
        ctx.fillStyle=locked?'rgba(255,80,64,.98)':
          (open>0.55?'rgba(127,211,240,.95)':'rgba(255,107,97,.95)');
        ctx.beginPath();ctx.arc(len/2-0.08*s,0,Math.max(1.6,0.045*s),0,7);ctx.fill();
        if(locked){
          ctx.strokeStyle='rgba(255,90,70,.85)';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(len/2-0.08*s,0,Math.max(2.4,0.085*s),0,7);ctx.stroke();
        }
        ctx.restore();
      }
    }
    /* 声纹：多个声音同时出现时画多圈涟漪，穿墙可见（雾之上） */
    const WAVE_COL={step:'203,218,234',knife:'255,107,97',shot:'255,192,97',
      drag:'224,169,75',power:'127,211,240',pipe:'168,150,255',robot:'255,138,101',
      /* 医疗无人机救援：医疗绿，与 robot 的橙红（故障/停摆）分开（2026-11-18）。 */
      medbot:'63,191,140',alarm:'255,107,97'};
    function drawWaves(d){
      if(!G||!G.waves.length)return;
      const s=VIEW.s;
      for(const w of G.waves){
        w.t=(w.t||0)+d;
        if(w.t>=w.dur)continue;
        const p=Math.max(0,Math.min(1,w.t/w.dur));
        const a=(1-p)*(w.str==null?0.8:w.str);
        const col=WAVE_COL[w.kind]||WAVE_COL.step;
        const r=(0.28+1.75*p)*s;
        ctx.strokeStyle='rgba('+col+','+(0.62*a).toFixed(2)+')';
        ctx.lineWidth=1.3+1.4*(1-p);
        ctx.beginPath();ctx.ellipse(SX(w.x),SY(w.y),r,r*0.6,0,0,7);ctx.stroke();
        if(p>0.22){
          const r2=(0.12+1.3*(p-0.22))*s;
          ctx.strokeStyle='rgba('+col+','+(0.35*a).toFixed(2)+')';
          ctx.lineWidth=1;
          ctx.beginPath();ctx.ellipse(SX(w.x),SY(w.y),r2,r2*0.6,0,0,7);ctx.stroke();
        }
        const dot=Math.max(0,4.2*(1-p));
        if(dot>0.4){
          ctx.fillStyle='rgba('+col+','+(0.85*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(SX(w.x),SY(w.y),dot,0,7);ctx.fill();
        }
      }
      G.waves=G.waves.filter(w=>w.t<w.dur);
    }
    /* 全船监控：4×3 实时画面（10 个舱室；底图裁切 + 在场人员点位），断电时整屏雪花 */
    function drawCams(T){
      const c=document.getElementById('camcv');
      if(!c)return;
      const g=c.getContext('2d');
      const W=c.width,H=c.height,pad=8,head=17;
      g.clearRect(0,0,W,H);
      g.fillStyle='#04070B';g.fillRect(0,0,W,H);
      const cols=4, rows=Math.ceil(M.rooms.length/cols);
      const tw=(W-pad*(cols+1))/cols, th=(H-pad*(rows+1))/rows;
      const base=rtImg('base'), bReady=mapReady(base);
      const isc=base?(base.naturalWidth||base.width)/M.bounds.w:48;
      const cut=G.lightState===2;
      const rooms=M.rooms;
      rooms.forEach((r,n)=>{
        const cx=pad+(n%cols)*(tw+pad), cy=pad+Math.floor(n/cols)*(th+pad);
        const bodyY=cy+head, bodyH=th-head;
        g.save();
        g.beginPath();g.roundRect(cx,cy,tw,th,5);g.clip();
        g.fillStyle='#05090E';g.fillRect(cx,cy,tw,th);
        const inRoom=G.designMode?0:G.agents.filter(a=>a.alive&&!a.downed&&roomIdAt(a.x,a.y)===r.id).length;
        g.fillStyle='rgba(10,18,26,.96)';g.fillRect(cx,cy,tw,head);
        g.textBaseline='middle';
        g.font='600 10px system-ui';g.textAlign='left';
        g.fillStyle=cut?'#8C97A6':'#BFE9F7';g.fillText(r.name,cx+6,cy+head/2+0.5);
        g.font='500 9px system-ui';g.textAlign='right';
        g.fillStyle=cut?'#FF6B61':'#5FE0A8';
        g.fillText(cut?'NO SIGNAL':(inRoom?'● '+inRoom+' 人':'● 无人'),cx+tw-6,cy+head/2+0.5);
        if(cut){
          for(let i=0;i<90;i++){
            const qx=cx+((i*97+Math.floor(T*37)*13)%Math.max(1,tw));
            const qy=bodyY+((i*53+Math.floor(T*29)*7)%Math.max(1,bodyH));
            g.fillStyle='rgba(190,210,225,'+(0.05+((i*7)%10)/28).toFixed(2)+')';
            g.fillRect(qx,qy,2,1);
          }
          g.fillStyle='rgba(255,107,97,.92)';g.font='600 13px system-ui';g.textAlign='center';
          g.fillText('信号中断 · 电闸断开',cx+tw/2,bodyY+bodyH/2);
        }else if(bReady){
          const pr=1.4;
          const srx=Math.max(0,(r.rect[0]-pr)*isc), sry=Math.max(0,(r.rect[1]-pr)*isc);
          const srw=(r.rect[2]+pr*2)*isc, srh=(r.rect[3]+pr*2)*isc;
          const k=Math.min(tw/srw,bodyH/srh);
          const dw=srw*k,dh=srh*k,dx=cx+(tw-dw)/2,dy=bodyY+(bodyH-dh)/2;
          g.drawImage(base,srx,sry,srw,srh,dx,dy,dw,dh);
          g.fillStyle=G.lit[r.id]?'rgba(8,20,26,.08)':'rgba(2,8,12,.50)';
          g.fillRect(dx,dy,dw,dh);
          g.fillStyle='rgba(74,226,168,.045)';g.fillRect(dx,dy,dw,dh);
          const wpx=isc*k;
          g.save();
          g.beginPath();g.rect(cx+2,bodyY+2,tw-4,bodyH-4);g.clip();
          if(!G.designMode)for(const a of G.agents){
            if(roomIdAt(a.x,a.y)!==r.id)continue;
            if(!a.alive&&a.bodyGone)continue;
            const ax=dx+(a.x-(r.rect[0]-pr))*wpx, ay=dy+(a.y-(r.rect[1]-pr))*wpx;
            if(ax<cx-2||ax>cx+tw+2||ay<bodyY-2||ay>cy+th+2)continue;
            const im=IMG['cr_'+((a.i%15)+1)];
            const w=Math.max(5,wpx*1.25),h=w*160/96;
            if(!a.alive||a.downed){
              if(ready(im)){
                g.save();g.translate(ax,ay);g.rotate(-Math.PI/2);
                g.globalAlpha=a.alive?0.9:0.62;
                g.drawImage(im,0,2*160,96,160,-w/2,-h/2,w,h);
                g.restore();g.globalAlpha=1;
              }else{
                g.strokeStyle=a.alive?'#FF8A80':'rgba(205,150,150,.72)';g.lineWidth=1.6;
                g.beginPath();g.moveTo(ax-3,ay-3);g.lineTo(ax+3,ay+3);
                g.moveTo(ax+3,ay-3);g.lineTo(ax-3,ay+3);g.stroke();
              }
              continue;
            }
            if(ready(im)){
              const row=ROW[a.dir]||2,fr=a.moving?(Math.floor(T*7)%4):0;
              g.drawImage(im,fr*96,row*160,96,160,ax-w/2,ay-h*0.86,w,h);
            }else{
              g.fillStyle=a===G.me?'#F0C674':'#DDE6F0';
              g.beginPath();g.arc(ax,ay,2.6,0,7);g.fill();
              g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=0.8;g.stroke();
            }
            if(a.detained){g.strokeStyle='#7FD3F0';g.lineWidth=1;g.beginPath();g.arc(ax,ay,4.6,0,7);g.stroke();}
          }
          g.restore();
          const sy=bodyY+((T*36)%Math.max(1,bodyH));
          g.fillStyle='rgba(120,230,190,.10)';g.fillRect(cx,sy,tw,1.2);
        }else{
          g.fillStyle='#8C97A6';g.font='600 12px system-ui';g.textAlign='center';
          g.fillText('画面载入中…',cx+tw/2,bodyY+bodyH/2);
        }
        g.strokeStyle=cut?'rgba(255,107,97,.35)':'rgba(90,170,220,.35)';
        g.lineWidth=1;g.strokeRect(cx+0.5,cy+0.5,tw-1,th-1);
        g.restore();
        if(!cut){
          g.fillStyle='rgba(255,90,80,'+(0.35+0.5*(0.5+0.5*Math.sin(T*4))).toFixed(2)+')';
          g.beginPath();g.arc(cx+tw-8,cy+th-8,2.4,0,7);g.fill();
        }
      });
      g.fillStyle='rgba(140,160,180,.6)';g.font='500 9px system-ui';
      g.textAlign='right';g.textBaseline='middle';
      g.fillText('CCTV · 只显示在场人员，不显示身份 · '+(cut?'OFFLINE':'LIVE'),W-pad,H-4);
    }

    function pill(text,x,y,accent,fg){
      ctx.font='500 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      const w=ctx.measureText(text).width+16;
      ctx.fillStyle='rgba(8,11,16,.84)';
      ctx.beginPath();ctx.roundRect(x-w/2,y-10,w,20,6);ctx.fill();
      ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=fg||'#C9D1DB';ctx.fillText(text,x,y+0.5);
    }

    /* ---- 动作贴片：工具 / 武器 / 命中特效（纯视觉，不改判定） ---- */
    /* 开口扳手（维修专用）：手柄 + C 形开口头，开口朝 +X；原点在手柄末端，
       外层直接 rotate 就是「以握持点为轴拧动」。深色描边保证在暗房地板也读得清。 */
    function drawWrenchShape(len,fill,edge){
      const w=len*0.13;
      const grip=len*0.54, headR=len*0.26;
      ctx.lineCap='round';ctx.lineJoin='round';
      /* 手柄（先描深色粗线，再叠亮色细线 = 免费描边） */
      ctx.strokeStyle=edge;ctx.lineWidth=w*2.0;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(grip,0);ctx.stroke();
      ctx.strokeStyle=fill;ctx.lineWidth=w;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(grip,0);ctx.stroke();
      /* 开口头：缺口朝外，两段弧 + 两条直边 */
      const hx=grip+headR*0.55;
      ctx.strokeStyle=edge;ctx.lineWidth=w*2.0;
      ctx.beginPath();ctx.arc(hx,0,headR,0.32*Math.PI,1.68*Math.PI);ctx.stroke();
      ctx.strokeStyle=fill;ctx.lineWidth=w;
      ctx.beginPath();ctx.arc(hx,0,headR,0.32*Math.PI,1.68*Math.PI);ctx.stroke();
      /* 开口两侧的钳口短边 */
      ctx.strokeStyle=edge;ctx.lineWidth=w*1.7;
      for(const sgn of [-1,1]){
        ctx.beginPath();
        ctx.moveTo(hx+Math.cos(sgn*0.32*Math.PI)*headR,Math.sin(sgn*0.32*Math.PI)*headR);
        ctx.lineTo(hx+headR*1.28,Math.sin(sgn*0.30*Math.PI)*headR*0.86);
        ctx.stroke();
      }
      ctx.strokeStyle=fill;ctx.lineWidth=w*0.9;
      for(const sgn of [-1,1]){
        ctx.beginPath();
        ctx.moveTo(hx+Math.cos(sgn*0.32*Math.PI)*headR,Math.sin(sgn*0.32*Math.PI)*headR);
        ctx.lineTo(hx+headR*1.28,Math.sin(sgn*0.30*Math.PI)*headR*0.86);
        ctx.stroke();
      }
    }
    function drawIcon(icon,c,x,y,s,ang,lw){
      ctx.save();ctx.translate(x,y);ctx.rotate(ang||0);
      ctx.strokeStyle=c;ctx.fillStyle=c;ctx.lineWidth=lw||2;ctx.lineCap='round';ctx.lineJoin='round';
      if(icon==='wrench'){
        ctx.beginPath();ctx.moveTo(-s*0.48,s*0.48);ctx.lineTo(s*0.20,-s*0.16);ctx.stroke();
        ctx.beginPath();ctx.arc(s*0.34,-s*0.30,s*0.24,-0.9,2.0);ctx.stroke();
      }else if(icon==='cross'){
        ctx.fillRect(-s*0.11,-s*0.46,s*0.22,s*0.92);
        ctx.fillRect(-s*0.46,-s*0.11,s*0.92,s*0.22);
      }else if(icon==='bullet'){
        ctx.beginPath();ctx.roundRect(-s*0.16,-s*0.36,s*0.32,s*0.72,s*0.12);ctx.fill();
        ctx.beginPath();ctx.arc(0,-s*0.36,s*0.16,Math.PI,0);ctx.fill();
      }else if(icon==='lens'){
        ctx.beginPath();ctx.arc(0,0,s*0.28,0,7);ctx.stroke();
        ctx.beginPath();ctx.moveTo(s*0.2,s*0.2);ctx.lineTo(s*0.46,s*0.46);ctx.stroke();
      }else if(icon==='bolt'){
        ctx.beginPath();ctx.moveTo(-s*0.14,-s*0.48);ctx.lineTo(s*0.16,-s*0.06);ctx.lineTo(0,-s*0.06);
        ctx.lineTo(s*0.14,s*0.48);ctx.lineTo(-s*0.16,0);ctx.lineTo(0,0);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }
    function drawWork(a,T,ghost){
      const x=SX(a.x),y=SY(a.y),st=workStyle(a);
      const total=(a._dur||1), k=1-Math.max(0,a.doing)/total;
      ctx.save();
      if(ghost)ctx.globalAlpha=0.55;
      ctx.fillStyle=st.glow;
      ctx.beginPath();ctx.ellipse(x,y,1.5*VIEW.s,0.8*VIEW.s,0,0,7);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=4;
      ctx.beginPath();ctx.arc(x,y,1.05*VIEW.s,0,7);ctx.stroke();
      ctx.strokeStyle=st.c;ctx.lineWidth=4.5;ctx.lineCap='round';
      ctx.beginPath();ctx.arc(x,y,1.05*VIEW.s,-Math.PI/2,-Math.PI/2+k*Math.PI*2);ctx.stroke();
      const aEnd=-Math.PI/2+k*Math.PI*2;
      ctx.fillStyle=st.c;
      ctx.beginPath();ctx.arc(x+Math.cos(aEnd)*1.05*VIEW.s,y+Math.sin(aEnd)*1.05*VIEW.s,4,0,7);ctx.fill();
      const bob=Math.sin(T*9)*0.09*VIEW.s;
      const tx=x+0.80*VIEW.s,ty=y-0.62*VIEW.s+bob;
      const ga=ctx.globalAlpha;
      ctx.globalAlpha=ga*0.16;ctx.fillStyle=st.c;
      ctx.beginPath();ctx.arc(tx,ty,0.46*VIEW.s,0,7);ctx.fill();
      ctx.globalAlpha=ga;
      /* 维修动作＝真的握一把扳手在拧（2026-10-31 改）：
         以前只在右上角挂一个「扳手小图标」，看不出在拧什么。现在换成
         大号开口扳手，以手柄末端为轴做往复拧动，再沿拧动弧线补一圈虚线，
         配合下面的火花就能读出「在拧螺丝」而不是「站在那儿不动」。 */
      if(st.icon==='wrench'){
        const hx=x+0.44*VIEW.s, hy=y-0.50*VIEW.s;
        const swing=-0.58+Math.sin(T*7.2)*0.52;
        ctx.save();ctx.shadowColor='rgba(8,12,16,.85)';ctx.shadowBlur=6;
        ctx.translate(hx,hy);ctx.rotate(swing);
        /* 2026-11-01：手画的扳手换成 Blender 渲染的贴图（材质来自 SDXL 的 panel-metal）。
           贴图里手柄末端在左缘，所以把图片左边中点对准握持点，
           这样 rotate 就是以"手握的位置"为轴拧，和旧版手画的枢轴一致。 */
        const wim=IMG['tool_wrench'];
        if(ready(wim)){
          /* 尺寸放大到 1.3 格：512 贴图里扳手只占中间一条横带，
             按 1.0 格画出来会比角色还细。再叠一层暖色滤镜，
             否则浅色金属在医疗间这种亮地板上直接糊掉（旧版是暖黄 + 深描边，读得清）。 */
          const wl=1.30*VIEW.s, wh=wl;
          ctx.save();
          ctx.filter='brightness(1.18) saturate(0.9) sepia(0.42)';
          ctx.drawImage(wim,-wl*0.055,-wh*0.5,wl,wh);
          ctx.restore();
        }else{
          drawWrenchShape(0.86*VIEW.s,'#FFE8B0','#6E5522');
        }
        ctx.restore();
        /* 拧动弧线：从握持点扫出去，暗示“螺纹在转” */
        ctx.save();
        ctx.strokeStyle='rgba(255,232,176,'+(0.22+0.16*Math.sin(T*9)).toFixed(2)+')';
        ctx.lineWidth=2;ctx.setLineDash([0.09*VIEW.s,0.12*VIEW.s]);
        ctx.beginPath();ctx.arc(hx,hy,0.72*VIEW.s,swing-0.46,swing+0.46);ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }else if(st.icon==='lever'){
        /* 拉闸/合闸专用动画（2026-11-20）：和电路维修同一套「放大工具贴图 + 火花 + 弧线」，
           只是工具换成电闸拉杆。枢轴在贴图底部中央，把那点对准握持点，整根随进度扳动：
           拉闸（BREAKER_LEVER→1）从竖直倒向斜下，合闸反向。到位的最后 15% 带回弹，
           读起来是"用力扳到底"而不是匀速转。贴图未就绪时回退矢量画法，file:// 冷启动不留白。 */
        const hx=x+0.46*VIEW.s, hy=y-0.28*VIEW.s;
        /* 站桩进行中灯状态还是"动作前"的（pullBreaker 在 doing 归零时才切灯），
           所以这次动作是把它扳向**相反**档位：亮着→拉闸(扳下=1)、灭着→合闸(竖直=0)。 */
        const goal=(G.lightState===2)?0:1;
        const from=G.lightState===2?1:0;
        const eased=Math.min(1,Math.max(0,(k-0.82)/0.18));
        const overshoot=Math.sin(eased*Math.PI)*0.10;
        const leverAng=(from+(goal-from)*Math.min(1,k/0.86))*(1.15) + overshoot;
        ctx.save();ctx.shadowColor='rgba(8,12,16,.9)';ctx.shadowBlur=7;
        ctx.translate(hx,hy);ctx.rotate(leverAng);
        const lim=IMG['tool_breaker_lever'];
        if(ready(lim)){
          /* 贴图 768²，枢轴约在底部中央 (0.5, 0.86)。按 1.9 格高绘制，
             把枢轴点 (0.5W,0.86H) 落在握持点；整杆向上竖起，旋转即"扳闸"。 */
          const lw=1.9*VIEW.s, lh=lw;
          ctx.drawImage(lim,-0.5*lw,-0.86*lh,lw,lh);
        }else{
          /* 回退：矢量红球拉杆，枢轴同样在底端 */
          ctx.strokeStyle='#C9B79A';ctx.lineWidth=0.13*VIEW.s;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-1.32*VIEW.s);ctx.stroke();
          ctx.fillStyle='#D8453A';ctx.beginPath();ctx.arc(0,-1.42*VIEW.s,0.20*VIEW.s,0,7);ctx.fill();
          ctx.fillStyle='#6E6A60';ctx.beginPath();ctx.arc(0,0,0.24*VIEW.s,0,7);ctx.fill();
        }
        ctx.restore();
        /* 扳动弧线：沿拉杆扫过的角度画虚线，暗示"从这里扳到那里" */
        ctx.save();
        ctx.strokeStyle='rgba(127,211,240,'+(0.20+0.16*Math.sin(T*9)).toFixed(2)+')';
        ctx.lineWidth=2;ctx.setLineDash([0.09*VIEW.s,0.12*VIEW.s]);
        ctx.beginPath();ctx.arc(hx,hy,0.95*VIEW.s,-Math.PI/2,-Math.PI/2+1.15);ctx.stroke();
        ctx.setLineDash([]);ctx.restore();
      }else{
        ctx.save();ctx.shadowColor='rgba(8,12,16,.85)';ctx.shadowBlur=5;
        drawIcon(st.icon,st.c,tx,ty,0.66*VIEW.s,-0.5+Math.sin(T*4.5)*0.28,3.2);
        ctx.restore();
      }
      /* 工具接触点的连续火花，比一次性粒子更能读出「正在修」 */
      if(a._doing==='task'||a._doing==='breaker'||a._doing==='fake'){
        const hx=x+0.72*VIEW.s,hy=y-0.48*VIEW.s;
        ctx.lineCap='round';
        for(let i=0;i<7;i++){
          const ph=(T*2.8+i*0.17)%1, ang=-1.35+i*0.45;
          ctx.strokeStyle='rgba(210,244,255,'+(0.85*(1-ph)).toFixed(2)+')';ctx.lineWidth=2.2;
          const r0=(0.40+0.34*ph)*VIEW.s, r1=r0+0.18*VIEW.s;
          ctx.beginPath();
          ctx.moveTo(hx+Math.cos(ang)*r0,hy+Math.sin(ang)*r0*0.7);
          ctx.lineTo(hx+Math.cos(ang)*r1,hy+Math.sin(ang)*r1*0.7);
          ctx.stroke();
        }
        ctx.fillStyle='rgba(255,255,255,'+(0.55+0.35*Math.sin(T*14)).toFixed(2)+')';
        ctx.beginPath();ctx.arc(hx,hy,2.6,0,7);ctx.fill();
      }
      ctx.restore();
    }
    function drawWeapon(a,T){
      if(!a.alive||a.downed)return;
      const isMe=a===G.me, acting=a.act&&(a.act.kind==='stab'||a.act.kind==='shoot');
      const lastSee=!G.spectMode&&lastAlienEvo(G.me);
      if(!isMe&&!acting&&!G.dev&&!lastSee)return;
      /* 武器必须跟着动作位移走：突进/后坐的是整个角色，刀不能留在原点
         （否则看起来就是一把悬空的刀）。 */
      const off=actOffset(a);
      const x=SX(a.x)+(off?off.x:0), y=SY(a.y)+(off?off.y:0);
      const stabAct=!!(a.act&&a.act.kind==='stab');
      const shootAct=!!(a.act&&a.act.kind==='shoot');
      const showGun=shootAct;
      /* 外观与人类完全一致：空闲时不携带额外武器物件，只有真实出刀/开枪动作才画刀或枪。 */
      if(a.alien&&stabAct){
        const p=Math.min(1,a.act.t/a.act.dur);
        /* 短促突刺：0→1→0 的前送 + 很小的摆臂（±0.22 rad）。
           旧版用 ±0.9 rad 的大回旋，配上没跟手的刀，看起来像悬空划圈。 */
        const thrust=Math.sin(Math.min(1,p*1.35)*Math.PI);
        const ang=a.act.ang+Math.sin(p*Math.PI)*0.22;
        const hx=x+Math.cos(ang)*(0.18+0.17*thrust)*VIEW.s;
        const hy=y+Math.sin(ang)*(0.18+0.17*thrust)*VIEW.s-0.52*VIEW.s;
        const len=(0.26+0.16*thrust)*VIEW.s;
        const tipX=hx+Math.cos(ang)*len, tipY=hy+Math.sin(ang)*len;
        ctx.save();ctx.lineCap='round';
        ctx.strokeStyle='#2E3742';ctx.lineWidth=3;
        ctx.beginPath();
        ctx.moveTo(hx-Math.cos(ang)*0.06*VIEW.s,hy-Math.sin(ang)*0.06*VIEW.s);
        ctx.lineTo(hx,hy);ctx.stroke();
        ctx.strokeStyle='#E9EDF4';ctx.lineWidth=2.4;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(tipX,tipY);ctx.stroke();
        ctx.strokeStyle='#8A94A3';ctx.lineWidth=0.9;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(tipX,tipY);ctx.stroke();
        if(thrust>0.55){
          ctx.fillStyle='rgba(255,255,255,'+(0.35+0.45*thrust).toFixed(2)+')';
          ctx.beginPath();ctx.arc(tipX,tipY,1.8,0,7);ctx.fill();
        }
        ctx.restore();
      }else if(showGun||shootAct){
        let ang=dirAng(a);
        if(a.act&&a.act.kind==='shoot')ang=a.act.ang;
        const hx=x+Math.cos(ang)*0.28*VIEW.s,hy=y+Math.sin(ang)*0.28*VIEW.s-0.30*VIEW.s;
        ctx.save();ctx.lineCap='round';
        ctx.strokeStyle='#3A4556';ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+Math.cos(ang)*0.28*VIEW.s,hy+Math.sin(ang)*0.28*VIEW.s);ctx.stroke();
        ctx.strokeStyle='#C9D1DB';ctx.lineWidth=1.3;
        ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+Math.cos(ang)*0.24*VIEW.s,hy+Math.sin(ang)*0.24*VIEW.s);ctx.stroke();
        ctx.restore();
      }
    }

    /* ---- 加色混合特效层（2026-11-01）----
       贴图由 tools/gen-facility-sprites.py --fx 用本地 SDXL 出图，**纯黑底**。
       画的时候 globalCompositeOperation='lighter'：黑色不贡献任何亮度，天然等于透明，
       光晕的衰减能完整保留 —— 白底抠图会把外圈削成一圈硬边，这是特效不能走抠图的原因。
       贴图没就绪（file:// 冷启动）时返回 false，调用方回退到原来的矢量画法。 */
    function drawFxSprite(key,x,y,w,h,alpha,rot,frame,grid){
      const im=IMG[key];
      if(!ready(im))return false;
      const n=grid||1, tot=n*n;
      const f=n>1?(((frame|0)%tot)+tot)%tot:0;
      const sw=im.naturalWidth/n, sh=im.naturalHeight/n;
      const sx=(f%n)*sw, sy=((f/n)|0)*sh;
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
      ctx.translate(x,y);
      if(rot)ctx.rotate(rot);
      ctx.drawImage(im,sx,sy,sw,sh,-w/2,-h/2,w,h);
      ctx.restore();
      return true;
    }
    /* ---- 特效层：在角色之后、战争迷雾之前绘制 ---- */
    function drawFx(d,T){
      for(const f of G.fx){
        f.t-=d;
        if(f.t<=0)continue;
        if(f.x!=null&&!visibleAt(f.x,f.y))continue;
        if(f.type==='tracer'&&!(visibleAt(f.x1,f.y1)||visibleAt(f.x2,f.y2)))continue;
        const D=f.dur||0.6,p=1-Math.max(0,f.t)/D,a=1-p;
        paintFxHit(f,p,a,T);paintFxTask(f,p,a,T);paintFxSite(f,p,a,T);paintFxGun(f,p,a,T);
      }
      G.fx=G.fx.filter(f=>f.t>0);
    }
    /* 伤害与武器特效：刀光 / 血花 / 弹道 / 枪口 / 命中环（drawFx 拆分第一批，纯表现层，不碰判定） */
    function paintFxHit(f,p,a,T){
        if(f.type==='slash'){
          const a0=f.ang-1.6+2.6*p;
          const rO=(0.62+0.95*p)*VIEW.s, rI=(0.38+0.75*p)*VIEW.s;
          ctx.save();ctx.translate(SX(f.x),SY(f.y));ctx.lineCap='round';
          ctx.beginPath();
          ctx.arc(0,0,rO,a0-0.55,a0+0.55);
          ctx.arc(0,0,rI,a0+0.55,a0-0.55,true);
          ctx.closePath();
          ctx.fillStyle='rgba(200,225,255,'+(0.30*a).toFixed(2)+')';ctx.fill();
          ctx.strokeStyle='rgba(255,245,235,'+(0.95*a).toFixed(2)+')';ctx.lineWidth=1.5+6*a;
          ctx.beginPath();ctx.arc(0,0,rO,a0-0.5,a0+0.5);ctx.stroke();
          ctx.strokeStyle='rgba(224,87,79,'+(0.85*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(0,0,rI,a0-0.62,a0+0.62);ctx.stroke();
          ctx.fillStyle='rgba(255,255,255,'+a.toFixed(2)+')';
          ctx.beginPath();ctx.arc(Math.cos(a0)*rO,Math.sin(a0)*rO,3.2,0,7);ctx.fill();
          ctx.restore();
        }else if(f.type==='blood'){
          for(let i=0;i<12;i++){
            const sp=0.4+(((i*37)%10)/10)*1.2;
            const ang=f.ang+(((i*53)%100)/100-0.5)*1.4;
            const dist=sp*(0.25+k1(p))*VIEW.s;
            const px=SX(f.x)+Math.cos(ang)*dist, py=SY(f.y)+Math.sin(ang)*dist+p*p*0.28*VIEW.s;
            ctx.fillStyle='rgba(150,20,20,'+(0.85*a).toFixed(2)+')';
            ctx.beginPath();ctx.ellipse(px,py,3.1*(1-p*0.45),1.9*(1-p*0.45),ang,0,7);ctx.fill();
          }
        }else if(f.type==='tracer'){
          const x1=SX(f.x1),y1=SY(f.y1),x2=SX(f.x2),y2=SY(f.y2);
          ctx.save();ctx.lineCap='round';
          ctx.strokeStyle='rgba(255,225,140,'+(0.26*a).toFixed(2)+')';ctx.lineWidth=11;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          const g=ctx.createLinearGradient(x1,y1,x2,y2);
          g.addColorStop(0,'rgba(255,250,220,'+a.toFixed(2)+')');
          g.addColorStop(0.75,'rgba(255,220,120,'+(0.85*a).toFixed(2)+')');
          g.addColorStop(1,'rgba(255,255,255,0)');
          ctx.strokeStyle=g;ctx.lineWidth=2+3.6*a;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          ctx.restore();
        }else if(f.type==='muzzle'){
          const x=SX(f.x),y=SY(f.y),g=ctx.createRadialGradient(x,y,0,x,y,0.9*VIEW.s);
          g.addColorStop(0,'rgba(255,250,210,'+a.toFixed(2)+')');
          g.addColorStop(0.35,'rgba(255,200,90,'+(0.55*a).toFixed(2)+')');
          g.addColorStop(1,'rgba(255,180,60,0)');
          ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,0.9*VIEW.s,0,7);ctx.fill();
          ctx.strokeStyle='rgba(255,240,180,'+a.toFixed(2)+')';ctx.lineWidth=2;
          for(let i=0;i<4;i++){
            const ang=(f.ang||0)+i*Math.PI/2+0.3, r0=0.12*VIEW.s, r1=(0.5+0.4*a)*VIEW.s;
            ctx.beginPath();ctx.moveTo(x+Math.cos(ang)*r0,y+Math.sin(ang)*r0);
            ctx.lineTo(x+Math.cos(ang)*r1,y+Math.sin(ang)*r1);ctx.stroke();
          }
        }else if(f.type==='impact'){
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba(255,210,160,'+(0.9*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,(0.12+0.7*p)*VIEW.s,0,7);ctx.stroke();
          ctx.strokeStyle='rgba(255,235,190,'+(0.7*a).toFixed(2)+')';ctx.lineWidth=1.5;
          for(let i=0;i<6;i++){
            const ang=i*1.047+0.4, r0=(0.18+0.5*p)*VIEW.s, r1=(0.3+0.65*p)*VIEW.s;
            ctx.beginPath();ctx.moveTo(x+Math.cos(ang)*r0,y+Math.sin(ang)*r0);
            ctx.lineTo(x+Math.cos(ang)*r1,y+Math.sin(ang)*r1);ctx.stroke();
          }
          ctx.fillStyle='rgba(190,30,30,'+a.toFixed(2)+')';
          ctx.beginPath();ctx.arc(x,y,2.4,0,7);ctx.fill();
        }
    }

    /* 任务与补给特效：完成环 / 申请单 / 拾取 / 复电（drawFx 拆分第一批） */
    function paintFxTask(f,p,a,T){
        if(f.type==='done'){
          const x=SX(f.x),y=SY(f.y);
          /* 维修/任务完成：**只留细小电流**（2026-11-01 用户：原来那圈全息光环光污染）。
             换成同一条电弧贴图的小尺寸版本，透明度压到 0.42、尺寸只有 0.35 格，
             并且随进度快速衰减 —— 读起来是"设备收尾时啪一下的小电弧"，
             不是"原地放了个大招"。 */
          const sz=(0.34+0.26*p)*VIEW.s;
          drawFxSprite('fx_arc',x,y,sz,sz,a*0.42*0.55,0,Math.floor(f.t*30),2);
          /* ✓ 是"完成"的语义标记，不是特效本体，保留但收小、收暗 */
          ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillStyle='rgba(214,236,226,'+(a*0.85).toFixed(2)+')';
          ctx.fillText('✓',x-0.72*VIEW.s,y-(1.32+0.28*p)*VIEW.s);
        }else if(f.type==='qual'){
          const qr=0.40*VIEW.s;
          const x=SX(f.x)+1.45*VIEW.s,y=SY(f.y)-(2.05+0.6*p)*VIEW.s;
          ctx.strokeStyle='rgba(240,198,116,'+a.toFixed(2)+')';ctx.lineWidth=2.2;
          ctx.beginPath();ctx.arc(x,y,qr,0,7);ctx.stroke();
          ctx.fillStyle='rgba(240,198,116,'+(0.20*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(x,y,qr,0,7);ctx.fill();
          ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillStyle='rgba(255,244,214,'+a.toFixed(2)+')';
          ctx.strokeStyle='rgba(8,10,14,'+(0.6*a).toFixed(2)+')';ctx.lineWidth=3;
          ctx.strokeText('申请单 +1',x,y+1);
          ctx.fillText('申请单 +1',x,y+1);
          ctx.strokeStyle='rgba(240,198,116,'+(0.55*a).toFixed(2)+')';ctx.lineWidth=1.8;
          ctx.beginPath();ctx.ellipse(SX(f.x),SY(f.y),(0.5+1.0*p)*VIEW.s,(0.3+0.55*p)*VIEW.s,0,0,7);ctx.stroke();
        }else if(f.type==='pickup'){
          const isMed=f.item==='med';
          const c=isMed?'#3FBF8C':'#E0A94B';
          const rgba=isMed?'63,191,140':'224,169,75';
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba('+rgba+','+(0.55*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.ellipse(x,y,(0.45+0.6*p)*VIEW.s,(0.28+0.35*p)*VIEW.s,0,0,7);ctx.stroke();
          const pg=ctx.createLinearGradient(x,y-1.8*VIEW.s,x,y);
          pg.addColorStop(0,'rgba('+rgba+',0)');
          pg.addColorStop(0.6,'rgba('+rgba+','+(0.30*a).toFixed(2)+')');
          pg.addColorStop(1,'rgba('+rgba+','+(0.08*a).toFixed(2)+')');
          ctx.fillStyle=pg;
          ctx.beginPath();
          ctx.moveTo(x-0.18*VIEW.s,y);ctx.lineTo(x-0.32*VIEW.s,y-1.8*VIEW.s);
          ctx.lineTo(x+0.32*VIEW.s,y-1.8*VIEW.s);ctx.lineTo(x+0.18*VIEW.s,y);ctx.closePath();ctx.fill();
          ctx.fillStyle='rgba('+rgba+','+(0.22*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(x,y-1.0*VIEW.s,0.62*VIEW.s,0,7);ctx.fill();
          drawIcon(isMed?'cross':'bullet',c,x,y-(0.8+0.5*p)*VIEW.s,0.76*VIEW.s,0);
          ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.lineWidth=3;ctx.strokeStyle='rgba(8,12,10,.75)';
          const label=isMed?'拿到医疗包':'拿到子弹';
          ctx.strokeText(label,x,y-(1.9+0.25*p)*VIEW.s);
          ctx.fillStyle='rgba(235,245,240,'+a.toFixed(2)+')';
          ctx.fillText(label,x,y-(1.9+0.25*p)*VIEW.s);
        }else if(f.type==='power'){
          const x=SX(f.x),y=SY(f.y);
          /* 主视觉：Blender 渲染的电弧图集（4 帧）。没就绪才回退矢量。 */
          const sz=(1.1+1.5*p)*VIEW.s;
          const fr=Math.floor(f.t*26);
          if(!drawFxSprite('fx_arc',x,y,sz,sz,a*0.95,f.t*1.7,fr,2)){
            ctx.strokeStyle='rgba(127,211,240,'+a.toFixed(2)+')';ctx.lineWidth=2.4;
            ctx.beginPath();ctx.arc(x,y,(0.5+1.4*p)*VIEW.s,0,7);ctx.stroke();
          }
          /* 冲击环保留：电弧负责"电"，环负责"波及范围"，两者不重复 */
          ctx.strokeStyle='rgba(127,211,240,'+(a*0.5).toFixed(2)+')';ctx.lineWidth=1.6;
          ctx.beginPath();ctx.arc(x,y,(0.5+1.4*p)*VIEW.s,0,7);ctx.stroke();
        }
    }

    /* 设施与状态特效：治疗 / 搜查 / 施工火星 / 火花 / 护盾 / 治疗光束 / 拘留 / 警报 / 钻管道（drawFx 拆分第一批） */
    function paintFxSite(f,p,a,T){
        if(f.type==='heal'){
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba(63,191,140,'+a.toFixed(2)+')';ctx.lineWidth=2.4;
          ctx.beginPath();ctx.arc(x,y,(0.35+1.0*p)*VIEW.s,0,7);ctx.stroke();
          drawIcon('cross','#7FE3B4',x,y-(0.3+0.8*p)*VIEW.s,0.5*VIEW.s,0);
        }else if(f.type==='search'){
          const x=SX(f.x),y=SY(f.y);
          ctx.strokeStyle='rgba(127,211,240,'+(0.8*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,(0.3+0.9*p)*VIEW.s,0,7);ctx.stroke();
          drawIcon('lens','#BFE9F7',x,y-(0.4+0.5*p)*VIEW.s,0.45*VIEW.s,0);
        }else if(f.type==='workSpark'){
          const x=SX(f.x),y=SY(f.y)-0.2*VIEW.s;
          /* 主视觉：SDXL 焊花（加色混合）；没就绪回退到矢量短线 */
          const sz=(0.58+0.26*p)*VIEW.s;
          /* 4 帧循环：按剩余时间推进，同一个火花播完正好走完一轮 */
          const fr=Math.floor((1-p)*4*2.2);
          if(!drawFxSprite('fx_weld',x,y,sz,sz,a*0.52,f.ang||0,fr,2)){
            ctx.strokeStyle='rgba(180,230,255,'+(0.9*a).toFixed(2)+')';ctx.lineWidth=1.5;ctx.lineCap='round';
            for(let i=0;i<3;i++){
              const ang=f.ang+i*2.1, r0=(0.1+0.5*p)*VIEW.s;
              ctx.beginPath();
              ctx.moveTo(x+Math.cos(ang)*r0,y+Math.sin(ang)*r0*0.6);
              ctx.lineTo(x+Math.cos(ang)*(r0+0.14*VIEW.s),y+Math.sin(ang)*(r0+0.14*VIEW.s)*0.6-0.06*VIEW.s);
              ctx.stroke();
            }
          }
        }else if(f.type==='spark'){
          const ang0=Math.abs(Math.sin(f.t*18));
          const sz=(0.9+0.5*ang0)*VIEW.s;
          if(!drawFxSprite('fx_arc',SX(f.x),SY(f.y),sz,sz,(0.55+0.45*ang0)*a,
              f.t*9,Math.floor(f.t*22),2)){
            ctx.strokeStyle='rgba(150,220,255,'+(ang0*0.95).toFixed(2)+')';ctx.lineWidth=2;
            for(let i=0;i<5;i++){
              const ang=f.t*7+i*1.7, r0=0.25*VIEW.s, r1=(0.7+ang0*0.5)*VIEW.s;
              ctx.beginPath();
              ctx.moveTo(SX(f.x)+Math.cos(ang)*r0,SY(f.y)+Math.sin(ang)*r0);
              ctx.lineTo(SX(f.x)+Math.cos(ang)*r1,SY(f.y)+Math.sin(ang)*r1);
              ctx.stroke();
            }
          }
        }else if(f.type==='shield'){
          ctx.strokeStyle='rgba(127,211,240,'+(0.9*a).toFixed(2)+')';ctx.lineWidth=3;
          ctx.beginPath();ctx.arc(SX(f.x),SY(f.y),(0.4+1.6*p)*VIEW.s,0,7);ctx.stroke();
          ctx.strokeStyle='rgba(127,211,240,'+(0.5*a).toFixed(2)+')';
          ctx.beginPath();ctx.arc(SX(f.x),SY(f.y),1.1*VIEW.s,0,7);ctx.stroke();
        }else if(f.type==='healBeam'){
          const x1=SX(f.x1),y1=SY(f.y1),x2=SX(f.x2),y2=SY(f.y2);
          ctx.save();ctx.setLineDash([5,4]);ctx.lineDashOffset=-T*30;
          ctx.strokeStyle='rgba(127,227,180,'+(0.65*a).toFixed(2)+')';ctx.lineWidth=2.2;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle='rgba(127,227,180,'+(0.45*a).toFixed(2)+')';ctx.lineWidth=1.4;
          ctx.beginPath();ctx.arc(x2,y2,(0.35+0.8*p)*VIEW.s,0,7);ctx.stroke();
          ctx.restore();
        }else if(f.type==='detain'){
          const x1=SX(f.x1),y1=SY(f.y1),x2=SX(f.x2),y2=SY(f.y2);
          ctx.strokeStyle='rgba(255,138,101,'+(0.75*a).toFixed(2)+')';ctx.lineWidth=2.4;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          ctx.strokeStyle='rgba(255,107,97,'+(0.85*a).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x2,y2,(0.4+0.9*p)*VIEW.s,0,7);ctx.stroke();
          ctx.setLineDash([3,3]);
          ctx.strokeStyle='rgba(255,180,160,'+(0.5*a).toFixed(2)+')';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(x2,y2,0.52*VIEW.s,0,7);ctx.stroke();
          ctx.setLineDash([]);
        }else if(f.type==='alarm'){
          const x=SX(f.x),y=SY(f.y);
          for(let i=0;i<3;i++){
            const k=Math.max(0,Math.min(1,p-i*0.18));
            if(k<=0)continue;
            ctx.strokeStyle='rgba(255,107,97,'+(0.55*(1-k)*a).toFixed(2)+')';ctx.lineWidth=2;
            ctx.beginPath();ctx.arc(x,y,(0.4+1.5*k)*VIEW.s,0,7);ctx.stroke();
          }
        }else if(f.type==='pipefx'){
          const x=SX(f.x),y=SY(f.y);
          for(let i=0;i<3;i++){
            const k=Math.max(0,Math.min(1,p-i*0.15));
            if(k<=0)continue;
            ctx.strokeStyle='rgba(168,150,255,'+(0.7*(1-k)*a).toFixed(2)+')';ctx.lineWidth=2;
            ctx.beginPath();ctx.ellipse(x,y,(0.3+1.1*k)*VIEW.s,(0.2+0.7*k)*VIEW.s,0,0,7);ctx.stroke();
          }
        }
    }

    /* 近身与开枪的收尾描边（drawFx 拆分第一批） */
    function paintFxGun(f,p,a,T){
        if(f.type==='knife'){
          ctx.strokeStyle='rgba(224,87,79,'+a.toFixed(2)+')';ctx.lineWidth=3;
          ctx.beginPath();ctx.arc(SX(f.x),SY(f.y),(0.3+1.3*p)*VIEW.s,0,7);ctx.stroke();
        }else if(f.type==='shot'){
          ctx.strokeStyle='rgba(255,235,150,'+a.toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(SX(f.x1),SY(f.y1));ctx.lineTo(SX(f.x2),SY(f.y2));ctx.stroke();
        }
    }

    /* 头顶常显「席位号 + 名字」；编号永远在前，会议里也用同一套标签 */
    let TAG_RECTS=[];
    /* 文字量测缓存：DEV 全知标签每帧要量 15~30 条文本，measureText 在部分机器上很贵。
       键带字体，避免切换字号后读到旧宽度。 */
    const MEASURE={};
    function textW(txt){
      const k=ctx.font+'|'+txt;
      const v=MEASURE[k];
      if(v!=null)return v;
      const w=ctx.measureText(txt).width;
      if(Object.keys(MEASURE).length>600)for(const q in MEASURE)delete MEASURE[q];
      return(MEASURE[k]=w);
    }
    /* 身份/凶手标签预渲染成小精灵：DEV 每帧只 drawImage，不再重复 roundRect + fillText。
       文本变化很少（名字/身份/状态），缓存命中率接近 100%。 */
    const LABELSPR={};
    function labelSprite(txt,fg,bg){
      const d=Math.min(3,Math.max(1,dpr||1));
      const key=d+'|'+bg+'|'+fg+'|'+txt;
      if(LABELSPR[key])return LABELSPR[key];
      ctx.save();ctx.font='500 11px system-ui';
      const tw=ctx.measureText(txt).width;ctx.restore();
      const w=Math.ceil(tw+8),h=16;
      const c=document.createElement('canvas');
      c.width=Math.ceil(w*d);c.height=Math.ceil(h*d);
      const o=c.getContext('2d');
      o.setTransform(d,0,0,d,0,0);
      o.font='500 11px system-ui';o.textAlign='center';o.textBaseline='middle';
      o.fillStyle=bg;o.beginPath();o.roundRect(0,0,w,h,4);o.fill();
      o.fillStyle=fg;o.fillText(txt,w/2,h/2+0.5);
      return(LABELSPR[key]={c,w,h});
    }
    /* 幽灵光晕预渲染：以前每个幽灵每帧 createRadialGradient + fill。 */
    let GHOST_GLOW=null;
    function ghostGlow(){
      if(GHOST_GLOW)return GHOST_GLOW;
      const R=96,c=document.createElement('canvas');c.width=c.height=R*2;
      const o=c.getContext('2d');
      const g=o.createRadialGradient(R,R,0,R,R,R);
      g.addColorStop(0,'rgba(127,211,240,.20)');
      g.addColorStop(1,'rgba(127,211,240,0)');
      o.fillStyle=g;o.fillRect(0,0,R*2,R*2);
      return(GHOST_GLOW=c);
    }
    function drawNameTag(a,x,y,isMe){
      const no=seatNo(a), nm=a.name;
      ctx.save();
      ctx.font='600 10.5px system-ui';
      const wNo=textW(no), wNm=textW(nm);
      /* 2026-11-21 用户裁定：玩家玩异形时必须能认出自己的队友（此前看不到）——
         trio 互认 / 局中 markMate 认出的队友，头顶直接标「◆同族」。
         2026-11-22：判据抽成 isMyMate，与投票名单共用同一条（红线 15）。
         !isMe 保留在调用处：旁观模式下 isMe 恒 false，行为与改造前一致。 */
      const mateTag=!isMe&&isMyMate(a);
      const resTag=(!isMe&&a.alive&&!G.spectMode&&lastAlienEvo(G.me))
        ?(' 弹'+(a.bullet|0)+' 药'+(a.medkit|0)+' 单'+(a.qual|0)):'';
      const wRes=resTag?textW(resTag):0;
      const w=wNo+wNm+17+(mateTag?34:0)+wRes, h=15;
      /* 同屏标签互相压住时向上错开，保证编号和名字始终可读 */
      for(let k=0;k<12;k++){
        let hit=false;
        for(const r of TAG_RECTS){
          if(Math.abs(r.x-x)<(r.w+w)/2+3 && Math.abs(r.y-y)<(r.h+h)/2+1){hit=true;break;}
        }
        if(!hit)break;
        y-=h+2;
      }
      TAG_RECTS.push({x,y,w,h});
      ctx.fillStyle=mateTag?'rgba(46,12,12,.94)'
        :(isMe?'rgba(40,31,12,.92)':'rgba(8,11,16,.84)');
      ctx.beginPath();ctx.roundRect(x-w/2,y-h/2,w,h,4);ctx.fill();
      ctx.strokeStyle=mateTag?'rgba(224,87,79,.9)'
        :(isMe?'rgba(240,198,116,.8)':'rgba(126,142,164,.4)');
      ctx.lineWidth=mateTag?1.2:1;ctx.stroke();
      ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillStyle='#F0C674';ctx.fillText(no,x-w/2+7,y+0.5);
      ctx.fillStyle='#E8EEF6';ctx.fillText(nm,x-w/2+7+wNo+5,y+0.5);
      if(mateTag){
        ctx.fillStyle='#E0574F';
        ctx.fillText('◆同族',x-w/2+7+wNo+5+wNm+6,y+0.5);
      }
      if(resTag){
        ctx.fillStyle='#7FD3F0';
        ctx.fillText(resTag,x-w/2+7+wNo+5+wNm+(mateTag?34:0)+2,y+0.5);
      }
      ctx.restore();
    }

    /* 任务目标高亮（2026-11-02 重做）：**红色包边沿物体轮廓 + 呼吸闪烁**。
       做法：把该掩体的家具贴图按屏上尺寸画进离屏画布 → alpha 膨胀 → 减去原图，
       得到一条严格沿轮廓的"环"，染红后叠绘在物体上。
       这就是 Blender Freestyle 描边在运行时的等价实现：
       不新开烘焙描边通道 —— 把 59 件家具重新烘一条会把地图迭代锁死，运行时轮廓对地图改动免疫。
       缓存按「贴图 + 屏幕尺寸 + 线宽」为键，只在缩放/尺寸变化时重建。 */
    const OUTLINE={};
    function coverOutline(im,w,h,px){
      const key=(im.src||'')+'|'+Math.round(w)+'x'+Math.round(h)+'|'+px;
      if(Object.prototype.hasOwnProperty.call(OUTLINE,key))return OUTLINE[key];
      const pad=px*2+2;
      const W=Math.max(8,Math.round(w)+pad*2), H=Math.max(8,Math.round(h)+pad*2);
      const base=document.createElement('canvas');base.width=W;base.height=H;
      base.getContext('2d').drawImage(im,pad,pad,w,h);
      const dil=document.createElement('canvas');dil.width=W;dil.height=H;
      const dg=dil.getContext('2d');
      for(let a=0;a<8;a++){
        const ang=a*Math.PI/4;
        dg.drawImage(base,Math.cos(ang)*px,Math.sin(ang)*px);
      }
      dg.globalCompositeOperation='destination-out';
      dg.drawImage(base,0,0);                       /* 挖掉本体 → 只剩外环 */
      dg.globalCompositeOperation='source-in';
      dg.fillStyle='#FF4B3E';                       /* 环染色：任务红 */
      dg.fillRect(0,0,W,H);
      const rec={c:dil,pad:pad};
      OUTLINE[key]=rec;
      return rec;
    }
    function drawTaskCoverFlash(cov,alpha){
      const s=VIEW.s;
      const x0=SX(cov.x+cov.w/2), y1=SY(cov.y+cov.h);
      const im=IMG['fu_'+furnSprite(cov.kind)];
      if(ready(im)){
        /* 红框按掩体矩形（家具占地）描边，不再按精灵宽高比缩放——
           货架这类高瘦家具（1.4×6.9）配方正精灵时，旧算法只框到底部一小段，
           任务点（常在货架中部）飘在框外，看起来"任务和红框离得远"。 */
        const w=cov.w*s, h=cov.h*s;
        const lay=coverOutline(im,w,h,Math.max(2,Math.round(s*0.11)));
        ctx.save();
        ctx.globalAlpha=Math.max(0,Math.min(1,alpha));
        ctx.globalCompositeOperation='lighter';
        ctx.drawImage(lay.c,x0-w/2-lay.pad,y1-h-lay.pad);
        ctx.restore();
        G.gfx.coverFlashes++;
        return;
      }
      const x=SX(cov.x+cov.w/2),y=SY(cov.y+cov.h/2);
      const rr=(Math.max(cov.w,cov.h)/2+0.5)*s;
      const rad=ctx.createRadialGradient(x,y,0,x,y,rr);
      rad.addColorStop(0,'rgba(255,75,62,'+alpha.toFixed(2)+')');
      rad.addColorStop(1,'rgba(255,75,62,0)');
      ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y,rr,0,7);ctx.fill();
    }

    /* 本人任务标记：画在迷雾之上，当前任务带名称，其余剩余任务只留金色脉冲 */
    function drawTaskMarkers(T,myLeft){
      if(!myLeft||!myLeft.length)return;
      const s=VIEW.s;
      for(let k=0;k<myLeft.length;k++){
        const p=M.points[myLeft[k]]; if(!p)continue;
        const x=SX(p.x),y=SY(p.y),cur=k===0&&!G.designMode;
        const pulse=0.5+0.35*(0.5+0.5*Math.sin(T*(cur?5.5:3.5)+p.x));
        const rad=ctx.createRadialGradient(x,y,0,x,y,(cur?1.15:0.85)*s);
        rad.addColorStop(0,'rgba(255,75,62,'+(cur?0.16:0.08)+')');
        rad.addColorStop(1,'rgba(255,75,62,0)');
        ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y,(cur?1.15:0.85)*s,0,7);ctx.fill();
        /* 2026-11-06 掩体重构：新布局按 R4「任务点 2.5 格内有道具」排，
           道具不再必然压住任务点 —— 找不到压住的掩体时退到**同舱 2.5 格内最近的一件**，
           否则「掩体本体脉冲」会退化成虚线圆圈（玩家看到的提示方式不一致）。 */
        let cov=M.cover.find(c=>p.x>=c.x-.25&&p.x<=c.x+c.w+.25&&p.y>=c.y-.25&&p.y<=c.y+c.h+.25);
        if(!cov){
          let best=1e9;
          for(const c of M.cover){
            if(c.room!==p.room)continue;
            const dx=Math.max(c.x-p.x,p.x-(c.x+c.w),0);
            const dy=Math.max(c.y-p.y,p.y-(c.y+c.h),0);
            const d=Math.hypot(dx,dy);
            if(d<best&&d<=2.5){best=d;cov=c;}
          }
        }
        ctx.save();
        if(cov){
          /* 红色包边：当前任务强呼吸（0.55~0.95），其余任务弱呼吸，避免全场都在闪 */
          drawTaskCoverFlash(cov,cur?0.55+0.40*pulse:0.16+0.14*pulse);
        }else{
          G.gfx.dashedBorders++;
          ctx.strokeStyle='rgba(255,75,62,'+(cur?0.92*pulse+0.08:0.42).toFixed(2)+')';
          ctx.lineWidth=cur?2.4:1.6;ctx.setLineDash([5,4]);ctx.lineDashOffset=-T*14;
          ctx.beginPath();ctx.arc(x,y,(cur?0.95:0.62)*s,0,7);ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle='rgba(255,205,60,.95)';
        ctx.beginPath();ctx.arc(x,y,cur?3.2:2.2,0,7);ctx.fill();
        ctx.restore();
        if(cur){
          const label='任务 · '+p.label;
          ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
          const w=ctx.measureText(label).width+16,ly=y-1.35*s;
          ctx.fillStyle='rgba(30,22,6,.88)';
          ctx.beginPath();ctx.roundRect(x-w/2,ly-9,w,18,5);ctx.fill();
          ctx.strokeStyle='rgba(255,205,60,.7)';ctx.lineWidth=1;ctx.stroke();
          ctx.fillStyle='#FFE8B0';ctx.fillText(label,x,ly+0.5);
        }
      }
    }

    /* 刀者红身：把行走图整张染红后按帧复用，避免每帧重绘 */
    const TINT_SHEETS={};
    function tintedSheet(im){
      if(!im||!im.src)return null;
      const hit=TINT_SHEETS[im.src];
      if(hit)return hit;
      try{
        const c=document.createElement('canvas');
        c.width=im.naturalWidth||im.width;
        c.height=im.naturalHeight||im.height;
        const g=c.getContext('2d');
        g.drawImage(im,0,0);
        g.globalCompositeOperation='source-atop';
        g.fillStyle='rgba(255,38,28,0.62)';
        g.fillRect(0,0,c.width,c.height);
        TINT_SHEETS[im.src]=c;
        return c;
      }catch(e){return null;}
    }

    function draw(dt){
      G=R.getG(); if(!G)return;
      if(R.getDpr)dpr=R.getDpr();
      const T=(G.paused&&G.pauseT)?G.pauseT:performance.now()/1000;
      const d=dt||1/60;
      if(G.camView){drawCams(T);return;}
      updateCamera();
      ctx.fillStyle='#07090D';ctx.fillRect(0,0,innerWidth,innerHeight);
      const me=G.me;
      const base=rtImg('base');
      const hull=rtImg('hull');
      if(mapReady(hull)){
        ctx.drawImage(hull,SX(0),SY(0),M.bounds.w*VIEW.s,M.bounds.h*VIEW.s);
        if(G.lightState===2){ctx.fillStyle='rgba(4,7,11,.45)';ctx.fillRect(SX(0),SY(0),M.bounds.w*VIEW.s,M.bounds.h*VIEW.s);}
      }
      if(mapReady(base)){
        ctx.drawImage(base,SX(0),SY(0),M.bounds.w*VIEW.s,M.bounds.h*VIEW.s);
        for(const r of M.rooms){
          if(G.lit[r.id])continue;
          ctx.beginPath();
          r.poly.forEach((p,i)=>i?ctx.lineTo(SX(p[0]),SY(p[1])):ctx.moveTo(SX(p[0]),SY(p[1])));
          ctx.closePath();
          ctx.fillStyle='rgba(3,6,11,.55)';ctx.fill();
        }
      }else drawLegacyMap();
      drawCorridorLights(T);
      drawFacilities(T);
      drawPipes(T);
      drawReqTable(T);
      drawDoors(T);
      /* 自己的任务：设计者模式 26 点全算自己的（地面暗点分支自然一个都不剩） */
      const myLeft=G.designMode?M.points.map((p,i)=>i):me.tasks.slice(me.tIdx);
      paintRoomLabels();
      paintTaskDots(myLeft);
      paintDamageAlerts(T);
      /* 玩家异形的破坏目标：紫色虚线指引到舱室 */
      if(me.alien&&me.alive&&!me.sabUsed&&G.sabTarget){
        const t=G.sabTarget;
        ctx.save();
        ctx.strokeStyle='rgba(168,150,255,'+(0.4+0.3*Math.sin(T*4)).toFixed(2)+')';
        ctx.lineWidth=2;ctx.setLineDash([7,6]);ctx.lineDashOffset=-T*16;
        ctx.beginPath();ctx.arc(SX(t.x),SY(t.y),1.9*VIEW.s,0,7);ctx.stroke();
        ctx.restore();
        ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.lineWidth=3;ctx.strokeStyle='rgba(10,6,20,.85)';
        ctx.strokeText('目标 · '+roomNameById(t.room),SX(t.x),SY(t.y)-2.3*VIEW.s);
        ctx.fillStyle='#C9BCFF';ctx.fillText('目标 · '+roomNameById(t.room),SX(t.x),SY(t.y)-2.3*VIEW.s);
      }
      // 靠近可交互物：W 收集所有选项，多项时提示打开交互轮盘
      if(!G.spectMode&&me.alive&&!me.downed&&!me.detained&&me.doing<=0&&!G.meet&&!G.over){
        const items=collectInteractions(me);
        const np=nearPoint(me);
        const npMine=!!(np&&myLeft.indexOf(M.points.indexOf(np))>=0);
        if(items.length){
          const nearItem=items.slice().sort((a,b)=>
            Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0];
          const label=items.length>1?('[W] 选择交互 · '+items.length+' 项'):items[0].pill;
          pill(label,SX(nearItem.x),SY(nearItem.y)-2.4*VIEW.s,nearItem.accent,nearItem.fg);
        }else{
          let bot=null,bp=null,botD=1.7;
          for(const f of M.facility){
            if(f.kind!=='medbot'&&f.kind!=='secbot')continue;
            const q=botPos(f.kind); if(!q)continue;
            const d=Math.hypot(q.x-me.x,q.y-me.y);
            if(d<botD){botD=d;bot=f;bp=q;}
          }
          if(bot){
            const dead=bot.kind==='secbot'?G.secbotDead:G.medbotDead;
            pill((bot.kind==='secbot'?'保安机器人':'医疗无人机')+(dead?' · 停摆':' · 在线'),
              SX(bp.x),SY(bp.y)-2.4*VIEW.s,
              dead?'rgba(120,130,145,.5)':'rgba(63,191,140,.7)',dead?'#8A94A3':'#9FE8C6');
          }else if(np&&!npMine){
            pill('设备没有响应',SX(np.x),SY(np.y)-2.4*VIEW.s,'rgba(120,130,145,.5)','#8A94A3');
          }
        }
      }
      // 尸体提示：报告 / 搜尸 / 拖拽 / 施救
      if(!G.spectMode&&me.alive&&!me.downed&&!G.meet&&!G.over&&me.doing<=0){
        const nb=bodyNear(2.2);
        if(nb){
          const bp=bodyPos(nb);
          if(bp&&visibleAt(bp[0],bp[1])){
            const lbl=nb.alive?'[R] 报告 · [S] 查看伤情 · [D] 收尸 · [F] 施救':'[R] 报告 · [S] 搜尸取物资 · [D] 收尸';
            pill(lbl,SX(bp[0]),SY(bp[1])-1.15*VIEW.s,'rgba(255,176,32,.85)','#FFE0A3');
          }
        }
      }
      // 点击地面提示：一个扩散的圈
      if(G.clickFx){
        G.clickFx.t-=d;
        if(G.clickFx.t<=0)G.clickFx=null;
        else if(G.clickFx.bad){
          /* 禁止符号（2026-11-02）：红色圆圈 + 斜杠，在点击处淡出 —— 
             给"点错了"一个明确的、不需要读字的反馈。 */
          const k=1-G.clickFx.t/0.62, a2=Math.max(0,1-k);
          const x=SX(G.clickFx.x),y=SY(G.clickFx.y),rr=(0.42+0.30*k)*VIEW.s;
          ctx.save();
          ctx.globalAlpha=a2;
          ctx.strokeStyle='#FF6B61';ctx.lineWidth=Math.max(2,0.09*VIEW.s);
          ctx.beginPath();ctx.arc(x,y,rr,0,7);ctx.stroke();
          const dd=rr*0.72;
          ctx.beginPath();ctx.moveTo(x-dd,y-dd);ctx.lineTo(x+dd,y+dd);ctx.stroke();
          ctx.restore();
        }else{
          const k=1-G.clickFx.t/0.55, r=(0.35+0.75*k)*VIEW.s;
          ctx.strokeStyle='rgba(240,198,116,'+(0.7*(1-k)).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.ellipse(SX(G.clickFx.x),SY(G.clickFx.y),r,r*0.55,0,0,7);ctx.stroke();
        }
      }
      // 尸体 / 濒死者：躺倒的行走图 + 血泊（先画，活人叠在上面）
      TAG_RECTS=[];
      G.gfx.crewDrawn=0;   // 本帧画了几个角色：设计者模式必须恒为 0（门禁读它）
      if(!G.designMode)for(const a of G.agents){
        const bp=bodyPos(a); if(!bp)continue;
        if(!visibleAt(bp[0],bp[1]))continue;
        const x=SX(bp[0]),y=SY(bp[1]);
        ctx.fillStyle=a.alive?'rgba(150,26,26,.30)':'rgba(110,12,12,.42)';
        ctx.beginPath();ctx.ellipse(x,y,0.62*VIEW.s,0.34*VIEW.s,0,0,7);ctx.fill();
        const im=IMG['cr_'+((a.i%15)+1)];
        if(ready(im)){
          const w=1.05*VIEW.s,h=w*160/96;
          ctx.save();ctx.translate(x,y);ctx.rotate(-Math.PI/2);
          ctx.globalAlpha=a.alive?0.92:0.62;
          ctx.drawImage(im,0,2*160,96,160,-w/2,-h/2,w,h);
          ctx.restore();ctx.globalAlpha=1;
        }
        if(a.alive){
          const k=0.5+0.5*Math.sin(T*6);
          ctx.strokeStyle='rgba(224,87,79,'+(0.45+0.4*k).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,0.68*VIEW.s,0,7);ctx.stroke();
        }else{
          ctx.strokeStyle='rgba(200,210,225,.28)';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(x,y,0.7*VIEW.s,0,7);ctx.stroke();
        }
        if(!G.dev)drawNameTag(a,x,y-0.62*VIEW.s,!G.spectMode&&a.i===G.me.i);
        if(a.act&&a.act.kind==='hurt'){
          const hk=1-Math.max(0,a.act.t)/a.act.dur;
          ctx.strokeStyle='rgba(255,90,80,'+(0.8*hk).toFixed(2)+')';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(x,y,(0.55+0.8*(1-hk))*VIEW.s,0,7);ctx.stroke();
        }
      }
      // 活人：真实行走图
      if(!G.designMode)for(const a of G.agents){
        if(!a.alive||a.downed)continue;
        if(a!==me&&!canSee(a))continue;
        G.gfx.crewDrawn++;
        const im=IMG['cr_'+((a.i%15)+1)];
        const off=actOffset(a);
        const acting=a.act&&(a.act.kind==='stab'||a.act.kind==='shoot');
        /* 脚下软阴影：把 3D 渲染的角色压进地毯/钢板上，不然像贴纸 */
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,.34)';
        ctx.beginPath();ctx.ellipse(SX(a.x),SY(a.y),0.42*VIEW.s,0.15*VIEW.s,0,0,7);ctx.fill();
        ctx.restore();
        if(ready(im)){
          const w=1.25*VIEW.s,h=w*160/96;
          const row=acting?rowForAng(a.act.ang):(a.moving?(ROW[a.dir]||0):2);
          const fr=a.moving?(Math.floor(T*7)%4):0;
          const bob=a.doing>0?Math.sin(T*11)*0.02*VIEW.s:0;
          const dx=SX(a.x)-w/2+(off?off.x:0);
          const dy=SY(a.y)-h*0.86+(off?off.y:0)+bob;
          ctx.drawImage(im,fr*96,row*160,96,160,dx,dy,w,h);
          if(a.redT>0){
            const tim=tintedSheet(im);
            const k=Math.min(1,a.redT/SKSanity.RED_BODY.dur);
            const pulse=0.5+0.35*(0.5+0.5*Math.sin(T*15+a.i));
            if(tim){
              ctx.save();
              ctx.globalAlpha=Math.min(0.86,(0.38+0.34*pulse)*(0.35+0.65*k));
              ctx.drawImage(tim,fr*96,row*160,96,160,dx,dy,w,h);
              ctx.restore();
            }
            const rg=ctx.createRadialGradient(SX(a.x),SY(a.y)-0.5*VIEW.s,0,SX(a.x),SY(a.y)-0.5*VIEW.s,1.15*VIEW.s);
            rg.addColorStop(0,'rgba(255,52,38,'+(0.18*k).toFixed(2)+')');
            rg.addColorStop(1,'rgba(255,52,38,0)');
            ctx.fillStyle=rg;
            ctx.beginPath();ctx.arc(SX(a.x),SY(a.y)-0.5*VIEW.s,1.15*VIEW.s,0,7);ctx.fill();
            ctx.strokeStyle='rgba(255,92,72,'+(0.45*k+0.2).toFixed(2)+')';ctx.lineWidth=1.6;
            ctx.beginPath();ctx.arc(SX(a.x),SY(a.y),0.62*VIEW.s,0,7);ctx.stroke();
          }
        }else{
          ctx.beginPath();ctx.arc(SX(a.x),SY(a.y),5,0,7);
          ctx.fillStyle=a===me?'#F0C674':'#8FA6C0';ctx.fill();
        }
        if(a.doing>0)drawWork(a,T);
        drawWeapon(a,T);
        /* 异形玩家：出刀射程红色虚线半圆（与 inKnifeArc 同源：前方 REACH.knife 格、±90° + losNow）。
           只给玩家自己看，人类玩家不画，避免把“谁有刀”泄露给不该知道的人。 */
        if(a===me&&!G.spectMode&&a.alien&&a.knife>0){
          G.gfx.knifeRings++;
          const kr=SKSanity.REACH.knife||1.5, a0=shotAimAng(a), N=24;
          ctx.save();
          ctx.beginPath();ctx.moveTo(SX(a.x),SY(a.y));
          for(let i=0;i<=N;i++){
            const ang=a0-Math.PI/2+Math.PI*i/N;
            let t=kr;
            for(let st=0.2;st<=kr;st+=0.2){
              const px=a.x+Math.cos(ang)*st, py=a.y+Math.sin(ang)*st;
              if(!losNow(a.x,a.y,px,py)){t=st;break;}
            }
            ctx.lineTo(SX(a.x+Math.cos(ang)*t),SY(a.y+Math.sin(ang)*t));
          }
          ctx.closePath();
          ctx.fillStyle='rgba(224,87,79,.08)';ctx.fill();
          ctx.setLineDash([6,5]);ctx.lineDashOffset=-T*20;
          ctx.strokeStyle='rgba(224,87,79,'+(0.42+0.14*(0.5+0.5*Math.sin(T*4))).toFixed(2)+')';
          ctx.lineWidth=1.5;
          ctx.stroke();
          ctx.restore();
        }
        if(!G.dev){
          const topY=SY(a.y)-(ready(im)?(1.25*VIEW.s*160/96)*0.86:0)-9;
          drawNameTag(a,SX(a.x),topY,!G.spectMode&&a===me);
        }
        if(a===me&&!G.spectMode){ctx.strokeStyle='rgba(240,198,116,.7)';ctx.lineWidth=1.4;
          ctx.beginPath();ctx.arc(SX(a.x),SY(a.y),11,0,7);ctx.stroke();}
      }
      // 幽灵：半透明 + 青色光晕（活人看不见，幽灵与 DEV 看得见）
      if(!G.designMode)for(const a of G.agents){
        if(a.alive||!a.ghost)continue;
        if(a!==me&&me.alive&&!G.dev)continue;
        const x=SX(a.x),y=SY(a.y);
        const gs=ghostGlow();
        ctx.drawImage(gs,x-1.5*VIEW.s,y-0.4*VIEW.s-1.5*VIEW.s,3*VIEW.s,3*VIEW.s);
        const im=IMG['cr_'+((a.i%15)+1)];
        if(ready(im)){
          const w=1.15*VIEW.s,h=w*160/96;
          ctx.save();
          ctx.globalAlpha=0.28+0.06*Math.sin(T*2.2+a.i);
          const fr=Math.floor(T*3+a.i)%4;
          ctx.drawImage(im,fr*96,2*160,96,160,x-w/2,y-h*0.86,w,h);
          ctx.restore();
        }
        if(a.doing>0)drawWork(a,T,true);
        if(!G.dev)drawNameTag(a,x,y-(ready(im)?(1.15*VIEW.s*160/96)*0.86:0)-9,!G.spectMode&&a===me);
        ctx.strokeStyle='rgba(127,211,240,.5)';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.arc(x,y,0.62*VIEW.s,0,7);ctx.stroke();
        if(a===me){
          ctx.strokeStyle='rgba(127,211,240,.8)';ctx.lineWidth=1.6;
          ctx.beginPath();ctx.arc(x,y,1.1*VIEW.s,0,7);ctx.stroke();
        }
      }
      /* 旁观者：第 16 人，只是一台相机幽灵（不参与对局、不进 15 席位） */
      if(G.spectMode&&G.spect){
        const sp=G.spect, x=SX(sp.x), y=SY(sp.y);
        const rad=ctx.createRadialGradient(x,y-0.4*VIEW.s,0,x,y-0.4*VIEW.s,1.6*VIEW.s);
        rad.addColorStop(0,'rgba(127,211,240,.22)');rad.addColorStop(1,'rgba(127,211,240,0)');
        ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y-0.4*VIEW.s,1.6*VIEW.s,0,7);ctx.fill();
        ctx.save();
        ctx.strokeStyle='rgba(127,211,240,.85)';ctx.lineWidth=1.6;
        ctx.beginPath();ctx.arc(x,y,0.5*VIEW.s,0,7);ctx.stroke();
        ctx.beginPath();ctx.arc(x,y-0.62*VIEW.s,0.26*VIEW.s,0,7);ctx.stroke();
        ctx.restore();
        const txt='旁观者';
        ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
        const w=ctx.measureText(txt).width+14;
        ctx.fillStyle='rgba(8,14,20,.85)';
        ctx.beginPath();ctx.roundRect(x-w/2,y-1.55*VIEW.s-9,w,18,5);ctx.fill();
        ctx.strokeStyle='rgba(127,211,240,.6)';ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle='#BFE9F7';ctx.fillText(txt,x,y-1.55*VIEW.s);
      }
      /* 设计者位置标记：人物模型不绘制，全图镜头下需要一个"我在哪"的参照。
         这是光标不是角色 —— 固定像素大小，缩到整船也看得见（不随 VIEW.s 缩小）。 */
      if(G.designMode){
        const x=SX(me.x),y=SY(me.y);
        ctx.save();
        ctx.strokeStyle='rgba(99,224,168,.9)';ctx.lineWidth=1.6;
        ctx.beginPath();ctx.arc(x,y,9,0,7);ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x-14,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+14,y);
        ctx.moveTo(x,y-14);ctx.lineTo(x,y-5);ctx.moveTo(x,y+5);ctx.lineTo(x,y+14);
        ctx.stroke();
        ctx.fillStyle='rgba(99,224,168,.95)';
        ctx.beginPath();ctx.arc(x,y,2,0,7);ctx.fill();
        ctx.restore();
      }
      // 动作特效层（角色之上、雾之下）
      drawFx(d,T);
      // 拖拽绳：玩家与 AI 都能被看到；颜色不区分阵营，避免泄露异形身份
      for(const a of G.agents){
        if(a.drag==null)continue;
        if(a!==me&&!canSee(a))continue;
        const b=G.agents[a.drag],bp=b?bodyPos(b):null; if(!bp)continue;
        ctx.save();ctx.setLineDash([4,4]);
        ctx.strokeStyle=a===me?'rgba(240,198,116,.55)':'rgba(224,140,100,.42)';
        ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(SX(a.x),SY(a.y));ctx.lineTo(SX(bp[0]),SY(bp[1]));ctx.stroke();ctx.restore();
      }
      drawFog();
      /* 持有子弹时显示 8 格 60° 攻击范围锥（与视野解耦，画在迷雾之上） */
      if(!G.spectMode&&!G.designMode&&me.alive&&!me.downed&&(me.bullet|0)>0){
        const rad=SKSanity.SHOT.range||8, span=SKSanity.SHOT.cone||Math.PI/3;
        const a0=shotAimAng(me), N=28;
        ctx.save();
        ctx.beginPath();ctx.moveTo(SX(me.x),SY(me.y));
        for(let i=0;i<=N;i++){
          const ang=a0-span/2+span*i/N;
          let t=rad;
          for(let st=0.2;st<=rad;st+=0.25){
            const px=me.x+Math.cos(ang)*st, py=me.y+Math.sin(ang)*st;
            if(!losNow(me.x,me.y,px,py)){t=st;break;}
          }
          ctx.lineTo(SX(me.x+Math.cos(ang)*t),SY(me.y+Math.sin(ang)*t));
        }
        ctx.closePath();
        ctx.fillStyle='rgba(240,198,116,.09)';ctx.fill();
        ctx.strokeStyle='rgba(240,198,116,.48)';ctx.lineWidth=1.4;ctx.setLineDash([5,4]);
        ctx.stroke();
        ctx.restore();
      }
      /* 本人任务点画在雾之上：夜里/隔墙也能看到目标舱室与设备位置 */
      drawTaskMarkers(T,G.spectMode?[]:myLeft);
      /* 声纹画在雾之上：墙后的脚步/刀声也能看见方向 */
      drawWaves(d);
      // 受击红晕（命中反馈）
      if(me.act&&me.act.kind==='hurt'){
        const hk=1-Math.max(0,me.act.t)/me.act.dur;
        const rg=ctx.createRadialGradient(innerWidth/2,innerHeight/2,Math.min(innerWidth,innerHeight)*0.22,
          innerWidth/2,innerHeight/2,Math.max(innerWidth,innerHeight)*0.72);
        rg.addColorStop(0,'rgba(180,20,20,0)');
        rg.addColorStop(1,'rgba(180,20,20,'+(0.5*hk).toFixed(2)+')');
        ctx.fillStyle=rg;ctx.fillRect(0,0,innerWidth,innerHeight);
      }
      /* 身份标签：DEV / 旁观是全知；**终结者时刻只公开"异形 / 人类"这一层**。
         尸体上的"凶手 X"属于额外的全知信息，仍然只在 DEV / 旁观出现（2026-11-03）。 */
      if(G.dev||G.spectMode||G.revealAll){
        const omniscient=!!(G.dev||G.spectMode);
        for(const a of G.agents){
          const y=SY(a.y)-(a.alive&&!a.downed?1.55:0.9)*VIEW.s;
          let txt=tagName(a)+(a.alien?' · 内鬼':' · 人类');
          if(!a.alive)txt+=' · 幽灵';
          else if(a.downed)txt+=' · 濒死';
          else if(a.detained)txt+=' · 被擒';
          const fg=a.alien?'#FF7B72':((!G.spectMode&&a===G.me)?'#F0C674':'#7FD3F0');
          const sp=labelSprite(txt,fg,'rgba(8,11,16,.82)');
          ctx.drawImage(sp.c,SX(a.x)-sp.w/2,y-sp.h/2,sp.w,sp.h);
          const bp=bodyPos(a);
          if(omniscient&&bp&&!a.alive){
            const by=SY(bp[1])+0.95*VIEW.s;
            const kt='尸体 · 凶手 '+(a.killedBy!=null?G.agents[a.killedBy].name:'?');
            const kp=labelSprite(kt,'#FF9A90','rgba(40,8,8,.85)');
            ctx.drawImage(kp.c,SX(bp[0])-kp.w/2,by-kp.h/2,kp.w,kp.h);
          }
        }
      }
      /* 全图模式本身已展示完整船体，再叠小地图会盖住右上角的监控室 */
      if(G.camMode!=='map') drawMini();
      if(G.msgT>0){G.msgT-=d;
        ctx.fillStyle='rgba(240,198,116,.95)';ctx.font='500 14px system-ui';ctx.textAlign='center';
        ctx.fillText(G.msg,innerWidth/2,innerHeight-56);}
      /* 大横幅：淡入 0.35s / 尾段 0.7s 淡出，中间实心可读 */
      if(G.banner&&G.banner.t>0){
        G.banner.t-=d;
        const b=G.banner;
        const fin=Math.min(1,(b.dur-b.t)/0.35);
        const fout=Math.min(1,Math.max(0,b.t)/0.7);
        const alpha=Math.max(0,Math.min(fin,fout));
        if(alpha>0.01){
          const cx=innerWidth/2, cy=innerHeight*0.30;
          ctx.save();
          ctx.globalAlpha=alpha;
          ctx.textAlign='center';ctx.textBaseline='middle';
          const w=Math.min(innerWidth-80,560), h=86;
          ctx.fillStyle='rgba(6,10,16,.86)';
          ctx.strokeStyle='rgba(240,198,116,.55)';ctx.lineWidth=1;
          ctx.beginPath();ctx.roundRect(cx-w/2,cy-h/2,w,h,12);ctx.fill();ctx.stroke();
          ctx.fillStyle='#F0C674';ctx.font='600 13px system-ui';
          ctx.fillText('TERMINATOR',cx,cy-h/2+24);
          ctx.fillStyle='#FFF3D0';ctx.font='600 26px system-ui';
          ctx.fillText(b.text,cx,cy+6);
          ctx.restore();
        }
        if(b.t<=0)G.banner=null;
      }
      // DEV 面板刷新（墙钟 0.5s；高刷屏不再按帧数误触发）
      if(G.dev){ const now=performance.now(); if(now-(G.devAt||0)>=500){ G.devAt=now; renderDevPanel(); } }
    }
    /* paintRoomLabels：draw 拆分（纯表现层，不碰判定） */
    function paintRoomLabels(){
    // 房名
    for(const r of M.rooms){
      const cx=r.label?r.label[0]:r.rect[0]+r.rect[2]/2;
      const cy=r.label?r.label[1]+1.2:r.rect[1]+r.rect[3]/2;
      ctx.font='500 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=3;ctx.strokeStyle=G.lit[r.id]?'rgba(255,255,255,.8)':'rgba(10,14,20,.75)';
      ctx.strokeText(r.name,SX(cx),SY(cy));
      ctx.fillStyle=G.lit[r.id]?'rgba(18,26,36,.85)':'rgba(150,158,170,.75)';
      ctx.fillText(r.name,SX(cx),SY(cy));
    }
    }
    /* paintTaskDots：draw 拆分（纯表现层，不碰判定） */
    function paintTaskDots(myLeft){
    // 任务点：他人的任务只留地面暗点；自己的任务标记画在迷雾之上（drawTaskMarkers）
    // myLeft 由调用方 draw 传入（设计者模式 26 点全算自己的，地面暗点分支自然一个都不剩）。
    for(const p of M.points){
      const idx=M.points.indexOf(p);
      if(myLeft.indexOf(idx)>=0)continue;
      ctx.beginPath();ctx.arc(SX(p.x),SY(p.y),2.2,0,7);
      ctx.fillStyle='rgba(120,130,145,.3)';ctx.fill();
    }
    }
    /* paintDamageAlerts：draw 拆分（纯表现层，不碰判定） */
    function paintDamageAlerts(T){
    /* 被破坏的设备：红色脉冲 + 倒计时，所有人都看得到（这是全船警报） */
    for(const dm of G.dmg){
      const a=0.42+0.4*(0.5+0.5*Math.sin(T*6.5));
      ctx.save();
      ctx.strokeStyle='rgba(255,90,78,'+a.toFixed(2)+')';ctx.lineWidth=2.4;
      ctx.setLineDash([5,4]);ctx.lineDashOffset=-T*20;
      ctx.beginPath();ctx.arc(SX(dm.x),SY(dm.y),1.7*VIEW.s,0,7);ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(SX(dm.x),SY(dm.y),0.55*VIEW.s,0,7);
      ctx.fillStyle='rgba(255,70,58,'+a.toFixed(2)+')';ctx.fill();
      ctx.restore();
      ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=3;ctx.strokeStyle='rgba(22,4,4,.9)';
      const s='故障 '+Math.max(0,Math.ceil(dm.left))+'s';
      ctx.strokeText(s,SX(dm.x),SY(dm.y)-2.2*VIEW.s);
      ctx.fillStyle='#FF9A90';ctx.fillText(s,SX(dm.x),SY(dm.y)-2.2*VIEW.s);
    }
    }
    /* 小地图：照蓝图风格重画 —— 房间轮廓 + 连接通道 + 舱室名 + 任务点图例 */
    /* 小地图静态层离屏缓存（2026-11-14）：公开依据 docs/ASSET_GOVERNANCE.md §14.4
       MDN「Pre-render similar primitives on an off-screen canvas」「Use multiple layered canvases」。
       静态蓝图（面板/网格/走廊/房间轮廓+中文短名/管道/任务点）只在尺寸、灯光三态、
       自身任务变化时重建；脉冲、故障、机器人巡逻位、相机点等动态标记仍每帧画。
       只改表现层，不碰任何判定 / 数值 / 事件。 */
    const MINI={key:'',c:null,w:0,h:0};
    function drawMini(target){
      const w=Math.min(300,Math.max(220,Math.round(innerWidth*0.19)));
      const k=w/M.bounds.w, mh=M.bounds.h*k;
      const padT=18, legH=22;
      const x=innerWidth-w-16, y=16, my=y+padT;
      const h=mh+padT+legH;
      const T=performance.now()/1000;
      const mine=G.spectMode?[]:G.me.tasks.slice(G.me.tIdx);
      const c=target||ctx;
      c.save();
      if(target){
      /* 面板 */
      c.fillStyle='rgba(7,12,18,.92)';c.strokeStyle='#33465C';c.lineWidth=1;
      c.beginPath();c.roundRect(x-6,y-6,w+12,h+12,8);c.fill();c.stroke();
      c.fillStyle='rgba(196,214,232,.7)';c.font='600 9.5px system-ui';
      c.textAlign='left';c.textBaseline='middle';
      /* 终结者时刻：小地图标题带上"你是谁"——身份已经公开，玩家不必再记
         （这里只标自己的阵营，**不透视别人的位置**：亮身份 ≠ 开全图）。 */
      c.fillText('船体蓝图'+(G.revealAll?(' · 你是'+(G.me.alien?'内鬼':'人类')):''),x,y+3);
      c.textAlign='right';c.fillStyle='rgba(120,138,158,.7)';
      c.fillText(M.bounds.w+' × '+M.bounds.h,x+w,y+3);
      /* 蓝图网格 */
      c.strokeStyle='rgba(110,140,170,.07)';c.lineWidth=.5;
      for(let gx=10;gx<M.bounds.w;gx+=10){
        c.beginPath();c.moveTo(x+gx*k,my);c.lineTo(x+gx*k,my+mh);c.stroke();
      }
      for(let gy=10;gy<M.bounds.h;gy+=10){
        c.beginPath();c.moveTo(x,my+gy*k);c.lineTo(x+w,my+gy*k);c.stroke();
      }
      /* 通道：先粗后细，像参考图里的浅灰走廊 */
      for(const cor of M.corridors){
        c.strokeStyle=G.corrLit?'rgba(176,192,208,.42)':'rgba(92,104,118,.30)';
        c.lineWidth=Math.max(3,CW*k*.92);c.lineCap='butt';c.lineJoin='round';
        c.beginPath();cor.pts.forEach((p,i)=>i?c.lineTo(x+p[0]*k,my+p[1]*k):c.moveTo(x+p[0]*k,my+p[1]*k));c.stroke();
        c.strokeStyle=G.corrLit?'rgba(220,234,246,.55)':'rgba(130,142,156,.22)';
        c.lineWidth=1;
        c.beginPath();cor.pts.forEach((p,i)=>i?c.lineTo(x+p[0]*k,my+p[1]*k):c.moveTo(x+p[0]*k,my+p[1]*k));c.stroke();
      }
      /* 房间轮廓：小地图空间有限，用短名 + 描边保证越界也读得清 */
      const SHORT={bridge:'会议室',warehouse:'仓库',ecosys:'生态舱',engine:'引擎',power:'配电',transit:'食堂',cam:'监控',med:'医疗',armory:'军械',fun:'娱乐'};
      for(const r of M.rooms){
        c.beginPath();
        r.poly.forEach((p,i)=>{const px=x+p[0]*k,py=my+p[1]*k; i?c.lineTo(px,py):c.moveTo(px,py);});
        c.closePath();
        const lit=G.lit[r.id];
        c.fillStyle=lit?'rgba(198,209,222,.86)':'rgba(48,57,69,.90)';c.fill();
        c.strokeStyle=lit?'rgba(240,247,255,.75)':'rgba(120,136,154,.55)';
        c.lineWidth=lit?1.1:.8;c.stroke();
        const lx=x+(r.label?r.label[0]:r.rect[0]+r.rect[2]/2)*k;
        const ly=my+(r.label?r.label[1]:r.rect[1]+r.rect[3]/2)*k;
        const nm=SHORT[r.id]||r.name;
        c.font='600 '+Math.max(7,Math.round(k*2.5))+'px system-ui';
        c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
        c.strokeStyle=lit?'rgba(236,243,250,.92)':'rgba(7,12,18,.88)';
        c.lineWidth=1.6;c.strokeText(nm,lx,ly);
        c.fillStyle=lit?'#1D2632':'rgba(190,204,220,.92)';
        c.fillText(nm,lx,ly);
      }
      /* 管道 / 静态设施 / 任务点（机器人巡逻位属动态层，见下） */
      for(const q of M.pipes){
        c.save();c.translate(x+q.x*k,my+q.y*k);c.rotate(Math.PI/4);
        c.fillStyle='rgba(168,150,255,.9)';c.fillRect(-1.8,-1.8,3.6,3.6);c.restore();
      }
      for(const f of M.facility){
        if(f.kind==='medbot'||f.kind==='secbot')continue;
        c.fillStyle=f.kind==='breaker'?'#E0A94B':'#3FBF8C';
        c.beginPath();c.arc(x+f.x*k,my+f.y*k,1.8,0,7);c.fill();
      }
      for(const p of M.points){
        const idx=M.points.indexOf(p), isMine=mine.indexOf(idx)>=0;
        const hard=p.kind==='hard';
        if(!isMine){
          c.fillStyle=hard?'rgba(224,87,79,.22)':'rgba(77,143,209,.22)';
          c.beginPath();c.arc(x+p.x*k,my+p.y*k,1.1,0,7);c.fill();
          continue;
        }
        c.fillStyle=hard?'#E0574F':'#5AA7EE';
        c.beginPath();c.arc(x+p.x*k,my+p.y*k,2.0,0,7);c.fill();
        c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=.8;
        c.beginPath();c.arc(x+p.x*k,my+p.y*k,2.9,0,7);c.stroke();
      }
      c.restore();return;
      }
      /* 每帧只贴缓存；key 变了才重建（灯光三态 / 自身任务 / 窗口尺寸 / dpr） */
      const key=[w,dpr,G.corrLit?1:0,M.rooms.map(r=>G.lit[r.id]?1:0).join(''),G.spectMode?1:0,mine.join(',')].join('|');
      if(MINI.key!==key||!MINI.c){
        const cc=document.createElement('canvas'),cw=w+12,ch=h+12;
        cc.width=Math.ceil(cw*dpr);cc.height=Math.ceil(ch*dpr);
        const o=cc.getContext('2d');
        o.setTransform(dpr,0,0,dpr,-(x-6)*dpr,-(y-6)*dpr);
        drawMini(o);
        MINI.key=key;MINI.c=cc;MINI.w=cw;MINI.h=ch;
      }
      ctx.drawImage(MINI.c,x-6,y-6,MINI.w,MINI.h);
      /* 机器人巡逻位：坐标每帧变，不能进静态缓存 */
      for(const f of M.facility){
        if(f.kind!=='medbot'&&f.kind!=='secbot')continue;
        const bp=botPos(f.kind);
        ctx.fillStyle='#3FBF8C';
        ctx.beginPath();ctx.arc(x+(bp?bp.x:f.x)*k,my+(bp?bp.y:f.y)*k,1.8,0,7);ctx.fill();
      }
      /* 待领申请单：小地图上给圆桌一个金色脉冲，跑图时不用找 */
      if(!G.spectMode&&G.me.qualPending>0){
        const q=roundTableClaimSpot();
        if(q){
          const pu=0.45+0.35*(0.5+0.5*Math.sin(T*5));
          ctx.strokeStyle='rgba(240,198,116,'+pu.toFixed(2)+')';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(x+q.x*k,my+q.y*k,3.4+1.2*Math.sin(T*5),0,7);ctx.stroke();
          ctx.fillStyle='#F0C674';
          ctx.beginPath();ctx.arc(x+q.x*k,my+q.y*k,1.7,0,7);ctx.fill();
        }
      }
      /* 故障：小地图上也给红点，跑图时不用记房间 */
      for(const dm of G.dmg){
        const pu=0.55+0.35*(0.5+0.5*Math.sin(T*6));
        ctx.fillStyle='rgba(255,90,78,'+pu.toFixed(2)+')';
        ctx.beginPath();ctx.arc(x+dm.x*k,my+dm.y*k,2.4,0,7);ctx.fill();
        ctx.strokeStyle='rgba(255,190,180,.9)';ctx.lineWidth=.8;
        ctx.beginPath();ctx.arc(x+dm.x*k,my+dm.y*k,3.6,0,7);ctx.stroke();
      }
      /* DEV / 终结者时刻 / 经典局最后一名异形透视可见的其他席位（设计者模式连蓝图上的人点也不画） */
      if((G.dev||G.terminator||(!G.spectMode&&lastAlienEvo(G.me)))&&!G.designMode){
        for(const a of G.agents){
          if(a===G.me)continue;
          if(!G.dev&&!a.alive)continue;
          const bp=bodyPos(a);
          ctx.fillStyle=!a.alive?'rgba(127,211,240,.65)':(a.alien?'#E0574F':'#DDE3EC');
          ctx.beginPath();ctx.arc(x+(bp?bp[0]:a.x)*k,my+(bp?bp[1]:a.y)*k,1.7,0,7);ctx.fill();
        }
      }
      /* 自己 / 旁观相机：金色脉冲 */
      const focus=camFocus();
      const myx=x+focus.x*k, myy=my+focus.y*k;
      const pulse=0.45+0.3*(0.5+0.5*Math.sin(T*4.2));
      ctx.strokeStyle='rgba(240,198,116,'+pulse.toFixed(2)+')';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(myx,myy,5.5,0,7);ctx.stroke();
      ctx.fillStyle=G.spectMode?'#7FD3F0':(G.me.alive?'#F0C674':'#7FD3F0');
      ctx.beginPath();ctx.arc(myx,myy,2.6,0,7);ctx.fill();
      /* 图例 */
      const ly=y+h-7;
      ctx.font='500 8.5px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';
      let lx=x;
      const dot=(col)=>{ctx.fillStyle=col;ctx.beginPath();ctx.arc(lx,ly,2,0,7);ctx.fill();lx+=6;};
      const label=(t)=>{ctx.fillStyle='rgba(170,184,200,.9)';ctx.fillText(t,lx,ly);lx+=ctx.measureText(t).width+10;};
      dot('#E0574F');label('高难 2分');
      dot('#5AA7EE');label('普通 1分');
      ctx.save();ctx.translate(lx,ly);ctx.rotate(Math.PI/4);ctx.fillStyle='#A896FF';ctx.fillRect(-1.6,-1.6,3.2,3.2);ctx.restore();
      lx+=6;ctx.fillStyle='rgba(170,184,200,.9)';ctx.fillText('管道',lx,ly);
      ctx.restore();
    }

    /* 视野：幽灵/DEV 全知；活人 = 所在亮房 + 7 格手电锥 + 近身感知圈 */

    let FOG=null;
    function drawFog(){
      G=R.getG(); if(!G)return;
      if(!G.fogOn||!G.me.alive||G.dev||G.camMode==='map'||(!G.spectMode&&lastAlienEvo(G.me)))return;
      const me=G.me;
      if(!FOG||FOG.width!==cv.width||FOG.height!==cv.height){
        FOG=document.createElement('canvas');FOG.width=cv.width;FOG.height=cv.height;
      }
      const o=FOG.getContext('2d');
      if(!o)return;   /* 低内存设备拿不到全屏遮罩上下文：跳过迷雾，别让 draw() 每帧抛错 */
      o.setTransform(1,0,0,1,0,0);o.clearRect(0,0,FOG.width,FOG.height);
      o.setTransform(dpr,0,0,dpr,0,0);
      /* 迷雾分两段（2026-11-03 用户裁定："除舱室以外的地方要能看见"）：
         ① 整屏按 roomMask 铺满遮蔽（舱室维持原暗度 —— 没进去的舱室仍然是暗的）；
         ② 只在**未拉闸**时，把非舱室区域（走廊 + 船体背景）的遮蔽整体压到 corridorMask，
            再把每个舱室 poly 补暗回 roomMask。
         这样"勉强看得清路上有什么"落地成表现层，而 `visibleAt` 一个字节都没改：
         单位与尸体在进入迷雾之前就被 `canSee()` 裁掉了（见 drawAgents 与尸体分支），
         所以压淡遮蔽**不会**让人透雾可见，也不会给任何一方增加视野。
         断电（lightState===2）时第②步整体跳过 —— 这就是"前提是没拉闸"。 */
      const SM=(SKSanity.SIGHT.fog||{});
      const roomMask=SM.roomMask, corrMask=SM.corridorMask;
      o.fillStyle='rgba(4,6,10,'+roomMask+')';o.fillRect(0,0,innerWidth,innerHeight);
      if(G.lightState!==2&&corrMask<roomMask){
        /* destination-out 的 globalAlpha 由两个目标遮蔽反推，不写死魔法数 */
        o.globalCompositeOperation='destination-out';
        o.globalAlpha=1-corrMask/roomMask;
        o.fillStyle='#000';o.fillRect(0,0,innerWidth,innerHeight);
        o.globalAlpha=1;o.globalCompositeOperation='source-over';
        const keep=1-(1-roomMask)/(1-corrMask);
        o.fillStyle='rgba(4,6,10,'+keep.toFixed(3)+')';
        for(const r of M.rooms){
          o.beginPath();r.poly.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));
          o.closePath();o.fill();
        }
      }
      o.globalCompositeOperation='destination-out';
      const r=roomAt(me.x,me.y);
      if(r&&G.lit[r.id]){
        o.beginPath();r.poly.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));o.closePath();o.fill();
        for(const c of M.corridors){
          if((c.a===r.id||c.b===r.id)&&G.corrLit){
            o.strokeStyle='#000';o.lineWidth=CW*VIEW.s;o.lineCap='butt';
            o.beginPath();c.pts.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));o.stroke();
          }
        }
      }
      /* 未断电时走廊默认有灯：站在亮走廊里整条揭开（与 visibleAt 的亮区规则一致），
         不再只给自己脚下点一盏 4.6 格的小灯。 */
      const meCorr=!r&&G.corrLit?inCorr(me.x,me.y):null;
      if(meCorr){
        o.strokeStyle='#000';o.lineWidth=CW*VIEW.s;o.lineCap='butt';
        o.beginPath();meCorr.pts.forEach((p,i)=>i?o.lineTo(SX(p[0]),SY(p[1])):o.moveTo(SX(p[0]),SY(p[1])));o.stroke();
      }
      /* 视野孔：手电锥（人与异形同款 7 格 / 60°）+ 近身感知圈
         （人类暗处 2.8 格，异形暗处 3.5 格）。异形不再有全向远视野。
         站在亮舱/亮走廊里时整片已经揭开，不再叠自己的手电锥——那只会在门口拖出一块
         跟着鼠标转的亮楔形，是噪声不是信息。 */
      const ax=me.x,ay=me.y;
      if(!(r&&G.lit[r.id])&&!meCorr){
        const a0=Math.atan2(G.aimY-ay,G.aimX-ax);
        const punch=(rad,span)=>{
          const N=span>=Math.PI*2?56:40;
          o.beginPath();o.moveTo(SX(ax),SY(ay));
          for(let i=0;i<=N;i++){
            const ang=a0-span/2+span*i/N;
            let t=rad;
            for(let st=0.25;st<rad;st+=0.25){
              const px=ax+Math.cos(ang)*st,py=ay+Math.sin(ang)*st;
              if(!losNow(ax,ay,px,py)){t=st;break;}
            }
            o.lineTo(SX(ax+Math.cos(ang)*t),SY(ay+Math.sin(ang)*t));
          }
          o.closePath();o.fill();
        };
        punch(HUMAN_LIGHT_R,Math.PI/3);
        punch(me.alien?ALIEN_DARK_R:HUMAN_DARK_R,Math.PI*2);
        o.beginPath();o.arc(SX(ax),SY(ay),1.5*VIEW.s,0,7);o.fill();
      }
      o.globalCompositeOperation='source-over';
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(FOG,0,0);ctx.restore();
    }
    return {
      draw: draw,
      drawFog: drawFog,
      drawMini: drawMini,
      botLabelText: botLabelText,
      resetPat: function () { PAT = {}; }
    };
  }

  global.SKRender = { create: create };
})(window);
