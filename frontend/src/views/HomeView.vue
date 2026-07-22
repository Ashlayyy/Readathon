<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, apiUrl, type StandingsBreakdown, type TeamStanding } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import StandingsPanel from '../components/StandingsPanel.vue'
import StandingsBreakdownPanel from '../components/StandingsBreakdownPanel.vue'

const { config, loadConfig } = useConfig()
const { user, fetchUser } = useAuth()
const { t } = useCopy()
const standings = ref<TeamStanding[] | null>(null)
const standingsImageUrl = ref<string | null>(null)
const breakdown = ref<StandingsBreakdown | null>(null)
const breakdownImageUrl = ref<string | null>(null)
const publishedAt = ref<string | null>(null)
const standingsOpen = ref(false)

const canSubmit = computed(() => user.value?.status === 'assigned')

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
    }>('/standings')
    if (data.published) {
      standings.value = data.standings ?? null
      breakdown.value = data.breakdown ?? null
      publishedAt.value = data.publishedAt ?? null
      standingsImageUrl.value = data.imageUrl ? apiUrl(data.imageUrl) : null
      breakdownImageUrl.value = data.breakdownImageUrl
        ? apiUrl(data.breakdownImageUrl)
        : null
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
          <RouterLink to="/profile" class="btn btn-primary">{{ config.copy.profileBooksTab }}</RouterLink>
        </template>
        <RouterLink to="/how-it-works" class="btn btn-secondary">{{ config.copy.howItWorksCta }}</RouterLink>
      </div>
    </section>

    <section class="lore">
      <h2>{{ config.event.loreTitle }}</h2>
      <p v-for="(para, i) in config.event.lore" :key="i">{{ t(para) }}</p>
      <p class="note">{{ config.event.characterCreationNote }}</p>
    </section>

    <section v-if="standings" class="home-standings">
      <details class="collapse" @toggle="standingsOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="collapse-summary">Standings &amp; score breakdown</summary>
        <div v-if="standingsOpen" class="collapse-body">
          <StandingsPanel
            :standings="standings"
            :image-url="standingsImageUrl"
            :published-at="publishedAt"
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
