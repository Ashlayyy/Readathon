<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { TenantUnavailable } from '../composables/useConfig'
import { useConfig } from '../composables/useConfig'
import { useTenant } from '../composables/useTenant'

const props = defineProps<{
  unavailable: TenantUnavailable
}>()

const router = useRouter()
const { loadConfig } = useConfig()
const { syncFromRoutePath } = useTenant()

const productUrl = (
  (import.meta.env.VITE_PRODUCT_URL as string | undefined)?.trim() ||
  'http://localhost:5174'
).replace(/\/+$/, '')

const title = computed(() => {
  if (props.unavailable.reason === 'archived') return 'Event ended'
  if (props.unavailable.reason === 'suspended') return 'Event paused'
  return 'Event not found'
})

const body = computed(() => {
  if (props.unavailable.reason === 'archived') {
    return 'This readathon is no longer active. The link may be from a past season.'
  }
  if (props.unavailable.reason === 'suspended') {
    return 'This event is temporarily unavailable. Check back later or ask the host.'
  }
  return 'There’s no active readathon at this link. Double-check the URL, or open The Crucible instead.'
})

async function goCrucible() {
  syncFromRoutePath('/')
  await router.push('/')
  await loadConfig(true)
}
</script>

<template>
  <main class="unavailable">
    <p class="eyebrow">{{ unavailable.slug }}</p>
    <h1>{{ title }}</h1>
    <p class="lede">{{ body }}</p>
    <p class="msg">{{ unavailable.message }}</p>
    <div class="actions">
      <button type="button" class="btn btn-primary" @click="goCrucible">
        Go to The Crucible
      </button>
      <a class="btn btn-secondary" :href="`${productUrl}/host`">Host panel</a>
    </div>
  </main>
</template>

<style scoped>
.unavailable {
  width: min(36rem, 100%);
  margin: 3rem auto 4rem;
  padding: 2rem 1.5rem;
  text-align: center;
  border: 1px solid var(--realm-border);
  border-radius: 18px;
  background:
    radial-gradient(
      circle at 50% 0%,
      color-mix(in srgb, var(--realm-accent) 14%, transparent),
      transparent 55%
    ),
    color-mix(in srgb, var(--realm-surface) 92%, transparent);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}

.eyebrow {
  margin: 0;
  font-family: ui-monospace, 'Cascadia Code', Menlo, monospace;
  font-size: 0.85rem;
  color: var(--realm-text-muted);
}

h1 {
  margin: 0.65rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  color: var(--realm-text);
}

.lede {
  margin: 0.85rem 0 0;
  color: var(--realm-text-muted);
  line-height: 1.55;
}

.msg {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  color: var(--realm-accent-glow);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  justify-content: center;
  margin-top: 1.75rem;
}
</style>
