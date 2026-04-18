import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/database.js';
import ScraperOrchestrator from '../services/ScraperOrchestrator.js';
import logger from '../utils/logger.js';

// Optional: node src/scripts/scrape.js --source riyasewana
const sourceArg = (() => {
  const i = process.argv.indexOf('--source');
  return i >= 0 ? process.argv[i + 1] : null;
})();

async function main() {
  await connectDB();
  try {
    if (sourceArg) {
      await ScraperOrchestrator.runOne(sourceArg);
    } else {
      await ScraperOrchestrator.runAll();
    }
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  logger.error('Scrape failed', { error: err.message });
  process.exit(1);
});
