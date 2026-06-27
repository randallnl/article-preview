const META_TAG = /<meta\b[^>]*>/gi;
const LINK_TAG = /<link\b[^>]*>/gi;
const TITLE_TAG = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function decodeHtml(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10)));
}

export function repairMojibake(value = '') {
  return value
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€�/g, '"')
    .replace(/â€³/g, '"')
    .replace(/â€“/g, '–')
    .replace(/â€”/g, '—')
    .replace(/â€¦/g, '…')
    .replace(/â€¢/g, '•')
    .replace(/Â©/g, '©')
    .replace(/Â®/g, '®')
    .replace(/Â°/g, '°')
    .replace(/Â±/g, '±')
    .replace(/Â·/g, '·')
    .replace(/Â /g, ' ')
    .replace(/Â(?=[\s"'.,;:!?()[\]{}-])/g, '');
}

export function cleanText(value) {
  return repairMojibake(decodeHtml(value ?? '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(ATTR)) {
    const name = match[1].toLowerCase();
    if (name === 'meta' || name === 'link') continue;
    result[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function absolute(value, pageUrl) {
  if (!value) return null;
  try { return new URL(value, pageUrl).href; } catch { return cleanText(value) || null; }
}

function first(...values) {
  return values.find((value) => value && cleanText(value)) ?? null;
}

/** Extract a social/article preview record without executing page JavaScript. */
export function extractPreview(html, pageUrl) {
  const meta = new Map();
  for (const tag of html.match(META_TAG) ?? []) {
    const attrs = attributes(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
  }

  let canonical = null;
  for (const tag of html.match(LINK_TAG) ?? []) {
    const attrs = attributes(tag);
    if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) {
      canonical = absolute(attrs.href, pageUrl);
      break;
    }
  }
  const titleMatch = html.match(TITLE_TAG);
  const titleTag = titleMatch ? titleMatch[1] : null;
  const image = first(meta.get('og:image:secure_url'), meta.get('og:image'), meta.get('twitter:image'), meta.get('twitter:image:src'));

  return {
    url: pageUrl,
    canonicalUrl: canonical,
    title: cleanText(first(meta.get('og:title'), meta.get('twitter:title'), titleTag)),
    description: cleanText(first(meta.get('og:description'), meta.get('twitter:description'), meta.get('description'))),
    imageUrl: absolute(image, pageUrl),
    author: cleanText(first(meta.get('article:author'), meta.get('author'))),
    publishedAt: cleanText(first(meta.get('article:published_time'), meta.get('date'), meta.get('publishdate'), meta.get('datepublished'))),
    siteName: cleanText(first(meta.get('og:site_name'), meta.get('application-name'))),
    type: cleanText(first(meta.get('og:type')))
  };
}

async function readTextLimited(response, maxBytes) {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error(`HTML response exceeds the ${maxBytes}-byte limit`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(`HTML response exceeds the ${maxBytes}-byte limit`);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function scrapeUrl(url, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const fetchedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'ArticlePreviewScraper/0.1 (+https://example.invalid)' }
      });
    } finally {
      clearTimeout(timer);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) throw new Error(`Expected HTML but received ${contentType || 'an unknown content type'}`);
    const preview = extractPreview(await readTextLimited(response, 2_000_000), response.url);
    return { ...preview, inputUrl: url, status: response.status, ok: response.ok, fetchedAt, error: null };
  } catch (error) {
    return { inputUrl: url, url: null, canonicalUrl: null, title: null, description: null, imageUrl: null, author: null, publishedAt: null, siteName: null, type: null, status: null, ok: false, fetchedAt, error: error.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : error.message };
  }
}

export async function scrapeUrls(urls, options = {}) {
  const concurrency = Math.max(1, Number(options.concurrency) || 3);
  const results = new Array(urls.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const index = next++;
      results[index] = await scrapeUrl(urls[index], options);
    }
  }));
  return results;
}

export function toCsv(records) {
  const headers = ['inputUrl', 'url', 'canonicalUrl', 'title', 'description', 'imageUrl', 'author', 'publishedAt', 'siteName', 'type', 'status', 'ok', 'fetchedAt', 'error'];
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...records.map((record) => headers.map((key) => cell(record[key])).join(','))].join('\n') + '\n';
}
