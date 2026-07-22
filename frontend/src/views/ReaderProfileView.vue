<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, type Achievement } from '../lib/api'
import { useConfig } from '../composables/useConfig'
import BookCover from '../components/BookCover.vue'
import PaceSparkline from '../components/PaceSparkline.vue'

type ReaderBook = {
	id: string
	bookTitle: string
	bookAuthor: string
	pageCount: number
	format: string
	submissionType: 'add' | 'sabotage'
	startedAt: string | null
	finishedAt: string | null
	createdAt: string
	coverUrl: string | null
	status: 'finished' | 'in_progress'
}

type PublicReader = {
	id: string
	displayName: string
	teamId: string | null
	teamName: string | null
	teamColor: string | null
	teamIcon: string | null
	status: string
	currentlyReading: {
		title: string
		author: string
		coverUrl: string | null
		updatedAt: string | null
	} | null
	achievements: Achievement[]
	pace: { points: unknown[]; sparklinePath: string | null }
	books: ReaderBook[]
	stats: {
		booksFinished: number
		booksInProgress: number
		totalPages: number
	}
}

const route = useRoute()
const { config, loadConfig } = useConfig()

const loading = ref(true)
const error = ref('')
const reader = ref<PublicReader | null>(null)

const finishedBooks = computed(
	() => reader.value?.books.filter((b) => b.status === 'finished') ?? [],
)
const inProgressBooks = computed(
	() => reader.value?.books.filter((b) => b.status === 'in_progress') ?? [],
)

async function load() {
	loading.value = true
	error.value = ''
	reader.value = null
	const id = String(route.params.id ?? '')
	if (!id) {
		error.value = 'Missing reader id'
		loading.value = false
		return
	}
	try {
		const data = await api<{ reader: PublicReader }>(`/readers/${id}`)
		reader.value = data.reader
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not load reader'
	} finally {
		loading.value = false
	}
}

onMounted(async () => {
	await loadConfig()
	await load()
})

watch(() => route.params.id, () => {
	void load()
})
</script>

<template>
	<main v-if="config" class="page reader-page">
		<div v-if="loading" class="alert alert-info">Loading reader…</div>
		<div v-else-if="error" class="alert alert-error">{{ error }}</div>

		<template v-else-if="reader">
			<header class="reader-header card">
				<div class="avatar" :style="{ '--c': reader.teamColor ?? 'var(--realm-border)' }">
					{{ reader.displayName.charAt(0).toUpperCase() }}
				</div>
				<div>
					<h1 class="page-title">{{ reader.displayName }}</h1>
					<p v-if="reader.teamName" class="team-pill" :style="{ '--c': reader.teamColor ?? undefined }">
						{{ reader.teamIcon }} {{ reader.teamName }}
					</p>
					<p v-else class="muted">{{ reader.status === 'pending' ? 'Awaiting realm assignment' : 'No realm' }}</p>
				</div>
			</header>

			<section v-if="reader.currentlyReading" class="currently-reading card">
				<h2>{{ config.copy.readerCurrentlyReadingTitle ?? 'Currently reading' }}</h2>
				<div class="cr-row">
					<BookCover
						:title="reader.currentlyReading.title"
						:author="reader.currentlyReading.author"
						:cover-url="reader.currentlyReading.coverUrl"
						size="lg"
					/>
					<div>
						<h3>{{ reader.currentlyReading.title }}</h3>
						<p v-if="reader.currentlyReading.author" class="muted">
							by {{ reader.currentlyReading.author }}
						</p>
						<p class="hint">{{ config.copy.readerCurrentlyReadingHint ?? 'Not scored — just vibes.' }}</p>
					</div>
				</div>
			</section>

			<section class="stats-row">
				<div class="stat card">
					<span class="val">{{ reader.stats.booksFinished }}</span>
					<span class="lbl">Finished</span>
				</div>
				<div class="stat card">
					<span class="val">{{ reader.stats.totalPages }}</span>
					<span class="lbl">Pages</span>
				</div>
				<div class="stat card">
					<span class="val">{{ reader.stats.booksInProgress }}</span>
					<span class="lbl">In progress</span>
				</div>
			</section>

			<section v-if="reader.achievements?.length" class="achievements card">
				<h2>{{ config.copy.profileAchievementsTitle ?? 'Achievements' }}</h2>
				<ul class="badge-list">
					<li
						v-for="a in reader.achievements"
						:key="a.id"
						class="badge"
						:class="{ earned: a.earned }"
						:title="a.description"
					>
						<span class="badge-icon" aria-hidden="true">{{ a.icon ?? '✦' }}</span>
						<span>{{ a.label }}</span>
					</li>
				</ul>
			</section>

			<section class="pace card">
				<h2>{{ config.copy.readerPaceTitle ?? 'Reading pace' }}</h2>
				<PaceSparkline
					:path="reader.pace.sparklinePath"
					:label="String(config.copy.readerPaceHint ?? 'Pages per day across finished books')"
				/>
			</section>

			<section v-if="inProgressBooks.length" class="books-section">
				<h2>{{ config.copy.readerInProgressTitle ?? 'In progress (challenge logs)' }}</h2>
				<ul class="book-list">
					<li v-for="b in inProgressBooks" :key="b.id" class="book card">
						<BookCover :title="b.bookTitle" :author="b.bookAuthor" :cover-url="b.coverUrl" />
						<div>
							<h3>{{ b.bookTitle }}</h3>
							<p class="muted">by {{ b.bookAuthor }} · {{ b.pageCount }} pages</p>
							<p v-if="b.startedAt" class="dates">Started {{ b.startedAt }}</p>
						</div>
					</li>
				</ul>
			</section>

			<section class="books-section">
				<h2>{{ config.copy.readerFinishedTitle ?? 'Finished in this challenge' }}</h2>
				<div v-if="!finishedBooks.length" class="card empty">
					{{ config.copy.readerNoBooks ?? 'No challenge books logged yet.' }}
				</div>
				<ul v-else class="book-list">
					<li v-for="b in finishedBooks" :key="b.id" class="book card">
						<BookCover :title="b.bookTitle" :author="b.bookAuthor" :cover-url="b.coverUrl" />
						<div>
							<h3>{{ b.bookTitle }}</h3>
							<p class="muted">
								by {{ b.bookAuthor }} · {{ b.pageCount }} pages · {{ b.format }}
							</p>
							<p v-if="b.startedAt || b.finishedAt" class="dates">
								<template v-if="b.startedAt && b.finishedAt">
									{{ b.startedAt }} → {{ b.finishedAt }}
								</template>
								<template v-else-if="b.finishedAt">Finished {{ b.finishedAt }}</template>
								<template v-else>Started {{ b.startedAt }}</template>
							</p>
						</div>
					</li>
				</ul>
			</section>
		</template>
	</main>
</template>

<style scoped>
.reader-header {
	display: flex;
	gap: 1rem;
	align-items: center;
	margin-bottom: 1.25rem;
}

.avatar {
	width: 3.5rem;
	height: 3.5rem;
	border-radius: 50%;
	display: grid;
	place-items: center;
	font-family: var(--font-display);
	font-size: 1.5rem;
	background: color-mix(in srgb, var(--c) 25%, var(--realm-surface));
	border: 2px solid var(--c);
	color: var(--realm-text);
}

.team-pill {
	display: inline-block;
	margin: 0.35rem 0 0;
	padding: 0.2rem 0.65rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--c) 22%, transparent);
	border: 1px solid color-mix(in srgb, var(--c) 50%, var(--realm-border));
	font-size: 0.85rem;
}

.muted,
.hint,
.dates {
	color: var(--realm-text-muted);
	font-size: 0.9rem;
}

.currently-reading {
	margin-bottom: 1.25rem;
}

.currently-reading h2,
.achievements h2,
.pace h2,
.books-section h2 {
	margin: 0 0 0.75rem;
	font-family: var(--font-display);
	font-size: 1.1rem;
}

.cr-row {
	display: flex;
	gap: 1rem;
	align-items: flex-start;
}

.cr-row h3 {
	margin: 0 0 0.25rem;
	color: var(--realm-text);
}

.stats-row {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.75rem;
	margin-bottom: 1.25rem;
}

.stat {
	text-align: center;
	padding: 0.85rem;
}

.stat .val {
	display: block;
	font-family: var(--font-display);
	font-size: 1.5rem;
	color: var(--realm-text);
}

.stat .lbl {
	font-size: 0.8rem;
	color: var(--realm-text-muted);
}

.achievements,
.pace {
	margin-bottom: 1.25rem;
}

.badge-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.badge {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.25rem 0.55rem;
	border-radius: 999px;
	font-size: 0.75rem;
	border: 1px solid var(--realm-border);
	color: var(--realm-text-muted);
	opacity: 0.55;
}

.badge-icon {
	line-height: 1;
}

.badge.earned {
	opacity: 1;
	color: var(--realm-text);
	border-color: color-mix(in srgb, var(--realm-accent) 50%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 18%, transparent);
}

.book-list {
	list-style: none;
	padding: 0;
	margin: 0 0 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.book {
	display: flex;
	gap: 0.85rem;
	align-items: flex-start;
	padding: 0.85rem;
}

.book h3 {
	margin: 0 0 0.2rem;
	font-size: 1rem;
	color: var(--realm-text);
}

.empty {
	padding: 1rem;
	color: var(--realm-text-muted);
}
</style>
