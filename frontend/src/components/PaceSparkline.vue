<script setup lang="ts">
defineProps<{
	path: string | null
	label?: string
}>()
</script>

<template>
	<figure v-if="path" class="pace-spark" :aria-label="label ?? 'Reading pace over time'">
		<svg viewBox="0 0 100 28" preserveAspectRatio="none" role="img">
			<title>{{ label ?? 'Pages per day sparkline' }}</title>
			<path :d="path" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		<figcaption v-if="label" class="pace-caption">{{ label }}</figcaption>
	</figure>
	<p v-else class="pace-empty">Pace chart unlocks after two finished books with start + finish dates.</p>
</template>

<style scoped>
.pace-spark {
	margin: 0;
	color: var(--realm-accent);
}

.pace-spark svg {
	width: 100%;
	max-width: 280px;
	height: 48px;
	display: block;
}

.pace-caption,
.pace-empty {
	margin: 0.35rem 0 0;
	font-size: 0.8rem;
	color: var(--realm-text-muted);
}
</style>
