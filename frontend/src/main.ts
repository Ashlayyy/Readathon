import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useTheme } from './composables/useTheme'
import { initPostHog } from './lib/posthog'

// Apply saved theme preference before first paint so branding never flashes over it.
useTheme().applyTheme()
initPostHog()

const app = createApp(App)

app.use(router)

app.mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err)
    })
  })
}
