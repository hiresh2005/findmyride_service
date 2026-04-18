/**
 * TextEnrichmentService
 *
 * Extracts structured fields from free-text vehicle descriptions.
 * Pure JS — no external dependencies, runs inline during scraping.
 *
 * Extracts:
 *   owners           — number of previous owners
 *   features         — array of detected feature labels
 *   companyMaintained — boolean
 *   interiorColor    — color name found in text
 */

// ── Owners ────────────────────────────────────────────────────────────────────

const OWNER_ORDINAL = [
  { regex: /\b(1st|first|one|single)\s*(and\s*only\s*)?(previous\s*)?owner\b/i, value: 1 },
  { regex: /\b(2nd|second|two)\s*(previous\s*)?owner\b/i,                        value: 2 },
  { regex: /\b(3rd|third|three)\s*(previous\s*)?owner\b/i,                       value: 3 },
  { regex: /\b(4th|fourth|four)\s*(previous\s*)?owner\b/i,                       value: 4 },
];

// "3 owners" / "3 previous owners" — numeric form
const OWNER_NUMERIC = /\b(\d+)\s*(previous\s*)?owner/i;

function extractOwners(text) {
  for (const { regex, value } of OWNER_ORDINAL) {
    if (regex.test(text)) return value;
  }
  const m = text.match(OWNER_NUMERIC);
  if (m) {
    const n = parseInt(m[1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

// ── Features ──────────────────────────────────────────────────────────────────

/**
 * Each entry: [regex, label]
 * Patterns are ordered from most specific to least specific.
 */
const FEATURE_PATTERNS = [
  // Roof
  [/panoramic\s*(roof|sun\s*roof)/i,                         'Panoramic Roof'],
  [/sun\s*roof|moon\s*roof/i,                                'Sunroof'],

  // Infotainment
  [/apple\s*car\s*play|apple\s*carplay|\bcarplay\b/i,        'Apple CarPlay'],
  [/android\s*auto/i,                                        'Android Auto'],
  [/\bnavigation\b|\bnav\s+system\b|\bgps\s+navigation\b/i,  'Navigation'],
  [/bluetooth/i,                                             'Bluetooth'],

  // Cameras & sensors
  [/reverse\s*cam(era)?|backup\s*cam(era)?|rear[\s-]?view\s*cam(era)?|rear\s*cam(era)?/i, 'Reverse Camera'],
  [/parking\s*sens(or)?s?|park\s*sens(or)?s?|pdc/i,         'Parking Sensors'],
  [/front\s*cam(era)?/i,                                     'Front Camera'],
  [/360\s*(degree|°)?\s*cam(era)?|surround\s*view/i,         '360 Camera'],

  // Driver assistance
  [/adaptive\s*cruise|cruise\s*control/i,                    'Cruise Control'],
  [/lane\s*(keep|assist|departure|warning)/i,                'Lane Assist'],
  [/blind\s*spot/i,                                          'Blind Spot Monitor'],
  [/collision\s*(warning|detect|prevent)/i,                  'Collision Warning'],

  // Lights
  [/(\bHID\b|\bxenon\b)\s*(headlights?)?/i,                  'HID/Xenon Lights'],
  [/led\s*(headlights?|drl|daytime|lights?)/i,               'LED Lights'],

  // Entry & start
  [/push\s*(start|button)|keyless\s*(start|entry|go|ignition)|smart\s*key/i, 'Push Start / Keyless Entry'],
  [/remote\s*(start|engine\s*start)/i,                       'Remote Start'],

  // Seats & interior comfort
  [/leather\s*(seats?|interior)|genuine\s*leather/i,         'Leather Seats'],
  [/heated\s*seats?/i,                                       'Heated Seats'],
  [/electric\s*(seats?|memory\s*seats?)|power\s*seats?/i,    'Electric Seats'],
  [/ventilated\s*seats?/i,                                   'Ventilated Seats'],

  // Climate
  [/dual[\s-]zone|tri[\s-]zone|climate\s*control/i,          'Climate Control'],
  [/\bHVAC\b/i,                                              'Climate Control'],

  // Safety
  [/air\s*bag/i,                                             'Airbags'],
  [/\bABS\b/i,                                               'ABS'],
  [/\bESC\b|\bESP\b|\bVSC\b|\bstability\s*control\b/i,       'Stability Control'],
  [/\bEBD\b/i,                                               'EBD'],

  // Windows & roof
  [/power\s*windows?|electric\s*windows?/i,                  'Power Windows'],
  [/power\s*steering|electric\s*steering/i,                  'Power Steering'],

  // Towing & offroad
  [/tow\s*(bar|hitch|hook)/i,                                'Tow Bar'],
  [/4wd|4x4|all[\s-]wheel\s*drive|awd/i,                    '4WD / AWD'],
  [/\bdiff\s*lock\b|differential\s*lock/i,                   'Diff Lock'],
];

function extractFeatures(text) {
  const found = [];
  const seen = new Set();
  for (const [regex, label] of FEATURE_PATTERNS) {
    if (!seen.has(label) && regex.test(text)) {
      found.push(label);
      seen.add(label);
    }
  }
  return found;
}

// ── Company / Agent maintained ─────────────────────────────────────────────────

const COMPANY_MAINTAINED = /company[\s-]*(maintained|serviced|kept)|agent[\s-]*(maintained|serviced)/i;

function extractCompanyMaintained(text) {
  return COMPANY_MAINTAINED.test(text) ? true : null;  // null = not mentioned (vs false = explicitly not maintained)
}

// ── Interior color ────────────────────────────────────────────────────────────

const COLOR_ALIASES = { gray: 'Grey', grey: 'Grey', ivory: 'Cream', burgundy: 'Maroon' };

const INTERIOR_COLORS = [
  'black', 'beige', 'grey', 'gray', 'tan', 'brown',
  'cream', 'ivory', 'red', 'blue', 'white', 'silver',
  'maroon', 'burgundy', 'champagne',
];

function extractInteriorColor(text) {
  for (const color of INTERIOR_COLORS) {
    // "black interior" or "interior: black" or "interior is black"
    const pattern = new RegExp(
      `\\b${color}\\s+interior|interior[\\s:]+(?:is\\s+)?${color}\\b|${color}\\s+upholstery`,
      'i'
    );
    if (pattern.test(text)) {
      const normalized = COLOR_ALIASES[color.toLowerCase()] ?? (color[0].toUpperCase() + color.slice(1));
      return normalized;
    }
  }
  return null;
}

// ── Scraped color normalisation ────────────────────────────────────────────────

/**
 * Maps a raw color string scraped from listing specs (e.g. "Pearl White",
 * "Gun Metal", "Dark Blue Metallic") to one of our standard color names.
 *
 * More specific / longer patterns are checked before shorter ones so that
 * "dark blue" maps to 'Dark Blue' rather than plain 'Blue'.
 *
 * Returns null for unknown or empty values.
 */
const COLOR_NORM_MAP = [
  // ── Specific multi-word patterns (check before single-word) ────────────────
  ['off white',            'White'],
  ['pearl white',          'White'],
  ['diamond white',        'White'],
  ['taffeta white',        'White'],
  ['polar white',          'White'],
  ['crystal white',        'White'],
  ['pure white',           'White'],
  ['sonic white',          'White'],
  ['alpine white',         'White'],
  ['star silver',          'Silver'],
  ['lunar silver',         'Silver'],
  ['moon rock',            'Silver'],
  ['platinum silver',      'Silver'],
  ['crystal silver',       'Silver'],
  ['dark grey',            'Dark Grey'],
  ['dark gray',            'Dark Grey'],
  ['gun metal',            'Dark Grey'],
  ['gunmetal',             'Dark Grey'],
  ['graphite grey',        'Dark Grey'],
  ['charcoal grey',        'Dark Grey'],
  ['midnight black',       'Black'],
  ['crystal black',        'Black'],
  ['piano black',          'Black'],
  ['dark blue',            'Dark Blue'],
  ['navy blue',            'Navy'],
  ['midnight blue',        'Navy'],
  ['ocean blue',           'Dark Blue'],
  ['deep blue',            'Dark Blue'],
  ['sky blue',             'Blue'],
  ['royal blue',           'Blue'],
  ['dark green',           'Dark Green'],
  ['forest green',         'Dark Green'],
  ['racing green',         'Dark Green'],
  ['british racing green', 'Dark Green'],
  ['olive green',          'Green'],
  ['emerald green',        'Green'],
  ['dark red',             'Maroon'],
  ['deep red',             'Maroon'],
  ['wine red',             'Maroon'],
  ['dark brown',           'Dark Brown'],
  ['champagne gold',       'Gold'],
  ['rose gold',            'Gold'],
  ['solar yellow',         'Gold'],
  // ── Single-word / base colours ─────────────────────────────────────────────
  ['black',       'Black'],
  ['white',       'White'],
  ['silver',      'Silver'],
  ['grey',        'Grey'],
  ['gray',        'Grey'],
  ['graphite',    'Dark Grey'],
  ['charcoal',    'Dark Grey'],
  ['titanium',    'Grey'],
  ['steel',       'Grey'],
  ['red',         'Red'],
  ['scarlet',     'Red'],
  ['ruby',        'Red'],
  ['cherry',      'Red'],
  ['maroon',      'Maroon'],
  ['burgundy',    'Maroon'],
  ['wine',        'Maroon'],
  ['merlot',      'Maroon'],
  ['navy',        'Navy'],
  ['blue',        'Blue'],
  ['azure',       'Blue'],
  ['cobalt',      'Blue'],
  ['sapphire',    'Blue'],
  ['cerulean',    'Blue'],
  ['green',       'Green'],
  ['emerald',     'Green'],
  ['jade',        'Green'],
  ['olive',       'Green'],
  ['orange',      'Orange'],
  ['amber',       'Orange'],
  ['yellow',      'Yellow'],
  ['lemon',       'Yellow'],
  ['gold',        'Gold'],
  ['golden',      'Gold'],
  ['champagne',   'Champagne'],
  ['cashmere',    'Champagne'],
  ['beige',       'Beige'],
  ['sand',        'Beige'],
  ['tan',         'Tan'],
  ['caramel',     'Tan'],
  ['cream',       'Cream'],
  ['ivory',       'Cream'],
  ['vanilla',     'Cream'],
  ['brown',       'Brown'],
  ['chocolate',   'Brown'],
  ['bronze',      'Brown'],
  ['copper',      'Brown'],
  ['hazel',       'Brown'],
  ['purple',      'Purple'],
  ['violet',      'Purple'],
  ['pink',        'Pink'],
  ['rose',        'Pink'],
];

/**
 * Normalises a raw scraped color string to a standard color name.
 * Returns null if the input is blank, "n/a", or unrecognised.
 *
 * @param {string|null} raw  e.g. "Pearl White", "Gun Metal", "Midnight Blue"
 * @returns {string|null}    e.g. "White", "Dark Grey", "Navy"
 */
export function normaliseColor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim();
  if (!lower || lower === '-' || lower === 'n/a' || lower === 'other') return null;

  for (const [keyword, name] of COLOR_NORM_MAP) {
    if (lower.includes(keyword)) return name;
  }
  return null;
}

/**
 * Extracts an exterior color from a listing title by searching for color
 * keywords in the portion of the title AFTER the model year.
 *
 * Sri Lankan listing titles follow "Brand Model Year [Color] [details]":
 *   "Toyota Aqua 2018 White for Sale"       → 'White'
 *   "Honda Fit GP5 2019 (Silver Metallic)"  → 'Silver'
 *   "Suzuki Alto 2020"                       → null
 *
 * Restricting to text after the year avoids false positives from brand or
 * model names that happen to contain colour words (e.g. "Red Bull Edition").
 *
 * @param {string|null} title
 * @returns {string|null}
 */
export function extractColorFromTitle(title) {
  if (!title || typeof title !== 'string') return null;

  // Look for colour in text after the 4-digit year
  const afterYear = title.match(/\b(?:19|20)\d{2}\b(.*)/);
  if (afterYear) {
    const color = normaliseColor(afterYear[1]);
    if (color) return color;
  }

  // Parenthesised colour anywhere in the title: "(White)", "(Silver Metallic)"
  const paren = title.match(/\(([^)]{2,30})\)/);
  if (paren) return normaliseColor(paren[1]);

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {string|null} description
 * @returns {{ owners, features, companyMaintained, interiorColor }}
 */
export function enrichFromText(description) {
  if (!description || typeof description !== 'string') {
    return { owners: null, features: [], companyMaintained: null, interiorColor: null };
  }

  return {
    owners:            extractOwners(description),
    features:          extractFeatures(description),
    companyMaintained: extractCompanyMaintained(description),
    interiorColor:     extractInteriorColor(description),
  };
}
