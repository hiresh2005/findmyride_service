import 'dotenv/config';
import { connectDB } from './src/config/database.js';
import { startScheduler } from './src/scheduler/index.js';
import logger from './src/utils/logger.js';

async function main() {
  logger.info('FindMyRide Scraper Service starting...');

  // Connect to MongoDB Atlas
  await connectDB();

  // Register cron jobs
  startScheduler();

  logger.info('Scraper service running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
