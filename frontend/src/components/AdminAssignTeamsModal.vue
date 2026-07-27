<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	api,
	type StandingsBreakdown,
	type TeamStanding,
} from '../lib/api'
import { useConfig } from '../composables/useConfig'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useFocusTrap } from '../composables/useFocusTrap'
import StandingsPanel from './StandingsPanel.vue'
import StandingsBreakdownPanel from './StandingsBreakdownPanel.vue'

export type AssignmentRow = {
	userId: string
	displayName: string
	isAdmin: boolean
	currentTeamId: string | null
	proposedTeamId: string
	contribution?: number
}

type IndividualRow = {
	userId: string
	displayName: string
	teamId: string
	teamName: string
	xpGained: number
	xpDealt: number
	total: number
}

type SavedSet = {
	slot: 1 | 2 | 3
	label: string
	includeAdmins: boolean
	savedAt: string | null
	count: number
	empty: boolean
}

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
	applied: [assigned: number]
	error: [message: string]
}>()

const { config } = useConfig()

const includeAdmins = ref(false)
const showStandings = ref(false)
const loading = ref(false)
const enriching = ref(false)
const applying = ref(false)
const savingSlot = ref<number | null>(null)
const error = ref('')
const assignments = ref<AssignmentRow[]>([])
const standings = ref<TeamStanding[]>([])
const breakdown = ref<StandingsBreakdown | null>(null)
const individuals = ref<IndividualRow[]>([])
const savedSets = ref<SavedSet[]>([])
const activeSetSlot = ref<number | null>(null)
const dragUserId = ref<string | null>(null)
const dropTeamId = ref<string | null>(null)
const modalRef = ref<HTMLElement | null>(null)
let enrichTimer: ReturnType<typeof setTimeout> | null = null

useBodyScrollLock(open)
useFocusTrap(open, modalRef)

const teamOptions = computed(() =>
	(config.value.teams ?? []).map((t) => ({
		id: t.id,
		name: t.name,
		color: t.color ?? '#888',
		icon: t.icon ?? '◆',
	})),
)

const teamMeta = computed(() => {
	const map = new Map<string, { name: string; color: string; icon: string }>()
	for (const t of teamOptions.value) {
		map.set(t.id, t)
	}
	return map
})

const byTeam = computed(() => {
	const groups = teamOptions.value.map((t) => ({
		teamId: t.id,
		name: t.name,
		color: t.color,
		icon: t.icon,
		members: [] as AssignmentRow[],
		points: 0,
	}))
	const index = new Map(groups.map((g) => [g.teamId, g]))
	for (const row of assignments.value) {
		const g = index.get(row.proposedTeamId)
		if (g) {
			g.members.push(row)
			g.points += row.contribution ?? 0
		}
	}
	for (const g of groups) {
		g.members.sort((a, b) => {
			const ca = b.contribution ?? 0
			const cb = a.contribution ?? 0
			if (ca !== cb) return ca - cb
			return a.displayName.localeCompare(b.displayName)
		})
	}
	return groups
})

const movedCount = computed(
	() =>
		assignments.value.filter((a) => a.currentTeamId !== a.proposedTeamId)
			.length,
)

const sizeSpread = computed(() => {
	const counts = byTeam.value.map((g) => g.members.length)
	if (!counts.length) return 0
	return Math.max(...counts) - Math.min(...counts)
})

const busy = computed(
	() => loading.value || applying.value || savingSlot.value !== null,
)

const dragLocked = computed(() => busy.value)

watch(open, (isOpen) => {
	if (isOpen) {
		error.value = ''
		includeAdmins.value = false
		showStandings.value = false
		assignments.value = []
		standings.value = []
		breakdown.value = null
		individuals.value = []
		activeSetSlot.value = null
		dragUserId.value = null
		dropTeamId.value = null
		void loadSets()
		void loadPreview()
	} else if (enrichTimer) {
		clearTimeout(enrichTimer)
		enrichTimer = null
	}
})

watch(showStandings, (on) => {
	if (on && assignments.value.length) void refreshEnrich()
})

function applyPreviewPayload(data: {
	assignments: AssignmentRow[]
	standings: TeamStanding[]
	breakdown: StandingsBreakdown
	individuals: IndividualRow[]
}) {
	assignments.value = data.assignments
	standings.value = data.standings
	breakdown.value = data.breakdown
	individuals.value = data.individuals
}

async function loadSets() {
	try {
		const data = await api<{ sets: SavedSet[] }>('/admin/assign-teams/sets')
		savedSets.value = data.sets
	} catch {
		savedSets.value = [
			{ slot: 1, label: 'Set 1', includeAdmins: false, savedAt: null, count: 0, empty: true },
			{ slot: 2, label: 'Set 2', includeAdmins: false, savedAt: null, count: 0, empty: true },
			{ slot: 3, label: 'Set 3', includeAdmins: false, savedAt: null, count: 0, empty: true },
		]
	}
}

async function loadPreview() {
	loading.value = true
	error.value = ''
	activeSetSlot.value = null
	try {
		const data = await api<{
			assignments: AssignmentRow[]
			standings: TeamStanding[]
			breakdown: StandingsBreakdown
			individuals: IndividualRow[]
		}>('/admin/assign-teams/preview', {
			method: 'POST',
			body: JSON.stringify({ includeAdmins: includeAdmins.value }),
		})
		applyPreviewPayload(data)
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not build preview'
		assignments.value = []
		standings.value = []
		breakdown.value = null
		individuals.value = []
	} finally {
		loading.value = false
	}
}

async function refreshEnrich() {
	if (!assignments.value.length) return
	enriching.value = true
	try {
		const data = await api<{
			assignments: AssignmentRow[]
			standings: TeamStanding[]
			breakdown: StandingsBreakdown
			individuals: IndividualRow[]
		}>('/admin/assign-teams/enrich', {
			method: 'POST',
			body: JSON.stringify({
				assignments: assignments.value.map((a) => ({
					userId: a.userId,
					teamId: a.proposedTeamId,
				})),
			}),
		})
		// Keep local proposed teams; refresh scores/names from server
		const proposed = new Map(
			assignments.value.map((a) => [a.userId, a.proposedTeamId]),
		)
		applyPreviewPayload({
			...data,
			assignments: data.assignments.map((a) => ({
				...a,
				proposedTeamId: proposed.get(a.userId) ?? a.proposedTeamId,
			})),
		})
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not refresh standings'
	} finally {
		enriching.value = false
	}
}

function scheduleEnrich() {
	if (!showStandings.value) return
	if (enrichTimer) clearTimeout(enrichTimer)
	enrichTimer = setTimeout(() => {
		enrichTimer = null
		void refreshEnrich()
	}, 280)
}

function moveMember(userId: string, teamId: string) {
	const row = assignments.value.find((a) => a.userId === userId)
	if (!row || row.proposedTeamId === teamId || dragLocked.value) return
	row.proposedTeamId = teamId
	activeSetSlot.value = null
	scheduleEnrich()
}

function onDragStart(userId: string, e: DragEvent) {
	if (dragLocked.value) {
		e.preventDefault()
		return
	}
	dragUserId.value = userId
	e.dataTransfer?.setData('text/plain', userId)
	if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
	dragUserId.value = null
	dropTeamId.value = null
}

function onDragOver(teamId: string, e: DragEvent) {
	e.preventDefault()
	if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
	dropTeamId.value = teamId
}

function onDragLeave(teamId: string) {
	if (dropTeamId.value === teamId) dropTeamId.value = null
}

function onDrop(teamId: string, e: DragEvent) {
	e.preventDefault()
	const userId = e.dataTransfer?.getData('text/plain') || dragUserId.value
	dropTeamId.value = null
	dragUserId.value = null
	if (userId) moveMember(userId, teamId)
}

async function onIncludeAdminsChange() {
	await loadPreview()
}

function close() {
	if (applying.value || savingSlot.value !== null) return
	open.value = false
}

async function apply() {
	if (!assignments.value.length || applying.value) return
	if (
		!window.confirm(
			`Apply this team assignment to ${assignments.value.length} readers? This updates memberships immediately.`,
		)
	) {
		return
	}
	applying.value = true
	error.value = ''
	try {
		const result = await api<{ assigned: number }>('/admin/assign-teams', {
			method: 'POST',
			body: JSON.stringify({
				includeAdmins: includeAdmins.value,
				assignments: assignments.value.map((a) => ({
					userId: a.userId,
					teamId: a.proposedTeamId,
				})),
			}),
		})
		emit('applied', result.assigned)
		open.value = false
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Could not apply assignments'
		error.value = message
		emit('error', message)
	} finally {
		applying.value = false
	}
}

async function saveToSlot(slot: number) {
	if (!assignments.value.length || busy.value) return
	const existing = savedSets.value.find((s) => s.slot === slot)
	const defaultLabel = existing?.label && !existing.empty ? existing.label : `Set ${slot}`
	const raw = window.prompt(`Name for set ${slot}:`, defaultLabel)
	if (raw === null) return
	const label = raw.trim() || defaultLabel
	savingSlot.value = slot
	error.value = ''
	try {
		const data = await api<{ set: SavedSet }>(`/admin/assign-teams/sets/${slot}`, {
			method: 'PUT',
			body: JSON.stringify({
				label,
				includeAdmins: includeAdmins.value,
				assignments: assignments.value.map((a) => ({
					userId: a.userId,
					teamId: a.proposedTeamId,
				})),
			}),
		})
		savedSets.value = savedSets.value.map((s) =>
			s.slot === slot ? data.set : s,
		)
		activeSetSlot.value = slot
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not save set'
	} finally {
		savingSlot.value = null
	}
}

async function previewSlot(slot: number) {
	if (busy.value) return
	loading.value = true
	error.value = ''
	try {
		const data = await api<{
			assignments: AssignmentRow[]
			standings: TeamStanding[]
			breakdown: StandingsBreakdown
			individuals: IndividualRow[]
		}>(`/admin/assign-teams/sets/${slot}/preview`, { method: 'POST' })
		applyPreviewPayload(data)
		activeSetSlot.value = slot
		const meta = savedSets.value.find((s) => s.slot === slot)
		if (meta) includeAdmins.value = meta.includeAdmins
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not load set'
	} finally {
		loading.value = false
	}
}

async function applySlot(slot: number) {
	if (busy.value) return
	const meta = savedSets.value.find((s) => s.slot === slot)
	if (
		!window.confirm(
			`Apply ${meta?.label ?? `Set ${slot}`} now? This updates team memberships immediately.`,
		)
	) {
		return
	}
	applying.value = true
	error.value = ''
	try {
		const result = await api<{ assigned: number }>(
			`/admin/assign-teams/sets/${slot}/apply`,
			{ method: 'POST' },
		)
		emit('applied', result.assigned)
		open.value = false
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Could not apply set'
		error.value = message
		emit('error', message)
	} finally {
		applying.value = false
	}
}

async function clearSlot(slot: number) {
	if (busy.value) return
	if (!window.confirm(`Clear set ${slot}?`)) return
	savingSlot.value = slot
	error.value = ''
	try {
		const data = await api<{ set: SavedSet }>(`/admin/assign-teams/sets/${slot}`, {
			method: 'DELETE',
		})
		savedSets.value = savedSets.value.map((s) =>
			s.slot === slot ? data.set : s,
		)
		if (activeSetSlot.value === slot) activeSetSlot.value = null
	} catch (e) {
		error.value = e instanceof Error ? e.message : 'Could not clear set'
	} finally {
		savingSlot.value = null
	}
}

function formatSavedAt(iso: string | null) {
	if (!iso) return ''
	try {
		return new Date(iso).toLocaleString()
	} catch {
		return iso
	}
}

function teamLabel(teamId: string | null) {
	if (!teamId) return 'Unassigned'
	return teamMeta.value.get(teamId)?.name ?? teamId
}
</script>

<template>
	<Teleport to="body">
		<div
			v-if="open"
			class="modal-backdrop"
			role="presentation"
			@click.self="close"
		>
			<div
				ref="modalRef"
				class="modal card assign-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="assign-teams-title"
			>
				<header class="modal-head">
					<div>
						<h2 id="assign-teams-title">Preview team shuffle</h2>
						<p class="muted lead">
							Drag people between teams or use the team menu. Shuffle keeps sizes
							equal first; you can override freely.
							<template v-if="assignments.length">
								· {{ assignments.length }} readers · {{ movedCount }} moving
							</template>
							<template v-if="activeSetSlot">
								· viewing set {{ activeSetSlot }}
							</template>
						</p>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						:disabled="busy"
						@click="close"
					>
						Close
					</button>
				</header>

				<div class="modal-layout">
					<aside class="saved-sets" aria-label="Saved assignment sets">
						<h3>Saved sets</h3>
						<ul class="set-list">
							<li
								v-for="s in savedSets"
								:key="s.slot"
								class="set-row"
								:class="{ active: activeSetSlot === s.slot, empty: s.empty }"
							>
								<div class="set-meta">
									<strong>{{ s.label }}</strong>
									<span v-if="s.empty" class="muted">Empty</span>
									<span v-else class="muted">
										{{ s.count }} readers
										<template v-if="s.savedAt">
											· {{ formatSavedAt(s.savedAt) }}
										</template>
									</span>
								</div>
								<div class="set-actions">
									<button
										type="button"
										class="btn btn-secondary btn-sm"
										:disabled="busy || !assignments.length"
										@click="saveToSlot(s.slot)"
									>
										{{ savingSlot === s.slot ? 'Saving…' : 'Save' }}
									</button>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										:disabled="busy || s.empty"
										@click="previewSlot(s.slot)"
									>
										Preview
									</button>
									<button
										type="button"
										class="btn btn-primary btn-sm"
										:disabled="busy || s.empty"
										@click="applySlot(s.slot)"
									>
										Apply
									</button>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										:disabled="busy || s.empty"
										@click="clearSlot(s.slot)"
									>
										Clear
									</button>
								</div>
							</li>
						</ul>
					</aside>

					<div class="main-pane">
						<div class="toggles">
							<label class="toggle">
								<input
									v-model="includeAdmins"
									type="checkbox"
									:disabled="busy"
									@change="onIncludeAdminsChange"
								/>
								<span>Include admins</span>
							</label>
							<label class="toggle">
								<input
									v-model="showStandings"
									type="checkbox"
									:disabled="busy || !assignments.length"
								/>
								<span>Preview standings &amp; individual points</span>
							</label>
							<span v-if="enriching" class="muted enrich-hint">Updating scores…</span>
						</div>

						<p v-if="error" class="panel-error">{{ error }}</p>
						<p v-else-if="loading" class="muted">Loading…</p>

						<div v-else-if="assignments.length" class="preview-body">
							<p v-if="sizeSpread > 0" class="size-warn">
								Team sizes differ by {{ sizeSpread }}
								(shuffle aims for equal counts — your edits changed that).
							</p>

							<section class="teams-preview" aria-label="Team assignments">
								<article
									v-for="g in byTeam"
									:key="g.teamId"
									class="team-col"
									:class="{ 'drop-target': dropTeamId === g.teamId }"
									:style="{ '--team-color': g.color }"
									@dragover="onDragOver(g.teamId, $event)"
									@dragleave="onDragLeave(g.teamId)"
									@drop="onDrop(g.teamId, $event)"
								>
									<header class="team-col-head">
										<div class="team-title">
											<span class="team-icon" aria-hidden="true">{{ g.icon }}</span>
											<h3>{{ g.name }}</h3>
										</div>
										<div class="team-stats">
											<span class="stat">{{ g.members.length }} people</span>
											<span class="stat points">{{ g.points }} pts</span>
										</div>
									</header>

									<ul class="member-list">
										<li
											v-for="m in g.members"
											:key="m.userId"
											class="member-card"
											:class="{
												dragging: dragUserId === m.userId,
												moved: m.currentTeamId !== m.proposedTeamId,
											}"
											draggable="true"
											@dragstart="onDragStart(m.userId, $event)"
											@dragend="onDragEnd"
										>
											<div class="member-main">
												<span class="member-name">{{ m.displayName }}</span>
												<span v-if="m.isAdmin" class="pill admin">Admin</span>
												<span
													v-if="(m.contribution ?? 0) > 0"
													class="pill pts"
													>{{ m.contribution }} pts</span
												>
											</div>
											<div class="member-meta">
												<span
													v-if="m.currentTeamId !== m.proposedTeamId"
													class="from-tag"
												>
													was {{ teamLabel(m.currentTeamId) }}
												</span>
												<label class="sr-only" :for="`move-${m.userId}`"
													>Move {{ m.displayName }}</label
												>
												<select
													:id="`move-${m.userId}`"
													class="team-select"
													:value="m.proposedTeamId"
													:disabled="dragLocked"
													@change="
														moveMember(
															m.userId,
															($event.target as HTMLSelectElement).value,
														)
													"
												>
													<option
														v-for="t in teamOptions"
														:key="t.id"
														:value="t.id"
													>
														{{ t.name }}
													</option>
												</select>
											</div>
										</li>
										<li v-if="!g.members.length" class="member-empty">
											Drop someone here
										</li>
									</ul>
								</article>
							</section>

							<section v-if="showStandings" class="standings-preview">
								<h3>Hypothetical team standings</h3>
								<p class="muted standings-hint">
									Uses existing submissions credited to each reader’s proposed team.
									Sabotage targets stay on the original target team.
								</p>
								<StandingsPanel :standings="standings" title="Preview standings" />

								<h3 class="individuals-title">Individuals (by activity)</h3>
								<div class="individuals-wrap">
									<table class="individuals">
										<thead>
											<tr>
												<th>#</th>
												<th>Reader</th>
												<th>Team</th>
												<th>Gain</th>
												<th>Attack</th>
												<th>Total</th>
											</tr>
										</thead>
										<tbody>
											<tr v-for="(row, i) in individuals" :key="row.userId">
												<td>{{ i + 1 }}</td>
												<td>{{ row.displayName }}</td>
												<td>{{ row.teamName }}</td>
												<td>+{{ row.xpGained }}</td>
												<td>+{{ row.xpDealt }}</td>
												<td>{{ row.total }}</td>
											</tr>
										</tbody>
									</table>
								</div>

								<StandingsBreakdownPanel
									v-if="breakdown"
									:breakdown="breakdown"
									title="Preview breakdown"
								/>
							</section>
						</div>
					</div>
				</div>

				<footer class="modal-actions">
					<button
						type="button"
						class="btn btn-ghost"
						:disabled="busy"
						@click="close"
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn btn-secondary"
						:disabled="busy"
						@click="loadPreview"
					>
						{{ loading ? 'Shuffling…' : 'Again' }}
					</button>
					<button
						type="button"
						class="btn btn-primary"
						:disabled="busy || !assignments.length"
						@click="apply"
					>
						{{ applying ? 'Applying…' : 'Apply' }}
					</button>
				</footer>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 800;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0.75rem;
	background: rgba(0, 0, 0, 0.65);
}

.assign-modal {
	width: min(1400px, calc(100vw - 1.5rem));
	height: min(96vh, 1100px);
	max-height: 96vh;
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
	padding: 1.1rem 1.25rem 1rem;
	overflow: hidden;
}

.modal-layout {
	display: grid;
	grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
	gap: 1rem;
	flex: 1;
	min-height: 0;
	overflow: hidden;
}

.saved-sets {
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
	min-height: 0;
	overflow: auto;
	padding: 0.75rem;
	border: 1px solid var(--realm-border, #333);
	border-radius: 10px;
	background: var(--realm-surface-alt, rgba(255, 255, 255, 0.03));
}

.main-pane {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	min-width: 0;
	min-height: 0;
	overflow: hidden;
}

.modal-head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
}

.modal-head h2 {
	margin: 0 0 0.35rem;
	font-family: var(--font-display, Cinzel, serif);
	font-size: 1.3rem;
}

.lead {
	line-height: 1.45;
	max-width: 46rem;
}

.muted {
	color: var(--realm-muted, #9a9590);
	margin: 0;
	font-size: 0.9rem;
}

.saved-sets h3 {
	margin: 0;
	font-size: 0.95rem;
}

.set-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
}

.set-row {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 0.5rem;
	padding: 0.65rem 0.7rem;
	border: 1px solid var(--realm-border, #333);
	border-radius: 8px;
	background: rgba(0, 0, 0, 0.18);
}

.set-row.active {
	border-color: var(--realm-accent, #d4634a);
}

.set-meta {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	min-width: 0;
}

.set-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.35rem;
}

.toggles {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 1rem 1.5rem;
}

.toggle {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	cursor: pointer;
	font-size: 0.95rem;
}

.enrich-hint {
	font-size: 0.85rem;
}

.panel-error {
	color: var(--realm-danger, #e07070);
	margin: 0;
}

.size-warn {
	margin: 0;
	padding: 0.55rem 0.75rem;
	border-radius: 6px;
	background: rgba(212, 99, 74, 0.12);
	border: 1px solid rgba(212, 99, 74, 0.35);
	color: #e8b4a8;
	font-size: 0.88rem;
}

.preview-body {
	overflow: auto;
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.teams-preview {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.85rem;
	align-items: stretch;
	/* Keep team board full-height; standings scroll below instead of squeezing this. */
	flex: 0 0 auto;
	height: min(58vh, 640px);
	min-height: 22rem;
}

.team-col {
	--team-color: #888;
	display: flex;
	flex-direction: column;
	border: 1px solid color-mix(in srgb, var(--team-color) 35%, var(--realm-border, #333));
	border-radius: 10px;
	background:
		linear-gradient(
			180deg,
			color-mix(in srgb, var(--team-color) 14%, transparent) 0%,
			transparent 42%
		),
		var(--realm-surface-alt, rgba(255, 255, 255, 0.03));
	min-height: 0;
	height: 100%;
	transition:
		border-color 0.15s ease,
		box-shadow 0.15s ease,
		background 0.15s ease;
}

.team-col.drop-target {
	border-color: var(--team-color);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--team-color) 45%, transparent);
}

.team-col-head {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	padding: 0.85rem 0.9rem 0.65rem;
	border-bottom: 1px solid color-mix(in srgb, var(--team-color) 25%, transparent);
}

.team-title {
	display: flex;
	align-items: center;
	gap: 0.45rem;
}

.team-icon {
	color: var(--team-color);
	font-size: 1.05rem;
}

.team-col-head h3 {
	margin: 0;
	font-size: 1.05rem;
	color: var(--team-color);
	font-family: var(--font-display, Cinzel, serif);
	letter-spacing: 0.02em;
}

.team-stats {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.stat {
	font-size: 0.75rem;
	letter-spacing: 0.02em;
	padding: 0.2rem 0.45rem;
	border-radius: 999px;
	background: rgba(0, 0, 0, 0.28);
	color: var(--realm-muted, #b0aaa4);
}

.stat.points {
	color: #e8dcc8;
}

.member-list {
	list-style: none;
	margin: 0;
	padding: 0.65rem;
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
	min-height: 4rem;
	flex: 1;
	overflow: auto;
}

.member-card {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	padding: 0.55rem 0.6rem;
	border-radius: 8px;
	border: 1px solid rgba(255, 255, 255, 0.06);
	background: rgba(0, 0, 0, 0.22);
	cursor: grab;
	user-select: none;
}

.member-card:active {
	cursor: grabbing;
}

.member-card.dragging {
	opacity: 0.45;
}

.member-card.moved {
	border-color: color-mix(in srgb, var(--team-color) 40%, transparent);
}

.member-main {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.35rem;
}

.member-name {
	font-weight: 600;
	font-size: 0.92rem;
}

.pill {
	font-size: 0.68rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 0.12rem 0.4rem;
	border-radius: 999px;
	line-height: 1.3;
}

.pill.admin {
	background: rgba(212, 99, 74, 0.2);
	color: #f0b8aa;
}

.pill.pts {
	text-transform: none;
	letter-spacing: 0;
	background: rgba(255, 255, 255, 0.08);
	color: #d5cfc6;
}

.member-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.4rem;
}

.from-tag {
	font-size: 0.75rem;
	color: var(--realm-muted, #9a9590);
}

.team-select {
	margin-left: auto;
	max-width: 100%;
	font: inherit;
	font-size: 0.78rem;
	padding: 0.25rem 0.4rem;
	border-radius: 5px;
	border: 1px solid var(--realm-border, #444);
	background: var(--realm-surface, #1a1816);
	color: inherit;
}

.member-empty {
	padding: 1.25rem 0.5rem;
	text-align: center;
	font-size: 0.85rem;
	color: var(--realm-muted, #9a9590);
	border: 1px dashed rgba(255, 255, 255, 0.12);
	border-radius: 8px;
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

.standings-preview {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	border-top: 1px solid var(--realm-border, #333);
	padding-top: 1rem;
	flex: 0 0 auto;
}

.standings-preview h3 {
	margin: 0;
	font-size: 1rem;
}

.standings-hint {
	font-size: 0.85rem;
}

.individuals-title {
	margin-top: 0.5rem;
}

.individuals-wrap {
	overflow: auto;
	max-height: 280px;
	border: 1px solid var(--realm-border, #333);
	border-radius: 6px;
}

.individuals {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.85rem;
}

.individuals th,
.individuals td {
	padding: 0.4rem 0.6rem;
	text-align: left;
	border-bottom: 1px solid var(--realm-border, #333);
}

.individuals th {
	position: sticky;
	top: 0;
	background: var(--realm-surface, #1a1816);
	z-index: 1;
}

.modal-actions {
	display: flex;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 0.5rem;
	padding-top: 0.25rem;
	border-top: 1px solid var(--realm-border, #333);
}

@media (max-width: 900px) {
	.modal-layout {
		grid-template-columns: 1fr;
		overflow: auto;
	}

	.saved-sets {
		max-height: none;
	}

	.teams-preview {
		grid-template-columns: 1fr;
		height: auto;
		min-height: 0;
	}

	.team-col {
		height: auto;
		min-height: 16rem;
	}
}

@media (max-width: 640px) {
	.assign-modal {
		padding: 0.85rem;
		width: calc(100vw - 0.75rem);
		height: 96vh;
	}

	.modal-actions {
		justify-content: stretch;
	}

	.modal-actions .btn {
		flex: 1;
	}

	.set-actions {
		grid-template-columns: 1fr 1fr;
	}
}
</style>
