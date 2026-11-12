#!/usr/bin/env node
/* 给 Cloudflare Pages 项目补上 R2 绑定（3D 部署流水线用）。
 *
 * 为什么需要它：`_worker.js` 要用 `env.ASSETS_R2` 从 R2 取超限的构建产物，
 * 而 `wrangler pages project create` / `pages deploy` 都不接受 R2 绑定参数，
 * 只能走 Pages 的 REST API 写 `deployment_configs.*.r2_bindings`。
 *
 * PATCH 会整体替换该环境的 deployment_config，所以这里先 GET 再合并：
 * 只回写「已知可写」的字段（白名单），其余原样保留并在日志里点名，
 * 免得某个既有设置（环境变量 / usage_model）被这次部署静默抹掉。
 * 写完再 GET 一次复核，没绑上就直接失败 —— 宁可 CI 红，也不要推上去一个
 * 打开就 500 的站点。
 *
 * 前置：项目本身由 CI 里的 `wrangler pages project create` 建（它会写合法的
 * compatibility_date），本工具只负责绑定；项目不存在时直接失败并说明。
 *
 * 用法：CF_API_TOKEN=… CF_ACCOUNT_ID=… node 3d/tools/ensure-pages-project.cjs \
 *         --project returnlog-3d --bucket returnlog-3d-assets --binding ASSETS_R2
 * 退出码：0 = 绑定已在生产/预览两个环境生效；1 = 权限不足 / 项目不存在 / 复核失败。
 */
'use strict';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const API = 'https://api.cloudflare.com/client/v4';

// Pages deployment_config 里可安全回写的字段；deployment_id 等只读字段一律不回传。
// 字段清单取自 2026-11-12 对现网 returnlog 项目 GET 的实际读数：
//   env_vars, fail_open, always_use_latest_compatibility_date, compatibility_date,
//   compatibility_flags, build_image_major_version, usage_model
const WRITABLE = [
  'env_vars', 'build_vars',
  'fail_open', 'fail_fast', 'usage_model',
  'compatibility_date', 'compatibility_flags',
  'always_use_latest_compatibility_date', 'build_image_major_version',
  'kv_namespace_bindings', 'd1_bindings', 'r2_bindings', 'queue_bindings', 'ai',
];

function argv(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  return process.argv[i + 1] || dflt;
}

async function api(method, pathname, body) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ success: false, errors: [{ message: 'HTTP ' + res.status + ' 非 JSON 响应' }] }));
  return { ok: res.ok, status: res.status, json };
}

function describeErrors(json) {
  const errs = (json.errors || []).map((e) => `${e.code || '?'} ${e.message}`).join(' | ');
  return errs || '未知错误';
}

(async () => {
  if (!TOKEN || !ACCOUNT) {
    console.error('PAGES FAIL 需要环境变量 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID（CI 里由 CF secrets 注入）');
    process.exit(1);
  }
  const project = argv('project', 'returnlog-3d');
  const bucket = argv('bucket', 'returnlog-3d-assets');
  const binding = argv('binding', 'ASSETS_R2');

  const base = `/accounts/${ACCOUNT}/pages/projects/${encodeURIComponent(project)}`;
  const got = await api('GET', base);
  if (!got.json.success) {
    console.error(`PAGES FAIL 读取 Pages 项目 ${project} 失败（HTTP ${got.status}）：${describeErrors(got.json)}`);
    if (got.status === 401 || got.status === 403) console.error('PAGES FAIL Token 缺 Pages:Edit 权限');
    if (got.status === 404) console.error('PAGES FAIL 项目不存在 —— 前一步 wrangler pages project create 没成功');
    process.exit(1);
  }

  const current = got.json.result.deployment_configs || {};
  const want = { binding, bucket_name: bucket };
  const merged = {};
  for (const env of ['production', 'preview']) {
    const src = current[env] || {};
    const cfg = {};
    const dropped = [];
    for (const [k, v] of Object.entries(src)) {
      if (WRITABLE.includes(k)) cfg[k] = v;
      else if (v !== null && v !== undefined && v !== '') dropped.push(k);
    }
    const list = (cfg.r2_bindings || []).filter((b) => b && b.binding !== binding);
    cfg.r2_bindings = [...list, want];
    merged[env] = cfg;
    console.log(`PAGES ${env}：绑定 ${binding} → ${bucket}` + (dropped.length ? `（只读字段不回传：${dropped.join(', ')}）` : ''));
  }

  const patched = await api('PATCH', base, { deployment_configs: merged });
  if (!patched.json.success) {
    console.error(`PAGES FAIL 写入 R2 绑定失败（HTTP ${patched.status}）：${describeErrors(patched.json)}`);
    process.exit(1);
  }

  const verify = await api('GET', base);
  const cfg = (verify.json.result && verify.json.result.deployment_configs) || {};
  const miss = ['production', 'preview'].filter(
    (env) => !((cfg[env] || {}).r2_bindings || []).some((b) => b.binding === binding && b.bucket_name === bucket)
  );
  if (miss.length) {
    console.error(`PAGES FAIL 复核未通过：${miss.join(' / ')} 环境仍无 ${binding} 绑定`);
    process.exit(1);
  }
  console.log(`PAGES OK ${project} 的 production / preview 均已绑定 ${binding} → ${bucket}`);
})().catch((e) => {
  console.error('PAGES FAIL ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
