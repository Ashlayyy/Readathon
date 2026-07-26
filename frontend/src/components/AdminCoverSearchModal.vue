<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '../lib/api'
import { apiUrl } from '../lib/apiBase'
import BookCover from './BookCover.vue'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useFocusTrap } from '../composables/useFocusTrap'

export type CoverProposal = {
	id: string
	bookTitle: string
	bookAuthor: string
	currentCoverUrl: string | null
	proposedCoverUrl: string | null
}

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
	applied: [updated: number]
	error: [message: string]
}>()

type Phase = 'confirm' | 'review'

const phase = ref<Phase>('confirm')
const proposals = ref<CoverProposal[]>([])
const selected = ref<Record<string, boolean>>({})
/** ids still waiting on Open Library */
const pendingLookup = ref<Record<string, boolean>>({})
const streaming = ref(false)
const streamDone = ref(0)
const streamTotal = ref(0)
const applying = ref(false)
const searchError = ref('')
const modalRef = ref<HTMLElement | null>(null)
let streamAbort: AbortController | null = null

useBodyScrollLock(open)
useFocusTrap(open, modalRef)

const applicable = computed(() =>
	proposals.value.filter((p) => Boolean(p.proposedCoverUrl)),
)

const selectedCount = computed(
	() => applicable.value.filter((p) => selected.value[p.id]).length,
)

const lookedUpCount = computed(() => streamDone.value)

watch(open, (isOpen) => {
	if (isOpen) {
		phase.value = 'confirm'
		proposals.value = []
		selected.value = {}
		pendingLookup.value = {}
		streaming.value = false
		streamDone.value = 0
		streamTotal.value = 0
		searchError.value = ''
		applying.value = false
	} else {
		stopStream()
	}
})

onBeforeUnmount(() => stopStream())

function stopStream() {
	streamAbort?.abort()
	streamAbort = null
	streaming.value = false
}

function close() {
	if (applying.value) return
	stopStream()
	open.value = false
}

async function startSearch() {
	searchError.value = ''
	try {
		const data = await api<{
			proposals: CoverProposal[]
			total: number
			missingCount: number
		}>('/admin/submissions/covers/list')

		proposals.value = data.proposals
		const nextSelected: Record<string, boolean> = {}
		const nextPending: Record<string, boolean> = {}
		for (const p of data.proposals) {
			nextSelected[p.id] = false
			nextPending[p.id] = true
		}
		selected.value = nextSelected
		pendingLookup.value = nextPending
		streamDone.value = 0
		streamTotal.value = data.total
		phase.value = 'review'

		if (data.total > 0) {
			void runCoverStream()
		}
	} catch (e) {
		searchError.value =
			e instanceof Error ? e.message : 'Failed to load books.'
		phase.value = 'confirm'
		emit('error', searchError.value)
	}
}

async function runCoverStream() {
	stopStream()
	streamAbort = new AbortController()
	streaming.value = true

	try {
		const res = await fetch(apiUrl('/admin/submissions/covers/stream'), {
			credentials: 'include',
			signal: streamAbort.signal,
			headers: { Accept: 'text/event-stream' },
		})
		if (!res.ok) {
			const text = await res.text()
			let msg = `Cover stream failed (${res.status})`
			try {
				const parsed = JSON.parse(text) as { error?: string }
				if (parsed.error) msg = parsed.error
			} catch {
				/* ignore */
			}
			throw new Error(msg)
		}
		if (!res.body) throw new Error('Cover stream returned no body.')

		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''

		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			const chunks = buffer.split('\n\n')
			buffer = chunks.pop() ?? ''
			for (const chunk of chunks) {
				handleSseChunk(chunk)
			}
		}
		if (buffer.trim()) handleSseChunk(buffer)
	} catch (e) {
		if ((e as Error).name === 'AbortError') return
		const msg = e instanceof Error ? e.message : 'Cover stream failed.'
		emit('error', msg)
	} finally {
		streaming.value = false
		pendingLookup.value = {}
		streamAbort = null
	}
}

function handleSseChunk(chunk: string) {
	let eventName = 'message'
	const dataLines: string[] = []
	for (const line of chunk.split('\n')) {
		if (line.startsWith('event:')) eventName = line.slice(6).trim()
		else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
	}
	if (!dataLines.length) return
	const raw = dataLines.join('\n')
	let data: Record<string, unknown>
	try {
		data = JSON.parse(raw) as Record<string, unknown>
	} catch {
		return
	}

	if (eventName === 'start') {
		streamTotal.value = Number(data.total) || 0
		return
	}

	if (eventName === 'cover') {
		const id = String(data.id ?? '')
		const proposed =
			typeof data.proposedCoverUrl === 'string' ? data.proposedCoverUrl : null
		const done = Number(data.done) || 0
		streamDone.value = done
		if (typeof data.total === 'number') streamTotal.value = data.total

		const idx = proposals.value.findIndex((p) => p.id === id)
		if (idx >= 0) {
			const row = proposals.value[idx]!
			proposals.value[idx] = { ...row, proposedCoverUrl: proposed }
			if (proposed && !row.currentCoverUrl) {
				selected.value = { ...selected.value, [id]: true }
			}
		}
		const nextPending = { ...pendingLookup.value }
		delete nextPending[id]
		pendingLookup.value = nextPending
		return
	}

	if (eventName === 'done') {
		streamDone.value = Number(data.done) || streamDone.value
		pendingLookup.value = {}
	}
}

function selectAllApplicable() {
	const next = { ...selected.value }
	for (const p of applicable.value) next[p.id] = true
	selected.value = next
}

function selectNone() {
	const next = { ...selected.value }
	for (const p of proposals.value) next[p.id] = false
	selected.value = next
}

function rowHint(p: CoverProposal): string {
	if (pendingLookup.value[p.id]) return 'Searching…'
	if (!p.proposedCoverUrl) {
		if (streaming.value) return 'Waiting…'
		return 'No cover found'
	}
	if (!p.currentCoverUrl) return 'Missing → new'
	if (p.currentCoverUrl === p.proposedCoverUrl) return 'Same cover'
	return 'Replace existing'
}

async function applySelected() {
	const updates = applicable.value
		.filter((p) => selected.value[p.id] && p.proposedCoverUrl)
		.map((p) => ({ id: p.id, coverUrl: p.proposedCoverUrl! }))
	if (!updates.length) return

	applying.value = true
	try {
		const data = await api<{ updated: number; skipped: number }>(
			'/admin/submissions/covers/apply',
			{
				method: 'POST',
				body: JSON.stringify({ updates }),
			},
		)
		stopStream()
		open.value = false
		emit('applied', data.updated)
	} catch (e) {
		emit(
			'error',
			e instanceof Error ? e.message : 'Failed to apply cover updates.',
		)
	} finally {
		applying.value = false
	}
}
</script>

<template>
	<div v-if="open" class="modal-backdrop" @keydown.esc="close">
		<div
			ref="modalRef"
			class="modal card cover-search-modal"
			:class="{ 'cover-search-modal--wide': phase === 'review' }"
			role="dialog"
			aria-modal="true"
			:aria-labelledby="
				phase === 'confirm'
					? 'cover-search-confirm-title'
					: 'cover-search-review-title'
			"
			tabindex="-1"
		>
			<template v-if="phase === 'confirm'">
				<h2 id="cover-search-confirm-title">Search for covers?</h2>
				<p class="section-desc">
					Loads every active submission, then looks up Open Library covers for
					<strong>each book</strong> (including ones that already have a cover).
					You’ll see proposals appear in the list as they’re found. Nothing is
					saved until you apply selected rows — books missing a cover are
					pre-selected when a match is found.
				</p>
				<p v-if="searchError" class="alert alert-error">{{ searchError }}</p>
				<div class="modal-actions">
					<button type="button" class="btn btn-ghost" @click="close">
						Cancel
					</button>
					<button type="button" class="btn btn-primary" @click="startSearch">
						Start search
					</button>
				</div>
			</template>

			<template v-else>
				<header class="cover-search-header">
					<div>
						<h2 id="cover-search-review-title">Review cover results</h2>
						<p class="section-desc">
							{{ proposals.length }} books.
							<span v-if="streaming">
								Looking up covers… {{ lookedUpCount }}/{{ streamTotal }}
							</span>
							<span v-else-if="streamTotal > 0">
								Looked up {{ lookedUpCount }}
								{{ lookedUpCount === 1 ? 'book' : 'books' }}.
								{{ applicable.length }} with a proposed cover.
							</span>
							<span v-else> No books to look up. </span>
							Missing covers are pre-selected when found.
						</p>
					</div>
					<div class="cover-search-toolbar">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="!applicable.length"
							@click="selectAllApplicable"
						>
							Select all found
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							@click="selectNone"
						>
							Select none
						</button>
					</div>
				</header>

				<div v-if="streaming" class="stream-progress" aria-live="polite">
					<span class="cover-search-spinner inline" aria-hidden="true" />
					<span
						>Streaming covers {{ lookedUpCount }} /
						{{ streamTotal || '…' }}</span
					>
				</div>

				<ul v-if="proposals.length" class="cover-proposal-list">
					<li
						v-for="p in proposals"
						:key="p.id"
						class="cover-proposal-row"
						:class="{
							disabled: !p.proposedCoverUrl && !pendingLookup[p.id],
							pending: pendingLookup[p.id],
						}"
					>
						<label class="cover-proposal-check">
							<input
								type="checkbox"
								:checked="Boolean(selected[p.id])"
								:disabled="!p.proposedCoverUrl || applying"
								@change="
									selected[p.id] = ($event.target as HTMLInputElement).checked
								"
							/>
							<span class="sr-only">Apply cover for {{ p.bookTitle }}</span>
						</label>
						<div class="cover-pair">
							<BookCover
								:title="p.bookTitle"
								:author="p.bookAuthor"
								:cover-url="p.currentCoverUrl"
								size="sm"
							/>
							<span class="cover-arrow" aria-hidden="true">→</span>
							<div class="proposed-slot">
								<span
									v-if="pendingLookup[p.id]"
									class="cover-search-spinner sm"
									aria-hidden="true"
								/>
								<BookCover
									v-else
									:title="p.bookTitle"
									:author="p.bookAuthor"
									:cover-url="p.proposedCoverUrl"
									size="sm"
								/>
							</div>
						</div>
						<div class="cover-meta">
							<strong>{{ p.bookTitle }}</strong>
							<span class="muted">by {{ p.bookAuthor }}</span>
							<span
								class="muted hint"
								:class="{ warn: rowHint(p) === 'No cover found' }"
							>
								{{ rowHint(p) }}
							</span>
						</div>
					</li>
				</ul>
				<p v-else class="section-desc">No active submissions to search.</p>

				<div class="modal-actions">
					<button
						type="button"
						class="btn btn-ghost"
						:disabled="applying"
						@click="close"
					>
						{{ streaming ? 'Stop & close' : 'Cancel' }}
					</button>
					<button
						type="button"
						class="btn btn-primary"
						:disabled="applying || selectedCount === 0"
						@click="applySelected"
					>
						{{
							applying
								? 'Applying…'
								: `Apply selected (${selectedCount})`
						}}
					</button>
				</div>
			</template>
		</div>
	</div>
</template>

<style scoped>
.cover-search-modal {
	width: min(36rem, 100%);
	max-height: min(92vh, 52rem);
	overflow: auto;
}

.cover-search-modal--wide {
	width: min(56rem, 100%);
}

.cover-search-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.75rem;
	margin-bottom: 0.75rem;
}

.cover-search-header h2 {
	margin: 0 0 0.35rem;
}

.cover-search-toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
}

.stream-progress {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	margin: 0 0 0.75rem;
	padding: 0.55rem 0.75rem;
	border-radius: var(--radius);
	border: 1px solid color-mix(in srgb, var(--realm-accent) 35%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 10%, transparent);
	color: var(--realm-text-muted);
	font-size: 0.88rem;
}

.cover-search-spinner {
	width: 2rem;
	height: 2rem;
	border-radius: 50%;
	border: 2px solid color-mix(in srgb, var(--realm-text-muted) 35%, transparent);
	border-top-color: var(--realm-accent);
	animation: cover-search-spin 0.7s linear infinite;
}

.cover-search-spinner.inline {
	width: 1.1rem;
	height: 1.1rem;
	flex-shrink: 0;
}

.cover-search-spinner.sm {
	width: 1.35rem;
	height: 1.35rem;
	margin: 0.55rem auto;
}

@keyframes cover-search-spin {
	to {
		transform: rotate(360deg);
	}
}

.cover-proposal-list {
	list-style: none;
	margin: 0 0 1rem;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
	max-height: min(62vh, 36rem);
	overflow: auto;
}

.cover-proposal-row {
	display: grid;
	grid-template-columns: auto auto minmax(0, 1fr);
	align-items: center;
	gap: 0.75rem;
	padding: 0.55rem 0.65rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: color-mix(in srgb, var(--realm-surface) 88%, transparent);
	transition: border-color 0.15s ease, background 0.15s ease;
}

.cover-proposal-row.pending {
	border-color: color-mix(in srgb, var(--realm-accent) 40%, var(--realm-border));
}

.cover-proposal-row.disabled {
	opacity: 0.72;
}

.cover-proposal-check {
	display: grid;
	place-items: center;
}

.cover-pair {
	display: flex;
	align-items: center;
	gap: 0.4rem;
}

.proposed-slot {
	width: 40px;
	height: 60px;
	display: grid;
	place-items: center;
	flex-shrink: 0;
}

.cover-arrow {
	color: var(--realm-text-muted);
	font-size: 0.9rem;
}

.cover-meta {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	min-width: 0;
}

.cover-meta strong {
	color: var(--realm-text);
	font-size: 0.92rem;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.muted {
	color: var(--realm-text-muted);
	font-size: 0.8rem;
}

.hint {
	font-size: 0.75rem;
}

.warn {
	color: var(--realm-accent);
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

.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 0.5rem;
}

.section-desc {
	margin: 0;
	color: var(--realm-text-muted);
	font-size: 0.9rem;
	line-height: 1.45;
}

.modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 80;
	display: grid;
	place-items: center;
	padding: 1rem;
	background: rgba(0, 0, 0, 0.55);
}

.modal {
	outline: none;
}
</style>
