
import { Company, Partner, Job, NewsItem, Category } from '../types';
import { logger } from './logger';
import { getCurrentModel, buildRequestBody, extractResponseText, rotateModel, resetFailures, allModelsExhausted } from './aiModels';

// --- CONFIGURATION ---

const SEARCH_API_ENDPOINT = '/api/search';
const FETCH_URL_ENDPOINT = '/api/fetch-url';

export const getCurrentModelName = (): string => {
  return 'Google Web Search';
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

// Detect company categories from text based on keyword matching
const categorizeFromText = (text: string): Category[] => {
  const lower = text.toLowerCase();
  const cats: Category[] = [];

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
  if (/central bank|cbdc|monetary authority|reserve bank/.test(lower))
    cats.push(Category.CENTRAL_BANKS);
  if (/venture capital|\bvc\b|crypto fund|investment fund|private equity/.test(lower))
    cats.push(Category.VC);
  if (/consult|advisory|professional services|\bpwc\b|\bdeloitte\b|\bey\b|\baccenture\b|\bmckinsey\b/.test(lower))
    cats.push(Category.CONSULTANCY);
  if (/\bbank(?:ing)?\b/.test(lower) && !cats.includes(Category.CENTRAL_BANKS))
    cats.push(Category.BANKS);

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
  const hqPatterns = [
    /headquartered in ([^,.;]+(?:, [^,.;]+)?)/i,
    /based in ([^,.;]+(?:, [^,.;]+)?)/i,
    /headquarters? (?:is |are )?(?:in |at )?([^,.;]+(?:, [^,.;]+)?)/i,
    /([A-Z][a-z]+(?:[\s,]+[A-Z][a-z]+){0,2})-based company/,
  ];

  let headquarters = '';
  for (const p of hqPatterns) {
    const m = text.match(p);
    if (m) { headquarters = m[1].trim(); break; }
  }

  // Country detection
  const countryPatterns: [string, RegExp][] = [
    ['USA', /\b(?:United States|U\.?S\.?A?\.?|New York|San Francisco|California|Boston|Chicago|Washington|Miami|Austin|Denver|Seattle)\b/i],
    ['United Kingdom', /\b(?:United Kingdom|U\.?K\.?|London|England|Scotland)\b/i],
    ['Germany', /\b(?:Germany|Berlin|Frankfurt|Munich)\b/i],
    ['France', /\b(?:France|Paris)\b/i],
    ['Switzerland', /\b(?:Switzerland|Zurich|Zug|Geneva)\b/i],
    ['Singapore', /\bSingapore\b/i],
    ['Japan', /\b(?:Japan|Tokyo)\b/i],
    ['South Korea', /\b(?:South Korea|Seoul)\b/i],
    ['China', /\b(?:China|Beijing|Shanghai|Hong Kong)\b/i],
    ['UAE', /\b(?:UAE|Dubai|Abu Dhabi|United Arab Emirates)\b/i],
    ['Canada', /\b(?:Canada|Toronto|Vancouver)\b/i],
    ['Australia', /\b(?:Australia|Sydney|Melbourne)\b/i],
    ['Netherlands', /\b(?:Netherlands|Amsterdam)\b/i],
    ['Ireland', /\b(?:Ireland|Dublin)\b/i],
    ['Brazil', /\b(?:Brazil|São Paulo)\b/i],
    ['India', /\b(?:India|Mumbai|Bangalore|Delhi)\b/i],
  ];

  let country = '';
  for (const [c, p] of countryPatterns) {
    if (p.test(text)) { country = c; break; }
  }

  // Region mapping
  const regionMap: Record<string, 'North America' | 'EU' | 'Europe' | 'APAC' | 'LATAM' | 'MEA' | 'Global'> = {
    'USA': 'North America', 'Canada': 'North America',
    'Germany': 'EU', 'France': 'EU', 'Netherlands': 'EU', 'Ireland': 'EU',
    'United Kingdom': 'Europe', 'Switzerland': 'Europe',
    'Singapore': 'APAC', 'Japan': 'APAC', 'South Korea': 'APAC', 'China': 'APAC', 'Australia': 'APAC', 'India': 'APAC',
    'UAE': 'MEA',
    'Brazil': 'LATAM',
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

// Extract funding information from text
const extractFundingFromText = (text: string): {
  totalRaised?: string;
  lastRound?: string;
  valuation?: string;
  investors: string[];
  lastRoundDate?: string;
} | null => {
  const fundingMatch = text.match(/raised\s+\$?([\d,.]+\s*(?:million|billion|[MBK]))/i);
  const roundMatch = text.match(/Series\s+([A-F])\b/i) || text.match(/(Seed|Pre-Seed|Series [A-F]|IPO)\b/i);
  const valuationMatch = text.match(/valued?\s+(?:at\s+)?\$?([\d,.]+\s*(?:million|billion|[MBK]))/i);

  if (!fundingMatch && !roundMatch && !valuationMatch) return null;

  const formatAmount = (raw: string): string => {
    const cleaned = raw.replace(/,/g, '').trim();
    return `$${cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()}`;
  };

  return {
    totalRaised: fundingMatch ? formatAmount(fundingMatch[1]) : undefined,
    lastRound: roundMatch ? roundMatch[1] : undefined,
    valuation: valuationMatch ? formatAmount(valuationMatch[1]) : undefined,
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
        const name = match[1].trim().replace(/\s+/g, ' ');
        const nameLower = name.toLowerCase();
        if (
          name.length > 2 &&
          name.length < 50 &&
          !seen.has(nameLower) &&
          nameLower !== companyLower &&
          !/^(the|a|an|this|that|their|its|our|new|more|also)$/i.test(name)
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
  companyName: string
): Promise<Partial<Company>> => {
  try {
    // Search for company info + crypto relevance
    const { results, modelSummary } = await searchWebFull(
      `"${companyName}" (stablecoin OR blockchain OR "digital asset" OR crypto OR payments OR fintech)`,
      { num: 10 }
    );

    if (results.length === 0) {
      logger.warn('search', `No search results for enrichment of ${companyName}`);
      return {};
    }

    // Combine all text for analysis
    const allText = results.map(r => `${r.title} ${r.snippet}`).join('\n');

    // Generate a structured description via AI
    const rawContext = modelSummary || results.slice(0, 5).map(r => `${r.title}: ${r.snippet}`).join('\n');
    let description = '';
    try {
      description = await callAI(
        `Based on this information about "${companyName}":\n\n${rawContext}\n\nWrite a company description. Format:\n- First line: ONE sentence explaining what ${companyName} is and does (core business).\n- Then a blank line, followed by its relevant activities in the stablecoin, digital asset, blockchain, or fintech space as bullet points (use "- " prefix). Each bullet should be a specific activity, product, partnership, or initiative — not generic.\n- Maximum 5 bullet points. Only include bullets you have evidence for.\n- Do NOT use markdown bold (**) or italic (*). Use plain text only.\n- Do NOT include any intro like "Here is" — start directly with the sentence.`,
        'You are a concise business analyst. Write factual, plain-text company descriptions. No markdown formatting. No filler.'
      );
    } catch (err) {
      logger.warn('ai', `AI description generation failed for ${companyName}`);
    }

    // Fallback: clean up raw snippets if AI call failed
    if (!description) {
      const descSnippets = results
        .slice(0, 3)
        .map(r => r.snippet)
        .filter(s => s && s.length > 20);
      description = descSnippets.length > 0
        ? descSnippets.join(' ').substring(0, 500)
        : `${companyName} operates in the digital asset and blockchain ecosystem.`;
    }

    // Find the company's website (prefer non-Wikipedia, non-aggregator results)
    const websiteResult = results.find(r =>
      !r.displayLink.includes('wikipedia') &&
      !r.displayLink.includes('crunchbase') &&
      !r.displayLink.includes('linkedin') &&
      !r.displayLink.includes('bloomberg') &&
      !r.displayLink.includes('twitter') &&
      !r.displayLink.includes('reddit') &&
      !r.displayLink.includes('vertexaisearch') &&
      r.title.toLowerCase().includes(companyName.toLowerCase().split(' ')[0])
    );
    const website = websiteResult ? `https://${websiteResult.displayLink}` : '';

    // Determine categories, focus, location, industry
    const categories = categorizeFromText(allText);
    const focus = determineFocus(allText, companyName);
    const { headquarters, country, region } = extractLocationFromText(allText);
    const industry = determineIndustry(allText);

    // Extract partners from search results
    const partners = extractPartnersFromSearch(results, companyName);

    // Try to extract funding info
    const funding = extractFundingFromText(allText);

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
      categories: categories.length > 0 ? categories : [Category.INFRASTRUCTURE],
      partners,
      funding: funding || undefined,
      parentCompany,
    };
  } catch (error) {
    console.error('Enrichment failed for', companyName, ':', error);
    return {};
  }
};

export const findJobOpenings = async (companyName: string): Promise<Job[]> => {
  try {
    const results = await searchWeb(
      `"${companyName}" careers jobs (blockchain OR crypto OR stablecoin OR "digital asset")`,
      { num: 10 }
    );

    if (results.length === 0) return [];

    // Map search results to job-like entries
    return results
      .filter(r => {
        const lower = (r.title + ' ' + r.snippet).toLowerCase();
        return (
          lower.includes('job') ||
          lower.includes('career') ||
          lower.includes('hiring') ||
          lower.includes('position') ||
          lower.includes('role') ||
          lower.includes('opening')
        );
      })
      .slice(0, 8)
      .map((r, idx) => {
        // Try to extract job title from search result title
        const titleClean = r.title
          .replace(/ [-|–] .*$/, '')
          .replace(/\s*\(.*?\)\s*/g, '')
          .trim();

        // Determine department from keywords
        const lower = (r.title + ' ' + r.snippet).toLowerCase();
        let department: Job['department'] = 'Other';
        if (/strateg/i.test(lower)) department = 'Strategy';
        else if (/customer success|support/i.test(lower)) department = 'Customer Success';
        else if (/business dev|biz dev|sales/i.test(lower)) department = 'Business Dev';
        else if (/partner/i.test(lower)) department = 'Partnerships';

        // Try to extract location
        const locMatch = r.snippet.match(/(?:Location|Based in|Office):\s*([^.;]+)/i);
        const locations = locMatch ? [locMatch[1].trim()] : ['Remote'];

        return {
          id: `search-job-${Date.now()}-${idx}`,
          title: titleClean || `${companyName} - Open Position`,
          department,
          locations,
          postedDate: new Date().toISOString().split('T')[0],
          url: r.link,
        };
      });
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

  // Determine department
  const lower = content.toLowerCase();
  let department: 'Strategy' | 'Customer Success' | 'Business Dev' | 'Partnerships' | 'Other' = 'Other';
  if (/strateg/i.test(lower)) department = 'Strategy';
  else if (/customer success|support/i.test(lower)) department = 'Customer Success';
  else if (/business dev|biz dev|sales/i.test(lower)) department = 'Business Dev';
  else if (/partner/i.test(lower)) department = 'Partnerships';

  // Extract salary
  const salaryMatch = content.match(/\$[\d,]+\s*[-–]\s*\$[\d,]+/);
  const salary = salaryMatch ? salaryMatch[0] : '';

  // Extract requirements (lines starting with bullets or dashes under "requirements")
  const reqSection = content.match(/(?:requirements?|qualifications?|what you.ll need)[\s:]*\n([\s\S]*?)(?:\n\n|\n[A-Z])/i);
  const requirements = reqSection
    ? reqSection[1]
        .split('\n')
        .map(l => l.replace(/^[\s•\-*]+/, '').trim())
        .filter(l => l.length > 10)
        .slice(0, 10)
    : [];

  // Extract benefits
  const benSection = content.match(/(?:benefits?|perks?|what we offer)[\s:]*\n([\s\S]*?)(?:\n\n|\n[A-Z])/i);
  const benefits = benSection
    ? benSection[1]
        .split('\n')
        .map(l => l.replace(/^[\s•\-*]+/, '').trim())
        .filter(l => l.length > 5)
        .slice(0, 10)
    : [];

  // Extract description (first substantial paragraph)
  const descLines = content.split('\n').filter(l => l.trim().length > 50);
  const description = descLines.slice(0, 3).join(' ').substring(0, 500);

  // Determine type
  let type: 'Full-time' | 'Contract' | 'Remote' = 'Full-time';
  if (/contract/i.test(content)) type = 'Contract';
  else if (/remote/i.test(content)) type = 'Remote';

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

  const results = await searchWeb(
    'stablecoin OR "digital asset" OR "blockchain enterprise" OR CBDC OR "crypto custody" news',
    { num: 10, dateRestrict: 'm1', sort: 'date' }
  );

  if (results.length === 0) {
    logger.warn('news', 'Google Search returned 0 results for industry news');
    return [];
  }

  return results
    .filter(r => r.title && r.snippet)
    .map((result, idx) => {
      // Match against tracked companies
      const relatedCompanies = directoryCompanies.filter(company => {
        const lower = (result.title + ' ' + result.snippet).toLowerCase();
        return lower.includes(company.toLowerCase());
      });

      // Try to extract date from snippet
      const dateMatch = result.snippet.match(/(\w+ \d{1,2},? \d{4})/);
      const date = dateMatch
        ? new Date(dateMatch[1]).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        id: `search-news-${Date.now()}-${idx}`,
        title: result.title.replace(/ [-|–] .*$/, '').trim(),
        source: result.displayLink.replace(/^www\./, ''),
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

  const results = await searchWeb(
    `"${companyName}" (stablecoin OR "tokenized deposits" OR "tokenized funds" OR "tokenized assets" OR "crypto treasury" OR "digital asset" OR CBDC)`,
    { num: 10, dateRestrict: 'm1' }
  );

  if (results.length === 0) {
    logger.warn('news', `No search results for ${companyName} news`);
    return [];
  }

  let candidates = results
    .filter(r => r.title && r.snippet)
    .map((result, idx) => {
      const dateMatch = result.snippet.match(/(\w+ \d{1,2},? \d{4})/);
      const date = dateMatch
        ? new Date(dateMatch[1]).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        id: `company-scan-${Date.now()}-${idx}`,
        title: result.title.replace(/ [-|–] .*$/, '').trim(),
        source: result.displayLink.replace(/^www\./, ''),
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

  let candidates = results
    .filter(r => r.title && r.snippet)
    .map((result, idx) => {
      const dateMatch = result.snippet.match(/(\w+ \d{1,2},? \d{4})/);
      const date = dateMatch
        ? new Date(dateMatch[1]).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        id: `inv-scan-${Date.now()}-${idx}`,
        title: result.title.replace(/ [-|–] .*$/, '').trim(),
        source: result.displayLink.replace(/^www\./, ''),
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
        title: r.title.replace(/ [-|–] .*$/, '').trim(),
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

  // Search for top companies in the space
  const results = await searchWeb(
    'top stablecoin companies OR "digital asset infrastructure" companies OR "crypto custody" companies 2025',
    { num: 10 }
  );

  if (results.length === 0) return [];

  // Extract company names from search results
  const allText = results.map(r => `${r.title} ${r.snippet}`).join('\n');
  const candidates = extractCompanyNamesFromText(allText, existingSet);

  // Build recommendations from candidates we haven't tracked yet
  const recommendations: { name: string; reason: string }[] = [];
  for (const name of candidates) {
    if (recommendations.length >= 3) break;
    if (existingSet.has(name.toLowerCase())) continue;

    // Find the snippet that mentions this company for the reason
    const relevantResult = results.find(r =>
      r.title.includes(name) || r.snippet.includes(name)
    );
    const reason = relevantResult
      ? relevantResult.snippet.substring(0, 150)
      : `Identified as a notable company in the stablecoin and digital asset ecosystem.`;

    recommendations.push({ name, reason });
  }

  return recommendations;
};

export interface DiscoveredPortfolioCompany {
  name: string;
  description: string;
  category: string;
  fundingStage?: string;
  investmentDate?: string;
}

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
      const cats = categorizeFromText(contextText);
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

      const cats = categorizeFromText(context);
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
