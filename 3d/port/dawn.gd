# @src js/game.js:4503 dawn()
# 移植规则：先逐行抄下面原文，再一条条落到 GDScript。
# 任何 3D 新增的规则都必须写 @deviation 并说明理由，否则 audit:parity 会报。
# --- 2.5D 原文（逐字，含缩进）---
#   function dawn(){
#         logEvent('dawn',{prog:G.prog});
#         for(const a of G.agents) if(a.downed&&a.alive) die(a,'bled',a.killedBy);
#         G.t=0;
#         /* 天亮：没修完的故障随夜结束一起消失，不扣分（规则只罚“夜里超时”） */
#         G.dmg=[];
#         G.sabTarget=null;
#         if(checkWin())return;
#         /* 白天会议**要回会议室**（2026-11-02 用户裁定）：
#            与夜里的远程会议相反 —— 全员被刷新到中央会议室，并且**打断此前的一切任务流程**
#            （清路径 / 站桩进度 / 动作 / 拖拽）。这是刻意的节奏差：夜里开会不打断，
#            白天开会意味着"这一夜到此为止"。 */
#         const br=M.rooms.find(r=>r.id==='bridge');
#         if(br){
#           for(const a of G.agents){
#             if(!a.alive)continue;
#             const p=randIn(br);
#             a.x=p[0];a.y=p[1];
#             a.path=null;a.moving=false;a.doing=0;a._doing=null;a.act=null;
#             a.drag=null;a.draggedBy=null;a.target=null;
#           }
#           G.drag=null;
#         }
#         openMeeting('day',null,null);
#       }

func dawn():
	# TODO 逐行移植（对照上面的原文，一条一条勾）
	return null
