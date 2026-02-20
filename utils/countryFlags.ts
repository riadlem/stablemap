
// Country name → flag emoji mapping
// Supports common country names, abbreviations, and variations

const COUNTRY_FLAGS: Record<string, string> = {
  // Americas
  'usa': '🇺🇸', 'united states': '🇺🇸', 'us': '🇺🇸', 'u.s.': '🇺🇸', 'u.s.a.': '🇺🇸', 'america': '🇺🇸',
  'canada': '🇨🇦', 'ca': '🇨🇦',
  'mexico': '🇲🇽', 'brasil': '🇧🇷', 'brazil': '🇧🇷',
  'argentina': '🇦🇷', 'chile': '🇨🇱', 'colombia': '🇨🇴', 'peru': '🇵🇪',
  'bermuda': '🇧🇲', 'cayman islands': '🇰🇾', 'bahamas': '🇧🇸', 'jamaica': '🇯🇲',
  'el salvador': '🇸🇻', 'costa rica': '🇨🇷', 'panama': '🇵🇦',

  // Europe
  'united kingdom': '🇬🇧', 'uk': '🇬🇧', 'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'britain': '🇬🇧', 'great britain': '🇬🇧',
  'germany': '🇩🇪', 'de': '🇩🇪', 'deutschland': '🇩🇪',
  'france': '🇫🇷', 'fr': '🇫🇷',
  'italy': '🇮🇹', 'italia': '🇮🇹',
  'spain': '🇪🇸', 'españa': '🇪🇸',
  'portugal': '🇵🇹',
  'netherlands': '🇳🇱', 'holland': '🇳🇱', 'the netherlands': '🇳🇱',
  'belgium': '🇧🇪',
  'luxembourg': '🇱🇺',
  'switzerland': '🇨🇭', 'ch': '🇨🇭', 'suisse': '🇨🇭',
  'austria': '🇦🇹',
  'ireland': '🇮🇪',
  'sweden': '🇸🇪',
  'norway': '🇳🇴',
  'denmark': '🇩🇰',
  'finland': '🇫🇮',
  'iceland': '🇮🇸',
  'poland': '🇵🇱',
  'czech republic': '🇨🇿', 'czechia': '🇨🇿',
  'hungary': '🇭🇺',
  'romania': '🇷🇴',
  'bulgaria': '🇧🇬',
  'croatia': '🇭🇷',
  'greece': '🇬🇷',
  'cyprus': '🇨🇾',
  'malta': '🇲🇹',
  'estonia': '🇪🇪',
  'latvia': '🇱🇻',
  'lithuania': '🇱🇹',
  'slovenia': '🇸🇮',
  'slovakia': '🇸🇰',
  'liechtenstein': '🇱🇮',
  'monaco': '🇲🇨',
  'russia': '🇷🇺',
  'ukraine': '🇺🇦',
  'turkey': '🇹🇷', 'türkiye': '🇹🇷',

  // Asia-Pacific
  'japan': '🇯🇵', 'jp': '🇯🇵',
  'china': '🇨🇳', 'cn': '🇨🇳', 'prc': '🇨🇳',
  'south korea': '🇰🇷', 'korea': '🇰🇷',
  'india': '🇮🇳', 'in': '🇮🇳',
  'singapore': '🇸🇬', 'sg': '🇸🇬',
  'hong kong': '🇭🇰', 'hk': '🇭🇰',
  'taiwan': '🇹🇼',
  'thailand': '🇹🇭',
  'vietnam': '🇻🇳',
  'indonesia': '🇮🇩',
  'malaysia': '🇲🇾',
  'philippines': '🇵🇭',
  'australia': '🇦🇺', 'au': '🇦🇺',
  'new zealand': '🇳🇿', 'nz': '🇳🇿',
  'pakistan': '🇵🇰',
  'bangladesh': '🇧🇩',
  'sri lanka': '🇱🇰',
  'myanmar': '🇲🇲',
  'cambodia': '🇰🇭',

  // Middle East & Africa
  'united arab emirates': '🇦🇪', 'uae': '🇦🇪', 'dubai': '🇦🇪', 'abu dhabi': '🇦🇪',
  'saudi arabia': '🇸🇦',
  'israel': '🇮🇱',
  'qatar': '🇶🇦',
  'bahrain': '🇧🇭',
  'kuwait': '🇰🇼',
  'oman': '🇴🇲',
  'jordan': '🇯🇴',
  'egypt': '🇪🇬',
  'south africa': '🇿🇦',
  'nigeria': '🇳🇬',
  'kenya': '🇰🇪',
  'ghana': '🇬🇭',
  'morocco': '🇲🇦',
  'tunisia': '🇹🇳',
  'tanzania': '🇹🇿',
  'ethiopia': '🇪🇹',
  'rwanda': '🇷🇼',
};

// EU member states (for showing EU flag alongside country flag)
const EU_MEMBERS = new Set([
  'germany', 'de', 'deutschland',
  'france', 'fr',
  'italy', 'italia',
  'spain', 'españa',
  'portugal',
  'netherlands', 'holland', 'the netherlands',
  'belgium',
  'luxembourg',
  'austria',
  'ireland',
  'sweden',
  'denmark',
  'finland',
  'poland',
  'czech republic', 'czechia',
  'hungary',
  'romania',
  'bulgaria',
  'croatia',
  'greece',
  'cyprus',
  'malta',
  'estonia',
  'latvia',
  'lithuania',
  'slovenia',
  'slovakia',
]);

/**
 * Get the flag emoji for a country name.
 * Returns empty string if country is not recognized.
 */
export const getCountryFlag = (country: string): string => {
  if (!country) return '';
  const key = country.trim().toLowerCase();
  return COUNTRY_FLAGS[key] || '';
};

/**
 * Check if a country is an EU member state.
 */
export const isEUMember = (country: string): boolean => {
  if (!country) return false;
  return EU_MEMBERS.has(country.trim().toLowerCase());
};

/**
 * Get flag string for display: country flag + EU flag if applicable.
 * e.g. "Germany" → "🇩🇪 🇪🇺"
 *      "USA" → "🇺🇸"
 */
export const getCountryFlagWithEU = (country: string): string => {
  const flag = getCountryFlag(country);
  if (!flag) return '';
  const eu = isEUMember(country) ? ' 🇪🇺' : '';
  return `${flag}${eu}`;
};

// US state names for detecting "City, State" patterns
const US_STATES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
  'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
  'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming', 'district of columbia', 'washington d.c.',
  // Common abbreviations
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'dc', 'de', 'fl', 'ga',
  'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma',
  'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny',
  'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx',
  'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
]);

/**
 * Try to extract country from a location string like "New York, USA" or "London, United Kingdom".
 * Also recognizes US states: "Bentonville, Arkansas" → "USA"
 */
export const extractCountryFromLocation = (location: string): string => {
  if (!location) return '';
  const parts = location.split(',').map(s => s.trim());
  // Try each part from the end — check for direct country match first
  for (let i = parts.length - 1; i >= 0; i--) {
    if (getCountryFlag(parts[i])) return parts[i];
  }
  // Check for US state → return 'USA'
  for (let i = parts.length - 1; i >= 0; i--) {
    if (US_STATES.has(parts[i].toLowerCase())) return 'USA';
  }
  return parts[parts.length - 1] || '';
};
