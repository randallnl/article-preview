import { scrapeUrl } from './scrape.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff'
};

function configuredOrigins(value) {
  return (value ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
}

function isAllowedOrigin(origin, allowedOrigins) {
  return allowedOrigins.includes(origin);
}

function headersFor(request, env) {
  const headers = new Headers(JSON_HEADERS);
  const origin = request.headers.get('origin');
  if (origin && isAllowedOrigin(origin, configuredOrigins(env.ALLOWED_ORIGIN))) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return headers;
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(request, env) });
}

function isPublicHttpUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
  return true;
}

async function handlePreview(request, env, scrape) {
  let body;
  try { body = await request.json(); } catch { return json(request, env, { error: 'Request body must be valid JSON.' }, 400); }
  const targetUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!isPublicHttpUrl(targetUrl)) {
    return json(request, env, { error: 'url must be a public http or https URL.' }, 400);
  }
  const result = await scrape(targetUrl, { timeoutMs: 10_000 });
  return json(request, env, result, result.error ? 502 : 200);
}

export function createWorker({ scrape = scrapeUrl } = {}) {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      const origin = request.headers.get('origin');
      const allowedOrigins = configuredOrigins(env.ALLOWED_ORIGIN);

      if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
        return json(request, env, { error: 'Origin is not allowed.' }, 403);
      }
      if (request.method === 'OPTIONS') {
        const headers = headersFor(request, env);
        headers.set('access-control-allow-methods', 'POST, OPTIONS');
        headers.set('access-control-allow-headers', 'content-type, authorization');
        headers.set('access-control-max-age', '86400');
        return new Response(null, { status: 204, headers });
      }
      if (env.API_KEY && request.headers.get('authorization') !== `Bearer ${env.API_KEY}`) {
        return json(request, env, { error: 'Unauthorized.' }, 401);
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(request, env, { ok: true, service: 'article-preview' });
      }
      if (request.method === 'POST' && url.pathname === '/preview') return handlePreview(request, env, scrape);
      return json(request, env, { error: 'Not found. Use GET /health or POST /preview.' }, 404);
    }
  };
}

export default createWorker();
