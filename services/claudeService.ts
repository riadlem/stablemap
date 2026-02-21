
import { Company, Partner, Job, NewsItem, Category, FundingInfo } from '../types';
import { logger } from './logger';
import { getCurrentModel, buildRequestBody, extractResponseText, rotateModel, resetFailures, allModelsExhausted } from './aiModels';

// --- CONFIGURATION ---

const SEARCH_API_ENDPOINT = '/api/search';
const FETCH_URL_ENDPOINT = '/api/fetch-url';

export const getCurrentModelName = (): string => {
  return 'Google Web Search';
};

// --- TRUSTED PUBLICATION SOURCES (50) ---
// Ordered by tier. Used to build source-targeted search queries and to
// boost / badge results that come from authoritative outlets.

export const TRUSTED_SOURCES: { domain: string; name: string; tier: 'crypto' | 'institutional' | 'fintech' | 'research' | 'regulatory' | 'mainstream' | 'regional' }[] = [
  // Tier 1 — Crypto-Native
  { domain: 'theblock.co',           name: 'The Block',              tier: 'crypto' },
  { domain: 'coindesk.com',          name: 'CoinDesk',               tier: 'crypto' },
  { domain: 'blockworks.co',         name: 'Blockworks',             tier: 'crypto' },
  { domain: 'thedefiant.io',         name: 'The Defiant',            tier: 'crypto' },
  { domain: 'decrypt.co',            name: 'Decrypt',                tier: 'crypto' },
  { domain: 'cointelegraph.com',     name: 'CoinTelegraph',          tier: 'crypto' },
  { domain: 'dlnews.com',            name: 'DL News',                tier: 'crypto' },
  { domain: 'unchainedcrypto.com',   name: 'Unchained',              tier: 'crypto' },
  { domain: 'bitcoinmagazine.com',   name: 'Bitcoin Magazine',       tier: 'crypto' },
  // Tier 2 — Institutional / TradFi-Crypto Bridge
  { domain: 'bloomberg.com',         name: 'Bloomberg',              tier: 'institutional' },
  { domain: 'reuters.com',           name: 'Reuters',                tier: 'institutional' },
  { domain: 'ft.com',                name: 'Financial Times',        tier: 'institutional' },
  { domain: 'wsj.com',               name: 'Wall Street Journal',    tier: 'institutional' },
  { domain: 'theinformation.com',    name: 'The Information',        tier: 'institutional' },
  { domain: 'nytimes.com',           name: 'New York Times',         tier: 'institutional' },
  { domain: 'economist.com',         name: 'The Economist',          tier: 'institutional' },
  { domain: 'cnbc.com',              name: 'CNBC',                   tier: 'institutional' },
  { domain: 'fortune.com',           name: 'Fortune',                tier: 'institutional' },
  { domain: 'forbes.com',            name: 'Forbes',                 tier: 'institutional' },
  // Tier 3 — Fintech & Payments
  { domain: 'finextra.com',          name: 'Finextra',               tier: 'fintech' },
  { domain: 'paymentsjournal.com',   name: 'PaymentsJournal',        tier: 'fintech' },
  { domain: 'americanbanker.com',    name: 'American Banker',        tier: 'fintech' },
  { domain: 'ledgerinsights.com',    name: 'Ledger Insights',        tier: 'fintech' },
  { domain: 'pymnts.com',            name: 'PYMNTS',                 tier: 'fintech' },
  { domain: 'fintechfutures.com',    name: 'Fintech Futures',        tier: 'fintech' },
  { domain: 'tearsheet.co',          name: 'Tearsheet',              tier: 'fintech' },
  // Tier 4 — Tech & VC
  { domain: 'techcrunch.com',        name: 'TechCrunch',             tier: 'mainstream' },
  { domain: 'wired.com',             name: 'Wired',                  tier: 'mainstream' },
  { domain: 'arstechnica.com',       name: 'Ars Technica',           tier: 'mainstream' },
  { domain: 'theverge.com',          name: 'The Verge',              tier: 'mainstream' },
  // Tier 5 — Research & Data
  { domain: 'artemis.xyz',           name: 'Artemis',                tier: 'research' },
  { domain: 'messari.io',            name: 'Messari',                tier: 'research' },
  { domain: 'chainalysis.com',       name: 'Chainalysis',            tier: 'research' },
  { domain: 'coingecko.com',         name: 'CoinGecko',              tier: 'research' },
  { domain: 'defillama.com',         name: 'DefiLlama',              tier: 'research' },
  { domain: 'dune.com',              name: 'Dune Analytics',         tier: 'research' },
  { domain: 'rwa.xyz',               name: 'RWA.xyz',                tier: 'research' },
  // Tier 6 — Regulatory & Policy
  { domain: 'bis.org',               name: 'BIS',                    tier: 'regulatory' },
  { domain: 'atlanticcouncil.org',   name: 'Atlantic Council',       tier: 'regulatory' },
  { domain: 'imf.org',               name: 'IMF',                    tier: 'regulatory' },
  { domain: 'worldbank.org',         name: 'World Bank',             tier: 'regulatory' },
  // Tier 7 — European & Regional
  { domain: 'lesechos.fr',           name: 'Les Echos',              tier: 'regional' },
  { domain: 'agefi.com',             name: 'AGEFI',                  tier: 'regional' },
  { domain: 'agefi.fr',              name: 'AGEFI France',           tier: 'regional' },
  { domain: 'handelsblatt.com',      name: 'Handelsblatt',           tier: 'regional' },
  { domain: 'finews.com',            name: 'finews',                 tier: 'regional' },
  { domain: 'thebanker.com',         name: 'The Banker',             tier: 'regional' },
  { domain: 'scmp.com',              name: 'South China Morning Post', tier: 'regional' },
  { domain: 'livemint.com',          name: 'Mint (India)',           tier: 'regional' },
  { domain: 'zawya.com',             name: 'Zawya (MENA)',           tier: 'regional' },
];

/** Domain lookup set for fast matching */
const TRUSTED_DOMAIN_SET = new Set(TRUSTED_SOURCES.map(s => s.domain));

/** Map from domain → display name for normalizing noisy displayLink values */
const DOMAIN_TO_NAME = new Map(TRUSTED_SOURCES.map(s => [s.domain, s.name]));

/** Build a site: OR clause for search queries (picks a random subset to stay within query limits) */
const buildSourceSiteClause = (count: number = 8, excludedDomains: string[] = []): string => {
  const excludeSet = new Set(excludedDomains);
  const eligible = TRUSTED_SOURCES.filter(s => !excludeSet.has(s.domain));
  const shuffled = eligible.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(s => `site:${s.domain}`).join(' OR ');
};

/** Load excluded domains from the DB (cached in localStorage for sync access) */
const getExcludedDomains = (): string[] => {
  try {
    const stored = localStorage.getItem('stablemap_sources');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.excludedDomains || [];
    }
  } catch { /* ignore */ }
  return [];
};

/** Check if a result URL comes from a trusted publication */
const isTrustedSource = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return TRUSTED_DOMAIN_SET.has(host) || [...TRUSTED_DOMAIN_SET].some(d => host.endsWith('.' + d));
  } catch { return false; }
};

/** Convert a raw hostname/domain into a human-readable publication name.
 *  e.g. "tracxn.com" → "Tracxn", "tracxn.com.com" → "Tracxn",
 *       "crypto-news.io" → "Crypto News", "ledger_insights.net" → "Ledger Insights" */
const domainToLabel = (host: string): string => {
  // Split into parts and take the first substantive segment (skip generic subdomains)
  const parts = host.split('.');
  const GENERIC = new Set(['www', 'blog', 'news', 'cdn', 'api', 'app', 'mail', 'com', 'net', 'org', 'io', 'co']);
  const name = parts.find(p => p.length > 2 && !GENERIC.has(p)) ?? parts[0];
  // Replace hyphens/underscores with spaces and title-case each word
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || host;
};

/** Resolve a clean source name from a URL, falling back to the raw displayLink */
export const resolveSourceName = (url: string, displayLink: string): string => {
  // Try matching the URL hostname against trusted sources
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // Skip proxy URLs
    if (!host.includes('vertexaisearch')) {
      const exact = DOMAIN_TO_NAME.get(host);
      if (exact) return exact;
      for (const [domain, name] of DOMAIN_TO_NAME) {
        if (host.endsWith('.' + domain)) return name;
      }
      // Convert unknown hostname to a readable label (never return a raw domain)
      return domainToLabel(host);
    }
  } catch { /* ignore */ }

  // Try matching the displayLink against trusted sources
  const cleanDisplay = displayLink.replace(/^www\./, '');
  if (cleanDisplay) {
    const exact = DOMAIN_TO_NAME.get(cleanDisplay);
    if (exact) return exact;
    for (const [domain, name] of DOMAIN_TO_NAME) {
      if (cleanDisplay === domain || cleanDisplay.endsWith('.' + domain)) return name;
    }
    // Convert unknown displayLink domain to a readable label
    if (cleanDisplay.includes('.') && cleanDisplay.length < 40 && !/\s/.test(cleanDisplay)) {
      return domainToLabel(cleanDisplay);
    }
  }

  return '';
};

// --- HELPERS ---

/** Clean a search-result title: strip trailing site names and detect URL-like titles */
export const cleanSearchTitle = (rawTitle: string, snippet: string): string => {
  // Strip trailing " - SiteName" / " | SiteName" suffixes
  let title = rawTitle.replace(/ [-|–] .*$/, '').trim();

  // Detect URL / bare-domain titles that leaked from the search API
  const looksLikeUrl = !title
    || /^https?:\/\//i.test(title)
    || /^www\./i.test(title)
    || /^[a-z0-9-]+\.[a-z]{2,}$/i.test(title)
    || /^[a-z0-9-]+\.[a-z]{2,}\s*[-–|:]/i.test(title);

  if (looksLikeUrl && snippet) {
    // Derive title from the first sentence of the snippet
    const end = snippet.search(/[.!?]\s/);
    title = snippet.substring(0, Math.min(end > 10 ? end : 120, 120)).trim();
  }

  return title || 'Untitled';
};

// --- IRRELEVANT ARTICLE FILTER ---

/** Patterns that indicate an article is about token trading, price speculation, exchange reviews, etc. */
const IRRELEVANT_PATTERNS = [
  // Token price / market speculation
  /\btoken\s*price/i, /\bprice\s*prediction/i, /\bprice\s*analysis/i,
  /\bprice\s*surge/i, /\bprice\s*crash/i, /\bprice\s*drop/i,
  /\bprice\s*pump/i, /\bprice\s*rally/i, /\bprice\s*target/i,
  /\bprice\s*forecast/i, /\bbull\s*run/i, /\bbear\s*market/i,
  /\bmoon\b.*\btoken/i, /\btoken.*\bmoon\b/i,
  /\b(100|1000)x\b/i, /\bto the moon\b/i,
  // Token launches / airdrops / ICO / IDO
  /\btoken\s*launch/i, /\btoken\s*sale/i, /\btoken\s*offering/i,
  /\bICO\b/, /\bIDO\b/, /\bIEO\b/,
  /\bairdrop/i, /\bpresale\b/i,
  /\bmeme\s*coin/i, /\bmemecoin/i, /\bshitcoin/i,
  // Exchange reviews / rankings
  /\bbest\s*(crypto\s*)?(exchange|platform|broker)/i,
  /\bexchange\s*review/i, /\bbroker\s*review/i,
  /\btop\s*\d+\s*(crypto\s*)?(exchange|platform|broker)/i,
  /\bsign\s*up\s*bonus/i, /\breferral\s*(code|bonus|link)/i,
  // Trading signals / spam
  /\btrading\s*signal/i, /\bbuy\s*now/i,
  /\bhow\s*to\s*buy\b.*\btoken/i, /\bwhere\s*to\s*buy/i,
  /\bcrypto\s*gambling/i, /\bcasino/i,
  // Generic explainer / educational content (not news)
  /\bwhat\s+is\s+(a\s+)?stablecoin/i, /\bwhat\s+are\s+stablecoins/i,
  /\bwhat\s+is\s+(a\s+)?(CBDC|tokenization|blockchain|cryptocurrency|crypto\s*wallet|DeFi|NFT)/i,
  /\bwhat\s+are\s+(CBDCs|digital\s+assets|cryptocurrencies|crypto\s*wallets|NFTs)/i,
  /\bstablecoin(s)?\s+explained/i, /\bblockchain\s+explained/i,
  /\bbeginner'?s?\s+guide\s+to/i, /\bcomplete\s+guide\s+to/i,
  /\bultimate\s+guide\s+to/i,
  /\bhow\s+does\s+(a\s+)?(stablecoin|blockchain|CBDC|tokenization|DeFi)\s+work/i,
];

/** Domains that publish promotional, audit-marketing, or spam content */
const IRRELEVANT_DOMAINS = new Set([
  'hacken.io',
  'certik.com',
  'slowmist.com',
  'immunefi.com',
  'investopedia.com',
  'wikipedia.org',
  'medium.com',
]);

/** Returns true if the title+summary indicate the article is about irrelevant topics */
export const isIrrelevantNews = (title: string, summary: string, url?: string): boolean => {
  const text = `${title} ${summary}`;
  if (IRRELEVANT_PATTERNS.some(p => p.test(text))) return true;
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (IRRELEVANT_DOMAINS.has(host) || [...IRRELEVANT_DOMAINS].some(d => host.endsWith('.' + d))) return true;
    } catch { /* ignore */ }
  }
  return false;
};

// --- SEARCH RESULT TYPES ---

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}

interface SearchOptions {
  num?: number;
  dateRestrict?: string;
  siteSearch?: string;
  sort?: string;
}

interface SearchResponse {
  results: SearchResult[];
  modelSummary: string;
}

// --- CORE SEARCH FUNCTION (via /api/search proxy) ---

const searchWebFull = async (
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> => {
  const start = Date.now();
  logger.info('search', `Searching web`, query.substring(0, 120));

  try {
    const response = await fetch(SEARCH_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ...options }),
    });

    const duration = Date.now() - start;
    logger.api('POST', SEARCH_API_ENDPOINT, response.status, duration, query.substring(0, 80));

    if (!response.ok) {
      const errText = await response.text();
      logger.error('search', `Search API error ${response.status}`, errText);
      return { results: [], modelSummary: '' };
    }

    const data = await response.json();
    const results: SearchResult[] = data.results || [];
    logger.info('search', `Search returned ${results.length} results (${duration}ms)`);
    return { results, modelSummary: data.modelSummary || '' };
  } catch (err: any) {
    logger.error('search', `Search failed`, err?.message || String(err));
    return { results: [], modelSummary: '' };
  }
};

/** Convenience wrapper — returns only results (used by most callers) */
const searchWeb = async (
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> => {
  const { results } = await searchWebFull(query, options);
  return results;
};

// --- URL CONTENT FETCHER (via /api/fetch-url) ---

export const fetchUrlContent = async (
  url: string
): Promise<{ title: string; content: string } | null> => {
  const start = Date.now();
  try {
    const response = await fetch(FETCH_URL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const duration = Date.now() - start;
    logger.api('POST', FETCH_URL_ENDPOINT, response.status, duration, url);
    if (!response.ok) return null;
    const data = await response.json();
    return { title: data.title || '', content: data.content || '' };
  } catch (err: any) {
    logger.error('api', `fetchUrlContent failed for ${url}`, err?.message || String(err));
    return null;
  }
};

// --- AI HELPER (via /api/ai proxy with model rotation) ---

const callAI = async (prompt: string, systemPrompt?: string): Promise<string> => {
  while (!allModelsExhausted()) {
    const model = getCurrentModel();
    const body = buildRequestBody(model, prompt, systemPrompt, 0.3);
    try {
      const response = await fetch(model.proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        logger.warn('ai', `${model.displayName} returned ${response.status}, rotating`);
        rotateModel();
        continue;
      }
      const data = await response.json();
      const text = extractResponseText(model.provider, data);
      resetFailures();
      return text;
    } catch (err: any) {
      logger.warn('ai', `${model.displayName} failed: ${err?.message}, rotating`);
      rotateModel();
    }
  }
  resetFailures();
  return '';
};

// --- TEXT PARSING HELPERS ---

// Sanitize a website URL: fix double TLDs (.com.com), ensure https, strip junk
const sanitizeWebsite = (raw: string): string => {
  if (!raw || raw === 'unknown') return '';
  let url = raw.trim();
  // Remove duplicate TLD extensions (e.g. .com.com, .io.io, .org.org, .co.co)
  url = url.replace(/\.(com|io|org|co|net|gov|ai|xyz|finance|money|app)(\.\1)+/gi, '.$1');
  // Ensure https prefix
  if (url && !url.startsWith('http')) url = `https://${url}`;
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  // Validate it parses as a URL
  try {
    new URL(url);
    return url;
  } catch {
    return '';
  }
};

// Detect company categories from text based on keyword matching
// companyName is optional — when provided, used for stricter checks (Central Banks, Banks, blockchain)
const categorizeFromText = (text: string, companyName?: string): Category[] => {
  const lower = text.toLowerCase();
  const nameLower = (companyName || '').toLowerCase();
  const cats: Category[] = [];

  // --- Detect if this is a blockchain / L1 / L2 protocol ---
  // Blockchains mention payments, DeFi, wallets, etc. in their ecosystem but
  // they ARE infrastructure — those other tags should not apply to the chain itself.
  const isBlockchain =
    // Name-based: known blockchain naming patterns
    /\b(?:chain|network|protocol|blockchain|labs)\b/i.test(nameLower) &&
    /layer[\s-]?[12]|\bl[12]\b|mainnet|consensus|block\s*chain/i.test(lower) ||
    // Strong text signals: the entity IS a blockchain
    /(?:is|as)\s+(?:a|an)\s+(?:layer[\s-]?[12]|blockchain|l[12])\b/i.test(lower) ||
    /\b(?:layer[\s-]?1|layer[\s-]?2|l1|l2)\s+(?:blockchain|network|protocol|chain)\b/i.test(lower) ||
    /\b(?:evm[\s-]compatible|proof[\s-]of[\s-](?:stake|work)|smart contract platform)\b/i.test(lower);

  if (isBlockchain) {
    // Blockchains are infrastructure only — don't accumulate other ecosystem tags
    cats.push(Category.INFRASTRUCTURE);
    // Still allow Issuer if they issue their own stablecoin (rare but possible)
    if (/stablecoin.*(?:issuer|issued|issues)|(?:issues?|issued|issuer).*stablecoin/i.test(lower))
      cats.push(Category.ISSUER);
    return [...new Set(cats)];
  }

  // --- Standard categorization for non-blockchain companies ---
  if (/stablecoin|issuer|usdc|usdt|fiat-backed|mint(?:ing)?\b/.test(lower))
    cats.push(Category.ISSUER);
  if (/infrastructure|protocol|layer[\s-]?[12]|node|validator|blockchain platform/.test(lower))
    cats.push(Category.INFRASTRUCTURE);
  if (/\bwallet\b|self-custody|key management/.test(lower))
    cats.push(Category.WALLET);
  if (/payment|remittance|transfer|payroll|point[\s-]of[\s-]sale|checkout/.test(lower))
    cats.push(Category.PAYMENTS);
  if (/\bdefi\b|decentralized finance|yield|lending protocol|liquidity pool|amm\b/.test(lower))
    cats.push(Category.DEFI);
  if (/\bcustody\b|safekeeping|digital vault|qualified custodian/.test(lower))
    cats.push(Category.CUSTODY);

  // Central Banks: require strong signals — the company itself must BE a central bank
  const isCentralBankByName =
    /central bank|monetary authority|reserve bank|banque centrale|banco central|bank of (?:england|japan|canada|korea|israel|thailand|ghana|jamaica|bahamas|nigeria|india)/i.test(nameLower) ||
    /\b(?:fed(?:eral)?\s+reserve|ecb|bce|pboc|rbi|boj|boe|snb|rba|mas)\b/i.test(nameLower);
  const isCentralBankByText =
    /(?:is|as)\s+(?:a|the)\s+central bank/i.test(lower) ||
    /(?:is|as)\s+(?:a|the)\s+monetary authority/i.test(lower) ||
    /(?:country'?s|nation'?s)\s+central bank/i.test(lower);
  if (isCentralBankByName || isCentralBankByText)
    cats.push(Category.CENTRAL_BANKS);

  if (/venture capital|\bvc\b|crypto fund|investment fund|private equity/.test(lower))
    cats.push(Category.VC);
  if (/consult|advisory|professional services|\bpwc\b|\bdeloitte\b|\bey\b|\baccenture\b|\bmckinsey\b/.test(lower))
    cats.push(Category.CONSULTANCY);

  // Banks: require the company name or description to indicate it IS a bank,
  // not just a fintech that mentions "banking". Fintechs frequently use
  // "banking", "neobank", "digital banking" but don't hold bank charters.
  if (!cats.includes(Category.CENTRAL_BANKS)) {
    const isBankByName =
      // "Bank" in company name (but not "Bank-grade" or "Banking API" style names)
      /\bbank\b/i.test(nameLower) && !/\b(?:banking|bankless|databank|bankman)\b/i.test(nameLower) ||
      // Well-known bank name patterns
      /\b(?:bancorp|banque|banco|sparkasse|landesbank|kreditanstalt|savings\s+(?:bank|association))\b/i.test(nameLower);
    const isBankByText =
      // Text describes the entity AS a bank
      /(?:is|as)\s+(?:a|an|the)\s+(?:commercial |global |multinational |leading )?bank\b/i.test(lower) ||
      /\b(?:banking license|bank charter|fdic[\s-]insured|chartered bank|licensed bank|state[\s-]chartered)\b/i.test(lower) ||
      // Regulated banking entity signals
      /\b(?:national bank|savings bank|commercial bank|investment bank|custodian bank)\b/i.test(lower);
    if (isBankByName || isBankByText) {
      cats.push(Category.BANKS);
      // Banks are not blockchain infrastructure — remove Infrastructure if it was
      // triggered by generic "infrastructure" mentions (e.g. "payment infrastructure")
      const infraIdx = cats.indexOf(Category.INFRASTRUCTURE);
      if (infraIdx !== -1) cats.splice(infraIdx, 1);
    }
  }

  // Central banks are also not infrastructure
  if (cats.includes(Category.CENTRAL_BANKS)) {
    const infraIdx = cats.indexOf(Category.INFRASTRUCTURE);
    if (infraIdx !== -1) cats.splice(infraIdx, 1);
  }

  // VCs and consulting firms are not blockchain infrastructure —
  // they often mention "infrastructure" when describing their investments or clients
  if (cats.includes(Category.VC) || cats.includes(Category.CONSULTANCY)) {
    const infraIdx = cats.indexOf(Category.INFRASTRUCTURE);
    if (infraIdx !== -1) cats.splice(infraIdx, 1);
  }

  return [...new Set(cats)];
};

// Determine Crypto-First vs Crypto-Second
const determineFocus = (text: string, companyName: string): 'Crypto-First' | 'Crypto-Second' => {
  const lower = text.toLowerCase();
  const cryptoSignals = [
    'blockchain company', 'crypto company', 'web3', 'cryptocurrency exchange',
    'digital asset company', 'defi protocol', 'stablecoin issuer', 'crypto-native',
    'founded.*blockchain', 'founded.*crypto', 'decentralized',
  ];
  const tradSignals = [
    'traditional bank', 'fortune 500', 'multinational', 'established in 19',
    'global enterprise', 'consulting firm', 'financial institution',
    'insurance company', 'added crypto', 'launched.*blockchain',
  ];

  const cryptoScore = cryptoSignals.filter(p => new RegExp(p).test(lower)).length;
  const tradScore = tradSignals.filter(p => new RegExp(p).test(lower)).length;

  return cryptoScore > tradScore ? 'Crypto-First' : 'Crypto-Second';
};

// Extract location from text
const extractLocationFromText = (text: string): {
  headquarters: string;
  country: string;
  region: 'North America' | 'EU' | 'Europe' | 'APAC' | 'LATAM' | 'MEA' | 'Global';
} => {
  // Trigger patterns — capture ONLY to the next comma, period, or semicolon (the city part)
  const hqTriggers = [
    /(?:headquartered|headquarters?) (?:is |are )?(?:in |at )([^,.;:\n]+)/i,
    /based in ([^,.;:\n]+)/i,
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})-based company/,
  ];

  // Known location suffixes — only append after comma if it's a real place
  const knownLocationSuffix = /^(?:USA|US|U\.S\.|UK|U\.K\.|United States|United Kingdom|Canada|Germany|France|Switzerland|Netherlands|Ireland|Japan|China|India|Singapore|South Korea|Australia|Brazil|UAE|United Arab Emirates|Israel|Zimbabwe|Nigeria|Kenya|Ghana|South Africa|Mexico|Argentina|Bermuda|Cayman Islands|Bahamas|Hong Kong|Taiwan|Sweden|Norway|Denmark|Finland|Spain|Italy|Portugal|Austria|Belgium|Luxembourg|Poland|Czech Republic|Greece|Turkey|Russia|Thailand|Indonesia|Malaysia|Philippines|Vietnam|New Zealand|Qatar|Bahrain|Saudi Arabia|Egypt|Morocco|Rwanda|Jamaica|El Salvador|California|Texas|New York|Florida|Illinois|Massachusetts|Pennsylvania|Virginia|Colorado|Georgia|Ohio|Washington|Connecticut|Maryland|New Jersey|North Carolina|Arizona|Tennessee|Oregon|Minnesota|Wisconsin|Missouri|Michigan|Indiana|Nevada|District of Columbia)$/i;

  let headquarters = '';
  for (const p of hqTriggers) {
    const m = text.match(p);
    if (m) {
      let city = m[1].trim();
      // Clean out any noise words that leaked in
      city = city.replace(/\s+(?:the|a|an|is|are|was|has|its|which|that|and|with)\b.*$/i, '').trim();
      city = city.replace(/[,;:.]+$/, '').trim();
      if (city.length > 40) city = city.substring(0, 40).replace(/\s\S*$/, '').trim();

      // Check if there's a location suffix after the comma (e.g. ", USA" or ", Switzerland")
      const afterCity = text.substring(text.indexOf(m[0]) + m[0].length);
      const suffixMatch = afterCity.match(/^,\s*([^,.;:\n]+)/);
      if (suffixMatch) {
        const suffix = suffixMatch[1].trim();
        if (knownLocationSuffix.test(suffix)) {
          headquarters = `${city}, ${suffix}`;
        } else {
          headquarters = city;
        }
      } else {
        headquarters = city;
      }
      break;
    }
  }

  // Country detection — match against headquarters first (more precise), then full text
  const countryPatterns: [string, RegExp][] = [
    // Americas
    ['USA', /\b(?:United States|U\.?S\.?A?\.?|New York|San Francisco|California|Boston|Chicago|Washington|Miami|Austin|Denver|Seattle)\b/i],
    ['Canada', /\b(?:Canada|Toronto|Vancouver|Ottawa|Montreal)\b/i],
    ['Mexico', /\b(?:Mexico|Mexico City|Ciudad de México)\b/i],
    ['Brazil', /\b(?:Brazil|São Paulo|Rio de Janeiro|Brasília)\b/i],
    ['Argentina', /\b(?:Argentina|Buenos Aires)\b/i],
    ['Colombia', /\b(?:Colombia|Bogotá)\b/i],
    ['Chile', /\b(?:Chile|Santiago)\b/i],
    ['El Salvador', /\bEl Salvador\b/i],
    ['Bermuda', /\bBermuda\b/i],
    ['Cayman Islands', /\bCayman Islands\b/i],
    ['Bahamas', /\b(?:Bahamas|Nassau)\b/i],
    ['Jamaica', /\b(?:Jamaica|Kingston)\b/i],
    // Europe
    ['United Kingdom', /\b(?:United Kingdom|U\.?K\.?|London|England|Scotland|Edinburgh)\b/i],
    ['Germany', /\b(?:Germany|Berlin|Frankfurt|Munich|Hamburg)\b/i],
    ['France', /\b(?:France|Paris|Lyon)\b/i],
    ['Switzerland', /\b(?:Switzerland|Zurich|Zug|Geneva|Basel)\b/i],
    ['Netherlands', /\b(?:Netherlands|Amsterdam|Rotterdam|The Hague)\b/i],
    ['Ireland', /\b(?:Ireland|Dublin)\b/i],
    ['Spain', /\b(?:Spain|Madrid|Barcelona)\b/i],
    ['Italy', /\b(?:Italy|Rome|Milan|Roma|Milano)\b/i],
    ['Portugal', /\b(?:Portugal|Lisbon|Lisboa)\b/i],
    ['Sweden', /\b(?:Sweden|Stockholm)\b/i],
    ['Norway', /\b(?:Norway|Oslo)\b/i],
    ['Denmark', /\b(?:Denmark|Copenhagen)\b/i],
    ['Finland', /\b(?:Finland|Helsinki)\b/i],
    ['Austria', /\b(?:Austria|Vienna|Wien)\b/i],
    ['Belgium', /\b(?:Belgium|Brussels)\b/i],
    ['Luxembourg', /\bLuxembourg\b/i],
    ['Poland', /\b(?:Poland|Warsaw|Warszawa)\b/i],
    ['Estonia', /\b(?:Estonia|Tallinn)\b/i],
    ['Lithuania', /\b(?:Lithuania|Vilnius)\b/i],
    ['Liechtenstein', /\bLiechtenstein\b/i],
    ['Russia', /\b(?:Russia|Moscow)\b/i],
    ['Turkey', /\b(?:Turkey|Türkiye|Istanbul|Ankara)\b/i],
    // Asia-Pacific
    ['Singapore', /\bSingapore\b/i],
    ['Japan', /\b(?:Japan|Tokyo|Osaka)\b/i],
    ['South Korea', /\b(?:South Korea|Seoul)\b/i],
    ['China', /\b(?:China|Beijing|Shanghai|Shenzhen)\b/i],
    ['Hong Kong', /\bHong Kong\b/i],
    ['Taiwan', /\b(?:Taiwan|Taipei)\b/i],
    ['India', /\b(?:India|Mumbai|Bangalore|Bengaluru|Delhi|Hyderabad)\b/i],
    ['Australia', /\b(?:Australia|Sydney|Melbourne|Brisbane)\b/i],
    ['New Zealand', /\b(?:New Zealand|Auckland|Wellington)\b/i],
    ['Thailand', /\b(?:Thailand|Bangkok)\b/i],
    ['Indonesia', /\b(?:Indonesia|Jakarta)\b/i],
    ['Malaysia', /\b(?:Malaysia|Kuala Lumpur)\b/i],
    ['Philippines', /\b(?:Philippines|Manila)\b/i],
    ['Vietnam', /\b(?:Vietnam|Ho Chi Minh|Hanoi)\b/i],
    // Middle East & Africa
    ['UAE', /\b(?:UAE|Dubai|Abu Dhabi|United Arab Emirates)\b/i],
    ['Israel', /\b(?:Israel|Tel Aviv|Jerusalem)\b/i],
    ['Saudi Arabia', /\b(?:Saudi Arabia|Riyadh|Jeddah)\b/i],
    ['Qatar', /\b(?:Qatar|Doha)\b/i],
    ['Bahrain', /\b(?:Bahrain|Manama)\b/i],
    ['South Africa', /\b(?:South Africa|Johannesburg|Cape Town|Pretoria)\b/i],
    ['Nigeria', /\b(?:Nigeria|Lagos|Abuja)\b/i],
    ['Kenya', /\b(?:Kenya|Nairobi)\b/i],
    ['Ghana', /\b(?:Ghana|Accra)\b/i],
    ['Zimbabwe', /\b(?:Zimbabwe|Harare)\b/i],
    ['Rwanda', /\b(?:Rwanda|Kigali)\b/i],
    ['Egypt', /\b(?:Egypt|Cairo)\b/i],
    ['Morocco', /\b(?:Morocco|Casablanca|Rabat)\b/i],
    ['Tanzania', /\b(?:Tanzania|Dar es Salaam)\b/i],
    ['Ethiopia', /\b(?:Ethiopia|Addis Ababa)\b/i],
  ];

  // Try matching against headquarters first (more precise), then full text
  let country = '';
  for (const [c, p] of countryPatterns) {
    if (p.test(headquarters)) { country = c; break; }
  }
  if (!country) {
    for (const [c, p] of countryPatterns) {
      if (p.test(text)) { country = c; break; }
    }
  }

  // Region mapping
  const regionMap: Record<string, 'North America' | 'EU' | 'Europe' | 'APAC' | 'LATAM' | 'MEA' | 'Global'> = {
    'USA': 'North America', 'Canada': 'North America',
    'Mexico': 'LATAM', 'Brazil': 'LATAM', 'Argentina': 'LATAM', 'Colombia': 'LATAM', 'Chile': 'LATAM', 'El Salvador': 'LATAM',
    'Bermuda': 'North America', 'Cayman Islands': 'North America', 'Bahamas': 'North America', 'Jamaica': 'LATAM',
    'Germany': 'EU', 'France': 'EU', 'Netherlands': 'EU', 'Ireland': 'EU', 'Spain': 'EU', 'Italy': 'EU',
    'Portugal': 'EU', 'Sweden': 'EU', 'Denmark': 'EU', 'Finland': 'EU', 'Austria': 'EU', 'Belgium': 'EU',
    'Luxembourg': 'EU', 'Poland': 'EU', 'Estonia': 'EU', 'Lithuania': 'EU', 'Greece': 'EU',
    'United Kingdom': 'Europe', 'Switzerland': 'Europe', 'Norway': 'Europe', 'Liechtenstein': 'Europe',
    'Russia': 'Europe', 'Turkey': 'Europe',
    'Singapore': 'APAC', 'Japan': 'APAC', 'South Korea': 'APAC', 'China': 'APAC', 'Hong Kong': 'APAC',
    'Taiwan': 'APAC', 'India': 'APAC', 'Australia': 'APAC', 'New Zealand': 'APAC',
    'Thailand': 'APAC', 'Indonesia': 'APAC', 'Malaysia': 'APAC', 'Philippines': 'APAC', 'Vietnam': 'APAC',
    'UAE': 'MEA', 'Israel': 'MEA', 'Saudi Arabia': 'MEA', 'Qatar': 'MEA', 'Bahrain': 'MEA',
    'South Africa': 'MEA', 'Nigeria': 'MEA', 'Kenya': 'MEA', 'Ghana': 'MEA', 'Zimbabwe': 'MEA',
    'Rwanda': 'MEA', 'Egypt': 'MEA', 'Morocco': 'MEA', 'Tanzania': 'MEA', 'Ethiopia': 'MEA',
  };

  const region = regionMap[country] || 'Global';

  return { headquarters: headquarters || (country ? country : 'Remote'), country, region };
};

// Determine primary industry from text
const determineIndustry = (text: string): string => {
  const lower = text.toLowerCase();
  const industries: [string, RegExp][] = [
    ['Digital Assets', /digital asset|tokenization|tokenized/],
    ['Stablecoins', /stablecoin/],
    ['Payments', /payment|remittance|money transfer/],
    ['DeFi', /\bdefi\b|decentralized finance/],
    ['Crypto Infrastructure', /blockchain infrastructure|node|validator|protocol/],
    ['Banking', /\bbank(?:ing)?\b/],
    ['Custody', /\bcustody\b/],
    ['Venture Capital', /venture capital|\bvc\b|investment fund/],
    ['Consulting', /consult|advisory/],
    ['Technology', /technology|software|platform/],
    ['Financial Services', /financial|fintech/],
  ];

  for (const [ind, pat] of industries) {
    if (pat.test(lower)) return ind;
  }
  return 'Technology';
};

// Format a raw amount string into standard financial notation ($XXM / $X.XB)
export const formatFinancialAmount = (raw: string): string => {
  const cleaned = raw.replace(/,/g, '').trim();
  // Parse the numeric part and suffix
  const match = cleaned.match(/^([\d.]+)\s*(million|billion|m|b|k|bn)?$/i);
  if (!match) return `$${cleaned}`;

  let num = parseFloat(match[1]);
  const suffix = (match[2] || '').toLowerCase();

  // Normalize to a raw number
  if (suffix === 'billion' || suffix === 'b' || suffix === 'bn') num *= 1_000_000_000;
  else if (suffix === 'million' || suffix === 'm') num *= 1_000_000;
  else if (suffix === 'k') num *= 1_000;
  // If no suffix and num is large, it's already in raw form (e.g. 450000000)

  // Format into financial shorthand
  if (num >= 1_000_000_000) {
    const b = num / 1_000_000_000;
    return b % 1 === 0 ? `$${b.toFixed(0)}B` : `$${b.toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return m % 1 === 0 ? `$${m.toFixed(0)}M` : `$${m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (num >= 1_000) {
    const k = num / 1_000;
    return k % 1 === 0 ? `$${k.toFixed(0)}K` : `$${k.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `$${num}`;
};

// Extract funding information from text
const extractFundingFromText = (text: string): {
  totalRaised?: string;
  lastRound?: string;
  valuation?: string;
  investors: string[];
  lastRoundDate?: string;
} | null => {
  const fundingMatch = text.match(/raised\s+\$?([\d,.]+\s*(?:million|billion|bn|[MBK]))/i);
  const roundMatch = text.match(/Series\s+([A-F])\b/i) || text.match(/(Seed|Pre-Seed|Series [A-F]|IPO)\b/i);
  const valuationMatch = text.match(/valued?\s+(?:at\s+)?\$?([\d,.]+\s*(?:million|billion|bn|[MBK]))/i);

  if (!fundingMatch && !roundMatch && !valuationMatch) return null;

  return {
    totalRaised: fundingMatch ? formatFinancialAmount(fundingMatch[1]) : undefined,
    lastRound: roundMatch ? roundMatch[1] : undefined,
    valuation: valuationMatch ? formatFinancialAmount(valuationMatch[1]) : undefined,
    investors: [],
  };
};

// Build a concise partnership description from the snippet context around a regex match
const buildPartnerDescription = (snippet: string, partnerName: string, companyName: string): string => {
  // Try to extract a meaningful phrase describing the partnership nature
  const lower = snippet.toLowerCase();

  // Look for purpose patterns: "to <do something>", "for <something>", "on <something>"
  const purposePatterns = [
    /(?:partner(?:ship|ed|s)?|collaborat(?:es?|ion|ing)|integrat(?:es?|ion|ing)|teamed up)[^.]*?\s+(to [^,.]{10,80})/i,
    /(?:partner(?:ship|ed|s)?|collaborat(?:es?|ion|ing)|integrat(?:es?|ion|ing)|teamed up)[^.]*?\s+(for [^,.]{10,80})/i,
    /(?:partner(?:ship|ed|s)?|collaborat(?:es?|ion|ing)|integrat(?:es?|ion|ing)|teamed up)[^.]*?\s+(on [^,.]{10,80})/i,
  ];

  for (const p of purposePatterns) {
    const m = snippet.match(p);
    if (m) {
      const purpose = m[1].trim().replace(/\s+/g, ' ');
      return `Partnership ${purpose}`;
    }
  }

  // Look for keyword-based relationship type
  const relationshipKeywords: [RegExp, string][] = [
    [/integrat/i, 'Integration partnership'],
    [/collaborat/i, 'Collaboration'],
    [/invest/i, 'Investment partnership'],
    [/custod/i, 'Custody partnership'],
    [/payment/i, 'Payments partnership'],
    [/tokeniz/i, 'Tokenization partnership'],
    [/stablecoin/i, 'Stablecoin partnership'],
    [/compliance|regul/i, 'Compliance partnership'],
    [/infrastruc/i, 'Infrastructure partnership'],
    [/defi|decentralized finance/i, 'DeFi partnership'],
    [/wallet/i, 'Wallet integration partnership'],
    [/cross-chain|bridge|interoperab/i, 'Interoperability partnership'],
    [/layer[- ]?[12]/i, 'Blockchain infrastructure partnership'],
  ];

  for (const [re, label] of relationshipKeywords) {
    if (re.test(lower)) {
      return label;
    }
  }

  // Fallback: use the sentence containing the partnership mention as description
  const sentences = snippet.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const sl = s.toLowerCase();
    if (
      (sl.includes(partnerName.toLowerCase()) || sl.includes(companyName.toLowerCase())) &&
      (sl.includes('partner') || sl.includes('collaborat') || sl.includes('integrat') || sl.includes('teamed'))
    ) {
      const cleaned = s.trim().replace(/\s+/g, ' ');
      if (cleaned.length <= 200) return cleaned;
      return cleaned.substring(0, 197) + '...';
    }
  }

  return `Partnership between ${companyName} and ${partnerName}`;
};

// Extract partner references from text
const extractPartnersFromSearch = (results: SearchResult[], companyName: string): Partner[] => {
  const partners: Partner[] = [];
  const seen = new Set<string>();
  const companyLower = companyName.toLowerCase();

  const partnerPatterns = [
    /(?:partner(?:ship|ed|s)?|collaborat(?:es?|ion|ing)|integrat(?:es?|ion|ing)|teamed up) with ([A-Z][A-Za-z0-9&\s]+?)(?:\s+to\b|\s+for\b|\s+on\b|[,.])/g,
    /([A-Z][A-Za-z0-9&\s]+?) (?:partner(?:ship|ed|s)?|collaborat(?:es?|ion)|integrat(?:es?|ion)) with/g,
  ];

  // Search each result individually so we can extract context for descriptions
  for (const result of results) {
    const text = `${result.title} ${result.snippet}`;
    for (const pattern of partnerPatterns) {
      // Reset lastIndex since we reuse patterns across results
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let name = match[1].trim().replace(/\s+/g, ' ');

        // Strip trailing noise phrases that leak from regex captures
        name = name
          .replace(/\s+(?:as\s+(?:a\s+)?(?:launch|strategic|key|official|founding|anchor|preferred|primary|lead)\s+partner.*)/i, '')
          .replace(/\s+(?:to\s+(?:provide|build|develop|enable|create|launch|offer|deliver|support|integrate|power|expand).*)$/i, '')
          .replace(/\s+(?:for\s+(?:its|the|their|a|an)\b.*)$/i, '')
          .replace(/\s+(?:in\s+(?:a|the|its|their|this)\b.*)$/i, '')
          // Strip verb phrases: "X announced a strategic" -> "X"
          .replace(/\s+(?:announced|entered|signed|formed|established|unveiled|confirmed|completed|finalized|launched|revealed)\b.*/i, '')
          // Strip leading/trailing common words that aren't part of company names
          .replace(/\s+(?:a|an|the|and|or|with|from|into|on|at)\s*$/i, '')
          .trim();

        const nameLower = name.toLowerCase();
        // Reject self-references: exact match OR one contains the other
        const isSelf = nameLower === companyLower ||
          companyLower.includes(nameLower) ||
          nameLower.includes(companyLower);

        if (
          name.length > 2 &&
          name.length < 50 &&
          !seen.has(nameLower) &&
          !isSelf &&
          !/^(the|a|an|this|that|their|its|our|new|more|also)$/i.test(name) &&
          // Reject names that are clearly sentence fragments, not company names
          !/\b(as a|as the|as an|will be|has been|have been|announced|entered|signed)\b/i.test(name)
        ) {
          seen.add(nameLower);
          const description = buildPartnerDescription(result.snippet, name, companyName);
          partners.push({
            name,
            type: 'CryptoNative',
            description,
          });
        }
      }
    }
  }

  return partners.slice(0, 10);
};

// Extract likely company names from a text block
const extractCompanyNamesFromText = (text: string, excludeNames: Set<string>): string[] => {
  // Match capitalized multi-word sequences that look like company names
  const namePattern = /\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3})\b/g;
  const names = new Set<string>();
  const commonWords = new Set([
    'The', 'A', 'An', 'In', 'On', 'At', 'For', 'By', 'To', 'Of', 'And', 'Or', 'But',
    'With', 'From', 'Has', 'Is', 'Was', 'Are', 'Were', 'Not', 'Its', 'Our', 'Your',
    'New', 'More', 'Most', 'All', 'Also', 'Just', 'About', 'After', 'Before', 'Over',
    'Under', 'Between', 'Through', 'During', 'Into', 'Other', 'Their', 'This', 'That',
    'These', 'Those', 'What', 'Which', 'Who', 'How', 'Why', 'When', 'Where', 'Some',
    'Many', 'Each', 'Every', 'Both', 'Few', 'Several', 'Much', 'Such', 'Only',
    'Series', 'Series A', 'Series B', 'Series C', 'Series D',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'CEO', 'CTO', 'CFO', 'COO', 'VP', 'President', 'Director', 'Manager',
    'Read More', 'Learn More', 'Click Here', 'View All', 'See More',
    'North America', 'South America', 'United States', 'United Kingdom',
  ]);

  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (
      name.length > 2 &&
      name.length < 40 &&
      !commonWords.has(name) &&
      !excludeNames.has(name.toLowerCase()) &&
      !/^\d/.test(name)
    ) {
      names.add(name);
    }
  }

  return [...names];
};

// --- BUSINESS LOGIC ---

export const enrichCompanyData = async (
  companyName: string,
  existingCompany?: Partial<Company>
): Promise<Partial<Company>> => {
  try {
    // Search for company info — broad query first, fall back to just the name
    let { results, modelSummary } = await searchWebFull(
      `${companyName} company overview blockchain crypto fintech`,
      { num: 10 }
    );

    if (results.length === 0) {
      // Retry with just the company name (some names are niche enough)
      ({ results, modelSummary } = await searchWebFull(companyName, { num: 10 }));
    }

    if (results.length === 0) {
      logger.warn('search', `No search results for enrichment of ${companyName}`);
      return {};
    }

    // Combine all text for analysis
    const allText = results.map(r => `${r.title} ${r.snippet}`).join('\n');

    // Generate description + extract website via AI in a single call
    const searchContext = results.slice(0, 8).map(r =>
      `[${r.title}] (${r.displayLink}) ${r.snippet}`
    ).join('\n');
    const rawContext = modelSummary
      ? `Summary:\n${modelSummary}\n\nSources:\n${searchContext}`
      : searchContext;

    let description = '';
    let website = '';
    let aiPartners: Partner[] = [];

    // Build existing-description reference block for the AI prompt
    const existingDescRef = existingCompany?.description
      ? `\n\nEXISTING DESCRIPTION (use as reference — keep accurate facts, update with new info, improve clarity):\n${existingCompany.description}\n`
      : '';

    try {
      const aiResponse = await callAI(
        `Based on this information about "${companyName}":\n\n${rawContext}${existingDescRef}\n\nRespond with EXACTLY this format (three sections separated by "---"):\n\nDESCRIPTION:\nOne sentence about what ${companyName} is (core business, sector, where it is based).\n\n- Bullet point about a specific product, platform, or service\n- Bullet point about a relevant partnership, initiative, or activity\n- Bullet point about another concrete activity or achievement\n\n---\nPARTNERS:\n- PartnerName | type | short description of the relationship\n- PartnerName | type | short description of the relationship\n\n---\nWEBSITE: https://example.com\n\nRules for DESCRIPTION:\n- First line: ONE sentence, what the company does. No founder names, no CEO names, no people.${existingCompany?.description ? '\n- An EXISTING DESCRIPTION is provided above. Use it as a starting reference: keep facts that are still accurate, add any new information from the search results, and improve clarity. Do not discard valid existing details just because they are not in the new search results.' : ''}\n- Then bullet points (3-5 max) about concrete activities in stablecoin, digital asset, blockchain, tokenization, or fintech. Each bullet must be unique — no duplicate or overlapping info.\n- Do NOT mention founders, CEOs, executives, or any person by name.\n- Do NOT use markdown bold (**) or italic (*). Plain text only.\n- Do NOT repeat the company name at the start of every bullet.\n\nRules for PARTNERS:\n- List companies/organizations that ${companyName} has partnered with, integrated with, built on, or collaborates with.\n- Also list investors/backers if mentioned (use type "Investor").\n- type must be one of: Fortune500Global, CryptoNative, Investor\n- Use Fortune500Global for large traditional companies (banks, tech giants, payment networks).\n- Use CryptoNative for blockchain/crypto/DeFi companies.\n- Use Investor for VCs, funds, and backers.\n- Only the company/org name — no people, no "as a partner", no extra words.\n- Max 10 partners. Only include ones with evidence in the search results.\n- If none found, write "none"\n\nRules for WEBSITE:\n- The company's official homepage URL (not Wikipedia, not Crunchbase, not LinkedIn, not news sites). If unsure, write "unknown".`,
        'You extract structured company data from search results. No filler, no markdown formatting, no people names.'
      );

      // Parse the AI response (3 sections separated by ---)
      const parts = aiResponse.split('---').map(s => s.trim());
      const descPart = parts[0] || '';
      // Identify sections by content — models sometimes reorder
      let partnersPart = '';
      let metaPart = '';
      for (let i = 1; i < parts.length; i++) {
        if (/^PARTNERS:/im.test(parts[i])) partnersPart = parts[i];
        else if (/WEBSITE:/im.test(parts[i])) metaPart = parts[i];
      }
      // Fallback: if no labeled match, use positional
      if (!partnersPart && parts.length > 2) partnersPart = parts[1];
      if (!metaPart && parts.length > 1) metaPart = parts[parts.length - 1];

      // Extract description (strip the "DESCRIPTION:" prefix if present)
      let rawDesc = descPart.replace(/^DESCRIPTION:\s*/i, '').trim();

      // --- Post-processing: clean up common AI output issues ---
      // Strip all markdown formatting (bold, italic, headers)
      rawDesc = rawDesc.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
      rawDesc = rawDesc.replace(/^#{1,4}\s+/gm, '');

      // Remove lines mentioning founders/CEOs/executives by name pattern
      // (e.g. "co-founded by Evan Cheng and Sam Blackshear" or "CEO John Doe")
      rawDesc = rawDesc
        .split('\n')
        .filter(line => !/(?:co-)?found(?:ed|er|ers|ing)\s+(?:by|in\s+\d{4}\s+by)/i.test(line))
        .filter(line => !/\b(?:CEO|CTO|CFO|COO|founder|co-founder)\s+[A-Z][a-z]+\s+[A-Z]/i.test(line))
        .join('\n');

      // Deduplicate bullet points that say the same thing
      const lines = rawDesc.split('\n');
      const seenBullets = new Set<string>();
      const dedupedLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('- ')) {
          // Normalize for comparison: lowercase, strip punctuation
          const key = line.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          if (seenBullets.has(key)) continue;
          // Also check for high overlap with existing bullets
          let isDup = false;
          for (const existing of seenBullets) {
            const words = key.split(/\s+/);
            const overlap = words.filter(w => existing.includes(w)).length;
            if (words.length > 3 && overlap / words.length > 0.7) { isDup = true; break; }
          }
          if (isDup) continue;
          seenBullets.add(key);
        }
        dedupedLines.push(line);
      }
      description = dedupedLines.join('\n').trim();

      // Strip any trailing truncated sentence (no period at end)
      const descLines = description.split('\n');
      const lastLine = descLines[descLines.length - 1];
      if (lastLine && !lastLine.startsWith('- ') && !lastLine.endsWith('.') && !lastLine.endsWith('?') && lastLine.length > 10) {
        descLines.pop();
        description = descLines.join('\n').trim();
      }

      // Extract website — also try without protocol prefix
      const websiteMatch = metaPart.match(/WEBSITE:\s*(https?:\/\/[^\s]+|[a-z0-9][\w.-]+\.[a-z]{2,})/i);
      if (websiteMatch && !websiteMatch[1].includes('unknown')) {
        website = sanitizeWebsite(websiteMatch[1]);
      }

      // Extract AI-identified partners
      const partnersSection = partnersPart.replace(/^PARTNERS:\s*/i, '').trim();
      if (partnersSection && !/^none$/i.test(partnersSection.trim())) {
        const partnerLines = partnersSection.split('\n').filter(l => l.trim().startsWith('-'));
        for (const line of partnerLines) {
          const cleaned = line.replace(/^-\s*/, '').trim();
          const segments = cleaned.split('|').map(s => s.trim());
          if (segments.length >= 2) {
            let pName = segments[0]
              .replace(/\*{1,3}/g, '')  // strip markdown
              .replace(/\s+/g, ' ')
              .trim();
            const rawType = segments[1].toLowerCase();
            const pDesc = segments[2] || '';

            // Validate and map type
            let pType: 'Fortune500Global' | 'CryptoNative' | 'Investor' = 'CryptoNative';
            if (rawType.includes('fortune') || rawType.includes('500') || rawType.includes('global') || rawType.includes('traditional')) pType = 'Fortune500Global';
            else if (rawType.includes('investor') || rawType.includes('backer') || rawType.includes('vc')) pType = 'Investor';

            const pNameLower = pName.toLowerCase();
            const cLower = companyName.toLowerCase();
            const isSelfRef = pNameLower === cLower ||
              cLower.includes(pNameLower) ||
              pNameLower.includes(cLower);

            if (
              pName.length > 1 &&
              pName.length < 60 &&
              !isSelfRef &&
              !/\b(as a|as the|will be|has been|announced|entered|signed)\b/i.test(pName)
            ) {
              aiPartners.push({ name: pName, type: pType, description: pDesc });
            }
          }
        }
      }
    } catch (err) {
      logger.warn('ai', `AI description generation failed for ${companyName}`);
    }

    // Fallback description if AI call failed
    if (!description) {
      const descSnippets = results
        .slice(0, 3)
        .map(r => r.snippet)
        .filter(s => s && s.length > 20);
      description = descSnippets.length > 0
        ? descSnippets.join(' ').substring(0, 500)
        : `${companyName} operates in the digital asset and blockchain ecosystem.`;
    }

    // Fallback website: try to find from search results if AI didn't extract one
    if (!website) {
      const excluded = ['wikipedia', 'crunchbase', 'linkedin', 'bloomberg', 'twitter', 'reddit', 'vertexaisearch', 'google.com'];
      const websiteResult = results.find(r =>
        !excluded.some(ex => r.displayLink.includes(ex)) &&
        r.title.toLowerCase().includes(companyName.toLowerCase().split(' ')[0])
      );
      if (websiteResult) {
        const domain = websiteResult.displayLink.replace(/^www\./, '');
        website = domain.includes('vertexaisearch') ? '' : sanitizeWebsite(domain);
      }
    }

    // Determine categories, focus, location, industry
    const categories = categorizeFromText(allText, companyName);
    const focus = determineFocus(allText, companyName);
    const { headquarters, country, region } = extractLocationFromText(allText);
    const industry = determineIndustry(allText);

    // Extract partners: merge AI-extracted + regex-extracted, deduplicating by name
    const regexPartners = extractPartnersFromSearch(results, companyName);
    const partnerMap = new Map<string, Partner>();
    // AI partners first (higher quality — typed and described)
    for (const p of aiPartners) partnerMap.set(p.name.toLowerCase(), p);
    // Regex partners fill in any the AI missed
    for (const p of regexPartners) {
      if (!partnerMap.has(p.name.toLowerCase())) partnerMap.set(p.name.toLowerCase(), p);
    }
    const partners = [...partnerMap.values()].slice(0, 15);

    // Try to extract funding info from existing search results first
    let funding = extractFundingFromText(allText);

    // For Crypto-First companies, do a dedicated funding search if we didn't find funding data
    const isCryptoFirst = focus === 'Crypto-First' || existingCompany?.focus === 'Crypto-First';
    if (isCryptoFirst && (!funding || (!funding.totalRaised && !funding.valuation))) {
      try {
        const { results: fundingResults } = await searchWebFull(
          `"${companyName}" funding round raised valuation series investors`,
          { num: 8 }
        );
        if (fundingResults.length > 0) {
          const fundingText = fundingResults.map(r => `${r.title} ${r.snippet}`).join('\n');
          const fundingData = extractFundingFromText(fundingText);
          if (fundingData) {
            // Merge: prefer new dedicated funding data, but keep any existing fields
            funding = {
              totalRaised: fundingData.totalRaised || funding?.totalRaised,
              lastRound: fundingData.lastRound || funding?.lastRound,
              valuation: fundingData.valuation || funding?.valuation,
              investors: [...(funding?.investors || []), ...(fundingData.investors || [])],
              lastRoundDate: fundingData.lastRoundDate || funding?.lastRoundDate,
            };
          }
        }
      } catch (err) {
        logger.warn('search', `Dedicated funding search failed for ${companyName}`);
      }
    }

    // Check for parent company pattern (e.g. "PwC India" → parent "PwC")
    let parentCompany: string | undefined;
    const parentPatterns = [
      /subsidiary of ([A-Z][A-Za-z\s&]+?)(?:[,.]|\s+and\b)/i,
      /(?:a |the )?(?:division|arm|unit|branch) of ([A-Z][A-Za-z\s&]+?)(?:[,.]|\s+and\b)/i,
    ];
    for (const p of parentPatterns) {
      const m = allText.match(p);
      if (m) { parentCompany = m[1].trim(); break; }
    }

    return {
      description,
      website,
      headquarters,
      country,
      industry,
      region,
      focus,
      categories: categories.length > 0 ? categories : [Category.PAYMENTS],
      partners,
      funding: funding || undefined,
      parentCompany,
    };
  } catch (error) {
    console.error('Enrichment failed for', companyName, ':', error);
    return {};
  }
};

export const findJobOpenings = async (companyName: string, website?: string): Promise<Job[]> => {
  try {
    // Two searches in parallel:
    // 1. Target major ATS platforms where crypto-native companies post jobs
    // 2. General hiring search with crypto/stablecoin context
    const atsQuery = `${companyName} (site:lever.co OR site:greenhouse.io OR site:ashbyhq.com OR site:workable.com OR site:jobs.smartrecruiters.com OR site:boards.greenhouse.io)`;
    const generalQuery = `"${companyName}" jobs hiring 2025 (crypto OR blockchain OR stablecoin OR "digital asset" OR web3)`;

    const [atsResults, generalResults] = await Promise.all([
      searchWeb(atsQuery, { num: 10 }),
      searchWeb(generalQuery, { num: 8 }),
    ]);

    // Merge, deduplicate by URL
    const seen = new Set<string>();
    const allResults = [...atsResults, ...generalResults].filter(r => {
      if (seen.has(r.link)) return false;
      seen.add(r.link);
      return true;
    });

    if (allResults.length === 0) return [];

    // Use AI to extract individual job listings from the combined search context
    const context = allResults.slice(0, 14).map(r =>
      `[${r.title}] (${r.link})\n${r.snippet}`
    ).join('\n\n');

    const aiRaw = await callAI(
      `You are extracting job listings for "${companyName}" from web search results.\n\nSearch results:\n${context}\n\nExtract every distinct job opening found. For each job, output EXACTLY one line in this format:\nTITLE | DEPARTMENT | LOCATION | URL\n\nRules:\n- TITLE: The exact job title (e.g. "Senior Blockchain Engineer", "Head of Partnerships", "Protocol Economist"). Do NOT include the company name.\n- DEPARTMENT: Must be exactly one of: Strategy, Customer Success, Business Dev, Partnerships, Other\n- LOCATION: City/Country or "Remote" or "Hybrid". If multiple, use the first one.\n- URL: The direct job listing URL from the search result. If no direct URL, use the careers page URL.\n- Only include real, specific job titles — not "View all jobs" or generic pages.\n- Max 10 jobs. If fewer real listings exist, output fewer.\n- If no jobs found, output: NONE`,
      'Extract job listings from search results. Output only the requested format, no extra text.'
    );

    if (!aiRaw || /^none$/im.test(aiRaw.trim())) return [];

    const today = new Date().toISOString().split('T')[0];
    const jobs: Job[] = [];

    for (const line of aiRaw.split('\n')) {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 4) continue;
      const [title, rawDept, location, url] = parts;
      if (!title || title.toUpperCase() === title || title === 'TITLE') continue; // skip header lines

      const deptMap: Record<string, Job['department']> = {
        'strategy': 'Strategy',
        'customer success': 'Customer Success',
        'business dev': 'Business Dev',
        'partnerships': 'Partnerships',
        'other': 'Other',
      };
      const department: Job['department'] = deptMap[rawDept.toLowerCase()] ?? 'Other';

      // Validate URL is a real URL
      const cleanUrl = url && url.startsWith('http') ? url : (website || '#');

      jobs.push({
        id: `search-job-${Date.now()}-${jobs.length}`,
        title,
        department,
        locations: [location || 'Remote'],
        postedDate: today,
        url: cleanUrl,
      });

      if (jobs.length >= 10) break;
    }

    return jobs;
  } catch (error) {
    console.error('findJobOpenings failed for', companyName, ':', error);
    return [];
  }
};

export const analyzeJobLink = async (url: string): Promise<any> => {
  const pageContent = await fetchUrlContent(url);

  if (!pageContent || pageContent.content.length < 100) {
    // URL-only inference
    const urlParts = url.toLowerCase();
    const companyMatch = url.match(/(?:\/\/|\.)([\w-]+)\.(?:com|io|co|org)/);
    return {
      companyName: companyMatch ? companyMatch[1].replace(/-/g, ' ') : '',
      jobTitle: '',
      locations: ['Remote'],
      department: 'Other' as const,
      salary: '',
      description: `Job listing at ${url}`,
      requirements: [],
      benefits: [],
      type: 'Full-time' as const,
      _sourceMethod: 'url-inference',
    };
  }

  const content = pageContent.content;
  const title = pageContent.title;

  // Extract job title — usually in the page title or first heading
  const jobTitle = title
    .replace(/ [-|–] .*$/, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim();

  // Extract company name from title or URL
  const companyFromTitle = title.match(/[-|–]\s*(.+?)(?:\s*[-|–]|$)/);
  const companyName = companyFromTitle ? companyFromTitle[1].trim() : '';

  // Extract locations
  const locPatterns = [
    /(?:Location|Office|Based in|City)[\s:]+([^\n;]+)/i,
    /(?:Remote|Hybrid|On-site)(?:\s*[-–]\s*([^\n;]+))?/i,
  ];
  const locations: string[] = [];
  for (const p of locPatterns) {
    const m = content.match(p);
    if (m) locations.push(m[1]?.trim() || m[0].trim());
  }
  if (locations.length === 0) locations.push('Remote');

  // Use AI to extract structured job details from the page content
  const truncatedContent = content.substring(0, 6000); // keep within prompt limits

  let description = '';
  let requirements: string[] = [];
  let benefits: string[] = [];
  let salary = '';
  let department: 'Strategy' | 'Customer Success' | 'Business Dev' | 'Partnerships' | 'Other' = 'Other';
  let type: 'Full-time' | 'Contract' | 'Remote' = 'Full-time';

  try {
    const aiRaw = await callAI(
      `Extract structured information from this job posting page content for the role "${jobTitle}".\n\nPage content:\n${truncatedContent}\n\nRespond with EXACTLY this format (sections separated by ---):\n\nDESCRIPTION:\n2-4 sentences describing what this role is about and what the person will do. Write in plain prose, no bullet points. Pull directly from the posting.\n\n---\nREQUIREMENTS:\n- requirement one\n- requirement two\n(list up to 8 key requirements as bullet points)\n\n---\nBENEFITS:\n- benefit one\n- benefit two\n(list up to 6 perks/benefits as bullet points, or write "none" if not mentioned)\n\n---\nMETA:\nDEPARTMENT: one of Strategy / Customer Success / Business Dev / Partnerships / Other\nSALARY: salary range if mentioned, else leave blank\nTYPE: Full-time / Contract / Remote`,
      'You extract job listing details from raw page content. Output only the requested format.'
    );

    const parts = aiRaw.split('---').map(s => s.trim());
    for (const part of parts) {
      if (/^DESCRIPTION:/im.test(part)) {
        description = part.replace(/^DESCRIPTION:\s*/i, '').trim();
      } else if (/^REQUIREMENTS:/im.test(part)) {
        const lines = part.replace(/^REQUIREMENTS:\s*/i, '').split('\n');
        requirements = lines
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^-\s*/, '').trim())
          .filter(l => l.length > 5)
          .slice(0, 8);
      } else if (/^BENEFITS:/im.test(part)) {
        const benRaw = part.replace(/^BENEFITS:\s*/i, '').trim();
        if (!/^none$/i.test(benRaw)) {
          benefits = benRaw.split('\n')
            .filter(l => l.trim().startsWith('-'))
            .map(l => l.replace(/^-\s*/, '').trim())
            .filter(l => l.length > 3)
            .slice(0, 6);
        }
      } else if (/^META:/im.test(part)) {
        const deptMatch = part.match(/DEPARTMENT:\s*(.+)/i);
        const salaryMatch = part.match(/SALARY:\s*(.+)/i);
        const typeMatch = part.match(/TYPE:\s*(.+)/i);
        if (deptMatch) {
          const d = deptMatch[1].trim();
          if (/strategy/i.test(d)) department = 'Strategy';
          else if (/customer success/i.test(d)) department = 'Customer Success';
          else if (/business dev/i.test(d)) department = 'Business Dev';
          else if (/partner/i.test(d)) department = 'Partnerships';
        }
        if (salaryMatch && salaryMatch[1].trim().length > 1) salary = salaryMatch[1].trim();
        if (typeMatch) {
          const t = typeMatch[1].trim();
          if (/contract/i.test(t)) type = 'Contract';
          else if (/remote/i.test(t)) type = 'Remote';
        }
      }
    }
  } catch (err) {
    logger.warn('ai', `analyzeJobLink AI extraction failed, falling back to regex`);
    // Regex fallback for description
    const descLines = content.split('\n').filter(l => l.trim().length > 50);
    description = descLines.slice(0, 3).join(' ').substring(0, 500);
    // Regex for salary
    const salaryM = content.match(/\$[\d,]+\s*[-–]\s*\$[\d,]+/);
    if (salaryM) salary = salaryM[0];
    // Regex for type
    if (/contract/i.test(content)) type = 'Contract';
    else if (/remote/i.test(content)) type = 'Remote';
  }

  return {
    companyName,
    jobTitle,
    locations,
    department,
    salary,
    description,
    requirements,
    benefits,
    type,
    _sourceMethod: 'page-content',
  };
};

export const fetchIndustryNews = async (
  directoryCompanies: string[] = []
): Promise<NewsItem[]> => {
  logger.info('news', `fetchIndustryNews called with ${directoryCompanies.length} companies`);

  // Run two parallel searches: one source-targeted, one broad
  const excluded = getExcludedDomains();
  const sourceClause = buildSourceSiteClause(8, excluded);
  const [targeted, broad] = await Promise.all([
    searchWeb(
      `(stablecoin OR "digital asset" OR CBDC OR "crypto custody" OR tokenization) (${sourceClause})`,
      { num: 10, dateRestrict: 'm1' }
    ),
    searchWeb(
      'stablecoin OR "digital asset" OR "blockchain enterprise" OR CBDC OR "crypto custody" news',
      { num: 10, dateRestrict: 'm1' }
    ),
  ]);

  // Merge & deduplicate (prefer trusted-source version)
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...targeted, ...broad]) {
    const key = r.link;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  if (merged.length === 0) {
    logger.warn('news', 'Google Search returned 0 results for industry news');
    return [];
  }

  // Sort: trusted sources first, then by position
  merged.sort((a, b) => {
    const aT = isTrustedSource(a.link) ? 0 : 1;
    const bT = isTrustedSource(b.link) ? 0 : 1;
    return aT - bT;
  });

  return merged
    .slice(0, 15)
    .filter(r => r.title && r.snippet && !isIrrelevantNews(r.title, r.snippet, r.link))
    .map((result, idx) => {
      const relatedCompanies = directoryCompanies.filter(company => {
        const lower = (result.title + ' ' + result.snippet).toLowerCase();
        return lower.includes(company.toLowerCase());
      });

      const dateMatch = result.snippet.match(/(\w+ \d{1,2},? \d{4})/);
      const date = dateMatch
        ? new Date(dateMatch[1]).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        id: `search-news-${Date.now()}-${idx}`,
        title: cleanSearchTitle(result.title, result.snippet),
        source: resolveSourceName(result.link, result.displayLink),
        date,
        summary: result.snippet,
        url: result.link,
        relatedCompanies,
        sourceType: 'press' as const,
      };
    });
};

export const scanCompanyNews = async (
  companyName: string,
  voteFeedback?: { liked: string[]; disliked: string[] }
): Promise<NewsItem[]> => {
  logger.info('news', `scanCompanyNews called for "${companyName}"`);

  // Two parallel searches: trusted sources + broad
  const excluded = getExcludedDomains();
  const sourceClause = buildSourceSiteClause(6, excluded);
  const [targeted, broad] = await Promise.all([
    searchWeb(
      `"${companyName}" (stablecoin OR "digital asset" OR CBDC OR tokenization) (${sourceClause})`,
      { num: 10, dateRestrict: 'm1' }
    ),
    searchWeb(
      `"${companyName}" (stablecoin OR "tokenized deposits" OR "tokenized funds" OR "tokenized assets" OR "crypto treasury" OR "digital asset" OR CBDC)`,
      { num: 10, dateRestrict: 'm1' }
    ),
  ]);

  // Merge & deduplicate, trusted first
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...targeted, ...broad]) {
    if (seen.has(r.link)) continue;
    seen.add(r.link);
    merged.push(r);
  }

  if (merged.length === 0) {
    logger.warn('news', `No search results for ${companyName} news`);
    return [];
  }

  merged.sort((a, b) => {
    const aT = isTrustedSource(a.link) ? 0 : 1;
    const bT = isTrustedSource(b.link) ? 0 : 1;
    return aT - bT;
  });

  let candidates = merged
    .slice(0, 15)
    .filter(r => r.title && r.snippet && !isIrrelevantNews(r.title, r.snippet, r.link))
    .map((result, idx) => {
      const dateMatch = result.snippet.match(/(\w+ \d{1,2},? \d{4})/);
      const date = dateMatch
        ? new Date(dateMatch[1]).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        id: `company-scan-${Date.now()}-${idx}`,
        title: cleanSearchTitle(result.title, result.snippet),
        source: resolveSourceName(result.link, result.displayLink),
        date,
        summary: result.snippet,
        url: result.link,
        relatedCompanies: [companyName],
        sourceType: 'press' as const,
      };
    });

  // Relevance filter: ensure company name is in title or snippet prominently
  const companyLower = companyName.toLowerCase();
  candidates = candidates.filter(c => {
    const titleLower = c.title.toLowerCase();
    const summaryLower = c.summary.toLowerCase();
    // Must be primarily about this company
    return titleLower.includes(companyLower) || summaryLower.includes(companyLower);
  });

  // Apply vote feedback filter if available
  if (voteFeedback && voteFeedback.disliked.length > 0) {
    const dislikedLower = voteFeedback.disliked.map(t => t.toLowerCase());
    candidates = candidates.filter(c => {
      const titleLower = c.title.toLowerCase();
      // Reject if too similar to disliked titles
      return !dislikedLower.some(d =>
        titleLower.includes(d.substring(0, 30)) || d.includes(titleLower.substring(0, 30))
      );
    });
  }

  logger.info('news', `scanCompanyNews: ${candidates.length} relevant results for ${companyName}`);
  return candidates;
};

export const scanInvestorNews = async (
  investorName: string,
  portfolioCompanyNames: string[],
  voteFeedback?: { liked: string[]; disliked: string[] }
): Promise<NewsItem[]> => {
  logger.info('news', `scanInvestorNews called for "${investorName}"`);

  const results = await searchWeb(
    `"${investorName}" (investment OR funding OR "Series" OR stablecoin OR "tokenized" OR "digital asset" OR blockchain)`,
    { num: 10 }
  );

  if (results.length === 0) {
    logger.warn('news', `No search results for investor ${investorName} news`);
    return [];
  }

  // Sort trusted sources first
  const sorted = [...results].sort((a, b) => {
    const aT = isTrustedSource(a.link) ? 0 : 1;
    const bT = isTrustedSource(b.link) ? 0 : 1;
    return aT - bT;
  });

  let candidates = sorted
    .filter(r => r.title && r.snippet && !isIrrelevantNews(r.title, r.snippet, r.link))
    .map((result, idx) => {
      const dateMatch = result.snippet.match(/(\w+ \d{1,2},? \d{4})/);
      const date = dateMatch
        ? new Date(dateMatch[1]).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        id: `inv-scan-${Date.now()}-${idx}`,
        title: cleanSearchTitle(result.title, result.snippet),
        source: resolveSourceName(result.link, result.displayLink),
        date,
        summary: result.snippet,
        url: result.link,
        relatedCompanies: [investorName],
        sourceType: 'press' as const,
      };
    });

  // Relevance filter: must mention the investor
  const investorLower = investorName.toLowerCase();
  candidates = candidates.filter(c => {
    const text = (c.title + ' ' + c.summary).toLowerCase();
    return text.includes(investorLower);
  });

  // Apply disliked feedback
  if (voteFeedback && voteFeedback.disliked.length > 0) {
    const dislikedLower = voteFeedback.disliked.map(t => t.toLowerCase());
    candidates = candidates.filter(c => {
      const titleLower = c.title.toLowerCase();
      return !dislikedLower.some(d =>
        titleLower.includes(d.substring(0, 30)) || d.includes(titleLower.substring(0, 30))
      );
    });
  }

  logger.info('news', `scanInvestorNews: ${candidates.length} relevant results for ${investorName}`);
  return candidates;
};

export const extractUnknownCompanyNames = async (
  articleTitle: string,
  articleSummary: string,
  knownCompanyNames: string[]
): Promise<string[]> => {
  const knownSet = new Set(knownCompanyNames.map(n => n.toLowerCase()));
  const text = `${articleTitle} ${articleSummary}`;
  const extracted = extractCompanyNamesFromText(text, knownSet);

  logger.info('news', `extractUnknownCompanyNames: found ${extracted.length} unknown names`);
  return extracted;
};

export const scanForNewPartnerships = async (
  companyName: string,
  existingPartnerNames: string[]
): Promise<Partner[]> => {
  const results = await searchWeb(
    `"${companyName}" (partnership OR collaboration OR integration OR "teamed up") (stablecoin OR blockchain OR "digital asset" OR crypto)`,
    { num: 10, dateRestrict: 'y1' }
  );

  if (results.length === 0) return [];

  const existingSet = new Set(existingPartnerNames.map(n => n.toLowerCase()));
  const partners = extractPartnersFromSearch(results, companyName);

  // Filter out existing partners
  const newPartners = partners.filter(p => !existingSet.has(p.name.toLowerCase()));

  logger.info('search', `scanForNewPartnerships: found ${newPartners.length} new partners for ${companyName}`);
  return newPartners;
};

export const researchCompanyActivity = async (
  companyName: string
): Promise<{ summary: string; initiatives: { title: string; date: string; description: string; sourceUrl: string }[] }> => {
  const results = await searchWeb(
    `"${companyName}" (blockchain OR "digital asset" OR CBDC OR stablecoin OR tokenization) initiative`,
    { num: 10, dateRestrict: 'y1' }
  );

  if (results.length === 0) {
    return { summary: `No recent blockchain or digital asset activity found for ${companyName}.`, initiatives: [] };
  }

  // Build summary from top snippets
  const summary = results
    .slice(0, 3)
    .map(r => r.snippet)
    .join(' ')
    .substring(0, 800);

  // Map results to initiatives
  const initiatives = results
    .filter(r => r.snippet.length > 30)
    .slice(0, 8)
    .map(r => {
      const dateMatch = r.snippet.match(/(\w+ \d{1,2},? \d{4})/);
      return {
        title: cleanSearchTitle(r.title, r.snippet),
        date: dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        description: r.snippet,
        sourceUrl: r.link,
      };
    });

  return { summary, initiatives };
};

export const recommendMissingCompanies = async (
  existingCompanies: string[]
): Promise<{ name: string; reason: string }[]> => {
  const existingSet = new Set(existingCompanies.map(c => c.toLowerCase()));

  // Run a few searches to get broad coverage of the space
  const [r1, r2, r3] = await Promise.all([
    searchWeb('top stablecoin issuers companies 2025', { num: 10 }),
    searchWeb('crypto custody digital asset infrastructure companies 2025', { num: 10 }),
    searchWeb('blockchain payments settlement companies notable 2025', { num: 10 }),
  ]);
  const allResults = [...r1, ...r2, ...r3];
  if (allResults.length === 0) return [];

  // Deduplicate snippets and build context for AI
  const seen = new Set<string>();
  const snippets = allResults
    .filter(r => { if (seen.has(r.link)) return false; seen.add(r.link); return true; })
    .map(r => `• ${r.title}: ${r.snippet}`)
    .join('\n');

  const existingList = existingCompanies.slice(0, 200).join(', ');

  const prompt = `You are a research assistant helping curate a directory of companies in the stablecoin and digital asset ecosystem (issuers, custodians, payment rails, infrastructure providers, exchanges, central banks exploring CBDCs, etc.).

ALREADY TRACKED (do NOT recommend these):
${existingList}

RECENT WEB SEARCH SNIPPETS:
${snippets}

Based on the snippets above, identify up to 5 notable companies or institutions that are NOT already tracked and would be valuable additions to this directory.

Return ONLY a JSON array with this exact shape (no markdown, no explanation):
[
  {"name": "Company Name", "reason": "One sentence explaining why they belong in this directory."},
  ...
]

Rules:
- Only recommend companies explicitly mentioned in the snippets
- Do not recommend companies already in the tracked list (case-insensitive)
- The "name" must be the official company/institution name
- The "reason" must be specific and based on the snippets (max 120 chars)
- If there are no good candidates, return []`;

  let raw = '';
  try {
    raw = await callAI(prompt);
  } catch {
    return [];
  }

  // Parse the JSON array from the AI response
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed: { name: string; reason: string }[] = JSON.parse(match[0]);
    return parsed
      .filter(r => r.name && r.reason && !existingSet.has(r.name.toLowerCase()))
      .slice(0, 5);
  } catch {
    return [];
  }
};

export interface DiscoveredPortfolioCompany {
  name: string;
  description: string;
  category: string;
  fundingStage?: string;
  investmentDate?: string;
}

/**
 * Batch-fetch funding round data for multiple Crypto-First companies at once.
 * Groups companies into batches of ~4 to minimize search + AI calls.
 * Returns a map of companyName → FundingInfo.
 */
export const batchFetchFunding = async (
  companyNames: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, FundingInfo>> => {
  const results = new Map<string, FundingInfo>();
  if (companyNames.length === 0) return results;

  // Group into batches of 4 companies per query
  const BATCH_SIZE = 4;
  const batches: string[][] = [];
  for (let i = 0; i < companyNames.length; i += BATCH_SIZE) {
    batches.push(companyNames.slice(i, i + BATCH_SIZE));
  }

  let done = 0;
  for (const batch of batches) {
    try {
      // Single search query for the batch: "CompanyA" OR "CompanyB" + funding keywords
      const orClause = batch.map(n => `"${n}"`).join(' OR ');
      const { results: searchResults } = await searchWebFull(
        `(${orClause}) (funding OR raised OR valuation OR "Series" OR "seed round" OR investors)`,
        { num: 10 }
      );

      if (searchResults.length === 0) {
        done += batch.length;
        onProgress?.(done, companyNames.length);
        continue;
      }

      const searchContext = searchResults
        .map(r => `[${r.title}] (${r.displayLink}) ${r.snippet}`)
        .join('\n');

      // Single AI call to extract funding for all companies in the batch
      const companyList = batch.map(n => `- ${n}`).join('\n');
      const aiResponse = await callAI(
        `Extract funding round information for these companies from the search results below.\n\nCOMPANIES:\n${companyList}\n\nSEARCH RESULTS:\n${searchContext}\n\nFor EACH company listed above, respond with this format (one block per company, separated by "==="):\n\nCOMPANY: CompanyName\nTOTAL_RAISED: $XXM or $X.XB or unknown\nVALUATION: $XXM or $X.XB or unknown\nLAST_ROUND: Series A/B/C/D/E/F or Seed or Pre-Seed or unknown\nLAST_ROUND_DATE: YYYY or YYYY-MM or unknown\nINVESTORS: Investor1, Investor2, Investor3 or unknown\n\nRules:\n- Use standard financial notation: $50M, $1.2B, $500K\n- Only include data you can confirm from the search results\n- Write "unknown" for any field you cannot determine\n- Include ALL companies even if no funding data is found (mark all fields as unknown)\n- For investors, list the most notable ones (max 5)`,
        'You extract funding data from search results. Output only the requested format, no extra text.'
      );

      // Parse the AI response — blocks separated by "==="
      const blocks = aiResponse.split('===').map(b => b.trim()).filter(Boolean);
      for (const block of blocks) {
        const companyMatch = block.match(/COMPANY:\s*(.+)/i);
        if (!companyMatch) continue;
        const name = companyMatch[1].trim();

        // Find the matching company name (case-insensitive)
        const matchedName = batch.find(
          n => n.toLowerCase() === name.toLowerCase()
        ) || batch.find(
          n => name.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(name.toLowerCase())
        );
        if (!matchedName) continue;

        const totalMatch = block.match(/TOTAL_RAISED:\s*(.+)/i);
        const valMatch = block.match(/VALUATION:\s*(.+)/i);
        const roundMatch = block.match(/LAST_ROUND:\s*(.+)/i);
        const dateMatch = block.match(/LAST_ROUND_DATE:\s*(.+)/i);
        const investorsMatch = block.match(/INVESTORS:\s*(.+)/i);

        const clean = (v: string | undefined): string | undefined => {
          if (!v) return undefined;
          const t = v.trim();
          return t.toLowerCase() === 'unknown' || t === '-' || t === 'n/a' ? undefined : t;
        };

        const totalRaised = clean(totalMatch?.[1]);
        const valuation = clean(valMatch?.[1]);
        const lastRound = clean(roundMatch?.[1]);
        const lastRoundDate = clean(dateMatch?.[1]);
        const investorsRaw = clean(investorsMatch?.[1]);
        const investors = investorsRaw
          ? investorsRaw.split(',').map(s => s.trim()).filter(s => s.length > 1)
          : [];

        // Only store if we got at least some data
        if (totalRaised || valuation || lastRound || investors.length > 0) {
          results.set(matchedName, {
            totalRaised,
            valuation,
            lastRound,
            lastRoundDate,
            investors,
          });
        }
      }
    } catch (err) {
      logger.warn('ai', `Batch funding fetch failed for batch: ${batch.join(', ')}`);
    }

    done += batch.length;
    onProgress?.(done, companyNames.length);
  }

  return results;
};

export const lookupInvestorPortfolio = async (
  investorName: string,
  existingCompanyNames: string[]
): Promise<DiscoveredPortfolioCompany[]> => {
  const existingSet = new Set(existingCompanyNames.map(n => n.toLowerCase()));

  // Search for investor portfolio
  const results = await searchWeb(
    `"${investorName}" portfolio companies investments (crypto OR blockchain OR "digital asset" OR stablecoin OR web3)`,
    { num: 10 }
  );

  if (results.length === 0) return [];

  // Try to fetch top result page for deeper extraction
  const topResult = results[0];
  let pageContent = '';
  if (topResult) {
    const fetched = await fetchUrlContent(topResult.link);
    if (fetched) pageContent = fetched.content;
  }

  // Extract from snippets + page content
  const allText = results.map(r => `${r.title} ${r.snippet}`).join('\n') + '\n' + pageContent;
  const companyNames = extractCompanyNamesFromText(allText, existingSet);

  // Build portfolio entries
  const portfolio: DiscoveredPortfolioCompany[] = companyNames
    .filter(name => !existingSet.has(name.toLowerCase()))
    .slice(0, 20)
    .map(name => {
      // Find relevant context for description
      const context = results.find(r =>
        r.title.includes(name) || r.snippet.includes(name)
      );

      // Try to determine category from context
      const contextText = context ? `${context.title} ${context.snippet}` : '';
      const cats = categorizeFromText(contextText, name);
      const category = cats.length > 0 ? cats[0] : 'Other';

      // Try to extract funding stage
      const stageMatch = contextText.match(/(Seed|Pre-Seed|Series [A-F]|Growth)/i);

      return {
        name,
        description: context ? context.snippet.substring(0, 200) : `Portfolio company of ${investorName}`,
        category,
        fundingStage: stageMatch ? stageMatch[1] : 'Unknown',
      };
    });

  return portfolio;
};

export const lookupInvestorPortfolioFromUrl = async (
  url: string,
  investorName: string,
  existingCompanyNames: string[]
): Promise<{ results: DiscoveredPortfolioCompany[]; fetchFailed: boolean }> => {
  const pageContent = await fetchUrlContent(url);

  if (!pageContent || pageContent.content.length < 50) {
    logger.warn('api', `Could not fetch content from ${url} (blocked or empty)`);
    return { results: [], fetchFailed: true };
  }

  const results = await extractPortfolioFromText(
    pageContent.content,
    investorName || undefined,
    existingCompanyNames,
    `Fetched from ${url}\nPage title: ${pageContent.title}`
  );
  return { results, fetchFailed: false };
};

export const extractPortfolioFromText = async (
  text: string,
  investorName: string | undefined,
  existingCompanyNames: string[],
  sourceLabel?: string
): Promise<DiscoveredPortfolioCompany[]> => {
  const existingSet = new Set(existingCompanyNames.map(n => n.toLowerCase()));
  const truncated = text.length > 12000 ? text.substring(0, 12000) : text;

  // Extract company names
  const companyNames = extractCompanyNamesFromText(truncated, existingSet);

  // Build portfolio entries
  return companyNames
    .filter(name => !existingSet.has(name.toLowerCase()))
    .slice(0, 30)
    .map(name => {
      // Find context around the company name
      const nameIdx = truncated.indexOf(name);
      const contextStart = Math.max(0, nameIdx - 100);
      const contextEnd = Math.min(truncated.length, nameIdx + name.length + 200);
      const context = nameIdx >= 0 ? truncated.substring(contextStart, contextEnd) : '';

      const cats = categorizeFromText(context, name);
      const category = cats.length > 0 ? cats[0] : 'Other';

      const stageMatch = context.match(/(Seed|Pre-Seed|Series [A-F]|Growth)/i);

      return {
        name,
        description: context
          ? context.replace(/\s+/g, ' ').trim().substring(0, 200)
          : `Portfolio company${investorName ? ` of ${investorName}` : ''}`,
        category,
        fundingStage: stageMatch ? stageMatch[1] : 'Unknown',
      };
    });
};

export const analyzeNewsForCompanies = async (
  content: string,
  companyNames: string[]
): Promise<{ mentionedCompanies: string[]; summary: string }> => {
  const lower = content.toLowerCase();

  // Simple text matching — check if each company name appears in the content
  const mentionedCompanies = companyNames.filter(name =>
    lower.includes(name.toLowerCase())
  );

  // Build summary from first substantial sentences
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 30);
  const summary = sentences.slice(0, 2).join('. ') + '.';

  return { mentionedCompanies, summary: summary.substring(0, 300) };
};

export interface NewsRelationship {
  company1: string;
  company2: string;
  description: string;
  company1PartnerType: 'Fortune500Global' | 'CryptoNative' | 'Investor';
  company2PartnerType: 'Fortune500Global' | 'CryptoNative' | 'Investor';
  date?: string;
}

export const analyzeNewsRelationships = async (
  content: string,
  mentionedCompanies: string[]
): Promise<NewsRelationship[]> => {
  if (mentionedCompanies.length < 2) return [];

  const relationships: NewsRelationship[] = [];
  const lower = content.toLowerCase();

  // Check for relationship keywords near pairs of mentioned companies
  const relKeywords = ['partnership', 'collaboration', 'integration', 'investment', 'acquisition', 'joint venture', 'deal', 'agreement', 'license'];
  const hasRelSignal = relKeywords.some(k => lower.includes(k));
  if (!hasRelSignal) return [];

  // For each pair of mentioned companies, check if they appear in the same sentence
  for (let i = 0; i < mentionedCompanies.length; i++) {
    for (let j = i + 1; j < mentionedCompanies.length; j++) {
      const c1 = mentionedCompanies[i];
      const c2 = mentionedCompanies[j];

      // Check if both appear within 200 chars of each other
      const idx1 = lower.indexOf(c1.toLowerCase());
      const idx2 = lower.indexOf(c2.toLowerCase());
      if (idx1 >= 0 && idx2 >= 0 && Math.abs(idx1 - idx2) < 300) {
        // Extract the context between them
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2) + Math.max(c1.length, c2.length) + 50;
        const context = content.substring(Math.max(0, start - 30), Math.min(content.length, end));

        // Classify partner types based on heuristics
        const classifyType = (name: string): 'Fortune500Global' | 'CryptoNative' | 'Investor' => {
          const n = name.toLowerCase();
          if (/venture|capital|fund|invest|partner/i.test(n)) return 'Investor';
          // Check if crypto-native keywords appear near this company
          const nameIdx = lower.indexOf(n);
          const nearby = nameIdx >= 0 ? lower.substring(Math.max(0, nameIdx - 100), nameIdx + n.length + 100) : '';
          if (/crypto|blockchain|defi|web3|stablecoin|token/.test(nearby)) return 'CryptoNative';
          return 'Fortune500Global';
        };

        relationships.push({
          company1: c1,
          company2: c2,
          description: context.replace(/\s+/g, ' ').trim().substring(0, 200),
          company1PartnerType: classifyType(c1),
          company2PartnerType: classifyType(c2),
        });
      }
    }
  }

  return relationships;
};

// Fix misclassified categories and find real central banks via web search.
// 1. Removes "Central Banks" from companies whose name doesn't match.
// 2. Collapses blockchains to Infrastructure only.
// 3. Removes "Banks" from fintechs that aren't real banks.
// 4. Fixes .com.com URLs.
// 5. Searches the web for actual central banks exploring CBDCs.
// Returns { fixed: companies with corrected categories, discovered: new central bank entries }
export const scanAndFixCentralBanks = async (
  companies: Company[]
): Promise<{ fixed: Company[]; discovered: Partial<Company>[] }> => {
  const centralBankNamePattern =
    /central bank|monetary authority|reserve bank|banque centrale|banco central|bank of (?:england|japan|canada|korea|israel|thailand|ghana|jamaica|bahamas|nigeria|india|mexico|france|russia|china)|people'?s bank|european central|bundesbank|banque de france|bank negara|bangko sentral|bank indonesia|south african reserve|swiss national bank|norges bank|riksbank|Danmarks Nationalbank/i;
  const centralBankAbbrevPattern =
    /\b(?:fed(?:eral)?\s+reserve|ecb|bce|pboc|rbi|boj|boe|snb|rba|mas|hkma|bsp|bis)\b/i;

  // Blockchain detection: company name + description signals
  const isBlockchainCompany = (name: string, desc: string): boolean => {
    const nl = name.toLowerCase();
    const dl = desc.toLowerCase();
    const combined = `${nl} ${dl}`;
    return (
      (/\b(?:chain|network|protocol|blockchain|labs)\b/.test(nl) &&
       /layer[\s-]?[12]|\bl[12]\b|mainnet|consensus|block\s*chain/.test(combined)) ||
      /(?:is|as)\s+(?:a|an)\s+(?:layer[\s-]?[12]|blockchain|l[12])\b/.test(dl) ||
      /\b(?:layer[\s-]?1|layer[\s-]?2|l1|l2)\s+(?:blockchain|network|protocol|chain)\b/.test(dl) ||
      /\b(?:evm[\s-]compatible|proof[\s-]of[\s-](?:stake|work)|smart contract platform)\b/.test(dl)
    );
  };

  // Real bank detection by name
  const isRealBankByName = (name: string): boolean => {
    const nl = name.toLowerCase();
    return (
      (/\bbank\b/i.test(nl) && !/\b(?:banking|bankless|databank|bankman)\b/i.test(nl)) ||
      /\b(?:bancorp|banque|banco|sparkasse|landesbank|kreditanstalt|savings\s+(?:bank|association))\b/i.test(nl)
    );
  };

  // Step 1: Fix all category misclassifications
  const fixed = companies.map(c => {
    let categories = [...(c.categories || [])];
    let changed = false;

    // Fix Central Banks
    if (categories.includes(Category.CENTRAL_BANKS)) {
      const nameMatches = centralBankNamePattern.test(c.name) || centralBankAbbrevPattern.test(c.name);
      const descMatches = c.description &&
        (/(?:is|as)\s+(?:a|the)\s+central bank/i.test(c.description) ||
         /(?:is|as)\s+(?:a|the)\s+monetary authority/i.test(c.description));
      if (!nameMatches && !descMatches) {
        logger.info('general', `Removing "Central Banks" tag from "${c.name}"`);
        categories = categories.filter(cat => cat !== Category.CENTRAL_BANKS);
        changed = true;
      }
    }

    // Fix blockchains: collapse to Infrastructure only
    if (isBlockchainCompany(c.name, c.description || '')) {
      const hadOthers = categories.some(cat =>
        cat !== Category.INFRASTRUCTURE && cat !== Category.ISSUER
      );
      if (hadOthers) {
        logger.info('general', `Collapsing "${c.name}" to Infrastructure only (blockchain)`);
        categories = [Category.INFRASTRUCTURE];
        // Keep Issuer if they actually issue a stablecoin
        if (c.description && /stablecoin.*(?:issuer|issued|issues)|(?:issues?|issued|issuer).*stablecoin/i.test(c.description)) {
          categories.push(Category.ISSUER);
        }
        changed = true;
      }
    }

    // Fix Banks: remove Banks tag from fintechs that aren't real banks
    if (categories.includes(Category.BANKS) && !categories.includes(Category.CENTRAL_BANKS)) {
      if (!isRealBankByName(c.name)) {
        // Check description for real bank signals
        const dl = (c.description || '').toLowerCase();
        const isBankByDesc =
          /(?:is|as)\s+(?:a|an|the)\s+(?:commercial |global |multinational |leading )?bank\b/i.test(dl) ||
          /\b(?:banking license|bank charter|fdic[\s-]insured|chartered bank|licensed bank)\b/i.test(dl);
        if (!isBankByDesc) {
          logger.info('general', `Removing "Banks" tag from "${c.name}" — likely a fintech, not a bank`);
          categories = categories.filter(cat => cat !== Category.BANKS);
          changed = true;
        }
      }
    }

    // Banks, Central Banks, VCs, and Consulting firms are NOT blockchain infrastructure
    const nonInfraCategories = [Category.BANKS, Category.CENTRAL_BANKS, Category.VC, Category.CONSULTANCY];
    if (nonInfraCategories.some(cat => categories.includes(cat))) {
      if (categories.includes(Category.INFRASTRUCTURE)) {
        logger.info('general', `Removing "Infrastructure" tag from "${c.name}" — not blockchain infrastructure`);
        categories = categories.filter(cat => cat !== Category.INFRASTRUCTURE);
        changed = true;
      }
    }

    if (!changed) return c;
    if (categories.length === 0) categories.push(Category.BANKS);
    return { ...c, categories };
  });

  // Also fix any .com.com URLs while we're at it
  const urlFixed = fixed.map(c => {
    if (!c.website) return c;
    const cleaned = sanitizeWebsite(c.website);
    if (cleaned !== c.website) {
      logger.info('general', `Fixed URL for "${c.name}": "${c.website}" → "${cleaned}"`);
      return { ...c, website: cleaned };
    }
    return c;
  });

  // Step 2: Search for real central banks exploring digital currencies / CBDCs
  const existingNames = new Set(companies.map(c => c.name.toLowerCase()));
  const discovered: Partial<Company>[] = [];

  try {
    const { results } = await searchWebFull(
      'central bank CBDC digital currency stablecoin pilot program 2024 2025',
      { num: 10 }
    );

    // Use AI to extract central bank names from results
    const searchContext = results.slice(0, 8).map(r =>
      `[${r.title}] ${r.snippet}`
    ).join('\n');

    const aiResponse = await callAI(
      `From these search results, list ONLY actual central banks (not commercial banks, not fintech companies) that are actively exploring or piloting CBDCs or digital currencies.\n\nSearch results:\n${searchContext}\n\nRespond with one central bank per line in this format:\nNAME | COUNTRY | ACTIVITY\n\nExample:\nBank of England | United Kingdom | Exploring a digital pound (Britcoin) CBDC\n\nRules:\n- ONLY real central banks or monetary authorities\n- Do NOT include commercial banks, fintech companies, or crypto companies\n- Include the full official name\n- Max 15 entries`,
      'You identify central banks from search results. Only list genuine central banks or monetary authorities.'
    );

    const lines = aiResponse.split('\n').filter(l => l.includes('|'));
    for (const line of lines) {
      const [name, country, activity] = line.split('|').map(s => s.trim());
      if (!name || name.length < 3 || name.length > 80) continue;
      if (existingNames.has(name.toLowerCase())) continue;
      // Verify it matches central bank naming patterns
      if (!centralBankNamePattern.test(name) && !centralBankAbbrevPattern.test(name)) continue;

      discovered.push({
        name,
        description: activity || `${name} is exploring digital currency initiatives.`,
        categories: [Category.CENTRAL_BANKS],
        headquarters: country || '',
        country: country || '',
        region: 'Global',
        focus: 'Crypto-Second' as any,
        website: '',
        partners: [],
      });
      existingNames.add(name.toLowerCase()); // prevent duplicates within results
    }
  } catch (err) {
    logger.warn('general', 'Central bank web scan failed — returning fixes only');
  }

  return { fixed: urlFixed, discovered };
};
