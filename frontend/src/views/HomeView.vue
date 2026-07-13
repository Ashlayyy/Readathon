<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, type TeamStanding } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import { useCopy } from '../composables/useCopy'
import StandingsPanel from '../components/StandingsPanel.vue'

const { config, loadConfig } = useConfig()
const { user, fetchUser } = useAuth()
const { t } = useCopy()
const standings = ref<TeamStanding[] | null>(null)
const standingsSvg = ref<string | null>(null)
const publishedAt = ref<string | null>(null)

const canSubmit = computed(() => user.value?.status === 'assigned')

const submitBannerTitle = computed(
  () =>
    (config.value?.copy.homeSubmitBanner as { title?: string } | undefined)?.title ??
    'Finished a book?',
)

const submitBannerBody = computed(
  () =>
    (config.value?.copy.homeSubmitBanner as { body?: string } | undefined)?.body ??
    'Log it here to add XP for your realm or sabotage a rival.',
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
      svg?: string
      publishedAt?: string
    }>('/standings')
    if (data.published) {
      standings.value = data.standings ?? null
      standingsSvg.value = data.svg ?? null
      publishedAt.value = data.publishedAt ?? null
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
      <p class="schedule">{{ config.event.month }}</p>
      <div class="hero-actions">
        <RouterLink v-if="!user" to="/login" class="btn btn-primary">{{ config.copy.enterCta }}</RouterLink>
        <RouterLink v-else-if="canSubmit" to="/submit" class="btn btn-primary">
          {{ config.copy.submitCta }}
        </RouterLink>
        <template v-else>
          <p class="hero-pending">{{ config.copy.pendingBanner }}</p>
          <RouterLink to="/profile" class="btn btn-primary">{{ config.copy.profileBooksTab }}</RouterLink>
        </template>
        <RouterLink to="/how-it-works" class="btn btn-secondary">{{ config.copy.howItWorksCta }}</RouterLink>
      </div>
    </section>

    <section class="lore card">
      <h2>{{ config.event.loreTitle }}</h2>
      <p v-for="(para, i) in config.event.lore" :key="i">{{ t(para) }}</p>
      <p class="note">{{ config.event.characterCreationNote }}</p>
    </section>

    <StandingsPanel
      v-if="standings"
      :standings="standings"
      :svg="standingsSvg"
      :published-at="publishedAt"
    />

    <section v-if="canSubmit" class="submit-banner card">
      <div>
        <h2>{{ submitBannerTitle }}</h2>
        <p>{{ submitBannerBody }}</p>
      </div>
      <RouterLink to="/submit" class="btn btn-primary">{{ config.copy.submitCta }}</RouterLink>
    </section>

    <section class="quick-links" :class="{ 'has-submit': canSubmit }">
      <RouterLink v-if="canSubmit" to="/submit" class="link-card link-card-featured card">
        <h3>{{ submitQuickTitle }}</h3>
        <p>{{ submitQuickDescription }}</p>
      </RouterLink>
      <RouterLink to="/teams" class="link-card card">
        <h3>{{ t(config.copy.homeQuickLinks.teamsTitle) }}</h3>
        <p>{{ config.copy.homeQuickLinks.teamsDescription }}</p>
      </RouterLink>
      <RouterLink to="/prompts" class="link-card card">
        <h3>{{ t(config.copy.homeQuickLinks.promptsTitle) }}</h3>
        <p>{{ config.copy.homeQuickLinks.promptsDescription }}</p>
      </RouterLink>
      <RouterLink to="/faq" class="link-card card">
        <h3>{{ config.copy.homeQuickLinks.faqTitle }}</h3>
        <p>{{ config.copy.homeQuickLinks.faqDescription }}</p>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 2rem 0 3rem;
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
  font-size: clamp(2.5rem, 6vw, 4rem);
  color: var(--realm-text);
  margin-bottom: 0.75rem;
  letter-spacing: 0.06em;
  text-shadow: 0 0 40px rgba(212, 99, 74, 0.25);
}

.tagline {
  font-size: 1.15rem;
  color: var(--realm-text-muted);
  max-width: 32rem;
  margin: 0 auto 0.5rem;
}

.schedule {
  color: var(--realm-accent);
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  align-items: center;
}

.hero-pending {
  width: 100%;
  max-width: 28rem;
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: rgba(212, 99, 74, 0.1);
  border: 1px solid var(--realm-border);
  color: var(--realm-text-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.submit-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  margin-bottom: 2rem;
  padding: 1.25rem 1.5rem;
  border-color: color-mix(in srgb, var(--realm-accent) 40%, var(--realm-border));
  background: linear-gradient(
    135deg,
    var(--realm-surface) 0%,
    color-mix(in srgb, var(--realm-accent) 8%, var(--realm-surface)) 100%
  );
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
  padding-top: 1rem;
  border-top: 1px solid var(--realm-border);
}

.quick-links {
  display: grid;
  gap: 1rem;
  margin-top: 2rem;
}

@media (min-width: 768px) {
  .quick-links {
    grid-template-columns: repeat(3, 1fr);
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
  transition: border-color 0.2s, transform 0.15s;
}

.link-card:hover {
  border-color: var(--realm-accent);
  transform: translateY(-2px);
}

.link-card-featured {
  border-color: color-mix(in srgb, var(--realm-accent) 55%, var(--realm-border));
  background: linear-gradient(
    135deg,
    var(--realm-surface) 0%,
    color-mix(in srgb, var(--realm-accent) 10%, var(--realm-surface)) 100%
  );
}

.link-card-featured h3 {
  color: var(--realm-accent-glow);
}

.link-card h3 {
  color: var(--realm-text);
  margin-bottom: 0.35rem;
}

.link-card p {
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .hero {
    padding: 1.25rem 0 2rem;
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
