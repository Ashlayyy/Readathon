<script setup lang="ts">
import { onMounted } from 'vue'
import { useConfig } from '../composables/useConfig'
import TeamCard from '../components/TeamCard.vue'

const { config, loadConfig } = useConfig()
onMounted(loadConfig)
</script>

<template>
  <main v-if="config" class="page">
    <h1 class="page-title">The Four Realms</h1>
    <p class="page-lead">
      Once accepted, you'll be randomly sorted into one of these character classes. Each realm has
      optional bonus prompts worth ±10 XP.
    </p>
    <div class="grid">
      <TeamCard
        v-for="team in config.teams"
        :key="team.id"
        :team="team"
        :brand="config.branding.teams[team.id]"
      />
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
