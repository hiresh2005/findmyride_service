export const scraperConfig = {
  ikman: {
    name: 'ikman',
    baseUrl: 'https://ikman.lk',
    /**
     * Each entry maps to an ikman category page.
     * `category` is the stub value passed into the parser — it becomes the
     * fallback when no body-type spec is found on the detail page.
     *
     * ikman body-type spec (specs['body']) values seen in the wild:
     *   Sedan, Hatchback, Wagon, Estate, Coupe, Convertible,
     *   SUV, Jeep, Van, Pickup, Double Cab, Single Cab
     *
     * These are mapped → common names in parser.js normaliseCategory().
     */
    categories: [
      { name: 'cars',        category: 'Car',  url: 'https://ikman.lk/en/ads/sri-lanka/cars' },
      { name: 'suvs-jeeps',  category: 'SUV',  url: 'https://ikman.lk/en/ads/sri-lanka/suvs-jeeps' },
      { name: 'vans',        category: 'Van',  url: 'https://ikman.lk/en/ads/sri-lanka/vans' },
      { name: 'double-cabs', category: 'Cab',  url: 'https://ikman.lk/en/ads/sri-lanka/double-cab' },
    ],
    detailBaseUrl: 'https://ikman.lk/en/ad',
    pageQueryParam: 'page',
    extraHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  },

  riyasewana: {
    name: 'riyasewana',
    baseUrl: 'https://riyasewana.com',
    /**
     * riyasewana category URL slugs and their common category names.
     * riyasewana does not expose a body-type spec, so `category` IS
     * the final common name stored in the vehicles collection.
     *
     * riyasewana category pages:
     *   /search/cars  → Car
     *   /search/suvs  → SUV
     *   /search/vans  → Van
     *   /search/cabs  → Cab  (pickup trucks)
     */
    categories: [
      { name: 'cars', category: 'Car', url: 'https://riyasewana.com/search/cars' },
      { name: 'suvs', category: 'SUV', url: 'https://riyasewana.com/search/suvs' },
      { name: 'vans', category: 'Van', url: 'https://riyasewana.com/search/vans' },
      { name: 'cabs', category: 'Cab', url: 'https://riyasewana.com/search/cabs' },
    ],
    pageQueryParam: 'page',
    extraHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  },

  // Shared browser settings
  browser: {
    headless: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    minDelayMs: 2_000,
    maxDelayMs: 5_000,
    navigationTimeoutMs: 30_000,
    maxRetries: 3,
    concurrency: parseInt(process.env.SCRAPER_CONCURRENCY ?? '3', 10),
    maxListingsPerCategory: parseInt(process.env.MAX_LISTINGS_PER_CATEGORY ?? '0', 10),
  },

  // Cron expressions (overridden by .env)
  cron: {
    ikman: process.env.IKMAN_CRON ?? '0 */6 * * *',
    riyasewana: process.env.RIYASEWANA_CRON ?? '0 3 * * *',
  },

  // Safety: abort a full scraper run after this many ms (4 hours)
  runTimeoutMs: 4 * 60 * 60 * 1_000,
};
