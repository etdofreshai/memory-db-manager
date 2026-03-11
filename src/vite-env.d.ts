/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEMORY_API_URL: string;
  readonly VITE_MEMORY_API_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
