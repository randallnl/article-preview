import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPreview, toCsv } from '../src/scrape.js';

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
