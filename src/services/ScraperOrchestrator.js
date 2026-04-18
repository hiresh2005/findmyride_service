import IkmanScraper from '../scrapers/ikman/IkmanScraper.js';
import RiyasewanaScraper from '../scrapers/riyasewana/RiyasewanaScraper.js';
import logger from '../utils/logger.js';
import { scraperConfig } from '../config/scraper.js';

/**
 * ScraperOrchestrator — coordinates execution of all scraper instances.
 * Handles individual scraper failures gracefully so one failing source
 * does not abort the other.
 */
const ScraperOrchestrator = {
  /**
   * Runs a single named scraper with a hard timeout guard.
   *
   * @param {'ikman' | 'riyasewana'} name
   * @returns {Promise<object>} run stats
   */
  async runOne(name) {
    const scrapers = {
      ikman: () => new IkmanScraper(),
      riyasewana: () => new RiyasewanaScraper(),
    };

    const factory = scrapers[name];
    if (!factory) throw new Error(`Unknown scraper "${name}"`);

    logger.info(`[Orchestrator] Starting scraper: ${name}`);
    const scraper = factory();

    const timeoutMs = scraperConfig.runTimeoutMs;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Scraper "${name}" exceeded timeout of ${timeoutMs}ms`)),
        timeoutMs
      )
    );

    try {
      const stats = await Promise.race([scraper.run(), timeoutPromise]);
      logger.info(`[Orchestrator] ${name} finished`, stats);
      return stats;
    } catch (err) {
      // Ensure browser is closed even on error / timeout
      try {
        await scraper.close();
      } catch (_) {
        // ignore close errors
      }
      logger.error(`[Orchestrator] ${name} failed`, { error: err.message });
      throw err;
    }
  },

  /**
   * Runs all scrapers sequentially. A failure in one does not stop the others.
   *
   * @returns {Promise<Record<string, object>>} stats keyed by scraper name
   */
  async runAll() {
    const sources = ['ikman', 'riyasewana'];
    const results = {};

    for (const name of sources) {
      try {
        results[name] = await ScraperOrchestrator.runOne(name);
      } catch (err) {
        results[name] = { error: err.message };
      }
    }

    logger.info('[Orchestrator] All scrapers complete', results);
    return results;
  },
};

export default ScraperOrchestrator;
