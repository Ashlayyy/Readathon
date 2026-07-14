<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import PromptCard from '../components/PromptCard.vue'

const { config, loadConfig } = useConfig()
const { t } = useCopy()
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

const tabLabel = computed(() => {
  if (!config.value) return 'prompt'
  const raw =
    tab.value === 'positive' ? config.value.copy.promptsAddTab : config.value.copy.promptsSabotageTab
  const label = t(raw).trim()
  return label ? label.toLowerCase() : 'prompt'
})
</script>

<template>
  <main v-if="config" class="page prompts-page">
    <header class="prompts-header">
      <h1 class="page-title">{{ config.copy.promptsPageTitle }}</h1>
      <p class="page-lead">{{ t(config.copy.promptsLead) }}</p>
    </header>

    <div class="toolbar card">
      <div class="tabs" role="tablist" aria-label="Prompt type">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'positive'"
          :class="{ active: tab === 'positive' }"
          @click="tab = 'positive'"
        >
          {{ config.copy.promptsAddTab }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'negative'"
          :class="{ active: tab === 'negative' }"
          @click="tab = 'negative'"
        >
          {{ config.copy.promptsSabotageTab }}
        </button>
      </div>

      <label class="search-wrap">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input
          v-model="search"
          type="search"
          :placeholder="String(config.copy.promptsSearchPlaceholder)"
        />
      </label>
    </div>

    <p class="results-meta">
      <span class="results-count">{{ prompts.length }} {{ tabLabel }} prompts</span>
    </p>

    <div v-if="prompts.length > 0" class="grid">
      <PromptCard v-for="p in prompts" :key="p.id" :prompt="p" :xp-tiers="config.promptXpTiers" />
    </div>
    <p v-else class="empty-search card">{{ config.copy.promptsEmpty }}</p>
  </main>
</template>

<style scoped>
.prompts-page {
  max-width: 72rem;
}

.prompts-header {
  margin-bottom: 1.5rem;
}

.prompts-header .page-lead {
  margin-bottom: 0;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 0.85rem;
  align-items: center;
  padding: 0.85rem;
}

.tabs {
  display: inline-flex;
  gap: 0.35rem;
  padding: 0.3rem;
  border-radius: calc(var(--radius) + 2px);
  background: var(--realm-bg);
  border: 1px solid var(--realm-border);
}

.tabs button {
  padding: 0.55rem 1rem;
  border-radius: var(--radius);
  border: 1px solid transparent;
  background: transparent;
  color: var(--realm-text-muted);
  cursor: pointer;
  font-weight: 700;
  font-family: var(--font-body);
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.tabs button.active {
  background: linear-gradient(135deg, var(--realm-accent), #a84030);
  border-color: rgba(255, 255, 255, 0.08);
  color: white;
  box-shadow: 0 4px 16px rgba(212, 99, 74, 0.28);
}

.search-wrap {
  flex: 1;
  min-width: 12rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0 0.85rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  background: var(--realm-bg);
}

.search-wrap:focus-within {
  border-color: color-mix(in srgb, var(--realm-accent) 55%, var(--realm-border));
  box-shadow: 0 0 0 3px rgba(212, 99, 74, 0.12);
}

.search-icon {
  color: var(--realm-text-muted);
  font-size: 1rem;
  line-height: 1;
}

.search-wrap input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding-left: 0;
  box-shadow: none;
}

.search-wrap input:focus {
  outline: none;
  box-shadow: none;
}

.results-meta {
  margin: 0 0 1rem;
  color: var(--realm-text-muted);
  font-size: 0.86rem;
}

.results-count {
  font-weight: 600;
}

.grid {
  display: grid;
  gap: 1rem;
  align-items: stretch;
}

.empty-search {
  text-align: center;
  color: var(--realm-text-muted);
  padding: 2.5rem 1rem;
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.1rem;
  }
}

@media (min-width: 1100px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
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

  .search-wrap {
    min-width: 0;
    width: 100%;
  }
}
</style>
