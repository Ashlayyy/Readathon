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

const STEPS = [
  { n: 1, label: 'Book' },
  { n: 2, label: 'Type' },
  { n: 3, label: 'Prompts' },
  { n: 4, label: 'Bonuses' },
  { n: 5, label: 'Review' },
] as const

const step = ref(1)
const error = ref('')
const submitting = ref(false)
const confirmed = ref(false)
const success = ref(false)
const promptSearch = ref('')

const bookTitle = ref('')
const bookAuthor = ref('')
const pageCount = ref(300)
const format = ref('physical')
const startedAt = ref('')
const finishedAt = ref('')

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

const filteredPrompts = computed(() => {
  const q = promptSearch.value.toLowerCase().trim()
  if (!q) return availablePrompts.value
  return availablePrompts.value.filter(
    (p) =>
      p.label.toLowerCase().includes(q) ||
      p.gameName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q),
  )
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

const bonusCount = computed(
  () => bonusTeamPromptIds.value.length + (bonusCompetition.value ? 1 : 0),
)

function teamBrand(teamId: string) {
  return config.value?.branding.teams[teamId]
}

function isPromptSelected(id: string) {
  return selectedPromptIds.value.includes(id)
}

function isTeamBonusSelected(id: string) {
  return bonusTeamPromptIds.value.includes(id)
}

function togglePrompt(id: string) {
  const idx = selectedPromptIds.value.indexOf(id)
  if (idx >= 0) {
    selectedPromptIds.value = selectedPromptIds.value.filter((x) => x !== id)
  } else if (selectedPromptIds.value.length < maxPrompts.value) {
    selectedPromptIds.value = [...selectedPromptIds.value, id]
  }
}

function toggleTeamBonus(id: string) {
  if (isTeamBonusSelected(id)) {
    bonusTeamPromptIds.value = bonusTeamPromptIds.value.filter((x) => x !== id)
  } else {
    bonusTeamPromptIds.value = [...bonusTeamPromptIds.value, id]
  }
}

watch(submissionType, () => {
  selectedPromptIds.value = []
  targetTeamId.value = ''
  promptSearch.value = ''
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
  if (step.value === 1) {
    if (!bookTitle.value.trim()) {
      error.value = 'Enter a book title.'
      return
    }
    if (!bookAuthor.value.trim()) {
      error.value = 'Enter the author.'
      return
    }
    if (!pageCount.value || pageCount.value < 1) {
      error.value = 'Page count must be at least 1.'
      return
    }
  }
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
  promptSearch.value = ''
  bookTitle.value = ''
  bookAuthor.value = ''
  pageCount.value = 300
  format.value = 'physical'
  startedAt.value = ''
  finishedAt.value = ''
  selectedPromptIds.value = []
  bonusCompetition.value = false
  bonusTeamPromptIds.value = []
  submissionType.value = null
  targetTeamId.value = ''
}
</script>

<template>
  <main v-if="config && user" class="page">
    <h1 class="page-title">Submit a Book</h1>
    <p class="page-lead">
      Team:
      <strong :style="{ color: config.branding.teams[user.teamId!]?.color }">
        {{ config.branding.teams[user.teamId!]?.name }}
      </strong>
    </p>

    <div class="wizard card">
      <div class="progress" aria-label="Submission progress">
        <div
          v-for="s in STEPS"
          :key="s.n"
          class="progress-step"
          :class="{ active: step >= s.n, current: step === s.n, done: step > s.n }"
        >
          <span class="progress-dot">{{ step > s.n ? '✓' : s.n }}</span>
          <span class="progress-label">{{ s.label }}</span>
        </div>
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <!-- Step 1: Book -->
      <section v-show="step === 1" class="wizard-step">
        <h2>Book details</h2>
        <p class="step-hint">Tell us what you finished reading.</p>

        <div class="form-grid">
          <label class="field">
            Title
            <input v-model="bookTitle" required placeholder="e.g. The Name of the Wind" />
          </label>
          <label class="field">
            Author
            <input v-model="bookAuthor" required placeholder="e.g. Patrick Rothfuss" />
          </label>
          <label class="field">
            Page count
            <input v-model.number="pageCount" type="number" min="1" />
            <small class="field-hint">Audiobook? Use Goodreads pages or ~40 pages/hour.</small>
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
          <label class="field">
            Started <span class="optional">(optional)</span>
            <input v-model="startedAt" type="date" />
          </label>
          <label class="field">
            Finished <span class="optional">(optional)</span>
            <input v-model="finishedAt" type="date" />
          </label>
        </div>

        <p class="xp-preview">
          Page bonus for your team: <strong>+{{ pageBonus }} XP</strong>
        </p>
      </section>

      <!-- Step 2: Add or Sabotage -->
      <section v-show="step === 2" class="wizard-step">
        <h2>Add XP or sabotage?</h2>
        <p class="step-hint">Positive prompts help your team. Negative prompts attack another realm.</p>

        <div class="choice-row">
          <button
            type="button"
            class="choice-btn"
            :class="{ selected: submissionType === 'add' }"
            :aria-pressed="submissionType === 'add'"
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
            :aria-pressed="submissionType === 'sabotage'"
            @click="submissionType = 'sabotage'"
          >
            <span class="choice-icon">💀</span>
            <strong>Sabotage</strong>
            <span>Attack another realm</span>
          </button>
        </div>

        <div v-if="submissionType === 'sabotage'" class="target-pick">
          <p class="target-label">Choose a realm to attack</p>
          <div
            class="target-team-grid"
            :class="{ 'has-selection': !!targetTeamId }"
            role="radiogroup"
            aria-label="Target team"
          >
            <button
              v-for="t in attackTargets"
              :key="t.id"
              type="button"
              class="target-team-btn"
              :class="{ selected: targetTeamId === t.id }"
              :style="{ '--team-color': teamBrand(t.id)?.color ?? '#888' }"
              :aria-pressed="targetTeamId === t.id"
              @click="targetTeamId = t.id"
            >
              <span class="target-team-accent" aria-hidden="true" />
              <span class="target-team-icon" aria-hidden="true">{{ teamBrand(t.id)?.icon }}</span>
              <span class="target-team-body">
                <span class="target-team-name">{{ teamBrand(t.id)?.name ?? t.name }}</span>
                <span class="target-team-hint" :class="{ visible: targetTeamId === t.id }">Selected target</span>
              </span>
              <span class="target-team-radio" aria-hidden="true">
                <span v-if="targetTeamId === t.id" class="target-team-check">✓</span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- Step 3: Prompts -->
      <section v-show="step === 3" class="wizard-step">
        <div class="step-header-row">
          <div>
            <h2>Pick prompts</h2>
            <p class="step-hint">Choose up to {{ maxPrompts }} that match your book.</p>
          </div>
          <span class="counter-pill">{{ selectedPromptIds.length }} / {{ maxPrompts }}</span>
        </div>

        <input
          v-model="promptSearch"
          type="search"
          class="prompt-search"
          placeholder="Search prompts…"
          aria-label="Search prompts"
        />

        <div v-if="filteredPrompts.length === 0" class="empty-prompts">
          No prompts match your search.
        </div>

        <div class="pick-list" role="list">
          <button
            v-for="p in filteredPrompts"
            :key="p.id"
            type="button"
            role="listitem"
            class="pick-item"
            :class="{ selected: isPromptSelected(p.id) }"
            :aria-pressed="isPromptSelected(p.id)"
            :disabled="!isPromptSelected(p.id) && selectedPromptIds.length >= maxPrompts"
            @click="togglePrompt(p.id)"
          >
            <span class="pick-check" aria-hidden="true">{{ isPromptSelected(p.id) ? '✓' : '' }}</span>
            <span class="pick-content">
              <span class="pick-top">
                <span class="badge" :class="p.points > 0 ? 'badge-positive' : 'badge-negative'">
                  {{ p.points > 0 ? '+' : '' }}{{ p.points }}
                </span>
                <strong>{{ p.label }}</strong>
              </span>
              <span class="pick-sub">{{ p.gameName }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- Step 4: Bonuses -->
      <section v-show="step === 4" class="wizard-step">
        <div class="step-header-row">
          <div>
            <h2>Bonus prompts</h2>
            <p class="step-hint">Optional extras — they don't count toward your {{ maxPrompts }} prompts.</p>
          </div>
          <span v-if="bonusCount" class="counter-pill">{{ bonusCount }} selected</span>
        </div>

        <div class="pick-list">
          <button
            type="button"
            class="pick-item bonus"
            :class="{ selected: bonusCompetition }"
            :aria-pressed="bonusCompetition"
            @click="bonusCompetition = !bonusCompetition"
          >
            <span class="pick-check" aria-hidden="true">{{ bonusCompetition ? '✓' : '' }}</span>
            <span class="pick-content">
              <span class="pick-top">
                <span class="badge badge-positive">±10</span>
                <strong>Competition / trials in the book</strong>
              </span>
              <span class="pick-sub">Applies if the story features contests, trials, or games</span>
            </span>
          </button>

          <template v-if="userTeam">
            <p class="bonus-section-label">{{ userTeam.name }} team bonuses</p>
            <button
              v-for="tp in userTeam.bonusPrompts"
              :key="tp.id"
              type="button"
              class="pick-item bonus"
              :class="{ selected: isTeamBonusSelected(tp.id) }"
              :aria-pressed="isTeamBonusSelected(tp.id)"
              @click="toggleTeamBonus(tp.id)"
            >
              <span class="pick-check" aria-hidden="true">{{ isTeamBonusSelected(tp.id) ? '✓' : '' }}</span>
              <span class="pick-content">
                <span class="pick-top">
                  <span class="badge badge-positive">±10</span>
                  <strong>{{ tp.label }}</strong>
                </span>
                <span class="pick-sub">Team bonus prompt</span>
              </span>
            </button>
          </template>
        </div>

        <p class="xp-preview">Page count bonus (always your team): <strong>+{{ pageBonus }} XP</strong></p>
      </section>

      <!-- Step 5: Review -->
      <section v-show="step === 5" class="wizard-step">
        <h2>Review & submit</h2>
        <p class="step-hint">Double-check everything — submissions can't be edited after sending.</p>

        <div class="review card">
          <dl class="review-grid">
            <div>
              <dt>Book</dt>
              <dd><strong>{{ bookTitle }}</strong> by {{ bookAuthor }}</dd>
            </div>
            <div>
              <dt>Details</dt>
              <dd>{{ pageCount }} pages · {{ format }}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd v-if="submissionType === 'add'">Adding XP to your team</dd>
              <dd v-else>
                Sabotaging
                <strong
                  v-if="targetTeamId"
                  class="target-team-inline"
                  :style="{ color: teamBrand(targetTeamId)?.color }"
                >
                  {{ teamBrand(targetTeamId)?.name }}
                </strong>
                <template v-else>another team</template>
              </dd>
            </div>
            <div>
              <dt>Prompts</dt>
              <dd>{{ selectedPromptIds.length }} selected ({{ estimatedPromptPoints > 0 ? '+' : '' }}{{ estimatedPromptPoints }} XP)</dd>
            </div>
            <div v-if="bonusCount">
              <dt>Bonuses</dt>
              <dd>
                {{ bonusCompetition ? 'Competition/trials' : '' }}
                <template v-if="bonusCompetition && bonusTeamPromptIds.length"> · </template>
                <template v-if="bonusTeamPromptIds.length">{{ bonusTeamPromptIds.length }} team bonus(es)</template>
              </dd>
            </div>
            <div>
              <dt>Page bonus</dt>
              <dd>+{{ pageBonus }} XP</dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          class="toggle-card confirm"
          :class="{ selected: confirmed }"
          :aria-pressed="confirmed"
          @click="confirmed = !confirmed"
        >
          <span class="toggle-check" aria-hidden="true">{{ confirmed ? '✓' : '' }}</span>
          <span class="toggle-body">
            <strong>I'm ready to submit</strong>
            <span>I understand submissions cannot be edited after sending.</span>
          </span>
        </button>
      </section>

      <!-- Step 6: Success -->
      <section v-show="step === 6 && success" class="wizard-step">
        <div class="success-box">
          <div class="success-icon" aria-hidden="true">✓</div>
          <h2>Submitted!</h2>
          <p>Your book has been logged. Go forth and read more.</p>
          <div class="success-actions">
            <button type="button" class="btn btn-primary" @click="reset">Submit another</button>
            <button type="button" class="btn btn-secondary" @click="router.push('/profile?tab=books')">
              View my books
            </button>
          </div>
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
          {{ submitting ? 'Submitting…' : 'Submit book' }}
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.wizard {
  max-width: 52rem;
}

/* Progress */
.progress {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 1.75rem;
}

.progress-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.progress-dot {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--realm-bg);
  border: 2px solid var(--realm-border);
  color: var(--realm-text-muted);
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.progress-step.active .progress-dot {
  border-color: var(--realm-accent);
  color: var(--realm-accent-glow);
}

.progress-step.current .progress-dot {
  background: var(--realm-accent);
  border-color: var(--realm-accent);
  color: white;
  box-shadow: 0 0 12px rgba(212, 99, 74, 0.45);
}

.progress-step.done .progress-dot {
  background: rgba(110, 207, 138, 0.15);
  border-color: var(--realm-success);
  color: var(--realm-success);
}

.progress-label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--realm-text-muted);
  text-align: center;
  line-height: 1.2;
}

.progress-step.current .progress-label {
  color: var(--realm-accent-glow);
}

.wizard-step h2 {
  color: var(--realm-text);
  margin-bottom: 0.35rem;
  font-family: var(--font-display);
  font-size: 1.2rem;
}

.step-hint {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  margin-bottom: 1.25rem;
  line-height: 1.55;
}

.step-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.25rem;
}

.step-header-row .step-hint {
  margin-bottom: 0;
}

.counter-pill {
  flex-shrink: 0;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(212, 99, 74, 0.12);
  border: 1px solid rgba(212, 99, 74, 0.35);
  color: var(--realm-accent-glow);
  font-size: 0.82rem;
  font-weight: 700;
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

.field-hint {
  font-weight: 400;
  color: var(--realm-text-muted);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.optional {
  font-weight: 400;
  color: var(--realm-text-muted);
  font-size: 0.8rem;
}

/* Toggle cards (replaces broken checkboxes) */
.toggle-card {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  width: 100%;
  margin-top: 1rem;
  padding: 1rem 1.1rem;
  text-align: left;
  border: 2px solid var(--realm-border);
  border-radius: 10px;
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  cursor: pointer;
  font-family: var(--font-body);
  transition: border-color 0.2s, background 0.2s;
}

.toggle-card:hover {
  border-color: rgba(212, 99, 74, 0.45);
}

.toggle-card.selected {
  border-color: var(--realm-accent);
  background: rgba(212, 99, 74, 0.08);
}

.toggle-card.confirm.selected {
  border-color: var(--realm-success);
  background: rgba(110, 207, 138, 0.08);
}

.toggle-check {
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 4px;
  border: 2px solid var(--realm-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
  margin-top: 0.1rem;
  transition: background 0.2s, border-color 0.2s;
}

.toggle-card.selected .toggle-check {
  background: var(--realm-accent);
  border-color: var(--realm-accent);
}

.toggle-card.confirm.selected .toggle-check {
  background: var(--realm-success);
  border-color: var(--realm-success);
}

.toggle-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.toggle-body strong {
  color: var(--realm-text);
  font-size: 0.95rem;
}

.toggle-body span {
  font-size: 0.82rem;
  line-height: 1.45;
}

.xp-preview {
  margin-top: 1.25rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: rgba(212, 99, 74, 0.08);
  border: 1px solid rgba(212, 99, 74, 0.2);
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}

.xp-preview strong {
  color: var(--realm-accent-glow);
}

/* Add / sabotage */
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
  font-family: var(--font-body);
  transition: border-color 0.2s, background 0.2s, transform 0.15s;
}

.choice-btn:hover {
  border-color: rgba(212, 99, 74, 0.4);
}

.choice-btn.selected {
  border-color: #3d6b4f;
  background: rgba(61, 107, 79, 0.12);
}

.choice-btn.sabotage.selected {
  border-color: var(--realm-accent);
  background: rgba(212, 99, 74, 0.12);
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

.target-label {
  font-weight: 600;
  color: var(--realm-text);
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.target-team-grid {
  display: grid;
  gap: 0.65rem;
}

.target-team-grid.has-selection .target-team-btn:not(.selected) {
  opacity: 0.45;
}

.target-team-grid.has-selection .target-team-btn:not(.selected):hover {
  opacity: 0.7;
}

@media (min-width: 500px) {
  .target-team-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.target-team-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.9rem 1rem 0.9rem 1.15rem;
  text-align: left;
  border: 2px solid color-mix(in srgb, var(--team-color) 35%, var(--realm-border));
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    var(--realm-bg) 0%,
    color-mix(in srgb, var(--team-color) 8%, var(--realm-bg)) 100%
  );
  color: var(--realm-text-muted);
  cursor: pointer;
  font-family: var(--font-body);
  overflow: hidden;
  transition:
    border-color 0.2s,
    background 0.2s,
    opacity 0.2s;
}

.target-team-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  background: color-mix(in srgb, var(--team-color) 35%, transparent);
  transition: background 0.2s;
}

.target-team-btn.selected .target-team-accent {
  background: var(--team-color);
}

.target-team-btn:hover {
  border-color: color-mix(in srgb, var(--team-color) 55%, var(--realm-border));
}

.target-team-btn.selected {
  border-color: var(--team-color);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--team-color) 14%, var(--realm-bg)) 0%,
    color-mix(in srgb, var(--team-color) 6%, var(--realm-surface)) 100%
  );
}

.target-team-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-height: 2.4rem;
  justify-content: center;
}

.target-team-icon {
  flex-shrink: 0;
  width: 1.5rem;
  font-size: 1.5rem;
  color: var(--team-color);
  line-height: 1;
  text-align: center;
}

.target-team-name {
  color: var(--realm-text);
  font-weight: 600;
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}

.target-team-hint {
  min-height: 1.05rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--team-color);
  opacity: 0;
  transition: opacity 0.2s;
}

.target-team-hint.visible {
  opacity: 1;
}

.target-team-radio {
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--team-color) 50%, var(--realm-border));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, border-color 0.2s;
}

.target-team-btn.selected .target-team-radio {
  background: var(--team-color);
  border-color: var(--team-color);
}

.target-team-check {
  font-size: 0.7rem;
  font-weight: 700;
  color: white;
  line-height: 1;
}

.target-team-inline {
  font-family: var(--font-display);
}

/* Pick list (prompts + bonuses) */
.prompt-search {
  margin-bottom: 1rem;
}

.empty-prompts {
  padding: 1.5rem;
  text-align: center;
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  border: 1px dashed var(--realm-border);
  border-radius: var(--radius);
}

.pick-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 22rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 0.15rem;
}

.pick-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1rem;
  text-align: left;
  border: 2px solid var(--realm-border);
  border-radius: 10px;
  background: var(--realm-bg);
  color: var(--realm-text-muted);
  cursor: pointer;
  font-family: var(--font-body);
  transition: border-color 0.2s, background 0.2s, opacity 0.2s;
}

.pick-item:hover:not(:disabled) {
  border-color: rgba(212, 99, 74, 0.4);
}

.pick-item.selected {
  border-color: var(--realm-accent);
  background: rgba(212, 99, 74, 0.08);
}

.pick-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pick-check {
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 4px;
  border: 2px solid var(--realm-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
  margin-top: 0.15rem;
  transition: background 0.2s, border-color 0.2s;
}

.pick-item.selected .pick-check {
  background: var(--realm-accent);
  border-color: var(--realm-accent);
}

.pick-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.pick-top {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}

.pick-top strong {
  color: var(--realm-text);
  font-size: 0.92rem;
  line-height: 1.4;
  flex: 1;
}

.pick-sub {
  font-size: 0.78rem;
  color: var(--realm-accent);
  font-style: italic;
  line-height: 1.4;
}

.bonus-section-label {
  margin: 0.75rem 0 0.25rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--realm-text-muted);
}

/* Review */
.review {
  background: var(--realm-bg);
  margin-bottom: 1rem;
}

.review-grid {
  display: grid;
  gap: 0.85rem;
}

.review-grid dt {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--realm-text-muted);
  margin-bottom: 0.2rem;
}

.review-grid dd {
  color: var(--realm-text);
  font-size: 0.92rem;
  line-height: 1.5;
  margin: 0;
}

.wizard-nav {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--realm-border);
  justify-content: flex-end;
}

/* Success */
.success-box {
  text-align: center;
  padding: 1.5rem 0 0.5rem;
}

.success-icon {
  width: 3.5rem;
  height: 3.5rem;
  margin: 0 auto 1rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(110, 207, 138, 0.15);
  border: 2px solid var(--realm-success);
  color: var(--realm-success);
  font-size: 1.5rem;
  font-weight: 700;
}

.success-box h2 {
  color: var(--realm-success);
  margin-bottom: 0.5rem;
}

.success-box p {
  color: var(--realm-text-muted);
  margin-bottom: 1.5rem;
}

.success-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

@media (max-width: 768px) {
  .wizard {
    max-width: 100%;
  }

  .progress-label {
    font-size: 0.6rem;
  }

  .wizard-nav {
    flex-direction: column-reverse;
    gap: 0.5rem;
  }

  .wizard-nav .btn {
    width: 100%;
    justify-content: center;
  }

  .pick-list {
    max-height: none;
  }

  .success-actions {
    flex-direction: column;
  }

  .success-actions .btn {
    width: 100%;
  }

  .choice-row {
    grid-template-columns: 1fr;
  }

  .step-header-row {
    flex-direction: column;
    gap: 0.5rem;
  }

  .counter-pill {
    align-self: flex-start;
  }
}
</style>
