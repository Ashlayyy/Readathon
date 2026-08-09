import { computed, ref } from 'vue'
import {
  api,
  type HostEvent,
  type HostOnboarding,
  type Membership,
  type PlatformAccount,
} from '../lib/api'

const account = ref<PlatformAccount | null>(null)
const memberships = ref<Membership[]>([])
const loaded = ref(false)
const platformBotConfigured = ref(false)
let fetchPromise: Promise<void> | null = null

export function useHostAuth() {
  const isSignedIn = computed(() => Boolean(account.value))

  async function refresh(force = false) {
    if (!force && loaded.value && !fetchPromise) return
    if (!force && fetchPromise) return fetchPromise

    fetchPromise = (async () => {
      try {
        const [me, platform] = await Promise.all([
          api<{ account: PlatformAccount | null; memberships: Membership[] }>(
            '/platform/me',
          ),
          api<{ platformBotConfigured?: boolean }>('/platform'),
        ])
        account.value = me.account
        memberships.value = me.memberships ?? []
        platformBotConfigured.value = Boolean(platform.platformBotConfigured)
      } catch {
        account.value = null
        memberships.value = []
      } finally {
        loaded.value = true
        fetchPromise = null
      }
    })()

    return fetchPromise
  }

  async function requestSignIn(email: string, displayName?: string) {
    if (displayName?.trim()) {
      return api<{ sent: boolean; message: string }>('/platform/register', {
        method: 'POST',
        body: JSON.stringify({ email, displayName }),
      })
    }
    return api<{ sent: boolean; message: string }>('/platform/login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async function logout() {
    await api('/platform/logout', { method: 'POST' })
    account.value = null
    memberships.value = []
    loaded.value = true
  }

  async function createEvent(name: string, slug: string) {
    return api<{
      tenant: { id: string; slug: string; name: string }
      pathUrl: string
      subdomainUrl: string
      adminPath: string
      adminUrl: string
      eventHomePath: string
    }>('/platform/events', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    })
  }

  async function getEvent(slug: string) {
    const data = await api<{ event: HostEvent }>(`/platform/events/${slug}`)
    return data.event
  }

  async function patchOnboarding(slug: string, patch: Partial<HostOnboarding>) {
    const data = await api<{ membership: Membership }>(
      `/platform/events/${slug}/onboarding`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    )
    const idx = memberships.value.findIndex((m) => m.slug === slug)
    if (idx >= 0) memberships.value[idx] = data.membership
    return data.membership
  }

  async function updateEvent(
    slug: string,
    body: { name?: string; status?: 'active' | 'archived' },
  ) {
    const data = await api<{ membership: Membership }>(`/platform/events/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const idx = memberships.value.findIndex((m) => m.slug === slug)
    if (idx >= 0) memberships.value[idx] = data.membership
    return data.membership
  }

  async function inviteCohost(slug: string, email: string, displayName?: string) {
    return api<{ invitee: { email: string; displayName: string; role: string } }>(
      `/platform/events/${slug}/cohosts`,
      {
        method: 'POST',
        body: JSON.stringify({ email, displayName }),
      },
    )
  }

  async function copyBotInvite() {
    const data = await api<{ ok: true; url: string }>('/platform/discord/bot-invite')
    await navigator.clipboard.writeText(data.url)
    return data.url
  }

  return {
    account,
    memberships,
    loaded,
    isSignedIn,
    platformBotConfigured,
    refresh,
    requestSignIn,
    logout,
    createEvent,
    getEvent,
    patchOnboarding,
    updateEvent,
    inviteCohost,
    copyBotInvite,
  }
}
