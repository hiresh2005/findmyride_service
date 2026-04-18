# FindMyRide — Architecture Diagrams

All diagrams below correspond to the figures referenced in the Implementation chapter.
Copy each block into your document tool (Word, LaTeX, Google Docs) using a monospace font
(Courier New, Consolas, or similar) at size 9–10pt for best rendering.

---

## Figure 3.1 — High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              FINDMYRIDE SYSTEM ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │                        DATA COLLECTION LAYER                     │
  │                                                                  │
  │   ┌─────────────────────────┐   ┌──────────────────────────┐    │
  │   │     IkmanScraper        │   │   RiyasewanaScraper       │    │
  │   │                         │   │                           │    │
  │   │  Playwright (headless)  │   │  Playwright (headless)    │    │
  │   │  ┌───────────────────┐  │   │  ┌─────────────────────┐ │    │
  │   │  │ List page scrape  │  │   │  │ List page scrape    │ │    │
  │   │  │ (stubs / titles)  │  │   │  │ (stubs / titles)    │ │    │
  │   │  └────────┬──────────┘  │   │  └──────────┬──────────┘ │    │
  │   │           │             │   │             │             │    │
  │   │  ┌────────▼──────────┐  │   │  ┌──────────▼──────────┐ │    │
  │   │  │ Detail page scrape│  │   │  │ Detail page scrape  │ │    │
  │   │  │ (specs + photos)  │  │   │  │ + response capture  │ │    │
  │   │  └───────────────────┘  │   │  └─────────────────────┘ │    │
  │   └──────────┬──────────────┘   └─────────────┬────────────┘    │
  └──────────────┼────────────────────────────────┼─────────────────┘
                 │                                │
  ┌──────────────▼────────────────────────────────▼─────────────────┐
  │                        ENRICHMENT LAYER                          │
  │                                                                  │
  │   ┌──────────────────────────┐   ┌────────────────────────────┐ │
  │   │  TextEnrichmentService   │   │  ImageEnrichmentService     │ │
  │   │                          │   │                             │ │
  │   │  Regex-based extraction  │   │  GPT-4o mini Vision API     │ │
  │   │  • owners count          │   │  • Up to 6 images/listing   │ │
  │   │  • features list         │   │  • 512×512 JPEG (sharp)     │ │
  │   │  • company maintained    │   │  • detail: 'low' mode       │ │
  │   │  • interior color hint   │   │  • exterior color output    │ │
  │   │  No I/O — runs inline    │   │  • retry on null result     │ │
  │   └──────────────────────────┘   └────────────────────────────┘ │
  └────────────────────────────────┬────────────────────────────────┘
                                   │
  ┌────────────────────────────────▼────────────────────────────────┐
  │                         STORAGE LAYER (MongoDB)                  │
  │                                                                  │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
  │  │  ikman_listings  │  │riyasewana_listing│  │   vehicles    │ │
  │  │                  │  │       s          │  │               │ │
  │  │  Raw scraped     │  │  Raw scraped     │  │  Normalized   │ │
  │  │  data (source    │  │  data (source    │  │  master       │ │
  │  │  of truth)       │  │  of truth)       │  │  collection   │ │
  │  │  listingId       │  │  listingId       │  │  vehicleId    │ │
  │  │  parsed {}       │  │  parsed {}       │  │  brand/model  │ │
  │  │  lastScrapedAt   │  │  lastScrapedAt   │  │  exteriorColor│ │
  │  └──────────────────┘  └──────────────────┘  └───────┬───────┘ │
  └────────────────────────────────────────────────────────┼────────┘
                                                           │
  ┌────────────────────────────────────────────────────────▼────────┐
  │                     PRESENTATION LAYER (Planned)                 │
  │                                                                  │
  │               Next.js / React Frontend Application               │
  │                                                                  │
  │   Search & Filter UI   ←→   REST / GraphQL API   ←→   MongoDB   │
  │   (color, brand, year,                                           │
  │    price range, category)                                        │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Figure 3.3 — Vehicle Document Schema (MongoDB)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    vehicles  collection — document structure         │
├──────────────────────────┬──────────────────┬───────────────────────┤
│  Field                   │  Type            │  Notes                │
├──────────────────────────┼──────────────────┼───────────────────────┤
│  _id                     │  ObjectId        │  Auto-generated       │
│  vehicleId               │  String (unique) │  FMR-IKM-xxx          │
│  version                 │  Number          │  Starts at 1          │
│  source                  │  String          │  "ikman" / "riyasewana│
│  sourceListingId         │  String          │  Original listing ID  │
│  sourceUrl               │  String          │  Full URL to listing  │
├──────────────────────────┼──────────────────┼───────────────────────┤
│  category                │  String (enum)   │  Sedan, SUV, Van …    │
│  brand                   │  String          │  Toyota, Honda …      │
│  model                   │  String          │  Aqua, Vitz …         │
│  year                    │  Number          │  e.g. 2018            │
│  limitedEditionName      │  String          │  ikman only           │
├──────────────────────────┼──────────────────┼───────────────────────┤
│  price.amount            │  Number          │  LKR value            │
│  price.isNegotiable      │  Boolean         │                       │
│  mileage                 │  Number          │  Kilometres           │
│  engineCapacity          │  Number          │  CC (e.g. 1500)       │
├──────────────────────────┼──────────────────┼───────────────────────┤
│  images                  │  Array           │  [{url, thumbnail}]   │
│  description             │  String          │  Free-text ad body    │
├──────────────────────────┼──────────────────┼───────────────────────┤
│  exteriorColor           │  String          │  White, Blue, Red …   │
│  interiorColor           │  String          │  Text-extracted hint  │
│  interiorColorFromImage  │  String          │  Image-derived (null) │
├──────────────────────────┼──────────────────┼───────────────────────┤
│  owners                  │  Number          │  Text enrichment      │
│  features                │  [String]        │  ["ABS", "Sunroof" …] │
│  companyMaintained       │  Boolean         │  Text enrichment      │
├──────────────────────────┼──────────────────┼───────────────────────┤
│  isActive                │  Boolean         │  False = delisted     │
│  scrapedAt               │  Date            │  Last scrape time     │
│  lastUpdatedAt           │  Date            │                       │
│  textEnrichedAt          │  Date            │                       │
│  imageEnrichedAt         │  Date            │  Set after GPT call   │
└──────────────────────────┴──────────────────┴───────────────────────┘

  Color priority (highest wins, lower only fills nulls):
  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐
  │  Spec    │ > │  Title text  │ > │  GPT-4o mini vision  │
  │  dropdown│   │  extraction  │   │  (image enrichment)  │
  └──────────┘   └──────────────┘   └──────────────────────┘
```

---

## Figure 3.5 — Two-Phase Scraping Flowchart

```
                    ┌─────────────────────┐
                    │   Scraper starts     │
                    │   runStart = now()   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Load category list  │
                    │  from scraper config │
                    └──────────┬──────────┘
                               │
               ┌───────────────▼──────────────────┐
               │          PHASE 1: LIST PAGES       │
               │                                   │
               │  ┌─────────────────────────────┐  │
               │  │  Navigate to list page (URL) │  │
               │  └──────────────┬──────────────┘  │
               │                 │                  │
               │  ┌──────────────▼──────────────┐  │
               │  │  Extract listing cards (DOM) │  │
               │  │  → listingId, title, price,  │  │
               │  │    location, thumbnail        │  │
               │  └──────────────┬──────────────┘  │
               │                 │                  │
               │  ┌──────────────▼──────────────┐  │
               │  │   hasNextPage?  ─── Yes ──────────────┐
               │  └──────────────┬──────────────┘  │      │
               │                 │ No               │      │
               └─────────────────┼──────────────────┘      │
                                 │  ◄─────────────────────────┘
                                 │   pageNum++
                    ┌────────────▼───────────────┐
                    │      stubs[] collected      │
                    │  (all listing IDs + URLs)   │
                    └────────────┬───────────────┘
                                 │
               ┌─────────────────▼────────────────────┐
               │          PHASE 2: DETAIL PAGES         │
               │  (concurrency pool — N tabs at once)   │
               │                                        │
               │  For each stub:                        │
               │  ┌──────────────────────────────────┐  │
               │  │  Already in DB AND < 24h old?     │  │
               │  └───────────┬──────────────────┬───┘  │
               │              │ Yes              │ No    │
               │              │                  │       │
               │  ┌───────────▼──────┐  ┌────────▼────┐ │
               │  │  Skip detail     │  │ Open detail │ │
               │  │  page fetch      │  │ page in     │ │
               │  │  (use cached)    │  │ new tab     │ │
               │  └───────────┬──────┘  └────────┬────┘ │
               │              │                  │       │
               │              │         ┌────────▼────┐  │
               │              │         │ Capture     │  │
               │              │         │ images via  │  │
               │              │         │ response    │  │
               │              │         │ listener    │  │
               │              │         └────────┬────┘  │
               │              │                  │        │
               │              │         ┌────────▼────┐  │
               │              │         │ Extract DOM │  │
               │              │         │ specs, desc │  │
               │              │         │ photos      │  │
               │              │         └────────┬────┘  │
               │              │                  │        │
               │  ┌───────────▼──────────────────▼────┐  │
               │  │      VehicleService.upsert()       │  │
               │  │  → text enrichment (inline)        │  │
               │  │  → write to vehicles collection    │  │
               │  └───────────────────┬───────────────┘  │
               │                      │                   │
               │  ┌───────────────────▼───────────────┐  │
               │  │   imageBuffers.length > 0?         │  │
               │  └────────────┬──────────────┬────────┘  │
               │               │ Yes          │ No        │
               │  ┌────────────▼──────┐       │           │
               │  │ enrichFromBuffers()│       │ skip GPT  │
               │  │ → GPT-4o mini call │       │           │
               │  │ → setImageColors() │       │           │
               │  └────────────┬──────┘       │           │
               │               └──────────────┘           │
               └──────────────────────────────────────────┘
                                 │
                    ┌────────────▼──────────────┐
                    │  Mark stale listings       │
                    │  isActive = false          │
                    │  (lastScrapedAt < runStart)│
                    └────────────┬──────────────┘
                                 │
                    ┌────────────▼──────────────┐
                    │  Log final stats           │
                    │  { new, updated,           │
                    │    deactivated, errors }   │
                    └───────────────────────────┘
```

---

## Figure 3.7 — Riyasewana Response Interception Flow

```
  Playwright Browser Process
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │   _processListing()                                          │
  │   ┌────────────────────────────────────────────────────┐    │
  │   │                                                    │    │
  │   │  const detailPage = await this.context.newPage()  │    │
  │   │                                                    │    │
  │   │  const responsePromises = []  // typed as void[]  │    │
  │   │  const imageBuffers = []                           │    │
  │   │                                                    │    │
  │   │  ① Register listener BEFORE navigation            │    │
  │   │  ┌──────────────────────────────────────────────┐ │    │
  │   │  │ detailPage.on('response', (response) => {    │ │    │
  │   │  │   if (imageBuffers.length >= 6) return;      │ │    │
  │   │  │   if (!response.ok()) return;                │ │    │
  │   │  │   const url = response.url();                │ │    │
  │   │  │   if (!/\.(jpe?g|webp|png)(\?|#|$)/i        │ │    │
  │   │  │       .test(url)) return;                    │ │    │
  │   │  │   responsePromises.push(                     │ │    │
  │   │  │     response.body()                          │ │    │
  │   │  │       .then(buf => {                         │ │    │
  │   │  │         if (buf.length > 5_000)              │ │    │
  │   │  │           imageBuffers.push(buf);            │ │    │
  │   │  │       }).catch(() => {})                     │ │    │
  │   │  │   );                                         │ │    │
  │   │  │ })                                           │ │    │
  │   │  └──────────────────────────────────────────────┘ │    │
  │   │                                                    │    │
  │   │  ② Navigate to detail page                        │    │
  │   │     detailPage.goto(stub.sourceUrl, ...)          │    │
  │   │                                                    │    │
  │   └────────────────────────────────────────────────────┘    │
  │                          │                                   │
  │         Browser loads page — network requests fire           │
  │                          │                                   │
  │  ┌───────────────────────▼──────────────────────────────┐   │
  │  │              NETWORK RESPONSES (passive)              │   │
  │  │                                                       │   │
  │  │  HTML response   ──► passed through, not captured     │   │
  │  │  CSS response    ──► passed through, not captured     │   │
  │  │  JS response     ──► passed through, not captured     │   │
  │  │  img.jpg?v=1     ──► ✓ regex matches → buffer saved  │   │
  │  │  img.webp        ──► ✓ regex matches → buffer saved  │   │
  │  │  favicon.ico     ──► ✗ no image ext match            │   │
  │  │  thumb.jpg (1KB) ──► ✗ too small (<5 000 bytes)     │   │
  │  └───────────────────────────────────────────────────────┘   │
  │                          │                                   │
  │   await waitForLoadState('load') + Promise.allSettled(...)   │
  │                          │                                   │
  │  imageBuffers = [buf1, buf2, buf3, buf4, buf5, buf6]        │
  └──────────────────────────┼───────────────────────────────────┘
                             │
              ┌──────────────▼───────────────────────┐
              │         ImageEnrichmentService         │
              │                                        │
              │  enrichFromBuffers(imageBuffers)        │
              │                                        │
              │  For each buffer:                      │
              │    sharp(raw)                          │
              │      .resize(512, 512, fit:'cover')    │
              │      .jpeg({ quality: 85 })            │
              │      .toBuffer()                       │
              │    → base64 string                     │
              │                                        │
              │  Single API call to GPT-4o mini ──────────────┐
              │  { model: 'gpt-4o-mini',              │       │
              │    messages: [system, user+images],   │       │
              │    max_tokens: 50, temperature: 0,    │       │
              │    response_format: json_object }     │       │
              └───────────────────────────────────────┘       │
                             │  ◄──────────────────────────────┘
              ┌──────────────▼───────────────────────┐
              │    GPT returns: {"exteriorColor":"Blue"}       │
              │                                        │
              │  If null → retry with simpler prompt   │
              │  If still null → store null            │
              └──────────────┬───────────────────────┘
                             │
              ┌──────────────▼───────────────────────┐
              │      VehicleService.setImageColors()   │
              │                                        │
              │  MongoDB $cond update:                 │
              │  Only write if current value is null   │
              │  Never overwrite scraped spec color     │
              └───────────────────────────────────────┘
```

---

## Figure 3.8 — GPT-4o mini Color Classification (API Flow)

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    classifyWithGPT() — API Request               │
  ├─────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │  POST https://api.openai.com/v1/chat/completions                 │
  │                                                                  │
  │  {                                                               │
  │    "model": "gpt-4o-mini",                                       │
  │    "temperature": 0,                                             │
  │    "max_tokens": 50,                                             │
  │    "response_format": { "type": "json_object" },                 │
  │    "messages": [                                                 │
  │      {                                                           │
  │        "role": "system",                                         │
  │        "content": "You are a vehicle body paint color           │
  │          detector for a Sri Lankan car listing website.          │
  │          ... Ignore license plates (can be RED, YELLOW,          │
  │          WHITE or BLUE in Sri Lanka) ...                         │
  │          Valid colors: White, Silver, Grey, Black, Red,          │
  │          Maroon, Blue, Dark Blue, Light Blue, Green ..."         │
  │      },                                                          │
  │      {                                                           │
  │        "role": "user",                                           │
  │        "content": [                                              │
  │          { "type": "image_url",                                  │
  │            "image_url": {                                        │
  │              "url": "data:image/jpeg;base64,<img1>",             │
  │              "detail": "low"    ← 85 tokens per image            │
  │            }                                                     │
  │          },                                                      │
  │          ... (up to 6 images)                                    │
  │          { "type": "text",                                       │
  │            "text": "Identify the body paint color..."            │
  │          }                                                       │
  │        ]                                                         │
  │      }                                                           │
  │    ]                                                             │
  │  }                                                               │
  │                                                                  │
  ├─────────────────────────────────────────────────────────────────┤
  │                    GPT-4o mini Response                          │
  ├─────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │  {                                                               │
  │    "choices": [{                                                 │
  │      "message": {                                                │
  │        "content": "{\"exteriorColor\": \"Blue\"}"                │
  │      }                                                           │
  │    }]                                                            │
  │  }                                                               │
  │                                                                  │
  ├─────────────────────────────────────────────────────────────────┤
  │  Retry logic (if response is null or "Unknown"):                 │
  │                                                                  │
  │  Attempt 1 → detailed system prompt → null?                      │
  │                                          │ yes                   │
  │  Attempt 2 → simplified retry prompt → null? → store null        │
  │                                          │ no                    │
  │                                      color saved                 │
  └─────────────────────────────────────────────────────────────────┘

  Token cost estimate (6 images, low detail):
  ┌─────────────────┬──────────────┬──────────────────────────────┐
  │  Component      │  Tokens      │  Notes                       │
  ├─────────────────┼──────────────┼──────────────────────────────┤
  │  6 images       │  6 × 85 = 510│  detail:'low' fixed cost     │
  │  System prompt  │  ~200        │  instructions                │
  │  User text      │  ~30         │  question                    │
  │  Response       │  ~15         │  JSON reply                  │
  ├─────────────────┼──────────────┼──────────────────────────────┤
  │  Total          │  ~755 tokens │  ≈ $0.00012 per vehicle      │
  └─────────────────┴──────────────┴──────────────────────────────┘
```

---

## Figure 3.9 — Enriched Vehicle Document (MongoDB)

```
  // vehicles collection — sample document after full enrichment pipeline
  {
    "_id":              ObjectId("65f3a2b1c4d5e6f7a8b9c0d1"),
    "vehicleId":        "FMR-RIY-11237560",
    "version":          1,
    "source":           "riyasewana",
    "sourceListingId":  "11237560",
    "sourceUrl":        "https://riyasewana.com/view/toyota-aqua-hybrid-...",

    // ── Core specs ─────────────────────────────────────────────────────
    "category":         "Car",
    "brand":            "Toyota",
    "model":            "Aqua",
    "year":             2018,
    "limitedEditionName": null,

    "price": {
      "amount":         6850000,
      "isNegotiable":   false
    },
    "mileage":          62000,
    "engineCapacity":   1500,

    // ── Media ──────────────────────────────────────────────────────────
    "images": [
      { "url": "https://riyasewana.com/uploads/...", "thumbnail": "..." },
      { "url": "https://riyasewana.com/uploads/...", "thumbnail": "..." }
    ],
    "description": "Single owner, company maintained, full option...",

    // ── Phase 1: Text Enrichment (inline, regex) ────────────────────────
    "owners":             1,                      ◄─ extracted from description
    "features":           ["ABS", "Reverse Camera", "Sunroof"],
    "companyMaintained":  true,
    "interiorColor":      "Beige",               ◄─ text hint ("beige interior")
    "textEnrichedAt":     ISODate("2026-03-01T08:42:11Z"),

    // ── Phase 2: Image Enrichment (GPT-4o mini) ─────────────────────────
    "exteriorColor":            "Silver",        ◄─ GPT vision result
    "interiorColorFromImage":   null,            ◄─ not used (null always)
    "imageEnrichedAt":          ISODate("2026-03-01T08:42:18Z"),

    // ── Lifecycle ──────────────────────────────────────────────────────
    "isActive":     true,
    "scrapedAt":    ISODate("2026-03-01T08:42:09Z"),
    "lastUpdatedAt":ISODate("2026-03-01T08:42:18Z")
  }
```

---

## Figure 3.10 — ikman vs riyasewana Documents Side-by-Side

```
  ┌──────────────────────────────────┬──────────────────────────────────┐
  │          ikman document           │       riyasewana document         │
  │       (ikman_listings)            │     (riyasewana_listings)         │
  ├──────────────────────────────────┼──────────────────────────────────┤
  │ listingId: "7263810"              │ listingId: "11237560"             │
  │ source: "ikman"                   │ source: "riyasewana"              │
  │                                  │                                   │
  │ listPageData: {                   │ listPageData: {                   │
  │   listingId: "7263810",           │   listingId: "11237560",          │
  │   title: "Toyota Aqua 2018",      │   title: "Toyota Aqua Hybrid",    │
  │   price: "Rs 6,750,000",          │   price: "Rs.6,850,000",          │
  │   location: "Colombo",            │   location: "Gampaha",            │
  │   thumbnail: "https://i.ikman…"  │   thumbnail: "https://riya…"      │
  │ }                                 │ }                                 │
  │                                  │                                   │
  │ detailPageData: {                 │ detailPageData: {                 │
  │   specs: {                        │   specs: {                        │
  │     "brand": "Toyota",            │     "make": "Toyota",             │
  │     "model": "Aqua",              │     "model": "Aqua",              │
  │     "year": "2018",               │     "yom": "2018",                │
  │     "body": "Sedan",              │     (no body type field)          │
  │     "color": "Silver",            │     (no color field)              │
  │     "fuel type": "Hybrid",        │     "fuel type": "Hybrid",        │
  │     "gear": "Auto",               │     "gear": "Auto",               │
  │     "mileage": "62000 km",        │     "mileage (km)": "62000",      │
  │     "engine": "1500 cc"           │     "engine (cc)": "1500"         │
  │   }                               │   }                               │
  │   photos: [                       │   photos: [                       │
  │     { url: "…540/405/crop…",      │     { url: "https://riya…",       │
  │       alt: "…" },                 │       thumbnail: "https://…" },   │
  │     …                             │     …                             │
  │   ]                               │   ]                               │
  │ }                                 │ }                                 │
  │                                  │                                   │
  │ vehicleId: "FMR-IKM-7263810"     │ vehicleId: "FMR-RIY-11237560"    │
  │ isActive: true                    │ isActive: true                    │
  │ lastScrapedAt: ISODate(…)         │ lastScrapedAt: ISODate(…)         │
  └──────────────────────────────────┴──────────────────────────────────┘

  Both documents map to a SINGLE normalised vehicles document:
  ┌────────────────────────────────────────────────────────────────┐
  │ vehicleId:       "FMR-IKM-7263810" / "FMR-RIY-11237560"       │
  │ brand:           "Toyota"  (both sources, different spec keys) │
  │ model:           "Aqua"                                        │
  │ year:            2018                                          │
  │ exteriorColor:   "Silver"  (ikman spec dropdown)               │
  │                  "Silver"  (riyasewana → GPT-4o mini vision)   │
  │ category:        "Car"     (ikman body="Sedan" → "Car")        │
  │                  "Car"     (riyasewana category slug = cars)   │
  └────────────────────────────────────────────────────────────────┘
```

---

## Figure 3.4 / Figure 3.11 — Terminal Output (Sample Run)

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  $ node src/scripts/run-scrapers.js                                       │
  │                                                                           │
  │  [riyasewana] Launching browser                                           │
  │  [riyasewana] Starting category: cars                                     │
  │  [riyasewana] Fetching list page 1 — https://riyasewana.com/exchange/cars │
  │  [riyasewana] Page 1 — 25 listings, hasMore=true                          │
  │  [riyasewana] Fetching detail page: https://riyasewana.com/view/toyota…   │
  │  [riyasewana] FMR-RIY-11237560 colors (6 imgs) — ext: Silver | int: n/a  │
  │  [riyasewana] Fetching detail page: https://riyasewana.com/view/honda…    │
  │  [riyasewana] FMR-RIY-11241830 colors (4 imgs) — ext: White | int: n/a   │
  │  [riyasewana] Progress: 5/25 listings                                     │
  │  [riyasewana] Progress: 10/25 listings                                    │
  │  [riyasewana] Progress: 15/25 listings                                    │
  │  [riyasewana] Progress: 20/25 listings                                    │
  │  [riyasewana] Progress: 25/25 listings                                    │
  │  [riyasewana] Starting category: suvs                                     │
  │  [riyasewana] Fetching list page 1 — https://riyasewana.com/exchange/suvs │
  │  [riyasewana] Page 1 — 20 listings, hasMore=true                          │
  │  ...                                                                       │
  │  [riyasewana] Run complete {                                               │
  │    newCount: 143,                                                           │
  │    updatedCount: 57,                                                        │
  │    deactivatedCount: 12,                                                    │
  │    errorCount: 0                                                            │
  │  }                                                                          │
  │  [riyasewana] Browser closed                                               │
  └──────────────────────────────────────────────────────────────────────────┘

  Figure 3.4 — BaseScraper progress log pattern (one line per N listings chunk):
  ┌──────────────────────────────────────────────────────┐
  │  [riyasewana] Progress: 5/25 listings                │
  │  [riyasewana] Progress: 10/25 listings               │
  │  [riyasewana] Progress: 15/25 listings               │
  └──────────────────────────────────────────────────────┘
  concurrency = 5 (default) → one log line after each 5-listing chunk
```

---

## Figure 3.6 — Ikman Listing Page Structure vs Parsed Output

```
  IKMAN LISTING PAGE (DOM)                  PARSED STUB (JavaScript Object)
  ─────────────────────────────────         ──────────────────────────────────────

  ┌─────────────────────────────┐           {
  │  [thumbnail img]            │             listingId:  "7263810",
  │                             │             sourceUrl:  "https://ikman.lk/...",
  │  Toyota Aqua 2018 ◄── h2   │             title:      "Toyota Aqua 2018",
  │                             │             price: {
  │  Rs 6,750,000 ◄── .price   │               amount:       6750000,
  │  Colombo ◄────── .location  │               isNegotiable: false,
  │  62,000 km ◄──── .mileage  │               rawText:      "Rs 6,750,000"
  │  2 days ago ◄─── .time     │             },
  └─────────────────────────────┘             mileage:    62000,
                                              location: {
  IKMAN DETAIL PAGE (specs object)              city:     "Colombo",
  ─────────────────────────────────             district: null,
                                                province: null
  ┌─────────────────────────────┐             },
  │  Make:    Toyota            │             thumbnail: "https://i.ikman-st…",
  │  Model:   Aqua              │             postedAt:  Date("2026-02-28"),
  │  Year:    2018              │             _raw:      { /* original DOM */ }
  │  Body:    Sedan             │           }
  │  Color:   Silver            │
  │  Fuel:    Hybrid            │           After parseDetailPage():
  │  Gear:    Auto              │           ──────────────────────────────────
  │  Mileage: 62,000 km         │           + brand:    "Toyota"
  │  Engine:  1,500 cc          │           + model:    "Aqua"
  │  Price:   Rs 6,750,000      │           + year:     2018
  │  Variant: G Grade           │           + category: "Car"
  └─────────────────────────────┘           + color:    "Silver"
                                            + limitedEditionName: "G Grade"
                                            + engineCC: 1500
                                            + photos:  [{url,thumbnail}, ...]
```

---

## Data Flow Summary (for reference in all figures)

```
  ┌──────────┐    stubs[]    ┌─────────────┐   raw+parsed   ┌──────────────┐
  │ List page│ ────────────► │ Detail page │ ─────────────► │ Raw listing  │
  │  scrape  │               │   scrape    │                │  collection  │
  └──────────┘               └──────┬──────┘                └──────┬───────┘
                                    │                               │
                             images │                     VehicleService
                             (buffers/URLs)                  .upsert()
                                    │                               │
                          ┌─────────▼────────┐            ┌────────▼────────┐
                          │ ImageEnrichment  │            │  Text Enrichment│
                          │ (GPT-4o mini)    │            │  (regex, inline)│
                          └─────────┬────────┘            └────────┬────────┘
                                    │                               │
                                    └──────────────┬────────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │    vehicles     │
                                          │   collection    │
                                          │  (normalized)   │
                                          └─────────────────┘
```
