import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
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
const functionsRegion =
  typeof import.meta !== "undefined" && import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION
    ? String(import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION).trim()
    : "us-central1";
const useFunctionsEmulator =
  typeof import.meta !== "undefined" &&
  String(import.meta.env.VITE_USE_FUNCTIONS_EMULATOR ?? "").trim().toLowerCase() === "true";
const functionsEmulatorHost =
  typeof import.meta !== "undefined" && import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST
    ? String(import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST).trim()
    : "127.0.0.1";
const functionsEmulatorPort =
  typeof import.meta !== "undefined" && import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT
    ? Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT)
    : 5001;

export const FIRESTORE_DATABASE_ID = configuredDatabaseId || "(default)";
export const FIRESTORE_FALLBACK_DATABASE_ID = null;

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const functions = getFunctions(firebaseApp, functionsRegion);

if (useFunctionsEmulator) {
  connectFunctionsEmulator(functions, functionsEmulatorHost, functionsEmulatorPort);
}

if (typeof window !== "undefined") {
  if (import.meta.env.DEV) {
    console.info(
      `[Firebase] project=${firebaseConfig.projectId}, firestoreDatabase=${FIRESTORE_DATABASE_ID}, functionsRegion=${functionsRegion}, functionsEmulator=${useFunctionsEmulator ? `${functionsEmulatorHost}:${functionsEmulatorPort}` : "off"}`
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
