import { computed } from 'vue'
import type { CopyVars } from '../lib/copy'
import { buildCopyVars, formatCopy } from '../lib/copy'
import { useConfig } from './useConfig'

export function useCopy() {
  const { config } = useConfig()

  const vars = computed(() => buildCopyVars(config.value))

  function t(template: unknown, extra?: CopyVars): string {
    if (!template || typeof template !== 'string') return ''
    return formatCopy(template, { ...vars.value, ...extra })
  }

  return { config, vars, t }
}
