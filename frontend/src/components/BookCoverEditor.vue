<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '../lib/api'
import BookCover from './BookCover.vue'

const props = defineProps<{
	submissionId: string
	title: string
	author: string
	coverUrl?: string | null
	editable?: boolean
}>()

const emit = defineEmits<{
	updated: [coverUrl: string | null]
}>()

const open = ref(false)
const localCover = ref<string | null>(props.coverUrl ?? null)
const candidates = ref<{ coverUrl: string | null; title?: string }[]>([])
const looking = ref(false)
const uploading = ref(false)
const saving = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

watch(
	() => props.coverUrl,
	(url) => {
		localCover.value = url ?? null
	},
)

async function lookup() {
	looking.value = true
	error.value = ''
	try {
		const params = new URLSearchParams({ title: props.title })
		if (props.author) params.set('author', props.author)
		const data = await api<{
			cover: { coverUrl: string | null } | null
			candidates?: { coverUrl: string | null; title?: string }[]
		}>(`/covers/lookup?${params}`)
		candidates.value = (data.candidates ?? []).filter((c) => c.coverUrl)
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Lookup failed'
		candidates.value = []
	} finally {
		looking.value = false
	}
}

async function saveCover(url: string | null) {
	saving.value = true
	error.value = ''
	try {
		const data = await api<{ submission: { coverUrl?: string | null } }>(
			`/submissions/${props.submissionId}/cover`,
			{
				method: 'PATCH',
				body: JSON.stringify({ coverUrl: url }),
			},
		)
		localCover.value = data.submission.coverUrl ?? null
		emit('updated', localCover.value)
		open.value = false
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not save cover'
	} finally {
		saving.value = false
	}
}

function pickCandidate(url: string | null) {
	if (!url || saving.value) return
	void saveCover(url)
}

function openPicker() {
	if (!props.editable) return
	open.value = !open.value
	if (open.value && candidates.value.length === 0) void lookup()
}

function onFile() {
	fileInput.value?.click()
}

async function onFileChange(ev: Event) {
	const input = ev.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
		error.value = 'Use JPEG, PNG, or WebP.'
		return
	}
	if (file.size > 2 * 1024 * 1024) {
		error.value = 'Max 2 MB.'
		return
	}
	uploading.value = true
	error.value = ''
	try {
		const dataUrl = await readFileAsDataUrl(file)
		const data = await api<{ coverUrl: string }>('/covers/upload', {
			method: 'POST',
			body: JSON.stringify({ dataUrl }),
		})
		await saveCover(data.coverUrl)
		candidates.value = []
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Upload failed'
	} finally {
		uploading.value = false
	}
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result ?? ''))
		reader.onerror = () => reject(new Error('Could not read image'))
		reader.readAsDataURL(file)
	})
}

function onDocClick(e: MouseEvent) {
	if (!open.value) return
	const el = panelRef.value
	if (el && !el.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
	<div ref="panelRef" class="cover-editor" :class="{ editable, open }">
		<button
			v-if="editable"
			type="button"
			class="cover-hit"
			:aria-expanded="open"
			aria-label="Change book cover"
			@click.stop="openPicker"
		>
			<BookCover
				:title="title"
				:author="author"
				:cover-url="localCover"
				:zoomable="false"
			/>
			<span class="cover-edit-badge" aria-hidden="true">✎</span>
		</button>
		<BookCover v-else :title="title" :author="author" :cover-url="localCover" />

		<button
			v-if="editable"
			type="button"
			class="cover-change-btn"
			:aria-expanded="open"
			@click.stop="openPicker"
		>
			{{ open ? 'Close' : localCover ? 'Change cover' : 'Add cover' }}
		</button>

		<div v-if="editable && open" class="cover-panel card" @click.stop>
			<p class="panel-lead">Pick a cover for <strong>{{ title }}</strong></p>
			<p v-if="error" class="panel-error">{{ error }}</p>

			<div class="panel-actions">
				<input
					ref="fileInput"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					class="sr-only"
					@change="onFileChange"
				/>
				<button
					type="button"
					class="btn btn-secondary btn-sm"
					:disabled="uploading || saving"
					@click="onFile"
				>
					{{ uploading ? 'Uploading…' : 'Upload' }}
				</button>
				<button
					type="button"
					class="btn btn-ghost btn-sm"
					:disabled="looking || saving"
					@click="lookup"
				>
					{{ looking ? 'Searching…' : 'Find covers' }}
				</button>
				<button
					type="button"
					class="btn btn-ghost btn-sm"
					:disabled="saving || !localCover"
					@click="saveCover(null)"
				>
					Remove
				</button>
			</div>

			<ul v-if="candidates.length" class="candidate-row">
				<li v-for="(c, i) in candidates" :key="`${c.coverUrl}-${i}`">
					<button
						type="button"
						class="candidate"
						:class="{ selected: c.coverUrl === localCover }"
						:disabled="saving"
						@click="pickCandidate(c.coverUrl)"
					>
						<img v-if="c.coverUrl" :src="c.coverUrl" alt="" />
					</button>
				</li>
			</ul>
			<p v-else-if="!looking" class="panel-hint">Upload your own or search Open Library.</p>
		</div>
	</div>
</template>

<style scoped>
.cover-editor {
	position: relative;
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 0.4rem;
	/* Size to the cover, not the “Change cover” label (which is wider). */
	width: min-content;
}

.cover-hit {
	appearance: none;
	border: 2px dashed transparent;
	padding: 0;
	margin: 0;
	background: transparent;
	cursor: pointer;
	position: relative;
	display: block;
	width: fit-content;
	line-height: 0;
	border-radius: 6px;
	transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.cover-editor.editable .cover-hit {
	border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
}

.cover-editor.editable .cover-hit:hover,
.cover-editor.editable .cover-hit:focus-visible,
.cover-editor.open .cover-hit {
	border-color: var(--realm-accent);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--realm-accent) 25%, transparent);
}

.cover-edit-badge {
	position: absolute;
	top: 0.3rem;
	right: 0.3rem;
	width: 1.35rem;
	height: 1.35rem;
	display: grid;
	place-items: center;
	border-radius: 999px;
	font-size: 0.7rem;
	line-height: 1;
	color: #fff;
	background: color-mix(in srgb, var(--realm-accent) 88%, #000);
	box-shadow: 0 1px 4px color-mix(in srgb, #000 35%, transparent);
	pointer-events: none;
}

.cover-change-btn {
	appearance: none;
	border: 1px solid var(--realm-border);
	background: var(--realm-surface);
	color: var(--realm-text);
	font: inherit;
	font-size: 0.65rem;
	font-weight: 600;
	letter-spacing: 0.02em;
	line-height: 1.2;
	padding: 0.28rem 0.2rem;
	border-radius: 4px;
	cursor: pointer;
	width: 100%;
	white-space: normal;
	text-align: center;
}

.cover-change-btn:hover,
.cover-change-btn:focus-visible {
	border-color: var(--realm-accent);
	color: var(--realm-accent);
}

.cover-panel {
	position: absolute;
	z-index: 20;
	top: calc(100% + 0.35rem);
	left: 0;
	width: min(18rem, 78vw);
	padding: 0.75rem;
	background: var(--realm-surface);
	border: 1px solid var(--realm-border);
	box-shadow: 0 12px 28px color-mix(in srgb, #000 35%, transparent);
}

.panel-lead {
	margin: 0 0 0.55rem;
	font-size: 0.85rem;
	color: var(--realm-text-muted);
}

.panel-lead strong {
	color: var(--realm-text);
}

.panel-error {
	margin: 0 0 0.45rem;
	font-size: 0.8rem;
	color: var(--realm-accent);
}

.panel-hint {
	margin: 0.5rem 0 0;
	font-size: 0.78rem;
	color: var(--realm-text-muted);
}

.panel-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
}

.candidate-row {
	list-style: none;
	margin: 0.65rem 0 0;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.candidate {
	appearance: none;
	border: 2px solid var(--realm-border);
	padding: 0;
	border-radius: 4px;
	overflow: hidden;
	width: 2.75rem;
	height: 4.1rem;
	background: var(--realm-bg);
	cursor: pointer;
}

.candidate.selected,
.candidate:hover {
	border-color: var(--realm-accent);
}

.candidate img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
