import { ref } from 'vue'
import { api, type RealmathonConfig } from '../lib/api'

const config = ref<RealmathonConfig | null>(null)

export function useConfig() {
  async function loadConfig() {
    if (config.value) return config.value
    try {
      config.value = await api<RealmathonConfig>('/config')
    } catch (e) {
      console.error('Failed to load config:', e)
    }
    return config.value
  }

  function teamBrand(teamId: string) {
    return config.value?.branding.teams[teamId]
  }

  return { config, loadConfig, teamBrand }
}
