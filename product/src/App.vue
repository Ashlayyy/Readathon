<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed, onMounted } from 'vue'
import { productName } from './lib/api'
import { useHostAuth } from './composables/useHostAuth'

const route = useRoute()
const { account, isSignedIn, refresh, logout } = useHostAuth()
const name = productName()
const isLanding = computed(() => route.name === 'landing')

onMounted(() => {
  void refresh()
})

async function onLogout() {
  await logout()
  window.location.href = '/'
}
</script>

<template>
  <div class="shell" :class="{ 'shell--landing': isLanding }">
    <header class="top">
      <RouterLink class="brand" to="/">
        <span class="brand-mark" aria-hidden="true" />
        <span>{{ name }}</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink v-if="!isSignedIn" to="/signin">Sign in</RouterLink>
        <RouterLink v-if="isSignedIn" to="/host">Host panel</RouterLink>
        <RouterLink v-if="isSignedIn" class="nav-cta" to="/host/new">New event</RouterLink>
        <button v-if="isSignedIn" type="button" class="nav-text" @click="onLogout">
          Sign out{{ account ? ` (${account.displayName})` : '' }}
        </button>
        <RouterLink v-else class="nav-cta" to="/signin?next=/host/new">Start free</RouterLink>
      </nav>
    </header>

    <RouterView v-slot="{ Component }">
      <Transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: min(1120px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.25rem 0;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  text-decoration: none;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}
.brand-mark {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 0.3rem;
  background: linear-gradient(135deg, var(--accent), var(--warm));
  box-shadow: 0 0 24px rgba(200, 245, 96, 0.35);
}
.nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.85rem;
}
.nav a,
.nav-text {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.95rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.nav a:hover,
.nav-text:hover {
  color: var(--text);
}
.nav-cta {
  color: var(--accent-ink) !important;
  background: var(--accent);
  padding: 0.45rem 0.9rem !important;
  border-radius: 999px;
  font-weight: 600;
}
@media (max-width: 640px) {
  .top {
    align-items: flex-start;
    flex-direction: column;
  }
  .nav {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
