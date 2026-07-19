<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, type PromptXpTier, type SubmitStrategy } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import SubmitXpPreview from '../components/SubmitXpPreview.vue'
import OptionalDatePicker from '../components/OptionalDatePicker.vue'
import type { Prompt } from '../lib/api'

const { user } = useAuth()
const { config, loadConfig, getTeam } = useConfig()
const { t } = useCopy()
const router = useRouter()

const steps = computed(() => {
  const c = config.value?.copy
  if (!c) return []
  return [
    { n: 1, label: String(c.submitStepBook) },
    { n: 2, label: String(c.submitStepType) },
    { n: 3, label: String(c.submitStepPrompts) },
    { n: 4, label: String(c.submitStepBonuses) },
    { n: 5, label: String(c.submitStepReview) },
  ]
})

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
const strategy = ref<SubmitStrategy | null>(null)

onMounted(loadConfig)

async function loadStrategy() {
  if (user.value?.status !== 'assigned') {
    strategy.value = null
    return
  }
  try {
    strategy.value = await api<SubmitStrategy>('/submissions/strategy')
  } catch {
    strategy.value = null
  }
}

function applyStrategySuggestion() {
  if (!strategy.value?.suggestion) return
  submissionType.value = strategy.value.suggestion
  if (strategy.value.suggestion === 'sabotage' && strategy.value.targetTeamId) {
    targetTeamId.value = strategy.value.targetTeamId
  }
}

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

const submissionSign = computed(() => (submissionType.value === 'add' ? 1 : submissionType.value === 'sabotage' ? -1 : 0))

const estimatedBonusPoints = computed(() => {
  if (!config.value || !userTeam.value || !submissionSign.value) return 0
  let sum = 0
  if (bonusCompetition.value) {
    sum += (config.value.globalBonuses[0]?.points ?? 10) * submissionSign.value
  }
  for (const id of bonusTeamPromptIds.value) {
    const tp = userTeam.value.bonusPrompts.find((p) => p.id === id)
    if (tp) sum += tp.points * submissionSign.value
  }
  return sum
})

const targetTeam = computed(() =>
  targetTeamId.value ? config.value?.teams.find((t) => t.id === targetTeamId.value) : undefined,
)

const selectedPromptDetails = computed(() => {
  if (!config.value) return []
  const all = [...config.value.prompts.positive, ...config.value.prompts.negative]
  return selectedPromptIds.value
    .map((id) => all.find((p) => p.id === id))
    .filter((p): p is Prompt => Boolean(p))
})

const selectedBonusDetails = computed(() => {
  if (!config.value || !userTeam.value || !submissionSign.value) return [] as Array<{ label: string; points: number }>
  const rows: Array<{ label: string; points: number }> = []
  if (bonusCompetition.value && config.value.globalBonuses[0]) {
    rows.push({
      label: config.value.globalBonuses[0].label,
      points: config.value.globalBonuses[0].points * submissionSign.value,
    })
  }
  for (const id of bonusTeamPromptIds.value) {
    const tp = userTeam.value.bonusPrompts.find((p) => p.id === id)
    if (tp) rows.push({ label: tp.label, points: tp.points * submissionSign.value })
  }
  return rows
})

function formatSignedXp(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

function promptBadgeStyle(points: number, xpTiers?: PromptXpTier[]) {
  const tier = xpTiers?.find((row) => row.points === Math.abs(points))
  if (!tier) return undefined
  const isGain = points >= 0
  return {
    color: isGain ? tier.gainColor : tier.attackColor,
    background: isGain ? tier.gainGlow : tier.attackGlow,
    borderColor: `color-mix(in srgb, ${isGain ? tier.gainColor : tier.attackColor} 35%, transparent)`,
  }
}

function bonusPointsLabel(points: number): string {
  return formatSignedXp(points * (submissionSign.value || 1))
}

const bonusCount = computed(
  () =>
    bonusTeamPromptIds.value.length +
    (bonusCompetition.value ? (config.value?.globalBonuses.length ?? 0) > 0 ? 1 : 0 : 0),
)

function toggleGlobalBonus(bonusId: string) {
  const firstId = config.value?.globalBonuses[0]?.id
  if (bonusId === firstId) {
    bonusCompetition.value = !bonusCompetition.value
  }
}

function isGlobalBonusSelected(bonusId: string) {
  const firstId = config.value?.globalBonuses[0]?.id
  return bonusId === firstId && bonusCompetition.value
}

function globalBonusLabel(bonus: { points: number }) {
  if (!submissionSign.value) return `±${Math.abs(bonus.points)}`
  return formatSignedXp(bonus.points * submissionSign.value)
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

watch(step, (s) => {
  if (s === 2) void loadStrategy()
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
    <h1 class="page-title">{{ config.copy.submitPageTitle }}</h1>
    <p class="page-lead">
      {{ config.copy.submitPageLead }}
      <strong :style="{ color: getTeam(user.teamId!)?.color }">
        {{ getTeam(user.teamId!)?.name }}
      </strong>
    </p>

    <div class="wizard card">
      <div class="progress" aria-label="Submission progress">
        <div
          v-for="s in steps"
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
        <h2>{{ config.copy.submitBookTitle }}</h2>
        <p class="step-hint">{{ config.copy.submitBookHint }}</p>

        <div class="form-grid">
          <label class="field">
            {{ config.copy.submitTitleLabel }}
            <input v-model="bookTitle" required :placeholder="String(config.copy.submitTitlePlaceholder)" />
          </label>
          <label class="field">
            {{ config.copy.submitAuthorLabel }}
            <input v-model="bookAuthor" required :placeholder="String(config.copy.submitAuthorPlaceholder)" />
          </label>
          <label class="field">
            {{ config.copy.submitPageCountLabel }}
            <input v-model.number="pageCount" type="number" min="1" />
            <small class="field-hint">{{ config.copy.submitPageCountHint }}</small>
          </label>
          <label class="field">
            {{ config.copy.submitFormatLabel }}
            <select v-model="format">
              <option value="physical">Physical</option>
              <option value="ebook">Ebook</option>
              <option value="audiobook">Audiobook</option>
              <option value="manga">Manga</option>
              <option value="graphic-novel">Graphic Novel</option>
            </select>
          </label>
          <OptionalDatePicker
            v-model="startedAt"
            :label="String(config.copy.submitStartedLabel)"
          />
          <OptionalDatePicker
            v-model="finishedAt"
            :label="String(config.copy.submitFinishedLabel)"
          />
        </div>

        <SubmitXpPreview
          :submission-type="null"
          :user-team="userTeam"
          :prompt-points="0"
          :bonus-points="0"
          :page-bonus="pageBonus"
        />
      </section>

      <!-- Step 2: Add or Sabotage -->
      <section v-show="step === 2" class="wizard-step">
        <h2>{{ config.copy.submitTypeTitle }}</h2>
        <p class="step-hint">{{ config.copy.submitTypeHint }}</p>

        <div v-if="strategy?.suggestion && strategy.reason" class="strategy-hint card">
          <p class="strategy-label">{{ config.copy.submitStrategyLabel }}</p>
          <p class="strategy-reason">{{ strategy.reason }}</p>
          <button type="button" class="btn btn-secondary btn-sm" @click="applyStrategySuggestion">
            {{
              strategy.suggestion === 'add'
                ? config.copy.submitStrategyUseAdd
                : t(String(config.copy.submitStrategyUseAttack), {
                    team: strategy.targetTeamName ?? 'rival',
                  })
            }}
          </button>
        </div>

        <div class="choice-row">
          <button
            type="button"
            class="choice-btn"
            :class="{ selected: submissionType === 'add' }"
            :aria-pressed="submissionType === 'add'"
            @click="submissionType = 'add'"
          >
            <span class="choice-icon">🛡</span>
            <strong>{{ config.copy.submitAddXp }}</strong>
            <span>{{ config.copy.submitAddXpHint }}</span>
          </button>
          <button
            type="button"
            class="choice-btn sabotage"
            :class="{ selected: submissionType === 'sabotage' }"
            :aria-pressed="submissionType === 'sabotage'"
            @click="submissionType = 'sabotage'"
          >
            <span class="choice-icon">💀</span>
            <strong>{{ config.copy.submitSabotage }}</strong>
            <span>{{ config.copy.submitSabotageHint }}</span>
          </button>
        </div>

        <div v-if="submissionType === 'sabotage'" class="target-pick">
          <p class="target-label">{{ config.copy.submitTargetLabel }}</p>
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
              :style="{ '--team-color': getTeam(t.id)?.color ?? '#888' }"
              :aria-pressed="targetTeamId === t.id"
              @click="targetTeamId = t.id"
            >
              <span class="target-team-accent" aria-hidden="true" />
              <span class="target-team-icon" aria-hidden="true">{{ getTeam(t.id)?.icon }}</span>
              <span class="target-team-body">
                <span class="target-team-name">{{ getTeam(t.id)?.name ?? t.name }}</span>
                <span class="target-team-hint" :class="{ visible: targetTeamId === t.id }">{{ config.copy.submitTargetSelected }}</span>
              </span>
              <span class="target-team-radio" aria-hidden="true">
                <span v-if="targetTeamId === t.id" class="target-team-check">✓</span>
              </span>
            </button>
          </div>
        </div>

        <SubmitXpPreview
          v-if="submissionType"
          :submission-type="submissionType"
          :user-team="userTeam"
          :target-team="targetTeam"
          :prompt-points="estimatedPromptPoints"
          :bonus-points="estimatedBonusPoints"
          :page-bonus="pageBonus"
        />
      </section>

      <!-- Step 3: Prompts -->
      <section v-show="step === 3" class="wizard-step">
        <div class="step-header-row">
          <div>
            <h2>{{ config.copy.submitPromptsTitle }}</h2>
            <p class="step-hint">{{ t(String(config.copy.submitPromptsHint)) }}</p>
          </div>
          <span class="counter-pill">
            {{ selectedPromptIds.length }} / {{ maxPrompts }}
            <template v-if="estimatedPromptPoints !== 0">
              · {{ formatSignedXp(estimatedPromptPoints) }} points
            </template>
          </span>
        </div>

        <input
          v-model="promptSearch"
          type="search"
          class="prompt-search"
          :placeholder="String(config.copy.promptsSearchPlaceholder)"
          aria-label="Search prompts"
        />

        <div v-if="filteredPrompts.length === 0" class="empty-prompts">
          {{ config.copy.submitPromptsEmpty }}
        </div>

        <div class="pick-list" role="list">
          <button
            v-for="p in filteredPrompts"
            :key="p.id"
            type="button"
            role="listitem"
            class="pick-item"
            :class="{ selected: isPromptSelected(p.id), 'add-pick': submissionType === 'add' }"
            :aria-pressed="isPromptSelected(p.id)"
            :disabled="!isPromptSelected(p.id) && selectedPromptIds.length >= maxPrompts"
            @click="togglePrompt(p.id)"
          >
            <span class="pick-check" aria-hidden="true">{{ isPromptSelected(p.id) ? '✓' : '' }}</span>
            <span class="pick-content">
              <span class="pick-top">
                <span
                  class="xp-pill"
                  :style="promptBadgeStyle(p.points, config.promptXpTiers)"
                >
                  {{ p.points > 0 ? '+' : '' }}{{ p.points }}
                </span>
                <strong>{{ p.label }}</strong>
              </span>
              <span class="pick-sub">{{ p.gameName }}</span>
            </span>
          </button>
        </div>

        <SubmitXpPreview
          v-if="submissionType"
          :submission-type="submissionType"
          :user-team="userTeam"
          :target-team="targetTeam"
          :prompt-points="estimatedPromptPoints"
          :bonus-points="estimatedBonusPoints"
          :page-bonus="pageBonus"
        />
      </section>

      <!-- Step 4: Bonuses -->
      <section v-show="step === 4" class="wizard-step">
        <div class="step-header-row">
          <div>
            <h2>{{ config.copy.submitBonusesTitle }}</h2>
            <p class="step-hint">{{ t(String(config.copy.submitBonusesHint)) }}</p>
          </div>
          <span v-if="bonusCount" class="counter-pill">{{ bonusCount }} selected</span>
        </div>

        <div class="pick-list">
          <button
            v-for="gb in config.globalBonuses"
            :key="gb.id"
            type="button"
            class="pick-item bonus"
            :class="{ selected: isGlobalBonusSelected(gb.id) }"
            :aria-pressed="isGlobalBonusSelected(gb.id)"
            @click="toggleGlobalBonus(gb.id)"
          >
            <span class="pick-check" aria-hidden="true">{{ isGlobalBonusSelected(gb.id) ? '✓' : '' }}</span>
            <span class="pick-content">
              <span class="pick-top">
                <span
                  class="xp-pill"
                  :class="submissionSign < 0 ? 'attack' : 'gain'"
                >{{ globalBonusLabel(gb) }} points</span>
                <strong>{{ gb.label }}</strong>
              </span>
              <span class="pick-sub">{{ gb.description }}</span>
            </span>
          </button>

          <template v-if="userTeam">
            <p class="bonus-section-label">{{ t(String(config.copy.submitTeamBonusesLabel), { teamName: userTeam.name }) }}</p>
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
                  <span
                    class="xp-pill"
                    :class="submissionSign < 0 ? 'attack' : 'gain'"
                  >{{ bonusPointsLabel(tp.points) }} points</span>
                  <strong>{{ tp.label }}</strong>
                </span>
                <span class="pick-sub">{{ config.copy.submitTeamBonusSub }}</span>
              </span>
            </button>
          </template>
        </div>

        <SubmitXpPreview
          v-if="submissionType"
          :submission-type="submissionType"
          :user-team="userTeam"
          :target-team="targetTeam"
          :prompt-points="estimatedPromptPoints"
          :bonus-points="estimatedBonusPoints"
          :page-bonus="pageBonus"
        />
      </section>

      <!-- Step 5: Review -->
      <section v-show="step === 5" class="wizard-step">
        <h2>{{ config.copy.submitReviewTitle }}</h2>
        <p class="step-hint">{{ config.copy.submitReviewHint }}</p>

        <div class="review-layout">
          <div class="review card">
            <dl class="review-grid">
              <div>
                <dt>{{ config.copy.submitReviewBook }}</dt>
                <dd><strong>{{ bookTitle }}</strong> by {{ bookAuthor }}</dd>
              </div>
              <div>
                <dt>{{ config.copy.submitReviewDetails }}</dt>
                <dd>{{ pageCount }} pages · {{ format }}</dd>
              </div>
              <div>
                <dt>{{ config.copy.submitReviewType }}</dt>
                <dd v-if="submissionType === 'add'">{{ config.copy.submitReviewAdding }}</dd>
                <dd v-else>
                  {{ config.copy.submitReviewSabotaging }}
                  <strong
                    v-if="targetTeamId"
                    class="target-team-inline"
                    :style="{ color: getTeam(targetTeamId)?.color }"
                  >
                    {{ getTeam(targetTeamId)?.name }}
                  </strong>
                  <template v-else>{{ config.copy.submitReviewAnotherTeam }}</template>
                </dd>
              </div>
            </dl>

            <div v-if="selectedPromptDetails.length" class="review-breakdown">
              <h3 class="review-breakdown-title">{{ config.copy.submitReviewPrompts }}</h3>
              <ul class="review-breakdown-list">
                <li v-for="p in selectedPromptDetails" :key="p.id">
                  <span>{{ p.label }}</span>
                  <span class="review-xp" :class="p.points > 0 ? 'gain' : 'attack'">
                    {{ formatSignedXp(p.points) }} points
                  </span>
                </li>
              </ul>
            </div>

            <div v-if="selectedBonusDetails.length" class="review-breakdown">
              <h3 class="review-breakdown-title">{{ config.copy.submitReviewBonuses }}</h3>
              <ul class="review-breakdown-list">
                <li v-for="(b, i) in selectedBonusDetails" :key="i">
                  <span>{{ b.label }}</span>
                  <span class="review-xp" :class="b.points > 0 ? 'gain' : 'attack'">
                    {{ formatSignedXp(b.points) }} points
                  </span>
                </li>
              </ul>
            </div>

            <div v-if="pageBonus > 0" class="review-breakdown">
              <h3 class="review-breakdown-title">{{ config.copy.submitReviewPageBonus }}</h3>
              <ul class="review-breakdown-list">
                <li>
                  <span>{{ pageCount }} pages</span>
                  <span class="review-xp gain">+{{ pageBonus }} points</span>
                </li>
              </ul>
            </div>
          </div>

          <SubmitXpPreview
            v-if="submissionType"
            compact
            :submission-type="submissionType"
            :user-team="userTeam"
            :target-team="targetTeam"
            :prompt-points="estimatedPromptPoints"
            :bonus-points="estimatedBonusPoints"
            :page-bonus="pageBonus"
          />
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
            <strong>{{ config.copy.submitConfirmTitle }}</strong>
            <span>{{ config.copy.submitConfirmHint }}</span>
          </span>
        </button>
      </section>

      <!-- Step 6: Success -->
      <section v-show="step === 6 && success" class="wizard-step">
        <div class="success-box">
          <div class="success-icon" aria-hidden="true">✓</div>
          <h2>{{ config.copy.submitSuccessTitle }}</h2>
          <p>{{ config.copy.submitSuccessBody }}</p>

          <SubmitXpPreview
            v-if="submissionType"
            :submission-type="submissionType"
            :user-team="userTeam"
            :target-team="targetTeam"
            :prompt-points="estimatedPromptPoints"
            :bonus-points="estimatedBonusPoints"
            :page-bonus="pageBonus"
          />

          <div class="success-actions">
            <button type="button" class="btn btn-primary" @click="reset">{{ config.copy.submitAnother }}</button>
            <button type="button" class="btn btn-secondary" @click="router.push('/profile?tab=books')">
              {{ config.copy.submitViewBooks }}
            </button>
          </div>
        </div>
      </section>

      <div v-if="step < 6" class="wizard-nav">
        <button v-if="step > 1" type="button" class="btn btn-ghost" @click="step--">{{ config.copy.submitBack }}</button>
        <button v-if="step < 5" type="button" class="btn btn-primary" @click="nextStep">{{ config.copy.submitContinue }}</button>
        <button
          v-if="step === 5"
          type="button"
          class="btn btn-primary"
          :disabled="!confirmed || submitting"
          @click="submit"
        >
          {{ submitting ? config.copy.submitSubmitting : config.copy.submitSubmitButton }}
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
  font-size: 0.82rem;
  margin-bottom: 0.85rem;
  line-height: 1.45;
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

/* Strategy hint */
.strategy-hint {
  margin-bottom: 0.85rem;
  padding: 0.7rem 0.85rem;
  border-color: color-mix(in srgb, var(--realm-accent) 35%, var(--realm-border));
  background: linear-gradient(
    135deg,
    var(--realm-surface) 0%,
    color-mix(in srgb, var(--realm-accent) 8%, var(--realm-surface)) 100%
  );
}

.strategy-label {
  margin: 0 0 0.25rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--realm-accent-glow);
}

.strategy-reason {
  margin: 0 0 0.6rem;
  color: var(--realm-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
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
    grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
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

.pick-item.selected.add-pick {
  border-color: rgba(110, 207, 138, 0.55);
  background: rgba(110, 207, 138, 0.08);
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

.pick-item.selected.add-pick .pick-check {
  background: var(--realm-success);
  border-color: var(--realm-success);
}

.xp-pill {
  flex-shrink: 0;
  min-width: 2.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--realm-border);
  background: var(--realm-surface-alt);
  color: var(--realm-text);
  font-size: 0.72rem;
  font-weight: 800;
  font-family: var(--font-display);
  text-align: center;
}

.xp-pill.gain {
  color: var(--realm-success);
  border-color: rgba(110, 207, 138, 0.35);
  background: rgba(110, 207, 138, 0.12);
}

.xp-pill.attack {
  color: var(--realm-accent-glow);
  border-color: rgba(212, 99, 74, 0.4);
  background: rgba(212, 99, 74, 0.12);
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
.review-layout {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}

@media (min-width: 768px) {
  .review-layout {
    grid-template-columns: 1.2fr 0.8fr;
    align-items: start;
  }
}

.review {
  background: var(--realm-bg);
}

.review-breakdown {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--realm-border);
}

.review-breakdown-title {
  margin: 0 0 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--realm-text-muted);
}

.review-breakdown-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.review-breakdown-list li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  font-size: 0.88rem;
  color: var(--realm-text);
}

.review-xp {
  flex-shrink: 0;
  font-weight: 800;
  font-family: var(--font-display);
  font-size: 0.82rem;
}

.review-xp.gain {
  color: var(--realm-success);
}

.review-xp.attack {
  color: var(--realm-accent-glow);
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

  .progress-step:not(.current) .progress-label {
    display: none;
  }

  .progress-label {
    font-size: 0.72rem;
    max-width: 4.5rem;
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
