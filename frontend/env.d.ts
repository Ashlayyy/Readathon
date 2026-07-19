/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public API origin, e.g. https://api.your-domain.com (no trailing slash). */
  readonly VITE_API_URL?: string
  /** App version baked in at build time. */
  readonly VITE_APP_VERSION: string
  /** PostHog project API key. Leave unset to disable analytics. */
  readonly VITE_POSTHOG_KEY?: string
  /** PostHog API host (EU/US/self-hosted). Defaults to EU cloud. */
  readonly VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
