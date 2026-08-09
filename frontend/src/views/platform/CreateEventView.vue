<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../../lib/api'

const productName = import.meta.env.VITE_PRODUCT_NAME?.trim() || 'Product'
const productApex = import.meta.env.VITE_PRODUCT_APEX?.trim() || 'product.com'
const router = useRouter()

const name = ref('')
const slug = ref('')
const error = ref('')
const loading = ref(false)
const created = ref<{
  slug: string
  name: string
  pathUrl: string
  subdomainUrl: string
  adminPath: string
} | null>(null)
const copied = ref('')

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

const previewPath = computed(() => `/e/${slug.value || 'slug'}`)
const previewSub = computed(() => `${slug.value || 'slug'}.${productApex}`)

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = label
    setTimeout(() => {
      if (copied.value === label) copied.value = ''
    }, 2000)
  } catch {
    error.value = 'Could not copy — select the URL manually.'
  }
}

async function createEvent() {
  loading.value = true
  error.value = ''
  created.value = null
  try {
    const data = await api<{
      tenant: { slug: string; name: string }
      pathUrl: string
      subdomainUrl: string
      adminPath: string
    }>('/platform/events', {
      method: 'POST',
      body: JSON.stringify({ name: name.value, slug: slug.value || slugify(name.value) }),
    })
    created.value = {
      slug: data.tenant.slug,
      name: data.tenant.name,
      pathUrl: data.pathUrl,
      subdomainUrl: data.subdomainUrl,
      adminPath: data.adminPath || `/e/${data.tenant.slug}/admin`,
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not create event'
  } finally {
    loading.value = false
  }
}

function goAdmin() {
  if (!created.value) return
  void router.push(created.value.adminPath)
}
</script>

<template>
  <div class="create">
    <header class="create__bar">
      <RouterLink to="/">{{ productName }}</RouterLink>
      <RouterLink to="/host">Back to console</RouterLink>
    </header>
    <main class="create__main">
      <h1>Create a readathon</h1>
      <p class="lede">You’ll get a path URL and a subdomain on the product apex.</p>

      <section v-if="created" class="create__done">
        <h2>{{ created.name }} is ready</h2>
        <p class="lede">Share these with players. Sign-in pages show this event name so nobody joins the wrong realm.</p>
        <div class="create__urls">
          <div class="create__url">
            <span>Path URL</span>
            <code>{{ created.pathUrl }}</code>
            <button type="button" @click="copyText('path', created.pathUrl)">
              {{ copied === 'path' ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <div class="create__url">
            <span>Subdomain</span>
            <code>{{ created.subdomainUrl }}</code>
            <button type="button" @click="copyText('sub', created.subdomainUrl)">
              {{ copied === 'sub' ? 'Copied' : 'Copy' }}
            </button>
          </div>
        </div>
        <p class="hint">Subdomains need wildcard DNS for *.{{ productApex }}. Path URLs work immediately.</p>
        <div class="create__actions">
          <button type="button" class="primary" @click="goAdmin">Open admin</button>
          <RouterLink class="ghost" to="/host">Back to console</RouterLink>
        </div>
      </section>

      <form v-else class="create__form" @submit.prevent="createEvent">
        <label>
          Event name
          <input
            v-model="name"
            required
            minlength="2"
            placeholder="Autumn Realm Cup"
            @input="slug = slugify(name)"
          />
        </label>
        <label>
          URL slug
          <input v-model="slug" required pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]" placeholder="autumn-cup" />
        </label>
        <p class="hint">
          Players can use <code>{{ previewPath }}</code> or <code>{{ previewSub }}</code>
        </p>
        <button type="submit" :disabled="loading">
          {{ loading ? 'Creating…' : 'Create event' }}
        </button>
        <p v-if="error" class="err">{{ error }}</p>
      </form>
    </main>
  </div>
</template>

<style scoped>
.create {
  min-height: 100vh;
  background: linear-gradient(165deg, #0f1412, #1a2420);
  color: #f2ebe3;
  font-family: 'Segoe UI', system-ui, sans-serif;
}
.create__bar {
  display: flex;
  justify-content: space-between;
  max-width: 560px;
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
}
.create__bar a {
  color: #c9c0b4;
  text-decoration: none;
}
.create__main {
  max-width: 560px;
  margin: 0 auto;
  padding: 1rem 1.5rem 3rem;
}
.lede {
  color: #9a948a;
}
.create__form {
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
}
.create__form label {
  display: grid;
  gap: 0.35rem;
}
.create__form input {
  padding: 0.6rem 0.75rem;
  border-radius: 4px;
  border: 1px solid rgba(242, 235, 227, 0.2);
  background: #0f1412;
  color: #f2ebe3;
}
.create__form button,
.create__actions .primary {
  width: fit-content;
  padding: 0.7rem 1.1rem;
  background: #d4a574;
  color: #1a1410;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
}
.hint {
  font-size: 0.85rem;
  color: #9a948a;
  margin: 0;
}
.hint code {
  color: #f2ebe3;
}
.err {
  color: #e08a7a;
}
.create__done {
  margin-top: 1.25rem;
  padding: 1.25rem;
  border: 1px solid rgba(242, 235, 227, 0.14);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
}
.create__done h2 {
  margin: 0 0 0.5rem;
}
.create__urls {
  display: grid;
  gap: 0.75rem;
  margin: 1rem 0;
}
.create__url {
  display: grid;
  gap: 0.35rem;
}
.create__url span {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9a948a;
}
.create__url code {
  word-break: break-all;
  font-size: 0.9rem;
  color: #d4a574;
}
.create__url button {
  width: fit-content;
  padding: 0.35rem 0.7rem;
  border-radius: 4px;
  border: 1px solid rgba(242, 235, 227, 0.25);
  background: transparent;
  color: #f2ebe3;
  cursor: pointer;
}
.create__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1rem;
}
.create__actions .ghost {
  color: #c9c0b4;
  text-decoration: none;
}
</style>
