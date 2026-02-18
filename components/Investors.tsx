import React, { useMemo, useState } from 'react';
import { Search, TrendingUp, ChevronDown, ChevronUp, Building2, DollarSign, Users, Plus, Loader2, Telescope, Check, X, UserPlus, Link, ExternalLink, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { Company } from '../types';
import { lookupInvestorPortfolio, lookupInvestorPortfolioFromUrl, extractPortfolioFromText, DiscoveredPortfolioCompany } from '../services/claudeService';

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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Investors;
