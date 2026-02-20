
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
  ListChecks,
  GitMerge,
  TrendingUp
} from 'lucide-react';
import CompanyList from './components/CompanyList';
import CompanyDetail from './components/CompanyDetail';
import GlobalPartnershipMatrix from './components/GlobalPartnershipMatrix';
import Intelligence from './components/Intelligence';
import JobBoard from './components/JobBoard';
import Logs from './components/Logs';
import CompanyLists from './components/CompanyLists';
import Investors from './components/Investors';
import VCPortfolioImport from './components/VCPortfolioImport';
import ShareModal from './components/ShareModal';
import { Company, Partner, NewsItem, Category } from './types';
import { enrichCompanyData, scanForNewPartnerships, recommendMissingCompanies, getCurrentModelName, fetchUrlContent, analyzeNewsForCompanies, analyzeNewsRelationships, scanAndFixCentralBanks } from "./services/claudeService";
import { db } from './services/db';

enum View {
  DIRECTORY = 'Directory',
  PARTNERSHIPS_GLOBAL = 'PartnershipsGlobal',
  INTELLIGENCE = 'Intelligence',
  JOBS = 'Jobs',
  LISTS = 'Lists',
  INVESTORS = 'Investors',
  VC_IMPORT = 'VCImport',
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

  // Merge enriched partners into existing ones, preserving any that enrichment didn't find.
  // New partners from enrichment are appended; duplicates (by name+type) are skipped.
  const mergePartners = (existing: Partner[], enriched: Partner[] | undefined): Partner[] => {
    if (!enriched || enriched.length === 0) return existing;
    if (!existing || existing.length === 0) return enriched;
    const seen = new Set(existing.map(p => `${p.name.toLowerCase()}::${p.type}`));
    const newOnes = enriched.filter(p => !seen.has(`${p.name.toLowerCase()}::${p.type}`));
    return [...existing, ...newOnes];
  };

  // Ensure bidirectional partner relationships:
  // If company A lists company B as partner, company B should also list company A.
  // A company can have multiple relationship types (e.g. Visa is both partner & investor in BVNK).
  const ensureBidirectionalPartners = (allCompanies: Company[]): Company[] => {
    const compMap = new Map<string, Company>(allCompanies.map(c => [c.id, { ...c }]));

    for (const company of allCompanies) {
      for (const partner of company.partners || []) {
        const partnerId = generateCompanyId(partner.name);
        const partnerCompany = compMap.get(partnerId);
        if (!partnerCompany) continue; // partner not in directory

        // Determine reverse partner type
        let reverseType: Partner['type'] = 'CryptoNative';
        if (partner.type === 'Investor') {
          // If A lists B as Investor, B should list A as CryptoNative (portfolio company)
          reverseType = 'CryptoNative';
        } else if (partner.type === 'Fortune500Global') {
          reverseType = 'CryptoNative';
        } else {
          reverseType = company.focus === 'Crypto-Second' ? 'Fortune500Global' : 'CryptoNative';
        }

        // Check by name+type (allows same company with different types)
        const alreadyLinkedWithType = partnerCompany.partners.some(
          p => p.name.toLowerCase() === company.name.toLowerCase() && p.type === reverseType
        );
        if (!alreadyLinkedWithType) {
          compMap.set(partnerId, {
            ...partnerCompany,
            partners: [...compMap.get(partnerId)!.partners, {
              name: company.name,
              type: reverseType,
              description: partner.description || `Partnership with ${company.name}.`,
              date: partner.date,
              sourceUrl: partner.sourceUrl,
            }]
          });
        }
      }
    }

    return Array.from(compMap.values());
  };

  // Ensure every entry in funding.investors also exists as a Partner with type 'Investor'.
  // This keeps the Investors page and Company Detail page in sync.
  const syncFundingInvestorsToPartners = (company: Company): Company => {
    const fundingInvestors = company.funding?.investors ?? [];
    if (fundingInvestors.length === 0) return company;

    const existingInvestorNames = new Set(
      company.partners.filter(p => p.type === 'Investor').map(p => p.name.toLowerCase())
    );

    const newPartners: Partner[] = [];
    for (const investorName of fundingInvestors) {
      const trimmed = investorName.trim();
      if (!trimmed || existingInvestorNames.has(trimmed.toLowerCase())) continue;
      existingInvestorNames.add(trimmed.toLowerCase());
      newPartners.push({
        name: trimmed,
        type: 'Investor',
        description: '',
      });
    }

    if (newPartners.length === 0) return company;
    return { ...company, partners: [...company.partners, ...newPartners] };
  };

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
            relatedCompanies: [companyName, p.name],
            sourceType: 'partnership' as const
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
        // Migrate dead Clearbit logo URLs to working gstatic favicon service
        const migrated = storedCompanies.map(c => {
          if (c.logoPlaceholder && c.logoPlaceholder.includes('clearbit.com')) {
            if (c.website) {
              const domain = c.website.replace(/^https?:\/\//, '').split('/')[0];
              return { ...c, logoPlaceholder: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128` };
            }
            return { ...c, logoPlaceholder: `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=f8fafc&color=64748b&size=128` };
          }
          return c;
        });
        // Normalize: ensure funding.investors are reflected as Partner entries
        let normalized = migrated.map(syncFundingInvestorsToPartners);
        normalized = ensureBidirectionalPartners(normalized);
        const changed = JSON.stringify(normalized) !== JSON.stringify(storedCompanies);
        setCompanies(normalized);
        if (changed) db.saveCompanies(normalized).catch(console.error);
        setIsAppLoading(false);
        const now = Date.now();
        if (now - lastTime > SCAN_INTERVAL_MS) runBackgroundScan(storedCompanies);
      } catch (e) {
        console.error("Initialization failed", e);
        setIsAppLoading(false);
      }
    };
    // Safety net: never show loading spinner for more than 8 seconds
    const safetyTimer = setTimeout(() => setIsAppLoading(false), 8000);
    initApp().finally(() => clearTimeout(safetyTimer));
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
        const updated = ensureBidirectionalPartners(mergedCompanies);
        db.saveCompanies(updated).catch(console.error);
        return updated;
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
      try {
          // Auto-fetch title + content from URL if title not provided
          const urlData = news.url ? await fetchUrlContent(news.url).catch(() => null) : null;
          const title = news.title || urlData?.title || (news.url ? new URL(news.url).hostname : 'Untitled');

          // Analyze article content for mentioned companies
          const allCompanyNames = companies.map(c => c.name);
          let mentionedNames: string[] = [companyName];
          let autoSummary = news.summary;

          if (urlData?.content) {
              const analysis = await analyzeNewsForCompanies(urlData.content, allCompanyNames).catch(() => null);
              if (analysis) {
                  mentionedNames = [...new Set([companyName, ...analysis.mentionedCompanies])];
                  if (!autoSummary && analysis.summary) autoSummary = analysis.summary;
              }
          }

          const newItem: NewsItem = {
              id: `manual-news-${Date.now()}`,
              title,
              url: news.url,
              date: news.date,
              summary: autoSummary,
              source: 'Manual Entry',
              relatedCompanies: mentionedNames,
              sourceType: (news.url && news.url !== '#') ? 'press' as const : 'press_release' as const
          };

          await db.saveNews([newItem]);

          // Compute companies with updated recentNews
          let withNews = companies.map(c => {
              const isMatch = mentionedNames.some(n => generateCompanyId(n) === c.id || c.name === n);
              if (!isMatch) return c;
              const existing = c.recentNews || [];
              if (existing.some(n => n.id === newItem.id)) return c;
              return { ...c, recentNews: [newItem, ...existing] };
          });

          // Infer and create Partner relationships from article if 2+ companies mentioned
          if (mentionedNames.length > 1 && urlData?.content) {
              const relationships = await analyzeNewsRelationships(urlData.content, mentionedNames).catch(() => []);
              if (relationships.length > 0) {
                  const compMap = new Map<string, Company>(withNews.map(c => [c.id, c]));
                  for (const rel of relationships) {
                      const id1 = generateCompanyId(rel.company1);
                      const id2 = generateCompanyId(rel.company2);
                      const c1 = compMap.get(id1);
                      const c2 = compMap.get(id2);
                      if (c1 && !c1.partners.some(p => p.name.toLowerCase() === rel.company2.toLowerCase() && p.type === rel.company2PartnerType)) {
                          compMap.set(id1, {
                              ...c1,
                              partners: [...c1.partners, {
                                  name: rel.company2,
                                  type: rel.company2PartnerType,
                                  description: rel.description,
                                  date: rel.date || news.date,
                                  sourceUrl: news.url
                              }]
                          });
                      }
                      if (c2 && !c2.partners.some(p => p.name.toLowerCase() === rel.company1.toLowerCase() && p.type === rel.company1PartnerType)) {
                          compMap.set(id2, {
                              ...c2,
                              partners: [...c2.partners, {
                                  name: rel.company1,
                                  type: rel.company1PartnerType,
                                  description: rel.description,
                                  date: rel.date || news.date,
                                  sourceUrl: news.url
                              }]
                          });
                      }
                  }
                  withNews = Array.from(compMap.values());
              }
          }

          setCompanies(withNews);
          db.saveCompanies(withNews).catch(console.error);
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
      focus: 'Crypto-Second',
      addedAt: new Date().toISOString()
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
            logoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
        }

        // Handle case where enrichment is empty due to exhaustion
        const finalDescription = enriched.description || 'Basic profile created. Intelligence analysis currently unavailable due to system load.';

        setCompanies(current => {
           const withEnriched = current.map(c => {
             if (c.id !== newId) return c;
             const mergedPartners = mergePartners(c.partners, enriched.partners);
             return syncFundingInvestorsToPartners({ ...c, ...enriched, partners: mergedPartners, description: finalDescription, logoPlaceholder: logoUrl });
           });
           const updated = ensureBidirectionalPartners(withEnriched);
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

  const handleAddCompanyWithInvestor = async (companyName: string, investorName: string) => {
    const normalizedName = companyName.trim();
    const newId = generateCompanyId(normalizedName);
    const existing = companies.find(c => c.id === newId);

    if (existing) {
      // Company already exists — just ensure the investor partner is linked
      const hasInvestor = existing.partners.some(p =>
        p.name.toLowerCase() === investorName.toLowerCase() && p.type === 'Investor'
      );
      if (!hasInvestor) {
        const investorPartner: Partner = {
          name: investorName,
          type: 'Investor',
          description: `Investor in ${normalizedName}.`,
        };
        setCompanies(current => {
          const updated = current.map(c =>
            c.id === newId ? { ...c, partners: [...c.partners, investorPartner] } : c
          );
          db.saveCompanies(updated).catch(console.error);
          return updated;
        });
      }
      return;
    }

    // Create skeleton with the investor pre-linked
    const investorPartner: Partner = {
      name: investorName,
      type: 'Investor',
      description: `Investor in ${normalizedName}.`,
    };
    const skeleton: Company = {
      id: newId,
      name: normalizedName,
      logoPlaceholder: `https://ui-avatars.com/api/?name=${encodeURIComponent(normalizedName)}&background=f8fafc&color=64748b&size=128`,
      description: 'Fetching intelligence...',
      categories: [Category.INFRASTRUCTURE],
      partners: [investorPartner],
      website: '',
      headquarters: 'Pending...',
      region: 'Global',
      focus: 'Crypto-Second',
      addedAt: new Date().toISOString()
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
        logoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
      }
      const finalDescription = enriched.description || 'Basic profile created. Intelligence analysis currently unavailable due to system load.';

      setCompanies(current => {
        const withEnriched = current.map(c => {
          if (c.id !== newId) return c;
          const merged = mergePartners(c.partners, enriched.partners);
          return syncFundingInvestorsToPartners({ ...c, ...enriched, partners: merged, description: finalDescription, logoPlaceholder: logoUrl });
        });
        const updated = ensureBidirectionalPartners(withEnriched);
        db.saveCompanies(updated).catch(console.error);
        return updated;
      });
    } catch (e) {
      console.warn(`Enrichment failed for ${normalizedName}, keeping skeleton with investor link.`);
      setCompanies(current => {
        const updated = current.map(c =>
          c.id === newId ? { ...c, description: 'Intelligence unavailable. Try refreshing later.' } : c
        );
        db.saveCompanies(updated).catch(console.error);
        return updated;
      });
    }
  };

  const handleRefreshPending = async () => {
    const pendingKeywords = ['Fetching', 'Intelligence unavailable', 'Queued', 'Analysis unavailable', 'Basic profile created', 'currently unavailable', 'Pending'];
    const genericPhrases = ['enterprise-grade solutions', 'enabling traditional financial institutions', 'secure, compliant infrastructure', 'integrate blockchain technology and digital assets into their operations'];
    const pendingCompanies = companies.filter(c =>
      pendingKeywords.some(kw => c.description.includes(kw)) ||
      genericPhrases.some(gp => c.description.includes(gp)) ||
      !c.description || c.description.length < 30
    );

    if (pendingCompanies.length === 0) {
      alert("No pending or failed profiles found to refresh.");
      return;
    }

    setIsRefreshingPending(true);
    let successCount = 0;

    for (const company of pendingCompanies) {
      try {
        const enriched = await enrichCompanyData(company.name, company);
        if (Object.keys(enriched).length > 0) {
          if (enriched.partners && enriched.partners.length > 0) await syncPartnershipsToNews(company.name, enriched.partners);
          
          let logoUrl = company.logoPlaceholder;
          if (enriched.website && (company.logoPlaceholder.includes('ui-avatars.com') || company.logoPlaceholder.includes('clearbit.com'))) {
              const domain = enriched.website.replace(/^https?:\/\//, '').split('/')[0];
              logoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
          }

          const finalDescription = enriched.description || company.description;
          
          setCompanies(current => {
            const withEnriched = current.map(c => {
              if (c.id !== company.id) return c;
              const mergedPartners = mergePartners(c.partners, enriched.partners);
              return syncFundingInvestorsToPartners({ ...c, ...enriched, partners: mergedPartners, description: finalDescription, logoPlaceholder: logoUrl });
            });
            const updated = ensureBidirectionalPartners(withEnriched);
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
          focus: 'Crypto-Second',
          addedAt: new Date().toISOString()
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
                  logoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
              }
              const finalDescription = enriched.description || 'Intelligence unavailable. Click Refresh to retry.';
              setCompanies(current => {
                  const withEnriched = current.map(c => {
                    if (c.id !== skel.id) return c;
                    const mergedPartners = mergePartners(c.partners, enriched.partners);
                    return syncFundingInvestorsToPartners({ ...c, ...enriched, partners: mergedPartners, description: finalDescription, logoPlaceholder: logoUrl });
                  });
                  const updated = ensureBidirectionalPartners(withEnriched);
                  db.saveCompanies(updated).catch(console.error);
                  return updated;
              });
          } catch (e) { console.error(`Failed to enrich ${skel.name}`, e); }
      }
  };

  const handleMergeDuplicates = async (): Promise<{ merged: number; removed: number }> => {
      const dataScore = (c: Company): number => {
          let score = 0;
          if (c.description && c.description.length > 30) score += 2;
          if (c.website) score += 1;
          if (c.headquarters && c.headquarters !== 'Pending...') score += 1;
          if (c.partners && c.partners.length > 0) score += c.partners.length;
          if (c.recentNews && c.recentNews.length > 0) score += c.recentNews.length;
          if (c.jobs && c.jobs.length > 0) score += c.jobs.length;
          if (c.categories && c.categories.length > 0) score += 1;
          if (c.funding) score += 2;
          return score;
      };

      const groups = new Map<string, Company[]>();
      companies.forEach(c => {
          const key = generateCompanyId(c.name);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(c);
      });

      const toKeep: Company[] = [];
      const toRemove: string[] = [];
      let mergedCount = 0;

      groups.forEach((group, canonicalId) => {
          if (group.length === 1) {
              // Even singletons: ensure canonical ID
              if (group[0].id !== canonicalId) {
                  toRemove.push(group[0].id);
                  toKeep.push({ ...group[0], id: canonicalId });
              } else {
                  toKeep.push(group[0]);
              }
              return;
          }
          mergedCount++;
          const best = group.reduce((a, b) => dataScore(a) >= dataScore(b) ? a : b);
          // Deduplicate partners by lowercase name + type (same company can have multiple types)
          const seenPartners = new Set<string>();
          const allPartners = group.flatMap(c => c.partners || []).filter(p => {
              const key = `${p.name.toLowerCase()}::${p.type}`;
              if (seenPartners.has(key)) return false;
              seenPartners.add(key);
              return true;
          });
          // Deduplicate news/jobs by id
          const seenNews = new Set<string>();
          const allNews = group.flatMap(c => c.recentNews || []).filter(n => {
              if (seenNews.has(n.id)) return false;
              seenNews.add(n.id);
              return true;
          });
          const seenJobs = new Set<string>();
          const allJobs = group.flatMap(c => c.jobs || []).filter(j => {
              if (seenJobs.has(j.id)) return false;
              seenJobs.add(j.id);
              return true;
          });

          const merged: Company = {
              ...best,
              id: canonicalId,
              partners: allPartners,
              recentNews: allNews,
              jobs: allJobs,
          };
          toKeep.push(merged);
          group.forEach(c => { if (c.id !== canonicalId) toRemove.push(c.id); });
      });

      setCompanies(toKeep);
      await db.saveCompanies(toKeep);
      if (toRemove.length > 0) await db.deleteCompanies(toRemove);
      return { merged: mergedCount, removed: toRemove.length };
  };

  const handleRefreshCompany = async (company: Company) => {
      try {
          const enriched = await enrichCompanyData(company.name, company);
          if (enriched.partners && enriched.partners.length > 0) await syncPartnershipsToNews(company.name, enriched.partners);
          let logoUrl = company.logoPlaceholder;
          if (enriched.website && (company.logoPlaceholder.includes('ui-avatars.com') || company.logoPlaceholder.includes('clearbit.com'))) {
              const domain = enriched.website.replace(/^https?:\/\//, '').split('/')[0];
              logoUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
          }
          const mergedPartners = mergePartners(company.partners, enriched.partners);
          const refreshedCompany = syncFundingInvestorsToPartners({ ...company, ...enriched, partners: mergedPartners, logoPlaceholder: logoUrl });
          const newCompanies = companies.map(c => c.id === refreshedCompany.id ? refreshedCompany : c);
          const updated = ensureBidirectionalPartners(newCompanies);
          setCompanies(updated);
          if (selectedCompany && selectedCompany.id === refreshedCompany.id) setSelectedCompany(refreshedCompany);
          await db.saveCompanies(updated);
      } catch (e) { alert("Refresh failed. Please try again later."); }
  };

  const handleShare = (company: Company) => { setCompanyToShare(company); setShareModalOpen(true); };

  const handleScanCentralBanks = async (): Promise<{ fixedCount: number; addedCount: number }> => {
    const { fixed, discovered } = await scanAndFixCentralBanks(companies);
    // Count how many companies had their categories changed
    const fixedCount = fixed.filter((c, i) =>
      JSON.stringify(c.categories) !== JSON.stringify(companies[i]?.categories) ||
      c.website !== companies[i]?.website
    ).length;
    // Enrich and add discovered central banks
    let addedCount = 0;
    const existingNames = new Set(fixed.map(c => c.name.toLowerCase()));
    const newCompanies = [...fixed];
    for (const cb of discovered) {
      if (!cb.name || existingNames.has(cb.name.toLowerCase())) continue;
      try {
        const enriched = await enrichCompanyData(cb.name);
        // Force Central Banks category even if enrichment doesn't detect it
        const categories = enriched.categories || cb.categories || [];
        if (!categories.includes('Central Banks' as any)) categories.push('Central Banks' as any);
        const id = cb.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const website = enriched.website || cb.website || '';
        const domain = website ? website.replace(/^https?:\/\//, '').split('/')[0] : '';
        const logoPlaceholder = domain
          ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(cb.name)}&background=f8fafc&color=64748b&size=128`;
        newCompanies.push({
          id,
          name: cb.name,
          description: enriched.description || cb.description || '',
          categories,
          website,
          headquarters: enriched.headquarters || cb.headquarters || '',
          country: enriched.country || cb.country || '',
          region: enriched.region || cb.region || 'Global',
          focus: enriched.focus || 'Crypto-Second',
          industry: enriched.industry || 'Central Banking',
          partners: enriched.partners || [],
          logoPlaceholder,
          addedAt: new Date().toISOString(),
        } as any);
        existingNames.add(cb.name.toLowerCase());
        addedCount++;
      } catch (err) {
        console.error(`Failed to enrich central bank ${cb.name}`, err);
      }
    }
    setCompanies(newCompanies);
    await db.saveCompanies(newCompanies);
    return { fixedCount, addedCount };
  };

  const renderContent = () => {
    if (isAppLoading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
           <Database size={48} className="animate-pulse mb-4 opacity-50" />
           <p className="font-medium">Connecting to Intelligence Database...</p>
        </div>
    );
    if (selectedCompany) return (
        <CompanyDetail company={selectedCompany} onBack={() => setSelectedCompany(null)} onShare={handleShare} onUpdateCompany={handleSingleCompanyUpdate} onRefresh={handleRefreshCompany} onDelete={handleDeleteCompany} onEditName={handleEditCompanyName} onAddNews={handleManualNewsAdd} allCompanyIds={new Set(companies.map(c => c.id))} allCompanyNames={companies.map(c => c.name)} onAddCompanyToDirectory={handleAddCompany} />
    );
    switch (currentView) {
      case View.DIRECTORY: return <CompanyList companies={companies} onSelectCompany={setSelectedCompany} onAddCompany={handleAddCompany} onImportCompanies={handleImportCompanies} isAdding={addingCompany} onRefreshPending={handleRefreshPending} isRefreshingPending={isRefreshingPending} onScanRecommendations={handleScanRecommendations} onMergeDuplicates={handleMergeDuplicates} onScanCentralBanks={handleScanCentralBanks} />;
      case View.PARTNERSHIPS_GLOBAL: return <GlobalPartnershipMatrix companies={companies} />;
      case View.INTELLIGENCE: return <Intelligence directoryCompanies={companies.map(c => c.name)} companies={companies} />;
      case View.JOBS: return <JobBoard companies={companies} onUpdateCompanies={handleCompaniesUpdate} />;
      case View.LISTS: return <CompanyLists companies={companies} />;
      case View.INVESTORS: return <Investors companies={companies} onSelectCompany={setSelectedCompany} onAddCompany={handleAddCompany} onAddCompanyWithInvestor={handleAddCompanyWithInvestor} onNavigateToVCImport={() => setCurrentView(View.VC_IMPORT)} />;
      case View.VC_IMPORT: return <VCPortfolioImport companies={companies} onAddCompanyWithInvestor={handleAddCompanyWithInvestor} onBack={() => setCurrentView(View.INVESTORS)} />;
      case View.LOGS: return <Logs onBack={() => setCurrentView(View.DIRECTORY)} companies={companies} onRefreshFromFirestore={setCompanies} />;
      default: return <div>View not found</div>;
    }
  };

  const cleanModelName = modelName;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <div className="fixed top-0 left-0 right-0 bg-indigo-900 text-indigo-100 text-[10px] font-bold text-center py-1 z-[9999] flex items-center justify-center gap-2 shadow-sm border-b border-indigo-800">
          <Zap size={10} className="text-yellow-400 fill-yellow-400" />
          <span>AI Model: <span className="text-white font-mono">{cleanModelName}</span></span>
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
          <button onClick={() => { setCurrentView(View.INVESTORS); setSelectedCompany(null); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${currentView === View.INVESTORS ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
            <TrendingUp size={20} /> {isSidebarOpen && <span>Investors & VC</span>}
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
