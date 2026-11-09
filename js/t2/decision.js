/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 玩家决策
 * definedBy : 报告 / 会议 / 投票 / 发言（额度与消耗、会议时序与传播）
 * truth     : js/t2/decision.js#SKT2Decision
 * verify    : 全量门禁 / 蒙特卡洛
 * flag      : F  (F=现行事实 / N=规范裁定)
 * note      : 方案 A 第三批：会议与发言基础层；状态沿用 _t.G()
 * ============================================================== */
/* 方案 A 第三批（2026-11-04）：玩家决策域 · 报告额度与会议发言解析
   -------------------------------------------------------------
   真源：本文件。函数体与拆分前 js/game.js 逐行一致，仅两处取状态方式改变：
     · 闭包变量 G → 函数开头 const G = global.SKV3._t.G()（用户裁定沿用 _t.G()）
     · SKSanity   → 模块顶部 const SK = global.SKSanity
   ROOM_WORDS / CN_SEAT 两张词表一并外提，本文件为唯一真源，
   game.js 不再定义，只保留同名薄委托，下游调用零改动。
   依赖：js/ai/sanity.js 必须先加载；不引依赖、不读 DOM、不碰定时器与随机流。 */
(function (global) {
  'use strict';
  const SK = global.SKSanity;

  /* ---- 舱室词表 / 中文席位数（原 js/game.js 闭包内 const，逐行原样） ---- */
  const ROOM_WORDS=[
    ['中央会议室','bridge'],['会议室','bridge'],['大厅','bridge'],
    ['仓库','warehouse'],['库房','warehouse'],['食堂','transit'],['餐厅','transit'],
    ['监控室','cam'],['监控','cam'],['中控室','cam'],['中控','cam'],
    ['生态舱','ecosys'],['生态区','ecosys'],['生态','ecosys'],
    ['配电室','power'],['配电站','power'],['配电间','power'],['配电','power'],
    ['中转间','transit'],['中转舱','transit'],['中转','transit'],
    ['娱乐室','fun'],['娱乐间','fun'],['休闲室','fun'],['娱乐','fun'],
    ['引擎室','engine'],['引擎','engine'],
    ['医疗间','med'],['医疗舱','med'],['医务室','med'],['病房','med'],['医疗','med'],
    ['军械库','armory'],['军械室','armory'],['武器库','armory'],['军械','armory'],
    ['走廊','corridor'],['通道','corridor']
  ];
  const CN_SEAT={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,
    十一:11,十二:12,十三:13,十四:14,十五:15};

  /* ---- 会议席位标签 ---- */
  function seatNo(a){return String(((a&&a.i)||0)+1).padStart(2,'0');}
  function tagName(a){return a?(seatNo(a)+' '+a.name):'—';}
  function tagByName(who){
    const G=global.SKV3._t.G();
    const a=G.agents.find(x=>x.name===who);
    return a?tagName(a):who;
  }
  function nameOf(i){
    const G=global.SKV3._t.G();
    const a=G.agents[i];return a?a.name:'—';
  }
  /* 时间词（2026-11-02 措辞修正）：夜晚会议说"今晚"，**白天会议必须说"昨晚"** */
  function whenWord(){
    const G=global.SKV3._t.G();
    return (G&&G.meet&&G.meet.kind==='day')?'昨晚':'今晚';
  }
  function seatIndex(n){
    const G=global.SKV3._t.G();
    const i=(n|0)-1;
    /* 2026-11-05：席位随机后 0 号也可能是 AI，不能再把 1 号排除在外。 */
    return i>=0&&i<G.agents.length?i:null;
  }

  /* 自由文本 → 槽位（提到的人 / 舱室 / 指控 / 投票 / 否认 / 自述位置）。
     纯本地规则，不接模型；关键词只做槽位抽取，不做语义理解。 */
  function parseSpeech(text){
    const G=global.SKV3._t.G();
    const s=String(text||'');
    const out={raw:s.slice(0,80),rooms:[],people:[],accuse:null,vote:null,
      deny:false,where:null,when:null,claim:null,support:null};
    for(const [w,id] of ROOM_WORDS){
      if(s.indexOf(w)>=0&&out.rooms.indexOf(id)<0)out.rooms.push(id);
    }
    /* 人物按在文本里第一次出现的位置排序，避免「南极被北极杀了」把凶手认成南极 */
    const at={};
    const meI=(G&&G.me&&!G.spectMode)?G.me.i:-1;
    const note=(i,pos)=>{
      if(i==null||i===meI)return;
      if(at[i]==null||pos<at[i])at[i]=pos;
    };
    /* 自定义名字可能互相包含（“星”与“星尘”）：先按长度从长到短占位，
       已被长名字占用的字符区间不再给短名字匹配，避免把“星尘”认成“星”。 */
    const spans=[];
    const free=(p,n)=>!spans.some(sp=>p<sp[1]&&p+n>sp[0]);
    const names=G.agents.filter(a=>a&&a.name&&(G.spectMode||a!==G.me))
      .slice().sort((x,y)=>y.name.length-x.name.length);
    for(const a of names){
      let from=0,hit=-1;
      while((from=s.indexOf(a.name,from))>=0){
        if(free(from,a.name.length)){hit=from;break;}
        from+=1;
      }
      if(hit>=0){note(a.i,hit);spans.push([hit,hit+a.name.length]);}
      const sp=s.indexOf(seatNo(a));
      if(sp>=0&&free(sp,2)){note(a.i,sp);spans.push([sp,sp+2]);}
    }
    let m;
    const reNum=/(?:第\s*)?0?([1-9]|1[0-5])\s*(?:号|席)/g;
    while((m=reNum.exec(s))){const i=seatIndex(+m[1]); if(i!=null&&free(m.index,1))note(i,m.index);}
    const reCn=/([一二三四五六七八九十]{1,3})\s*(?:号|席)/g;
    while((m=reCn.exec(s))){const i=seatIndex(CN_SEAT[m[1]]||0); if(i!=null&&free(m.index,1))note(i,m.index);}
    out.people=Object.keys(at).map(Number).sort((a,b)=>at[a]-at[b]);
    const has=out.people.length>0;
    const support=has&&/(作证|担保|保他|保她|相信他|相信她|信他|是好人|不是他|不是异形|不是凶手|不是狼|不是内鬼|别投|不要投|投错|无辜|没问题)/.test(s);
    const negVote=/不投|别投|不要投|投错|不能投/.test(s);
    const negAcc=/(不怀疑|没怀疑|不是他|不是异形|不是凶手|不是狼|不是内鬼|没问题|好人|无辜|冤枉)/.test(s);
    const negSee=/(没看见|没看到|没发现|没亲眼|看错|误会|不确定)/.test(s);
    if(support)out.support=out.people[0];
    let claimKind=null;
    if(!support){
      for(const [k,re] of [
        ['saw_pipe',/(钻管道|钻进管道|钻了管道|从管道里|管道里出来)/],
        ['saw_red',/(红光|发红|红身|身上带着红|带着红光)/],
        ['saw_knife',/(出刀|捅了|捅人|刀了|杀人|杀了|动手|行凶)/],
        ['saw_sabotage',/(破坏设备|破坏舱|拆设备|弄坏设备|损毁设备)/],
        ['saw_bot',/(停摆机器人|关掉机器人|弄停机器人|机器人停摆|拆机器人)/],
        ['saw_breaker',/(拉闸|断电|关灯|电闸)/]
      ]){
        if(re.test(s)){claimKind=k;break;}
      }
    }
    const saw=/(亲眼|看见|看到|发现|确定|确认|我保证|我发誓|确实看到|确实看见)/.test(s);
    if(claimKind&&saw&&!negSee&&has&&!support){
      out.claim={target:out.people[0],kind:claimKind,room:out.rooms[0]||null};
    }
    if(!support&&!out.claim){
      if(has&&/怀疑|凶手|内鬼|狼|可疑|有问题|就是他|是他|他杀|杀了|动了手|出刀|钻管道|红光/.test(s)&&!negAcc)
        out.accuse=out.people[0];
      if(has&&/我(投|跟|票给)|投给/.test(s)&&!negVote)
        out.vote=out.people[0];
    }
    if(/不是我|我没|我没去|我没动|不在场|冤枉|我是好人|别投我|我清白|我无辜/.test(s))out.deny=true;
    /* 只认第一人称的自述位置，避免「我看见X在配电室」被当成玩家在配电室 */
    if(out.rooms.length&&/(我今晚在|我昨晚在|我当时在|我整晚都在|我整晚在|我一整晚都在|我今晚都在|我昨晚都在|我一直在|我就在|我待在|我去过|我刚才在|我之前在|我现在在|我在)/.test(s))
      out.where=out.rooms[0];
    /* 时间槽：口供说的是哪个时段，拆谎就只核对那一段 */
    if(/(刚才|刚刚|这会儿|这一会儿|刚过去)/.test(s))out.when='recent';
    else if(/(一直|整晚|一整晚|从头到尾|一开始|开头|最开始|自始至终)/.test(s))out.when='night';
    return out;
  }

  /* ---- 报告一次性 / 会议额度（额度与消耗） ---- */
  /* 同一具尸体在同一夜只能拉一次铃；活着倒下的人按 downSeq 绑定到「那一次倒下」。 */
  function bodyReported(v){
    const G=global.SKV3._t.G();
    if(!v.reported)return false;
    if(v.alive&&v.downed&&v.reportSeq===v.downSeq)return true;
    return v.reportNight===G.night;
  }
  function markBodyReported(v){
    const G=global.SKV3._t.G();
    v.reported=true;v.reportNight=G.night;v.reportSeq=v.downSeq||0;
  }
  /* 还能不能再开一场夜晚会议：**在消耗报告额度之前**必须先问这一句。 */
  function nightMeetLeft(){
    const G=global.SKV3._t.G();
    if(!G||G.over||G.meet)return 0;
    return Math.max(0,SK.MEET.perNight-(G.nightMeets||0));
  }

  /* ---- 会议排期（方案 A 第五批）：MEET_SCHED 是运行时状态，
         与 SKSanity.MEET（会议配置表）不是一回事；2026-11-04 消歧时由 MEET 改名。
         整组从 game.js 外提，状态随模块持有，game.js 只留局部别名直调。 ---- */
  const MEET_SCHED={id:0,timers:[]};
  function stopChatter(){
    MEET_SCHED.id++;
    for(const h of MEET_SCHED.timers)clearTimeout(h);
    MEET_SCHED.timers=[];
  }
  function meetLater(m,ms,fn){
    const id=MEET_SCHED.id;
    const h=setTimeout(()=>{
      MEET_SCHED.timers=MEET_SCHED.timers.filter(x=>x!==h);
      const G=global.SKV3._t.G();
      if(G.meet!==m||MEET_SCHED.id!==id||m.phase!=='discuss')return;
      try{fn();}catch(e){}
    },ms);
    MEET_SCHED.timers.push(h);
  }
  /* 连说让位：同一个人连着说到第 3 句起不再播；系统行与玩家自己的发言不受限。 */
  function sayStreakOK(who,kind){
    const G=global.SKV3._t.G();
    if(!G||!G.meet)return true;
    if(kind==='sys'||kind===true||kind==='me')return true;
    const m=G.meet, ls=m.lines;
    if(ls&&ls.length){
      const last=ls[ls.length-1];
      if(last&&last.who===who&&!last.sys){
        m.streak=(m.streak||1)+1;
        if(m.streak>2){
          if(G.simMode&&G.simStats)G.simStats.streakCuts=(G.simStats.streakCuts||0)+1;
          return false;
        }
      }else m.streak=1;
    }else m.streak=1;
    return true;
  }

  global.SKT2Decision = Object.freeze({
    ROOM_WORDS: ROOM_WORDS, CN_SEAT: CN_SEAT,
    seatNo: seatNo, tagName: tagName, tagByName: tagByName, nameOf: nameOf,
    whenWord: whenWord, seatIndex: seatIndex, parseSpeech: parseSpeech,
    bodyReported: bodyReported, markBodyReported: markBodyReported,
    nightMeetLeft: nightMeetLeft,
    stopChatter: stopChatter, meetLater: meetLater, sayStreakOK: sayStreakOK
  });
})(typeof window !== 'undefined' ? window : globalThis);
