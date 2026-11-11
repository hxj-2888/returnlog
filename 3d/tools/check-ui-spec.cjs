#!/usr/bin/env node
/* 会议面板 UI spec 契约校验
 *
 * 目的：把“UI 自动移植”的中间层先钉住：
 *   · `3d/spec/ui/meeting-panel.spec.json` 是信息结构 / 状态 / 事件契约；
 *   · 2.5D `js/ui/templates.js` 的 DOM 必须满足它；
 *   · 3D `main.gd` 的 Control 字段与模板清单必须满足它；
 *   · POC 生成器后续只消费这份 spec，不再各自抄一份按钮表。
 *
 * 只读；失败退出码 1。
 * 用法：node 3d/tools/check-ui-spec.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SPEC = path.join(ROOT, '3d/spec/ui/meeting-panel.spec.json');
const DOM = path.join(ROOT, 'js/ui/templates.js');
const GAME = path.join(ROOT, 'js/game.js');
const GD = path.join(ROOT, '3d/preview/scripts/main.gd');
const REPORT = path.join(ROOT, '3d/reports/meeting-ui-spec.md');

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const domSrc = fs.readFileSync(DOM, 'utf8');
const gameSrc = fs.readFileSync(GAME, 'utf8');
const gdSrc = fs.readFileSync(GD, 'utf8');

const errors = [];
const warnings = [];
const stat = { elements: 0, dom: 0, godot: 0, templates: 0, states: 0, events: 0 };

if (spec.schema_version !== 1) errors.push('spec.schema_version 不是 1');
if (!spec.id || !Array.isArray(spec.regions) || !Array.isArray(spec.elements)) {
  errors.push('spec 缺 id / regions / elements');
}
if (!Array.isArray(spec.templates) || spec.templates.length === 0) errors.push('spec 缺 templates');

/* ---------- 2.5D DOM ---------- */
const meetStart = domSrc.indexOf('<div id="meet"');
const meetEnd = domSrc.indexOf('<div id="end"');
if (meetStart < 0 || meetEnd < 0 || meetEnd <= meetStart) {
  errors.push('找不到 js/ui/templates.js 的会议面板 HTML 段');
} else {
  const html = domSrc.slice(meetStart, meetEnd);
  for (const el of spec.elements) {
    stat.elements++;
    if (!el.dom) continue;
    if (html.indexOf(`id="${el.dom}"`) < 0) {
      errors.push(`DOM 缺 #${el.dom}（${el.id}）`);
      continue;
    }
    stat.dom++;
    if (el.label && !el.label_dynamic && el.role !== 'select') {
      if (el.label_contains) {
        const m = html.match(new RegExp(`id="${el.dom}"[^>]*>([^<]*)<`));
        if (!m || !m[1].includes(el.label)) errors.push(`DOM #${el.dom} 文本不含「${el.label}」`);
      } else {
        const m = html.match(new RegExp(`id="${el.dom}"[^>]*>([^<]*)<`));
        if (!m || m[1].trim() !== el.label) {
          errors.push(`DOM #${el.dom} 文本「${m ? m[1].trim() : '?'}」≠ spec「${el.label}」`);
        }
      }
    }
    if (el.role === 'select' && el.label) {
      const tag = html.match(new RegExp(`<select id="${el.dom}"[^>]*>`));
      if (!tag || !tag[0].includes(`title="${el.label}"`)) {
        errors.push(`DOM #${el.dom} 缺 title="${el.label}"`);
      }
    }
    if (el.role === 'input' && el.placeholder) {
      if (!html.includes(`placeholder="${el.placeholder}"`)) {
        errors.push(`DOM #${el.dom} 缺 placeholder`);
      }
    }
  }
  /* 模板按钮：顺序、key、label 都要对 */
  const domTpl = [...html.matchAll(/<button data-tpl="([^"]+)">([^<]*)<\/button>/g)]
    .map(m => ({ key: m[1], label: m[2].trim() }));
  stat.templates = domTpl.length;
  if (domTpl.length !== spec.templates.length) {
    errors.push(`DOM 模板按钮 ${domTpl.length} 个 ≠ spec ${spec.templates.length} 个`);
  }
  for (let i = 0; i < Math.min(domTpl.length, spec.templates.length); i++) {
    if (domTpl[i].key !== spec.templates[i].key) {
      errors.push(`DOM 模板顺序 ${i}: ${domTpl[i].key} ≠ ${spec.templates[i].key}`);
    }
    if (domTpl[i].label !== spec.templates[i].label) {
      errors.push(`DOM 模板「${domTpl[i].key}」label「${domTpl[i].label}」≠ spec「${spec.templates[i].label}」`);
    }
  }
  /* 时段下拉 */
  const whenEl = spec.elements.find(e => e.id === 'm-tpl-when');
  if (whenEl && Array.isArray(whenEl.options)) {
    const block = html.match(/<select id="m-tpl-when"[\s\S]*?<\/select>/);
    const domOpts = block ? [...block[0].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)]
      .map(m => ({ value: m[1], label: m[2].trim() })) : [];
    if (domOpts.length !== whenEl.options.length) {
      errors.push(`DOM 时段选项 ${domOpts.length} 个 ≠ spec ${whenEl.options.length} 个`);
    } else {
      for (let i = 0; i < domOpts.length; i++) {
        if (domOpts[i].value !== whenEl.options[i].value || domOpts[i].label !== whenEl.options[i].label) {
          errors.push(`DOM 时段选项 ${i} 不一致`);
        }
      }
    }
  }
}

/* ---------- 3D Control 字段 ---------- */
for (const el of spec.elements) {
  if (!el.godot) continue;
  if (!new RegExp(`\\b${el.godot}\\b`).test(gdSrc)) {
    errors.push(`3D 缺字段/节点 ${el.godot}（${el.id}）`);
    continue;
  }
  stat.godot++;
  if (el.label && !el.label_dynamic && el.role === 'button') {
    const m = gdSrc.match(new RegExp(`${el.godot}\\.text\\s*=\\s*"([^"]*)"`));
    if (el.label_contains) {
      if (m && !m[1].includes(el.label)) errors.push(`3D ${el.godot} 文本不含「${el.label}」`);
    } else if (!m || m[1] !== el.label) {
      errors.push(`3D ${el.godot} 文本「${m ? m[1] : '?'}」≠ spec「${el.label}」`);
    }
  }
}
/* 3D 模板清单：_meeting_template_defs */
const defsBlock = gdSrc.match(/func _meeting_template_defs\(\)[\s\S]*?return \[([\s\S]*?)\n\t\]/);
if (!defsBlock) {
  errors.push('3D 找不到 _meeting_template_defs()');
} else {
  const defs = [...defsBlock[1].matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)]
    .map(m => ({ key: m[1], label: m[2] }));
  if (defs.length !== spec.templates.length) {
    errors.push(`3D 模板 ${defs.length} 个 ≠ spec ${spec.templates.length} 个`);
  }
  for (let i = 0; i < Math.min(defs.length, spec.templates.length); i++) {
    if (defs[i].key !== spec.templates[i].key) errors.push(`3D 模板顺序 ${i}: ${defs[i].key} ≠ ${spec.templates[i].key}`);
    if (defs[i].label !== spec.templates[i].label) {
      errors.push(`3D 模板「${defs[i].key}」label「${defs[i].label}」≠ spec「${spec.templates[i].label}」`);
    }
  }
  stat.templates = Math.max(stat.templates, defs.length);
}
/* 状态 / 事件 handler 必须真实存在 */
stat.states = (spec.states || []).length;
stat.events = (spec.events || []).length;
for (const st of spec.states || []) {
  if (!st.id || !st.condition || !Array.isArray(st.show)) errors.push(`state ${st.id} 字段不全`);
}
const handlerChecks = [
  ['_on_player_say', gdSrc], ['_on_meeting_template', gdSrc], ['_jump_feed_bottom', gdSrc],
  ['cast_vote', gdSrc], ['skip_discussion', gdSrc], ['skip_vote', gdSrc],
  ['sendPlayerSpeech', gameSrc], ['meetTemplateText', gameSrc], ['renderVoteButtons', gameSrc],
  ['startVote', gameSrc], ['finishMeeting', gameSrc], ['closeVote', gameSrc],
  ['clearNewLines', gameSrc],
];
for (const [name, src] of handlerChecks) {
  if (!new RegExp(`\\b${name}\\b`).test(src)) errors.push(`事件 handler 缺失：${name}`);
}
if (!/_meeting_can_act_now/.test(gdSrc)) errors.push('3D 缺 _meeting_can_act_now()（只读态）');
if (!/phase\s*==\s*"discuss"/.test(gdSrc) || !/phase\s*==\s*"vote"/.test(gdSrc)) {
  warnings.push('3D 没有同时出现 phase=="discuss" / phase=="vote" 的显式比较，状态可能由其他变量表达');
}

/* ---------- 报告 ---------- */
const md = [];
md.push('# 会议面板 UI spec 校验');
md.push('');
md.push(`生成时间：${new Date().toISOString()}`);
md.push('');
md.push(`- spec：\`3d/spec/ui/meeting-panel.spec.json\`（${spec.elements.length} 个元素 / ${spec.templates.length} 个模板）`);
md.push(`- DOM：\`js/ui/templates.js#meet\` 覆盖 **${stat.dom}/${stat.elements}** 个元素；模板 ${stat.templates} 个`);
md.push(`- Godot：\`main.gd#_build_meeting_ui\` 覆盖 **${stat.godot}/${stat.elements}** 个字段；状态 ${stat.states} / 事件 ${stat.events}`);
md.push(`- 结果：**${errors.length ? 'FAIL' : 'OK'}**（${errors.length} 错误 / ${warnings.length} 警告）`);
md.push('');
if (errors.length) {
  md.push('## 错误');
  md.push('');
  for (const e of errors) md.push('- ' + e);
  md.push('');
}
if (warnings.length) {
  md.push('## 警告');
  md.push('');
  for (const w of warnings) md.push('- ' + w);
  md.push('');
}
md.push('## 边界');
md.push('');
md.push('- 这是 UI **信息结构 / 状态 / 事件**契约，不是像素布局；');
md.push('- 3D 的 `meeting_time` / `meeting_hint` 是 2.5D `#m-sub` / `#m-ph` 的拆分等价物，列在 `extra_3d`；');
md.push('- 目前 2.5D DOM 是 spec 的来源，3D 是手工 Control；POC 已能从 spec 生成 Control，下一步才替换手写。');

if (process.argv.includes('--report')) {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, md.join('\n') + '\n', 'utf8');
}

if (errors.length) {
  console.log('UI-SPEC FAIL');
  for (const e of errors) console.log('  ERR  ' + e);
  for (const w of warnings) console.log('  WARN ' + w);
  process.exit(1);
}
console.log(`UI-SPEC OK  elements=${spec.elements.length} dom=${stat.dom} godot=${stat.godot} templates=${stat.templates} states=${stat.states} events=${stat.events}`);
for (const w of warnings) console.log('  WARN ' + w);
console.log('  report ' + path.relative(ROOT, REPORT));
