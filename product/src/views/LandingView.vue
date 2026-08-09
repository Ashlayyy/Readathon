<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { productName } from '../lib/api'

const name = productName()

const features = [
  {
    title: 'Teams & realms',
    body: 'Sort readers into teams, show rosters when you’re ready, and keep the rivalry friendly.',
  },
  {
    title: 'Prompts & bonuses',
    body: 'Ship a prompt catalog with add/sabotage scoring — the same engine Book Baddies runs on.',
  },
  {
    title: 'Live standings',
    body: 'Publish weekly snapshots, hall-of-fame vibes, and optional Discord announcements.',
  },
  {
    title: 'One Discord bot',
    body: 'Invite the platform bot once per server, then pick channels in Admin. No DIY tokens.',
  },
]
</script>

<template>
  <main class="landing">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__copy">
        <p class="eyebrow">Hosted team readathons</p>
        <h1 id="hero-title">{{ name }}</h1>
        <p class="lede">
          Spin up a reading competition with teams, prompts, live standings, and Discord —
          in minutes, not weeks.
        </p>
        <div class="cta">
          <RouterLink class="btn btn-primary" to="/signin?next=/host/new">
            Start your readathon
          </RouterLink>
          <RouterLink class="btn btn-ghost" to="/signin">I already host</RouterLink>
        </div>
        <ul class="hero__meta" aria-label="Highlights">
          <li>Shareable player link instantly</li>
          <li>Magic-link host sign-in</li>
          <li>Admin built for challenge ops</li>
        </ul>
      </div>
      <div class="hero__visual" aria-hidden="true">
        <div class="shelf">
          <span class="spine s1">Realm Cup</span>
          <span class="spine s2">Standings</span>
          <span class="spine s3">Prompts</span>
          <span class="spine s4">Discord</span>
        </div>
        <div class="float-card">
          <p>Week 4 published</p>
          <strong>+128 pages</strong>
          <span>Riders lead by 12</span>
        </div>
      </div>
    </section>

    <section id="features" class="band" aria-labelledby="features-title">
      <div class="band__head">
        <p class="eyebrow">What you get</p>
        <h2 id="features-title">Everything a challenge needs</h2>
        <p>Players get a polished event site. You get a host panel plus a full Admin.</p>
      </div>
      <ul class="features">
        <li v-for="f in features" :key="f.title">
          <h3>{{ f.title }}</h3>
          <p>{{ f.body }}</p>
        </li>
      </ul>
    </section>

    <section id="how" class="band band--tight" aria-labelledby="how-title">
      <div class="band__head">
        <p class="eyebrow">Simple path</p>
        <h2 id="how-title">Three steps. That’s it.</h2>
      </div>
      <ol class="steps">
        <li>
          <span class="num">01</span>
          <strong>Sign in</strong>
          <span>Magic link — no password to remember.</span>
        </li>
        <li>
          <span class="num">02</span>
          <strong>Name your event</strong>
          <span>Get a shareable `/e/slug` link players can open immediately.</span>
        </li>
        <li>
          <span class="num">03</span>
          <strong>Run the challenge</strong>
          <span>Checklist, Discord invite, then Admin for teams and prompts.</span>
        </li>
      </ol>
    </section>

    <section class="finale" aria-labelledby="finale-title">
      <h2 id="finale-title">Ready when your readers are</h2>
      <p>Create an event, copy the link, and open Admin when you want the deep settings.</p>
      <RouterLink class="btn btn-primary" to="/signin?next=/host/new">Create your first event</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.landing {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding-bottom: 2rem;
}
.hero {
  position: relative;
  min-height: min(88vh, 780px);
  display: grid;
  gap: 2.5rem;
  align-items: end;
  padding: 3.5rem 0 3rem;
  isolation: isolate;
}
@media (min-width: 960px) {
  .hero {
    grid-template-columns: 1.1fr 0.9fr;
    align-items: center;
  }
}
.hero::before {
  content: '';
  position: absolute;
  inset: 4% -6% auto 42%;
  height: 70%;
  background:
    radial-gradient(circle at 35% 40%, rgba(212, 240, 106, 0.18), transparent 42%),
    radial-gradient(circle at 70% 65%, rgba(232, 168, 107, 0.14), transparent 38%);
  filter: blur(10px);
  z-index: -1;
  animation: drift 16s ease-in-out infinite alternate;
}
.hero h1 {
  margin: 0.35rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(3.4rem, 10vw, 6.2rem);
  line-height: 0.92;
  letter-spacing: -0.04em;
  max-width: 9ch;
}
.lede {
  margin: 1.35rem 0 0;
  max-width: 30rem;
  font-size: 1.18rem;
  line-height: 1.55;
  color: var(--muted);
}
.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 2rem;
}
.hero__meta {
  list-style: none;
  margin: 1.75rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 1.1rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.hero__meta li {
  position: relative;
  padding-left: 0.9rem;
}
.hero__meta li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.45em;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(212, 240, 106, 0.55);
}
.hero__visual {
  position: relative;
  min-height: 280px;
  display: grid;
  place-items: center;
}
.shelf {
  display: flex;
  align-items: end;
  gap: 0.65rem;
  height: 240px;
  transform: perspective(900px) rotateY(-12deg) rotateX(4deg);
  animation: rise 1s ease both;
}
.spine {
  display: grid;
  place-items: center;
  width: 3.1rem;
  height: 100%;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  border-radius: 6px 10px 10px 6px;
  font-family: var(--font-display);
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  color: var(--accent-ink);
  box-shadow: inset -6px 0 12px rgba(0, 0, 0, 0.18), 0 16px 28px rgba(0, 0, 0, 0.35);
}
.s1 {
  background: linear-gradient(180deg, #d4f06a, #9bb83a);
  height: 92%;
}
.s2 {
  background: linear-gradient(180deg, #e8a86b, #c07a3f);
  height: 100%;
  color: #2a1608;
}
.s3 {
  background: linear-gradient(180deg, #7ec8c0, #3e8f88);
  height: 86%;
}
.s4 {
  background: linear-gradient(180deg, #f2f6ee, #c5d0be);
  height: 78%;
}
.float-card {
  position: absolute;
  right: 6%;
  bottom: 12%;
  display: grid;
  gap: 0.15rem;
  min-width: 10.5rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--line-strong);
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  box-shadow: var(--shadow);
  animation: float 5.5s ease-in-out infinite;
}
.float-card p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.float-card strong {
  font-family: var(--font-display);
  font-size: 1.35rem;
}
.float-card span {
  color: var(--sky);
  font-size: 0.88rem;
}
.band {
  padding: 4.5rem 0 1rem;
}
.band--tight {
  padding-top: 2.5rem;
}
.band__head {
  max-width: 36rem;
  margin-bottom: 2rem;
}
.band__head h2 {
  margin: 0.4rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 2.7rem);
  letter-spacing: -0.03em;
}
.band__head p:last-child {
  margin: 0.75rem 0 0;
  color: var(--muted);
  line-height: 1.55;
}
.features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}
@media (min-width: 800px) {
  .features {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.15rem;
  }
}
.features li {
  padding: 1.35rem 1.4rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--panel) 70%, transparent);
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.features li:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  transform: translateY(-2px);
}
.features h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
}
.features p {
  margin: 0.55rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}
@media (min-width: 800px) {
  .steps {
    grid-template-columns: repeat(3, 1fr);
  }
}
.steps li {
  display: grid;
  gap: 0.4rem;
  padding: 1.25rem 1.2rem;
  border-top: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent);
}
.num {
  font-family: var(--font-display);
  color: var(--accent);
  font-size: 1.1rem;
}
.steps strong {
  font-size: 1.1rem;
}
.steps span:last-child {
  color: var(--muted);
  line-height: 1.45;
}
.finale {
  margin: 3.5rem 0 2rem;
  padding: 2.5rem 1.5rem;
  border-radius: calc(var(--radius) + 6px);
  border: 1px solid var(--line);
  background:
    radial-gradient(circle at 20% 20%, rgba(212, 240, 106, 0.12), transparent 40%),
    color-mix(in srgb, var(--panel) 85%, transparent);
  text-align: center;
  display: grid;
  gap: 0.85rem;
  justify-items: center;
}
.finale h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 3.5vw, 2.4rem);
}
.finale p {
  margin: 0;
  color: var(--muted);
  max-width: 32rem;
  line-height: 1.5;
}
@keyframes drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(-3%, 4%, 0) scale(1.05);
  }
}
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: perspective(900px) rotateY(-12deg) rotateX(4deg) translateY(18px);
  }
  to {
    opacity: 1;
    transform: perspective(900px) rotateY(-12deg) rotateX(4deg) translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero::before,
  .float-card,
  .shelf {
    animation: none;
  }
}
@media (max-width: 720px) {
  .hero__visual {
    min-height: 220px;
  }
  .shelf {
    transform: none;
    height: 180px;
  }
  .float-card {
    right: 0;
    bottom: 0;
  }
}
</style>
