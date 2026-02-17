const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const config = {
  apiKey: 'AIzaSyB30k09zzjlK6jyvpD3E7X3P8BdCOdlyT0',
  authDomain: 'stablemap-app.firebaseapp.com',
  projectId: 'stablemap-app',
  storageBucket: 'stablemap-app.firebasestorage.app',
  messagingSenderId: '1062872314462',
  appId: '1:1062872314462:web:cc56661049e1e08072bacf'
};

(async () => {
  const app = getApps().length === 0 ? initializeApp(config) : getApp();
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'companies'));

  // Collect all companies by normalized name for duplicate detection
  const byNormName = new Map();
  snap.docs.forEach(d => {
    const data = d.data();
    const name = (data.name || '').trim();
    const normName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!byNormName.has(normName)) byNormName.set(normName, []);
    byNormName.get(normName).push({
      id: d.id,
      name,
      description: (data.description || '').substring(0, 80),
      partners: (data.partners || []).length,
      website: data.website || '',
      headquarters: data.headquarters || '',
    });
  });

  // Show duplicates
  console.log('=== DUPLICATES (same normalized name, different IDs) ===');
  let dupCount = 0;
  for (const [norm, entries] of byNormName) {
    if (entries.length > 1) {
      dupCount++;
      console.log('\nDuplicate group:', norm);
      entries.forEach(e => console.log('  ID:', e.id, '| Name:', e.name, '| Partners:', e.partners, '| HQ:', e.headquarters, '| Web:', e.website));
    }
  }
  console.log('\nTotal duplicate groups:', dupCount);
  console.log('Total companies:', snap.size);

  // Old-style numeric IDs
  console.log('\n=== OLD-STYLE NUMERIC IDs ===');
  snap.docs.forEach(d => {
    if (/^\d+$/.test(d.id)) {
      const data = d.data();
      const genId = 'c-' + (data.name || '').replace(/[,.]/g, '').replace(/\s+(Inc|LLC|Ltd|Limited|Corp|Corporation|Group|Holdings|PLC|SA|AG|GmbH)$/i, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const hasNewId = byNormName.get(genId.replace('c-', ''));
      console.log('  ID:', d.id, '| Name:', data.name, '| Would-be-ID:', genId, '| Has c- version:', hasNewId ? hasNewId.length > 1 : false);
    }
  });

  process.exit(0);
})();
