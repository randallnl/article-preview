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
