/**
 * migrate-colors.js
 *
 * One-time migration that backfills vehicles.exteriorColor for existing
 * ikman records without requiring a full re-scrape.
 *
 * Color is sourced in priority order:
 *   1. parsed.color  — already extracted by the parser (post-fix scrapes)
 *   2. detailPageData — raw JSON still on the listing; we re-parse the
 *      adDetail.data.ad.properties array to find the 'colour' spec.
 *      This covers listings scraped before the parser extracted color.
 *
 * Usage:
 *   node src/scripts/migrate-colors.js             # only fill null exteriorColor
 *   node src/scripts/migrate-colors.js --force     # overwrite even existing values
 *
 * Safe to run multiple times — vehicles already updated are skipped unless
 * --force is supplied.
 */

import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/database.js';
import IkmanListing from '../models/IkmanListing.js';
import Vehicle from '../models/Vehicle.js';
import { normaliseColor } from '../services/TextEnrichmentService.js';
import logger from '../utils/logger.js';

const FORCE = process.argv.includes('--force');

/**
 * Extracts the colour value from raw detailPageData when parsed.color is absent.
 * Looks for a property with key 'colour' or 'color' in ad.properties.
 */
function colorFromDetailData(detailPageData) {
  const properties = detailPageData?.adDetail?.data?.ad?.properties;
  if (!Array.isArray(properties)) return null;
  for (const prop of properties) {
    const key = (prop.key ?? '').toLowerCase().trim();
    if (key === 'colour' || key === 'color') {
      return prop.value ?? null;
    }
  }
  return null;
}

async function main() {
  await connectDB();

  // Fetch all ikman listings linked to a vehicle (with or without parsed.color)
  const listings = await IkmanListing.find(
    { vehicleId: { $ne: null } },
    { vehicleId: 1, 'parsed.color': 1, detailPageData: 1 }
  ).lean();

  logger.info(`[migrate-colors] ${listings.length} ikman listings linked to vehicles`);

  let updated = 0;
  let skipped = 0;
  let unrecognised = 0;
  let noColor = 0;

  for (const listing of listings) {
    // Try parsed.color first, then fall back to raw detailPageData
    const rawColor =
      (listing.parsed?.color?.trim() || null) ??
      colorFromDetailData(listing.detailPageData);

    if (!rawColor) {
      noColor++;
      continue;
    }

    const normalised = normaliseColor(rawColor);
    if (!normalised) {
      logger.debug(`[migrate-colors] Unrecognised color: "${rawColor}"`);
      unrecognised++;
      continue;
    }

    const filter = FORCE
      ? { vehicleId: listing.vehicleId }
      : { vehicleId: listing.vehicleId, exteriorColor: null };

    const result = await Vehicle.updateOne(
      filter,
      { $set: { exteriorColor: normalised, lastUpdatedAt: new Date() } }
    );

    if (result.modifiedCount > 0) {
      updated++;
      logger.debug(`[migrate-colors] ${listing.vehicleId}: "${rawColor}" → "${normalised}"`);
    } else {
      skipped++;
    }
  }

  logger.info(
    `[migrate-colors] Done — updated: ${updated} | skipped (already set): ${skipped} | unrecognised: ${unrecognised} | no color data: ${noColor}`
  );

  await disconnectDB();
}

main().catch((err) => {
  logger.error(`[migrate-colors] Fatal: ${err.message}`);
  process.exit(1);
});
