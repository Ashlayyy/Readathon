<script setup lang="ts">
import { onMounted } from 'vue'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import TeamCard from '../components/TeamCard.vue'

const { config, loadConfig } = useConfig()
const { t } = useCopy()
onMounted(loadConfig)
</script>

<template>
  <main v-if="config" class="page">
    <h1 class="page-title">{{ config.copy.teamsPageTitle }}</h1>
    <p class="page-lead">{{ t(config.copy.teamsPageLead) }}</p>
    <div class="grid">
      <TeamCard v-for="team in config.teams" :key="team.id" :team="team" />
    </div>
  </main>
</template>

<style scoped>
.grid {
  display: grid;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
