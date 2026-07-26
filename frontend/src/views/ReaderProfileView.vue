<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
	api,
	type Achievement,
	type ProfileDashboard,
	type UserQuestion,
} from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import BookCover from '../components/BookCover.vue'
import BookCoverEditor from '../components/BookCoverEditor.vue'
import PaceSparkline from '../components/PaceSparkline.vue'
import ProfileSettingsPanel, {
	type CurrentlyReading,
} from '../components/ProfileSettingsPanel.vue'
import UserAvatar from '../components/UserAvatar.vue'

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
	promptPoints?: number
	pageBonus?: number
	bonusPoints?: number
	totalImpact?: number
	targetTeamId?: string | null
}

type PublicReader = {
	id: string
	displayName: string
	teamId: string | null
	teamName: string | null
	teamColor: string | null
	teamIcon: string | null
	status: string
	avatarUrl: string | null
	currentlyReading: CurrentlyReading | null
	achievements: Achievement[]
	pace: { points: unknown[]; sparklinePath: string | null }
	books: ReaderBook[]
	stats: {
		booksFinished: number
		booksInProgress: number
		totalPages: number
	}
}

type ReaderMe = {
	notifyStandings: boolean
	notifyAnswers: boolean
	dashboard: ProfileDashboard
	questions: UserQuestion[]
}

const route = useRoute()
const router = useRouter()
const { user, fetchUser } = useAuth()
const { config, getTeam } = useConfig()
const { t } = useCopy()

const loading = ref(true)
const error = ref('')
const reader = ref<PublicReader | null>(null)
const dashboard = ref<ProfileDashboard | null>(null)
const questions = ref<UserQuestion[]>([])
const notifyStandings = ref(false)
const notifyAnswers = ref(false)
const settingsOpen = ref(false)
const activeTab = ref<'books' | 'questions'>('books')

const isOwn = computed(() => Boolean(user.value && reader.value && user.value.id === reader.value.id))

const finishedBooks = computed(
	() => reader.value?.books.filter((b) => b.status === 'finished') ?? [],
)

const inProgressBooks = computed(
	() => reader.value?.books.filter((b) => b.status === 'in_progress') ?? [],
)

function tabFromQuery(): 'books' | 'questions' {
	return route.query.tab === 'questions' ? 'questions' : 'books'
}

function setTab(tab: 'books' | 'questions') {
	activeTab.value = tab
	const query = { ...route.query }
	if (tab === 'books') delete query.tab
	else query.tab = tab
	void router.replace({ query })
}

function signed(n: number): string {
	return n > 0 ? `+${n}` : `${n}`
}

function openSettings() {
	settingsOpen.value = true
	if (route.query.tab === 'settings') {
		const query = { ...route.query }
		delete query.tab
		void router.replace({ query })
	}
}

function applyMe(me: ReaderMe | null | undefined) {
	if (!me) {
		dashboard.value = null
		questions.value = []
		return
	}
	dashboard.value = me.dashboard
	questions.value = me.questions
	notifyStandings.value = me.notifyStandings
	notifyAnswers.value = me.notifyAnswers
}

async function load() {
	error.value = ''
	const id = String(route.params.id ?? '')
	if (!id) {
		if (route.name === 'profile') {
			loading.value = true
			return
		}
		error.value = 'Missing reader id'
		loading.value = false
		return
	}

	const switching = reader.value?.id !== id
	if (switching) {
		loading.value = true
		reader.value = null
		dashboard.value = null
		questions.value = []
	}

	try {
		const data = await api<{ reader: PublicReader; me: ReaderMe | null }>(
			`/readers/${id}`,
		)
		reader.value = data.reader
		applyMe(data.me)

		activeTab.value = tabFromQuery()
		if (route.query.tab === 'settings' && user.value?.id === data.reader.id) {
			settingsOpen.value = true
		}
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not load reader'
		if (switching) reader.value = null
	} finally {
		loading.value = false
	}
}

async function markUnseenAnswersRead() {
	const unseen = questions.value.filter((q) => q.answer && !q.answerSeen)
	if (!unseen.length) return
	await Promise.all(
		unseen.map((q) => api(`/profile/questions/${q.id}/seen`, { method: 'POST' })),
	)
	for (const q of unseen) q.answerSeen = true
	await fetchUser(true)
}

onMounted(() => {
	void load()
})

watch(
	() => route.params.id,
	() => {
		void load()
	},
)

watch(
	() => route.query.tab,
	(tab) => {
		if (tab === 'settings' && isOwn.value) {
			settingsOpen.value = true
			return
		}
		activeTab.value = tabFromQuery()
	},
)

watch(activeTab, async (tab) => {
	if (tab === 'questions' && isOwn.value) await markUnseenAnswersRead()
})

function onSettingsSaved(settings: {
	notifyStandings: boolean
	notifyAnswers: boolean
	currentlyReading: CurrentlyReading | null
}) {
	notifyStandings.value = settings.notifyStandings
	notifyAnswers.value = settings.notifyAnswers
	if (reader.value) {
		reader.value = { ...reader.value, currentlyReading: settings.currentlyReading }
	}
}

function onCoverUpdated(bookId: string, coverUrl: string | null) {
	if (!reader.value) return
	reader.value = {
		...reader.value,
		books: reader.value.books.map((b) =>
			b.id === bookId ? { ...b, coverUrl } : b,
		),
	}
}

function onAvatarUpdated(avatarUrl: string | null) {
	if (reader.value) {
		reader.value = { ...reader.value, avatarUrl }
	}
}
</script>

<template>
	<main v-if="config" class="page reader-page">
		<div v-if="loading" class="alert alert-info">Loading reader…</div>
		<div v-else-if="error" class="alert alert-error">{{ error }}</div>

		<template v-else-if="reader">
			<header class="reader-header card">
				<div class="header-main">
					<UserAvatar
						:name="reader.displayName"
						:avatar-url="reader.avatarUrl"
						:color="reader.teamColor"
						size="md"
					/>
					<div class="identity">
						<h1 class="page-title">{{ reader.displayName }}</h1>
						<p v-if="isOwn && user?.email" class="email">{{ user.email }}</p>
						<p
							v-if="reader.teamName"
							class="team-pill"
							:style="{ '--c': reader.teamColor ?? undefined }"
						>
							{{ reader.teamIcon }} {{ reader.teamName }}
						</p>
						<p v-else class="muted">
							{{ reader.status === 'pending' ? 'Awaiting realm assignment' : 'No realm' }}
						</p>
					</div>
					<button
						v-if="isOwn"
						type="button"
						class="settings-gear"
						aria-label="Open settings"
						title="Settings"
						@click="openSettings"
					>
						<span class="gear-icon" aria-hidden="true">⚙</span>
						<span class="gear-label">Settings</span>
					</button>
				</div>

				<div v-if="reader.achievements?.length" class="achievements-row">
					<span class="achievements-label">{{
						config.copy.profileAchievementsTitle ?? 'Achievements'
					}}</span>
					<div class="badge-list">
						<span
							v-for="a in reader.achievements"
							:key="a.id"
							class="achievement-badge"
							:class="{ earned: a.earned }"
							:title="a.earned ? `${a.label} — ${a.description}` : `Locked — ${a.description}`"
						>
							<span class="achievement-icon" aria-hidden="true">{{ a.icon ?? '✦' }}</span>
							<span>{{ a.label }}</span>
						</span>
					</div>
				</div>
			</header>

			<div v-if="isOwn && dashboard" class="dashboard-row">
				<div class="dashboard-card card">
					<span class="dashboard-value">{{ dashboard.booksLogged }}</span>
					<span class="dashboard-label">{{ config.copy.profileStatBooks }}</span>
				</div>
				<div class="dashboard-card card">
					<span class="dashboard-value">{{ signed(dashboard.pointsContributed) }}</span>
					<span class="dashboard-label">{{ config.copy.profileStatPoints }}</span>
				</div>
				<div class="dashboard-card card">
					<span class="dashboard-value">{{ dashboard.sabotageDealt }}</span>
					<span class="dashboard-label">{{ config.copy.profileStatSabotageDealt }}</span>
				</div>
				<div class="dashboard-card card">
					<span class="dashboard-value">{{ dashboard.sabotageTaken }}</span>
					<span class="dashboard-label">{{ config.copy.profileStatSabotageTaken }}</span>
				</div>
				<div class="dashboard-card card">
					<span class="dashboard-value">{{ dashboard.streakWeeks }}</span>
					<span class="dashboard-label">{{ config.copy.profileStatStreak }}</span>
				</div>
			</div>

			<div v-if="isOwn && dashboard?.vsTeam" class="vs-team-row">
				<span :class="dashboard.vsTeam.booksDelta >= 0 ? 'positive' : 'negative'">
					{{ t(config.copy.profileVsRealmBooks, { delta: signed(dashboard.vsTeam.booksDelta) }) }}
				</span>
				<span :class="dashboard.vsTeam.pointsDelta >= 0 ? 'positive' : 'negative'">
					{{ t(config.copy.profileVsRealmPoints, { delta: signed(dashboard.vsTeam.pointsDelta) }) }}
				</span>
			</div>

			<section v-if="!isOwn" class="stats-row">
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

			<nav v-if="isOwn" class="profile-tabs" aria-label="Profile sections">
				<button type="button" :class="{ active: activeTab === 'books' }" @click="setTab('books')">
					{{ config.copy.profileBooksTab }}
					<span v-if="finishedBooks.length" class="tab-count">{{ finishedBooks.length }}</span>
				</button>
				<button
					type="button"
					:class="{ active: activeTab === 'questions' }"
					@click="setTab('questions')"
				>
					{{ config.copy.profileQuestionsTab }}
					<span v-if="questions.length" class="tab-count">{{ questions.length }}</span>
				</button>
			</nav>

			<template v-if="!isOwn || activeTab === 'books'">
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
							<p class="hint">
								{{ config.copy.readerCurrentlyReadingHint ?? 'Not scored — just vibes.' }}
							</p>
						</div>
					</div>
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
							<BookCoverEditor
								v-if="isOwn"
								:submission-id="b.id"
								:title="b.bookTitle"
								:author="b.bookAuthor"
								:cover-url="b.coverUrl"
								editable
								@updated="(url) => onCoverUpdated(b.id, url)"
							/>
							<BookCover
								v-else
								:title="b.bookTitle"
								:author="b.bookAuthor"
								:cover-url="b.coverUrl"
							/>
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
						<p>{{ config.copy.readerNoBooks ?? 'No challenge books logged yet.' }}</p>
						<RouterLink
							v-if="isOwn && user?.status === 'assigned'"
							to="/submit"
							class="btn btn-primary"
						>
							Submit your first book
						</RouterLink>
					</div>
					<ul v-else class="book-list">
						<li v-for="b in finishedBooks" :key="b.id" class="book card scored-book">
							<BookCoverEditor
								v-if="isOwn"
								:submission-id="b.id"
								:title="b.bookTitle"
								:author="b.bookAuthor"
								:cover-url="b.coverUrl"
								editable
								@updated="(url) => onCoverUpdated(b.id, url)"
							/>
							<BookCover
								v-else
								:title="b.bookTitle"
								:author="b.bookAuthor"
								:cover-url="b.coverUrl"
							/>
							<div class="book-body">
								<div class="book-top">
									<div>
										<h3>{{ b.bookTitle }}</h3>
										<p class="muted">
											by {{ b.bookAuthor }} · {{ b.pageCount }} pages · {{ b.format }}
										</p>
									</div>
									<span
										v-if="isOwn"
										class="badge"
										:class="b.submissionType === 'add' ? 'badge-positive' : 'badge-negative'"
									>
										{{ b.submissionType === 'add' ? 'Add points' : 'Sabotage' }}
									</span>
								</div>

								<div v-if="isOwn && b.totalImpact != null" class="scores">
									<div class="score-item">
										<span class="label">Prompts</span>
										<span class="value"
											>{{ (b.promptPoints ?? 0) > 0 ? '+' : '' }}{{ b.promptPoints ?? 0 }}</span
										>
									</div>
									<div class="score-item">
										<span class="label">Page bonus</span>
										<span class="value">+{{ b.pageBonus ?? 0 }}</span>
									</div>
									<div v-if="b.bonusPoints" class="score-item">
										<span class="label">Bonuses</span>
										<span class="value"
											>{{ b.bonusPoints > 0 ? '+' : '' }}{{ b.bonusPoints }}</span
										>
									</div>
									<div class="score-item total">
										<span class="label">Total</span>
										<span class="value"
											>{{ b.totalImpact > 0 ? '+' : '' }}{{ b.totalImpact }}</span
										>
									</div>
								</div>

								<p v-if="isOwn && b.targetTeamId" class="target">
									Attacked {{ getTeam(b.targetTeamId)?.name }}
								</p>
								<p v-if="b.startedAt || b.finishedAt" class="dates">
									<template v-if="b.startedAt && b.finishedAt">
										Read {{ b.startedAt }} → {{ b.finishedAt }}
									</template>
									<template v-else-if="b.finishedAt">Finished {{ b.finishedAt }}</template>
									<template v-else>Started {{ b.startedAt }}</template>
								</p>
								<time v-if="isOwn">Submitted {{ new Date(b.createdAt).toLocaleString() }}</time>
							</div>
						</li>
					</ul>
				</section>
			</template>

			<section v-else-if="isOwn && activeTab === 'questions'" class="questions-section">
				<div v-if="questions.length === 0" class="card empty">
					<p>You haven't asked any questions yet.</p>
					<RouterLink to="/faq" class="btn btn-primary">Go to FAQ</RouterLink>
				</div>
				<ul v-else class="question-list">
					<li
						v-for="q in questions"
						:key="q.id"
						class="question-card card"
						:class="{ 'has-new-answer': q.answer && !q.answerSeen }"
					>
						<div class="question-meta">
							<time>{{ new Date(q.createdAt).toLocaleString() }}</time>
							<span class="badge" :class="q.answer ? 'badge-positive' : 'badge-negative'">
								{{ q.answer ? 'Answered' : 'Pending' }}
							</span>
						</div>
						<p class="question-text">{{ q.message }}</p>
						<div v-if="q.answer" class="answer-box">
							<p class="answer-label">Reply from {{ q.answeredByName }}</p>
							<p class="answer-text">{{ q.answer }}</p>
							<time v-if="q.answeredAt" class="answer-time">
								{{ new Date(q.answeredAt).toLocaleString() }}
							</time>
						</div>
						<p v-else class="pending-note">An admin will reply here when they can.</p>
					</li>
				</ul>
			</section>

			<ProfileSettingsPanel
				:open="settingsOpen"
				:notify-standings="notifyStandings"
				:notify-answers="notifyAnswers"
				:currently-reading="reader.currentlyReading"
				:avatar-url="reader.avatarUrl"
				:display-name="reader.displayName"
				:team-color="reader.teamColor"
				@close="settingsOpen = false"
				@saved="onSettingsSaved"
				@avatar-updated="onAvatarUpdated"
			/>
		</template>
	</main>
</template>

<style scoped>
.reader-header {
	margin-bottom: 1.25rem;
	padding: 1.15rem 1.25rem;
}

.header-main {
	display: grid;
	grid-template-columns: auto 1fr auto;
	gap: 1rem;
	align-items: center;
}

.page-title {
	margin: 0 0 0.2rem;
	font-size: 1.65rem;
}

.email {
	margin: 0 0 0.35rem;
	color: var(--realm-text-muted);
	font-size: 0.9rem;
}

.team-pill {
	display: inline-block;
	margin: 0.15rem 0 0;
	padding: 0.2rem 0.65rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--c) 22%, transparent);
	border: 1px solid color-mix(in srgb, var(--c) 50%, var(--realm-border));
	font-size: 0.85rem;
}

.settings-gear {
	justify-self: end;
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.45rem 0.75rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: color-mix(in srgb, var(--realm-surface-alt, var(--realm-bg)) 80%, transparent);
	color: var(--realm-text);
	cursor: pointer;
	font-size: 0.85rem;
	font-weight: 600;
	transition:
		border-color 0.15s ease,
		background 0.15s ease,
		transform 0.15s ease;
}

.settings-gear:hover {
	border-color: color-mix(in srgb, var(--realm-accent) 55%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 12%, transparent);
	transform: translateY(-1px);
}

.gear-icon {
	font-size: 1.1rem;
	line-height: 1;
}

.achievements-row {
	margin-top: 1.1rem;
	padding-top: 1rem;
	border-top: 1px solid var(--realm-border);
}

.achievements-label {
	display: block;
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--realm-text-muted);
	margin-bottom: 0.5rem;
}

.badge-list {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.achievement-badge {
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

.achievement-badge.earned {
	opacity: 1;
	color: var(--realm-text);
	border-color: color-mix(in srgb, var(--realm-accent) 50%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 18%, transparent);
}

.dashboard-row {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
	gap: 0.85rem;
	margin-bottom: 0.75rem;
}

.dashboard-card {
	text-align: center;
	padding: 0.9rem 0.75rem;
}

.dashboard-value {
	display: block;
	font-family: var(--font-display);
	font-size: 1.45rem;
	color: var(--realm-accent-glow);
	font-weight: 700;
}

.dashboard-label {
	font-size: 0.75rem;
	color: var(--realm-text-muted);
}

.vs-team-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem 1.25rem;
	margin-bottom: 1rem;
	font-size: 0.88rem;
}

.vs-team-row .positive {
	color: var(--realm-success);
}

.vs-team-row .negative {
	color: var(--realm-accent);
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

.profile-tabs {
	display: flex;
	gap: 0.35rem;
	margin-bottom: 1.15rem;
	flex-wrap: wrap;
}

.profile-tabs button {
	appearance: none;
	border: 1px solid var(--realm-border);
	background: transparent;
	color: var(--realm-text-muted);
	padding: 0.45rem 0.85rem;
	border-radius: 999px;
	cursor: pointer;
	font-size: 0.88rem;
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
}

.profile-tabs button.active {
	color: var(--realm-text);
	border-color: color-mix(in srgb, var(--realm-accent) 50%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 14%, transparent);
}

.tab-count {
	font-size: 0.75rem;
	opacity: 0.8;
}

.muted,
.hint,
.dates {
	color: var(--realm-text-muted);
	font-size: 0.9rem;
}

.currently-reading,
.pace,
.books-section {
	margin-bottom: 1.25rem;
}

.currently-reading h2,
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

.book-list,
.question-list {
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

.book-body {
	flex: 1;
	min-width: 0;
}

.book-top {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 0.75rem;
	margin-bottom: 0.55rem;
}

.book h3 {
	margin: 0 0 0.2rem;
	font-size: 1rem;
	color: var(--realm-text);
	font-family: var(--font-display);
}

.scores {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
	gap: 0.75rem;
	margin-bottom: 0.65rem;
	padding: 0.75rem;
	background: var(--realm-bg);
	border-radius: var(--radius);
}

.score-item {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.score-item .label {
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--realm-text-muted);
}

.score-item .value {
	font-weight: 700;
	color: var(--realm-text);
}

.score-item.total .value {
	color: var(--realm-accent-glow);
}

.target {
	font-size: 0.82rem;
	color: var(--realm-accent);
	margin-bottom: 0.25rem;
}

time {
	font-size: 0.75rem;
	color: var(--realm-text-muted);
	opacity: 0.7;
}

.empty {
	padding: 1.25rem;
	color: var(--realm-text-muted);
	text-align: center;
}

.empty .btn {
	margin-top: 0.75rem;
}

.question-card.has-new-answer {
	border-color: color-mix(in srgb, var(--realm-success) 45%, var(--realm-border));
}

.question-meta {
	display: flex;
	justify-content: space-between;
	gap: 0.75rem;
	margin-bottom: 0.5rem;
}

.question-text {
	margin: 0 0 0.65rem;
	color: var(--realm-text);
}

.answer-box {
	padding: 0.75rem;
	border-radius: var(--radius);
	background: color-mix(in srgb, var(--realm-success) 10%, var(--realm-bg));
	border: 1px solid color-mix(in srgb, var(--realm-success) 30%, var(--realm-border));
}

.answer-label {
	margin: 0 0 0.35rem;
	font-size: 0.78rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--realm-text-muted);
}

.answer-text {
	margin: 0;
	color: var(--realm-text);
}

.pending-note {
	margin: 0;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

@media (max-width: 640px) {
	.header-main {
		grid-template-columns: auto 1fr;
	}

	.settings-gear {
		grid-column: 1 / -1;
		justify-self: stretch;
		justify-content: center;
	}

	.dashboard-row {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.stats-row {
		grid-template-columns: 1fr;
	}

	.book-top {
		flex-direction: column;
		align-items: flex-start;
	}

	.scored-book {
		flex-direction: column;
	}

	.scores {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.profile-tabs {
		width: 100%;
	}

	.profile-tabs button {
		flex: 1;
		justify-content: center;
	}
}
</style>
