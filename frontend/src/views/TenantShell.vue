<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useConfig } from '../composables/useConfig'

const route = useRoute()
const { loadConfig } = useConfig()

watch(
  () => route.params.tenantSlug,
  () => {
    void loadConfig(true)
  },
)
</script>

<template>
  <RouterView />
</template>
