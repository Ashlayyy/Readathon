<script setup lang="ts">
import { ref, watch } from 'vue'
import { apiUrl } from '../lib/apiBase'
import { useImageLightbox } from '../composables/useImageLightbox'

const props = defineProps<{
	title: string
	author?: string
	coverUrl?: string | null
	size?: 'sm' | 'md' | 'lg'
	/** When false, click does not open the lightbox (e.g. nested controls). Default true. */
	zoomable?: boolean
}>()

const { show } = useImageLightbox()

function resolveCoverSrc(url: string | null | undefined): string | null {
	if (!url?.trim()) return null
	const trimmed = url.trim()
	if (/^https?:\/\//i.test(trimmed)) return trimmed
	const path = trimmed.replace(/^\/api(?=\/)/, '')
	return apiUrl(path.startsWith('/') ? path : `/${path}`)
}

const src = ref<string | null>(resolveCoverSrc(props.coverUrl))
const failed = ref(false)
const loading = ref(Boolean(resolveCoverSrc(props.coverUrl)))

watch(
	() => [props.coverUrl, props.title, props.author] as const,
	([url]) => {
		const next = resolveCoverSrc(url)
		src.value = next
		failed.value = false
		loading.value = Boolean(next)
	},
)

function onLoad() {
	loading.value = false
}

function onError() {
	failed.value = true
	loading.value = false
	src.value = null
}

function openZoom(e?: Event) {
	if (props.zoomable === false) return
	if (!src.value || failed.value) return
	e?.preventDefault()
	e?.stopPropagation()
	show(src.value, props.title ? `Cover of ${props.title}` : 'Book cover')
}
</script>

<template>
	<div
		class="book-cover"
		:class="[
			size ?? 'md',
			{
				loading: loading && src && !failed,
				zoomable: zoomable !== false && src && !failed,
			},
		]"
		:aria-busy="loading && !!src && !failed"
		:role="zoomable !== false && src && !failed ? 'button' : undefined"
		:tabindex="zoomable !== false && src && !failed ? 0 : undefined"
		:aria-label="
			zoomable !== false && src && !failed
				? `View cover of ${title}`
				: undefined
		"
		@click="openZoom"
		@keydown.enter.prevent="openZoom"
		@keydown.space.prevent="openZoom"
	>
		<div v-if="loading && src && !failed" class="book-cover-skeleton" aria-hidden="true">
			<span class="book-cover-spinner" />
		</div>
		<img
			v-if="src && !failed"
			:src="src"
			:alt="title ? `Cover of ${title}` : 'Book cover'"
			:class="{ ready: !loading }"
			loading="lazy"
			@load="onLoad"
			@error="onError"
		/>
		<div v-else-if="!loading" class="book-cover-fallback">
			<span>{{ title?.charAt(0)?.toUpperCase() || '?' }}</span>
		</div>
		<div v-else class="book-cover-skeleton" aria-hidden="true">
			<span class="book-cover-spinner" />
		</div>
	</div>
</template>

<style scoped>
.book-cover {
	position: relative;
	flex-shrink: 0;
	border-radius: 4px;
	overflow: hidden;
	background: var(--realm-surface-alt);
	border: 1px solid var(--realm-border);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.book-cover.zoomable {
	cursor: zoom-in;
}

.book-cover.zoomable:focus-visible {
	outline: 2px solid var(--realm-accent);
	outline-offset: 2px;
}

.book-cover.sm {
	width: 40px;
	height: 60px;
}
.book-cover.md {
	width: 64px;
	height: 96px;
}
.book-cover.lg {
	width: 96px;
	height: 144px;
}

.book-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
	opacity: 0;
	transition: opacity 0.2s ease;
	pointer-events: none;
}

.book-cover img.ready {
	opacity: 1;
}

.book-cover-skeleton {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	background: linear-gradient(
		110deg,
		var(--realm-surface-alt) 25%,
		color-mix(in srgb, var(--realm-accent) 12%, var(--realm-surface)) 40%,
		var(--realm-surface-alt) 55%
	);
	background-size: 200% 100%;
	animation: cover-shimmer 1.1s ease-in-out infinite;
}

.book-cover-spinner {
	width: 1.1rem;
	height: 1.1rem;
	border-radius: 50%;
	border: 2px solid color-mix(in srgb, var(--realm-text-muted) 35%, transparent);
	border-top-color: var(--realm-accent);
	animation: cover-spin 0.7s linear infinite;
}

.book-cover.sm .book-cover-spinner {
	width: 0.85rem;
	height: 0.85rem;
}

.book-cover-fallback {
	width: 100%;
	height: 100%;
	display: grid;
	place-items: center;
	font-family: var(--font-display);
	font-size: 1.25rem;
	color: var(--realm-text-muted);
	background: linear-gradient(
		145deg,
		var(--realm-surface-alt),
		color-mix(in srgb, var(--realm-accent) 18%, var(--realm-surface))
	);
}

@keyframes cover-shimmer {
	0% {
		background-position: 100% 0;
	}
	100% {
		background-position: -100% 0;
	}
}

@keyframes cover-spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
