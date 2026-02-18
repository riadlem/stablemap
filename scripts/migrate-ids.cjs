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

function generateCompanyId(name) {
  const cleanName = name
    .replace(/[,.]/g, '')
    .replace(/\s+(Inc|LLC|Ltd|Limited|Corp|Corporation|Group|Holdings|PLC|SA|AG|GmbH)$/i, '')
    .trim();
  return 'c-' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
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

  // Find old-style numeric IDs still remaining
  const existingIds = new Set(snap.docs.map(d => d.id));
  const toMigrate = [];

  snap.docs.forEach(d => {
    if (/^\d+$/.test(d.id)) {
      const data = d.data();
      const newId = generateCompanyId(data.name);
      // Only migrate if the new c- ID doesn't already exist
      if (!existingIds.has(newId)) {
        toMigrate.push({ oldId: d.id, newId, data: { ...data, id: newId } });
      } else {
        console.log('SKIP (c- version already exists):', d.id, data.name, '->', newId);
      }
    }
  });

  // Also find timestamp-based IDs that should use canonical c- IDs
  snap.docs.forEach(d => {
    if (/^c-\d{13}/.test(d.id)) {
      const data = d.data();
      const newId = generateCompanyId(data.name);
      if (newId !== d.id && !existingIds.has(newId)) {
        toMigrate.push({ oldId: d.id, newId, data: { ...data, id: newId } });
      }
    }
  });

  if (toMigrate.length === 0) {
    console.log('No IDs to migrate.');
    process.exit(0);
  }

  console.log(`Migrating ${toMigrate.length} records to canonical IDs:\n`);
  toMigrate.forEach(m => console.log(`  ${m.oldId} -> ${m.newId} (${m.data.name})`));

  // Write new records
  for (const m of toMigrate) {
    const docRef = doc(db, 'companies', m.newId);
    await setDoc(docRef, sanitize(m.data), { merge: true });
  }
  console.log(`\nWrote ${toMigrate.length} new records.`);

  // Delete old records
  const batch = writeBatch(db);
  toMigrate.forEach(m => {
    batch.delete(doc(db, 'companies', m.oldId));
  });
  await batch.commit();
  console.log(`Deleted ${toMigrate.length} old records.`);

  const afterSnap = await getDocs(collection(db, 'companies'));
  console.log('\nTotal companies after migration:', afterSnap.size);

  // Verify no more numeric IDs
  let remaining = 0;
  afterSnap.docs.forEach(d => { if (/^\d+$/.test(d.id)) remaining++; });
  console.log('Remaining numeric IDs:', remaining);

  process.exit(0);
})();
