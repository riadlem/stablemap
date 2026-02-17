
export enum Category {
  ISSUER = 'Issuer',
  INFRASTRUCTURE = 'Infrastructure',
  WALLET = 'Wallet',
  PAYMENTS = 'Payments',
  DEFI = 'DeFi',
  CUSTODY = 'Custody',
  BANKS = 'Banks'
}

export type CompanyFocus = 'Crypto-First' | 'Crypto-Second';

export interface Partner {
  name: string;
  type: 'Fortune500USA' | 'Fortune500Global' | 'CryptoNative';
  description: string;
  date?: string; // Date of announcement
  sourceUrl?: string; // Link to press release
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

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  date: string;
  summary: string;
  url: string;
  relatedCompanies: string[];
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
  region: 'North America' | 'Europe' | 'APAC' | 'LATAM' | 'EMEA' | 'Global';
  focus: CompanyFocus; // Classification: Crypto-First vs Crypto-Second (Required)
  jobs?: Job[];
  recentNews?: NewsItem[];
  funding?: FundingInfo;
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
