<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api'
import { useTenant } from '../composables/useTenant'
import { useAuth } from '../composables/useAuth'

type MembershipRow = {
  slug: string
  name: string
  role: string
  pathUrl: string
}

const { user, account } = useAuth()
const { tenantSlug } = useTenant()
const rows = ref<MembershipRow[]>([])
const open = ref(false)

const others = computed(() =>
  rows.value.filter((r) => r.slug !== (tenantSlug.value || 'crucible')),
)

onMounted(async () => {
  if (!user.value && !account.value) return
  try {
    const data = await api<{ memberships: MembershipRow[] }>('/platform/me')
    rows.value = data.memberships ?? []
  } catch {
    rows.value = []
  }
})
</script>

<template>
  <div v-if="others.length" class="switcher">
    <button
      type="button"
      class="btn btn-secondary btn-sm switcher-btn"
      :aria-expanded="open"
      @click="open = !open"
    >
      Other events
    </button>
    <ul v-if="open" class="switcher-menu" role="list">
      <li v-for="m in others" :key="m.slug">
        <a :href="m.pathUrl" @click="open = false">
          <strong>{{ m.name }}</strong>
          <span>{{ m.slug }} · {{ m.role }}</span>
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.switcher {
  position: relative;
}
.switcher-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 40;
  min-width: 14rem;
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  border: 1px solid var(--realm-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--realm-surface) 94%, #000);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.switcher-menu a {
  display: grid;
  gap: 0.15rem;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}
.switcher-menu a:hover {
  background: color-mix(in srgb, var(--realm-accent) 16%, transparent);
}
.switcher-menu strong {
  font-size: 0.92rem;
}
.switcher-menu span {
  font-size: 0.78rem;
  color: var(--realm-text-muted);
}
</style>
