<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  api,
  downloadFile,
  type AdminQuestion,
  type AdminStandingsData,
  type AdminSubmission,
  type PublicUser,
  type PublishedWeek,
  type StandingsHistoryEntry,
  type TeamStanding,
} from '../lib/api'
import StandingsPanel from '../components/StandingsPanel.vue'
import AdminPromptsPanel from '../components/AdminPromptsPanel.vue'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'

const { config, loadConfig } = useConfig()
const { t } = useCopy()
const users = ref<PublicUser[]>([])
const pending = ref(0)
const submissions = ref<AdminSubmission[]>([])
const questions = ref<AdminQuestion[]>([])
const unreadQuestions = ref(0)
const standings = ref<TeamStanding[] | null>(null)
const standingsSvg = ref<string | null>(null)
const activeWeeks = ref<PublishedWeek[]>([])
const standingsHistory = ref<StandingsHistoryEntry[]>([])
const answerModal = ref<AdminQuestion | null>(null)
const editSubmission = ref<AdminSubmission | null>(null)
const editDraft = ref({
  bookTitle: '',
  bookAuthor: '',
  pageCount: 1,
  format: 'ebook',
  startedAt: '',
  finishedAt: '',
  submissionType: 'add' as 'add' | 'sabotage',
  targetTeamId: '',
  promptIds: [] as string[],
  bonusCompetition: false,
  bonusTeamPromptIds: [] as string[],
})
const modalDraft = ref('')
const inboxFilter = ref<'unread' | 'read' | 'all'>('unread')
const message = ref('')
const loading = ref('')
const activeTab = ref<'inbox' | 'teams' | 'standings' | 'users' | 'submissions' | 'prompts'>('inbox')

onMounted(loadAll)

watch(activeTab, (tab) => {
  if (tab === 'standings') loadStandings()
})

const sortedQuestions = computed(() =>
  [...questions.value].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'unread' ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  }),
)

const filteredQuestions = computed(() => {
  if (inboxFilter.value === 'unread') {
    return sortedQuestions.value.filter((q) => q.status === 'unread')
  }
  if (inboxFilter.value === 'read') {
    return sortedQuestions.value.filter((q) => q.status !== 'unread')
  }
  return sortedQuestions.value
})

async function loadAll() {
  const [u, s, q] = await Promise.all([
    api<{ users: PublicUser[]; pending: number; assigned: number }>('/admin/users'),
    api<{ submissions: AdminSubmission[] }>('/admin/submissions'),
    api<{ questions: AdminQuestion[]; unread: number }>('/admin/questions'),
  ])
  users.value = u.users
  pending.value = u.pending
  submissions.value = s.submissions
  questions.value = q.questions
  unreadQuestions.value = q.unread
  if (q.unread > 0) activeTab.value = 'inbox'
}

async function assignTeams() {
  loading.value = 'assign'
  message.value = ''
  try {
    const result = await api<{ assigned: number }>('/admin/assign-teams', { method: 'POST' })
    message.value = `Assigned ${result.assigned} users to teams.`
    await loadAll()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    loading.value = ''
  }
}

async function setUserTeam(userId: string, teamId: string) {
  loading.value = `team-${userId}`
  message.value = ''
  try {
    await api(`/admin/users/${userId}/team`, {
      method: 'PATCH',
      body: JSON.stringify({ teamId: teamId || null }),
    })
    message.value = 'Team updated.'
    await loadAll()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed to update team'
  } finally {
    loading.value = ''
  }
}

async function markQuestion(id: string, status: 'read' | 'unread') {
  await api(`/admin/questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
  await loadAll()
}

async function deleteQuestion(id: string) {
  if (!confirm('Remove this message from the inbox?')) return
  await api(`/admin/questions/${id}`, { method: 'DELETE' })
  message.value = 'Message removed.'
  if (answerModal.value?.id === id) closeAnswerModal()
  await loadAll()
}

function openAnswerModal(q: AdminQuestion) {
  answerModal.value = q
  modalDraft.value = q.answer ?? ''
}

function closeAnswerModal() {
  answerModal.value = null
  modalDraft.value = ''
}

async function submitModalAnswer() {
  if (!answerModal.value) return
  const answer = modalDraft.value.trim()
  if (answer.length < 2) {
    message.value = 'Answer must be at least 2 characters.'
    return
  }
  const id = answerModal.value.id
  loading.value = 'answer'
  message.value = ''
  try {
    await api(`/admin/questions/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    })
    message.value = 'Reply sent to the reader.'
    closeAnswerModal()
    await loadAll()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed to send reply'
  } finally {
    loading.value = ''
  }
}

function openEditSubmission(s: AdminSubmission) {
  editSubmission.value = s
  editDraft.value = {
    bookTitle: s.bookTitle,
    bookAuthor: s.bookAuthor,
    pageCount: s.pageCount,
    format: s.format,
    startedAt: s.startedAt ?? '',
    finishedAt: s.finishedAt ?? '',
    submissionType: s.submissionType,
    targetTeamId: s.targetTeamId ?? '',
    promptIds: [...s.promptIds],
    bonusCompetition: s.bonusCompetition,
    bonusTeamPromptIds: [...s.bonusTeamPromptIds],
  }
}

function closeEditSubmission() {
  editSubmission.value = null
}

async function saveEditSubmission() {
  if (!editSubmission.value) return
  loading.value = `edit-sub-${editSubmission.value.id}`
  message.value = ''
  try {
    await api(`/admin/submissions/${editSubmission.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...editDraft.value,
        targetTeamId:
          editDraft.value.submissionType === 'sabotage' ? editDraft.value.targetTeamId : undefined,
        startedAt: editDraft.value.startedAt || null,
        finishedAt: editDraft.value.finishedAt || null,
      }),
    })
    message.value = 'Submission updated.'
    closeEditSubmission()
    await loadAll()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed to update submission'
  } finally {
    loading.value = ''
  }
}

async function deleteSubmission(id: string, title: string) {
  if (!confirm(`Delete submission "${title}"? This cannot be undone.`)) return
  loading.value = `del-sub-${id}`
  message.value = ''
  try {
    await api(`/admin/submissions/${id}`, { method: 'DELETE' })
    message.value = 'Submission deleted.'
    if (editSubmission.value?.id === id) closeEditSubmission()
    await loadAll()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed to delete submission'
  } finally {
    loading.value = ''
  }
}

async function loadStandings() {
  loading.value = 'standings'
  try {
    const data = await api<AdminStandingsData>('/admin/standings/current')
    standings.value = data.current.standings
    standingsSvg.value = data.current.svg
    activeWeeks.value = data.activeWeeks
    standingsHistory.value = data.history
  } finally {
    loading.value = ''
  }
}

async function publishThisWeek() {
  loading.value = 'publish'
  message.value = ''
  try {
    const result = await api<{ weekLabel: string; emailsSent?: number }>('/admin/standings/publish', { method: 'POST' })
    const emailNote = result.emailsSent ? ` (${result.emailsSent} notification emails sent)` : ''
    message.value = `Published ${result.weekLabel} to the site!${emailNote}`
    await loadStandings()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    loading.value = ''
  }
}

async function unpublishWeek(publicationId: string, weekLabel: string) {
  if (!confirm(`Unpublish ${weekLabel} from the public site?`)) return
  loading.value = 'unpublish'
  message.value = ''
  try {
    await api('/admin/standings/unpublish', {
      method: 'POST',
      body: JSON.stringify({ publicationId }),
    })
    message.value = `${weekLabel} unpublished.`
    await loadStandings()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    loading.value = ''
  }
}

async function downloadCurrentSvg() {
  try {
    const weekKey = activeWeeks.value[0]?.weekKey ?? 'current'
    await downloadFile('/admin/standings/current.svg', `standings-${weekKey}.svg`)
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Download failed'
  }
}

async function downloadHistorySvg(entry: StandingsHistoryEntry) {
  try {
    await downloadFile(
      `/admin/standings/history/${entry.id}.svg`,
      `standings-${entry.weekKey}-${entry.action}.svg`,
    )
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'Download failed'
  }
}
</script>

<template>
  <main v-if="config" class="page admin-page">
    <header class="admin-header">
      <div>
        <h1 class="page-title">{{ config.copy.adminTitle }}</h1>
        <p class="page-lead">{{ config.copy.adminLead }}</p>
      </div>
    </header>

    <div v-if="message" class="alert alert-success">{{ message }}</div>

    <nav class="admin-tabs" aria-label="Admin sections">
      <button
        type="button"
        :class="{ active: activeTab === 'inbox' }"
        @click="activeTab = 'inbox'"
      >
        {{ config.copy.adminTabInbox }}
        <span v-if="unreadQuestions > 0" class="tab-badge">{{ unreadQuestions }}</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'teams' }" @click="activeTab = 'teams'">
        {{ config.copy.adminTabTeams }}
      </button>
      <button type="button" :class="{ active: activeTab === 'standings' }" @click="activeTab = 'standings'">
        {{ config.copy.adminTabStandings }}
      </button>
      <button type="button" :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'">
        {{ config.copy.adminTabParticipants }}
      </button>
      <button type="button" :class="{ active: activeTab === 'submissions' }" @click="activeTab = 'submissions'">
        {{ config.copy.adminTabSubmissions }}
      </button>
      <button type="button" :class="{ active: activeTab === 'prompts' }" @click="activeTab = 'prompts'">
        {{ config.copy.adminTabPrompts }}
      </button>
    </nav>

  <!-- Inbox -->
    <section v-show="activeTab === 'inbox'" class="card admin-section">
      <div class="inbox-header">
        <div>
          <h2>Question Inbox</h2>
          <p class="section-desc">Messages from readers who couldn't find an answer in the FAQ.</p>
        </div>
        <div class="inbox-filters" role="tablist" aria-label="Filter questions">
          <button type="button" :class="{ active: inboxFilter === 'unread' }" @click="inboxFilter = 'unread'">
            Unread
          </button>
          <button type="button" :class="{ active: inboxFilter === 'read' }" @click="inboxFilter = 'read'">
            Read
          </button>
          <button type="button" :class="{ active: inboxFilter === 'all' }" @click="inboxFilter = 'all'">
            All
          </button>
        </div>
      </div>

      <div v-if="filteredQuestions.length === 0" class="empty-inbox">
        <p>{{ questions.length === 0 ? 'No messages yet.' : 'Nothing in this filter.' }}</p>
      </div>

      <ul v-else class="inbox-list">
        <li
          v-for="q in filteredQuestions"
          :key="q.id"
          class="inbox-item"
          :class="{ unread: q.status === 'unread' }"
        >
          <div class="inbox-meta">
            <div>
              <strong>{{ q.displayName }}</strong>
              <span class="inbox-email">{{ q.email }}</span>
            </div>
            <time>{{ new Date(q.createdAt).toLocaleString() }}</time>
          </div>
          <p class="inbox-message">{{ q.message }}</p>

          <div v-if="q.answer" class="existing-answer">
            <p class="answer-label">Your reply</p>
            <p class="answer-text">{{ q.answer }}</p>
            <time v-if="q.answeredAt">{{ new Date(q.answeredAt).toLocaleString() }}</time>
          </div>

          <div class="inbox-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="openAnswerModal(q)"
            >
              {{ q.answer ? 'Update answer' : 'Reply' }}
            </button>
            <button
              v-if="q.status === 'unread'"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="markQuestion(q.id, 'read')"
            >
              Mark read
            </button>
            <button
              v-else-if="q.status === 'read'"
              type="button"
              class="btn btn-ghost btn-sm"
              @click="markQuestion(q.id, 'unread')"
            >
              Mark unread
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="deleteQuestion(q.id)">
              Dismiss
            </button>
          </div>
        </li>
      </ul>
    </section>

    <Teleport to="body">
      <div v-if="answerModal" class="modal-backdrop" @click.self="closeAnswerModal">
        <div class="modal card" role="dialog" aria-labelledby="answer-modal-title">
          <header class="modal-header">
            <h2 id="answer-modal-title">{{ answerModal.answer ? 'Update answer' : 'Send reply' }}</h2>
            <button type="button" class="modal-close" aria-label="Close" @click="closeAnswerModal">×</button>
          </header>
          <div class="modal-body">
            <p class="modal-question">
              <strong>{{ answerModal.displayName }}</strong> asked:
            </p>
            <p class="modal-question-text">{{ answerModal.message }}</p>
            <label class="field">
              Your answer
              <textarea
                v-model="modalDraft"
                rows="5"
                placeholder="Write your answer to the reader…"
                autofocus
              />
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="closeAnswerModal">Cancel</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="loading === 'answer' || modalDraft.trim().length < 2"
                @click="submitModalAnswer"
              >
                {{ loading === 'answer' ? 'Sending…' : answerModal.answer ? 'Update answer' : 'Send answer' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Teams -->
    <section v-show="activeTab === 'teams'" class="admin-grid">
      <section class="card admin-section">
        <h2>{{ config.copy.adminTeamAssignmentTitle }}</h2>
        <p class="stat-line">{{ t(String(config.copy.adminTeamAssignmentLead), { pending }) }}</p>
        <button class="btn btn-primary" :disabled="loading === 'assign' || pending === 0" @click="assignTeams">
          {{ loading === 'assign' ? config.copy.adminAssigning : config.copy.adminAssignTeams }}
        </button>
      </section>

      <section class="card admin-section">
        <h2>Quick Stats</h2>
        <ul class="quick-stats">
          <li><strong>{{ users.length }}</strong> total users</li>
          <li><strong>{{ users.filter((u) => u.status === 'assigned').length }}</strong> assigned</li>
          <li><strong>{{ submissions.length }}</strong> book submissions</li>
          <li><strong>{{ unreadQuestions }}</strong> unread messages</li>
        </ul>
      </section>
    </section>

    <!-- Standings -->
    <section v-show="activeTab === 'standings'" class="admin-section">
      <div class="card standings-actions">
        <div class="standings-actions-top">
          <div>
            <h2>Current Standings</h2>
            <p class="section-desc">Live standings from all submissions. Publish to make them visible on the site.</p>
          </div>
          <div class="btn-row">
            <button
              class="btn btn-primary"
              :disabled="loading === 'publish' || !standings?.length"
              @click="publishThisWeek"
            >
              {{ loading === 'publish' ? 'Publishing…' : 'Publish This Week' }}
            </button>
            <button
              class="btn btn-secondary"
              :disabled="!standingsSvg"
              @click="downloadCurrentSvg"
            >
              Download SVG
            </button>
          </div>
        </div>

        <div v-if="activeWeeks.length" class="active-weeks">
          <h3>Published on site</h3>
          <ul class="week-list">
            <li v-for="week in activeWeeks" :key="week.id" class="week-item">
              <div>
                <strong>{{ week.weekLabel }}</strong>
                <span class="week-meta">Published {{ new Date(week.publishedAt).toLocaleString() }}</span>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="loading === 'unpublish'"
                @click="unpublishWeek(week.id, week.weekLabel)"
              >
                Unpublish
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="loading === 'standings'" class="alert alert-info">Loading standings…</div>
      <StandingsPanel
        v-else-if="standings"
        :standings="standings"
        :svg="standingsSvg"
        title="Live Standings"
      />

      <section class="card admin-section history-section">
        <h2>Publish History</h2>
        <p class="section-desc">Every time standings were published or unpublished.</p>

        <div v-if="standingsHistory.length === 0" class="empty-inbox">
          <p>No publish history yet.</p>
        </div>

        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Week</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in standingsHistory" :key="entry.id">
                <td>{{ new Date(entry.createdAt).toLocaleString() }}</td>
                <td>
                  <span class="badge" :class="entry.action === 'published' ? 'badge-positive' : 'badge-negative'">
                    {{ entry.action }}
                  </span>
                </td>
                <td>{{ entry.weekLabel }}</td>
                <td>
                  {{ entry.adminName }}
                  <br />
                  <small>{{ entry.adminEmail }}</small>
                </td>
                <td>
                  <button type="button" class="btn btn-ghost btn-sm" @click="downloadHistorySvg(entry)">
                    Download SVG
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>

    <!-- Participants -->
    <section v-show="activeTab === 'users'" class="card admin-section">
      <h2>{{ config.copy.adminParticipantsTitle }}</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>{{ config.copy.adminTeamColumn }}</th>
              <th>Status</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.displayName }}</td>
              <td>{{ u.email }}</td>
              <td>
                <select
                  class="team-select"
                  :value="u.teamId ?? ''"
                  :disabled="loading === `team-${u.id}`"
                  @change="setUserTeam(u.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ config.copy.adminUnassignedOption }}</option>
                  <option v-for="team in config.teams" :key="team.id" :value="team.id">
                    {{ team.icon }} {{ team.name }}
                  </option>
                </select>
              </td>
              <td>
                <span class="badge" :class="u.status === 'assigned' ? 'badge-positive' : 'badge-negative'">
                  {{ u.status }}
                </span>
              </td>
              <td>{{ u.isAdmin ? '✓' : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Submissions -->
    <section v-show="activeTab === 'submissions'" class="card admin-section">
      <h2>All Submissions</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Reader</th>
              <th>Type</th>
              <th>Impact</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in submissions" :key="s.id">
              <td>
                <strong>{{ s.bookTitle }}</strong>
                <br />
                <small>{{ s.bookAuthor }} · {{ s.pageCount }}pg</small>
              </td>
              <td>
                {{ s.userName }}
                <br />
                <small>{{ s.userEmail }}</small>
              </td>
              <td>
                <span class="badge" :class="s.submissionType === 'add' ? 'badge-positive' : 'badge-negative'">
                  {{ s.submissionType }}
                </span>
              </td>
              <td>{{ s.totalImpact > 0 ? '+' : '' }}{{ s.totalImpact }}</td>
              <td>{{ new Date(s.createdAt).toLocaleDateString() }}</td>
              <td class="row-actions">
                <button type="button" class="btn btn-secondary btn-sm" @click="openEditSubmission(s)">
                  Edit
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm danger"
                  :disabled="loading === `del-sub-${s.id}`"
                  @click="deleteSubmission(s.id, s.bookTitle)"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint">Manage prompts in the Prompts tab. Event copy still lives in <code>data/realmathon.json</code>.</p>
    </section>

    <AdminPromptsPanel
      v-show="activeTab === 'prompts'"
      @message="(text) => { message = text; loadConfig(true) }"
    />

    <!-- Edit submission modal -->
    <div v-if="editSubmission" class="modal-backdrop" @click.self="closeEditSubmission">
      <div class="modal card edit-sub-modal">
        <h2>Edit submission</h2>
        <p class="section-desc">
          {{ editSubmission.userName }} — prompts and bonuses are kept; update book details and type.
        </p>
        <form class="edit-sub-form" @submit.prevent="saveEditSubmission">
          <label>
            Title
            <input v-model="editDraft.bookTitle" type="text" required />
          </label>
          <label>
            Author
            <input v-model="editDraft.bookAuthor" type="text" required />
          </label>
          <label>
            Pages
            <input v-model.number="editDraft.pageCount" type="number" min="1" required />
          </label>
          <label>
            Format
            <select v-model="editDraft.format">
              <option value="ebook">Ebook</option>
              <option value="audiobook">Audiobook</option>
              <option value="physical">Physical</option>
            </select>
          </label>
          <label>
            Type
            <select v-model="editDraft.submissionType">
              <option value="add">Add XP</option>
              <option value="sabotage">Sabotage</option>
            </select>
          </label>
          <label v-if="editDraft.submissionType === 'sabotage'">
            Target team
            <select v-model="editDraft.targetTeamId" required>
              <option v-for="team in config?.teams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </label>
          <label>
            Started (optional)
            <input v-model="editDraft.startedAt" type="date" />
          </label>
          <label>
            Finished (optional)
            <input v-model="editDraft.finishedAt" type="date" />
          </label>
          <p class="prompt-note">{{ editDraft.promptIds.length }} prompts selected (unchanged)</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="closeEditSubmission">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="loading.startsWith('edit-sub-')">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.admin-page .page-lead {
  margin-bottom: 0;
}

.admin-header {
  margin-bottom: 1.5rem;
}

.admin-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--realm-border);
}

.admin-tabs button {
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
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.admin-tabs button:hover {
  color: var(--realm-text);
  border-color: rgba(212, 99, 74, 0.4);
}

.admin-tabs button.active {
  background: rgba(212, 99, 74, 0.12);
  border-color: var(--realm-accent);
  color: var(--realm-accent-glow);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--realm-accent);
  color: white;
  font-size: 0.65rem;
}

.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1rem;
}

.admin-section h2 {
  color: var(--realm-text);
  font-family: var(--font-display);
  margin-bottom: 0.5rem;
  font-size: 1.15rem;
}

.section-desc {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  margin-bottom: 1.25rem;
}

.stat-line {
  color: var(--realm-text-muted);
  margin-bottom: 1rem;
}

.quick-stats {
  list-style: none;
  padding: 0;
  margin: 0;
  color: var(--realm-text-muted);
  line-height: 2;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0;
}

.standings-actions {
  margin-bottom: 1.25rem;
}

.standings-actions-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.standings-actions h2 {
  color: var(--realm-text);
  font-family: var(--font-display);
  margin-bottom: 0.35rem;
  font-size: 1.15rem;
}

.active-weeks h3 {
  color: var(--realm-text);
  font-size: 0.95rem;
  margin-bottom: 0.65rem;
  font-family: var(--font-display);
}

.week-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.week-item {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--realm-bg);
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
}

.week-item strong {
  color: var(--realm-text);
  display: block;
}

.week-meta {
  font-size: 0.8rem;
  color: var(--realm-text-muted);
}

.history-section {
  margin-top: 1.25rem;
}

.table-wrap {
  overflow-x: auto;
}

.empty-inbox {
  text-align: center;
  padding: 2rem;
  color: var(--realm-text-muted);
}

.inbox-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.inbox-header h2 {
  margin-bottom: 0.25rem;
}

.inbox-filters {
  display: flex;
  gap: 0.35rem;
  background: var(--realm-bg);
  padding: 0.25rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
}

.inbox-filters button {
  padding: 0.4rem 0.85rem;
  border: none;
  border-radius: calc(var(--radius) - 2px);
  background: transparent;
  color: var(--realm-text-muted);
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.inbox-filters button:hover {
  color: var(--realm-text);
}

.inbox-filters button.active {
  background: rgba(212, 99, 74, 0.15);
  color: var(--realm-accent-glow);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 1000;
}

.modal {
  width: 100%;
  max-width: 32rem;
  padding: 0;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.15rem 1.25rem;
  border-bottom: 1px solid var(--realm-border);
}

.modal-header h2 {
  font-family: var(--font-display);
  color: var(--realm-text);
  font-size: 1.05rem;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: var(--realm-text-muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.25rem;
}

.modal-close:hover {
  color: var(--realm-text);
}

.modal-body {
  padding: 1.25rem;
}

.modal-question {
  color: var(--realm-text-muted);
  font-size: 0.88rem;
  margin-bottom: 0.35rem;
}

.modal-question strong {
  color: var(--realm-text);
}

.modal-question-text {
  color: var(--realm-text);
  line-height: 1.6;
  white-space: pre-wrap;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--realm-bg);
  border-radius: var(--radius);
  font-size: 0.92rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.inbox-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.inbox-item {
  padding: 1rem 1.15rem;
  background: var(--realm-bg);
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
}

.inbox-item.unread {
  border-color: rgba(212, 99, 74, 0.45);
  background: rgba(212, 99, 74, 0.04);
}

.inbox-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}

.inbox-meta strong {
  color: var(--realm-text);
  margin-right: 0.5rem;
}

.inbox-email {
  color: var(--realm-text-muted);
  font-size: 0.85rem;
}

.inbox-meta time {
  color: var(--realm-text-muted);
  font-size: 0.8rem;
}

.inbox-message {
  color: var(--realm-text);
  line-height: 1.65;
  white-space: pre-wrap;
  margin-bottom: 0.85rem;
}

.existing-answer {
  padding: 0.85rem 1rem;
  margin-bottom: 0.85rem;
  background: rgba(110, 207, 138, 0.06);
  border: 1px solid rgba(110, 207, 138, 0.25);
  border-radius: var(--radius);
}

.answer-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--realm-success);
  margin-bottom: 0.35rem;
}

.answer-text {
  color: var(--realm-text);
  line-height: 1.6;
  white-space: pre-wrap;
  margin-bottom: 0.35rem;
}

.existing-answer time {
  font-size: 0.75rem;
  color: var(--realm-text-muted);
}

.inbox-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.hint {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: var(--realm-text-muted);
}

.team-select {
  min-width: 10rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
}

code {
  color: var(--realm-accent-glow);
}

small {
  color: var(--realm-text-muted);
  font-size: 0.78rem;
}

@media (max-width: 768px) {
  .admin-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
    gap: 0.4rem;
  }

  .admin-tabs button {
    flex-shrink: 0;
    padding: 0.6rem 0.85rem;
    font-size: 0.82rem;
  }

  .standings-actions-top {
    flex-direction: column;
  }

  .standings-actions-top .btn-row {
    width: 100%;
  }

  .standings-actions-top .btn-row .btn {
    flex: 1;
    min-width: calc(50% - 0.4rem);
  }

  .btn-row .btn {
    flex: 1;
    min-width: fit-content;
  }

  .inbox-header {
    flex-direction: column;
  }

  .inbox-filters {
    width: 100%;
    justify-content: stretch;
  }

  .inbox-filters button {
    flex: 1;
    text-align: center;
    padding: 0.55rem 0.5rem;
  }

  .inbox-actions {
    flex-direction: column;
  }

  .inbox-actions .btn {
    width: 100%;
    justify-content: center;
  }

  .week-item {
    flex-direction: column;
    align-items: stretch;
  }

  .week-item .btn {
    width: 100%;
  }

  .modal-actions {
    flex-direction: column-reverse;
  }

  .modal-actions .btn {
    width: 100%;
    justify-content: center;
  }

  .modal-backdrop {
    padding: 1rem;
    align-items: flex-end;
  }

  .modal {
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 12px 12px 0 0;
  }
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.row-actions .danger {
  color: #f08080;
}

.edit-sub-modal {
  max-width: 28rem;
  width: 100%;
}

.edit-sub-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.edit-sub-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.88rem;
  color: var(--realm-text-muted);
}

.prompt-note {
  font-size: 0.85rem;
  color: var(--realm-text-muted);
  margin: 0;
}
</style>
