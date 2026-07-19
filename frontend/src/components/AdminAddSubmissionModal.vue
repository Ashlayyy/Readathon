<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import OptionalDatePicker from './OptionalDatePicker.vue';
import {
	api,
	type AdminSubmission,
	type AdminUser,
	type Prompt,
	type TeamConfig,
} from '../lib/api';

const props = defineProps<{
	users: AdminUser[];
	teams: TeamConfig[];
	positivePrompts: Prompt[];
	negativePrompts: Prompt[];
	maxPrompts: number;
	globalBonusLabel?: string;
	/** When set, modal shows/edits this submission instead of creating. */
	editing?: AdminSubmission | null;
	/** View-only (no edits). Requires editing. */
	readonly?: boolean;
}>();

const emit = defineEmits<{
	close: [];
	created: [];
	updated: [];
	edit: [];
	error: [message: string];
}>();

const isEdit = computed(() => !!props.editing && !props.readonly);
const isView = computed(() => !!props.editing && !!props.readonly);
const isCreate = computed(() => !props.editing);

const assignedUsers = computed(() =>
	props.users
		.filter((u) => u.status === 'assigned' && u.teamId)
		.slice()
		.sort((a, b) => a.displayName.localeCompare(b.displayName)),
);

const readerSearch = ref('');
const readerMenuOpen = ref(false);
const readerPickerRef = ref<HTMLElement | null>(null);
const readerSearchInput = ref<HTMLInputElement | null>(null);

const filteredAssignedUsers = computed(() => {
	const q = readerSearch.value.trim().toLowerCase();
	if (!q) return assignedUsers.value;
	return assignedUsers.value.filter((u) =>
		u.displayName.toLowerCase().includes(q),
	);
});

const readersByTeam = computed(() =>
	props.teams
		.map((team) => ({
			team,
			users: filteredAssignedUsers.value.filter((u) => u.teamId === team.id),
		}))
		.filter((g) => g.users.length > 0),
);

function openReaderMenu() {
	readerMenuOpen.value = true;
	readerSearch.value = '';
	nextTick(() => readerSearchInput.value?.focus());
}

function closeReaderMenu() {
	readerMenuOpen.value = false;
	readerSearch.value = '';
}

function toggleReaderMenu() {
	if (readerMenuOpen.value) closeReaderMenu();
	else openReaderMenu();
}

function selectReader(id: string) {
	userId.value = id;
	closeReaderMenu();
}

function onReaderDocPointerDown(e: PointerEvent) {
	if (!readerMenuOpen.value) return;
	const el = readerPickerRef.value;
	if (el && !el.contains(e.target as Node)) closeReaderMenu();
}

watch(readerMenuOpen, (open) => {
	if (open) {
		document.addEventListener('pointerdown', onReaderDocPointerDown);
	} else {
		document.removeEventListener('pointerdown', onReaderDocPointerDown);
	}
});

onBeforeUnmount(() => {
	document.removeEventListener('pointerdown', onReaderDocPointerDown);
});

const userId = ref('');
const bookTitle = ref('');
const bookAuthor = ref('');
const pageCount = ref(300);
const format = ref('physical');
const startedAt = ref('');
const finishedAt = ref('');
const submissionType = ref<'add' | 'sabotage'>('add');
const targetTeamId = ref('');
const promptIds = ref<string[]>([]);
const bonusCompetition = ref(false);
const bonusTeamPromptIds = ref<string[]>([]);
const promptSearch = ref('');
const submitting = ref(false);
const hydrating = ref(false);

const selectedUser = computed(() => {
	if (props.editing) {
		return (
			props.users.find(
				(u) =>
					u.displayName === props.editing!.userName &&
					u.email === props.editing!.userEmail,
			) ??
			props.users.find(
				(u) =>
					u.teamId === props.editing!.userTeamId &&
					u.displayName === props.editing!.userName,
			) ??
			null
		);
	}
	return assignedUsers.value.find((u) => u.id === userId.value) ?? null;
});

const readerTeamId = computed(() => {
	if (props.editing?.userTeamId) return props.editing.userTeamId;
	return selectedUser.value?.teamId ?? null;
});

const readerTeam = computed(() => {
	const teamId = readerTeamId.value;
	if (!teamId) return null;
	return props.teams.find((t) => t.id === teamId) ?? null;
});

const attackableTeams = computed(() =>
	props.teams.filter((t) => t.id !== readerTeamId.value),
);

const availablePrompts = computed(() =>
	submissionType.value === 'add'
		? props.positivePrompts
		: props.negativePrompts,
);

const filteredPrompts = computed(() => {
	const q = promptSearch.value.trim().toLowerCase();
	if (!q) return availablePrompts.value;
	return availablePrompts.value.filter(
		(p) =>
			p.label.toLowerCase().includes(q) ||
			p.gameName.toLowerCase().includes(q) ||
			p.description.toLowerCase().includes(q),
	);
});

const selectedPromptDetails = computed(() => {
	const all = [...props.positivePrompts, ...props.negativePrompts];
	return promptIds.value.map(
		(id) =>
			all.find((p) => p.id === id) ?? {
				id,
				label: id,
				points: 0,
				gameName: '',
				description: '',
			},
	);
});

const targetTeam = computed(
	() => props.teams.find((t) => t.id === targetTeamId.value) ?? null,
);

function hydrateFromEditing(s: AdminSubmission) {
	hydrating.value = true;
	bookTitle.value = s.bookTitle;
	bookAuthor.value = s.bookAuthor;
	pageCount.value = s.pageCount;
	format.value = s.format;
	startedAt.value = s.startedAt ?? '';
	finishedAt.value = s.finishedAt ?? '';
	submissionType.value = s.submissionType;
	targetTeamId.value = s.targetTeamId ?? '';
	promptIds.value = [...s.promptIds];
	bonusCompetition.value = s.bonusCompetition;
	bonusTeamPromptIds.value = [...s.bonusTeamPromptIds];
	promptSearch.value = '';
	// next tick-ish: allow watchers to skip clear
	queueMicrotask(() => {
		hydrating.value = false;
	});
}

if (props.editing) {
	hydrateFromEditing(props.editing);
}

watch(
	() => props.editing,
	(s) => {
		if (s) hydrateFromEditing(s);
	},
);

watch(submissionType, (next, prev) => {
	if (hydrating.value || next === prev) return;
	promptIds.value = [];
	promptSearch.value = '';
	if (next === 'add') targetTeamId.value = '';
});

watch(userId, () => {
	if (hydrating.value || isEdit.value) return;
	bonusTeamPromptIds.value = [];
	if (
		submissionType.value === 'sabotage' &&
		targetTeamId.value === selectedUser.value?.teamId
	) {
		targetTeamId.value = '';
	}
});

function isPromptSelected(id: string) {
	return promptIds.value.includes(id);
}

function togglePrompt(id: string) {
	if (isPromptSelected(id)) {
		promptIds.value = promptIds.value.filter((x) => x !== id);
		return;
	}
	if (promptIds.value.length >= props.maxPrompts) return;
	promptIds.value = [...promptIds.value, id];
}

function toggleTeamBonus(id: string) {
	if (bonusTeamPromptIds.value.includes(id)) {
		bonusTeamPromptIds.value = bonusTeamPromptIds.value.filter((x) => x !== id);
	} else {
		bonusTeamPromptIds.value = [...bonusTeamPromptIds.value, id];
	}
}

function payload() {
	return {
		bookTitle: bookTitle.value,
		bookAuthor: bookAuthor.value,
		pageCount: pageCount.value,
		format: format.value,
		startedAt: startedAt.value || null,
		finishedAt: finishedAt.value || null,
		submissionType: submissionType.value,
		targetTeamId:
			submissionType.value === 'sabotage' ? targetTeamId.value : undefined,
		promptIds: promptIds.value,
		bonusCompetition: bonusCompetition.value,
		bonusTeamPromptIds: bonusTeamPromptIds.value,
	};
}

async function submit() {
	if (submissionType.value === 'sabotage' && !targetTeamId.value) {
		emit('error', 'Select a team to attack.');
		return;
	}

	submitting.value = true;
	try {
		if (props.editing) {
			await api(`/admin/submissions/${props.editing.id}`, {
				method: 'PATCH',
				body: JSON.stringify(payload()),
			});
			emit('updated');
			return;
		}

		if (!userId.value) {
			emit('error', 'Select a reader to submit for.');
			return;
		}

		await api('/admin/submissions', {
			method: 'POST',
			body: JSON.stringify({ userId: userId.value, ...payload() }),
		});
		emit('created');
	} catch (e) {
		emit(
			'error',
			e instanceof Error
				? e.message
				: isEdit.value
					? 'Failed to update submission'
					: 'Failed to create submission',
		);
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<div class="modal-backdrop">
		<div
			class="modal card add-sub-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-sub-title"
		>
			<header class="modal-head">
				<div>
					<h2 id="add-sub-title">
						{{
							isView
								? 'Submission'
								: isEdit
									? 'Edit submission'
									: 'Add submission'
						}}
					</h2>
					<p class="section-desc">
						<template v-if="isView">
							{{ editing?.userName }}'s book - view only.
						</template>
						<template v-else-if="isEdit">
							Update {{ editing?.userName }}'s book - including prompts and
							bonuses. Scores recalculate on save.
						</template>
						<template v-else>
							Submit a book as another reader. It will appear under their name
							and score for their realm.
						</template>
					</p>
				</div>
			</header>

			<form
				class="add-sub-form"
				:class="{ readonly: isView }"
				@submit.prevent="!isView && submit()"
			>
				<div
					v-if="isCreate"
					ref="readerPickerRef"
					class="field reader-picker"
				>
					<span class="field-label">Reader</span>
					<button
						type="button"
						class="reader-trigger"
						:class="{ open: readerMenuOpen }"
						:aria-expanded="readerMenuOpen"
						aria-haspopup="listbox"
						@click="toggleReaderMenu"
					>
						<span v-if="selectedUser" class="reader-trigger-value">
							{{ selectedUser.displayName }}
							<span
								v-if="readerTeam"
								class="reader-trigger-team"
								:style="{ color: readerTeam.color }"
							>
								{{ readerTeam.icon }} {{ readerTeam.name }}
							</span>
						</span>
						<span v-else class="reader-trigger-placeholder"
							>Select an assigned reader…</span
						>
						<span class="reader-chevron" aria-hidden="true">▾</span>
					</button>
					<div
						v-if="readerMenuOpen"
						class="reader-menu"
						role="listbox"
						aria-label="Readers by realm"
					>
						<input
							ref="readerSearchInput"
							v-model="readerSearch"
							type="search"
							class="reader-search"
							placeholder="Search readers…"
							autocomplete="off"
							@keydown.escape.prevent="closeReaderMenu"
						/>
						<div class="reader-menu-list">
							<div
								v-for="group in readersByTeam"
								:key="group.team.id"
								class="reader-group"
							>
								<p
									class="reader-group-label"
									:style="{ color: group.team.color }"
								>
									{{ group.team.icon }} {{ group.team.name }}
								</p>
								<button
									v-for="u in group.users"
									:key="u.id"
									type="button"
									class="reader-option"
									:class="{ selected: userId === u.id }"
									role="option"
									:aria-selected="userId === u.id"
									@click="selectReader(u.id)"
								>
									{{ u.displayName }}
								</button>
							</div>
							<p v-if="assignedUsers.length === 0" class="empty-hint">
								No assigned readers yet.
							</p>
							<p
								v-else-if="readersByTeam.length === 0"
								class="empty-hint"
							>
								No readers match “{{ readerSearch.trim() }}”.
							</p>
						</div>
					</div>
				</div>

				<div v-else class="reader-team">
					Reader: <strong>{{ editing?.userName }}</strong>
				</div>

				<div v-if="readerTeam" class="reader-team">
					Realm:
					<strong :style="{ color: readerTeam.color }"
						>{{ readerTeam.icon }} {{ readerTeam.name }}</strong
					>
				</div>

				<div
					v-if="isView || isEdit"
					class="reader-team affects-line"
					:class="
						submissionType === 'sabotage' ? 'affects-sabotage' : 'affects-gain'
					"
				>
					<template v-if="submissionType === 'sabotage'">
						Sabotages
						<strong>{{
							targetTeam
								? `${targetTeam.icon} ${targetTeam.name}`
								: 'unknown realm'
						}}</strong>
					</template>
					<template v-else>
						XP goes to
						<strong
							:style="readerTeam ? { color: readerTeam.color } : undefined"
						>
							{{
								readerTeam
									? `${readerTeam.icon} ${readerTeam.name}`
									: 'their realm'
							}}
						</strong>
					</template>
				</div>

				<div class="field-grid">
					<label class="field">
						Title
						<input
							v-model="bookTitle"
							type="text"
							required
							minlength="1"
							:disabled="isView"
						/>
					</label>
					<label class="field">
						Author
						<input
							v-model="bookAuthor"
							type="text"
							required
							minlength="1"
							:disabled="isView"
						/>
					</label>
					<label class="field">
						Pages
						<input
							v-model.number="pageCount"
							type="number"
							min="1"
							required
							:disabled="isView"
						/>
					</label>
					<label class="field">
						Format
						<select v-model="format" :disabled="isView">
							<option value="ebook">Ebook</option>
							<option value="audiobook">Audiobook</option>
							<option value="physical">Physical</option>
						</select>
					</label>
					<OptionalDatePicker
						v-model="startedAt"
						label="Started"
						:disabled="isView"
					/>
					<OptionalDatePicker
						v-model="finishedAt"
						label="Finished"
						:disabled="isView"
					/>
				</div>

				<fieldset class="type-fieldset" :disabled="isView">
					<legend>Type</legend>
					<div class="type-row">
						<label
							class="type-option"
							:class="{ active: submissionType === 'add' }"
						>
							<input
								v-model="submissionType"
								type="radio"
								value="add"
								:disabled="isView"
							/>
							Add XP
						</label>
						<label
							class="type-option"
							:class="{ active: submissionType === 'sabotage' }"
						>
							<input
								v-model="submissionType"
								type="radio"
								value="sabotage"
								:disabled="isView"
							/>
							Sabotage
						</label>
					</div>
					<label v-if="submissionType === 'sabotage'" class="field">
						Target team
						<select
							v-model="targetTeamId"
							:required="!isView"
							:disabled="isView"
						>
							<option value="" disabled>Select a team…</option>
							<option
								v-for="team in attackableTeams"
								:key="team.id"
								:value="team.id"
							>
								{{ team.icon }} {{ team.name }}
							</option>
						</select>
					</label>
				</fieldset>

				<section class="prompt-section">
					<div class="prompt-head">
						<h3>
							Prompts <span v-if="!isView" class="optional">(optional)</span>
						</h3>
						<span class="counter"
							>{{ promptIds.length
							}}{{ isView ? '' : ` / ${maxPrompts}` }}</span
						>
					</div>
					<template v-if="isView">
						<div class="prompt-list">
							<span
								v-for="p in selectedPromptDetails"
								:key="p.id"
								class="prompt-chip selected"
							>
								<span class="chip-pts">{{
									p.points > 0 ? `+${p.points}` : p.points
								}}</span>
								<span class="chip-label">{{ p.label }}</span>
							</span>
							<p v-if="selectedPromptDetails.length === 0" class="empty-hint">
								No prompts on this submission.
							</p>
						</div>
					</template>
					<template v-else>
						<input
							v-model="promptSearch"
							type="search"
							class="prompt-search"
							placeholder="Search prompts…"
							aria-label="Search prompts"
						/>
						<div class="prompt-list">
							<button
								v-for="p in filteredPrompts"
								:key="p.id"
								type="button"
								class="prompt-chip"
								:class="{ selected: isPromptSelected(p.id) }"
								:disabled="
									!isPromptSelected(p.id) && promptIds.length >= maxPrompts
								"
								@click="togglePrompt(p.id)"
							>
								<span class="chip-pts">{{
									p.points > 0 ? `+${p.points}` : p.points
								}}</span>
								<span class="chip-label">{{ p.label }}</span>
							</button>
							<p v-if="filteredPrompts.length === 0" class="empty-hint">
								No prompts match.
							</p>
						</div>
					</template>
				</section>

				<section class="bonus-section">
					<h3>
						Bonuses <span v-if="!isView" class="optional">(optional)</span>
					</h3>
					<div class="bonus-list">
						<button
							type="button"
							class="bonus-toggle"
							:class="{ selected: bonusCompetition }"
							:aria-pressed="bonusCompetition"
							:disabled="isView"
							@click="bonusCompetition = !bonusCompetition"
						>
							<span class="bonus-check" aria-hidden="true">{{
								bonusCompetition ? '✓' : ''
							}}</span>
							<span class="bonus-text">{{
								globalBonusLabel || 'Competition / trials'
							}}</span>
						</button>
						<template v-if="readerTeam?.bonusPrompts?.length">
							<p
								class="bonus-label"
								:style="readerTeam ? { color: readerTeam.color } : undefined"
							>
								{{ readerTeam.name }} bonuses
							</p>
							<button
								v-for="bp in readerTeam.bonusPrompts"
								:key="bp.id"
								type="button"
								class="bonus-toggle"
								:class="{ selected: bonusTeamPromptIds.includes(bp.id) }"
								:aria-pressed="bonusTeamPromptIds.includes(bp.id)"
								:disabled="isView"
								@click="toggleTeamBonus(bp.id)"
							>
								<span class="bonus-check" aria-hidden="true">{{
									bonusTeamPromptIds.includes(bp.id) ? '✓' : ''
								}}</span>
								<span class="bonus-text">
									{{ bp.label }}
									<span class="bonus-pts"
										>({{
											bp.points > 0 ? `+${bp.points}` : bp.points
										}})</span
									>
								</span>
							</button>
						</template>
					</div>
				</section>

				<div class="modal-actions">
					<button type="button" class="btn btn-ghost" @click="emit('close')">
						{{ isView ? 'Close' : 'Cancel' }}
					</button>
					<button
						v-if="isView"
						type="button"
						class="btn btn-primary"
						@click="emit('edit')"
					>
						Edit
					</button>
					<button
						v-else
						type="submit"
						class="btn btn-primary"
						:disabled="submitting || (isCreate && !userId)"
					>
						<template v-if="submitting">{{
							isEdit ? 'Saving…' : 'Submitting…'
						}}</template>
						<template v-else>{{
							isEdit ? 'Save changes' : 'Submit for reader'
						}}</template>
					</button>
				</div>
			</form>
		</div>
	</div>
</template>

<style scoped>
.modal-backdrop {
	padding: 1rem;
	overflow: hidden;
}

.add-sub-modal {
	width: min(40rem, 100%);
	margin: 0 auto;
	padding: 1.25rem 1.35rem 1.5rem;
}

.modal-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1rem;
}

.modal-head h2 {
	margin: 0 0 0.35rem;
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.25rem;
}

.section-desc {
	margin: 0;
	color: var(--realm-text-muted);
	font-size: 0.9rem;
}

.add-sub-form {
	display: flex;
	flex-direction: column;
	gap: 1.1rem;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--realm-text-muted);
}

.field-label {
	font-size: inherit;
	font-weight: inherit;
	color: inherit;
}

.reader-picker {
	position: relative;
	gap: 0.4rem;
}

.reader-trigger {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	width: 100%;
	padding: 0.55rem 0.7rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-family: var(--font-body);
	font-size: 0.95rem;
	font-weight: 500;
	text-align: left;
	cursor: pointer;
}

.reader-trigger.open,
.reader-trigger:hover {
	border-color: rgba(212, 99, 74, 0.45);
}

.reader-trigger-value {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.45rem;
	min-width: 0;
}

.reader-trigger-team {
	font-size: 0.82rem;
	font-weight: 600;
}

.reader-trigger-placeholder {
	color: var(--realm-text-muted);
}

.reader-chevron {
	flex-shrink: 0;
	color: var(--realm-text-muted);
	font-size: 0.75rem;
	line-height: 1;
}

.reader-menu {
	position: absolute;
	z-index: 20;
	left: 0;
	right: 0;
	top: calc(100% + 0.35rem);
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
	padding: 0.65rem;
	border-radius: 10px;
	border: 1px solid var(--realm-border);
	background: var(--realm-surface);
	box-shadow: var(--shadow);
}

.reader-search {
	width: 100%;
	padding: 0.5rem 0.65rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-family: var(--font-body);
	font-size: 0.9rem;
	font-weight: 500;
}

.reader-menu-list {
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
	max-height: 14rem;
	overflow-y: auto;
	overscroll-behavior: contain;
}

.reader-group-label {
	margin: 0 0 0.25rem;
	padding: 0 0.35rem;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.reader-option {
	display: block;
	width: 100%;
	padding: 0.45rem 0.55rem;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--realm-text);
	font-family: var(--font-body);
	font-size: 0.9rem;
	font-weight: 500;
	text-align: left;
	cursor: pointer;
}

.reader-option:hover {
	background: rgba(255, 255, 255, 0.05);
}

.reader-option.selected {
	background: rgba(212, 99, 74, 0.14);
	color: var(--realm-accent-glow);
	font-weight: 700;
}

.field input,
.field select,
.prompt-search {
	padding: 0.55rem 0.7rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-family: var(--font-body);
	font-weight: 500;
	font-size: 0.95rem;
}

.field-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.85rem;
}

.reader-team {
	font-size: 0.9rem;
	color: var(--realm-text-muted);
	padding: 0.55rem 0.75rem;
	border-radius: var(--radius);
	background: rgba(255, 255, 255, 0.03);
	border: 1px solid var(--realm-border);
}

.affects-gain {
	border-color: rgba(110, 207, 138, 0.35);
	background: rgba(110, 207, 138, 0.08);
}

.affects-sabotage {
	border-color: rgba(212, 99, 74, 0.4);
	background: rgba(212, 99, 74, 0.1);
}

.add-sub-form.readonly input:disabled,
.add-sub-form.readonly select:disabled {
	opacity: 0.85;
	cursor: default;
}

.add-sub-form.readonly .prompt-chip,
.add-sub-form.readonly .bonus-toggle {
	pointer-events: none;
}

.type-fieldset {
	border: 1px solid var(--realm-border);
	border-radius: 12px;
	padding: 0.85rem 1rem 1rem;
	margin: 0;
}

.type-fieldset legend {
	padding: 0 0.35rem;
	font-size: 0.85rem;
	font-weight: 700;
	color: var(--realm-text);
}

.type-row {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 0.75rem;
}

.type-option {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	padding: 0.55rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	cursor: pointer;
	font-weight: 600;
	font-size: 0.9rem;
	color: var(--realm-text-muted);
}

.type-option.active {
	border-color: var(--realm-accent);
	color: var(--realm-accent-glow);
	background: rgba(212, 99, 74, 0.1);
}

.type-option input {
	accent-color: var(--realm-accent);
}

.prompt-section h3,
.bonus-section h3 {
	margin: 0;
	font-size: 0.95rem;
	color: var(--realm-text);
}

.optional {
	font-weight: 500;
	color: var(--realm-text-muted);
	font-size: 0.8rem;
}

.prompt-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.55rem;
}

.counter {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--realm-text-muted);
}

.prompt-search {
	width: 100%;
	margin-bottom: 0.65rem;
}

.prompt-list {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	max-height: 12rem;
	overflow-y: auto;
	padding: 0.15rem;
}

.prompt-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.4rem 0.65rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	cursor: pointer;
	font-family: var(--font-body);
	font-size: 0.8rem;
	text-align: left;
}

.prompt-chip:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.prompt-chip.selected {
	border-color: var(--realm-accent);
	color: var(--realm-text);
	background: rgba(212, 99, 74, 0.12);
}

.chip-pts {
	font-weight: 800;
	color: var(--realm-accent-glow);
	font-size: 0.75rem;
}

.empty-hint {
	margin: 0.5rem 0;
	color: var(--realm-text-muted);
	font-size: 0.9rem;
}

.bonus-list {
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
	margin-top: 0.55rem;
}

.bonus-toggle {
	display: flex;
	align-items: flex-start;
	gap: 0.7rem;
	width: 100%;
	padding: 0.7rem 0.85rem;
	text-align: left;
	border: 2px solid var(--realm-border);
	border-radius: 10px;
	background: var(--realm-bg);
	color: var(--realm-text);
	cursor: pointer;
	font-family: var(--font-body);
	font-size: 0.9rem;
	transition:
		border-color 0.2s,
		background 0.2s;
}

.bonus-toggle:hover:not(:disabled) {
	border-color: rgba(212, 99, 74, 0.45);
}

.bonus-toggle.selected {
	border-color: var(--realm-accent);
	background: rgba(212, 99, 74, 0.1);
}

.bonus-toggle:disabled {
	cursor: default;
	opacity: 1;
}

.bonus-check {
	flex-shrink: 0;
	width: 1.25rem;
	height: 1.25rem;
	margin-top: 0.05rem;
	border-radius: 4px;
	border: 2px solid var(--realm-border);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 0.7rem;
	font-weight: 700;
	color: #fff;
	background: transparent;
	transition:
		background 0.2s,
		border-color 0.2s;
}

.bonus-toggle.selected .bonus-check {
	background: var(--realm-accent);
	border-color: var(--realm-accent);
}

.bonus-text {
	min-width: 0;
	line-height: 1.35;
}

.bonus-pts {
	color: var(--realm-accent-glow);
	font-weight: 700;
}

.bonus-label {
	margin: 0.55rem 0 0.1rem;
	font-size: 0.78rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.65rem;
	padding-top: 0.35rem;
	border-top: 1px solid var(--realm-border);
}

@media (max-width: 640px) {
	.field-grid {
		grid-template-columns: 1fr;
	}

	.add-sub-modal {
		margin: 0.5rem auto;
		padding: 1rem;
	}

	.type-row {
		flex-direction: column;
	}
}
</style>
