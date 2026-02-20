
export enum Category {
  ISSUER = 'Issuer',
  INFRASTRUCTURE = 'Infrastructure',
  WALLET = 'Wallet',
  PAYMENTS = 'Payments',
  DEFI = 'DeFi',
  CUSTODY = 'Custody',
  BANKS = 'Banks',
  CENTRAL_BANKS = 'Central Banks',
  VC = 'VC',
  CONSULTANCY = 'Consultancy'
}

export type CompanyFocus = 'Crypto-First' | 'Crypto-Second';

export interface Partner {
  name: string;
  type: 'Fortune500Global' | 'CryptoNative' | 'Investor';
  description: string;
  date?: string; // Date of announcement
  sourceUrl?: string; // Link to press release
  country?: string; // e.g., "USA", "Germany", "Japan"
  region?: 'North America' | 'Europe' | 'APAC' | 'LATAM' | 'MEA' | 'Global';
  industry?: string; // e.g., "Financial Services", "Automotive", "Energy"
}

export interface FundingInfo {
  totalRaised?: string; // e.g. "$450M"
  lastRound?: string; // e.g. "Series D"
  valuation?: string; // e.g. "$9B"
  investors: string[]; // e.g. ["a16z", "Sequoia"]
  lastRoundDate?: string;
}

export interface Job {
  id: string;
  title: string;
  department: 'Strategy' | 'Customer Success' | 'Business Dev' | 'Partnerships' | 'Other';
  locations: string[];
  postedDate: string;
  url?: string;
  hidden?: boolean;
  dismissReason?: string;
  // Enhanced Fields
  salary?: string; // e.g. "$140k - $180k"
  description?: string; // Full HTML or Markdown description
  requirements?: string[];
  benefits?: string[];
  type?: 'Full-time' | 'Contract' | 'Remote';
}

export type NewsSourceType = 'press' | 'press_release' | 'partnership';

export type NewsVote = 'up' | 'down';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  date: string;
  summary: string;
  url: string;
  relatedCompanies: string[];
  sourceType?: NewsSourceType;
  vote?: NewsVote;
}

export function classifyNewsSourceType(item: NewsItem): NewsSourceType {
  if (item.sourceType) return item.sourceType;
  if (item.id.startsWith('ptnr-') || item.source === 'Directory Intelligence') return 'partnership';
  if (item.id.startsWith('news-api-')) return 'press';
  if (item.id.startsWith('manual-news-') && item.url && item.url !== '#') return 'press';
  if (item.id.startsWith('gen-news-')) return 'press_release';
  if (item.source && !['Intelligence', 'Directory Intelligence', 'Manual Entry'].includes(item.source)) return 'press';
  return 'press_release';
}

export interface Company {
  id: string;
  name: string;
  logoPlaceholder: string;
  description: string;
  categories: Category[];
  partners: Partner[];
  website: string;
  headquarters: string; // e.g., "New York, USA"
  region: 'North America' | 'EU' | 'Europe' | 'APAC' | 'LATAM' | 'MEA' | 'EMEA' | 'Global';
  focus: CompanyFocus; // Classification: Crypto-First vs Crypto-Second (Required)
  country?: string;    // e.g., "USA", "Germany", "France"
  industry?: string;   // e.g., "Digital Assets", "Payments", "Banking"
  jobs?: Job[];
  recentNews?: NewsItem[];
  funding?: FundingInfo;
  addedAt?: string; // ISO timestamp for "sort by last added"
  parentCompany?: string; // Name of parent company for local entity grouping (e.g. "PwC" for "PwC India")
}

export interface ShareConfig {
  recipients: string[];
  message: string;
  includePrivateNotes: boolean;
}

export interface Fortune500Company {
  rank: number;
  name: string;
  industry: string;
  city: string;
  state: string;
  website: string;
  employees: number;
  revenue: number; // Stored as number for sorting
  revenueStr: string; // Stored as string for display
  ceo: string;
  // Computed Properties for the Map
  activePartnerships?: {
    cryptoCompany: string;
    description: string;
  }[];
}

export interface Global500ResearchData {
  rank: number;
  companyName: string;
  summary: string;
  initiatives: {
    title: string;
    date: string;
    description: string;
    sourceUrl: string;
  }[];
  lastUpdated: number;
}

export type ListPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface CompanyListEntry {
  companyId: string;
  label: string;
  priority: ListPriority;
  addedAt: string;
}

export interface CompanyList {
  id: string;
  name: string;
  entries: CompanyListEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface FortuneGlobal500Company {
  rank: number;
  name: string;
  revenueStr: string;
  revenuePercentChange: string;
  profitsStr: string;
  profitsPercentChange: string;
  assetsStr: string;
  employees: number;
  changeInRank: string;
  yearsOnList: number;
  // Enriched Fields from USA merge
  industry?: string;
  ceo?: string;
  website?: string;
  hqLocation?: string;
  listSource?: 'Global' | 'USA' | 'Both';
  // Computed
  activePartnerships?: {
    cryptoCompany: string;
    description: string;
  }[];
  researchData?: Global500ResearchData;
  newsMentions?: NewsItem[];
}
