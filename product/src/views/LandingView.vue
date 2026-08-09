<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { productName } from '../lib/api'

const name = productName()
</script>

<template>
  <main class="landing">
    <section class="hero">
      <p class="eyebrow">Hosted team readathons</p>
      <h1>{{ name }}</h1>
      <p class="lede">
        Spin up a reading competition with teams, prompts, live standings, and Discord — in minutes, not weeks.
      </p>
      <div class="cta">
        <RouterLink class="btn btn-primary" to="/signin?next=/host/new">Start your readathon</RouterLink>
        <RouterLink class="btn btn-ghost" to="/signin">I already host</RouterLink>
      </div>
    </section>

    <section class="how" aria-labelledby="how-title">
      <h2 id="how-title">Three steps. That’s it.</h2>
      <ol>
        <li>
          <strong>Sign in</strong>
          <span>Magic link — no password to remember.</span>
        </li>
        <li>
          <strong>Name your event</strong>
          <span>We give you a shareable link players can open immediately.</span>
        </li>
        <li>
          <strong>Invite Discord (optional)</strong>
          <span>One platform bot. Paste the invite, then pick channels in Admin.</span>
        </li>
      </ol>
    </section>
  </main>
</template>

<style scoped>
.landing {
  width: min(1120px, calc(100% - 2rem));
  margin: 0 auto;
  padding-bottom: 4rem;
}
.hero {
  position: relative;
  min-height: min(78vh, 720px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 4rem 0 3rem;
  isolation: isolate;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 8% -8% -10% 35%;
  background:
    radial-gradient(circle at 30% 40%, rgba(200, 245, 96, 0.2), transparent 45%),
    radial-gradient(circle at 70% 60%, rgba(240, 178, 122, 0.18), transparent 40%),
    linear-gradient(135deg, rgba(24, 53, 44, 0.9), rgba(7, 20, 18, 0.2));
  border-radius: 40% 20% 50% 30%;
  filter: blur(8px);
  z-index: -1;
  animation: drift 14s ease-in-out infinite alternate;
}
.eyebrow {
  margin: 0 0 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.78rem;
  color: var(--accent);
}
.hero h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(3rem, 9vw, 5.6rem);
  line-height: 0.95;
  letter-spacing: -0.03em;
  max-width: 10ch;
}
.lede {
  margin: 1.25rem 0 0;
  max-width: 28rem;
  font-size: 1.15rem;
  line-height: 1.55;
  color: var(--muted);
}
.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 2rem;
}
.how {
  margin-top: 1rem;
  padding: 2rem 0 0;
  border-top: 1px solid var(--line);
}
.how h2 {
  margin: 0 0 1.25rem;
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 3vw, 2.1rem);
}
.how ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}
@media (min-width: 800px) {
  .how ol {
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
  }
}
.how li {
  display: grid;
  gap: 0.35rem;
  padding: 0.25rem 0;
}
.how strong {
  font-size: 1.05rem;
}
.how span {
  color: var(--muted);
  line-height: 1.45;
}
@keyframes drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(-2%, 3%, 0) scale(1.04);
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero::before {
    animation: none;
  }
}
</style>
