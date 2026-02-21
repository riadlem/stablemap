
import React, { useState, useEffect, useMemo } from 'react';
import { Company, NewsItem, classifyNewsSourceType, NewsSourceType } from '../types';
import { TRUSTED_SOURCES } from '../services/claudeService';
import { db } from '../services/db';
import {
  Settings, Globe, Plus, Ban, Check, X, ExternalLink, Search,
  ChevronLeft, ChevronRight, Building2, Link2, Trash2, RotateCcw,
  Newspaper, Filter, ArrowUpDown
} from 'lucide-react';

// ---- Types ----

interface SourceEntry {
  domain: string;
  name: string;
  tier: string;
  isCustom: boolean;
  excluded: boolean;
}

interface AdminProps {
  companies: Company[];
  onClearNews?: () => void;
}

const TIER_COLORS: Record<string, string> = {
  crypto:        'bg-purple-50 text-purple-700 border-purple-200',
  institutional: 'bg-blue-50 text-blue-700 border-blue-200',
  fintech:       'bg-cyan-50 text-cyan-700 border-cyan-200',
  research:      'bg-amber-50 text-amber-700 border-amber-200',
  regulatory:    'bg-red-50 text-red-700 border-red-200',
  mainstream:    'bg-green-50 text-green-700 border-green-200',
  regional:      'bg-orange-50 text-orange-700 border-orange-200',
  custom:        'bg-slate-50 text-slate-700 border-slate-200',
};

const TIER_OPTIONS = ['crypto', 'institutional', 'fintech', 'research', 'regulatory', 'mainstream', 'regional'];

const SOURCE_BADGE: Record<NewsSourceType, { bg: string; text: string; label: string }> = {
  press:         { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-700', label: 'Press' },
  press_release: { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700', label: 'Press Release' },
  partnership:   { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', label: 'Partnership' },
};

const ITEMS_PER_PAGE = 30;

const Admin: React.FC<AdminProps> = ({ companies, onClearNews }) => {
  const [tab, setTab] = useState<'sources' | 'feed'>('sources');
  const [news, setNews] = useState<NewsItem[]>([]);

  // ---- Sources state ----
  const [customSources, setCustomSources] = useState<{ domain: string; name: string; tier: string }[]>([]);
  const [excludedDomains, setExcludedDomains] = useState<string[]>([]);
  const [sourceSearch, setSourceSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState('crypto');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'excluded'>('all');

  // ---- Feed state ----
  const [feedSearch, setFeedSearch] = useState('');
  const [feedPage, setFeedPage] = useState(1);
  const [feedSourceFilter, setFeedSourceFilter] = useState<'all' | NewsSourceType>('all');
  const [feedSort, setFeedSort] = useState<'date' | 'company'>('date');
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<{ kept: number; removed: number; partnersFixed?: number } | null>(null);

  // ---- Load config on mount ----
  useEffect(() => {
    db.getSourceConfig().then(cfg => {
      setCustomSources(cfg.customSources);
      setExcludedDomains(cfg.excludedDomains);
    });
    db.getNews().then(setNews);
  }, []);

  // ---- Save helper ----
  const persist = (custom: typeof customSources, excluded: typeof excludedDomains) => {
    setCustomSources(custom);
    setExcludedDomains(excluded);
    db.saveSourceConfig({ customSources: custom, excludedDomains: excluded });
  };

  // ---- Merged source list ----
  const allSources: SourceEntry[] = useMemo(() => {
    const builtIn: SourceEntry[] = TRUSTED_SOURCES.map(s => ({
      ...s,
      isCustom: false,
      excluded: excludedDomains.includes(s.domain),
    }));
    const custom: SourceEntry[] = customSources.map(s => ({
      ...s,
      isCustom: true,
      excluded: excludedDomains.includes(s.domain),
    }));
    return [...builtIn, ...custom];
  }, [customSources, excludedDomains]);

  const filteredSources = useMemo(() => {
    let list = allSources;
    if (sourceSearch) {
      const q = sourceSearch.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q));
    }
    if (filterTier !== 'all') list = list.filter(s => s.tier === filterTier);
    if (filterStatus === 'active') list = list.filter(s => !s.excluded);
    if (filterStatus === 'excluded') list = list.filter(s => s.excluded);
    return list;
  }, [allSources, sourceSearch, filterTier, filterStatus]);

  // ---- Source actions ----
  const toggleExclude = (domain: string) => {
    const isExcluded = excludedDomains.includes(domain);
    const newExcluded = isExcluded ? excludedDomains.filter(d => d !== domain) : [...excludedDomains, domain];
    persist(customSources, newExcluded);
  };

  const addSource = () => {
    const domain = newDomain.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    const name = newName.trim();
    if (!domain || !name) return;
    if (allSources.some(s => s.domain === domain)) return;
    const updated = [...customSources, { domain, name, tier: newTier }];
    persist(updated, excludedDomains);
    setNewDomain('');
    setNewName('');
    setShowAddForm(false);
  };

  const removeCustomSource = (domain: string) => {
    const updated = customSources.filter(s => s.domain !== domain);
    const updatedExcl = excludedDomains.filter(d => d !== domain);
    persist(updated, updatedExcl);
  };

  // ---- Feed: match news to companies ----
  const companyMap = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach(c => m.set(c.name.toLowerCase(), c));
    return m;
  }, [companies]);

  const feedItems = useMemo(() => {
    let items = [...news];

    if (feedSourceFilter !== 'all') {
      items = items.filter(n => classifyNewsSourceType(n) === feedSourceFilter);
    }
    if (feedSearch) {
      const q = feedSearch.toLowerCase();
      items = items.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.source.toLowerCase().includes(q) ||
        n.relatedCompanies.some(rc => rc.toLowerCase().includes(q))
      );
    }

    items.sort((a, b) => {
      if (feedSort === 'date') return b.date.localeCompare(a.date);
      const aCompany = a.relatedCompanies[0] || '';
      const bCompany = b.relatedCompanies[0] || '';
      return aCompany.localeCompare(bCompany) || b.date.localeCompare(a.date);
    });

    return items;
  }, [news, feedSourceFilter, feedSearch, feedSort]);

  const totalFeedPages = Math.max(1, Math.ceil(feedItems.length / ITEMS_PER_PAGE));
  const paginatedFeed = feedItems.slice((feedPage - 1) * ITEMS_PER_PAGE, feedPage * ITEMS_PER_PAGE);

  // ---- Stats ----
  const activeCount = allSources.filter(s => !s.excluded).length;
  const excludedCount = allSources.filter(s => s.excluded).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Settings size={24} className="text-indigo-600" /> Admin
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage publication sources and review news feed</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('sources')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors ${
            tab === 'sources' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Globe size={16} /> Sources ({allSources.length})
        </button>
        <button
          onClick={() => setTab('feed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors ${
            tab === 'feed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Newspaper size={16} /> News Feed ({news.length})
        </button>
      </div>

      {/* ===================== SOURCES TAB ===================== */}
      {tab === 'sources' && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex gap-4 text-sm">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2">
              <span className="font-black text-emerald-700">{activeCount}</span> <span className="text-emerald-600">active</span>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2">
              <span className="font-black text-red-700">{excludedCount}</span> <span className="text-red-600">excluded</span>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2">
              <span className="font-black text-indigo-700">{customSources.length}</span> <span className="text-indigo-600">custom</span>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search sources..."
                value={sourceSearch}
                onChange={e => setSourceSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <select
              value={filterTier}
              onChange={e => setFilterTier(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All tiers</option>
              {TIER_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              <option value="custom">Custom</option>
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All status</option>
              <option value="active">Active only</option>
              <option value="excluded">Excluded only</option>
            </select>

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus size={16} /> Add Source
            </button>
          </div>

          {/* Add source form */}
          {showAddForm && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-wrap gap-3 items-end animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Domain</label>
                <input
                  type="text"
                  placeholder="e.g. example.com"
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Example News"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tier</label>
                <select
                  value={newTier}
                  onChange={e => setNewTier(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {TIER_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <button
                onClick={addSource}
                disabled={!newDomain.trim() || !newName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <Check size={16} /> Save
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewDomain(''); setNewName(''); }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-300 transition-colors"
              >
                <X size={16} /> Cancel
              </button>
            </div>
          )}

          {/* Sources table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Source</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Domain</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Tier</th>
                  <th className="text-left px-4 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Status</th>
                  <th className="text-right px-4 py-3 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map(s => (
                  <tr key={s.domain} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${s.excluded ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {s.name}
                      {s.isCustom && <span className="ml-2 text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase">Custom</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.domain}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide border ${TIER_COLORS[s.tier] || TIER_COLORS.custom}`}>
                        {s.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.excluded ? (
                        <span className="text-[10px] font-bold bg-red-50 text-red-600 px-2.5 py-1 rounded-full border border-red-100 uppercase tracking-wide">Excluded</span>
                      ) : (
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wide">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleExclude(s.domain)}
                          className={`p-1.5 rounded-md transition-colors ${s.excluded ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-500 hover:bg-red-50'}`}
                          title={s.excluded ? 'Restore source' : 'Exclude source'}
                        >
                          {s.excluded ? <RotateCcw size={14} /> : <Ban size={14} />}
                        </button>
                        {s.isCustom && (
                          <button
                            onClick={() => removeCustomSource(s.domain)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete custom source"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <a
                          href={`https://${s.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Visit site"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSources.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No sources match your filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== NEWS FEED TAB ===================== */}
      {tab === 'feed' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by title, source, or company..."
                value={feedSearch}
                onChange={e => { setFeedSearch(e.target.value); setFeedPage(1); }}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['all', 'press', 'press_release', 'partnership'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setFeedSourceFilter(f); setFeedPage(1); }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    feedSourceFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'press' ? 'Press' : f === 'press_release' ? 'Press Release' : 'Partnership'}
                </button>
              ))}
            </div>

            <button
              onClick={() => setFeedSort(feedSort === 'date' ? 'company' : 'date')}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowUpDown size={14} /> {feedSort === 'date' ? 'By Date' : 'By Company'}
            </button>

            <button
              onClick={async () => {
                if (!confirm('Reprocess all data? This will:\n• Re-clean garbled article titles & source names\n• Remove irrelevant articles (token price, exchange reviews, etc.)\n• Fix partnerships: resolve token/product names to company names')) return;
                setReprocessing(true);
                setReprocessResult(null);
                const newsResult = await db.reprocessNews();
                setNews(newsResult.reprocessed);
                const partnerResult = await db.reprocessPartners();
                onClearNews?.();
                setReprocessResult({ kept: newsResult.kept, removed: newsResult.removed, partnersFixed: partnerResult.fixed });
                setReprocessing(false);
              }}
              disabled={reprocessing}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-bold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40 ml-auto"
            >
              <RotateCcw size={14} className={reprocessing ? 'animate-spin' : ''} /> {reprocessing ? 'Reprocessing...' : 'Reprocess All Data'}
            </button>
          </div>

          {/* Stats */}
          <div className="text-xs text-slate-500">
            Showing {paginatedFeed.length} of {feedItems.length} articles
            {feedSearch && ` matching "${feedSearch}"`}
            {reprocessResult && (
              <span className="ml-2 text-amber-600 font-medium">
                — News: {reprocessResult.kept} kept, {reprocessResult.removed} removed
                {reprocessResult.partnersFixed != null && ` · Partnerships: ${reprocessResult.partnersFixed} companies fixed`}
              </span>
            )}
          </div>

          {/* Feed items */}
          <div className="space-y-3">
            {paginatedFeed.map(item => {
              const st = classifyNewsSourceType(item);
              const badge = SOURCE_BADGE[st];
              const matchedCompanies = item.relatedCompanies
                .map(rc => ({ name: rc, company: companyMap.get(rc.toLowerCase()) }))
                .filter(x => x.company);

              return (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-indigo-200 transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${badge.bg} ${badge.text} text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border`}>
                        {badge.label}
                      </span>
                      {item.source && !['Directory Intelligence', 'Intelligence', 'Manual Entry'].includes(item.source) && (
                        <span className="bg-slate-50 text-slate-500 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border border-slate-200">
                          {item.source}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[10px] font-black tracking-widest uppercase shrink-0 ml-2">{item.date}</span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-slate-500 text-xs leading-relaxed mb-3 line-clamp-2">{item.summary}</p>

                  {/* Matched company records */}
                  <div className="flex flex-wrap items-center gap-2">
                    {matchedCompanies.length > 0 ? (
                      matchedCompanies.map(({ name, company }) => (
                        <div key={name} className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                          {company?.logo ? (
                            <img src={company.logo} alt="" className="w-4 h-4 rounded-full object-cover" />
                          ) : (
                            <Building2 size={12} className="text-emerald-600" />
                          )}
                          <span className="text-[10px] font-bold text-emerald-700">{name}</span>
                          <span className="text-[9px] text-emerald-500">Tracked</span>
                        </div>
                      ))
                    ) : (
                      item.relatedCompanies.slice(0, 3).map(rc => (
                        <span key={rc} className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full border border-slate-200">
                          {rc}
                        </span>
                      ))
                    )}

                    <div className="ml-auto">
                      <a
                        href={item.url !== '#' ? item.url : `https://www.google.com/search?q=${encodeURIComponent(item.title)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 text-xs font-bold flex items-center gap-1 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Source <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}

            {paginatedFeed.length === 0 && (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Newspaper size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No news articles match your filters.</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalFeedPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => setFeedPage(p => Math.max(1, p - 1))}
                disabled={feedPage === 1}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-bold text-slate-600">
                Page {feedPage} of {totalFeedPages}
              </span>
              <button
                onClick={() => setFeedPage(p => Math.min(totalFeedPages, p + 1))}
                disabled={feedPage === totalFeedPages}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Admin;
