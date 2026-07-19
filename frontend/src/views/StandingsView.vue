<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type StandingsBreakdown, type TeamStanding } from '../lib/api';
import { useConfig } from '../composables/useConfig';
import StandingsPanel from '../components/StandingsPanel.vue';
import StandingsBreakdownPanel from '../components/StandingsBreakdownPanel.vue';

const { config, loadConfig } = useConfig();
const standings = ref<TeamStanding[] | null>(null);
const svg = ref<string | null>(null);
const breakdown = ref<StandingsBreakdown | null>(null);
const breakdownSvg = ref<string | null>(null);
const publishedAt = ref<string | null>(null);
const published = ref(false);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
	await loadConfig();
	try {
		const data = await api<{
			published: boolean;
			standings?: TeamStanding[];
			svg?: string;
			breakdown?: StandingsBreakdown | null;
			breakdownSvg?: string | null;
			publishedAt?: string;
		}>('/standings');
		published.value = data.published;
		standings.value = data.standings ?? null;
		svg.value = data.svg ?? null;
		breakdown.value = data.breakdown ?? null;
		breakdownSvg.value = data.breakdownSvg ?? null;
		publishedAt.value = data.publishedAt ?? null;
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

		<div v-if="loading" class="alert alert-info">Loading…</div>
		<div v-else-if="error" class="alert alert-error card">
			<p>{{ error }}</p>
		</div>
		<div v-else-if="!published" class="alert alert-info card">
			<p>{{ config.copy.standingsUnpublished }}</p>
		</div>
		<template v-else-if="standings">
			<StandingsPanel
				:standings="standings"
				:svg="svg"
				:published-at="publishedAt"
			/>
			<br />
			<StandingsBreakdownPanel
				v-if="breakdown"
				:breakdown="breakdown"
				:breakdown-svg="breakdownSvg"
				:title="
					String(config.copy.standingsBreakdownTitle ?? 'Score breakdown')
				"
			/>
		</template>
	</main>
</template>
