
import React, { useState, useMemo, useEffect } from 'react';
import { Company, Job, Partner, CompanyFocus, NewsItem, NewsVote, classifyNewsSourceType, NewsSourceType } from '../types';
import { ArrowLeft, Briefcase, Handshake, ExternalLink, Share2, Sparkles, Building, MapPin, Building2, Globe, RefreshCw, Trash2, Edit2, Check, X, Newspaper, Plus, Flag, Ban, DollarSign, TrendingUp, Users, UserPlus, Tag, Search, ThumbsUp, ThumbsDown } from 'lucide-react';
import { findJobOpenings, scanCompanyNews } from "../services/claudeService";
import { db } from '../services/db';
import { isJobRecent } from '../constants';
import AddNewsModal from './AddNewsModal';
import JobDetailModal from './JobDetailModal';

interface CompanyDetailProps {
  company: Company;
  onBack: () => void;
  onShare: (c: Company) => void;
  onUpdateCompany: (c: Company) => Promise<void>;
  onRefresh: (c: Company) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEditName: (id: string, newName: string) => Promise<void>;
  onAddNews: (companyName: string, news: { title: string; url: string; date: string; summary: string }) => Promise<void>;
  allCompanyIds?: Set<string>;
  allCompanyNames?: string[];
  onAddCompanyToDirectory?: (name: string) => void;
}

const generateCompanyId = (name: string) => {
  const cleanName = name
    .replace(/[,.]/g, '')
    .replace(/\s+(Inc|LLC|Ltd|Limited|Corp|Corporation|Group|Holdings|PLC|SA|AG|GmbH)$/i, '')
    .trim();
  return `c-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
};

const DetailFocusBadge: React.FC<{ focus: CompanyFocus }> = ({ focus }) => {
    if (focus === 'Crypto-First') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700 border border-violet-200">
          <Sparkles size={12} className="fill-violet-700" /> Crypto-First
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200">
        <Building2 size={12} /> Crypto-Second
      </span>
    );
};

const CompanyDetail: React.FC<CompanyDetailProps> = ({ company, onBack, onShare, onUpdateCompany, onRefresh, onDelete, onEditName, onAddNews, allCompanyIds, allCompanyNames, onAddCompanyToDirectory }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'news'>('overview');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [jobs, setJobs] = useState<Job[]>(company.jobs?.filter(j => isJobRecent(j.postedDate) && !j.hidden) || []);
  const [jobsLoaded, setJobsLoaded] = useState(!!company.jobs && company.jobs.length > 0);

  // Edit State
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(company.name);
  const [isAddNewsOpen, setIsAddNewsOpen] = useState(false);
  const [isScanningNews, setIsScanningNews] = useState(false);
  const [newsVotes, setNewsVotes] = useState<Record<string, NewsVote>>({});

  // Partner/Investor editing state
  const [addingPartnerSection, setAddingPartnerSection] = useState<'enterprise' | 'crypto' | 'investor' | null>(null);
  const [partnerSearchTerm, setPartnerSearchTerm] = useState('');
  const [showPartnerSuggestions, setShowPartnerSuggestions] = useState(false);

  // Load votes from Firestore on mount
  useEffect(() => {
    db.getNewsVotes().then(setNewsVotes).catch(() => {});
  }, []);

  // Job Interaction State
  const [flaggingJobId, setFlaggingJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Partner add-to-directory state
  const [addingPartner, setAddingPartner] = useState<string | null>(null);

  // News source type filter (Press default)
  const [newsSourceFilter, setNewsSourceFilter] = useState<'press' | 'press_release' | 'partnership'>('press');

  // News: company.recentNews merged with global store items that mention this company
  const [displayNews, setDisplayNews] = useState<NewsItem[]>(
    (company.recentNews || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  );

  useEffect(() => {
    const nameLower = company.name.toLowerCase();
    db.getNews().then(globalNews => {
      const matching = globalNews.filter(n =>
        n.relatedCompanies.some(rc => rc.toLowerCase() === nameLower)
      );
      const base = company.recentNews || [];
      const seenIds = new Set(base.map(n => n.id));
      const merged = [...base];
      matching.forEach(n => {
        if (!seenIds.has(n.id)) {
          seenIds.add(n.id);
          merged.push(n);
        }
      });
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDisplayNews(merged);
    }).catch(() => {
      // Fallback: just use recentNews
      setDisplayNews((company.recentNews || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });
  }, [company.id, company.name, company.recentNews]);

  const fetchJobs = async () => {
    setLoadingJobs(true);
    try {
      const foundJobs = await findJobOpenings(company.name);
      
      // Merge with existing jobs to preserve manual entries and deduplicate
      const existingJobs = company.jobs || [];
      const mergedJobs = [...existingJobs];
      
      foundJobs.forEach(job => {
        const exists = mergedJobs.some(e => 
            (e.url && job.url && e.url === job.url) || 
            (e.title.toLowerCase() === job.title.toLowerCase() && e.postedDate === job.postedDate)
        );
        if (!exists) {
            mergedJobs.push(job);
        }
      });
      
      // Clean up old jobs during update, but keep hidden ones in data (just don't show)
      const validJobs = mergedJobs.filter(j => isJobRecent(j.postedDate));

      setJobs(validJobs.filter(j => !j.hidden));
      setJobsLoaded(true);
      
      // Update global state with merged jobs
      const updatedCompany = { ...company, jobs: validJobs };
      await onUpdateCompany(updatedCompany);
    } catch (e) {
      console.error("Failed to fetch jobs", e);
    }
    setLoadingJobs(false);
  };

  const handleDismissJob = async (jobId: string, reason: string) => {
      const updatedJobs = (company.jobs || []).map(j => {
          if (j.id === jobId) {
              return { ...j, hidden: true, dismissReason: reason };
          }
          return j;
      });

      // Update local visible state
      setJobs(updatedJobs.filter(j => !j.hidden && isJobRecent(j.postedDate)));
      
      // Update persistent state
      const updatedCompany = { ...company, jobs: updatedJobs };
      await onUpdateCompany(updatedCompany);
      setFlaggingJobId(null);
  };

  const handleRefreshClick = async () => {
      setIsRefreshing(true);
      try {
          await onRefresh(company);
      } catch (e) {
          console.error("Failed to refresh company data", e);
      }
      setIsRefreshing(false);
  };

  const handleScanNews = async () => {
      setIsScanningNews(true);
      try {
          const voteFeedback = await db.getVoteSummaryForAI(company.name, displayNews);
          const scannedNews = await scanCompanyNews(company.name, voteFeedback);
          if (scannedNews.length > 0) {
              const existingIds = new Set(displayNews.map(n => n.id));
              const existingTitles = new Set(displayNews.map(n => n.title.toLowerCase()));
              const newItems = scannedNews.filter(n => !existingIds.has(n.id) && !existingTitles.has(n.title.toLowerCase()));
              if (newItems.length > 0) {
                  const merged = [...newItems, ...displayNews].sort(
                      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                  );
                  setDisplayNews(merged);
                  const updatedCompany = {
                      ...company,
                      recentNews: [...(company.recentNews || []), ...newItems],
                  };
                  await onUpdateCompany(updatedCompany);
              }
          }
      } catch (e) {
          console.error("Failed to scan news", e);
      }
      setIsScanningNews(false);
  };

  const handleNewsVote = async (newsId: string, vote: NewsVote) => {
      const current = newsVotes[newsId];
      const newVote = current === vote ? undefined : vote;
      // Optimistic update
      setNewsVotes(prev => {
          const next = { ...prev };
          if (newVote) { next[newsId] = newVote; } else { delete next[newsId]; }
          return next;
      });
      // Persist to Firestore + localStorage
      await db.setNewsVote(newsId, newVote);
  };

  const handleDeleteClick = async () => {
      if (window.confirm(`Are you sure you want to delete ${company.name} from the directory? This action cannot be undone.`)) {
          setIsDeleting(true);
          try {
            await onDelete(company.id);
            // We do NOT call onBack() here because the parent component (App.tsx) 
            // handles setting selectedCompany to null when delete is successful, 
            // which automatically unmounts this view.
          } catch (e) {
            console.error("Delete failed", e);
            setIsDeleting(false);
          }
      }
  };

  const saveNameEdit = async () => {
      if (tempName.trim() && tempName !== company.name) {
          await onEditName(company.id, tempName);
      }
      setIsEditingName(false);
  };

  // News filtering by source type
  const newsSourceCounts = useMemo(() => {
    const counts = { press: 0, press_release: 0, partnership: 0 };
    displayNews.forEach(item => { counts[classifyNewsSourceType(item)]++; });
    return counts;
  }, [displayNews]);

  const filteredDisplayNews = useMemo(() =>
    displayNews.filter(item => classifyNewsSourceType(item) === newsSourceFilter),
    [displayNews, newsSourceFilter]
  );

  // Partner add/remove handlers (type-specific: same company can be both partner & investor)
  const handleRemovePartner = async (partnerName: string, partnerType: Partner['type']) => {
    const updatedPartners = company.partners.filter(
      p => !(p.name === partnerName && p.type === partnerType)
    );
    await onUpdateCompany({ ...company, partners: updatedPartners });
  };

  const handleAddPartner = async (name: string, type: Partner['type']) => {
    if (!name.trim()) return;
    // Allow same name with different type (e.g. Visa as both Fortune500Global and Investor)
    const already = company.partners.some(
      p => p.name.toLowerCase() === name.trim().toLowerCase() && p.type === type
    );
    if (already) return;
    const newPartner: Partner = {
      name: name.trim(),
      type,
      description: type !== 'Investor' ? `Partnership with ${company.name}.` : '',
    };
    await onUpdateCompany({ ...company, partners: [...company.partners, newPartner] });
    setPartnerSearchTerm('');
    setAddingPartnerSection(null);
    setShowPartnerSuggestions(false);
  };

  const partnerSuggestions = useMemo(() => {
    if (!partnerSearchTerm.trim() || !allCompanyNames || !addingPartnerSection) return [];
    const q = partnerSearchTerm.toLowerCase();
    const typeForSection = addingPartnerSection === 'enterprise' ? 'Fortune500Global' : addingPartnerSection === 'crypto' ? 'CryptoNative' : 'Investor';
    // Only exclude names that already have THIS type (same company can be partner + investor)
    const existingForType = new Set(
      company.partners.filter(p => p.type === typeForSection).map(p => p.name.toLowerCase())
    );
    existingForType.add(company.name.toLowerCase());
    return allCompanyNames
      .filter(n => n.toLowerCase().includes(q) && !existingForType.has(n.toLowerCase()))
      .slice(0, 8);
  }, [partnerSearchTerm, allCompanyNames, company.partners, company.name, addingPartnerSection]);

  // Filter partners by type - Merged Enterprise
  const enterprisePartners = company.partners.filter(p =>
    p.type === 'Fortune500Global' ||
    p.type === 'Fortune500' as any
  );
  const cryptoPartners = company.partners.filter(p => p.type === 'CryptoNative');
  const investorPartners = company.partners.filter(p => p.type === 'Investor');

  // Domain extraction for fallback
  const getDomain = () => {
      if (company.website) {
          try {
              return new URL(company.website.startsWith('http') ? company.website : `https://${company.website}`).hostname;
          } catch(e) { return ''; }
      }
      return '';
  };

  // Inline partner autocomplete component
  const PartnerAutocomplete: React.FC<{ type: Partner['type']; onClose: () => void }> = ({ type, onClose }) => (
    <div className="mt-3 relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            autoFocus
            type="text"
            value={partnerSearchTerm}
            onChange={e => { setPartnerSearchTerm(e.target.value); setShowPartnerSuggestions(true); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && partnerSearchTerm.trim()) handleAddPartner(partnerSearchTerm, type);
              if (e.key === 'Escape') { onClose(); setPartnerSearchTerm(''); }
            }}
            placeholder={type === 'Investor' ? 'Search or type investor name...' : 'Search or type company name...'}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
          {showPartnerSuggestions && partnerSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 max-h-48 overflow-y-auto">
              {partnerSuggestions.map(name => (
                <button
                  key={name}
                  onClick={() => handleAddPartner(name, type)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                >
                  <Building2 size={12} className="text-slate-400" />
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => { if (partnerSearchTerm.trim()) handleAddPartner(partnerSearchTerm, type); }} className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
          Add
        </button>
        <button onClick={() => { onClose(); setPartnerSearchTerm(''); setShowPartnerSuggestions(false); }} className="p-2 text-slate-400 hover:text-slate-600">
          <X size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm min-h-[80vh] relative">
      <AddNewsModal 
        isOpen={isAddNewsOpen} 
        onClose={() => setIsAddNewsOpen(false)} 
        onSave={(news) => onAddNews(company.name, news)}
        companyName={company.name}
      />

      {selectedJob && (
          <JobDetailModal 
            job={selectedJob} 
            companyName={company.name} 
            companyLogo={company.logoPlaceholder}
            isOpen={!!selectedJob}
            onClose={() => setSelectedJob(null)}
          />
      )}

      {/* Header */}
      <div className="p-6 border-b border-slate-100">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 mb-4 text-sm font-medium">
          <ArrowLeft size={16} /> Back to Directory
        </button>
        
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
          <div className="flex items-start gap-4">
             <img 
                  src={company.logoPlaceholder} 
                  alt={company.name} 
                  className="w-20 h-20 rounded-xl bg-white border border-slate-200 object-contain p-2 shadow-sm" 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    const domain = getDomain();
                    
                    // Fallback Chain: Clearbit (Default) -> Google Favicon -> UI Avatar
                    if (target.src.includes('logo.clearbit.com') && domain) {
                         target.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                    } else if (target.src.includes('google.com')) {
                         target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=f8fafc&color=64748b&size=128`;
                    }
                  }}
            />
            <div>
              <div className="flex items-center gap-3">
                 {isEditingName ? (
                     <div className="flex items-center gap-2">
                         <input 
                            type="text" 
                            value={tempName} 
                            onChange={(e) => setTempName(e.target.value)}
                            className="text-2xl font-bold text-slate-900 border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                         />
                         <button onClick={saveNameEdit} className="p-1.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"><Check size={16} /></button>
                         <button onClick={() => { setIsEditingName(false); setTempName(company.name); }} className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"><X size={16} /></button>
                     </div>
                 ) : (
                     <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2 group">
                         {company.name}
                         <button onClick={() => setIsEditingName(true)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 transition-all">
                             <Edit2 size={16} />
                         </button>
                     </h1>
                 )}
                 <DetailFocusBadge focus={company.focus} />
              </div>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                 {company.headquarters && (
                   <span className="flex items-center gap-1 text-slate-500 text-sm mr-2">
                     <MapPin size={14} /> {company.headquarters}
                   </span>
                 )}
                 {company.country && (
                   <span className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-medium">
                     <Globe size={11} /> {company.country}
                   </span>
                 )}
                 {company.industry && (
                   <span className="flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-xs font-medium">
                     <Tag size={11} /> {company.industry}
                   </span>
                 )}
                 {company.categories.map(c => (
                  <span key={c} className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button 
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-70 font-medium text-sm"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? 'Analyzing...' : 'Refresh Intelligence'}
            </button>
            <button 
              onClick={() => onShare(company)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-sm"
            >
              <Share2 size={16} /> Share
            </button>
            <a 
              href={company.website} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
            >
              Visit Website <ExternalLink size={14} />
            </a>
          </div>
        </div>
        
        <p className="mt-6 text-slate-600 leading-relaxed max-w-3xl">
          {company.description}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-6">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`py-4 px-2 mr-6 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Handshake size={16} /> Partnerships & Network
        </button>
        <button 
          onClick={() => setActiveTab('news')}
          className={`py-4 px-2 mr-6 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'news' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Newspaper size={16} /> News & Activity
        </button>
        <button 
          onClick={() => setActiveTab('jobs')}
          className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'jobs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Briefcase size={16} /> Talent & Jobs
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            
            {/* Funding Info (Only for Crypto-First) */}
            {company.focus === 'Crypto-First' && (
                <div className="col-span-full mb-2">
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500 opacity-10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <DollarSign size={20} className="text-emerald-400" /> Funding & Backing
                            </h3>
                            {company.funding?.lastRoundDate && (
                                <span className="text-xs bg-white/10 px-2 py-1 rounded text-slate-300">
                                    Last Round: {company.funding.lastRoundDate}
                                </span>
                            )}
                        </div>
                        
                        {company.funding ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Raised</div>
                                    <div className="text-2xl font-bold text-white">{company.funding.totalRaised || "Undisclosed"}</div>
                                </div>
                                <div>
                                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Latest Valuation</div>
                                    <div className="text-2xl font-bold text-white">{company.funding.valuation || "Unknown"}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-slate-400 text-sm italic">
                                Funding details not yet analyzed. Click "Refresh Intelligence" to update.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Investor Partners */}
            <div className="col-span-full">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2 uppercase tracking-wide">
                    <TrendingUp size={16} className="text-amber-600" /> Investors & Backers
                  </h3>
                  {addingPartnerSection !== 'investor' && (
                    <button
                      onClick={() => { setAddingPartnerSection('investor'); setPartnerSearchTerm(''); }}
                      className="flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded-md transition-colors"
                    >
                      <Plus size={11} /> Add Investor
                    </button>
                  )}
                </div>
                {investorPartners.length === 0 && addingPartnerSection !== 'investor' ? (
                  <p className="text-xs text-amber-700 italic">No investors tracked.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {investorPartners.map((p, idx) => (
                      <div key={idx} className="bg-white border border-amber-200 rounded-lg px-3 py-2 shadow-sm min-w-[160px] group/card relative">
                        <button
                          onClick={() => handleRemovePartner(p.name, p.type)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-200"
                          title="Remove investor"
                        >
                          <X size={10} />
                        </button>
                        <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                        {p.date && (
                          <div className="text-[10px] text-amber-600 font-medium mt-1">{p.date}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {addingPartnerSection === 'investor' && (
                  <PartnerAutocomplete type="Investor" onClose={() => setAddingPartnerSection(null)} />
                )}
              </div>
            </div>

            {/* Fortune 500 & Enterprise Column (Merged) */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                  <Globe size={16} className="text-blue-600" /> Fortune 500 & Enterprise
                </h3>
                {addingPartnerSection !== 'enterprise' && (
                  <button
                    onClick={() => { setAddingPartnerSection('enterprise'); setPartnerSearchTerm(''); }}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded-md transition-colors"
                  >
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
              {enterprisePartners.length === 0 && addingPartnerSection !== 'enterprise' ? (
                <p className="text-xs text-slate-500 italic">No partnerships tracked.</p>
              ) : (
                <ul className="space-y-3">
                  {enterprisePartners.map((p, idx) => {
                    const inDirectory = allCompanyIds?.has(generateCompanyId(p.name));
                    return (
                      <li key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group/card relative">
                        <button
                          onClick={() => handleRemovePartner(p.name, p.type)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-200"
                          title="Remove partner"
                        >
                          <X size={10} />
                        </button>
                        <div className="flex justify-between items-start">
                          <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                          <div className="flex items-center gap-2">
                            {p.type === 'Fortune500Global' && <span className="text-[9px] text-slate-400 font-bold uppercase">Global</span>}
                            {allCompanyIds && onAddCompanyToDirectory && (
                              inDirectory ? (
                                <span className="text-[9px] text-emerald-500 font-bold flex items-center gap-0.5"><Check size={10} /> In Directory</span>
                              ) : (
                                <button
                                  onClick={() => { setAddingPartner(p.name); onAddCompanyToDirectory(p.name); }}
                                  disabled={addingPartner === p.name}
                                  className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 disabled:opacity-50"
                                >
                                  <UserPlus size={10} /> {addingPartner === p.name ? 'Adding...' : 'Add'}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">{p.description}</div>
                        {(p.country || p.industry) && (
                          <div className="flex items-center gap-2 mt-1.5">
                            {p.country && <span className="text-[9px] text-slate-400 font-medium">{p.country}{p.region ? ` (${p.region})` : ''}</span>}
                            {p.country && p.industry && <span className="text-[9px] text-slate-300">|</span>}
                            {p.industry && <span className="text-[9px] text-indigo-400 font-medium">{p.industry}</span>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {addingPartnerSection === 'enterprise' && (
                <PartnerAutocomplete type="Fortune500Global" onClose={() => setAddingPartnerSection(null)} />
              )}
            </div>

            {/* Crypto Native Column */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                  <Sparkles size={16} className="text-indigo-600" /> Crypto Native
                </h3>
                {addingPartnerSection !== 'crypto' && (
                  <button
                    onClick={() => { setAddingPartnerSection('crypto'); setPartnerSearchTerm(''); }}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded-md transition-colors"
                  >
                    <Plus size={11} /> Add
                  </button>
                )}
              </div>
               {cryptoPartners.length === 0 && addingPartnerSection !== 'crypto' ? (
                <p className="text-xs text-slate-500 italic">No partnerships tracked.</p>
              ) : (
                <ul className="space-y-3">
                  {cryptoPartners.map((p, idx) => {
                    const inDirectory = allCompanyIds?.has(generateCompanyId(p.name));
                    return (
                      <li key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group/card relative">
                        <button
                          onClick={() => handleRemovePartner(p.name, p.type)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-100 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-200"
                          title="Remove partner"
                        >
                          <X size={10} />
                        </button>
                        <div className="flex justify-between items-start">
                          <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                          {allCompanyIds && onAddCompanyToDirectory && (
                            inDirectory ? (
                              <span className="text-[9px] text-emerald-500 font-bold flex items-center gap-0.5"><Check size={10} /> In Directory</span>
                            ) : (
                              <button
                                onClick={() => { setAddingPartner(p.name); onAddCompanyToDirectory(p.name); }}
                                disabled={addingPartner === p.name}
                                className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 disabled:opacity-50"
                              >
                                <UserPlus size={10} /> {addingPartner === p.name ? 'Adding...' : 'Add'}
                              </button>
                            )
                          )}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">{p.description}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {addingPartnerSection === 'crypto' && (
                <PartnerAutocomplete type="CryptoNative" onClose={() => setAddingPartnerSection(null)} />
              )}
            </div>
          </div>
        )}

        {activeTab === 'news' && (
            <div>
               <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-slate-900">Latest Intelligence</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleScanNews}
                      disabled={isScanningNews}
                      className="flex items-center gap-2 border border-indigo-200 text-indigo-700 bg-indigo-50 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors disabled:opacity-60"
                    >
                        <Search size={14} className={isScanningNews ? "animate-pulse" : ""} />
                        {isScanningNews ? 'Scanning...' : 'AI Scan'}
                    </button>
                    <button
                      onClick={() => setIsAddNewsOpen(true)}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        <Plus size={14} /> Add News Link
                    </button>
                  </div>
               </div>

               {/* Source type category tabs */}
               <div className="flex gap-2 mb-5">
                 {([
                   { key: 'press' as const, label: 'Press', count: newsSourceCounts.press, color: 'blue' },
                   { key: 'partnership' as const, label: 'Partnership', count: newsSourceCounts.partnership, color: 'emerald' },
                   { key: 'press_release' as const, label: 'Press Releases', count: newsSourceCounts.press_release, color: 'amber' },
                 ]).map(({ key, label, count, color }) => (
                   <button
                     key={key}
                     onClick={() => setNewsSourceFilter(key)}
                     className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                       newsSourceFilter === key
                         ? `bg-${color}-600 text-white shadow-sm`
                         : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                     }`}
                     style={newsSourceFilter === key ? {
                       backgroundColor: color === 'blue' ? '#2563eb' : color === 'emerald' ? '#059669' : '#d97706',
                       color: 'white'
                     } : undefined}
                   >
                     {label} <span className="opacity-70 ml-1">{count}</span>
                   </button>
                 ))}
               </div>

               {displayNews.length === 0 ? (
                   <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                       <Newspaper size={32} className="mx-auto text-slate-300 mb-2" />
                       <p className="text-slate-500 text-sm font-medium">No recent news tracked.</p>
                       <p className="text-slate-400 text-xs mt-1">Add a link to keep this profile updated.</p>
                   </div>
               ) : filteredDisplayNews.length === 0 ? (
                   <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                       <p className="text-slate-400 text-sm">No {newsSourceFilter === 'press' ? 'press' : newsSourceFilter === 'partnership' ? 'partnership' : 'press release'} articles found.</p>
                   </div>
               ) : (
                   <div className="space-y-4">
                       {filteredDisplayNews.map(item => (
                           <div key={item.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                                <div className="flex justify-between items-start mb-2">
                                    {(() => {
                                        const st = classifyNewsSourceType(item);
                                        const colors: Record<NewsSourceType, string> = {
                                            press: 'bg-blue-50 text-blue-700 border-blue-100',
                                            press_release: 'bg-amber-50 text-amber-700 border-amber-100',
                                            partnership: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                                        };
                                        const labels: Record<NewsSourceType, string> = { press: 'Press', press_release: 'Press Release', partnership: 'Partnership' };
                                        return (
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide border ${colors[st]}`}>
                                                    {labels[st]}
                                                </span>
                                                {item.source && !['Directory Intelligence', 'Intelligence', 'Manual Entry'].includes(item.source) && (
                                                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded uppercase tracking-wide">
                                                        {item.source}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    <span className="text-slate-400 text-xs font-medium">{item.date}</span>
                                </div>
                                <h4 className="text-base font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">
                                    {item.title}
                                </h4>
                                <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                    {item.summary}
                                </p>
                                <div className="flex items-center justify-between">
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                                    >
                                        Read Source <ExternalLink size={12} />
                                    </a>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleNewsVote(item.id, 'up')}
                                            className={`p-1.5 rounded-md transition-colors ${newsVotes[item.id] === 'up' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                            title="Relevant — show more like this"
                                        >
                                            <ThumbsUp size={13} />
                                        </button>
                                        <button
                                            onClick={() => handleNewsVote(item.id, 'down')}
                                            className={`p-1.5 rounded-md transition-colors ${newsVotes[item.id] === 'down' ? 'bg-red-100 text-red-600' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                                            title="Not relevant — show fewer like this"
                                        >
                                            <ThumbsDown size={13} />
                                        </button>
                                    </div>
                                </div>
                           </div>
                       ))}
                   </div>
               )}
            </div>
        )}

        {activeTab === 'jobs' && (
          <div>
            {!jobsLoaded && !loadingJobs && (
              <div className="text-center py-12">
                <p className="text-slate-500 mb-4">Click below to scan for active strategy, CS, and BD roles.</p>
                <button 
                  onClick={fetchJobs}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Scan Job Boards (AI)
                </button>
              </div>
            )}

            {loadingJobs && (
              <div className="text-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
                <p className="text-slate-600">Scanning for open positions...</p>
              </div>
            )}

            {jobs.length > 0 && (
               <div className="space-y-3">
                 <h3 className="font-semibold text-slate-900 mb-4">Open Positions ({jobs.length})</h3>
                 <p className="text-xs text-slate-400 mb-2">Showing positions posted in last 6 months</p>
                 {jobs.map(job => (
                   <div key={job.id} className="relative flex justify-between items-center p-4 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors group">
                      <div>
                        <h4 className="font-medium text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setSelectedJob(job)}>
                            {job.title}
                        </h4>
                        <div className="flex gap-3 text-sm text-slate-500 mt-1">
                          <span>{job.department}</span>
                          <span>•</span>
                          <span>{job.locations.join(', ')}</span>
                          <span>•</span>
                          <span>Posted {job.postedDate}</span>
                        </div>
                        {job.salary && (
                            <div className="mt-2 text-xs font-semibold text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded">
                                {job.salary}
                            </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                          <button 
                             onClick={() => setSelectedJob(job)} 
                             className="text-indigo-600 text-sm font-medium hover:bg-indigo-50 px-3 py-1.5 rounded transition-colors"
                          >
                             View Details
                          </button>
                          
                          <div className="relative">
                              <button 
                                onClick={() => setFlaggingJobId(flaggingJobId === job.id ? null : job.id)}
                                className="text-slate-300 hover:text-red-500 p-1 rounded-full transition-colors"
                                title="Report issue with this job"
                              >
                                  <Flag size={14} />
                              </button>
                              
                              {flaggingJobId === job.id && (
                                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 bg-slate-50 border-b border-slate-100">
                                          Dismiss Job
                                      </div>
                                      <button 
                                        onClick={() => handleDismissJob(job.id, 'Incorrect Company')}
                                        className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                      >
                                          <Ban size={12} className="text-red-500" /> Wrong Company
                                      </button>
                                      <button 
                                        onClick={() => handleDismissJob(job.id, 'Not Crypto')}
                                        className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                      >
                                          <X size={12} /> Not Relevant
                                      </button>
                                  </div>
                              )}
                          </div>
                      </div>
                   </div>
                 ))}
               </div>
            )}

            {jobsLoaded && jobs.length === 0 && !loadingJobs && (
               <div className="text-center py-8 text-slate-500">No specific roles found in selected departments (last 6 months).</div>
            )}
          </div>
        )}
      </div>

      {/* Footer / Danger Zone */}
      <div className="p-6 border-t border-slate-100 flex justify-end">
          <button 
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className="text-red-500 text-xs font-medium hover:text-red-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
              {isDeleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {isDeleting ? 'Deleting...' : 'Delete Company'}
          </button>
      </div>
    </div>
  );
};

export default CompanyDetail;
