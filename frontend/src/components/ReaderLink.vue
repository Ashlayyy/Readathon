<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{
	id: string
	name: string
	/** Optional class on the link */
	className?: string
}>()
</script>

<template>
	<RouterLink
		:to="{ name: 'reader', params: { id } }"
		class="reader-link"
		:class="className"
	>
		{{ name }}
	</RouterLink>
</template>

<style scoped>
.reader-link {
	color: inherit;
	text-decoration: underline;
	text-decoration-color: color-mix(in srgb, var(--realm-accent) 55%, transparent);
	text-underline-offset: 0.15em;
	font-weight: inherit;
}

.reader-link:hover,
.reader-link:focus-visible {
	color: var(--realm-accent);
	text-decoration-color: var(--realm-accent);
	outline: none;
}
</style>
