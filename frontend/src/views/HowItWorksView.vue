<script setup lang="ts">
import { onMounted } from 'vue'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'

const { config, loadConfig } = useConfig()
const { t } = useCopy()
onMounted(loadConfig)
</script>

<template>
  <main v-if="config" class="page">
    <h1 class="page-title">How It Works</h1>
    <p class="page-lead">{{ t(config.copy.howItWorksLead) }}</p>

    <ol class="steps">
      <li v-for="step in config.howItWorks" :key="step.step" class="step card">
        <span class="step-num">{{ step.step }}</span>
        <div>
          <h3>{{ step.title }}</h3>
          <p>{{ t(step.body) }}</p>
        </div>
      </li>
    </ol>

    <section class="card rules-box">
      <h2>Scoring at a Glance</h2>
      <ul>
        <li v-for="(rule, i) in config.copy.scoringSummary" :key="i">{{ t(rule) }}</li>
      </ul>

      <h3>Page Count Bonuses</h3>
      <table class="data-table">
        <thead>
          <tr><th>Pages</th><th>Bonus XP</th></tr>
        </thead>
        <tbody>
          <tr v-for="tier in config.pageCountBonuses" :key="tier.label">
            <td>{{ tier.label }}</td>
            <td>+{{ tier.points }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<style scoped>
.steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
  padding: 0;
}

.step {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}

.step-num {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--realm-accent), #a84030);
  color: white;
  border-radius: 50%;
  font-weight: 700;
  font-family: var(--font-display);
}

.step h3 {
  color: var(--realm-text);
  margin-bottom: 0.35rem;
  font-family: var(--font-display);
  font-size: 1.05rem;
}

.step p {
  color: var(--realm-text-muted);
  line-height: 1.6;
}

.rules-box h2,
.rules-box h3 {
  color: var(--realm-text);
  margin: 1.25rem 0 0.75rem;
  font-family: var(--font-display);
}

.rules-box h2:first-child {
  margin-top: 0;
}

.rules-box ul {
  color: var(--realm-text-muted);
  padding-left: 1.25rem;
  line-height: 1.9;
}

@media (max-width: 768px) {
  .step {
    flex-direction: column;
    gap: 0.75rem;
  }

  .step-num {
    width: 2.25rem;
    height: 2.25rem;
    font-size: 0.9rem;
  }
}
</style>
