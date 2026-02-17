
import React, { useMemo, useState } from 'react';
import { FortuneGlobal500Company, NewsItem } from '../types';
import { ArrowLeft, RefreshCw, ExternalLink, Globe, ShieldCheck, Newspaper, Building2, Sparkles, AlertCircle, MapPin, User, Briefcase, Telescope, Plus } from 'lucide-react';
import { LOGO_DOMAIN_OVERRIDES } from './GlobalPartnershipMatrix';
import AddNewsModal from './AddNewsModal';

interface GlobalCompanyDetailProps {
  company: FortuneGlobal500Company;
  onBack: () => void;
  onResearch: (name: string, rank: number) => void;
  isResearching: boolean;
  onAddNews: (companyName: string, news: { title: string; url: string; date: string; summary: string }) => void;
}

const GlobalCompanyDetail: React.FC<GlobalCompanyDetailProps> = ({ company, onBack, onResearch, isResearching, onAddNews }) => {
  const [isAddNewsOpen, setIsAddNewsOpen] = useState(false);
  
  // Determine Status
  const hasPartnerships = company.activePartnerships && company.activePartnerships.length > 0;
  const hasResearch = company.researchData && company.researchData.initiatives.length > 0;
  const hasNews = company.newsMentions && company.newsMentions.length > 0;
  
  let status: 'Strategic' | 'Exploring' | 'Evaluating' = 'Evaluating';
  if (hasPartnerships) status = 'Strategic';
  else if (hasResearch || hasNews) status = 'Exploring';

  // Combine and Sort Activity Feed
  const activityFeed = useMemo(() => {
    const feed: { 
      type: 'Initiative' | 'News' | 'Partnership'; 
      date: string; 
      title: string; 
      summary: string; 
      url?: string;
      source?: string;
    }[] = [];

    // Add Research Initiatives
    if (company.researchData?.initiatives) {
      company.researchData.initiatives.forEach(init => {
        feed.push({
          type: 'Initiative',
          date: init.date || 'Recent',
          title: init.title,
          summary: init.description,
          url: init.sourceUrl,
          source: 'AI Research'
        });
      });
    }

    // Add News Mentions
    if (company.newsMentions) {
      company.newsMentions.forEach(news => {
        feed.push({
          type: 'News',
          date: news.date,
          title: news.title,
          summary: news.summary,
          url: news.url,
          source: news.source
        });
      });
    }

    // Sort by Date Descending
    return feed.sort((a, b) => {
        if (a.date === 'Recent') return -1;
        if (b.date === 'Recent') return 1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [company]);

  // Logo Logic
  const getDomain = (company: FortuneGlobal500Company) => {
      // 0. Check Overrides
      if (LOGO_DOMAIN_OVERRIDES[company.name]) {
          return LOGO_DOMAIN_OVERRIDES[company.name];
      }

      // 1. Try website from data
      if (company.website) {
          try {
              const safeUrl = company.website.startsWith('http') ? company.website : `https://${company.website}`;
              return new URL(safeUrl).hostname.replace('www.', '');
          } catch (e) {
              // ignore
          }
      }

      // 2. Fallback: Guess based on name with better cleaning
      const cleanName = company.name
        .replace(/ Group/i, '')
        .replace(/ Holdings/i, '')
        .replace(/ Corporation/i, '')
        .replace(/ Limited/i, '')
        .replace(/ Company/i, '')
        .replace(/ Inc/i, '')
        .replace(/&/g, 'and');

      return `${cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}.com`;
  };

  const domain = getDomain(company);
  const logoSrc = `https://logo.clearbit.com/${domain}`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm min-h-[80vh] animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
      <AddNewsModal 
        isOpen={isAddNewsOpen} 
        onClose={() => setIsAddNewsOpen(false)} 
        onSave={(news) => onAddNews(company.name, news)}
        companyName={company.name}
      />

      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 mb-6 text-sm font-medium transition-colors">
          <ArrowLeft size={16} /> Back to Global Map
        </button>
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex items-center gap-5">
             <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 p-2 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                <img 
                    src={logoSrc} 
                    alt={company.name} 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // 1. Try Clearbit -> 2. Try Google Favicon -> 3. Fallback to Initials
                        if (target.src.includes('logo.clearbit.com')) {
                             target.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                        } else if (target.src.includes('google.com')) {
                             target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=f8fafc&color=64748b&size=128`;
                        }
                    }}
                />
             </div>
             <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-slate-900">{company.name}</h1>
                    
                    {status === 'Strategic' && (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200 uppercase tracking-wide">
                            <ShieldCheck size={14} /> Strategic Partner
                        </span>
                    )}
                    {status === 'Exploring' && (
                        <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold border border-blue-200 uppercase tracking-wide">
                            <Telescope size={14} /> Exploring
                        </span>
                    )}
                    {status === 'Evaluating' && (
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200 uppercase tracking-wide">
                            <AlertCircle size={14} /> Evaluating
                        </span>
                    )}
                </div>
                
                {/* Enriched Metadata Row */}
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600 font-medium items-center">
                    <span className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm text-xs">
                        <Globe size={12} className="text-indigo-500" /> Rank #{company.rank}
                    </span>
                    {company.industry && (
                        <span className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm text-xs">
                            <Briefcase size={12} className="text-slate-400" /> {company.industry}
                        </span>
                    )}
                    {company.ceo && (
                        <span className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm text-xs">
                            <User size={12} className="text-slate-400" /> CEO: {company.ceo}
                        </span>
                    )}
                    {company.hqLocation && (
                        <span className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm text-xs">
                            <MapPin size={12} className="text-slate-400" /> {company.hqLocation}
                        </span>
                    )}
                </div>
             </div>
          </div>

          <div className="flex flex-col items-end gap-2">
             <button 
                onClick={() => onResearch(company.name, company.rank)}
                disabled={isResearching}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all text-sm font-bold disabled:opacity-70 disabled:cursor-not-allowed"
             >
                <RefreshCw size={16} className={isResearching ? "animate-spin" : ""} />
                {isResearching ? 'Analyzing...' : 'Update Intelligence'}
             </button>
             {company.website && (
                 <a 
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium"
                 >
                    Visit Website <ExternalLink size={10} />
                 </a>
             )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-0 lg:divide-x divide-slate-100">
          {/* Left Column: Summary & Partnerships */}
          <div className="col-span-1 p-6 space-y-8">
              
              {/* Executive Summary */}
              <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Sparkles size={14} className="text-indigo-500" /> Executive Summary
                  </h3>
                  {company.researchData ? (
                      <div>
                          <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl text-slate-700 text-sm leading-relaxed shadow-sm">
                              {company.researchData.summary}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2 text-right">
                              Last Updated: {new Date(company.researchData.lastUpdated).toLocaleDateString()}
                          </p>
                      </div>
                  ) : (
                      <div className="bg-slate-50 border border-slate-200 border-dashed p-6 rounded-xl text-center">
                          <p className="text-slate-500 text-sm mb-3">No AI analysis generated yet.</p>
                          <button 
                            onClick={() => onResearch(company.name, company.rank)}
                            className="text-indigo-600 font-bold text-sm hover:underline"
                          >
                              Run Analysis Now
                          </button>
                      </div>
                  )}
              </section>

              {/* Partnerships */}
              <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Building2 size={14} className="text-slate-500" /> Directory Partners
                  </h3>
                  {company.activePartnerships && company.activePartnerships.length > 0 ? (
                      <div className="space-y-3">
                          {company.activePartnerships.map((p, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 transition-colors shadow-sm">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                      <span className="text-xs font-black text-indigo-600">{p.cryptoCompany.charAt(0)}</span>
                                  </div>
                                  <div>
                                      <div className="font-bold text-slate-900 text-sm">{p.cryptoCompany}</div>
                                      <div className="text-xs text-slate-600 leading-snug mt-0.5">{p.description}</div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="text-sm text-slate-400 italic">No direct partnerships found in current directory.</div>
                  )}
              </section>
          </div>

          {/* Right Column: Activity Feed */}
          <div className="col-span-2 p-6 bg-slate-50/30">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Newspaper size={14} className="text-slate-500" /> Activity Feed & Media
                  </h3>
                  <button 
                    onClick={() => setIsAddNewsOpen(true)}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-white border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm"
                  >
                      <Plus size={12} /> Add Link
                  </button>
              </div>

              {activityFeed.length > 0 ? (
                  <div className="space-y-4">
                      {activityFeed.map((item, idx) => (
                          <div key={idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                              <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-2">
                                      {item.type === 'Initiative' ? (
                                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                                              Initiative
                                          </span>
                                      ) : (
                                          <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
                                              News
                                          </span>
                                      )}
                                      <span className="text-slate-400 text-[10px] font-medium">{item.date}</span>
                                  </div>
                                  {item.source && <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{item.source}</span>}
                              </div>
                              
                              <h4 className="text-base font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">
                                  {item.title}
                              </h4>
                              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                  {item.summary}
                              </p>

                              {item.url && (
                                  <a 
                                    href={item.url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                                  >
                                      Read Full Article <ExternalLink size={12} />
                                  </a>
                              )}
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                      <Newspaper size={32} className="text-slate-300 mb-3" />
                      <p className="text-slate-500 font-medium text-sm">No activity recorded yet.</p>
                      <p className="text-slate-400 text-xs mt-1">Run "Update Intelligence" or add a manual link.</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default GlobalCompanyDetail;
