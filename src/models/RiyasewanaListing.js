import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Raw riyasewana.com listing data — preserved exactly as extracted from the site.
 */
const RiyasewanaListingSchema = new Schema(
  {
    // Riyasewana's own listing ID (extracted from URL or page)
    listingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sourceUrl: { type: String, default: null },

    // ── List-page data ────────────────────────────────────────────────────────
    listPageData: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // ── Detail-page data ──────────────────────────────────────────────────────
    detailPageData: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // Parsed fields extracted by parser.js (for quick reference)
    parsed: {
      title: String,
      brand: String,
      model: String,
      variant: String,
      year: Number,
      price: {
        amount: Number,
        currency: String,
        isNegotiable: Boolean,
        rawText: String,
      },
      mileage: Number,
      fuelType: String,
      transmission: String,
      engineCC: Number,
      color: String,
      doors: Number,
      seats: Number,
      condition: String,
      category: String,
      location: {
        city: String,
        district: String,
        province: String,
        rawText: String,
      },
      sellerType: String,
      sellerName: String,
      sellerContact: String,
      description: String,
      photos: [{ url: String, thumbnail: String }],
      postedAt: Date,
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    firstScrapedAt: { type: Date, required: true },
    lastScrapedAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
    vehicleId: { type: String, default: null, index: true },
  },
  {
    timestamps: false,
    collection: 'riyasewana_listings',
  }
);

RiyasewanaListingSchema.index({ lastScrapedAt: -1 });

export default model('RiyasewanaListing', RiyasewanaListingSchema);
