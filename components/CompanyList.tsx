
import React, { useState, useMemo, useRef } from 'react';
import { Company, Category, CompanyFocus } from '../types';
import { Building2, Globe, ArrowRight, Tag, MapPin, Search, Sparkles, Upload, FileText, Filter, Plus, X, ScanSearch, Check, LayoutGrid, List, RefreshCcw, GitMerge, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';

// Strip markdown formatting for plain-text previews
const stripMarkdown = (text: string): string =>
  text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^[-•*]\s+/gm, '').replace(/\n+/g, ' ');

interface Recommendation {
    name: string;
    reason: string;
}

interface CompanyListProps {
  companies: Company[];
  onSelectCompany: (c: Company) => void;
  onAddCompany: (name: string) => void;
  onImportCompanies: (names: string[]) => void;
  isAdding: boolean;
  onRefreshPending: () => Promise<void>;
  isRefreshingPending: boolean;
  onScanRecommendations: () => Promise<Recommendation[]>;
  onMergeDuplicates: () => Promise<{ merged: number; removed: number }>;
}

const FocusBadge: React.FC<{ focus: CompanyFocus }> = ({ focus }) => {
  if (focus === 'Crypto-First') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 border border-violet-200 whitespace-nowrap">
        <Sparkles size={10} className="fill-violet-700" /> Crypto-First
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 whitespace-nowrap">
      <Building2 size={10} /> Crypto-Second
    </span>
  );
};

const CompanyList: React.FC<CompanyListProps> = ({ companies, onSelectCompany, onAddCompany, onImportCompanies, isAdding, onRefreshPending, isRefreshingPending, onScanRecommendations, onMergeDuplicates }) => {
  const [filter, setFilter] = useState<Category | 'All'>('All');
  const [regionFilter, setRegionFilter] = useState<string>('All');
  const [focusFilter, setFocusFilter] = useState<CompanyFocus | 'All'>('All');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'az' | 'lastAdded' | 'mostPartners'>('lastAdded');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Recommendation State
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Merge Duplicates State
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);

  // Expanded entity groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Hierarchical region filter options
  const REGION_OPTIONS = [
    { label: 'All Regions', value: 'All' },
    { label: 'North America', value: 'North America' },
    { label: 'European Union', value: 'EU' },
    { label: 'Europe (incl. EU, UK, CH)', value: 'Europe' },
    { label: 'APAC', value: 'APAC' },
    { label: 'LATAM', value: 'LATAM' },
    { label: 'MEA', value: 'MEA' },
    { label: 'Global / Remote', value: 'Global' },
  ];

  // Calculate Category Counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: companies.length };
    
    // Initialize with 0
    Object.values(Category).forEach(cat => {
      counts[cat] = 0;
    });

    companies.forEach(c => {
      (c.categories || []).forEach(cat => {
        if (counts[cat] !== undefined) {
          counts[cat]++;
        }
      });
    });
    
    return counts;
  }, [companies]);

  const filtered = companies.filter(c => {
    const catMatch = filter === 'All' || c.categories?.includes(filter);
    const regionMatch = regionFilter === 'All'
      || (regionFilter === 'Europe' && (c.region === 'EU' || c.region === 'Europe'))
      || (regionFilter === 'MEA' && (c.region === 'MEA' || c.region === 'EMEA'))
      || c.region === regionFilter;
    const focusMatch = focusFilter === 'All' || c.focus === focusFilter;
    const searchMatch = !searchTerm ||
                        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        c.description.toLowerCase().includes(searchTerm.toLowerCase());
    return catMatch && regionMatch && focusMatch && searchMatch;
  }).sort((a, b) => {
    if (sortBy === 'lastAdded') {
      const dateA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const dateB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return dateB - dateA; // newest first
    }
    if (sortBy === 'mostPartners') {
      return (b.partners?.length || 0) - (a.partners?.length || 0);
    }
    // default: A-Z
    return a.name.localeCompare(b.name);
  });

  // Entity grouping: group local entities under parent companies
  // Corporate VC / distinct business unit suffixes — these should stay separate
  // e.g. "Coinbase Ventures", "Google Capital", "Samsung Labs"
  const CORPORATE_UNIT_SUFFIXES = ['Ventures', 'Capital', 'Labs', 'Investments', 'Fund', 'Funds', 'Crypto', 'Digital', 'Asset Management', 'Research', 'Foundation'];

  const isCorporateUnit = (companyName: string, parentName: string): boolean => {
    const suffix = companyName.slice(parentName.length + 1); // e.g. "Ventures" from "Coinbase Ventures"
    return CORPORATE_UNIT_SUFFIXES.some(s => suffix === s || suffix.startsWith(s + ' '));
  };

  interface GroupedEntry {
    company: Company;
    subsidiaries: Company[];
  }

  const groupedFiltered = useMemo((): GroupedEntry[] => {
    const nameMap = new Map<string, Company>();
    filtered.forEach(c => nameMap.set(c.name, c));

    const assigned = new Set<string>();
    const groups: GroupedEntry[] = [];

    // First pass: identify parent companies and their subsidiaries
    const parentToSubs = new Map<string, Company[]>();

    for (const company of filtered) {
      if (assigned.has(company.id)) continue;

      // Check explicit parentCompany field
      let parentName = company.parentCompany;

      // Auto-detect: if company name starts with another company's name + space
      if (!parentName) {
        for (const [otherName] of nameMap) {
          if (otherName === company.name) continue;
          if (company.name.startsWith(otherName + ' ') && company.name !== otherName) {
            // Skip corporate VC arms and distinct business units
            if (isCorporateUnit(company.name, otherName)) continue;
            parentName = otherName;
            break;
          }
        }
      }

      if (parentName) {
        const subs = parentToSubs.get(parentName) || [];
        subs.push(company);
        parentToSubs.set(parentName, subs);
        assigned.add(company.id);
      }
    }

    // Second pass: build grouped entries
    for (const company of filtered) {
      if (assigned.has(company.id)) continue;

      const subs = parentToSubs.get(company.name) || [];
      groups.push({ company, subsidiaries: subs });
    }

    // Handle orphan subsidiaries whose parent is not in the filtered list
    for (const [parentName, subs] of parentToSubs) {
      if (!nameMap.has(parentName)) {
        // Parent not in current view — show subsidiaries as standalone
        subs.forEach(sub => {
          groups.push({ company: sub, subsidiaries: [] });
        });
      }
    }

    return groups;
  }, [filtered]);

  const toggleGroup = (companyName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(companyName)) next.delete(companyName);
      else next.add(companyName);
      return next;
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCompanyName.trim()) {
      onAddCompany(newCompanyName.trim());
      setNewCompanyName('');
    }
  };

  const handleScanClick = async () => {
      setIsScanning(true);
      try {
          const recs = await onScanRecommendations();
          setRecommendations(recs);
      } catch (e) {
          console.error(e);
      }
      setIsScanning(false);
  };

  const handleAcceptRec = (rec: Recommendation) => {
      onAddCompany(rec.name);
      setRecommendations(prev => prev.filter(r => r.name !== rec.name));
  };

  const handleDismissRec = (name: string) => {
      setRecommendations(prev => prev.filter(r => r.name !== name));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/);
      const names: string[] = [];
      
      lines.forEach(line => {
        if (!line.trim()) return;
        // Simple CSV parsing: assume first column is Name
        const cols = line.split(',');
        const name = cols[0]?.trim().replace(/^["']|["']$/g, '');
        
        // Basic validation to skip headers or empty rows
        if (name && name.toLowerCase() !== 'name' && name.toLowerCase() !== 'company' && name.length > 1) {
            names.push(name);
        }
      });

      if (names.length > 0) {
          onImportCompanies(names);
      } else {
          alert("No valid company names found in CSV.");
      }
    };
    reader.readAsText(file);
    // Reset
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Company Directory</h2>
          <p className="text-slate-500 text-sm">Track key players in the digital asset ecosystem</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange}
          />
          
          <button 
            onClick={onRefreshPending}
            disabled={isRefreshingPending}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50"
            title="Refresh incomplete or failed profiles"
          >
            <RefreshCcw size={16} className={isRefreshingPending ? "animate-spin" : ""} />
            {isRefreshingPending ? 'Refreshing...' : 'Refresh Pending'}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap"
          >
            <Upload size={16} /> Import CSV
          </button>

          <button
            onClick={async () => {
              setIsMerging(true);
              setMergeResult(null);
              try {
                const result = await onMergeDuplicates();
                if (result.merged === 0) {
                  setMergeResult('No duplicates found.');
                } else {
                  setMergeResult(`Merged ${result.merged} group${result.merged > 1 ? 's' : ''}, removed ${result.removed} duplicate${result.removed > 1 ? 's' : ''}.`);
                }
              } catch (e) {
                setMergeResult('Merge failed. Please try again.');
              } finally {
                setIsMerging(false);
                setTimeout(() => setMergeResult(null), 5000);
              }
            }}
            disabled={isMerging}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50"
            title="Find and merge duplicate company records"
          >
            <GitMerge size={16} className={isMerging ? "animate-spin" : ""} />
            {isMerging ? 'Merging...' : 'Merge Duplicates'}
          </button>

          <button 
            onClick={handleScanClick}
            disabled={isScanning}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50"
          >
            <ScanSearch size={16} className={isScanning ? "animate-spin" : ""} />
            {isScanning ? 'Scanning News...' : 'Find Missing'}
          </button>

          <form onSubmit={handleAddSubmit} className="flex gap-2 w-full md:w-auto">
            <input 
              type="text" 
              placeholder="Add company name..." 
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              disabled={isAdding}
            />
            <button 
              type="submit"
              disabled={isAdding}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isAdding ? 'Analysing...' : '+ Add'}
            </button>
          </form>
        </div>
      </div>

      {/* Merge Result */}
      {mergeResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800 font-medium flex items-center gap-2 animate-in fade-in duration-200">
          <GitMerge size={16} /> {mergeResult}
        </div>
      )}

      {/* Recommendations Section */}
      {recommendations.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-2 mb-3 text-amber-800 font-bold text-sm">
                  <Sparkles size={16} /> AI Recommendations
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recommendations.map((rec, idx) => (
                      <div key={idx} className="bg-white border border-amber-200 rounded-lg p-3 shadow-sm flex flex-col justify-between">
                          <div>
                              <h4 className="font-bold text-slate-900">{rec.name}</h4>
                              <p className="text-xs text-slate-600 mt-1">{rec.reason}</p>
                          </div>
                          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                              <button 
                                onClick={() => handleAcceptRec(rec)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1 transition-colors"
                              >
                                  <Check size={12} /> Yes, Add
                              </button>
                              <button 
                                onClick={() => handleDismissRec(rec.name)}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1 transition-colors"
                              >
                                  <X size={12} /> No
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Search & Filters Row */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
         <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search companies by name or description..." 
              className="w-full pl-10 pr-4 py-2 bg-transparent border-none outline-none text-sm h-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         
         <div className="flex items-center gap-2 px-2 border-l border-slate-100">
            <Filter size={16} className="text-slate-400" />
            <select 
              value={focusFilter}
              onChange={(e) => setFocusFilter(e.target.value as CompanyFocus | 'All')}
              className="text-sm bg-transparent outline-none text-slate-700 border-none focus:ring-0 cursor-pointer py-2 font-medium"
            >
              <option value="All">All Focus</option>
              <option value="Crypto-First">Crypto-First</option>
              <option value="Crypto-Second">Crypto-Second</option>
            </select>
        </div>

         <div className="flex items-center gap-2 px-2 border-l border-slate-100">
            <Globe size={16} className="text-slate-400" />
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="text-sm bg-transparent outline-none text-slate-700 border-none focus:ring-0 cursor-pointer py-2 font-medium"
            >
              {REGION_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
        </div>

        <div className="flex items-center gap-2 px-2 border-l border-slate-100">
            <ArrowUpDown size={16} className="text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'az' | 'lastAdded' | 'mostPartners')}
              className="text-sm bg-transparent outline-none text-slate-700 border-none focus:ring-0 cursor-pointer py-2 font-medium"
            >
              <option value="az">A → Z</option>
              <option value="lastAdded">Last Added</option>
              <option value="mostPartners">Most Partners</option>
            </select>
        </div>

        <div className="flex items-center border-l border-slate-100 pl-2 gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Grid View"
            >
                <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}
              title="List View"
            >
                <List size={18} />
            </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2 pb-4">
          <button 
            onClick={() => setFilter('All')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${filter === 'All' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            All 
            <span className={`text-[10px] py-0.5 px-1.5 rounded-full ml-1 ${filter === 'All' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-500'}`}>
              {categoryCounts['All']}
            </span>
          </button>
          {Object.values(Category).map(cat => (
            <button 
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${filter === cat ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              {cat}
              <span className={`text-[10px] py-0.5 px-1.5 rounded-full ml-1 ${filter === cat ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {categoryCounts[cat] || 0}
              </span>
            </button>
          ))}
      </div>

      {/* VIEW: GRID */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupedFiltered.length === 0 ? (
             <div className="col-span-full py-12 text-center text-slate-500 flex flex-col items-center">
                <FileText size={48} className="text-slate-300 mb-3" />
                <p className="font-medium">No companies found matching your criteria.</p>
                <p className="text-xs mt-1">Try adjusting your filters or adding a new company.</p>
             </div>
          ) : (
            groupedFiltered.map(({ company, subsidiaries }) => (
              <div key={company.id} className="flex flex-col">
                <div
                  onClick={() => onSelectCompany(company)}
                  className="group bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={company.logoPlaceholder}
                        alt={company.name}
                        loading="lazy"
                        className="w-10 h-10 rounded-lg bg-white border border-slate-200 object-contain p-0.5"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          // If dead Clearbit URL, try gstatic favicon from website first
                          if (target.src.includes('clearbit.com') && company.website) {
                            const domain = company.website.replace(/^https?:\/\//, '').split('/')[0];
                            target.src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                            return;
                          }
                          if (!target.src.includes('ui-avatars.com')) {
                            target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=f8fafc&color=64748b&size=128`;
                          }
                        }}
                      />
                      <div>
                        <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{company.name}</h3>
                        <div className="flex flex-col gap-1.5 mt-1.5">
                           <FocusBadge focus={company.focus} />

                            {company.headquarters && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-500 line-clamp-1">
                                  <MapPin size={10} /> {company.headquarters}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {company.website && (
                        <a href={company.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-indigo-500">
                          <Globe size={16} />
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-600 text-sm mb-4 line-clamp-3 flex-grow leading-relaxed">
                    {stripMarkdown(company.description)}
                  </p>

                  <div className="mt-auto">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {company.categories?.slice(0, 3).map(cat => (
                        <span key={cat} className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-1 rounded text-xs">
                          <Tag size={10} /> {cat}
                        </span>
                      ))}
                      {company.categories?.length > 3 && (
                        <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-1 rounded text-xs">
                          +{company.categories.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                      <span className="font-medium">{(company.partners || []).length} Partnerships</span>
                      <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform text-indigo-600 font-bold">
                        View Profile <ArrowRight size={12} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Subsidiary / Local Entity Toggle */}
                {subsidiaries.length > 0 && (
                  <div className="mt-1">
                    <button
                      onClick={() => toggleGroup(company.name)}
                      className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-indigo-600 font-medium px-3 py-1.5 transition-colors w-full"
                    >
                      {expandedGroups.has(company.name) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {subsidiaries.length} local entit{subsidiaries.length === 1 ? 'y' : 'ies'}
                    </button>
                    {expandedGroups.has(company.name) && (
                      <div className="ml-4 border-l-2 border-indigo-100 pl-3 space-y-2 pb-2">
                        {subsidiaries.map(sub => (
                          <div
                            key={sub.id}
                            onClick={() => onSelectCompany(sub)}
                            className="bg-slate-50 rounded-lg border border-slate-150 p-3 hover:bg-white hover:border-indigo-200 transition-all cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <img
                                  src={sub.logoPlaceholder}
                                  alt={sub.name}
                                  loading="lazy"
                                  className="w-6 h-6 rounded bg-white border border-slate-200 object-contain p-0.5"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    if (target.src.includes('clearbit.com') && sub.website) {
                                      const domain = sub.website.replace(/^https?:\/\//, '').split('/')[0];
                                      target.src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                                      return;
                                    }
                                    if (!target.src.includes('ui-avatars.com')) {
                                      target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(sub.name)}&background=f8fafc&color=64748b&size=128`;
                                    }
                                  }}
                                />
                                <div>
                                  <span className="text-sm font-medium text-slate-800">{sub.name}</span>
                                  <span className="inline-flex ml-2 items-center bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide">Local Entity</span>
                                </div>
                              </div>
                              <ArrowRight size={12} className="text-slate-400" />
                            </div>
                            {sub.headquarters && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1.5 ml-8">
                                <MapPin size={10} /> {sub.headquarters}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEW: LIST (COMPACT) */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-semibold">
                  <th className="p-4 w-[280px]">Company</th>
                  <th className="p-4">Categories</th>
                  <th className="p-4">HQ & Region</th>
                  <th className="p-4 w-32">Focus</th>
                  <th className="p-4 text-center">Web</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-medium">No companies found.</td>
                  </tr>
                ) : (
                  groupedFiltered.map(({ company, subsidiaries }) => (
                    <React.Fragment key={company.id}>
                      <tr
                        onClick={() => onSelectCompany(company)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer group"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={company.logoPlaceholder}
                              alt={company.name}
                              loading="lazy"
                              className="w-8 h-8 rounded bg-white border border-slate-200 object-contain p-0.5 shrink-0"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (target.src.includes('clearbit.com') && company.website) {
                                  const domain = company.website.replace(/^https?:\/\//, '').split('/')[0];
                                  target.src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                                  return;
                                }
                                if (!target.src.includes('ui-avatars.com')) {
                                    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=f8fafc&color=64748b&size=128`;
                                }
                              }}
                            />
                            <div>
                              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                {company.name}
                                {subsidiaries.length > 0 && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleGroup(company.name); }}
                                    className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-600 font-medium"
                                  >
                                    {expandedGroups.has(company.name) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                    {subsidiaries.length} local
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 line-clamp-1">{stripMarkdown(company.description).substring(0, 50)}...</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1.5">
                            {company.categories?.slice(0, 2).map(cat => (
                              <span key={cat} className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap">
                                {cat}
                              </span>
                            ))}
                            {company.categories?.length > 2 && (
                              <span className="inline-block bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                +{company.categories.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-slate-700">{company.headquarters || '-'}</span>
                            <span className="text-[10px] text-slate-400">{company.region}{company.country ? ` · ${company.country}` : ''}</span>
                            {company.industry && (
                              <span className="text-[9px] text-indigo-500 font-bold uppercase tracking-wide">{company.industry}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <FocusBadge focus={company.focus} />
                        </td>
                        <td className="p-4 text-center">
                          {company.website ? (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-indigo-600 inline-block"
                            >
                              <Globe size={16} />
                            </a>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            View <ArrowRight size={12} />
                          </span>
                        </td>
                      </tr>
                      {/* Subsidiary rows */}
                      {expandedGroups.has(company.name) && subsidiaries.map(sub => (
                        <tr
                          key={sub.id}
                          onClick={() => onSelectCompany(sub)}
                          className="bg-slate-50/50 hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                        >
                          <td className="p-4 pl-12">
                            <div className="flex items-center gap-3">
                              <div className="w-px h-6 bg-indigo-200 -ml-4 mr-2" />
                              <img
                                src={sub.logoPlaceholder}
                                alt={sub.name}
                                loading="lazy"
                                className="w-6 h-6 rounded bg-white border border-slate-200 object-contain p-0.5 shrink-0"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (target.src.includes('clearbit.com') && sub.website) {
                                    const domain = sub.website.replace(/^https?:\/\//, '').split('/')[0];
                                    target.src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
                                    return;
                                  }
                                  if (!target.src.includes('ui-avatars.com')) {
                                    target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(sub.name)}&background=f8fafc&color=64748b&size=128`;
                                  }
                                }}
                              />
                              <div>
                                <div className="font-medium text-slate-700 text-sm flex items-center gap-2">
                                  {sub.name}
                                  <span className="inline-flex items-center bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide">Local Entity</span>
                                </div>
                                <div className="text-[10px] text-slate-400 line-clamp-1">{sub.description.substring(0, 50)}...</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1.5">
                              {sub.categories?.slice(0, 2).map(cat => (
                                <span key={cat} className="inline-block bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap">
                                  {cat}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="text-xs text-slate-600">{sub.headquarters || '-'}</span>
                          </td>
                          <td className="p-4">
                            <FocusBadge focus={sub.focus} />
                          </td>
                          <td className="p-4 text-center">
                            {sub.website ? (
                              <a href={sub.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-indigo-600 inline-block">
                                <Globe size={16} />
                              </a>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              View <ArrowRight size={12} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyList;
