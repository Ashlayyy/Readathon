<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type ShelfBook } from '../lib/api'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import BookCover from '../components/BookCover.vue'

const { config, loadConfig } = useConfig()
const { t } = useCopy()

const books = ref<ShelfBook[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  await loadConfig()
  await loadShelf()
})

async function loadShelf() {
  loading.value = true
  error.value = ''
  try {
    const data = await api<{ shelf: ShelfBook[] }>('/shelf')
    books.value = data.shelf
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the shelf'
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <main v-if="config" class="page shelf-page">
    <h1 class="page-title">{{ config.copy.shelfPageTitle }}</h1>
    <p class="page-lead">{{ t(config.copy.shelfPageLead, { count: 20 }) }}</p>

    <div v-if="loading" class="alert alert-info">Loading shelf…</div>
    <div v-else-if="error" class="alert alert-error">{{ error }}</div>

    <div v-else-if="books.length === 0" class="card empty-state">
      <p>{{ config.copy.shelfEmpty }}</p>
    </div>

    <ul v-else class="shelf-grid">
      <li
        v-for="(book, i) in books"
        :key="`${book.title}-${i}`"
        class="shelf-card card"
        :style="{ '--c': book.realmColor ?? 'var(--realm-border)' }"
      >
        <BookCover
          :title="book.title"
          :author="book.author"
          :cover-url="book.coverUrl"
          size="md"
        />
        <div class="shelf-body">
          <h3 class="shelf-title">{{ book.title }}</h3>
          <p v-if="book.author" class="shelf-author">by {{ book.author }}</p>
          <div class="shelf-footer">
            <span class="realm-pill">{{ book.realmName ?? config.copy.shelfUnknownRealm }}</span>
            <time>{{ formatDate(book.finishedAt) }}</time>
          </div>
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.shelf-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 1rem;
  padding: 0;
  margin: 0;
}

.shelf-card {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 0.85rem;
  border-top: 3px solid var(--c);
}

.shelf-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}

.shelf-title {
  font-family: var(--font-display);
  color: var(--realm-text);
  font-size: 1.05rem;
  line-height: 1.35;
}

.shelf-author {
  color: var(--realm-text-muted);
  font-size: 0.88rem;
}

.shelf-footer {
  margin-top: auto;
  padding-top: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.realm-pill {
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c) 50%, var(--realm-border));
  background: color-mix(in srgb, var(--c) 12%, var(--realm-surface));
  color: var(--c);
  font-weight: 600;
  font-size: 0.75rem;
  white-space: nowrap;
}

.shelf-footer time {
  font-size: 0.75rem;
  color: var(--realm-text-muted);
}

.empty-state {
  text-align: center;
  padding: 2.5rem;
}

.empty-state p {
  color: var(--realm-text-muted);
}
</style>
