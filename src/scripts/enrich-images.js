/**
 * Image enrichment batch script — ikman vehicles only
 *
 * Riyasewana vehicles have their images classified inline during scraping
 * (via Playwright route interception), so this script skips them.
 *
 * Usage:
 *   node src/scripts/enrich-images.js              # process all pending ikman vehicles
 *   node src/scripts/enrich-images.js --limit 50   # test with 50 vehicles
 *   node src/scripts/enrich-images.js --rerun      # reprocess already-enriched vehicles
 *
 * Colors are detected by GPT-4o mini (all images sent in a single API call).
 * Cost: ~$0.0002 per vehicle. Requires OPENAI_API_KEY in .env
 * Results are stored back on the vehicle document:
 *   exteriorColor (only if null — not overwriting scraped spec color),
 *   interiorColorFromImage, imageEnrichedAt
 */

import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/database.js';
import Vehicle from '../models/Vehicle.js';
import { enrichImages } from '../services/ImageEnrichmentService.js';
import VehicleService from '../services/VehicleService.js';
import logger from '../utils/logger.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const LIMIT     = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();
const RERUN     = args.includes('--rerun');
// How many vehicles to process in parallel
const VEHICLE_CONCURRENCY = 3;
// How many images per vehicle to run through CLIP in parallel.
// Keep at 2: CLIP inference is CPU-bound, higher values thrash without gain.
const IMAGE_CONCURRENCY   = 2;

// ── Batch query ────────────────────────────────────────────────────────────────

function buildQuery() {
  const base = {
    'images.0': { $exists: true },  // must have at least 1 image
    source: { $ne: 'riyasewana' },  // riyasewana is handled inline during scraping
  };
  if (!RERUN) base.imageEnrichedAt = null;  // skip already-enriched unless --rerun
  return base;
}

// ── Concurrency pool ───────────────────────────────────────────────────────────

/**
 * Runs `fn` on each item in `items`, at most `concurrency` at a time.
 */
async function pool(items, concurrency, fn) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ── Per-vehicle processing ────────────────────────────────────────────────────

async function processVehicle(vehicle, index, total) {
  const label = `[${index + 1}/${total}] ${vehicle.vehicleId}`;
  try {
    const imageColors = await enrichImages(
      vehicle.images,
      { concurrency: IMAGE_CONCURRENCY }
    );

    await VehicleService.setImageColors(vehicle.vehicleId, imageColors);

    const extSource = vehicle.exteriorColor
      ? `${vehicle.exteriorColor} (scraped)`
      : (imageColors.exteriorColor ?? 'n/a');
    logger.info(
      `${label} → ext: ${extSource} | int: ${imageColors.interiorColorFromImage ?? 'n/a'}`
    );
  } catch (err) {
    logger.error(`${label} failed: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await connectDB();

  const query = buildQuery();
  let cursor = Vehicle.find(query, { _id: 1, vehicleId: 1, images: 1, exteriorColor: 1 });
  if (LIMIT > 0) cursor = cursor.limit(LIMIT);

  const vehicles = await cursor.lean();
  const total    = vehicles.length;

  logger.info(`[enrich-images] ${total} ikman vehicles to process (limit=${LIMIT || 'none'}, rerun=${RERUN})`);

  if (!total) {
    logger.info('[enrich-images] Nothing to do.');
    await disconnectDB();
    return;
  }

  await pool(
    vehicles,
    VEHICLE_CONCURRENCY,
    (v, i) => processVehicle(v, i, total)
  );

  logger.info('[enrich-images] Done.');
  await disconnectDB();
}

main().catch((err) => {
  logger.error(`[enrich-images] Fatal: ${err.message}`);
  process.exit(1);
});
