function apiBase(): string {
  const origin = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')
  if (!origin) return '/api'
  return origin
}

export function apiUrl(path: string): string {
  const base = apiBase()
  const pathPart = path.replace(/^\/+/, '')
  if (/^https?:\/\//i.test(base)) {
    return new URL(pathPart, `${base}/`).href
  }
  return `/${base.replace(/^\/+|\/+$/g, '')}/${pathPart}`
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })
  const text = await res.text()
  let data: { error?: string } | null = null
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string }
    } catch {
      throw new Error(res.ok ? 'Invalid server response' : `Server error (${res.status})`)
    }
  }
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return (data ?? {}) as T
}

export type PlatformAccount = {
  id: string
  email: string
  displayName: string
  avatarUrl?: string | null
}

export type HostOnboarding = {
  sharedPlayerLink: boolean
  discordBotInvited: boolean
  openedAdmin: boolean
  previewOpened: boolean
  dismissed: boolean
}

export type OnboardingProgress = {
  done: number
  total: number
  complete: boolean
}

export type Membership = {
  tenantId: string
  slug: string
  name: string
  role: string
  isAdmin: boolean
  status: string
  tenantStatus: string
  pathUrl: string
  subdomainUrl: string
  adminUrl: string
  legacyUserId: string | null
  hostOnboarding: HostOnboarding
  onboarding: OnboardingProgress
}

export type HostEvent = Membership & {
  discordConfigured: boolean
  platformBotConfigured: boolean
}

export function productName(): string {
  return import.meta.env.VITE_PRODUCT_NAME?.trim() || 'Product'
}

export function productApex(): string {
  return import.meta.env.VITE_PRODUCT_APEX?.trim() || 'product.com'
}

export function playerOrigin(): string {
  return (
    import.meta.env.VITE_PLAYER_ORIGIN?.trim().replace(/\/+$/, '') ||
    'http://localhost:5173'
  )
}

export function playerEventUrl(slug: string, path = '/'): string {
  const origin = playerOrigin()
  const clean = path.startsWith('/') ? path : `/${path}`
  if (clean === '/') return `${origin}/e/${slug}`
  return `${origin}/e/${slug}${clean}`
}

export function playerAdminUrl(slug: string, hash = ''): string {
  const base = playerEventUrl(slug, '/admin?tab=settings&from=host')
  return hash ? `${base}${hash.startsWith('#') ? hash : `#${hash}`}` : base
}
