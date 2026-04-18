import Vehicle from '../models/Vehicle.js';
import { generateVehicleId } from '../utils/idGenerator.js';
import { enrichFromText, normaliseColor, extractColorFromTitle } from './TextEnrichmentService.js';
import logger from '../utils/logger.js';

const VehicleService = {
  async upsert(source, sourceListingId, parsed) {
    const vehicleId = generateVehicleId(source, sourceListingId);
    const now = new Date();

    // Text enrichment runs inline — pure regex, no I/O
    const textData = enrichFromText(parsed.description);

    const scrapedColor = normaliseColor(parsed.color ?? null)
                      ?? extractColorFromTitle(parsed.title ?? null);

    const fields = {
      vehicleId,
      source,
      sourceListingId: String(sourceListingId),
      sourceUrl:        parsed.sourceUrl ?? null,

      category:           parsed.category ?? null,
      brand:              parsed.brand ?? null,
      model:              parsed.model ?? null,
      year:               parsed.year ?? null,
      limitedEditionName: parsed.limitedEditionName ?? null,

      price: {
        amount:       parsed.price?.amount ?? null,
        isNegotiable: parsed.price?.isNegotiable ?? false,
      },
      mileage:        parsed.mileage ?? null,
      engineCapacity: parsed.engineCC ?? null,   // parsers still use engineCC internally

      images:      parsed.photos ?? [],           // parsers still call this field photos
      description: parsed.description ?? null,

      // Text enrichment
      owners:            textData.owners,
      features:          textData.features,
      companyMaintained: textData.companyMaintained,
      textEnrichedAt:    now,

      isActive:      true,
      scrapedAt:     now,
      lastUpdatedAt: now,
    };

    // Only $set interiorColor from text if we found one — preserves image-derived value
    if (textData.interiorColor) fields.interiorColor = textData.interiorColor;

    // Only $set exteriorColor from scrape if we found one — preserves image-derived value
    // on re-scrapes (otherwise a re-scrape would null out the color CLIP already filled in).
    if (scrapedColor) fields.exteriorColor = scrapedColor;

    await Vehicle.findOneAndUpdate(
      { source, sourceListingId: String(sourceListingId) },
      {
        $set: fields,
        $setOnInsert: { version: 1 },             // version=1 only on first insert
      },
      { upsert: true }
    );

    logger.debug(`[VehicleService] Upserted vehicle ${vehicleId}`);
    return vehicleId;
  },

  /**
   * Writes image-derived color results for a vehicle.
   * Only fills in colors that aren't already set by scraping/text-enrichment,
   * so the color source priority (spec > title > CLIP) is respected.
   */
  async setImageColors(vehicleId, { exteriorColor, interiorColorFromImage }) {
    const now = new Date();
    await Vehicle.updateOne(
      { vehicleId },
      [
        {
          $set: {
            exteriorColor: {
              $cond: [
                { $or: [{ $eq: ['$exteriorColor', null] }, { $not: ['$exteriorColor'] }] },
                exteriorColor ?? null,
                '$exteriorColor',
              ],
            },
            interiorColor: {
              $cond: [
                { $or: [{ $eq: ['$interiorColor', null] }, { $not: ['$interiorColor'] }] },
                interiorColorFromImage ?? null,
                '$interiorColor',
              ],
            },
            interiorColorFromImage: interiorColorFromImage ?? null,
            imageEnrichedAt:        now,
            lastUpdatedAt:          now,
          },
        },
      ]
    );
  },

  async deactivateStaleListing(source, runStart) {
    const result = await Vehicle.updateMany(
      { source, scrapedAt: { $lt: runStart }, isActive: true },
      { $set: { isActive: false, lastUpdatedAt: new Date() } }
    );
    logger.info(`[VehicleService] Deactivated ${result.modifiedCount} stale ${source} vehicles`);
    return result.modifiedCount;
  },
};

export default VehicleService;
