<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
const query = ref('')
const statusFilter = ref<'all' | 'active' | 'setup' | 'archived'>('all')

onMounted(() => {
  void refresh(true)
})

const needsSetup = computed(
  () =>
    memberships.value.filter(
      (m) => !m.onboarding?.complete && !m.hostOnboarding?.dismissed,
    ).length,
)

const activeCount = computed(
  () => memberships.value.filter((m) => m.tenantStatus !== 'archived').length,
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return memberships.value.filter((m) => {
    if (statusFilter.value === 'active' && m.tenantStatus === 'archived') return false
    if (statusFilter.value === 'archived' && m.tenantStatus !== 'archived') return false
    if (
      statusFilter.value === 'setup' &&
      (m.onboarding?.complete || m.hostOnboarding?.dismissed)
    ) {
      return false
    }
    if (!q) return true
    return m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q)
  })
})

async function copy(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = label
    notice.value = 'Copied to clipboard.'
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

function setupLabel(m: Membership) {
  if (m.hostOnboarding?.dismissed || m.onboarding?.complete) return 'Ready'
  return `Setup ${m.onboarding?.done ?? 0}/${m.onboarding?.total ?? 4}`
}
</script>

<template>
  <main class="dash">
    <header class="dash__head">
      <div>
        <p class="eyebrow">Host panel</p>
        <h1>Welcome{{ account ? `, ${account.displayName}` : '' }}</h1>
        <p class="lede">
          Manage events, finish setup checklists, and jump into Admin when you need the deep tools.
        </p>
      </div>
      <RouterLink class="btn btn-primary" to="/host/new">Create event</RouterLink>
    </header>

    <section class="stats" aria-label="Overview">
      <article>
        <span>Events</span>
        <strong>{{ memberships.length }}</strong>
      </article>
      <article>
        <span>Active</span>
        <strong>{{ activeCount }}</strong>
      </article>
      <article>
        <span>Needs setup</span>
        <strong :class="{ warn: needsSetup > 0 }">{{ needsSetup }}</strong>
      </article>
      <article>
        <span>Discord bot</span>
        <strong :class="platformBotConfigured ? 'ok' : 'warn'">
          {{ platformBotConfigured ? 'Ready' : 'Missing' }}
        </strong>
      </article>
    </section>

    <p v-if="notice" class="alert alert-ok">{{ notice }}</p>
    <p v-if="error" class="alert alert-err">{{ error }}</p>

    <section class="surface events-block">
      <div class="block__title">
        <div>
          <h2>Your events</h2>
          <p v-if="memberships.length">{{ filtered.length }} shown</p>
        </div>
        <div v-if="memberships.length" class="tools">
          <input
            v-model="query"
            class="search"
            type="search"
            placeholder="Search name or slug"
            aria-label="Search events"
          />
          <div class="filters" role="group" aria-label="Filter events">
            <button
              v-for="f in [
                ['all', 'All'],
                ['active', 'Active'],
                ['setup', 'Setup'],
                ['archived', 'Archived'],
              ] as const"
              :key="f[0]"
              type="button"
              :class="{ on: statusFilter === f[0] }"
              @click="statusFilter = f[0]"
            >
              {{ f[1] }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="!memberships.length" class="empty">
        <h3>No events yet</h3>
        <p>Start with a name and a short URL slug. Players can join via a link right away.</p>
        <RouterLink class="btn btn-primary" to="/host/new">Create your first event</RouterLink>
      </div>

      <div v-else-if="!filtered.length" class="empty">
        <h3>No matches</h3>
        <p>Try another search or filter.</p>
      </div>

      <ul v-else class="events">
        <li v-for="m in filtered" :key="m.slug" class="event">
          <div class="event__main">
            <div class="event__title">
              <h3>
                <RouterLink :to="`/host/e/${m.slug}`">{{ m.name }}</RouterLink>
              </h3>
              <span
                class="pill"
                :class="{
                  ready: m.onboarding?.complete || m.hostOnboarding?.dismissed,
                  archived: m.tenantStatus === 'archived',
                }"
              >
                {{ m.tenantStatus === 'archived' ? 'Archived' : setupLabel(m) }}
              </span>
            </div>
            <p>
              <code>{{ m.slug }}</code>
              <span>· {{ m.role }}</span>
            </p>
            <div
              v-if="!m.onboarding?.complete && !m.hostOnboarding?.dismissed"
              class="progress"
              aria-hidden="true"
            >
              <span
                :style="{
                  width: `${((m.onboarding?.done ?? 0) / (m.onboarding?.total || 4)) * 100}%`,
                }"
              />
            </div>
          </div>
          <div class="event__actions">
            <RouterLink class="btn btn-primary btn-sm" :to="`/host/e/${m.slug}`">
              Manage
            </RouterLink>
            <button type="button" class="btn btn-ghost btn-sm" @click="openPlayer(m)">
              Open site
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="openAdmin(m)">
              Admin
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="copy(`path-${m.slug}`, playerEventUrl(m.slug))"
            >
              {{ copied === `path-${m.slug}` ? 'Copied' : 'Copy link' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="surface discord">
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
        <button
          type="button"
          class="btn btn-warm"
          :disabled="!platformBotConfigured"
          @click="onInvite"
        >
          Copy bot invite
        </button>
        <p class="hint">Then open an event → Admin → Settings (#discord) to pick channels.</p>
      </div>
    </section>

    <section class="surface tips">
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
  width: min(1040px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1rem 0 4rem;
  display: grid;
  gap: 1.15rem;
}
.dash__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: end;
}
h1 {
  margin: 0.4rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2.1rem, 4vw, 3rem);
  letter-spacing: -0.03em;
}
.lede {
  margin: 0.55rem 0 0;
  color: var(--muted);
  line-height: 1.5;
  max-width: 40rem;
}
.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
@media (min-width: 800px) {
  .stats {
    grid-template-columns: repeat(4, 1fr);
  }
}
.stats article {
  padding: 1rem 1.1rem;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 75%, transparent);
  display: grid;
  gap: 0.3rem;
}
.stats span {
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.stats strong {
  font-family: var(--font-display);
  font-size: 1.7rem;
  letter-spacing: -0.02em;
}
.stats .ok {
  color: var(--accent);
}
.stats .warn {
  color: var(--warm);
}
.block__title {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.block__title h2,
.tips h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.4rem;
}
.block__title p {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.tools {
  display: grid;
  gap: 0.65rem;
  width: min(100%, 22rem);
}
.search {
  min-height: 2.5rem;
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.28);
  color: var(--text);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.filters button {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.filters button.on {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent);
  font-weight: 600;
}
.empty {
  display: grid;
  gap: 0.75rem;
  justify-items: start;
  padding: 0.5rem 0 0.25rem;
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
  gap: 0.35rem;
}
.event {
  display: grid;
  gap: 0.9rem;
  padding: 1.1rem 0.15rem;
  border-top: 1px solid var(--line);
}
.event:first-child {
  border-top: none;
  padding-top: 0.2rem;
}
.event__title {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}
.event h3 {
  margin: 0;
  font-size: 1.2rem;
}
.event h3 a {
  color: inherit;
  text-decoration: none;
}
.event h3 a:hover {
  color: var(--accent);
}
.event p {
  margin: 0.3rem 0 0;
  color: var(--muted);
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.event code,
.hint code,
.tips code,
.lede code {
  color: var(--accent);
}
.pill {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--warm) 40%, var(--line));
  color: var(--warm);
}
.pill.ready {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  color: var(--accent);
}
.pill.archived {
  border-color: var(--line);
  color: var(--muted);
}
.progress {
  margin-top: 0.65rem;
  height: 0.3rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 80%, transparent);
  overflow: hidden;
  max-width: 14rem;
}
.progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--warm));
}
.event__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.badge {
  font-size: 0.75rem !important;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.badge.ok {
  color: var(--accent) !important;
}
.badge.warn {
  color: var(--warm) !important;
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
  line-height: 1.6;
}
a.btn {
  text-decoration: none;
}
@media (min-width: 860px) {
  .event {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
}
</style>
