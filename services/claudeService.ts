
import { Company, Partner, Job, NewsItem, Category } from '../types';

// --- CONFIGURATION ---

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

// Proxy endpoint — our serverless function holds the API key server-side
const API_PROXY_URL = '/api/claude';

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
  const body: any = {
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(API_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error ${response.status}: ${errText}`);
  }

  const data: ClaudeResponse = await response.json();

  if (data.error) {
    throw new Error(`Claude Error: ${data.error.message}`);
  }

  const textBlocks = (data.content || []).filter((b) => b.type === 'text');
  return textBlocks.map((b) => b.text || '').join('\n');
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
- "partners": array of objects with { "name": string, "type": "Fortune500USA" | "Fortune500Global" | "CryptoNative", "description": string, "date": string (YYYY-MM-DD if known), "sourceUrl": string (if known) }
- "website": string (official URL)
- "headquarters": string (City, Country)
- "region": "North America" | "Europe" | "APAC" | "LATAM" | "EMEA" | "Global"
- "focus": "Crypto-First" | "Crypto-Second" (Crypto-First = born as crypto company, Crypto-Second = traditional company that added crypto)
- "funding": { "totalRaised": string, "lastRound": string, "valuation": string, "investors": string[], "lastRoundDate": string } (if available, otherwise omit)

RETURN ONLY RAW JSON. No markdown. No explanation.`;

  try {
    return await executeWithRetry('enrichCompanyData', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.5);
      const json = parseJSON(text) || {};

      const mappedCategories: Category[] = [];
      if (Array.isArray(json.categories)) {
        json.categories.forEach((c: string) => {
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
        description: json.description,
        website: json.website,
        headquarters: json.headquarters || 'Remote',
        region: json.region || 'Global',
        focus: json.focus || 'Crypto-Second',
        categories: mappedCategories.length > 0 ? mappedCategories : [Category.INFRASTRUCTURE],
        partners: Array.isArray(json.partners) ? json.partners : [],
        funding: json.funding || undefined,
      };
    });
  } catch (error) {
    console.error('Enrichment failed:', error);
    return {};
  }
};

export const findJobOpenings = async (companyName: string): Promise<Job[]> => {
  const prompt = `Search for current job openings at "${companyName}" in these departments: Strategy, Business Development, Partnerships, Customer Success.

Return a JSON array of job objects with:
- "title": string
- "department": "Strategy" | "Customer Success" | "Business Dev" | "Partnerships" | "Other"
- "locations": string[] (e.g. ["New York, NY", "Remote"])
- "postedDate": string (YYYY-MM-DD, approximate if needed)
- "url": string (link to job posting if known)
- "salary": string (e.g. "$140k - $180k", if visible)

Only include roles that actually exist. If you're not sure about a role, don't include it.
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('findJobOpenings', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.5);
      const json = parseJSON(text);
      if (!Array.isArray(json)) return [];
      return json.map((j: any, idx: number) => ({
        id: `gen-job-${Date.now()}-${idx}`,
        title: j.title,
        department: j.department as any,
        locations: j.locations || ['Remote'],
        postedDate: j.postedDate || new Date().toISOString().split('T')[0],
        url: j.url,
        salary: j.salary,
      }));
    });
  } catch (error) {
    return [];
  }
};

export const analyzeJobLink = async (url: string): Promise<any> => {
  const prompt = `Extract details from this job listing URL: ${url}

Return a JSON object with:
- "companyName": string
- "jobTitle": string
- "locations": string[]
- "department": "Strategy" | "Customer Success" | "Business Dev" | "Partnerships" | "Other"
- "salary": string (if visible)
- "description": string (brief summary)
- "requirements": string[]
- "benefits": string[]
- "type": "Full-time" | "Contract" | "Remote"

RETURN ONLY RAW JSON.`;

  try {
    return await executeWithRetry('analyzeJobLink', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.5);
      return parseJSON(text) || {};
    });
  } catch (error) {
    return {};
  }
};

export const fetchIndustryNews = async (
  directoryCompanies: string[] = []
): Promise<NewsItem[]> => {
  const companiesList = directoryCompanies.slice(0, 30).join(', ');
  const prompt = `Provide the latest strategic news and developments in the stablecoin, digital asset, and enterprise blockchain space from the last 30 days.

Focus especially on these companies if relevant: ${companiesList}

Return a JSON array where each item has:
- "title": string (headline)
- "source": string (publication name)
- "date": string (YYYY-MM-DD)
- "summary": string (2-3 sentences)
- "relatedCompanies": string[] (company names involved)

Include 8-12 items covering: major partnerships, regulatory developments, product launches, and funding rounds.
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('fetchIndustryNews', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.7);
      const json = parseJSON(text);
      if (!Array.isArray(json)) return [];
      return json.map((item: any, idx: number) => ({
        ...item,
        id: `gen-news-${Date.now()}-${idx}`,
        url: item.url || '#',
      }));
    });
  } catch (error) {
    return [];
  }
};

export const scanForNewPartnerships = async (
  companyName: string,
  existingPartnerNames: string[]
): Promise<Partner[]> => {
  const prompt = `Find NEW strategic partnerships for "${companyName}" announced in the last 12 months in the digital asset, stablecoin, or blockchain space.

EXCLUDE these already-known partners: ${existingPartnerNames.join(', ')}

Return a JSON array of new partnership objects with:
- "name": string (partner company name)
- "type": "Fortune500USA" | "Fortune500Global" | "CryptoNative"
- "description": string (what the partnership involves)
- "date": string (YYYY-MM-DD of announcement)
- "sourceUrl": string (link to press release if known)

Only include real, verified partnerships. If none found, return an empty array [].
RETURN ONLY RAW JSON ARRAY.`;

  try {
    return await executeWithRetry('scanForNewPartnerships', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.5);
      return parseJSON(text) || [];
    });
  } catch (error) {
    return [];
  }
};

export const researchCompanyActivity = async (
  companyName: string
): Promise<any> => {
  const prompt = `Research "${companyName}" and their blockchain, digital asset, CBDC, or stablecoin activities and initiatives.

Return a JSON object with:
- "summary": string (1-2 paragraph overview of their blockchain strategy)
- "initiatives": array of objects with:
  - "title": string (name of initiative)
  - "date": string (YYYY-MM-DD)
  - "description": string (what it involves)
  - "sourceUrl": string (link to source if known)

Include any tokenization projects, blockchain pilots, digital currency experiments, crypto custody services, or stablecoin integrations.
RETURN ONLY RAW JSON.`;

  try {
    return await executeWithRetry('researchCompanyActivity', async () => {
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.7);
      return parseJSON(text) || { summary: '', initiatives: [] };
    });
  } catch (error) {
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
      const text = await callClaude(prompt, SYSTEM_PROMPT, 0.7);
      return parseJSON(text) || [];
    });
  } catch (error) {
    return [];
  }
};
