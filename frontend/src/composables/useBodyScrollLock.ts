import { onUnmounted, watch, type Ref } from 'vue'

let lockCount = 0
let savedScrollY = 0

function lock() {
	lockCount += 1
	if (lockCount === 1) {
		savedScrollY = window.scrollY
		document.body.classList.add('modal-open')
		document.body.style.top = `-${savedScrollY}px`
	}
}

function unlock() {
	lockCount = Math.max(0, lockCount - 1)
	if (lockCount === 0) {
		document.body.classList.remove('modal-open')
		document.body.style.top = ''
		window.scrollTo(0, savedScrollY)
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
