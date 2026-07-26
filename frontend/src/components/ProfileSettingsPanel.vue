<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '../lib/api'
import { useAuth } from '../composables/useAuth'
import { useConfig } from '../composables/useConfig'
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
						<h2 id="profile-settings-title">
							{{ config?.copy.profileSettingsTitle ?? 'Settings' }}
						</h2>
						<p class="section-desc">
							{{ config?.copy.profileSettingsLead ?? 'Your account preferences.' }}
						</p>
					</div>
					<button type="button" class="btn btn-ghost btn-sm icon-close" @click="emit('close')">
						Close
					</button>
				</header>

				<div v-if="message" class="alert" :class="messageIsError ? 'alert-error' : 'alert-success'">
					{{ message }}
				</div>

				<section class="drawer-section avatar-section">
					<h3>Profile picture</h3>
					<p class="section-desc">
						JPEG, PNG, or WebP · max 2 MB. Google photo is used until you upload your own.
						Remove clears a custom upload (back to Google) or clears the Google photo if that’s all you have.
					</p>
					<div class="avatar-row">
						<UserAvatar
							:name="displayName"
							:avatar-url="localAvatarUrl"
							:color="teamColor"
							size="lg"
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
					<label class="setting-row">
						<input v-model="notifyStandingsLocal" type="checkbox" />
						<div>
							<strong>{{ config?.copy.profileNotifyStandings ?? 'Standings emails' }}</strong>
							<span>{{
								config?.copy.profileNotifyStandingsHint ?? 'When new standings are published.'
							}}</span>
						</div>
					</label>

					<label class="setting-row">
						<input v-model="notifyAnswersLocal" type="checkbox" />
						<div>
							<strong>{{ config?.copy.profileNotifyAnswers ?? 'Answer emails' }}</strong>
							<span>{{
								config?.copy.profileNotifyAnswersHint ?? 'When an admin replies to your question.'
							}}</span>
						</div>
					</label>
				</section>

				<section class="drawer-section">
					<h3>{{ config?.copy.readerCurrentlyReadingTitle ?? 'Currently reading' }}</h3>
					<p class="section-desc">
						{{
							config?.copy.profileCurrentlyReadingLead ??
							'Optional — shows on your public page. Not scored.'
						}}
					</p>
					<label class="field">
						Title
						<input v-model="crTitle" type="text" maxlength="200" autocomplete="off" />
					</label>
					<label class="field">
						Author
						<input v-model="crAuthor" type="text" maxlength="200" autocomplete="off" />
					</label>
					<div class="row-actions">
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="saving || (!crTitle && !currentlyReading)"
							@click="clearCurrentlyReading"
						>
							Clear
						</button>
						<button
							type="button"
							class="btn btn-primary btn-sm"
							:disabled="saving"
							@click="saveSettings"
						>
							{{
								saving
									? (config?.copy.profileSaving ?? 'Saving…')
									: (config?.copy.profileSaveSettings ?? 'Save')
							}}
						</button>
					</div>
				</section>

				<section class="drawer-section">
					<h3>{{ config?.copy.profileThemeTitle ?? 'Theme' }}</h3>
					<p class="section-desc">
						{{
							config?.copy.profileThemeLead ??
							'Pick dark or light, or build a custom palette for this device.'
						}}
					</p>
					<ThemeSwitcher />
				</section>
			</aside>
		</div>
	</Teleport>
</template>

<style scoped>
.settings-overlay {
	position: fixed;
	inset: 0;
	z-index: 80;
	background: color-mix(in srgb, #000 55%, transparent);
	display: flex;
	justify-content: flex-end;
	padding: 0;
}

.settings-drawer {
	width: min(26rem, 100%);
	height: 100%;
	max-height: 100dvh;
	overflow: auto;
	border-radius: 0;
	border-left: 1px solid var(--realm-border);
	padding: 1.25rem 1.35rem 2rem;
	background: var(--realm-surface);
	box-shadow: -12px 0 40px color-mix(in srgb, #000 35%, transparent);
}

.drawer-head {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	align-items: flex-start;
	margin-bottom: 1rem;
}

.drawer-head h2 {
	margin: 0 0 0.25rem;
	font-family: var(--font-display);
	font-size: 1.35rem;
}

.section-desc {
	margin: 0;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.drawer-section {
	margin-top: 1.35rem;
	padding-top: 1.15rem;
	border-top: 1px solid var(--realm-border);
}

.drawer-section h3 {
	margin: 0 0 0.35rem;
	font-family: var(--font-display);
	font-size: 1.05rem;
}

.avatar-row {
	display: flex;
	align-items: center;
	gap: 1rem;
	margin-top: 0.75rem;
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
	margin-bottom: 0.85rem;
	cursor: pointer;
}

.setting-row input {
	margin-top: 0.2rem;
}

.setting-row strong {
	display: block;
	color: var(--realm-text);
}

.setting-row span {
	display: block;
	font-size: 0.82rem;
	color: var(--realm-text-muted);
}

.field {
	display: block;
	margin-bottom: 0.65rem;
	font-size: 0.85rem;
	color: var(--realm-text-muted);
}

.field input {
	display: block;
	width: 100%;
	margin-top: 0.25rem;
}

.row-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 0.5rem;
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
	.settings-drawer {
		width: 100%;
	}
}
</style>
