import { ref } from 'vue'
import { api, type RealmathonConfig, type TeamConfig } from '../lib/api'
import { applyBrandingTheme } from '../lib/branding'
import { useTheme } from './useTheme'

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
  if (!data?.site?.activeMonthlyEvent) return
  themePollHandle = setInterval(() => {
    void loadConfigInternal(true)
  }, 5 * 60 * 1000)
}

async function loadConfigInternal(force = false): Promise<RealmathonConfig | null> {
  if (!force && config.value) return config.value
  if (!force && loadPromise) return loadPromise

  configLoading.value = true
  configError.value = null

  loadPromise = (async () => {
    try {
      const data = await api<RealmathonConfig>('/config')
      config.value = data
      // Branding paints event colors first; user preference always wins afterward.
      if (data.branding?.theme) {
        applyBrandingTheme(data.branding.theme)
      }
      useTheme().applyTheme()
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

  return { config, configLoading, configError, loadConfig, getTeam }
}
