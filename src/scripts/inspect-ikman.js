/**
 * One-off diagnostic — dumps ikman window.initialData structure to logs/
 *
 * Run: node src/scripts/inspect-ikman.js
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logsDir = join(__dirname, '..', '..', 'logs');
mkdirSync(logsDir, { recursive: true });

const LIST_URL = 'https://ikman.lk/en/ads/sri-lanka/cars';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  // ── LIST PAGE ────────────────────────────────────────────────────────────────
  const page = await context.newPage();
  console.log(`Navigating to ${LIST_URL} ...`);
  await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 30_000 });

  const listResult = await page.evaluate(() => {
    /* global window */
    const d = window.initialData ?? null;
    if (!d) return { found: false };

    const adsArr = d?.serp?.ads?.data?.ads ?? [];
    const topAds = d?.serp?.ads?.data?.topAds ?? [];
    const pagination = d?.serp?.ads?.data?.paginationData ?? null;
    const firstAd = adsArr[0] ?? null;

    return {
      found: true,
      adsCount: adsArr.length,
      topAdsCount: topAds.length,
      pagination,
      firstAdKeys: firstAd ? Object.keys(firstAd) : null,
      firstAd,
    };
  });

  console.log('\n=== LIST PAGE ===');
  console.log('ads count    :', listResult.adsCount);
  console.log('topAds count :', listResult.topAdsCount);
  console.log('pagination   :', JSON.stringify(listResult.pagination, null, 2));
  console.log('\nFirst ad:\n', JSON.stringify(listResult.firstAd, null, 2)?.slice(0, 1500));
  writeFileSync(join(logsDir, 'ikman-list.json'), JSON.stringify(listResult, null, 2), 'utf8');

  const slug = listResult.firstAd?.slug;
  await page.close();

  // ── DETAIL PAGE ──────────────────────────────────────────────────────────────
  if (!slug) {
    console.log('\nNo slug found, skipping detail page.');
    await browser.close();
    return;
  }

  const detailUrl = `https://ikman.lk/en/ad/${slug}`;
  console.log(`\n=== DETAIL PAGE ===\nNavigating to ${detailUrl} ...`);

  const dPage = await context.newPage();
  // Use 'load' instead of 'networkidle' — detail pages can have long-polling that never settles
  await dPage.goto(detailUrl, { waitUntil: 'load', timeout: 45_000 });
  // Extra wait for JS hydration
  await dPage.waitForTimeout(3000);

  const detailResult = await dPage.evaluate(() => {
    /* global window */
    const d = window.initialData ?? null;
    if (!d) return { found: false };

    const topLevelKeys = Object.keys(d);
    const adDetail = d.adDetail ?? null;
    const adDetailKeys = adDetail ? Object.keys(adDetail) : null;

    // Dig into adDetail structure
    let adDetailStructure = null;
    if (adDetail && typeof adDetail === 'object') {
      adDetailStructure = {};
      for (const [k, v] of Object.entries(adDetail)) {
        const isArr = Array.isArray(v);
        adDetailStructure[k] = isArr
          ? `array[${v.length}]`
          : v && typeof v === 'object'
            ? { type: 'object', keys: Object.keys(v).slice(0, 10) }
            : { type: typeof v, val: String(v).slice(0, 80) };
      }
    }

    return {
      found: true,
      topLevelKeys,
      adDetailKeys,
      adDetailStructure,
      adDetailFull: adDetail,
    };
  });

  console.log('topLevelKeys  :', detailResult.topLevelKeys);
  console.log('adDetailKeys  :', detailResult.adDetailKeys);
  console.log('\nadDetail structure:');
  console.log(JSON.stringify(detailResult.adDetailStructure, null, 2));
  console.log('\nadDetail (full, first 3000 chars):');
  console.log(JSON.stringify(detailResult.adDetailFull, null, 2)?.slice(0, 3000));

  writeFileSync(join(logsDir, 'ikman-detail.json'), JSON.stringify(detailResult, null, 2), 'utf8');

  await dPage.close();
  await browser.close();

  console.log('\nOutputs written to logs/ikman-list.json and logs/ikman-detail.json');
})();
