<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../../lib/api'

const productName = import.meta.env.VITE_PRODUCT_NAME?.trim() || 'Product'

type Membership = {
  slug: string
  name: string
  role: string
  pathUrl: string
  subdomainUrl: string
  adminPath?: string
}

const account = ref<{ id: string; email: string; displayName: string } | null>(null)
const memberships = ref<Membership[]>([])
const email = ref('')
const displayName = ref('')
const message = ref('')
const error = ref('')
const loading = ref(false)
const mode = ref<'login' | 'register'>('login')

async function loadMe() {
  try {
    const data = await api<{
      account: { id: string; email: string; displayName: string } | null
      memberships: Membership[]
    }>('/platform/me')
    account.value = data.account
    memberships.value = data.memberships ?? []
  } catch {
    account.value = null
    memberships.value = []
  }
}

async function submitAuth() {
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    const path = mode.value === 'register' ? '/platform/register' : '/platform/login'
    const body =
      mode.value === 'register'
        ? { email: email.value, displayName: displayName.value }
        : { email: email.value }
    const data = await api<{ sent: boolean; message: string }>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    message.value = data.message
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    loading.value = false
  }
}

const origin = typeof window !== 'undefined' ? window.location.origin : ''

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    message.value = 'Copied to clipboard.'
  } catch {
    error.value = 'Could not copy — select the URL manually.'
  }
}

async function copyInvite() {
  try {
    const data = await api<{ ok: true; url: string }>('/platform/discord/bot-invite')
    await navigator.clipboard.writeText(data.url)
    message.value = 'Bot invite link copied.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not get bot invite'
  }
}

onMounted(() => {
  void loadMe()
})
</script>

<template>
  <div class="host">
    <header class="host__bar">
      <RouterLink class="host__brand" to="/">{{ productName }}</RouterLink>
      <RouterLink to="/host/new">New event</RouterLink>
    </header>

    <main class="host__main">
      <h1>Host console</h1>

      <section v-if="!account" class="host__card">
        <div class="host__tabs">
          <button type="button" :class="{ on: mode === 'login' }" @click="mode = 'login'">Sign in</button>
          <button type="button" :class="{ on: mode === 'register' }" @click="mode = 'register'">
            Create account
          </button>
        </div>
        <form class="host__form" @submit.prevent="submitAuth">
          <label v-if="mode === 'register'">
            Name
            <input v-model="displayName" required minlength="2" />
          </label>
          <label>
            Email
            <input v-model="email" type="email" required />
          </label>
          <button type="submit" :disabled="loading">
            {{ loading ? 'Sending…' : 'Email me a sign-in link' }}
          </button>
        </form>
        <p v-if="message" class="ok">{{ message }}</p>
        <p v-if="error" class="err">{{ error }}</p>
      </section>

      <template v-else>
        <p class="host__hello">Signed in as {{ account.displayName }} ({{ account.email }})</p>

        <section class="host__card">
          <h2>Your events</h2>
          <ul v-if="memberships.length" class="host__list">
            <li v-for="m in memberships" :key="m.slug">
              <strong>{{ m.name }}</strong>
              <span class="muted">{{ m.slug }} · {{ m.role }}</span>
              <div class="host__links">
                <a :href="`/e/${m.slug}`">Open</a>
                <a :href="`/e/${m.slug}/admin`">Admin</a>
                <a :href="`/e/${m.slug}/login`">Login page</a>
                <button type="button" class="linkish" @click="copyText(m.pathUrl || `${origin}/e/${m.slug}`)">
                  Copy path URL
                </button>
              </div>
            </li>
          </ul>
          <div v-else class="host__empty">
            <p class="muted">No events yet.</p>
            <ol class="host__tips">
              <li>Create an event with a unique slug.</li>
              <li>Share the <code>/e/slug</code> link with players (subdomains need DNS).</li>
              <li>Invite the Discord bot, then configure channels in that event’s Admin → Settings.</li>
            </ol>
          </div>
          <RouterLink class="host__btn" to="/host/new">Create event</RouterLink>
        </section>

        <section class="host__card">
          <h2>Discord bot</h2>
          <p class="muted">Invite the platform bot to your server, then pick channels in Admin → Settings.</p>
          <button type="button" class="host__btn host__btn--ghost" @click="copyInvite">
            Copy bot invite link
          </button>
          <p v-if="message" class="ok">{{ message }}</p>
          <p v-if="error" class="err">{{ error }}</p>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.host {
  min-height: 100vh;
  background: linear-gradient(165deg, #0f1412, #1a2420 50%, #121816);
  color: #f2ebe3;
  font-family: 'Segoe UI', system-ui, sans-serif;
}
.host__bar {
  display: flex;
  justify-content: space-between;
  padding: 1.25rem 1.75rem;
  max-width: 800px;
  margin: 0 auto;
}
.host__brand {
  font-weight: 700;
  color: #f2ebe3;
  text-decoration: none;
}
.host__bar a {
  color: #c9c0b4;
}
.host__main {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem 1.75rem 3rem;
}
.host__card {
  margin: 1.5rem 0;
  padding: 1.25rem;
  border: 1px solid rgba(242, 235, 227, 0.12);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
}
.host__tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.host__tabs button {
  background: transparent;
  border: 1px solid rgba(242, 235, 227, 0.2);
  color: #c9c0b4;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
}
.host__tabs button.on {
  color: #1a1410;
  background: #d4a574;
  border-color: #d4a574;
}
.host__form {
  display: grid;
  gap: 0.75rem;
}
.host__form label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.host__form input {
  padding: 0.55rem 0.7rem;
  border-radius: 4px;
  border: 1px solid rgba(242, 235, 227, 0.2);
  background: #0f1412;
  color: #f2ebe3;
}
.host__form button,
.host__btn {
  display: inline-flex;
  width: fit-content;
  padding: 0.6rem 1rem;
  background: #d4a574;
  color: #1a1410;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.host__btn--ghost {
  background: transparent;
  color: #f2ebe3;
  border: 1px solid rgba(242, 235, 227, 0.35);
}
.host__list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
}
.host__list li {
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(242, 235, 227, 0.08);
}
.host__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: center;
}
.host__links a,
.host__links .linkish {
  color: #d4a574;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.host__empty {
  margin-bottom: 1rem;
}
.host__tips {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  color: #9a948a;
  font-size: 0.9rem;
  line-height: 1.5;
}
.host__tips code {
  color: #f2ebe3;
}
.muted {
  color: #9a948a;
  font-size: 0.9rem;
}
.ok {
  color: #9aaf9f;
}
.err {
  color: #e08a7a;
}
</style>
