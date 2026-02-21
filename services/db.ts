
import { Company, NewsItem, NewsVote, CompanyFocus, Global500ResearchData, CompanyList as CompanyListType } from '../types';
import { MOCK_COMPANIES, MOCK_NEWS } from '../constants';
import { cleanSearchTitle, resolveSourceName, isIrrelevantNews, resolvePartnerCompany } from './claudeService';
import { dbInstance, isConfigured } from './firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  writeBatch,
  getDoc,
  deleteDoc,
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData
} from 'firebase/firestore';

const COLLECTIONS = {
  COMPANIES: 'companies',
  NEWS: 'news',
  SYSTEM: 'system',
  GLOBAL500: 'global500_activity',
  LISTS: 'company_lists',
  NEWS_VOTES: 'news_votes',
  SOURCES: 'sources_config'
};

const LS_KEYS = {
  COMPANIES: 'stablemap_companies',
  NEWS: 'stablemap_news',
  SCAN: 'stablemap_lastscan',
  GLOBAL500: 'stablemap_global500',
  LISTS: 'stablemap_lists',
  NEWS_VOTES: 'stablemap_news_votes',
  SOURCES: 'stablemap_sources'
};

// --- HELPERS ---

// Timeout helper to prevent hanging on bad connections/keys
const withTimeout = <T>(promise: Promise<T>, ms: number = 2000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Firestore operation timed out"));
        }, ms);
        promise.then(
            (res) => { clearTimeout(timer); resolve(res); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
};

// Convert Firestore Timestamps (seconds/nanoseconds) to ISO strings
const normalizeDates = (data: any): any => {
  if (data === null || data === undefined) return data;
  
  // Handle Firestore Timestamp-like objects
  if (typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    return new Date(data.seconds * 1000).toISOString().split('T')[0];
  }
  
  // Recursively handle Arrays
  if (Array.isArray(data)) {
    return data.map(normalizeDates);
  }
  
  // Recursively handle Objects
  if (typeof data === 'object') {
    const newData: any = {};
    for (const key in data) {
      newData[key] = normalizeDates(data[key]);
    }
    return newData;
  }
  
  return data;
};

// Firestore does not accept 'undefined', so we must replace it with null or remove keys
const sanitizeForFirestore = (data: any): any => {
  if (data === undefined) return null;
  if (data === null) return null;

  if (Array.isArray(data)) {
    return data.map(sanitizeForFirestore);
  }

  if (typeof data === 'object') {
    const newData: any = {};
    for (const key in data) {
      const val = sanitizeForFirestore(data[key]);
      newData[key] = val;
    }
    return newData;
  }

  return data;
};

// Helper for consistency
const isWithinLast12Months = (dateString: string): boolean => {
  if (!dateString) return true;
  const date = new Date(dateString);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return date >= oneYearAgo;
};

// State to track if we should force offline mode due to errors
// Recovers automatically after a cooldown so transient failures don't permanently disable Firestore
let isOfflineMode = !isConfigured;
let offlineSince = 0;
const OFFLINE_COOLDOWN_MS = 30_000; // Retry Firestore after 30 seconds

const checkOffline = (): boolean => {
  if (!isConfigured || !dbInstance) return true;
  if (!isOfflineMode) return false;
  // Auto-recover after cooldown
  if (Date.now() - offlineSince > OFFLINE_COOLDOWN_MS) {
    isOfflineMode = false;
    console.log('[DB] Retrying Firestore connection after cooldown...');
    return false;
  }
  return true;
};

const goOffline = () => {
  isOfflineMode = true;
  offlineSince = Date.now();
};

export const db = {
  /**
   * Get the raw Firestore document count for companies (no merge, no localStorage).
   * Returns null if offline or Firestore unavailable.
   */
  async getFirestoreCompanyCount(): Promise<{ count: number; companies: Company[] } | null> {
    if (!isConfigured || !dbInstance) return null;
    // Bypass offline cooldown — this is an explicit user action
    try {
      const companyCollection = collection(dbInstance, COLLECTIONS.COMPANIES);
      const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(companyCollection), 15000);
      const companies = snapshot.docs.map(d => {
        const raw = d.data();
        const normalized = normalizeDates(raw);
        return { ...normalized, id: d.id } as Company;
      });
      return { count: companies.length, companies };
    } catch (e: any) {
      console.warn("[DB] Error fetching Firestore company count:", e.message);
      return null;
    }
  },

  /**
   * Fetch companies from Firestore or LocalStorage
   */
  async getCompanies(): Promise<Company[]> {
    let firestoreCompanies: Company[] = [];
    let firestoreOk = false;

    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const companyCollection = collection(dbInstance, COLLECTIONS.COMPANIES);
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(companyCollection), 5000);

        if (!snapshot.empty) {
          firestoreCompanies = snapshot.docs.map(doc => {
            const raw = doc.data();
            const normalized = normalizeDates(raw);
            return {
              ...normalized,
              id: doc.id,
              categories: Array.isArray(normalized.categories) ? normalized.categories : [],
              partners: Array.isArray(normalized.partners) ? normalized.partners : [],
              jobs: Array.isArray(normalized.jobs) ? normalized.jobs : []
            } as Company;
          });
          firestoreOk = true;
          console.log(`[DB] Loaded ${firestoreCompanies.length} companies from Firestore.`);
        } else {
          console.log('[DB] Firestore empty. Seeding initial MOCK data...');
          await this.saveCompanies(MOCK_COMPANIES);
          return MOCK_COMPANIES;
        }
      } catch (error: any) {
        console.warn("[DB] Error/Timeout fetching companies from Firestore (falling back to local storage):", error.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE ---
    let lsCompanies: Company[] = [];
    try {
      const stored = localStorage.getItem(LS_KEYS.COMPANIES);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          lsCompanies = parsed.map(c => ({
            ...c,
            categories: Array.isArray(c.categories) ? c.categories : [],
            partners: Array.isArray(c.partners) ? c.partners : [],
            jobs: Array.isArray(c.jobs) ? c.jobs : []
          }));
        }
      }
    } catch (e) {
      console.error("[DB] Local storage read error:", e);
    }

    // --- MERGE: if Firestore succeeded, union with localStorage to recover any missing entries ---
    if (firestoreOk) {
      const fsIds = new Set(firestoreCompanies.map(c => c.id));
      const lsOnly = lsCompanies.filter(c => !fsIds.has(c.id));
      if (lsOnly.length > 0) {
        const merged = [...firestoreCompanies, ...lsOnly];
        console.log(`[DB] Merged ${lsOnly.length} localStorage-only companies into Firestore snapshot. Re-syncing...`);
        this.saveCompanies(merged).catch(console.error);
        return merged;
      }
      return firestoreCompanies;
    }

    // --- OFFLINE FALLBACK ---
    if (lsCompanies.length > 0) return lsCompanies;

    // Seed if everything is empty
    await this.saveCompanies(MOCK_COMPANIES);
    return MOCK_COMPANIES;
  },

  /**
   * Force-write companies directly to Firestore, bypassing offline mode.
   * Returns the number actually saved. Throws on total failure.
   * Used by the sync panel for explicit user-triggered pushes.
   */
  async forceWriteToFirestore(companies: Company[]): Promise<number> {
    if (!isConfigured || !dbInstance) {
      throw new Error('Firebase is not configured. Check environment variables (VITE_FIREBASE_*).');
    }
    const BATCH_SIZE = 400;
    let savedCount = 0;
    const errors: string[] = [];
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
      const chunk = companies.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(dbInstance);
      chunk.forEach(company => {
        const docRef = doc(dbInstance, COLLECTIONS.COMPANIES, company.id);
        batch.set(docRef, sanitizeForFirestore(company), { merge: true });
      });
      try {
        await withTimeout(batch.commit(), 30000);
        savedCount += chunk.length;
      } catch (error: any) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      }
    }
    if (savedCount === 0) {
      throw new Error(`All batches failed: ${errors.join('; ')}`);
    }
    if (errors.length > 0) {
      console.warn(`[DB] Partial push: ${savedCount}/${companies.length} saved. Errors: ${errors.join('; ')}`);
    }
    return savedCount;
  },

  /**
   * Save companies (Upsert) — batches in chunks of 400 to stay under Firestore's 500 limit
   */
  async saveCompanies(companies: Company[]): Promise<void> {
    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      const BATCH_SIZE = 400;
      let savedCount = 0;
      for (let i = 0; i < companies.length; i += BATCH_SIZE) {
        const chunk = companies.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(dbInstance);
        chunk.forEach(company => {
          const docRef = doc(dbInstance, COLLECTIONS.COMPANIES, company.id);
          batch.set(docRef, sanitizeForFirestore(company), { merge: true });
        });
        try {
          await withTimeout(batch.commit(), 15000);
          savedCount += chunk.length;
        } catch (error: any) {
          console.error(`[DB] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
          if (i === 0) goOffline(); // only go offline if the very first batch fails (auth/config issue)
          break;
        }
      }
      if (savedCount > 0) console.log(`[DB] Saved ${savedCount} companies to Firestore.`);
    }

    // --- LOCAL STORAGE MODE ---
    try {
      localStorage.setItem(LS_KEYS.COMPANIES, JSON.stringify(companies));
    } catch (e) {
      console.error("[DB] Error saving to local storage:", e);
    }
  },

  /**
   * Delete a company
   */
  async deleteCompany(companyId: string): Promise<void> {
    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.COMPANIES, companyId);
        await withTimeout(deleteDoc(docRef), 3000);
        console.log(`[DB] Deleted company ${companyId} from Firestore.`);
      } catch (error: any) {
        console.error("[DB] Error deleting company from Firestore:", error.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE MODE ---
    // Always perform local deletion to ensure UI consistency immediately and for offline/fallback mode
    try {
      const stored = localStorage.getItem(LS_KEYS.COMPANIES);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter((c: Company) => c.id !== companyId);
          localStorage.setItem(LS_KEYS.COMPANIES, JSON.stringify(updated));
          console.log(`[DB] Deleted company ${companyId} from Local Storage.`);
        }
      }
    } catch (e) {
      console.error("[DB] Error deleting from local storage:", e);
    }
  },

  /**
   * Fetch news
   */
  async getNews(): Promise<NewsItem[]> {
    let items: NewsItem[] = [];

    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const newsCollection = collection(dbInstance, COLLECTIONS.NEWS);
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(newsCollection), 10000);

        if (snapshot.empty) {
          await this.saveNews(MOCK_NEWS);
          items = MOCK_NEWS;
        } else {
          items = snapshot.docs.map(doc => {
             const raw = doc.data();
             const normalized = normalizeDates(raw);
             return {
               ...normalized,
               id: doc.id,
               relatedCompanies: Array.isArray(normalized.relatedCompanies) ? normalized.relatedCompanies : []
             } as NewsItem;
          });
        }
      } catch (error: any) {
        console.warn("[DB] Error fetching news from Firestore:", error.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE MODE (Fallback) ---
    if (items.length === 0) {
      try {
        const stored = localStorage.getItem(LS_KEYS.NEWS);
        if (stored) {
            const parsed = JSON.parse(stored);
            items = Array.isArray(parsed) ? parsed : MOCK_NEWS;
        } else {
           await this.saveNews(MOCK_NEWS);
           items = MOCK_NEWS;
        }
      } catch (e) {
        items = MOCK_NEWS;
      }
    }

    return items.filter(n => isWithinLast12Months(n.date));
  },

  /**
   * Save news
   */
  async saveNews(news: NewsItem[]): Promise<void> {
    const validNews = news.filter(n => isWithinLast12Months(n.date));

    // --- FIREBASE MODE (chunked to stay under Firestore's 500-op batch limit) ---
    if (!checkOffline()) {
      try {
        const BATCH_SIZE = 450;
        for (let i = 0; i < validNews.length; i += BATCH_SIZE) {
          const chunk = validNews.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(dbInstance);
          chunk.forEach(item => {
            const docRef = doc(dbInstance, COLLECTIONS.NEWS, item.id);
            batch.set(docRef, sanitizeForFirestore(item), { merge: true });
          });
          await withTimeout(batch.commit(), 12000);
        }
        console.log(`[DB] Saved ${validNews.length} news items in ${Math.ceil(validNews.length / BATCH_SIZE)} batch(es).`);
      } catch (error: any) {
        console.error("[DB] Error saving news:", error.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE MODE ---
    try {
      // Merge with existing local news to simulate a growing feed if offline
      const existingStr = localStorage.getItem(LS_KEYS.NEWS);
      let existing = existingStr ? JSON.parse(existingStr) : [];
      // Deduplicate by ID
      const newsMap = new Map();
      existing.forEach((n: NewsItem) => newsMap.set(n.id, n));
      validNews.forEach(n => newsMap.set(n.id, n));
      
      localStorage.setItem(LS_KEYS.NEWS, JSON.stringify(Array.from(newsMap.values())));
    } catch(e) {
      // ignore
    }
  },

  /**
   * Get last scan time
   */
  async getLastScanTime(): Promise<number> {
     // --- FIREBASE MODE ---
     if (!checkOffline()) {
       try {
         const docRef = doc(dbInstance, COLLECTIONS.SYSTEM, 'meta');
         const docSnap = await withTimeout<DocumentSnapshot<DocumentData>>(getDoc(docRef), 3000);
         if (docSnap.exists()) {
           const data = docSnap.data();
           return data?.lastScanTime || 0;
         }
         return 0;
       } catch (e: any) {
         console.warn("[DB] Could not fetch last scan time (using local):", e.message);
       }
     }

     // --- LOCAL STORAGE MODE ---
     const stored = localStorage.getItem(LS_KEYS.SCAN);
     return stored ? parseInt(stored, 10) : 0;
  },

  /**
   * Save last scan time
   */
  async saveLastScanTime(time: number): Promise<void> {
    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.SYSTEM, 'meta');
        await setDoc(docRef, { lastScanTime: time }, { merge: true });
      } catch (e) {
        console.error("[DB] Error saving last scan time", e);
      }
    }

    // --- LOCAL STORAGE MODE ---
    localStorage.setItem(LS_KEYS.SCAN, time.toString());
  },

  /**
   * Save Global 500 Activity Data
   */
  async saveGlobalActivity(data: Global500ResearchData): Promise<void> {
    const docId = data.rank.toString();

    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.GLOBAL500, docId);
        await withTimeout(setDoc(docRef, sanitizeForFirestore(data), { merge: true }), 3000);
      } catch (e: any) {
        console.error("[DB] Error saving global activity:", e.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE MODE ---
    try {
      const stored = localStorage.getItem(LS_KEYS.GLOBAL500);
      const existing = stored ? JSON.parse(stored) : {};
      existing[docId] = data;
      localStorage.setItem(LS_KEYS.GLOBAL500, JSON.stringify(existing));
    } catch(e) {
      console.error("[DB] LS error saveGlobalActivity", e);
    }
  },

  /**
   * Get All Global 500 Activity Data
   */
  async getGlobalActivity(): Promise<Record<string, Global500ResearchData>> {
    let dataMap: Record<string, Global500ResearchData> = {};

    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const gCollection = collection(dbInstance, COLLECTIONS.GLOBAL500);
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(gCollection), 10000);
        snapshot.forEach(doc => {
           dataMap[doc.id] = normalizeDates(doc.data()) as Global500ResearchData;
        });
        return dataMap;
      } catch (e: any) {
        console.warn("[DB] Error fetching global activity:", e.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE MODE ---
    try {
      const stored = localStorage.getItem(LS_KEYS.GLOBAL500);
      if (stored) {
        dataMap = JSON.parse(stored);
      }
    } catch(e) {
      // ignore
    }

    return dataMap;
  },

  /**
   * Get all saved company lists
   */
  async getLists(): Promise<CompanyListType[]> {
    let lists: CompanyListType[] = [];

    if (!checkOffline()) {
      try {
        const listsCollection = collection(dbInstance, COLLECTIONS.LISTS);
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(listsCollection), 10000);
        if (!snapshot.empty) {
          lists = snapshot.docs.map(d => {
            const raw = d.data();
            const normalized = normalizeDates(raw);
            return { ...normalized, id: d.id, entries: Array.isArray(normalized.entries) ? normalized.entries : [] } as CompanyListType;
          });
          return lists;
        }
      } catch (e: any) {
        console.warn("[DB] Error fetching lists from Firestore:", e.message);
        goOffline();
      }
    }

    try {
      const stored = localStorage.getItem(LS_KEYS.LISTS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) lists = parsed;
      }
    } catch (e) { /* ignore */ }

    return lists;
  },

  /**
   * Save a single company list (upsert)
   */
  async saveList(list: CompanyListType): Promise<void> {
    if (!checkOffline()) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.LISTS, list.id);
        await withTimeout(setDoc(docRef, sanitizeForFirestore(list), { merge: true }), 3000);
      } catch (e: any) {
        console.error("[DB] Error saving list:", e.message);
        goOffline();
      }
    }

    try {
      const stored = localStorage.getItem(LS_KEYS.LISTS);
      const existing: CompanyListType[] = stored ? JSON.parse(stored) : [];
      const idx = existing.findIndex(l => l.id === list.id);
      if (idx >= 0) existing[idx] = list; else existing.push(list);
      localStorage.setItem(LS_KEYS.LISTS, JSON.stringify(existing));
    } catch (e) { console.error("[DB] LS error saveList", e); }
  },

  /**
   * Delete multiple companies by ID (batch)
   */
  async deleteCompanies(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const BATCH_SIZE = 400;
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const chunk = ids.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(dbInstance);
          chunk.forEach(id => {
            const docRef = doc(dbInstance, COLLECTIONS.COMPANIES, id);
            batch.delete(docRef);
          });
          await withTimeout(batch.commit(), 8000);
        }
        console.log(`[DB] Deleted ${ids.length} companies from Firestore.`);
      } catch (error: any) {
        console.error("[DB] Error batch-deleting companies from Firestore:", error.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE MODE ---
    try {
      const stored = localStorage.getItem(LS_KEYS.COMPANIES);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const idSet = new Set(ids);
          const updated = parsed.filter((c: Company) => !idSet.has(c.id));
          localStorage.setItem(LS_KEYS.COMPANIES, JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.error("[DB] Error batch-deleting from local storage:", e);
    }
  },

  /**
   * Delete a company list
   */
  async deleteList(listId: string): Promise<void> {
    if (!checkOffline()) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.LISTS, listId);
        await withTimeout(deleteDoc(docRef), 3000);
      } catch (e: any) {
        console.error("[DB] Error deleting list:", e.message);
        goOffline();
      }
    }

    try {
      const stored = localStorage.getItem(LS_KEYS.LISTS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          localStorage.setItem(LS_KEYS.LISTS, JSON.stringify(parsed.filter((l: CompanyListType) => l.id !== listId)));
        }
      }
    } catch (e) { console.error("[DB] LS error deleteList", e); }
  },

  /**
   * Get all news votes: { [newsId]: 'up' | 'down' }
   * Reads from Firestore first, falls back to localStorage
   */
  async getNewsVotes(): Promise<Record<string, NewsVote>> {
    // --- FIREBASE MODE ---
    if (!checkOffline()) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.NEWS_VOTES, 'all');
        const docSnap = await withTimeout<DocumentSnapshot<DocumentData>>(getDoc(docRef), 3000);
        if (docSnap.exists()) {
          const data = docSnap.data() as Record<string, NewsVote>;
          // Sync to localStorage for fast reads
          localStorage.setItem(LS_KEYS.NEWS_VOTES, JSON.stringify(data));
          return data;
        }
      } catch (e: any) {
        console.warn("[DB] Error fetching news votes from Firestore:", e.message);
        goOffline();
      }
    }

    // --- LOCAL STORAGE FALLBACK ---
    try {
      const stored = localStorage.getItem(LS_KEYS.NEWS_VOTES);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  },

  /**
   * Set vote for a single news item (or remove if vote is undefined)
   * Persists to both Firestore and localStorage
   */
  async setNewsVote(newsId: string, vote: NewsVote | undefined): Promise<void> {
    // Read current votes from localStorage for immediate update
    let votes: Record<string, NewsVote> = {};
    try {
      const stored = localStorage.getItem(LS_KEYS.NEWS_VOTES);
      votes = stored ? JSON.parse(stored) : {};
    } catch { /* start fresh */ }

    if (vote) {
      votes[newsId] = vote;
    } else {
      delete votes[newsId];
    }

    // --- LOCAL STORAGE (immediate) ---
    localStorage.setItem(LS_KEYS.NEWS_VOTES, JSON.stringify(votes));

    // --- FIREBASE MODE (async) ---
    if (!checkOffline()) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.NEWS_VOTES, 'all');
        await withTimeout(setDoc(docRef, sanitizeForFirestore(votes)), 3000);
      } catch (e: any) {
        console.error("[DB] Error saving news vote to Firestore:", e.message);
        goOffline();
      }
    }
  },

  /**
   * Get voted news summaries for AI context (titles + vote direction)
   */
  async getVoteSummaryForAI(companyName: string, allNews: NewsItem[]): Promise<{ liked: string[]; disliked: string[] }> {
    const votes = await this.getNewsVotes();
    const liked: string[] = [];
    const disliked: string[] = [];
    for (const item of allNews) {
      if (!item.relatedCompanies.some(rc => rc.toLowerCase() === companyName.toLowerCase())) continue;
      const v = votes[item.id];
      if (v === 'up') liked.push(item.title);
      if (v === 'down') disliked.push(item.title);
    }
    return { liked, disliked };
  },

  // --- Reprocess & Clean News ---

  /**
   * Reprocess all existing articles:
   * 1. Re-clean titles using cleanSearchTitle (strip site suffixes, fix URL-like titles)
   * 2. Re-resolve source names from URLs
   * 3. Remove articles about token prices, token launches, exchange reviews, etc.
   * Returns { kept, removed } counts.
   */
  async reprocessNews(): Promise<{ kept: number; removed: number; reprocessed: NewsItem[] }> {
    const allNews = await this.getNews();

    // --- Reprocess kept articles ---
    const kept: NewsItem[] = [];
    const removedIds: string[] = [];

    for (const item of allNews) {
      if (isIrrelevantNews(item.title, item.summary, item.url)) {
        removedIds.push(item.id);
        continue;
      }

      // Re-clean title from summary if it looks like a URL or is garbled
      const newTitle = cleanSearchTitle(item.title, item.summary);

      // Re-resolve source name from URL (converts raw domains → human labels)
      let newSource = item.source;
      if (item.url && item.url !== '#') {
        const resolved = resolveSourceName(item.url, '');
        if (resolved) newSource = resolved;
      } else if (/^[\w.-]+\.[a-z]{2,6}(\.[a-z]{2,6})?$/i.test(newSource)) {
        // Stored source looks like a bare domain (e.g. "tracxn.com" or "tracxn.com.com")
        // Strip duplicate TLDs first, then convert to a label
        const deduped = newSource.replace(/(\.[a-z]{2,6})\1$/i, '$1');
        newSource = deduped.replace(/^www\./i, '').replace(/\.[a-z]{2,6}(\.[a-z]{2,6})?$/i, '')
          .replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || newSource;
      }

      kept.push({ ...item, title: newTitle, source: newSource || item.source });
    }

    // --- Delete removed articles from Firestore ---
    if (removedIds.length > 0 && !checkOffline() && dbInstance) {
      try {
        const BATCH_SIZE = 450;
        for (let i = 0; i < removedIds.length; i += BATCH_SIZE) {
          const batch = writeBatch(dbInstance);
          removedIds.slice(i, i + BATCH_SIZE).forEach(id => {
            batch.delete(doc(dbInstance, COLLECTIONS.NEWS, id));
          });
          await withTimeout(batch.commit(), 12000);
        }
      } catch (e: any) {
        console.warn('[DB] reprocessNews delete error:', e.message);
      }
    }

    // --- Save cleaned articles back ---
    await this.saveNews(kept);

    // Also overwrite localStorage (saveNews merges, so overwrite explicitly)
    try {
      localStorage.setItem(LS_KEYS.NEWS, JSON.stringify(kept));
    } catch { /* ignore */ }

    console.log(`[DB] Reprocessed news: kept ${kept.length}, removed ${removedIds.length}`);
    return { kept: kept.length, removed: removedIds.length, reprocessed: kept };
  },

  /**
   * Reprocess all company partnerships: resolve token/product names to company names.
   * Returns the list of companies that were modified.
   */
  async reprocessPartners(): Promise<{ fixed: number; companies: Company[] }> {
    const allCompanies = await this.getCompanies();
    let fixed = 0;

    const updatedCompanies = allCompanies.map(company => {
      if (!company.partners || company.partners.length === 0) return company;

      let changed = false;
      const seenKeys = new Set<string>();
      const newPartners = [];

      for (const p of company.partners) {
        const resolved = resolvePartnerCompany(p.name);
        let name = resolved.token ? resolved.name : p.name;
        let desc = p.description || '';

        if (resolved.token) {
          changed = true;
          // Ensure the original token is mentioned in description
          if (desc && !desc.includes(resolved.token)) {
            desc = `${desc} (${resolved.token})`;
          } else if (!desc) {
            desc = `${resolved.token} integration`;
          }
        }

        // Deduplicate after remapping (e.g. both USDC and Circle → Circle)
        const key = `${name.toLowerCase()}|${p.type}`;
        if (seenKeys.has(key)) {
          changed = true; // removing a duplicate counts as a change
          continue;
        }
        seenKeys.add(key);

        newPartners.push({ ...p, name, description: desc });
      }

      if (changed) {
        fixed++;
        return { ...company, partners: newPartners };
      }
      return company;
    });

    // Save modified companies
    if (fixed > 0) {
      const modifiedCompanies = updatedCompanies.filter((c, i) => c !== allCompanies[i]);
      await this.saveCompanies(modifiedCompanies);
    }

    return { fixed, companies: updatedCompanies };
  },

  // --- Source Configuration ---

  async getSourceConfig(): Promise<{ customSources: { domain: string; name: string; tier: string }[]; excludedDomains: string[] }> {
    const defaults = { customSources: [], excludedDomains: [] };
    try {
      if (!checkOffline() && dbInstance) {
        const docRef = doc(dbInstance, COLLECTIONS.SOURCES, 'config');
        const snap = await withTimeout(getDoc(docRef), 5000);
        if (snap.exists()) {
          const data = snap.data();
          localStorage.setItem(LS_KEYS.SOURCES, JSON.stringify(data));
          return { customSources: data.customSources || [], excludedDomains: data.excludedDomains || [] };
        }
      }
    } catch { /* fall through */ }
    try {
      const stored = localStorage.getItem(LS_KEYS.SOURCES);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return defaults;
  },

  async saveSourceConfig(config: { customSources: { domain: string; name: string; tier: string }[]; excludedDomains: string[] }): Promise<void> {
    localStorage.setItem(LS_KEYS.SOURCES, JSON.stringify(config));
    try {
      if (!checkOffline() && dbInstance) {
        const docRef = doc(dbInstance, COLLECTIONS.SOURCES, 'config');
        await withTimeout(setDoc(docRef, sanitizeForFirestore(config)), 5000);
      }
    } catch (e: any) {
      console.warn('[DB] saveSourceConfig Firestore write failed:', e.message);
      goOffline();
    }
  }
};
