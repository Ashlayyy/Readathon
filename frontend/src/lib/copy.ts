import type { RealmathonConfig } from './api'

export type CopyVars = Record<string, string | number>

export function buildCopyVars(config: RealmathonConfig | null): CopyVars {
  if (!config) return {}
  const teamCount = config.teams.length
  const positiveCount = config.prompts.positive.length
  const negativeCount = config.prompts.negative.length
  const promptCount = positiveCount + negativeCount
  const maxPrompts = config.scoringRules.maxPromptsPerBook

  return {
    eventName: config.event.name,
    eventSubtitle: config.event.subtitle,
    teamCount,
    teamsLabel: teamCount === 1 ? '1 realm' : `${teamCount} realms`,
    promptCount,
    promptsLabel: promptCount === 1 ? '1 prompt' : `${promptCount} prompts`,
    positiveCount,
    negativeCount,
    maxPrompts,
    schedule: config.event.month,
  }
}

export function formatCopy(template: string, vars: CopyVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key]
    return val !== undefined ? String(val) : `{${key}}`
  })
}
