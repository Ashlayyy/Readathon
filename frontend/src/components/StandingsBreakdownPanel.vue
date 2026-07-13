<script setup lang="ts">
import type { StandingsBreakdown } from '../lib/api'

defineProps<{
  breakdown: StandingsBreakdown
  breakdownSvg?: string | null
  title?: string
}>()
</script>

<template>
  <section class="breakdown-panel card">
    <header v-if="!breakdownSvg">
      <h2>{{ title ?? 'Score breakdown' }}</h2>
      <p class="lead">Who gained XP and who dealt sabotage damage for each realm.</p>
    </header>

    <div v-if="breakdownSvg" class="svg-wrap" v-html="breakdownSvg" />

    <div v-else class="team-breakdowns">
      <article
        v-for="team in breakdown.teams"
        :key="team.teamId"
        class="team-block"
        :style="{ '--team-color': team.color }"
      >
        <header class="team-head">
          <span class="icon">{{ team.icon }}</span>
          <h3>{{ team.teamName }}</h3>
        </header>

        <div v-if="team.members.length === 0" class="empty">No members assigned yet.</div>
        <table v-else class="member-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Gained</th>
              <th>Dealt</th>
              <th>Books</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in team.members" :key="m.userId">
              <td>{{ m.displayName }}</td>
              <td class="gain">+{{ m.xpGained }}</td>
              <td class="dealt">{{ m.xpDealt > 0 ? `−${m.xpDealt}` : '0' }}</td>
              <td class="meta">{{ m.addCount }} add · {{ m.sabotageCount }} atk</td>
            </tr>
          </tbody>
        </table>

        <div v-if="team.attacksFromOthers.length" class="attacks">
          <h4>Attacked by rivals</h4>
          <ul>
            <li v-for="(atk, i) in team.attacksFromOthers" :key="i">
              {{ atk.displayName }} ({{ atk.attackerTeamName }}) — −{{ atk.damage }} XP
            </li>
          </ul>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.breakdown-panel {
  margin-top: 1.25rem;
}

header h2 {
  margin: 0 0 0.35rem;
  font-family: var(--font-display);
  color: var(--realm-text);
}

.lead {
  margin: 0 0 1rem;
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}

.svg-wrap {
  border-radius: 8px;
  overflow-x: auto;
  max-width: 100%;
}

.svg-wrap :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}

.team-breakdowns {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.team-block {
  padding: 1rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--team-color) 45%, var(--realm-border));
  background: var(--realm-bg);
}

.team-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.team-head .icon {
  font-size: 1.35rem;
  color: var(--team-color);
}

.team-head h3 {
  margin: 0;
  font-family: var(--font-display);
  color: var(--realm-text);
}

.empty {
  color: var(--realm-text-muted);
  font-style: italic;
  font-size: 0.9rem;
}

.member-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.member-table th,
.member-table td {
  padding: 0.45rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--realm-border);
}

.member-table th {
  color: var(--realm-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.gain {
  color: var(--realm-success);
  font-weight: 600;
}

.dealt {
  color: var(--realm-accent);
  font-weight: 600;
}

.meta {
  color: var(--realm-text-muted);
  font-size: 0.8rem;
}

.attacks {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--realm-border);
}

.attacks h4 {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  color: var(--realm-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.attacks ul {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--realm-accent-glow);
  font-size: 0.85rem;
}
</style>
