<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, apiUrl, type StandingsBreakdown, type TeamStanding } from '../lib/api';
import { useConfig } from '../composables/useConfig';
import StandingsPanel from '../components/StandingsPanel.vue';
import StandingsBreakdownPanel from '../components/StandingsBreakdownPanel.vue';

const { config, loadConfig } = useConfig();
const route = useRoute();
const router = useRouter();

const standings = ref<TeamStanding[] | null>(null);
const standingsImageUrl = ref<string | null>(null);
const breakdown = ref<StandingsBreakdown | null>(null);
const breakdownImageUrl = ref<string | null>(null);
const publishedAt = ref<string | null>(null);
const weekLabel = ref<string | null>(null);
const standingsPublished = ref(false);
const loading = ref(true);

const archive = computed(() => config.value?.site?.seasonArchive ?? null);
const requestedSlug = computed(() => String(route.params.slug ?? ''));
const matchesSlug = computed(() => !requestedSlug.value || requestedSlug.value === archive.value?.slug);

function formatDate(value: string | null | undefined) {
	if (!value) return null;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

async function loadStandingsSnapshot() {
	try {
		const data = await api<{
			published: boolean;
			standings?: TeamStanding[];
			breakdown?: StandingsBreakdown | null;
			imageUrl?: string | null;
			breakdownImageUrl?: string | null;
			publishedAt?: string;
			weekLabel?: string;
		}>('/standings');
		standingsPublished.value = data.published;
		standings.value = data.standings ?? null;
		breakdown.value = data.breakdown ?? null;
		publishedAt.value = data.publishedAt ?? null;
		weekLabel.value = data.weekLabel ?? null;
		standingsImageUrl.value = data.imageUrl ? apiUrl(data.imageUrl) : null;
		breakdownImageUrl.value = data.breakdownImageUrl ? apiUrl(data.breakdownImageUrl) : null;
	} catch {
		standingsPublished.value = false;
	}
}

onMounted(async () => {
	await loadConfig();
	if (!requestedSlug.value && archive.value?.slug) {
		await router.replace(`/archive/${archive.value.slug}`);
	}
	await loadStandingsSnapshot();
	loading.value = false;
});

watch(
	() => route.params.slug,
	async () => {
		if (!requestedSlug.value && archive.value?.slug) {
			await router.replace(`/archive/${archive.value.slug}`);
		}
	},
);
</script>

<template>
	<main v-if="config" class="page archive-page">
		<div v-if="loading" class="page-state">
			<div class="page-spinner" role="status" aria-label="Loading" />
			<p>Loading archive…</p>
		</div>

		<div v-else-if="!archive || !matchesSlug" class="empty-state card">
			<h1 class="page-title">No archived season</h1>
			<p class="page-lead">
				There's no frozen season here. Head back to the
				<RouterLink to="/">home page</RouterLink>
				or check the
				<RouterLink to="/standings">current standings</RouterLink>.
			</p>
		</div>

		<template v-else>
			<header class="archive-header card">
				<p class="eyebrow">Season archive</p>
				<h1 class="page-title">{{ archive.title }}</h1>
				<p v-if="archive.from || archive.to" class="archive-dates">
					{{ formatDate(archive.from) }}<template v-if="archive.to"> – {{ formatDate(archive.to) }}</template>
				</p>
				<p class="page-lead archive-message">{{ archive.message }}</p>
			</header>

			<section v-if="standingsPublished && standings" class="archive-standings">
				<h2 class="section-title">Final standings</h2>
				<StandingsPanel
					:standings="standings"
					:image-url="standingsImageUrl"
					:published-at="publishedAt"
					title="Final Standings"
				/>
				<StandingsBreakdownPanel
					v-if="breakdown"
					:breakdown="breakdown"
					:image-url="breakdownImageUrl"
					title="Score breakdown"
				/>
			</section>
			<div v-else class="empty-state card">
				<p>No standings were published before this season was archived.</p>
			</div>

			<p class="archive-footer-link">
				<RouterLink to="/standings">View the live standings page →</RouterLink>
			</p>
		</template>
	</main>
</template>

<style scoped>
.archive-header {
	margin-bottom: 1.5rem;
}

.eyebrow {
	margin: 0 0 0.35rem;
	color: var(--realm-accent-glow);
	font-size: 0.82rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
}

.archive-dates {
	margin: 0 0 1rem;
	color: var(--realm-text-muted);
	font-size: 0.92rem;
	font-weight: 600;
}

.archive-message {
	margin-bottom: 0;
	white-space: pre-wrap;
}

.section-title {
	font-family: var(--font-display);
	color: var(--realm-text);
	margin-bottom: 0.75rem;
}

.archive-standings {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	margin-bottom: 1.5rem;
}

.archive-footer-link {
	text-align: center;
	margin-top: 1rem;
}
</style>
