/**
 * riyasewana.com parser
 *
 * Spec table keys (from live site inspection):
 *   contact, price, make, model, yom, mileage (km),
 *   gear, fuel type, options, engine (cc), details
 */

// ── Price helpers ─────────────────────────────────────────────────────────────

function parsePrice(raw) {
  if (!raw) return { amount: null, isNegotiable: false, rawText: null };
  const isNegotiable = /negotiable/i.test(raw);
  // Strip leading currency prefix (Rs., Rs, LKR, etc.) then remove commas.
  // Previous regex /[^\d.]/g kept the dot in "Rs." → ".7480000" → 0.748 (bug).
  const cleaned = raw.replace(/^[^\d]+/, '').replace(/,/g, '').trim();
  const amount = cleaned ? parseFloat(cleaned) : null;
  return { amount: isNaN(amount) ? null : amount, isNegotiable, rawText: raw };
}

function parseMileage(raw) {
  if (!raw) return null;
  const num = parseFloat(raw.replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num;
}

function parseYear(raw) {
  if (!raw) return null;
  const match = String(raw).match(/\d{4}/);
  return match ? parseInt(match[0], 10) : null;
}

function parseEngineCC(raw) {
  if (!raw) return null;
  const num = parseInt(String(raw).replace(/\D/g, ''), 10);
  return isNaN(num) ? null : num;
}

function parsePostedAt(raw) {
  if (!raw) return null;
  // Format from site: "2026-02-16 12:28 pm"
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// ── Category normalisation ────────────────────────────────────────────────────

/**
 * Maps riyasewana category names to the common category enum.
 *
 * riyasewana category URL slugs (from scraper config):
 *   'cars'  → scraper sets category = 'Car'
 *   'suvs'  → scraper sets category = 'SUV'
 *   'vans'  → scraper sets category = 'Van'
 *   'cabs'  → scraper sets category = 'Cab'
 *
 * riyasewana does not expose a body-type spec within car listings,
 * so we rely entirely on the top-level category from the scraper config.
 *
 * Common output values (must match Vehicle schema enum):
 *   Sedan | Hatchback | Wagon | Coupe | Convertible | SUV | Jeep | Cab | Van | Car
 */
function normaliseCategory(category) {
  const cat = (category ?? '').toLowerCase().trim();

  if (cat.includes('suv') || cat.includes('jeep')) return 'SUV';
  if (cat.includes('cab') || cat.includes('pickup') || cat.includes('pick-up')) return 'Cab';
  if (cat.includes('van')) return 'Van';
  if (cat === 'car') return 'Car';

  return null;
}

// ── List page ─────────────────────────────────────────────────────────────────

export function parseListPage(rawListings, category) {
  return rawListings.map((item) => ({
    listingId: String(item.listingId),
    sourceUrl: item.sourceUrl ?? null,
    title: item.title ?? null,
    price: parsePrice(item.price ?? null),
    mileage: parseMileage(item.mileage ?? null),
    location: {
      city: item.location?.trim() ?? null,
      district: null,
      province: null,
      rawText: item.location ?? null,
    },
    thumbnail: item.thumbnail ?? null,
    postedAt: parsePostedAt(item.postedAt ?? null),
    category,
    _raw: item,
  }));
}

// ── Detail page ───────────────────────────────────────────────────────────────

export function parseDetailPage(rawDetail, stub) {
  const specs = rawDetail.specs ?? {};

  const year       = parseYear(specs['yom'] ?? null);
  const mileage    = parseMileage(specs['mileage (km)'] ?? null);
  const engineCC   = parseEngineCC(specs['engine (cc)'] ?? null);

  const price = parsePrice(specs['price'] ?? stub?.price?.rawText ?? null);

  const location = {
    city: rawDetail.location ?? stub?.location?.city ?? null,
    district: null,
    province: null,
    rawText: rawDetail.location ?? stub?.location?.rawText ?? null,
  };

  // "details" in the spec table is the free-text description
  const description = specs['details'] && specs['details'] !== '-'
    ? specs['details']
    : null;

  return {
    title: rawDetail.title ?? stub?.title ?? null,
    brand: specs['make'] ?? null,
    model: specs['model'] ?? null,
    limitedEditionName: null,   // riyasewana doesn't expose variant/grade info
    year: isNaN(year) ? null : year,
    price,
    mileage: isNaN(mileage) ? null : mileage,
    engineCC: isNaN(engineCC) ? null : engineCC,
    category: normaliseCategory(stub?.category ?? null),
    // Raw fields kept for the raw listing's parsed snapshot
    fuelType: specs['fuel type'] ?? null,
    transmission: specs['gear'] ?? null,
    color: null,
    doors: null,
    seats: null,
    condition: rawDetail.title?.toLowerCase().includes('brand new') ? 'New' : 'Used',
    location,
    sellerType: 'Private',
    sellerName: rawDetail.sellerName ?? null,
    sellerContact: specs['contact'] ?? null,
    description,
    photos: rawDetail.photos ?? [],
    postedAt: parsePostedAt(rawDetail.postedAt ?? null),
  };
}
