import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// ------------------------------------------------------------------
// FIREBASE PROJECT CONFIGURATION (loaded from environment variables)
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

const isValidConfig = !!(
  firebaseConfig.projectId &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey.startsWith("AIzaSy")
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