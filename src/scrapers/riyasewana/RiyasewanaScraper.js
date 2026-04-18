import BaseScraper from '../base/BaseScraper.js';
import { parseListPage, parseDetailPage } from './parser.js';
import VehicleService from '../../services/VehicleService.js';
import RiyasewanaListing from '../../models/RiyasewanaListing.js';
import { enrichFromBuffers } from '../../services/ImageEnrichmentService.js';
import logger from '../../utils/logger.js';

export default class RiyasewanaScraper extends BaseScraper {
  constructor() {
    super('riyasewana');
  }

  // ── Entry point ──────────────────────────────────────────────────────────────

  async run() {
    const runStart = new Date();
    const stats = { newCount: 0, updatedCount: 0, deactivatedCount: 0, errorCount: 0 };

    await this.launch();

    try {
      for (const category of this.config.categories) {
        logger.info(`[riyasewana] Starting category: ${category.name}`);
        await this._scrapeCategory(category, runStart, stats);
      }

      const deactivated = await RiyasewanaListing.updateMany(
        { lastScrapedAt: { $lt: runStart }, isActive: true },
        { $set: { isActive: false } }
      );
      stats.deactivatedCount = deactivated.modifiedCount;

      logger.info('[riyasewana] Run complete', stats);
    } finally {
      await this.close();
    }

    return stats;
  }

  // ── Category scrape ──────────────────────────────────────────────────────────

  async _scrapeCategory(category, runStart, stats) {
    const limit = this.browserConfig.maxListingsPerCategory;
    let totalScraped = 0;
    let pageNum = 1;
    let hasMore = true;

    while (hasMore && !(limit > 0 && totalScraped >= limit)) {
      const url =
        pageNum === 1
          ? category.url
          : `${category.url}?${this.config.pageQueryParam}=${pageNum}`;

      logger.info(`[riyasewana] Fetching list page ${pageNum} — ${url}`);

      const page = await this.openPage(url);
      let stubs = [];

      try {
        const rawListings = await this._extractListings(page);

        if (!rawListings.length) {
          logger.info(`[riyasewana] No listings on page ${pageNum}, stopping`);
          hasMore = false;
          continue;
        }

        stubs = parseListPage(rawListings, category.category);
        if (limit > 0) stubs = stubs.slice(0, limit - totalScraped);

        hasMore = await this._hasNextPage(page);

        logger.info(`[riyasewana] Page ${pageNum} — ${stubs.length} listings, hasMore=${hasMore}${limit > 0 ? `, limit ${limit}` : ''}`);
      } finally {
        await page.close();
      }

      await this.processStubs(stubs, stats, runStart);
      totalScraped += stubs.length;
      pageNum++;
      await this.politeDelay();
    }
  }

  // ── List page DOM extraction ─────────────────────────────────────────────────

  async _extractListings(page) {
    return page.evaluate(() => {
      const cards = document.querySelectorAll('li.v-card');

      return Array.from(cards).map((card) => {
        const linkEl = card.querySelector('.v-card-title a');
        if (!linkEl) return null;

        const href = linkEl.getAttribute('href') ?? '';
        const fullUrl = href.startsWith('http') ? href : `https://riyasewana.com${href}`;

        // Listing ID is the trailing number in the slug: e.g. "-11496924"
        const idMatch = href.match(/-(\d+)\/?$/);
        const listingId = idMatch ? idMatch[1] : null;

        const imgEl = card.querySelector('.v-card-img img');
        let thumbnail = imgEl?.getAttribute('src') ?? null;
        if (thumbnail && thumbnail.startsWith('//')) thumbnail = `https:${thumbnail}`;

        // Meta div contains: <svg/>Location<span class="v-sep">·</span><svg/>18,022 km
        // SVGs contribute no text so textContent = "Location·18,022 km"
        const metaText = card.querySelector('.v-card-meta')?.textContent?.trim() ?? '';
        const metaParts = metaText.split('·');
        const location = metaParts[0]?.trim() || null;
        const mileageRaw = metaParts[1]?.replace(/km/i, '').trim() || null;

        return {
          listingId,
          sourceUrl: listingId ? fullUrl : null,
          title: linkEl.textContent?.trim() ?? null,
          price: card.querySelector('.v-card-price')?.textContent?.trim() ?? null,
          location,
          thumbnail,
          mileage: mileageRaw,
          postedAt: card.querySelector('.v-card-date')?.textContent?.trim() ?? null,
        };
      }).filter((item) => !!item?.listingId);
    });
  }

  async _hasNextPage(page) {
    return page.evaluate(() => {
      const pagination = document.querySelector('.pagination');
      if (!pagination) return false;
      const links = Array.from(pagination.querySelectorAll('a[href]'));
      if (!links.length) return false;
      const lastLink = links[links.length - 1];
      return lastLink?.textContent?.trim().toLowerCase() === 'next';
    });
  }

  async _processListing(stub, stats, runStart) {
    if (!stub.listingId) return;

    const existing = await RiyasewanaListing.findOne({ listingId: stub.listingId });
    const now = new Date();

    const needsDetail =
      !existing ||
      !existing.detailPageData ||
      now - existing.lastScrapedAt > 24 * 60 * 60 * 1_000;

    let parsed = { ...stub };
    let rawDetailData = null;
    let imageBuffers = [];   // captured via route interception

    if (needsDetail && stub.sourceUrl) {
      logger.debug(`[riyasewana] Fetching detail page: ${stub.sourceUrl}`);

      // Open page manually so we can capture images as the browser loads them.
      // Using page.on('response') instead of page.route() — no extra HTTP
      // requests, no double latency, no risk of blocking page load.
      const detailPage = await this.context.newPage();

      try {
        // Collect response promises so we can await them all before closing.
        /** @type {Promise<void>[]} */
        const responsePromises = [];
        const MAX_CAPTURE = 6;   // capture at most 6 images for GPT

        detailPage.on('response', (response) => {
          if (imageBuffers.length >= MAX_CAPTURE) return;
          if (!response.ok()) return;
          const url = response.url();
          // Match jpg/jpeg/webp/png regardless of query params
          if (!/\.(jpe?g|webp|png)(\?|#|$)/i.test(url)) return;

          responsePromises.push(
            response.body()
              .then((buf) => { if (buf.length > 5_000) imageBuffers.push(buf); })
              .catch(() => {})   // ignore aborted / unavailable bodies
          );
        });

        await detailPage.goto(stub.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await detailPage.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});
        // Drain any in-flight response body reads
        await Promise.allSettled(responsePromises);

        rawDetailData = await this._extractDetailData(detailPage);
        if (rawDetailData) {
          parsed = { ...stub, ...parseDetailPage(rawDetailData, stub) };
        }
      } finally {
        await detailPage.close();
      }

      await this.politeDelay();
    }

    const upsertResult = await RiyasewanaListing.findOneAndUpdate(
      { listingId: stub.listingId },
      {
        $set: {
          sourceUrl: stub.sourceUrl,
          listPageData: stub._raw ?? null,
          ...(rawDetailData ? { detailPageData: rawDetailData } : {}),
          parsed,
          lastScrapedAt: runStart,
          isActive: true,
        },
        $setOnInsert: { firstScrapedAt: runStart },
      },
      { upsert: true, new: true }
    );

    const vehicleId = await VehicleService.upsert('riyasewana', stub.listingId, parsed);

    if (upsertResult.vehicleId !== vehicleId) {
      await RiyasewanaListing.updateOne({ listingId: stub.listingId }, { $set: { vehicleId } });
    }

    // GPT-4o mini color detection from captured image buffers.
    // Only runs when we fetched the detail page and intercepted images.
    if (imageBuffers.length > 0) {
      try {
        const imageColors = await enrichFromBuffers(imageBuffers);
        await VehicleService.setImageColors(vehicleId, imageColors);
        logger.info(
          `[riyasewana] ${vehicleId} colors (${imageBuffers.length} imgs) — ext: ${imageColors.exteriorColor ?? 'n/a'} | int: ${imageColors.interiorColorFromImage ?? 'n/a'}`
        );
      } catch (err) {
        logger.warn(`[riyasewana] GPT color detection failed for ${vehicleId}: ${err.message}`);
      }
    } else if (needsDetail) {
      logger.info(`[riyasewana] ${vehicleId} — no images captured, colors skipped`);
    }

    if (!existing) {
      stats.newCount++;
    } else {
      stats.updatedCount++;
    }
  }

  // ── Detail page DOM extraction ───────────────────────────────────────────────

  async _extractDetailData(page) {
    return page.evaluate(() => {
      // ── Spec table (table.moret) ───────────────────────────────────────────
      // Each row has pairs of: <td><p class="moreh">Key</p></td><td>Value</td>
      const specs = {};
      const headerCells = document.querySelectorAll('table.moret p.moreh');
      headerCells.forEach((headerEl) => {
        const key = headerEl.textContent.trim().toLowerCase();
        const valueTd = headerEl.closest('td')?.nextElementSibling;
        if (!valueTd) return;
        // Price and contact are wrapped in span.moreph
        const spanVal = valueTd.querySelector('span.moreph');
        const value = (spanVal?.textContent ?? valueTd.textContent).trim();
        if (key && value && value !== '-') specs[key] = value;
      });

      // ── Title ──────────────────────────────────────────────────────────────
      const title = document.querySelector('#content h1')?.textContent?.trim() ?? null;

      // ── Posted-by line: "Posted by {name} on {date}, {location}" ──────────
      const metaEl = document.querySelector('#content h2');
      const metaText = metaEl?.textContent?.trim() ?? '';
      const metaMatch = metaText.match(/Posted by (.+?) on ([\d-]+ [\d:]+ [apm]+),\s*(.+)/i);
      const sellerName = metaMatch ? metaMatch[1].trim() : null;
      const postedAt = metaMatch ? metaMatch[2].trim() : null;
      const location = metaMatch ? metaMatch[3].trim() : null;

      // ── Photos ────────────────────────────────────────────────────────────
      // Thumbnails: src = thumb URL, alt = full-size URL
      const thumbImgs = document.querySelectorAll('#thumbs .thumb img');
      const photos = Array.from(thumbImgs).map((img) => ({
        url: img.getAttribute('alt'),       // full-size
        thumbnail: img.getAttribute('src'), // thumbnail
      })).filter((p) => p.url);

      // Fallback to main image if no thumbs
      if (!photos.length) {
        const mainImg = document.querySelector('#main-image');
        if (mainImg?.src) photos.push({ url: mainImg.src, thumbnail: mainImg.src });
      }

      return { title, sellerName, postedAt, location, photos, specs };
    });
  }
}
