// ===== functions/_middleware.js — 新返航录全站流量检测 + 轻量防刷 + 80%/95% 用量预警 =====

const BOT_UA_RE = /(scrapy|python-urllib|sqlmap|nikto|masscan|zgrab|nmap|dirbuster|gobuster)/i;
const WINDOW_MS = 60_000;
const MAX_PER_IP = 180;
const MAX_API_PER_IP = 60;
const DAILY_REQ_LIMIT = 80_000;

const ipWindows = new Map();
const apiWindows = new Map();

function bjDay(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

let state = {
  day: bjDay(),
  total: 0,
  api: 0,
  pv: 0,
  b429: 0,
  b403: 0,
  ips: new Set(),
  warned80: false,
  warned95: false,
};

function rollDay(now) {
  const today = bjDay(now);
  if (today !== state.day) {
    state = {
      day: today,
      total: 0,
      api: 0,
      pv: 0,
      b429: 0,
      b403: 0,
      ips: new Set(),
      warned80: false,
      warned95: false,
    };
  }
}

function hitWindow(map, ip, limit, now) {
  if (map.size > 2000) {
    for (const [k, v] of map) {
      if (now - v.ts > WINDOW_MS) map.delete(k);
    }
  }
  const entry = map.get(ip);
  if (!entry || now - entry.ts > WINDOW_MS) {
    map.set(ip, { ts: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

function getQuotaStatus() {
  const ratio = state.total / DAILY_REQ_LIMIT;
  return {
    day: state.day,
    reqCount: state.total,
    reqLimit: DAILY_REQ_LIMIT,
    percent: Math.round(ratio * 1000) / 10,
    warning: ratio >= 0.8,
    degraded: ratio >= 0.95,
  };
}

function record(request, status, isApi) {
  const now = Date.now();
  rollDay(now);
  state.total++;
  if (isApi) state.api++;
  else if (request.method === 'GET' && status < 400) state.pv++;
  if (status === 429) state.b429++;
  else if (status === 403) state.b403++;

  const ip = request.headers.get('cf-connecting-ip');
  if (ip && state.ips.size < 5000) state.ips.add(ip.trim());

  const quota = getQuotaStatus();
  if (quota.warning && !state.warned80) {
    state.warned80 = true;
    console.warn('[quota-alert:returnlog] 80% threshold reached:', JSON.stringify(quota));
  }
  if (quota.degraded && !state.warned95) {
    state.warned95 = true;
    console.error('[quota-alert:returnlog] 95% threshold reached, degraded mode:', JSON.stringify(quota));
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const now = Date.now();
  rollDay(now);

  const url = new URL(request.url);
  const path = url.pathname;
  const isApi = path.startsWith('/api/');

  if (path === '/api/telemetry' && request.method === 'GET') {
    const needKey = (env && (env.TELEMETRY_KEY || env.PROXY_KEY)) || '';
    if (needKey) {
      const got =
        request.headers.get('x-telemetry-key') ||
        request.headers.get('x-proxy-key') ||
        url.searchParams.get('key') ||
        '';
      if (got !== needKey) {
        return new Response(JSON.stringify({ ok: false, error: '未授权访问监控接口' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    }
    return new Response(
      JSON.stringify({
        ok: true,
        project: 'returnlog',
        realtime: {
          day: state.day,
          totalRequests: state.total,
          apiRequests: state.api,
          pageViews: state.pv,
          blocked429: state.b429,
          blocked403: state.b403,
          uniqueIpsSample: state.ips.size,
        },
        quota: getQuotaStatus(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const ua = request.headers.get('user-agent') || '';
  if (BOT_UA_RE.test(ua)) {
    record(request, 403, isApi);
    return new Response('Forbidden', { status: 403 });
  }

  const ip = request.headers.get('cf-connecting-ip') || '';
  if (ip) {
    if (isApi && !hitWindow(apiWindows, ip, MAX_API_PER_IP, now)) {
      record(request, 429, true);
      return new Response(JSON.stringify({ ok: false, error: '请求过于频繁，请稍后再试' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' },
      });
    }
    if (!isApi && !hitWindow(ipWindows, ip, MAX_PER_IP, now)) {
      record(request, 429, false);
      return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
    }
  }

  const res = await context.next();
  if (request.method !== 'OPTIONS') {
    record(request, res.status, isApi);
  }
  const quota = getQuotaStatus();
  if (!quota.warning) return res;
  const headers = new Headers(res.headers);
  headers.set('X-Quota-Warning', `${quota.percent}%`);
  if (quota.degraded) headers.set('X-Quota-Degraded', '1');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
