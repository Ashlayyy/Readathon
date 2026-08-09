<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed, onMounted } from 'vue'
import { productName } from './lib/api'
import { useHostAuth } from './composables/useHostAuth'

const route = useRoute()
const { account, isSignedIn, refresh, logout, memberships } = useHostAuth()
const name = productName()
const isLanding = computed(() => route.name === 'landing')
const eventCount = computed(() => memberships.value.length)

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
        <span class="brand-mark" aria-hidden="true">
          <span class="brand-mark__spine" />
          <span class="brand-mark__page" />
        </span>
        <span class="brand-text">{{ name }}</span>
      </RouterLink>
      <nav class="nav" aria-label="Primary">
        <a v-if="isLanding" class="nav-link" href="#features">Features</a>
        <a v-if="isLanding" class="nav-link" href="#how">How it works</a>
        <RouterLink v-if="!isSignedIn" class="nav-link" to="/signin">Sign in</RouterLink>
        <RouterLink v-if="isSignedIn" class="nav-link" to="/host">
          Host panel
          <span v-if="eventCount" class="nav-count">{{ eventCount }}</span>
        </RouterLink>
        <RouterLink v-if="isSignedIn" class="nav-cta" to="/host/new">New event</RouterLink>
        <button v-if="isSignedIn" type="button" class="nav-text" @click="onLogout">
          Sign out
        </button>
        <RouterLink v-else class="nav-cta" to="/signin?next=/host/new">Start free</RouterLink>
      </nav>
      <p v-if="isSignedIn && account" class="who">{{ account.displayName }}</p>
    </header>

    <RouterView v-slot="{ Component }">
      <Transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>

    <footer v-if="isLanding" class="foot">
      <div class="foot__inner">
        <div>
          <strong>{{ name }}</strong>
          <p>Host team readathons without building your own stack.</p>
        </div>
        <div class="foot__links">
          <RouterLink to="/signin">Host sign-in</RouterLink>
          <RouterLink to="/signin?next=/host/new">Start an event</RouterLink>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.35rem 1rem;
  align-items: center;
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 0.95rem 0;
  backdrop-filter: blur(14px);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--ink) 88%, transparent),
    color-mix(in srgb, var(--ink) 55%, transparent)
  );
}
.shell--landing .top {
  width: 100%;
  padding-inline: max(1rem, calc((100% - 1180px) / 2));
  border-bottom: 1px solid transparent;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  text-decoration: none;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.4rem;
  letter-spacing: -0.03em;
}
.brand-mark {
  position: relative;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 0.35rem;
  background: linear-gradient(145deg, var(--panel-2), var(--ink));
  border: 1px solid var(--line-strong);
  overflow: hidden;
  box-shadow: 0 0 28px rgba(212, 240, 106, 0.22);
}
.brand-mark__spine {
  position: absolute;
  inset: 0 auto 0 0;
  width: 28%;
  background: linear-gradient(180deg, var(--accent), var(--warm));
}
.brand-mark__page {
  position: absolute;
  inset: 18% 14% 18% 36%;
  border-radius: 2px;
  background: color-mix(in srgb, var(--text) 14%, transparent);
}
.nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem 1rem;
}
.nav-link,
.nav-text {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.94rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.nav-link:hover,
.nav-text:hover {
  color: var(--text);
}
.nav-count {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
  display: inline-grid;
  place-items: center;
}
.nav-cta {
  color: var(--accent-ink) !important;
  background: var(--accent);
  padding: 0.5rem 1rem !important;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 8px 22px rgba(212, 240, 106, 0.18);
}
.who {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
  text-align: right;
}
.foot {
  margin-top: auto;
  border-top: 1px solid var(--line);
  padding: 2.5rem 0 2rem;
}
.foot__inner {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1.5rem;
}
.foot p {
  margin: 0.35rem 0 0;
  color: var(--muted);
  max-width: 28rem;
  line-height: 1.5;
}
.foot__links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.foot__links a {
  color: var(--muted);
  text-decoration: none;
}
.foot__links a:hover {
  color: var(--accent);
}
@media (max-width: 720px) {
  .top {
    grid-template-columns: 1fr;
  }
  .nav {
    justify-content: flex-start;
  }
  .who {
    text-align: left;
  }
}
</style>
