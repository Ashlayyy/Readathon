import { ref } from 'vue'
import { api, type RealmathonConfig, type TeamConfig } from '../lib/api'

const config = ref<RealmathonConfig | null>(null)
let loadPromise: Promise<RealmathonConfig | null> | null = null

export function useConfig() {
  async function loadConfig(force = false): Promise<RealmathonConfig | null> {
    if (!force && config.value) return config.value
    if (!force && loadPromise) return loadPromise

    loadPromise = (async () => {
      try {
        config.value = await api<RealmathonConfig>('/config')
      } catch (e) {
        console.error('Failed to load config:', e)
      } finally {
        loadPromise = null
      }
      return config.value
    })()

    return loadPromise
  }

  function getTeam(teamId: string): TeamConfig | undefined {
    return config.value?.teams.find((t) => t.id === teamId)
  }

  return { config, loadConfig, getTeam }
}
