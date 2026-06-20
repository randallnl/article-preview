import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPreview, toCsv } from '../src/scrape.js';
import { createWorker } from '../src/worker.js';

const html = `<!doctype html><html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="A &amp; B: An Article">
  <meta name="description" content="A short &quot;summary&quot;.">
  <meta property="og:image" content="/images/cover.jpg">
  <meta property="article:author" content="Ada Lovelace">
  <meta property="article:published_time" content="2026-06-20T08:30:00Z">
  <meta property="og:site_name" content="Example News">
  <meta property="og:type" content="article">
  <link rel="canonical" href="/articles/a-b">
</head></html>`;

test('extractPreview prefers Open Graph fields and resolves relative URLs', () => {
  const result = extractPreview(html, 'https://news.example/story');
  assert.deepEqual(result, {
    url: 'https://news.example/story', canonicalUrl: 'https://news.example/articles/a-b',
    title: 'A & B: An Article', description: 'A short "summary".',
    imageUrl: 'https://news.example/images/cover.jpg', author: 'Ada Lovelace',
    publishedAt: '2026-06-20T08:30:00Z', siteName: 'Example News', type: 'article'
  });
});

test('toCsv escapes quoted content', () => {
  assert.match(toCsv([{ inputUrl: 'https://example.com', title: 'A "quote"' }]), /"A ""quote"""/);
});

test('worker validates input and returns scraper output', async () => {
  const worker = createWorker({ scrape: async (url) => ({ url, title: 'Preview', ok: true, error: null }) });
  const env = { ALLOWED_ORIGIN: 'https://my-site.example' };
  const response = await worker.fetch(new Request('https://worker.example/preview', {
    method: 'POST', headers: { origin: 'https://my-site.example', 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://news.example/article' })
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://my-site.example');
  assert.equal((await response.json()).title, 'Preview');

  const invalid = await worker.fetch(new Request('https://worker.example/preview', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1' })
  }), env);
  assert.equal(invalid.status, 400);
});
