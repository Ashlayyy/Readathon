<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, apiUrl, type StandingsBreakdown, type TeamStanding } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import StandingsPanel from '../components/StandingsPanel.vue'
import StandingsBreakdownPanel from '../components/StandingsBreakdownPanel.vue'
import StandingsVibes, {
  type StandingsVibes as VibesData,
} from '../components/StandingsVibes.vue'
import ChangelogModal from '../components/ChangelogModal.vue'

const { config, loadConfig } = useConfig()
const { user, fetchUser } = useAuth()
const { t } = useCopy()
const standings = ref<TeamStanding[] | null>(null)
const standingsImageUrl = ref<string | null>(null)
const breakdown = ref<StandingsBreakdown | null>(null)
const breakdownImageUrl = ref<string | null>(null)
const publishedAt = ref<string | null>(null)
const vibes = ref<VibesData | null>(null)
const standingsOpen = ref(false)
const changelogOpen = ref(false)

const canSubmit = computed(() => user.value?.status === 'assigned')

const activeTheme = computed(() => config.value?.site?.activeMonthlyEvent ?? null)

function mediaUrl(path: string | null | undefined): string {
  const p = path?.trim() ?? ''
  if (!p) return ''
  if (/^https?:\/\//i.test(p)) return p
  return apiUrl(p)
}

const profilePath = computed(() =>
  user.value ? `/readers/${user.value.id}` : '/login',
)

const submitBannerTitle = computed(
  () =>
    (config.value?.copy.homeSubmitBanner as { title?: string } | undefined)?.title ??
    'Finished a book?',
)

const submitBannerBody = computed(
  () =>
    (config.value?.copy.homeSubmitBanner as { body?: string } | undefined)?.body ??
    'Log it here to add points for your realm or sabotage a rival.',
)

const submitQuickTitle = computed(
  () => String(config.value?.copy.homeQuickLinks?.submitTitle ?? 'Submit a book'),
)

const submitQuickDescription = computed(
  () =>
    String(config.value?.copy.homeQuickLinks?.submitDescription ?? 'Log your read and claim prompts.'),
)

onMounted(async () => {
  await Promise.all([loadConfig(), fetchUser()])
  try {
    const data = await api<{
      published: boolean
      standings?: TeamStanding[]
      breakdown?: StandingsBreakdown | null
      imageUrl?: string | null
      breakdownImageUrl?: string | null
      publishedAt?: string
      vibes?: VibesData | null
    }>('/standings')
    if (data.published) {
      standings.value = data.standings ?? null
      breakdown.value = data.breakdown ?? null
      publishedAt.value = data.publishedAt ?? null
      standingsImageUrl.value = data.imageUrl ? apiUrl(data.imageUrl) : null
      breakdownImageUrl.value = data.breakdownImageUrl
        ? apiUrl(data.breakdownImageUrl)
        : null
      vibes.value = data.vibes ?? null
    }
  } catch {
    /* no published standings yet */
  }
})
</script>

<template>
  <main v-if="config" class="page">
    <section class="hero">
      <p class="eyebrow">{{ config.event.subtitle }}</p>
      <h1>{{ config.event.name }}</h1>
      <p class="tagline">{{ config.event.tagline }}</p>
      <div class="hero-actions">
        <RouterLink v-if="!user" to="/login" class="btn btn-primary">{{ config.copy.enterCta }}</RouterLink>
        <RouterLink v-else-if="canSubmit" to="/submit" class="btn btn-primary">
          {{ config.copy.submitCta }}
        </RouterLink>
        <template v-else>
          <RouterLink :to="profilePath" class="btn btn-primary">{{ config.copy.profileBooksTab }}</RouterLink>
        </template>
        <RouterLink to="/how-it-works" class="btn btn-secondary">{{ config.copy.howItWorksCta }}</RouterLink>
        <button type="button" class="btn btn-ghost changelog-btn" @click="changelogOpen = true">
          What’s new
        </button>
      </div>
    </section>

    <ChangelogModal v-model:open="changelogOpen" />

    <section v-if="activeTheme" class="theme-banner" aria-label="Theme of the month">
      <p class="theme-eyebrow">Theme of the month</p>
      <h2>{{ activeTheme.title || 'Special month' }}</h2>
      <p v-if="activeTheme.blurb">{{ activeTheme.blurb }}</p>
      <p class="theme-dates">{{ activeTheme.from }} → {{ activeTheme.to }}</p>
      <div v-if="activeTheme.imageUrl" class="theme-photo">
        <img
          :src="mediaUrl(activeTheme.imageUrl)"
          :alt="`${activeTheme.title || 'Theme'} photo`"
        />
      </div>
      <div
        v-if="activeTheme.readerOfMonth"
        class="theme-reader"
      >
        <p class="theme-reader-label">Reader of the month</p>
        <div class="theme-reader-row">
          <img
            v-if="activeTheme.readerOfMonth.avatarUrl"
            class="theme-reader-avatar"
            :src="mediaUrl(activeTheme.readerOfMonth.avatarUrl)"
            alt=""
          />
          <div>
            <p class="theme-reader-name">
              {{ activeTheme.readerOfMonth.displayName }}
              <span v-if="activeTheme.readerOfMonth.teamName" class="theme-reader-team">
                · {{ activeTheme.readerOfMonth.teamName }}
              </span>
            </p>
            <p
              v-if="activeTheme.readerOfMonth.auto"
              class="theme-reader-stats"
            >
              {{ activeTheme.readerOfMonth.books }} books this month
            </p>
            <p
              v-if="activeTheme.readerOfMonth.shoutout"
              class="theme-reader-shout"
            >
              {{ activeTheme.readerOfMonth.shoutout }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="lore">
      <h2>{{ config.event.loreTitle }}</h2>
      <p v-for="(para, i) in config.event.lore" :key="i">{{ t(para) }}</p>
      <p class="note">{{ config.event.characterCreationNote }}</p>
    </section>

    <section v-if="standings" class="home-standings">
      <details class="collapse" @toggle="standingsOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="collapse-summary">Standings, vibes &amp; score breakdown</summary>
        <div v-if="standingsOpen" class="collapse-body">
          <StandingsPanel
            :standings="standings"
            :image-url="standingsImageUrl"
            :published-at="publishedAt"
          />
          <StandingsVibes
            v-if="vibes"
            :vibes="vibes"
            :title="String(config.copy.standingsVibesTitle ?? 'Reading vibes')"
            :lead="
              String(
                config.copy.standingsVibesLead ??
                  'This week’s reading activity from the latest standings publish.',
              )
            "
          />
          <StandingsBreakdownPanel
            v-if="breakdown"
            :breakdown="breakdown"
            :image-url="breakdownImageUrl"
            title="Score breakdown"
          />
        </div>
      </details>
    </section>

    <section v-if="canSubmit" class="submit-banner">
      <div>
        <h2>{{ submitBannerTitle }}</h2>
        <p>{{ submitBannerBody }}</p>
      </div>
      <RouterLink to="/submit" class="btn btn-primary">{{ config.copy.submitCta }}</RouterLink>
    </section>

    <section class="quick-links" :class="{ 'has-submit': canSubmit }">
      <RouterLink v-if="canSubmit" to="/submit" class="link-card link-card-featured">
        <h3>{{ submitQuickTitle }}</h3>
        <p>{{ submitQuickDescription }}</p>
      </RouterLink>
      <RouterLink to="/teams" class="link-card">
        <h3>{{ t(config.copy.homeQuickLinks.teamsTitle) }}</h3>
        <p>{{ config.copy.homeQuickLinks.teamsDescription }}</p>
      </RouterLink>
      <RouterLink to="/prompts" class="link-card">
        <h3>{{ t(config.copy.homeQuickLinks.promptsTitle) }}</h3>
        <p>{{ config.copy.homeQuickLinks.promptsDescription }}</p>
      </RouterLink>
      <RouterLink to="/faq" class="link-card">
        <h3>{{ config.copy.homeQuickLinks.faqTitle }}</h3>
        <p>{{ config.copy.homeQuickLinks.faqDescription }}</p>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.archive-banner {
  display: block;
  margin-bottom: 1.25rem;
  text-decoration: none;
  transition: filter 0.15s;
}

.archive-banner:hover,
.archive-banner:focus-visible {
  filter: brightness(1.08);
}

.home-standings {
  margin-top: 1.5rem;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--realm-surface) 88%, transparent);
}

.collapse {
  margin: 0;
}

.collapse-summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
  padding: 1rem 1.15rem;
  color: var(--realm-text);
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.collapse-summary::-webkit-details-marker {
  display: none;
}

.collapse-summary::after {
  content: '▾';
  color: var(--realm-text-muted);
  font-weight: 700;
}

details[open] > .collapse-summary::after {
  content: '▴';
}

.collapse-body {
  padding: 0 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.collapse-body :deep(.standings-panel),
.collapse-body :deep(.breakdown-panel) {
  margin-top: 0;
}

.hero {
  text-align: center;
  padding: 2.5rem 0 2rem;
}

.eyebrow {
  color: var(--realm-accent);
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.hero h1 {
  font-family: var(--font-display);
  font-size: clamp(2.75rem, 7vw, 4.25rem);
  color: var(--realm-text);
  margin-bottom: 0.65rem;
  letter-spacing: 0.06em;
  text-shadow: 0 0 40px rgba(212, 99, 74, 0.25);
}

.tagline {
  font-size: 1.15rem;
  color: var(--realm-text-muted);
  max-width: 32rem;
  margin: 0 auto 1.5rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  align-items: center;
}

.changelog-btn {
  border: 1px solid var(--realm-border);
}

.theme-banner {
  margin: 0 0 2rem;
  padding: 1.25rem 1.5rem;
  text-align: center;
  border-top: 1px solid var(--realm-border);
  border-bottom: 1px solid var(--realm-border);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--realm-accent) 12%, transparent),
    transparent
  );
}

.theme-eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--realm-accent);
}

.theme-banner h2 {
  margin: 0 0 0.4rem;
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 3vw, 1.85rem);
  color: var(--realm-text);
}

.theme-banner p {
  margin: 0 auto;
  max-width: 36rem;
  color: var(--realm-text-muted);
}

.theme-dates {
  margin-top: 0.5rem !important;
  font-size: 0.85rem;
  opacity: 0.85;
}

.theme-photo {
  margin: 1rem auto 0;
  max-width: min(28rem, 100%);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--realm-border);
}

.theme-photo img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 18rem;
  object-fit: cover;
}

.theme-reader {
  margin: 1.15rem auto 0;
  max-width: 28rem;
  padding: 0.85rem 1rem;
  text-align: left;
  border-radius: 12px;
  border: 1px solid var(--realm-border);
  background: color-mix(in srgb, var(--realm-surface) 80%, transparent);
}

.theme-reader-label {
  margin: 0 0 0.45rem !important;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--realm-accent) !important;
}

.theme-reader-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.theme-reader-avatar {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--realm-border);
  flex-shrink: 0;
}

.theme-reader-name {
  margin: 0 !important;
  font-weight: 700;
  color: var(--realm-text) !important;
}

.theme-reader-team {
  font-weight: 500;
  color: var(--realm-text-muted);
}

.theme-reader-stats,
.theme-reader-shout {
  margin: 0.25rem 0 0 !important;
  font-size: 0.88rem;
}

.submit-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
  padding: 1.25rem 0;
  border-top: 1px solid var(--realm-border);
  border-bottom: 1px solid var(--realm-border);
}

.submit-banner h2 {
  margin: 0 0 0.35rem;
  font-family: var(--font-display);
  font-size: 1.25rem;
  color: var(--realm-text);
}

.submit-banner p {
  margin: 0;
  color: var(--realm-text-muted);
  font-size: 0.95rem;
  max-width: 36rem;
}

.submit-banner .btn {
  flex-shrink: 0;
}

.lore {
  margin-top: 0.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid color-mix(in srgb, var(--realm-border) 70%, transparent);
}

.lore h2 {
  color: var(--realm-text);
  margin-bottom: 1rem;
  font-family: var(--font-display);
}

.lore p {
  color: var(--realm-text-muted);
  margin-bottom: 0.75rem;
  line-height: 1.7;
}

.note {
  font-style: italic;
  opacity: 0.85;
  margin-top: 1rem;
  margin-bottom: 0;
  padding-top: 1rem;
  border-top: 1px solid var(--realm-border);
}

.quick-links {
  display: grid;
  gap: 0.25rem;
  margin-top: 2rem;
}

@media (min-width: 768px) {
  .quick-links {
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
  }

  .quick-links.has-submit {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .quick-links.has-submit {
    grid-template-columns: repeat(4, 1fr);
  }
}

.link-card {
  display: block;
  padding: 1rem 0.15rem;
  border-bottom: 1px solid var(--realm-border);
  transition: color 0.2s, border-color 0.2s;
  text-decoration: none;
}

@media (min-width: 768px) {
  .link-card {
    padding: 0.25rem 0;
    border-bottom: none;
  }
}

.link-card:hover h3 {
  color: var(--realm-accent-glow);
}

.link-card-featured h3 {
  color: var(--realm-accent-glow);
}

.link-card h3 {
  color: var(--realm-text);
  margin-bottom: 0.35rem;
  transition: color 0.2s;
}

.link-card p {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
  margin: 0;
}

@media (max-width: 768px) {
  .hero {
    padding: 1.25rem 0 1.5rem;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions .btn {
    width: 100%;
  }

  .changelog-btn {
    width: 100%;
  }

  .tagline {
    font-size: 1rem;
    padding: 0 0.5rem;
  }

  .submit-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .submit-banner .btn {
    width: 100%;
  }
}
</style>
