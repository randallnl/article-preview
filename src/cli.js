#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { stdin, stdout, stderr } from 'node:process';
import { scrapeUrls, toCsv } from './scrape.js';

const usage = `Usage: npm start -- [options] <url...>

Collect title, description, image, author, date, canonical URL, and Open Graph data.

Options:
  -f, --file <path>       Read one URL per line (blank lines and # comments ignored)
  -o, --output <path>     Write results to a file instead of stdout
      --format <json|csv> Output format (default: json)
  -c, --concurrency <n>   Parallel requests (default: 3)
      --timeout <ms>      Request timeout in milliseconds (default: 15000)
  -h, --help              Show this help

Examples:
  npm start -- https://example.com/article
  npm start -- --file links.txt --format csv --output previews.csv
  pbpaste | npm start -- --format json
`;

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => { data += chunk; });
    stdin.on('end', () => resolve(data));
    stdin.on('error', reject);
  });
}

function parseUrls(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

const args = process.argv.slice(2);
let file; let output; let format = 'json'; let concurrency = 3; let timeoutMs = 15000; const urls = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '-h' || arg === '--help') { stdout.write(usage); process.exit(0); }
  if (arg === '-f' || arg === '--file') file = args[++i];
  else if (arg === '-o' || arg === '--output') output = args[++i];
  else if (arg === '--format') format = args[++i]?.toLowerCase();
  else if (arg === '-c' || arg === '--concurrency') concurrency = Number(args[++i]);
  else if (arg === '--timeout') timeoutMs = Number(args[++i]);
  else if (arg.startsWith('-')) { stderr.write(`Unknown option: ${arg}\n\n${usage}`); process.exit(2); }
  else urls.push(arg);
}
if (!['json', 'csv'].includes(format)) { stderr.write('Format must be json or csv.\n'); process.exit(2); }
if (file) urls.push(...parseUrls(await readFile(file, 'utf8')));
if (urls.length === 0 && !stdin.isTTY) urls.push(...parseUrls(await readStdin()));
if (urls.length === 0) { stderr.write(usage); process.exit(2); }

const uniqueUrls = [...new Set(urls)];
stderr.write(`Scraping ${uniqueUrls.length} URL${uniqueUrls.length === 1 ? '' : 's'}...\n`);
const records = await scrapeUrls(uniqueUrls, { concurrency, timeoutMs });
const result = format === 'csv' ? toCsv(records) : `${JSON.stringify(records, null, 2)}\n`;
if (output) await writeFile(output, result, 'utf8'); else stdout.write(result);
stderr.write(`Done: ${records.filter((record) => record.ok).length}/${records.length} fetched successfully.\n`);
