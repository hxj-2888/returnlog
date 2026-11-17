#!/usr/bin/env node
/* 给 Cloudflare Pages 项目写 R2 绑定（3D 部署流水线用）。
 *
 * 为什么需要它：`_worker.js` 要用 `env.ASSETS_R2` 从 R2 取超限的构建产物，
 * 而 `wrangler pages project create` / `pages deploy` 都不接受 R2 绑定参数，
 * 只能走 Pages 的 REST API 写 `deployment_configs.*.r2_buckets`。
 *
 * 字段口径（2026-11-13 取自 Cloudflare OpenAPI spec，GET 与 PATCH 同构）：
 *   deployment_configs.{production,preview}.r2_buckets 是**映射**，不是数组：
 *     {"ASSETS_R2": {"name": "returnlog-3d-assets"}}
 *   早期版本写成 `r2_bindings: [{binding, bucket_name}]` —— 键名与形状都不对，
 *   API 会“成功”返回但一个字段都不存（run 43349331544 连续假绿后在复核步失败）。
 *   同一条白名单里 kv / d1 / queue 的真名也分别是 kv_namespaces / d1_databases /
 *   queue_producers；写错键名等于不传，用这个工具绑别的项目时会把它们的绑定洗掉。
 *
 * PATCH 会整体替换该环境的 deployment_config，所以这里先 GET 再合并：
 * 只回写 schema 里可写的字段（WRITABLE），其余原样保留并在日志里点名。
 * 写完再 GET 复核（带退避 —— Pages 有读后写延迟），没绑上就直接失败：
 * 宁可 CI 红，也不要推上去一个打开就 500 的站点。
 *
 * 用法：CF_API_TOKEN=… CF_ACCOUNT_ID=… node 3d/tools/ensure-pages-project.cjs \
 *         --project returnlog-3d --bucket returnlog-3d-assets --binding ASSETS_R2 [--dry-run]
 * 退出码：0 = 绑定已在生产/预览两个环境生效（--dry-run 时 = 合并结果已打印、未发 PATCH）；
 *         1 = 权限不足 / 项目不存在 / 复核失败。
 */
'use strict';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const API = 'https://api.cloudflare.com/client/v4';

// Pages deployment_config 的可写字段，逐项来自 OpenAPI 的 projects.patch 请求体。
// wrangler_config_hash 是服务端算出来的，不回传。
const WRITABLE = [
  'ai_bindings', 'always_use_latest_compatibility_date', 'analytics_engine_datasets',
  'browsers', 'build_image_major_version', 'compatibility_date', 'compatibility_flags',
  'd1_databases', 'durable_object_namespaces', 'env_vars', 'fail_open',
  'hyperdrive_bindings', 'kv_namespaces', 'limits', 'mtls_certificates', 'placement',
  'queue_producers', 'r2_buckets', 'services', 'usage_model', 'vectorize_bindings',
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

// Pages 项目刚 create 完立刻 GET 会 404（2026-11-13 实跑：相隔 0.3 秒，CI 因此假红）。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getProject(base, { attempts, what }) {
  let got = await api('GET', base);
  for (let i = 0; i < attempts && !got.json.success && got.status === 404; i++) {
    const wait = Math.min(500 * 2 ** i, 8000);
    console.log(`PAGES ${what}尚未可见（HTTP 404），${wait}ms 后重试 ${i + 1}/${attempts}`);
    await sleep(wait);
    got = await api('GET', base);
  }
  return got;
}

(async () => {
  if (!TOKEN || !ACCOUNT) {
    console.error('PAGES FAIL 需要环境变量 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID（CI 里由 CF secrets 注入）');
    process.exit(1);
  }
  const project = argv('project', 'returnlog-3d');
  const bucket = argv('bucket', 'returnlog-3d-assets');
  const binding = argv('binding', 'ASSETS_R2');
  const dryRun = process.argv.includes('--dry-run');

  const base = `/accounts/${ACCOUNT}/pages/projects/${encodeURIComponent(project)}`;
  const got = await getProject(base, { attempts: 8, what: `项目 ${project} ` });
  if (!got.json.success) {
    console.error(`PAGES FAIL 读取 Pages 项目 ${project} 失败（HTTP ${got.status}）：${describeErrors(got.json)}`);
    if (got.status === 401 || got.status === 403) console.error('PAGES FAIL Token 缺 Pages:Edit 权限');
    if (got.status === 404) console.error('PAGES FAIL 项目不存在 —— 前一步 wrangler pages project create 没成功');
    process.exit(1);
  }

  const current = got.json.result.deployment_configs || {};
  const merged = {};
  for (const env of ['production', 'preview']) {
    const src = current[env] || {};
    const cfg = {};
    const dropped = [];
    for (const [k, v] of Object.entries(src)) {
      if (WRITABLE.includes(k)) cfg[k] = v;
      else if (v !== null && v !== undefined && v !== '') dropped.push(k);
    }
    const buckets = { ...(cfg.r2_buckets || {}) };
    buckets[binding] = { ...(buckets[binding] || {}), name: bucket };
    cfg.r2_buckets = buckets;
    merged[env] = cfg;
    console.log(`PAGES ${env}：绑定 ${binding} → ${bucket}` + (dropped.length ? `（只读字段不回传：${dropped.join(', ')}）` : ''));
  }

  if (dryRun) {
    console.log('PAGES DRY-RUN 将要 PATCH 的 body：');
    console.log(JSON.stringify({ deployment_configs: merged }, null, 2));
    console.log('PAGES OK（--dry-run 未发 PATCH）');
    return;
  }

  const patched = await api('PATCH', base, { deployment_configs: merged });
  if (!patched.json.success) {
    console.error(`PAGES FAIL 写入 R2 绑定失败（HTTP ${patched.status}）：${describeErrors(patched.json)}`);
    process.exit(1);
  }

  const has = (cfg, env) => {
    const rb = (cfg[env] || {}).r2_buckets || {};
    return !!(rb[binding] && rb[binding].name === bucket);
  };
  let miss = ['production', 'preview'];
  for (let i = 0; i < 6 && miss.length; i++) {
    if (i) {
      const wait = Math.min(500 * 2 ** (i - 1), 8000);
      console.log(`PAGES 绑定尚未可见（${miss.join(' / ')}），${wait}ms 后重试 ${i}/5`);
      await sleep(wait);
    }
    const verify = await api('GET', base);
    const cfg = (verify.json.result && verify.json.result.deployment_configs) || {};
    miss = ['production', 'preview'].filter((env) => !has(cfg, env));
  }
  if (miss.length) {
    console.error(`PAGES FAIL 复核未通过：${miss.join(' / ')} 环境仍无 ${binding} → ${bucket}`);
    process.exit(1);
  }
  console.log(`PAGES OK ${project} 的 production / preview 均已绑定 ${binding} → ${bucket}`);
})().catch((e) => {
  console.error('PAGES FAIL ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
