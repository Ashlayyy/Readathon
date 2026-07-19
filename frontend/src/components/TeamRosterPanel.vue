<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type RosterTeam } from '../lib/api'
import ReaderLink from './ReaderLink.vue'

const teams = ref<RosterTeam[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const data = await api<{ teams: RosterTeam[] }>('/roster')
    teams.value = data.teams
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load rosters'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="alert alert-info">Loading rosters…</div>
  <div v-else-if="error" class="alert alert-warning">{{ error }}</div>

  <div v-else class="roster-grid">
    <section
      v-for="team in teams"
      :key="team.id"
      class="roster-card card"
      :style="{ '--team-color': team.color }"
    >
      <header class="roster-header">
        <span class="icon">{{ team.icon }}</span>
        <div>
          <h2>{{ team.name }}</h2>
          <p class="member-count">
            {{ team.members.length }}
            {{ team.members.length === 1 ? 'member' : 'members' }}
          </p>
        </div>
      </header>
      <ul v-if="team.members.length" class="member-list">
        <li v-for="member in team.members" :key="member.id">
          <ReaderLink :id="member.id" :name="member.displayName" />
        </li>
      </ul>
      <p v-else class="empty-team">No members assigned yet.</p>
    </section>
  </div>
</template>

<style scoped>
.roster-grid {
  display: grid;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .roster-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.roster-card {
  border-color: color-mix(in srgb, var(--team-color) 45%, var(--realm-border));
  background: linear-gradient(
    135deg,
    var(--realm-surface) 0%,
    color-mix(in srgb, var(--team-color) 8%, var(--realm-surface)) 100%
  );
}

.roster-header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-bottom: 1rem;
}

.icon {
  font-size: 2rem;
  color: var(--team-color);
}

.roster-header h2 {
  font-family: var(--font-display);
  color: var(--realm-text);
  margin: 0;
  font-size: 1.25rem;
}

.member-count {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: var(--realm-text-muted);
}

.member-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.member-list li {
  padding: 0.45rem 0.65rem;
  background: var(--realm-bg);
  border-radius: var(--radius);
  color: var(--realm-text);
  font-weight: 500;
}

.empty-team {
  color: var(--realm-text-muted);
  font-style: italic;
  margin: 0;
}
</style>
