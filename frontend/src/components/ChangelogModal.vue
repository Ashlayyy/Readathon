<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
	CHANGELOG,
	CHANGELOG_SEEN_KEY,
	LATEST_CHANGELOG_VERSION,
	changelogEntryVersion,
	type ChangelogEntry,
} from '../lib/changelog'

const props = defineProps<{
	/** Open the panel immediately (e.g. from hero button). */
	open?: boolean
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
}>()

const panelOpen = ref(false)
const autoPromptOpen = ref(false)

watch(
	() => props.open,
	(open) => {
		if (open) panelOpen.value = true
	},
)

const visible = computed(() => props.open === true || panelOpen.value || autoPromptOpen.value)

function markSeen() {
	try {
		localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_VERSION)
	} catch {
		/* ignore */
	}
}

function close() {
	markSeen()
	panelOpen.value = false
	autoPromptOpen.value = false
	emit('update:open', false)
}

function openPanel() {
	panelOpen.value = true
	emit('update:open', true)
}

function onKey(e: KeyboardEvent) {
	if (e.key === 'Escape' && visible.value) close()
}

onMounted(() => {
	window.addEventListener('keydown', onKey)
	try {
		const seen = localStorage.getItem(CHANGELOG_SEEN_KEY)
		if (seen !== LATEST_CHANGELOG_VERSION && CHANGELOG.length > 0) {
			autoPromptOpen.value = true
		}
	} catch {
		/* ignore */
	}
})

onUnmounted(() => window.removeEventListener('keydown', onKey))

defineExpose({ openPanel, close })

/** Popup only shows the newest release; full history is on /changelog. */
const latestOnly = computed(() => (CHANGELOG[0] ? [CHANGELOG[0]] : []))

function entryId(entry: ChangelogEntry, index: number) {
	return `${changelogEntryVersion(entry, index)}-${entry.date}`
}
</script>

<template>
	<!-- Always-available trigger for parent slots / hero -->
	<slot :open="openPanel" />

	<Teleport to="body">
		<div
			v-if="visible"
			class="changelog-overlay"
			role="dialog"
			aria-modal="true"
			aria-labelledby="changelog-title"
		>
			<div class="changelog-panel card">
				<header class="changelog-head">
					<div>
						<p class="eyebrow">Updates</p>
						<h2 id="changelog-title">What’s new</h2>
					</div>
				</header>

				<ul class="entry-list">
					<li
						v-for="(entry, index) in latestOnly"
						:key="entryId(entry, index)"
						class="entry"
					>
						<div class="entry-meta">
							<span class="version">{{ changelogEntryVersion(entry, index) }}</span>
							<time>{{ entry.date }}</time>
						</div>
						<h3>{{ entry.title }}</h3>
						<ul class="items">
							<li v-for="(item, i) in entry.items" :key="i">{{ item }}</li>
						</ul>
					</li>
				</ul>

				<footer class="changelog-foot">
					<RouterLink to="/changelog" class="btn btn-ghost" @click="close">
						Full changelog
					</RouterLink>
					<button type="button" class="btn btn-primary" @click="close">Got it</button>
				</footer>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.changelog-overlay {
	position: fixed;
	inset: 0;
	z-index: 90;
	background: color-mix(in srgb, #000 55%, transparent);
	display: grid;
	place-items: center;
	padding: 1rem;
}

.changelog-panel {
	width: min(32rem, 100%);
	max-height: min(85dvh, 40rem);
	overflow: auto;
	padding: 1.25rem 1.35rem 1.15rem;
	background: var(--realm-surface);
	border: 1px solid var(--realm-border);
	box-shadow: 0 18px 50px color-mix(in srgb, #000 40%, transparent);
	animation: changelog-in 0.22s ease-out;
}

@keyframes changelog-in {
	from {
		opacity: 0;
		transform: translateY(0.6rem) scale(0.98);
	}
	to {
		opacity: 1;
		transform: none;
	}
}

.changelog-head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
	margin-bottom: 1rem;
}

.eyebrow {
	margin: 0 0 0.15rem;
	font-size: 0.72rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--realm-accent-glow);
}

.changelog-head h2 {
	margin: 0;
	font-family: var(--font-display);
	font-size: 1.45rem;
}

.entry-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 1.15rem;
}

.entry-meta {
	display: flex;
	gap: 0.65rem;
	align-items: baseline;
	margin-bottom: 0.25rem;
}

.version {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.78rem;
	color: var(--realm-accent-glow);
}

.entry-meta time {
	font-size: 0.78rem;
	color: var(--realm-text-muted);
}

.entry h3 {
	margin: 0 0 0.45rem;
	font-size: 1.05rem;
	font-family: var(--font-display);
	color: var(--realm-text);
}

.items {
	margin: 0;
	padding-left: 1.1rem;
	color: var(--realm-text-muted);
	font-size: 0.92rem;
}

.items li {
	margin-bottom: 0.35rem;
}

.changelog-foot {
	margin-top: 1.15rem;
	padding-top: 0.85rem;
	border-top: 1px solid var(--realm-border);
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
}
</style>
