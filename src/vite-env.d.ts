/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIRESTORE_DATABASE_ID?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
