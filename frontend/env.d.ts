/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public API origin, e.g. https://api.your-domain.com (no trailing slash). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
