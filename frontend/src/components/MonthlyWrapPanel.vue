<script setup lang="ts">
defineProps<{
  imageUrl: string
  label?: string | null
  title?: string
}>()
</script>

<template>
  <section class="wrap-panel card">
    <header>
      <h2>{{ title ?? '4-week wrap' }}</h2>
      <p v-if="label" class="wrap-label">{{ label }}</p>
    </header>
    <div class="wrap-image-wrap">
      <img :src="imageUrl" :alt="label || '4-week reading wrap'" loading="lazy" decoding="async" />
    </div>
  </section>
</template>

<style scoped>
.wrap-panel {
  margin: 1.5rem 0;
  padding: 1.15rem 1.25rem;
}

.wrap-panel header {
  margin-bottom: 0.85rem;
}

.wrap-panel h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.wrap-label {
  margin: 0.35rem 0 0;
  color: var(--realm-text-muted);
  font-size: 0.9rem;
}

.wrap-image-wrap {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--realm-border);
  background: var(--realm-bg);
}

.wrap-image-wrap img {
  display: block;
  width: 100%;
  height: auto;
}
</style>
