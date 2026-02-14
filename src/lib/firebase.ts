import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyALIsBJGp-VuumUIhZTgs8gzQVsMZZUgEw",
  authDomain: "officiating-marketplace-487319.firebaseapp.com",
  projectId: "officiating-marketplace-487319",
  storageBucket: "officiating-marketplace-487319.firebasestorage.app",
  messagingSenderId: "307176348747",
  appId: "1:307176348747:web:0ee235243faeb871c041ce",
  measurementId: "G-SNZG1Y6R25"
};

const configuredDatabaseId =
  typeof import.meta !== "undefined" && import.meta.env.VITE_FIRESTORE_DATABASE_ID
    ? String(import.meta.env.VITE_FIRESTORE_DATABASE_ID).trim()
    : "";

const preferredDatabaseId = configuredDatabaseId || "(default)";
const fallbackDatabaseId =
  preferredDatabaseId === "(default)"
    ? "default"
    : preferredDatabaseId === "default"
      ? "(default)"
      : null;

export const FIRESTORE_DATABASE_ID = preferredDatabaseId;
export const FIRESTORE_FALLBACK_DATABASE_ID = fallbackDatabaseId;

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db =
  preferredDatabaseId === "(default)"
    ? getFirestore(firebaseApp)
    : getFirestore(firebaseApp, preferredDatabaseId);
export const dbFallback = fallbackDatabaseId
  ? getFirestore(firebaseApp, fallbackDatabaseId)
  : null;

if (typeof window !== "undefined") {
  if (import.meta.env.DEV) {
    console.info(
      `[Firebase] project=${firebaseConfig.projectId}, firestoreDatabase=${FIRESTORE_DATABASE_ID}, fallback=${FIRESTORE_FALLBACK_DATABASE_ID ?? "none"}`
    );
  }

  isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(firebaseApp);
      }
    })
    .catch(() => undefined);
}
