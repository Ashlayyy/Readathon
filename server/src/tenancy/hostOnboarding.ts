export type HostOnboarding = {
  sharedPlayerLink: boolean
  discordBotInvited: boolean
  openedAdmin: boolean
  previewOpened: boolean
  dismissed: boolean
}

export const DEFAULT_HOST_ONBOARDING: HostOnboarding = {
  sharedPlayerLink: false,
  discordBotInvited: false,
  openedAdmin: false,
  previewOpened: false,
  dismissed: false,
}

export function normalizeHostOnboarding(
  raw: Partial<HostOnboarding> | null | undefined,
): HostOnboarding {
  return {
    sharedPlayerLink: Boolean(raw?.sharedPlayerLink),
    discordBotInvited: Boolean(raw?.discordBotInvited),
    openedAdmin: Boolean(raw?.openedAdmin),
    previewOpened: Boolean(raw?.previewOpened),
    dismissed: Boolean(raw?.dismissed),
  }
}

export function mergeHostOnboarding(
  current: Partial<HostOnboarding> | null | undefined,
  patch: Partial<HostOnboarding>,
): HostOnboarding {
  const base = normalizeHostOnboarding(current)
  const next = { ...base }
  for (const key of Object.keys(DEFAULT_HOST_ONBOARDING) as (keyof HostOnboarding)[]) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key]!
  }
  return next
}

export function onboardingProgress(o: HostOnboarding): {
  done: number
  total: number
  complete: boolean
} {
  if (o.dismissed) return { done: 4, total: 4, complete: true }
  const steps = [
    o.sharedPlayerLink,
    o.discordBotInvited,
    o.openedAdmin,
    o.previewOpened,
  ]
  const done = steps.filter(Boolean).length
  return { done, total: steps.length, complete: done === steps.length }
}
