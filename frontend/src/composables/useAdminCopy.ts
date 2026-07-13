import { computed } from 'vue'
import type { CopyVars } from '../lib/copy'
import { useConfig } from './useConfig'
import { useCopy } from './useCopy'

export type AdminCopy = Record<string, string | Record<string, string>>

export function useAdminCopy() {
  const { config } = useConfig()
  const { t } = useCopy()

  const admin = computed(() => config.value?.copy.admin as AdminCopy | undefined)

  function section(name: string): Record<string, string> {
    const block = admin.value?.[name]
    if (block && typeof block === 'object') return block as Record<string, string>
    return {}
  }

  function msg(key: string, extra?: CopyVars): string {
    return t(section('messages')[key], extra)
  }

  function confirmMsg(key: string, extra?: CopyVars): string {
    return t(section('confirm')[key], extra)
  }

  return { admin, section, msg, confirmMsg, t }
}
