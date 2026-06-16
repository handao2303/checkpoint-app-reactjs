// Firebase is initialized for Firestore-backed comments/notifications/remote
// logs and optional Analytics. No Firebase Auth/FCM: identity comes from our
// own Supabase/JWT auth, so Firestore writes carry app-level author fields.
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
});

export const db = getFirestore(app);

export const analyticsPromise: Promise<Analytics | null> =
  import.meta.env.VITE_ANALYTICS_ENABLED === "false" ||
  !import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? Promise.resolve(null)
    : isSupported()
        .then((supported) => (supported ? getAnalytics(app) : null))
        .catch(() => null);
