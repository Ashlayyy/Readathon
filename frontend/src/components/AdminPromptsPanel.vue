<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type TeamConfig } from '../lib/api'
import { useConfig } from '../composables/useConfig'
import { useAdminCopy } from '../composables/useAdminCopy'
import { useCopy } from '../composables/useCopy'

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

const emit = defineEmits<{ message: [text: string, isError?: boolean] }>()

const { config } = useConfig()
const { section, msg, confirmMsg } = useAdminCopy()
const { t } = useCopy()
const prompts = ref<AdminPrompt[]>([])
const usingDatabase = ref(false)
const stats = ref({ liveCount: 0, scheduledCount: 0, draftCount: 0 })
const loading = ref('')
const filter = ref<'all' | 'live' | 'scheduled' | 'draft'>('all')
const query = ref('')

const editModal = ref<AdminPrompt | null>(null)
const createMode = ref(false)
const addMenuOpen = ref(false)
const uploadModalOpen = ref(false)
const importConfigModal = ref(false)
const importReplace = ref(false)
const uploadFile = ref<File | null>(null)
const uploadPack = ref<unknown>(null)
const uploadPreview = ref<{ total: number; scheduled: number } | null>(null)
const uploadError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

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
    const q = query.value.trim().toLowerCase()
    if (q) {
      const haystack = `${p.label} ${p.description} ${p.promptId} ${p.gameName} ${p.kind} ${p.teamId ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (filter.value === 'live') return p.isLive
    if (filter.value === 'scheduled') return isScheduled(p)
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

const promptSections = computed(() => [
  { key: 'positive', title: section('prompts').groupPositive, items: grouped.value.positive },
  { key: 'negative', title: section('prompts').groupNegative, items: grouped.value.negative },
  { key: 'teamBonus', title: section('prompts').groupTeamBonus, items: grouped.value.teamBonus },
])

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
  const pcopy = section('prompts')
  if (p.isLive) return pcopy.statusLive
  if (isScheduled(p)) return pcopy.statusScheduled
  if (!p.isActive) return pcopy.statusDraft
  return pcopy.statusHidden
}

function isScheduled(p: AdminPrompt) {
  return Boolean(p.isActive && p.goesLiveAt && new Date(p.goesLiveAt) > new Date())
}

function formatGoLiveDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function statusClass(p: AdminPrompt) {
  if (p.isLive) return 'status-live'
  if (isScheduled(p)) return 'status-scheduled'
  if (!p.isActive) return 'status-draft'
  return 'status-hidden'
}

function openAddMenu() {
  addMenuOpen.value = true
}

function closeAddMenu() {
  addMenuOpen.value = false
}

function chooseManual() {
  closeAddMenu()
  openCreate()
}

function chooseUpload() {
  closeAddMenu()
  uploadModalOpen.value = true
  uploadFile.value = null
  uploadPack.value = null
  uploadPreview.value = null
  uploadError.value = ''
  importReplace.value = false
}

function chooseConfigImport() {
  closeAddMenu()
  importConfigModal.value = true
  importReplace.value = false
}

function closeUploadModal() {
  uploadModalOpen.value = false
  uploadFile.value = null
  uploadPack.value = null
  uploadPreview.value = null
  uploadError.value = ''
}

async function onUploadFileSelected(event: Event) {
  uploadError.value = ''
  uploadPreview.value = null
  uploadPack.value = null
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  uploadFile.value = file
  if (!file) return

  try {
    const text = await file.text()
    const parsed = JSON.parse(text) as unknown
    uploadPack.value = parsed
    uploadPreview.value = previewPackClient(parsed)
  } catch {
    uploadError.value = section('prompts').uploadInvalidJson ?? 'Invalid JSON file.'
    uploadFile.value = null
    uploadPack.value = null
  }
}

function previewPackClient(data: unknown): { total: number; scheduled: number } {
  const pack = data as {
    kind?: string
    sets?: { goesLiveAt?: string; prompts?: unknown[] }[]
    prompts?: unknown[] | { positive?: unknown[]; negative?: unknown[] }
    teams?: { bonusPrompts?: unknown[] }[]
  }

  let total = 0
  let scheduled = 0
  const now = Date.now()

  const countPrompt = (p: { goesLiveAt?: string }, setLive?: string) => {
    total++
    const liveAt = p.goesLiveAt ?? setLive
    if (liveAt && new Date(liveAt).getTime() > now) scheduled++
  }

  for (const set of pack.sets ?? []) {
    for (const p of (set.prompts ?? []) as { goesLiveAt?: string }[]) {
      countPrompt(p, set.goesLiveAt)
    }
  }

  if (Array.isArray(pack.prompts)) {
    for (const p of pack.prompts as { goesLiveAt?: string }[]) countPrompt(p)
  } else if (pack.prompts && typeof pack.prompts === 'object') {
    for (const p of [...(pack.prompts.positive ?? []), ...(pack.prompts.negative ?? [])] as {
      goesLiveAt?: string
    }[]) {
      countPrompt(p)
    }
  }

  for (const team of pack.teams ?? []) {
    for (const p of (team.bonusPrompts ?? []) as { goesLiveAt?: string }[]) countPrompt(p)
  }

  if (total === 0) throw new Error('empty')
  return { total, scheduled }
}

async function runJsonUpload() {
  if (!uploadPack.value) return
  loading.value = 'import'
  try {
    const result = await api<{ imported: number; scheduled: number }>('/admin/prompts/import-json', {
      method: 'POST',
      body: JSON.stringify({ replaceExisting: importReplace.value, pack: uploadPack.value }),
    })
    emit('message', msg('jsonImported', { count: result.imported, scheduled: result.scheduled }))
    closeUploadModal()
    await loadPrompts()
  } catch (e) {
    emit('message', e instanceof Error ? e.message : msg('importFailed'), true)
  } finally {
    loading.value = ''
  }
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
    goesLiveAt: p.goesLiveAt ? p.goesLiveAt.slice(0, 10) : '',
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
      goesLiveAt: form.value.goesLiveAt ? new Date(`${form.value.goesLiveAt}T00:00:00.000Z`).toISOString() : null,
      sortOrder: Number(form.value.sortOrder) || 0,
    }

    if (createMode.value) {
      await api('/admin/prompts', { method: 'POST', body: JSON.stringify(body) })
      emit('message', msg('promptCreated'))
    } else if (editModal.value) {
      await api(`/admin/prompts/${editModal.value.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      emit('message', msg('promptUpdated'))
    }
    closeModal()
    await loadPrompts()
  } catch (e) {
    emit('message', e instanceof Error ? e.message : msg('promptSaveFailed'), true)
  } finally {
    loading.value = ''
  }
}

async function removePrompt(p: AdminPrompt) {
  if (!confirm(confirmMsg('deletePrompt', { label: p.label }))) return
  loading.value = `del-${p.id}`
  try {
    await api(`/admin/prompts/${p.id}`, { method: 'DELETE' })
    emit('message', msg('promptDeleted'))
    await loadPrompts()
  } catch (e) {
    emit('message', e instanceof Error ? e.message : msg('promptDeleteFailed'), true)
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
    emit('message', msg('promptImported', { count: result.imported }))
    importConfigModal.value = false
    importReplace.value = false
    await loadPrompts()
  } catch (e) {
    emit('message', e instanceof Error ? e.message : msg('importFailed'), true)
  } finally {
    loading.value = ''
  }
}
</script>

<template>
  <section class="card admin-section prompts-panel">
    <div class="prompts-header">
      <div>
        <h2>{{ section('prompts').title }}</h2>
        <p class="section-desc">
          {{ section('prompts').leadDb }}
          <span v-if="usingDatabase">{{ t(section('prompts').statLive, { count: stats.liveCount }) }}</span>
          <span v-else>{{ section('prompts').leadJson }}</span>
          <span v-if="stats.scheduledCount"> · {{ t(section('prompts').statScheduled, { count: stats.scheduledCount }) }}</span>
          <span v-if="stats.draftCount"> · {{ t(section('prompts').statDraft, { count: stats.draftCount }) }}</span>
        </p>
      </div>
      <div class="prompts-actions">
        <button type="button" class="btn btn-primary btn-sm" @click="openAddMenu">
          {{ section('prompts').addButton }}
        </button>
      </div>
    </div>

    <div class="prompt-filters">
      <div class="filter-left">
        <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">{{ section('prompts').filterAll }}</button>
        <button type="button" :class="{ active: filter === 'live' }" @click="filter = 'live'">{{ section('prompts').filterLive }}</button>
        <button type="button" :class="{ active: filter === 'scheduled' }" @click="filter = 'scheduled'">
          {{ section('prompts').filterScheduled }}
        </button>
        <button type="button" :class="{ active: filter === 'draft' }" @click="filter = 'draft'">{{ section('prompts').filterDraft }}</button>
      </div>
      <div class="filter-right">
        <input
          v-model="query"
          type="search"
          class="prompt-search"
          placeholder="Search prompts…"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
    </div>

    <div v-if="loading === 'load'" class="alert alert-info">{{ section('prompts').loading }}</div>

    <template v-else>
      <div v-for="sec in promptSections" :key="sec.key" class="prompt-group">
        <h3>{{ sec.title }} <span class="count">({{ sec.items.length }})</span></h3>
        <div v-if="sec.items.length === 0" class="empty-group">{{ section('prompts').emptyFilter }}</div>
        <ul v-else class="prompt-list">
          <li v-for="p in sec.items" :key="p.id" class="prompt-row" :class="p.kind">
            <div class="prompt-main">
              <div class="prompt-top">
                <span class="xp-badge" :class="p.points > 0 ? 'gain' : 'attack'">
                  {{ p.points > 0 ? '+' : '' }}{{ p.points }}
                </span>
                <div class="prompt-heading">
                  <strong class="label">{{ p.label }}</strong>
                  <span v-if="p.kind === 'team_bonus'" class="sub">{{ teamName(p.teamId) }}</span>
                  <span v-else-if="p.gameName" class="sub">{{ p.gameName }}</span>
                </div>
                <span class="status-pill" :class="statusClass(p)">{{ statusLabel(p) }}</span>
              </div>
              <p v-if="p.description" class="desc">{{ p.description }}</p>
              <div class="prompt-meta">
                <span v-if="isScheduled(p)" class="schedule-pill">Unlocks {{ formatGoLiveDate(p.goesLiveAt) }}</span>
                <span v-if="p.link" class="link-pill">Link</span>
              </div>
            </div>
            <div class="row-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="openEdit(p)">{{ section('prompts').edit }}</button>
              <button
                type="button"
                class="btn btn-ghost btn-sm danger"
                :disabled="loading === `del-${p.id}`"
                @click="removePrompt(p)"
              >
                {{ section('prompts').delete }}
              </button>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <!-- Create / edit modal -->
    <div v-if="createMode || editModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal card prompt-modal">
        <h2>{{ createMode ? section('prompts').addTitle : section('prompts').editTitle }}</h2>
        <form class="prompt-form" @submit.prevent="savePrompt">
          <label>
            {{ section('prompts').idLabel }}
            <input v-model="form.promptId" type="text" required :disabled="!createMode" pattern="[a-z0-9-]+" />
          </label>
          <label>
            {{ section('prompts').kindLabel }}
            <select v-model="form.kind">
              <option value="positive">{{ section('prompts').kindPositive }}</option>
              <option value="negative">{{ section('prompts').kindNegative }}</option>
              <option value="team_bonus">{{ section('prompts').kindTeamBonus }}</option>
            </select>
          </label>
          <label v-if="form.kind === 'team_bonus'">
            {{ section('prompts').teamLabel }}
            <select v-model="form.teamId" required>
              <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
            </select>
          </label>
          <label v-if="form.kind !== 'team_bonus'">
            {{ section('prompts').gameNameLabel }}
            <input v-model="form.gameName" type="text" />
          </label>
          <label>
            {{ section('prompts').labelLabel }}
            <input v-model="form.label" type="text" required />
          </label>
          <label>
            {{ section('prompts').descriptionLabel }}
            <textarea v-model="form.description" rows="3" />
          </label>
          <label>
            {{ section('prompts').pointsLabel }}
            <input v-model.number="form.points" type="number" required />
          </label>
          <label v-if="form.kind !== 'team_bonus'">
            {{ section('prompts').linkLabel }}
            <input v-model="form.link" type="url" :placeholder="section('prompts').linkPlaceholder" />
          </label>
          <label class="check-row">
            <input v-model="form.isActive" type="checkbox" />
            {{ section('prompts').activeLabel }}
          </label>
          <label>
            {{ section('prompts').goLiveLabel }}
            <input v-model="form.goesLiveAt" type="date" />
            <span class="field-hint">{{ section('prompts').goLiveHint }}</span>
          </label>
          <label>
            {{ section('prompts').sortOrderLabel }}
            <input v-model.number="form.sortOrder" type="number" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" @click="closeModal">{{ section('prompts').cancel }}</button>
            <button type="submit" class="btn btn-primary" :disabled="loading === 'save'">
              {{ loading === 'save' ? section('prompts').saving : section('prompts').save }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Add menu -->
    <div v-if="addMenuOpen" class="modal-backdrop" @click.self="closeAddMenu">
      <div class="modal card prompt-modal add-menu-modal">
        <h2>{{ section('prompts').addMenuTitle }}</h2>
        <p class="section-desc">{{ section('prompts').addMenuLead }}</p>
        <div class="add-menu-options">
          <button type="button" class="add-menu-option" @click="chooseManual">
            <strong>{{ section('prompts').addMenuManualTitle }}</strong>
            <span>{{ section('prompts').addMenuManualLead }}</span>
          </button>
          <button type="button" class="add-menu-option" @click="chooseUpload">
            <strong>{{ section('prompts').addMenuUploadTitle }}</strong>
            <span>{{ section('prompts').addMenuUploadLead }}</span>
          </button>
          <button type="button" class="add-menu-option subtle" @click="chooseConfigImport">
            <strong>{{ section('prompts').addMenuConfigTitle }}</strong>
            <span>{{ section('prompts').addMenuConfigLead }}</span>
          </button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" @click="closeAddMenu">{{ section('prompts').cancel }}</button>
        </div>
      </div>
    </div>

    <!-- JSON upload modal -->
    <div v-if="uploadModalOpen" class="modal-backdrop" @click.self="closeUploadModal">
      <div class="modal card prompt-modal">
        <h2>{{ section('prompts').uploadTitle }}</h2>
        <p class="section-desc">{{ section('prompts').uploadLead }}</p>

        <div class="file-upload">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden-file-input"
            @change="onUploadFileSelected"
          />
          <button type="button" class="btn btn-secondary btn-sm" @click="fileInputRef?.click()">
            {{ section('prompts').uploadChooseFile }}
          </button>
          <span class="file-name">{{ uploadFile?.name ?? section('prompts').uploadNoFile }}</span>
        </div>

        <div v-if="uploadError" class="alert alert-error">{{ uploadError }}</div>
        <p v-else-if="uploadPreview" class="upload-preview">
          {{ t(section('prompts').uploadPreview, { count: uploadPreview.total, scheduled: uploadPreview.scheduled }) }}
        </p>

        <label class="check-row danger-check">
          <input v-model="importReplace" type="checkbox" />
          {{ section('prompts').importReplace }}
        </label>
        <p class="field-hint">{{ section('prompts').importMergeHint }}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" @click="closeUploadModal">{{ section('prompts').cancel }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="loading === 'import' || !uploadPack"
            @click="runJsonUpload"
          >
            {{ loading === 'import' ? section('prompts').uploadImporting : section('prompts').uploadImport }}
          </button>
        </div>
      </div>
    </div>

    <!-- Import from realmathon.json -->
    <div v-if="importConfigModal" class="modal-backdrop" @click.self="importConfigModal = false">
      <div class="modal card prompt-modal">
        <h2>{{ section('prompts').importTitle }}</h2>
        <p class="section-desc">{{ section('prompts').importLead }}</p>
        <label class="check-row danger-check">
          <input v-model="importReplace" type="checkbox" />
          {{ section('prompts').importReplace }}
        </label>
        <p class="field-hint">{{ section('prompts').importMergeHint }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" @click="importConfigModal = false">{{ section('prompts').cancel }}</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="loading === 'import'"
            @click="runImport"
          >
            {{ loading === 'import' ? section('prompts').importing : section('prompts').importSubmit }}
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
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  align-items: center;
  justify-content: space-between;
}

.filter-left {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
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
  align-items: flex-start;
  padding: 0.9rem 1rem;
  background: var(--realm-bg);
  border: 1px solid var(--realm-border);
  border-radius: 12px;
  transition: border-color 0.2s;
}

.prompt-row:hover {
  border-color: color-mix(in srgb, var(--realm-accent) 30%, var(--realm-border));
}

.prompt-main {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
  flex: 1;
}

.prompt-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.65rem;
  min-width: 0;
}

.xp-badge {
  flex-shrink: 0;
  min-width: 2.5rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 800;
  text-align: center;
  border: 1px solid transparent;
}

.xp-badge.gain {
  color: var(--realm-success);
  background: rgba(110, 207, 138, 0.12);
  border-color: rgba(110, 207, 138, 0.28);
}

.xp-badge.attack {
  color: var(--realm-accent-glow);
  background: rgba(212, 99, 74, 0.12);
  border-color: rgba(212, 99, 74, 0.28);
}

.prompt-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.prompt-heading .label {
  color: var(--realm-text);
  font-size: 0.95rem;
  line-height: 1.3;
}

.prompt-heading .sub {
  color: var(--realm-text-muted);
  font-size: 0.82rem;
}

.status-pill {
  flex-shrink: 0;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.status-pill.status-live {
  color: var(--realm-success);
  background: rgba(110, 207, 138, 0.12);
  border-color: rgba(110, 207, 138, 0.28);
}

.status-pill.status-scheduled {
  color: #e8b84a;
  background: rgba(232, 184, 74, 0.12);
  border-color: rgba(232, 184, 74, 0.28);
}

.status-pill.status-draft,
.status-pill.status-hidden {
  color: var(--realm-text-muted);
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--realm-border);
}

.desc {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--realm-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.prompt-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.schedule-pill {
  font-size: 0.78rem;
  font-weight: 600;
  color: #e8b84a;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(232, 184, 74, 0.1);
  border: 1px solid rgba(232, 184, 74, 0.22);
}

.link-pill {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  border: 1px solid rgba(212, 99, 74, 0.4);
  color: var(--realm-accent-glow);
  background: rgba(212, 99, 74, 0.08);
}

.prompt-search {
  width: min(22rem, 100%);
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  background: var(--realm-bg);
  color: var(--realm-text);
  font-size: 0.9rem;
}

.prompt-search:focus {
  outline: none;
  border-color: rgba(212, 99, 74, 0.6);
  box-shadow: 0 0 0 3px rgba(212, 99, 74, 0.12);
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

.add-menu-modal {
  max-width: 28rem;
}

.add-menu-options {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin: 1rem 0;
}

.add-menu-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  text-align: left;
  padding: 0.9rem 1rem;
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
  background: var(--realm-bg);
  color: var(--realm-text);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.add-menu-option:hover {
  border-color: var(--realm-accent);
  background: rgba(212, 99, 74, 0.08);
}

.add-menu-option strong {
  font-family: var(--font-display);
  font-size: 0.95rem;
}

.add-menu-option span {
  color: var(--realm-text-muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.add-menu-option.subtle {
  opacity: 0.9;
}

.file-upload {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 1rem 0;
}

.file-name {
  color: var(--realm-text-muted);
  font-size: 0.88rem;
  word-break: break-all;
}

.hidden-file-input {
  display: none;
}

.upload-preview {
  color: var(--realm-success);
  font-size: 0.9rem;
  margin: 0 0 0.75rem;
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
