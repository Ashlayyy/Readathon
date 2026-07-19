<script setup lang="ts">
import { computed } from 'vue'
import type { Prompt, PromptXpTier } from '../lib/api'

const props = defineProps<{
  prompt: Prompt
  xpTiers?: PromptXpTier[]
}>()

const isPositive = computed(() => props.prompt.points > 0)

const xpTier = computed(() => {
  const absPoints = Math.abs(props.prompt.points)
  const tiers = props.xpTiers ?? []
  return tiers.find((tier) => tier.points === absPoints)
})

const cardStyle = computed(() => {
  const tier = xpTier.value
  if (!tier) {
    return {
      '--tier-color': isPositive.value ? 'var(--realm-success)' : 'var(--realm-accent-glow)',
      '--tier-glow': isPositive.value ? 'rgba(110, 207, 138, 0.12)' : 'rgba(212, 99, 74, 0.14)',
    }
  }

  return {
    '--tier-color': isPositive.value ? tier.gainColor : tier.attackColor,
    '--tier-glow': isPositive.value ? tier.gainGlow : tier.attackGlow,
  }
})

const pointLabel = computed(() => xpTier.value?.label ?? 'points')
</script>

<template>
  <article
    class="prompt-card"
    :class="isPositive ? 'kind-add' : 'kind-attack'"
    :style="cardStyle"
  >
    <div class="prompt-accent" aria-hidden="true" />

    <div class="prompt-top">
      <div class="point-badge" :title="`${isPositive ? '+' : ''}${prompt.points} points`">
        <span class="point-label">{{ pointLabel }}</span>
        <span class="point-value">{{ isPositive ? '+' : '' }}{{ prompt.points }}</span>
      </div>

      <div class="prompt-heading">
        <h3>{{ prompt.label }}</h3>
        <p class="game-name">{{ prompt.gameName }}</p>
      </div>
    </div>

    <p class="desc">{{ prompt.description }}</p>

    <a
      v-if="prompt.link"
      :href="prompt.link"
      target="_blank"
      rel="noopener"
      class="prompt-link"
    >
      Roll a die
      <span aria-hidden="true">↗</span>
    </a>
  </article>
</template>

<style scoped>
.prompt-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 100%;
  padding: 1.15rem 1.2rem 1.2rem;
  border-radius: 14px;
  border: 1px solid var(--realm-border);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.03), transparent 55%),
    var(--realm-surface);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.prompt-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--tier-color) 45%, var(--realm-border));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
}

.prompt-accent {
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, var(--tier-color), color-mix(in srgb, var(--tier-color) 20%, transparent));
}

.prompt-top {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  align-items: start;
  padding-left: 0.35rem;
}

.point-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 3.25rem;
  padding: 0.45rem 0.55rem;
  border-radius: 12px;
  background: var(--tier-glow);
  border: 1px solid color-mix(in srgb, var(--tier-color) 35%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.point-label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--realm-text-muted);
  line-height: 1;
  margin-bottom: 0.15rem;
  text-align: center;
}

.point-value {
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1;
  color: var(--tier-color);
}

.prompt-heading {
  min-width: 0;
}

h3 {
  margin: 0 0 0.35rem;
  color: var(--realm-text);
  font-family: var(--font-display);
  font-size: 1.02rem;
  line-height: 1.35;
  letter-spacing: 0.02em;
}

.game-name {
  display: inline-block;
  margin: 0;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(212, 99, 74, 0.1);
  border: 1px solid rgba(212, 99, 74, 0.22);
  color: var(--realm-accent-glow);
  font-size: 0.74rem;
  font-style: italic;
  font-weight: 600;
  line-height: 1.4;
}

.kind-attack .game-name {
  background: rgba(212, 99, 74, 0.14);
}

.desc {
  margin: 0;
  padding-left: 0.35rem;
  color: var(--realm-text-muted);
  font-size: 0.92rem;
  line-height: 1.65;
}

.prompt-link {
  align-self: flex-start;
  margin-left: 0.35rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(212, 99, 74, 0.35);
  background: rgba(212, 99, 74, 0.08);
  color: var(--realm-accent-glow);
  font-size: 0.82rem;
  font-weight: 700;
  min-height: 2.75rem;
  line-height: 1.2;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.prompt-link:hover {
  background: rgba(212, 99, 74, 0.16);
  border-color: rgba(212, 99, 74, 0.55);
  color: #ffc4ad;
}
</style>
