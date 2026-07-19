<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
	title: string
	author?: string
	coverUrl?: string | null
	size?: 'sm' | 'md' | 'lg'
}>()

const src = ref<string | null>(props.coverUrl ?? null)
const failed = ref(false)

watch(
	() => [props.coverUrl, props.title, props.author] as const,
	([url]) => {
		src.value = url ?? null
		failed.value = false
	},
)

function onError() {
	failed.value = true
	src.value = null
}
</script>

<template>
	<div class="book-cover" :class="size ?? 'md'" :aria-hidden="!src">
		<img
			v-if="src && !failed"
			:src="src"
			:alt="title ? `Cover of ${title}` : 'Book cover'"
			loading="lazy"
			@error="onError"
		/>
		<div v-else class="book-cover-fallback">
			<span>{{ title?.charAt(0)?.toUpperCase() || '?' }}</span>
		</div>
	</div>
</template>

<style scoped>
.book-cover {
	flex-shrink: 0;
	border-radius: 4px;
	overflow: hidden;
	background: var(--realm-surface-alt);
	border: 1px solid var(--realm-border);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
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
</style>
