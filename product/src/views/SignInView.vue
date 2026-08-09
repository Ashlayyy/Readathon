<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { productName } from '../lib/api'
import { useHostAuth } from '../composables/useHostAuth'

const route = useRoute()
const router = useRouter()
const { requestSignIn, refresh, isSignedIn } = useHostAuth()

const mode = ref<'signin' | 'register'>('register')
const displayName = ref('')
const email = ref('')
const loading = ref(false)
const message = ref('')
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    const data = await requestSignIn(
      email.value,
      mode.value === 'register' ? displayName.value : undefined,
    )
    message.value = data.message
    await refresh(true)
    if (isSignedIn.value) {
      const next = typeof route.query.next === 'string' ? route.query.next : '/host'
      await router.replace(next)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not send link'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="signin">
    <div class="panel">
      <p class="eyebrow">Host access</p>
      <h1>Sign in to {{ productName() }}</h1>
      <p class="lede">
        We’ll email you a one-time link. You’re signing into the <strong>host panel</strong>, not a player event.
      </p>

      <div class="tabs">
        <button type="button" :class="{ on: mode === 'register' }" @click="mode = 'register'">
          New host
        </button>
        <button type="button" :class="{ on: mode === 'signin' }" @click="mode = 'signin'">
          Returning
        </button>
      </div>

      <form class="form" @submit.prevent="submit">
        <label v-if="mode === 'register'" class="field">
          <span>Your name</span>
          <input v-model="displayName" required minlength="2" autocomplete="name" />
        </label>
        <label class="field">
          <span>Email</span>
          <input v-model="email" type="email" required autocomplete="email" />
        </label>
        <button class="btn btn-primary" type="submit" :disabled="loading">
          {{ loading ? 'Sending…' : 'Email me a sign-in link' }}
        </button>
      </form>

      <p v-if="message" class="alert alert-ok">{{ message }}</p>
      <p v-if="error" class="alert alert-err">{{ error }}</p>
    </div>
  </main>
</template>

<style scoped>
.signin {
  width: min(520px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 4rem;
}
.panel {
  padding: 1.75rem;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) + 4px);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  box-shadow: var(--shadow);
}
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  color: var(--accent);
}
h1 {
  margin: 0.5rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  line-height: 1.1;
}
.lede {
  margin: 0.75rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}
.tabs {
  display: flex;
  gap: 0.5rem;
  margin: 1.5rem 0 1rem;
}
.tabs button {
  flex: 1;
  min-height: 2.5rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.tabs button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.form {
  display: grid;
  gap: 0.9rem;
}
.alert {
  margin-top: 1rem;
}
</style>
