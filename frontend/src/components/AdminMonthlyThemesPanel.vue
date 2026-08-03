<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
	api,
	type AdminSiteSettings,
	type MonthlyEventSlot,
	type MonthlyReaderOfMonthPublic,
} from '../lib/api'
import { apiUrl } from '../lib/apiBase'
import { useConfig } from '../composables/useConfig'
import { useMonthlyThemePreview } from '../composables/useMonthlyThemePreview'
import {
	COLOR_PRESETS,
	COLOR_PRESETS_LIGHT,
	CURATED_COPY_FIELDS,
	DISCORD_CAPTION_HINT,
	EVENT_TEXT_FIELDS,
	MULTIPLIER_PRESETS,
	THEME_COLOR_KEYS,
	THEME_COLOR_LABELS,
	applyColorPreset,
	clearThemeColors,
	cloneThemeSlot,
	emptyDiscordTemplates,
	emptyReaderOfMonth,
	getOverrideString,
	getThemeColors,
	loreToText,
	overrideToJson,
	parseOverrideJson,
	setOverrideString,
	setThemeColor,
	textToLore,
	type ColorPreset,
	type ThemeColorKey,
	type ThemePaletteKind,
} from '../lib/monthlyThemeEditor'

const emit = defineEmits<{ message: [text: string, isError?: boolean] }>()

const { loadConfig, config } = useConfig()
const { fetchPreviewConfig, setPreviewSlot } = useMonthlyThemePreview()
const router = useRouter()

type EditorTab =
	| 'basics'
	| 'look'
	| 'event'
	| 'copy'
	| 'prompts'
	| 'discord'
	| 'photo'
	| 'reader'
	| 'advanced'
type PromptRow = {
	id: string
	promptId: string
	label: string
	kind: string
	gameName: string
}

const loaded = ref(false)
const saving = ref(false)
const autoSaving = ref('')
const monthlyEvents = ref<MonthlyEventSlot[]>([])
const selectedEventId = ref<string | null>(null)
const siteOverrideJson = ref('{}')
const advancedOpen = ref(false)
const editorTab = ref<EditorTab>('basics')
const lookPalette = ref<ThemePaletteKind>('dark')
const timezoneDefault = ref('Europe/Amsterdam')
const savedSnapshot = ref('')
const baseThemeColors = ref<Partial<Record<ThemeColorKey, string>>>({})
const allPrompts = ref<PromptRow[]>([])
const previewBusy = ref(false)
const photoUploading = ref(false)
const readerPreview = ref<MonthlyReaderOfMonthPublic | null>(null)
const readerPreviewBusy = ref(false)
const adminUsers = ref<{ id: string; displayName: string }[]>([])
const discordAddText = ref('')
const discordSabotageText = ref('')

const selectedEvent = computed(
	() => monthlyEvents.value.find((e) => e.id === selectedEventId.value) ?? null,
)

const lookPresets = computed(() =>
	lookPalette.value === 'light' ? COLOR_PRESETS_LIGHT : COLOR_PRESETS,
)

const themeColors = computed(() =>
	selectedEvent.value
		? getThemeColors(selectedEvent.value.siteOverride, lookPalette.value)
		: {},
)

const loreText = computed({
	get() {
		if (!selectedEvent.value) return ''
		return loreToText(selectedEvent.value.siteOverride.event?.lore)
	},
	set(v: string) {
		if (!selectedEvent.value) return
		const lore = textToLore(v)
		const event = { ...(selectedEvent.value.siteOverride.event ?? {}) }
		if (lore.length === 0) delete event.lore
		else event.lore = lore
		const next = { ...selectedEvent.value.siteOverride }
		if (Object.keys(event).length === 0) delete next.event
		else next.event = event
		selectedEvent.value.siteOverride = next
		syncJsonFromOverride()
	},
})

function eventsSnapshot(): string {
	return JSON.stringify(monthlyEvents.value)
}

const dirty = computed(() => {
	if (!loaded.value || !savedSnapshot.value) return false
	return eventsSnapshot() !== savedSnapshot.value
})

function markClean() {
	savedSnapshot.value = eventsSnapshot()
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
		imageUrl: '',
		discordTemplates: emptyDiscordTemplates(),
		readerOfMonth: emptyReaderOfMonth(),
	}
}

function syncDiscordTextsFromEvent() {
	const ev = selectedEvent.value
	if (!ev) {
		discordAddText.value = ''
		discordSabotageText.value = ''
		return
	}
	if (!ev.discordTemplates) ev.discordTemplates = emptyDiscordTemplates()
	if (!ev.readerOfMonth) ev.readerOfMonth = emptyReaderOfMonth()
	if (ev.imageUrl == null) ev.imageUrl = ''
	discordAddText.value = (ev.discordTemplates.add ?? []).join('\n')
	discordSabotageText.value = (ev.discordTemplates.sabotage ?? []).join('\n')
}

function flushDiscordTexts() {
	const ev = selectedEvent.value
	if (!ev) return
	if (!ev.discordTemplates) ev.discordTemplates = emptyDiscordTemplates()
	ev.discordTemplates.add = discordAddText.value
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
	ev.discordTemplates.sabotage = discordSabotageText.value
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}

function syncJsonFromOverride() {
	const ev = selectedEvent.value
	if (!ev) {
		siteOverrideJson.value = '{}'
		return
	}
	siteOverrideJson.value = overrideToJson(ev.siteOverride)
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
		imageUrl: e.imageUrl ?? '',
		discordTemplates: {
			...emptyDiscordTemplates(),
			...(e.discordTemplates ?? {}),
			add: [...(e.discordTemplates?.add ?? [])],
			sabotage: [...(e.discordTemplates?.sabotage ?? [])],
		},
		readerOfMonth: {
			...emptyReaderOfMonth(),
			...(e.readerOfMonth ?? {}),
		},
	}))
	if (
		!selectedEventId.value ||
		!monthlyEvents.value.some((e) => e.id === selectedEventId.value)
	) {
		selectedEventId.value = monthlyEvents.value[0]?.id ?? null
	}
	syncJsonFromOverride()
	syncDiscordTextsFromEvent()
	markClean()
}

async function loadSettings() {
	const { settings } = await api<{ settings: AdminSiteSettings }>('/admin/settings')
	applySettings(settings)
	loaded.value = true
}

async function loadPrompts() {
	try {
		const data = await api<{
			prompts: {
				id: string
				promptId: string
				label: string
				kind: string
				gameName: string
				isLive?: boolean
			}[]
		}>('/admin/prompts')
		const rows = (data.prompts ?? [])
			.filter((p) => p.isLive === true)
			.map((p) => ({
				id: p.id,
				promptId: p.promptId || p.id,
				label: p.label,
				kind: p.kind,
				gameName: p.gameName,
			}))
		if (rows.length > 0) {
			allPrompts.value = rows
			return
		}
	} catch {
		/* fall through to config */
	}
	const cfg = config.value
	if (!cfg) {
		allPrompts.value = []
		return
	}
	allPrompts.value = [
		...cfg.prompts.positive.map((p) => ({
			id: p.id,
			promptId: p.id,
			label: p.label,
			kind: 'positive',
			gameName: p.gameName,
		})),
		...cfg.prompts.negative.map((p) => ({
			id: p.id,
			promptId: p.id,
			label: p.label,
			kind: 'negative',
			gameName: p.gameName,
		})),
	]
}

function seedBaseColorsFromConfig() {
	const theme = config.value?.branding?.theme
	if (!theme) return
	const out: Partial<Record<ThemeColorKey, string>> = {}
	for (const key of THEME_COLOR_KEYS) {
		const v = theme[key]
		if (typeof v === 'string' && v.trim()) out[key] = v.trim()
	}
	baseThemeColors.value = out
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

async function loadAdminUsers() {
	try {
		const data = await api<{ users: { id: string; displayName: string }[] }>(
			'/admin/users',
		)
		adminUsers.value = (data.users ?? []).map((u) => ({
			id: u.id,
			displayName: u.displayName,
		}))
	} catch {
		adminUsers.value = []
	}
}

onMounted(async () => {
	try {
		await Promise.all([
			loadConfig(),
			loadSettings(),
			loadPrompts(),
			loadAdminUsers(),
		])
		seedBaseColorsFromConfig()
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to load monthly themes',
			true,
		)
	}
})

watch(selectedEventId, () => {
	syncJsonFromOverride()
	syncDiscordTextsFromEvent()
	readerPreview.value = null
	editorTab.value = 'basics'
})

watch([discordAddText, discordSabotageText], () => {
	flushDiscordTexts()
})

function selectMonthlyEvent(id: string) {
	flushDiscordTexts()
	selectedEventId.value = id
	syncJsonFromOverride()
	syncDiscordTextsFromEvent()
}

function addMonthlyEvent() {
	const slot = emptyMonthlySlot()
	monthlyEvents.value = [...monthlyEvents.value, slot]
	selectedEventId.value = slot.id
	syncJsonFromOverride()
}

function duplicateSelected() {
	if (!selectedEvent.value) return
	const clone = cloneThemeSlot(selectedEvent.value)
	monthlyEvents.value = [...monthlyEvents.value, clone]
	selectedEventId.value = clone.id
	syncJsonFromOverride()
	emit('message', 'Theme duplicated as a draft.')
}

function removeSelectedMonthlyEvent() {
	if (!selectedEventId.value) return
	if (!confirm('Delete this monthly theme slot?')) return
	monthlyEvents.value = monthlyEvents.value.filter(
		(e) => e.id !== selectedEventId.value,
	)
	selectedEventId.value = monthlyEvents.value[0]?.id ?? null
	syncJsonFromOverride()
}

async function saveMonthlyEvents() {
	if (advancedOpen.value) applyAdvancedJson()
	flushDiscordTexts()
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

async function onPhotoFile(event: Event) {
	const ev = selectedEvent.value
	if (!ev) return
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	photoUploading.value = true
	try {
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(String(reader.result ?? ''))
			reader.onerror = () => reject(new Error('Failed to read image'))
			reader.readAsDataURL(file)
		})
		const result = await api<{ coverUrl: string }>('/covers/upload', {
			method: 'POST',
			body: JSON.stringify({ dataUrl }),
		})
		ev.imageUrl = result.coverUrl
		emit('message', 'Month photo uploaded — save themes to keep it.')
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to upload photo',
			true,
		)
	} finally {
		photoUploading.value = false
		input.value = ''
	}
}

function clearMonthPhoto() {
	if (!selectedEvent.value) return
	selectedEvent.value.imageUrl = ''
}

const readerPreviewEmpty = ref(false)

async function refreshReaderPreview() {
	const ev = selectedEvent.value
	if (!ev) return
	readerPreviewBusy.value = true
	readerPreviewEmpty.value = false
	try {
		const data = await api<{ reader: MonthlyReaderOfMonthPublic | null }>(
			'/admin/monthly-themes/resolve-reader',
			{
				method: 'POST',
				body: JSON.stringify({
					from: ev.from,
					to: ev.to,
					userId: ev.readerOfMonth?.userId ?? '',
					shoutout: ev.readerOfMonth?.shoutout ?? '',
				}),
			},
		)
		readerPreview.value = data.reader
		readerPreviewEmpty.value = !data.reader
		if (!data.reader) {
			emit(
				'message',
				'No readers found yet (no book logs in the database).',
				true,
			)
		}
	} catch (e) {
		readerPreview.value = null
		readerPreviewEmpty.value = true
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to resolve reader',
			true,
		)
	} finally {
		readerPreviewBusy.value = false
	}
}


function applyMultiplierPreset(id: string) {
	const preset = MULTIPLIER_PRESETS.find((p) => p.id === id)
	if (!preset || !selectedEvent.value) return
	selectedEvent.value.multipliers = { ...preset.multipliers }
}

function eventField(key: string): string {
	if (!selectedEvent.value) return ''
	if (key === 'lore') return loreText.value
	return getOverrideString(selectedEvent.value.siteOverride, 'event', key)
}

function setEventField(key: string, value: string) {
	if (!selectedEvent.value) return
	if (key === 'lore') {
		loreText.value = value
		return
	}
	selectedEvent.value.siteOverride = setOverrideString(
		selectedEvent.value.siteOverride,
		'event',
		key,
		value,
	)
	syncJsonFromOverride()
}

function copyField(key: string): string {
	if (!selectedEvent.value) return ''
	return getOverrideString(selectedEvent.value.siteOverride, 'copy', key)
}

function setCopyField(key: string, value: string) {
	if (!selectedEvent.value) return
	selectedEvent.value.siteOverride = setOverrideString(
		selectedEvent.value.siteOverride,
		'copy',
		key,
		value,
	)
	syncJsonFromOverride()
}

function colorValue(key: ThemeColorKey): string {
	return themeColors.value[key] || baseThemeColors.value[key] || '#888888'
}

function onColorPick(key: ThemeColorKey, event: Event) {
	if (!selectedEvent.value) return
	const value = (event.target as HTMLInputElement).value
	selectedEvent.value.siteOverride = setThemeColor(
		selectedEvent.value.siteOverride,
		key,
		value,
		lookPalette.value,
	)
	syncJsonFromOverride()
}

function clearColor(key: ThemeColorKey) {
	if (!selectedEvent.value) return
	selectedEvent.value.siteOverride = setThemeColor(
		selectedEvent.value.siteOverride,
		key,
		'',
		lookPalette.value,
	)
	syncJsonFromOverride()
}

function resetAllColors() {
	if (!selectedEvent.value) return
	selectedEvent.value.siteOverride = clearThemeColors(
		selectedEvent.value.siteOverride,
		lookPalette.value,
	)
	syncJsonFromOverride()
}

function applyLookPreset(preset: ColorPreset) {
	if (!selectedEvent.value) return
	selectedEvent.value.siteOverride = applyColorPreset(
		selectedEvent.value.siteOverride,
		preset,
		lookPalette.value,
	)
	syncJsonFromOverride()
}

function isFeatured(promptId: string): boolean {
	return selectedEvent.value?.featuredPromptIds.includes(promptId) ?? false
}

function toggleFeatured(promptId: string) {
	if (!selectedEvent.value) return
	const set = new Set(selectedEvent.value.featuredPromptIds)
	if (set.has(promptId)) set.delete(promptId)
	else set.add(promptId)
	selectedEvent.value.featuredPromptIds = [...set]
}

function applyAdvancedJson() {
	if (!selectedEvent.value) return
	const parsed = parseOverrideJson(siteOverrideJson.value)
	if (!parsed) {
		emit('message', 'Advanced JSON is invalid — fix it or discard.', true)
		return
	}
	selectedEvent.value.siteOverride = parsed
	syncJsonFromOverride()
}

function onAdvancedBlur() {
	applyAdvancedJson()
}

function currentSlotForPreview(): MonthlyEventSlot | null {
	if (!selectedEvent.value) return null
	if (advancedOpen.value) applyAdvancedJson()
	flushDiscordTexts()
	return JSON.parse(JSON.stringify(selectedEvent.value)) as MonthlyEventSlot
}

async function openSitePreview() {
	const slot = currentSlotForPreview()
	if (!slot) return
	previewBusy.value = true
	try {
		await fetchPreviewConfig(slot)
		setPreviewSlot(slot)
		await loadConfig(true)
		await router.push('/')
		emit('message', 'Site preview on — use the bar at the top to exit.')
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to start site preview',
			true,
		)
	} finally {
		previewBusy.value = false
	}
}

const tabs: { id: EditorTab; label: string }[] = [
	{ id: 'basics', label: 'Basics' },
	{ id: 'look', label: 'Look' },
	{ id: 'event', label: 'Event text' },
	{ id: 'copy', label: 'Site copy' },
	{ id: 'prompts', label: 'Prompts' },
	{ id: 'discord', label: 'Discord' },
	{ id: 'photo', label: 'Photo' },
	{ id: 'reader', label: 'Reader' },
	{ id: 'advanced', label: 'Advanced' },
]
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
						<div class="editor-toolbar">
							<div class="editor-tabs" role="tablist">
								<button
									v-for="t in tabs"
									:key="t.id"
									type="button"
									role="tab"
									class="editor-tab"
									:class="{ active: editorTab === t.id }"
									:aria-selected="editorTab === t.id"
									@click="
										editorTab = t.id;
										advancedOpen = t.id === 'advanced';
									"
								>
									{{ t.label }}
								</button>
							</div>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="previewBusy"
								title="Browse the real site as this theme"
								@click="openSitePreview"
							>
								{{ previewBusy ? 'Loading…' : 'Preview on site' }}
							</button>
						</div>

						<!-- Basics -->
						<div v-show="editorTab === 'basics'" class="tab-panel">
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
							<div class="preset-row">
								<span class="preset-label">Multiplier presets</span>
								<button
									v-for="p in MULTIPLIER_PRESETS"
									:key="p.id"
									type="button"
									class="btn btn-ghost btn-sm"
									@click="applyMultiplierPreset(p.id)"
								>
									{{ p.label }}
								</button>
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
						</div>

						<!-- Look -->
						<div v-show="editorTab === 'look'" class="tab-panel">
							<p class="hint">
								Define a dark and light pair. Readers who opt in (default) switch
								between them with the site light/dark toggle. Discord standings
								images use the dark palette. Reset clears the selected side only.
							</p>
							<div class="look-palette-row" role="radiogroup" aria-label="Palette side">
								<button
									type="button"
									class="theme-mode-btn"
									:class="{ selected: lookPalette === 'dark' }"
									:aria-pressed="lookPalette === 'dark'"
									@click="lookPalette = 'dark'"
								>
									Dark
								</button>
								<button
									type="button"
									class="theme-mode-btn"
									:class="{ selected: lookPalette === 'light' }"
									:aria-pressed="lookPalette === 'light'"
									@click="lookPalette = 'light'"
								>
									Light
								</button>
							</div>
							<div class="color-preset-grid" role="list">
								<button
									v-for="preset in lookPresets"
									:key="`${lookPalette}-${preset.id}`"
									type="button"
									class="color-preset-card"
									role="listitem"
									@click="applyLookPreset(preset)"
								>
									<span class="color-preset-swatches" aria-hidden="true">
										<span
											v-for="key in (
												[
													'background',
													'surface',
													'accent',
													'accentGlow',
												] as ThemeColorKey[]
											)"
											:key="key"
											class="color-preset-dot"
											:style="{ background: preset.colors[key] }"
										/>
									</span>
									<span class="color-preset-label">{{ preset.label }}</span>
									<span class="color-preset-hint">{{ preset.hint }}</span>
								</button>
							</div>
							<div class="swatch-strip" aria-hidden="true">
								<span
									v-for="key in THEME_COLOR_KEYS"
									:key="key"
									class="swatch"
									:style="{ background: colorValue(key) }"
									:title="THEME_COLOR_LABELS[key]"
								/>
							</div>
							<div class="color-grid">
								<label
									v-for="key in THEME_COLOR_KEYS"
									:key="key"
									class="color-field"
								>
									<span>{{ THEME_COLOR_LABELS[key] }}</span>
									<div class="color-inputs">
										<input
											type="color"
											:value="colorValue(key)"
											@input="onColorPick(key, $event)"
										/>
										<button
											type="button"
											class="btn btn-ghost btn-sm"
											:disabled="!themeColors[key]"
											@click="clearColor(key)"
										>
											Clear
										</button>
									</div>
								</label>
							</div>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								@click="resetAllColors"
							>
								Reset all colors
							</button>
						</div>

						<!-- Event text -->
						<div v-show="editorTab === 'event'" class="tab-panel">
							<p class="hint">
								Overrides the hero / lore copy while live. Leave blank to keep the
								base event text.
							</p>
							<label v-for="f in EVENT_TEXT_FIELDS" :key="f.key">
								{{ f.label }}
								<input
									:value="eventField(f.key)"
									type="text"
									@input="
										setEventField(
											f.key,
											($event.target as HTMLInputElement).value,
										)
									"
								/>
							</label>
							<label>
								Lore (paragraphs separated by a blank line)
								<textarea
									v-model="loreText"
									rows="5"
									placeholder="Paragraph one…

Paragraph two…"
								/>
							</label>
						</div>

						<!-- Site copy -->
						<div v-show="editorTab === 'copy'" class="tab-panel">
							<p class="hint">
								Common buttons and page titles. Leave blank to keep the base copy.
								More keys live under Advanced JSON.
							</p>
							<label v-for="f in CURATED_COPY_FIELDS" :key="f.key">
								{{ f.label }}
								<input
									:value="copyField(f.key)"
									type="text"
									@input="
										setCopyField(
											f.key,
											($event.target as HTMLInputElement).value,
										)
									"
								/>
							</label>
						</div>

						<!-- Prompts -->
						<div v-show="editorTab === 'prompts'" class="tab-panel">
							<p class="hint">
								Featured prompts are highlighted while this theme is live.
							</p>
							<p v-if="allPrompts.length === 0" class="hint">
								No prompts loaded (or still on JSON fallback).
							</p>
							<ul v-else class="prompt-check-list">
								<li v-for="p in allPrompts" :key="p.promptId">
									<label class="prompt-check">
										<input
											type="checkbox"
											:checked="isFeatured(p.promptId)"
											@change="toggleFeatured(p.promptId)"
										/>
										<span>
											<strong>{{ p.label }}</strong>
											<span class="prompt-meta"
												>{{ p.kind }} · {{ p.gameName || p.promptId }}</span
											>
										</span>
									</label>
								</li>
							</ul>
						</div>

						<!-- Discord -->
						<div v-show="editorTab === 'discord'" class="tab-panel">
							<p class="hint">
								While this theme is live, non-empty fields replace the global Discord
								copy. Leave blank to keep Settings defaults.
							</p>
							<label>
								Realm chat — add (one template per line)
								<textarea
									v-model="discordAddText"
									rows="4"
									placeholder="{{displayName}} finished {{bookTitle}}…"
								/>
							</label>
							<label>
								Realm chat — sabotage (one template per line)
								<textarea
									v-model="discordSabotageText"
									rows="4"
									placeholder="{{displayName}} hit {{targetTeamName}}…"
								/>
							</label>
							<p class="hint">{{ DISCORD_CAPTION_HINT }}</p>
							<label>
								Standings caption
								<textarea
									v-model="selectedEvent.discordTemplates.standings"
									rows="2"
									placeholder="{{mention}}**{{weekLabel}} standings are live!**"
								/>
							</label>
							<label>
								Breakdown caption
								<textarea
									v-model="selectedEvent.discordTemplates.breakdown"
									rows="2"
								/>
							</label>
							<label>
								Vibes caption
								<textarea
									v-model="selectedEvent.discordTemplates.vibes"
									rows="2"
								/>
							</label>
							<label>
								4-week wrap caption
								<textarea
									v-model="selectedEvent.discordTemplates.wrap"
									rows="3"
									placeholder="**{{eventName}} wrap** — {{wrapRange}}"
								/>
							</label>
						</div>

						<!-- Photo -->
						<div v-show="editorTab === 'photo'" class="tab-panel">
							<p class="hint">
								Optional photo of the month on the home theme banner. No image =
								banner stays text-only like today.
							</p>
							<div v-if="selectedEvent.imageUrl" class="month-photo-preview">
								<img
									:src="
										/^https?:\/\//i.test(selectedEvent.imageUrl)
											? selectedEvent.imageUrl
											: apiUrl(selectedEvent.imageUrl)
									"
									alt="Month photo preview"
								/>
							</div>
							<div class="btn-row">
								<label class="btn btn-secondary btn-sm file-btn">
									{{ photoUploading ? 'Uploading…' : 'Upload photo' }}
									<input
										type="file"
										accept="image/jpeg,image/png,image/webp"
										hidden
										:disabled="photoUploading"
										@change="onPhotoFile"
									/>
								</label>
								<button
									v-if="selectedEvent.imageUrl"
									type="button"
									class="btn btn-ghost btn-sm"
									@click="clearMonthPhoto"
								>
									Remove photo
								</button>
							</div>
							<label>
								Or paste image URL / path
								<input
									v-model="selectedEvent.imageUrl"
									type="text"
									placeholder="/covers/files/… or https://…"
								/>
							</label>
						</div>

						<!-- Reader of the month -->
						<div v-show="editorTab === 'reader'" class="tab-panel">
							<p class="hint">
								Defaults to the top reader (most books) in this theme’s date range.
								Pick someone manually to override.
							</p>
							<label>
								Manual override
								<select v-model="selectedEvent.readerOfMonth.userId">
									<option value="">Auto (top reader in range)</option>
									<option
										v-for="u in adminUsers"
										:key="u.id"
										:value="u.id"
									>
										{{ u.displayName }}
									</option>
								</select>
							</label>
							<label>
								Shoutout (optional)
								<textarea
									v-model="selectedEvent.readerOfMonth.shoutout"
									rows="2"
									maxlength="400"
									placeholder="Short praise shown under their name…"
								/>
							</label>
							<div class="btn-row">
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									:disabled="readerPreviewBusy"
									@click="refreshReaderPreview"
								>
									{{ readerPreviewBusy ? 'Resolving…' : 'Preview reader' }}
								</button>
							</div>
							<div v-if="readerPreview" class="reader-preview-card">
								<p>
									<strong>{{ readerPreview.displayName }}</strong>
									<span v-if="readerPreview.teamName">
										· {{ readerPreview.teamName }}</span
									>
								</p>
								<p class="hint">
									<template v-if="readerPreview.source === 'override'"
										>Manual override</template
									>
									<template v-else-if="readerPreview.source === 'allTime'">
										Auto (all-time — no books in this theme’s dates yet)
									</template>
									<template v-else>Auto (in theme date range)</template>
									<span v-if="readerPreview.books">
										· {{ readerPreview.books }} books ·
										{{ readerPreview.points }} pts</span
									>
								</p>
								<p v-if="readerPreview.shoutout">{{ readerPreview.shoutout }}</p>
							</div>
							<p v-else-if="readerPreviewEmpty" class="hint">
								No reader to show — log some books first, or pick someone in Manual
								override.
							</p>
						</div>

						<!-- Advanced -->
						<div v-show="editorTab === 'advanced'" class="tab-panel">
							<label>
								Site overhaul JSON
								<span class="hint">
									Power-user escape hatch. Edits sync into the form tabs when valid.
								</span>
								<textarea
									v-model="siteOverrideJson"
									rows="12"
									spellcheck="false"
									class="mono"
									@blur="onAdvancedBlur"
								/>
							</label>
						</div>

						<div class="btn-row editor-actions">
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								@click="duplicateSelected"
							>
								Duplicate theme
							</button>
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

.hint {
	margin: 0;
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
	gap: 0.85rem;
	min-width: 0;
}

.editor-toolbar {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 0.65rem;
	align-items: flex-start;
}

.editor-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 0.3rem;
}

.editor-tab {
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	border-radius: 999px;
	padding: 0.3rem 0.7rem;
	font-size: 0.78rem;
	font-weight: 600;
	cursor: pointer;
}

.editor-tab.active {
	color: var(--realm-text);
	border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 12%, transparent);
}

.tab-panel {
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

.preset-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	align-items: center;
}

.preset-label {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--realm-text-muted);
	margin-right: 0.25rem;
}

.look-palette-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	margin-bottom: 0.75rem;
}

.look-palette-row .theme-mode-btn {
	padding: 0.35rem 0.85rem;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
}

.look-palette-row .theme-mode-btn.selected {
	border-color: color-mix(in srgb, var(--realm-accent) 55%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 14%, transparent);
	color: var(--realm-text);
}

.color-preset-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
	gap: 0.5rem;
}

.color-preset-card {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.2rem;
	padding: 0.55rem 0.65rem;
	border-radius: 10px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	cursor: pointer;
	text-align: left;
}

.color-preset-card:hover {
	border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 8%, transparent);
}

.color-preset-swatches {
	display: flex;
	gap: 0.25rem;
	margin-bottom: 0.2rem;
}

.color-preset-dot {
	width: 1.1rem;
	height: 1.1rem;
	border-radius: 4px;
	border: 1px solid var(--realm-border);
}

.color-preset-label {
	font-size: 0.82rem;
	font-weight: 700;
}

.color-preset-hint {
	font-size: 0.7rem;
	font-weight: 400;
	color: var(--realm-text-muted);
}

.swatch-strip {
	display: flex;
	gap: 0.35rem;
	flex-wrap: wrap;
}

.swatch {
	width: 1.6rem;
	height: 1.6rem;
	border-radius: 6px;
	border: 1px solid var(--realm-border);
}

.color-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	gap: 0.65rem;
}

.color-field .color-inputs {
	display: flex;
	align-items: center;
	gap: 0.4rem;
}

.color-field input[type='color'] {
	width: 3rem;
	height: 2rem;
	padding: 0;
	border: 1px solid var(--realm-border);
	border-radius: 6px;
	background: transparent;
	cursor: pointer;
}

.prompt-check-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	max-height: 22rem;
	overflow: auto;
}

.prompt-check {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	gap: 0.55rem;
	font-weight: 400;
	padding: 0.4rem 0.5rem;
	border-radius: 8px;
	border: 1px solid transparent;
}

.prompt-check:hover {
	border-color: var(--realm-border);
	background: color-mix(in srgb, var(--realm-surface) 80%, transparent);
}

.prompt-meta {
	display: block;
	font-size: 0.72rem;
	color: var(--realm-text-muted);
}

.mono {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.8rem;
}

.editor-actions {
	padding-top: 0.35rem;
	border-top: 1px solid var(--realm-border);
}

.month-photo-preview {
	max-width: 20rem;
	border-radius: 10px;
	overflow: hidden;
	border: 1px solid var(--realm-border);
}

.month-photo-preview img {
	display: block;
	width: 100%;
	height: auto;
	max-height: 14rem;
	object-fit: cover;
}

.file-btn {
	cursor: pointer;
}

.reader-preview-card {
	padding: 0.75rem 0.9rem;
	border-radius: 10px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
}

@media (max-width: 800px) {
	.monthly-layout {
		grid-template-columns: 1fr;
	}
}
</style>

<style>
/* Teleported to body — same top bar as Settings (shared class). */
.unsaved-sticky {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: auto;
	z-index: 10000;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.65rem 1rem;
	width: auto;
	max-width: none;
	height: auto;
	max-height: none;
	transform: none;
	padding: 0.7rem 1.1rem;
	border-radius: 0;
	background: #8b1e1e;
	border: 0;
	border-bottom: 2px solid #ff6b6b;
	box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
	color: #fff5f5;
}

.unsaved-sticky-text {
	margin: 0;
	flex: 0 1 auto;
	font-size: 0.92rem;
	font-weight: 700;
	letter-spacing: 0.01em;
	line-height: 1.35;
}

.unsaved-sticky-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	align-items: center;
}

.unsaved-sticky .btn-ghost {
	color: #fff5f5;
	border-color: rgba(255, 245, 245, 0.35);
}

.unsaved-sticky .btn-ghost:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.1);
}

.unsaved-sticky .btn-primary {
	background: #fff5f5;
	color: #6b1212;
	border-color: #fff5f5;
}

.unsaved-sticky .btn-primary:hover:not(:disabled) {
	filter: brightness(0.95);
}
</style>
