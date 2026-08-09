<script setup lang="ts">
import type { HostOnboarding, OnboardingProgress } from '../lib/api'

defineProps<{
  onboarding: HostOnboarding
  progress: OnboardingProgress
  discordConfigured?: boolean
  platformBotConfigured?: boolean
}>()

const emit = defineEmits<{
  mark: [key: keyof HostOnboarding]
  action: [id: 'share' | 'discord' | 'admin' | 'preview' | 'dismiss']
}>()

const steps: {
  key: keyof HostOnboarding
  id: 'share' | 'discord' | 'admin' | 'preview'
  title: string
  body: string
  cta: string
}[] = [
  {
    key: 'sharedPlayerLink',
    id: 'share',
    title: 'Share the player link',
    body: 'Send the path URL to readers — it works without DNS.',
    cta: 'Copy link',
  },
  {
    key: 'discordBotInvited',
    id: 'discord',
    title: 'Invite the Discord bot',
    body: 'One platform bot for every event. Then pick channels in Admin → Settings.',
    cta: 'Copy invite',
  },
  {
    key: 'openedAdmin',
    id: 'admin',
    title: 'Open Admin',
    body: 'Add teams, prompts, and Discord channels for this event.',
    cta: 'Open Admin',
  },
  {
    key: 'previewOpened',
    id: 'preview',
    title: 'Preview as a player',
    body: 'Open the event site in a new tab and confirm the branding looks right.',
    cta: 'Open site',
  },
]
</script>

<template>
  <section v-if="!onboarding.dismissed && !progress.complete" class="check">
    <div class="check__head">
      <div>
        <h2>Get ready</h2>
        <p>{{ progress.done }} of {{ progress.total }} steps</p>
      </div>
      <button type="button" class="btn btn-ghost" @click="emit('action', 'dismiss')">
        Dismiss
      </button>
    </div>
    <div class="bar" aria-hidden="true">
      <span :style="{ width: `${(progress.done / progress.total) * 100}%` }" />
    </div>
    <ol class="steps">
      <li
        v-for="step in steps"
        :key="step.key"
        class="step"
        :class="{ done: onboarding[step.key] }"
      >
        <div class="step__main">
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
          <p v-if="step.id === 'discord' && discordConfigured" class="ok">
            Discord guild already linked in Admin.
          </p>
          <p v-else-if="step.id === 'discord' && !platformBotConfigured" class="warn">
            Platform bot token is not configured yet.
          </p>
        </div>
        <div class="step__actions">
          <button
            v-if="!onboarding[step.key]"
            type="button"
            class="btn btn-primary"
            :disabled="step.id === 'discord' && !platformBotConfigured"
            @click="emit('action', step.id)"
          >
            {{ step.cta }}
          </button>
          <button
            v-if="!onboarding[step.key]"
            type="button"
            class="btn btn-ghost"
            @click="emit('mark', step.key)"
          >
            Mark done
          </button>
          <span v-else class="done-label">Done</span>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.check {
  padding: 1.25rem 1.35rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--panel) 80%, transparent);
  display: grid;
  gap: 1rem;
}
.check__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}
.check__head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
}
.check__head p {
  margin: 0.25rem 0 0;
  color: var(--muted);
}
.bar {
  height: 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 80%, transparent);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--warm));
  transition: width 0.35s ease;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}
.step {
  display: grid;
  gap: 0.75rem;
  padding: 0.85rem 0;
  border-top: 1px solid var(--line);
}
.step:first-child {
  border-top: none;
  padding-top: 0;
}
.step.done {
  opacity: 0.72;
}
.step h3 {
  margin: 0;
  font-size: 1.05rem;
}
.step p {
  margin: 0.3rem 0 0;
  color: var(--muted);
  line-height: 1.45;
}
.step__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.done-label {
  color: var(--accent);
  font-weight: 600;
  font-size: 0.9rem;
}
.ok {
  color: var(--accent) !important;
}
.warn {
  color: #e8a87c !important;
}
@media (min-width: 720px) {
  .step {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
}
</style>
