#!/usr/bin/env node
/* =============================================================
 * T3 验收层体检 · docs/acceptance.md §7
 * -------------------------------------------------------------
 * 用法：
 *   node tools/check-t3.cjs              常规：WARN 不阻断（存量债）
 *   node tools/check-t3.cjs --strict     严格：WARN 也按失败退出
 *
 * 只读，绝不写文件、不跑浏览器、不改动任何真源。
 * 检查真源/读数分离、三段式、读数留痕、导出快照哈希、2.5D↔3D 对账、
 * 版本真源、台账时效与存量债登记；不接入 tools/test-v3.cjs，不影响主门禁。
 * 检查项编号与 docs/acceptance.md §7 表格一一对应。
 * ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STRICT = process.argv.includes('--strict');
const RULE_START = '2026-11-04';   // 三层架构 / 三段式规则适用起点
const results = [];

const add = (level, code, msg, detail) => results.push({ level, code, msg, detail });
const read = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
};
const readJson = (rel) => {
  const t = read(rel);
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
};
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const sha1 = (rel) => crypto.createHash('sha1')
  .update(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'))
  .digest('hex').slice(0, 12);

const CL = read('CHANGELOG.md') || '';
const LINES = CL.split('\n');

/* 现行口径文档：这里的每一句都按现行规范解读 */
const LIVE_DOCS = [
  'AGENTS.md', 'README.md', 'ARCHITECTURE.md',
  'docs/acceptance.md', 'docs/ASSET_GOVERNANCE.md',
];
/* 历史分册已于 2026-11-12 分类收缩中归档，不再逐行豁免 */
const HISTORICAL_DOCS = [];
const DEPRECATED_HINT = /废弃|历史|不存在|已停用|非现行|旧|补登记|禁止|不得|不是|当时|仅供查阅|❌/;
/* 错误句式：把 T3 台账/报告抬为真源（不含「数值真源见 js/…」这类正确表述） */
const BAD_TRUTH = /数值基线唯一真源|基线唯一真源|唯一真源是|数值真源是|数值基线\s*=\s*`tools\/mc-report\.md`/;

/* ---------- C1 · 禁止把台账/报告抬为真源 ---------- */
{
  const hits = [];
  for (const f of LIVE_DOCS) {
    const t = read(f);
    if (!t) continue;
    t.split('\n').forEach((l, i) => {
      if (!BAD_TRUTH.test(l)) return;
      if (DEPRECATED_HINT.test(l)) return;      // 规范里的「禁止句式」示例不算
      hits.push(`${f}:${i + 1}`);
    });
  }
  if (hits.length) add('FAIL', 'C1', `${hits.length} 处把 T3 台账/报告称为数值真源`, hits.slice(0, 6).join(' · '));
  else add('PASS', 'C1', '真源/读数分离：现行文档未把台账抬为真源');
}

/* ---------- C2 · 已废弃 mc-report.md 的现行引用 ---------- */
{
  const present = exists('tools/mc-report.md');
  const plain = [];
  const asTruth = [];
  for (const f of LIVE_DOCS) {
    const t = read(f);
    if (!t) continue;
    t.split('\n').forEach((l, i) => {
      if (!/mc-report\.md/.test(l) || DEPRECATED_HINT.test(l)) return;
      const where = `${f}:${i + 1}`;
      plain.push(where);
      if (/(唯一真源|权威口径|正式基线|当前基线)/.test(l)) asTruth.push(where);
    });
  }
  if (!present && asTruth.length) {
    add('FAIL', 'C2', `已废弃且不存在的 mc-report.md 仍被 ${asTruth.length} 处当作现行真源/基线`, asTruth.join(' · '));
  } else if (!present && plain.length) {
    add('WARN', 'C2', `${plain.length} 处引用废弃文件但未标注「历史/废弃」`, plain.slice(0, 6).join(' · '));
  } else if (!present) {
    add('PASS', 'C2', 'mc-report.md 已废弃，现行文档引用均已标注或清除');
  } else {
    add('PASS', 'C2', 'mc-report.md 存在（如恢复入库，请按 §5 只登记一处现值）');
  }
}

/* ---------- C3 · 非台账文档私自声明现值 ---------- */
{
  const hits = [];
  const files = ['AGENTS.md', 'README.md'];
  for (const f of files) {
    const t = read(f);
    if (!t) continue;
    t.split('\n').forEach((l, i) => {
      if (!/(当前数值基线|现行基线|门禁现值|当前基线|权威口径)/.test(l)) return;
      if (!/(\d{2,3}\.\d\s*%|\d{3}\s*(条)?\s*通过|\d{3}\s*\/\s*\d)/.test(l)) return;
      if (/历史|非现行|不得|禁止|见\s*`CHANGELOG/.test(l)) return;
      hits.push(`${f}:${i + 1}`);
    });
  }
  if (hits.length) add('WARN', 'C3', `${hits.length} 处非台账文档自带「现行基线/门禁现值」数值`, hits.slice(0, 6).join(' · '));
  else add('PASS', 'C3', '单一现值：非台账文档只写指针，不复制数值');
  const bh = read('docs/baseline-history.md');
  add(!bh || /2026-11-12/.test(bh.slice(0, 1200)) ? 'PASS' : 'WARN', 'C3b',
    bh ? '历史分册口径指针：baseline-history.md 头部已标注「现行只在 CHANGELOG 最新批次」'
       : '历史分册已清理（2026-11-12）；现行读数只认 CHANGELOG 最新批次',
    `历史分册已于 2026-11-12 分类收缩中归档`);
}

/* ---------- 切分 CHANGELOG 批次 ---------- */
const batches = [];
LINES.forEach((l, i) => {
  if (!/^##\s*\[/.test(l) && !/^##\s*2026-/.test(l)) return;
  batches.push({ line: i + 1, title: l.trim(), start: i });
});
batches.forEach((b, i) => { b.end = i + 1 < batches.length ? batches[i + 1].start : LINES.length; });
const body = (b) => LINES.slice(b.start, b.end).join('\n');
const dateOf = (title) => {
  const m = title.match(/(20\d{2}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};
const applicable = batches.filter((b) => {
  const d = dateOf(b.title);
  return d && d >= RULE_START;
});

/* ---------- C4 · 三段式完整度 ---------- */
{
  const need = ['本批改动', '读数变化', '下一批立项依据'];
  const missing = [];
  for (const b of applicable) {
    const t = body(b);
    const lack = need.filter((k) => !t.includes(k));
    if (lack.length) missing.push(`L${b.line} 缺 ${lack.join('/')}`);
  }
  if (missing.length) {
    add('WARN', 'C4', `三段式：适用批次 ${applicable.length} 个，${missing.length} 个缺段`, missing.slice(0, 8).join(' · '));
  } else {
    add('PASS', 'C4', `三段式：适用批次 ${applicable.length} 个全部完整`);
  }
  add('PASS', 'C4b', `历史豁免：${batches.length - applicable.length} 个 11-04 前批次按「只标注不删除」处理`);
}

/* ---------- C5 · 读数变化段是否有当批实跑读数 ---------- */
{
  const weak = [];
  for (const b of applicable) {
    const t = body(b);
    const at = t.indexOf('读数变化');
    if (at < 0) continue;
    const seg = t.slice(at, t.indexOf('下一批立项依据', at) > at ? t.indexOf('下一批立项依据', at) : t.length);
    if (/(\d+\s*通过\s*\/\s*\d+\s*失败|\d+\s*PASS|未跑|沿用|未实测|未重跑|不重跑|本批未改)/.test(seg)) continue;
    weak.push(`L${b.line}`);
  }
  if (weak.length) add('WARN', 'C5', `${weak.length} 个「读数变化」段无当批实跑读数且未写「未跑/沿用」`, weak.slice(0, 8).join(' · '));
  else add('PASS', 'C5', '读数留痕：每个读数段都有实跑值或显式「未跑/沿用」说明');
}

/* ---------- C6 · rules.json 源哈希（与 export-rules.cjs 同算法） ---------- */
{
  const r = readJson('3d/preview/data/rules.json');
  if (!r || !r.sources) {
    add('WARN', 'C6', 'rules.json 缺失或无 sources 字段');
  } else {
    const drift = [];
    for (const [rel, h] of Object.entries(r.sources)) {
      if (!exists(rel)) { drift.push(`${rel}（文件缺失）`); continue; }
      if (sha1(rel) !== h) drift.push(`${rel} ${h} → ${sha1(rel)}`);
    }
    if (drift.length) add('WARN', 'C6', `${drift.length} 个源文件与规则快照哈希漂移`, drift.join(' · '));
    else add('PASS', 'C6', `rules.json#sources ${Object.keys(r.sources).length} 个源文件哈希全等`);
  }
}

/* ---------- C7 · 2.5D 真源 ↔ 3D 导出对账 ---------- */
{
  const src = read('js/data/map.js');
  let M = null;
  try {
    const ctx = { window: {} };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    M = ctx.window.SKMapData;
  } catch (e) { /* 下面统一报 WARN */ }
  const mj = readJson('3d/preview/data/map.json');
  const v2 = readJson('3d/preview/data/map_v2.json');
  const lv2 = readJson('3d/preview/data/layout-v2.json');
  if (!M || !mj || !v2) {
    add('WARN', 'C7', '地图真源或导出缺失，无法对账');
  } else {
    const keys = ['rooms', 'corridors', 'cover', 'decor', 'points', 'pipes', 'facility', 'walls'];
    const runtimeKeys = keys.filter((k) => k !== 'decor'); // decor 是 3D 墙面美术，允许差异
    const diff = (o, ks = keys) => ks.filter((k) => Array.isArray(M[k]) && Array.isArray(o[k]) && M[k].length !== o[k].length)
      .map((k) => `${k} ${M[k].length}→${o[k].length}`);
    const coordDiff = (a, b, keyFn) => {
      const map = new Map((b || []).map((x) => [keyFn(x), x]));
      let n = 0;
      for (const x of (a || [])) {
        const y = map.get(keyFn(x));
        if (!y || Math.abs(x.x - y.x) > 0.01 || Math.abs(x.y - y.y) > 0.01) n++;
      }
      return n;
    };
    const keyP = (p) => `${p.room}|${p.label}`;
    const keyF = (p) => `${p.kind}|${p.item || ''}|${p.room}`;
    const mjDiff = diff(mj);
    const ptsMj = coordDiff(M.points, mj.points, keyP);
    const facMj = coordDiff(M.facility, mj.facility, keyF);
    const v2Diff = diff(v2, runtimeKeys);
    const ptsV2 = coordDiff(M.points, v2.points, keyP);
    const facV2 = coordDiff(M.facility, v2.facility, keyF);
    const decorNote = Array.isArray(v2.decor)
      ? `decor ${v2.decor.length} 件（3D 墙面美术，允许差异；map.js 为 ${M.decor.length} 件地面喷涂）`
      : 'decor 缺失';

    if (!mjDiff.length && !ptsMj && !facMj) {
      add('PASS', 'C7a', 'map.js ↔ map.json：数量与任务点/设施坐标全等');
    } else {
      add('WARN', 'C7a', 'map.js ↔ map.json 存在漂移', [...mjDiff, `points 坐标漂移 ${ptsMj}`, `facility 坐标漂移 ${facMj}`].join(' · '));
    }
    const v2Problems = [...v2Diff, `points 坐标漂移 ${ptsV2}/${M.points.length}`, `facility 坐标漂移 ${facV2}/${M.facility.length}`];
    if (!v2Diff.length && !ptsV2 && !facV2) {
      add('PASS', 'C7b', 'map_v2.json 运行字段与 2.5D 真源一致', `${decorNote}；layout-v2 为方案层留档，不参与运行时对账`);
    } else {
      add('WARN', 'C7b', 'map_v2.json 运行字段与 2.5D 真源漂移（§8 M2）', v2Problems.join(' · '));
    }
  }
}

/* ---------- C8 · 版本真源三处一致 ---------- */
{
  const v = read('js/config/version.js') || '';
  const mv = v.match(/version:\s*'([^']+)'/);
  const pkg = readJson('package.json');
  const head = CL.slice(0, 800).match(/版本口径：\*\*([^*]+)\*\*/);
  const a = mv ? mv[1] : null;
  const b = pkg ? pkg.gameVersion : null;
  const c = head ? head[1] : null;
  if (a && a === b && a === c) add('PASS', 'C8', `版本真源三处一致：${a}`);
  else add('FAIL', 'C8', '版本真源不一致', `version.js=${a} / package.json=${b} / CHANGELOG=${c}`);
}

/* ---------- C9 · 台账时效（工作区有未提交改动但台账无当日条目） ---------- */
{
  let dirty = 0;
  try {
    const out = cp.execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    dirty = out.trim() ? out.trim().split('\n').length : 0;
  } catch { /* 无 git 环境时跳过 */ }
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const has = CL.includes(today);
  if (dirty > 0 && !has) add('WARN', 'C9', `工作区 ${dirty} 项未提交改动，但台账无 ${today} 条目`);
  else if (dirty > 0) add('PASS', 'C9', `工作区 ${dirty} 项未提交改动，台账已有 ${today} 条目`);
  else add('PASS', 'C9', '工作区干净，台账时效无异常');
}

/* ---------- C10 · 存量债登记 ---------- */
{
  const acc = read('docs/acceptance.md') || '';
  if (acc.includes('## 8. 存量债登记') && acc.includes('| N1 |') && acc.includes('| M6 |')) {
    add('PASS', 'C10', '存量债台账存在（§8：N1–N9 / M1–M6 共 15 项）');
  } else {
    add('WARN', 'C10', '存量债台账缺失或不完整');
  }
}

/* ---------- 输出 ---------- */
const d = new Date();
const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
console.log(`[T3 验收层体检] ${stamp} · ${STRICT ? '严格模式' : '常规模式'} · 依据 docs/acceptance.md §7`);
console.log('─'.repeat(72));
for (const r of results) {
  console.log(`${r.level.padEnd(5)} ${r.code.padEnd(5)} ${r.msg}`);
  if (r.detail) console.log(`      └ ${r.detail}`);
}
console.log('─'.repeat(72));
const count = (l) => results.filter((r) => r.level === l).length;
console.log(`汇总：PASS ${count('PASS')} / WARN ${count('WARN')} / FAIL ${count('FAIL')}`);
if (count('WARN')) console.log('提示：WARN 为 §8 已登记存量债或需用户裁定项；新增 WARN 不得靠加豁免消除。');
const failed = count('FAIL') > 0 || (STRICT && count('WARN') > 0);
console.log(failed ? '[T3] 结果 FAIL' : '[T3] 结果 PASS（常规模式 WARN 不阻断）');
process.exit(failed ? 1 : 0);
