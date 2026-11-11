# @src js/game.js:4226 knife(killer,victim)
# 移植规则：先逐行抄下面原文，再一条条落到 GDScript。
# 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。
# --- 2.5D 原文（逐字，含缩进）---
#   function knife(killer,victim){
#         if(!killer||killer.knife<1)return;
#         if(!victim||!victim.alive||victim.downed)return;
#         const ang=Math.atan2(victim.y-killer.y,victim.x-killer.x);
#         /* 危险行为先记账：即使 DEV 免伤/未造成濒死，保安也能据此反制 */
#         G.pendingCrime=killer.i;
#         /* 先扣刀再进 DEV 免伤分支：否则 AI 对 DEV 玩家能无限连刀，刀数永远用不掉
#            （与「DEV 免伤也必须先扣子弹」同一口径） */
#         killer.knife--;
#         if(G.simMode&&G.simStats)G.simStats.knives++;
#         /* 1.5 秒红身：让目击者一眼认出刚出刀的人（纯表现，不改变判定） */
#         killer.redT=SKSanity.RED_BODY.dur;
#         if(!G.spectMode&&victim===G.me&&G.dev){
#           setAct(killer,'stab',0.32,{ang,lunge:0.38});
#           G.fx.push({type:'shield',x:victim.x,y:victim.y,t:0.6,dur:0.6});
#           if(killer&&killer!==G.me){killer.target=null;killer.path=null;}
#           toast('DEV 无敌：这一刀没有生效');
#           return;
#         }
#         /* 只响一次：单层刀风，不再叠 70ms 后的血肉声 */
#         SND.knife(SND.volAt(victim.x,victim.y,0.95));
#         SND.flesh(0.34);
#         hear(victim.x,victim.y,'knife',1.0);
#         setAct(killer,'stab',0.34,{ang,lunge:0.46});
#         setAct(victim,'hurt',0.6,{ang});
#         G.fx.push({type:'slash',x:victim.x,y:victim.y,t:0.5,dur:0.5,ang,by:killer.i});
#         G.fx.push({type:'blood',x:victim.x,y:victim.y,t:0.9,dur:0.9,ang});
#         victim.downed=true; victim.downAt=G.t;
#         victim.downSeq=(victim.downSeq||0)+1;   /* 倒下事件编号：报告一次性按它绑定 */
#         victim.downX=victim.x; victim.downY=victim.y; victim.killedBy=killer.i;
#         /* 异形记下自己刚放倒谁：稍后可能绕一圈再回来"发现"尸体，用会议拖时间 */
#         if(killer.alien){killer._killBody=victim.i;killer._killAt=evNow();killer._killDecided=false;}
#         /* 放倒即触发逃逸加速（只给异形；拖尸中不生效，见 moveSpeed 的次序） */
#         killRushStart(killer);
#         victim.woundCause='knife'; victim.downRoom=roomIdAt(victim.x,victim.y);
#         victim.searched=false;
#         logEvent('knife',{actor:killer.i,victim:victim.i,room:victim.downRoom,
#           x:+victim.x.toFixed(1),y:+victim.y.toFixed(1)});
#         victim.path=null; victim.doing=0; victim._doing=null; victim._sv=null;
#         witnessAlienAction(killer,victim.x,victim.y,6,'knife',victim);
#         aiHear('knife',victim.x,victim.y,14,{actor:killer,victim:victim});
#         screamFor(victim);
#         if(!G.spectMode&&victim===G.me){closeCams(true);closePipePick(true);closeSabPick(true);G.sabTarget=null;toast('你被出刀击倒，濒死');}
#       }

func knife():
	# TODO 逐行移植（对照上面的原文，一条一条勾）
	return null
