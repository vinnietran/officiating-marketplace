/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIRESTORE_DATABASE_ID?: string;
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string;
  readonly VITE_FUNCTIONS_EMULATOR_HOST?: string;
  readonly VITE_FUNCTIONS_EMULATOR_PORT?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_USE_FUNCTIONS_EMULATOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
