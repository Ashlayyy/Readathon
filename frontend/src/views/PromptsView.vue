<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useConfig } from '../composables/useConfig'
import PromptCard from '../components/PromptCard.vue'

const { config, loadConfig } = useConfig()
const tab = ref<'positive' | 'negative'>('positive')
const search = ref('')

onMounted(loadConfig)

const prompts = computed(() => {
  if (!config.value) return []
  const list = tab.value === 'positive' ? config.value.prompts.positive : config.value.prompts.negative
  const q = search.value.toLowerCase().trim()
  if (!q) return list
  return list.filter(
    (p) =>
      p.label.toLowerCase().includes(q) ||
      p.gameName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q),
  )
})
</script>

<template>
  <main v-if="config" class="page">
    <h1 class="page-title">Prompts</h1>
    <p class="page-lead">15 ways to add XP. 15 ways to sabotage. Pick up to 5 per book.</p>

    <div class="toolbar">
      <div class="tabs">
        <button :class="{ active: tab === 'positive' }" @click="tab = 'positive'">Add XP (+)</button>
        <button :class="{ active: tab === 'negative' }" @click="tab = 'negative'">Sabotage (-)</button>
      </div>
      <input v-model="search" type="search" placeholder="Search prompts…" />
    </div>

    <div class="grid">
      <PromptCard v-for="p in prompts" :key="p.id" :prompt="p" />
    </div>
  </main>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: center;
}

.tabs {
  display: flex;
  gap: 0.5rem;
}

.tabs button {
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  background: var(--realm-surface);
  color: var(--realm-text-muted);
  cursor: pointer;
  font-weight: 600;
  font-family: var(--font-body);
  transition: background 0.2s, border-color 0.2s;
}

.tabs button.active {
  background: var(--realm-accent);
  border-color: var(--realm-accent);
  color: white;
}

.toolbar input {
  flex: 1;
  min-width: 12rem;
}

.grid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .tabs {
    width: 100%;
  }

  .tabs button {
    flex: 1;
    min-height: 2.75rem;
    padding: 0.65rem 0.5rem;
    font-size: 0.85rem;
  }

  .toolbar input {
    min-width: 0;
    width: 100%;
  }
}
</style>
