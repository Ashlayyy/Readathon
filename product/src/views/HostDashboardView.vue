<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  playerAdminUrl,
  playerEventUrl,
  productApex,
  type Membership,
} from '../lib/api'
import { useHostAuth } from '../composables/useHostAuth'

const {
  account,
  memberships,
  refresh,
  platformBotConfigured,
  copyBotInvite,
} = useHostAuth()

const notice = ref('')
const error = ref('')
const copied = ref('')

onMounted(() => {
  void refresh(true)
})

async function copy(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = label
    notice.value = 'Copied.'
    setTimeout(() => {
      if (copied.value === label) copied.value = ''
    }, 1600)
  } catch {
    error.value = 'Could not copy — select the link manually.'
  }
}

async function onInvite() {
  notice.value = ''
  error.value = ''
  try {
    await copyBotInvite()
    notice.value = 'Discord bot invite copied. Open it while logged into Discord.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not get bot invite'
  }
}

function openPlayer(m: Membership) {
  window.open(playerEventUrl(m.slug), '_blank', 'noopener')
}

function openAdmin(m: Membership) {
  window.open(playerAdminUrl(m.slug, '#discord'), '_blank', 'noopener')
}
</script>

<template>
  <main class="dash">
    <header class="dash__head">
      <div>
        <p class="eyebrow">Host panel</p>
        <h1>Welcome{{ account ? `, ${account.displayName}` : '' }}</h1>
        <p class="lede">
          Create an event, finish the checklist, share the player link, then fine-tune in Admin.
        </p>
      </div>
      <RouterLink class="btn btn-primary" to="/host/new">Create event</RouterLink>
    </header>

    <p v-if="notice" class="alert alert-ok">{{ notice }}</p>
    <p v-if="error" class="alert alert-err">{{ error }}</p>

    <section class="block">
      <div class="block__title">
        <h2>Your events</h2>
        <span v-if="memberships.length">{{ memberships.length }}</span>
      </div>

      <div v-if="!memberships.length" class="empty">
        <h3>No events yet</h3>
        <p>Start with a name and a short URL slug. Players can join via a link right away.</p>
        <RouterLink class="btn btn-primary" to="/host/new">Create your first event</RouterLink>
      </div>

      <ul v-else class="events">
        <li v-for="m in memberships" :key="m.slug" class="event">
          <div class="event__main">
            <h3>
              <RouterLink :to="`/host/e/${m.slug}`">{{ m.name }}</RouterLink>
            </h3>
            <p>
              <code>{{ m.slug }}</code>
              <span>· {{ m.role }}</span>
              <span v-if="m.tenantStatus !== 'active'">· {{ m.tenantStatus }}</span>
              <span v-if="!m.onboarding.complete && !m.hostOnboarding?.dismissed">
                · setup {{ m.onboarding.done }}/{{ m.onboarding.total }}
              </span>
            </p>
          </div>
          <div class="event__actions">
            <RouterLink class="btn btn-primary" :to="`/host/e/${m.slug}`">Manage</RouterLink>
            <button type="button" class="btn btn-ghost" @click="openPlayer(m)">Open site</button>
            <button type="button" class="btn btn-ghost" @click="openAdmin(m)">Admin</button>
            <button
              type="button"
              class="btn btn-ghost"
              @click="copy(`path-${m.slug}`, playerEventUrl(m.slug))"
            >
              {{ copied === `path-${m.slug}` ? 'Copied' : 'Copy link' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="block">
      <div class="block__title">
        <h2>Discord</h2>
        <span :class="platformBotConfigured ? 'badge ok' : 'badge warn'">
          {{ platformBotConfigured ? 'Bot ready' : 'Token missing' }}
        </span>
      </div>
      <p class="lede">
        One platform bot for every event.
        <template v-if="platformBotConfigured"> Token is configured on the server.</template>
        <template v-else>
          Set <code>PLATFORM_DISCORD_BOT_TOKEN</code> before hosts can invite the bot.
        </template>
      </p>
      <div class="row">
        <button type="button" class="btn btn-ghost" :disabled="!platformBotConfigured" @click="onInvite">
          Copy bot invite
        </button>
        <p class="hint">Then open that event → Admin → Settings (#discord) to pick channels.</p>
      </div>
    </section>

    <section class="block tips">
      <h2>Quick tips</h2>
      <ul>
        <li>Path links like <code>/e/your-slug</code> work without DNS.</li>
        <li>Subdomains need <code>*.{{ productApex() }}</code> pointed at the app.</li>
        <li>Players sign into the event URL — hosts sign in here.</li>
        <li>
          If Admin asks you to sign in again, use the same email — sessions only share when
          <code>COOKIE_DOMAIN</code> is set for your apex.
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.dash {
  width: min(920px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1rem 0 4rem;
  display: grid;
  gap: 1.25rem;
}
.dash__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: end;
}
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  color: var(--accent);
}
h1 {
  margin: 0.4rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 2.8rem);
}
.lede {
  margin: 0.5rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}
.block {
  padding: 1.25rem 1.35rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--panel) 80%, transparent);
}
.block__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}
.block__title h2,
.tips h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
}
.block__title span {
  color: var(--muted);
  font-size: 0.9rem;
}
.badge {
  font-size: 0.78rem !important;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.badge.ok {
  color: var(--accent) !important;
}
.badge.warn {
  color: #e8a87c !important;
}
.empty {
  display: grid;
  gap: 0.75rem;
  justify-items: start;
}
.empty h3 {
  margin: 0;
}
.empty p {
  margin: 0;
  color: var(--muted);
}
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}
.event {
  display: grid;
  gap: 0.85rem;
  padding: 1rem 0;
  border-top: 1px solid var(--line);
}
.event:first-child {
  border-top: none;
  padding-top: 0.25rem;
}
.event h3 {
  margin: 0;
  font-size: 1.15rem;
}
.event h3 a {
  color: inherit;
  text-decoration: none;
}
.event h3 a:hover {
  color: var(--accent);
}
.event p {
  margin: 0.25rem 0 0;
  color: var(--muted);
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.event code,
.hint code,
.tips code {
  color: var(--accent);
}
.event__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: center;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.tips ul {
  margin: 0.75rem 0 0;
  padding-left: 1.1rem;
  color: var(--muted);
  line-height: 1.55;
}
a.btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
</style>
