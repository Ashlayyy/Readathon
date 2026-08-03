import { ref } from 'vue'
import { api, type RealmathonConfig, type TeamConfig } from '../lib/api'
import { useTheme } from './useTheme'
import { useMonthlyThemePreview } from './useMonthlyThemePreview'

const config = ref<RealmathonConfig | null>(null)
const configLoading = ref(false)
const configError = ref<string | null>(null)
let loadPromise: Promise<RealmathonConfig | null> | null = null
/** Reloads config while a theme is live so branding auto-reverts after the window ends. */
let themePollHandle: ReturnType<typeof setInterval> | null = null

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
  if (!force && config.value) return config.value
  if (!force && loadPromise) return loadPromise

  configLoading.value = true
  configError.value = null

  loadPromise = (async () => {
    try {
      const preview = useMonthlyThemePreview()
      const slot = preview.previewSlot.value ?? preview.readStoredSlot()
      let data: RealmathonConfig
      let usingPreview = false

      if (slot) {
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

      config.value = data
      syncEventThemes(data, usingPreview)
      syncThemePoll(data)
    } catch (e) {
      console.error('Failed to load config:', e)
      configError.value =
        e instanceof Error ? e.message : 'Failed to load event configuration'
    } finally {
      configLoading.value = false
      loadPromise = null
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
    loadConfig,
    getTeam,
    exitMonthlyThemePreview,
  }
}
