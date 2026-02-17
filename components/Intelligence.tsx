
import React, { useEffect, useState } from 'react';
import { NewsItem } from '../types';
import { fetchIndustryNews } from "../services/claudeService";
import { db } from '../services/db';
import { MOCK_NEWS } from '../constants';
import { Newspaper, RefreshCw, ExternalLink, Database, Filter, ChevronLeft, ChevronRight, Globe, TrendingUp, UserCheck } from 'lucide-react';

const ITEMS_PER_PAGE = 50;

interface IntelligenceProps {
    directoryCompanies?: string[];
}

const Intelligence: React.FC<IntelligenceProps> = ({ directoryCompanies = [] }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<'All' | 'Global' | 'Directory'>('All');

  // Helper to check for old news
  const isWithinLast12Months = (dateStr: string) => {
    if (!dateStr) return true;
    const date = new Date(dateStr);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return date > oneYearAgo;
  };

  // Load from DB on mount
  useEffect(() => {
    const loadNews = async () => {
      let storedNews = await db.getNews();
      
      // Filter out outdated news from storage
      storedNews = storedNews.filter(n => isWithinLast12Months(n.date));

      // Detect if we are using mock data
      const isMock = JSON.stringify(storedNews) === JSON.stringify(MOCK_NEWS);
      const isEmpty = storedNews.length === 0;

      if (isMock || isEmpty) {
         console.log("Database empty, outdated, or using mocks. Auto-fetching fresh intelligence...");
         try {
           const freshNews = await fetchIndustryNews(directoryCompanies);
           if (freshNews.length > 0) {
             storedNews = freshNews;
             await db.saveNews(freshNews);
           }
         } catch(e) {
           console.warn("Auto-fetch failed, falling back to mocks", e);
           if (isEmpty) storedNews = MOCK_NEWS;
         }
      }
      
      setNews(storedNews);
      setInitializing(false);
    };
    loadNews();
  }, [directoryCompanies]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const freshNews = await fetchIndustryNews(directoryCompanies);
      if (freshNews.length > 0) {
        const existingTitles = new Set(news.map(n => n.title));
        const uniqueFreshNews = freshNews.filter(n => !existingTitles.has(n.title));

        if (uniqueFreshNews.length > 0) {
           const updatedNews = [...uniqueFreshNews, ...news]
              .filter(n => isWithinLast12Months(n.date))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
           
           setNews(updatedNews);
           await db.saveNews(updatedNews);
        }
      }
    } catch (e) {
      console.error("Failed to refresh news", e);
    }
    setLoading(false);
  };

  // Filter Logic
  const filteredNews = news.filter(item => {
      if (filterType === 'Global') {
          return item.summary.toLowerCase().includes('global') || 
                 item.summary.toLowerCase().includes('international') || 
                 item.relatedCompanies.some(c => ['Samsung', 'Sony', 'Siemens', 'HSBC', 'Standard Chartered', 'Societe Generale'].includes(c));
      }
      if (filterType === 'Directory') {
          return item.relatedCompanies.some(c => 
            directoryCompanies.some(dc => dc.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(dc.toLowerCase()))
          );
      }
      return true;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredNews.length / ITEMS_PER_PAGE);
  
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredNews.length, totalPages]);

  const paginatedNews = filteredNews.slice(
    (currentPage - 1) * ITEMS_PER_PAGE, 
    currentPage * ITEMS_PER_PAGE
  );

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (initializing) {
     return (
        <div className="max-w-4xl mx-auto py-12 flex flex-col items-center text-slate-400">
           <Database className="animate-pulse mb-4" size={32} />
           <p className="font-medium">Syncing Global Intelligence Feed...</p>
        </div>
     );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
              <div className="flex items-center gap-3 mb-4">
                  <Globe className="opacity-80" size={20} />
                  <h3 className="font-bold text-lg">Fortune Global 500 Activity</h3>
              </div>
              <p className="text-indigo-100 text-sm leading-relaxed mb-4">
                  Real-time monitoring of non-US corporate giants exploring digital assets, CBDCs, and cross-border settlement.
              </p>
              <div className="flex items-center gap-2 text-xs font-bold bg-white/10 w-fit px-3 py-1 rounded-full border border-white/20">
                  <TrendingUp size={12} /> Active Monitoring
              </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">Enterprise Intelligence</h3>
                <p className="text-slate-500 text-sm">Automated tracking for Global 500 and your tracked directory companies.</p>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                  <button 
                    onClick={() => setFilterType('All')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'All' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    All News
                  </button>
                  <button 
                    onClick={() => setFilterType('Directory')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${filterType === 'Directory' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    <UserCheck size={12} /> My Directory
                  </button>
                  <button 
                    onClick={() => setFilterType('Global')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${filterType === 'Global' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    <Globe size={12} /> Global 500
                  </button>
              </div>
          </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Intelligence Feed</h2>
           <p className="text-slate-500 text-sm mt-1">
             Tracking the latest blockchain initiatives across the world's largest enterprises.
           </p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all text-sm font-bold disabled:opacity-50 active:scale-95"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Performing Deep Scan...' : 'Check All Activity'}
        </button>
      </div>

      <div className="space-y-4">
        {filteredNews.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
             <Filter className="mx-auto text-slate-300 mb-3" size={48} />
             <h3 className="text-slate-900 font-bold">No matching activity found</h3>
             <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">Try refreshing the feed or switching back to "All Regions".</p>
          </div>
        ) : (
          <>
            {paginatedNews.map(item => (
              <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border border-indigo-100">
                        {item.source || 'Intelligence'}
                    </span>
                    {item.summary.toLowerCase().includes('global') && (
                        <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border border-blue-100 flex items-center gap-1">
                            <Globe size={10} /> Global 500
                        </span>
                    )}
                    {item.relatedCompanies.some(rc => directoryCompanies.includes(rc)) && (
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border border-emerald-100 flex items-center gap-1">
                            <UserCheck size={10} /> Tracked
                        </span>
                    )}
                  </div>
                  <span className="text-slate-400 text-[10px] font-black tracking-widest uppercase">{item.date}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors leading-tight">{item.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-5">{item.summary}</p>
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 border-t border-slate-50 gap-4">
                  <div className="flex flex-wrap gap-2">
                    {item.relatedCompanies.slice(0, 4).map(c => (
                      <span key={c} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-3 py-1 rounded-full border border-slate-200">
                        {c}
                      </span>
                    ))}
                  </div>
                  <a href={item.url !== '#' ? item.url : `https://www.google.com/search?q=${encodeURIComponent(item.title)}`} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                    Full Report <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-6 pt-10">
                <button 
                  onClick={() => handlePageChange(currentPage - 1)} 
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                   <span className="text-slate-900">{currentPage}</span> / {totalPages}
                </div>

                <button 
                  onClick={() => handlePageChange(currentPage + 1)} 
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="mt-12 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest pb-8">
        Enterprise monitoring covering {directoryCompanies.length} directory companies and top 500 global entities
      </div>
    </div>
  );
};

export default Intelligence;
