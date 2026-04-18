# FEATURES AND FUNCTIONALITIES

---

## Functional Requirements

Functional requirements describe what the system must be able to do — the actions it performs and the results it produces.

---

### FR-01 — Multi-Source Vehicle Scraping

The system must scrape vehicle listings from two Sri Lankan car marketplace websites: **ikman.lk** and **riyasewana.com**. Scraping must cover all major vehicle categories from each source.

| Source | Categories Scraped |
|---|---|
| ikman.lk | Cars, SUVs / Jeeps, Vans, Double-Cabs |
| riyasewana.com | Cars, SUVs, Vans, Cabs |

For each listing, the system must collect: listing ID, title, asking price, mileage, year of manufacture, brand, model, engine capacity, fuel type, transmission, category, location, seller contact information, listing date, description text, and all available photographs.

---

### FR-02 — Two-Phase Detail Extraction

The system must operate in two phases per scraper run.

**Phase 1** navigates paginated list pages and collects a lightweight stub for every listing — just enough data to identify the listing and determine whether a full detail fetch is needed.

**Phase 2** opens each listing's detail page in a separate browser tab, extracts the full specification table and description, and captures all available listing photographs. Detail page fetches are skipped for listings already in the database that were last scraped within 24 hours, to avoid unnecessary load on source websites and the OpenAI API.

---

### FR-03 — Data Normalisation Across Sources

ikman.lk and riyasewana.com use different field names, price formats, mileage units, and category schemes. The system must translate both into a single, consistent document structure in the `vehicles` collection. The following translations must be applied automatically.

| Raw field (ikman) | Raw field (riyasewana) | Normalised field |
|---|---|---|
| brand | make | brand |
| year | yom | year |
| engine (cc) | engine (cc) | engineCapacity |
| body | category slug | category |
| photos | photos | images |

Category values must conform to the shared enumeration: `Sedan`, `Hatchback`, `Wagon`, `Coupe`, `Convertible`, `SUV`, `Jeep`, `Cab`, `Van`, `Car`.

---

### FR-04 — Deterministic Vehicle Identity

Every listing must receive a stable, deterministic identifier generated from its source name and listing ID — for example, `FMR-IKM-7263810` or `FMR-RIY-11237560`. The same listing must always produce the same identifier across multiple scrape runs, enabling safe upserts without creating duplicates.

---

### FR-05 — Text-Based Feature Extraction

The system must analyse the free-text description of every listing and automatically extract the following attributes without any manual input or external API calls.

- **Owner count** — how many previous owners the vehicle has had, detected from phrases such as "1st owner", "single owner", or "2 owners".
- **Features list** — a structured list of notable features detected from the description. The system must recognise over 30 feature types, including: Sunroof, Panoramic Roof, Reverse Camera, 360 Camera, Apple CarPlay, Android Auto, Navigation, Bluetooth, Cruise Control, Lane Assist, Blind Spot Monitor, Collision Warning, Heated Seats, Leather Seats, Push Start, Keyless Entry, HID / LED headlights, ABS, Airbags, Stability Control, 4WD / AWD, and others.
- **Company maintained flag** — a boolean value indicating whether the vehicle was serviced by a company or authorised agent, detected from phrases such as "company maintained", "agent serviced", or "company-serviced".
- **Interior color hint** — where the description mentions the interior trim color (e.g. "beige interior", "black leather"), the system must record this as the `interiorColor` field.

---

### FR-06 — Exterior Color Detection via Computer Vision

For listings that have photographs, the system must send the images to the GPT-4o mini Vision API and determine the exterior body paint color of the vehicle. The system must:

- Resize each image to 512 × 512 pixels before transmission to control API costs.
- Send up to six images per listing in a single API call.
- Instruct the model to look only at the body panels (doors, hood, roof, fenders, bumpers) and explicitly ignore Sri Lankan license plates, which can be red, yellow, white, or blue and are not the car's color.
- Return one color value from a fixed set: White, Silver, Grey, Black, Red, Maroon, Blue, Dark Blue, Light Blue, Green, Dark Green, Orange, Yellow, Gold, Beige, Brown, Purple.
- Retry once with a simplified prompt if the first attempt returns null or an ambiguous result.

For ikman listings, image enrichment runs as a separate batch script after scraping. For riyasewana listings, images are captured passively during the browser page load (without making additional HTTP requests) and enrichment runs inline.

---

### FR-07 — Color Priority and Safe Writes

When a listing already has an exterior color recorded from the scraper's specification fields (ikman exposes a color dropdown), the system must not overwrite it with a GPT-detected value. The color written by each stage must respect the following priority order:

1. Spec field value (scraped directly from the source site)
2. Color extracted from the listing title
3. GPT-4o mini vision result

MongoDB conditional update expressions (`$cond`) enforce this rule at the database level.

---

### FR-08 — Listing Lifecycle Management

The system must track whether each listing is still active on its source website. At the end of every scrape run, any listing that was not seen in the current run (i.e., its `lastScrapedAt` timestamp is earlier than the run start time) must have its `isActive` flag set to `false`. This ensures that listings removed from the source site are not shown to end users.

---

### FR-09 — Raw Data Preservation

In addition to the normalised `vehicles` collection, every scraping run must also write the original, untouched scraped data to source-specific collections: `ikman_listings` and `riyasewana_listings`. These collections serve as the source of truth and audit trail, and their data is never modified by the enrichment pipeline.

---

### FR-10 — Vehicle Search and Filtering (Frontend — Planned)

The frontend application must allow users to search and filter the vehicle inventory using the following criteria simultaneously: brand, model, year range, price range, category, exterior color, and minimum / maximum mileage. Results must be sortable by price, year, and listing date. Each result must display a thumbnail image, key specification highlights, and a link to the source listing.

---

## Non-Functional Requirements

Non-functional requirements describe the quality standards the system must meet — how well it performs, how reliably it operates, and how easily it can be maintained.

---

### NFR-01 — Performance

The scraper must process multiple listings in parallel rather than one at a time. A configurable concurrency pool (default: 3 browser tabs running simultaneously) ensures the scraping throughput is meaningfully higher than a sequential implementation while remaining within the rate limits and acceptable usage patterns of the source websites. Text enrichment, being pure in-memory regex computation, must add negligible latency per listing.

---

### NFR-02 — Reliability and Fault Tolerance

The system must not fail an entire scrape run because of a single problematic listing. Individual listing errors must be caught, logged, and counted — the run continues to the next listing. Page navigation must include automatic retry logic (up to three attempts with exponential backoff) to handle transient network failures. GPT-4o mini calls include one retry before storing null.

---

### NFR-03 — Respectful Crawling

The scraper must introduce a random delay between page requests (configurable; default 2 – 5 seconds) to avoid placing excessive load on source websites. Navigation must use a realistic browser user-agent and accept-language header to behave as a normal browser session.

---

### NFR-04 — Cost Efficiency

The image enrichment pipeline must keep OpenAI API costs per vehicle below a practical threshold. Using GPT-4o mini with `detail: low` image mode (85 tokens per image), the cost of processing six images per listing is approximately USD 0.00012. The system must not re-process listings that have already been enriched unless explicitly instructed to do so via the `--rerun` flag.

---

### NFR-05 — Data Integrity

The normalised `vehicles` collection must never contain duplicate documents for the same listing. Upsert operations (MongoDB `findOneAndUpdate` with `upsert: true`) combined with deterministic vehicleId generation ensure idempotency — running the scraper twice produces the same result as running it once.

---

### NFR-06 — Security

API keys (OpenAI) and database connection strings must never be hardcoded in source files. All secrets must be loaded exclusively from environment variables via a `.env` file that is excluded from version control. No user-supplied input is executed as code or passed directly to the database.

---

### NFR-07 — Maintainability and Extensibility

The scraper architecture must follow a template-method pattern. A shared `BaseScraper` class handles browser lifecycle, page navigation, retry logic, polite delays, and the concurrency pool. Each concrete scraper (`IkmanScraper`, `RiyasewanaScraper`) only implements the site-specific logic it needs. Adding a third scraping source requires implementing three methods — `_extractListings`, `_extractDetailData`, and `_processListing` — without modifying any shared infrastructure.

---

### NFR-08 — Logging and Observability

Every significant event — browser launch, category start, page fetch, listing upsert, color detection result, error — must be logged with a structured prefix identifying the source and action. Log levels (debug, info, warn, error) must be used consistently so that verbose detail-page logs can be suppressed in production without losing error visibility.

---

### NFR-09 — Portability

The system must run on any machine with Node.js 20+ and a MongoDB instance, whether local or hosted. All dependencies are managed through npm. Playwright's built-in Chromium download removes the need to install a separate browser manually.

---

---

# DELIVERABLES OF THE PROJECT

---

## Project Starting Point

The project began from scratch. At the start of development there was:

- An empty MongoDB database with no collections or data.
- A bare Node.js project directory with only a `package.json` stub — no scraping logic, no models, no services.
- No existing integration with the OpenAI API.
- No scrapers, parsers, or enrichment services.
- No documentation or architecture design.

The challenge was to design and build the entire data pipeline from first principles, including solving non-trivial problems such as CDN image protection bypass, multi-source field normalisation, and cost-effective AI-based attribute extraction.

---

## Itemized List of Deliverables

---

### Deliverable 1 — Data Models (MongoDB Mongoose Schemas)

Three Mongoose schemas defining the structure of all MongoDB collections.

- **`Vehicle`** — The normalised master schema covering all 28 fields including enrichment timestamps, color fields, features array, and isActive lifecycle flag. Includes compound indexes for common query patterns.
- **`IkmanListing`** — Raw listing schema for ikman.lk data, preserving both the list-page stub and the full detail-page payload.
- **`RiyasewanaListing`** — Raw listing schema for riyasewana.com data, structurally equivalent to IkmanListing.

---

### Deliverable 2 — IkmanScraper

A fully functional scraper for ikman.lk covering four vehicle categories: Cars, SUVs/Jeeps, Vans, and Double-Cabs.

Key capabilities:
- Paginated list page traversal with automatic stop when the last page is reached.
- Detail page extraction including specification table, variant/grade (limitedEditionName), seller contact, and photo metadata.
- Correct CDN URL construction for all photo sizes.
- Price parsing that handles the "Rs X,XXX,XXX — Negotiable" format.
- Category normalisation from ikman's body-type dropdown.

---

### Deliverable 3 — RiyasewanaScraper

A fully functional scraper for riyasewana.com covering four vehicle categories: Cars, SUVs, Vans, and Cabs.

Key capabilities:
- Paginated list page traversal with "Next" link detection.
- Detail page extraction including the `table.moret` specification table, seller name, posted date, and full-size photo URLs.
- In-session image capture using Playwright's `page.on('response', ...)` listener — the browser's established session bypasses CDN protection that would block direct HTTP image requests.
- Regex-based image URL filtering (`/\.(jpe?g|webp|png)(\?|#|$)/i`) that correctly handles URLs with query parameters such as `photo.jpg?v=3`.
- `Promise.allSettled()` drain pattern to ensure all image buffers are fully captured before the page is closed.

---

### Deliverable 4 — BaseScraper

A shared base class providing all infrastructure that is common across scrapers.

- Playwright browser and context lifecycle (`launch`, `close`).
- Page navigation with configurable retry logic and exponential backoff.
- Polite random delay between requests.
- Concurrency pool — splits listing stubs into chunks of N and processes each chunk with `Promise.all`, giving an N× throughput improvement over sequential processing.

---

### Deliverable 5 — Parsers (ikman and riyasewana)

Two parser modules, one per source, each containing `parseListPage` and `parseDetailPage` functions.

- Price parser that strips currency prefixes and commas without producing floating-point errors.
- Mileage, year, and engine CC parsers with NaN guards.
- Posted-date parser that handles site-specific date string formats.
- Category normaliser mapping raw body-type strings to the shared enum.
- `normaliseColor` function mapping over 100 raw paint names (e.g. "Pearl White", "Gun Metal", "Candy Red") to 20 standard color values.

---

### Deliverable 6 — VehicleService

The central service layer that connects scraping output to the database.

- `upsert()` — writes a normalised vehicle document using a deterministic vehicleId, runs text enrichment inline, and applies the color priority rule.
- `setImageColors()` — MongoDB aggregation pipeline update that writes image-detected colors only to fields currently holding null.
- `deactivateStaleListing()` — marks all vehicles from a given source with `isActive: false` if their `scrapedAt` is older than the current run start.

---

### Deliverable 7 — TextEnrichmentService

A pure in-memory regex service with no external dependencies or I/O.

- 30+ feature detection patterns across nine feature categories.
- Owner count extraction from ordinal and numeric phrasing.
- Company-maintained flag detection.
- Interior color extraction from free-text descriptions.
- `normaliseColor` and `extractColorFromTitle` utility functions shared with the parsers.

---

### Deliverable 8 — ImageEnrichmentService

The GPT-4o mini Vision API integration for exterior color detection.

- Image URL fetch with timeout and Referer spoofing for CDN-protected sources.
- Image buffer resize to 512 × 512 JPEG via sharp before API submission.
- Single batched API call for up to 6 images per listing.
- Structured system prompt with explicit Sri Lankan license plate guidance.
- Retry mechanism with a simplified prompt on null responses.
- Two public functions: `enrichImages()` for URL-based processing (ikman) and `enrichFromBuffers()` for buffer-based processing (riyasewana).

---

### Deliverable 9 — Image Enrichment Batch Script

A standalone command-line script (`src/scripts/enrich-images.js`) that processes all ikman vehicles with pending image enrichment.

- Queries the database for vehicles where `imageEnrichedAt` is null and `source = 'ikman'`.
- Supports `--limit N` for test runs and `--rerun` to reprocess already-enriched vehicles.
- Processes three vehicles in parallel.
- Available as `npm run enrich:images` and `npm run enrich:images:test`.

---

### Deliverable 10 — Scraper Configuration

A central configuration file (`src/config/scraper.js`) defining all scraping targets, browser settings, concurrency, and delay parameters for both sources in one place, making it straightforward to add new categories or adjust rate-limiting behaviour without touching scraper code.

---

### Deliverable 11 — Architecture Documentation and Diagrams

A complete set of architecture diagrams covering:

- Figure 3.1 — High-level four-layer system architecture.
- Figure 3.3 — Vehicle document schema (ER diagram).
- Figure 3.5 — Two-phase scraping process flowchart.
- Figure 3.7 — Riyasewana response interception sequence diagram.
- Figure 3.8 — GPT-4o mini API call structure and retry flow.
- Figure 3.10 — Data normalisation pipeline from two sources to one collection.

All diagrams are provided as a self-contained HTML file (`docs/diagrams.html`) rendered in black and white using standard UML conventions, suitable for direct inclusion in the academic report.

---

### Deliverable 12 — Academic Report Chapters

Written documentation covering:

- **Literature Review** — background on web scraping, data normalisation, and AI-assisted enrichment; gap analysis; research methodology.
- **Implementation Chapter** — detailed technical description of the data pipeline with reference to all figures.
- **Validation Chapter** — test plan and test cases covering all system components.
- **Appendices** — configuration reference, schema reference, and API specification.

---

---

# CHAPTER 06 — CONCLUSION AND FUTURE WORK

---

## 6.1 Conclusion

This project set out to solve a real problem for vehicle buyers in Sri Lanka: the fragmentation of car listings across multiple websites, each with its own format, and no single place to search, filter, and compare them consistently.

The result is a working backend data pipeline — FindMyRide — that automatically collects vehicle listings from two of Sri Lanka's most active car marketplaces, ikman.lk and riyasewana.com, normalises them into a single structured database, and enriches each listing with additional attributes that the source websites do not provide directly.

Several non-trivial engineering problems were solved during development:

**CDN protection bypass** — riyasewana.com's CDN blocks post-scrape HTTP image requests. The solution was to capture image data passively during the browser's own page load using Playwright's `page.on('response', ...)` listener, so the images are received within the browser's established, trusted session without making any additional requests.

**Route pattern bug** — an early implementation used a glob pattern (`**/*.jpg`) to filter image responses, which silently failed for URLs containing query parameters (e.g., `photo.jpg?v=3`). Replacing it with a regex (`/\.(jpe?g|webp|png)(\?|#|$)/i`) resolved the issue and extended coverage to WebP and PNG formats simultaneously.

**Multi-source normalisation** — the two sites use meaningfully different field names, price string formats, category schemes, and photo URL structures. A dedicated parser layer handles all translation, and a shared normalised schema means the rest of the system never needs to know which source a listing came from.

**Cost-efficient AI enrichment** — GPT-4o mini with `detail: low` image mode allows exterior color detection at approximately USD 0.00012 per vehicle, making AI enrichment economically viable at scale. A carefully constructed system prompt, with explicit guidance about Sri Lankan license plates, significantly improved accuracy.

At the time of writing, the pipeline successfully scrapes thousands of listings across eight vehicle categories, stores raw and normalised data in MongoDB, and enriches each listing with features, owner count, company maintenance status, and exterior color.

---

## 6.2 Future Work

The following areas represent the planned next steps for the project.

---

### 6.2.1 Automated Scheduled Scraping

Currently, scraping runs must be triggered manually by executing a command. In the production system, this will be replaced by an automated scheduler so the database stays current without any manual intervention.

The `node-cron` library is already included as a dependency. The planned schedule is:
- **ikman.lk** — every 6 hours, to capture the high volume of new listings that appear throughout the day.
- **riyasewana.com** — once daily at 3:00 AM, aligned with the lower posting frequency on that site.

The scheduler will run as part of the main server process, ensuring that as soon as the application is deployed, scraping begins automatically and continues on schedule indefinitely.

---

### 6.2.2 Real-Time Listing Removal Detection

At present, a listing is marked as inactive (`isActive: false`) only when it does not appear in a full scrape run. This means there is always a delay — a listing removed from the source site at midday may not be marked inactive until the next scheduled scrape runs that evening. During this window, users of the FindMyRide frontend would see an ad that no longer exists.

The planned solution is a dedicated **removal-check service** that runs on a frequent schedule (for example, every 30 minutes) and performs lightweight checks on all currently active listings. For each listing, the service makes a single HTTP request to the listing's source URL and checks whether the page returns a valid listing or a "not found" / "listing removed" response. If the listing has been removed, the vehicle document is immediately updated — `isActive: false` — and the frontend reflects this change in real time at the next page load.

This feature is distinct from the full scraper because it does not need to re-scrape content. It only needs to verify existence, making it fast and low-cost.

---

### 6.2.3 More Powerful Vision Model for Color Detection

GPT-4o mini was chosen for its low cost during the development and data-collection phase. While it performs well for straightforward cases, it occasionally misidentifies color on vehicles with complex metallic finishes, two-tone paint, or listings with very poor photography.

As the system moves toward production, the image enrichment pipeline will be evaluated with more capable models — either **GPT-4o** (the full model, with higher accuracy at greater cost) or a fine-tuned vision model trained specifically on vehicle exterior color classification. The `ImageEnrichmentService` is designed with a single configurable model name parameter, so switching models requires changing one line in the configuration.

---

### 6.2.4 Frontend Application and REST API

The user-facing layer of FindMyRide — the search and browse interface — is the most visible remaining deliverable. This will be built as a **Next.js** application backed by a **REST API** layer that queries the `vehicles` collection.

Planned frontend features include:
- Full-text and faceted search across brand, model, category, color, year, price, and mileage.
- Side-by-side listing comparison.
- Listing detail pages showing all specification fields, the full photo gallery, and a direct link to the original source listing.
- Price history display per model/year combination, once enough historical data has been accumulated.
- Mobile-responsive layout optimised for the Sri Lankan mobile-first market.

---

### 6.2.5 Additional Data Sources

The scraper architecture is designed to accommodate new sources with minimal effort. The `BaseScraper` class handles all shared infrastructure, so adding a third marketplace requires writing only the site-specific DOM extraction logic. Planned future sources include other Sri Lankan vehicle listing platforms, which would significantly increase the inventory coverage available to users.

---

### 6.2.6 User Features

Once the frontend is live, user-facing features are planned including saved searches, price-drop alerts, and email notifications when a listing matching a user's saved criteria is found. These features will require a user authentication layer, which is not part of the current scope.
