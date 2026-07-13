/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public API origin, e.g. https://api.your-domain.com (no trailing slash). */
  readonly VITE_API_URL?: string
  /** App version baked in at build time. */
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
