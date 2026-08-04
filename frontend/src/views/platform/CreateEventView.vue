<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api } from '../../lib/api'

const productName = import.meta.env.VITE_PRODUCT_NAME?.trim() || 'Product'
const router = useRouter()

const name = ref('')
const slug = ref('')
const error = ref('')
const loading = ref(false)

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

async function createEvent() {
  loading.value = true
  error.value = ''
  try {
    const data = await api<{
      tenant: { slug: string }
      adminPath: string
    }>('/platform/events', {
      method: 'POST',
      body: JSON.stringify({ name: name.value, slug: slug.value || slugify(name.value) }),
    })
    await router.push(`/e/${data.tenant.slug}/admin`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not create event'
  } finally {
    loading.value = false
  }
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
      <form class="create__form" @submit.prevent="createEvent">
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
        <p class="hint">Players can use /e/{{ slug || 'slug' }} or {{ slug || 'slug' }}.product.com</p>
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
.create__form button {
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
.err {
  color: #e08a7a;
}
</style>
