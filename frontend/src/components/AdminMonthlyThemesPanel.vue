<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
	api,
	type AdminSiteSettings,
	type MonthlyEventSlot,
} from '../lib/api'
import { useConfig } from '../composables/useConfig'

const emit = defineEmits<{ message: [text: string, isError?: boolean] }>()

const { loadConfig } = useConfig()

const loaded = ref(false)
const saving = ref(false)
const autoSaving = ref('')
const monthlyEvents = ref<MonthlyEventSlot[]>([])
const selectedEventId = ref<string | null>(null)
const siteOverrideJson = ref('{}')
const featuredPromptIdsText = ref('')
const timezoneDefault = ref('Europe/Amsterdam')
const savedSnapshot = ref('')

const selectedEvent = computed(
	() => monthlyEvents.value.find((e) => e.id === selectedEventId.value) ?? null,
)

function eventsWithEditorOverlay(): MonthlyEventSlot[] {
	const clone = JSON.parse(JSON.stringify(monthlyEvents.value)) as MonthlyEventSlot[]
	const ev = clone.find((e) => e.id === selectedEventId.value)
	if (!ev) return clone
	ev.featuredPromptIds = featuredPromptIdsText.value
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter(Boolean)
	try {
		const parsed = JSON.parse(siteOverrideJson.value || '{}') as Record<
			string,
			unknown
		>
		ev.siteOverride = {
			event:
				parsed.event && typeof parsed.event === 'object'
					? (parsed.event as Record<string, unknown>)
					: undefined,
			copy:
				parsed.copy && typeof parsed.copy === 'object'
					? (parsed.copy as Record<string, unknown>)
					: undefined,
			branding:
				parsed.branding && typeof parsed.branding === 'object'
					? (parsed.branding as MonthlyEventSlot['siteOverride']['branding'])
					: undefined,
		}
	} catch {
		/* keep cloned override */
	}
	return clone
}

const dirty = computed(() => {
	if (!loaded.value || !savedSnapshot.value) return false
	return JSON.stringify(eventsWithEditorOverlay()) !== savedSnapshot.value
})

function markClean() {
	flushSelectedEventEdits()
	savedSnapshot.value = JSON.stringify(monthlyEvents.value)
}

const liveHint = computed(() => {
	const live = monthlyEvents.value.find((e) => {
		if (e.status !== 'scheduled') return false
		const today = new Date().toISOString().slice(0, 10)
		return today >= e.from && today <= e.to
	})
	return live
		? `Live now: ${live.title || 'Untitled'} (${live.from} → ${live.to})`
		: 'No theme is live right now (drafts stay hidden).'
})

function emptyMonthlySlot(): MonthlyEventSlot {
	const now = new Date()
	const y = now.getFullYear()
	const m = String(now.getMonth() + 1).padStart(2, '0')
	const last = new Date(y, now.getMonth() + 1, 0).getDate()
	return {
		id: crypto.randomUUID(),
		status: 'draft',
		title: '',
		blurb: '',
		from: `${y}-${m}-01`,
		to: `${y}-${m}-${String(last).padStart(2, '0')}`,
		timezone: timezoneDefault.value || 'Europe/Amsterdam',
		multipliers: { prompts: 1, bonuses: 1, pageBonus: 1 },
		featuredPromptIds: [],
		siteOverride: {},
	}
}

function syncSelectedEditorFields() {
	const ev = selectedEvent.value
	if (!ev) {
		siteOverrideJson.value = '{}'
		featuredPromptIdsText.value = ''
		return
	}
	featuredPromptIdsText.value = ev.featuredPromptIds.join(', ')
	try {
		siteOverrideJson.value = JSON.stringify(ev.siteOverride ?? {}, null, 2)
	} catch {
		siteOverrideJson.value = '{}'
	}
}

function applySettings(settings: AdminSiteSettings) {
	timezoneDefault.value =
		settings.scheduledPublishTimezone ?? 'Europe/Amsterdam'
	monthlyEvents.value = (settings.monthlyEvents ?? []).map((e) => ({
		...e,
		multipliers: {
			prompts: e.multipliers?.prompts ?? 1,
			bonuses: e.multipliers?.bonuses ?? 1,
			pageBonus: e.multipliers?.pageBonus ?? 1,
		},
		featuredPromptIds: [...(e.featuredPromptIds ?? [])],
		siteOverride: e.siteOverride ?? {},
	}))
	if (
		!selectedEventId.value ||
		!monthlyEvents.value.some((e) => e.id === selectedEventId.value)
	) {
		selectedEventId.value = monthlyEvents.value[0]?.id ?? null
	}
	syncSelectedEditorFields()
	markClean()
}

async function loadSettings() {
	const { settings } = await api<{ settings: AdminSiteSettings }>('/admin/settings')
	applySettings(settings)
	loaded.value = true
}

function discardThemeEdits() {
	void loadSettings().then(() => {
		emit('message', 'Theme edits discarded.')
	})
}

async function patchSettings(body: Record<string, unknown>, busyKey = 'save') {
	autoSaving.value = busyKey
	try {
		const { settings } = await api<{ settings: AdminSiteSettings }>('/admin/settings', {
			method: 'PATCH',
			body: JSON.stringify(body),
		})
		applySettings(settings)
		await loadConfig(true)
		return settings
	} finally {
		autoSaving.value = ''
	}
}

onMounted(async () => {
	try {
		await Promise.all([loadConfig(), loadSettings()])
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to load monthly themes',
			true,
		)
	}
})

function selectMonthlyEvent(id: string) {
	flushSelectedEventEdits()
	selectedEventId.value = id
	syncSelectedEditorFields()
}

function flushSelectedEventEdits() {
	const ev = selectedEvent.value
	if (!ev) return
	ev.featuredPromptIds = featuredPromptIdsText.value
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter(Boolean)
	try {
		const parsed = JSON.parse(siteOverrideJson.value || '{}') as Record<
			string,
			unknown
		>
		ev.siteOverride = {
			event:
				parsed.event && typeof parsed.event === 'object'
					? (parsed.event as Record<string, unknown>)
					: undefined,
			copy:
				parsed.copy && typeof parsed.copy === 'object'
					? (parsed.copy as Record<string, unknown>)
					: undefined,
			branding:
				parsed.branding && typeof parsed.branding === 'object'
					? (parsed.branding as MonthlyEventSlot['siteOverride']['branding'])
					: undefined,
		}
	} catch {
		/* keep previous until save */
	}
}

function addMonthlyEvent() {
	flushSelectedEventEdits()
	const slot = emptyMonthlySlot()
	monthlyEvents.value = [...monthlyEvents.value, slot]
	selectedEventId.value = slot.id
	syncSelectedEditorFields()
}

function removeSelectedMonthlyEvent() {
	if (!selectedEventId.value) return
	if (!confirm('Delete this monthly theme slot?')) return
	monthlyEvents.value = monthlyEvents.value.filter(
		(e) => e.id !== selectedEventId.value,
	)
	selectedEventId.value = monthlyEvents.value[0]?.id ?? null
	syncSelectedEditorFields()
}

async function saveMonthlyEvents() {
	flushSelectedEventEdits()
	saving.value = true
	emit('message', '')
	try {
		await patchSettings({ monthlyEvents: monthlyEvents.value }, 'monthly')
		markClean()
		emit(
			'message',
			'Monthly themes saved. Drafts stay invisible until scheduled + in date range.',
		)
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to save monthly themes',
			true,
		)
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<section class="monthly-themes">
		<header class="card hero">
			<div>
				<h2>Theme of the month</h2>
				<p class="section-desc">
					Plan custom months ahead. <strong>Draft</strong> = invisible to users.
					<strong> Scheduled</strong> only applies inside its dates, then the site
					(and Discord standings images) auto-revert to the base look.
				</p>
				<p class="live-hint">{{ liveHint }}</p>
			</div>
			<div class="btn-row">
				<button type="button" class="btn btn-secondary btn-sm" @click="addMonthlyEvent">
					Add month
				</button>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					:disabled="saving || autoSaving === 'monthly'"
					@click="saveMonthlyEvents"
				>
					{{ saving || autoSaving === 'monthly' ? 'Saving…' : 'Save themes' }}
				</button>
			</div>
		</header>

		<div v-if="!loaded" class="page-state" style="min-height: 12rem">
			<div class="page-spinner" role="status" aria-label="Loading" />
			<p>Loading themes…</p>
		</div>

		<template v-else>
			<article class="card panel">
				<div class="monthly-layout">
					<ul class="monthly-list" aria-label="Monthly themes">
						<li v-if="monthlyEvents.length === 0" class="hint">
							No themes yet — click <strong>Add month</strong>.
						</li>
						<li v-for="ev in monthlyEvents" :key="ev.id">
							<button
								type="button"
								class="monthly-list-item"
								:class="{ active: ev.id === selectedEventId }"
								@click="selectMonthlyEvent(ev.id)"
							>
								<span class="monthly-list-title">{{ ev.title || 'Untitled' }}</span>
								<span class="monthly-list-meta">
									{{ ev.status }} · {{ ev.from }} → {{ ev.to }}
								</span>
							</button>
						</li>
					</ul>

					<div v-if="selectedEvent" class="monthly-editor">
						<label>
							Title
							<input v-model="selectedEvent.title" type="text" maxlength="120" />
						</label>
						<label>
							Blurb (shown on home while live)
							<textarea v-model="selectedEvent.blurb" rows="2" maxlength="400" />
						</label>
						<div class="field-row">
							<label>
								From
								<input v-model="selectedEvent.from" type="date" />
							</label>
							<label>
								To
								<input v-model="selectedEvent.to" type="date" />
							</label>
							<label>
								Timezone
								<input v-model="selectedEvent.timezone" type="text" />
							</label>
							<label>
								Status
								<select v-model="selectedEvent.status">
									<option value="draft">Draft (hidden)</option>
									<option value="scheduled">Scheduled</option>
								</select>
							</label>
						</div>
						<div class="field-row">
							<label>
								Prompt ×
								<input
									v-model.number="selectedEvent.multipliers.prompts"
									type="number"
									min="0"
									max="100"
									step="0.1"
								/>
							</label>
							<label>
								Bonuses ×
								<input
									v-model.number="selectedEvent.multipliers.bonuses"
									type="number"
									min="0"
									max="100"
									step="0.1"
								/>
							</label>
							<label>
								Page bonus ×
								<input
									v-model.number="selectedEvent.multipliers.pageBonus"
									type="number"
									min="0"
									max="100"
									step="0.1"
								/>
							</label>
						</div>
						<label>
							Featured prompt IDs (comma-separated)
							<input
								v-model="featuredPromptIdsText"
								type="text"
								placeholder="prompt-id-1, prompt-id-2"
								autocomplete="off"
							/>
						</label>
						<label>
							Site overhaul JSON
							<span class="hint">
								Optional. Example:
								<code
									>{"event":{"tagline":"…"},"branding":{"theme":{"accent":"#88c0d0","background":"#0b1220"}}}</code
								>
								— only while live; standings / vibes / wrap images use these colors too.
							</span>
							<textarea
								v-model="siteOverrideJson"
								rows="10"
								spellcheck="false"
								class="mono"
							/>
						</label>
						<div class="btn-row">
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								@click="removeSelectedMonthlyEvent"
							>
								Delete theme
							</button>
						</div>
					</div>
				</div>
			</article>
		</template>

		<Teleport to="body">
			<div
				v-if="dirty"
				class="unsaved-sticky"
				role="status"
				aria-live="polite"
			>
				<p class="unsaved-sticky-text">
					You have unsaved theme changes — save or discard before you leave.
				</p>
				<div class="unsaved-sticky-actions">
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						:disabled="saving"
						@click="discardThemeEdits"
					>
						Discard
					</button>
					<button
						type="button"
						class="btn btn-primary btn-sm"
						:disabled="saving"
						@click="saveMonthlyEvents"
					>
						{{ saving ? 'Saving…' : 'Save themes' }}
					</button>
				</div>
			</div>
		</Teleport>
	</section>
</template>

<style scoped>
.monthly-themes {
	display: flex;
	flex-direction: column;
	gap: 1.1rem;
}

.hero {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 1rem;
	padding: 1.15rem 1.25rem;
	align-items: flex-start;
}

.hero h2 {
	margin: 0 0 0.35rem;
	font-family: var(--font-display);
	font-size: 1.35rem;
}

.section-desc {
	margin: 0;
	color: var(--realm-text-muted);
	font-size: 0.92rem;
	line-height: 1.45;
	max-width: 40rem;
}

.live-hint {
	margin: 0.65rem 0 0;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--realm-accent);
}

.panel {
	padding: 1.15rem 1.25rem;
}

.setting-toggle {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	font-weight: 600;
}

.hint {
	margin: 0.45rem 0 0;
	color: var(--realm-text-muted);
	font-size: 0.85rem;
	line-height: 1.4;
}

.btn-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	align-items: center;
}

.monthly-layout {
	display: grid;
	grid-template-columns: minmax(12rem, 16rem) 1fr;
	gap: 1rem;
	align-items: start;
}

.monthly-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
}

.monthly-list-item {
	width: 100%;
	text-align: left;
	padding: 0.55rem 0.7rem;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	cursor: pointer;
}

.monthly-list-item.active {
	border-color: color-mix(in srgb, var(--realm-accent) 50%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 10%, transparent);
}

.monthly-list-title {
	display: block;
	font-weight: 600;
	font-size: 0.9rem;
}

.monthly-list-meta {
	display: block;
	margin-top: 0.15rem;
	font-size: 0.72rem;
	color: var(--realm-text-muted);
}

.monthly-editor {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.monthly-editor label {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	font-size: 0.85rem;
	font-weight: 600;
}

.monthly-editor input,
.monthly-editor textarea,
.monthly-editor select {
	font-weight: 400;
}

.field-row {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
	gap: 0.65rem;
}

.mono {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.8rem;
}

@media (max-width: 800px) {
	.monthly-layout {
		grid-template-columns: 1fr;
	}
}
</style>
