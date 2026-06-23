<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, type Submission, type UserQuestion } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'

type Tab = 'books' | 'questions' | 'settings'

const route = useRoute()
const router = useRouter()
const { user, fetchUser } = useAuth()
const { config, loadConfig, teamBrand } = useConfig()

const activeTab = ref<Tab>('books')
const submissions = ref<Submission[]>([])
const questions = ref<UserQuestion[]>([])
const notifyStandings = ref(true)
const notifyAnswers = ref(true)
const loading = ref(true)
const saving = ref(false)
const message = ref('')

const totalImpact = computed(() =>
  submissions.value.reduce((sum, s) => sum + s.totalImpact, 0),
)

function tabFromQuery(): Tab {
  const t = route.query.tab
  if (t === 'questions' || t === 'settings' || t === 'books') return t
  return 'books'
}

function setTab(tab: Tab) {
  activeTab.value = tab
  router.replace({ query: { tab } })
}

onMounted(async () => {
  activeTab.value = tabFromQuery()
  await Promise.all([loadConfig(), loadProfile()])
})

watch(() => route.query.tab, () => {
  activeTab.value = tabFromQuery()
})

watch(activeTab, async (tab) => {
  if (tab === 'questions') await markUnseenAnswersRead()
})

async function loadProfile() {
  loading.value = true
  message.value = ''
  try {
    const data = await api<{
      user: {
        notifyStandings: boolean
        notifyAnswers: boolean
      }
      submissions: Submission[]
      questions: UserQuestion[]
    }>('/profile')

    submissions.value = data.submissions
    questions.value = data.questions
    notifyStandings.value = data.user.notifyStandings
    notifyAnswers.value = data.user.notifyAnswers
  } finally {
    loading.value = false
  }
}

async function markUnseenAnswersRead() {
  const unseen = questions.value.filter((q) => q.answer && !q.answerSeen)
  await Promise.all(
    unseen.map((q) => api(`/profile/questions/${q.id}/seen`, { method: 'POST' })),
  )
  for (const q of unseen) q.answerSeen = true
  await fetchUser()
}

async function saveSettings() {
  saving.value = true
  message.value = ''
  try {
    await api('/profile/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        notifyStandings: notifyStandings.value,
        notifyAnswers: notifyAnswers.value,
      }),
    })
    message.value = 'Settings saved.'
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="page profile-page">
    <header class="profile-header card">
      <div class="profile-identity">
        <div class="avatar">{{ user?.displayName?.charAt(0)?.toUpperCase() ?? '?' }}</div>
        <div>
          <h1 class="page-title">{{ user?.displayName }}</h1>
          <p class="profile-email">{{ user?.email }}</p>
          <div v-if="user?.teamId && config" class="team-pill" :style="{ '--c': teamBrand(user.teamId)?.color }">
            {{ teamBrand(user.teamId)?.icon }} {{ teamBrand(user.teamId)?.name }}
          </div>
          <p v-else-if="user?.status === 'pending'" class="status-note">Awaiting team assignment</p>
        </div>
      </div>
    </header>

    <nav class="profile-tabs" aria-label="Profile sections">
      <button type="button" :class="{ active: activeTab === 'books' }" @click="setTab('books')">
        My Books
        <span v-if="submissions.length" class="tab-count">{{ submissions.length }}</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'questions' }" @click="setTab('questions')">
        My Questions
        <span v-if="questions.length" class="tab-count">{{ questions.length }}</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'settings' }" @click="setTab('settings')">
        Notifications
      </button>
    </nav>

    <div v-if="loading" class="alert alert-info">Loading profile…</div>

    <!-- Books -->
    <section v-else-if="activeTab === 'books'">
      <div v-if="submissions.length" class="stats-row">
        <div class="stat-card card">
          <span class="stat-value">{{ submissions.length }}</span>
          <span class="stat-label">Books submitted</span>
        </div>
        <div class="stat-card card">
          <span class="stat-value">{{ totalImpact > 0 ? '+' : '' }}{{ totalImpact }}</span>
          <span class="stat-label">Total XP impact</span>
        </div>
      </div>

      <div v-if="submissions.length === 0" class="card empty-state">
        <p>No submissions yet.</p>
        <RouterLink v-if="user?.status === 'assigned'" to="/submit" class="btn btn-primary">
          Submit your first book
        </RouterLink>
      </div>

      <ul v-else class="reads-list">
        <li v-for="sub in submissions" :key="sub.id" class="read-card card">
          <div class="read-header">
            <div>
              <h3>{{ sub.bookTitle }}</h3>
              <p class="author">by {{ sub.bookAuthor }} · {{ sub.pageCount }} pages · {{ sub.format }}</p>
            </div>
            <span class="badge" :class="sub.submissionType === 'add' ? 'badge-positive' : 'badge-negative'">
              {{ sub.submissionType === 'add' ? 'Add XP' : 'Sabotage' }}
            </span>
          </div>
          <div class="scores">
            <div class="score-item">
              <span class="label">Prompts</span>
              <span class="value">{{ sub.promptPoints > 0 ? '+' : '' }}{{ sub.promptPoints }}</span>
            </div>
            <div class="score-item">
              <span class="label">Page bonus</span>
              <span class="value">+{{ sub.pageBonus }}</span>
            </div>
            <div v-if="sub.bonusPoints" class="score-item">
              <span class="label">Bonuses</span>
              <span class="value">{{ sub.bonusPoints > 0 ? '+' : '' }}{{ sub.bonusPoints }}</span>
            </div>
            <div class="score-item total">
              <span class="label">Total</span>
              <span class="value">{{ sub.totalImpact > 0 ? '+' : '' }}{{ sub.totalImpact }}</span>
            </div>
          </div>
          <p v-if="sub.targetTeamId && config" class="target">
            Attacked {{ config.branding.teams[sub.targetTeamId]?.name }}
          </p>
          <p v-if="sub.startedAt || sub.finishedAt" class="dates">
          <template v-if="sub.startedAt && sub.finishedAt">Read {{ sub.startedAt }} → {{ sub.finishedAt }}</template>
          <template v-else-if="sub.startedAt">Started {{ sub.startedAt }}</template>
          <template v-else>Finished {{ sub.finishedAt }}</template>
        </p>
          <time>Submitted {{ new Date(sub.createdAt).toLocaleString() }}</time>
        </li>
      </ul>
    </section>

    <!-- Questions -->
    <section v-else-if="activeTab === 'questions'">
      <div v-if="questions.length === 0" class="card empty-state">
        <p>You haven't asked any questions yet.</p>
        <RouterLink to="/faq" class="btn btn-primary">Go to FAQ</RouterLink>
      </div>

      <ul v-else class="question-list">
        <li v-for="q in questions" :key="q.id" class="question-card card" :class="{ 'has-new-answer': q.answer && !q.answerSeen }">
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

    <!-- Settings -->
    <section v-else class="card settings-card">
      <h2>Notification preferences</h2>
      <p class="section-desc">Choose what you'd like to be notified about. (Email delivery can be wired up later.)</p>

      <div v-if="message" class="alert" :class="message.includes('saved') ? 'alert-success' : 'alert-error'">
        {{ message }}
      </div>

      <label class="setting-row">
        <input v-model="notifyStandings" type="checkbox" />
        <div>
          <strong>Standings published</strong>
          <span>When admins publish new weekly standings</span>
        </div>
      </label>

      <label class="setting-row">
        <input v-model="notifyAnswers" type="checkbox" />
        <div>
          <strong>Question answered</strong>
          <span>When an admin replies to a question you asked</span>
        </div>
      </label>

      <button type="button" class="btn btn-primary" :disabled="saving" @click="saveSettings">
        {{ saving ? 'Saving…' : 'Save Settings' }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.profile-header {
  margin-bottom: 1.5rem;
}

.profile-identity {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.avatar {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--realm-accent), #a84030);
  color: white;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  flex-shrink: 0;
}

.profile-page .page-title {
  margin-bottom: 0.2rem;
  font-size: 1.75rem;
}

.profile-email {
  color: var(--realm-text-muted);
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.team-pill {
  display: inline-block;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c) 50%, var(--realm-border));
  background: color-mix(in srgb, var(--c) 12%, var(--realm-surface));
  color: var(--c);
  font-weight: 600;
  font-size: 0.85rem;
}

.status-note {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}

.profile-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.profile-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  background: var(--realm-surface);
  color: var(--realm-text-muted);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.profile-tabs button.active {
  background: rgba(212, 99, 74, 0.12);
  border-color: var(--realm-accent);
  color: var(--realm-accent-glow);
}

.tab-count {
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--realm-bg);
  color: var(--realm-text-muted);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  text-align: center;
  padding: 1rem;
}

.stat-value {
  display: block;
  font-family: var(--font-display);
  font-size: 1.75rem;
  color: var(--realm-accent-glow);
  font-weight: 700;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--realm-text-muted);
}

.empty-state {
  text-align: center;
  padding: 2.5rem;
}

.empty-state p {
  margin-bottom: 1rem;
  color: var(--realm-text-muted);
}

.reads-list,
.question-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
  margin: 0;
}

.read-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.read-header h3 {
  color: var(--realm-text);
  font-family: var(--font-display);
  font-size: 1.1rem;
}

.author {
  color: var(--realm-text-muted);
  font-size: 0.88rem;
  margin-top: 0.2rem;
}

.scores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.75rem;
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

.target,
.dates {
  font-size: 0.82rem;
  color: var(--realm-text-muted);
  margin-bottom: 0.25rem;
}

.target {
  color: var(--realm-accent);
}

time {
  font-size: 0.75rem;
  color: var(--realm-text-muted);
  opacity: 0.7;
}

.question-card.has-new-answer {
  border-color: rgba(110, 207, 138, 0.45);
}

.question-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.question-text {
  color: var(--realm-text);
  line-height: 1.65;
  white-space: pre-wrap;
  margin-bottom: 0.85rem;
}

.answer-box {
  padding: 1rem;
  background: rgba(110, 207, 138, 0.06);
  border: 1px solid rgba(110, 207, 138, 0.25);
  border-radius: var(--radius);
}

.answer-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--realm-success);
  margin-bottom: 0.35rem;
}

.answer-text {
  color: var(--realm-text);
  line-height: 1.65;
  white-space: pre-wrap;
}

.answer-time {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.pending-note {
  font-size: 0.88rem;
  color: var(--realm-text-muted);
  font-style: italic;
}

.settings-card h2 {
  font-family: var(--font-display);
  color: var(--realm-text);
  margin-bottom: 0.35rem;
  font-size: 1.15rem;
}

.section-desc {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  margin-bottom: 1.25rem;
}

.setting-row {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
  background: var(--realm-bg);
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
  cursor: pointer;
}

.setting-row input {
  width: auto;
  margin-top: 0.2rem;
}

.setting-row strong {
  display: block;
  color: var(--realm-text);
  margin-bottom: 0.15rem;
}

.setting-row span {
  font-size: 0.85rem;
  color: var(--realm-text-muted);
}
</style>
