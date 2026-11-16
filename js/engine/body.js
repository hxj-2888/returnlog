/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 空间与资源
 * definedBy : 尸体 / 物资公共查询
 * truth     : js/engine/body.js#bodyPos / lootBody
 * verify    : 门禁（搜尸取证 / 物资领取 / 尸体坐标）
 * flag      : F  (F=现行事实 / N=规范裁定)
 * 说明      : 2026-11-15 从 js/game.js 外提的第一批纯函数（5 个，零闭包依赖）。
 *             只读写传入的 agent 字典，不碰 G、DOM、Canvas 与对局时钟；
 *             game.js 用局部别名绑定同一函数对象（方案 A 薄委托），调用点与行为不变。
 * ============================================================== */
/* =============================================================
 * 尸体 / 幽灵的公共查询
 * -------------------------------------------------------------
 * 濒死（还活着）用本人坐标；已死亡用固定的 bodyX/bodyY —— 幽灵可以飘走，
 * 尸体留在原地，所以这两套坐标必须分开。驱逐没有尸体。
 *
 * 不变量：· file:// 可用：经典 script、无 fetch、无 ES Module；
 *        · 逐字移植自 js/game.js，函数体未改一个判断或一个数值；
 *        · 对外只暴露 window.SKBody，不写任何全局对局状态。
 * ============================================================= */
(function (global) {
  'use strict';
  function bodyPos(a){
    if(!a)return null;
    if(a.alive)return a.downed?[a.x,a.y]:null;
    if(a.bodyGone||a.deathCause==='vote'||a.bodyX==null)return null;
    return[a.bodyX,a.bodyY];
  }
  /* 搜尸：查看取证不自动拿；手动取物走 takeBodyLoot；AI 仍自动取。 */
  function bodyHasLoot(b){
    if(!b)return false;
    return (b.bullet|0)>0||(b.medkit|0)>0||(b.qual|0)>0||(b.qualPending|0)>0;
  }
  function lootBody(a,b){
    if(!a||!b)return {bullet:0,medkit:0,qual:0,none:true};
    const got={bullet:0,medkit:0,qual:0};
    if((a.bullet|0)<1&&(b.bullet|0)>0){got.bullet=1;b.bullet=(b.bullet|0)-1;a.bullet=1;}
    if((a.medkit|0)<1&&(b.medkit|0)>0){got.medkit=1;b.medkit=(b.medkit|0)-1;a.medkit=1;}
    const cap=2-(a.qual|0);
    /* 死者身上已领到的申请单优先，未领取的也一并继承，避免“人死了票就作废” */
    const pool=(b.qual|0)+(b.qualPending|0);
    if(cap>0&&pool>0){
      const n=Math.min(cap,pool);
      const fromQual=Math.min(n,b.qual|0);
      b.qual=(b.qual|0)-fromQual;
      b.qualPending=Math.max(0,(b.qualPending|0)-(n-fromQual));
      got.qual=n;
      a.qual=(a.qual|0)+n;
    }
    got.none=!(got.bullet||got.medkit||got.qual);
    return got;
  }
  function bodyItemsText(b){
    if(!b)return '';
    const p=[];
    if((b.bullet|0)>0)p.push('子弹 ×'+b.bullet);
    if((b.medkit|0)>0)p.push('医疗包 ×'+b.medkit);
    const q=(b.qual|0)+(b.qualPending|0);
    if(q>0)p.push('申请单 ×'+q);
    return p.join(' · ');
  }
  function lootText(got,b){
    const nm=b?b.name:'尸体';
    if(!got||got.none)return nm+'身上没有可带走的物资（伤情记录已更新）';
    const parts=[];
    if(got.bullet)parts.push('子弹 ×'+got.bullet);
    if(got.medkit)parts.push('医疗包 ×'+got.medkit);
    if(got.qual)parts.push('申请单 ×'+got.qual);
    return '从'+nm+'身上取得：'+parts.join(' · ');
  }

  global.SKBody = { bodyPos: bodyPos, bodyHasLoot: bodyHasLoot, lootBody: lootBody,
    bodyItemsText: bodyItemsText, lootText: lootText };
})(typeof window !== 'undefined' ? window : globalThis);
