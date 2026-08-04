<script setup lang="ts">
import { RouterLink } from 'vue-router'

const productName = import.meta.env.VITE_PRODUCT_NAME?.trim() || 'Product'
</script>

<template>
  <div class="mkt">
    <header class="mkt__bar">
      <RouterLink class="mkt__brand" to="/">{{ productName }}</RouterLink>
      <nav class="mkt__nav">
        <RouterLink to="/host">Host console</RouterLink>
        <RouterLink class="mkt__cta" to="/host/new">Start a readathon</RouterLink>
      </nav>
    </header>

    <main class="mkt__hero">
      <p class="mkt__eyebrow">Hosted readathons</p>
      <h1>{{ productName }}</h1>
      <p class="mkt__lede">
        Run a team reading competition with prompts, standings, and Discord — without building your own stack.
      </p>
      <div class="mkt__actions">
        <RouterLink class="mkt__btn" to="/host/new">Create your event</RouterLink>
        <RouterLink class="mkt__btn mkt__btn--ghost" to="/host">Sign in</RouterLink>
      </div>
    </main>
  </div>
</template>

<style scoped>
.mkt {
  min-height: 100vh;
  background:
    radial-gradient(ellipse 80% 60% at 20% 0%, rgba(45, 90, 70, 0.35), transparent),
    radial-gradient(ellipse 70% 50% at 90% 20%, rgba(120, 70, 40, 0.25), transparent),
    linear-gradient(165deg, #0f1412 0%, #1a2420 45%, #121816 100%);
  color: #f2ebe3;
  font-family: 'Segoe UI', system-ui, sans-serif;
}
.mkt__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.75rem;
  max-width: 1100px;
  margin: 0 auto;
}
.mkt__brand {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #f2ebe3;
  text-decoration: none;
}
.mkt__nav {
  display: flex;
  gap: 1.25rem;
  align-items: center;
}
.mkt__nav a {
  color: #c9c0b4;
  text-decoration: none;
  font-size: 0.95rem;
}
.mkt__cta {
  padding: 0.45rem 0.9rem;
  border: 1px solid rgba(242, 235, 227, 0.35);
  border-radius: 4px;
  color: #f2ebe3 !important;
}
.mkt__hero {
  max-width: 720px;
  margin: 0 auto;
  padding: 12vh 1.75rem 4rem;
}
.mkt__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.75rem;
  color: #9aaf9f;
  margin: 0 0 0.75rem;
}
.mkt__hero h1 {
  font-size: clamp(2.4rem, 6vw, 3.6rem);
  line-height: 1.05;
  margin: 0 0 1rem;
  letter-spacing: -0.03em;
}
.mkt__lede {
  font-size: 1.15rem;
  line-height: 1.55;
  color: #c9c0b4;
  margin: 0 0 2rem;
  max-width: 36rem;
}
.mkt__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.mkt__btn {
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: #d4a574;
  color: #1a1410;
  font-weight: 600;
  text-decoration: none;
  border-radius: 4px;
}
.mkt__btn--ghost {
  background: transparent;
  color: #f2ebe3;
  border: 1px solid rgba(242, 235, 227, 0.35);
}
</style>
