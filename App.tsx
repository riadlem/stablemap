
import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Newspaper, 
  Menu,
  RefreshCw,
  Clock,
  Database,
  Briefcase,
  Globe,
  AlertTriangle,
  Zap,
  ScrollText,
  ListChecks
} from 'lucide-react';
import CompanyList from './components/CompanyList';
import CompanyDetail from './components/CompanyDetail';
import GlobalPartnershipMatrix from './components/GlobalPartnershipMatrix';
import Intelligence from './components/Intelligence';
import JobBoard from './components/JobBoard';
import Logs from './components/Logs';
import CompanyLists from './components/CompanyLists';
import ShareModal from './components/ShareModal';
import { Company, Partner, NewsItem, Category } from './types';
import { enrichCompanyData, scanForNewPartnerships, recommendMissingCompanies, getCurrentModelName } from "./services/claudeService";
import { db } from './services/db';

enum View {
  DIRECTORY = 'Directory',
  PARTNERSHIPS_GLOBAL = 'PartnershipsGlobal',
  INTELLIGENCE = 'Intelligence',
  JOBS = 'Jobs',
  LISTS = 'Lists',
  LOGS = 'Logs'
}

const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; 

const generateCompanyId = (name: string) => {
  const cleanName = name
    .replace(/[,.]/g, '') 
    .replace(/\s+(Inc|LLC|Ltd|Limited|Corp|Corporation|Group|Holdings|PLC|SA|AG|GmbH)$/i, '') 
    .trim();
  return `c-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DIRECTORY);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [companyToShare, setCompanyToShare] = useState<Company | undefined>(undefined);
  const [addingCompany, setAddingCompany] = useState(false);
  const [isRefreshingPending, setIsRefreshingPending] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [modelName, setModelName] = useState(getCurrentModelName());

  useEffect(() => {
    setModelName(getCurrentModelName());
  }, []);

  const syncPartnershipsToNews = async (companyName: string, partners: Partner[]) => {
    const newsItems: NewsItem[] = partners.map((p, idx) => {
        const safeName = companyName.replace(/[^a-zA-Z0-9]/g, '');
        const safePartner = p.name.replace(/[^a-zA-Z0-9]/g, '');
        const id = `ptnr-${safeName}-${safePartner}`;
        return {
            id,
            title: `${companyName} Partnership: ${p.name}`,
            source: 'Directory Intelligence',
            date: p.date || new Date().toISOString().split('T')[0],
            summary: p.description,
            url: p.sourceUrl || '#',
            relatedCompanies: [companyName, p.name]
        };
    });
    if (newsItems.length > 0) await db.saveNews(newsItems);
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        const lastTime = await db.getLastScanTime();
        setLastScanTime(lastTime);
        const storedCompanies = await db.getCompanies();
        setCompanies(storedCompanies);
        setIsAppLoading(false);
        const now = Date.now();
        if (now - lastTime > SCAN_INTERVAL_MS) runBackgroundScan(storedCompanies);
      } catch (e) {
        console.error("Initialization failed", e);
        setIsAppLoading(false);
      }
    };
    initApp();
  }, []);

  const runBackgroundScan = async (initialCompaniesForReference: Company[]) => {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgress(0);
    const companiesToScan = [...initialCompaniesForReference].sort(() => 0.5 - Math.random()).slice(0, 3);
    let completed = 0;
    const updates = new Map<string, Partner[]>();
    for (const company of companiesToScan) {
      const existingNames = company.partners.map(p => p.name);
      const newPartners = await scanForNewPartnerships(company.name, existingNames);
      if (newPartners && newPartners.length > 0) {
        updates.set(company.id, newPartners);
        await syncPartnershipsToNews(company.name, newPartners);
      }
      completed++;
      setScanProgress(Math.round((completed / companiesToScan.length) * 100));
    }
    if (updates.size > 0) {
      setCompanies(prevCompanies => {
        const mergedCompanies = prevCompanies.map(c => {
          const newParts = updates.get(c.id);
          if (newParts) return { ...c, partners: [...c.partners, ...newParts] };
          return c;
        });
        db.saveCompanies(mergedCompanies).catch(console.error);
        return mergedCompanies;
      });
    }
    const now = Date.now();
    await db.saveLastScanTime(now);
    setLastScanTime(now);
    setIsScanning(false);
  };

  const handleCompaniesUpdate = async (updatedCompanies: Company[]) => {
    setCompanies(updatedCompanies);
    await db.saveCompanies(updatedCompanies);
  };

  const handleSingleCompanyUpdate = async (updatedCompany: Company) => {
    const newCompanies = companies.map(c => c.id === updatedCompany.id ? updatedCompany : c);
    setCompanies(newCompanies);
    if (selectedCompany && selectedCompany.id === updatedCompany.id) setSelectedCompany(updatedCompany);
    await db.saveCompanies(newCompanies);
  };

  const handleDeleteCompany = async (companyId: string) => {
      const newCompanies = companies.filter(c => c.id !== companyId);
      setCompanies(newCompanies);
      await db.deleteCompany(companyId);
      if (selectedCompany && selectedCompany.id === companyId) setSelectedCompany(null);
  };

  const handleEditCompanyName = async (id: string, newName: string) => {
      const target = companies.find(c => c.id === id);
      if (target) {
          const updated = { ...target, name: newName };
          await handleSingleCompanyUpdate(updated);
      }
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
          const targetCompany = companies.find(c => c.name === companyName);
          if (targetCompany) {
              const currentNews = targetCompany.recentNews || [];
              if (!currentNews.some(n => n.title === newItem.title)) {
                  await handleSingleCompanyUpdate({ ...targetCompany, recentNews: [newItem, ...currentNews] });
              }
          }
      } catch (e) { console.error("Failed to save news", e); }
  };

  const handleScanRecommendations = async () => {
      return await recommendMissingCompanies(companies.map(c => c.name));
  };

  const handleAddCompany = async (name: string) => {
    setAddingCompany(true);
    const normalizedName = name.trim();
    const newId = generateCompanyId(normalizedName);
    const existing = companies.find(c => c.id === newId);
    if (existing) {
        alert(`Company "${existing.name}" already exists.`);
        setAddingCompany(false);
        return;
    }
    const skeleton: Company = {
      id: newId,
      name: normalizedName,
      logoPlaceholder: `https://ui-avatars.com/api/?name=${encodeURIComponent(normalizedName)}&background=f8fafc&color=64748b&size=128`, 
      description: 'Fetching intelligence...',
      categories: [Category.INFRASTRUCTURE],
      partners: [],
      website: '',
      headquarters: 'Pending...',
      region: 'Global',
      focus: 'Crypto-Second' 
    };
    setCompanies(current => {
      const updated = [skeleton, ...current];
      db.saveCompanies(updated).catch(console.error);
      return updated;
    });

    try {
        const enriched = await enrichCompanyData(normalizedName);
        if (enriched.partners && enriched.partners.length > 0) await syncPartnershipsToNews(normalizedName, enriched.partners);
        
        let logoUrl = skeleton.logoPlaceholder;
        if (enriched.website) {
            const domain = enriched.website.replace(/^https?:\/\//, '').split('/')[0];
            logoUrl = `https://logo.clearbit.com/${domain}`;
        }

        // Handle case where enrichment is empty due to exhaustion
        const finalDescription = enriched.description || 'Basic profile created. Intelligence analysis currently unavailable due to system load.';

        setCompanies(current => {
           const updated = current.map(c => c.id === newId ? { ...c, ...enriched, description: finalDescription, logoPlaceholder: logoUrl } : c);
           db.saveCompanies(updated).catch(console.error);
           return updated;
        });
    } catch (e) {
        console.warn(`Enrichment failed for ${normalizedName}, keeping skeleton.`);
        setCompanies(current => {
            const updated = current.map(c => c.id === newId ? { ...c, description: 'Intelligence unavailable. Try refreshing later.' } : c);
            db.saveCompanies(updated).catch(console.error);
            return updated;
        });
    } finally { setAddingCompany(false); }
  };

  const handleRefreshPending = async () => {
    const pendingKeywords = ['Fetching', 'Intelligence unavailable', 'Queued', 'Analysis unavailable'];
    const pendingCompanies = companies.filter(c => 
      pendingKeywords.some(kw => c.description.includes(kw))
    );

    if (pendingCompanies.length === 0) {
      alert("No pending or failed profiles found to refresh.");
      return;
    }

    setIsRefreshingPending(true);
    let successCount = 0;

    for (const company of pendingCompanies) {
      try {
        const enriched = await enrichCompanyData(company.name);
        if (Object.keys(enriched).length > 0) {
          if (enriched.partners && enriched.partners.length > 0) await syncPartnershipsToNews(company.name, enriched.partners);
          
          let logoUrl = company.logoPlaceholder;
          if (enriched.website && !company.logoPlaceholder.includes('clearbit')) {
              const domain = enriched.website.replace(/^https?:\/\//, '').split('/')[0];
              logoUrl = `https://logo.clearbit.com/${domain}`;
          }

          const finalDescription = enriched.description || company.description;
          
          setCompanies(current => {
            const updated = current.map(c => c.id === company.id ? { ...c, ...enriched, description: finalDescription, logoPlaceholder: logoUrl } : c);
            db.saveCompanies(updated).catch(console.error);
            return updated;
          });
          successCount++;
        }
      } catch (e) {
        console.warn(`Failed to refresh pending company ${company.name}`, e);
      }
    }

    setIsRefreshingPending(false);
    if (successCount > 0) {
      alert(`Successfully refreshed intelligence for ${successCount} companies.`);
    } else {
      alert("Could not update any pending companies. Quota might still be limited.");
    }
  };

  const handleImportCompanies = async (names: string[]) => {
      const existingIds = new Set(companies.map(c => c.id));
      const existingNames = new Set(companies.map(c => generateCompanyId(c.name)));
      const validNewNames: string[] = [];
      names.forEach(name => {
          const id = generateCompanyId(name);
          if (!existingIds.has(id) && !existingNames.has(id)) {
              existingIds.add(id);
              existingNames.add(id);
              validNewNames.push(name.trim());
          }
      });
      if (validNewNames.length === 0) {
          alert("No new unique companies found in CSV.");
          return;
      }
      const skeletons: Company[] = validNewNames.map(name => ({
          id: generateCompanyId(name),
          name,
          logoPlaceholder: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f8fafc&color=64748b&size=128`,
          description: 'Queued for analysis...',
          categories: [Category.INFRASTRUCTURE],
          partners: [],
          website: '',
          headquarters: '',
          region: 'Global',
          focus: 'Crypto-Second'
      }));
      setCompanies(prev => {
          const updated = [...skeletons, ...prev];
          db.saveCompanies(updated).catch(console.error);
          return updated;
      });
      for (const skel of skeletons) {
          try {
              const enriched = await enrichCompanyData(skel.name);
              if (enriched.partners && enriched.partners.length > 0) await syncPartnershipsToNews(skel.name, enriched.partners);
              let logoUrl = skel.logoPlaceholder;
              if (enriched.website) {
                  const domain = enriched.website.replace(/^https?:\/\//, '').split('/')[0];
                  logoUrl = `https://logo.clearbit.com/${domain}`;
              }
              const finalDescription = enriched.description || 'Intelligence unavailable. Click Refresh to retry.';
              setCompanies(current => {
                  const updated = current.map(c => c.id === skel.id ? { ...c, ...enriched, description: finalDescription, logoPlaceholder: logoUrl } : c);
                  db.saveCompanies(updated).catch(console.error);
                  return updated;
              });
          } catch (e) { console.error(`Failed to enrich ${skel.name}`, e); }
      }
  };

  const handleRefreshCompany = async (company: Company) => {
      try {
          const enriched = await enrichCompanyData(company.name);
          if (enriched.partners && enriched.partners.length > 0) await syncPartnershipsToNews(company.name, enriched.partners);
          let logoUrl = company.logoPlaceholder;
          if (enriched.website && !company.logoPlaceholder.includes('clearbit')) {
              const domain = enriched.website.replace(/^https?:\/\//, '').split('/')[0];
              logoUrl = `https://logo.clearbit.com/${domain}`;
          }
          await handleSingleCompanyUpdate({ ...company, ...enriched, logoPlaceholder: logoUrl });
      } catch (e) { alert("Refresh failed. Please try again later."); }
  };

  const handleShare = (company: Company) => { setCompanyToShare(company); setShareModalOpen(true); };

  const renderContent = () => {
    if (isAppLoading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
           <Database size={48} className="animate-pulse mb-4 opacity-50" />
           <p className="font-medium">Connecting to Intelligence Database...</p>
        </div>
    );
    if (selectedCompany) return (
        <CompanyDetail company={selectedCompany} onBack={() => setSelectedCompany(null)} onShare={handleShare} onUpdateCompany={handleSingleCompanyUpdate} onRefresh={handleRefreshCompany} onDelete={handleDeleteCompany} onEditName={handleEditCompanyName} onAddNews={handleManualNewsAdd} />
    );
    switch (currentView) {
      case View.DIRECTORY: return <CompanyList companies={companies} onSelectCompany={setSelectedCompany} onAddCompany={handleAddCompany} onImportCompanies={handleImportCompanies} isAdding={addingCompany} onRefreshPending={handleRefreshPending} isRefreshingPending={isRefreshingPending} onScanRecommendations={handleScanRecommendations} />;
      case View.PARTNERSHIPS_GLOBAL: return <GlobalPartnershipMatrix companies={companies} />;
      case View.INTELLIGENCE: return <Intelligence directoryCompanies={companies.map(c => c.name)} />;
      case View.JOBS: return <JobBoard companies={companies} onUpdateCompanies={handleCompaniesUpdate} />;
      case View.LISTS: return <CompanyLists companies={companies} />;
      case View.LOGS: return <Logs onBack={() => setCurrentView(View.DIRECTORY)} />;
      default: return <div>View not found</div>;
    }
  };

  const cleanModelName = modelName.replace('claude-', '').replace('-20250514', '');

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="fixed top-0 left-0 right-0 bg-indigo-900 text-indigo-100 text-[10px] font-bold text-center py-1 z-[9999] flex items-center justify-center gap-2 shadow-sm border-b border-indigo-800">
          <Zap size={10} className="text-yellow-400 fill-yellow-400" />
          <span>Powered by Claude AI: <span className="text-white font-mono">{cleanModelName}</span></span>
      </div>
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-slate-300 transition-all duration-300 flex flex-col fixed h-full z-10 shadow-2xl pt-6`}>
        <div className="p-6 flex items-center gap-3 text-white font-bold text-xl border-b border-slate-800">
           <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white shrink-0">S</div>
           {isSidebarOpen && <span>StableMap</span>}
        </div>
        <nav className="flex-1 py-6 px-3 space-y-1">
          <button onClick={() => { setCurrentView(View.DIRECTORY); setSelectedCompany(null); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentView === View.DIRECTORY && !selectedCompany ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
            <Building2 size={20} /> {isSidebarOpen && <span>Directory</span>}
          </button>
          <button onClick={() => { setCurrentView(View.PARTNERSHIPS_GLOBAL); setSelectedCompany(null); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentView === View.PARTNERSHIPS_GLOBAL ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
            <Globe size={20} /> {isSidebarOpen && <span>Global Enterprise Map</span>}
          </button>
          <button onClick={() => { setCurrentView(View.INTELLIGENCE); setSelectedCompany(null); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentView === View.INTELLIGENCE ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
            <Newspaper size={20} /> {isSidebarOpen && <span>News & Events</span>}
          </button>
          <button onClick={() => { setCurrentView(View.JOBS); setSelectedCompany(null); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentView === View.JOBS ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
            <Briefcase size={20} /> {isSidebarOpen && <span>Job Board</span>}
          </button>
          <button onClick={() => { setCurrentView(View.LISTS); setSelectedCompany(null); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentView === View.LISTS ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
            <ListChecks size={20} /> {isSidebarOpen && <span>Company Lists</span>}
          </button>
          <button onClick={() => { setCurrentView(View.LOGS); setSelectedCompany(null); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentView === View.LOGS ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
            <ScrollText size={20} /> {isSidebarOpen && <span>System Logs</span>}
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800 text-xs">
           {isScanning ? (
             <div className="bg-slate-800 rounded-lg p-3 animate-pulse">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold mb-2">
                  <RefreshCw size={14} className="animate-spin" /> {isSidebarOpen ? 'Discovering...' : ''}
                </div>
                {isSidebarOpen && (
                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                  </div>
                )}
             </div>
           ) : (
             <div className="flex items-center gap-2 text-slate-500 px-2">
                <Clock size={14} /> {isSidebarOpen && <span>Updated: {lastScanTime ? new Date(lastScanTime).toLocaleDateString() : 'Never'}</span>}
             </div>
           )}
        </div>
        <div className="p-4 border-t border-slate-800">
           <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><Menu size={20} /></button>
        </div>
      </aside>
      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'} p-8 pt-12 flex flex-col min-h-screen`}>
         <div className="max-w-7xl mx-auto flex-1">{renderContent()}</div>
         <footer className="max-w-7xl mx-auto w-full border-t border-slate-200 mt-12 pt-4 pb-6 flex items-center justify-between">
           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">StableMap Intelligence Platform</span>
           <button
             onClick={() => { setCurrentView(View.LOGS); setSelectedCompany(null); }}
             className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
           >
             <ScrollText size={12} /> System Logs
           </button>
         </footer>
      </main>
      <ShareModal isOpen={isShareModalOpen} onClose={() => setShareModalOpen(false)} company={companyToShare} />
    </div>
  );
};

export default App;
