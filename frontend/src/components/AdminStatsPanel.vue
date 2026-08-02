<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../lib/api';
import { useAdminCopy } from '../composables/useAdminCopy';
import { useConfig } from '../composables/useConfig';
import ReaderLink from './ReaderLink.vue';

type NamedCount = { id: string; label: string; count: number; extra?: number };

type ReaderRow = {
	userId: string;
	displayName: string;
	teamId: string | null;
	teamName: string;
	books: number;
	pages: number;
	avgPages: number;
	addCount: number;
	sabotageCount: number;
	damageDealt: number;
	pointsGained: number;
};

type DogpileRow = {
	teamId: string;
	teamName: string;
	hitCount: number;
	damageTaken: number;
	booksLogged: number;
	pagesLogged: number;
	addCount: number;
	sabotageCount: number;
};

type PromptRow = { promptId: string; label: string; kind: string; count: number };

type SpeedRow = {
	userId: string;
	displayName: string;
	bookTitle: string;
	pages: number;
	days: number;
};

type BookRow = {
	id: string;
	bookTitle: string;
	bookAuthor: string;
	pageCount: number;
	format: string;
	submissionType: string;
	userId: string;
	userName: string;
	teamName: string;
	createdAt: string;
	totalImpact: number;
};

type AuthorRow = { author: string; books: number; pages: number };

type RivalryRow = {
	fromTeamId: string;
	fromTeamName: string;
	toTeamId: string;
	toTeamName: string;
	hits: number;
	damage: number;
};

type DayRow = { date: string; count: number; pages: number; adds: number; sabotages: number };

type AdminAnalytics = {
	range: { from: string | null; to: string | null; preset: string; label: string };
	overview: {
		totalUsers: number;
		assigned: number;
		pending: number;
		submissions: number;
		activeReaders: number;
		unreadQuestions: number;
		addCount: number;
		sabotageCount: number;
		competitionClaims: number;
		competitionRate: number;
		avgPages: number;
		medianPages: number;
		maxPages: number;
		minPages: number;
		totalPages: number;
		chaosRatio: number;
		avgBooksPerActiveReader: number;
	};
	byType: NamedCount[];
	byFormat: NamedCount[];
	byPageTier: NamedCount[];
	byTeam: DogpileRow[];
	dogpile: DogpileRow[];
	warmongers: ReaderRow[];
	pacifists: ReaderRow[];
	booksPerReader: ReaderRow[];
	prompts: PromptRow[];
	inbox: NamedCount[];
	speedDemons: SpeedRow[];
	longestBooks: BookRow[];
	recentBooks: BookRow[];
	authors: AuthorRow[];
	rivalry: RivalryRow[];
	byDay: DayRow[];
};

type Preset = 'all' | 'thisWeek' | 'lastWeek' | 'last7' | 'last30' | 'custom';
type SortDir = 'asc' | 'desc'
type StatsView = 'overview' | 'people' | 'teams' | 'books' | 'prompts' | 'site'

const STATS_VIEWS: { id: StatsView; label: string; hint: string }[] = [
	{ id: 'overview', label: 'Overview', hint: 'Headline numbers & charts' },
	{ id: 'people', label: 'People', hint: 'Readers & saboteurs' },
	{ id: 'teams', label: 'Realms', hint: 'Teams, dogpiles & rivalries' },
	{ id: 'books', label: 'Books', hint: 'Titles, authors & pace' },
	{ id: 'prompts', label: 'Prompts', hint: 'What people claim' },
	{ id: 'site', label: 'Site', hint: 'Ops & Discord health' },
]

type SiteHealth = {
	totalUsers: number
	pending: number
	assigned: number
	submissions: number
	unreadQuestions: number
	downtimeMode: boolean
	teamChatHooksEnabled: boolean
	discordBotTokenConfigured: boolean
	discordGuildId: string
	discordTestDeliveryMode: string
	discordProductionDeliveryMode: string
	commandRoleCount: number
	gatewayReady: boolean
	gatewayUser: string | null
}

const emit = defineEmits<{ message: [text: string, isError?: boolean] }>();
const { section } = useAdminCopy();
const { config, loadConfig } = useConfig();

const copy = computed(() => section('stats'));
const activeView = ref<StatsView>('overview');
const siteHealth = ref<SiteHealth | null>(null);
const siteHealthLoading = ref(false);

const PRESET_OPTIONS: { id: Preset; label: string }[] = [
	{ id: 'all', label: 'All time' },
	{ id: 'thisWeek', label: 'This week' },
	{ id: 'lastWeek', label: 'Last week' },
	{ id: 'last7', label: '7 days' },
	{ id: 'last30', label: '30 days' },
	{ id: 'custom', label: 'Custom' },
];

const FORMAT_LABELS: Record<string, string> = {
	physical: 'Physical',
	ebook: 'Ebook',
	audiobook: 'Audiobook',
};

const loading = ref(false);
const loaded = ref(false);
const analytics = ref<AdminAnalytics | null>(null);

const preset = ref<Preset>('all');
const fromDate = ref('');
const toDate = ref('');
const teamId = ref('');

async function loadSiteHealth() {
	siteHealthLoading.value = true
	try {
		const [stats, settingsRes, gateway] = await Promise.all([
			api<{
				totalUsers: number
				pending: number
				assigned: number
				submissions: number
				unreadQuestions: number
			}>('/admin/stats'),
			api<{
				settings: {
					downtimeMode?: boolean
					teamChatHooksEnabled?: boolean
					discordBotTokenConfigured?: boolean
					discordGuildId?: string
					discordTestDeliveryMode?: string
					discordProductionDeliveryMode?: string
					discordDeliveryMode?: string
					discordBotCommandRoleIds?: string[]
				}
			}>('/admin/settings'),
			api<{ ready: boolean; user: string | null }>('/admin/discord/gateway-status'),
		])
		const s = settingsRes.settings
		siteHealth.value = {
			totalUsers: stats.totalUsers,
			pending: stats.pending,
			assigned: stats.assigned,
			submissions: stats.submissions,
			unreadQuestions: stats.unreadQuestions,
			downtimeMode: Boolean(s.downtimeMode),
			teamChatHooksEnabled: Boolean(s.teamChatHooksEnabled),
			discordBotTokenConfigured: Boolean(s.discordBotTokenConfigured),
			discordGuildId: s.discordGuildId ?? '',
			discordTestDeliveryMode:
				s.discordTestDeliveryMode ?? s.discordDeliveryMode ?? 'webhook',
			discordProductionDeliveryMode:
				s.discordProductionDeliveryMode ?? s.discordDeliveryMode ?? 'webhook',
			commandRoleCount: s.discordBotCommandRoleIds?.length ?? 0,
			gatewayReady: Boolean(gateway.ready),
			gatewayUser: gateway.user,
		}
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to load site health.',
			true,
		)
	} finally {
		siteHealthLoading.value = false
	}
}

function setView(view: StatsView) {
	activeView.value = view
	if (view === 'site' && !siteHealth.value) void loadSiteHealth()
}

async function load() {
	loading.value = true;
	try {
		const params = new URLSearchParams();
		params.set('preset', preset.value);
		if (preset.value === 'custom') {
			if (fromDate.value) params.set('from', fromDate.value);
			if (toDate.value) params.set('to', toDate.value);
		}
		if (teamId.value) params.set('teamId', teamId.value);
		const data = await api<{ analytics: AdminAnalytics }>(
			`/admin/analytics?${params.toString()}`,
		);
		analytics.value = data.analytics;
		loaded.value = true;
		if (activeView.value === 'site') void loadSiteHealth()
	} catch (e) {
		emit('message', e instanceof Error ? e.message : 'Failed to load analytics.', true);
	} finally {
		loading.value = false;
	}
}

function selectPreset(p: Preset) {
	if (p === 'custom') {
		preset.value = 'custom';
		return;
	}
	preset.value = p;
	fromDate.value = '';
	toDate.value = '';
	void load();
}

function applyCustomRange() {
	preset.value = 'custom';
	void load();
}

watch(teamId, () => {
	void load();
});

onMounted(async () => {
	await loadConfig();
	void load();
});

function formatLabel(id: string) {
	return FORMAT_LABELS[id] ?? id;
}

function formatDay(iso: string) {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDate(iso: string) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString();
}

function pagesPerDay(row: SpeedRow) {
	return row.days <= 0 ? row.pages : Math.round(row.pages / Math.max(row.days, 1));
}

function maxOf(rows: { count: number }[]) {
	return Math.max(1, ...rows.map((r) => r.count));
}

const peaceChaos = computed(() => {
	const rows = analytics.value?.byType ?? [];
	const total = rows.reduce((s, r) => s + r.count, 0) || 1;
	const add = rows.find((r) => r.id === 'add')?.count ?? 0;
	const sabotage = rows.find((r) => r.id === 'sabotage')?.count ?? 0;
	return {
		add,
		sabotage,
		addPct: Math.round((add / total) * 100),
		sabotagePct: Math.round((sabotage / total) * 100),
	};
});

const donutStyle = computed(() => {
	const p = peaceChaos.value.addPct;
	return {
		background: `conic-gradient(var(--realm-success) 0 ${p}%, var(--realm-accent) ${p}% 100%)`,
	};
});

const maxDayCount = computed(() =>
	Math.max(1, ...(analytics.value?.byDay ?? []).map((d) => d.count)),
);

function cmpVal(a: unknown, b: unknown): number {
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
		sensitivity: 'base',
	});
}

function useSortable<T extends Record<string, unknown>>(
	source: () => T[],
	initialKey: string,
	initialDir: SortDir = 'desc',
	valueFns?: Record<string, (row: T) => number | string>,
	pageSize = 0,
) {
	const key = ref(initialKey);
	const dir = ref<SortDir>(initialDir);
	const page = ref(0);

	function toggle(k: string, defaultDir: SortDir = 'desc') {
		if (key.value === k) {
			dir.value = dir.value === 'asc' ? 'desc' : 'asc';
		} else {
			key.value = k;
			dir.value = defaultDir;
		}
		page.value = 0;
	}

	const sorted = computed(() => {
		const mul = dir.value === 'asc' ? 1 : -1;
		const fn = valueFns?.[key.value];
		return [...source()].sort((a, b) => {
			const av = fn ? fn(a) : a[key.value];
			const bv = fn ? fn(b) : b[key.value];
			return cmpVal(av, bv) * mul;
		});
	});

	const total = computed(() => sorted.value.length);
	const totalPages = computed(() =>
		pageSize > 0 ? Math.max(1, Math.ceil(total.value / pageSize)) : 1,
	);

	watch(sorted, () => {
		if (page.value > totalPages.value - 1) {
			page.value = Math.max(0, totalPages.value - 1);
		}
	});

	const rows = computed(() => {
		if (pageSize <= 0) return sorted.value;
		const start = page.value * pageSize;
		return sorted.value.slice(start, start + pageSize);
	});

	const rangeLabel = computed(() => {
		if (total.value === 0) return '0 of 0';
		if (pageSize <= 0) return `1–${total.value} of ${total.value}`;
		const start = page.value * pageSize + 1;
		const end = Math.min((page.value + 1) * pageSize, total.value);
		return `${start}–${end} of ${total.value}`;
	});

	function goPage(p: number) {
		page.value = Math.max(0, Math.min(totalPages.value - 1, p));
	}

	function aria(k: string): 'ascending' | 'descending' | 'none' {
		if (key.value !== k) return 'none';
		return dir.value === 'asc' ? 'ascending' : 'descending';
	}

	function mark(k: string) {
		if (key.value !== k) return '↕';
		return dir.value === 'asc' ? '↑' : '↓';
	}

	return {
		key,
		dir,
		rows,
		toggle,
		aria,
		mark,
		page,
		pageSize,
		total,
		totalPages,
		rangeLabel,
		goPage,
		paged: pageSize > 0,
	};
}

const TABLE_PAGE_SIZE = 10;

const teamTable = useSortable<DogpileRow>(
	() => analytics.value?.byTeam ?? [],
	'pagesLogged',
	'desc',
);
const dogpileTable = useSortable<DogpileRow>(
	() => analytics.value?.dogpile ?? [],
	'damageTaken',
	'desc',
);
const rivalryTable = useSortable<RivalryRow>(
	() => analytics.value?.rivalry ?? [],
	'damage',
	'desc',
);
const warmongerTable = useSortable<ReaderRow>(
	() => analytics.value?.warmongers ?? [],
	'damageDealt',
	'desc',
);
const pacifistTable = useSortable<ReaderRow>(
	() => analytics.value?.pacifists ?? [],
	'pointsGained',
	'desc',
);
const booksTable = useSortable<ReaderRow>(
	() => analytics.value?.booksPerReader ?? [],
	'books',
	'desc',
);
const promptTable = useSortable<PromptRow>(
	() => analytics.value?.prompts ?? [],
	'count',
	'desc',
	undefined,
	TABLE_PAGE_SIZE,
);
const authorTable = useSortable<AuthorRow>(
	() => analytics.value?.authors ?? [],
	'books',
	'desc',
	undefined,
	TABLE_PAGE_SIZE,
);
const longestTable = useSortable<BookRow>(
	() => analytics.value?.longestBooks ?? [],
	'pageCount',
	'desc',
	undefined,
	TABLE_PAGE_SIZE,
);
const recentTable = useSortable<BookRow>(
	() => analytics.value?.recentBooks ?? [],
	'createdAt',
	'desc',
	undefined,
	TABLE_PAGE_SIZE,
);
const speedTable = useSortable<SpeedRow & Record<string, unknown>>(
	() => (analytics.value?.speedDemons ?? []) as (SpeedRow & Record<string, unknown>)[],
	'pagesPerDay',
	'desc',
	{ pagesPerDay: (row) => pagesPerDay(row as unknown as SpeedRow) },
	TABLE_PAGE_SIZE,
);
const dayTable = useSortable<DayRow>(() => analytics.value?.byDay ?? [], 'date', 'desc');
</script>

<template>
	<section class="admin-section stats-panel">
		<header class="stats-header card">
			<div>
				<h2>{{ copy.title ?? 'Analytics' }}</h2>
				<p class="section-desc">
					{{
						copy.lead ??
						'Pick a view below — Overview, People, Realms, Books, Prompts, or Site. Filter by date or realm, then sort any table column.'
					}}
				</p>
				<p v-if="analytics" class="range-label">{{ analytics.range.label }}</p>
			</div>
		</header>

		<div class="filter-bar card">
			<div class="filter-row chip-row" role="tablist" aria-label="Date range">
				<button
					v-for="p in PRESET_OPTIONS"
					:key="p.id"
					type="button"
					class="chip"
					:class="{ active: preset === p.id }"
					@click="selectPreset(p.id)"
				>
					{{ p.label }}
				</button>
			</div>

			<div v-if="preset === 'custom'" class="filter-row custom-row">
				<label class="field-inline">
					<span>From</span>
					<input v-model="fromDate" type="date" />
				</label>
				<label class="field-inline">
					<span>To</span>
					<input v-model="toDate" type="date" />
				</label>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					:disabled="loading"
					@click="applyCustomRange"
				>
					Apply
				</button>
			</div>

			<div class="filter-row team-row">
				<label class="field-inline team-field">
					<span>Realm</span>
					<select v-model="teamId">
						<option value="">All realms</option>
						<option v-for="team in config?.teams ?? []" :key="team.id" :value="team.id">
							{{ team.icon }} {{ team.name }}
						</option>
					</select>
				</label>
				<button
					type="button"
					class="btn btn-secondary btn-sm refresh-btn"
					:disabled="loading"
					@click="load"
				>
					{{ loading ? 'Refreshing…' : 'Refresh' }}
				</button>
			</div>
		</div>


		<nav class="stats-views card" role="tablist" aria-label="Stats views">
			<button
				v-for="v in STATS_VIEWS"
				:key="v.id"
				type="button"
				role="tab"
				class="stats-view-tab"
				:class="{ active: activeView === v.id }"
				:aria-selected="activeView === v.id"
				:title="v.hint"
				@click="setView(v.id)"
			>
				<span class="stats-view-label">{{ v.label }}</span>
				<span class="stats-view-hint">{{ v.hint }}</span>
			</button>
		</nav>

		<div v-if="loading && !loaded" class="page-state card">
			<div class="page-spinner" role="status" aria-label="Loading" />
			<p>{{ copy.loading ?? 'Loading analytics…' }}</p>
		</div>

		<div v-else-if="!analytics" class="page-state card">
			<p>Couldn't load analytics. Try refreshing.</p>
		</div>

		<template v-else>
			<div v-show="activeView === 'overview'" class="stats-view-panel">
			<!-- Overview -->
			<div class="stat-cards">
				<article class="stat-card card">
					<p class="stat-kicker">Readers</p>
					<strong>{{ analytics.overview.assigned }}</strong>
					<span
						>{{ analytics.overview.pending }} pending ·
						{{ analytics.overview.totalUsers }} total</span
					>
				</article>
				<article class="stat-card card">
					<p class="stat-kicker">Active readers</p>
					<strong>{{ analytics.overview.activeReaders }}</strong>
					<span>{{ analytics.overview.avgBooksPerActiveReader }} avg books each</span>
				</article>
				<article class="stat-card card">
					<p class="stat-kicker">Books logged</p>
					<strong>{{ analytics.overview.submissions }}</strong>
					<span>{{ analytics.overview.totalPages.toLocaleString() }} pages total</span>
				</article>
				<article class="stat-card card">
					<p class="stat-kicker">Avg pages / book</p>
					<strong>{{ analytics.overview.avgPages }}</strong>
					<span>median {{ analytics.overview.medianPages }}</span>
				</article>
				<article class="stat-card card">
					<p class="stat-kicker">Page range</p>
					<strong>{{ analytics.overview.minPages }}–{{ analytics.overview.maxPages }}</strong>
					<span>shortest to longest</span>
				</article>
				<article class="stat-card card">
					<p class="stat-kicker">Add vs sabotage</p>
					<strong>{{ analytics.overview.addCount }} / {{ analytics.overview.sabotageCount }}</strong>
					<span>{{ analytics.overview.chaosRatio }}% sabotage share</span>
				</article>
				<article class="stat-card card chaos">
					<p class="stat-kicker">Chaos ratio</p>
					<strong>{{ analytics.overview.chaosRatio }}%</strong>
					<span>of all submissions</span>
				</article>
				<article class="stat-card card">
					<p class="stat-kicker">Competition bonus</p>
					<strong>{{ analytics.overview.competitionRate }}%</strong>
					<span>{{ analytics.overview.competitionClaims }} books used it</span>
				</article>
				<article class="stat-card card">
					<p class="stat-kicker">Unread inbox</p>
					<strong>{{ analytics.overview.unreadQuestions }}</strong>
					<span>waiting on a reply</span>
				</article>
			</div>

			<!-- Charts -->
			<div class="charts-grid">
				<article class="card chart-card">
					<h3>Add vs sabotage</h3>
					<p class="chart-lead">How submissions break down by type.</p>
					<div v-if="peaceChaos.add + peaceChaos.sabotage === 0" class="empty-note">
						Nothing logged yet.
					</div>
					<div v-else class="donut-wrap">
						<div class="donut" :style="donutStyle" aria-hidden="true">
							<div class="donut-hole">
								<strong>{{ peaceChaos.sabotagePct }}%</strong>
								<span>sabotage</span>
							</div>
						</div>
						<ul class="legend">
							<li>
								<span class="swatch add" /> Add {{ peaceChaos.add }} ({{ peaceChaos.addPct }}%)
							</li>
							<li>
								<span class="swatch sabotage" /> Sabotage {{ peaceChaos.sabotage }} ({{
									peaceChaos.sabotagePct
								}}%)
							</li>
						</ul>
					</div>
				</article>

				<article class="card chart-card">
					<h3>Formats</h3>
					<p class="chart-lead">Physical, ebook, and audiobook.</p>
					<div v-if="analytics.byFormat.length === 0" class="empty-note">
						Nothing logged yet.
					</div>
					<ul v-else class="bar-list">
						<li v-for="row in analytics.byFormat" :key="row.id">
							<div class="bar-label">
								<span>{{ row.label }}</span>
								<strong>{{ row.count }}<small v-if="row.extra"> · {{ row.extra.toLocaleString() }}pg</small></strong>
							</div>
							<div class="bar-track">
								<div
									class="bar-fill"
									:style="{ width: `${(row.count / maxOf(analytics.byFormat)) * 100}%` }"
								/>
							</div>
						</li>
					</ul>
				</article>

				<article class="card chart-card">
					<h3>Page-count tiers</h3>
					<p class="chart-lead">How many books landed in each bonus bracket.</p>
					<div v-if="analytics.byPageTier.length === 0" class="empty-note">
						Nothing logged yet.
					</div>
					<ul v-else class="bar-list">
						<li v-for="row in analytics.byPageTier" :key="row.id">
							<div class="bar-label">
								<span>{{ row.label }}</span>
								<strong>{{ row.count }}</strong>
							</div>
							<div class="bar-track">
								<div
									class="bar-fill accent"
									:style="{ width: `${(row.count / maxOf(analytics.byPageTier)) * 100}%` }"
								/>
							</div>
						</li>
					</ul>
				</article>

				<article class="card chart-card">
					<h3>Inbox</h3>
					<p class="chart-lead">Question status at a glance.</p>
					<ul class="bar-list">
						<li v-for="row in analytics.inbox" :key="row.id">
							<div class="bar-label">
								<span>{{ row.label }}</span>
								<strong>{{ row.count }}</strong>
							</div>
							<div class="bar-track">
								<div
									class="bar-fill muted"
									:style="{ width: `${(row.count / maxOf(analytics.inbox)) * 100}%` }"
								/>
							</div>
						</li>
					</ul>
				</article>

				<article class="card chart-card day-chart-card">
					<h3>Daily activity</h3>
					<p class="chart-lead">Submissions per day, add vs sabotage.</p>
					<div v-if="analytics.byDay.length === 0" class="empty-note">
						Nothing logged yet.
					</div>
					<div v-else class="day-chart">
						<div v-for="day in analytics.byDay" :key="day.date" class="day-col">
							<div class="day-bar-track">
								<div
									class="day-bar sabotage"
									:style="{ height: `${(day.sabotages / maxDayCount) * 100}%` }"
									:title="`${day.sabotages} sabotage`"
								/>
								<div
									class="day-bar add"
									:style="{ height: `${(day.adds / maxDayCount) * 100}%` }"
									:title="`${day.adds} add`"
								/>
							</div>
							<span class="day-count">{{ day.count }}</span>
							<span class="day-label">{{ formatDay(day.date) }}</span>
						</div>
					</div>
				</article>
			</div>

			</div>

			<div v-show="activeView === 'teams'" class="stats-view-panel">
			<!-- Team overview -->
			<article class="card table-card">
				<h3>Team overview</h3>
				<p class="chart-lead">Books, pages, and activity logged per realm.</p>
				<div v-if="teamTable.rows.value.length === 0" class="empty-note">No realms configured.</div>
				<div v-else class="table-wrap">
					<table class="data-table" aria-label="Team overview">
						<thead>
							<tr>
								<th scope="col" :aria-sort="teamTable.aria('teamName')">
									<button type="button" class="sort-th" @click="teamTable.toggle('teamName', 'asc')">
										Realm <span class="sort-mark">{{ teamTable.mark('teamName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="teamTable.aria('booksLogged')">
									<button type="button" class="sort-th" @click="teamTable.toggle('booksLogged')">
										Books <span class="sort-mark">{{ teamTable.mark('booksLogged') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="teamTable.aria('pagesLogged')">
									<button type="button" class="sort-th" @click="teamTable.toggle('pagesLogged')">
										Pages <span class="sort-mark">{{ teamTable.mark('pagesLogged') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="teamTable.aria('addCount')">
									<button type="button" class="sort-th" @click="teamTable.toggle('addCount')">
										Adds <span class="sort-mark">{{ teamTable.mark('addCount') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="teamTable.aria('sabotageCount')">
									<button type="button" class="sort-th" @click="teamTable.toggle('sabotageCount')">
										Sabotages <span class="sort-mark">{{ teamTable.mark('sabotageCount') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="teamTable.aria('hitCount')">
									<button type="button" class="sort-th" @click="teamTable.toggle('hitCount')">
										Times hit <span class="sort-mark">{{ teamTable.mark('hitCount') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="teamTable.aria('damageTaken')">
									<button type="button" class="sort-th" @click="teamTable.toggle('damageTaken')">
										Damage taken <span class="sort-mark">{{ teamTable.mark('damageTaken') }}</span>
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in teamTable.rows.value" :key="row.teamId">
								<td>{{ row.teamName }}</td>
								<td>{{ row.booksLogged }}</td>
								<td>{{ row.pagesLogged.toLocaleString() }}</td>
								<td class="gain">+{{ row.addCount }}</td>
								<td class="dmg">{{ row.sabotageCount }}</td>
								<td>{{ row.hitCount }}</td>
								<td class="dmg">−{{ row.damageTaken }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>

			<!-- Dogpile -->
			<article class="card table-card">
				<h3>Most sabotaged realms</h3>
				<p class="chart-lead">Who's taking the brunt of the sabotage.</p>
				<div v-if="dogpileTable.rows.value.length === 0" class="empty-note">
					No sabotage submissions yet.
				</div>
				<div v-else class="table-wrap">
					<table class="data-table" aria-label="Most sabotaged realms">
						<thead>
							<tr>
								<th scope="col" :aria-sort="dogpileTable.aria('teamName')">
									<button type="button" class="sort-th" @click="dogpileTable.toggle('teamName', 'asc')">
										Realm <span class="sort-mark">{{ dogpileTable.mark('teamName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="dogpileTable.aria('hitCount')">
									<button type="button" class="sort-th" @click="dogpileTable.toggle('hitCount')">
										Times hit <span class="sort-mark">{{ dogpileTable.mark('hitCount') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="dogpileTable.aria('damageTaken')">
									<button type="button" class="sort-th" @click="dogpileTable.toggle('damageTaken')">
										Damage taken <span class="sort-mark">{{ dogpileTable.mark('damageTaken') }}</span>
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in dogpileTable.rows.value" :key="row.teamId">
								<td>{{ row.teamName }}</td>
								<td>{{ row.hitCount }}</td>
								<td class="dmg">−{{ row.damageTaken }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>

			<!-- Rivalry -->
			<article class="card table-card">
				<h3>Team rivalries</h3>
				<p class="chart-lead">Which realms are targeting each other, and how hard.</p>
				<div v-if="rivalryTable.rows.value.length === 0" class="empty-note">
					No cross-realm sabotage yet.
				</div>
				<div v-else class="table-wrap">
					<table class="data-table" aria-label="Team rivalries">
						<thead>
							<tr>
								<th scope="col" :aria-sort="rivalryTable.aria('fromTeamName')">
									<button type="button" class="sort-th" @click="rivalryTable.toggle('fromTeamName', 'asc')">
										Attacker <span class="sort-mark">{{ rivalryTable.mark('fromTeamName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="rivalryTable.aria('toTeamName')">
									<button type="button" class="sort-th" @click="rivalryTable.toggle('toTeamName', 'asc')">
										Target <span class="sort-mark">{{ rivalryTable.mark('toTeamName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="rivalryTable.aria('hits')">
									<button type="button" class="sort-th" @click="rivalryTable.toggle('hits')">
										Hits <span class="sort-mark">{{ rivalryTable.mark('hits') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="rivalryTable.aria('damage')">
									<button type="button" class="sort-th" @click="rivalryTable.toggle('damage')">
										Damage <span class="sort-mark">{{ rivalryTable.mark('damage') }}</span>
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(row, i) in rivalryTable.rows.value" :key="`${row.fromTeamId}-${row.toTeamId}-${i}`">
								<td>{{ row.fromTeamName }}</td>
								<td>{{ row.toTeamName }}</td>
								<td>{{ row.hits }}</td>
								<td class="dmg">−{{ row.damage }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>

			</div>

			<div v-show="activeView === 'people'" class="stats-view-panel">
			<!-- Warmongers -->
			<article class="card table-card">
				<h3>Top saboteurs</h3>
				<p class="chart-lead">Readers dealing the most sabotage damage.</p>
				<div v-if="warmongerTable.rows.value.length === 0" class="empty-note">
					No sabotage submissions yet.
				</div>
				<div v-else class="table-wrap">
					<table class="data-table" aria-label="Top saboteurs">
						<thead>
							<tr>
								<th scope="col" :aria-sort="warmongerTable.aria('displayName')">
									<button type="button" class="sort-th" @click="warmongerTable.toggle('displayName', 'asc')">
										Reader <span class="sort-mark">{{ warmongerTable.mark('displayName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="warmongerTable.aria('teamName')">
									<button type="button" class="sort-th" @click="warmongerTable.toggle('teamName', 'asc')">
										Realm <span class="sort-mark">{{ warmongerTable.mark('teamName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="warmongerTable.aria('sabotageCount')">
									<button type="button" class="sort-th" @click="warmongerTable.toggle('sabotageCount')">
										Attacks <span class="sort-mark">{{ warmongerTable.mark('sabotageCount') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="warmongerTable.aria('damageDealt')">
									<button type="button" class="sort-th" @click="warmongerTable.toggle('damageDealt')">
										Damage dealt <span class="sort-mark">{{ warmongerTable.mark('damageDealt') }}</span>
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in warmongerTable.rows.value" :key="row.userId">
								<td>
									<ReaderLink :id="row.userId" :name="row.displayName" />
								</td>
								<td>{{ row.teamName }}</td>
								<td>{{ row.sabotageCount }}</td>
								<td class="dmg">−{{ row.damageDealt }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>

			<!-- Pacifists -->
			<article class="card table-card">
				<h3>Add-only readers</h3>
				<p class="chart-lead">Logged books without a single sabotage.</p>
				<div v-if="pacifistTable.rows.value.length === 0" class="empty-note">
					Everyone who submitted has sabotaged at least once.
				</div>
				<div v-else class="table-wrap">
					<table class="data-table" aria-label="Add-only readers">
						<thead>
							<tr>
								<th scope="col" :aria-sort="pacifistTable.aria('displayName')">
									<button type="button" class="sort-th" @click="pacifistTable.toggle('displayName', 'asc')">
										Reader <span class="sort-mark">{{ pacifistTable.mark('displayName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="pacifistTable.aria('teamName')">
									<button type="button" class="sort-th" @click="pacifistTable.toggle('teamName', 'asc')">
										Realm <span class="sort-mark">{{ pacifistTable.mark('teamName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="pacifistTable.aria('addCount')">
									<button type="button" class="sort-th" @click="pacifistTable.toggle('addCount')">
										Books <span class="sort-mark">{{ pacifistTable.mark('addCount') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="pacifistTable.aria('pointsGained')">
									<button type="button" class="sort-th" @click="pacifistTable.toggle('pointsGained')">
										Points <span class="sort-mark">{{ pacifistTable.mark('pointsGained') }}</span>
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in pacifistTable.rows.value" :key="row.userId">
								<td>
									<ReaderLink :id="row.userId" :name="row.displayName" />
								</td>
								<td>{{ row.teamName }}</td>
								<td>{{ row.addCount }}</td>
								<td class="gain">+{{ row.pointsGained }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>

			<!-- Books per reader -->
			<article class="card table-card">
				<h3>Books per reader</h3>
				<p class="chart-lead">Who has logged the most, across every realm.</p>
				<div v-if="booksTable.rows.value.length === 0" class="empty-note">Nothing logged yet.</div>
				<div v-else class="table-wrap">
					<table class="data-table" aria-label="Books per reader">
						<thead>
							<tr>
								<th scope="col" :aria-sort="booksTable.aria('displayName')">
									<button type="button" class="sort-th" @click="booksTable.toggle('displayName', 'asc')">
										Reader <span class="sort-mark">{{ booksTable.mark('displayName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="booksTable.aria('teamName')">
									<button type="button" class="sort-th" @click="booksTable.toggle('teamName', 'asc')">
										Realm <span class="sort-mark">{{ booksTable.mark('teamName') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="booksTable.aria('books')">
									<button type="button" class="sort-th" @click="booksTable.toggle('books')">
										Books <span class="sort-mark">{{ booksTable.mark('books') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="booksTable.aria('pages')">
									<button type="button" class="sort-th" @click="booksTable.toggle('pages')">
										Pages <span class="sort-mark">{{ booksTable.mark('pages') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="booksTable.aria('avgPages')">
									<button type="button" class="sort-th" @click="booksTable.toggle('avgPages')">
										Avg pages <span class="sort-mark">{{ booksTable.mark('avgPages') }}</span>
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in booksTable.rows.value" :key="row.userId">
								<td>
									<ReaderLink :id="row.userId" :name="row.displayName" />
								</td>
								<td>{{ row.teamName }}</td>
								<td>{{ row.books }}</td>
								<td>{{ row.pages.toLocaleString() }}</td>
								<td>{{ row.avgPages }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>

			</div>

			<div v-show="activeView === 'prompts'" class="stats-view-panel">
			<!-- Prompts -->
			<article class="card table-card">
				<h3>Prompt usage</h3>
				<p class="chart-lead">Add prompts, sabotage prompts, and team bonuses.</p>
				<div v-if="promptTable.total.value === 0" class="empty-note">
					No prompts claimed yet.
				</div>
				<template v-else>
					<div class="table-wrap">
						<table class="data-table" aria-label="Prompt usage">
							<thead>
								<tr>
									<th scope="col" :aria-sort="promptTable.aria('label')">
										<button type="button" class="sort-th" @click="promptTable.toggle('label', 'asc')">
											Prompt <span class="sort-mark">{{ promptTable.mark('label') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="promptTable.aria('count')">
										<button type="button" class="sort-th" @click="promptTable.toggle('count')">
											Times used <span class="sort-mark">{{ promptTable.mark('count') }}</span>
										</button>
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="row in promptTable.rows.value" :key="row.promptId">
									<td>{{ row.label }}</td>
									<td>{{ row.count }}</td>
								</tr>
							</tbody>
						</table>
					</div>
					<nav v-if="promptTable.totalPages.value > 1" class="table-pager" aria-label="Prompt usage pages">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="promptTable.page.value === 0"
							@click="promptTable.goPage(promptTable.page.value - 1)"
						>
							Prev
						</button>
						<p class="hint">{{ promptTable.rangeLabel.value }}</p>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="promptTable.page.value >= promptTable.totalPages.value - 1"
							@click="promptTable.goPage(promptTable.page.value + 1)"
						>
							Next
						</button>
					</nav>
				</template>
			</article>

			</div>

			<div v-show="activeView === 'books'" class="stats-view-panel">
			<!-- Authors -->
			<article class="card table-card">
				<h3>Top authors</h3>
				<p class="chart-lead">Most-read authors across all logged books.</p>
				<div v-if="authorTable.total.value === 0" class="empty-note">Nothing logged yet.</div>
				<template v-else>
					<div class="table-wrap">
						<table class="data-table" aria-label="Top authors">
							<thead>
								<tr>
									<th scope="col" :aria-sort="authorTable.aria('author')">
										<button type="button" class="sort-th" @click="authorTable.toggle('author', 'asc')">
											Author <span class="sort-mark">{{ authorTable.mark('author') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="authorTable.aria('books')">
										<button type="button" class="sort-th" @click="authorTable.toggle('books')">
											Books <span class="sort-mark">{{ authorTable.mark('books') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="authorTable.aria('pages')">
										<button type="button" class="sort-th" @click="authorTable.toggle('pages')">
											Pages <span class="sort-mark">{{ authorTable.mark('pages') }}</span>
										</button>
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="row in authorTable.rows.value" :key="row.author">
									<td>{{ row.author }}</td>
									<td>{{ row.books }}</td>
									<td>{{ row.pages.toLocaleString() }}</td>
								</tr>
							</tbody>
						</table>
					</div>
					<nav v-if="authorTable.totalPages.value > 1" class="table-pager" aria-label="Top authors pages">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="authorTable.page.value === 0"
							@click="authorTable.goPage(authorTable.page.value - 1)"
						>
							Prev
						</button>
						<p class="hint">{{ authorTable.rangeLabel.value }}</p>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="authorTable.page.value >= authorTable.totalPages.value - 1"
							@click="authorTable.goPage(authorTable.page.value + 1)"
						>
							Next
						</button>
					</nav>
				</template>
			</article>

			<!-- Longest books -->
			<article class="card table-card">
				<h3>Longest books</h3>
				<p class="chart-lead">The biggest reads logged in this range.</p>
				<div v-if="longestTable.total.value === 0" class="empty-note">
					Nothing logged yet.
				</div>
				<template v-else>
					<div class="table-wrap">
						<table class="data-table" aria-label="Longest books">
							<thead>
								<tr>
									<th scope="col" :aria-sort="longestTable.aria('bookTitle')">
										<button type="button" class="sort-th" @click="longestTable.toggle('bookTitle', 'asc')">
											Book <span class="sort-mark">{{ longestTable.mark('bookTitle') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="longestTable.aria('bookAuthor')">
										<button type="button" class="sort-th" @click="longestTable.toggle('bookAuthor', 'asc')">
											Author <span class="sort-mark">{{ longestTable.mark('bookAuthor') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="longestTable.aria('pageCount')">
										<button type="button" class="sort-th" @click="longestTable.toggle('pageCount')">
											Pages <span class="sort-mark">{{ longestTable.mark('pageCount') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="longestTable.aria('format')">
										<button type="button" class="sort-th" @click="longestTable.toggle('format', 'asc')">
											Format <span class="sort-mark">{{ longestTable.mark('format') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="longestTable.aria('userName')">
										<button type="button" class="sort-th" @click="longestTable.toggle('userName', 'asc')">
											Reader <span class="sort-mark">{{ longestTable.mark('userName') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="longestTable.aria('teamName')">
										<button type="button" class="sort-th" @click="longestTable.toggle('teamName', 'asc')">
											Realm <span class="sort-mark">{{ longestTable.mark('teamName') }}</span>
										</button>
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="row in longestTable.rows.value" :key="row.id">
									<td>{{ row.bookTitle }}</td>
									<td>{{ row.bookAuthor }}</td>
									<td>{{ row.pageCount }}</td>
									<td>{{ formatLabel(row.format) }}</td>
									<td>
										<ReaderLink :id="row.userId" :name="row.userName" />
									</td>
									<td>{{ row.teamName }}</td>
								</tr>
							</tbody>
						</table>
					</div>
					<nav v-if="longestTable.totalPages.value > 1" class="table-pager" aria-label="Longest books pages">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="longestTable.page.value === 0"
							@click="longestTable.goPage(longestTable.page.value - 1)"
						>
							Prev
						</button>
						<p class="hint">{{ longestTable.rangeLabel.value }}</p>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="longestTable.page.value >= longestTable.totalPages.value - 1"
							@click="longestTable.goPage(longestTable.page.value + 1)"
						>
							Next
						</button>
					</nav>
				</template>
			</article>

			<!-- Recent books -->
			<article class="card table-card">
				<h3>Recently logged</h3>
				<p class="chart-lead">The latest submissions across every realm.</p>
				<div v-if="recentTable.total.value === 0" class="empty-note">
					Nothing logged yet.
				</div>
				<template v-else>
					<div class="table-wrap">
						<table class="data-table" aria-label="Recently logged">
							<thead>
								<tr>
									<th scope="col" :aria-sort="recentTable.aria('bookTitle')">
										<button type="button" class="sort-th" @click="recentTable.toggle('bookTitle', 'asc')">
											Book <span class="sort-mark">{{ recentTable.mark('bookTitle') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="recentTable.aria('userName')">
										<button type="button" class="sort-th" @click="recentTable.toggle('userName', 'asc')">
											Reader <span class="sort-mark">{{ recentTable.mark('userName') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="recentTable.aria('submissionType')">
										<button type="button" class="sort-th" @click="recentTable.toggle('submissionType', 'asc')">
											Type <span class="sort-mark">{{ recentTable.mark('submissionType') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="recentTable.aria('pageCount')">
										<button type="button" class="sort-th" @click="recentTable.toggle('pageCount')">
											Pages <span class="sort-mark">{{ recentTable.mark('pageCount') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="recentTable.aria('createdAt')">
										<button type="button" class="sort-th" @click="recentTable.toggle('createdAt')">
											Logged <span class="sort-mark">{{ recentTable.mark('createdAt') }}</span>
										</button>
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="row in recentTable.rows.value" :key="row.id">
									<td>{{ row.bookTitle }}</td>
									<td>
										<ReaderLink :id="row.userId" :name="row.userName" />
									</td>
									<td>
										<span
											class="badge"
											:class="row.submissionType === 'add' ? 'badge-positive' : 'badge-negative'"
										>
											{{ row.submissionType }}
										</span>
									</td>
									<td>{{ row.pageCount }}</td>
									<td>{{ formatDate(row.createdAt) }}</td>
								</tr>
							</tbody>
						</table>
					</div>
					<nav v-if="recentTable.totalPages.value > 1" class="table-pager" aria-label="Recently logged pages">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="recentTable.page.value === 0"
							@click="recentTable.goPage(recentTable.page.value - 1)"
						>
							Prev
						</button>
						<p class="hint">{{ recentTable.rangeLabel.value }}</p>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="recentTable.page.value >= recentTable.totalPages.value - 1"
							@click="recentTable.goPage(recentTable.page.value + 1)"
						>
							Next
						</button>
					</nav>
				</template>
			</article>

			<!-- Speed demons -->
			<article class="card table-card">
				<h3>Fastest finishes</h3>
				<p class="chart-lead">Pages per day, when start and finish dates were logged.</p>
				<div v-if="speedTable.total.value === 0" class="empty-note">
					No start/finish dates logged yet.
				</div>
				<template v-else>
					<div class="table-wrap">
						<table class="data-table" aria-label="Fastest finishes">
							<thead>
								<tr>
									<th scope="col" :aria-sort="speedTable.aria('displayName')">
										<button type="button" class="sort-th" @click="speedTable.toggle('displayName', 'asc')">
											Reader <span class="sort-mark">{{ speedTable.mark('displayName') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="speedTable.aria('bookTitle')">
										<button type="button" class="sort-th" @click="speedTable.toggle('bookTitle', 'asc')">
											Book <span class="sort-mark">{{ speedTable.mark('bookTitle') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="speedTable.aria('pages')">
										<button type="button" class="sort-th" @click="speedTable.toggle('pages')">
											Pages <span class="sort-mark">{{ speedTable.mark('pages') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="speedTable.aria('days')">
										<button type="button" class="sort-th" @click="speedTable.toggle('days')">
											Days <span class="sort-mark">{{ speedTable.mark('days') }}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="speedTable.aria('pagesPerDay')">
										<button type="button" class="sort-th" @click="speedTable.toggle('pagesPerDay')">
											Pages/day <span class="sort-mark">{{ speedTable.mark('pagesPerDay') }}</span>
										</button>
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="(row, i) in speedTable.rows.value" :key="`${row.userId}-${row.bookTitle}-${i}`">
									<td>
										<ReaderLink :id="row.userId" :name="row.displayName" />
									</td>
									<td>{{ row.bookTitle }}</td>
									<td>{{ row.pages }}</td>
									<td>{{ row.days }}</td>
									<td class="gain">{{ pagesPerDay(row) }}</td>
								</tr>
							</tbody>
						</table>
					</div>
					<nav v-if="speedTable.totalPages.value > 1" class="table-pager" aria-label="Fastest finishes pages">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="speedTable.page.value === 0"
							@click="speedTable.goPage(speedTable.page.value - 1)"
						>
							Prev
						</button>
						<p class="hint">{{ speedTable.rangeLabel.value }}</p>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="speedTable.page.value >= speedTable.totalPages.value - 1"
							@click="speedTable.goPage(speedTable.page.value + 1)"
						>
							Next
						</button>
					</nav>
				</template>
			</article>

			<!-- By day -->
			<article class="card table-card">
				<h3>Daily activity log</h3>
				<p class="chart-lead">One row per day with submissions in this range.</p>
				<div v-if="dayTable.rows.value.length === 0" class="empty-note">Nothing logged yet.</div>
				<div v-else class="table-wrap">
					<table class="data-table" aria-label="Daily activity log">
						<thead>
							<tr>
								<th scope="col" :aria-sort="dayTable.aria('date')">
									<button type="button" class="sort-th" @click="dayTable.toggle('date')">
										Date <span class="sort-mark">{{ dayTable.mark('date') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="dayTable.aria('count')">
									<button type="button" class="sort-th" @click="dayTable.toggle('count')">
										Submissions <span class="sort-mark">{{ dayTable.mark('count') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="dayTable.aria('pages')">
									<button type="button" class="sort-th" @click="dayTable.toggle('pages')">
										Pages <span class="sort-mark">{{ dayTable.mark('pages') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="dayTable.aria('adds')">
									<button type="button" class="sort-th" @click="dayTable.toggle('adds')">
										Adds <span class="sort-mark">{{ dayTable.mark('adds') }}</span>
									</button>
								</th>
								<th scope="col" :aria-sort="dayTable.aria('sabotages')">
									<button type="button" class="sort-th" @click="dayTable.toggle('sabotages')">
										Sabotages <span class="sort-mark">{{ dayTable.mark('sabotages') }}</span>
									</button>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in dayTable.rows.value" :key="row.date">
								<td>{{ formatDay(row.date) }}</td>
								<td>{{ row.count }}</td>
								<td>{{ row.pages.toLocaleString() }}</td>
								<td class="gain">{{ row.adds }}</td>
								<td class="dmg">{{ row.sabotages }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>

			</div>

			<div v-show="activeView === 'site'" class="stats-view-panel">
				<div class="stat-cards">
					<article class="stat-card card">
						<p class="stat-kicker">Site status</p>
						<strong>{{ siteHealth?.downtimeMode ? 'Downtime' : 'Live' }}</strong>
						<span>{{ siteHealth?.teamChatHooksEnabled ? 'Realm chat on' : 'Realm chat off' }}</span>
					</article>
					<article class="stat-card card">
						<p class="stat-kicker">Users</p>
						<strong>{{ siteHealth?.assigned ?? '—' }}</strong>
						<span>{{ siteHealth?.pending ?? 0 }} pending · {{ siteHealth?.totalUsers ?? 0 }} total</span>
					</article>
					<article class="stat-card card">
						<p class="stat-kicker">Submissions</p>
						<strong>{{ siteHealth?.submissions ?? '—' }}</strong>
						<span>all-time logs</span>
					</article>
					<article class="stat-card card">
						<p class="stat-kicker">Unread inbox</p>
						<strong>{{ siteHealth?.unreadQuestions ?? '—' }}</strong>
						<span>questions waiting</span>
					</article>
					<article class="stat-card card" :class="{ chaos: !siteHealth?.gatewayReady }">
						<p class="stat-kicker">Discord gateway</p>
						<strong>{{ siteHealthLoading ? '…' : siteHealth?.gatewayReady ? 'Online' : 'Offline' }}</strong>
						<span>{{ siteHealth?.gatewayUser || 'No bot connected' }}</span>
					</article>
					<article class="stat-card card">
						<p class="stat-kicker">Bot token</p>
						<strong>{{ siteHealth?.discordBotTokenConfigured ? 'Configured' : 'Missing' }}</strong>
						<span>{{ siteHealth?.commandRoleCount ?? 0 }} command role(s)</span>
					</article>
					<article class="stat-card card">
						<p class="stat-kicker">Test delivery</p>
						<strong>{{ siteHealth?.discordTestDeliveryMode ?? '—' }}</strong>
						<span>standings test channel</span>
					</article>
					<article class="stat-card card">
						<p class="stat-kicker">Prod delivery</p>
						<strong>{{ siteHealth?.discordProductionDeliveryMode ?? '—' }}</strong>
						<span>guild {{ siteHealth?.discordGuildId || '—' }}</span>
					</article>
				</div>
				<article class="card table-card">
					<h3>Site health</h3>
					<p class="chart-lead">
						Ops snapshot for Discord and the admin surface. Refresh after changing Settings.
					</p>
					<div class="btn-row" style="margin-top: 0.75rem">
						<button
							type="button"
							class="btn btn-secondary btn-sm"
							:disabled="siteHealthLoading"
							@click="loadSiteHealth"
						>
							{{ siteHealthLoading ? 'Refreshing…' : 'Refresh site health' }}
						</button>
					</div>
				</article>
			</div>
		</template>
	</section>
</template>

<style scoped>

.stats-views {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
	gap: 0.5rem;
	padding: 0.65rem;
	margin-bottom: 1rem;
}

.stats-view-tab {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.15rem;
	padding: 0.65rem 0.75rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: color-mix(in srgb, var(--realm-bg) 65%, transparent);
	color: var(--realm-text);
	cursor: pointer;
	text-align: left;
}

.stats-view-tab:hover {
	border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
}

.stats-view-tab.active {
	border-color: var(--realm-accent);
	background: color-mix(in srgb, var(--realm-accent) 14%, var(--realm-bg));
}

.stats-view-label {
	font-weight: 700;
	font-size: 0.95rem;
}

.stats-view-hint {
	font-size: 0.75rem;
	color: var(--realm-text-muted);
	line-height: 1.3;
}

.stats-view-panel {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.stats-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1rem;
}

.stats-header h2 {
	margin: 0 0 0.35rem;
	font-family: var(--font-display);
	color: var(--realm-text);
}

.section-desc {
	margin: 0;
	color: var(--realm-text-muted);
	font-size: 0.92rem;
	max-width: 42rem;
	line-height: 1.55;
}

.range-label {
	margin: 0.6rem 0 0;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--realm-accent-glow);
}

/* Filter bar */
.filter-bar {
	position: sticky;
	top: 0.5rem;
	z-index: 5;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	margin-bottom: 1rem;
	padding: 0.9rem 1rem;
	background: color-mix(in srgb, var(--realm-surface) 92%, transparent);
	backdrop-filter: blur(10px);
}

.filter-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.6rem;
}

.chip-row {
	gap: 0.4rem;
}

.chip {
	padding: 0.4rem 0.85rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	font-family: var(--font-body);
	font-size: 0.82rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}

.chip:hover {
	color: var(--realm-text);
}

.chip.active {
	background: rgba(212, 99, 74, 0.15);
	border-color: var(--realm-accent);
	color: var(--realm-accent-glow);
}

.custom-row {
	padding-top: 0.15rem;
	border-top: 1px dashed var(--realm-border);
	padding-top: 0.75rem;
}

.field-inline {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--realm-text-muted);
}

.field-inline input,
.field-inline select {
	width: auto;
	padding: 0.4rem 0.6rem;
	font-size: 0.85rem;
}

.team-row {
	justify-content: space-between;
	border-top: 1px dashed var(--realm-border);
	padding-top: 0.75rem;
}

.team-field select {
	min-width: 11rem;
}

.refresh-btn {
	margin-left: auto;
}

/* Overview cards */
.stat-cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	gap: 0.85rem;
	margin-bottom: 1rem;
}

.stat-card {
	padding: 1rem 1.1rem;
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
}

.stat-kicker {
	margin: 0;
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--realm-text-muted);
}

.stat-card strong {
	font-family: var(--font-display);
	font-size: 1.65rem;
	color: var(--realm-text);
	line-height: 1.1;
}

.stat-card strong small {
	font-family: var(--font-body);
	font-size: 0.65em;
	color: var(--realm-text-muted);
	font-weight: 600;
}

.stat-card span {
	font-size: 0.8rem;
	color: var(--realm-text-muted);
}

.stat-card.chaos strong {
	color: var(--realm-accent-glow);
}

/* Charts */
.charts-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
	gap: 1rem;
	margin-bottom: 1rem;
}

.chart-card,
.table-card {
	padding: 1.15rem 1.25rem;
	margin-bottom: 1rem;
}

.day-chart-card {
	grid-column: 1 / -1;
}

.chart-card h3,
.table-card h3 {
	margin: 0 0 0.3rem;
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.1rem;
}

.chart-lead {
	margin: 0 0 1rem;
	color: var(--realm-text-muted);
	font-size: 0.88rem;
}

.donut-wrap {
	display: flex;
	align-items: center;
	gap: 1.25rem;
	flex-wrap: wrap;
}

.donut {
	width: 8.5rem;
	height: 8.5rem;
	border-radius: 50%;
	display: grid;
	place-items: center;
	flex-shrink: 0;
}

.donut-hole {
	width: 5.25rem;
	height: 5.25rem;
	border-radius: 50%;
	background: var(--realm-surface);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.1rem;
}

.donut-hole strong {
	font-family: var(--font-display);
	font-size: 1.35rem;
	color: var(--realm-text);
}

.donut-hole span {
	font-size: 0.75rem;
	color: var(--realm-text-muted);
}

.legend {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
	font-size: 0.9rem;
	color: var(--realm-text-muted);
}

.swatch {
	display: inline-block;
	width: 0.7rem;
	height: 0.7rem;
	border-radius: 2px;
	margin-right: 0.4rem;
	vertical-align: middle;
}

.swatch.add {
	background: var(--realm-success);
}

.swatch.sabotage {
	background: var(--realm-accent);
}

.bar-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.bar-label {
	display: flex;
	justify-content: space-between;
	gap: 0.75rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
	margin-bottom: 0.3rem;
}

.bar-label strong {
	color: var(--realm-text);
}

.bar-track {
	height: 0.55rem;
	border-radius: 999px;
	background: var(--realm-bg);
	overflow: hidden;
}

.bar-fill {
	height: 100%;
	border-radius: inherit;
	background: linear-gradient(90deg, var(--realm-success), #9be7b0);
	min-width: 2px;
}

.bar-fill.accent {
	background: linear-gradient(90deg, var(--realm-accent), var(--realm-accent-glow));
}

.bar-fill.muted {
	background: linear-gradient(90deg, #7a6aa5, #b7a6e8);
}

/* Day chart */
.day-chart {
	display: flex;
	align-items: flex-end;
	gap: 0.5rem;
	overflow-x: auto;
	padding-bottom: 0.35rem;
	-webkit-overflow-scrolling: touch;
}

.day-col {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.3rem;
	min-width: 2.1rem;
	flex-shrink: 0;
}

.day-bar-track {
	position: relative;
	width: 100%;
	height: 6.5rem;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	background: var(--realm-bg);
	border-radius: 4px;
	overflow: hidden;
}

.day-bar {
	width: 100%;
	min-height: 0;
}

.day-bar.add {
	background: linear-gradient(180deg, #9be7b0, var(--realm-success));
}

.day-bar.sabotage {
	background: linear-gradient(180deg, var(--realm-accent-glow), var(--realm-accent));
}

.day-count {
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--realm-text);
}

.day-label {
	font-size: 0.68rem;
	color: var(--realm-text-muted);
	white-space: nowrap;
}

/* Tables */
.table-wrap {
	overflow-x: auto;
	-webkit-overflow-scrolling: touch;
}

.table-pager {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	margin-top: 0.85rem;
}

.table-pager .hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--realm-text-muted);
}

.sort-th {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	margin: 0;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	font-weight: inherit;
	font-size: inherit;
	letter-spacing: inherit;
	text-transform: inherit;
	cursor: pointer;
	white-space: nowrap;
}

.sort-th:hover {
	color: var(--realm-accent-glow);
}

.sort-mark {
	font-size: 0.75em;
	opacity: 0.5;
	line-height: 1;
}

.dmg {
	color: var(--realm-accent-glow);
	font-weight: 600;
}

.gain {
	color: var(--realm-success);
	font-weight: 600;
}

.empty-note {
	color: var(--realm-text-muted);
	font-style: italic;
	font-size: 0.9rem;
	margin: 0;
}

.page-state {
	min-height: 12rem;
}

@media (max-width: 768px) {
	.filter-bar {
		position: static;
	}

	.team-row {
		flex-direction: column;
		align-items: stretch;
	}

	.refresh-btn {
		margin-left: 0;
		width: 100%;
	}

	.team-field {
		flex-direction: column;
		align-items: stretch;
	}

	.team-field select {
		min-width: 0;
	}
}
</style>
