<script setup lang="ts">
import type { TeamStanding } from '../lib/api'

defineProps<{
  standings: TeamStanding[]
  /** @deprecated Prefer imageUrl — inline SVG bloats DOM/payload */
  svg?: string | null
  imageUrl?: string | null
  publishedAt?: string | null
  title?: string
}>()

function memberLabel(count: number) {
  return count === 1 ? '1 member' : `${count} members`
}

function standingsDetailLine(team: TeamStanding, index: number, standings: TeamStanding[]) {
  const activity = `+${team.xpGained ?? 0} gain · +${team.xpDealt ?? 0} attack`
  if (team.memberCount <= 0) return ''

  const members = memberLabel(team.memberCount)
  if (standings.length < 2) return `${members} · ${activity}`

  const leader = standings[0]!
  if (index === 0) {
    const gap = leader.totalTeamXp - standings[1]!.totalTeamXp
    return `${members} · ${gap} points ahead · ${activity}`
  }

  const gap = leader.totalTeamXp - team.totalTeamXp
  return `${members} · ${gap} points behind leader · ${activity}`
}
</script>

<template>
  <section class="standings-panel card">
    <header v-if="!imageUrl && !svg">
      <h2>{{ title ?? 'Realm Standings' }}</h2>
      <p v-if="publishedAt" class="published-at">
        Published {{ new Date(publishedAt).toLocaleString() }}
      </p>
    </header>
    <p v-else-if="publishedAt" class="published-at published-at-only">
      Published {{ new Date(publishedAt).toLocaleString() }}
    </p>

    <div v-if="imageUrl" class="img-wrap">
      <img :src="imageUrl" alt="Realm standings chart" loading="lazy" decoding="async" />
    </div>
    <div v-else-if="svg" class="svg-wrap" v-html="svg" />

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
          <span v-if="team.memberCount > 0">{{ standingsDetailLine(team, i, standings) }}</span>
          <span v-else>No members assigned yet</span>
        </div>
        <div class="score">
          <strong>{{ team.totalTeamXp ?? 100 }}</strong>
          <small>team points</small>
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

.img-wrap,
.svg-wrap {
  border-radius: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

.img-wrap img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  /* Avoid browser “helpfully” smoothing vector/bitmaps when scaled */
  image-rendering: auto;
  -webkit-user-drag: none;
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
  background: color-mix(in srgb, var(--team-color) 12%, var(--realm-bg));
}

.rank {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--realm-text-muted);
  min-width: 2rem;
}

.icon {
  font-size: 1.4rem;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.info strong {
  color: var(--realm-text);
}

.info span {
  font-size: 0.85rem;
  color: var(--realm-text-muted);
}

.leader-mark {
  color: var(--realm-accent);
}

.score {
  text-align: right;
  flex-shrink: 0;
}

.score strong {
  display: block;
  font-size: 1.25rem;
  color: var(--realm-text);
  font-family: var(--font-display);
}

.score small {
  color: var(--realm-text-muted);
  font-size: 0.75rem;
}
</style>
