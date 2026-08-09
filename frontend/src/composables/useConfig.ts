import { ref } from 'vue'
import { ApiError, api, type RealmathonConfig, type TeamConfig } from '../lib/api'
import { currentTenantSlugHeader } from './useTenant'
import { useTheme } from './useTheme'
import { useMonthlyThemePreview } from './useMonthlyThemePreview'

export type TenantUnavailable = {
  slug: string
  reason: 'not_found' | 'archived' | 'suspended' | string
  message: string
}

const config = ref<RealmathonConfig | null>(null)
const configLoading = ref(false)
const configError = ref<string | null>(null)
const tenantUnavailable = ref<TenantUnavailable | null>(null)
let loadPromise: Promise<RealmathonConfig | null> | null = null
/** Which tenant cache key the current `config` / unavailable state belongs to. */
let loadedForKey: string | null = null
/** Bumps when a newer load starts so stale responses cannot overwrite UI. */
let loadGeneration = 0
/** Reloads config while a theme is live so branding auto-reverts after the window ends. */
let themePollHandle: ReturnType<typeof setInterval> | null = null

function tenantCacheKey(): string {
  return currentTenantSlugHeader() ?? '__default__'
}

function syncThemePoll(data: RealmathonConfig | null) {
  if (themePollHandle) {
    clearInterval(themePollHandle)
    themePollHandle = null
  }
  const { previewActive } = useMonthlyThemePreview()
  // Don't poll-revert while an admin is site-previewing a draft.
  if (previewActive.value) return
  if (!data?.site?.activeMonthlyEvent) return
  themePollHandle = setInterval(() => {
    void loadConfigInternal(true)
  }, 5 * 60 * 1000)
}

function syncEventThemes(data: RealmathonConfig, usingPreview: boolean) {
  const theme = useTheme()
  const live = usingPreview || Boolean(data.site?.activeMonthlyEvent)
  if (live) {
    // Only dual keys from monthly merge — never fall back to base branding.theme.
    theme.setEventThemes(
      data.branding?.themeDark ?? null,
      data.branding?.themeLight ?? null,
    )
  } else {
    theme.setEventThemes(null, null)
  }
  theme.setForceEventThemes(usingPreview)
  theme.applyTheme()
}

async function loadConfigInternal(force = false): Promise<RealmathonConfig | null> {
  const key = tenantCacheKey()
  const keyChanged = loadedForKey !== null && loadedForKey !== key

  // Same tenant + good config — reuse unless forced.
  if (!force && !keyChanged && config.value && loadedForKey === key) {
    return config.value
  }
  // Same tenant still loading — join in-flight request.
  if (!force && !keyChanged && loadPromise && loadedForKey === key) {
    return loadPromise
  }

  const generation = ++loadGeneration
  configLoading.value = true
  configError.value = null
  // Always drop sticky unavailable when switching tenants (e.g. /e/x → /).
  if (keyChanged || force) {
    tenantUnavailable.value = null
  }
  if (keyChanged) {
    config.value = null
  }

  loadPromise = (async () => {
    try {
      const preview = useMonthlyThemePreview()
      const slot = preview.previewSlot.value ?? preview.readStoredSlot()
      let data: RealmathonConfig
      let usingPreview = false

      if (slot && !currentTenantSlugHeader()) {
        try {
          data = await preview.fetchPreviewConfig(slot)
          usingPreview = true
          if (!preview.previewSlot.value) {
            preview.setPreviewSlot(slot)
          }
        } catch {
          preview.clearPreview()
          data = await api<RealmathonConfig>('/config')
        }
      } else {
        data = await api<RealmathonConfig>('/config')
      }

      if (generation !== loadGeneration) return config.value

      config.value = data
      tenantUnavailable.value = null
      loadedForKey = key
      syncEventThemes(data, usingPreview)
      syncThemePoll(data)
    } catch (e) {
      if (generation !== loadGeneration) return config.value

      console.error('Failed to load config:', e)
      config.value = null
      loadedForKey = key
      if (e instanceof ApiError && e.code === 'TENANT_UNAVAILABLE') {
        tenantUnavailable.value = {
          slug: e.slug || currentTenantSlugHeader() || 'unknown',
          reason: e.reason || 'not_found',
          message: e.message,
        }
        configError.value = null
      } else {
        tenantUnavailable.value = null
        configError.value =
          e instanceof Error ? e.message : 'Failed to load event configuration'
      }
    } finally {
      if (generation === loadGeneration) {
        configLoading.value = false
        loadPromise = null
      }
    }
    return config.value
  })()

  return loadPromise
}

export function useConfig() {
  async function loadConfig(force = false): Promise<RealmathonConfig | null> {
    return loadConfigInternal(force)
  }

  function getTeam(teamId: string): TeamConfig | undefined {
    return config.value?.teams.find((t) => t.id === teamId)
  }

  async function exitMonthlyThemePreview() {
    useMonthlyThemePreview().clearPreview()
    return loadConfigInternal(true)
  }

  return {
    config,
    configLoading,
    configError,
    tenantUnavailable,
    loadConfig,
    getTeam,
    exitMonthlyThemePreview,
  }
}
