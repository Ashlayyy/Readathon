<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, type AdminUser, type Prompt, type TeamConfig } from '../lib/api'

const props = defineProps<{
  users: AdminUser[]
  teams: TeamConfig[]
  positivePrompts: Prompt[]
  negativePrompts: Prompt[]
  maxPrompts: number
  globalBonusLabel?: string
}>()

const emit = defineEmits<{
  close: []
  created: []
  error: [message: string]
}>()

const assignedUsers = computed(() =>
  props.users
    .filter((u) => u.status === 'assigned' && u.teamId)
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName)),
)

const userId = ref('')
const bookTitle = ref('')
const bookAuthor = ref('')
const pageCount = ref(300)
const format = ref('physical')
const startedAt = ref('')
const finishedAt = ref('')
const submissionType = ref<'add' | 'sabotage'>('add')
const targetTeamId = ref('')
const promptIds = ref<string[]>([])
const bonusCompetition = ref(false)
const bonusTeamPromptIds = ref<string[]>([])
const promptSearch = ref('')
const submitting = ref(false)

const selectedUser = computed(() => assignedUsers.value.find((u) => u.id === userId.value))

const readerTeam = computed(() => {
  const teamId = selectedUser.value?.teamId
  if (!teamId) return null
  return props.teams.find((t) => t.id === teamId) ?? null
})

const attackableTeams = computed(() =>
  props.teams.filter((t) => t.id !== selectedUser.value?.teamId),
)

const availablePrompts = computed(() =>
  submissionType.value === 'add' ? props.positivePrompts : props.negativePrompts,
)

const filteredPrompts = computed(() => {
  const q = promptSearch.value.trim().toLowerCase()
  if (!q) return availablePrompts.value
  return availablePrompts.value.filter(
    (p) =>
      p.label.toLowerCase().includes(q) ||
      p.gameName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q),
  )
})

watch(submissionType, () => {
  promptIds.value = []
  promptSearch.value = ''
  if (submissionType.value === 'add') targetTeamId.value = ''
})

watch(userId, () => {
  bonusTeamPromptIds.value = []
  if (
    submissionType.value === 'sabotage' &&
    targetTeamId.value === selectedUser.value?.teamId
  ) {
    targetTeamId.value = ''
  }
})

function isPromptSelected(id: string) {
  return promptIds.value.includes(id)
}

function togglePrompt(id: string) {
  if (isPromptSelected(id)) {
    promptIds.value = promptIds.value.filter((x) => x !== id)
    return
  }
  if (promptIds.value.length >= props.maxPrompts) return
  promptIds.value = [...promptIds.value, id]
}

function toggleTeamBonus(id: string) {
  if (bonusTeamPromptIds.value.includes(id)) {
    bonusTeamPromptIds.value = bonusTeamPromptIds.value.filter((x) => x !== id)
  } else {
    bonusTeamPromptIds.value = [...bonusTeamPromptIds.value, id]
  }
}

async function submit() {
  if (!userId.value) {
    emit('error', 'Select a reader to submit for.')
    return
  }
  if (submissionType.value === 'sabotage' && !targetTeamId.value) {
    emit('error', 'Select a team to attack.')
    return
  }

  submitting.value = true
  try {
    await api('/admin/submissions', {
      method: 'POST',
      body: JSON.stringify({
        userId: userId.value,
        bookTitle: bookTitle.value,
        bookAuthor: bookAuthor.value,
        pageCount: pageCount.value,
        format: format.value,
        startedAt: startedAt.value || null,
        finishedAt: finishedAt.value || null,
        submissionType: submissionType.value,
        targetTeamId:
          submissionType.value === 'sabotage' ? targetTeamId.value : undefined,
        promptIds: promptIds.value,
        bonusCompetition: bonusCompetition.value,
        bonusTeamPromptIds: bonusTeamPromptIds.value,
      }),
    })
    emit('created')
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to create submission')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal card add-sub-modal" role="dialog" aria-modal="true" aria-labelledby="add-sub-title">
      <header class="modal-head">
        <div>
          <h2 id="add-sub-title">Add submission</h2>
          <p class="section-desc">
            Submit a book as another reader. It will appear under their name and score for their realm.
          </p>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">Close</button>
      </header>

      <form class="add-sub-form" @submit.prevent="submit">
        <label class="field">
          Reader
          <select v-model="userId" required>
            <option value="" disabled>Select an assigned reader…</option>
            <option v-for="u in assignedUsers" :key="u.id" :value="u.id">
              {{ u.displayName }}{{ u.email ? ` (${u.email})` : '' }}
            </option>
          </select>
        </label>

        <div v-if="readerTeam" class="reader-team">
          Realm: <strong :style="{ color: readerTeam.color }">{{ readerTeam.icon }} {{ readerTeam.name }}</strong>
        </div>

        <div class="field-grid">
          <label class="field">
            Title
            <input v-model="bookTitle" type="text" required minlength="1" />
          </label>
          <label class="field">
            Author
            <input v-model="bookAuthor" type="text" required minlength="1" />
          </label>
          <label class="field">
            Pages
            <input v-model.number="pageCount" type="number" min="1" required />
          </label>
          <label class="field">
            Format
            <select v-model="format">
              <option value="ebook">Ebook</option>
              <option value="audiobook">Audiobook</option>
              <option value="physical">Physical</option>
            </select>
          </label>
          <label class="field">
            Started (optional)
            <input v-model="startedAt" type="date" />
          </label>
          <label class="field">
            Finished (optional)
            <input v-model="finishedAt" type="date" />
          </label>
        </div>

        <fieldset class="type-fieldset">
          <legend>Type</legend>
          <div class="type-row">
            <label class="type-option" :class="{ active: submissionType === 'add' }">
              <input v-model="submissionType" type="radio" value="add" />
              Add XP
            </label>
            <label class="type-option" :class="{ active: submissionType === 'sabotage' }">
              <input v-model="submissionType" type="radio" value="sabotage" />
              Sabotage
            </label>
          </div>
          <label v-if="submissionType === 'sabotage'" class="field">
            Target team
            <select v-model="targetTeamId" required>
              <option value="" disabled>Select a team…</option>
              <option v-for="team in attackableTeams" :key="team.id" :value="team.id">
                {{ team.icon }} {{ team.name }}
              </option>
            </select>
          </label>
        </fieldset>

        <section class="prompt-section">
          <div class="prompt-head">
            <h3>Prompts <span class="optional">(optional)</span></h3>
            <span class="counter">{{ promptIds.length }} / {{ maxPrompts }}</span>
          </div>
          <input
            v-model="promptSearch"
            type="search"
            class="prompt-search"
            placeholder="Search prompts…"
            aria-label="Search prompts"
          />
          <div class="prompt-list">
            <button
              v-for="p in filteredPrompts"
              :key="p.id"
              type="button"
              class="prompt-chip"
              :class="{ selected: isPromptSelected(p.id) }"
              :disabled="!isPromptSelected(p.id) && promptIds.length >= maxPrompts"
              @click="togglePrompt(p.id)"
            >
              <span class="chip-pts">{{ p.points > 0 ? `+${p.points}` : p.points }}</span>
              <span class="chip-label">{{ p.label }}</span>
            </button>
            <p v-if="filteredPrompts.length === 0" class="empty-hint">No prompts match.</p>
          </div>
        </section>

        <section class="bonus-section">
          <h3>Bonuses <span class="optional">(optional)</span></h3>
          <label class="bonus-row">
            <input v-model="bonusCompetition" type="checkbox" />
            <span>{{ globalBonusLabel || 'Competition / trials' }}</span>
          </label>
          <div v-if="readerTeam?.bonusPrompts?.length" class="team-bonuses">
            <p class="bonus-label">{{ readerTeam.name }} bonuses</p>
            <label
              v-for="bp in readerTeam.bonusPrompts"
              :key="bp.id"
              class="bonus-row"
            >
              <input
                type="checkbox"
                :checked="bonusTeamPromptIds.includes(bp.id)"
                @change="toggleTeamBonus(bp.id)"
              />
              <span>{{ bp.label }} ({{ bp.points > 0 ? `+${bp.points}` : bp.points }})</span>
            </label>
          </div>
        </section>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="submitting || !userId">
            {{ submitting ? 'Submitting…' : 'Submit for reader' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1rem;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
}

.add-sub-modal {
  width: min(40rem, 100%);
  margin: 1.5rem auto;
  max-height: none;
  padding: 1.25rem 1.35rem 1.5rem;
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.modal-head h2 {
  margin: 0 0 0.35rem;
  font-family: var(--font-display);
  color: var(--realm-text);
  font-size: 1.25rem;
}

.section-desc {
  margin: 0;
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}

.add-sub-form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--realm-text-muted);
}

.field input,
.field select,
.prompt-search {
  padding: 0.55rem 0.7rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  background: var(--realm-bg);
  color: var(--realm-text);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.95rem;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
}

.reader-team {
  font-size: 0.9rem;
  color: var(--realm-text-muted);
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--realm-border);
}

.type-fieldset {
  border: 1px solid var(--realm-border);
  border-radius: 12px;
  padding: 0.85rem 1rem 1rem;
  margin: 0;
}

.type-fieldset legend {
  padding: 0 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--realm-text);
}

.type-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.type-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem;
  border-radius: var(--radius);
  border: 1px solid var(--realm-border);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--realm-text-muted);
}

.type-option.active {
  border-color: var(--realm-accent);
  color: var(--realm-accent-glow);
  background: rgba(212, 99, 74, 0.1);
}

.type-option input {
  accent-color: var(--realm-accent);
}

.prompt-section h3,
.bonus-section h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--realm-text);
}

.optional {
  font-weight: 500;
  color: var(--realm-text-muted);
  font-size: 0.8rem;
}

.prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.55rem;
}

.counter {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--realm-text-muted);
}

.prompt-search {
  width: 100%;
  margin-bottom: 0.65rem;
}

.prompt-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  max-height: 12rem;
  overflow-y: auto;
  padding: 0.15rem;
}

.prompt-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--realm-border);
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.8rem;
  text-align: left;
}

.prompt-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.prompt-chip.selected {
  border-color: var(--realm-accent);
  color: var(--realm-text);
  background: rgba(212, 99, 74, 0.12);
}

.chip-pts {
  font-weight: 800;
  color: var(--realm-accent-glow);
  font-size: 0.75rem;
}

.empty-hint {
  margin: 0.5rem 0;
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}

.bonus-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.45rem;
  font-size: 0.9rem;
  color: var(--realm-text);
  cursor: pointer;
}

.bonus-label {
  margin: 0.75rem 0 0.25rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--realm-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  padding-top: 0.35rem;
  border-top: 1px solid var(--realm-border);
}

@media (max-width: 640px) {
  .field-grid {
    grid-template-columns: 1fr;
  }

  .add-sub-modal {
    margin: 0.5rem auto;
    padding: 1rem;
  }

  .type-row {
    flex-direction: column;
  }
}
</style>
