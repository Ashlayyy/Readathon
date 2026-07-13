<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  api,
  downloadFile,
  type AdminQuestion,
  type AdminSiteSettings,
  type AdminStandingsData,
  type AdminSubmission,
  type AdminUser,
  type PublishedWeek,
  type StandingsHistoryEntry,
  type StandingsBreakdown,
  type TeamStanding,
} from '../lib/api'
import StandingsPanel from '../components/StandingsPanel.vue'
import StandingsBreakdownPanel from '../components/StandingsBreakdownPanel.vue'
import AdminPromptsPanel from '../components/AdminPromptsPanel.vue'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import { useAdminCopy } from '../composables/useAdminCopy'
import { useAuth } from '../composables/useAuth'

const { config, loadConfig } = useConfig()
const { t } = useCopy()
const { admin, section, msg, confirmMsg } = useAdminCopy()
const { user: me } = useAuth()
const users = ref<AdminUser[]>([])
const pending = ref(0)
const showTeamRosters = ref(false)
const discordWebhookUrl = ref('')
const discordWebhookDraft = ref('')
const discordRoleId = ref('')
const discordRoleIdDraft = ref('')
const addUserOpen = ref(false)
const newUser = ref({ displayName: '', email: '', teamId: '' })
const submissions = ref<AdminSubmission[]>([])
const questions = ref<AdminQuestion[]>([])
const unreadQuestions = ref(0)
const standings = ref<TeamStanding[] | null>(null)
const standingsSvg = ref<string | null>(null)
const standingsBreakdown = ref<StandingsBreakdown | null>(null)
const standingsBreakdownSvg = ref<string | null>(null)
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
const messageIsError = ref(false)
const loading = ref('')
const activeTab = ref<'inbox' | 'teams' | 'standings' | 'users' | 'submissions' | 'prompts'>('inbox')

onMounted(async () => {
  await loadConfig()
  showTeamRosters.value = config.value?.site?.showTeamRosters ?? false
  try {
    await Promise.all([loadAll(), loadAdminSettings()])
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('loadFailed'), true)
  }
})

async function loadAdminSettings() {
  try {
    const { settings } = await api<{ settings: AdminSiteSettings }>('/admin/settings')
    discordWebhookUrl.value = settings.discordWebhookUrl ?? ''
    discordWebhookDraft.value = settings.discordWebhookUrl ?? ''
    discordRoleId.value = settings.discordRoleId ?? ''
    discordRoleIdDraft.value = settings.discordRoleId ?? ''
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('settingsLoadFailed'), true)
  }
}

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
    api<{ users: AdminUser[]; pending: number; assigned: number }>('/admin/users'),
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

function showMessage(msg: string, isError = false) {
  message.value = msg
  messageIsError.value = isError && !!msg
}

async function assignTeams() {
  loading.value = 'assign'
  showMessage('')
  try {
    const result = await api<{ assigned: number }>('/admin/assign-teams', { method: 'POST' })
    showMessage(msg('assignedTeams', { count: result.assigned }))
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('assignFailed'), true)
  } finally {
    loading.value = ''
  }
}

async function setUserTeam(userId: string, teamId: string) {
  loading.value = `team-${userId}`
  showMessage('')
  try {
    await api(`/admin/users/${userId}/team`, {
      method: 'PATCH',
      body: JSON.stringify({ teamId: teamId || null }),
    })
    showMessage(msg('teamUpdated'))
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('teamUpdateFailed'), true)
  } finally {
    loading.value = ''
  }
}

async function setUserAdmin(userId: string, isAdmin: boolean) {
  loading.value = `admin-${userId}`
  showMessage('')
  try {
    await api(`/admin/users/${userId}/admin`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    })
    showMessage('Admin status updated.')
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : 'Failed to update admin status', true)
  } finally {
    loading.value = ''
  }
}

async function saveRosterSetting() {
  loading.value = 'roster-setting'
  showMessage('')
  try {
    await api('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ showTeamRosters: showTeamRosters.value }),
    })
    await loadConfig(true)
    showMessage(
      showTeamRosters.value ? msg('rostersPublic') : msg('rostersHidden'),
    )
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('rosterSettingFailed'), true)
    showTeamRosters.value = config.value?.site?.showTeamRosters ?? false
  } finally {
    loading.value = ''
  }
}

async function saveDiscordWebhook() {
  loading.value = 'discord-webhook'
  showMessage('')
  try {
    const { settings } = await api<{ settings: AdminSiteSettings }>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        discordWebhookUrl: discordWebhookDraft.value.trim(),
        discordRoleId: discordRoleIdDraft.value.trim(),
      }),
    })
    discordWebhookUrl.value = settings.discordWebhookUrl
    discordWebhookDraft.value = settings.discordWebhookUrl
    discordRoleId.value = settings.discordRoleId ?? ''
    discordRoleIdDraft.value = settings.discordRoleId ?? ''
    showMessage(
      settings.discordWebhookUrl ? msg('webhookSaved') : msg('webhookRemoved'),
    )
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('webhookFailed'), true)
    discordWebhookDraft.value = discordWebhookUrl.value
    discordRoleIdDraft.value = discordRoleId.value
  } finally {
    loading.value = ''
  }
}

function clearDiscordWebhook() {
  discordWebhookDraft.value = ''
  void saveDiscordWebhook()
}

function clearDiscordRoleId() {
  discordRoleIdDraft.value = ''
  void saveDiscordWebhook()
}

function openAddUser() {
  newUser.value = { displayName: '', email: '', teamId: '' }
  addUserOpen.value = true
}

function closeAddUser() {
  addUserOpen.value = false
}

async function submitAddUser() {
  loading.value = 'add-user'
  showMessage('')
  try {
    await api('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        displayName: newUser.value.displayName,
        email: newUser.value.email,
        teamId: newUser.value.teamId || null,
      }),
    })
    showMessage(msg('userCreated'))
    closeAddUser()
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('userCreateFailed'), true)
  } finally {
    loading.value = ''
  }
}

async function markQuestion(id: string, status: 'read' | 'unread') {
  try {
    await api(`/admin/questions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('messageUpdateFailed'), true)
  }
}

async function deleteQuestion(id: string) {
  if (!confirm(confirmMsg('deleteQuestion'))) return
  try {
    await api(`/admin/questions/${id}`, { method: 'DELETE' })
    showMessage(msg('messageRemoved'))
    if (answerModal.value?.id === id) closeAnswerModal()
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('messageRemoveFailed'), true)
  }
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
    showMessage(msg('answerTooShort'), true)
    return
  }
  const id = answerModal.value.id
  loading.value = 'answer'
  showMessage('')
  try {
    await api(`/admin/questions/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    })
    showMessage(msg('replySent'))
    closeAnswerModal()
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('replyFailed'), true)
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
  showMessage('')
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
    showMessage(msg('submissionUpdated'))
    closeEditSubmission()
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('submissionUpdateFailed'), true)
  } finally {
    loading.value = ''
  }
}

async function deleteSubmission(id: string, title: string) {
  if (!confirm(confirmMsg('deleteSubmission', { title }))) return
  loading.value = `del-sub-${id}`
  showMessage('')
  try {
    await api(`/admin/submissions/${id}`, { method: 'DELETE' })
    showMessage(msg('submissionDeleted'))
    if (editSubmission.value?.id === id) closeEditSubmission()
    await loadAll()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('submissionDeleteFailed'), true)
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
    standingsBreakdown.value = data.current.breakdown
    standingsBreakdownSvg.value = data.current.breakdownSvg
    activeWeeks.value = data.activeWeeks
    standingsHistory.value = data.history
  } finally {
    loading.value = ''
  }
}

async function publishThisWeek() {
  loading.value = 'publish'
  showMessage('')
  try {
    const result = await api<{ weekLabel: string; emailsSent?: number; discordSent?: boolean }>('/admin/standings/publish', { method: 'POST' })
    const emailNote = result.emailsSent
      ? msg('emailNote', { count: result.emailsSent })
      : ''
    const discordNote = result.discordSent ? msg('discordNote') : ''
    showMessage(msg('published', { weekLabel: result.weekLabel, emailNote, discordNote }))
    await loadStandings()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('publishFailed'), true)
  } finally {
    loading.value = ''
  }
}

async function unpublishWeek(publicationId: string, weekLabel: string) {
  if (!confirm(confirmMsg('unpublishWeek', { weekLabel }))) return
  loading.value = 'unpublish'
  showMessage('')
  try {
    await api('/admin/standings/unpublish', {
      method: 'POST',
      body: JSON.stringify({ publicationId }),
    })
    showMessage(msg('unpublished', { weekLabel }))
    await loadStandings()
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('unpublishFailed'), true)
  } finally {
    loading.value = ''
  }
}

async function downloadCurrentSvg() {
  try {
    const weekKey = activeWeeks.value[0]?.weekKey ?? 'current'
    await downloadFile('/admin/standings/current.svg', `standings-${weekKey}.svg`)
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('downloadFailed'), true)
  }
}

async function downloadHistorySvg(entry: StandingsHistoryEntry) {
  try {
    await downloadFile(
      `/admin/standings/history/${entry.id}.svg`,
      `standings-${entry.weekKey}-${entry.action}.svg`,
    )
  } catch (e) {
    showMessage(e instanceof Error ? e.message : msg('downloadFailed'), true)
  }
}
</script>

<template>
  <main v-if="config" class="page admin-page">
    <header class="admin-header">
      <div>
        <h1 class="page-title">{{ admin?.title }}</h1>
        <p class="page-lead">{{ admin?.lead }}</p>
      </div>
    </header>

    <div v-if="message" class="alert" :class="messageIsError ? 'alert-error' : 'alert-success'">{{ message }}</div>

    <nav class="admin-tabs" aria-label="Admin sections">
      <button
        type="button"
        :class="{ active: activeTab === 'inbox' }"
        @click="activeTab = 'inbox'"
      >
        {{ section('tabs').inbox }}
        <span v-if="unreadQuestions > 0" class="tab-badge">{{ unreadQuestions }}</span>
      </button>
      <button type="button" :class="{ active: activeTab === 'teams' }" @click="activeTab = 'teams'">
        {{ section('tabs').teams }}
      </button>
      <button type="button" :class="{ active: activeTab === 'standings' }" @click="activeTab = 'standings'">
        {{ section('tabs').standings }}
      </button>
      <button type="button" :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'">
        {{ section('tabs').users }}
      </button>
      <button type="button" :class="{ active: activeTab === 'submissions' }" @click="activeTab = 'submissions'">
        {{ section('tabs').submissions }}
      </button>
      <button type="button" :class="{ active: activeTab === 'prompts' }" @click="activeTab = 'prompts'">
        {{ section('tabs').prompts }}
      </button>
    </nav>

  <!-- Inbox -->
    <section v-show="activeTab === 'inbox'" class="card admin-section">
      <div class="inbox-header">
        <div>
          <h2>{{ section('inbox').title }}</h2>
          <p class="section-desc">{{ section('inbox').lead }}</p>
        </div>
        <div class="inbox-filters" role="tablist" aria-label="Filter questions">
          <button type="button" :class="{ active: inboxFilter === 'unread' }" @click="inboxFilter = 'unread'">
            {{ section('inbox').filterUnread }}
          </button>
          <button type="button" :class="{ active: inboxFilter === 'read' }" @click="inboxFilter = 'read'">
            {{ section('inbox').filterRead }}
          </button>
          <button type="button" :class="{ active: inboxFilter === 'all' }" @click="inboxFilter = 'all'">
            {{ section('inbox').filterAll }}
          </button>
        </div>
      </div>

      <div v-if="filteredQuestions.length === 0" class="empty-inbox">
        <p>{{ questions.length === 0 ? section('inbox').emptyNone : section('inbox').emptyFilter }}</p>
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
            <p class="answer-label">{{ section('inbox').yourReply }}</p>
            <p class="answer-text">{{ q.answer }}</p>
            <time v-if="q.answeredAt">{{ new Date(q.answeredAt).toLocaleString() }}</time>
          </div>

          <div class="inbox-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="openAnswerModal(q)"
            >
              {{ q.answer ? section('inbox').updateAnswer : section('inbox').reply }}
            </button>
            <button
              v-if="q.status === 'unread'"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="markQuestion(q.id, 'read')"
            >
              {{ section('inbox').markRead }}
            </button>
            <button
              v-else-if="q.status === 'read'"
              type="button"
              class="btn btn-ghost btn-sm"
              @click="markQuestion(q.id, 'unread')"
            >
              {{ section('inbox').markUnread }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="deleteQuestion(q.id)">
              {{ section('inbox').dismiss }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <Teleport to="body">
      <div v-if="answerModal" class="modal-backdrop" @click.self="closeAnswerModal">
        <div class="modal card" role="dialog" aria-labelledby="answer-modal-title">
          <header class="modal-header">
            <h2 id="answer-modal-title">{{ answerModal.answer ? section('inbox').updateAnswer : section('inbox').sendReply }}</h2>
            <button type="button" class="modal-close" :aria-label="section('inbox').close" @click="closeAnswerModal">×</button>
          </header>
          <div class="modal-body">
            <p class="modal-question">
              <strong>{{ answerModal.displayName }}</strong> {{ section('inbox').asked }}
            </p>
            <p class="modal-question-text">{{ answerModal.message }}</p>
            <label class="field">
              {{ section('inbox').answerLabel }}
              <textarea
                v-model="modalDraft"
                rows="5"
                :placeholder="section('inbox').answerPlaceholder"
                autofocus
              />
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" @click="closeAnswerModal">{{ section('inbox').cancel }}</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="loading === 'answer' || modalDraft.trim().length < 2"
                @click="submitModalAnswer"
              >
                {{ loading === 'answer' ? section('inbox').sending : answerModal.answer ? section('inbox').updateAnswer : section('inbox').sendAnswer }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Teams -->
    <section v-show="activeTab === 'teams'" class="admin-grid">
      <section class="card admin-section">
        <h2>{{ section('teams').assignmentTitle }}</h2>
        <p class="stat-line">{{ t(section('teams').assignmentLead, { pending }) }}</p>
        <button class="btn btn-primary" :disabled="loading === 'assign' || pending === 0" @click="assignTeams">
          {{ loading === 'assign' ? section('teams').assigning : section('teams').assignTeams }}
        </button>
      </section>

      <section class="card admin-section">
        <h2>{{ section('teams').quickStatsTitle }}</h2>
        <ul class="quick-stats">
          <li><strong>{{ users.length }}</strong> {{ section('teams').statTotalUsers }}</li>
          <li><strong>{{ users.filter((u) => u.status === 'assigned').length }}</strong> {{ section('teams').statAssigned }}</li>
          <li><strong>{{ submissions.length }}</strong> {{ section('teams').statSubmissions }}</li>
          <li><strong>{{ unreadQuestions }}</strong> {{ section('teams').statUnread }}</li>
        </ul>
      </section>

      <section class="card admin-section">
        <h2>{{ section('teams').rostersLabel }}</h2>
        <p class="section-desc">{{ section('teams').rostersHint }}</p>
        <label class="setting-toggle">
          <input
            v-model="showTeamRosters"
            type="checkbox"
            :disabled="loading === 'roster-setting'"
            @change="saveRosterSetting"
          />
          <span>{{ section('teams').rostersToggle }}</span>
        </label>
      </section>
    </section>

    <!-- Standings -->
    <section v-show="activeTab === 'standings'" class="admin-section">
      <div class="card standings-actions">
        <div class="standings-actions-top">
          <div>
            <h2>{{ section('standings').currentTitle }}</h2>
            <p class="section-desc">{{ section('standings').currentLead }}</p>
          </div>
          <div class="btn-row">
            <button
              class="btn btn-primary"
              :disabled="loading === 'publish' || !standings?.length"
              @click="publishThisWeek"
            >
              {{ loading === 'publish' ? section('standings').publishing : section('standings').publish }}
            </button>
            <button
              class="btn btn-secondary"
              :disabled="!standingsSvg"
              @click="downloadCurrentSvg"
            >
              {{ section('standings').downloadSvg }}
            </button>
          </div>
        </div>

        <div v-if="activeWeeks.length" class="active-weeks">
          <h3>{{ section('standings').publishedTitle }}</h3>
          <ul class="week-list">
            <li v-for="week in activeWeeks" :key="week.id" class="week-item">
              <div>
                <strong>{{ week.weekLabel }}</strong>
                <span class="week-meta">{{ section('standings').publishedAt }} {{ new Date(week.publishedAt).toLocaleString() }}</span>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="loading === 'unpublish'"
                @click="unpublishWeek(week.id, week.weekLabel)"
              >
                {{ section('standings').unpublish }}
              </button>
            </li>
          </ul>
        </div>
      </div>

      <section class="card admin-section discord-webhook-section">
        <h2>{{ section('standings').discordTitle }}</h2>
        <p class="section-desc">{{ section('standings').discordLead }}</p>
        <form class="discord-webhook-form" @submit.prevent="saveDiscordWebhook">
          <label>
            {{ section('standings').webhookLabel }}
            <input
              v-model="discordWebhookDraft"
              type="url"
              :placeholder="section('standings').webhookPlaceholder"
              autocomplete="off"
              spellcheck="false"
              :disabled="loading === 'discord-webhook'"
            />
          </label>
          <label>
            Discord role to ping (optional)
            <input
              v-model="discordRoleIdDraft"
              type="text"
              placeholder="123456789012345678"
              autocomplete="off"
              spellcheck="false"
              inputmode="numeric"
              :disabled="loading === 'discord-webhook'"
            />
          </label>
          <div class="btn-row">
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="
                loading === 'discord-webhook' ||
                (discordWebhookDraft === discordWebhookUrl && discordRoleIdDraft === discordRoleId)
              "
            >
              {{ loading === 'discord-webhook' ? section('standings').saving : section('standings').saveWebhook }}
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :disabled="loading === 'discord-webhook' || !discordWebhookUrl"
              @click="clearDiscordWebhook"
            >
              {{ section('standings').remove }}
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              :disabled="loading === 'discord-webhook' || !discordRoleId"
              @click="clearDiscordRoleId"
            >
              Remove ping role
            </button>
          </div>
          <p v-if="discordWebhookUrl" class="webhook-status">{{ section('standings').webhookConfigured }}</p>
          <p v-if="discordRoleId" class="webhook-status">Ping role configured.</p>
        </form>
      </section>

      <div v-if="loading === 'standings'" class="alert alert-info">{{ section('standings').loading }}</div>
      <StandingsPanel
        v-else-if="standings"
        :standings="standings"
        :svg="standingsSvg"
        :title="section('standings').liveTitle"
      />

      <StandingsBreakdownPanel
        v-if="standingsBreakdown && !loading"
        :breakdown="standingsBreakdown"
        :breakdown-svg="standingsBreakdownSvg"
        :title="section('standings').breakdownTitle"
      />

      <section class="card admin-section history-section">
        <h2>{{ section('standings').historyTitle }}</h2>
        <p class="section-desc">{{ section('standings').historyLead }}</p>

        <div v-if="standingsHistory.length === 0" class="empty-inbox">
          <p>{{ section('standings').historyEmpty }}</p>
        </div>

        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ section('standings').colWhen }}</th>
                <th>{{ section('standings').colAction }}</th>
                <th>{{ section('standings').colWeek }}</th>
                <th>{{ section('standings').colBy }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in standingsHistory" :key="entry.id">
                <td>{{ new Date(entry.createdAt).toLocaleString() }}</td>
                <td>
                  <span class="badge" :class="entry.action === 'published' ? 'badge-positive' : 'badge-negative'">
                    {{ entry.action === 'published' ? section('standings').actionPublished : section('standings').actionUnpublished }}
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
                    {{ section('standings').downloadSvg }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>

    <!-- Users -->
    <section v-show="activeTab === 'users'" class="card admin-section">
      <div class="users-header">
        <div>
          <h2>{{ section('users').title }}</h2>
          <p class="section-desc">{{ t(section('users').summary, { total: users.length, pending, assigned: users.length - pending }) }}</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" @click="openAddUser">
          {{ section('users').addButton }}
        </button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ section('users').colName }}</th>
              <th>{{ section('users').colEmail }}</th>
              <th>{{ section('users').colTeam }}</th>
              <th>{{ section('users').colStatus }}</th>
              <th>{{ section('users').colAdmin }}</th>
              <th>{{ section('users').colJoined }}</th>
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
                  <option value="">{{ section('users').unassigned }}</option>
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
              <td>
                <label class="setting-toggle admin-toggle">
                  <input
                    type="checkbox"
                    :checked="u.isAdmin"
                    :disabled="loading === `admin-${u.id}` || u.id === me?.id"
                    @change="setUserAdmin(u.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ u.isAdmin ? 'Admin' : 'User' }}</span>
                </label>
                <small v-if="u.id === me?.id" class="hint">You can't change your own admin.</small>
              </td>
              <td>
                <time v-if="u.createdAt">{{ new Date(u.createdAt).toLocaleDateString() }}</time>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Add user modal -->
    <div v-if="addUserOpen" class="modal-backdrop" @click.self="closeAddUser">
      <div class="modal card">
        <h2>{{ section('users').addTitle }}</h2>
        <p class="section-desc">{{ section('users').addLead }}</p>
        <form class="add-user-form" @submit.prevent="submitAddUser">
          <label>
            {{ section('users').displayNameLabel }}
            <input v-model="newUser.displayName" type="text" required minlength="2" />
          </label>
          <label>
            {{ section('users').emailLabel }}
            <input v-model="newUser.email" type="email" required autocomplete="off" />
          </label>
          <label>
            {{ section('users').teamOptionalLabel }}
            <select v-model="newUser.teamId">
              <option value="">{{ section('users').unassigned }}</option>
              <option v-for="team in config.teams" :key="team.id" :value="team.id">
                {{ team.icon }} {{ team.name }}
              </option>
            </select>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="closeAddUser">{{ section('inbox').cancel }}</button>
            <button type="submit" class="btn btn-primary" :disabled="loading === 'add-user'">
              {{ loading === 'add-user' ? section('users').creating : section('users').addSubmit }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Submissions -->
    <section v-show="activeTab === 'submissions'" class="card admin-section">
      <h2>{{ section('submissions').title }}</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ section('submissions').colBook }}</th>
              <th>{{ section('submissions').colReader }}</th>
              <th>{{ section('submissions').colType }}</th>
              <th>{{ section('submissions').colImpact }}</th>
              <th>{{ section('submissions').colDate }}</th>
              <th>{{ section('submissions').colActions }}</th>
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
                  {{ section('submissions').edit }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm danger"
                  :disabled="loading === `del-sub-${s.id}`"
                  @click="deleteSubmission(s.id, s.bookTitle)"
                >
                  {{ section('submissions').delete }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="hint">{{ section('submissions').hint }}</p>
    </section>

    <AdminPromptsPanel
      v-show="activeTab === 'prompts'"
      @message="(text, isError) => { showMessage(text, isError); loadConfig(true) }"
    />

    <!-- Edit submission modal -->
    <div v-if="editSubmission" class="modal-backdrop" @click.self="closeEditSubmission">
      <div class="modal card edit-sub-modal">
        <h2>{{ section('submissions').editTitle }}</h2>
        <p class="section-desc">
          {{ t(section('submissions').editLead, { name: editSubmission.userName }) }}
        </p>
        <form class="edit-sub-form" @submit.prevent="saveEditSubmission">
          <label>
            {{ section('submissions').titleLabel }}
            <input v-model="editDraft.bookTitle" type="text" required />
          </label>
          <label>
            {{ section('submissions').authorLabel }}
            <input v-model="editDraft.bookAuthor" type="text" required />
          </label>
          <label>
            {{ section('submissions').pagesLabel }}
            <input v-model.number="editDraft.pageCount" type="number" min="1" required />
          </label>
          <label>
            {{ section('submissions').formatLabel }}
            <select v-model="editDraft.format">
              <option value="ebook">Ebook</option>
              <option value="audiobook">Audiobook</option>
              <option value="physical">Physical</option>
            </select>
          </label>
          <label>
            {{ section('submissions').typeLabel }}
            <select v-model="editDraft.submissionType">
              <option value="add">{{ section('submissions').typeAdd }}</option>
              <option value="sabotage">{{ section('submissions').typeSabotage }}</option>
            </select>
          </label>
          <label v-if="editDraft.submissionType === 'sabotage'">
            {{ section('submissions').targetTeamLabel }}
            <select v-model="editDraft.targetTeamId" required>
              <option v-for="team in config?.teams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </label>
          <label>
            {{ section('submissions').startedLabel }}
            <input v-model="editDraft.startedAt" type="date" />
          </label>
          <label>
            {{ section('submissions').finishedLabel }}
            <input v-model="editDraft.finishedAt" type="date" />
          </label>
          <p class="prompt-note">{{ t(section('submissions').promptsUnchanged, { count: editDraft.promptIds.length }) }}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="closeEditSubmission">{{ section('inbox').cancel }}</button>
            <button type="submit" class="btn btn-primary" :disabled="loading.startsWith('edit-sub-')">
              {{ section('submissions').saveChanges }}
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

.users-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.setting-toggle {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
  color: var(--realm-text);
  font-weight: 500;
}

.setting-toggle input {
  width: auto;
}

.add-user-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.add-user-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.88rem;
  color: var(--realm-text-muted);
}

.discord-webhook-section {
  margin-top: 1rem;
}

.discord-webhook-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.discord-webhook-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.88rem;
  color: var(--realm-text-muted);
}

.webhook-status {
  margin: 0;
  font-size: 0.88rem;
  color: var(--realm-text-muted);
}
</style>
