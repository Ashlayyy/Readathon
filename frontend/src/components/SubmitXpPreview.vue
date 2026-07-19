<script setup lang="ts">
import { computed } from 'vue';
import type { TeamConfig } from '../lib/api';

export type XpLine = {
	label: string;
	value: number;
	tone: 'gain' | 'attack' | 'neutral';
};

const props = defineProps<{
	submissionType: 'add' | 'sabotage' | null;
	userTeam?: TeamConfig;
	targetTeam?: TeamConfig;
	promptPoints: number;
	bonusPoints: number;
	pageBonus: number;
	compact?: boolean;
}>();

const promptAndBonus = computed(() => props.promptPoints + props.bonusPoints);

const yourTeamGain = computed(() => {
	if (!props.submissionType) return 0;
	if (props.submissionType === 'add')
		return promptAndBonus.value + props.pageBonus;
	return props.pageBonus;
});

const targetDamage = computed(() => {
	if (props.submissionType !== 'sabotage') return 0;
	return Math.abs(promptAndBonus.value);
});

const lines = computed((): XpLine[] => {
	const rows: XpLine[] = [];

	if (props.submissionType && props.promptPoints !== 0) {
		rows.push({
			label: 'Prompts',
			value: props.promptPoints,
			tone: props.submissionType === 'add' ? 'gain' : 'attack',
		});
	}

	if (props.submissionType && props.bonusPoints !== 0) {
		rows.push({
			label: 'Bonuses',
			value: props.bonusPoints,
			tone: props.submissionType === 'add' ? 'gain' : 'attack',
		});
	}

	if (props.pageBonus > 0) {
		rows.push({
			label: props.submissionType
				? 'Page bonus (your realm)'
				: 'Page bonus for your realm',
			value: props.pageBonus,
			tone: 'gain',
		});
	}

	return rows;
});

function formatSigned(value: number): string {
	return value > 0 ? `+${value}` : `${value}`;
}
</script>

<template>
	<aside
		v-if="submissionType || pageBonus > 0"
		class="xp-preview-panel"
		:class="{ compact }"
	>
		<header class="xp-preview-header">
			<span class="xp-preview-kicker">XP preview</span>
			<h3 class="xp-preview-title">
				<template v-if="!submissionType">Page bonus only</template>
				<template v-else-if="submissionType === 'add'"
					>Adding to your realm</template
				>
				<template v-else>Attacking a rival</template>
			</h3>
		</header>

		<ul v-if="lines.length" class="xp-lines">
			<li v-for="(line, i) in lines" :key="i" class="xp-line">
				<span class="xp-line-label">{{ line.label }}</span>
				<span class="xp-line-value" :class="line.tone"
					>{{ formatSigned(line.value) }} XP</span
				>
			</li>
		</ul>

		<div v-if="submissionType" class="xp-totals">
			<div v-if="submissionType === 'add'" class="xp-total-card gain">
				<span class="xp-total-label">{{ userTeam?.name ?? 'Your realm' }}</span>
				<strong class="xp-total-value">+{{ yourTeamGain }} XP</strong>
				<span class="xp-total-sub">Total gain for your team</span>
			</div>

			<template v-else>
				<div v-if="targetTeam" class="xp-total-card attack">
					<span class="xp-total-label">{{ targetTeam.name }}</span>
					<strong class="xp-total-value">−{{ targetDamage }} XP</strong>
					<span class="xp-total-sub">Damage dealt to rival</span>
				</div>
				<div v-if="pageBonus > 0" class="xp-total-card gain secondary">
					<span class="xp-total-label">{{
						userTeam?.name ?? 'Your realm'
					}}</span>
					<strong class="xp-total-value">+{{ pageBonus }} XP</strong>
					<span class="xp-total-sub">Page bonus still goes to you</span>
				</div>
			</template>
		</div>

		<div v-else-if="pageBonus > 0" class="xp-totals">
			<div class="xp-total-card gain">
				<span class="xp-total-label">{{ userTeam?.name ?? 'Your realm' }}</span>
				<strong class="xp-total-value">+{{ pageBonus }} XP</strong>
				<span class="xp-total-sub"
					>From page count - stacks with prompts later</span
				>
			</div>
		</div>
	</aside>
</template>

<style scoped>
.xp-preview-panel {
	margin-top: 1.25rem;
	padding: 1rem 1.1rem;
	border-radius: 14px;
	border: 1px solid
		color-mix(in srgb, var(--realm-accent) 28%, var(--realm-border));
	background:
		linear-gradient(145deg, rgba(212, 99, 74, 0.08), transparent 55%),
		var(--realm-bg);
}

.xp-preview-panel.compact {
	margin-top: 0;
}

.xp-preview-kicker {
	display: block;
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--realm-accent-glow);
	margin-bottom: 0.2rem;
}

.xp-preview-title {
	margin: 0;
	font-family: var(--font-display);
	font-size: 1rem;
	color: var(--realm-text);
}

.xp-lines {
	list-style: none;
	margin: 0.85rem 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
}

.xp-line {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 0.75rem;
	padding: 0.45rem 0.55rem;
	border-radius: 8px;
	background: rgba(255, 255, 255, 0.02);
}

.xp-line-label {
	color: var(--realm-text-muted);
	font-size: 0.86rem;
}

.xp-line-value {
	font-weight: 700;
	font-family: var(--font-display);
	font-size: 0.92rem;
}

.xp-line-value.gain {
	color: var(--realm-success);
}

.xp-line-value.attack {
	color: var(--realm-accent-glow);
}

.xp-line-value.neutral {
	color: var(--realm-text);
}

.xp-totals {
	display: grid;
	gap: 0.65rem;
	margin-top: 0.85rem;
}

.xp-total-card {
	padding: 0.85rem 0.95rem;
	border-radius: 12px;
	border: 1px solid transparent;
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.xp-total-card.gain {
	background: rgba(110, 207, 138, 0.1);
	border-color: rgba(110, 207, 138, 0.28);
}

.xp-total-card.gain.secondary {
	background: rgba(110, 207, 138, 0.06);
}

.xp-total-card.attack {
	background: rgba(212, 99, 74, 0.12);
	border-color: rgba(212, 99, 74, 0.32);
}

.xp-total-label {
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--realm-text-muted);
}

.xp-total-value {
	font-family: var(--font-display);
	font-size: 1.45rem;
	line-height: 1.1;
}

.xp-total-card.gain .xp-total-value {
	color: var(--realm-success);
}

.xp-total-card.attack .xp-total-value {
	color: var(--realm-accent-glow);
}

.xp-total-sub {
	font-size: 0.78rem;
	color: var(--realm-text-muted);
}
</style>
