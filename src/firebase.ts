import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyChdcAiC6eDCMHxJLAtPwaNEG9q6_15cwc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0510777303.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0510777303",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0510777303.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "521759239139",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:521759239139:web:cb170748315744323f0ed6",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-freelancevideoed-719c6223-ef27-451a-b661-b552901cdc1f");
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
