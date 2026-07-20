import { onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(el) => el.offsetParent !== null,
	)
}

/**
 * Traps Tab/Shift+Tab focus inside `containerRef` while `active` is true, and restores focus to
 * whatever was focused beforehand once it closes. Does not handle Escape-to-close - callers wire
 * that themselves so the trap stays decoupled from close behavior.
 */
export function useFocusTrap(active: Ref<boolean>, containerRef: Ref<HTMLElement | null>) {
	let previouslyFocused: HTMLElement | null = null

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return
		const container = containerRef.value
		if (!container) return

		const focusable = getFocusable(container)
		if (focusable.length === 0) {
			e.preventDefault()
			return
		}

		const first = focusable[0]!
		const last = focusable[focusable.length - 1]!
		const current = document.activeElement as HTMLElement | null

		if (e.shiftKey && (current === first || !container.contains(current))) {
			e.preventDefault()
			last.focus()
		} else if (!e.shiftKey && (current === last || !container.contains(current))) {
			e.preventDefault()
			first.focus()
		}
	}

	function focusFirst() {
		const container = containerRef.value
		if (!container) return
		const focusable = getFocusable(container)
		;(focusable[0] ?? container).focus()
	}

	watch(
		active,
		(isActive) => {
			if (isActive) {
				previouslyFocused = document.activeElement as HTMLElement | null
				document.addEventListener('keydown', handleKeydown, true)
				requestAnimationFrame(focusFirst)
			} else {
				document.removeEventListener('keydown', handleKeydown, true)
				previouslyFocused?.focus?.()
				previouslyFocused = null
			}
		},
		{ immediate: true },
	)

	onBeforeUnmount(() => {
		document.removeEventListener('keydown', handleKeydown, true)
		if (active.value) previouslyFocused?.focus?.()
	})
}
