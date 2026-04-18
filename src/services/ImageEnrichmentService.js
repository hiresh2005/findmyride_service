/**
 * ImageEnrichmentService — GPT-4o mini exterior color detection
 *
 * Sends up to 3 vehicle listing photos in a SINGLE API call to GPT-4o mini.
 * The model identifies the exterior body paint color only.
 *
 * If the first attempt returns null a retry fires with a simplified prompt.
 *
 * Cost: ~$0.00005 per vehicle (3 images × 85 tokens each at low detail).
 * Requires: OPENAI_API_KEY in .env
 *
 * Dependencies: openai, sharp
 */

import OpenAI from 'openai';
import sharp from 'sharp';
import logger from '../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;
const MAX_IMAGES       = 6;   // up to 6 images for better angle coverage

// ── OpenAI client ─────────────────────────────────────────────────────────────

let _openai = null;

function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('[ImageEnrichment] OPENAI_API_KEY is not set in environment');
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ── Network helpers ────────────────────────────────────────────────────────────

function normaliseImageUrl(url) {
  return url.replace(/\/(large|small)$/, '/540/405/cropped.jpg');
}

function refererFor(url) {
  if (url.includes('ikman-st.com')) return 'https://ikman.lk/';
  if (url.includes('riyasewana'))   return 'https://riyasewana.com/';
  return undefined;
}

async function fetchImageBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  const ref = refererFor(url);
  if (ref) headers['Referer'] = ref;

  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error(`Response too small (${buf.length} bytes)`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// ── Image preparation ─────────────────────────────────────────────────────────

/**
 * Resize to 512×512 JPEG before upload.
 * OpenAI low-detail mode caps images at 512×512 anyway — resizing on our side
 * reduces upload bandwidth without any loss of color information.
 */
async function resizeForUpload(raw) {
  return sharp(raw)
    .resize(512, 512, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// ── GPT-4o mini prompts ───────────────────────────────────────────────────────

// Primary prompt — strict, detailed guidance
const SYSTEM_PROMPT = `You are a vehicle body paint color detector for a Sri Lankan car listing website.

You will receive up to 6 photos from the same car listing. Your ONLY job is to identify the BODY PAINT COLOR of the vehicle — the color of the large painted metal panels (doors, hood, roof, fenders, trunk lid, bumpers).

STEP 1 — Find exterior shots: Look through the photos and identify the ones that show the outside of the vehicle.
STEP 2 — Identify the dominant body color: From those exterior shots, determine the color covering the largest painted area of the car body.
STEP 3 — Output the result.

━━━ WHAT TO LOOK AT ━━━
✓ Car doors, hood, roof, boot/trunk, fenders, bumpers
✓ The large painted surface that makes up the bulk of the car body

━━━ WHAT TO COMPLETELY IGNORE ━━━
✗ LICENSE PLATES / NUMBER PLATES — these are small rectangular signs at the front/rear of the car.
  Sri Lankan plates can be RED, YELLOW, WHITE, or BLUE — but that is NOT the car's color.
  Example: a blue car can have a red plate. The car is still BLUE.
✗ Stickers, decals, vinyl wraps, badges, emblems
✗ Window glass and window tint
✗ Wheel rims, tyres
✗ Interior visible through windows
✗ Background walls, other vehicles, or any objects behind the car

━━━ VALID COLORS ━━━
Pick exactly one: White, Silver, Grey, Black, Red, Maroon, Blue, Dark Blue, Light Blue, Green, Dark Green, Orange, Yellow, Gold, Beige, Brown, Purple

Respond ONLY with valid JSON, no explanation.`;

const USER_PROMPT = `Identify the body paint color of this vehicle. Remember: ignore license plates — they are not the car's color.
Respond ONLY with valid JSON: {"exteriorColor": "<one color from the valid list>"}`;

// Retry prompt — broader, simpler language when first attempt returns null
const RETRY_SYSTEM_PROMPT = `Look at these car photos. What color are the large body panels (doors, hood, roof)?

Important: the license plate at the front/back of the car is NOT the car's color. Only look at the painted body.

Pick the closest: White, Silver, Grey, Black, Red, Maroon, Blue, Dark Blue, Light Blue, Green, Orange, Yellow, Gold, Beige, Brown

Respond ONLY with valid JSON: {"exteriorColor": "<color>"}`;

const RETRY_USER_PROMPT = `What color is the car body (not the plate)? Respond ONLY with valid JSON: {"exteriorColor": "<color>"}`;

// ── Classification helpers ─────────────────────────────────────────────────────

/**
 * Returns the exteriorColor string, or null if GPT could not determine it.
 * @param {string[]} base64Images
 * @param {boolean}  isRetry
 */
async function classifyWithGPT(base64Images, isRetry = false) {
  const openai = getOpenAI();

  const imageContent = base64Images.map((b64) => ({
    type: 'image_url',
    image_url: {
      url:    `data:image/jpeg;base64,${b64}`,
      detail: 'low',   // 85 tokens/image — sufficient for color detection
    },
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: isRetry ? RETRY_SYSTEM_PROMPT : SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: isRetry ? RETRY_USER_PROMPT : USER_PROMPT },
        ],
      },
    ],
    max_tokens:      50,
    temperature:     0,
    response_format: { type: 'json_object' },
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '{}';
  try {
    const parsed = JSON.parse(text);
    const color = parsed.exteriorColor ?? null;
    // Treat "Unknown" / "unknown" as null so the retry fires
    return (color && color.toLowerCase() !== 'unknown') ? color : null;
  } catch {
    logger.warn(`[ImageEnrichment] Unexpected GPT response: ${text}`);
    return null;
  }
}

/**
 * Classify exterior color from base64 images.
 * Retries once with a simplified prompt if the first attempt returns null.
 * Returns null only when both attempts fail — never forces a wrong guess.
 */
async function detectExteriorColor(base64Images) {
  let color = await classifyWithGPT(base64Images, false);
  if (!color) {
    logger.info('[ImageEnrichment] Primary classification returned null — retrying with simplified prompt');
    color = await classifyWithGPT(base64Images, true);
  }
  return color;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch and classify exterior color for URL-based images (ikman batch script).
 *
 * @param {Array<{ url: string }>} images
 * @returns {{ exteriorColor: string|null, interiorColorFromImage: null }}
 */
export async function enrichImages(images) {
  const toProcess = images.slice(0, MAX_IMAGES);
  if (!toProcess.length) return { exteriorColor: null, interiorColorFromImage: null };

  const base64Images = [];
  for (const img of toProcess) {
    try {
      const raw     = await fetchImageBuffer(normaliseImageUrl(img.url));
      const resized = await resizeForUpload(raw);
      base64Images.push(resized.toString('base64'));
    } catch (err) {
      logger.warn(`[ImageEnrichment] Fetch failed for ${img.url}: ${err.message}`);
    }
  }

  if (!base64Images.length) return { exteriorColor: null, interiorColorFromImage: null };

  const exteriorColor = await detectExteriorColor(base64Images);
  return { exteriorColor, interiorColorFromImage: null };
}

/**
 * Classify exterior color from raw image buffers (riyasewana inline scraping).
 * Buffers are captured by Playwright route interception — no separate fetch needed.
 *
 * @param {Buffer[]} buffers  Raw image buffers in page display order
 * @returns {{ exteriorColor: string|null, interiorColorFromImage: null }}
 */
export async function enrichFromBuffers(buffers) {
  const toProcess = buffers.slice(0, MAX_IMAGES);
  if (!toProcess.length) return { exteriorColor: null, interiorColorFromImage: null };

  const base64Images = [];
  for (const raw of toProcess) {
    try {
      const resized = await resizeForUpload(raw);
      base64Images.push(resized.toString('base64'));
    } catch (err) {
      logger.warn(`[ImageEnrichment] Buffer resize failed: ${err.message}`);
    }
  }

  if (!base64Images.length) return { exteriorColor: null, interiorColorFromImage: null };

  const exteriorColor = await detectExteriorColor(base64Images);
  return { exteriorColor, interiorColorFromImage: null };
}
