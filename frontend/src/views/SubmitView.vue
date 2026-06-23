<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import type { Prompt } from '../lib/api'

const { user } = useAuth()
const { config, loadConfig } = useConfig()
const router = useRouter()

const step = ref(1)
const error = ref('')
const submitting = ref(false)
const confirmed = ref(false)
const success = ref(false)

const bookTitle = ref('')
const bookAuthor = ref('')
const pageCount = ref(300)
const format = ref('physical')
const startedAt = ref('')
const finishedAt = ref('')
const isReread = ref(false)

const submissionType = ref<'add' | 'sabotage' | null>(null)
const targetTeamId = ref('')
const selectedPromptIds = ref<string[]>([])
const bonusCompetition = ref(false)
const bonusTeamPromptIds = ref<string[]>([])

onMounted(loadConfig)

const maxPrompts = computed(() => config.value?.scoringRules.maxPromptsPerBook ?? 5)

const availablePrompts = computed((): Prompt[] => {
  if (!config.value || !submissionType.value) return []
  return submissionType.value === 'add'
    ? config.value.prompts.positive
    : config.value.prompts.negative
})

const userTeam = computed(() => config.value?.teams.find((t) => t.id === user.value?.teamId))

const attackTargets = computed(() =>
  config.value?.teams.filter((t) => t.id !== user.value?.teamId) ?? [],
)

const pageBonus = computed(() => {
  if (!config.value) return 0
  const pages = pageCount.value
  for (const tier of config.value.pageCountBonuses) {
    const max = tier.max ?? Infinity
    if (pages >= tier.min && pages <= max) return tier.points
  }
  return 0
})

const estimatedPromptPoints = computed(() => {
  if (!config.value) return 0
  const all = [...config.value.prompts.positive, ...config.value.prompts.negative]
  return selectedPromptIds.value.reduce((sum, id) => {
    const p = all.find((x) => x.id === id)
    return sum + (p?.points ?? 0)
  }, 0)
})

function togglePrompt(id: string) {
  const idx = selectedPromptIds.value.indexOf(id)
  if (idx >= 0) {
    selectedPromptIds.value.splice(idx, 1)
  } else if (selectedPromptIds.value.length < maxPrompts.value) {
    selectedPromptIds.value.push(id)
  }
}

function toggleTeamBonus(id: string) {
  const idx = bonusTeamPromptIds.value.indexOf(id)
  if (idx >= 0) bonusTeamPromptIds.value.splice(idx, 1)
  else bonusTeamPromptIds.value.push(id)
}

watch(submissionType, () => {
  selectedPromptIds.value = []
  targetTeamId.value = ''
})

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    await api('/submissions', {
      method: 'POST',
      body: JSON.stringify({
        bookTitle: bookTitle.value,
        bookAuthor: bookAuthor.value,
        pageCount: pageCount.value,
        format: format.value,
        startedAt: startedAt.value || null,
        finishedAt: finishedAt.value || null,
        isReread: isReread.value,
        submissionType: submissionType.value,
        targetTeamId: submissionType.value === 'sabotage' ? targetTeamId.value : undefined,
        promptIds: selectedPromptIds.value,
        bonusCompetition: bonusCompetition.value,
        bonusTeamPromptIds: bonusTeamPromptIds.value,
      }),
    })
    success.value = true
    step.value = 6
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Submission failed'
  } finally {
    submitting.value = false
  }
}

function nextStep() {
  error.value = ''
  if (step.value === 2 && !submissionType.value) {
    error.value = 'Choose add or sabotage.'
    return
  }
  if (step.value === 2 && submissionType.value === 'sabotage' && !targetTeamId.value) {
    error.value = 'Select a team to attack.'
    return
  }
  if (step.value === 3 && selectedPromptIds.value.length === 0) {
    error.value = 'Select at least one prompt.'
    return
  }
  step.value++
}

function reset() {
  step.value = 1
  success.value = false
  confirmed.value = false
  bookTitle.value = ''
  bookAuthor.value = ''
  selectedPromptIds.value = []
  bonusCompetition.value = false
  bonusTeamPromptIds.value = []
  submissionType.value = null
}
</script>

<template>
  <main v-if="config && user" class="page">
    <h1 class="page-title">Submit a Book</h1>
    <p class="page-lead">
      Team: <strong :style="{ color: config.branding.teams[user.teamId!]?.color }">
        {{ config.branding.teams[user.teamId!]?.name }}
      </strong>
    </p>

    <div class="wizard card">
      <div class="progress">
        <span v-for="n in 5" :key="n" :class="{ active: step >= n, current: step === n }">{{ n }}</span>
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <!-- Step 1: Book -->
      <section v-show="step === 1">
        <h2>📖 Book Details</h2>
        <div class="form-grid">
          <label class="field">Title <input v-model="bookTitle" required /></label>
          <label class="field">Author <input v-model="bookAuthor" required /></label>
          <label class="field">
            Page Count
            <input v-model.number="pageCount" type="number" min="1" />
            <small class="hint">Audiobook? Use Goodreads pages or 40 pages/hour.</small>
          </label>
          <label class="field">
            Format
            <select v-model="format">
              <option value="physical">Physical</option>
              <option value="ebook">Ebook</option>
              <option value="audiobook">Audiobook</option>
              <option value="manga">Manga</option>
              <option value="graphic-novel">Graphic Novel</option>
            </select>
          </label>
          <label class="field">Started <span class="optional">(optional)</span>
            <input v-model="startedAt" type="date" />
          </label>
          <label class="field">Finished <span class="optional">(optional)</span>
            <input v-model="finishedAt" type="date" />
          </label>
        </div>
        <label class="checkbox-row">
          <input v-model="isReread" type="checkbox" /> This is a re-read
        </label>
        <p class="page-bonus-preview">Page bonus for your team: <strong>+{{ pageBonus }} XP</strong></p>
      </section>

      <!-- Step 2: Add or Sabotage -->
      <section v-show="step === 2">
        <h2>⚔️ Add XP or Sabotage?</h2>
        <div class="choice-row">
          <button
            type="button"
            class="choice-btn"
            :class="{ selected: submissionType === 'add' }"
            @click="submissionType = 'add'"
          >
            <span class="choice-icon">🛡</span>
            <strong>Add XP</strong>
            <span>Help your team</span>
          </button>
          <button
            type="button"
            class="choice-btn sabotage"
            :class="{ selected: submissionType === 'sabotage' }"
            @click="submissionType = 'sabotage'"
          >
            <span class="choice-icon">💀</span>
            <strong>Sabotage</strong>
            <span>Attack another realm</span>
          </button>
        </div>
        <div v-if="submissionType === 'sabotage'" class="target-pick">
          <label class="field">
            Target Team
            <select v-model="targetTeamId">
              <option value="" disabled>Choose a realm…</option>
              <option v-for="t in attackTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
        </div>
      </section>

      <!-- Step 3: Prompts -->
      <section v-show="step === 3">
        <h2>📜 Prompts <span class="counter">{{ selectedPromptIds.length }} / {{ maxPrompts }}</span></h2>
        <p class="hint">All prompts must match your choice — positive for add, negative for sabotage.</p>
        <div class="prompt-pick-grid">
          <button
            v-for="p in availablePrompts"
            :key="p.id"
            type="button"
            class="prompt-pick"
            :class="{ selected: selectedPromptIds.includes(p.id) }"
            :disabled="!selectedPromptIds.includes(p.id) && selectedPromptIds.length >= maxPrompts"
            @click="togglePrompt(p.id)"
          >
            <span class="badge" :class="p.points > 0 ? 'badge-positive' : 'badge-negative'">
              {{ p.points > 0 ? '+' : '' }}{{ p.points }}
            </span>
            <strong>{{ p.label }}</strong>
            <em>{{ p.gameName }}</em>
          </button>
        </div>
      </section>

      <!-- Step 4: Bonuses -->
      <section v-show="step === 4">
        <h2>✨ Bonus Prompts</h2>
        <p class="hint">These don't count toward your 5 prompts — layer as many as apply!</p>

        <label class="checkbox-row card bonus-row">
          <input v-model="bonusCompetition" type="checkbox" />
          <div>
            <strong>Competition / trials in the book</strong>
            <span>±10 XP</span>
          </div>
        </label>

        <div v-if="userTeam" class="team-bonuses">
          <label
            v-for="tp in userTeam.bonusPrompts"
            :key="tp.id"
            class="checkbox-row card bonus-row"
          >
            <input
              type="checkbox"
              :checked="bonusTeamPromptIds.includes(tp.id)"
              @change="toggleTeamBonus(tp.id)"
            />
            <div>
              <strong>{{ tp.label }}</strong>
              <span>±10 XP (team bonus)</span>
            </div>
          </label>
        </div>

        <p class="page-bonus-preview">Page count bonus (always your team): <strong>+{{ pageBonus }} XP</strong></p>
      </section>

      <!-- Step 5: Review -->
      <section v-show="step === 5">
        <h2>🔍 Review</h2>
        <div class="review card">
          <p><strong>{{ bookTitle }}</strong> by {{ bookAuthor }} ({{ pageCount }} pages)</p>
          <p>
            {{ submissionType === 'add' ? 'Adding XP to your team' : `Sabotaging ${attackTargets.find(t => t.id === targetTeamId)?.name}` }}
          </p>
          <p>Prompt points: <strong>{{ estimatedPromptPoints }}</strong></p>
          <p>Page bonus: <strong>+{{ pageBonus }}</strong></p>
        </div>
        <label class="checkbox-row confirm-row">
          <input v-model="confirmed" type="checkbox" />
          <span>I've double-checked — <strong>submissions cannot be edited</strong>.</span>
        </label>
      </section>

      <!-- Step 6: Success -->
      <section v-show="step === 6 && success">
        <div class="success-box">
          <h2>Submitted!</h2>
          <p>Your book has been logged. Go forth and read more.</p>
          <button class="btn btn-primary" @click="reset">Submit Another</button>
          <button class="btn btn-secondary" @click="router.push('/my-reads')">View My Reads</button>
        </div>
      </section>

      <div v-if="step < 6" class="wizard-nav">
        <button v-if="step > 1" type="button" class="btn btn-ghost" @click="step--">Back</button>
        <button v-if="step < 5" type="button" class="btn btn-primary" @click="nextStep">Continue</button>
        <button
          v-if="step === 5"
          type="button"
          class="btn btn-primary"
          :disabled="!confirmed || submitting"
          @click="submit"
        >
          {{ submitting ? 'Submitting…' : 'Submit Book' }}
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.wizard {
  max-width: 52rem;
}

.progress {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.progress span {
  flex: 1;
  height: 4px;
  background: var(--realm-border);
  border-radius: 2px;
}

.progress span.active {
  background: var(--realm-accent);
}

.progress span.current {
  box-shadow: 0 0 8px var(--realm-accent);
}

h2 {
  color: var(--realm-text);
  margin-bottom: 1rem;
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.form-grid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.hint {
  color: var(--realm-text-muted);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.optional {
  font-weight: 400;
  color: var(--realm-text-muted);
  font-size: 0.8rem;
}

.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin: 1rem 0;
  color: var(--realm-text-muted);
  cursor: pointer;
}

.page-bonus-preview {
  margin-top: 1rem;
  color: var(--realm-accent-glow);
}

.choice-row {
  display: grid;
  gap: 1rem;
}

@media (min-width: 500px) {
  .choice-row {
    grid-template-columns: 1fr 1fr;
  }
}

.choice-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1.5rem;
  border: 2px solid var(--realm-border);
  border-radius: 12px;
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  cursor: pointer;
  transition: border-color 0.2s;
}

.choice-btn.selected {
  border-color: #3d6b4f;
  background: rgba(61, 107, 79, 0.1);
}

.choice-btn.sabotage.selected {
  border-color: var(--realm-accent);
  background: rgba(196, 92, 62, 0.1);
}

.choice-icon {
  font-size: 2rem;
}

.choice-btn strong {
  color: var(--realm-text);
}

.target-pick {
  margin-top: 1.25rem;
}

.counter {
  font-size: 0.9rem;
  color: var(--realm-accent);
  font-weight: normal;
}

.prompt-pick-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 24rem;
  overflow-y: auto;
}

.prompt-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.75rem;
  text-align: left;
  border: 1px solid var(--realm-border);
  border-radius: 8px;
  background: var(--realm-bg);
  cursor: pointer;
  color: var(--realm-text-muted);
}

.prompt-pick.selected {
  border-color: var(--realm-accent);
  background: rgba(196, 92, 62, 0.08);
}

.prompt-pick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.prompt-pick strong {
  color: var(--realm-text);
  flex: 1;
}

.prompt-pick em {
  font-size: 0.75rem;
  color: var(--realm-accent);
  width: 100%;
}

.bonus-row {
  margin: 0.5rem 0;
  padding: 0.85rem;
}

.bonus-row span {
  display: block;
  font-size: 0.8rem;
  color: var(--realm-text-muted);
}

.review p {
  color: var(--realm-text-muted);
  margin-bottom: 0.5rem;
}

.confirm-row {
  margin-top: 1.25rem;
  color: var(--realm-text);
}

.wizard-nav {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  justify-content: flex-end;
}

.success-box {
  text-align: center;
  padding: 2rem 0;
}

.success-box h2 {
  color: #8fd4a0;
}

.success-box p {
  color: var(--realm-text-muted);
  margin-bottom: 1.5rem;
}

.success-box .btn {
  margin: 0 0.5rem;
}
</style>
