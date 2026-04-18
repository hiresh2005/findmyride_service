import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const ImageSchema = new Schema(
  {
    url: { type: String, required: true },
    thumbnail: { type: String, default: null },
  },
  { _id: false }
);

const PriceSchema = new Schema(
  {
    amount: { type: Number, default: null },
    isNegotiable: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Main Vehicle Schema ───────────────────────────────────────────────────────

const VehicleSchema = new Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    vehicleId:       { type: String, required: true, unique: true, index: true },
    source:          { type: String, required: true, enum: ['ikman', 'riyasewana'], index: true },
    sourceListingId: { type: String, required: true, index: true },
    sourceUrl:       { type: String, default: null },

    // ── Classification ────────────────────────────────────────────────────────
    // Common category names — normalised from each site's own naming
    category: {
      type: String,
      enum: ['Sedan', 'Hatchback', 'Wagon', 'Coupe', 'Convertible', 'SUV', 'Jeep', 'Cab', 'Van', 'Car', null],
      default: null,
      index: true,
    },

    // ── Core vehicle fields ───────────────────────────────────────────────────
    brand:             { type: String, default: null, index: true },
    model:             { type: String, default: null, index: true },
    year:              { type: Number, default: null, index: true },
    limitedEditionName:{ type: String, default: null },

    // ── Specs ─────────────────────────────────────────────────────────────────
    price:          { type: PriceSchema, default: () => ({}) },
    mileage:        { type: Number, default: null },   // km
    engineCapacity: { type: Number, default: null },   // cc

    // ── Content ───────────────────────────────────────────────────────────────
    images:      { type: [ImageSchema], default: [] },
    description: { type: String, default: null },

    // ── Text enrichment (extracted from description) ───────────────────────────
    owners:           { type: Number, default: null },         // number of previous owners
    features:         { type: [String], default: [] },         // sunroof, CarPlay, etc.
    companyMaintained:{ type: Boolean, default: null },
    interiorColor:    { type: String, default: null },         // from description text

    // ── Image enrichment (derived from image analysis) ────────────────────────
    exteriorColor:    { type: String, default: null },         // from exterior images
    interiorColorFromImage: { type: String, default: null },   // from interior images

    // ── Enrichment tracking ────────────────────────────────────────────────────
    textEnrichedAt:  { type: Date, default: null },
    imageEnrichedAt: { type: Date, default: null },

    // ── Versioning & lifecycle ────────────────────────────────────────────────
    version:       { type: Number, default: 1 },
    isActive:      { type: Boolean, default: true, index: true },
    scrapedAt:     { type: Date, required: true },
    lastUpdatedAt: { type: Date, required: true },
  },
  {
    timestamps: false,
    collection: 'vehicles',
  }
);

// ── Compound indexes ──────────────────────────────────────────────────────────
VehicleSchema.index({ source: 1, sourceListingId: 1 }, { unique: true });
VehicleSchema.index({ brand: 1, model: 1, year: 1 });
VehicleSchema.index({ category: 1, isActive: 1 });
VehicleSchema.index({ isActive: 1, scrapedAt: -1 });

export default model('Vehicle', VehicleSchema);
