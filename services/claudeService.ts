
import { Company, Partner, Job, NewsItem, Category } from '../types';
import { logger } from './logger';

// --- CONFIGURATION ---

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

// Proxy endpoints — serverless functions hold API keys server-side
const API_PROXY_URL = '/api/claude';
const FETCH_URL_ENDPOINT = '/api/fetch-url';
const NEWS_API_ENDPOINT = '/api/news';

export const getCurrentModelName = (): string => {
  return CLAUDE_MODEL;
};

// --- CORE API CALL (via server-side proxy) ---

interface ClaudeResponse {
  content: { type: string; text?: string }[];
  error?: { type: string; message: string };
}

const callClaude = async (
  prompt: string,
  systemPrompt?: string,
  temperature: number = 0.7
): Promise<string> => {
  const start = Date.now();
  const body: any = {
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  logger.info('claude', `Calling Claude (${CLAUDE_MODEL})`, prompt.substring(0, 120) + '...');

  const response = await fetch(API_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const duration = Date.now() - start;
  logger.api('POST', API_PROXY_URL, response.status, duration);

  if (!response.ok) {
    const errText = await response.text();
    logger.error('claude', `Claude API error ${response.status}`, errText);
    throw new Error(`API Error ${response.status}: ${errText}`);
  }

  const data: ClaudeResponse = await response.json();

  if (data.error) {
    logger.error('claude', `Claude returned error`, data.error.message);
    throw new Error(`Claude Error: ${data.error.message}`);
  }

  const textBlocks = (data.content || []).filter((b) => b.type === 'text');
  const result = textBlocks.map((b) => b.text || '').join('\n');
  logger.info('claude', `Claude response received (${result.length} chars, ${duration}ms)`);
  return result;
};

// --- RETRY WRAPPER ---

async function executeWithRetry<T>(
  operationName: string,
  operation: () => Promise<T>
): Promise<T> {
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const msg = (error?.message || '').toLowerCase();

      if (msg.includes('401') || msg.includes('not configured')) {
        throw error;
      }

      if (msg.includes('429')) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 2)));
        continue;
      }

      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw new Error(`All retries exhausted for ${operationName}. Last error: ${lastError?.message}`);
}

// --- JSON PARSING ---

const parseJSON = (text: string): any => {
  try {
    if (!text) return null;
    const clean = text.replace(/```json\n?|```/g, '').trim();
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1)
      return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
    const firstBracket = clean.indexOf('[');
    const lastBracket = clean.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1)
      return JSON.parse(clean.substring(firstBracket, lastBracket + 1));
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
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

// --- NEWS API FETCHER (via /api/news) ---

interface NewsAPIArticle {
  title: string;
  source: string;
  date: string;
  summary: string;
  url: string;
  author: string;
}

const fetchNewsFromAPI = async (
  query: string,
  from?: string
): Promise<NewsAPIArticle[]> => {
  const start = Date.now();
  logger.info('news', `Fetching news from API`, `query="${query}" from=${from || 'none'}`);
  try {
    const response = await fetch(NEWS_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, from, pageSize: 20 }),
    });
    const duration = Date.now() - start;
    logger.api('POST', NEWS_API_ENDPOINT, response.status, duration);
    if (!response.ok) {
      const errText = await response.text();
      logger.error('news', `News API returned ${response.status}`, errText);
      return [];
    }
    const data = await response.json();
    const count = (data.articles || []).length;
    logger.info('news', `News API returned ${count} articles (total: ${data.totalResults || 0})`);
    return data.articles || [];
  } catch (err: any) {
    const duration = Date.now() - start;
    logger.error('news', `News API fetch failed (${duration}ms)`, err?.message || String(err));
    return [];
  }
};

// --- SYSTEM PROMPTS ---

const SYSTEM_PROMPT = `You are an expert business intelligence analyst specializing in the digital asset, stablecoin, and blockchain enterprise ecosystem. You provide accurate, concise, structured data about companies and their partnerships in this space. Always respond with valid JSON only — no markdown, no explanation, no preamble. Just the raw JSON object or array.`;

// --- BUSINESS LOGIC ---

export const enrichCompanyData = async (
  companyName: string
): Promise<Partial<Company>> => {
  const prompt = `Find comprehensive business intelligence for "${companyName}" in the digital assets, stablecoins, and blockchain infrastructure space.

I need a JSON object with these fields:
- "description": string (2-3 sentence company overview)
- "categories": string[] (from: "Issuer", "Infrastructure", "Wallet", "Payments", "DeFi", "Custody", "Banks")
- "partners": array of objects with { "name": string, "type": "Fortune500Global" | "CryptoNative", "description": string, "date": string (YYYY-MM-DD if known), "sourceUrl": string (if known), "country": string (HQ country, e.g. "USA", "Germany", "Japan"), "region": "North America" | "Europe" | "APAC" | "LATAM" | "MEA" | "Global", "industry": string (e.g. "Financial Services", "Automotive", "Technology", "Energy", "Electronics") }
- "website": string (official URL)
- "headquarters": string (City, Country)
- "country": string (country of HQ, e.g. "USA", "Germany", "Singapore", "United Kingdom")
- "industry": string (primary industry vertical, e.g. "Digital Assets", "Payments", "Banking", "Crypto Infrastructure", "DeFi")
- "region": "North America" | "EU" | "Europe" | "APAC" | "LATAM" | "MEA" | "Global"
  (EU = headquartered in an EU member state such as France, Germany, Netherlands, Spain, Italy; Europe = UK, Switzerland, Norway or other non-EU European country; MEA = Middle East or Africa; North America = USA or Canada)
- "focus": "Crypto-First" | "Crypto-Second" (Crypto-First = born as crypto company, Crypto-Second = traditional company that added crypto)
- "funding": { "totalRaised": string, "lastRound": string, "valuation": string, "investors": string[], "lastRoundDate": string } (if available, otherwise omit)

RETURN ONLY RAW JSON. No markdown. No explanation.`;

  try {
    return await executeWithRetry('enrichCompanyData', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.3);
      const json = parseJSON(text);

      if (!json || typeof json !== 'object') {
        console.warn('enrichCompanyData: Claude returned unparseable response for', companyName);
        return {};
      }

      const mappedCategories: Category[] = [];
      if (Array.isArray(json.categories)) {
        json.categories.forEach((c: string) => {
          if (typeof c !== 'string') return;
          const up = c.toUpperCase();
          if (up.includes('ISSUER')) mappedCategories.push(Category.ISSUER);
          else if (up.includes('INFRA')) mappedCategories.push(Category.INFRASTRUCTURE);
          else if (up.includes('PAY')) mappedCategories.push(Category.PAYMENTS);
          else if (up.includes('DEFI')) mappedCategories.push(Category.DEFI);
          else if (up.includes('CUSTODY')) mappedCategories.push(Category.CUSTODY);
          else if (up.includes('BANK')) mappedCategories.push(Category.BANKS);
          else if (up.includes('WALLET')) mappedCategories.push(Category.WALLET);
        });
      }

      return {
        description: typeof json.description === 'string' ? json.description : undefined,
        website: typeof json.website === 'string' ? json.website : undefined,
        headquarters: typeof json.headquarters === 'string' ? json.headquarters : 'Remote',
        country: typeof json.country === 'string' ? json.country : undefined,
        industry: typeof json.industry === 'string' ? json.industry : undefined,
        region: json.region || 'Global',
        focus: json.focus || 'Crypto-Second',
        categories: mappedCategories.length > 0 ? mappedCategories : [Category.INFRASTRUCTURE],
        partners: Array.isArray(json.partners) ? json.partners.filter((p: any) => p && typeof p.name === 'string') : [],
        funding: json.funding || undefined,
      };
    });
  } catch (error) {
    console.error('Enrichment failed for', companyName, ':', error);
    return {};
  }
};

export const findJobOpenings = async (companyName: string): Promise<Job[]> => {
  const prompt = `Based on your knowledge of "${companyName}", what types of roles do they typically hire for in these departments: Strategy, Business Development, Partnerships, Customer Success?

Return a JSON array of plausible job objects based on your knowledge of the company's typical hiring patterns and publicly known career pages. Only include roles you are reasonably confident exist at this company.

Each object should have:
- "title": string
- "department": "Strategy" | "Customer Success" | "Business Dev" | "Partnerships" | "Other"
- "locations": string[] (e.g. ["New York, NY", "Remote"] — based on known office locations)
- "postedDate": string (YYYY-MM-DD, use your best estimate or today's date)
- "url": string (the company's careers page URL if known, otherwise empty string)
- "salary": string (e.g. "$140k - $180k", only if you have reasonable knowledge of their compensation)

IMPORTANT: Do NOT fabricate specific job listings. Only include roles consistent with the company's known operations and size. If you are uncertain, return an empty array [].
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('findJobOpenings', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.3);
      const json = parseJSON(text);
      if (!Array.isArray(json)) {
        console.warn('findJobOpenings: Claude returned non-array response for', companyName);
        return [];
      }
      return json
        .filter((j: any) => j && typeof j.title === 'string' && j.title.trim() !== '')
        .map((j: any, idx: number) => ({
          id: `gen-job-${Date.now()}-${idx}`,
          title: j.title,
          department: j.department as any,
          locations: Array.isArray(j.locations) ? j.locations : ['Remote'],
          postedDate: j.postedDate || new Date().toISOString().split('T')[0],
          url: typeof j.url === 'string' ? j.url : '',
          salary: typeof j.salary === 'string' ? j.salary : undefined,
        }));
    });
  } catch (error) {
    console.error('findJobOpenings failed for', companyName, ':', error);
    return [];
  }
};

export const analyzeJobLink = async (url: string): Promise<any> => {
  // Try to fetch actual page content first
  const pageContent = await fetchUrlContent(url);

  let prompt: string;

  if (pageContent && pageContent.content.length > 100) {
    // We have real page content — ask Claude to analyze it
    const truncatedContent = pageContent.content.substring(0, 8000);
    prompt = `Analyze this job listing page content extracted from ${url}:

---
Page title: ${pageContent.title}

Content:
${truncatedContent}
---

Extract structured information from this job listing and return a JSON object with:
- "companyName": string (the hiring company)
- "jobTitle": string (the position title)
- "locations": string[] (listed locations or ["Remote"])
- "department": "Strategy" | "Customer Success" | "Business Dev" | "Partnerships" | "Other"
- "salary": string (if mentioned, otherwise empty string)
- "description": string (brief summary of the role)
- "requirements": string[] (key requirements/qualifications listed)
- "benefits": string[] (benefits mentioned)
- "type": "Full-time" | "Contract" | "Remote"

Extract as much as you can from the actual page content.
RETURN ONLY RAW JSON.`;
  } else {
    // Fallback: URL-only analysis when page fetch fails
    prompt = `I have a job listing URL: ${url}

Note: The page content could not be fetched. Instead, analyze the URL structure to infer what you can about the job listing. Many job URLs contain the company name, job title, and location in the URL path or query parameters (e.g., greenhouse.io, lever.co, linkedin.com/jobs paths often encode this information).

Based on the URL pattern and your knowledge of the company (if identifiable), return a JSON object with:
- "companyName": string (inferred from URL domain or path, or empty string if unclear)
- "jobTitle": string (inferred from URL path if present, or empty string)
- "locations": string[] (based on known company office locations, or ["Remote"])
- "department": "Strategy" | "Customer Success" | "Business Dev" | "Partnerships" | "Other"
- "salary": string (empty string — cannot determine from URL alone)
- "description": string (brief note about what could be inferred)
- "requirements": string[] (empty array — cannot determine from URL alone)
- "benefits": string[] (empty array — cannot determine from URL alone)
- "type": "Full-time" | "Contract" | "Remote"

Only populate fields you can reasonably infer from the URL and your knowledge. Leave others empty.
RETURN ONLY RAW JSON.`;
  }

  try {
    return await executeWithRetry('analyzeJobLink', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.3);
      const result = parseJSON(text) || {};
      result._sourceMethod = pageContent ? 'page-content' : 'url-inference';
      return result;
    });
  } catch (error) {
    console.error('analyzeJobLink failed:', error);
    return {};
  }
};

export const fetchIndustryNews = async (
  directoryCompanies: string[] = []
): Promise<NewsItem[]> => {
  logger.info('news', `fetchIndustryNews called with ${directoryCompanies.length} companies`);
  // Step 1: Try to get real news from NewsAPI
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toISOString().split('T')[0];

  const searchQuery = 'stablecoin OR "digital asset" OR "blockchain enterprise" OR CBDC OR "crypto custody"';
  const apiArticles = await fetchNewsFromAPI(searchQuery, fromDate);

  if (apiArticles.length > 0) {
    logger.info('news', `Got ${apiArticles.length} articles from NewsAPI, mapping to companies`);
    // We have real news — match against tracked companies
    const companySet = directoryCompanies.map((c) => c.toLowerCase());

    return apiArticles
      .filter((a) => a.title && a.summary)
      .map((article, idx) => {
        const relatedCompanies = directoryCompanies.filter(
          (company) =>
            article.title.toLowerCase().includes(company.toLowerCase()) ||
            article.summary.toLowerCase().includes(company.toLowerCase())
        );

        return {
          id: `news-api-${Date.now()}-${idx}`,
          title: article.title,
          source: article.source || 'News',
          date: article.date || new Date().toISOString().split('T')[0],
          summary: article.summary,
          url: article.url || '#',
          relatedCompanies,
        };
      });
  }

  // Step 2: Fallback to Claude's knowledge when NewsAPI is unavailable
  logger.warn('news', 'NewsAPI returned 0 articles, falling back to Claude');
  const companiesList = directoryCompanies.slice(0, 30).join(', ');
  const prompt = `Based on your knowledge, provide notable strategic developments and milestones in the stablecoin, digital asset, and enterprise blockchain space.

Focus especially on these companies if relevant: ${companiesList}

Return a JSON array where each item has:
- "title": string (headline)
- "source": string (publication name where this was reported)
- "date": string (YYYY-MM-DD — use the actual date of the event based on your knowledge)
- "summary": string (2-3 sentences)
- "relatedCompanies": string[] (company names involved)

Include 8-12 items covering: major partnerships, regulatory developments, product launches, and funding rounds. Only include events you are confident actually happened — do NOT fabricate news.
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('fetchIndustryNews', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.4);
      const json = parseJSON(text);
      if (!Array.isArray(json)) {
        console.warn('fetchIndustryNews: Claude returned non-array response');
        return [];
      }
      return json
        .filter((item: any) => item && typeof item.title === 'string' && typeof item.summary === 'string')
        .map((item: any, idx: number) => ({
          id: `gen-news-${Date.now()}-${idx}`,
          title: item.title,
          source: typeof item.source === 'string' ? item.source : 'Intelligence',
          date: typeof item.date === 'string' ? item.date : new Date().toISOString().split('T')[0],
          summary: item.summary,
          url: typeof item.url === 'string' ? item.url : '#',
          relatedCompanies: Array.isArray(item.relatedCompanies) ? item.relatedCompanies : [],
        }));
    });
  } catch (error: any) {
    logger.error('news', 'fetchIndustryNews failed completely', error?.message || String(error));
    return [];
  }
};

export const scanForNewPartnerships = async (
  companyName: string,
  existingPartnerNames: string[]
): Promise<Partner[]> => {
  const prompt = `Based on your knowledge, identify strategic partnerships for "${companyName}" in the digital asset, stablecoin, or blockchain space.

EXCLUDE these already-known partners: ${existingPartnerNames.join(', ')}

Return a JSON array of partnership objects with:
- "name": string (partner company name)
- "type": "Fortune500Global" | "CryptoNative"
- "description": string (what the partnership involves)
- "date": string (YYYY-MM-DD of announcement, use your best knowledge)
- "sourceUrl": string (empty string if not known)
- "country": string (partner HQ country, e.g. "USA", "Germany", "Japan")
- "region": "North America" | "Europe" | "APAC" | "LATAM" | "MEA" | "Global"
- "industry": string (partner primary industry, e.g. "Financial Services", "Automotive", "Technology")

IMPORTANT: Only include partnerships you are confident actually exist. Do NOT fabricate partnerships. If you don't know of any beyond the excluded list, return an empty array [].
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('scanForNewPartnerships', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.3);
      const json = parseJSON(text);
      if (!Array.isArray(json)) {
        console.warn('scanForNewPartnerships: Claude returned non-array response for', companyName);
        return [];
      }
      return json.filter((p: any) =>
        p && typeof p.name === 'string' && typeof p.description === 'string'
      );
    });
  } catch (error) {
    console.error('scanForNewPartnerships failed for', companyName, ':', error);
    return [];
  }
};

export const researchCompanyActivity = async (
  companyName: string
): Promise<any> => {
  const prompt = `Based on your knowledge, describe "${companyName}" and their blockchain, digital asset, CBDC, or stablecoin activities and initiatives.

Return a JSON object with:
- "summary": string (1-2 paragraph overview of their blockchain strategy)
- "initiatives": array of objects with:
  - "title": string (name of initiative)
  - "date": string (YYYY-MM-DD, based on your knowledge)
  - "description": string (what it involves)
  - "sourceUrl": string (empty string if not known)

Include any tokenization projects, blockchain pilots, digital currency experiments, crypto custody services, or stablecoin integrations that you are confident actually exist. Do NOT fabricate initiatives.
RETURN ONLY RAW JSON.`;

  try {
    return await executeWithRetry('researchCompanyActivity', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.4);
      const json = parseJSON(text);
      if (!json || typeof json !== 'object') {
        console.warn('researchCompanyActivity: Claude returned unparseable response for', companyName);
        return { summary: '', initiatives: [] };
      }
      return {
        summary: typeof json.summary === 'string' ? json.summary : '',
        initiatives: Array.isArray(json.initiatives)
          ? json.initiatives.filter((i: any) => i && typeof i.title === 'string')
          : [],
      };
    });
  } catch (error) {
    console.error('researchCompanyActivity failed for', companyName, ':', error);
    return { summary: 'Analysis unavailable.', initiatives: [] };
  }
};

export const recommendMissingCompanies = async (
  existingCompanies: string[]
): Promise<{ name: string; reason: string }[]> => {
  const prompt = `You are maintaining a directory of companies in the stablecoin and digital asset infrastructure ecosystem.

Here are the companies already tracked: ${existingCompanies.slice(0, 50).join(', ')}

Identify 3 major companies that are MISSING from this directory and should be added.

Return a JSON array with:
- "name": string (company name)
- "reason": string (why they should be tracked — 1 sentence)

Focus on companies that are significant players in stablecoins, digital asset infrastructure, crypto custody, payments, or DeFi.
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('recommendMissingCompanies', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.4);
      const json = parseJSON(text);
      if (!Array.isArray(json)) {
        console.warn('recommendMissingCompanies: Claude returned non-array response');
        return [];
      }
      return json.filter((item: any) =>
        item && typeof item.name === 'string' && typeof item.reason === 'string'
      );
    });
  } catch (error) {
    console.error('recommendMissingCompanies failed:', error);
    return [];
  }
};

export const analyzeNewsForCompanies = async (
  content: string,
  companyNames: string[]
): Promise<{ mentionedCompanies: string[]; summary: string }> => {
  const truncated = content.length > 8000 ? content.substring(0, 8000) + '\n[truncated]' : content;
  const prompt = `Analyze this article and identify which of the following companies are mentioned or directly relevant.

COMPANIES TO CHECK:
${companyNames.join(', ')}

ARTICLE CONTENT:
${truncated}

Return a JSON object with:
- "mentionedCompanies": string[] (exact company names from the list above that are mentioned or directly relevant in the article — only include names from the provided list)
- "summary": string (1-2 sentence summary of the article)

RETURN ONLY RAW JSON.`;

  try {
    return await executeWithRetry('analyzeNewsForCompanies', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.2);
      const json = parseJSON(text);
      if (!json || typeof json !== 'object') {
        return { mentionedCompanies: [], summary: '' };
      }
      return {
        mentionedCompanies: Array.isArray(json.mentionedCompanies)
          ? json.mentionedCompanies.filter((n: any) => typeof n === 'string' && companyNames.includes(n))
          : [],
        summary: typeof json.summary === 'string' ? json.summary : '',
      };
    });
  } catch (error) {
    console.error('analyzeNewsForCompanies failed:', error);
    return { mentionedCompanies: [], summary: '' };
  }
};

export interface NewsRelationship {
  company1: string;
  company2: string;
  description: string;
  company1PartnerType: 'Fortune500Global' | 'CryptoNative';
  company2PartnerType: 'Fortune500Global' | 'CryptoNative';
  date?: string;
}

export const analyzeNewsRelationships = async (
  content: string,
  mentionedCompanies: string[]
): Promise<NewsRelationship[]> => {
  if (mentionedCompanies.length < 2) return [];
  const truncated = content.length > 8000 ? content.substring(0, 8000) + '\n[truncated]' : content;
  const prompt = `Analyze this article and identify formal business relationships between the following companies.

COMPANIES TO ANALYZE:
${mentionedCompanies.join(', ')}

ARTICLE CONTENT:
${truncated}

Return a JSON array of relationship objects. Only include pairs where the article EXPLICITLY describes a formal relationship (investment, partnership, acquisition, integration, joint venture, licensing deal). Do NOT infer or guess — only include relationships clearly stated in the article.

Each object must have:
- "company1": string (exact name from the list above)
- "company2": string (exact name from the list above)
- "description": string (1-2 sentence description of the relationship from this article)
- "company1PartnerType": "Fortune500Global" | "CryptoNative" (classify company1: Fortune500Global if it's a major global enterprise or Fortune 500 company, CryptoNative if it's a crypto/blockchain-native company)
- "company2PartnerType": "Fortune500Global" | "CryptoNative" (same classification for company2)
- "date": string (YYYY-MM-DD of the announcement if mentioned, otherwise omit)

If no formal relationships are clearly stated, return an empty array [].
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('analyzeNewsRelationships', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.2);
      const json = parseJSON(text);
      if (!Array.isArray(json)) return [];
      return json.filter((r: any) =>
        r &&
        typeof r.company1 === 'string' && mentionedCompanies.includes(r.company1) &&
        typeof r.company2 === 'string' && mentionedCompanies.includes(r.company2) &&
        typeof r.description === 'string' &&
        ['Fortune500Global', 'CryptoNative'].includes(r.company1PartnerType) &&
        ['Fortune500Global', 'CryptoNative'].includes(r.company2PartnerType)
      );
    });
  } catch (error) {
    console.error('analyzeNewsRelationships failed:', error);
    return [];
  }
};
