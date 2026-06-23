<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type TeamStanding } from '../lib/api'
import { useConfig } from '../composables/useConfig'
import StandingsPanel from '../components/StandingsPanel.vue'

const { config, loadConfig } = useConfig()
const standings = ref<TeamStanding[] | null>(null)
const svg = ref<string | null>(null)
const publishedAt = ref<string | null>(null)
const published = ref(false)
const loading = ref(true)

onMounted(async () => {
  await loadConfig()
  try {
    const data = await api<{
      published: boolean
      standings?: TeamStanding[]
      svg?: string
      publishedAt?: string
    }>('/standings')
    published.value = data.published
    standings.value = data.standings ?? null
    svg.value = data.svg ?? null
    publishedAt.value = data.publishedAt ?? null
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main v-if="config" class="page">
    <h1 class="page-title">Standings</h1>

    <div v-if="loading" class="alert alert-info">Loading…</div>
    <div v-else-if="!published" class="alert alert-info card">
      <p>{{ config.copy.standingsUnpublished }}</p>
    </div>
    <StandingsPanel
      v-else-if="standings"
      :standings="standings"
      :svg="svg"
      :published-at="publishedAt"
    />
  </main>
</template>
