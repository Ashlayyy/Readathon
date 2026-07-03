<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type TeamConfig } from '../lib/api'
import { useConfig } from '../composables/useConfig'

export type AdminPrompt = {
  id: string
  promptId: string
  kind: 'positive' | 'negative' | 'team_bonus'
  teamId: string | null
  gameName: string
  label: string
  description: string
  points: number
  link: string | null
  isActive: boolean
  goesLiveAt: string | null
  sortOrder: number
  isLive: boolean
}

const emit = defineEmits<{ message: [text: string] }>()

const { config } = useConfig()
const prompts = ref<AdminPrompt[]>([])
const usingDatabase = ref(false)
const stats = ref({ liveCount: 0, scheduledCount: 0, draftCount: 0 })
const loading = ref('')
const filter = ref<'all' | 'live' | 'scheduled' | 'draft'>('all')

const editModal = ref<AdminPrompt | null>(null)
const createMode = ref(false)
const importModal = ref(false)
const importReplace = ref(false)

const blankForm = () => ({
  promptId: '',
  kind: 'positive' as AdminPrompt['kind'],
  teamId: '',
  gameName: '',
  label: '',
  description: '',
  points: 1,
  link: '',
  isActive: true,
  goesLiveAt: '',
  sortOrder: 0,
})

const form = ref(blankForm())

const teams = computed<TeamConfig[]>(() => config.value?.teams ?? [])

const filtered = computed(() => {
  return prompts.value.filter((p) => {
    if (filter.value === 'live') return p.isLive
    if (filter.value === 'scheduled')
      return p.isActive && p.goesLiveAt && new Date(p.goesLiveAt) > new Date()
    if (filter.value === 'draft') return !p.isActive
    return true
  })
})

const grouped = computed(() => {
  const positive = filtered.value.filter((p) => p.kind === 'positive')
  const negative = filtered.value.filter((p) => p.kind === 'negative')
  const teamBonus = filtered.value.filter((p) => p.kind === 'team_bonus')
  return { positive, negative, teamBonus }
})

onMounted(loadPrompts)

async function loadPrompts() {
  loading.value = 'load'
  try {
    const data = await api<{
      prompts: AdminPrompt[]
      usingDatabase: boolean
      liveCount: number
      scheduledCount: number
      draftCount: number
    }>('/admin/prompts')
    prompts.value = data.prompts
    usingDatabase.value = data.usingDatabase
    stats.value = {
      liveCount: data.liveCount,
      scheduledCount: data.scheduledCount,
      draftCount: data.draftCount,
    }
  } finally {
    loading.value = ''
  }
}

function teamName(teamId: string | null) {
  if (!teamId) return '—'
  return teams.value.find((t) => t.id === teamId)?.name ?? teamId
}

function statusLabel(p: AdminPrompt) {
  if (p.isLive) return 'Live'
  if (p.isActive && p.goesLiveAt && new Date(p.goesLiveAt) > new Date()) return 'Scheduled'
  if (!p.isActive) return 'Draft'
  return 'Hidden'
}

function statusClass(p: AdminPrompt) {
  if (p.isLive) return 'badge-positive'
  if (!p.isActive) return 'badge-negative'
  return ''
}

function openCreate() {
  createMode.value = true
  editModal.value = null
  form.value = blankForm()
}

function openEdit(p: AdminPrompt) {
  createMode.value = false
  editModal.value = p
  form.value = {
    promptId: p.promptId,
    kind: p.kind,
    teamId: p.teamId ?? '',
    gameName: p.gameName,
    label: p.label,
    description: p.description,
    points: p.points,
    link: p.link ?? '',
    isActive: p.isActive,
    goesLiveAt: p.goesLiveAt ? p.goesLiveAt.slice(0, 16) : '',
    sortOrder: p.sortOrder,
  }
}

function closeModal() {
  editModal.value = null
  createMode.value = false
}

async function savePrompt() {
  loading.value = 'save'
  try {
    const body = {
      promptId: form.value.promptId.trim(),
      kind: form.value.kind,
      teamId: form.value.kind === 'team_bonus' ? form.value.teamId : null,
      gameName: form.value.gameName,
      label: form.value.label,
      description: form.value.description,
      points: Number(form.value.points),
      link: form.value.link.trim() || null,
      isActive: form.value.isActive,
      goesLiveAt: form.value.goesLiveAt ? new Date(form.value.goesLiveAt).toISOString() : null,
      sortOrder: Number(form.value.sortOrder) || 0,
    }

    if (createMode.value) {
      await api('/admin/prompts', { method: 'POST', body: JSON.stringify(body) })
      emit('message', 'Prompt created.')
    } else if (editModal.value) {
      await api(`/admin/prompts/${editModal.value.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      emit('message', 'Prompt updated.')
    }
    closeModal()
    await loadPrompts()
  } catch (e) {
    emit('message', e instanceof Error ? e.message : 'Failed to save prompt')
  } finally {
    loading.value = ''
  }
}

async function removePrompt(p: AdminPrompt) {
  if (!confirm(`Delete prompt "${p.label}"? This cannot be undone.`)) return
  loading.value = `del-${p.id}`
  try {
    await api(`/admin/prompts/${p.id}`, { method: 'DELETE' })
    emit('message', 'Prompt deleted.')
    await loadPrompts()
  } catch (e) {
    emit('message', e instanceof Error ? e.message : 'Failed to delete')
  } finally {
    loading.value = ''
  }
}

async function runImport() {
  loading.value = 'import'
  try {
    const result = await api<{ imported: number }>('/admin/prompts/import-from-config', {
      method: 'POST',
      body: JSON.stringify({ replaceExisting: importReplace.value }),
    })
    emit('message', `Imported ${result.imported} prompts from data/realmathon.json.`)
    importModal.value = false
    importReplace.value = false
    await loadPrompts()
  } catch (e) {
    emit('message', e instanceof Error ? e.message : 'Import failed')
  } finally {
    loading.value = ''
  }
}
</script>

<template>
  <section class="card admin-section prompts-panel">
    <div class="prompts-header">
      <div>
        <h2>Prompt library</h2>
        <p class="section-desc">
          Prompts are stored in the database.
          <span v-if="usingDatabase">{{ stats.liveCount }} live</span>
          <span v-else>Using JSON file until you import.</span>
          <span v-if="stats.scheduledCount"> · {{ stats.scheduledCount }} scheduled</span>
          <span v-if="stats.draftCount"> · {{ stats.draftCount }} draft</span>
        </p>
      </div>
      <div class="prompts-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="importModal = true">
          Import from config file
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="openCreate">Add prompt</button>
      </div>
    </div>

    <div class="prompt-filters">
      <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
      <button type="button" :class="{ active: filter === 'live' }" @click="filter = 'live'">Live</button>
      <button type="button" :class="{ active: filter === 'scheduled' }" @click="filter = 'scheduled'">
        Scheduled
      </button>
      <button type="button" :class="{ active: filter === 'draft' }" @click="filter = 'draft'">Draft</button>
    </div>

    <div v-if="loading === 'load'" class="alert alert-info">Loading prompts…</div>

    <template v-else>
      <div v-for="section in [
        { key: 'positive', title: 'Add XP (+)', items: grouped.positive },
        { key: 'negative', title: 'Sabotage (-)', items: grouped.negative },
        { key: 'teamBonus', title: 'Team bonuses', items: grouped.teamBonus },
      ]" :key="section.key" class="prompt-group">
        <h3>{{ section.title }} <span class="count">({{ section.items.length }})</span></h3>
        <div v-if="section.items.length === 0" class="empty-group">None in this filter.</div>
        <ul v-else class="prompt-list">
          <li v-for="p in section.items" :key="p.id" class="prompt-row">
            <div class="prompt-main">
              <span class="badge" :class="statusClass(p)">{{ statusLabel(p) }}</span>
              <strong>{{ p.label }}</strong>
              <span class="points">{{ p.points > 0 ? '+' : '' }}{{ p.points }} XP</span>
              <span v-if="p.kind === 'team_bonus'" class="meta">· {{ teamName(p.teamId) }}</span>
              <span v-else-if="p.gameName" class="meta">· {{ p.gameName }}</span>
              <code class="pid">{{ p.promptId }}</code>
            </div>
            <div class="row-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="openEdit(p)">Edit</button>
              <button
                type="button"
                class="btn btn-ghost btn-sm danger"
                :disabled="loading === `del-${p.id}`"
                @click="removePrompt(p)"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <!-- Create / edit modal -->
    <div v-if="createMode || editModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal card prompt-modal">
        <h2>{{ createMode ? 'Add prompt' : 'Edit prompt' }}</h2>
        <form class="prompt-form" @submit.prevent="savePrompt">
          <label>
            ID (slug)
            <input v-model="form.promptId" type="text" required :disabled="!createMode" pattern="[a-z0-9-]+" />
          </label>
          <label>
            Kind
            <select v-model="form.kind">
              <option value="positive">Add XP (+)</option>
              <option value="negative">Sabotage (-)</option>
              <option value="team_bonus">Team bonus</option>
            </select>
          </label>
          <label v-if="form.kind === 'team_bonus'">
            Team
            <select v-model="form.teamId" required>
              <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
            </select>
          </label>
          <label v-if="form.kind !== 'team_bonus'">
            Game name
            <input v-model="form.gameName" type="text" />
          </label>
          <label>
            Label
            <input v-model="form.label" type="text" required />
          </label>
          <label>
            Description
            <textarea v-model="form.description" rows="3" />
          </label>
          <label>
            Points
            <input v-model.number="form.points" type="number" required />
          </label>
          <label v-if="form.kind !== 'team_bonus'">
            Link (optional)
            <input v-model="form.link" type="url" placeholder="https://…" />
          </label>
          <label class="check-row">
            <input v-model="form.isActive" type="checkbox" />
            Active (visible when go-live date passes)
          </label>
          <label>
            Go live at (optional)
            <input v-model="form.goesLiveAt" type="datetime-local" />
            <span class="field-hint">Hidden until this date/time, even if active.</span>
          </label>
          <label>
            Sort order
            <input v-model.number="form.sortOrder" type="number" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="closeModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="loading === 'save'">
              {{ loading === 'save' ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Import modal -->
    <div v-if="importModal" class="modal-backdrop" @click.self="importModal = false">
      <div class="modal card prompt-modal">
        <h2>Import from config file</h2>
        <p class="section-desc">
          Load global and team bonus prompts from <code>data/realmathon.json</code> into the database.
          This does <strong>not</strong> run automatically.
        </p>
        <label class="check-row danger-check">
          <input v-model="importReplace" type="checkbox" />
          Replace all existing prompts first (destructive)
        </label>
        <p class="field-hint">
          Without replace, prompts are merged by ID — existing entries with the same ID get updated.
        </p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" @click="importModal = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="loading === 'import'"
            @click="runImport"
          >
            {{ loading === 'import' ? 'Importing…' : 'Import prompts' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.prompts-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.prompts-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.prompt-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.prompt-filters button {
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  font-weight: 600;
  cursor: pointer;
}

.prompt-filters button.active {
  border-color: var(--realm-accent);
  color: var(--realm-accent-glow);
  background: rgba(212, 99, 74, 0.1);
}

.prompt-group {
  margin-bottom: 1.5rem;
}

.prompt-group h3 {
  font-family: var(--font-display);
  color: var(--realm-text);
  font-size: 1rem;
  margin-bottom: 0.65rem;
}

.count {
  color: var(--realm-text-muted);
  font-weight: 400;
}

.prompt-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.prompt-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--realm-bg);
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
}

.prompt-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.prompt-main strong {
  color: var(--realm-text);
}

.points {
  color: var(--realm-accent-glow);
  font-weight: 700;
  font-size: 0.88rem;
}

.meta,
.pid {
  font-size: 0.8rem;
  color: var(--realm-text-muted);
}

.pid {
  font-family: ui-monospace, monospace;
}

.empty-group {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  font-style: italic;
}

.prompt-modal {
  max-width: 32rem;
  width: 100%;
}

.prompt-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.prompt-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.88rem;
  color: var(--realm-text-muted);
}

.check-row {
  flex-direction: row !important;
  align-items: center;
  gap: 0.65rem !important;
  cursor: pointer;
}

.check-row input {
  width: auto;
}

.field-hint {
  font-size: 0.8rem;
  color: var(--realm-text-muted);
}

.danger-check {
  color: var(--realm-text);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.65);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  margin-top: 0.5rem;
}

.row-actions {
  display: flex;
  gap: 0.35rem;
}

.row-actions .danger {
  color: #f08080;
}

@media (max-width: 768px) {
  .prompt-row {
    flex-direction: column;
    align-items: stretch;
  }

  .row-actions {
    width: 100%;
  }

  .row-actions .btn {
    flex: 1;
  }
}
</style>
