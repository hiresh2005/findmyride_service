/**
 * One-off diagnostic script — dumps riyasewana listing card HTML to
 * logs/riyasewana-inspect.html so we can identify the correct CSS selectors.
 *
 * Run: node src/scripts/inspect-riyasewana.js
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, '..', '..', 'logs');
mkdirSync(logsDir, { recursive: true });

const URL = 'https://riyasewana.com/search/cars';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  console.log(`Navigating to ${URL} ...`);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Dump the full page body HTML
  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  const outPath = join(logsDir, 'riyasewana-inspect.html');
  writeFileSync(outPath, bodyHTML, 'utf8');
  console.log(`\nHTML written to: ${outPath}`);

  // Grab the first detail page URL then dump it
  const firstDetailUrl = await page.evaluate(() => {
    const link = document.querySelector('li.item h2.more a');
    return link?.href ?? null;
  });

  if (firstDetailUrl) {
    console.log(`\nFetching detail page: ${firstDetailUrl}`);
    await page.goto(firstDetailUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const detailHTML = await page.evaluate(() => document.body.innerHTML);
    const detailPath = join(logsDir, 'riyasewana-detail-inspect.html');
    writeFileSync(detailPath, detailHTML, 'utf8');
    console.log(`Detail HTML written to: ${detailPath}`);
  }

  await browser.close();
})();
