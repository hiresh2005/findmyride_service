import { chromium } from 'playwright';
import { scraperConfig } from '../../config/scraper.js';
import logger from '../../utils/logger.js';
import { randomDelay, withRetry } from '../../utils/retry.js';

/**
 * BaseScraper — manages the Playwright browser lifecycle and provides shared
 * helpers (navigation, retry, delay) for all concrete scraper implementations.
 */
export default class BaseScraper {
  constructor(sourceName) {
    this.sourceName = sourceName;
    this.browser = null;
    this.context = null;
    this.config = scraperConfig[sourceName];
    this.browserConfig = scraperConfig.browser;
  }

  // ── Browser lifecycle ────────────────────────────────────────────────────────

  async launch() {
    logger.info(`[${this.sourceName}] Launching browser`);
    this.browser = await chromium.launch({
      headless: this.browserConfig.headless,
    });
    this.context = await this.browser.newContext({
      userAgent: this.browserConfig.userAgent,
      viewport: this.browserConfig.viewport,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        ...this.config.extraHeaders,
      },
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      logger.info(`[${this.sourceName}] Browser closed`);
    }
  }

  // ── Page helpers ─────────────────────────────────────────────────────────────

  /**
   * Opens a new page, navigates to url with retry logic, returns the page.
   * Caller is responsible for closing the page when done.
   *
   * @param {string} url
   * @returns {Promise<import('playwright').Page>}
   */
  async openPage(url) {
    const page = await this.context.newPage();

    await withRetry(
      () =>
        page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.browserConfig.navigationTimeoutMs,
        }),
      {
        maxAttempts: this.browserConfig.maxRetries,
        baseDelayMs: 2_000,
        label: `navigate(${url})`,
      }
    );

    return page;
  }

  /**
   * Navigates an existing page to a new URL with retry.
   *
   * @param {import('playwright').Page} page
   * @param {string} url
   */
  async navigatePage(page, url) {
    await withRetry(
      () =>
        page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.browserConfig.navigationTimeoutMs,
        }),
      {
        maxAttempts: this.browserConfig.maxRetries,
        baseDelayMs: 2_000,
        label: `navigate(${url})`,
      }
    );
  }

  /**
   * Pauses for a random polite delay between requests.
   */
  async politeDelay() {
    await randomDelay(this.browserConfig.minDelayMs, this.browserConfig.maxDelayMs);
  }

  // ── Concurrent stub processor ─────────────────────────────────────────────────

  /**
   * Processes an array of listing stubs with a bounded concurrency pool.
   *
   * Stubs are split into chunks of `browserConfig.concurrency` size. Each
   * chunk is processed with Promise.all (parallel tabs), then a single polite
   * delay before the next chunk. This gives an ~N× speedup while keeping the
   * request rate manageable.
   *
   * Concrete scrapers must implement `_processListing(stub, stats, runStart)`.
   *
   * @param {object[]} stubs
   * @param {object}   stats      - shared mutable counters
   * @param {Date}     runStart
   */
  async processStubs(stubs, stats, runStart) {
    const concurrency = this.browserConfig.concurrency;

    for (let i = 0; i < stubs.length; i += concurrency) {
      const chunk = stubs.slice(i, i + concurrency);

      await Promise.all(
        chunk.map((stub) =>
          this._processListing(stub, stats, runStart).catch((err) => {
            stats.errorCount++;
            logger.error(
              `[${this.sourceName}] Error processing listing ${stub.listingId}`,
              { error: err.message }
            );
          })
        )
      );

      const processed = Math.min(i + concurrency, stubs.length);
      logger.info(`[${this.sourceName}] Progress: ${processed}/${stubs.length} listings`);

      if (processed < stubs.length) {
        await this.politeDelay();
      }
    }
  }

  // ── Template method — subclasses must implement ───────────────────────────────

  /**
   * Run the full scrape for this source.
   * Must be implemented by each concrete scraper.
   *
   * @returns {Promise<{ newCount: number, updatedCount: number, deactivatedCount: number }>}
   */
  // eslint-disable-next-line no-unused-vars
  async run() {
    throw new Error(`${this.sourceName} scraper must implement run()`);
  }
}
