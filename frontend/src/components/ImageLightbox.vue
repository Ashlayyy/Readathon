<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useImageLightbox } from '../composables/useImageLightbox'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useFocusTrap } from '../composables/useFocusTrap'

const { src, alt, open, close } = useImageLightbox()
useBodyScrollLock(open)

const panelRef = ref<HTMLElement | null>(null)
useFocusTrap(open, panelRef)

const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let originX = 0
let originY = 0

const MIN_SCALE = 1
const MAX_SCALE = 5

const transformStyle = computed(() => ({
	transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
	cursor: scale.value > 1 ? (dragging.value ? 'grabbing' : 'grab') : 'zoom-in',
}))

watch(open, (isOpen) => {
	if (isOpen) resetView()
})

function resetView() {
	scale.value = 1
	offsetX.value = 0
	offsetY.value = 0
	dragging.value = false
}

function clampScale(n: number) {
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n))
}

function zoomBy(delta: number, clientX?: number, clientY?: number) {
	const prev = scale.value
	const next = clampScale(prev + delta)
	if (next === prev) return

	if (clientX != null && clientY != null && panelRef.value) {
		const rect = panelRef.value.getBoundingClientRect()
		const cx = clientX - rect.left - rect.width / 2
		const cy = clientY - rect.top - rect.height / 2
		const ratio = next / prev
		offsetX.value = cx - (cx - offsetX.value) * ratio
		offsetY.value = cy - (cy - offsetY.value) * ratio
	}
	scale.value = next
	if (next === 1) {
		offsetX.value = 0
		offsetY.value = 0
	}
}

function onWheel(e: WheelEvent) {
	e.preventDefault()
	const delta = e.deltaY < 0 ? 0.2 : -0.2
	zoomBy(delta, e.clientX, e.clientY)
}

function onPointerDown(e: PointerEvent) {
	if (scale.value <= 1) {
		zoomBy(0.5, e.clientX, e.clientY)
		return
	}
	dragging.value = true
	dragStartX = e.clientX
	dragStartY = e.clientY
	originX = offsetX.value
	originY = offsetY.value
	;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
	if (!dragging.value) return
	offsetX.value = originX + (e.clientX - dragStartX)
	offsetY.value = originY + (e.clientY - dragStartY)
}

function onPointerUp(e: PointerEvent) {
	if (!dragging.value) return
	dragging.value = false
	try {
		;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
	} catch {
		/* already released */
	}
}

function onBackdropClick(e: MouseEvent) {
	if (e.target === e.currentTarget) close()
}

function onKeydown(e: KeyboardEvent) {
	if (!open.value) return
	if (e.key === 'Escape') close()
	if (e.key === '+' || e.key === '=') zoomBy(0.25)
	if (e.key === '-' || e.key === '_') zoomBy(-0.25)
	if (e.key === '0') resetView()
}

watch(open, (isOpen) => {
	if (isOpen) window.addEventListener('keydown', onKeydown)
	else window.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
	<Teleport to="body">
		<div
			v-if="open && src"
			class="lightbox-backdrop"
			role="dialog"
			aria-modal="true"
			aria-label="Image preview"
			@click="onBackdropClick"
		>
			<div ref="panelRef" class="lightbox-panel" tabindex="-1">
				<div class="lightbox-toolbar">
					<button
						type="button"
						class="lb-btn"
						:disabled="scale <= MIN_SCALE"
						aria-label="Zoom out"
						@click="zoomBy(-0.25)"
					>
						−
					</button>
					<span class="lb-scale">{{ Math.round(scale * 100) }}%</span>
					<button
						type="button"
						class="lb-btn"
						:disabled="scale >= MAX_SCALE"
						aria-label="Zoom in"
						@click="zoomBy(0.25)"
					>
						+
					</button>
					<button
						type="button"
						class="lb-btn"
						aria-label="Reset zoom"
						@click="resetView"
					>
						Reset
					</button>
					<button
						type="button"
						class="lb-btn lb-close"
						aria-label="Close"
						@click="close"
					>
						×
					</button>
				</div>

				<div
					class="lightbox-stage"
					@wheel.prevent="onWheel"
					@pointerdown="onPointerDown"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
				>
					<img
						:src="src"
						:alt="alt"
						:style="transformStyle"
						draggable="false"
					/>
				</div>

				<p class="lightbox-hint">
					Scroll to zoom · drag to pan · Esc to close
				</p>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.lightbox-backdrop {
	position: fixed;
	inset: 0;
	z-index: 200;
	display: grid;
	place-items: center;
	padding: 1rem;
	background: rgba(6, 5, 10, 0.82);
	backdrop-filter: blur(6px);
}

.lightbox-panel {
	width: min(96vw, 72rem);
	height: min(92vh, 56rem);
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
	outline: none;
}

.lightbox-toolbar {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 0.35rem;
	flex-shrink: 0;
}

.lb-btn {
	min-width: 2.25rem;
	height: 2.25rem;
	padding: 0 0.65rem;
	border-radius: 999px;
	border: 1px solid color-mix(in srgb, #fff 22%, transparent);
	background: color-mix(in srgb, #1a1822 88%, transparent);
	color: #f4efe8;
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
}

.lb-btn:disabled {
	opacity: 0.4;
	cursor: default;
}

.lb-btn:hover:not(:disabled) {
	border-color: color-mix(in srgb, #fff 40%, transparent);
}

.lb-close {
	font-size: 1.35rem;
	line-height: 1;
}

.lb-scale {
	min-width: 3.25rem;
	text-align: center;
	color: #c9c2b8;
	font-size: 0.85rem;
	font-variant-numeric: tabular-nums;
}

.lightbox-stage {
	flex: 1;
	min-height: 0;
	display: grid;
	place-items: center;
	overflow: hidden;
	border-radius: 12px;
	border: 1px solid color-mix(in srgb, #fff 12%, transparent);
	background: #0f0e14;
	touch-action: none;
	user-select: none;
}

.lightbox-stage img {
	max-width: 100%;
	max-height: 100%;
	object-fit: contain;
	transform-origin: center center;
	transition: transform 0.05s linear;
	pointer-events: none;
}

.lightbox-hint {
	margin: 0;
	text-align: center;
	color: #9a9188;
	font-size: 0.8rem;
}
</style>
