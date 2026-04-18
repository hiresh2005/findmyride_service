/**
 * ikman.lk parser
 *
 * ikman embeds all listing data in `window.initialData`.
 *
 * List page:  window.initialData.serp.ads.data.ads  (+ topAds)
 * Pagination: window.initialData.serp.ads.data.paginationData
 * Detail page: window.initialData.adDetail.data.ad
 *              └─ properties: [{ key, label, value, value_key }]
 */

// ── Price helpers ─────────────────────────────────────────────────────────────

function parsePrice(raw) {
  if (!raw) return { amount: null, isNegotiable: false };

  const isNegotiable = /negotiable/i.test(raw);
  // Strip leading currency prefix (Rs, Rs., LKR, etc.) then remove commas
  const cleaned = raw.replace(/^[^\d]+/, '').replace(/,/g, '').trim();
  const amount = cleaned ? parseFloat(cleaned) : null;

  return {
    amount: isNaN(amount) ? null : amount,
    isNegotiable,
  };
}

// ── Mileage helpers ───────────────────────────────────────────────────────────

function parseMileage(raw) {
  if (!raw) return null;
  const num = parseFloat(raw.replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parsePostedAt(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw;

  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);

  const now = new Date();
  const lower = s.toLowerCase().trim();

  if (lower === 'just now') return now;

  const match = lower.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?/);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = match[2];
    const ms = {
      second: 1_000,
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
      year: 365 * 86_400_000,
    }[unit];
    return new Date(now.getTime() - val * ms);
  }

  return null;
}

// ── Image URL helpers ─────────────────────────────────────────────────────────

/**
 * Handles two ikman image formats:
 *
 * Detail page — images.meta = [{ src: "https://i.ikman-st.com/{slug}/{uuid}", alt: "..." }, ...]
 *   The src already includes the ad slug — append size suffix directly.
 *
 * List page   — images = { ids: [...UUIDs], base_uri: "https://i.ikman-st.com" }
 *   UUIDs only, no slug embedded. Requires the ad slug to build a valid CDN URL.
 *
 * ikman CDN URL format:  https://i.ikman-st.com/{slug}/{uuid}/{width}/{height}/cropped.jpg
 *   Confirmed sizes:  540/405 (full), 142/107 (thumbnail)
 *   Suffixes like /large and /small are NOT valid and return HTTP 404.
 *
 * @param {object} images  - The images object from ikman's initialData
 * @param {string} [slug]  - Ad slug (e.g. "toyota-aqua-2020-for-sale-colombo-12")
 */
function parsePhotos(images = {}, slug = '') {
  // Detail page format (preferred — contains ALL images, src already has slug)
  if (Array.isArray(images.meta) && images.meta.length) {
    return images.meta
      .filter((m) => m?.src)
      .map((m) => ({
        url: `${m.src}/540/405/cropped.jpg`,
        thumbnail: `${m.src}/142/107/cropped.jpg`,
      }));
  }

  // List page format (fallback — UUIDs need the slug to form a valid CDN path)
  const ids = images.ids ?? [];
  const base = (images.base_uri ?? '').replace(/\/$/, '');
  if (!ids.length || !base) return [];
  const prefix = slug ? `${base}/${slug}` : base;
  return ids.map((id) => ({
    url: `${prefix}/${id}/540/405/cropped.jpg`,
    thumbnail: `${prefix}/${id}/142/107/cropped.jpg`,
  }));
}

// ── Category normalisation ────────────────────────────────────────────────────

/**
 * Maps ikman body-type specs + stub category to a common category name.
 *
 * ikman body type values (from specs['body'] / specs['body type']):
 *   Sedan, Hatchback, Wagon, Estate, Coupe, Convertible, Cabriolet,
 *   SUV, Jeep, Van, Pickup, Cab, Double Cab, etc.
 *
 * ikman stub categories (from scraper config):
 *   'Car', 'SUV/Jeep', 'Van', 'Cab'
 *
 * Common output values (must match Vehicle schema enum):
 *   Sedan | Hatchback | Wagon | Coupe | Convertible | SUV | Jeep | Cab | Van | Car
 */
function normaliseCategory(bodyType, stubCategory) {
  const body = (bodyType ?? '').toLowerCase().trim();
  const stub = (stubCategory ?? '').toLowerCase().trim();

  // Body type takes priority — it's the most specific signal
  if (body.includes('sedan'))                                       return 'Sedan';
  if (body.includes('hatchback'))                                   return 'Hatchback';
  if (body.includes('wagon') || body.includes('estate'))            return 'Wagon';
  if (body.includes('coupe'))                                       return 'Coupe';
  if (body.includes('convertible') || body.includes('cabriolet'))   return 'Convertible';
  if (body.includes('suv'))                                         return 'SUV';
  if (body.includes('jeep'))                                        return 'Jeep';
  if (body.includes('double cab') || body.includes('single cab') ||
      body.includes('pickup') || body.includes('pick-up') ||
      body.includes('cab'))                                         return 'Cab';
  if (body.includes('van'))                                         return 'Van';

  // Fall back to the stub category set by the scraper config
  if (stub.includes('suv') || stub.includes('jeep')) return 'SUV';
  if (stub.includes('cab') || stub.includes('pickup')) return 'Cab';
  if (stub.includes('van')) return 'Van';
  if (stub.includes('car')) return 'Car';

  return null;
}

// ── List page stub parser ─────────────────────────────────────────────────────

export function parseListPage(initialData, category) {
  const adsData = initialData?.serp?.ads?.data ?? {};
  const regularAds = adsData.ads ?? [];
  const topAds    = adsData.topAds ?? [];
  const allAds    = [...topAds, ...regularAds];

  return allAds.map((ad) => {
    const images = ad.images ?? {};
    const imageIds = images.ids ?? [];
    const baseUri = (images.base_uri ?? '').replace(/\/$/, '');
    const thumbnail = imageIds.length
      ? `${baseUri}/${imageIds[0]}/small`
      : (ad.imgUrl ?? null);

    const city = typeof ad.location === 'string'
      ? ad.location
      : (ad.location?.name ?? ad.location?.city ?? null);

    return {
      listingId: String(ad.id),
      slug: ad.slug ?? null,
      sourceUrl: ad.slug ? `https://ikman.lk/en/ad/${ad.slug}` : null,
      title: ad.title ?? null,
      price: parsePrice(ad.price ?? null),
      mileage: parseMileage(ad.details ?? null),
      location: { city, district: null, province: null },
      thumbnail,
      postedAt: parsePostedAt(ad.timeStamp ?? null),
      category,
      _raw: ad,
    };
  });
}

/**
 * Reads totalPages from window.initialData pagination info.
 */
export function parseTotalPages(initialData) {
  const pg = initialData?.serp?.ads?.data?.paginationData ?? {};
  const total    = Number(pg.total ?? 0);
  const pageSize = Number(pg.pageSize ?? 25);
  if (!total || !pageSize) return 1;
  return Math.ceil(total / pageSize);
}

// ── Detail page parser ────────────────────────────────────────────────────────

export function parseDetailPage(detailData, stub) {
  const ad = detailData?.adDetail?.data?.ad ?? {};

  // Build a key→value map from the properties array
  const specs = {};
  const properties = Array.isArray(ad.properties) ? ad.properties : [];
  for (const prop of properties) {
    const key = (prop.key ?? '').toLowerCase().trim();
    if (key) specs[key] = prop.value ?? null;
  }

  // Photos — pass the ad slug so the ids fallback can build valid CDN URLs
  const photos = parsePhotos(ad.images ?? stub._raw?.images ?? {}, ad.slug ?? stub.slug ?? '');

  // Seller info
  const seller = ad.seller ?? ad.account ?? {};

  // Location
  const locRaw = ad.location ?? stub?.location?.city ?? null;
  const city = typeof locRaw === 'string'
    ? locRaw
    : (locRaw?.city ?? locRaw?.name ?? stub?.location?.city ?? null);

  // Detail page price lives in ad.money.amount, not ad.price.
  // ad.money = { label: "Price", amount: "Rs 16,200,000", negotiable: "Negotiable" }
  // When the listing is negotiable, amount is absent and negotiable field is set.
  const money = ad.money ?? {};
  let price;
  if (money.amount) {
    price = parsePrice(money.amount);
  } else if (money.negotiable) {
    price = { amount: null, isNegotiable: true };
  } else if (ad.price) {
    price = parsePrice(ad.price);
  } else {
    // Last resort: carry forward the list-page stub price
    price = { amount: stub?.price?.amount ?? null, isNegotiable: stub?.price?.isNegotiable ?? false };
  }

  const mileage = parseMileage(specs['mileage'] ?? specs['milage'] ?? ad.details ?? null);

  const yearRaw = specs['model_year'] ?? specs['year of manufacture'] ?? specs['year'] ?? null;
  const year = yearRaw ? parseInt(String(yearRaw).replace(/\D/g, ''), 10) : null;

  const engineRaw = specs['engine_capacity'] ?? specs['engine capacity'] ?? specs['engine'] ?? null;
  const engineCC = engineRaw ? parseInt(String(engineRaw).replace(/\D/g, ''), 10) : null;

  // Limited edition / variant / grade name
  const limitedEditionName =
    specs['variant'] ?? specs['grade'] ?? specs['edition'] ?? specs['trim'] ?? null;

  return {
    title: ad.title ?? stub?.title ?? null,
    brand: specs['brand'] ?? specs['make'] ?? null,
    model: specs['model'] ?? null,
    limitedEditionName,
    year: isNaN(year) ? null : year,
    price,
    mileage: isNaN(mileage) ? null : mileage,
    engineCC: isNaN(engineCC) ? null : engineCC,
    category: normaliseCategory(
      specs['body'] ?? specs['body type'] ?? null,
      stub?.category
    ),
    // Raw fields kept for the raw listing's parsed snapshot
    fuelType: specs['fuel_type'] ?? specs['fuel type'] ?? specs['fuel'] ?? null,
    transmission: specs['transmission'] ?? null,
    color: specs['colour'] ?? specs['color'] ?? null,
    doors: specs['doors'] ? parseInt(String(specs['doors']), 10) : null,
    seats: specs['seats'] ? parseInt(String(specs['seats']), 10) : null,
    condition: (specs['condition'] ?? '').toLowerCase().includes('brand new') ? 'New' : 'Used',
    location: {
      city,
      district: typeof locRaw === 'object' ? (locRaw?.district ?? null) : null,
      province: typeof locRaw === 'object' ? (locRaw?.province ?? null) : null,
    },
    sellerType: (seller.isAuthDealer || seller.isMember) ? 'Dealer' : 'Private',
    sellerName: seller.name ?? seller.displayName ?? seller.shopName ?? ad.shopName ?? null,
    sellerContact: seller.phone ?? seller.contactNumber ?? null,
    description: ad.description ?? null,
    photos,
    postedAt: parsePostedAt(ad.createdAt ?? ad.date ?? ad.timeStamp ?? stub?.postedAt ?? null),
  };
}
