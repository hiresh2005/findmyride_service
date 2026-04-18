import BaseScraper from '../base/BaseScraper.js';
import { parseListPage, parseTotalPages, parseDetailPage } from './parser.js';
import VehicleService from '../../services/VehicleService.js';
import IkmanListing from '../../models/IkmanListing.js';
import logger from '../../utils/logger.js';
import { scraperConfig } from '../../config/scraper.js';

export default class IkmanScraper extends BaseScraper {
  constructor() {
    super('ikman');
  }

  // ── Entry point ──────────────────────────────────────────────────────────────

  async run() {
    const runStart = new Date();
    const stats = { newCount: 0, updatedCount: 0, deactivatedCount: 0, errorCount: 0 };

    await this.launch();

    try {
      for (const category of this.config.categories) {
        logger.info(`[ikman] Starting category: ${category.name}`);
        await this._scrapeCategory(category, runStart, stats);
      }

      // Mark listings not seen in this run as inactive
      const deactivated = await IkmanListing.updateMany(
        { lastScrapedAt: { $lt: runStart }, isActive: true },
        { $set: { isActive: false } }
      );
      stats.deactivatedCount = deactivated.modifiedCount;

      logger.info('[ikman] Run complete', stats);
    } finally {
      await this.close();
    }

    return stats;
  }

  // ── Category scrape ──────────────────────────────────────────────────────────

  async _scrapeCategory(category, runStart, stats) {
    const limit = this.browserConfig.maxListingsPerCategory;
    let totalScraped = 0;

    const shouldStop = () => limit > 0 && totalScraped >= limit;

    const processPage = async (initialData) => {
      let stubs = parseListPage(initialData, category.category);
      if (limit > 0) {
        stubs = stubs.slice(0, limit - totalScraped);
      }
      await this.processStubs(stubs, stats, runStart);
      totalScraped += stubs.length;
    };

    const page = await this.openPage(category.url);
    let totalPages = 1;

    try {
      const initialData = await this._extractInitialData(page);
      if (!initialData) {
        logger.warn(`[ikman] No window.initialData found on ${category.url}`);
        return;
      }

      totalPages = parseTotalPages(initialData);
      logger.info(`[ikman] Category "${category.name}" — ${totalPages} pages${limit > 0 ? `, limit ${limit}` : ''}`);

      await processPage(initialData);
    } finally {
      await page.close();
    }

    // Pages 2..N
    for (let pageNum = 2; pageNum <= totalPages && !shouldStop(); pageNum++) {
      const url = `${category.url}?${this.config.pageQueryParam}=${pageNum}`;
      logger.debug(`[ikman] Fetching list page ${pageNum}/${totalPages} — ${url}`);

      const listPage = await this.openPage(url);
      try {
        const initialData = await this._extractInitialData(listPage);
        if (!initialData) {
          logger.warn(`[ikman] No initialData on page ${pageNum}, skipping`);
          continue;
        }
        await processPage(initialData);
      } finally {
        await listPage.close();
      }

      await this.politeDelay();
    }
  }

  async _processListing(stub, stats, runStart) {
    if (!stub.listingId) return;

    const existing = await IkmanListing.findOne({ listingId: stub.listingId });
    const now = new Date();

    // Fetch detail page for new listings or stale ones (not scraped in last 24h)
    const needsDetail =
      !existing ||
      !existing.detailPageData ||
      now - existing.lastScrapedAt > 24 * 60 * 60 * 1_000;

    let parsed = { ...stub };
    let rawDetailData = null;

    if (needsDetail && stub.sourceUrl) {
      logger.debug(`[ikman] Fetching detail page: ${stub.sourceUrl}`);
      const detailPage = await this.openPage(stub.sourceUrl);

      try {
        rawDetailData = await this._extractInitialData(detailPage);
        if (rawDetailData) {
          parsed = { ...stub, ...parseDetailPage(rawDetailData, stub) };
        }
      } finally {
        await detailPage.close();
      }

      await this.politeDelay();
    }

    // Upsert raw listing
    const upsertResult = await IkmanListing.findOneAndUpdate(
      { listingId: stub.listingId },
      {
        $set: {
          slug: stub.slug,
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

    // Upsert unified vehicle
    const vehicleId = await VehicleService.upsert('ikman', stub.listingId, parsed);

    // Back-link vehicleId on raw listing
    if (upsertResult.vehicleId !== vehicleId) {
      await IkmanListing.updateOne({ listingId: stub.listingId }, { $set: { vehicleId } });
    }

    if (!existing) {
      stats.newCount++;
    } else {
      stats.updatedCount++;
    }
  }

  // ── window.initialData extractor ─────────────────────────────────────────────

  async _extractInitialData(page) {
    try {
      return await page.evaluate(() => {
        /* global window */
        return window.initialData ?? null;
      });
    } catch {
      return null;
    }
  }
}
