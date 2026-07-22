<script setup lang="ts">
import { computed } from 'vue'

export type VibesNamedCount = {
	id: string
	label: string
	count: number
	extra?: number
}

export type VibesDogpile = {
	teamId: string
	teamName: string
	hitCount: number
	damageTaken: number
	booksLogged?: number
	pagesLogged?: number
	addCount?: number
	sabotageCount?: number
}

export type StandingsVibes = {
	weekKey?: string
	weekLabel?: string
	rangeLabel?: string
	overview: {
		submissions: number
		activeReaders?: number
		addCount: number
		sabotageCount: number
		chaosRatio: number
		competitionRate: number
		avgPages: number
		totalPages: number
	}
	byType: VibesNamedCount[]
	byFormat: VibesNamedCount[]
	byPageTier: VibesNamedCount[]
	dogpile: VibesDogpile[]
	byTeam?: VibesDogpile[]
}

const props = defineProps<{
	vibes: StandingsVibes
	title?: string
	lead?: string
}>()

const maxBar = (rows: VibesNamedCount[]) =>
	Math.max(1, ...rows.map((r) => r.count))

const peaceChaos = computed(() => {
	const rows = props.vibes.byType
	const total = rows.reduce((s, r) => s + r.count, 0) || 1
	const add = rows.find((r) => r.id === 'add')?.count ?? 0
	const sabotage = rows.find((r) => r.id === 'sabotage')?.count ?? 0
	return {
		add,
		sabotage,
		addPct: Math.round((add / total) * 100),
		sabotagePct: Math.round((sabotage / total) * 100),
	}
})

const donutStyle = computed(() => {
	const p = peaceChaos.value.addPct
	return {
		background: `conic-gradient(
      var(--realm-success) 0 ${p}%,
      var(--realm-accent) ${p}% 100%
    )`,
	}
})

const dogpileSorted = computed(() =>
	[...props.vibes.dogpile].sort(
		(a, b) => b.damageTaken - a.damageTaken || b.hitCount - a.hitCount,
	),
)

const hasData = computed(() => props.vibes.overview.submissions > 0)

const subtitle = computed(() => {
	if (props.vibes.weekLabel) {
		return `${props.vibes.weekLabel} reading activity.`
	}
	return (
		props.lead ??
		'Weekly extras from the published standings snapshot.'
	)
})
</script>

<template>
	<section v-if="hasData" class="vibes">
		<header class="vibes-header">
			<h2>{{ title ?? 'Reading vibes' }}</h2>
			<p>{{ subtitle }}</p>
		</header>

		<div class="stat-row">
			<div class="stat">
				<span class="kicker">Books this week</span>
				<strong>{{ vibes.overview.submissions }}</strong>
				<small
					>{{ vibes.overview.totalPages.toLocaleString() }} pages · avg
					{{ vibes.overview.avgPages }}</small
				>
			</div>
			<div class="stat">
				<span class="kicker">Sabotage share</span>
				<strong>{{ vibes.overview.chaosRatio }}%</strong>
				<small
					>{{ vibes.overview.sabotageCount }} sabotage ·
					{{ vibes.overview.addCount }} add</small
				>
			</div>
			<div class="stat">
				<span class="kicker">Competition bonus</span>
				<strong>{{ vibes.overview.competitionRate }}%</strong>
				<small>of books used it</small>
			</div>
			<div v-if="vibes.overview.activeReaders != null" class="stat">
				<span class="kicker">Active readers</span>
				<strong>{{ vibes.overview.activeReaders }}</strong>
				<small>logged at least one book</small>
			</div>
		</div>

		<div class="charts">
			<article class="chart">
				<h3>Add vs sabotage</h3>
				<div class="donut-wrap">
					<div class="donut" :style="donutStyle" aria-hidden="true">
						<div class="donut-hole">
							<strong>{{ peaceChaos.sabotagePct }}%</strong>
							<span>sabotage</span>
						</div>
					</div>
					<ul class="legend">
						<li>
							<span class="swatch add" /> Add {{ peaceChaos.add }} ({{
								peaceChaos.addPct
							}}%)
						</li>
						<li>
							<span class="swatch sabotage" /> Sabotage
							{{ peaceChaos.sabotage }} ({{ peaceChaos.sabotagePct }}%)
						</li>
					</ul>
				</div>
			</article>

			<article class="chart">
				<h3>Formats</h3>
				<ul v-if="vibes.byFormat.length" class="bars">
					<li v-for="row in vibes.byFormat" :key="row.id">
						<div class="bar-label">
							<span>{{ row.label }}</span>
							<strong>{{ row.count }}</strong>
						</div>
						<div class="bar-track">
							<div
								class="bar-fill"
								:style="{ width: `${(row.count / maxBar(vibes.byFormat)) * 100}%` }"
							/>
						</div>
					</li>
				</ul>
				<p v-else class="empty">No format data.</p>
			</article>

			<article class="chart">
				<h3>Most sabotaged</h3>
				<ul class="dogpile">
					<li v-for="row in dogpileSorted" :key="row.teamId">
						<span class="team">{{ row.teamName }}</span>
						<span class="meta"
							>{{ row.hitCount }} hits ·
							<span class="dmg">−{{ row.damageTaken }}</span></span
						>
					</li>
				</ul>
			</article>
		</div>
	</section>
</template>

<style scoped>
.vibes {
	margin: 1.75rem 0;
	padding: 1.25rem 0 0;
	border-top: 1px solid var(--realm-border);
}

.vibes-header {
	margin-bottom: 1.15rem;
}

.vibes-header h2 {
	margin: 0 0 0.3rem;
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.35rem;
}

.vibes-header p {
	margin: 0;
	color: var(--realm-text-muted);
	font-size: 0.92rem;
}

.stat-row {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
	gap: 0.85rem;
	margin-bottom: 1.15rem;
}

.stat {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	padding: 0.85rem 0;
}

.kicker {
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--realm-text-muted);
}

.stat strong {
	font-family: var(--font-display);
	font-size: 1.55rem;
	color: var(--realm-text);
	line-height: 1.1;
}

.stat small {
	font-size: 0.8rem;
	color: var(--realm-text-muted);
}

.charts {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
	gap: 1.25rem;
}

.chart h3 {
	margin: 0 0 0.75rem;
	font-family: var(--font-display);
	font-size: 1.05rem;
	color: var(--realm-text);
}

.donut-wrap {
	display: flex;
	align-items: center;
	gap: 1rem;
	flex-wrap: wrap;
}

.donut {
	width: 7.25rem;
	height: 7.25rem;
	border-radius: 50%;
	display: grid;
	place-items: center;
	flex-shrink: 0;
}

.donut-hole {
	width: 4.5rem;
	height: 4.5rem;
	border-radius: 50%;
	background: var(--realm-bg);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.05rem;
}

.donut-hole strong {
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.15rem;
}

.donut-hole span {
	font-size: 0.7rem;
	color: var(--realm-text-muted);
}

.legend {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.swatch {
	display: inline-block;
	width: 0.65rem;
	height: 0.65rem;
	border-radius: 2px;
	margin-right: 0.35rem;
	vertical-align: middle;
}

.swatch.add {
	background: var(--realm-success);
}

.swatch.sabotage {
	background: var(--realm-accent);
}

.bars {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
}

.bar-label {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
	margin-bottom: 0.25rem;
}

.bar-label strong {
	color: var(--realm-text);
}

.bar-track {
	height: 0.5rem;
	border-radius: 999px;
	background: var(--realm-surface);
	overflow: hidden;
}

.bar-fill {
	height: 100%;
	min-width: 2px;
	border-radius: inherit;
	background: linear-gradient(90deg, var(--realm-accent), var(--realm-accent-glow));
}

.dogpile {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
}

.dogpile li {
	display: flex;
	justify-content: space-between;
	gap: 0.75rem;
	align-items: baseline;
	font-size: 0.9rem;
}

.team {
	color: var(--realm-text);
	font-weight: 600;
}

.meta {
	color: var(--realm-text-muted);
	font-size: 0.85rem;
	white-space: nowrap;
}

.dmg {
	color: var(--realm-accent);
	font-weight: 600;
}

.empty {
	margin: 0;
	color: var(--realm-text-muted);
	font-style: italic;
	font-size: 0.9rem;
}
</style>
