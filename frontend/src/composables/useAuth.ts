import { ref } from 'vue'
import { api, type PublicUser } from '../lib/api'

const user = ref<PublicUser | null>(null)
const loaded = ref(false)
let fetchPromise: Promise<PublicUser | null> | null = null

export function useAuth() {
  async function fetchUser(force = false): Promise<PublicUser | null> {
    if (!force && loaded.value) return user.value
    if (!force && fetchPromise) return fetchPromise

    fetchPromise = (async () => {
      try {
        const data = await api<{ user: PublicUser | null }>('/auth/me')
        user.value = data.user
        return data.user
      } catch {
        user.value = null
        return null
      } finally {
        loaded.value = true
        fetchPromise = null
      }
    })()

    return fetchPromise
  }

  async function register(displayName: string, email: string) {
    const data = await api<{ user: PublicUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, email }),
    })
    user.value = data.user
    loaded.value = true
    return data.user
  }

  async function login(email: string) {
    const data = await api<{ sent: boolean; message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    return data
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    user.value = null
    loaded.value = true
  }

  function googleLoginUrl() {
    return '/api/auth/google'
  }

  return { user, loaded, fetchUser, register, login, logout, googleLoginUrl }
}
