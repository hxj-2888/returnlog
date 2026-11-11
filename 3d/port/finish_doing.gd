# @src js/game.js:4335 finishDoing(a)
# 移植规则：先逐行抄下面原文，再一条条落到 GDScript。
# 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。
# --- 2.5D 原文（逐字，含缩进）---
#   function finishDoing(a){
#         const actor=!G.spectMode&&a===G.me;
#         if(a._doing==='search'){
#           const b=a._sv!=null?G.agents[a._sv]:null;
#           a._doing=null; a._sv=null;
#           G.fx.push({type:'search',x:a.x,y:a.y,t:0.5,dur:0.5});
#           if(b){
#             const first=!b.searched;
#             b.searched=true;
#             const got=lootBody(a,b);
#             const bp=bodyPos(b);
#             logEvent('search',{actor:a.i,victim:b.i,first:first,none:!!got.none,
#               room:bp?roomIdAt(bp[0],bp[1]):null,
#               x:bp?+bp[0].toFixed(1):null,y:bp?+bp[1].toFixed(1):null,
#               bullet:got.bullet,medkit:got.medkit,qual:got.qual});
#             if(first){
#               const bi=bodyInfo(b);
#               evPush(a,{kind:'search_result',x:bi.pos?bi.pos[0]:b.x,y:bi.pos?bi.pos[1]:b.y,
#                 room:bi.room,victim:b.i,conf:1,src:'search',body:bi});
#               if(bi.moved)evPush(a,{kind:'search_body_moved',x:bi.pos?bi.pos[0]:b.x,
#                 y:bi.pos?bi.pos[1]:b.y,room:bi.room,victim:b.i,conf:1,src:'search',body:bi});
#             }
#             if(actor){openBodyCard(b);toast(lootText(got,b));}
#             if(G.simMode&&G.simStats){
#               G.simStats.searches++;
#               if(a.alien)G.simStats.alienLoots++; else G.simStats.humanLoots++;
#               if(!got.none){
#                 G.simStats.loots++;
#                 G.simStats.bulletsLooted+=got.bullet;
#                 G.simStats.medkitsLooted+=got.medkit;
#                 G.simStats.qualsLooted+=got.qual;
#               }
#             }
#           }
#           return;
#         }
#         if(a._doing==='med'){
#           a._doing=null;
#           if((a.qual||0)<1&&!G.designMode){if(actor)toast('没有物资申请单：先回中央会议室圆桌领取');return;}
#           a.medkit=1;if(!G.designMode)a.qual--;
#           G.fx.push({type:'pickup',x:a.x,y:a.y,t:1.2,dur:1.2,item:'med'});
#           setAct(a,'pickup',0.55,{});
#           logEvent('supply',{actor:a.i,item:'medkit',room:roomIdAt(a.x,a.y),
#             x:+a.x.toFixed(1),y:+a.y.toFixed(1),qual:a.qual});
#           if(actor){toast('拿到医疗包 · 物资申请单 -1');pulseHud('md');pulseHud('ql');SND.med();}
#           return;
#         }
#         if(a._doing==='ammo'){
#           a._doing=null;
#           if((a.qual||0)<1&&!G.designMode){if(actor)toast('没有物资申请单：先回中央会议室圆桌领取');return;}
#           a.bullet=1;if(!G.designMode)a.qual--;
#           G.fx.push({type:'pickup',x:a.x,y:a.y,t:1.2,dur:1.2,item:'ammo'});
#           setAct(a,'pickup',0.55,{});
#           logEvent('supply',{actor:a.i,item:'bullet',room:roomIdAt(a.x,a.y),
#             x:+a.x.toFixed(1),y:+a.y.toFixed(1),qual:a.qual});
#           if(actor){toast('拿到子弹 · 物资申请单 -1');pulseHud('bl');pulseHud('ql');SND.ammo();}
#           return;
#         }
#         if(a._doing==='qual'){
#           a._doing=null;
#           grantQual(a);
#           return;
#         }
#         if(a._doing==='breaker'){
#           a._doing=null;a._lightGo=false;a._breakerGoal=null;
#           /* 当众合闸是异形的一次**演出**（risk 已吃 breakerLoss 战略损失）：
#              演完进冷却、进统计。拉闸断电不走这里 —— 它不是伪装，_fakeKind 为空。 */
#           if(a.alien&&a._fakeKind==='breaker'){
#             a._fakeKind=null;a._fakeCD=SKSanity.DISGUISE.cooldown;
#             if(G.simMode&&G.simStats)G.simStats.fakeBreaker++;
#           }
#           /* AI 拉闸以前只播特效不改状态（if(actor) 挡住了），这里统一走真断电 */
#           pullBreaker(a);
#           return;
#         }
#         if(a._doing==='fix'){finishFix(a);return;}
#         if(a._doing==='revive'){
#           const v=a._rv;
#           if(v&&v.downed&&v.alive){
#             const dg=draggerOf(v);
#             if(dg)releaseDragBy(dg,true);
#             v.draggedBy=null;
#             v.downed=false;v.downAt=0;v.killedBy=null;a.medkit=0;
#             v.woundCause=null;v.downRoom=null;v.downX=null;v.downY=null;v.searched=false;
#             G.fx.push({type:'heal',x:v.x,y:v.y,t:1.2,dur:1.2});
#             setAct(v,'heal',0.7,{ang:0});
#             credBroadcast(a,'revive',v.x,v.y);
#             logEvent('revive',{actor:a.i,victim:v.i,method:'medkit',room:roomIdAt(v.x,v.y),
#               x:+v.x.toFixed(1),y:+v.y.toFixed(1)});
#             if(actor){toast('救起 '+v.name);SND.revive();}
#             if(G.stats)G.stats.medkitRevives=(G.stats.medkitRevives||0)+1;
#             if(G.simMode&&G.simStats){G.simStats.revives++;G.simStats.medkitRevives++;}
#           }
#           a._rv=null;a._doing=null;return;
#         }
#         /* 任务结算：按实际修的点记账；乱序完成时把该点交换到 tIdx 槽位，
#            保持 [0,tIdx) 全是已完成任务，tIdx 仍是“已完成数量” */
#         a._doing=null;a.doing=0;
#         /* 设计者模式：任务点只验交互与小游戏，不动 a.tasks / tIdx / G.prog。
#            设计者派发的 4 个任务里通常没有他刚修的那个点，走下面的交换记账
#            会把另一个任务记成完成，还会把维修进度推到 45 触发结算。 */
#         if(G.designMode){
#           const dp=a._taskPt!=null?M.points[a._taskPt]:null;
#           a._taskPt=null;
#           if(actor)toast('设计者模式 · 「'+(dp?dp.label:'任务点')+'」验收完成 · 不计维修进度');
#           return;
#         }
#         const picked=a._taskPt;
#         a._taskPt=null;
#         let k=a.tIdx;
#         if(picked!=null){
#           const pi=a.tasks.indexOf(picked);
#           if(pi>=a.tIdx)k=pi;
#         }
#         if(k!==a.tIdx){
#           const cur=a.tasks[a.tIdx];
#           a.tasks[a.tIdx]=a.tasks[k];
#           a.tasks[k]=cur;
#         }
#         const p=M.points[a.tasks[a.tIdx]];
#         if(!p)return;
#         const v=ghostTaskPts(p);
#         if(a.ghost&&(a.ghostPts||0)+v>GHOST_TASK_CAP){
#           a._doing=null;a.doing=0;
#           if(actor)toast('幽灵最多维修 '+GHOST_TASK_CAP+' 分的剩余任务');
#           return;
#         }
#         /* ghostPts 是硬上限：AI 幽灵也走同一结算，玩家与 AI 都最多 GHOST_TASK_CAP 分。 */
#         G.prog=Math.min(45,G.prog+v);
#         if(a.ghost)a.ghostPts=(a.ghostPts||0)+v;
#         a.tIdx++; a.progress+=v;
#         if(G.pointDone)G.pointDone[a.tasks[a.tIdx-1]]=(G.playT||0);
#         if(G.simMode&&G.simStats&&a.alien)G.simStats.alienTasks++;
#         /* 分任务点计数：只看不干预，用来定位「某些任务点几乎没人完成」 */
#         if(G.simMode&&G.simStats&&G.simStats.tasksByPoint)
#           G.simStats.tasksByPoint[p.label]=(G.simStats.tasksByPoint[p.label]||0)+1;
#         /* 局内统计：幽灵完成的维修任务（报告里要单列「幽灵修了几个任务」） */
#         if(a.ghost&&G.stats)G.stats.ghostTasks=(G.stats.ghostTasks||0)+1;
#         if(G.simMode&&G.simStats&&a.ghost)G.simStats.ghostTasks++;
#         a.nTask=p.label; a.nTaskRoom=roomIdAt(a.x,a.y);
#         logEvent('task',{actor:a.i,label:p.label,room:p.room,pts:v,ghost:!!a.ghost,
#           x:+a.x.toFixed(1),y:+a.y.toFixed(1),prog:G.prog});
#         /* 正向信任：看见别人把任务做完 → +cred（幽灵做的不算，看不见实体） */
#         if(!a.ghost)credBroadcast(a,'taskDone',a.x,a.y);
#         let gotQual=false;
#         if(a.progress>=3&&!a._q3){a._q3=true;a.qualPending=(a.qualPending||0)+1;gotQual=true;}
#         if(a.progress>=5&&!a._q5){a._q5=true;a.qualPending=(a.qualPending||0)+1;gotQual=true;}
#         G.fx.push({type:'done',x:a.x,y:a.y,t:1.0,dur:1.0});
#         G.fx.push({type:'spark',x:p.x,y:p.y,t:0.8,dur:0.8});
#         if(gotQual&&actor){pulseHud('qp');SND.qual();}
#         /* 修好配电室的「电路维修」⇒ 全船照明恢复（拉闸仍可再次断电，但再拉要 6 秒） */
#         let powerFix=false;
#         if(p.room==='power'&&p.label==='电路维修'&&!G.powerFixed){
#           G.powerFixed=true; powerFix=true;
#           if(G.lightState!==2){G.lightState=1;refreshLight();}
#           const br=M.facility.find(f=>f.kind==='breaker');
#           if(br)G.fx.push({type:'power',x:br.x,y:br.y,t:1.2,dur:1.2,on:true});
#           hear(p.x,p.y,'power',0.9);
#         }
#         if(actor){
#           SND.done();
#           toast('完成「'+p.label+'」 +'+v+' 分'+(powerFix?' · 全船照明恢复':'')
#             +(gotQual?' · 获得 1 份待领取物资申请单（回中央会议室圆桌领取）':''));
#           if(powerFix)pulseHud('pwr');
#         }
#         /* AI 完成任务后不再原地休息，直接接下一个任务/维修。 */
#       }

func finish_doing():
	# TODO 逐行移植（对照上面的原文，一条一条勾）
	return null
