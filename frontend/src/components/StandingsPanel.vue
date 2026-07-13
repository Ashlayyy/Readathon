<script setup lang="ts">
import type { TeamStanding } from '../lib/api'

defineProps<{
  standings: TeamStanding[]
  svg?: string | null
  publishedAt?: string | null
  title?: string
}>()

function memberLabel(count: number) {
  return count === 1 ? '1 member' : `${count} members`
}
</script>

<template>
  <section class="standings-panel card">
    <header v-if="!svg">
      <h2>{{ title ?? 'Realm Standings' }}</h2>
      <p v-if="publishedAt" class="published-at">
        Published {{ new Date(publishedAt).toLocaleString() }}
      </p>
    </header>
    <p v-else-if="publishedAt" class="published-at published-at-only">
      Published {{ new Date(publishedAt).toLocaleString() }}
    </p>

    <div v-if="svg" class="svg-wrap" v-html="svg" />

    <ol v-else class="standings-list">
      <li
        v-for="(team, i) in standings"
        :key="team.teamId"
        class="standing-row"
        :class="{ leader: i === 0 }"
        :style="{ '--team-color': team.color }"
      >
        <span class="rank">#{{ i + 1 }}</span>
        <span class="icon">{{ team.icon }}</span>
        <div class="info">
          <strong>{{ team.teamName }}<span v-if="i === 0" class="leader-mark"> ★</span></strong>
          <span v-if="team.memberCount > 0">{{ memberLabel(team.memberCount) }} · {{ team.averagePerMember }} avg/person · +{{ team.xpGained ?? 0 }} gain · +{{ team.xpDealt ?? 0 }} attack</span>
          <span v-else>No members assigned yet</span>
        </div>
        <div class="score">
          <strong>{{ team.totalTeamXp ?? 400 }}</strong>
          <small>team XP</small>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
header {
  margin-bottom: 1.25rem;
}

h2 {
  color: var(--realm-text);
  font-family: var(--font-display);
}

.published-at {
  color: var(--realm-text-muted);
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.published-at-only {
  margin: 0 0 1rem;
}

.svg-wrap {
  border-radius: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

.svg-wrap :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}

.standings-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.standing-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--realm-bg);
  border-radius: 8px;
  border-left: 3px solid var(--team-color);
}

.standing-row.leader {
  border-left-width: 4px;
  background: color-mix(in srgb, var(--team-color) 6%, var(--realm-bg));
}

.rank {
  color: var(--realm-text-muted);
  font-weight: 700;
  min-width: 2rem;
}

.icon {
  font-size: 1.25rem;
  color: var(--team-color);
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.info strong {
  color: var(--realm-text);
}

.leader-mark {
  color: var(--realm-accent-glow);
}

.info span {
  font-size: 0.8rem;
  color: var(--realm-text-muted);
  word-break: break-word;
  line-height: 1.4;
}

.avg-line {
  font-size: 0.75rem !important;
}

.score {
  text-align: right;
}

.score strong {
  display: block;
  color: var(--team-color);
  font-size: 1.25rem;
}

.score small {
  color: var(--realm-text-muted);
  font-size: 0.7rem;
}

@media (max-width: 600px) {
  .standing-row {
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .info {
    flex: 1 1 calc(100% - 4rem);
    min-width: 0;
  }

  .info span {
    font-size: 0.75rem;
  }

  .score {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-top: 0.35rem;
    border-top: 1px solid var(--realm-border);
  }

  .score strong {
    display: inline;
    font-size: 1.1rem;
  }

  .score small {
    display: inline;
    margin-left: 0.35rem;
  }
}
</style>
