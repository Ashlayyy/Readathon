import { onUnmounted, watch, type Ref } from 'vue'

let lockCount = 0

function lock() {
  lockCount += 1
  if (lockCount === 1) {
    document.body.classList.add('modal-open')
  }
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.classList.remove('modal-open')
  }
}

/** Prevent background page scroll while a modal is open. */
export function useBodyScrollLock(active: Ref<boolean>) {
  watch(
    active,
    (on, wasOn) => {
      if (on && !wasOn) lock()
      if (!on && wasOn) unlock()
    },
    { immediate: true },
  )

  onUnmounted(() => {
    if (active.value) unlock()
  })
}
