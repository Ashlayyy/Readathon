import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/how-it-works', name: 'how-it-works', component: () => import('../views/HowItWorksView.vue') },
    { path: '/teams', name: 'teams', component: () => import('../views/TeamsView.vue') },
    {
      path: '/rosters',
      name: 'rosters',
      redirect: (to) => ({ name: 'teams', query: { ...to.query, tab: 'rosters' } }),
    },
    { path: '/prompts', name: 'prompts', component: () => import('../views/PromptsView.vue') },
    { path: '/faq', name: 'faq', component: () => import('../views/FaqView.vue') },
    { path: '/standings', name: 'standings', component: () => import('../views/StandingsView.vue') },
    { path: '/shelf', name: 'shelf', component: () => import('../views/ShelfView.vue') },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/maintenance', name: 'maintenance', component: () => import('../views/MaintenanceView.vue') },
    { path: '/submit', name: 'submit', component: () => import('../views/SubmitView.vue'), meta: { requiresAssigned: true } },
    { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },
    { path: '/readers/:id', name: 'reader', component: () => import('../views/ReaderProfileView.vue') },
    { path: '/my-reads', redirect: (to) => ({ name: 'profile', query: { ...to.query, tab: 'books' } }) },
    { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue'), meta: { requiresAdmin: true } },
  ],
})

router.beforeEach(async (to) => {
  const { useAuth } = await import('../composables/useAuth')
  const { useConfig } = await import('../composables/useConfig')
  const { user, fetchUser } = useAuth()
  const { config, loadConfig } = useConfig()

  await Promise.all([fetchUser(), loadConfig()])

  const downtime = config.value?.site?.downtimeMode === true
  const isAdmin = user.value?.isAdmin === true

  if (downtime && !isAdmin) {
    const allowed = new Set(['maintenance', 'login', 'archive', 'archive-slug', 'reader'])
    if (!allowed.has(String(to.name))) return { name: 'maintenance' }
  }

  if (to.name === 'maintenance' && (!downtime || isAdmin)) {
    return isAdmin ? '/admin' : '/'
  }

  if (to.name === 'login' && user.value) return '/'
  if (
    to.name === 'teams' &&
    to.query.tab === 'rosters' &&
    !config.value?.site?.showTeamRosters
  ) {
    return { name: 'teams' }
  }
  if (to.meta.requiresAdmin && !user.value?.isAdmin) return '/'
  if (to.meta.requiresAuth && !user.value) return '/login'
  if (to.meta.requiresAssigned && user.value?.status !== 'assigned') {
    if (!user.value) return '/login'
    return '/'
  }
})

router.afterEach((to) => {
  void import('../lib/posthog').then(({ capturePageview }) => {
    capturePageview(to.fullPath)
  })
})

export default router
