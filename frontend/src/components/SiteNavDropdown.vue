<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { closeAllNavDropdowns, useNavDropdown } from '../composables/useNavDropdown'

export type NavDropdownItem = {
  to: string
  label: string
  show?: boolean
}

const props = defineProps<{
  id: string
  label: string
  items: NavDropdownItem[]
  mobile?: boolean
}>()

const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const { isOpen, toggle, onMouseEnter, onMouseLeave } = useNavDropdown(props.id)

const visibleItems = computed(() => props.items.filter((item) => item.show !== false))

const isGroupActive = computed(() =>
  visibleItems.value.some(
    (item) => route.path === item.to || route.path.startsWith(`${item.to}/`),
  ),
)

function onTriggerClick(event: MouseEvent) {
  event.stopPropagation()
  toggle()
}

function onNavigate() {
  closeAllNavDropdowns()
  emit('navigate')
}

function isActive(to: string) {
  if (to === '/teams') {
    return route.path === '/teams' || route.path === '/rosters'
  }
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <div
    v-if="!mobile"
    class="nav-dropdown"
    :class="{ open: isOpen }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <button
      type="button"
      class="nav-dropdown-trigger"
      :class="{ active: isGroupActive, open: isOpen }"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      @click="onTriggerClick"
    >
      {{ label }}
      <span class="chevron" aria-hidden="true">▾</span>
    </button>
    <div v-show="isOpen" class="nav-dropdown-menu" role="menu" @click.stop>
      <RouterLink
        v-for="item in visibleItems"
        :key="item.to"
        :to="item.to"
        role="menuitem"
        :class="{ active: isActive(item.to) }"
        @click="onNavigate"
      >
        {{ item.label }}
      </RouterLink>
    </div>
  </div>

  <div v-else class="nav-mobile-group">
    <p class="nav-mobile-label">{{ label }}</p>
    <RouterLink
      v-for="item in visibleItems"
      :key="item.to"
      :to="item.to"
      class="nav-mobile-link"
      :class="{ active: isActive(item.to) }"
      @click="onNavigate"
    >
      {{ item.label }}
    </RouterLink>
  </div>
</template>

<style scoped>
.nav-dropdown {
  position: relative;
}

.nav-dropdown.open {
  z-index: 210;
}

.nav-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--realm-text-muted);
  font-size: 0.88rem;
  font-weight: 500;
  padding: 0.45rem 0;
  min-height: 2.5rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.nav-dropdown-trigger:hover,
.nav-dropdown-trigger.active,
.nav-dropdown-trigger.open {
  color: var(--realm-accent-glow);
  border-bottom-color: var(--realm-accent);
}

.chevron {
  font-size: 0.65rem;
  opacity: 0.75;
  transition: transform 0.2s;
}

.nav-dropdown-trigger.open .chevron {
  transform: rotate(180deg);
}

.nav-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  min-width: 10.5rem;
  padding: 0.35rem;
  border: 1px solid var(--realm-border);
  border-radius: var(--radius);
  background: var(--realm-surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  z-index: 220;
}

/* Invisible bridge so the pointer can reach the menu without closing */
.nav-dropdown-menu::before {
  content: '';
  position: absolute;
  top: -0.5rem;
  left: 0;
  right: 0;
  height: 0.5rem;
}

.nav-dropdown-menu a {
  display: block;
  padding: 0.55rem 0.75rem;
  border-radius: calc(var(--radius) - 2px);
  color: var(--realm-text-muted);
  font-size: 0.88rem;
  font-weight: 500;
  text-decoration: none;
  border-bottom: none;
  min-height: unset;
  white-space: nowrap;
}

.nav-dropdown-menu a:hover,
.nav-dropdown-menu a.active {
  color: var(--realm-accent-glow);
  background: rgba(212, 99, 74, 0.1);
}

.nav-mobile-group {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-top: 0.35rem;
}

.nav-mobile-label {
  margin: 0;
  padding: 0.65rem 0.5rem 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--realm-text-muted);
}

.nav-mobile-link {
  padding: 0.75rem 0.5rem 0.75rem 1rem !important;
  border-bottom: 1px solid var(--realm-border) !important;
  width: 100%;
  font-size: 1rem !important;
}

.nav-mobile-link.active {
  color: var(--realm-accent-glow);
}
</style>
