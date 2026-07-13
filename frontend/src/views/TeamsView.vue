<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import TeamCard from '../components/TeamCard.vue'
import TeamRosterPanel from '../components/TeamRosterPanel.vue'

type Tab = 'realms' | 'rosters'

const route = useRoute()
const router = useRouter()
const { config, loadConfig } = useConfig()
const { t } = useCopy()

const showRosters = computed(() => Boolean(config.value?.site?.showTeamRosters))

function tabFromQuery(): Tab {
  if (route.query.tab === 'rosters' && showRosters.value) return 'rosters'
  return 'realms'
}

const activeTab = ref<Tab>('realms')

function setTab(tab: Tab) {
  activeTab.value = tab
  router.replace({ query: tab === 'realms' ? {} : { tab } })
}

onMounted(async () => {
  await loadConfig()
  activeTab.value = tabFromQuery()
})

watch(() => route.query.tab, () => {
  activeTab.value = tabFromQuery()
})

watch(showRosters, (visible) => {
  if (!visible && activeTab.value === 'rosters') setTab('realms')
})
</script>

<template>
  <main v-if="config" class="page">
    <h1 class="page-title">{{ config.copy.teamsPageTitle }}</h1>
    <p class="page-lead">{{ t(config.copy.teamsPageLead) }}</p>

    <nav v-if="showRosters" class="page-tabs" aria-label="Teams sections">
      <button type="button" :class="{ active: activeTab === 'realms' }" @click="setTab('realms')">
        {{ config.copy.nav.teamsTab ?? config.copy.nav.teams }}
      </button>
      <button type="button" :class="{ active: activeTab === 'rosters' }" @click="setTab('rosters')">
        {{ config.copy.nav.rostersTab ?? config.copy.nav.rosters }}
      </button>
    </nav>

    <div v-if="activeTab === 'realms'" class="grid">
      <TeamCard v-for="team in config.teams" :key="team.id" :team="team" />
    </div>

    <section v-else-if="showRosters" class="rosters-section">
      <p class="roster-lead">{{ t(String(config.copy.rosterPageLead)) }}</p>
      <TeamRosterPanel />
    </section>
  </main>
</template>

<style scoped>
.page-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.page-tabs button {
  padding: 0.55rem 1rem;
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
  background: var(--realm-surface);
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    background 0.2s;
}

.page-tabs button:hover {
  color: var(--realm-text);
  border-color: var(--realm-accent);
}

.page-tabs button.active {
  color: var(--realm-accent-glow);
  border-color: var(--realm-accent);
  background: rgba(212, 99, 74, 0.1);
}

.grid {
  display: grid;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.rosters-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.roster-lead {
  margin: 0;
  color: var(--realm-text-muted);
}
</style>
