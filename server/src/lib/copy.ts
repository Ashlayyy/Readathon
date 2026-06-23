import { getConfig } from '../config.js'

export function getCopyVars(): Record<string, string | number> {
  const config = getConfig()
  const teamCount = config.teams.length
  const positiveCount = config.prompts.positive.length
  const negativeCount = config.prompts.negative.length
  const promptCount = positiveCount + negativeCount
  const maxPrompts = (config.scoringRules.maxPromptsPerBook as number) ?? 5

  return {
    eventName: config.event.name as string,
    eventSubtitle: config.event.subtitle as string,
    teamCount,
    promptCount,
    positiveCount,
    negativeCount,
    maxPrompts,
  }
}

export function formatCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key]
    return val !== undefined ? String(val) : `{${key}}`
  })
}
