<script setup lang="ts">
import { computed } from 'vue';
import type { StandingsBreakdown, MemberContribution } from '../lib/api';

const props = defineProps<{
	breakdown: StandingsBreakdown;
	/** @deprecated Prefer imageUrl */
	breakdownSvg?: string | null;
	imageUrl?: string | null;
	title?: string;
}>();

function sortMembers(members: MemberContribution[]) {
	return [...members].sort((a, b) => {
		const aTotal = a.xpGained + a.xpDealt;
		const bTotal = b.xpGained + b.xpDealt;
		if (bTotal !== aTotal) return bTotal - aTotal;
		if (b.xpDealt !== a.xpDealt) return b.xpDealt - a.xpDealt;
		if (b.xpGained !== a.xpGained) return b.xpGained - a.xpGained;
		return a.displayName.localeCompare(b.displayName);
	});
}

const teams = computed(() =>
	props.breakdown.teams.map((team) => ({
		...team,
		members: sortMembers(team.members),
		attacksFromOthers: [...team.attacksFromOthers].sort(
			(a, b) => b.damage - a.damage,
		),
	})),
);
</script>

<template>
	<section class="breakdown-panel card">
		<header v-if="!imageUrl && !breakdownSvg">
			<h2>{{ title ?? 'Score breakdown' }}</h2>
			<p class="lead">
				Who gained points and who dealt sabotage damage for each realm. Members are
				ranked by total activity (gained + dealt).
			</p>
		</header>

		<div v-if="imageUrl" class="img-wrap">
			<img
				:src="imageUrl"
				alt="Score breakdown chart"
				loading="lazy"
				decoding="async"
			/>
		</div>
		<div v-else-if="breakdownSvg" class="svg-wrap" v-html="breakdownSvg" />

		<div v-else class="team-breakdowns">
			<article
				v-for="team in teams"
				:key="team.teamId"
				class="team-block"
				:style="{ '--team-color': team.color }"
			>
				<header class="team-head">
					<span class="icon">{{ team.icon }}</span>
					<h3>{{ team.teamName }}</h3>
				</header>

				<div v-if="team.members.length === 0" class="empty">
					No members assigned yet.
				</div>
				<div v-else class="table-wrap">
					<table class="member-table">
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
								<td class="dealt">
									{{ m.xpDealt > 0 ? `−${m.xpDealt}` : '0' }}
								</td>
								<td class="meta">
									{{ m.addCount }} add · {{ m.sabotageCount }} atk
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div v-if="team.attacksFromOthers.length" class="attacks">
					<h4>Attacked by rivals</h4>
					<ul>
						<li v-for="(atk, i) in team.attacksFromOthers" :key="i">
							{{ atk.displayName }} ({{ atk.attackerTeamName }}) → −{{
								atk.damage
							}}
							points
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

.img-wrap,
.svg-wrap {
	border-radius: 8px;
	overflow-x: auto;
	max-width: 100%;
}

.img-wrap img {
	width: 100%;
	height: auto;
	display: block;
	border-radius: 8px;
	image-rendering: auto;
	-webkit-user-drag: none;
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
	border: 1px solid
		color-mix(in srgb, var(--team-color) 45%, var(--realm-border));
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

.table-wrap {
	overflow-x: auto;
	-webkit-overflow-scrolling: touch;
	max-width: 100%;
}

.member-table {
	width: 100%;
	min-width: 18rem;
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
