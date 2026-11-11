# @src js/game.js:4285 die(a,cause,by)
# 移植规则：先逐行抄下面原文，再一条条落到 GDScript。
# 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。
# --- 2.5D 原文（逐字，含缩进）---
#   function die(a,cause,by){
#         if(!a||!a.alive)return false;
#         if(!G.spectMode&&a===G.me&&G.dev){toast('DEV 无敌：死亡被拦截');return false;}
#         a.alive=false; a.ghost=true;
#         a.deathCause=cause||'knife';
#         a.deathAt=G.t;
#         a.deathRoom=roomIdAt(a.x,a.y);
#         a.deathX=a.x; a.deathY=a.y;
#         a.killedBy=(by==null?null:by);
#         a.bodyGone=(cause==='vote');
#         a.bodyX=a.bodyGone?null:a.x;
#         a.bodyY=a.bodyGone?null:a.y;
#         a.bodyMoved=false;
#         a.searched=false;
#         a.downed=false; a.detained=false;
#         logEvent('kill',{actor:by==null?null:by,victim:a.i,
#           method:cause==='bled'?(a.woundCause||'bled'):cause,
#           room:a.deathRoom,x:a.deathX,y:a.deathY,gone:!!a.bodyGone});
#         a.path=null; a.doing=0; a._doing=null;
#         a.redT=0; a.stunT=0;
#         if(a.drag!=null)releaseDragBy(a,true);
#         const dg=draggerOf(a);
#         if(dg)releaseDragBy(dg,true);
#         if(!G.spectMode&&a===G.me){
#           G.drag=null;
#           document.getElementById('dragtag').classList.add('hide');
#           closeBodyCard();
#           closeCams(true);closePipePick(true);closeSabPick(true);
#           closeWheel(true);
#           G.sabTarget=null;
#           G.fogOn=false;
#           toast('你已阵亡 · 幽灵态：穿墙、全视，仍可做自己剩下的任务（1.6×，最多 2 分）');
#           SND.ghost();
#           syncHud();
#         }
#         return true;
#       }

func die():
	# TODO 逐行移植（对照上面的原文，一条一条勾）
	return null
