import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import { detectMarketingHost, useTenant } from '../composables/useTenant'

const eventRoutes: RouteRecordRaw[] = [
  { path: '', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: 'how-it-works', name: 'how-it-works', component: () => import('../views/HowItWorksView.vue') },
  { path: 'teams', name: 'teams', component: () => import('../views/TeamsView.vue') },
  {
    path: 'rosters',
    name: 'rosters',
    redirect: (to) => ({
      name: to.params.tenantSlug ? 'tenant-teams' : 'teams',
      params: to.params,
      query: { ...to.query, tab: 'rosters' },
    }),
  },
  { path: 'prompts', name: 'prompts', component: () => import('../views/PromptsView.vue') },
  { path: 'faq', name: 'faq', component: () => import('../views/FaqView.vue') },
  { path: 'changelog', name: 'changelog', component: () => import('../views/ChangelogView.vue') },
  { path: 'standings', name: 'standings', component: () => import('../views/StandingsView.vue') },
  { path: 'shelf', name: 'shelf', component: () => import('../views/ShelfView.vue') },
  { path: 'hall-of-fame', name: 'hall-of-fame', component: () => import('../views/HallOfFameView.vue') },
  { path: 'archive', name: 'archive', component: () => import('../views/ArchiveView.vue') },
  { path: 'archive/:slug', name: 'archive-slug', component: () => import('../views/ArchiveView.vue') },
  { path: 'login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: 'maintenance', name: 'maintenance', component: () => import('../views/MaintenanceView.vue') },
  {
    path: 'submit',
    name: 'submit',
    component: () => import('../views/SubmitView.vue'),
    meta: { requiresAssigned: true },
  },
  {
    path: 'profile',
    name: 'profile',
    meta: { requiresAuth: true },
    component: () => import('../views/ReaderProfileView.vue'),
  },
  { path: 'readers/:id', name: 'reader', component: () => import('../views/ReaderProfileView.vue') },
  {
    path: 'my-reads',
    redirect: (to) => ({
      name: to.params.tenantSlug ? 'tenant-profile' : 'profile',
      params: to.params,
      query: { ...to.query, tab: 'books' },
    }),
  },
  {
    path: 'admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: { requiresAdmin: true },
  },
]

function prefixEventRoutes(
  routes: RouteRecordRaw[],
  namePrefix: string,
): RouteRecordRaw[] {
  return routes.map((r) => {
    const name =
      r.name && namePrefix ? (`${namePrefix}${String(r.name)}` as const) : r.name
    const next: RouteRecordRaw = { ...r, name }
    if (r.redirect && typeof r.redirect === 'function') {
      next.redirect = r.redirect
    }
    return next
  })
}

function productSiteUrl(path = '/'): string {
  const base = (
    import.meta.env.VITE_PRODUCT_URL?.trim() || 'http://localhost:5174'
  ).replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Host panel lives in the separate `product/` app (product.com).
    {
      path: '/host',
      name: 'host-console',
      redirect: () => {
        if (typeof window !== 'undefined') {
          window.location.href = productSiteUrl('/host')
        }
        return { name: 'home' }
      },
    },
    {
      path: '/host/new',
      name: 'host-create',
      redirect: () => {
        if (typeof window !== 'undefined') {
          window.location.href = productSiteUrl('/host/new')
        }
        return { name: 'home' }
      },
    },
    {
      path: '/marketing',
      name: 'marketing',
      redirect: () => {
        if (typeof window !== 'undefined') {
          window.location.href = productSiteUrl('/')
        }
        return { name: 'home' }
      },
    },
    // Legacy / default-tenant routes (bookbaddies.net, localhost)
    ...prefixEventRoutes(
      eventRoutes.map((r) => ({
        ...r,
        path: r.path === '' ? '/' : `/${r.path}`,
      })),
      '',
    ),
    // Path tenancy: /e/:tenantSlug/...
    {
      path: '/e/:tenantSlug',
      component: () => import('../views/TenantShell.vue'),
      children: prefixEventRoutes(eventRoutes, 'tenant-'),
    },
  ],
})

/** Warm common route chunks after first paint so nav feels instant. */
export function prefetchAppRoutes() {
  const warm = () => {
    void import('../views/ReaderProfileView.vue')
    void import('../views/StandingsView.vue')
    void import('../views/SubmitView.vue')
    void import('../views/TeamsView.vue')
    void import('../views/PromptsView.vue')
    void import('../views/FaqView.vue')
  }
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 2500 })
  } else {
    setTimeout(warm, 800)
  }
}

function routeBaseName(name: unknown): string {
  const s = String(name ?? '')
  return s.startsWith('tenant-') ? s.slice('tenant-'.length) : s
}

router.beforeEach(async (to) => {
  const { syncFromRoutePath } = useTenant()
  syncFromRoutePath(to.path)

  // Marketing apex → dedicated product.com app
  if (detectMarketingHost()) {
    if (typeof window !== 'undefined') {
      const path =
        to.path.startsWith('/host') ? to.fullPath : '/'
      window.location.href = productSiteUrl(path)
    }
    return false
  }

  const { user, fetchUser } = useAuth()
  const { config, loadConfig } = useConfig()

  // Reload when /e/:slug changes so we never keep another event's cached config.
  await Promise.all([fetchUser(), loadConfig(false)])

  const downtime = config.value?.site?.downtimeMode === true
  const isAdmin = user.value?.isAdmin === true
  const base = routeBaseName(to.name)

  if (downtime && !isAdmin) {
    const allowed = new Set(['maintenance', 'login', 'archive', 'archive-slug', 'reader', 'marketing', 'host-console', 'host-create'])
    if (!allowed.has(base) && !to.meta.platform) {
      return to.params.tenantSlug
        ? { name: 'tenant-maintenance', params: { tenantSlug: to.params.tenantSlug } }
        : { name: 'maintenance' }
    }
  }

  if (base === 'maintenance' && (!downtime || isAdmin)) {
    if (isAdmin) {
      return to.params.tenantSlug
        ? { name: 'tenant-admin', params: { tenantSlug: to.params.tenantSlug } }
        : '/admin'
    }
    return to.params.tenantSlug
      ? { name: 'tenant-home', params: { tenantSlug: to.params.tenantSlug } }
      : '/'
  }

  if (base === 'login' && user.value) {
    return to.params.tenantSlug
      ? { name: 'tenant-home', params: { tenantSlug: to.params.tenantSlug } }
      : '/'
  }
  if (base === 'profile') {
    if (!user.value) {
      return to.params.tenantSlug
        ? { name: 'tenant-login', params: { tenantSlug: to.params.tenantSlug } }
        : '/login'
    }
    const query = { ...to.query }
    return {
      name: to.params.tenantSlug ? 'tenant-reader' : 'reader',
      params: { ...(to.params.tenantSlug ? { tenantSlug: to.params.tenantSlug } : {}), id: user.value.id },
      query,
    }
  }
  if (
    base === 'teams' &&
    to.query.tab === 'rosters' &&
    !config.value?.site?.showTeamRosters
  ) {
    return {
      name: to.params.tenantSlug ? 'tenant-teams' : 'teams',
      params: to.params,
    }
  }
  if (to.meta.requiresAdmin && !user.value?.isAdmin) {
    // Host panel session may need a tenant login when cookies are not shared.
    if (!user.value) {
      return to.params.tenantSlug
        ? {
            name: 'tenant-login',
            params: { tenantSlug: to.params.tenantSlug },
            query: { next: to.fullPath, from: 'host' },
          }
        : { name: 'login', query: { next: to.fullPath, from: 'host' } }
    }
    return to.params.tenantSlug
      ? { name: 'tenant-home', params: { tenantSlug: to.params.tenantSlug } }
      : '/'
  }
  if (to.meta.requiresAuth && !user.value) {
    return to.params.tenantSlug
      ? { name: 'tenant-login', params: { tenantSlug: to.params.tenantSlug } }
      : '/login'
  }
  if (to.meta.requiresAssigned && user.value?.status !== 'assigned') {
    if (!user.value) {
      return to.params.tenantSlug
        ? { name: 'tenant-login', params: { tenantSlug: to.params.tenantSlug } }
        : '/login'
    }
    return to.params.tenantSlug
      ? { name: 'tenant-home', params: { tenantSlug: to.params.tenantSlug } }
      : '/'
  }
})

router.afterEach((to) => {
  void import('../lib/posthog').then(({ capturePageview }) => {
    capturePageview(to.fullPath)
  })
})

export default router
