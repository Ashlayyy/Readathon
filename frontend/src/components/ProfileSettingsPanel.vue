<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import ThemeSwitcher from './ThemeSwitcher.vue'
import UserAvatar from './UserAvatar.vue'

export type CurrentlyReading = {
	title: string
	author: string
	coverUrl: string | null
	updatedAt: string | null
}

const props = defineProps<{
	open: boolean
	notifyStandings: boolean
	notifyAnswers: boolean
	currentlyReading: CurrentlyReading | null
	avatarUrl?: string | null
	displayName: string
	teamColor?: string | null
}>()

const emit = defineEmits<{
	close: []
	saved: [
		settings: {
			notifyStandings: boolean
			notifyAnswers: boolean
			currentlyReading: CurrentlyReading | null
		},
	]
	'avatar-updated': [avatarUrl: string | null]
}>()

const { config } = useConfig()
const { fetchUser } = useAuth()

const isOpen = computed(() => props.open)
useBodyScrollLock(isOpen)

const notifyStandingsLocal = ref(false)
const notifyAnswersLocal = ref(false)
const crTitle = ref('')
const crAuthor = ref('')
const saving = ref(false)
const avatarBusy = ref(false)
const message = ref('')
const messageIsError = ref(false)
const localAvatarUrl = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

watch(
	() => props.open,
	(open) => {
		if (!open) return
		notifyStandingsLocal.value = props.notifyStandings
		notifyAnswersLocal.value = props.notifyAnswers
		crTitle.value = props.currentlyReading?.title ?? ''
		crAuthor.value = props.currentlyReading?.author ?? ''
		localAvatarUrl.value = props.avatarUrl ?? null
		message.value = ''
		messageIsError.value = false
	},
	{ immediate: true },
)

watch(
	() => props.avatarUrl,
	(url) => {
		localAvatarUrl.value = url ?? null
	},
)

function onKey(e: KeyboardEvent) {
	if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

function pickAvatar() {
	fileInput.value?.click()
}

async function onAvatarFile(e: Event) {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
		message.value = 'Use a JPEG, PNG, or WebP image.'
		messageIsError.value = true
		return
	}
	if (file.size > 2 * 1024 * 1024) {
		message.value = 'Avatar must be 2 MB or smaller.'
		messageIsError.value = true
		return
	}

	avatarBusy.value = true
	message.value = ''
	messageIsError.value = false
	try {
		const dataUrl = await readFileAsDataUrl(file)
		const data = await api<{ avatarUrl: string }>('/profile/avatar', {
			method: 'POST',
			body: JSON.stringify({ dataUrl }),
		})
		localAvatarUrl.value = data.avatarUrl
		emit('avatar-updated', data.avatarUrl)
		await fetchUser(true)
		message.value = 'Profile picture updated.'
	} catch (err) {
		message.value = err instanceof Error ? err.message : 'Failed to upload photo'
		messageIsError.value = true
	} finally {
		avatarBusy.value = false
	}
}

async function clearAvatar() {
	avatarBusy.value = true
	message.value = ''
	messageIsError.value = false
	try {
		const data = await api<{ avatarUrl: string | null }>('/profile/avatar', {
			method: 'DELETE',
		})
		localAvatarUrl.value = data.avatarUrl
		emit('avatar-updated', data.avatarUrl)
		await fetchUser(true)
		message.value = data.avatarUrl
			? 'Custom photo removed — showing your Google photo.'
			: 'Profile picture removed.'
	} catch (err) {
		message.value = err instanceof Error ? err.message : 'Failed to remove photo'
		messageIsError.value = true
	} finally {
		avatarBusy.value = false
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

async function saveSettings() {
	saving.value = true
	message.value = ''
	messageIsError.value = false
	try {
		const { settings } = await api<{
			settings: {
				notifyStandings: boolean
				notifyAnswers: boolean
				currentlyReading: CurrentlyReading | null
			}
		}>('/profile/settings', {
			method: 'PATCH',
			body: JSON.stringify({
				notifyStandings: notifyStandingsLocal.value,
				notifyAnswers: notifyAnswersLocal.value,
				currentlyReading: {
					title: crTitle.value,
					author: crAuthor.value,
					lookupCover: true,
				},
			}),
		})
		emit('saved', settings)
		message.value = 'Settings saved.'
		emit('close')
	} catch (e) {
		message.value = e instanceof Error ? e.message : 'Failed to save'
		messageIsError.value = true
	} finally {
		saving.value = false
	}
}

async function clearCurrentlyReading() {
	saving.value = true
	message.value = ''
	messageIsError.value = false
	try {
		const { settings } = await api<{
			settings: {
				notifyStandings: boolean
				notifyAnswers: boolean
				currentlyReading: CurrentlyReading | null
			}
		}>('/profile/settings', {
			method: 'PATCH',
			body: JSON.stringify({ currentlyReading: { clear: true } }),
		})
		crTitle.value = ''
		crAuthor.value = ''
		emit('saved', {
			notifyStandings: notifyStandingsLocal.value,
			notifyAnswers: notifyAnswersLocal.value,
			currentlyReading: settings.currentlyReading,
		})
		message.value = 'Currently reading cleared.'
	} catch (e) {
		message.value = e instanceof Error ? e.message : 'Failed to clear'
		messageIsError.value = true
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<Teleport to="body">
		<div
			v-if="open"
			class="settings-overlay"
			role="dialog"
			aria-modal="true"
			aria-labelledby="profile-settings-title"
			@click.self="emit('close')"
		>
			<aside class="settings-drawer card">
				<header class="drawer-head">
					<div>
						<h2 id="profile-settings-title">Settings</h2>
						<p class="lead">
							Notifications, profile photo, and appearance.
						</p>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						@click="emit('close')"
					>
						Close
					</button>
				</header>

				<div
					v-if="message"
					class="alert"
					:class="messageIsError ? 'alert-error' : 'alert-success'"
				>
					{{ message }}
				</div>

				<div class="drawer-body">
					<section class="drawer-section">
						<h3>Profile picture</h3>
						<p class="hint">
							JPEG, PNG, or WebP · max 2 MB. Uses your Google photo until you
							upload one.
						</p>
						<div class="avatar-row">
							<UserAvatar
								:name="displayName"
								:avatar-url="localAvatarUrl"
								:color="teamColor"
								size="lg"
								zoomable
							/>
							<div class="avatar-actions">
								<input
									ref="fileInput"
									type="file"
									accept="image/jpeg,image/png,image/webp"
									class="sr-only"
									@change="onAvatarFile"
								/>
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									:disabled="avatarBusy"
									@click="pickAvatar"
								>
									{{ avatarBusy ? 'Uploading…' : 'Upload photo' }}
								</button>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									:disabled="avatarBusy || !localAvatarUrl"
									@click="clearAvatar"
								>
									Remove
								</button>
							</div>
						</div>
					</section>

					<section class="drawer-section">
						<h3>Email notifications</h3>
						<p class="hint">Choose what you’d like to be emailed about.</p>
						<label class="setting-row">
							<input v-model="notifyStandingsLocal" type="checkbox" />
							<div>
								<strong>{{
									config?.copy.profileNotifyStandings ?? 'Standings published'
								}}</strong>
								<span>{{
									config?.copy.profileNotifyStandingsHint ??
									'Email when admins publish new weekly standings.'
								}}</span>
							</div>
						</label>
						<label class="setting-row">
							<input v-model="notifyAnswersLocal" type="checkbox" />
							<div>
								<strong>{{
									config?.copy.profileNotifyAnswers ?? 'Question answered'
								}}</strong>
								<span>{{
									config?.copy.profileNotifyAnswersHint ??
									'Email when an admin replies to a question you asked.'
								}}</span>
							</div>
						</label>
					</section>

					<section class="drawer-section">
						<h3>{{
							config?.copy.readerCurrentlyReadingTitle ?? 'Currently reading'
						}}</h3>
						<p class="hint">
							{{
								config?.copy.profileCurrentlyReadingLead ??
								'Optional — shown on your public reader page. Covers come from Open Library.'
							}}
						</p>
						<div class="cr-fields">
							<label class="field">
								<span>Title</span>
								<input
									v-model="crTitle"
									type="text"
									maxlength="200"
									autocomplete="off"
								/>
							</label>
							<label class="field">
								<span>Author</span>
								<input
									v-model="crAuthor"
									type="text"
									maxlength="200"
									autocomplete="off"
								/>
							</label>
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-sm clear-cr"
							:disabled="saving || (!crTitle && !currentlyReading)"
							@click="clearCurrentlyReading"
						>
							Clear currently reading
						</button>
					</section>

					<section class="drawer-section">
						<h3>{{ config?.copy.profileThemeTitle ?? 'Appearance' }}</h3>
						<p class="hint">
							{{
								config?.copy.profileThemeLead ??
								'Presets or a custom palette for this device.'
							}}
						</p>
						<ThemeSwitcher />
					</section>
				</div>

				<footer class="drawer-foot">
					<button
						type="button"
						class="btn btn-primary"
						:disabled="saving"
						@click="saveSettings"
					>
						{{
							saving
								? (config?.copy.profileSaving ?? 'Saving…')
								: (config?.copy.profileSaveSettings ?? 'Save settings')
						}}
					</button>
				</footer>
			</aside>
		</div>
	</Teleport>
</template>

<style scoped>
.settings-overlay {
	position: fixed;
	inset: 0;
	/* Above site header / mobile nav (App.vue uses up to ~500) */
	z-index: 600;
	background: color-mix(in srgb, #000 55%, transparent);
	display: flex;
	justify-content: flex-end;
	padding: 0;
	/* Keep iOS from rubber-banding the page behind the sheet */
	overscroll-behavior: none;
	touch-action: none;
}

.settings-drawer {
	width: min(26rem, 100%);
	height: 100%;
	max-height: 100dvh;
	max-height: 100svh;
	display: flex;
	flex-direction: column;
	border-radius: 0;
	border-left: 1px solid var(--realm-border);
	/* Beat global .card padding */
	padding: 0 !important;
	background: var(--realm-surface);
	box-shadow: -12px 0 40px color-mix(in srgb, #000 35%, transparent);
	overflow: hidden;
	touch-action: auto;
	overscroll-behavior: contain;
}

.drawer-head {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	align-items: flex-start;
	padding: calc(0.85rem + var(--safe-top, 0px)) 1.25rem 1rem;
	border-bottom: 1px solid var(--realm-border);
	flex-shrink: 0;
	background: var(--realm-surface);
}

.drawer-head h2 {
	margin: 0 0 0.3rem;
	font-family: var(--font-display);
	font-size: 1.25rem;
	line-height: 1.2;
}

.lead {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.4;
	color: var(--realm-text-muted);
}

.alert {
	margin: 0.85rem 1.25rem 0;
	flex-shrink: 0;
}

.drawer-body {
	flex: 1;
	min-height: 0;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	-webkit-overflow-scrolling: touch;
	padding: 0.25rem 1.25rem 1.25rem;
	touch-action: pan-y;
}

.drawer-section {
	padding: 1.15rem 0;
	border-bottom: 1px solid var(--realm-border);
}

.drawer-section:last-child {
	border-bottom: none;
	padding-bottom: 0.35rem;
}

.drawer-section h3 {
	margin: 0 0 0.3rem;
	font-family: var(--font-display);
	font-size: 0.95rem;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--realm-accent-glow);
}

.hint {
	margin: 0 0 0.85rem;
	font-size: 0.84rem;
	line-height: 1.4;
	color: var(--realm-text-muted);
}

.avatar-row {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.avatar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
}

.setting-row {
	display: flex;
	gap: 0.75rem;
	align-items: flex-start;
	margin: 0 0 0.75rem;
	cursor: pointer;
}

.setting-row:last-child {
	margin-bottom: 0;
}

.setting-row input {
	margin-top: 0.25rem;
	flex-shrink: 0;
}

.setting-row strong {
	display: block;
	color: var(--realm-text);
	font-size: 0.92rem;
	line-height: 1.3;
}

.setting-row span {
	display: block;
	margin-top: 0.15rem;
	font-size: 0.8rem;
	line-height: 1.35;
	color: var(--realm-text-muted);
}

.cr-fields {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	margin: 0;
	font-size: 0.82rem;
	color: var(--realm-text-muted);
}

.field input {
	display: block;
	width: 100%;
	min-height: 2.75rem;
	padding: 0.7rem 0.85rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-size: 0.95rem;
}

.field input:focus {
	outline: 2px solid color-mix(in srgb, var(--realm-accent) 55%, transparent);
	outline-offset: 1px;
}

.clear-cr {
	margin-top: 0.75rem;
}

.drawer-foot {
	flex-shrink: 0;
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	padding: 0.9rem 1.25rem calc(0.9rem + var(--safe-bottom, 0px));
	border-top: 1px solid var(--realm-border);
	background: color-mix(in srgb, var(--realm-surface) 92%, var(--realm-bg));
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

@media (max-width: 560px) {
	.settings-overlay {
		justify-content: stretch;
	}

	.settings-drawer {
		width: 100%;
		border-left: none;
		/* Full-screen sheet so header + Close stay reachable */
		height: 100%;
		max-height: 100dvh;
		max-height: 100svh;
	}

	.drawer-head {
		/* Keep Close above the fold / clear of notches */
		position: sticky;
		top: 0;
		z-index: 2;
		align-items: center;
		padding-top: calc(0.75rem + var(--safe-top, 0px));
		padding-bottom: 0.85rem;
	}

	.drawer-head .btn {
		min-height: 2.5rem;
		min-width: 4.5rem;
		flex-shrink: 0;
	}

	.lead {
		font-size: 0.82rem;
	}
}
</style>
