<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import OnboardingChecklist from '../components/OnboardingChecklist.vue'
import {
  playerAdminUrl,
  playerEventUrl,
  productApex,
  type HostEvent,
  type HostOnboarding,
} from '../lib/api'
import { useHostAuth } from '../composables/useHostAuth'

const route = useRoute()
const {
  getEvent,
  patchOnboarding,
  updateEvent,
  inviteCohost,
  copyBotInvite,
  platformBotConfigured,
} = useHostAuth()

const slug = computed(() => String(route.params.slug || ''))
const event = ref<HostEvent | null>(null)
const loading = ref(true)
const notice = ref('')
const error = ref('')
const copied = ref('')
const rename = ref('')
const cohostEmail = ref('')
const busy = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    event.value = await getEvent(slug.value)
    rename.value = event.value.name
  } catch (e) {
    event.value = null
    error.value = e instanceof Error ? e.message : 'Could not load event'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
watch(slug, () => {
  void load()
})

async function mark(key: keyof HostOnboarding) {
  if (!event.value) return
  try {
    const m = await patchOnboarding(event.value.slug, { [key]: true })
    event.value = {
      ...event.value,
      ...m,
      discordConfigured: event.value.discordConfigured,
      platformBotConfigured: event.value.platformBotConfigured,
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not update checklist'
  }
}

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

async function onAction(
  id: 'share' | 'discord' | 'admin' | 'preview' | 'dismiss',
) {
  if (!event.value) return
  notice.value = ''
  error.value = ''
  try {
    if (id === 'share') {
      await copy('player', event.value.pathUrl)
      await mark('sharedPlayerLink')
      return
    }
    if (id === 'discord') {
      await copyBotInvite()
      notice.value = 'Discord bot invite copied. Open it while logged into Discord.'
      await mark('discordBotInvited')
      return
    }
    if (id === 'admin') {
      await mark('openedAdmin')
      window.open(
        `${playerAdminUrl(event.value.slug, '#discord')}`,
        '_blank',
        'noopener',
      )
      return
    }
    if (id === 'preview') {
      await mark('previewOpened')
      window.open(playerEventUrl(event.value.slug), '_blank', 'noopener')
      return
    }
    if (id === 'dismiss') {
      await mark('dismissed')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Action failed'
  }
}

async function saveName() {
  if (!event.value) return
  busy.value = true
  error.value = ''
  try {
    const m = await updateEvent(event.value.slug, { name: rename.value })
    event.value = {
      ...event.value,
      ...m,
      discordConfigured: event.value.discordConfigured,
      platformBotConfigured: event.value.platformBotConfigured,
    }
    notice.value = 'Event name updated.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not rename'
  } finally {
    busy.value = false
  }
}

async function toggleArchive() {
  if (!event.value) return
  const next = event.value.tenantStatus === 'archived' ? 'active' : 'archived'
  const label = next === 'archived' ? 'Archive this event?' : 'Restore this event?'
  if (!window.confirm(label)) return
  busy.value = true
  error.value = ''
  try {
    const m = await updateEvent(event.value.slug, { status: next })
    event.value = {
      ...event.value,
      ...m,
      discordConfigured: event.value.discordConfigured,
      platformBotConfigured: event.value.platformBotConfigured,
    }
    notice.value = next === 'archived' ? 'Event archived.' : 'Event restored.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not update status'
  } finally {
    busy.value = false
  }
}

async function onInviteCohost() {
  if (!event.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await inviteCohost(event.value.slug, cohostEmail.value)
    notice.value = `Invited ${data.invitee.email} as ${data.invitee.role}. They can sign in on the host panel.`
    cohostEmail.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not invite'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="home">
    <RouterLink class="back" to="/host">← Host panel</RouterLink>

    <p v-if="loading" class="lede">Loading event…</p>
    <p v-else-if="error && !event" class="alert alert-err">{{ error }}</p>

    <template v-else-if="event">
      <header class="home__head">
        <div>
          <p class="eyebrow">Event home</p>
          <h1>{{ event.name }}</h1>
          <p class="lede">
            <code>{{ event.slug }}</code>
            <span>· {{ event.role }}</span>
            <span v-if="event.tenantStatus !== 'active'">
              · {{ event.tenantStatus }}
            </span>
          </p>
        </div>
        <div class="home__actions">
          <a class="btn btn-primary" :href="playerEventUrl(event.slug)" target="_blank" rel="noopener">
            Open site
          </a>
          <a
            class="btn btn-ghost"
            :href="playerAdminUrl(event.slug, '#discord')"
            target="_blank"
            rel="noopener"
            @click="mark('openedAdmin')"
          >
            Open Admin
          </a>
        </div>
      </header>

      <p v-if="notice" class="alert alert-ok">{{ notice }}</p>
      <p v-if="error" class="alert alert-err">{{ error }}</p>

      <OnboardingChecklist
        :onboarding="event.hostOnboarding"
        :progress="event.onboarding"
        :discord-configured="event.discordConfigured"
        :platform-bot-configured="event.platformBotConfigured || platformBotConfigured"
        @mark="mark"
        @action="onAction"
      />

      <section class="block">
        <h2>Links</h2>
        <div class="urls">
          <div>
            <span>Player link</span>
            <code>{{ event.pathUrl }}</code>
            <button type="button" class="btn btn-ghost" @click="copy('path', event.pathUrl); mark('sharedPlayerLink')">
              {{ copied === 'path' ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <div>
            <span>Subdomain (needs DNS)</span>
            <code>{{ event.subdomainUrl }}</code>
            <button type="button" class="btn btn-ghost" @click="copy('sub', event.subdomainUrl)">
              {{ copied === 'sub' ? 'Copied' : 'Copy' }}
            </button>
          </div>
        </div>
        <p class="hint">
          Path links work immediately. Subdomains need
          <code>*.{{ productApex() }}</code> pointed at the player app.
        </p>
      </section>

      <section class="block">
        <h2>Settings</h2>
        <form class="form" @submit.prevent="saveName">
          <label class="field">
            <span>Event name</span>
            <input v-model="rename" required minlength="2" />
          </label>
          <button class="btn btn-ghost" type="submit" :disabled="busy">Save name</button>
        </form>
        <div class="row">
          <button type="button" class="btn btn-ghost" :disabled="busy" @click="toggleArchive">
            {{ event.tenantStatus === 'archived' ? 'Restore event' : 'Archive event' }}
          </button>
        </div>
      </section>

      <section v-if="event.role === 'owner'" class="block">
        <h2>Co-hosts</h2>
        <p class="lede">Invite another email as an admin for this event only.</p>
        <form class="form" @submit.prevent="onInviteCohost">
          <label class="field">
            <span>Email</span>
            <input v-model="cohostEmail" type="email" required placeholder="cohost@example.com" />
          </label>
          <button class="btn btn-primary" type="submit" :disabled="busy">Invite</button>
        </form>
      </section>

      <section class="block tips">
        <h2>How this works</h2>
        <ul>
          <li>Players use the event link — they never need the host panel.</li>
          <li>You manage teams, prompts, and Discord in Admin.</li>
          <li>Come back here for links, onboarding, and co-hosts.</li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.home {
  width: min(920px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1rem 0 4rem;
  display: grid;
  gap: 1.25rem;
}
.back {
  color: var(--muted);
  text-decoration: none;
}
.home__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: end;
}
.home__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
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
  display: grid;
  gap: 0.85rem;
}
.block h2,
.tips h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
}
.urls {
  display: grid;
  gap: 0.85rem;
}
.urls > div {
  display: grid;
  gap: 0.4rem;
  padding: 0.85rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.urls span {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.urls code,
.hint code,
.lede code {
  color: var(--accent);
  word-break: break-all;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.form {
  display: grid;
  gap: 0.75rem;
}
.field {
  display: grid;
  gap: 0.35rem;
}
.field span {
  font-size: 0.85rem;
  color: var(--muted);
}
.field input {
  padding: 0.7rem 0.85rem;
  border-radius: 0.65rem;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  color: var(--text);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}
.tips ul {
  margin: 0;
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
