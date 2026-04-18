import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Raw ikman.lk listing data — preserved exactly as extracted from the site.
 * This collection acts as the source-of-truth audit log for ikman data.
 */
const IkmanListingSchema = new Schema(
  {
    // Ikman's own numeric listing ID
    listingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    slug: { type: String, default: null },
    sourceUrl: { type: String, default: null },

    // ── List-page data (from window.initialData) ──────────────────────────────
    listPageData: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // ── Detail-page data (from individual ad page) ────────────────────────────
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
    // Reference to the unified vehicles collection
    vehicleId: { type: String, default: null, index: true },
  },
  {
    timestamps: false,
    collection: 'ikman_listings',
  }
);

IkmanListingSchema.index({ lastScrapedAt: -1 });

export default model('IkmanListing', IkmanListingSchema);
