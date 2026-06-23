<script setup lang="ts">
import type { TeamConfig } from '../lib/api'

defineProps<{
  team: TeamConfig
  brand?: { name: string; color: string; accent: string; icon: string }
}>()
</script>

<template>
  <article class="team-card card" :style="{ '--team-color': brand?.color ?? '#888' }">
    <header>
      <span class="icon">{{ brand?.icon }}</span>
      <h3>{{ team.name }}</h3>
    </header>
    <p class="leads"><strong>Team Leads:</strong> {{ team.leads.join(', ') }}</p>
    <div class="bonus">
      <h4>Bonus Prompts <span class="badge badge-positive">±10 each</span></h4>
      <ul>
        <li v-for="p in team.bonusPrompts" :key="p.id">{{ p.label }}</li>
      </ul>
    </div>
  </article>
</template>

<style scoped>
.team-card {
  border-color: color-mix(in srgb, var(--team-color) 50%, var(--realm-border));
  background: linear-gradient(135deg, var(--realm-surface) 0%, color-mix(in srgb, var(--team-color) 8%, var(--realm-surface)) 100%);
}

header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.icon {
  font-size: 1.75rem;
  color: var(--team-color);
}

h3 {
  color: var(--realm-text);
  font-family: var(--font-display);
}

.leads {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.bonus h4 {
  color: var(--realm-text);
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bonus ul {
  list-style: none;
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

.bonus li::before {
  content: '◆ ';
  color: var(--team-color);
  font-size: 0.65rem;
}
</style>
