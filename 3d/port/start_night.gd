# @src js/game.js:7838 startNight(inc)
# 移植规则：先逐行抄下面原文，再一条条落到 GDScript。
# 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。
# --- 2.5D 原文（逐字，含缩进）---
#   function startNight(inc){
#         G._overtime=false;
#         if(inc!==false) G.night++;
#         logEvent('night_start',{night:G.night});
#         checkTerminator();
#         if(G)releaseAllDrags(true);
#         G.t=NIGHT;
#         if(G.simMode){G.simT=NIGHT;G.phase=null;}
#         else G.phase=SKClock.newPhase('night',performance.now(),NIGHT*1000);
#         for(const a of G.agents){
#           a.knife=1;a.path=null;a.doing=0;a.target=null;if(a.alive)a.reported=false;
#           a._doing=null;a.sabUsed=false;a.detained=false;a.detainedT=0;
#           a._pipeCD=0;a._rv=null;a.sabRoom=null;a._fix=null;a._fixGo=null;a._taskPt=null;a._look=null;
#         a._plan=null;a._planCD=0;   /* 行为效用表缓存一并重算 */
#           /* 每夜重置认知：没有跨夜记忆，也不让上一夜的 suspect 自动带进新夜 */
#           mindReset(a);a.suspect=null;a.accuseWhy=null;a._abstain=false;
#           a._reportT=0;a._reportBody=null;a._sawBody=null;a._scanT=0;a._reportMemo={};
#           /* 拖拽 / 红身 / 藏尸 / 断电响应 / 管道规划：全部按夜清空 */
#           a.drag=null;a.draggedBy=null;a.redT=0;a.rushT=0;a.stunT=0;a._dragSnd=0;a._dragAiT=0;
#           a._dragAway=false;a._dragMedD0=0;a._dragAwaySeen={};
#           a._hideSpot=null;a._hideRoom=null;a._hideCD=0;a._hides=0;
#           a._lightGo=false;a._pipePlan=null;a._pipeSeeks=0;a._secAvoidT=0;a._botCD=0;
#           /* 破坏落点缓存 / 伪装冷却（隔天重新开演，符合"每夜各演一次"的直觉） */
#           a._sabSpot=null;a._sabRoom=null;a._credMed=false;
#           a._fakeCD=0;a._sabSkipRoom=null;a._sabSkipUntil=0;
#           a._killBody=null;a._killAt=0;a._killDecided=true;a._reportPlan=null;
#           a._avoid={};a._fleeT=0;a._fleeFrom=null;a._pathCD=0;a._alienTaskN=0;a._stallBias=0.8+Math.random()*0.4;
#           a._fakeKind=null;a._supportGoal=null;a._lootMem={};
#           /* 贵信号每夜一次的名额，天亮重新开放（假动作不吃这个名额） */
#           a._realFixN=0;a._realReviveN=0;
#           /* 节奏控制：错峰开工 + 修完歇一会儿；异形更早开始活动，但不会开局贴脸 */
#           /* 开局错峰：激进的人一进夜就冲（缩放 0.55~1.3），谨慎的人磨蹭 */
#         a.act=null;a._rest=0;a._delay=(2+Math.random()*6)*SKTrait.C.delayScale(a);a._fxT=0;
#           a.nRoom=roomIdAt(a.x,a.y);a.nSeen={};a.nTask=null;a.nTaskRoom=null;
#           a.accuse=null;a._lie=null;
#         }
#         G.drag=null;
#         G.aiReportUsed=false;G.evSeq=0;G.nightMeets=0;
#         G.trackT=0;G.medbotUsed=false;G.medbotT=0;G.medbotTarget=null;G.medbotLeft=MEDBOT_CHARGES;G.botHp={secbot:2,medbot:1};G.secbotUsed=false;G.secbotUses=0;G.secbotT=0;G.pendingCrime=null;
#         G.medbotDead=false;G.secbotDead=false;G.powerFixed=false;G.secCatch=null;
#         for(const d of (G.doors||[])){d.open=0;d.target=0;d.scanT=0;}
#         /* 新的一夜：故障与破坏目标全部清空（上夜没修完的故障不跨夜追罚） */
#         G.dmg=[];G.sabTarget=null;
#         /* 破坏落点每夜重抽：同一台设备不能连续几夜都坏在同一个位置 */
#         for(const k in SAB_SPOT_CACHE)delete SAB_SPOT_CACHE[k];
#         resetBots();
#         /* 拉闸手已取消（2026-11-01）：每夜重新由效用表决定谁去拉闸 */
#         G.breakerPulls=0;   /* 拉闸延迟每夜重新从 3 秒起算 */
#         G.lightState=0;G.waves=[];G.fx=[];
#         closeCams(true);closePipePick(true);closeSabPick(true);
#         refreshLight();
#         toast('第 '+G.night+' 夜开始');
#       }

func start_night():
	# TODO 逐行移植（对照上面的原文，一条一条勾）
	return null
