# Article Preview Scraper

A dependency-free Node.js CLI for collecting the metadata that article links use in previews: title, description, image, author, publication date, canonical URL, and site name. It reads static HTML only; sites that render metadata solely in client-side JavaScript will need a browser-based follow-up.

## Quick start

Requires Node.js 18 or later.

```sh
npm test
npm start -- https://example.com/article
```

Use a `links.txt` file with one link per line:

```text
# A comment is ignored
https://example.com/first-article
https://example.org/another-article
```

```sh
npm start -- --file links.txt --format csv --output previews.csv
```

You can also pipe URLs in:

```sh
pbpaste | npm start -- --format json
```

## Output

Each record includes `inputUrl`, final `url` after redirects, `canonicalUrl`, `title`, `description`, `imageUrl`, `author`, `publishedAt`, `siteName`, `type`, HTTP `status`, `ok`, `fetchedAt`, and `error`.

The scraper prioritizes Open Graph tags (`og:title`, `og:description`, `og:image`) and falls back to Twitter cards, standard description tags, and the HTML `<title>`. Relative canonical and image links are converted to absolute URLs.

## Notes

Use a modest concurrency setting and comply with each site's terms of use and robots policy. This tool deliberately does not bypass paywalls, logins, bot protections, or access controls.

## Cloudflare Worker API

This repository now includes a Worker API. The Worker exposes:

- `GET /health` — health check
- `POST /preview` — scrape one article URL

Before deploying, set the Worker variable `ALLOWED_ORIGIN` in the Cloudflare dashboard to your site origin, such as `https://www.example.com`. Multiple origins can be separated by commas. This allows browser requests only from your site. Optionally set an `API_KEY` secret and send it from a trusted server using `Authorization: Bearer <API_KEY>`; do not put this secret in browser JavaScript.

```sh
npm install
npm run dev
```

Call the locally running Worker:

```sh
curl -X POST http://localhost:8787/preview \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/article"}'
```

From your site, after replacing the URL with your deployed Worker URL:

```js
const response = await fetch('https://article-preview.<your-subdomain>.workers.dev/preview', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ url: articleUrl })
});
const preview = await response.json();
```

For a CLI deploy, run `npm run deploy`; your connected Git repository may also deploy automatically on a push. The API rejects localhost and common private-network addresses, uses a 10-second fetch timeout, and caps HTML at 2 MB. It still intentionally does not bypass paywalls, logins, bot protections, or access controls.
