import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// ------------------------------------------------------------------
// FIREBASE PROJECT CONFIGURATION
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB30k09zzjlK6jyvpD3E7X3P8BdCOdlyT0",
  authDomain: "stablemap-app.firebaseapp.com",
  projectId: "stablemap-app",
  storageBucket: "stablemap-app.firebasestorage.app",
  messagingSenderId: "1062872314462",
  appId: "1:1062872314462:web:cc56661049e1e08072bacf",
  measurementId: "G-XB4SHV0DLK"
};

const isValidConfig = !!(
  firebaseConfig.projectId && 
  firebaseConfig.projectId !== "your-project-id" && 
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "AIzaSy_PLACEHOLDER"
);

let dbInstance: any = null;
let initializedSuccessfully = false;

if (isValidConfig) {
  try {
    // Initialize or Retrieve Firebase App
    const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    
    if (!app) {
      throw new Error("Firebase App failed to initialize");
    }

    // Initialize Firestore service
    // This often throws "Service firestore is not available" if importmap has version conflicts
    dbInstance = getFirestore(app);
    
    if (dbInstance) {
        initializedSuccessfully = true;
        console.log(`[Firebase] Firestore service linked to app: ${app.name} (${firebaseConfig.projectId})`);
    } else {
        throw new Error("getFirestore returned null");
    }
  } catch (e: any) {
    console.error("[Firebase] Fatal Firestore Initialization failure:", e.message || e);
    dbInstance = null;
    initializedSuccessfully = false;
  }
} else {
  console.warn("[Firebase] No valid configuration detected. Operating in Local Storage mode.");
}

export { dbInstance };
export const isConfigured = isValidConfig && initializedSuccessfully && dbInstance !== null;