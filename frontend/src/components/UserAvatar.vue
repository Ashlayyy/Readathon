<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { apiUrl } from '../lib/apiBase'

const props = defineProps<{
	name: string
	avatarUrl?: string | null
	size?: 'sm' | 'md' | 'lg'
	color?: string | null
}>()

function resolveSrc(url: string | null | undefined): string | null {
	if (!url?.trim()) return null
	const trimmed = url.trim()
	if (/^https?:\/\//i.test(trimmed)) return trimmed
	const path = trimmed.replace(/^\/api(?=\/)/, '')
	return apiUrl(path.startsWith('/') ? path : `/${path}`)
}

const src = ref<string | null>(resolveSrc(props.avatarUrl))
const failed = ref(false)
const loading = ref(Boolean(resolveSrc(props.avatarUrl)))

watch(
	() => props.avatarUrl,
	(url) => {
		src.value = resolveSrc(url)
		failed.value = false
		loading.value = Boolean(resolveSrc(url))
	},
)

const initial = computed(() => props.name?.charAt(0)?.toUpperCase() || '?')

function onLoad() {
	loading.value = false
}

function onError() {
	failed.value = true
	loading.value = false
	src.value = null
}
</script>

<template>
	<div
		class="user-avatar"
		:class="size ?? 'md'"
		:style="{ '--c': color || 'var(--realm-border)' }"
		:aria-hidden="true"
	>
		<div v-if="loading && src && !failed" class="avatar-skeleton">
			<span class="avatar-spinner" />
		</div>
		<img
			v-if="src && !failed"
			:src="src"
			:alt="''"
			:class="{ ready: !loading }"
			@load="onLoad"
			@error="onError"
		/>
		<span v-else class="avatar-initial">{{ initial }}</span>
	</div>
</template>

<style scoped>
.user-avatar {
	position: relative;
	flex-shrink: 0;
	border-radius: 50%;
	display: grid;
	place-items: center;
	overflow: hidden;
	background: color-mix(in srgb, var(--c) 25%, var(--realm-surface));
	border: 2px solid var(--c);
	color: var(--realm-text);
	font-family: var(--font-display);
}

.user-avatar.sm {
	width: 2rem;
	height: 2rem;
	font-size: 0.85rem;
}

.user-avatar.md {
	width: 3.5rem;
	height: 3.5rem;
	font-size: 1.5rem;
}

.user-avatar.lg {
	width: 4.5rem;
	height: 4.5rem;
	font-size: 1.75rem;
}

.user-avatar img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	opacity: 0;
	transition: opacity 0.2s ease;
}

.user-avatar img.ready {
	opacity: 1;
}

.avatar-initial {
	line-height: 1;
}

.avatar-skeleton {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	background: color-mix(in srgb, var(--c) 18%, var(--realm-surface));
}

.avatar-spinner {
	width: 1rem;
	height: 1rem;
	border-radius: 50%;
	border: 2px solid color-mix(in srgb, var(--realm-text-muted) 35%, transparent);
	border-top-color: var(--realm-accent);
	animation: avatar-spin 0.7s linear infinite;
}

@keyframes avatar-spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
