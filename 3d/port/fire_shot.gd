# @src js/game.js:8306 fireShot(shooter,target)
# 移植规则：先逐行抄下面原文，再一条条落到 GDScript。
# 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。
# --- 2.5D 原文（逐字，含缩进）---
#   function fireShot(shooter,target){
#         if(!shooter||!target||!target.alive||target.downed)return false;
#         if(shooter.bullet<1)return false;
#         shooter.bullet--;
#         if(G.simMode&&G.simStats){
#           G.simStats.shots++;
#           if(shooter.alien)G.simStats.alienShots++; else G.simStats.humanShots++;
#         }
#         G.pendingCrime=shooter.i;
#         if(!G.spectMode&&target===G.me&&G.dev){
#           const ang=Math.atan2(target.y-shooter.y,target.x-shooter.x);
#           setAct(shooter,'shoot',0.5,{ang});
#           G.fx.push({type:'shield',x:target.x,y:target.y,t:0.6,dur:0.6});
#           if(shooter!==G.me){shooter.target=null;shooter.path=null;}
#           toast('DEV 无敌：这一枪没有生效');
#           return false;
#         }
#         const ang=Math.atan2(target.y-shooter.y,target.x-shooter.x);
#         setAct(shooter,'shoot',0.55,{ang});
#         setAct(target,'hurt',0.55,{ang});
#         G.fx.push({type:'tracer',x1:shooter.x,y1:shooter.y,x2:target.x,y2:target.y,t:0.45,dur:0.45,ang});
#         G.fx.push({type:'muzzle',x:shooter.x+Math.cos(ang)*0.55,y:shooter.y+Math.sin(ang)*0.55,t:0.2,dur:0.2,ang});
#         G.fx.push({type:'impact',x:target.x,y:target.y,t:0.55,dur:0.55});
#         G.fx.push({type:'blood',x:target.x,y:target.y,t:0.9,dur:0.9,ang});
#         SND.shot(SND.volAt(shooter.x,shooter.y,0.95));
#         SND.flesh(SND.volAt(target.x,target.y,0.5));
#         hear(shooter.x,shooter.y,'shot',1.15);
#         target.downed=true; target.downAt=G.t; target.path=null; target.doing=0;
#         target.downSeq=(target.downSeq||0)+1;   /* 同上：每次倒下都是新一次"发现" */
#         target._doing=null; target._sv=null;
#         target.downX=target.x; target.downY=target.y; target.killedBy=shooter.i;
#         /* 开枪把人放倒同样给异形加速（与出刀同一个授予入口、同一条 alienOnly 规则） */
#         killRushStart(shooter);
#         target.woundCause='shot'; target.downRoom=roomIdAt(target.x,target.y);
#         target.searched=false;
#         logEvent('shoot',{actor:shooter.i,victim:target.i,room:target.downRoom,
#           x:+target.x.toFixed(1),y:+target.y.toFixed(1)});
#         noticeAction(shooter,shooter.x,shooter.y,7,'shot',target);
#         aiHear('shot',shooter.x,shooter.y,20,{actor:shooter,victim:target});
#         screamFor(target);
#         if(!G.spectMode&&target===G.me){closeSabPick(true);G.sabTarget=null;toast('你被击中，濒死');}
#         else if(!G.spectMode&&shooter===G.me) toast('开枪击中 '+target.name);
#         return true;
#       }

func fire_shot():
	# TODO 逐行移植（对照上面的原文，一条一条勾）
	return null
