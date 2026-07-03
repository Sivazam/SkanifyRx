import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCA50wtqWECXtN7zJj74_8TNuCO3HjA3lE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'skanifyrx.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'skanifyrx',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'skanifyrx.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '109663935985',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:109663935985:web:5e162f0722001821fcf850',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
