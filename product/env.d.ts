/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_NAME?: string
  readonly VITE_PRODUCT_APEX?: string
  readonly VITE_PLAYER_ORIGIN?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
