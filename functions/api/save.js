// ===== functions/api/save.js — 网页版云端存档/战绩同步接口（支持 KV 或内存降级） =====

const UID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const memFallback = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const uid = (new URL(request.url).searchParams.get('uid') || '').trim();
  if (!UID_RE.test(uid)) return json({ ok: false, error: '无效的 uid' }, 400);

  if (env && env.SAVE_KV) {
    const raw = await env.SAVE_KV.get(`save:${uid}`, 'json');
    return json({ ok: true, storage: 'kv', data: raw || null });
  }
  return json({ ok: true, storage: 'memory', data: memFallback.get(uid) || null });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const uid = (new URL(request.url).searchParams.get('uid') || request.headers.get('x-client-id') || '').trim();
  if (!UID_RE.test(uid)) return json({ ok: false, error: '无效的 uid' }, 400);

  const text = await request.text();
  if (text.length > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: '存档数据超过 64KB 上限' }, 413);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'JSON 格式无效' }, 400);
  }

  const record = { updatedAt: new Date().toISOString(), payload: parsed };
  if (env && env.SAVE_KV) {
    await env.SAVE_KV.put(`save:${uid}`, JSON.stringify(record));
    return json({ ok: true, storage: 'kv', updatedAt: record.updatedAt });
  }
  if (memFallback.size > 500) {
    const first = memFallback.keys().next().value;
    memFallback.delete(first);
  }
  memFallback.set(uid, record);
  return json({ ok: true, storage: 'memory', updatedAt: record.updatedAt });
}
