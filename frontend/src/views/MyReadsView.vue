<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, type Submission } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'

const { user } = useAuth()
const { config, loadConfig, teamBrand } = useConfig()

const submissions = ref<Submission[]>([])
const loading = ref(true)

const totalImpact = computed(() =>
  submissions.value.reduce((sum, s) => sum + s.totalImpact, 0),
)

onMounted(async () => {
  await loadConfig()
  try {
    const data = await api<{ submissions: Submission[] }>('/submissions/mine')
    submissions.value = data.submissions
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="page">
    <header class="reads-header">
      <div>
        <h1 class="page-title">My Reads</h1>
        <p class="page-lead">Your submission history. These cannot be edited — double-check before submitting.</p>
      </div>
      <div v-if="user?.teamId && config" class="team-pill" :style="{ '--c': teamBrand(user.teamId)?.color }">
        {{ teamBrand(user.teamId)?.icon }} {{ teamBrand(user.teamId)?.name }}
      </div>
    </header>

    <div v-if="!loading && submissions.length" class="stats-row">
      <div class="stat-card card">
        <span class="stat-value">{{ submissions.length }}</span>
        <span class="stat-label">Books submitted</span>
      </div>
      <div class="stat-card card">
        <span class="stat-value">{{ totalImpact > 0 ? '+' : '' }}{{ totalImpact }}</span>
        <span class="stat-label">Total XP impact</span>
      </div>
    </div>

    <div v-if="loading" class="alert alert-info">Loading your reads…</div>
    <div v-else-if="submissions.length === 0" class="card empty-state">
      <p>No submissions yet.</p>
      <RouterLink to="/submit" class="btn btn-primary">Submit your first book</RouterLink>
    </div>

    <ul v-else class="reads-list">
      <li v-for="sub in submissions" :key="sub.id" class="read-card card">
        <div class="read-header">
          <div>
            <h3>{{ sub.bookTitle }}</h3>
            <p class="author">by {{ sub.bookAuthor }} · {{ sub.pageCount }} pages · {{ sub.format }}</p>
          </div>
          <span class="badge" :class="sub.submissionType === 'add' ? 'badge-positive' : 'badge-negative'">
            {{ sub.submissionType === 'add' ? 'Add XP' : 'Sabotage' }}
          </span>
        </div>

        <div class="scores">
          <div class="score-item">
            <span class="label">Prompts</span>
            <span class="value">{{ sub.promptPoints > 0 ? '+' : '' }}{{ sub.promptPoints }}</span>
          </div>
          <div class="score-item">
            <span class="label">Page bonus</span>
            <span class="value">+{{ sub.pageBonus }}</span>
          </div>
          <div v-if="sub.bonusPoints" class="score-item">
            <span class="label">Bonuses</span>
            <span class="value">{{ sub.bonusPoints > 0 ? '+' : '' }}{{ sub.bonusPoints }}</span>
          </div>
          <div class="score-item total">
            <span class="label">Total</span>
            <span class="value">{{ sub.totalImpact > 0 ? '+' : '' }}{{ sub.totalImpact }}</span>
          </div>
        </div>

        <p v-if="sub.targetTeamId && config" class="target">
          Attacked {{ config.branding.teams[sub.targetTeamId]?.name }}
        </p>
        <p class="dates">Read {{ sub.startedAt }} → {{ sub.finishedAt }}</p>
        <time>Submitted {{ new Date(sub.createdAt).toLocaleString() }}</time>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.reads-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.team-pill {
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c) 50%, var(--realm-border));
  background: color-mix(in srgb, var(--c) 12%, var(--realm-surface));
  color: var(--c);
  font-weight: 600;
  font-size: 0.9rem;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  text-align: center;
  padding: 1rem;
}

.stat-value {
  display: block;
  font-family: var(--font-display);
  font-size: 1.75rem;
  color: var(--realm-accent-glow);
  font-weight: 700;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--realm-text-muted);
}

.empty-state {
  text-align: center;
  padding: 2.5rem;
}

.empty-state p {
  margin-bottom: 1rem;
  color: var(--realm-text-muted);
}

.reads-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
  margin: 0;
}

.read-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.read-header h3 {
  color: var(--realm-text);
  font-family: var(--font-display);
  font-size: 1.1rem;
}

.author {
  color: var(--realm-text-muted);
  font-size: 0.88rem;
  margin-top: 0.2rem;
}

.scores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--realm-bg);
  border-radius: var(--radius);
}

.score-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.score-item .label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--realm-text-muted);
}

.score-item .value {
  font-weight: 700;
  color: var(--realm-text);
}

.score-item.total .value {
  color: var(--realm-accent-glow);
}

.target {
  font-size: 0.85rem;
  color: var(--realm-accent);
  margin-bottom: 0.25rem;
}

.dates {
  font-size: 0.82rem;
  color: var(--realm-text-muted);
  margin-bottom: 0.25rem;
}

time {
  font-size: 0.75rem;
  color: var(--realm-text-muted);
  opacity: 0.7;
}
</style>
