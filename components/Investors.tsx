import React, { useMemo, useState, useEffect } from 'react';
import { Search, TrendingUp, ChevronDown, ChevronUp, Building2, DollarSign, Users, Plus, Loader2, Telescope, Check, X, UserPlus, Link, ExternalLink, FileSpreadsheet, ArrowRight, Newspaper, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Company, NewsItem, NewsVote, classifyNewsSourceType, NewsSourceType } from '../types';
import { lookupInvestorPortfolio, lookupInvestorPortfolioFromUrl, extractPortfolioFromText, scanInvestorNews, extractUnknownCompanyNames, DiscoveredPortfolioCompany } from '../services/claudeService';
import { db } from '../services/db';

interface InvestorsProps {
  companies: Company[];
  onSelectCompany: (company: Company) => void;
  onAddCompany: (name: string) => Promise<void>;
  onAddCompanyWithInvestor: (companyName: string, investorName: string) => Promise<void>;
  onNavigateToVCImport: () => void;
}

interface InvestorEntry {
  name: string;
  portfolio: Company[];
}

// Common VC/investor domain overrides for better logo resolution
const INVESTOR_DOMAIN_OVERRIDES: Record<string, string> = {
  'Andreessen Horowitz': 'a16z.com',
  'a16z': 'a16z.com',
  'a16z Crypto': 'a16z.com',
  'Sequoia Capital': 'sequoiacap.com',
  'Sequoia': 'sequoiacap.com',
  'Lightspeed Venture Partners': 'lsvp.com',
  'Lightspeed': 'lsvp.com',
  'Accel': 'accel.com',
  'Accel Partners': 'accel.com',
  'Benchmark': 'benchmark.com',
  'Benchmark Capital': 'benchmark.com',
  'Greylock Partners': 'greylock.com',
  'Greylock': 'greylock.com',
  'Index Ventures': 'indexventures.com',
  'Insight Partners': 'insightpartners.com',
  'Tiger Global': 'tigerglobal.com',
  'Tiger Global Management': 'tigerglobal.com',
  'Coatue': 'coatue.com',
  'Coatue Management': 'coatue.com',
  'Ribbit Capital': 'ribbitcap.com',
  'General Catalyst': 'generalcatalyst.com',
  'Bessemer Venture Partners': 'bvp.com',
  'Bessemer': 'bvp.com',
  'Union Square Ventures': 'usv.com',
  'Founders Fund': 'foundersfund.com',
  'Khosla Ventures': 'khoslaventures.com',
  'NEA': 'nea.com',
  'New Enterprise Associates': 'nea.com',
  'Paradigm': 'paradigm.xyz',
  'Polychain Capital': 'polychain.capital',
  'Polychain': 'polychain.capital',
  'Pantera Capital': 'panteracapital.com',
  'Pantera': 'panteracapital.com',
  'Multicoin Capital': 'multicoin.capital',
  'Multicoin': 'multicoin.capital',
  'Coinbase Ventures': 'coinbase.com',
  'Binance Labs': 'binance.com',
  'Binance': 'binance.com',
  'Digital Currency Group': 'dcg.co',
  'DCG': 'dcg.co',
  'Galaxy Digital': 'galaxy.com',
  'Jump Crypto': 'jumpcrypto.com',
  'Jump Trading': 'jumptrading.com',
  'Dragonfly': 'dragonfly.xyz',
  'Dragonfly Capital': 'dragonfly.xyz',
  'Electric Capital': 'electriccapital.com',
  'Framework Ventures': 'framework.ventures',
  'Blockchain Capital': 'blockchaincapital.com',
  'Animoca Brands': 'animocabrands.com',
  'Circle': 'circle.com',
  'Circle Ventures': 'circle.com',
  'Variant': 'variant.fund',
  'Variant Fund': 'variant.fund',
  'Haun Ventures': 'haun.co',
  'Placeholder VC': 'placeholder.vc',
  'Castle Island Ventures': 'castleisland.vc',
  'Brevan Howard': 'brevanhoward.com',
  'Brevan Howard Digital': 'brevanhoward.com',
  'SoftBank': 'softbank.com',
  'SoftBank Vision Fund': 'softbank.com',
  'Goldman Sachs': 'goldmansachs.com',
  'JPMorgan': 'jpmorgan.com',
  'Morgan Stanley': 'morganstanley.com',
  'BlackRock': 'blackrock.com',
  'Fidelity': 'fidelity.com',
  'Fidelity Investments': 'fidelity.com',
  'HSBC': 'hsbc.com',
  'Standard Chartered': 'sc.com',
  'Citigroup': 'citi.com',
  'Citi': 'citi.com',
  'Citi Ventures': 'citi.com',
  'BNY Mellon': 'bnymellon.com',
  'State Street': 'statestreet.com',
  'PayPal Ventures': 'paypal.com',
  'Visa': 'visa.com',
  'Mastercard': 'mastercard.com',
  'Samsung': 'samsung.com',
  'Samsung Next': 'samsung.com',
  'Google Ventures': 'gv.com',
  'GV': 'gv.com',
  'Temasek': 'temasek.com.sg',
  'GIC': 'gic.com.sg',
};

// Derive a Clearbit-friendly domain from an investor name
const getInvestorLogoDomain = (name: string): string => {
  if (INVESTOR_DOMAIN_OVERRIDES[name]) return INVESTOR_DOMAIN_OVERRIDES[name];
  // Try a slug-based guess: "Paradigm Capital" → "paradigmcapital.com"
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${slug}.com`;
};

// 3-tier logo error handler matching Directory pattern
const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement>, name: string, website?: string) => {
  const target = e.target as HTMLImageElement;
  const domain = website?.replace(/^https?:\/\//, '').split('/')[0];
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f8fafc&color=64748b&size=128`;

  if (target.src.includes('logo.clearbit.com')) {
    // Clearbit failed → try Google Favicon
    const favDomain = domain || getInvestorLogoDomain(name);
    target.src = `https://www.google.com/s2/favicons?domain=${favDomain}&sz=128`;
  } else if (!target.src.includes('ui-avatars.com')) {
    // Google Favicon (or anything else) failed → fall back to UI Avatar
    target.src = avatarUrl;
  }
};

const Investors: React.FC<InvestorsProps> = ({ companies, onSelectCompany, onAddCompany, onAddCompanyWithInvestor, onNavigateToVCImport }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedInvestor, setExpandedInvestor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'portfolio' | 'alpha'>('portfolio');

  // Add investor lookup state
  const [newInvestorName, setNewInvestorName] = useState('');
  const [newInvestorUrl, setNewInvestorUrl] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResults, setLookupResults] = useState<DiscoveredPortfolioCompany[] | null>(null);
  const [lookupInvestorLabel, setLookupInvestorLabel] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedContent, setPastedContent] = useState('');

  // Discover portfolio state (per existing investor)
  const [discoveringFor, setDiscoveringFor] = useState<string | null>(null);
  const [discoveredCompanies, setDiscoveredCompanies] = useState<Map<string, DiscoveredPortfolioCompany[]>>(new Map());

  // Track which companies are being added
  const [addingCompanies, setAddingCompanies] = useState<Set<string>>(new Set());
  const [addedCompanies, setAddedCompanies] = useState<Set<string>>(new Set());

  // Add company to investor portfolio state
  const [addingToPortfolioFor, setAddingToPortfolioFor] = useState<string | null>(null);
  const [portfolioSearchTerm, setPortfolioSearchTerm] = useState('');
  const [showPortfolioSuggestions, setShowPortfolioSuggestions] = useState(false);

  // Investor news feed state (per-investor accordion)
  const [investorNews, setInvestorNews] = useState<Map<string, NewsItem[]>>(new Map());
  const [scanningNewsFor, setScanningNewsFor] = useState<string | null>(null);
  const [newsVotes, setNewsVotes] = useState<Record<string, NewsVote>>({});

  // Investment News tab state
  const [activeInvestorTab, setActiveInvestorTab] = useState<'investors' | 'news'>('investors');
  const [combinedInvestorNews, setCombinedInvestorNews] = useState<NewsItem[]>([]);
  const [isLoadingCombinedNews, setIsLoadingCombinedNews] = useState(false);
  const [scanQueue, setScanQueue] = useState<string[]>([]);
  const [scanQueueIndex, setScanQueueIndex] = useState(0);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [scannedInvestors, setScannedInvestors] = useState<Set<string>>(new Set());
  const [unknownCompaniesInArticle, setUnknownCompaniesInArticle] = useState<Map<string, string[]>>(new Map());
  const [detectingUnknownFor, setDetectingUnknownFor] = useState<Set<string>>(new Set());

  // Load votes from Firestore on mount
  useEffect(() => {
    db.getNewsVotes().then(setNewsVotes).catch(() => {});
  }, []);

  const existingCompanyNames = useMemo(() => companies.map(c => c.name), [companies]);

  const investors = useMemo<InvestorEntry[]>(() => {
    const map = new Map<string, Company[]>();
    for (const company of companies) {
      const seen = new Set<string>();
      // Source 1: funding.investors string array
      for (const investor of company.funding?.investors ?? []) {
        const key = investor.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(company);
      }
      // Source 2: partners with type 'Investor'
      for (const partner of company.partners ?? []) {
        if (partner.type !== 'Investor') continue;
        const key = partner.name.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(company);
      }
    }
    const entries: InvestorEntry[] = Array.from(map.entries()).map(([name, portfolio]) => ({
      name,
      portfolio,
    }));

    if (sortBy === 'portfolio') {
      entries.sort((a, b) => b.portfolio.length - a.portfolio.length);
    } else {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    }
    return entries;
  }, [companies, sortBy]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return investors;
    const q = searchTerm.toLowerCase();
    return investors.filter(
      inv =>
        inv.name.toLowerCase().includes(q) ||
        inv.portfolio.some(c => c.name.toLowerCase().includes(q))
    );
  }, [investors, searchTerm]);

  const totalPortfolioCompanies = useMemo(
    () => new Set(companies.filter(c => c.funding?.investors?.length).map(c => c.id)).size,
    [companies]
  );

  const investorNameSet = useMemo(
    () => new Set(investors.map(i => i.name.toLowerCase())),
    [investors]
  );

  // Effect A: load combined news from global db when "Investment News" tab first opens
  useEffect(() => {
    if (activeInvestorTab !== 'news' || combinedInvestorNews.length > 0) return;
    setIsLoadingCombinedNews(true);
    db.getNews()
      .then(allNews => {
        const related = allNews.filter(item =>
          item.relatedCompanies.some(rc => investorNameSet.has(rc.toLowerCase()))
        );
        setCombinedInvestorNews(
          related.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        );
      })
      .catch(() => {})
      .finally(() => setIsLoadingCombinedNews(false));
  }, [activeInvestorTab, investorNameSet]);

  // Effect B: drive sequential scan queue one investor at a time
  useEffect(() => {
    if (!isScanningAll) return;
    if (scanQueueIndex >= scanQueue.length) { setIsScanningAll(false); return; }
    const inv = investors.find(i => i.name === scanQueue[scanQueueIndex]);
    if (inv) handleScanAndMerge(inv.name, inv.portfolio.map(c => c.name));
    else setScanQueueIndex(prev => prev + 1);
  }, [isScanningAll, scanQueueIndex, scanQueue]);

  // Effect C: auto-scan when accordion expanded for the first time
  useEffect(() => {
    if (!expandedInvestor) return;
    if (investorNews.has(expandedInvestor)) return;
    if (scanningNewsFor === expandedInvestor) return;
    if (scannedInvestors.has(expandedInvestor)) return;
    const inv = investors.find(i => i.name === expandedInvestor);
    if (inv) handleScanAndMerge(inv.name, inv.portfolio.map(c => c.name));
  }, [expandedInvestor]);

  const toggleExpand = (name: string) => {
    setExpandedInvestor(prev => (prev === name ? null : name));
  };

  // Discover other investments for an existing investor
  const handleDiscoverPortfolio = async (investorName: string) => {
    setDiscoveringFor(investorName);
    try {
      const results = await lookupInvestorPortfolio(investorName, existingCompanyNames);
      setDiscoveredCompanies(prev => {
        const next = new Map(prev);
        next.set(investorName, results);
        return next;
      });
    } catch (e) {
      console.error('Discovery failed:', e);
    } finally {
      setDiscoveringFor(null);
    }
  };

  // Core scan function: scans one investor, enriches relatedCompanies,
  // persists to db (propagates to CompanyDetail), and updates both feeds
  const handleScanAndMerge = async (investorName: string, portfolioNames: string[]) => {
    setScanningNewsFor(investorName);
    try {
      const existingNews = investorNews.get(investorName) || [];
      const voteFeedback = await db.getVoteSummaryForAI(investorName, existingNews);
      const scannedItems = await scanInvestorNews(investorName, portfolioNames, voteFeedback);

      // Client-side company enrichment: detect directory companies mentioned in each article
      const allCompanyNames = companies.map(c => c.name);
      const enriched = scannedItems.map(item => {
        const text = `${item.title} ${item.summary}`.toLowerCase();
        const mentioned = allCompanyNames.filter(n => text.includes(n.toLowerCase()));
        return {
          ...item,
          relatedCompanies: Array.from(new Set([investorName, ...mentioned])),
        };
      });

      // Deduplicate against existing (by id and title)
      const existingIds = new Set(existingNews.map(n => n.id));
      const existingTitles = new Set(existingNews.map(n => n.title.toLowerCase()));
      const newItems = enriched.filter(
        n => !existingIds.has(n.id) && !existingTitles.has(n.title.toLowerCase())
      );

      // Update per-investor accordion store
      const mergedForAccordion = [...existingNews, ...newItems].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setInvestorNews(prev => {
        const next = new Map(prev);
        next.set(investorName, mergedForAccordion);
        return next;
      });

      // Persist to global db so CompanyDetail views pick it up automatically
      if (newItems.length > 0) {
        db.saveNews(newItems).catch(console.error);
      }

      // Merge into combined tab feed (dedup by id and title)
      if (newItems.length > 0) {
        setCombinedInvestorNews(prev => {
          const prevIds = new Set(prev.map(n => n.id));
          const prevTitles = new Set(prev.map(n => n.title.toLowerCase()));
          const toAdd = newItems.filter(n => !prevIds.has(n.id) && !prevTitles.has(n.title.toLowerCase()));
          return [...prev, ...toAdd].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
        });
      }

      setScannedInvestors(prev => new Set(prev).add(investorName));
    } catch (e) {
      console.error('Investor news scan failed:', e);
    } finally {
      setScanningNewsFor(null);
      setScanQueueIndex(prev => prev + 1);
    }
  };

  const handleScanAllInvestors = () => {
    const unscanned = investors.filter(inv => !scannedInvestors.has(inv.name)).map(i => i.name);
    if (unscanned.length === 0) return;
    setScanQueue(unscanned);
    setScanQueueIndex(0);
    setIsScanningAll(true);
  };

  const handleDetectUnknownCompanies = async (article: NewsItem) => {
    if (detectingUnknownFor.has(article.id)) return;
    setDetectingUnknownFor(prev => new Set(prev).add(article.id));
    try {
      const unknown = await extractUnknownCompanyNames(
        article.title,
        article.summary,
        companies.map(c => c.name)
      );
      setUnknownCompaniesInArticle(prev => {
        const next = new Map(prev);
        next.set(article.id, unknown);
        return next;
      });
    } catch (e) {
      console.error('Unknown company detection failed', e);
      setUnknownCompaniesInArticle(prev => {
        const next = new Map(prev);
        next.set(article.id, []);
        return next;
      });
    } finally {
      setDetectingUnknownFor(prev => {
        const next = new Set(prev);
        next.delete(article.id);
        return next;
      });
    }
  };

  const handleInvestorNewsVote = async (newsId: string, vote: NewsVote) => {
    const current = newsVotes[newsId];
    const newVote = current === vote ? undefined : vote;
    setNewsVotes(prev => {
      const next = { ...prev };
      if (newVote) { next[newsId] = newVote; } else { delete next[newsId]; }
      return next;
    });
    await db.setNewsVote(newsId, newVote);
  };

  // Detect if a string looks like a URL
  const isUrl = (s: string) => /^https?:\/\//i.test(s.trim()) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(s.trim());

  // Normalize a URL-ish string to a full URL
  const normalizeUrl = (s: string) => {
    const trimmed = s.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  // Smart lookup: auto-detects if name field contains a URL, also uses URL field
  const handleNewInvestorLookup = async () => {
    const name = newInvestorName.trim();
    const url = newInvestorUrl.trim();
    if (!name && !url) return;

    setIsLookingUp(true);
    setShowPasteBox(false);
    // If only a URL is given (no name), derive a label from the domain
    const label = name || new URL(normalizeUrl(url)).hostname.replace('www.', '');
    setLookupInvestorLabel(label);
    setLookupResults(null);

    try {
      let results: DiscoveredPortfolioCompany[];

      // Determine the effective URL — could be from the URL field or auto-detected in the name field
      const nameIsUrl = name && isUrl(name);
      const effectiveUrl = url || (nameIsUrl ? normalizeUrl(name) : '');
      const effectiveName = nameIsUrl ? '' : name;

      if (effectiveUrl) {
        const { results: urlResults, fetchFailed } = await lookupInvestorPortfolioFromUrl(effectiveUrl, effectiveName, existingCompanyNames);
        if (fetchFailed) {
          // Site blocked our request or is a JS SPA — offer paste fallback
          setShowPasteBox(true);
          setLookupResults([]);
          setIsLookingUp(false);
          return;
        }
        results = urlResults;
      } else {
        results = await lookupInvestorPortfolio(effectiveName, existingCompanyNames);
        if (results.length === 0) {
          // No knowledge of this fund — offer paste fallback
          setShowPasteBox(true);
        }
      }
      setLookupResults(results);
    } catch (e) {
      console.error('Investor lookup failed:', e);
      setLookupResults([]);
      setShowPasteBox(true);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Process pasted portfolio content
  const handlePastedContentSubmit = async () => {
    const text = pastedContent.trim();
    if (!text) return;
    setIsLookingUp(true);
    try {
      const results = await extractPortfolioFromText(
        text,
        newInvestorName.trim() || undefined,
        existingCompanyNames
      );
      setLookupResults(results);
      setShowPasteBox(false);
    } catch (e) {
      console.error('Paste extraction failed:', e);
      setLookupResults([]);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Generate suggested lookup URLs for a fund name
  const getSuggestedUrls = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return [
      { label: 'AngelList', url: `https://www.angellist.com/company/${slug}` },
      { label: 'Crunchbase', url: `https://www.crunchbase.com/organization/${slug}` },
      { label: 'PitchBook', url: `https://pitchbook.com/profiles/investor/${slug}` },
    ];
  };

  const handleAddToDirectory = async (companyName: string, investorName?: string) => {
    setAddingCompanies(prev => new Set(prev).add(companyName));
    try {
      if (investorName) {
        await onAddCompanyWithInvestor(companyName, investorName);
      } else {
        await onAddCompany(companyName);
      }
      setAddedCompanies(prev => new Set(prev).add(companyName));
    } finally {
      setAddingCompanies(prev => {
        const next = new Set(prev);
        next.delete(companyName);
        return next;
      });
    }
  };

  const portfolioSuggestions = useMemo(() => {
    if (!portfolioSearchTerm.trim() || !addingToPortfolioFor) return [];
    const inv = investors.find(i => i.name === addingToPortfolioFor);
    const existingIds = new Set(inv?.portfolio.map(c => c.id) || []);
    const q = portfolioSearchTerm.toLowerCase();
    return companies
      .filter(c => c.name.toLowerCase().includes(q) && !existingIds.has(c.id))
      .map(c => c.name)
      .slice(0, 8);
  }, [portfolioSearchTerm, addingToPortfolioFor, investors, companies]);

  const handleAddToPortfolio = async (companyName: string, investorName: string) => {
    setAddingCompanies(prev => new Set(prev).add(companyName));
    try {
      await onAddCompanyWithInvestor(companyName, investorName);
      setAddedCompanies(prev => new Set(prev).add(companyName));
    } finally {
      setAddingCompanies(prev => {
        const next = new Set(prev);
        next.delete(companyName);
        return next;
      });
    }
    setPortfolioSearchTerm('');
    setAddingToPortfolioFor(null);
    setShowPortfolioSuggestions(false);
  };

  const dismissLookupResults = () => {
    setLookupResults(null);
    setLookupInvestorLabel('');
    setNewInvestorName('');
    setNewInvestorUrl('');
    setShowPasteBox(false);
    setPastedContent('');
  };

  // Reusable discovered company card
  const DiscoveredCompanyCard: React.FC<{ company: DiscoveredPortfolioCompany; investorContext?: string }> = ({ company, investorContext }) => {
    const isAdding = addingCompanies.has(company.name);
    const isAdded = addedCompanies.has(company.name) || existingCompanyNames.some(n => n.toLowerCase() === company.name.toLowerCase());
    return (
      <div className="flex items-start justify-between gap-3 p-3 bg-white rounded-lg border border-amber-200">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 text-sm">{company.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{company.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className="text-[10px] font-medium bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
              {company.category}
            </span>
            {company.fundingStage && (
              <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                {company.fundingStage}
              </span>
            )}
            {company.investmentDate && (
              <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                {company.investmentDate}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {isAdded ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1.5 rounded-lg">
              <Check size={12} /> In Directory
            </span>
          ) : (
            <button
              onClick={() => handleAddToDirectory(company.name, investorContext)}
              disabled={isAdding}
              className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-white hover:bg-indigo-600 bg-indigo-50 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {isAdding ? 'Adding...' : 'Add'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp size={24} className="text-indigo-600" />
            Investors & VC
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Investment firms and their portfolio companies in the crypto/digital asset ecosystem
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-slate-200 -mb-2">
        <button
          onClick={() => setActiveInvestorTab('investors')}
          className={`py-3 px-1 mr-6 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeInvestorTab === 'investors' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <TrendingUp size={15} /> Investors
        </button>
        <button
          onClick={() => setActiveInvestorTab('news')}
          className={`py-3 px-1 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeInvestorTab === 'news' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Newspaper size={15} /> Investment News
          {combinedInvestorNews.length > 0 && (
            <span className="ml-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
              {combinedInvestorNews.length}
            </span>
          )}
        </button>
      </div>

      {activeInvestorTab === 'investors' && (<>

      {/* Add Investor Lookup */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-2">
          <UserPlus size={16} className="text-amber-600" /> Look Up an Investor
        </h3>
        <p className="text-xs text-amber-700 mb-3">
          Enter a fund name, or paste their portfolio page URL for smaller / regional VCs
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Fund name (e.g. Paradigm, 50 Partners, Arche Capital...)"
              value={newInvestorName}
              onChange={e => setNewInvestorName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleNewInvestorLookup()}
              className="flex-1 px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white placeholder-amber-400"
            />
            <button
              onClick={handleNewInvestorLookup}
              disabled={isLookingUp || (!newInvestorName.trim() && !newInvestorUrl.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 shrink-0"
            >
              {isLookingUp ? <Loader2 size={14} className="animate-spin" /> : <Telescope size={14} />}
              {isLookingUp ? 'Searching...' : 'Discover Portfolio'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Link size={14} className="text-amber-400 shrink-0" />
            <input
              type="text"
              placeholder="Portfolio page URL (optional) — e.g. https://50partners.com/portfolio"
              value={newInvestorUrl}
              onChange={e => setNewInvestorUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNewInvestorLookup()}
              className="flex-1 px-3 py-1.5 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white/70 placeholder-amber-300"
            />
          </div>
          <p className="text-[10px] text-amber-500">
            Tip: For lesser-known funds, pasting the portfolio/investments page URL gives much better results
          </p>
        </div>

        {/* Paste fallback — shown when URL fetch fails or name lookup returns nothing */}
        {showPasteBox && (
          <div className="mt-4 bg-orange-50 border border-orange-300 rounded-xl p-4">
            <p className="text-sm font-bold text-orange-900 mb-1">
              Could not automatically fetch portfolio data{lookupInvestorLabel ? ` for "${lookupInvestorLabel}"` : ''}
            </p>
            <p className="text-xs text-orange-700 mb-2">
              Visit one of these sources, copy the portfolio page content, and paste below:
            </p>

            {/* Suggested source links */}
            {lookupInvestorLabel && (
              <div className="flex flex-wrap gap-2 mb-3">
                {getSuggestedUrls(lookupInvestorLabel).map(s => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-white border border-orange-300 px-2.5 py-1 rounded-lg hover:bg-orange-100 transition-colors"
                  >
                    {s.label} <ExternalLink size={10} />
                  </a>
                ))}
                {newInvestorUrl && (
                  <a
                    href={normalizeUrl(newInvestorUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-white border border-orange-300 px-2.5 py-1 rounded-lg hover:bg-orange-100 transition-colors"
                  >
                    Fund Website <ExternalLink size={10} />
                  </a>
                )}
              </div>
            )}

            <textarea
              value={pastedContent}
              onChange={e => setPastedContent(e.target.value)}
              placeholder={"1. Click one of the links above to open the investor's portfolio page\n2. Select all (Ctrl+A / Cmd+A)\n3. Copy (Ctrl+C / Cmd+C)\n4. Paste here (Ctrl+V / Cmd+V)"}
              className="w-full h-36 px-3 py-2 text-xs border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white placeholder-orange-300 resize-y font-mono"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-orange-500">
                {pastedContent.length > 0 ? `${pastedContent.length} characters pasted` : 'Waiting for content...'}
              </p>
              <button
                onClick={handlePastedContentSubmit}
                disabled={isLookingUp || pastedContent.trim().length < 20}
                className="flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {isLookingUp ? <Loader2 size={12} className="animate-spin" /> : <Telescope size={12} />}
                {isLookingUp ? 'Analyzing...' : 'Extract Portfolio Companies'}
              </button>
            </div>
          </div>
        )}

        {/* Lookup results */}
        {lookupResults !== null && lookupResults.length > 0 && (
          <div className="mt-4 bg-white border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-900">
                Found {lookupResults.length} portfolio {lookupResults.length === 1 ? 'company' : 'companies'} for {lookupInvestorLabel}
              </p>
              <button onClick={dismissLookupResults} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {lookupResults.map(company => (
                <DiscoveredCompanyCard key={company.name} company={company} investorContext={lookupInvestorLabel} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CSV Import Link */}
      <button
        onClick={onNavigateToVCImport}
        className="w-full bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between hover:border-indigo-300 hover:shadow-sm transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
            <FileSpreadsheet size={20} className="text-indigo-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-900">Import VC Portfolio from CSV</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter a VC name and URL, then bulk-import their portfolio companies via CSV
            </p>
          </div>
        </div>
        <ArrowRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
      </button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Users size={18} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{investors.length}</p>
            <p className="text-xs text-slate-500">Unique Investors</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
            <Building2 size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{totalPortfolioCompanies}</p>
            <p className="text-xs text-slate-500">Companies with Funding Data</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
            <DollarSign size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">
              {investors.length > 0 ? (investors[0]?.portfolio.length ?? 0) : 0}
            </p>
            <p className="text-xs text-slate-500">Most Active Investor Portfolio</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search investors or portfolio companies..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          <button
            onClick={() => setSortBy('portfolio')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sortBy === 'portfolio' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            By Portfolio Size
          </button>
          <button
            onClick={() => setSortBy('alpha')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sortBy === 'alpha' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            A → Z
          </button>
        </div>
      </div>

      {/* Investor List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <TrendingUp size={40} className="mb-3 opacity-30" />
          <p className="font-medium">No investor data found</p>
          <p className="text-sm mt-1">
            {searchTerm
              ? 'Try a different search term'
              : 'Add funding information to companies to see investors here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inv => {
            const isExpanded = expandedInvestor === inv.name;
            const isDiscovering = discoveringFor === inv.name;
            const discovered = discoveredCompanies.get(inv.name);
            return (
              <div
                key={inv.name}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-shadow hover:shadow-md"
              >
                {/* Investor Row */}
                <button
                  onClick={() => toggleExpand(inv.name)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <img
                      src={`https://logo.clearbit.com/${getInvestorLogoDomain(inv.name)}`}
                      alt={inv.name}
                      className="w-10 h-10 rounded-lg bg-white border border-slate-200 object-contain p-0.5 shrink-0"
                      onError={(e) => handleLogoError(e, inv.name)}
                    />
                    <div>
                      <p className="font-semibold text-slate-900">{inv.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {inv.portfolio.length} portfolio{' '}
                        {inv.portfolio.length === 1 ? 'company' : 'companies'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Portfolio logo previews */}
                    <div className="flex -space-x-2 mr-2">
                      {inv.portfolio.slice(0, 5).map(c => (
                        <img
                          key={c.id}
                          src={c.logoPlaceholder}
                          alt={c.name}
                          title={c.name}
                          className="w-7 h-7 rounded-full border-2 border-white object-contain bg-slate-100"
                          onError={(e) => handleLogoError(e, c.name, c.website)}
                        />
                      ))}
                      {inv.portfolio.length > 5 && (
                        <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                          +{inv.portfolio.length - 5}
                        </div>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={18} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={18} className="text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Portfolio */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Portfolio Companies
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {inv.portfolio.map(company => (
                        <button
                          key={company.id}
                          onClick={() => onSelectCompany(company)}
                          className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200 text-left hover:border-indigo-300 hover:shadow-sm transition-all group"
                        >
                          <img
                            src={company.logoPlaceholder}
                            alt={company.name}
                            className="w-9 h-9 rounded-lg bg-white border border-slate-200 object-contain p-0.5 shrink-0 mt-0.5"
                            onError={(e) => handleLogoError(e, company.name, company.website)}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-sm truncate group-hover:text-indigo-700 transition-colors">
                              {company.name}
                            </p>
                            {company.funding && (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {company.funding.lastRound && (
                                  <span className="text-[10px] font-medium bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                    {company.funding.lastRound}
                                  </span>
                                )}
                                {company.funding.totalRaised && (
                                  <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                                    {company.funding.totalRaised}
                                  </span>
                                )}
                                {company.funding.valuation && (
                                  <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                    {company.funding.valuation} val.
                                  </span>
                                )}
                              </div>
                            )}
                            {company.headquarters && (
                              <p className="text-[10px] text-slate-400 mt-1 truncate">
                                {company.headquarters}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Add Company to Portfolio */}
                    <div className="mt-3">
                      {addingToPortfolioFor === inv.name ? (
                        <div className="relative flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              autoFocus
                              type="text"
                              value={portfolioSearchTerm}
                              onChange={e => { setPortfolioSearchTerm(e.target.value); setShowPortfolioSuggestions(true); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && portfolioSearchTerm.trim()) handleAddToPortfolio(portfolioSearchTerm, inv.name);
                                if (e.key === 'Escape') { setAddingToPortfolioFor(null); setPortfolioSearchTerm(''); }
                              }}
                              placeholder="Search company or type name..."
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                            {showPortfolioSuggestions && portfolioSuggestions.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 max-h-48 overflow-y-auto">
                                {portfolioSuggestions.map(name => (
                                  <button
                                    key={name}
                                    onClick={() => handleAddToPortfolio(name, inv.name)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                                  >
                                    <Building2 size={12} className="text-slate-400" />
                                    {name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => { if (portfolioSearchTerm.trim()) handleAddToPortfolio(portfolioSearchTerm, inv.name); }} className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 shrink-0">
                            Add
                          </button>
                          <button onClick={() => { setAddingToPortfolioFor(null); setPortfolioSearchTerm(''); setShowPortfolioSuggestions(false); }} className="p-2 text-slate-400 hover:text-slate-600 shrink-0">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddingToPortfolioFor(inv.name); setPortfolioSearchTerm(''); }}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          <Plus size={13} /> Add Company to Portfolio
                        </button>
                      )}
                    </div>

                    {/* Discover Other Investments */}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      {!discovered ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDiscoverPortfolio(inv.name); }}
                          disabled={isDiscovering}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-60"
                        >
                          {isDiscovering ? <Loader2 size={14} className="animate-spin" /> : <Telescope size={14} />}
                          {isDiscovering ? 'Searching for other investments...' : 'Discover Other Investments in Digital Assets'}
                        </button>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Telescope size={12} />
                            {discovered.length > 0
                              ? `${discovered.length} other ${discovered.length === 1 ? 'investment' : 'investments'} discovered`
                              : 'No other digital-asset investments found'}
                          </p>
                          {discovered.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {discovered.map(company => (
                                <DiscoveredCompanyCard key={company.name} company={company} investorContext={inv.name} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Investment News Feed */}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Newspaper size={12} /> Investment Activity
                        </p>
                        {investorNews.has(inv.name) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleScanAndMerge(inv.name, inv.portfolio.map(c => c.name)); }}
                            disabled={scanningNewsFor === inv.name}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-60"
                          >
                            <Search size={11} className={scanningNewsFor === inv.name ? 'animate-pulse' : ''} />
                            {scanningNewsFor === inv.name ? 'Scanning...' : 'Rescan'}
                          </button>
                        )}
                      </div>

                      {scanningNewsFor === inv.name && !investorNews.has(inv.name) ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                          <Loader2 size={14} className="animate-spin" />
                          Scanning for investment news...
                        </div>
                      ) : (investorNews.get(inv.name) || []).length === 0 && investorNews.has(inv.name) ? (
                        <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg bg-white">
                          <Newspaper size={24} className="mx-auto text-slate-300 mb-1" />
                          <p className="text-xs text-slate-400">No investment news found</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {(investorNews.get(inv.name) || []).map(item => {
                            const st = classifyNewsSourceType(item);
                            const colors: Record<NewsSourceType, string> = {
                              press: 'bg-blue-50 text-blue-700 border-blue-100',
                              press_release: 'bg-amber-50 text-amber-700 border-amber-100',
                              partnership: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                            };
                            const labels: Record<NewsSourceType, string> = { press: 'Press', press_release: 'Press Release', partnership: 'Partnership' };
                            return (
                              <div key={item.id} className="bg-white p-4 rounded-lg border border-slate-200 hover:shadow-sm transition-all">
                                <div className="flex justify-between items-start mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border ${colors[st]}`}>
                                      {labels[st]}
                                    </span>
                                    {item.source && !['Intelligence', 'Manual Entry'].includes(item.source) && (
                                      <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                        {item.source}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-slate-400 text-[10px] font-medium">{item.date}</span>
                                </div>
                                <h4 className="text-sm font-bold text-slate-900 mb-1">{item.title}</h4>
                                <p className="text-xs text-slate-600 leading-relaxed mb-2.5">{item.summary}</p>
                                <div className="flex items-center justify-between">
                                  {item.url && item.url !== '#' ? (
                                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline">
                                      Read Source <ExternalLink size={10} />
                                    </a>
                                  ) : <span />}
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleInvestorNewsVote(item.id, 'up')}
                                      className={`p-1 rounded-md transition-colors ${newsVotes[item.id] === 'up' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                      title="Relevant — show more like this"
                                    >
                                      <ThumbsUp size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleInvestorNewsVote(item.id, 'down')}
                                      className={`p-1 rounded-md transition-colors ${newsVotes[item.id] === 'down' ? 'bg-red-100 text-red-600' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                                      title="Not relevant — show fewer like this"
                                    >
                                      <ThumbsDown size={12} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      </>)} {/* end investors tab */}

      {/* Investment News Tab */}
      {activeInvestorTab === 'news' && (
        <div className="space-y-4 pt-2">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleScanAllInvestors}
                disabled={isScanningAll || investors.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {isScanningAll
                  ? <><Loader2 size={14} className="animate-spin" /> Scanning {scanQueueIndex + 1} of {scanQueue.length}...</>
                  : <><Search size={14} /> Scan All Investors</>
                }
              </button>
              {scannedInvestors.size > 0 && !isScanningAll && (
                <span className="text-xs text-slate-400">{scannedInvestors.size} of {investors.length} scanned</span>
              )}
            </div>
            {combinedInvestorNews.length > 0 && (
              <span className="text-xs text-slate-500 font-medium">{combinedInvestorNews.length} articles</span>
            )}
          </div>

          {/* Progress bar */}
          {isScanningAll && (
            <div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${scanQueue.length > 0 ? (scanQueueIndex / scanQueue.length) * 100 : 0}%` }}
                />
              </div>
              {scanningNewsFor && (
                <p className="text-[11px] text-slate-400 mt-1">Scanning {scanningNewsFor}...</p>
              )}
            </div>
          )}

          {/* Feed */}
          {isLoadingCombinedNews ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading investment news...
            </div>
          ) : combinedInvestorNews.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <Newspaper size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 font-medium text-sm">No investment news yet</p>
              <p className="text-slate-400 text-xs mt-1">Click "Scan All Investors" to fetch news across all funds</p>
            </div>
          ) : (
            <div className="space-y-4">
              {combinedInvestorNews.map(item => {
                const st = classifyNewsSourceType(item);
                const colors: Record<NewsSourceType, string> = {
                  press: 'bg-blue-50 text-blue-700 border-blue-100',
                  press_release: 'bg-amber-50 text-amber-700 border-amber-100',
                  partnership: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                };
                const labels: Record<NewsSourceType, string> = { press: 'Press', press_release: 'Press Release', partnership: 'Partnership' };

                // Known directory companies mentioned (excluding investor names themselves)
                const knownMentioned = item.relatedCompanies
                  .filter(rc => !investorNameSet.has(rc.toLowerCase()))
                  .map(rc => companies.find(c => c.name.toLowerCase() === rc.toLowerCase()))
                  .filter((c): c is Company => !!c);

                // Investor chips (from relatedCompanies)
                const investorChips = item.relatedCompanies.filter(rc => investorNameSet.has(rc.toLowerCase()));

                // Unknown company suggestions (detected lazily)
                const unknownNames = (unknownCompaniesInArticle.get(item.id) || []).filter(
                  name => !companies.some(c => c.name.toLowerCase() === name.toLowerCase())
                );
                const detectionRan = unknownCompaniesInArticle.has(item.id);
                const isDetecting = detectingUnknownFor.has(item.id);

                return (
                  <div key={item.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border ${colors[st]}`}>
                          {labels[st]}
                        </span>
                        {item.source && !['Intelligence', 'Manual Entry'].includes(item.source) && (
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase tracking-wide">
                            {item.source}
                          </span>
                        )}
                        {investorChips.map(rc => (
                          <span key={rc} className="text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded uppercase tracking-wide">
                            {rc}
                          </span>
                        ))}
                      </div>
                      <span className="text-slate-400 text-xs font-medium shrink-0 ml-2">{item.date}</span>
                    </div>

                    <h4 className="text-base font-bold text-slate-900 mb-1.5">{item.title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed mb-3">{item.summary}</p>

                    {/* Company chips */}
                    {(knownMentioned.length > 0 || unknownNames.length > 0 || !detectionRan) && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {knownMentioned.map(company => (
                          <button
                            key={company.id}
                            onClick={() => onSelectCompany(company)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
                            title="Open company profile"
                          >
                            <Building2 size={9} /> {company.name}
                          </button>
                        ))}
                        {unknownNames.map(name => {
                          const isAdding = addingCompanies.has(name);
                          const isAdded = addedCompanies.has(name);
                          return (
                            <button
                              key={name}
                              onClick={() => !isAdded && !isAdding && handleAddToDirectory(name)}
                              disabled={isAdding || isAdded}
                              className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full hover:bg-amber-100 transition-colors disabled:opacity-70"
                              title="Add to directory"
                            >
                              {isAdded ? <><Check size={9} /> {name}</> : isAdding ? <><Loader2 size={9} className="animate-spin" /> Adding...</> : <><Plus size={9} /> {name}</>}
                            </button>
                          );
                        })}
                        {!detectionRan && (
                          <button
                            onClick={() => handleDetectUnknownCompanies(item)}
                            disabled={isDetecting}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                            title="Detect unlisted companies mentioned in this article"
                          >
                            {isDetecting ? <Loader2 size={9} className="animate-spin" /> : <Search size={9} />}
                            {isDetecting ? 'Detecting...' : 'Detect companies'}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      {item.url && item.url !== '#' ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline">
                          Read Source <ExternalLink size={11} />
                        </a>
                      ) : <span />}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleInvestorNewsVote(item.id, 'up')}
                          className={`p-1.5 rounded-md transition-colors ${newsVotes[item.id] === 'up' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}
                          title="Relevant — show more like this"
                        >
                          <ThumbsUp size={13} />
                        </button>
                        <button
                          onClick={() => handleInvestorNewsVote(item.id, 'down')}
                          className={`p-1.5 rounded-md transition-colors ${newsVotes[item.id] === 'down' ? 'bg-red-100 text-red-600' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                          title="Not relevant — show fewer like this"
                        >
                          <ThumbsDown size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Investors;
