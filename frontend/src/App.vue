<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { api } from './lib/api'
import { useAuth } from './composables/useAuth'
import { useConfig } from './composables/useConfig'

const { user, loaded, fetchUser, logout } = useAuth()
const { loadConfig } = useConfig()
const route = useRoute()
const unreadQuestions = ref(0)

onMounted(async () => {
  await Promise.all([fetchUser(), loadConfig()])
  if (user.value?.isAdmin) await loadUnreadCount()
})

watch(user, async (u) => {
  if (u?.isAdmin) await loadUnreadCount()
  else unreadQuestions.value = 0
})

watch(() => route.path, async () => {
  if (user.value?.isAdmin) await loadUnreadCount()
  if (user.value) await fetchUser()
})

async function loadUnreadCount() {
  try {
    const data = await api<{ unread: number }>('/admin/questions/unread-count')
    unreadQuestions.value = data.unread
  } catch {
    unreadQuestions.value = 0
  }
}

async function handleLogout() {
  await logout()
}
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <div class="header-inner">
        <RouterLink to="/" class="brand">
          <span class="brand-icon">⚔</span>
          <span class="brand-text">REALMATHON <em>5.0</em></span>
        </RouterLink>

        <nav class="main-nav" aria-label="Main">
          <RouterLink to="/">Home</RouterLink>
          <RouterLink to="/how-it-works">How It Works</RouterLink>
          <RouterLink to="/teams">Teams</RouterLink>
          <RouterLink to="/prompts">Prompts</RouterLink>
          <RouterLink to="/faq">FAQ</RouterLink>
          <RouterLink to="/standings">Standings</RouterLink>
        </nav>

        <div class="header-actions">
          <div v-if="user" class="action-buttons">
            <RouterLink
              v-if="user.status === 'assigned'"
              to="/submit"
              class="btn btn-secondary btn-sm action-btn"
            >
              Submit
            </RouterLink>
            <RouterLink
              v-if="user.isAdmin"
              to="/admin"
              class="btn btn-secondary btn-sm action-btn"
            >
              Admin
              <span v-if="unreadQuestions > 0" class="inbox-badge">{{ unreadQuestions }}</span>
            </RouterLink>
          </div>

          <template v-if="user">
            <RouterLink to="/profile" class="btn btn-secondary btn-sm profile-btn">
              <span class="profile-avatar">{{ user.displayName.charAt(0).toUpperCase() }}</span>
              <span class="profile-text">
                <span class="profile-name">
                  {{ user.displayName }}
                  <span v-if="user.unreadAnswers" class="profile-badge">{{ user.unreadAnswers }}</span>
                </span>
                <span class="profile-email">{{ user.email }}</span>
              </span>
            </RouterLink>
            <button type="button" class="btn btn-ghost btn-sm" @click="handleLogout">Log out</button>
          </template>
          <RouterLink v-else-if="loaded" to="/login" class="btn btn-primary btn-sm">Join</RouterLink>
        </div>
      </div>
    </header>

    <div class="app-content">
      <div v-if="user?.status === 'pending'" class="alert alert-warning status-banner">
        <strong>Awaiting assignment.</strong> You're in the pool — an admin will sort you into a realm soon.
      </div>

      <RouterView />
    </div>

    <footer class="site-footer">
      <p>REALMATHON 5.0 — <em>The Crucible</em></p>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.site-header {
  border-bottom: 1px solid var(--realm-border);
  background: rgba(8, 7, 11, 0.85);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 100;
  margin: 0 calc(-1 * var(--page-gutter)) 2rem;
  padding: 0 var(--page-gutter);
}

.header-inner {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 1rem 0;
  max-width: var(--page-max);
  margin: 0 auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--realm-text);
  white-space: nowrap;
  flex-shrink: 0;
}

.brand-icon {
  font-size: 1.5rem;
  color: var(--realm-accent);
}

.brand-text {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.brand-text em {
  font-style: normal;
  color: var(--realm-accent-glow);
  font-size: 0.85em;
}

.main-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.5rem;
  flex: 1;
  justify-content: center;
}

.main-nav a {
  color: var(--realm-text-muted);
  font-size: 0.92rem;
  font-weight: 500;
  padding: 0.35rem 0;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
  white-space: nowrap;
}

.main-nav a:hover,
.main-nav a.router-link-active,
.main-nav a.router-link-exact-active {
  color: var(--realm-accent-glow);
  border-bottom-color: var(--realm-accent);
}

.action-buttons :deep(a.action-btn) {
  position: relative;
  text-decoration: none;
}

.action-buttons :deep(a.action-btn:hover),
.action-buttons :deep(a.action-btn.router-link-active),
.action-buttons :deep(a.action-btn.router-link-exact-active) {
  color: var(--realm-accent-glow);
  border-color: var(--realm-accent);
  background: rgba(212, 99, 74, 0.1);
}

.profile-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  text-align: left;
  text-decoration: none;
  max-width: 14rem;
  padding: 0.4rem 0.85rem 0.4rem 0.45rem;
}

.profile-btn:hover,
.profile-btn.router-link-active,
.profile-btn.router-link-exact-active {
  color: var(--realm-accent-glow);
  border-color: var(--realm-accent);
  background: rgba(212, 99, 74, 0.1);
}

.profile-avatar {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--realm-accent), #a84030);
  color: white;
  font-family: var(--font-display);
  font-size: 0.9rem;
  font-weight: 700;
}

.profile-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.profile-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--realm-text);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-email {
  font-size: 0.72rem;
  color: var(--realm-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-shrink: 0;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-right: 0.85rem;
  border-right: 1px solid var(--realm-border);
}

.action-btn {
  white-space: nowrap;
}

.inbox-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  margin-left: 0.15rem;
  border-radius: 999px;
  background: var(--realm-accent);
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
}

.profile-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--realm-success);
  color: #0a1a0f;
  font-size: 0.65rem;
  font-weight: 700;
}

.btn-sm {
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
}

.app-content {
  flex: 1;
}

.status-banner {
  margin-bottom: 1.75rem;
}

.site-footer {
  margin-top: 3rem;
  padding-top: 2rem;
  text-align: center;
  color: var(--realm-text-muted);
  font-size: 0.85rem;
  opacity: 0.65;
}

.site-footer em {
  color: var(--realm-accent);
  font-style: normal;
}

@media (max-width: 1100px) {
  .header-inner {
    flex-wrap: wrap;
    gap: 1rem;
  }

  .main-nav {
    order: 3;
    width: 100%;
    justify-content: flex-start;
  }

  .header-actions {
    margin-left: auto;
  }
}

@media (max-width: 700px) {
  .header-inner {
    flex-direction: column;
    align-items: stretch;
  }

  .brand {
    justify-content: center;
  }

  .header-actions {
    flex-wrap: wrap;
    justify-content: center;
    margin-left: 0;
  }

  .action-buttons {
    border-right: none;
    padding-right: 0;
    width: 100%;
    justify-content: center;
    flex-wrap: wrap;
  }

  .profile-btn {
    max-width: 100%;
    justify-content: center;
  }

  .profile-text {
    align-items: center;
  }

  .main-nav {
    justify-content: center;
  }
}
</style>
