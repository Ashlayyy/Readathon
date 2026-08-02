import { computed, ref } from 'vue'
import { api, type MonthlyEventSlot, type RealmathonConfig } from '../lib/api'
import { MONTHLY_THEME_PREVIEW_KEY } from '../lib/monthlyThemeEditor'

const previewSlot = ref<MonthlyEventSlot | null>(null)
const previewActive = computed(() => previewSlot.value != null)
const previewTitle = computed(
  () => previewSlot.value?.title?.trim() || 'Untitled theme',
)

function readStoredSlot(): MonthlyEventSlot | null {
  try {
    const raw = sessionStorage.getItem(MONTHLY_THEME_PREVIEW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MonthlyEventSlot
    if (!parsed || typeof parsed !== 'object' || !parsed.from || !parsed.to) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function hydrateFromStorage() {
  if (previewSlot.value) return
  previewSlot.value = readStoredSlot()
}

export function useMonthlyThemePreview() {
  hydrateFromStorage()

  function setPreviewSlot(slot: MonthlyEventSlot) {
    previewSlot.value = slot
    sessionStorage.setItem(MONTHLY_THEME_PREVIEW_KEY, JSON.stringify(slot))
  }

  function clearPreview() {
    previewSlot.value = null
    sessionStorage.removeItem(MONTHLY_THEME_PREVIEW_KEY)
  }

  async function fetchPreviewConfig(
    slot: MonthlyEventSlot,
  ): Promise<RealmathonConfig> {
    const data = await api<{ config: RealmathonConfig }>(
      '/admin/monthly-themes/preview-config',
      {
        method: 'POST',
        body: JSON.stringify(slot),
      },
    )
    return data.config
  }

  return {
    previewSlot,
    previewActive,
    previewTitle,
    setPreviewSlot,
    clearPreview,
    fetchPreviewConfig,
    readStoredSlot,
  }
}
