import { ref } from 'vue'
import { api, googleLoginUrl, type PublicUser } from '../lib/api'
import { captureEvent, identifyUser } from '../lib/posthog'

const user = ref<PublicUser | null>(null)
const loaded = ref(false)
let fetchPromise: Promise<PublicUser | null> | null = null

export function useAuth() {
  async function fetchUser(force = false): Promise<PublicUser | null> {
    if (!force && loaded.value && !fetchPromise) return user.value
    if (!force && fetchPromise) return fetchPromise

    fetchPromise = (async () => {
      try {
        const data = await api<{ user: PublicUser | null }>('/auth/me')
        user.value = data.user
        identifyUser(data.user)
        return data.user
      } catch {
        user.value = null
        identifyUser(null)
        return null
      } finally {
        loaded.value = true
        fetchPromise = null
      }
    })()

    return fetchPromise
  }

  async function register(displayName: string, email: string) {
    const data = await api<{ sent: boolean; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, email }),
    })
    captureEvent('auth_register_requested')
    return data
  }

  async function login(email: string) {
    const data = await api<{ sent: boolean; message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    captureEvent('auth_login_requested')
    return data
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    user.value = null
    loaded.value = true
    fetchPromise = null
    identifyUser(null)
    captureEvent('auth_logout')
  }

  return { user, loaded, fetchUser, register, login, logout, googleLoginUrl }
}
