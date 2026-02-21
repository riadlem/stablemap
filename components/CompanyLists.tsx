
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, Category, CompanyList as CompanyListType, CompanyListEntry, ListPriority } from '../types';
import { db } from '../services/db';
import {
  ListChecks, Plus, Trash2, Save, Search, Building2, CheckSquare, Square,
  ChevronDown, ChevronRight, Pencil, FileDown, X, Tag, AlertTriangle,
  ArrowUpCircle, ArrowDownCircle, MinusCircle, Filter
} from 'lucide-react';

interface CompanyListsProps {
  companies: Company[];
}

const PRIORITY_CONFIG: Record<ListPriority, { bg: string; text: string; border: string; icon: React.FC<any>; label: string }> = {
  Critical: { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    icon: AlertTriangle, label: 'Critical' },
  High:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: ArrowUpCircle, label: 'High' },
  Medium:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   icon: MinusCircle,   label: 'Medium' },
  Low:      { bg: 'bg-slate-50',  text: 'text-slate-500',  border: 'border-slate-200',  icon: ArrowDownCircle, label: 'Low' },
};

const PRIORITIES: ListPriority[] = ['Critical', 'High', 'Medium', 'Low'];

const CompanyLists: React.FC<CompanyListsProps> = ({ companies }) => {
  const [lists, setLists] = useState<CompanyListType[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // New list form
  const [showNewListForm, setShowNewListForm] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Editing list name
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');

  // Company selection filters (Directory-style)
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [regionFilter, setRegionFilter] = useState<string>('All');
  const [focusFilter, setFocusFilter] = useState<string>('All');

  // Entry label editing
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const labelInputRef = useRef<HTMLInputElement>(null);

  // Load lists on mount
  useEffect(() => {
    (async () => {
      const saved = await db.getLists();
      setLists(saved);
      if (saved.length > 0) setActiveListId(saved[0].id);
      setIsLoading(false);
    })();
  }, []);

  // Focus label input when editing
  useEffect(() => {
    if (editingEntryId && labelInputRef.current) labelInputRef.current.focus();
  }, [editingEntryId]);

  const activeList = lists.find(l => l.id === activeListId) || null;

  const regions = useMemo(() => {
    const r = new Set(companies.map(c => c.region || 'Global'));
    return ['All', ...Array.from(r).sort()];
  }, [companies]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    map.set('All', companies.length);
    Object.values(Category).forEach(cat => {
      map.set(cat, companies.filter(c => c.categories?.includes(cat)).length);
    });
    return map;
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    return companies.filter(c => {
      const catMatch = categoryFilter === 'All' || c.categories?.includes(categoryFilter);
      const regionMatch = regionFilter === 'All' || (c.region || 'Global') === regionFilter;
      const focusMatch = focusFilter === 'All' || c.focus === focusFilter;
      const searchMatch = !searchTerm ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description.toLowerCase().includes(searchTerm.toLowerCase());
      return catMatch && regionMatch && focusMatch && searchMatch;
    });
  }, [companies, categoryFilter, regionFilter, focusFilter, searchTerm]);

  const saveList = async (updatedList: CompanyListType) => {
    const updated = { ...updatedList, updatedAt: new Date().toISOString() };
    setLists(prev => prev.map(l => l.id === updated.id ? updated : l));
    await db.saveList(updated);
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    const now = new Date().toISOString();
    const newList: CompanyListType = {
      id: `list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: newListName.trim(),
      entries: [],
      createdAt: now,
      updatedAt: now,
    };
    setLists(prev => [...prev, newList]);
    setActiveListId(newList.id);
    setNewListName('');
    setShowNewListForm(false);
    await db.saveList(newList);
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Delete this list permanently?')) return;
    setLists(prev => prev.filter(l => l.id !== listId));
    if (activeListId === listId) setActiveListId(lists.find(l => l.id !== listId)?.id || null);
    await db.deleteList(listId);
  };

  const handleRenameList = async (listId: string) => {
    if (!editingListName.trim()) { setEditingListId(null); return; }
    const list = lists.find(l => l.id === listId);
    if (list) await saveList({ ...list, name: editingListName.trim() });
    setEditingListId(null);
  };

  const toggleCompanyInList = async (companyId: string) => {
    if (!activeList) return;
    const exists = activeList.entries.find(e => e.companyId === companyId);
    let updatedEntries: CompanyListEntry[];
    if (exists) {
      updatedEntries = activeList.entries.filter(e => e.companyId !== companyId);
    } else {
      updatedEntries = [...activeList.entries, {
        companyId,
        label: '',
        priority: 'Medium' as ListPriority,
        addedAt: new Date().toISOString(),
      }];
    }
    await saveList({ ...activeList, entries: updatedEntries });
  };

  const updateEntryPriority = async (companyId: string, priority: ListPriority) => {
    if (!activeList) return;
    const updatedEntries = activeList.entries.map(e =>
      e.companyId === companyId ? { ...e, priority } : e
    );
    await saveList({ ...activeList, entries: updatedEntries });
  };

  const updateEntryLabel = async (companyId: string, label: string) => {
    if (!activeList) return;
    const updatedEntries = activeList.entries.map(e =>
      e.companyId === companyId ? { ...e, label } : e
    );
    await saveList({ ...activeList, entries: updatedEntries });
    setEditingEntryId(null);
  };

  const removeEntryFromList = async (companyId: string) => {
    if (!activeList) return;
    const updatedEntries = activeList.entries.filter(e => e.companyId !== companyId);
    await saveList({ ...activeList, entries: updatedEntries });
  };

  const getCompanyById = (id: string) => companies.find(c => c.id === id);

  const isInActiveList = (companyId: string) => activeList?.entries.some(e => e.companyId === companyId) ?? false;

  // Sort entries by priority order
  const sortedEntries = useMemo(() => {
    if (!activeList) return [];
    const order: Record<ListPriority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return [...activeList.entries].sort((a, b) => order[a.priority] - order[b.priority]);
  }, [activeList]);

  // PDF Export
  const exportPDF = () => {
    if (!activeList || sortedEntries.length === 0) return;

    const priorityColors: Record<ListPriority, string> = {
      Critical: '#dc2626', High: '#ea580c', Medium: '#2563eb', Low: '#64748b'
    };

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${activeList.name}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; }
      .header { border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
      .header h1 { font-size: 24px; color: #1e293b; }
      .header p { font-size: 12px; color: #64748b; margin-top: 4px; }
      .stats { display: flex; gap: 16px; margin-bottom: 24px; }
      .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
      .stat .value { font-size: 20px; font-weight: 900; }
      .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; border-bottom: 2px solid #e2e8f0; }
      td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
      tr:hover { background: #f8fafc; }
      .priority-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: white; }
      .label-text { font-size: 11px; color: #475569; font-style: italic; }
      .company-name { font-weight: 600; }
      .company-meta { font-size: 11px; color: #94a3b8; }
      .categories { display: flex; gap: 4px; flex-wrap: wrap; }
      .cat-badge { font-size: 9px; padding: 1px 6px; border-radius: 4px; background: #ede9fe; color: #6d28d9; font-weight: 700; }
      .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
      @media print { body { padding: 20px; } .no-print { display: none; } }
    </style></head><body>
    <div class="header">
      <h1>${activeList.name}</h1>
      <p>Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} &bull; ${sortedEntries.length} companies</p>
    </div>
    <div class="stats">`;

    PRIORITIES.forEach(p => {
      const count = sortedEntries.filter(e => e.priority === p).length;
      if (count > 0) {
        html += `<div class="stat"><div class="value" style="color:${priorityColors[p]}">${count}</div><div class="label">${p}</div></div>`;
      }
    });

    html += `</div><table><thead><tr><th>#</th><th>Company</th><th>Categories</th><th>Region</th><th>Focus</th><th>Priority</th><th>Label</th></tr></thead><tbody>`;

    sortedEntries.forEach((entry, idx) => {
      const company = getCompanyById(entry.companyId);
      if (!company) return;
      const color = priorityColors[entry.priority];
      html += `<tr>
        <td>${idx + 1}</td>
        <td><div class="company-name">${company.name}</div><div class="company-meta">${company.headquarters || ''}</div></td>
        <td><div class="categories">${(company.categories || []).map(c => `<span class="cat-badge">${c}</span>`).join('')}</div></td>
        <td>${company.region || 'Global'}</td>
        <td>${company.focus || ''}</td>
        <td><span class="priority-badge" style="background:${color}">${entry.priority}</span></td>
        <td class="label-text">${entry.label || '—'}</td>
      </tr>`;
    });

    html += `</tbody></table>
    <div class="footer">StableMap Intelligence Platform &bull; ${activeList.name}</div>
    <script class="no-print">window.onload=function(){window.print()}</script>
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onafterprint = () => URL.revokeObjectURL(url);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400">
        <ListChecks size={48} className="animate-pulse mb-4 opacity-50" />
        <p className="font-medium">Loading lists...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <ListChecks size={24} className="text-indigo-600" /> Company Lists
          </h1>
          <p className="text-slate-500 text-sm mt-1">Create and manage curated company lists from your directory</p>
        </div>
        {activeList && sortedEntries.length > 0 && (
          <button onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
            <FileDown size={14} /> Export PDF
          </button>
        )}
      </div>

      {/* List tabs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {lists.map(list => (
          <div key={list.id} className={`group flex items-center gap-1 rounded-lg border transition-colors ${
            activeListId === list.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
          }`}>
            {editingListId === list.id ? (
              <input type="text" value={editingListName} onChange={e => setEditingListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameList(list.id); if (e.key === 'Escape') setEditingListId(null); }}
                onBlur={() => handleRenameList(list.id)} autoFocus
                className="px-3 py-2 text-sm font-medium bg-transparent outline-none w-32" />
            ) : (
              <button onClick={() => setActiveListId(list.id)} className="px-3 py-2 text-sm font-medium">
                {list.name}
                <span className={`ml-2 text-[10px] font-mono ${activeListId === list.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {list.entries.length}
                </span>
              </button>
            )}
            <div className={`flex items-center gap-0.5 pr-1 ${activeListId === list.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
              <button onClick={() => { setEditingListId(list.id); setEditingListName(list.name); }}
                className={`p-1 rounded ${activeListId === list.id ? 'hover:bg-indigo-500' : 'hover:bg-slate-100'}`}>
                <Pencil size={11} />
              </button>
              <button onClick={() => handleDeleteList(list.id)}
                className={`p-1 rounded ${activeListId === list.id ? 'hover:bg-indigo-500' : 'hover:bg-slate-100'}`}>
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        {showNewListForm ? (
          <div className="flex items-center gap-1 bg-white border border-indigo-300 rounded-lg">
            <input type="text" value={newListName} onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateList(); if (e.key === 'Escape') setShowNewListForm(false); }}
              placeholder="List name..." autoFocus
              className="px-3 py-2 text-sm outline-none w-36 rounded-l-lg" />
            <button onClick={handleCreateList} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-r-lg"><Save size={14} /></button>
            <button onClick={() => setShowNewListForm(false)} className="p-2 text-slate-400 hover:bg-slate-50"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => setShowNewListForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
            <Plus size={14} /> New List
          </button>
        )}
      </div>

      {!activeList ? (
        <div className="text-center py-20 text-slate-400">
          <ListChecks className="mx-auto mb-4 opacity-40" size={48} />
          <p className="font-bold text-lg">No lists yet</p>
          <p className="text-sm mt-1">Create your first list to start curating companies from your directory.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Company picker with filters */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-16">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={16} className="text-indigo-500" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Add Companies</h2>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search companies..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs" />
              </div>

              {/* Filters */}
              <div className="space-y-2 mb-3">
                {/* Category filter */}
                <div className="flex flex-wrap gap-1">
                  <Filter size={10} className="text-slate-400 mt-1 mr-1" />
                  {['All', ...Object.values(Category)].map(cat => (
                    <button key={cat} onClick={() => setCategoryFilter(cat as Category | 'All')}
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${
                        categoryFilter === cat ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {cat} {categoryCounts.get(cat) !== undefined ? `(${categoryCounts.get(cat)})` : ''}
                    </button>
                  ))}
                </div>

                {/* Region filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Region</span>
                  <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                {/* Focus filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Focus</span>
                  <div className="flex gap-1">
                    {['All', 'Crypto-First', 'Crypto-Second'].map(f => (
                      <button key={f} onClick={() => setFocusFilter(f)}
                        className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${
                          focusFilter === f
                            ? f === 'Crypto-First' ? 'bg-violet-600 text-white' : f === 'Crypto-Second' ? 'bg-slate-700 text-white' : 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}>{f}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Company list */}
              <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                {filteredCompanies.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <Building2 className="mx-auto mb-2 opacity-40" size={20} />
                    <p className="text-xs">No matches</p>
                  </div>
                ) : (
                  filteredCompanies.map(company => {
                    const inList = isInActiveList(company.id);
                    return (
                      <button key={company.id} onClick={() => toggleCompanyInList(company.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors text-xs ${
                          inList ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'
                        }`}>
                        {inList ? <CheckSquare size={14} className="text-indigo-600 shrink-0" /> : <Square size={14} className="text-slate-300 shrink-0" />}
                        <img src={company.logoPlaceholder} alt="" className="w-5 h-5 rounded shrink-0" onError={e => { const t = e.target as HTMLImageElement; if (t.src.includes('clearbit.com') && company.website) { const d = company.website.replace(/^https?:\/\//, '').split('/')[0]; t.src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`; } else if (!t.src.includes('ui-avatars.com')) { t.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=f8fafc&color=64748b&size=64`; } }} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-800 truncate">{company.name}</div>
                          <div className="text-[9px] text-slate-400 truncate">{company.headquarters || company.region} &bull; {company.focus}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: Active list entries */}
          <div className="lg:col-span-2">
            {/* Priority summary */}
            {sortedEntries.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {PRIORITIES.map(p => {
                  const cfg = PRIORITY_CONFIG[p];
                  const count = sortedEntries.filter(e => e.priority === p).length;
                  return (
                    <div key={p} className={`${cfg.bg} rounded-xl border ${cfg.border} p-3`}>
                      <div className={`text-xl font-black ${cfg.text}`}>{count}</div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{p}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* List entries */}
            <div className="space-y-2">
              {sortedEntries.length === 0 ? (
                <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
                  <ListChecks className="mx-auto mb-3 opacity-40" size={40} />
                  <p className="font-bold">List is empty</p>
                  <p className="text-sm mt-1">Select companies from the directory on the left to add them.</p>
                </div>
              ) : (
                sortedEntries.map((entry, idx) => {
                  const company = getCompanyById(entry.companyId);
                  if (!company) return null;
                  const pCfg = PRIORITY_CONFIG[entry.priority];
                  const PIcon = pCfg.icon;
                  return (
                    <div key={entry.companyId} className={`bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow`}>
                      <div className="flex items-start gap-3">
                        {/* Number */}
                        <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-black text-slate-400 shrink-0">{idx + 1}</div>
                        {/* Logo */}
                        <img src={company.logoPlaceholder} alt="" className="w-8 h-8 rounded-lg shrink-0 mt-0.5" onError={e => { const t = e.target as HTMLImageElement; if (t.src.includes('clearbit.com') && company.website) { const d = company.website.replace(/^https?:\/\//, '').split('/')[0]; t.src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`; } else if (!t.src.includes('ui-avatars.com')) { t.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=f8fafc&color=64748b&size=64`; } }} />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">{company.name}</span>
                            <span className="text-[10px] text-slate-400">{company.headquarters || company.region}</span>
                            {company.focus && (
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                                company.focus === 'Crypto-First' ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>{company.focus}</span>
                            )}
                          </div>
                          {/* Categories */}
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {(company.categories || []).map(cat => (
                              <span key={cat} className="text-[9px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">{cat}</span>
                            ))}
                          </div>
                          {/* Label */}
                          <div className="mt-2">
                            {editingEntryId === entry.companyId ? (
                              <div className="flex items-center gap-2">
                                <Tag size={12} className="text-slate-400 shrink-0" />
                                <input ref={labelInputRef} type="text" value={editingLabel} onChange={e => setEditingLabel(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') updateEntryLabel(entry.companyId, editingLabel); if (e.key === 'Escape') setEditingEntryId(null); }}
                                  onBlur={() => updateEntryLabel(entry.companyId, editingLabel)}
                                  placeholder="Add a label..."
                                  className="flex-1 text-xs px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                            ) : (
                              <button onClick={() => { setEditingEntryId(entry.companyId); setEditingLabel(entry.label || ''); }}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors">
                                <Tag size={11} />
                                {entry.label ? <span className="text-slate-600 italic">{entry.label}</span> : <span>Add label...</span>}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Priority selector */}
                        <div className="flex items-center gap-1 shrink-0">
                          <select value={entry.priority} onChange={e => updateEntryPriority(entry.companyId, e.target.value as ListPriority)}
                            className={`text-[10px] font-black uppercase tracking-widest px-2 py-1.5 rounded-lg border appearance-none cursor-pointer ${pCfg.bg} ${pCfg.text} ${pCfg.border}`}
                            style={{ paddingRight: '8px' }}>
                            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>

                        {/* Remove */}
                        <button onClick={() => removeEntryFromList(entry.companyId)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyLists;
