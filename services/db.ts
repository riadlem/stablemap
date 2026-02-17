
import { Company, NewsItem, CompanyFocus, Global500ResearchData, CompanyList as CompanyListType } from '../types';
import { MOCK_COMPANIES, MOCK_NEWS } from '../constants';
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
  LISTS: 'company_lists'
};

const LS_KEYS = {
  COMPANIES: 'stablemap_companies',
  NEWS: 'stablemap_news',
  SCAN: 'stablemap_lastscan',
  GLOBAL500: 'stablemap_global500',
  LISTS: 'stablemap_lists'
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
let isOfflineMode = !isConfigured;

export const db = {
  /**
   * Fetch companies from Firestore or LocalStorage
   */
  async getCompanies(): Promise<Company[]> {
    let companies: Company[] = [];

    // --- FIREBASE MODE ---
    if (!isOfflineMode && dbInstance) {
      try {
        const companyCollection = collection(dbInstance, COLLECTIONS.COMPANIES);
        // Use timeout for reads too
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(companyCollection), 3000);

        if (!snapshot.empty) {
          companies = snapshot.docs.map(doc => {
            const raw = doc.data();
            const normalized = normalizeDates(raw);
            return { 
              ...normalized, 
              id: doc.id,
              // ENFORCE ARRAYS to prevent 'map of undefined' errors
              categories: Array.isArray(normalized.categories) ? normalized.categories : [],
              partners: Array.isArray(normalized.partners) ? normalized.partners : [],
              jobs: Array.isArray(normalized.jobs) ? normalized.jobs : []
            } as Company;
          });
          console.log(`[DB] Loaded ${companies.length} companies from Firestore.`);
        } else {
          console.log('[DB] Firestore empty. Seeding initial MOCK data...');
          await this.saveCompanies(MOCK_COMPANIES); 
          return MOCK_COMPANIES;
        }
      } catch (error: any) {
        console.warn("[DB] Error/Timeout fetching companies from Firestore (falling back to local storage):", error.message);
        isOfflineMode = true;
      }
    }

    // --- LOCAL STORAGE MODE ---
    if (companies.length === 0) {
      try {
        const stored = localStorage.getItem(LS_KEYS.COMPANIES);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Apply same safety checks to LS data
            companies = parsed.map(c => ({
               ...c,
               categories: Array.isArray(c.categories) ? c.categories : [],
               partners: Array.isArray(c.partners) ? c.partners : [],
               jobs: Array.isArray(c.jobs) ? c.jobs : []
            }));
          } else {
            companies = MOCK_COMPANIES;
          }
        } else {
          // Seed if empty
          await this.saveCompanies(MOCK_COMPANIES);
          companies = MOCK_COMPANIES;
        }
      } catch (e) {
        console.error("[DB] Local storage error:", e);
        companies = MOCK_COMPANIES;
      }
    }

    // Defensive check
    if (!Array.isArray(companies)) return MOCK_COMPANIES;

    return companies;
  },

  /**
   * Save companies (Upsert)
   */
  async saveCompanies(companies: Company[]): Promise<void> {
    // --- FIREBASE MODE ---
    if (!isOfflineMode && dbInstance) {
      try {
        const batch = writeBatch(dbInstance);
        
        companies.forEach(company => {
          const docRef = doc(dbInstance, COLLECTIONS.COMPANIES, company.id);
          const safeData = sanitizeForFirestore(company);
          batch.set(docRef, safeData, { merge: true });
        });
        
        await withTimeout(batch.commit(), 3000);
        console.log(`[DB] Saved ${companies.length} companies to Firestore.`);
      } catch (error: any) {
        console.error("[DB] Error saving companies to Firestore:", error.message);
        isOfflineMode = true; // Switch to offline on write failure too
      }
    }

    // --- LOCAL STORAGE MODE ---
    // Always save to local storage as backup/cache
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
    if (!isOfflineMode && dbInstance) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.COMPANIES, companyId);
        // CRITICAL: Add timeout to prevent hanging UI if keys are bad or network is weird
        await withTimeout(deleteDoc(docRef), 2000);
        console.log(`[DB] Deleted company ${companyId} from Firestore.`);
      } catch (error: any) {
        console.error("[DB] Error deleting company from Firestore (switching to offline):", error.message);
        isOfflineMode = true; 
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
    if (!isOfflineMode && dbInstance) {
      try {
        const newsCollection = collection(dbInstance, COLLECTIONS.NEWS);
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(newsCollection), 3000);

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
        isOfflineMode = true;
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

    // --- FIREBASE MODE ---
    if (!isOfflineMode && dbInstance) {
      try {
        const batch = writeBatch(dbInstance);
        validNews.forEach(item => {
          const docRef = doc(dbInstance, COLLECTIONS.NEWS, item.id);
          const safeData = sanitizeForFirestore(item);
          batch.set(docRef, safeData, { merge: true });
        });
        await withTimeout(batch.commit(), 3000);
      } catch (error: any) {
        console.error("[DB] Error saving news:", error.message);
        isOfflineMode = true;
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
     if (!isOfflineMode && dbInstance) {
       try {
         const docRef = doc(dbInstance, COLLECTIONS.SYSTEM, 'meta');
         const docSnap = await withTimeout<DocumentSnapshot<DocumentData>>(getDoc(docRef), 2000);
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
    if (!isOfflineMode && dbInstance) {
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
    if (!isOfflineMode && dbInstance) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.GLOBAL500, docId);
        await withTimeout(setDoc(docRef, sanitizeForFirestore(data), { merge: true }), 3000);
      } catch (e: any) {
        console.error("[DB] Error saving global activity:", e.message);
        isOfflineMode = true;
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
    if (!isOfflineMode && dbInstance) {
      try {
        const gCollection = collection(dbInstance, COLLECTIONS.GLOBAL500);
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(gCollection), 3000);
        snapshot.forEach(doc => {
           dataMap[doc.id] = normalizeDates(doc.data()) as Global500ResearchData;
        });
        return dataMap;
      } catch (e: any) {
        console.warn("[DB] Error fetching global activity:", e.message);
        isOfflineMode = true;
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

    if (!isOfflineMode && dbInstance) {
      try {
        const listsCollection = collection(dbInstance, COLLECTIONS.LISTS);
        const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(listsCollection), 3000);
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
        isOfflineMode = true;
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
    if (!isOfflineMode && dbInstance) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.LISTS, list.id);
        await withTimeout(setDoc(docRef, sanitizeForFirestore(list), { merge: true }), 3000);
      } catch (e: any) {
        console.error("[DB] Error saving list:", e.message);
        isOfflineMode = true;
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
   * Delete a company list
   */
  async deleteList(listId: string): Promise<void> {
    if (!isOfflineMode && dbInstance) {
      try {
        const docRef = doc(dbInstance, COLLECTIONS.LISTS, listId);
        await withTimeout(deleteDoc(docRef), 2000);
      } catch (e: any) {
        console.error("[DB] Error deleting list:", e.message);
        isOfflineMode = true;
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
  }
};
