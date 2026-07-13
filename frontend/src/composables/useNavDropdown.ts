import { computed, ref } from 'vue'

const openId = ref<string | null>(null)
let leaveTimer: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

function clearLeaveTimer() {
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }
}

export function closeAllNavDropdowns() {
  clearLeaveTimer()
  openId.value = null
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAllNavDropdowns()
}

function ensureGlobalListeners() {
  if (listenersAttached) return
  listenersAttached = true
  document.addEventListener('click', closeAllNavDropdowns)
  document.addEventListener('keydown', onDocumentKeydown)
}

export function useNavDropdown(id: string) {
  ensureGlobalListeners()

  const isOpen = computed(() => openId.value === id)

  function open() {
    clearLeaveTimer()
    openId.value = id
  }

  function toggle() {
    clearLeaveTimer()
    openId.value = openId.value === id ? null : id
  }

  function onMouseEnter() {
    open()
  }

  function onMouseLeave() {
    clearLeaveTimer()
    leaveTimer = setTimeout(() => {
      if (openId.value === id) openId.value = null
      leaveTimer = null
    }, 120)
  }

  return { isOpen, open, toggle, onMouseEnter, onMouseLeave }
}
