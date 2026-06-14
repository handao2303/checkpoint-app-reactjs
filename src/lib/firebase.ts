// Firebase is initialized ONLY to use Firestore (comments). No Firebase Auth,
// no FCM — the modular SDK tree-shakes everything else out. Identity comes from
// our own Supabase/JWT auth, so Firestore writes carry the author fields from
// useAuth() and ownership is enforced client-side (see firestore.rules).
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const db = getFirestore(app);
