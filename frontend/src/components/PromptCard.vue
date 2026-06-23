<script setup lang="ts">
import type { Prompt } from '../lib/api'

defineProps<{ prompt: Prompt }>()
</script>

<template>
  <article class="prompt-card card">
    <header>
      <span class="badge" :class="prompt.points > 0 ? 'badge-positive' : 'badge-negative'">
        {{ prompt.points > 0 ? '+' : '' }}{{ prompt.points }}
      </span>
      <div>
        <h3>{{ prompt.label }}</h3>
        <p class="game-name">{{ prompt.gameName }}</p>
      </div>
    </header>
    <p class="desc">{{ prompt.description }}</p>
    <a v-if="prompt.link" :href="prompt.link" target="_blank" rel="noopener">Roll a die ↗</a>
  </article>
</template>

<style scoped>
header {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

h3 {
  color: var(--realm-text);
  font-size: 1rem;
}

.game-name {
  color: var(--realm-accent);
  font-size: 0.8rem;
  font-style: italic;
}

.desc {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

a {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  padding: 0.35rem 0;
  min-height: 2.75rem;
  line-height: 2rem;
}
</style>
