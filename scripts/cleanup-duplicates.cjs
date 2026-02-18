const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch } = require('firebase/firestore');

const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

function normalizeName(name) {
  return (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateCompanyId(name) {
  const cleanName = name
    .replace(/[,.]/g, '')
    .replace(/\s+(Inc|LLC|Ltd|Limited|Corp|Corporation|Group|Holdings|PLC|SA|AG|GmbH)$/i, '')
    .trim();
  return 'c-' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Score a record by how much useful data it has
function scoreRecord(data) {
  let score = 0;
  if (data.description && data.description.length > 30 &&
      !data.description.includes('Fetching') &&
      !data.description.includes('Queued') &&
      !data.description.includes('unavailable')) score += 10;
  score += (data.partners || []).length * 3;
  if (data.website) score += 2;
  if (data.headquarters && data.headquarters !== 'Pending...') score += 2;
  score += (data.categories || []).length;
  score += (data.jobs || []).length * 2;
  score += (data.recentNews || []).length;
  if (data.funding) score += 5;
  return score;
}

// Deep merge: keep best non-empty value for each field
function mergeRecords(primary, secondary) {
  const merged = { ...primary };

  // Merge partners (deduplicate by name)
  const allPartners = [...(primary.partners || []), ...(secondary.partners || [])];
  const partnerMap = new Map();
  allPartners.forEach(p => {
    const key = (p.name || '').toLowerCase();
    if (!partnerMap.has(key) || (p.description || '').length > ((partnerMap.get(key).description || '').length)) {
      partnerMap.set(key, p);
    }
  });
  merged.partners = Array.from(partnerMap.values());

  // Merge jobs
  const allJobs = [...(primary.jobs || []), ...(secondary.jobs || [])];
  const jobMap = new Map();
  allJobs.forEach(j => jobMap.set(j.id || j.title, j));
  merged.jobs = Array.from(jobMap.values());

  // Merge news
  const allNews = [...(primary.recentNews || []), ...(secondary.recentNews || [])];
  const newsMap = new Map();
  allNews.forEach(n => newsMap.set(n.id || n.title, n));
  merged.recentNews = Array.from(newsMap.values());

  // Merge categories (deduplicate)
  const cats = new Set([...(primary.categories || []), ...(secondary.categories || [])]);
  merged.categories = Array.from(cats);

  // Prefer non-empty fields
  if (!merged.website && secondary.website) merged.website = secondary.website;
  if ((!merged.headquarters || merged.headquarters === 'Pending...') && secondary.headquarters && secondary.headquarters !== 'Pending...')
    merged.headquarters = secondary.headquarters;
  if ((!merged.description || merged.description.includes('Fetching') || merged.description.includes('unavailable')) &&
      secondary.description && !secondary.description.includes('Fetching') && !secondary.description.includes('unavailable'))
    merged.description = secondary.description;
  if (!merged.funding && secondary.funding) merged.funding = secondary.funding;
  if ((!merged.region || merged.region === 'Global') && secondary.region && secondary.region !== 'Global')
    merged.region = secondary.region;
  if ((!merged.focus || merged.focus === 'Crypto-Second') && secondary.focus)
    merged.focus = secondary.focus;
  if (merged.logoPlaceholder && merged.logoPlaceholder.includes('ui-avatars') && secondary.logoPlaceholder && !secondary.logoPlaceholder.includes('ui-avatars'))
    merged.logoPlaceholder = secondary.logoPlaceholder;

  return merged;
}

(async () => {
  const app = getApps().length === 0 ? initializeApp(config) : getApp();
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'companies'));

  console.log('Total companies before cleanup:', snap.size);

  // Group by normalized name
  const byNormName = new Map();
  snap.docs.forEach(d => {
    const data = d.data();
    const normName = normalizeName(data.name);
    if (!byNormName.has(normName)) byNormName.set(normName, []);
    byNormName.get(normName).push({ id: d.id, data: { ...data, id: d.id } });
  });

  const toDelete = [];
  const toUpsert = [];

  for (const [normName, entries] of byNormName) {
    if (entries.length <= 1) continue;

    // Score each entry
    entries.forEach(e => { e.score = scoreRecord(e.data); });
    entries.sort((a, b) => b.score - a.score);

    const best = entries[0];
    const canonicalId = generateCompanyId(best.data.name);

    // Merge all records into the best one
    let merged = { ...best.data };
    for (let i = 1; i < entries.length; i++) {
      merged = mergeRecords(merged, entries[i].data);
    }

    // Set the canonical c- ID
    merged.id = canonicalId;

    console.log(`\nMerging: "${best.data.name}" (${entries.length} records)`);
    entries.forEach(e => console.log(`  - ${e.id} (score: ${e.score}, partners: ${(e.data.partners || []).length})`));
    console.log(`  => Merged into: ${canonicalId} (partners: ${merged.partners.length})`);

    // Schedule writes
    toUpsert.push({ id: canonicalId, data: merged });

    // Delete all old IDs (including the canonical if it already existed - we'll re-write it)
    entries.forEach(e => {
      if (e.id !== canonicalId) {
        toDelete.push(e.id);
      }
    });
  }

  if (toUpsert.length === 0) {
    console.log('\nNo duplicates to merge.');
    process.exit(0);
  }

  console.log('\n=== EXECUTING CLEANUP ===');
  console.log('Records to upsert (merged):', toUpsert.length);
  console.log('Records to delete:', toDelete.length);

  // Sanitize for Firestore
  function sanitize(data) {
    if (data === undefined) return null;
    if (data === null) return null;
    if (Array.isArray(data)) return data.map(sanitize);
    if (typeof data === 'object') {
      const out = {};
      for (const key in data) {
        out[key] = sanitize(data[key]);
      }
      return out;
    }
    return data;
  }

  // Write merged records
  for (const item of toUpsert) {
    const docRef = doc(db, 'companies', item.id);
    await setDoc(docRef, sanitize(item.data), { merge: true });
    console.log('  Upserted:', item.id);
  }

  // Delete old records in batches
  const BATCH_SIZE = 400;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(id => {
      batch.delete(doc(db, 'companies', id));
    });
    await batch.commit();
    console.log(`  Deleted batch: ${chunk.length} records`);
  }

  // Verify
  const afterSnap = await getDocs(collection(db, 'companies'));
  console.log('\nTotal companies after cleanup:', afterSnap.size);
  console.log('Removed:', snap.size - afterSnap.size, 'duplicate records');
  console.log('Done!');

  process.exit(0);
})();
