import cron from 'node-cron';
import ScraperOrchestrator from '../services/ScraperOrchestrator.js';
import { scraperConfig } from '../config/scraper.js';
import logger from '../utils/logger.js';

// Guard: track in-progress runs to avoid overlapping executions
const running = {
  ikman: false,
  riyasewana: false,
};

function scheduleJob(name, expression) {
  if (!cron.validate(expression)) {
    logger.error(`[Scheduler] Invalid cron expression for ${name}: "${expression}"`);
    return;
  }

  cron.schedule(expression, async () => {
    if (running[name]) {
      logger.warn(`[Scheduler] ${name} is already running — skipping this tick`);
      return;
    }

    running[name] = true;
    logger.info(`[Scheduler] Triggered ${name} scraper`);

    try {
      await ScraperOrchestrator.runOne(name);
    } catch (err) {
      logger.error(`[Scheduler] ${name} scraper error`, { error: err.message });
    } finally {
      running[name] = false;
    }
  });

  logger.info(`[Scheduler] ${name} scheduled — cron: "${expression}"`);
}

/**
 * Registers all cron jobs. Call once after DB connection is established.
 */
export function startScheduler() {
  scheduleJob('ikman', scraperConfig.cron.ikman);
  scheduleJob('riyasewana', scraperConfig.cron.riyasewana);
}
