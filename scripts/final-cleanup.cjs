const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, setDoc, writeBatch } = require('firebase/firestore');

const config = {
  apiKey: 'AIzaSyB30k09zzjlK6jyvpD3E7X3P8BdCOdlyT0',
  authDomain: 'stablemap-app.firebaseapp.com',
  projectId: 'stablemap-app',
  storageBucket: 'stablemap-app.firebasestorage.app',
  messagingSenderId: '1062872314462',
  appId: '1:1062872314462:web:cc56661049e1e08072bacf'
};

function generateCompanyId(name) {
  return 'c-' + name.replace(/[,.]/g, '').replace(/\s+(Inc|LLC|Ltd|Limited|Corp|Corporation|Group|Holdings|PLC|SA|AG|GmbH)$/i, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeName(name) {
  return (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreRecord(data) {
  let score = 0;
  const desc = data.description || '';
  if (desc.length > 30 && !desc.includes('Fetching') && !desc.includes('Queued') && !desc.includes('unavailable')) score += 10;
  score += (data.partners || []).length * 3;
  if (data.website) score += 2;
  if (data.headquarters && data.headquarters !== 'Pending...' && data.headquarters !== 'Fetching...') score += 2;
  score += (data.categories || []).length;
  score += (data.jobs || []).length * 2;
  score += (data.recentNews || []).length;
  if (data.funding) score += 5;
  return score;
}

function mergeRecords(primary, secondary) {
  const merged = { ...primary };
  // Merge partners
  const pMap = new Map();
  [...(primary.partners || []), ...(secondary.partners || [])].forEach(p => {
    const key = (p.name || '').toLowerCase();
    if (!pMap.has(key) || (p.description || '').length > ((pMap.get(key).description || '').length)) pMap.set(key, p);
  });
  merged.partners = Array.from(pMap.values());
  // Merge jobs
  const jMap = new Map();
  [...(primary.jobs || []), ...(secondary.jobs || [])].forEach(j => jMap.set(j.id || j.title, j));
  merged.jobs = Array.from(jMap.values());
  // Merge news
  const nMap = new Map();
  [...(primary.recentNews || []), ...(secondary.recentNews || [])].forEach(n => nMap.set(n.id || n.title, n));
  merged.recentNews = Array.from(nMap.values());
  // Merge categories
  merged.categories = Array.from(new Set([...(primary.categories || []), ...(secondary.categories || [])]));
  // Prefer non-empty fields
  if (!merged.website && secondary.website) merged.website = secondary.website;
  if ((!merged.headquarters || merged.headquarters === 'Pending...' || merged.headquarters === 'Fetching...') && secondary.headquarters && secondary.headquarters !== 'Pending...' && secondary.headquarters !== 'Fetching...') merged.headquarters = secondary.headquarters;
  if ((!merged.description || merged.description.includes('Fetching') || merged.description.includes('unavailable')) && secondary.description && !secondary.description.includes('Fetching') && !secondary.description.includes('unavailable')) merged.description = secondary.description;
  if (!merged.funding && secondary.funding) merged.funding = secondary.funding;
  if ((!merged.region || merged.region === 'Global') && secondary.region && secondary.region !== 'Global') merged.region = secondary.region;
  if (merged.logoPlaceholder && merged.logoPlaceholder.includes('ui-avatars') && secondary.logoPlaceholder && !secondary.logoPlaceholder.includes('ui-avatars')) merged.logoPlaceholder = secondary.logoPlaceholder;
  return merged;
}

function sanitize(data) {
  if (data === undefined) return null;
  if (data === null) return null;
  if (Array.isArray(data)) return data.map(sanitize);
  if (typeof data === 'object') {
    const out = {};
    for (const key in data) out[key] = sanitize(data[key]);
    return out;
  }
  return data;
}

(async () => {
  const app = getApps().length === 0 ? initializeApp(config) : getApp();
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'companies'));
  console.log('Total companies before cleanup:', snap.size);

  // Group by normalized name
  const groups = new Map();
  snap.docs.forEach(d => {
    const data = d.data();
    const norm = normalizeName(data.name);
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push({ id: d.id, data: { ...data, id: d.id } });
  });

  const toWrite = [];  // { id, data } for canonical records
  const toDelete = []; // IDs to delete

  for (const [norm, entries] of groups) {
    const canonicalId = generateCompanyId(entries[0].data.name);

    if (entries.length === 1) {
      // No duplicate, but maybe needs ID migration
      if (entries[0].id !== canonicalId) {
        toWrite.push({ id: canonicalId, data: { ...entries[0].data, id: canonicalId } });
        toDelete.push(entries[0].id);
      }
      continue;
    }

    // Multiple entries — score, merge, keep canonical
    entries.forEach(e => { e.score = scoreRecord(e.data); });
    entries.sort((a, b) => b.score - a.score);

    let merged = { ...entries[0].data };
    for (let i = 1; i < entries.length; i++) {
      merged = mergeRecords(merged, entries[i].data);
    }
    merged.id = canonicalId;

    toWrite.push({ id: canonicalId, data: merged });

    // Delete ALL IDs that aren't the canonical one
    entries.forEach(e => {
      if (e.id !== canonicalId) toDelete.push(e.id);
    });

    console.log(`Merged "${entries[0].data.name}" (${entries.length} records, ${(merged.partners || []).length} partners) -> ${canonicalId}`);
  }

  console.log('\nRecords to write:', toWrite.length);
  console.log('Records to delete:', toDelete.length);

  // Write merged/migrated records
  const BATCH_SIZE = 400;
  for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
    const chunk = toWrite.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(item => {
      batch.set(doc(db, 'companies', item.id), sanitize(item.data), { merge: true });
    });
    await batch.commit();
    console.log(`  Wrote batch: ${chunk.length}`);
  }

  // Delete old records
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(id => batch.delete(doc(db, 'companies', id)));
    await batch.commit();
    console.log(`  Deleted batch: ${chunk.length}`);
  }

  const afterSnap = await getDocs(collection(db, 'companies'));
  console.log('\nTotal companies after cleanup:', afterSnap.size);

  // Verify no duplicates remain
  const afterGroups = new Map();
  afterSnap.docs.forEach(d => {
    const norm = normalizeName(d.data().name);
    afterGroups.set(norm, (afterGroups.get(norm) || 0) + 1);
  });
  let remaining = 0;
  for (const [k, v] of afterGroups) { if (v > 1) remaining++; }
  console.log('Remaining duplicate groups:', remaining);

  let numericIds = 0;
  afterSnap.docs.forEach(d => { if (!/^c-/.test(d.id)) numericIds++; });
  console.log('Non-canonical IDs remaining:', numericIds);
  console.log('Done!');

  process.exit(0);
})();
