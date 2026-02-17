
import React, { useMemo, useState } from 'react';
import { Company, Fortune500Company } from '../types';
import { FORTUNE_500_CSV } from '../data/fortune500Raw';
import { Search, Building, Filter, CircleCheck, CircleSlash, ArrowRight } from 'lucide-react';

interface PartnershipMatrixProps {
  companies: Company[];
}

// Map common names/tickers to Fortune 500 official names
const ALIAS_MAP: Record<string, string> = {
  'Google': 'Alphabet',
  'Facebook': 'Meta',
  'Meta Platforms': 'Meta Platforms',
  'J.P. Morgan': 'JPMorgan Chase',
  'JP Morgan': 'JPMorgan Chase',
  'Chase': 'JPMorgan Chase',
  'Bank of America Merrill Lynch': 'Bank of America',
  'Citi': 'Citi',
  'Citigroup': 'Citi',
  'Goldman': 'Goldman Sachs',
  'Morgan Stanley': 'Morgan Stanley',
  'Wells Fargo': 'Wells Fargo',
  'BlackRock': 'BlackRock',
  'BNY Mellon': 'Bank of New York',
  'BNY': 'Bank of New York',
  'State Street': 'State Street',
  'PayPal': 'PayPal',
  'Visa': 'Visa',
  'Mastercard': 'Mastercard',
  'Amazon': 'Amazon',
  'Microsoft': 'Microsoft',
  'Stripe': 'Stripe',
  'Shopify': 'Shopify',
  'Coinbase': 'Coinbase Global',
  'Robinhood': 'Robinhood Markets'
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

// Helper: Parse CSV
const parseFortune500 = (csv: string): Fortune500Company[] => {
  const lines = csv.trim().split('\n');
  const result: Fortune500Company[] = [];

  // Skip header (index 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const row = parseCSVLine(line);
    
    // CSV Columns: Rank,Company,Industry,City,State,Zip Code,Website,Employees,Revenue (rounded),CEO
    const rank = parseInt(row[0] || '0', 10);
    const name = row[1] || '';
    const industry = row[2] || '';
    const city = row[3] || '';
    const state = row[4] || '';
    const website = row[6] || '';
    const employeesStr = (row[7] || '0').replace(/,/g, '');
    const employees = parseInt(employeesStr, 10);
    const revenueStr = row[8] || '$0';
    const revenueVal = parseInt(revenueStr.replace(/[$,]/g, ''), 10);
    const ceo = row[9] || '';

    if (name) {
      result.push({
        rank,
        name,
        industry,
        city,
        state,
        website,
        employees,
        revenue: revenueVal,
        revenueStr,
        ceo
      });
    }
  }
  return result;
};

const PartnershipMatrix: React.FC<PartnershipMatrixProps> = ({ companies }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');

  // 1. Parse CSV (Memoized)
  const fortune500Data = useMemo(() => parseFortune500(FORTUNE_500_CSV), []);

  // 2. Link Data (Compute Active Partnerships)
  const linkedData = useMemo(() => {
    // Create a map of F500 Name -> Array of Crypto Partners
    const partnerships = new Map<string, { cryptoCompany: string, description: string }[]>();

    companies.forEach(cryptoComp => {
      cryptoComp.partners.forEach(p => {
        // MATCHING LOGIC: Auto-detect based on name existence in USA list
        
        let targetName = p.name;
        if (ALIAS_MAP[p.name]) targetName = ALIAS_MAP[p.name];
        
        let matched = false;

        // 1. Exact Match via Alias
        if (fortune500Data.find(f => f.name === targetName)) {
            matched = true;
        } 
        // 2. Fuzzy Match
        else {
            const potential = fortune500Data.find(f => f.name.includes(targetName) || targetName.includes(f.name));
            if (potential) {
                targetName = potential.name;
                matched = true;
            }
        }

        if (matched) {
          const existing = partnerships.get(targetName) || [];
          if (!existing.some(e => e.cryptoCompany === cryptoComp.name)) {
             existing.push({ cryptoCompany: cryptoComp.name, description: p.description });
             partnerships.set(targetName, existing);
          }
        }
      });
    });

    return fortune500Data.map(f => ({
      ...f,
      activePartnerships: partnerships.get(f.name) || []
    }));
  }, [fortune500Data, companies]);

  // 3. Extract Industries for Filter
  const industries = useMemo(() => {
    const s = new Set(fortune500Data.map(f => f.industry));
    return ['All', ...Array.from(s).sort()];
  }, [fortune500Data]);

  // 4. Filter Logic
  const filteredList = linkedData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.industry.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIndustry = industryFilter === 'All' || item.industry === industryFilter;
    const matchesStatus = statusFilter === 'All' || 
                          (statusFilter === 'Active' && item.activePartnerships.length > 0) ||
                          (statusFilter === 'Inactive' && item.activePartnerships.length === 0);

    return matchesSearch && matchesIndustry && matchesStatus;
  });

  // 5. Stats
  const activeCount = linkedData.filter(i => i.activePartnerships.length > 0).length;
  const penetrationRate = ((activeCount / linkedData.length) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
         <div>
            <h2 className="text-2xl font-bold text-slate-900">Fortune 500 USA Digital Asset Map</h2>
            <p className="text-slate-500 text-sm mt-1">
              Tracking stablecoin & crypto adoption across the US economy.
            </p>
         </div>
         <div className="flex gap-8 text-center">
            <div>
               <div className="text-3xl font-bold text-indigo-600">{activeCount}</div>
               <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Active Companies</div>
            </div>
            <div>
               <div className="text-3xl font-bold text-slate-900">{penetrationRate}%</div>
               <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Penetration</div>
            </div>
            <div>
               <div className="text-3xl font-bold text-slate-400">{linkedData.length}</div>
               <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Tracked</div>
            </div>
         </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search companies, industries..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <select 
          className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
        >
          {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
        </select>

        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
          <button 
            onClick={() => setStatusFilter('All')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${statusFilter === 'All' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            All
          </button>
          <button 
            onClick={() => setStatusFilter('Active')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${statusFilter === 'Active' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Active
          </button>
          <button 
            onClick={() => setStatusFilter('Inactive')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${statusFilter === 'Inactive' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-semibold">
                <th className="p-4 w-16">Rank</th>
                <th className="p-4">Company</th>
                <th className="p-4">Industry</th>
                <th className="p-4">Revenue</th>
                <th className="p-4">Status</th>
                <th className="p-4 w-1/3">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                   <td colSpan={6} className="p-8 text-center text-slate-500">No companies found matching your criteria.</td>
                </tr>
              ) : (
                filteredList.map(item => (
                  <tr key={item.rank} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4 font-mono text-slate-400 text-sm">{item.rank}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                         <img 
                           src={`https://logo.clearbit.com/${item.website}`} 
                           alt={item.name}
                           loading="lazy"
                           className="w-10 h-10 rounded-lg bg-white border border-slate-200 object-contain p-0.5"
                           onError={(e) => {
                             const target = e.target as HTMLImageElement;
                             const googleFavicon = `https://www.google.com/s2/favicons?domain=${item.website}&sz=128`;
                             if (target.src !== googleFavicon) {
                                target.src = googleFavicon;
                             } else {
                                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=f8fafc&color=64748b&size=128`;
                             }
                           }}
                         />
                         <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              {item.name}
                              {item.website && (
                                <a href={`https://${item.website}`} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <ArrowRight size={12} />
                                </a>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{item.city}, {item.state}</div>
                         </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      <span className="bg-slate-100 px-2 py-1 rounded-full text-xs">{item.industry}</span>
                    </td>
                    <td className="p-4 text-sm text-slate-600 font-mono">{item.revenueStr}</td>
                    <td className="p-4">
                      {item.activePartnerships.length > 0 ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-sm">
                          <CircleCheck size={16} /> Active
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                          <CircleSlash size={16} /> None
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm">
                      {item.activePartnerships.length > 0 ? (
                        <div className="space-y-2">
                          {item.activePartnerships.map((p, idx) => (
                            <div key={idx} className="bg-indigo-50 border border-indigo-100 p-2 rounded-lg">
                              <span className="font-semibold text-indigo-700 block text-xs mb-0.5">{p.cryptoCompany}</span>
                              <span className="text-slate-700 text-xs leading-snug">{p.description}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">No public blockchain initiatives tracked.</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
          Showing {filteredList.length} of {linkedData.length} companies
        </div>
      </div>
    </div>
  );
};

export default PartnershipMatrix;
