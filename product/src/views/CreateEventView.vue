<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { playerEventUrl, productApex } from '../lib/api'
import { useHostAuth } from '../composables/useHostAuth'

const router = useRouter()
const { createEvent, refresh } = useHostAuth()

const name = ref('')
const slug = ref('')
const loading = ref(false)
const error = ref('')

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

const previewPath = computed(() => `/e/${slug.value || 'your-slug'}`)
const previewSub = computed(() => `${slug.value || 'your-slug'}.${productApex()}`)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await createEvent(name.value, slug.value || slugify(name.value))
    await refresh(true)
    await router.push(`/host/e/${data.tenant.slug}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not create event'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="create">
    <RouterLink class="back" to="/host">← Host panel</RouterLink>

    <p class="eyebrow">New event</p>
    <h1>Create a readathon</h1>
    <p class="lede">
      Just a name and a short slug. Next you’ll get a setup checklist and shareable links.
      Preview: players use <code>{{ playerEventUrl(slug || 'your-slug') }}</code>.
    </p>

    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>Event name</span>
        <input
          v-model="name"
          required
          minlength="2"
          placeholder="Autumn Realm Cup"
          @input="slug = slugify(name)"
        />
      </label>
      <label class="field">
        <span>URL slug</span>
        <input
          v-model="slug"
          required
          pattern="[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?"
          placeholder="autumn-cup"
        />
      </label>
      <p class="hint">
        Players use <code>{{ previewPath }}</code>
        <span aria-hidden="true"> · </span>
        optional <code>{{ previewSub }}</code>
      </p>
      <button class="btn btn-primary" type="submit" :disabled="loading">
        {{ loading ? 'Creating…' : 'Create event' }}
      </button>
      <p v-if="error" class="alert alert-err">{{ error }}</p>
    </form>
  </main>
</template>

<style scoped>
.create {
  width: min(560px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1rem 0 4rem;
}
.back {
  display: inline-block;
  margin-bottom: 1.25rem;
  color: var(--muted);
  text-decoration: none;
}
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  color: var(--accent);
}
h1 {
  margin: 0.45rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 2.7rem);
}
.lede {
  margin: 0.65rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}
.lede code,
.hint code {
  color: var(--accent);
  word-break: break-all;
}
.form {
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.45;
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
</style>
