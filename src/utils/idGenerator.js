/**
 * Generates a unique FindMyRide vehicle ID.
 *
 * Format: FMR-{SOURCE_PREFIX}-{SOURCE_LISTING_ID}
 *
 * Examples:
 *   FMR-IKM-123456789
 *   FMR-RIY-98765432
 */

const SOURCE_PREFIXES = {
  ikman: 'IKM',
  riyasewana: 'RIY',
};

/**
 * @param {'ikman' | 'riyasewana'} source
 * @param {string | number} sourceListingId
 * @returns {string}
 */
export function generateVehicleId(source, sourceListingId) {
  const prefix = SOURCE_PREFIXES[source];
  if (!prefix) {
    throw new Error(`Unknown source "${source}". Expected one of: ${Object.keys(SOURCE_PREFIXES).join(', ')}`);
  }

  if (!sourceListingId) {
    throw new Error('sourceListingId is required to generate a vehicle ID');
  }

  return `FMR-${prefix}-${sourceListingId}`;
}
