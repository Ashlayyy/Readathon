<script setup lang="ts">
import {
	CHANGELOG,
	changelogEntryVersion,
} from '../lib/changelog'
import { APP_VERSION } from '../lib/version'
</script>

<template>
	<main class="page changelog-page">
		<header class="changelog-hero">
			<p class="eyebrow">Updates</p>
			<h1 class="page-title">Changelog</h1>
			<p class="lead">
				What changed in each release. You’re on
				<strong>v{{ APP_VERSION }}</strong>.
			</p>
		</header>

		<ol class="timeline">
			<li
				v-for="(entry, index) in CHANGELOG"
				:id="`v-${changelogEntryVersion(entry, index)}`"
				:key="`${changelogEntryVersion(entry, index)}-${entry.date}`"
				class="timeline-entry card"
			>
				<div class="entry-meta">
					<span class="version">v{{ changelogEntryVersion(entry, index) }}</span>
					<time>{{ entry.date }}</time>
					<span v-if="index === 0" class="current-pill">Current</span>
				</div>
				<h2>{{ entry.title }}</h2>
				<ul class="items">
					<li v-for="(item, i) in entry.items" :key="i">{{ item }}</li>
				</ul>
			</li>
		</ol>
	</main>
</template>

<style scoped>
.changelog-page {
	max-width: 40rem;
}

.changelog-hero {
	margin-bottom: 1.75rem;
}

.eyebrow {
	margin: 0 0 0.25rem;
	font-size: 0.72rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--realm-accent-glow);
}

.lead {
	margin: 0.35rem 0 0;
	color: var(--realm-text-muted);
	font-size: 0.95rem;
}

.lead strong {
	color: var(--realm-text);
}

.timeline {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.timeline-entry {
	padding: 1.1rem 1.2rem;
}

.entry-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.5rem 0.75rem;
	margin-bottom: 0.4rem;
}

.version {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.85rem;
	color: var(--realm-accent-glow);
	font-weight: 700;
}

.entry-meta time {
	font-size: 0.82rem;
	color: var(--realm-text-muted);
}

.current-pill {
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	padding: 0.15rem 0.45rem;
	border-radius: 999px;
	border: 1px solid color-mix(in srgb, var(--realm-success) 45%, var(--realm-border));
	color: var(--realm-success);
	background: color-mix(in srgb, var(--realm-success) 12%, transparent);
}

.timeline-entry h2 {
	margin: 0 0 0.55rem;
	font-family: var(--font-display);
	font-size: 1.15rem;
	color: var(--realm-text);
}

.items {
	margin: 0;
	padding-left: 1.15rem;
	color: var(--realm-text-muted);
	font-size: 0.92rem;
}

.items li {
	margin-bottom: 0.35rem;
}
</style>
