<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'

const { register, login, googleLoginUrl } = useAuth()
const { config, loadConfig } = useConfig()
const route = useRoute()

const mode = ref<'register' | 'login'>('register')
const displayName = ref('')
const email = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

loadConfig()

if (route.query.error === 'oauth_failed') {
  error.value = 'Google sign-in failed. Please try again.'
} else if (route.query.error === 'google_not_configured') {
  error.value = 'Google sign-in is not configured on the server yet.'
} else if (route.query.error === 'invalid_link') {
  error.value = 'That sign-in link is invalid or expired. Please request a new one.'
}

async function submit() {
  error.value = ''
  success.value = ''
  loading.value = true
  try {
    if (mode.value === 'register') {
      const result = await register(displayName.value, email.value)
      success.value = result.message
    } else {
      const result = await login(email.value)
      success.value = result.message
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page login-page">
    <div v-if="config" class="login-card card">
      <div class="login-header">
        <span class="login-icon">⚔</span>
        <h1>{{ config.copy.loginTitle }}</h1>
        <p class="lead">
          {{ mode === 'register' ? config.copy.loginRegisterLead : config.copy.loginMagicLinkLead }}
        </p>
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>
      <div v-if="success" class="alert alert-success">{{ success }}</div>

      <div v-if="!success" class="mode-toggle">
        <button type="button" :class="{ active: mode === 'register' }" @click="mode = 'register'">
          {{ config.copy.loginRegisterTab }}
        </button>
        <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">
          {{ config.copy.loginSignInTab }}
        </button>
      </div>

      <form v-if="!success" @submit.prevent="submit">
        <label v-if="mode === 'register'" class="field">
          {{ config.copy.loginDisplayNameLabel }}
          <input v-model="displayName" type="text" :placeholder="String(config.copy.loginDisplayNamePlaceholder)" required minlength="2" />
        </label>
        <label class="field">
          {{ config.copy.loginEmailLabel }}
          <input v-model="email" type="email" :placeholder="String(config.copy.loginEmailPlaceholder)" required autocomplete="email" />
        </label>
        <button type="submit" class="btn btn-primary full" :disabled="loading">
          {{ loading ? config.copy.loginWaiting : mode === 'register' ? config.copy.loginRegisterButton : config.copy.loginMagicLinkButton }}
        </button>
      </form>

      <template v-if="!success">
        <div class="divider"><span>{{ config.copy.loginDivider }}</span></div>

        <a :href="googleLoginUrl()" class="btn btn-secondary full google-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ config.copy.loginGoogleButton }}
        </a>
      </template>

      <p class="fine-print">
        <template v-if="mode === 'register' || success">
          {{ success && mode === 'register' ? config.copy.loginRegisterSuccess : config.copy.loginFinePrintRegister }}
        </template>
        <template v-else>
          {{ config.copy.loginFinePrintMagicLink }}
        </template>
      </p>
    </div>
  </main>
</template>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  padding: 2rem 0;
}

.login-card {
  width: 100%;
  max-width: 26rem;
}

.login-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.login-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.5rem;
}

.login-header h1 {
  font-family: var(--font-display);
  color: var(--realm-text);
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
}

.lead {
  color: var(--realm-text-muted);
  font-size: 0.95rem;
  line-height: 1.6;
}

.mode-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.mode-toggle button {
  flex: 1;
  padding: 0.55rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  cursor: pointer;
  font-weight: 600;
  font-family: var(--font-body);
  transition: border-color 0.2s, color 0.2s;
}

.mode-toggle button.active {
  border-color: var(--realm-accent);
  color: var(--realm-accent-glow);
  background: rgba(212, 99, 74, 0.08);
}

form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.full {
  width: 100%;
}

.divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.25rem 0;
  color: var(--realm-text-muted);
  font-size: 0.85rem;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--realm-border);
}

.google-btn {
  gap: 0.65rem;
}

.fine-print {
  margin-top: 1.25rem;
  font-size: 0.8rem;
  color: var(--realm-text-muted);
  text-align: center;
  line-height: 1.55;
}

@media (max-width: 768px) {
  .login-page {
    padding: 1rem 0;
  }

  .login-card {
    max-width: 100%;
  }

  .mode-toggle button {
    min-height: 2.75rem;
  }
}
</style>
