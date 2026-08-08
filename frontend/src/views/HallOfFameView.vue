<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../lib/api'
import { useConfig } from '../composables/useConfig'

type FameEntry = {
  userId: string
  displayName: string
  teamId: string | null
  teamName: string | null
  teamColor: string | null
  value: number
  detail?: string
}

type HallOfFame = {
  mostBooks: FameEntry[]
  mostPages: FameEntry[]
  mostSabotageDealt: FameEntry[]
  generatedAt: string
}

const { config, loadConfig } = useConfig()
const fame = ref<HallOfFame | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  await loadConfig()
  try {
    const data = await api<{ fame: HallOfFame }>('/hall-of-fame')
    fame.value = data.fame
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load hall of fame'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main v-if="config" class="page hof-page">
    <header class="hof-header">
      <h1 class="page-title">Hall of Fame</h1>
      <p class="page-lead">Season leaders across every realm — books, pages, and sabotage.</p>
    </header>

    <div v-if="loading" class="page-state">
      <div class="page-spinner" role="status" aria-label="Loading" />
      <p>Loading hall of fame…</p>
    </div>
    <div v-else-if="error" class="alert alert-error card">
      <p>{{ error }}</p>
    </div>
    <template v-else-if="fame">
      <div class="hof-grid">
        <section class="hof-card card">
          <h2>Most books</h2>
          <ol v-if="fame.mostBooks.length">
            <li v-for="(e, i) in fame.mostBooks" :key="e.userId">
              <span class="rank">#{{ i + 1 }}</span>
              <RouterLink :to="`/readers/${e.userId}`" class="name">{{ e.displayName }}</RouterLink>
              <span
                v-if="e.teamName"
                class="team"
                :style="e.teamColor ? { color: e.teamColor } : undefined"
                >{{ e.teamName }}</span
              >
              <span class="value">{{ e.detail ?? e.value }}</span>
            </li>
          </ol>
          <p v-else class="empty">No books logged yet.</p>
        </section>

        <section class="hof-card card">
          <h2>Most pages</h2>
          <ol v-if="fame.mostPages.length">
            <li v-for="(e, i) in fame.mostPages" :key="e.userId">
              <span class="rank">#{{ i + 1 }}</span>
              <RouterLink :to="`/readers/${e.userId}`" class="name">{{ e.displayName }}</RouterLink>
              <span
                v-if="e.teamName"
                class="team"
                :style="e.teamColor ? { color: e.teamColor } : undefined"
                >{{ e.teamName }}</span
              >
              <span class="value">{{ e.detail ?? e.value }}</span>
            </li>
          </ol>
          <p v-else class="empty">No pages logged yet.</p>
        </section>

        <section class="hof-card card">
          <h2>Most sabotage</h2>
          <ol v-if="fame.mostSabotageDealt.length">
            <li v-for="(e, i) in fame.mostSabotageDealt" :key="e.userId">
              <span class="rank">#{{ i + 1 }}</span>
              <RouterLink :to="`/readers/${e.userId}`" class="name">{{ e.displayName }}</RouterLink>
              <span
                v-if="e.teamName"
                class="team"
                :style="e.teamColor ? { color: e.teamColor } : undefined"
                >{{ e.teamName }}</span
              >
              <span class="value">{{ e.detail ?? e.value }}</span>
            </li>
          </ol>
          <p v-else class="empty">No sabotage logged yet.</p>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.hof-header {
  margin-bottom: 1.5rem;
}

.hof-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
}

.hof-card h2 {
  margin: 0 0 0.85rem;
  font-family: var(--font-display);
  font-size: 1.15rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hof-card ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.hof-card li {
  display: grid;
  grid-template-columns: 2rem 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 0.5rem;
  row-gap: 0.1rem;
  align-items: baseline;
  padding: 0.45rem 0.35rem;
  border-bottom: 1px solid color-mix(in srgb, var(--realm-border) 70%, transparent);
}

.rank {
  grid-row: 1 / 3;
  font-weight: 700;
  color: var(--realm-accent);
}

.name {
  color: var(--realm-text);
  font-weight: 600;
  text-decoration: none;
}

.name:hover,
.name:focus-visible {
  color: var(--realm-accent-glow);
  outline: none;
}

.team {
  grid-column: 2;
  font-size: 0.78rem;
  color: var(--realm-text-muted);
}

.value {
  grid-row: 1 / 3;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--realm-text-muted);
  font-size: 0.85rem;
}

.empty {
  margin: 0;
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}
</style>
