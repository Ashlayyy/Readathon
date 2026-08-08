<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { useBodyScrollLock } from '../composables/useBodyScrollLock';
import { useConfig } from '../composables/useConfig';

type TeamBonusPrompt = {
	id: string;
	promptId: string;
	kind: 'team_bonus';
	teamId: string | null;
	label: string;
	description: string;
	points: number;
	isActive: boolean;
	goesLiveAt: string | null;
	sortOrder: number;
	isLive: boolean;
};

type TeamBonusGroup = {
	teamId: string;
	teamName: string;
	color: string;
	icon: string;
	source: 'json' | 'db';
	jsonDefaults: { id: string; label: string; points: number }[];
	prompts: TeamBonusPrompt[];
};

const emit = defineEmits<{ message: [text: string, isError?: boolean] }>();
const { loadConfig } = useConfig();

const teams = ref<TeamBonusGroup[]>([]);
const loading = ref('');
const editOpen = ref(false);
const createForTeamId = ref<string | null>(null);
const editing = ref<TeamBonusPrompt | null>(null);

const form = ref({
	promptId: '',
	label: '',
	description: '',
	points: 10,
	isActive: true,
	sortOrder: 0,
});

const modalOpen = computed(() => editOpen.value);
useBodyScrollLock(modalOpen);

onMounted(load);

async function load() {
	loading.value = 'load';
	try {
		const data = await api<{ teams: TeamBonusGroup[] }>('/admin/team-bonuses');
		teams.value = data.teams;
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to load team bonuses',
			true,
		);
	} finally {
		loading.value = '';
	}
}

function openCreate(teamId: string) {
	createForTeamId.value = teamId;
	editing.value = null;
	const team = teams.value.find((t) => t.teamId === teamId);
	form.value = {
		promptId: `${teamId}-bonus-${Date.now().toString(36)}`,
		label: '',
		description: '',
		points: 10,
		isActive: true,
		sortOrder: (team?.prompts.length ?? 0) + 1,
	};
	editOpen.value = true;
}

function openEdit(p: TeamBonusPrompt) {
	createForTeamId.value = p.teamId;
	editing.value = p;
	form.value = {
		promptId: p.promptId,
		label: p.label,
		description: p.description ?? '',
		points: p.points,
		isActive: p.isActive,
		sortOrder: p.sortOrder,
	};
	editOpen.value = true;
}

function closeModal() {
	editOpen.value = false;
	editing.value = null;
	createForTeamId.value = null;
}

async function save() {
	const teamId = createForTeamId.value;
	if (!teamId) return;
	loading.value = 'save';
	try {
		const body = {
			promptId: form.value.promptId.trim(),
			kind: 'team_bonus' as const,
			teamId,
			gameName: '',
			label: form.value.label.trim(),
			description: form.value.description.trim(),
			points: Number(form.value.points),
			link: null,
			isActive: form.value.isActive,
			goesLiveAt: null,
			sortOrder: Number(form.value.sortOrder) || 0,
		};
		if (editing.value) {
			await api(`/admin/prompts/${editing.value.id}`, {
				method: 'PATCH',
				body: JSON.stringify(body),
			});
			emit('message', 'Team bonus updated.');
		} else {
			await api('/admin/prompts', {
				method: 'POST',
				body: JSON.stringify(body),
			});
			emit('message', 'Team bonus created.');
		}
		closeModal();
		await load();
		await loadConfig();
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to save team bonus',
			true,
		);
	} finally {
		loading.value = '';
	}
}

async function removePrompt(p: TeamBonusPrompt) {
	if (!confirm(`Delete “${p.label}”?`)) return;
	loading.value = 'delete';
	try {
		await api(`/admin/prompts/${p.id}`, { method: 'DELETE' });
		emit('message', 'Team bonus deleted.');
		await load();
		await loadConfig();
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to delete team bonus',
			true,
		);
	} finally {
		loading.value = '';
	}
}

async function copyJsonDefaults(team: TeamBonusGroup) {
	if (team.source === 'db') {
		if (
			!confirm(
				`${team.teamName} already has DB overrides. Add JSON defaults as extra prompts?`,
			)
		) {
			return;
		}
	} else if (
		!confirm(
			`Copy ${team.jsonDefaults.length} JSON default(s) into the database for ${team.teamName}? Readers will then use the DB list only.`,
		)
	) {
		return;
	}
	loading.value = 'copy';
	try {
		for (const [i, d] of team.jsonDefaults.entries()) {
			const exists = team.prompts.some((p) => p.promptId === d.id);
			if (exists) continue;
			await api('/admin/prompts', {
				method: 'POST',
				body: JSON.stringify({
					promptId: d.id,
					kind: 'team_bonus',
					teamId: team.teamId,
					gameName: '',
					label: d.label,
					description: '',
					points: d.points,
					link: null,
					isActive: true,
					goesLiveAt: null,
					sortOrder: i + 1,
				}),
			});
		}
		emit('message', `Copied defaults for ${team.teamName}.`);
		await load();
		await loadConfig();
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to copy defaults',
			true,
		);
	} finally {
		loading.value = '';
	}
}
</script>

<template>
	<section class="card admin-section team-bonuses-panel">
		<header class="panel-head">
			<div>
				<h2>Team bonuses</h2>
				<p class="section-desc">
					Set bonus prompts per realm. If a team has no DB prompts, readers see
					the JSON defaults. Once you add at least one, only the DB list is
					used for that team.
				</p>
			</div>
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				:disabled="!!loading"
				@click="load"
			>
				{{ loading === 'load' ? 'Refreshing…' : 'Refresh' }}
			</button>
		</header>

		<p v-if="loading === 'load' && !teams.length" class="muted">Loading…</p>

		<div v-else class="team-grid">
			<article
				v-for="team in teams"
				:key="team.teamId"
				class="team-card"
				:style="{ '--team-color': team.color }"
			>
				<header class="team-card-head">
					<h3>
						<span class="team-icon" aria-hidden="true">{{ team.icon }}</span>
						{{ team.teamName }}
					</h3>
					<span
						class="source-badge"
						:class="team.source === 'db' ? 'source-db' : 'source-json'"
					>
						{{ team.source === 'db' ? 'Using database' : 'Using JSON defaults' }}
					</span>
				</header>

				<ul v-if="team.source === 'db' && team.prompts.length" class="bonus-rows">
					<li v-for="p in team.prompts" :key="p.id">
						<div class="bonus-main">
							<strong>{{ p.label }}</strong>
							<span class="pts">{{ p.points > 0 ? `+${p.points}` : p.points }}</span>
							<code class="slug">{{ p.promptId }}</code>
						</div>
						<div class="bonus-actions">
							<button type="button" class="btn btn-ghost btn-sm" @click="openEdit(p)">
								Edit
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm danger"
								@click="removePrompt(p)"
							>
								Delete
							</button>
						</div>
					</li>
				</ul>

				<template v-else>
					<p class="fallback-note">Readers currently see these JSON defaults:</p>
					<ul class="bonus-rows readonly">
						<li v-for="d in team.jsonDefaults" :key="d.id">
							<div class="bonus-main">
								<strong>{{ d.label }}</strong>
								<span class="pts">{{ d.points > 0 ? `+${d.points}` : d.points }}</span>
								<code class="slug">{{ d.id }}</code>
							</div>
						</li>
						<li v-if="!team.jsonDefaults.length" class="empty">No JSON defaults.</li>
					</ul>
				</template>

				<div class="team-actions">
					<button
						type="button"
						class="btn btn-primary btn-sm"
						@click="openCreate(team.teamId)"
					>
						Add bonus
					</button>
					<button
						v-if="team.jsonDefaults.length"
						type="button"
						class="btn btn-secondary btn-sm"
						:disabled="loading === 'copy'"
						@click="copyJsonDefaults(team)"
					>
						Copy JSON → DB
					</button>
				</div>
			</article>
		</div>

		<Teleport to="body">
			<div
				v-if="editOpen"
				class="modal-backdrop"
				@keydown.esc="closeModal"
			>
				<div
					class="modal card"
					role="dialog"
					aria-modal="true"
					aria-labelledby="team-bonus-modal-title"
				>
					<header class="modal-head">
						<h2 id="team-bonus-modal-title">
							{{ editing ? 'Edit team bonus' : 'Add team bonus' }}
						</h2>
						<button type="button" class="btn btn-ghost btn-sm" @click="closeModal">
							Close
						</button>
					</header>
					<form class="modal-form" @submit.prevent="save">
						<label>
							ID (slug)
							<input v-model="form.promptId" required :disabled="!!editing" />
						</label>
						<label>
							Label
							<input v-model="form.label" required />
						</label>
						<label>
							Description
							<textarea v-model="form.description" rows="2" />
						</label>
						<label>
							Points
							<input v-model.number="form.points" type="number" required />
						</label>
						<label>
							Sort order
							<input v-model.number="form.sortOrder" type="number" />
						</label>
						<label class="check">
							<input v-model="form.isActive" type="checkbox" />
							Active
						</label>
						<p v-if="!editing" class="hint">
							Adding the first DB bonus for a team switches readers off JSON
							defaults for that team.
						</p>
						<div class="modal-actions">
							<button type="button" class="btn btn-ghost" @click="closeModal">
								Cancel
							</button>
							<button
								type="submit"
								class="btn btn-primary"
								:disabled="loading === 'save'"
							>
								{{ loading === 'save' ? 'Saving…' : 'Save' }}
							</button>
						</div>
					</form>
				</div>
			</div>
		</Teleport>
	</section>
</template>

<style scoped>
.panel-head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
	margin-bottom: 1.25rem;
}
.section-desc {
	margin: 0.35rem 0 0;
	opacity: 0.8;
	max-width: 42rem;
}
.muted {
	opacity: 0.7;
}
.team-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 1rem;
}
.team-card {
	border: 1px solid color-mix(in srgb, var(--team-color) 35%, transparent);
	border-radius: 10px;
	padding: 1rem;
	background: color-mix(in srgb, var(--team-color) 8%, transparent);
}
.team-card-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	margin-bottom: 0.75rem;
}
.team-card-head h3 {
	margin: 0;
	font-size: 1.05rem;
	display: flex;
	align-items: center;
	gap: 0.4rem;
}
.team-icon {
	color: var(--team-color);
}
.source-badge {
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 0.2rem 0.45rem;
	border-radius: 999px;
	font-weight: 600;
}
.source-json {
	background: color-mix(in srgb, var(--text, #ccc) 12%, transparent);
}
.source-db {
	background: color-mix(in srgb, var(--team-color) 28%, transparent);
}
.fallback-note {
	margin: 0 0 0.5rem;
	font-size: 0.85rem;
	opacity: 0.75;
}
.bonus-rows {
	list-style: none;
	margin: 0 0 0.85rem;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}
.bonus-rows li {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	padding: 0.55rem 0.65rem;
	border-radius: 8px;
	background: color-mix(in srgb, var(--bg, #111) 55%, transparent);
}
.bonus-rows.readonly li {
	opacity: 0.92;
}
.bonus-main {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.4rem 0.65rem;
}
.bonus-main strong {
	font-size: 0.92rem;
}
.pts {
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	opacity: 0.85;
}
.slug {
	font-size: 0.72rem;
	opacity: 0.55;
}
.bonus-actions {
	display: flex;
	gap: 0.25rem;
}
.team-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}
.empty {
	opacity: 0.6;
	font-size: 0.9rem;
}
.danger {
	color: #e07070;
}
.modal-backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	display: grid;
	place-items: center;
	z-index: 80;
	padding: 1rem;
}
.modal {
	width: min(440px, 100%);
	max-height: 90vh;
	overflow: auto;
}
.modal-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 0.75rem;
	margin-bottom: 0.75rem;
}
.modal-head h2 {
	margin: 0;
	font-size: 1.15rem;
}
.modal-form {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}
.modal-form label {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	font-size: 0.88rem;
}
.modal-form input,
.modal-form textarea {
	font: inherit;
	padding: 0.45rem 0.55rem;
	border-radius: 6px;
	border: 1px solid color-mix(in srgb, var(--text, #ccc) 25%, transparent);
	background: color-mix(in srgb, var(--bg, #111) 80%, transparent);
	color: inherit;
}
.modal-form .check {
	flex-direction: row;
	align-items: center;
	gap: 0.5rem;
}
.hint {
	margin: 0;
	font-size: 0.82rem;
	opacity: 0.75;
}
.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 0.25rem;
}
</style>
