import { createRouter, createWebHistory } from 'vue-router'
import { useHostAuth } from '../composables/useHostAuth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('../views/LandingView.vue'),
    },
    {
      path: '/signin',
      name: 'signin',
      component: () => import('../views/SignInView.vue'),
    },
    {
      path: '/host',
      name: 'host',
      component: () => import('../views/HostDashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/host/new',
      name: 'host-new',
      component: () => import('../views/CreateEventView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/host/e/:slug',
      name: 'host-event',
      component: () => import('../views/EventHomeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const { refresh, isSignedIn, loaded } = useHostAuth()
  if (!loaded.value) await refresh()

  if (to.meta.requiresAuth && !isSignedIn.value) {
    return { name: 'signin', query: { next: to.fullPath } }
  }
  if (to.name === 'signin' && isSignedIn.value) {
    return { name: 'host' }
  }
})

export default router
