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

    <div class="surface panel">
      <p class="eyebrow">New event</p>
      <h1>Create a readathon</h1>
      <p class="lede">
        Just a name and a short slug. Next you’ll get a setup checklist and shareable links.
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
        <div class="preview">
          <span>Players open</span>
          <code>{{ playerEventUrl(slug || 'your-slug') }}</code>
          <span class="preview__sub">optional {{ previewSub }} · path {{ previewPath }}</span>
        </div>
        <button class="btn btn-primary" type="submit" :disabled="loading">
          {{ loading ? 'Creating…' : 'Create event' }}
        </button>
        <p v-if="error" class="alert alert-err">{{ error }}</p>
      </form>
    </div>
  </main>
</template>

<style scoped>
.create {
  width: min(600px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1rem 0 4rem;
}
.back {
  display: inline-block;
  margin-bottom: 1.25rem;
  color: var(--muted);
  text-decoration: none;
}
.panel {
  box-shadow: var(--shadow);
}
h1 {
  margin: 0.45rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 2.7rem);
  letter-spacing: -0.03em;
}
.lede {
  margin: 0.65rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}
.form {
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
}
.preview {
  display: grid;
  gap: 0.3rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
  background: rgba(0, 0, 0, 0.2);
}
.preview span {
  color: var(--muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.preview code {
  color: var(--accent);
  word-break: break-all;
}
.preview__sub {
  text-transform: none !important;
  letter-spacing: 0 !important;
  font-size: 0.85rem !important;
}
</style>
