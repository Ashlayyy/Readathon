import { ref } from 'vue'
import { api, type PublicUser } from '../lib/api'

const user = ref<PublicUser | null>(null)
const loaded = ref(false)

export function useAuth() {
  async function fetchUser() {
    try {
      const data = await api<{ user: PublicUser | null }>('/auth/me')
      user.value = data.user
      return data.user
    } catch {
      user.value = null
      return null
    } finally {
      loaded.value = true
    }
  }

  async function register(displayName: string, email: string) {
    const data = await api<{ user: PublicUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, email }),
    })
    user.value = data.user
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
  }

  function googleLoginUrl() {
    return '/api/auth/google'
  }

  return { user, loaded, fetchUser, register, login, logout, googleLoginUrl }
}
