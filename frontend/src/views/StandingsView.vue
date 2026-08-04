<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, apiUrl, type StandingsBreakdown, type TeamStanding } from '../lib/api';
import { useConfig } from '../composables/useConfig';
import StandingsPanel from '../components/StandingsPanel.vue';
import StandingsBreakdownPanel from '../components/StandingsBreakdownPanel.vue';
import StandingsVibes, {
	type StandingsVibes as VibesData,
} from '../components/StandingsVibes.vue';
import MonthlyWrapPanel from '../components/MonthlyWrapPanel.vue';

const { config, loadConfig } = useConfig();
const standings = ref<TeamStanding[] | null>(null);
const standingsImageUrl = ref<string | null>(null);
const breakdown = ref<StandingsBreakdown | null>(null);
const breakdownImageUrl = ref<string | null>(null);
const publishedAt = ref<string | null>(null);
const weekLabel = ref<string | null>(null);
const published = ref(false);
const vibes = ref<VibesData | null>(null);
const wrapImageUrl = ref<string | null>(null);
const wrapLabel = ref<string | null>(null);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
	await loadConfig();
	try {
		const data = await api<{
			published: boolean;
			standings?: TeamStanding[];
			breakdown?: StandingsBreakdown | null;
			imageUrl?: string | null;
			breakdownImageUrl?: string | null;
			publishedAt?: string;
			weekLabel?: string;
			vibes?: VibesData | null;
			wrapImageUrl?: string | null;
			wrapLabel?: string | null;
		}>('/standings');
		published.value = data.published;
		standings.value = data.standings ?? null;
		breakdown.value = data.breakdown ?? null;
		publishedAt.value = data.publishedAt ?? null;
		weekLabel.value = data.weekLabel ?? null;
		standingsImageUrl.value = data.imageUrl ? apiUrl(data.imageUrl) : null;
		breakdownImageUrl.value = data.breakdownImageUrl
			? apiUrl(data.breakdownImageUrl)
			: null;
		// Only show published vibes — never live-updating
		vibes.value = data.published ? (data.vibes ?? null) : null;
		wrapImageUrl.value = data.wrapImageUrl ? apiUrl(data.wrapImageUrl) : null;
		wrapLabel.value = data.wrapLabel ?? null;
	} catch {
		error.value = String(
			config.value?.copy.standingsLoadError ?? "Couldn't load standings.",
		);
	} finally {
		loading.value = false;
	}
});
</script>

<template>
	<main v-if="config" class="page">
		<h1 class="page-title">{{ config.copy.standingsPageTitle }}</h1>

		<div v-if="loading" class="page-state">
			<div class="page-spinner" role="status" aria-label="Loading" />
			<p>Loading standings…</p>
		</div>
		<div v-else-if="error" class="alert alert-error card">
			<p>{{ error }}</p>
		</div>
		<div v-else-if="!published" class="empty-state">
			<p>{{ config.copy.standingsUnpublished }}</p>
		</div>
		<template v-else-if="standings">
			<StandingsPanel
				:standings="standings"
				:image-url="standingsImageUrl"
				:published-at="publishedAt"
			/>

			<StandingsVibes
				v-if="vibes"
				:vibes="vibes"
				:title="String(config.copy.standingsVibesTitle ?? 'Reading vibes')"
				:lead="
					String(
						config.copy.standingsVibesLead ??
							'This week’s reading activity from the latest standings publish.',
					)
				"
			/>
			<p v-else class="vibes-missing">
				{{
					config.copy.standingsVibesMissing ??
					'Weekly vibes will appear after the next standings publish.'
				}}
			</p>

			<MonthlyWrapPanel
				v-if="wrapImageUrl"
				:image-url="wrapImageUrl"
				:label="wrapLabel"
				title="4-week wrap"
			/>

			<StandingsBreakdownPanel
				v-if="breakdown"
				:breakdown="breakdown"
				:image-url="breakdownImageUrl"
				:title="
					String(config.copy.standingsBreakdownTitle ?? 'Score breakdown')
				"
			/>
		</template>
	</main>
</template>

<style scoped>
.empty-state {
	padding: 2.5rem 1.25rem;
	text-align: center;
	color: var(--realm-text-muted);
	border: 1px dashed var(--realm-border);
	border-radius: var(--radius);
}

.page-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.75rem;
	padding: 2rem;
	color: var(--realm-text-muted);
}

.vibes-missing {
	margin: 1.5rem 0;
	padding: 1rem 0;
	border-top: 1px solid var(--realm-border);
	color: var(--realm-text-muted);
	font-size: 0.92rem;
}
</style>
