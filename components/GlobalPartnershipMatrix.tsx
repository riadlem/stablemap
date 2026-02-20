
import React, { useMemo, useState, useEffect } from 'react';
import { Company, FortuneGlobal500Company, Global500ResearchData, NewsItem, Fortune500Company } from '../types';
import { FORTUNE_GLOBAL_500_CSV } from '../data/fortuneGlobal500Raw';
import { FORTUNE_500_CSV } from '../data/fortune500Raw';
import { Search, Building, Filter, CircleCheck, CircleSlash, ArrowRight, Sparkles, RefreshCw, X, ExternalLink, Globe, FileText, Newspaper, MapPin, Flag, Telescope } from 'lucide-react';
import { researchCompanyActivity } from "../services/claudeService";
import { db } from '../services/db';
import GlobalCompanyDetail from './GlobalCompanyDetail';

interface GlobalPartnershipMatrixProps {
  companies: Company[];
}

// Map common names/tickers to Fortune 500 Global official names
const GLOBAL_ALIAS_MAP: Record<string, string> = {
  'Alphabet': 'Alphabet',
  'Google': 'Alphabet',
  'Meta': 'Meta Platforms',
  'Facebook': 'Meta Platforms',
  'Samsung': 'Samsung Electronics',
  'Saudi Aramco': 'Saudi Aramco',
  'Aramco': 'Saudi Aramco',
  'State Grid': 'State Grid',
  'Sinopec': 'Sinopec Group',
  'Volkswagen': 'Volkswagen',
  'VW': 'Volkswagen',
  'Shell': 'Shell',
  'Toyota': 'Toyota Motor',
  'BP': 'BP',
  'TotalEnergies': 'TotalEnergies',
  'Total': 'TotalEnergies',
  'Glencore': 'Glencore',
  'Microsoft': 'Microsoft',
  'Stellantis': 'Stellantis',
  'Ford': 'Ford Motor',
  'BMW': 'BMW Group',
  'BMW Group': 'BMW Group',
  'Mercedes': 'Mercedes-Benz Group',
  'Mercedes-Benz': 'Mercedes-Benz Group',
  'Sony': 'Sony',
  'Allianz': 'Allianz',
  'AXA': 'AXA',
  'Santander': 'Banco Santander',
  'Banco Santander': 'Banco Santander',
  'BNP Paribas': 'BNP Paribas',
  'Mitsubishi': 'Mitsubishi',
  'Siemens': 'Siemens',
  'Bosch': 'Bosch Group',
  'Tencent': 'Tencent Holdings',
  'Alibaba': 'Alibaba Group',
  'SoftBank': 'SoftBank Group',
  'Generali': 'Assicurazioni Generali',
  'Lenovo': 'Lenovo Group',
  'Maersk': 'Maersk Group',
  'LG': 'LG Electronics',
  'Panasonic': 'Panasonic Holdings',
  'Airbus': 'Airbus',
  'UBS': 'UBS Group',
  'Deutsche Bank': 'Deutsche Bank',
  'Societe Generale': 'Societe Generale',
  'Barclays': 'Barclays',
  'ING': 'ING Group',
  'Credit Agricole': 'Credit Agricole',
  'ANZ': 'ANZ Group Holdings',
  'NAB': 'National Australia Bank',
  'Trafigura': 'Trafigura Group',
  'Nestle': 'Nestle',
  'Honda': 'Honda Motor',
  'JPMorgan': 'JPMorgan Chase',
  'J.P. Morgan': 'JPMorgan Chase',
  'JP Morgan': 'JPMorgan Chase',
  'JPMorgan Chase': 'JPMorgan Chase',
  'Goldman Sachs': 'Goldman Sachs Group',
  'Morgan Stanley': 'Morgan Stanley',
  'Citi': 'Citigroup',
  'Citigroup': 'Citigroup',
  'Bank of America': 'Bank of America',
  'BlackRock': 'BlackRock',
  'Fiserv': 'Fiserv',
  'PayPal': 'PayPal Holdings'
};

// Hardcoded Domain Overrides for difficult Global 500 Logos
export const LOGO_DOMAIN_OVERRIDES: Record<string, string> = {
  'Santander': 'santander.com',
  'Banco Santander': 'santander.com',
  'State Grid': 'sgcc.com.cn',
  'Sinopec Group': 'sinopec.com',
  'China National Petroleum': 'cnpc.com.cn',
  'Saudi Aramco': 'aramco.com',
  'Toyota Motor': 'toyota.com',
  'Volkswagen': 'volkswagen.com',
  'Samsung Electronics': 'samsung.com',
  'Hon Hai Precision Industry': 'foxconn.com',
  'Trafigura Group': 'trafigura.com',
  'Glencore': 'glencore.com',
  'Ping An Insurance': 'pingan.com',
  'TotalEnergies': 'totalenergies.com',
  'Stellantis': 'stellantis.com',
  'BMW Group': 'bmwgroup.com',
  'Mercedes-Benz Group': 'mercedes-benz.com',
  'Allianz': 'allianz.com',
  'BNP Paribas': 'bnpparibas.com',
  'Generali': 'generali.com',
  'Assicurazioni Generali': 'generali.com',
  'AXA': 'axa.com',
  'China Construction Bank': 'ccb.com',
  'Agricultural Bank of China': 'abchina.com',
  'Bank of China': 'boc.cn',
  'Industrial & Commercial Bank of China': 'icbc.com.cn',
  'China Life Insurance': 'chinalife.com.cn',
  'China Mobile Communications': '10086.cn',
  'Sony': 'sony.com',
  'Panasonic Holdings': 'panasonic.com',
  'Hitachi': 'hitachi.com',
  'Tencent Holdings': 'tencent.com',
  'Alibaba Group': 'alibabagroup.com',
  'Nestle': 'nestle.com',
  'Bosch Group': 'bosch.com',
  'Roche Group': 'roche.com',
  'Novartis': 'novartis.com',
  'Maersk Group': 'maersk.com',
  'Equinor': 'equinor.com',
  'Enel': 'enel.com',
  'Petrobras': 'petrobras.com.br',
  'Gazprom': 'gazprom.ru',
  'Lukoil': 'lukoil.com',
  'Engie': 'engie.com',
  'Electricite de France': 'edf.fr',
  'UBS Group': 'ubs.com',
  'Deutsche Bank': 'db.com',
  'Credit Agricole': 'credit-agricole.com',
  'Societe Generale': 'societegenerale.com',
  'ING Group': 'ing.com',
  'Lloyds Banking Group': 'lloydsbankinggroup.com',
  'Barclays': 'barclays.com',
  'Itochu': 'itochu.co.jp',
  'Mitsubishi': 'mitsubishicorp.com',
  'Mitsui': 'mitsui.com',
  'Sumitomo': 'sumitomocorp.com',
  'Marubeni': 'marubeni.com',
  'JD.com': 'jd.com',
  'China State Construction Engineering': 'cscec.com',
  'Jardine Matheson': 'jardines.com',
  'SoftBank Group': 'group.softbank',
  'Nippon Telegraph and Telephone': 'group.ntt',
  'China Railway Engineering Group': 'crec.cn',
  'China Railway Construction': 'crcc.cn',
  'AmerisourceBergen': 'cencora.com',
  'Cencora': 'cencora.com'
};

// Helper: Parse CSV Line Robustly
const parseCSVLine = (text: string): string[] => {
  const result: string[] = [];
  let start = 0;
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(text.substring(start, i));
      start = i + 1;
    }
  }
  result.push(text.substring(start));
  
  return result.map(s => {
    const trimmed = s.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
  });
};

// Helper: Parse Global CSV
const parseGlobalFortune500 = (csv: string): FortuneGlobal500Company[] => {
  const lines = csv.trim().split('\n');
  const result: FortuneGlobal500Company[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const row = parseCSVLine(line);
    const name = row[1] || '';
    if (name) {
      result.push({
        rank: parseInt(row[0] || '0', 10),
        name,
        revenueStr: row[2] || '$0',
        revenuePercentChange: row[3] || '0%',
        profitsStr: row[4] || '$0',
        profitsPercentChange: row[5] || '0%',
        assetsStr: row[6] || '$0',
        employees: parseInt((row[7] || '0').replace(/,/g, ''), 10),
        changeInRank: row[8] || '-',
        yearsOnList: parseInt(row[9] || '0', 10),
        listSource: 'Global'
      });
    }
  }
  return result;
};

// Helper: Parse USA CSV
const parseUSA500 = (csv: string): Fortune500Company[] => {
  const lines = csv.trim().split('\n');
  const result: Fortune500Company[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const row = parseCSVLine(line);
    const name = row[1] || '';
    if (name) {
      result.push({
        rank: parseInt(row[0] || '0', 10),
        name,
        industry: row[2] || '',
        city: row[3] || '',
        state: row[4] || '',
        website: row[6] || '',
        employees: parseInt((row[7] || '0').replace(/,/g, ''), 10), 
        revenue: parseInt((row[8] || '0').replace(/[$,]/g, ''), 10),
        revenueStr: row[8] || '$0',
        ceo: row[9] || ''
      });
    }
  }
  return result;
};

// Helper: Convert revenue string to number for sorting
const getRevenueValue = (company: FortuneGlobal500Company): number => {
    if (!company.revenueStr) return 0;
    const clean = company.revenueStr.replace(/[$,]/g, '');
    let val = parseFloat(clean);
    if (isNaN(val)) return 0;
    
    // Global list is in Millions ($M). USA list is full number.
    if (company.listSource === 'Global' || company.listSource === 'Both') {
        return val * 1000000;
    }
    return val;
};

// Helper: robust logo domain extraction
const getLogoDomain = (item: FortuneGlobal500Company) => {
    // 0. Check Overrides
    if (LOGO_DOMAIN_OVERRIDES[item.name]) {
        return LOGO_DOMAIN_OVERRIDES[item.name];
    }

    // 1. Try website from data
    if (item.website) {
        try {
            const url = item.website.startsWith('http') ? item.website : `https://${item.website}`;
            return new URL(url).hostname;
        } catch (e) { /* ignore */ }
    }
    
    // 2. Fallback: Guess based on name with better cleaning
    const cleanName = item.name
        .replace(/ Group/i, '')
        .replace(/ Holdings/i, '')
        .replace(/ Corporation/i, '')
        .replace(/ Limited/i, '')
        .replace(/ Company/i, '')
        .replace(/ Inc/i, '')
        .replace(/&/g, 'and');

    // Strip special chars, spaces, make lowercase. e.g. "BNP Paribas" -> "bnpparibas.com"
    return `${cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}.com`;
};

const GlobalPartnershipMatrix: React.FC<GlobalPartnershipMatrixProps> = ({ companies }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Strategic' | 'Exploring' | 'Evaluating'>('All');
  
  // Selection & Research State
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [researchingId, setResearchingId] = useState<string | null>(null);
  
  // Data State
  const [storedActivity, setStoredActivity] = useState<Record<string, Global500ResearchData>>({});
  const [globalNews, setGlobalNews] = useState<NewsItem[]>([]);

  // 1. Parse CSVs (Memoized)
  const global500Data = useMemo(() => parseGlobalFortune500(FORTUNE_GLOBAL_500_CSV), []);
  const usa500Data = useMemo(() => parseUSA500(FORTUNE_500_CSV), []);

  // 2. Load Stored Data on Mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [activity, news] = await Promise.all([
            db.getGlobalActivity(),
            db.getNews()
        ]);
        setStoredActivity(activity);
        setGlobalNews(news);
      } catch (e) {
        console.error("Failed to load global data", e);
      }
    };
    loadData();
  }, []);

  // 3. Link Data (Merge Global + USA into Unified List)
  const linkedData = useMemo(() => {
    // A. Create Map of USA 500 data for matching
    const usaMap = new Map<string, Fortune500Company>();
    usa500Data.forEach(c => usaMap.set(c.name, c));

    // B. Build Unified List
    // Start with Global 500
    const unifiedList: FortuneGlobal500Company[] = global500Data.map(g => {
        // Check for USA match
        const usaMatch = usaMap.get(g.name);
        
        return {
            ...g,
            listSource: usaMatch ? 'Both' : 'Global',
            industry: usaMatch?.industry,
            ceo: usaMatch?.ceo,
            website: usaMatch?.website,
            hqLocation: usaMatch ? `${usaMatch.city}, ${usaMatch.state}` : undefined,
        };
    });

    // Track which USA companies are already covered
    const coveredNames = new Set(unifiedList.map(c => c.name));

    // Add USA-only companies
    usa500Data.forEach(u => {
        if (!coveredNames.has(u.name)) {
            unifiedList.push({
                rank: u.rank, // USA Rank
                name: u.name,
                revenueStr: u.revenueStr,
                revenuePercentChange: '-',
                profitsStr: '-',
                profitsPercentChange: '-',
                assetsStr: '-',
                employees: u.employees,
                changeInRank: '-',
                yearsOnList: 0,
                listSource: 'USA',
                industry: u.industry,
                ceo: u.ceo,
                website: u.website,
                hqLocation: `${u.city}, ${u.state}`,
            });
        }
    });

    // C. Create partnership map using Unified List names
    const partnerships = new Map<string, { cryptoCompany: string, description: string }[]>();

    companies.forEach(cryptoComp => {
      cryptoComp.partners.forEach(p => {
        // Match against Unified List
        let targetName = p.name;
        if (GLOBAL_ALIAS_MAP[p.name]) targetName = GLOBAL_ALIAS_MAP[p.name];
        
        let matchedName = '';

        // 1. Exact Match
        if (unifiedList.find(f => f.name === targetName)) {
            matchedName = targetName;
        } 
        // 2. Fuzzy Match
        else {
            const potential = unifiedList.find(f => f.name.includes(targetName) || targetName.includes(f.name));
            if (potential) {
                matchedName = potential.name;
            }
        }

        if (matchedName) {
          const existing = partnerships.get(matchedName) || [];
          if (!existing.some(e => e.cryptoCompany === cryptoComp.name)) {
             existing.push({ cryptoCompany: cryptoComp.name, description: p.description });
             partnerships.set(matchedName, existing);
          }
        }
      });
    });

    // D. Final Merge with Partnerships, Research, News
    const finalData = unifiedList.map(f => {
      // 1. Partnerships
      const directoryPartners = partnerships.get(f.name) || [];
      
      // 2. Research (Keyed by Name to avoid Rank collision between lists)
      const research = storedActivity[f.name] || storedActivity[f.rank.toString()]; // Fallback for old data
      
      // 3. News
      const newsMentions = globalNews.filter(n => 
         n.title.includes(f.name) || 
         (n.relatedCompanies && n.relatedCompanies.some(rc => rc.includes(f.name) || f.name.includes(rc)))
      );

      return {
        ...f,
        activePartnerships: directoryPartners,
        researchData: research,
        newsMentions: newsMentions
      };
    });

    // Sort by Revenue (Desc)
    return finalData.sort((a, b) => getRevenueValue(b) - getRevenueValue(a));

  }, [global500Data, usa500Data, companies, storedActivity, globalNews]);

  // 4. Filter Logic
  const filteredList = linkedData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.industry && item.industry.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Status Determination for Filter
    const hasPartnerships = item.activePartnerships && item.activePartnerships.length > 0;
    const hasActivity = (item.researchData && item.researchData.initiatives.length > 0) || 
                        (item.newsMentions && item.newsMentions.length > 0);
    
    let itemStatus = 'Evaluating';
    if (hasPartnerships) itemStatus = 'Strategic';
    else if (hasActivity) itemStatus = 'Exploring';

    const matchesStatus = statusFilter === 'All' || itemStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // 5. Stats
  const strategicCount = linkedData.filter(i => i.activePartnerships && i.activePartnerships.length > 0).length;
  const exploringCount = linkedData.filter(i => !i.activePartnerships?.length && ((i.researchData?.initiatives?.length ?? 0) > 0 || (i.newsMentions?.length ?? 0) > 0)).length;
  
  const penetrationRate = (((strategicCount + exploringCount) / linkedData.length) * 100).toFixed(1);

  // 6. Research Handler
  const handleResearch = async (companyName: string, rank: number) => {
    setResearchingId(companyName);
    try {
        const result = await researchCompanyActivity(companyName);
        
        // --- MERGE LOGIC ---
        const existing = storedActivity[companyName];
        let finalInitiatives = result.initiatives;

        if (existing && existing.initiatives) {
            const newTitles = new Set(result.initiatives.map(i => i.title));
            const oldToKeep = existing.initiatives.filter(i => !newTitles.has(i.title));
            finalInitiatives = [...result.initiatives, ...oldToKeep];
        }

        const activityRecord: Global500ResearchData = {
            rank: rank,
            companyName: companyName,
            summary: result.summary,
            initiatives: finalInitiatives,
            lastUpdated: Date.now()
        };

        setStoredActivity(prev => ({
            ...prev,
            [companyName]: activityRecord
        }));
        
        // Save to DB
        await db.saveGlobalActivity(activityRecord);

        if (result.initiatives.length > 0) {
            const newsItems: NewsItem[] = result.initiatives.map((init, idx) => ({
                id: `res-${rank}-${Date.now()}-${idx}`,
                title: `${companyName}: ${init.title}`,
                date: init.date || new Date().toISOString().split('T')[0],
                source: 'AI Research',
                summary: init.description,
                url: init.sourceUrl || '#',
                relatedCompanies: [companyName, 'Fortune 500']
            }));
            await db.saveNews(newsItems);
            const updatedNews = await db.getNews();
            setGlobalNews(updatedNews);
        }

    } catch (e) {
        console.error(e);
        alert("Research failed. Check console.");
    }
    setResearchingId(null);
  };

  const handleManualNewsAdd = async (companyName: string, news: { title: string; url: string; date: string; summary: string }) => {
      const newItem: NewsItem = {
          id: `manual-news-${Date.now()}`,
          title: news.title,
          url: news.url,
          date: news.date,
          summary: news.summary,
          source: 'Manual Entry',
          relatedCompanies: [companyName]
      };

      try {
          await db.saveNews([newItem]);
          // Refresh news list
          const updatedNews = await db.getNews();
          setGlobalNews(updatedNews);
      } catch (e) {
          console.error("Failed to save news", e);
          alert("Failed to save news.");
      }
  };

  // 7. Render Selected Company View
  const selectedCompany = selectedCompanyId ? linkedData.find(c => c.name === selectedCompanyId) : null;

  if (selectedCompany) {
      return (
          <GlobalCompanyDetail 
            company={selectedCompany} 
            onBack={() => setSelectedCompanyId(null)}
            onResearch={handleResearch}
            isResearching={researchingId === selectedCompany.name}
            onAddNews={handleManualNewsAdd}
          />
      );
  }

  // 8. Render Matrix Table
  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
         <div>
            <h2 className="text-2xl font-bold text-slate-900">Global Enterprise Intelligence</h2>
            <p className="text-slate-500 text-sm mt-1">
              Unified tracking of Fortune 500 Global & USA giants in the digital asset space.
            </p>
         </div>
         <div className="flex gap-8 text-center">
            <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
               <div className="text-3xl font-bold text-emerald-600">{strategicCount}</div>
               <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Strategic Partners</div>
            </div>
            <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
               <div className="text-3xl font-bold text-blue-600">{exploringCount}</div>
               <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Exploring</div>
            </div>
            <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
               <div className="text-3xl font-bold text-slate-900">{penetrationRate}%</div>
               <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Adoption Rate</div>
            </div>
         </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search enterprises (Walmart, Fiserv, Tencent...)" 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          <button 
            onClick={() => setStatusFilter('All')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${statusFilter === 'All' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            All
          </button>
          <button 
            onClick={() => setStatusFilter('Strategic')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${statusFilter === 'Strategic' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Strategic
          </button>
          <button 
            onClick={() => setStatusFilter('Exploring')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${statusFilter === 'Exploring' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Exploring
          </button>
          <button 
            onClick={() => setStatusFilter('Evaluating')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${statusFilter === 'Evaluating' ? 'bg-slate-300 text-slate-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Evaluating
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase font-black tracking-widest">
                <th className="p-4 w-24">Rank</th>
                <th className="p-4">Enterprise</th>
                <th className="p-4">Revenue</th>
                <th className="p-4">Status</th>
                <th className="p-4">Blockchain Activity</th>
                <th className="p-4 text-center">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                   <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">No enterprises found matching your criteria.</td>
                </tr>
              ) : (
                filteredList.map(item => {
                  const hasDirectoryPartners = item.activePartnerships && item.activePartnerships.length > 0;
                  const hasResearchInitiatives = item.researchData && item.researchData.initiatives.length > 0;
                  const hasNews = item.newsMentions && item.newsMentions.length > 0;
                  
                  // Status Logic
                  let status: 'Strategic' | 'Exploring' | 'Evaluating' = 'Evaluating';
                  if (hasDirectoryPartners) status = 'Strategic';
                  else if (hasResearchInitiatives || hasNews) status = 'Exploring';

                  const logoDomain = getLogoDomain(item);

                  return (
                    <tr 
                        key={`${item.listSource}-${item.rank}-${item.name}`} 
                        className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedCompanyId(item.name)}
                    >
                      <td className="p-4">
                          <div className="flex flex-col gap-1">
                              <span className="font-mono text-slate-500 text-xs font-bold">#{item.rank}</span>
                              {item.listSource === 'Global' && <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Global</span>}
                              {item.listSource === 'USA' && <span className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">USA</span>}
                              {item.listSource === 'Both' && <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Global</span>}
                          </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 p-0.5 shadow-sm overflow-hidden flex items-center justify-center">
                              <img 
                                src={`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${logoDomain}&size=128`} 
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (!target.src.includes('ui-avatars.com')) {
                                      target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=f8fafc&color=64748b&size=128`;
                                  }
                                }}
                              />
                          </div>
                          <div>
                              <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                                {item.name}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                                    <Globe size={10} className="text-slate-400" /> {item.employees.toLocaleString()} employees
                                    {item.hqLocation && <span>• {item.hqLocation}</span>}
                                </div>
                                {item.industry && (
                                  <div className="text-[9px] text-indigo-500 font-bold uppercase tracking-wider">
                                    {item.industry}
                                  </div>
                                )}
                              </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs text-slate-600 font-mono">{item.revenueStr}</td>
                      <td className="p-4">
                        {status === 'Strategic' && (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 uppercase tracking-tighter">
                            <CircleCheck size={12} /> Strategic
                          </div>
                        )}
                        {status === 'Exploring' && (
                          <div className="inline-flex items-center gap-1.5 text-blue-700 font-bold text-[10px] bg-blue-50 px-2 py-1 rounded-full border border-blue-100 uppercase tracking-tighter">
                            <Telescope size={12} /> Exploring
                          </div>
                        )}
                        {status === 'Evaluating' && (
                          <div className="inline-flex items-center gap-1.5 text-slate-400 font-bold text-[10px] bg-slate-50 px-2 py-1 rounded-full border border-slate-100 uppercase tracking-tighter">
                            <CircleSlash size={12} /> Evaluating
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-sm">
                        <div className="space-y-2">
                          {/* Directory Partnerships */}
                          {hasDirectoryPartners && item.activePartnerships?.slice(0, 1).map((p, idx) => (
                            <div key={`dir-${idx}`} className="bg-white border border-indigo-100 p-2 rounded-lg shadow-sm">
                              <span className="font-black text-indigo-700 block text-[9px] mb-0.5 uppercase tracking-wider">{p.cryptoCompany}</span>
                              <span className="text-slate-700 text-[10px] leading-tight font-medium line-clamp-1">{p.description}</span>
                            </div>
                          ))}
                          
                          {/* Research Initiatives (Top 1 only to save space) */}
                          {hasResearchInitiatives && (
                             <div className="bg-white border border-blue-100 p-2 rounded-lg shadow-sm">
                                <span className="font-black text-blue-700 block text-[9px] mb-0.5 uppercase tracking-wider">AI Insight</span>
                                <span className="text-slate-700 text-[10px] leading-tight font-medium line-clamp-1">{item.researchData?.initiatives[0].title}</span>
                             </div>
                          )}

                          {/* News Mentions */}
                          {!hasResearchInitiatives && hasNews && (
                             <div className="bg-white border border-blue-100 p-2 rounded-lg shadow-sm">
                                <span className="font-black text-blue-700 block text-[9px] mb-0.5 uppercase tracking-wider flex items-center gap-1">
                                    <Newspaper size={8} /> Media Coverage
                                </span>
                                <span className="text-slate-700 text-[10px] leading-tight font-medium line-clamp-1">{item.newsMentions?.[0].title}</span>
                             </div>
                          )}

                          {status === 'Evaluating' && (
                            <span className="text-slate-400 text-[10px] italic font-medium">No documented public chain initiatives.</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                          <button 
                            className={`p-2 rounded-full transition-all group-hover:scale-110 shadow-sm border ${status !== 'Evaluating' ? 'bg-white border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white' : 'bg-white border-slate-100 text-slate-400 hover:bg-indigo-600 hover:text-white'}`}
                            onClick={(e) => { e.stopPropagation(); setSelectedCompanyId(item.name); }}
                          >
                             <ArrowRight size={16} />
                          </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
          Intelligence report covering {linkedData.length} Global & USA Enterprises
        </div>
      </div>
    </div>
  );
};

export default GlobalPartnershipMatrix;
