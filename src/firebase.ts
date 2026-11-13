import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const required = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(required).every(Boolean);
export const firebaseApp = firebaseConfigured
  ? getApps().length ? getApp() : initializeApp(required)
  : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const database = firebaseApp ? getDatabase(firebaseApp) : null;
