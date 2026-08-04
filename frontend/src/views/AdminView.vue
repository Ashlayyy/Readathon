<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
	api,
	apiUrl,
	downloadFile,
	type AdminQuestion,
	type AdminStandingsData,
	type AdminSubmission,
	type AdminUser,
	type AuditLogEntry,
	type PublishedWeek,
	type PublishPreview,
	type PublishRangePreset,
	type StandingsHistoryEntry,
	type StandingsBreakdown,
	type TeamStanding,
} from '../lib/api';
import StandingsPanel from '../components/StandingsPanel.vue';
import StandingsBreakdownPanel from '../components/StandingsBreakdownPanel.vue';
import AdminPromptsPanel from '../components/AdminPromptsPanel.vue';
import AdminStatsPanel from '../components/AdminStatsPanel.vue';
import AdminSettingsPanel from '../components/AdminSettingsPanel.vue';
import AdminMonthlyThemesPanel from '../components/AdminMonthlyThemesPanel.vue';
import AdminAddSubmissionModal from '../components/AdminAddSubmissionModal.vue';
import AdminCoverSearchModal from '../components/AdminCoverSearchModal.vue';
import AdminAssignTeamsModal from '../components/AdminAssignTeamsModal.vue';
import ReaderLink from '../components/ReaderLink.vue';
import { useConfig } from '../composables/useConfig';
import { useCopy } from '../composables/useCopy';
import { useAdminCopy } from '../composables/useAdminCopy';
import { useAuth } from '../composables/useAuth';
import { useBodyScrollLock } from '../composables/useBodyScrollLock';
import { useFocusTrap } from '../composables/useFocusTrap';
import { useImageLightbox } from '../composables/useImageLightbox';

const { config, loadConfig } = useConfig();
const { t } = useCopy();
const { admin, section, msg, confirmMsg } = useAdminCopy();
const { user: me } = useAuth();
const { show: showLightbox } = useImageLightbox();
const users = ref<AdminUser[]>([]);
const pending = ref(0);
const stats = ref({
	totalUsers: 0,
	pending: 0,
	assigned: 0,
	submissions: 0,
	unreadQuestions: 0,
});
const usersLoaded = ref(false);
const submissionsLoaded = ref(false);
const questionsLoaded = ref(false);
const standingsLoaded = ref(false);

// Publish date range + preview
const previewOpen = ref(false);
const previewData = ref<PublishPreview | null>(null);
const previewLoading = ref(false);
const publishPreset = ref<PublishRangePreset>('lastMonToThisMon');
const publishFrom = ref(''); // YYYY-MM-DD
const publishTo = ref(''); // YYYY-MM-DD
const includeMonthlyWrapOnPublish = ref(false);
const wrapStatus = ref<{
	enabled: boolean
	isFirstMonday: boolean
	alreadySentThisMonth: boolean
	monthKey: string
	atypical: boolean
	reasons: string[]
} | null>(null);
const PUBLISH_PRESETS: { value: PublishRangePreset; label: string }[] = [
	{ value: 'lastMonToThisMon', label: 'Last Mon → this Mon' },
	{ value: 'thisWeek', label: 'This week' },
	{ value: 'lastWeek', label: 'Last week' },
	{ value: 'last7', label: 'Last 7 days' },
	{ value: 'custom', label: 'Custom' },
];

// Audit log
const auditLoaded = ref(false);
const auditLog = ref<AuditLogEntry[]>([]);
const auditTotal = ref(0);
const auditOffset = ref(0);
const AUDIT_PAGE_SIZE = 10;

const addUserOpen = ref(false);
const newUser = ref({ displayName: '', email: '', teamId: '' });
const submissions = ref<AdminSubmission[]>([]);
const deletedSubmissions = ref<AdminSubmission[]>([]);
const showDeleted = ref(false);
const restoringId = ref('');
const questions = ref<AdminQuestion[]>([]);
const unreadQuestions = ref(0);
const standings = ref<TeamStanding[] | null>(null);
const standingsImageUrl = ref<string | null>(null);
const standingsBreakdown = ref<StandingsBreakdown | null>(null);
const standingsBreakdownImageUrl = ref<string | null>(null);
const activeWeeks = ref<PublishedWeek[]>([]);
const standingsHistory = ref<StandingsHistoryEntry[]>([]);
const answerModal = ref<AdminQuestion | null>(null);
const editSubmission = ref<AdminSubmission | null>(null);
const viewSubmission = ref<AdminSubmission | null>(null);
const deleteTarget = ref<AdminSubmission | null>(null);
const modalDraft = ref('');
const inboxFilter = ref<'unread' | 'read' | 'all'>('unread');
const submissionSearch = ref('');
const submissionTypeFilter = ref<'all' | 'add' | 'sabotage'>('all');
const submissionTeamFilter = ref('');
const submissionPage = ref(1);
const SUBMISSIONS_PER_PAGE = 10;
const userPage = ref(1);
const USERS_PER_PAGE = 10;
type SubmissionSortKey =
	| 'book'
	| 'reader'
	| 'type'
	| 'affects'
	| 'impact'
	| 'date';
/** null = default order (date, newest first) */
const submissionSortKey = ref<SubmissionSortKey | null>(null);
const submissionSortDir = ref<'asc' | 'desc'>('desc');
const SUBMISSION_SORT_DEFAULT_KEY: SubmissionSortKey = 'date';
const SUBMISSION_SORT_DEFAULT_DIR: 'asc' | 'desc' = 'desc';

function primarySortDir(key: SubmissionSortKey): 'asc' | 'desc' {
	return key === 'date' || key === 'impact' ? 'desc' : 'asc';
}
const message = ref('');
const messageIsError = ref(false);
let messageClearTimer: ReturnType<typeof setTimeout> | null = null;
const loading = ref('');
const activeTab = ref<
	| 'inbox'
	| 'teams'
	| 'standings'
	| 'users'
	| 'submissions'
	| 'prompts'
	| 'stats'
	| 'audit'
	| 'themes'
	| 'settings'
>('inbox');
/** Keep Settings/Themes mounted after first visit so unsaved sticky banners persist. */
const settingsMounted = ref(false);
const themesMounted = ref(false);
const addSubmissionOpen = ref(false);
const coverSearchOpen = ref(false);
const navOpen = ref(false);
const assignTeamsOpen = ref(false);

const anyModalOpen = computed(
	() =>
		(Boolean(message.value) && messageIsError.value) ||
		assignTeamsOpen.value ||
		addUserOpen.value ||
		!!answerModal.value ||
		!!editSubmission.value ||
		!!viewSubmission.value ||
		!!deleteTarget.value ||
		addSubmissionOpen.value ||
		previewOpen.value,
);
useBodyScrollLock(anyModalOpen);

const answerModalRef = ref<HTMLElement | null>(null);
const addUserModalRef = ref<HTMLElement | null>(null);
const deleteModalRef = ref<HTMLElement | null>(null);
const previewModalRef = ref<HTMLElement | null>(null);
const messageModalRef = ref<HTMLElement | null>(null);
const answerModalActive = computed(() => !!answerModal.value);
const deleteModalActive = computed(() => !!deleteTarget.value);
const messageModalActive = computed(
	() => Boolean(message.value) && messageIsError.value,
);
useFocusTrap(answerModalActive, answerModalRef);
useFocusTrap(addUserOpen, addUserModalRef);
useFocusTrap(deleteModalActive, deleteModalRef);
useFocusTrap(previewOpen, previewModalRef);
useFocusTrap(messageModalActive, messageModalRef);

const filteredSubmissions = computed(() => {
	const q = submissionSearch.value.trim().toLowerCase();
	const filtered = submissions.value.filter((s) => {
		if (
			submissionTypeFilter.value !== 'all' &&
			s.submissionType !== submissionTypeFilter.value
		) {
			return false;
		}
		if (
			submissionTeamFilter.value &&
			s.userTeamId !== submissionTeamFilter.value
		) {
			return false;
		}
		if (!q) return true;
		return (
			s.bookTitle.toLowerCase().includes(q) ||
			s.bookAuthor.toLowerCase().includes(q) ||
			s.userName.toLowerCase().includes(q) ||
			s.userEmail.toLowerCase().includes(q)
		);
	});

	const key = submissionSortKey.value ?? SUBMISSION_SORT_DEFAULT_KEY;
	const dir =
		(submissionSortKey.value == null
			? SUBMISSION_SORT_DEFAULT_DIR
			: submissionSortDir.value) === 'asc'
			? 1
			: -1;
	return [...filtered].sort((a, b) => {
		const cmp = compareSubmissions(a, b, key);
		if (cmp !== 0) return cmp * dir;
		// Stable fallback: newest first when clearing / default
		return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
	});
});

function submissionImpactSortValue(s: AdminSubmission) {
	if (s.submissionType === 'add') return s.totalImpact;
	const gained = s.pageBonus ?? 0;
	const damage = Math.abs((s.promptPoints ?? 0) + (s.bonusPoints ?? 0));
	return gained + damage;
}

function compareSubmissions(
	a: AdminSubmission,
	b: AdminSubmission,
	key: SubmissionSortKey,
): number {
	switch (key) {
		case 'book':
			return a.bookTitle.localeCompare(b.bookTitle, undefined, {
				sensitivity: 'base',
			});
		case 'reader':
			return a.userName.localeCompare(b.userName, undefined, {
				sensitivity: 'base',
			});
		case 'type':
			return a.submissionType.localeCompare(b.submissionType);
		case 'affects':
			return submissionAffectsLabel(a).localeCompare(
				submissionAffectsLabel(b),
				undefined,
				{ sensitivity: 'base' },
			);
		case 'impact':
			return submissionImpactSortValue(a) - submissionImpactSortValue(b);
		case 'date':
			return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
		default:
			return 0;
	}
}

function toggleSubmissionSort(key: SubmissionSortKey) {
	if (submissionSortKey.value !== key) {
		submissionSortKey.value = key;
		submissionSortDir.value = primarySortDir(key);
	} else if (submissionSortDir.value === primarySortDir(key)) {
		submissionSortDir.value =
			submissionSortDir.value === 'asc' ? 'desc' : 'asc';
	} else {
		// Third click: back to default (date, newest first)
		submissionSortKey.value = null;
		submissionSortDir.value = SUBMISSION_SORT_DEFAULT_DIR;
	}
	submissionPage.value = 1;
}

function submissionSortAria(key: SubmissionSortKey) {
	if (submissionSortKey.value !== key) return 'none';
	return submissionSortDir.value === 'asc' ? 'ascending' : 'descending';
}

function submissionSortMark(key: SubmissionSortKey) {
	if (submissionSortKey.value !== key) return '↕';
	return submissionSortDir.value === 'asc' ? '↑' : '↓';
}

const submissionPageCount = computed(() =>
	Math.max(1, Math.ceil(filteredSubmissions.value.length / SUBMISSIONS_PER_PAGE)),
);

const pagedSubmissions = computed(() => {
	const page = Math.min(submissionPage.value, submissionPageCount.value);
	const start = (page - 1) * SUBMISSIONS_PER_PAGE;
	return filteredSubmissions.value.slice(start, start + SUBMISSIONS_PER_PAGE);
});

const submissionRangeLabel = computed(() => {
	const total = filteredSubmissions.value.length;
	if (total === 0) return '0';
	const page = Math.min(submissionPage.value, submissionPageCount.value);
	const start = (page - 1) * SUBMISSIONS_PER_PAGE + 1;
	const end = Math.min(page * SUBMISSIONS_PER_PAGE, total);
	return `${start}–${end}`;
});

watch(
	[submissionSearch, submissionTypeFilter, submissionTeamFilter],
	() => {
		submissionPage.value = 1;
	},
);

watch(submissionPageCount, (count) => {
	if (submissionPage.value > count) submissionPage.value = count;
});

function goSubmissionPage(page: number) {
	submissionPage.value = Math.min(Math.max(1, page), submissionPageCount.value);
}

const userPageCount = computed(() =>
	Math.max(1, Math.ceil(users.value.length / USERS_PER_PAGE)),
);

const pagedUsers = computed(() => {
	const page = Math.min(userPage.value, userPageCount.value);
	const start = (page - 1) * USERS_PER_PAGE;
	return users.value.slice(start, start + USERS_PER_PAGE);
});

const userRangeLabel = computed(() => {
	const total = users.value.length;
	if (total === 0) return '0';
	const page = Math.min(userPage.value, userPageCount.value);
	const start = (page - 1) * USERS_PER_PAGE + 1;
	const end = Math.min(page * USERS_PER_PAGE, total);
	return `${start}–${end}`;
});

watch(userPageCount, (count) => {
	if (userPage.value > count) userPage.value = count;
});

function goUserPage(page: number) {
	userPage.value = Math.min(Math.max(1, page), userPageCount.value);
}

onMounted(async () => {
	applyPublishPreset('lastMonToThisMon');
	await loadConfig();
	try {
		const tabParam = new URLSearchParams(window.location.search).get('tab');
		const allowed = new Set([
			'inbox',
			'teams',
			'standings',
			'users',
			'submissions',
			'prompts',
			'stats',
			'audit',
			'themes',
			'settings',
		]);
		await loadStats();
		if (tabParam && allowed.has(tabParam)) {
			activeTab.value = tabParam as typeof activeTab.value;
		} else if (stats.value.unreadQuestions > 0) {
			activeTab.value = 'inbox';
		}
		if (activeTab.value === 'settings') settingsMounted.value = true;
		if (activeTab.value === 'themes') themesMounted.value = true;
		await ensureTabData(activeTab.value);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('loadFailed'), true);
	}
});

async function loadStats() {
	const data = await api<{
		totalUsers: number;
		pending: number;
		assigned: number;
		submissions: number;
		unreadQuestions: number;
	}>('/admin/stats');
	stats.value = data;
	pending.value = data.pending;
	unreadQuestions.value = data.unreadQuestions;
}

async function loadUsers(force = false) {
	if (usersLoaded.value && !force) return;
	const u = await api<{ users: AdminUser[]; pending: number; assigned: number }>(
		'/admin/users',
	);
	users.value = u.users;
	pending.value = u.pending;
	usersLoaded.value = true;
	stats.value.totalUsers = u.users.length;
	stats.value.pending = u.pending;
	stats.value.assigned = u.assigned;
}

async function loadSubmissions(force = false) {
	if (submissionsLoaded.value && !force) return;
	const query = showDeleted.value ? '?includeDeleted=1' : '';
	const s = await api<{
		submissions: AdminSubmission[];
		deletedSubmissions: AdminSubmission[];
	}>(`/admin/submissions${query}`);
	submissions.value = s.submissions;
	deletedSubmissions.value = s.deletedSubmissions ?? [];
	submissionsLoaded.value = true;
	stats.value.submissions = s.submissions.length;
}

async function toggleShowDeleted() {
	showDeleted.value = !showDeleted.value;
	await loadSubmissions(true);
}

async function restoreSubmission(s: AdminSubmission) {
	restoringId.value = s.id;
	showMessage('');
	try {
		await api(`/admin/submissions/${s.id}/restore`, { method: 'POST' });
		showMessage(msg('submissionRestored') || 'Submission restored.');
		await Promise.all([loadSubmissions(true), loadStats()]);
	} catch (e) {
		showMessage(
			e instanceof Error
				? e.message
				: msg('submissionRestoreFailed') || 'Failed to restore submission',
			true,
		);
	} finally {
		restoringId.value = '';
	}
}

async function loadAuditLog(force = false) {
	if (auditLoaded.value && !force) return;
	const data = await api<{ total: number; limit: number; offset: number; logs: AuditLogEntry[] }>(
		`/admin/audit-log?limit=${AUDIT_PAGE_SIZE}&offset=${auditOffset.value}`,
	);
	auditLog.value = data.logs;
	auditTotal.value = data.total;
	auditLoaded.value = true;
}

async function goAuditPage(offset: number) {
	auditOffset.value = Math.max(0, offset);
	await loadAuditLog(true);
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
	'settings.updated': 'Settings updated',
	'settings.downtime_toggled': 'Downtime toggled',
	'user.team_assigned': 'Team assigned',
	'teams.randomized': 'Teams randomized',
	'teams.set_saved': 'Team set saved',
	'teams.set_applied': 'Team set applied',
	'submission.soft_deleted': 'Submission deleted',
	'submission.restored': 'Submission restored',
	'standings.published': 'Standings published',
	'standings.unpublished': 'Standings unpublished',
};

function auditActionLabel(action: string): string {
	return AUDIT_ACTION_LABELS[action] ?? action.replace(/\./g, ' · ');
}

function auditActionTone(action: string): 'neutral' | 'warn' | 'ok' | 'danger' {
	if (action.includes('delete') || action.includes('unpublish')) return 'danger';
	if (action.includes('downtime') || action.includes('soft_')) return 'warn';
	if (action.includes('publish') || action.includes('restored') || action.includes('assigned'))
		return 'ok';
	return 'neutral';
}

function auditEntityLabel(entry: AuditLogEntry): string {
	if (!entry.entityType) return '—';
	const short = entry.entityId ? entry.entityId.slice(-6) : '';
	const pretty =
		entry.entityType === 'SiteSettings'
			? 'Site settings'
			: entry.entityType === 'PublishedStandings'
				? 'Published standings'
				: entry.entityType;
	return short ? `${pretty} · ${short}` : pretty;
}

type AuditDetailChip = { label: string; value: string };

function auditDetailChips(detail: unknown): AuditDetailChip[] {
	if (detail == null) return [];
	if (typeof detail === 'string') {
		const t = detail.trim();
		return t ? [{ label: 'Note', value: t }] : [];
	}
	if (typeof detail !== 'object' || Array.isArray(detail)) {
		return [{ label: 'Detail', value: auditDetailText(detail) }];
	}
	const obj = detail as Record<string, unknown>;
	return Object.entries(obj).map(([key, value]) => {
		const label = key
			.replace(/([A-Z])/g, ' $1')
			.replace(/_/g, ' ')
			.replace(/^\w/, (c) => c.toUpperCase())
			.trim();
		let display: string;
		if (typeof value === 'boolean') display = value ? 'Yes' : 'No';
		else if (value == null) display = '—';
		else if (Array.isArray(value)) display = value.map(String).join(', ') || '—';
		else if (typeof value === 'object') {
			try {
				display = JSON.stringify(value);
			} catch {
				display = String(value);
			}
		} else display = String(value);
		return { label, value: display };
	});
}

function auditDetailText(detail: unknown): string {
	if (detail == null) return '';
	if (typeof detail === 'string') return detail;
	try {
		return JSON.stringify(detail);
	} catch {
		return String(detail);
	}
}

const auditPage = computed(() => Math.floor(auditOffset.value / AUDIT_PAGE_SIZE) + 1);
const auditPageCount = computed(() =>
	Math.max(1, Math.ceil(auditTotal.value / AUDIT_PAGE_SIZE)),
);

function goAuditPageNum(page: number) {
	const p = Math.min(Math.max(1, page), auditPageCount.value);
	void goAuditPage((p - 1) * AUDIT_PAGE_SIZE);
}

async function downloadSubmissionsCsv() {
	try {
		const query = showDeleted.value ? '?includeDeleted=1' : '';
		await downloadFile(`/admin/export/submissions.csv${query}`, 'submissions.csv');
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('downloadFailed'), true);
	}
}

async function downloadStandingsHistoryCsv() {
	try {
		await downloadFile('/admin/export/standings-history.csv', 'standings-history.csv');
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('downloadFailed'), true);
	}
}

async function loadQuestions(force = false) {
	if (questionsLoaded.value && !force) return;
	const q = await api<{ questions: AdminQuestion[]; unread: number }>(
		'/admin/questions',
	);
	questions.value = q.questions;
	unreadQuestions.value = q.unread;
	stats.value.unreadQuestions = q.unread;
	questionsLoaded.value = true;
}


function toDateInputValue(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Monday 00:00 local for the ISO week containing `date`. */
function startOfIsoWeek(date = new Date()): Date {
	const monday = new Date(date);
	monday.setHours(0, 0, 0, 0);
	monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
	return monday;
}

function applyPublishPreset(preset: PublishRangePreset) {
	publishPreset.value = preset;
	if (preset === 'custom') return;
	const now = new Date();
	const thisMon = startOfIsoWeek(now);
	if (preset === 'lastMonToThisMon') {
		const lastMon = new Date(thisMon);
		lastMon.setDate(lastMon.getDate() - 7);
		publishFrom.value = toDateInputValue(lastMon);
		publishTo.value = toDateInputValue(thisMon);
	} else if (preset === 'thisWeek') {
		const sunday = new Date(thisMon);
		sunday.setDate(sunday.getDate() + 6);
		publishFrom.value = toDateInputValue(thisMon);
		publishTo.value = toDateInputValue(sunday);
	} else if (preset === 'lastWeek') {
		const lastMon = new Date(thisMon);
		lastMon.setDate(lastMon.getDate() - 7);
		const lastSun = new Date(lastMon);
		lastSun.setDate(lastSun.getDate() + 6);
		publishFrom.value = toDateInputValue(lastMon);
		publishTo.value = toDateInputValue(lastSun);
	} else if (preset === 'last7') {
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		const from = new Date(today);
		from.setDate(from.getDate() - 6);
		publishFrom.value = toDateInputValue(from);
		publishTo.value = toDateInputValue(today);
	}
}

/** Date inputs are edited directly by the admin, so any manual change means "custom". */
function onPublishDateInput() {
	publishPreset.value = 'custom';
}

async function ensureTabData(tab: typeof activeTab.value) {
	if (tab === 'inbox') await loadQuestions();
	else if (tab === 'teams') await Promise.all([loadStats(), loadUsers()]);
	else if (tab === 'users') await loadUsers();
	else if (tab === 'submissions')
		await Promise.all([loadSubmissions(), loadUsers()]);
	else if (tab === 'standings') {
		await Promise.all([loadStandings(true), loadWrapStatus()]);
	}	else if (tab === 'audit') await loadAuditLog();
	// prompts: AdminPromptsPanel loads itself when mounted (v-if)
}

watch(activeTab, (tab) => {
	navOpen.value = false;
	ensureTabData(tab).catch((e) => {
		showMessage(e instanceof Error ? e.message : msg('loadFailed'), true);
	});
});

const assignedUserCount = computed(
	() =>
		usersLoaded.value
			? users.value.filter((u) => u.status === 'assigned').length
			: stats.value.assigned,
);

const usersCount = computed(() =>
	usersLoaded.value ? users.value.length : stats.value.totalUsers,
);

const submissionsCount = computed(() =>
	submissionsLoaded.value ? submissions.value.length : stats.value.submissions,
);

function openAddSubmission() {
	viewSubmission.value = null;
	editSubmission.value = null;
	void loadUsers().then(() => {
		addSubmissionOpen.value = true;
	});
}

function openCoverSearch() {
	coverSearchOpen.value = true;
}

async function onCoversApplied(updated: number) {
	showMessage(
		updated === 1
			? 'Applied 1 cover update.'
			: `Applied ${updated} cover updates.`,
	);
	await loadSubmissions(true);
}

function closeSubmissionModal() {
	addSubmissionOpen.value = false;
	editSubmission.value = null;
	viewSubmission.value = null;
}

async function openViewSubmission(s: AdminSubmission) {
	addSubmissionOpen.value = false;
	editSubmission.value = null;
	try {
		const { submission } = await api<{ submission: AdminSubmission }>(
			`/admin/submissions/${s.id}`,
		);
		viewSubmission.value = submission;
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('loadFailed'), true);
	}
}

async function openEditSubmission(s: AdminSubmission) {
	addSubmissionOpen.value = false;
	viewSubmission.value = null;
	try {
		const { submission } = await api<{ submission: AdminSubmission }>(
			`/admin/submissions/${s.id}`,
		);
		editSubmission.value = submission;
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('loadFailed'), true);
	}
}

function switchViewToEdit() {
	if (!viewSubmission.value) return;
	const s = viewSubmission.value;
	viewSubmission.value = null;
	editSubmission.value = s;
}

function teamById(id: string | null | undefined) {
	if (!id || !config.value) return null;
	return config.value.teams.find((t) => t.id === id) ?? null;
}

function submissionAffectsLabel(s: AdminSubmission) {
	if (s.submissionType === 'sabotage') {
		const t = teamById(s.targetTeamId);
		return t ? `${t.icon} ${t.name}` : 'Unknown realm';
	}
	const t = teamById(s.userTeamId);
	return t ? `${t.icon} ${t.name}` : 'Their realm';
}

/** Add: +120. Sabotage: +20 / −45 (page gain to self / damage to rival). */
function formatSubmissionImpactParts(s: AdminSubmission) {
	if (s.submissionType === 'add') {
		const total = s.totalImpact;
		return [
			{ text: total > 0 ? `+${total}` : `${total}`, tone: 'gain' as const },
		];
	}
	const gained = s.pageBonus ?? 0;
	const damage = Math.abs((s.promptPoints ?? 0) + (s.bonusPoints ?? 0));
	const parts: { text: string; tone: 'gain' | 'sep' | 'dmg' }[] = [];
	if (gained > 0) parts.push({ text: `+${gained}`, tone: 'gain' });
	if (gained > 0 && damage > 0) parts.push({ text: '/', tone: 'sep' });
	if (damage > 0) parts.push({ text: `−${damage}`, tone: 'dmg' });
	if (parts.length === 0) parts.push({ text: '0', tone: 'sep' });
	return parts;
}

function askDeleteSubmission(s: AdminSubmission) {
	deleteTarget.value = s;
}

function cancelDeleteSubmission() {
	deleteTarget.value = null;
}

async function onSubmissionCreated() {
	closeSubmissionModal();
	showMessage(msg('submissionCreated') || 'Submission added for that reader.');
	await Promise.all([loadSubmissions(true), loadStats()]);
}

async function onSubmissionUpdated() {
	closeSubmissionModal();
	showMessage(msg('submissionUpdated'));
	await loadSubmissions(true);
}

function setTab(tab: typeof activeTab.value) {
	activeTab.value = tab;
	if (tab === 'settings') settingsMounted.value = true;
	if (tab === 'themes') themesMounted.value = true;
	const url = new URL(window.location.href);
	url.searchParams.set('tab', tab);
	window.history.replaceState({}, '', url);
}

const sortedQuestions = computed(() =>
	[...questions.value].sort((a, b) => {
		if (a.status !== b.status) return a.status === 'unread' ? -1 : 1;
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	}),
);

const filteredQuestions = computed(() => {
	if (inboxFilter.value === 'unread') {
		return sortedQuestions.value.filter((q) => q.status === 'unread');
	}
	if (inboxFilter.value === 'read') {
		return sortedQuestions.value.filter((q) => q.status !== 'unread');
	}
	return sortedQuestions.value;
});

function showMessage(msg: string, isError = false) {
	message.value = msg;
	messageIsError.value = isError && !!msg;
	if (messageClearTimer) {
		clearTimeout(messageClearTimer);
		messageClearTimer = null;
	}
	// Success toasts auto-dismiss; errors stay until dismissed.
	if (msg && !isError) {
		messageClearTimer = setTimeout(() => {
			message.value = '';
			messageIsError.value = false;
			messageClearTimer = null;
		}, 4500);
	}
}

function clearMessage() {
	if (messageClearTimer) {
		clearTimeout(messageClearTimer);
		messageClearTimer = null;
	}
	message.value = '';
	messageIsError.value = false;
}

const canOpenAssignPreview = computed(() => {
	if (!usersLoaded.value) return stats.value.totalUsers > 0;
	return users.value.some(
		(u) => u.status === 'pending' || u.status === 'assigned',
	);
});

function openAssignTeamsPreview() {
	showMessage('');
	assignTeamsOpen.value = true;
}

async function onAssignTeamsApplied(assigned: number) {
	showMessage(msg('assignedTeams', { count: assigned }));
	await Promise.all([loadUsers(true), loadStats()]);
}

async function setUserTeam(userId: string, teamId: string) {
	loading.value = `team-${userId}`;
	showMessage('');
	try {
		await api(`/admin/users/${userId}/team`, {
			method: 'PATCH',
			body: JSON.stringify({ teamId: teamId || null }),
		});
		showMessage(msg('teamUpdated'));
		await Promise.all([loadUsers(true), loadStats()]);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('teamUpdateFailed'), true);
	} finally {
		loading.value = '';
	}
}

async function setUserAdmin(userId: string, isAdmin: boolean) {
	loading.value = `admin-${userId}`;
	showMessage('');
	try {
		await api(`/admin/users/${userId}/admin`, {
			method: 'PATCH',
			body: JSON.stringify({ isAdmin }),
		});
		showMessage('Admin status updated.');
		await loadUsers(true);
	} catch (e) {
		showMessage(
			e instanceof Error ? e.message : 'Failed to update admin status',
			true,
		);
	} finally {
		loading.value = '';
	}
}


function openAddUser() {
	newUser.value = { displayName: '', email: '', teamId: '' };
	addUserOpen.value = true;
}

function closeAddUser() {
	addUserOpen.value = false;
}

async function submitAddUser() {
	loading.value = 'add-user';
	showMessage('');
	try {
		await api('/admin/users', {
			method: 'POST',
			body: JSON.stringify({
				displayName: newUser.value.displayName,
				email: newUser.value.email,
				teamId: newUser.value.teamId || null,
			}),
		});
		showMessage(msg('userCreated'));
		closeAddUser();
		await Promise.all([loadUsers(true), loadStats()]);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('userCreateFailed'), true);
	} finally {
		loading.value = '';
	}
}

async function markQuestion(id: string, status: 'read' | 'unread') {
	try {
		await api(`/admin/questions/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ status }),
		});
		await Promise.all([loadQuestions(true), loadStats()]);
	} catch (e) {
		showMessage(
			e instanceof Error ? e.message : msg('messageUpdateFailed'),
			true,
		);
	}
}

async function deleteQuestion(id: string) {
	if (!confirm(confirmMsg('deleteQuestion'))) return;
	try {
		await api(`/admin/questions/${id}`, { method: 'DELETE' });
		showMessage(msg('messageRemoved'));
		if (answerModal.value?.id === id) closeAnswerModal();
		await Promise.all([loadQuestions(true), loadStats()]);
	} catch (e) {
		showMessage(
			e instanceof Error ? e.message : msg('messageRemoveFailed'),
			true,
		);
	}
}

function openAnswerModal(q: AdminQuestion) {
	answerModal.value = q;
	modalDraft.value = q.answer ?? '';
}

function closeAnswerModal() {
	answerModal.value = null;
	modalDraft.value = '';
}

async function submitModalAnswer() {
	if (!answerModal.value) return;
	const answer = modalDraft.value.trim();
	if (answer.length < 2) {
		showMessage(msg('answerTooShort'), true);
		return;
	}
	const id = answerModal.value.id;
	loading.value = 'answer';
	showMessage('');
	try {
		await api(`/admin/questions/${id}/answer`, {
			method: 'POST',
			body: JSON.stringify({ answer }),
		});
		showMessage(msg('replySent'));
		closeAnswerModal();
		await Promise.all([loadQuestions(true), loadStats()]);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('replyFailed'), true);
	} finally {
		loading.value = '';
	}
}

async function confirmDeleteSubmission() {
	const s = deleteTarget.value;
	if (!s) return;
	loading.value = `del-sub-${s.id}`;
	showMessage('');
	try {
		await api(`/admin/submissions/${s.id}`, { method: 'DELETE' });
		showMessage(msg('submissionDeleted'));
		if (
			editSubmission.value?.id === s.id ||
			viewSubmission.value?.id === s.id
		) {
			closeSubmissionModal();
		}
		deleteTarget.value = null;
		await Promise.all([loadSubmissions(true), loadStats()]);
	} catch (e) {
		showMessage(
			e instanceof Error ? e.message : msg('submissionDeleteFailed'),
			true,
		);
	} finally {
		loading.value = '';
	}
}

async function loadStandings(force = false) {
	if (standingsLoaded.value && !force) return;
	loading.value = 'standings';
	try {
		const data = await api<AdminStandingsData>('/admin/standings/current');
		standings.value = data.current.standings;
		standingsBreakdown.value = data.current.breakdown;
		const bust = `t=${Date.now()}`;
		standingsImageUrl.value = apiUrl(
			`/admin/standings/preview.svg?kind=standings&${bust}`,
		);
		standingsBreakdownImageUrl.value = apiUrl(
			`/admin/standings/preview.svg?kind=breakdown&${bust}`,
		);
		activeWeeks.value = data.activeWeeks;
		standingsHistory.value = data.history;
		standingsLoaded.value = true;
	} finally {
		loading.value = '';
	}
}

function publishRangeQuery(): string {
	const qs = new URLSearchParams();
	qs.set('preset', publishPreset.value);
	if (publishFrom.value) qs.set('from', publishFrom.value);
	if (publishTo.value) qs.set('to', publishTo.value);
	return qs.toString();
}

async function openPublishPreview() {
	previewLoading.value = true;
	showMessage('');
	try {
		previewData.value = await api<PublishPreview>(
			`/admin/standings/publish-preview?${publishRangeQuery()}`,
		);
		previewOpen.value = true;
	} catch (e) {
		showMessage(e instanceof Error ? e.message : 'Failed to load preview', true);
	} finally {
		previewLoading.value = false;
	}
}

function closePreview() {
	previewOpen.value = false;
}

async function confirmPublishFromPreview() {
	previewOpen.value = false;
	await publishThisWeek();
}

async function loadWrapStatus() {
	try {
		const data = await api<{
			wrap: {
				enabled: boolean
				isFirstMonday: boolean
				alreadySentThisMonth: boolean
				monthKey: string
				atypical: boolean
				reasons: string[]
			}
		}>('/admin/standings/wrap-status');
		wrapStatus.value = data.wrap;
		// Default on only when it's the normal first-Monday slot and not yet sent
		if (
			data.wrap.enabled &&
			data.wrap.isFirstMonday &&
			!data.wrap.alreadySentThisMonth
		) {
			includeMonthlyWrapOnPublish.value = true;
		}
	} catch {
		wrapStatus.value = null;
	}
}

function confirmAtypicalWrapIfNeeded(): boolean {
	if (!includeMonthlyWrapOnPublish.value || !wrapStatus.value?.atypical) {
		return true;
	}
	const reasons = wrapStatus.value.reasons.length
		? `\n\n• ${wrapStatus.value.reasons.join('\n• ')}`
		: '';
	return confirm(
		`You’re about to attach the 4-week wrap outside the normal first-Monday publish.${reasons}\n\nPublish with the wrap anyway?`,
	);
}

async function publishThisWeek() {
	if (includeMonthlyWrapOnPublish.value && wrapStatus.value && !wrapStatus.value.enabled) {
		showMessage(
			'4-week wrap is disabled in Settings. Enable it under Discord settings, or turn off the wrap toggle.',
			true,
		);
		return;
	}
	if (!confirmAtypicalWrapIfNeeded()) return;

	loading.value = 'publish';
	showMessage('');
	try {
		const result = await api<{
			weekLabel: string;
			emailsSent?: number;
			discordSent?: boolean;
			monthlyWrap?: boolean;
		}>('/admin/standings/publish', {
			method: 'POST',
			body: JSON.stringify({
				preset: publishPreset.value,
				from: publishFrom.value,
				to: publishTo.value,
				includeMonthlyWrap: Boolean(
					wrapStatus.value?.enabled && includeMonthlyWrapOnPublish.value,
				),
				confirmAtypicalWrap: Boolean(
					includeMonthlyWrapOnPublish.value && wrapStatus.value?.atypical,
				),
			}),
		});
		const emailNote = result.emailsSent
			? msg('emailNote', { count: result.emailsSent })
			: '';
		const discordNote = result.discordSent ? msg('discordNote') : '';
		const wrapNote = result.monthlyWrap ? ' 4-week wrap included.' : '';
		showMessage(
			msg('published', { weekLabel: result.weekLabel, emailNote, discordNote }) +
				wrapNote,
		);
		await Promise.all([loadStandings(true), loadWrapStatus()]);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('publishFailed'), true);
	} finally {
		loading.value = '';
	}
}

async function unpublishWeek(publicationId: string, weekLabel: string) {
	if (!confirm(confirmMsg('unpublishWeek', { weekLabel }))) return;
	loading.value = 'unpublish';
	showMessage('');
	try {
		await api('/admin/standings/unpublish', {
			method: 'POST',
			body: JSON.stringify({ publicationId }),
		});
		showMessage(msg('unpublished', { weekLabel }));
		await loadStandings(true);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('unpublishFailed'), true);
	} finally {
		loading.value = '';
	}
}

async function downloadCurrentSvg() {
	try {
		const weekKey = activeWeeks.value[0]?.weekKey ?? 'current';
		await downloadFile(
			'/admin/standings/current.svg',
			`standings-${weekKey}.svg`,
		);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('downloadFailed'), true);
	}
}

async function downloadHistorySvg(entry: StandingsHistoryEntry) {
	try {
		await downloadFile(
			`/admin/standings/history/${entry.id}.svg`,
			`standings-${entry.weekKey}-${entry.action}.svg`,
		);
	} catch (e) {
		showMessage(e instanceof Error ? e.message : msg('downloadFailed'), true);
	}
}
</script>

<template>
	<main v-if="config" class="page admin-page">
		<header class="admin-topbar">
			<div class="admin-topbar-text">
				<h1 class="page-title">{{ admin?.title }}</h1>
				<p class="page-lead">{{ admin?.lead }}</p>
			</div>
			<button
				type="button"
				class="btn btn-secondary btn-sm admin-nav-toggle"
				:aria-expanded="navOpen"
				aria-controls="admin-sidebar"
				@click="navOpen = !navOpen"
			>
				{{ navOpen ? 'Close menu' : 'Sections' }}
			</button>
		</header>

		<Teleport to="body">
			<div
				v-if="message && messageIsError"
				class="modal-backdrop admin-message-backdrop"
				@click.self="clearMessage"
				@keydown.esc="clearMessage"
			>
				<div
					ref="messageModalRef"
					class="modal card admin-message-modal"
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="admin-message-title"
					tabindex="-1"
				>
					<h2 id="admin-message-title" class="admin-message-title">
						Something went wrong
					</h2>
					<p class="admin-message-body is-error">
						{{ message }}
					</p>
					<div class="modal-actions">
						<button type="button" class="btn btn-primary" @click="clearMessage">
							OK
						</button>
					</div>
				</div>
			</div>
			<div
				v-else-if="message"
				class="admin-success-toast"
				role="status"
				aria-live="polite"
			>
				{{ message }}
				<button
					type="button"
					class="admin-success-toast-dismiss"
					aria-label="Dismiss"
					@click="clearMessage"
				>
					×
				</button>
			</div>
		</Teleport>

		<div class="admin-layout">
			<aside
				id="admin-sidebar"
				class="admin-sidebar"
				:class="{ open: navOpen }"
				aria-label="Admin sections"
			>
				<nav class="admin-side-nav">
					<button
						type="button"
						:class="{ active: activeTab === 'inbox' }"
						@click="setTab('inbox')"
					>
						<span>{{ section('tabs').inbox }}</span>
						<span v-if="unreadQuestions > 0" class="tab-badge">{{
							unreadQuestions
						}}</span>
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'teams' }"
						@click="setTab('teams')"
					>
						{{ section('tabs').teams }}
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'standings' }"
						@click="setTab('standings')"
					>
						{{ section('tabs').standings }}
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'users' }"
						@click="setTab('users')"
					>
						{{ section('tabs').users }}
						<span class="nav-meta"
							>{{ assignedUserCount }}/{{ usersCount }}</span
						>
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'submissions' }"
						@click="setTab('submissions')"
					>
						{{ section('tabs').submissions }}
						<span class="nav-meta">{{ submissionsCount }}</span>
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'stats' }"
						@click="setTab('stats')"
					>
						{{ section('tabs').stats ?? 'Stats' }}
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'prompts' }"
						@click="setTab('prompts')"
					>
						{{ section('tabs').prompts }}
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'audit' }"
						@click="setTab('audit')"
					>
						{{ section('tabs').audit ?? 'Audit' }}
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'themes' }"
						@click="setTab('themes')"
					>
						Themes
					</button>
					<button
						type="button"
						:class="{ active: activeTab === 'settings' }"
						@click="setTab('settings')"
					>
						{{ section('tabs').settings ?? 'Settings' }}
					</button>
				</nav>
			</aside>

			<div v-if="navOpen" class="admin-nav-backdrop" @click="navOpen = false" />

			<div class="admin-main">
				<!-- Inbox -->
				<section v-if="activeTab === 'inbox'" class="card admin-section">
					<div v-if="!questionsLoaded" class="page-state" style="min-height: 12rem">
						<div class="page-spinner" role="status" aria-label="Loading" />
						<p>Loading inbox…</p>
					</div>
					<template v-else>
					<div class="inbox-header">
						<div>
							<h2>{{ section('inbox').title }}</h2>
							<p class="section-desc">{{ section('inbox').lead }}</p>
						</div>
						<div
							class="inbox-filters"
							role="tablist"
							aria-label="Filter questions"
						>
							<button
								type="button"
								:class="{ active: inboxFilter === 'unread' }"
								@click="inboxFilter = 'unread'"
							>
								{{ section('inbox').filterUnread }}
							</button>
							<button
								type="button"
								:class="{ active: inboxFilter === 'read' }"
								@click="inboxFilter = 'read'"
							>
								{{ section('inbox').filterRead }}
							</button>
							<button
								type="button"
								:class="{ active: inboxFilter === 'all' }"
								@click="inboxFilter = 'all'"
							>
								{{ section('inbox').filterAll }}
							</button>
						</div>
					</div>

					<div v-if="filteredQuestions.length === 0" class="empty-inbox">
						<p>
							{{
								questions.length === 0
									? section('inbox').emptyNone
									: section('inbox').emptyFilter
							}}
						</p>
					</div>

					<ul v-else class="inbox-list">
						<li
							v-for="q in filteredQuestions"
							:key="q.id"
							class="inbox-item"
							:class="{ unread: q.status === 'unread' }"
						>
							<div class="inbox-meta">
								<div>
									<strong>{{ q.displayName }}</strong>
									<span class="inbox-email">{{ q.email }}</span>
								</div>
								<time>{{ new Date(q.createdAt).toLocaleString() }}</time>
							</div>
							<p class="inbox-message">{{ q.message }}</p>

							<div v-if="q.answer" class="existing-answer">
								<p class="answer-label">{{ section('inbox').yourReply }}</p>
								<p class="answer-text">{{ q.answer }}</p>
								<time v-if="q.answeredAt">{{
									new Date(q.answeredAt).toLocaleString()
								}}</time>
							</div>

							<div class="inbox-actions">
								<button
									type="button"
									class="btn btn-primary btn-sm"
									@click="openAnswerModal(q)"
								>
									{{
										q.answer
											? section('inbox').updateAnswer
											: section('inbox').reply
									}}
								</button>
								<button
									v-if="q.status === 'unread'"
									type="button"
									class="btn btn-secondary btn-sm"
									@click="markQuestion(q.id, 'read')"
								>
									{{ section('inbox').markRead }}
								</button>
								<button
									v-else-if="q.status === 'read'"
									type="button"
									class="btn btn-ghost btn-sm"
									@click="markQuestion(q.id, 'unread')"
								>
									{{ section('inbox').markUnread }}
								</button>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									@click="deleteQuestion(q.id)"
								>
									{{ section('inbox').dismiss }}
								</button>
							</div>
						</li>
					</ul>
					</template>
				</section>

				<Teleport to="body">
					<div v-if="answerModal" class="modal-backdrop" @keydown.esc="closeAnswerModal">
						<div
							ref="answerModalRef"
							class="modal card modal-flush"
							role="dialog"
							aria-modal="true"
							aria-labelledby="answer-modal-title"
							tabindex="-1"
						>
							<header class="modal-header">
								<h2 id="answer-modal-title">
									{{
										answerModal.answer
											? section('inbox').updateAnswer
											: section('inbox').sendReply
									}}
								</h2>
							</header>
							<div class="modal-body">
								<p class="modal-question">
									<strong>{{ answerModal.displayName }}</strong>
									{{ section('inbox').asked }}
								</p>
								<p class="modal-question-text">{{ answerModal.message }}</p>
								<label class="field">
									{{ section('inbox').answerLabel }}
									<textarea
										v-model="modalDraft"
										rows="5"
										:placeholder="section('inbox').answerPlaceholder"
										autofocus
									/>
								</label>
								<div class="modal-actions">
									<button
										type="button"
										class="btn btn-ghost"
										@click="closeAnswerModal"
									>
										{{ section('inbox').cancel }}
									</button>
									<button
										type="button"
										class="btn btn-primary"
										:disabled="
											loading === 'answer' || modalDraft.trim().length < 2
										"
										@click="submitModalAnswer"
									>
										{{
											loading === 'answer'
												? section('inbox').sending
												: answerModal.answer
													? section('inbox').updateAnswer
													: section('inbox').sendAnswer
										}}
									</button>
								</div>
							</div>
						</div>
					</div>
				</Teleport>

				<Teleport to="body">
					<div
						v-if="previewOpen && previewData"
						class="modal-backdrop"
						@keydown.esc="closePreview"
					>
						<div
							ref="previewModalRef"
							class="modal card modal-flush publish-preview-modal"
							role="dialog"
							aria-modal="true"
							aria-labelledby="publish-preview-title"
							tabindex="-1"
						>
							<header class="modal-header">
								<h2 id="publish-preview-title">
									Publish preview — {{ previewData.weekLabel }}
								</h2>
								<p v-if="previewData.digest.range" class="section-desc">
									{{ previewData.digest.range.label }}
								</p>
							</header>
							<div class="modal-body">
								<button
									type="button"
									class="preview-image-btn"
									aria-label="View standings preview larger"
									@click="
										showLightbox(
											apiUrl(previewData.standingsSvgUrl),
											'Standings preview',
										)
									"
								>
									<img
										:src="apiUrl(previewData.standingsSvgUrl)"
										alt="Standings preview"
										class="preview-image"
									/>
								</button>
								<button
									type="button"
									class="preview-image-btn"
									aria-label="View vibes preview larger"
									@click="
										showLightbox(
											apiUrl(previewData.vibesSvgUrl),
											'Vibes preview',
										)
									"
								>
									<img
										:src="apiUrl(previewData.vibesSvgUrl)"
										alt="Vibes preview"
										class="preview-image"
									/>
								</button>
								<button
									type="button"
									class="preview-image-btn"
									aria-label="View score breakdown preview larger"
									@click="
										showLightbox(
											apiUrl(previewData.breakdownSvgUrl),
											'Score breakdown preview',
										)
									"
								>
									<img
										:src="apiUrl(previewData.breakdownSvgUrl)"
										alt="Score breakdown preview"
										class="preview-image"
									/>
								</button>
								<p class="webhook-status">
									Notifies: {{ previewData.whoGetsNotified.emails }} email{{
										previewData.whoGetsNotified.emails === 1 ? '' : 's'
									}}
									<span v-if="previewData.whoGetsNotified.discord">
										+ Discord</span
									>
									<span v-if="previewData.whoGetsNotified.discordRoleId">
										(role {{ previewData.whoGetsNotified.discordRoleId }})</span
									>
								</p>
								<ul class="publish-checklist" aria-label="Publish checklist">
									<li>
										Standings + vibes + breakdown images ready for
										{{ previewData.weekLabel }}
									</li>
									<li>
										Email recipients:
										{{ previewData.whoGetsNotified.emails }}
									</li>
									<li>
										Discord:
										{{
											previewData.whoGetsNotified.discord
												? 'will post to production channel'
												: 'not configured / skipped'
										}}
									</li>
									<li v-if="includeMonthlyWrapOnPublish">
										4-week wrap attached
										<span v-if="wrapStatus?.atypical"> (atypical — confirm below)</span>
									</li>
									<li v-else>4-week wrap not included</li>
								</ul>
								<div class="modal-actions">
									<button type="button" class="btn btn-ghost" @click="closePreview">
										Cancel
									</button>
									<button
										type="button"
										class="btn btn-primary"
										:disabled="loading === 'publish'"
										@click="confirmPublishFromPreview"
									>
										{{
											loading === 'publish'
												? section('standings').publishing
												: 'Confirm publish'
										}}
									</button>
								</div>
							</div>
						</div>
					</div>
				</Teleport>

				<!-- Teams -->
				<section v-if="activeTab === 'teams'" class="admin-grid">
					<section class="card admin-section">
						<h2>{{ section('teams').assignmentTitle }}</h2>
						<p class="stat-line">
							{{ t(section('teams').assignmentLead, { pending }) }}
						</p>
						<p class="section-desc">
							{{
								section('teams').assignmentHint ??
								'Preview a balanced shuffle before applying. Works even when everyone already has a team.'
							}}
						</p>
						<button
							class="btn btn-primary"
							:disabled="!canOpenAssignPreview"
							@click="openAssignTeamsPreview"
						>
							{{ section('teams').assignTeams }}
						</button>
						<AdminAssignTeamsModal
							v-model:open="assignTeamsOpen"
							@applied="onAssignTeamsApplied"
							@error="(m) => showMessage(m, true)"
						/>
					</section>

					<section class="card admin-section">
						<h2>{{ section('teams').quickStatsTitle }}</h2>
						<ul class="quick-stats">
							<li>
								<strong>{{ usersCount }}</strong>
								{{ section('teams').statTotalUsers }}
							</li>
							<li>
								<strong>{{ assignedUserCount }}</strong>
								{{ section('teams').statAssigned }}
							</li>
							<li>
								<strong>{{ submissionsCount }}</strong>
								{{ section('teams').statSubmissions }}
							</li>
							<li>
								<strong>{{ unreadQuestions }}</strong>
								{{ section('teams').statUnread }}
							</li>
						</ul>
					</section>
				</section>

				<!-- Standings -->
				<section v-if="activeTab === 'standings'" class="admin-section">
					<section class="card admin-section publish-range-section">
						<h2>Publish range</h2>
						<p class="section-desc">
							Choose which days count toward the vibes image in this publish.
							Both “from” and “to” dates are included.
						</p>
						<div class="btn-row publish-range-presets">
							<button
								v-for="preset in PUBLISH_PRESETS"
								:key="preset.value"
								type="button"
								class="btn btn-sm"
								:class="
									publishPreset === preset.value
										? 'btn-primary'
										: 'btn-secondary'
								"
								@click="applyPublishPreset(preset.value)"
							>
								{{ preset.label }}
							</button>
						</div>
						<div class="publish-range-dates">
							<label>
								From
								<input
									v-model="publishFrom"
									type="date"
									@change="onPublishDateInput"
								/>
							</label>
							<label>
								To
								<input
									v-model="publishTo"
									type="date"
									@change="onPublishDateInput"
								/>
							</label>
						</div>
					</section>

					<div class="card standings-actions">
						<div class="standings-actions-top">
							<div>
								<h2>{{ section('standings').currentTitle }}</h2>
								<p class="section-desc">
									{{ section('standings').currentLead }}
								</p>
							</div>
							<div class="publish-actions">
								<label
									v-if="wrapStatus?.enabled"
									class="setting-toggle wrap-publish-toggle"
									:title="
										wrapStatus.atypical
											? wrapStatus.reasons.join(' ')
											: 'Attach the dense 4-week wrap image to this Discord publish'
									"
								>
									<input
										v-model="includeMonthlyWrapOnPublish"
										type="checkbox"
										:disabled="loading === 'publish'"
									/>
									<span>Include 4-week wrap</span>
								</label>
								<div class="btn-row">
									<button
										class="btn btn-secondary"
										:disabled="previewLoading || !standings?.length"
										@click="openPublishPreview"
									>
										{{ previewLoading ? 'Loading preview…' : 'Preview' }}
									</button>
									<button
										class="btn btn-primary"
										:disabled="loading === 'publish' || !standings?.length"
										@click="publishThisWeek"
									>
										{{
											loading === 'publish'
												? section('standings').publishing
												: section('standings').publish
										}}
									</button>
									<button
										class="btn btn-secondary"
										:disabled="!standings?.length"
										@click="downloadCurrentSvg"
									>
										{{ section('standings').downloadSvg }}
									</button>
								</div>
							</div>
						</div>
						<p
							v-if="wrapStatus?.enabled && includeMonthlyWrapOnPublish && wrapStatus.atypical"
							class="wrap-publish-warn"
						>
							Warning: not a normal first-Monday wrap slot
							<template v-if="wrapStatus.alreadySentThisMonth">
								(already sent for {{ wrapStatus.monthKey }})
							</template>
							<template v-else-if="!wrapStatus.isFirstMonday">
								(today isn’t the first Monday)
							</template>
							— you’ll need to confirm before publishing.
						</p>
						<p v-else-if="wrapStatus && !wrapStatus.enabled" class="auto-hint">
							Enable “4-week wrap with weekly publish” in Settings to use the wrap
							toggle here.
						</p>

						<div v-if="activeWeeks.length" class="active-weeks">
							<h3>{{ section('standings').publishedTitle }}</h3>
							<ul class="week-list">
								<li
									v-for="week in activeWeeks"
									:key="week.id"
									class="week-item"
								>
									<div>
										<strong>{{ week.weekLabel }}</strong>
										<span class="week-meta"
											>{{ section('standings').publishedAt }}
											{{ new Date(week.publishedAt).toLocaleString() }}</span
										>
									</div>
									<button
										type="button"
										class="btn btn-ghost btn-sm"
										:disabled="loading === 'unpublish'"
										@click="unpublishWeek(week.id, week.weekLabel)"
									>
										{{ section('standings').unpublish }}
									</button>
								</li>
							</ul>
						</div>
					</div>

					<div v-if="loading === 'standings'" class="alert alert-info">
						{{ section('standings').loading }}
					</div>
					<StandingsPanel
						v-else-if="standings"
						:standings="standings ?? []"
						:image-url="standingsImageUrl"
						:title="section('standings').liveTitle"
					/>

					<StandingsBreakdownPanel
						v-if="standingsBreakdown && !loading"
						:breakdown="standingsBreakdown"
						:image-url="standingsBreakdownImageUrl"
						:title="section('standings').breakdownTitle"
					/>

					<section class="card admin-section history-section">
						<div class="section-header-row">
							<div>
								<h2>{{ section('standings').historyTitle }}</h2>
								<p class="section-desc">{{ section('standings').historyLead }}</p>
							</div>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="standingsHistory.length === 0"
								@click="downloadStandingsHistoryCsv"
							>
								{{ section('standings').exportCsv ?? 'Export CSV' }}
							</button>
						</div>

						<div v-if="standingsHistory.length === 0" class="empty-inbox">
							<p>{{ section('standings').historyEmpty }}</p>
						</div>

						<div v-else class="table-wrap">
						<table class="data-table" aria-label="Standings publish history">
							<thead>
								<tr>
									<th scope="col">{{ section('standings').colWhen }}</th>
									<th scope="col">{{ section('standings').colAction }}</th>
									<th scope="col">{{ section('standings').colWeek }}</th>
									<th scope="col">{{ section('standings').colBy }}</th>
									<th scope="col"><span class="sr-only">Download</span></th>
								</tr>
							</thead>
								<tbody>
									<tr v-for="entry in standingsHistory" :key="entry.id">
										<td>{{ new Date(entry.createdAt).toLocaleString() }}</td>
										<td>
											<span
												class="badge"
												:class="
													entry.action === 'published'
														? 'badge-positive'
														: 'badge-negative'
												"
											>
												{{
													entry.action === 'published'
														? section('standings').actionPublished
														: section('standings').actionUnpublished
												}}
											</span>
										</td>
										<td>{{ entry.weekLabel }}</td>
										<td>
											{{ entry.adminName }}
											<br />
											<small>{{ entry.adminEmail }}</small>
										</td>
										<td>
											<button
												type="button"
												class="btn btn-ghost btn-sm"
												@click="downloadHistorySvg(entry)"
											>
												{{ section('standings').downloadSvg }}
											</button>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>
				</section>

				<!-- Users -->
				<section v-if="activeTab === 'users'" class="card admin-section">
					<div class="users-header">
						<div>
							<h2>{{ section('users').title }}</h2>
							<p class="section-desc">
								{{
									t(section('users').summary, {
										total: users.length,
										pending,
										assigned: users.length - pending,
									})
								}}
							</p>
						</div>
						<button
							type="button"
							class="btn btn-primary btn-sm"
							@click="openAddUser"
						>
							{{ section('users').addButton }}
						</button>
					</div>
					<div class="table-wrap">
						<table class="data-table" aria-label="Participants">
							<thead>
								<tr>
									<th scope="col">{{ section('users').colName }}</th>
									<th scope="col">{{ section('users').colEmail }}</th>
									<th scope="col">{{ section('users').colTeam }}</th>
									<th scope="col">{{ section('users').colStatus }}</th>
									<th scope="col">{{ section('users').colAdmin }}</th>
									<th scope="col">{{ section('users').colJoined }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="u in pagedUsers" :key="u.id">
									<td>
										<ReaderLink :id="u.id" :name="u.displayName" />
									</td>
									<td>{{ u.email }}</td>
									<td>
										<select
											class="team-select"
											:value="u.teamId ?? ''"
											:disabled="loading === `team-${u.id}`"
											@change="
												setUserTeam(
													u.id,
													($event.target as HTMLSelectElement).value,
												)
											"
										>
											<option value="">
												{{ section('users').unassigned }}
											</option>
											<option
												v-for="team in config.teams"
												:key="team.id"
												:value="team.id"
											>
												{{ team.icon }} {{ team.name }}
											</option>
										</select>
									</td>
									<td>
										<span
											class="badge"
											:class="
												u.status === 'assigned'
													? 'badge-positive'
													: 'badge-negative'
											"
										>
											{{ u.status }}
										</span>
									</td>
									<td>
										<label class="setting-toggle admin-toggle">
											<input
												type="checkbox"
												:checked="u.isAdmin"
												:disabled="
													loading === `admin-${u.id}` || u.id === me?.id
												"
												@change="
													setUserAdmin(
														u.id,
														($event.target as HTMLInputElement).checked,
													)
												"
											/>
											<span>{{ u.isAdmin ? 'Admin' : 'User' }}</span>
										</label>
										<small v-if="u.id === me?.id" class="hint"
											>You can't change your own admin.</small
										>
									</td>
									<td>
										<time v-if="u.createdAt">{{
											new Date(u.createdAt).toLocaleDateString()
										}}</time>
										<span v-else>-</span>
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<nav
						v-if="users.length > USERS_PER_PAGE"
						class="submissions-pagination"
						aria-label="Users pages"
					>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="userPage <= 1"
							@click="goUserPage(userPage - 1)"
						>
							Previous
						</button>
						<div class="page-numbers">
							<button
								v-for="page in userPageCount"
								:key="page"
								type="button"
								class="page-num"
								:class="{ active: page === userPage }"
								:aria-current="page === userPage ? 'page' : undefined"
								@click="goUserPage(page)"
							>
								{{ page }}
							</button>
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="userPage >= userPageCount"
							@click="goUserPage(userPage + 1)"
						>
							Next
						</button>
					</nav>

					<p class="hint">Showing {{ userRangeLabel }} of {{ users.length }}.</p>
				</section>

				<!-- Add user modal -->
				<div v-if="addUserOpen" class="modal-backdrop" @keydown.esc="closeAddUser">
					<div
						ref="addUserModalRef"
						class="modal card add-user-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby="add-user-title"
						tabindex="-1"
					>
						<h2 id="add-user-title">{{ section('users').addTitle }}</h2>
						<p class="section-desc">{{ section('users').addLead }}</p>
						<form class="add-user-form" @submit.prevent="submitAddUser">
							<label>
								{{ section('users').displayNameLabel }}
								<input
									v-model="newUser.displayName"
									type="text"
									required
									minlength="2"
								/>
							</label>
							<label>
								{{ section('users').emailLabel }}
								<input
									v-model="newUser.email"
									type="email"
									required
									autocomplete="off"
								/>
							</label>
							<label>
								{{ section('users').teamOptionalLabel }}
								<select v-model="newUser.teamId">
									<option value="">{{ section('users').unassigned }}</option>
									<option
										v-for="team in config.teams"
										:key="team.id"
										:value="team.id"
									>
										{{ team.icon }} {{ team.name }}
									</option>
								</select>
							</label>
							<div class="modal-actions">
								<button
									type="button"
									class="btn btn-ghost"
									@click="closeAddUser"
								>
									{{ section('inbox').cancel }}
								</button>
								<button
									type="submit"
									class="btn btn-primary"
									:disabled="loading === 'add-user'"
								>
									{{
										loading === 'add-user'
											? section('users').creating
											: section('users').addSubmit
									}}
								</button>
							</div>
						</form>
					</div>
				</div>

				<!-- Submissions -->
				<section
					v-if="activeTab === 'submissions'"
					class="card admin-section"
				>
					<div class="section-header-row">
						<div>
							<h2>{{ section('submissions').title }}</h2>
							<p class="section-desc">{{ section('submissions').addLead }}</p>
						</div>
						<div class="btn-row">
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								@click="openCoverSearch"
							>
								Search for covers
							</button>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								@click="downloadSubmissionsCsv"
							>
								{{ section('submissions').exportCsv ?? 'Export CSV' }}
							</button>
							<button
								type="button"
								class="btn btn-primary btn-sm"
								@click="openAddSubmission"
							>
								{{ section('submissions').addButton }}
							</button>
						</div>
					</div>

					<label class="setting-toggle show-deleted-toggle">
						<input
							type="checkbox"
							:checked="showDeleted"
							@change="toggleShowDeleted"
						/>
						<span>{{ section('submissions').showDeleted ?? 'Show deleted submissions' }}</span>
					</label>

					<div class="submission-filters">
						<input
							v-model="submissionSearch"
							type="search"
							class="submission-search"
							:placeholder="
								section('submissions').searchPlaceholder ||
								'Search book, reader, email…'
							"
							aria-label="Search submissions"
						/>
						<select v-model="submissionTypeFilter" aria-label="Filter by type">
							<option value="all">
								{{ section('submissions').filterAllTypes || 'All types' }}
							</option>
							<option value="add">{{ section('submissions').typeAdd }}</option>
							<option value="sabotage">
								{{ section('submissions').typeSabotage }}
							</option>
						</select>
						<select v-model="submissionTeamFilter" aria-label="Filter by team">
							<option value="">
								{{ section('submissions').filterAllTeams || 'All realms' }}
							</option>
							<option
								v-for="team in config.teams"
								:key="team.id"
								:value="team.id"
							>
								{{ team.icon }} {{ team.name }}
							</option>
						</select>
					</div>

					<div class="table-wrap">
					<table class="data-table submissions-table" aria-label="Submissions">
						<thead>
								<tr>
									<th scope="col" :aria-sort="submissionSortAria('book')">
										<button
											type="button"
											class="sort-th"
											:class="{ active: submissionSortKey === 'book' }"
											@click="toggleSubmissionSort('book')"
										>
											{{ section('submissions').colBook }}
											<span class="sort-mark" aria-hidden="true">{{
												submissionSortMark('book')
											}}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="submissionSortAria('reader')">
										<button
											type="button"
											class="sort-th"
											:class="{ active: submissionSortKey === 'reader' }"
											@click="toggleSubmissionSort('reader')"
										>
											{{ section('submissions').colReader }}
											<span class="sort-mark" aria-hidden="true">{{
												submissionSortMark('reader')
											}}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="submissionSortAria('type')">
										<button
											type="button"
											class="sort-th"
											:class="{ active: submissionSortKey === 'type' }"
											@click="toggleSubmissionSort('type')"
										>
											{{ section('submissions').colType }}
											<span class="sort-mark" aria-hidden="true">{{
												submissionSortMark('type')
											}}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="submissionSortAria('affects')">
										<button
											type="button"
											class="sort-th"
											:class="{ active: submissionSortKey === 'affects' }"
											@click="toggleSubmissionSort('affects')"
										>
											{{ section('submissions').colAffects || 'Affects' }}
											<span class="sort-mark" aria-hidden="true">{{
												submissionSortMark('affects')
											}}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="submissionSortAria('impact')">
										<button
											type="button"
											class="sort-th"
											:class="{ active: submissionSortKey === 'impact' }"
											@click="toggleSubmissionSort('impact')"
										>
											{{ section('submissions').colImpact }}
											<span class="sort-mark" aria-hidden="true">{{
												submissionSortMark('impact')
											}}</span>
										</button>
									</th>
									<th scope="col" :aria-sort="submissionSortAria('date')">
										<button
											type="button"
											class="sort-th"
											:class="{ active: submissionSortKey === 'date' }"
											@click="toggleSubmissionSort('date')"
										>
											{{ section('submissions').colDate }}
											<span class="sort-mark" aria-hidden="true">{{
												submissionSortMark('date')
											}}</span>
										</button>
									</th>
									<th scope="col">{{ section('submissions').colActions }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-if="pagedSubmissions.length === 0">
									<td colspan="7" class="empty-cell">
										{{
											submissions.length === 0
												? 'No submissions yet.'
												: section('submissions').filterEmpty ||
													'No submissions match your filters.'
										}}
									</td>
								</tr>
								<tr
									v-for="s in pagedSubmissions"
									:key="s.id"
									class="submission-row"
									tabindex="0"
									@click="openViewSubmission(s)"
									@keydown.enter="openViewSubmission(s)"
								>
									<td>
										<strong>{{ s.bookTitle }}</strong>
										<br />
										<small>{{ s.bookAuthor }} · {{ s.pageCount }}pg</small>
									</td>
									<td @click.stop>
										<ReaderLink
											v-if="s.userId"
											:id="s.userId"
											:name="s.userName"
										/>
										<template v-else>{{ s.userName }}</template>
									</td>
									<td>
										<span
											class="badge"
											:class="
												s.submissionType === 'add'
													? 'badge-positive'
													: 'badge-negative'
											"
										>
											{{ s.submissionType }}
										</span>
									</td>
									<td>
										<span
											class="affects-pill"
											:class="
												s.submissionType === 'add'
													? 'affects-gain'
													: 'affects-sabotage'
											"
										>
											{{ submissionAffectsLabel(s) }}
										</span>
									</td>
									<td>
										<span class="impact-cell">
											<span
												v-for="(part, i) in formatSubmissionImpactParts(s)"
												:key="i"
												:class="`impact-${part.tone}`"
												>{{ part.text }}</span
											>
										</span>
									</td>
									<td>{{ new Date(s.createdAt).toLocaleDateString() }}</td>
									<td class="actions-cell" @click.stop>
										<div class="row-actions">
											<button
												type="button"
												class="icon-btn"
												:title="section('submissions').edit"
												:aria-label="section('submissions').edit"
												@click="openEditSubmission(s)"
											>
												<svg
													viewBox="0 0 24 24"
													width="16"
													height="16"
													aria-hidden="true"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<path d="M12 20h9" />
													<path
														d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
													/>
												</svg>
											</button>
											<button
												type="button"
												class="icon-btn danger"
												:title="section('submissions').delete"
												:aria-label="section('submissions').delete"
												:disabled="loading === `del-sub-${s.id}`"
												@click="askDeleteSubmission(s)"
											>
												<svg
													viewBox="0 0 24 24"
													width="16"
													height="16"
													aria-hidden="true"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<path d="M3 6h18" />
													<path d="M8 6V4h8v2" />
													<path d="M19 6l-1 14H6L5 6" />
													<path d="M10 11v6M14 11v6" />
												</svg>
											</button>
										</div>
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<nav
						v-if="filteredSubmissions.length > SUBMISSIONS_PER_PAGE"
						class="submissions-pagination"
						aria-label="Submissions pages"
					>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="submissionPage <= 1"
							@click="goSubmissionPage(submissionPage - 1)"
						>
							Previous
						</button>
						<div class="page-numbers">
							<button
								v-for="page in submissionPageCount"
								:key="page"
								type="button"
								class="page-num"
								:class="{ active: page === submissionPage }"
								:aria-current="page === submissionPage ? 'page' : undefined"
								@click="goSubmissionPage(page)"
							>
								{{ page }}
							</button>
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="submissionPage >= submissionPageCount"
							@click="goSubmissionPage(submissionPage + 1)"
						>
							Next
						</button>
					</nav>

					<p class="hint">
						Showing {{ submissionRangeLabel }} of
						{{ filteredSubmissions.length }}
						<template v-if="filteredSubmissions.length !== submissions.length">
							(filtered from {{ submissions.length }})
						</template>
						.
						{{ section('submissions').hint }}
					</p>

					<div v-if="showDeleted" class="deleted-submissions">
						<h3>{{ section('submissions').deletedTitle ?? 'Deleted submissions' }}</h3>
						<div v-if="deletedSubmissions.length === 0" class="empty-inbox">
							<p>{{ section('submissions').deletedEmpty ?? 'Nothing deleted.' }}</p>
						</div>
						<div v-else class="table-wrap">
							<table class="data-table" aria-label="Deleted submissions">
								<thead>
									<tr>
										<th scope="col">{{ section('submissions').colBook }}</th>
										<th scope="col">{{ section('submissions').colReader }}</th>
										<th scope="col">
											{{ section('submissions').colDeletedBy ?? 'Deleted by' }}
										</th>
										<th scope="col">
											{{ section('submissions').colDeletedAt ?? 'Deleted at' }}
										</th>
										<th scope="col"><span class="sr-only">Restore</span></th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="s in deletedSubmissions" :key="s.id" tabindex="0">
										<td>
											<strong>{{ s.bookTitle }}</strong>
											<br />
											<small>{{ s.bookAuthor }} · {{ s.pageCount }}pg</small>
										</td>
										<td>
											<ReaderLink
												v-if="s.userId"
												:id="s.userId"
												:name="s.userName"
											/>
											<template v-else>{{ s.userName }}</template>
										</td>
										<td>{{ s.deletedByName ?? '-' }}</td>
										<td>
											<time v-if="s.deletedAt">{{
												new Date(s.deletedAt).toLocaleString()
											}}</time>
											<span v-else>-</span>
										</td>
										<td>
											<button
												type="button"
												class="btn btn-secondary btn-sm"
												:disabled="restoringId === s.id"
												@click="restoreSubmission(s)"
											>
												{{
													restoringId === s.id
														? 'Restoring…'
														: (section('submissions').restore ?? 'Restore')
												}}
											</button>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</section>

				<AdminStatsPanel
					v-if="activeTab === 'stats'"
					@message="
						(text, isError) => {
							showMessage(text, isError);
						}
					"
				/>

				<AdminPromptsPanel
					v-if="activeTab === 'prompts'"
					@message="
						(text, isError) => {
							showMessage(text, isError);
							loadConfig(true);
						}
					"
				/>

				<!-- Audit log -->
				<section v-if="activeTab === 'audit'" class="card admin-section audit-section">
					<header class="audit-header">
						<div>
							<h2>{{ section('tabs').audit ?? 'Audit log' }}</h2>
							<p class="section-desc">
								{{
									section('audit').lead ??
									'Admin actions that changed data, newest first.'
								}}
							</p>
						</div>
						<p v-if="auditLoaded && auditTotal > 0" class="audit-count">
							{{ auditTotal }} {{ auditTotal === 1 ? 'entry' : 'entries' }}
						</p>
					</header>

					<div v-if="!auditLoaded" class="page-state" style="min-height: 10rem">
						<div class="page-spinner" role="status" aria-label="Loading" />
						<p>Loading audit log…</p>
					</div>

					<template v-else>
						<div v-if="auditLog.length === 0" class="empty-inbox">
							<p>{{ section('audit').empty ?? 'No audit entries yet.' }}</p>
						</div>

						<ol v-else class="audit-feed" aria-label="Audit log">
							<li
								v-for="entry in auditLog"
								:key="entry.id"
								class="audit-entry"
								tabindex="0"
							>
								<div class="audit-entry-top">
									<span
										class="audit-action"
										:class="`tone-${auditActionTone(entry.action)}`"
									>
										{{ auditActionLabel(entry.action) }}
									</span>
									<time class="audit-when" :datetime="entry.createdAt">
										{{ new Date(entry.createdAt).toLocaleString() }}
									</time>
								</div>
								<div class="audit-entry-meta">
									<span class="audit-who">{{ entry.actorName }}</span>
									<span class="audit-dot" aria-hidden="true">·</span>
									<span class="audit-entity">{{ auditEntityLabel(entry) }}</span>
								</div>
								<ul
									v-if="auditDetailChips(entry.detail).length"
									class="audit-chips"
								>
									<li
										v-for="(chip, i) in auditDetailChips(entry.detail)"
										:key="`${entry.id}-${i}`"
									>
										<span class="chip-label">{{ chip.label }}</span>
										<span class="chip-value">{{ chip.value }}</span>
									</li>
								</ul>
							</li>
						</ol>

						<nav
							v-if="auditTotal > AUDIT_PAGE_SIZE"
							class="submissions-pagination"
							aria-label="Audit log pages"
						>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								:disabled="auditOffset === 0"
								@click="goAuditPage(auditOffset - AUDIT_PAGE_SIZE)"
							>
								Previous
							</button>
							<div class="page-numbers">
								<button
									v-for="page in auditPageCount"
									:key="page"
									type="button"
									class="page-num"
									:class="{ active: page === auditPage }"
									:aria-current="page === auditPage ? 'page' : undefined"
									@click="goAuditPageNum(page)"
								>
									{{ page }}
								</button>
							</div>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								:disabled="auditOffset + AUDIT_PAGE_SIZE >= auditTotal"
								@click="goAuditPage(auditOffset + AUDIT_PAGE_SIZE)"
							>
								Next
							</button>
						</nav>

						<p v-if="auditTotal > 0" class="hint">
							Showing {{ auditOffset + 1 }}–{{
								Math.min(auditOffset + AUDIT_PAGE_SIZE, auditTotal)
							}}
							of {{ auditTotal }}.
						</p>
					</template>
				</section>
				<!-- Theme of the month (v-show keeps drafts + sticky unsaved banner alive) -->
				<section
					v-show="activeTab === 'themes'"
					class="admin-section"
					:hidden="activeTab !== 'themes'"
				>
					<AdminMonthlyThemesPanel
						v-if="themesMounted"
						@message="showMessage"
					/>
				</section>

				<!-- Settings (v-show keeps drafts + sticky unsaved banner alive) -->
				<section
					v-show="activeTab === 'settings'"
					class="admin-section"
					:hidden="activeTab !== 'settings'"
				>
					<AdminSettingsPanel
						v-if="settingsMounted"
						@message="showMessage"
					/>
				</section>


			</div>
		</div>

		<AdminAddSubmissionModal
			v-if="addSubmissionOpen || editSubmission || viewSubmission"
			:users="users"
			:teams="config.teams"
			:positive-prompts="config.prompts.positive"
			:negative-prompts="config.prompts.negative"
			:max-prompts="config.scoringRules.maxPromptsPerBook ?? 5"
			:global-bonus-label="config.globalBonuses?.[0]?.label"
			:editing="editSubmission || viewSubmission"
			:readonly="!!viewSubmission && !editSubmission"
			@close="closeSubmissionModal"
			@created="onSubmissionCreated"
			@updated="onSubmissionUpdated"
			@edit="switchViewToEdit"
			@error="(m) => showMessage(m, true)"
		/>

		<AdminCoverSearchModal
			v-model:open="coverSearchOpen"
			@applied="onCoversApplied"
			@error="(m) => showMessage(m, true)"
		/>

		<div v-if="deleteTarget" class="modal-backdrop" @keydown.esc="cancelDeleteSubmission">
			<div
				ref="deleteModalRef"
				class="modal card delete-confirm-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="delete-sub-title"
				tabindex="-1"
			>
				<h2 id="delete-sub-title">Delete submission?</h2>
				<p class="section-desc">
					{{
						confirmMsg('deleteSubmission', { title: deleteTarget.bookTitle })
					}}
				</p>
				<p class="delete-meta">
					{{ deleteTarget.userName }} ·
					{{ submissionAffectsLabel(deleteTarget) }}
				</p>
				<div class="modal-actions">
					<button
						type="button"
						class="btn btn-ghost"
						@click="cancelDeleteSubmission"
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn btn-primary danger-confirm"
						:disabled="loading === `del-sub-${deleteTarget.id}`"
						@click="confirmDeleteSubmission"
					>
						{{
							loading === `del-sub-${deleteTarget.id}` ? 'Deleting…' : 'Delete'
						}}
					</button>
				</div>
			</div>
		</div>
	</main>
</template>

<style scoped>
.admin-page .page-lead {
	margin-bottom: 0;
}

.admin-message-modal {
	max-width: min(28rem, 100%);
	width: 100%;
}

.admin-message-title {
	margin: 0 0 0.65rem;
	font-family: var(--font-display);
	font-size: 1.2rem;
	color: var(--realm-text);
}

.admin-message-body {
	margin: 0 0 1.25rem;
	line-height: 1.5;
	font-size: 0.95rem;
	color: var(--realm-text-muted);
	white-space: pre-wrap;
	word-break: break-word;
}

.admin-message-body.is-error {
	color: var(--realm-accent-glow);
}

.admin-message-body.is-success {
	color: var(--realm-text);
}

.admin-success-toast {
	position: fixed;
	right: 1rem;
	bottom: calc(1rem + var(--safe-bottom, 0px));
	z-index: 10040;
	display: flex;
	align-items: flex-start;
	gap: 0.65rem;
	max-width: min(24rem, calc(100vw - 2rem));
	padding: 0.85rem 1rem;
	border-radius: var(--radius);
	border: 1px solid color-mix(in srgb, var(--realm-success) 40%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-surface) 92%, var(--realm-success) 8%);
	color: var(--realm-text);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
	font-size: 0.92rem;
	line-height: 1.4;
}

.admin-success-toast-dismiss {
	flex-shrink: 0;
	border: none;
	background: transparent;
	color: var(--realm-text-muted);
	font-size: 1.25rem;
	line-height: 1;
	cursor: pointer;
	padding: 0;
}

.admin-page,
.admin-layout,
.admin-main,
.admin-section,
.discord-webhook-form,
.team-chat-urls,
.publish-range-section {
	min-width: 0;
	max-width: 100%;
}

.admin-topbar {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1.25rem;
}

.admin-nav-toggle {
	display: none;
	flex-shrink: 0;
}

.admin-layout {
	display: grid;
	grid-template-columns: 13.5rem minmax(0, 1fr);
	gap: 1.25rem;
	align-items: start;
}

.admin-sidebar {
	position: sticky;
	top: 5.5rem;
	border: 1px solid var(--realm-border);
	border-radius: 14px;
	background: color-mix(in srgb, var(--realm-surface) 88%, transparent);
	backdrop-filter: blur(10px);
	padding: 0.55rem;
}

.admin-side-nav {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
}

.admin-side-nav button {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	width: 100%;
	padding: 0.65rem 0.8rem;
	border-radius: 10px;
	border: 1px solid transparent;
	background: transparent;
	color: var(--realm-text-muted);
	font-family: var(--font-body);
	font-weight: 600;
	font-size: 0.88rem;
	text-align: left;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}

.admin-side-nav button:hover {
	color: var(--realm-text);
	background: rgba(255, 255, 255, 0.04);
}

.admin-side-nav button.active {
	background: rgba(212, 99, 74, 0.14);
	border-color: rgba(212, 99, 74, 0.45);
	color: var(--realm-accent-glow);
}

.nav-meta {
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--realm-text-muted);
	opacity: 0.85;
}

.admin-side-nav button.active .nav-meta {
	color: var(--realm-accent-glow);
}

.admin-nav-backdrop {
	display: none;
}

.admin-main {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.admin-section {
	padding: 1.35rem 1.4rem;
}

.section-header-row,
.users-header,
.inbox-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 0.35rem;
}

.section-header-row .section-desc,
.users-header .section-desc {
	margin-bottom: 0.75rem;
}

.empty-cell {
	text-align: center;
	color: var(--realm-text-muted);
	padding: 1.5rem !important;
}

.submission-filters {
	display: grid;
	grid-template-columns: minmax(0, 1.4fr) minmax(8rem, 0.7fr) minmax(
			8rem,
			0.9fr
		);
	gap: 0.65rem;
	margin: 0.5rem 0 1rem;
}

.submission-filters input,
.submission-filters select {
	width: 100%;
	padding: 0.55rem 0.7rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-family: var(--font-body);
	font-size: 0.9rem;
}

.submissions-pagination {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	flex-wrap: wrap;
	margin: 1rem 0 0.35rem;
}

.page-numbers {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
	justify-content: center;
}

.page-num {
	min-width: 2.25rem;
	height: 2.25rem;
	padding: 0 0.5rem;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	font-family: var(--font-body);
	font-weight: 600;
	font-size: 0.85rem;
	cursor: pointer;
}

.page-num:hover {
	color: var(--realm-text);
	border-color: rgba(212, 99, 74, 0.4);
}

.page-num.active {
	background: rgba(212, 99, 74, 0.14);
	border-color: var(--realm-accent);
	color: var(--realm-accent-glow);
}

.submission-row {
	cursor: pointer;
	transition: background 0.15s;
}

.submission-row:hover,
.submission-row:focus-visible {
	background: rgba(255, 255, 255, 0.03);
	outline: none;
}

.submissions-table .sort-th {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	margin: 0;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	font-weight: inherit;
	font-size: inherit;
	letter-spacing: inherit;
	text-transform: inherit;
	cursor: pointer;
	text-align: left;
}

.submissions-table .sort-th:hover {
	color: var(--realm-text);
}

.submissions-table .sort-th.active {
	color: var(--realm-accent-glow);
}

.submissions-table .sort-mark {
	font-size: 0.75em;
	opacity: 0.4;
	line-height: 1;
}

.submissions-table .sort-th.active .sort-mark {
	opacity: 1;
}

.affects-pill {
	display: inline-block;
	font-size: 0.78rem;
	font-weight: 600;
	line-height: 1.35;
	padding: 0.2rem 0.5rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	color: var(--realm-text-muted);
	max-width: 12rem;
}

.affects-pill.affects-gain {
	border-color: rgba(110, 207, 138, 0.35);
	color: var(--realm-success);
	background: rgba(110, 207, 138, 0.08);
}

.affects-pill.affects-sabotage {
	border-color: rgba(212, 99, 74, 0.4);
	color: var(--realm-accent-glow);
	background: rgba(212, 99, 74, 0.1);
}

.impact-cell {
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.impact-gain {
	color: var(--realm-success);
}

.impact-sep {
	color: var(--realm-text-muted);
	font-weight: 500;
	margin: 0 0.15rem;
}

.impact-dmg {
	color: var(--realm-accent);
}

.icon-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	padding: 0;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	cursor: pointer;
	transition:
		color 0.15s,
		border-color 0.15s,
		background 0.15s;
}

.icon-btn:hover {
	color: var(--realm-text);
	border-color: rgba(212, 99, 74, 0.45);
}

.icon-btn.danger:hover {
	color: #f08080;
	border-color: rgba(240, 128, 128, 0.5);
	background: rgba(240, 128, 128, 0.08);
}

.icon-btn:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.modal.delete-confirm-modal {
	max-width: 24rem;
	padding: 1.35rem 1.45rem;
}

.delete-confirm-modal h2 {
	margin: 0 0 0.5rem;
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.15rem;
}

.delete-meta {
	margin: 0 0 1.25rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.danger-confirm {
	background: #a84030 !important;
	border-color: #a84030 !important;
}

.danger-confirm:hover {
	filter: brightness(1.08);
}

.tab-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.1rem;
	height: 1.1rem;
	padding: 0 0.3rem;
	border-radius: 999px;
	background: var(--realm-accent);
	color: white;
	font-size: 0.65rem;
}

.admin-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
	gap: 1rem;
}

.admin-section h2 {
	color: var(--realm-text);
	font-family: var(--font-display);
	margin-bottom: 0.5rem;
	font-size: 1.15rem;
}

.section-desc {
	color: var(--realm-text-muted);
	font-size: 0.9rem;
	margin-bottom: 1.25rem;
}

.stat-line {
	color: var(--realm-text-muted);
	margin-bottom: 1rem;
}

.quick-stats {
	list-style: none;
	padding: 0;
	margin: 0;
	color: var(--realm-text-muted);
	line-height: 2;
}

.btn-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	margin-bottom: 0;
}

.standings-actions {
	margin-bottom: 1.25rem;
}

.standings-actions-top {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
	margin-bottom: 1rem;
}

.publish-actions {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 0.55rem;
}

.wrap-publish-toggle {
	margin: 0;
	font-size: 0.88rem;
}

.wrap-publish-warn {
	margin: 0 0 0.85rem;
	padding: 0.55rem 0.7rem;
	border-radius: var(--radius);
	border: 1px solid color-mix(in srgb, #c48a1a 45%, var(--realm-border));
	background: color-mix(in srgb, #c48a1a 12%, var(--realm-bg));
	color: color-mix(in srgb, var(--realm-text) 85%, #a36d10);
	font-size: 0.86rem;
	line-height: 1.4;
}

.standings-actions h2 {
	color: var(--realm-text);
	font-family: var(--font-display);
	margin-bottom: 0.35rem;
	font-size: 1.15rem;
}

.active-weeks h3 {
	color: var(--realm-text);
	font-size: 0.95rem;
	margin-bottom: 0.65rem;
	font-family: var(--font-display);
}

.week-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.week-item {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	background: var(--realm-bg);
	border: 1px solid var(--realm-border);
	border-radius: var(--radius);
}

.week-item strong {
	color: var(--realm-text);
	display: block;
}

.week-meta {
	font-size: 0.8rem;
	color: var(--realm-text-muted);
}

.history-section {
	margin-top: 1.25rem;
}

.table-wrap {
	overflow-x: auto;
	-webkit-overflow-scrolling: touch;
	max-width: 100%;
	min-width: 0;
}

.empty-inbox {
	text-align: center;
	padding: 2rem;
	color: var(--realm-text-muted);
}

.inbox-header {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
	margin-bottom: 1.25rem;
}

.inbox-header h2 {
	margin-bottom: 0.25rem;
}

.inbox-filters {
	display: flex;
	gap: 0.35rem;
	background: var(--realm-bg);
	padding: 0.25rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
}

.inbox-filters button {
	padding: 0.4rem 0.85rem;
	border: none;
	border-radius: calc(var(--radius) - 2px);
	background: transparent;
	color: var(--realm-text-muted);
	font-family: var(--font-body);
	font-size: 0.82rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		background 0.2s,
		color 0.2s;
}

.inbox-filters button:hover {
	color: var(--realm-text);
}

.inbox-filters button.active {
	background: rgba(212, 99, 74, 0.15);
	color: var(--realm-accent-glow);
}

.modal-backdrop {
	padding: 1.5rem;
	overflow: hidden;
}

.modal {
	width: 100%;
	max-width: 32rem;
	padding: 1.35rem 1.4rem;
}

.modal.modal-flush {
	padding: 0;
}

.modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 1.15rem 1.25rem;
	border-bottom: 1px solid var(--realm-border);
}

.modal-header h2 {
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.05rem;
	margin: 0;
}

.modal-body {
	padding: 1.25rem;
}

.modal-question {
	color: var(--realm-text-muted);
	font-size: 0.88rem;
	margin-bottom: 0.35rem;
}

.modal-question strong {
	color: var(--realm-text);
}

.modal-question-text {
	color: var(--realm-text);
	line-height: 1.6;
	white-space: pre-wrap;
	margin-bottom: 1rem;
	padding: 0.75rem;
	background: var(--realm-bg);
	border-radius: var(--radius);
	font-size: 0.92rem;
}

.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.75rem;
	margin-top: 1rem;
}

.inbox-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
}

.inbox-item {
	padding: 1rem 1.15rem;
	background: var(--realm-bg);
	border: 1px solid var(--realm-border);
	border-radius: var(--radius);
}

.inbox-item.unread {
	border-color: rgba(212, 99, 74, 0.45);
	background: rgba(212, 99, 74, 0.04);
}

.inbox-meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: baseline;
	gap: 0.5rem;
	margin-bottom: 0.65rem;
}

.inbox-meta strong {
	color: var(--realm-text);
	margin-right: 0.5rem;
}

.inbox-email {
	color: var(--realm-text-muted);
	font-size: 0.85rem;
}

.inbox-meta time {
	color: var(--realm-text-muted);
	font-size: 0.8rem;
}

.inbox-message {
	color: var(--realm-text);
	line-height: 1.65;
	white-space: pre-wrap;
	margin-bottom: 0.85rem;
}

.existing-answer {
	padding: 0.85rem 1rem;
	margin-bottom: 0.85rem;
	background: rgba(110, 207, 138, 0.06);
	border: 1px solid rgba(110, 207, 138, 0.25);
	border-radius: var(--radius);
}

.answer-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--realm-success);
	margin-bottom: 0.35rem;
}

.answer-text {
	color: var(--realm-text);
	line-height: 1.6;
	white-space: pre-wrap;
	margin-bottom: 0.35rem;
}

.existing-answer time {
	font-size: 0.75rem;
	color: var(--realm-text-muted);
}

.inbox-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}

.hint {
	margin-top: 1rem;
	font-size: 0.85rem;
	color: var(--realm-text-muted);
}

.team-select {
	min-width: 10rem;
	padding: 0.45rem 0.6rem;
	font-size: 0.85rem;
}

code {
	color: var(--realm-accent-glow);
}

small {
	color: var(--realm-text-muted);
	font-size: 0.78rem;
}

@media (max-width: 900px) {
	.admin-nav-toggle {
		display: inline-flex;
	}

	.admin-layout {
		grid-template-columns: 1fr;
	}

	.admin-sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 320;
		width: min(17rem, 86vw);
		border-radius: 0;
		border: none;
		border-right: 1px solid var(--realm-border);
		padding: 1rem 0.65rem;
		transform: translateX(-105%);
		transition: transform 0.2s ease;
		background: rgba(12, 10, 18, 0.97);
	}

	.admin-sidebar.open {
		transform: translateX(0);
	}

	.admin-nav-backdrop {
		display: block;
		position: fixed;
		inset: 0;
		z-index: 310;
		background: rgba(0, 0, 0, 0.55);
	}

	.admin-side-nav button {
		min-height: 2.75rem;
		font-size: 0.95rem;
	}
}

@media (max-width: 768px) {
	.admin-topbar {
		flex-direction: column;
		align-items: stretch;
	}

	.standings-actions-top {
		flex-direction: column;
	}

	.publish-actions {
		align-items: stretch;
		width: 100%;
	}

	.standings-actions-top .btn-row {
		width: 100%;
	}

	.standings-actions-top .btn-row .btn {
		flex: 1;
		min-width: calc(50% - 0.4rem);
	}

	.btn-row .btn {
		flex: 1;
		min-width: fit-content;
	}

	.section-header-row,
	.users-header,
	.inbox-header {
		flex-direction: column;
	}

	.submission-filters {
		grid-template-columns: 1fr;
	}

	.inbox-filters {
		width: 100%;
		justify-content: stretch;
	}

	.inbox-filters button {
		flex: 1;
		text-align: center;
		padding: 0.55rem 0.5rem;
		min-height: 2.75rem;
	}

	.inbox-actions {
		flex-direction: column;
	}

	.inbox-actions .btn {
		width: 100%;
		justify-content: center;
	}

	.week-item {
		flex-direction: column;
		align-items: stretch;
	}

	.week-item .btn {
		width: 100%;
	}

	.modal-actions {
		flex-direction: column-reverse;
	}

	.modal-actions .btn {
		width: 100%;
		justify-content: center;
	}

	.modal-backdrop {
		padding: 1rem;
		align-items: flex-end;
	}

	.modal {
		max-height: 90vh;
		overflow-y: auto;
		border-radius: 12px 12px 0 0;
	}

	.row-actions {
		flex-wrap: wrap;
	}

	.row-actions .btn {
		width: 100%;
		justify-content: center;
	}
}

.actions-cell {
	vertical-align: middle;
	white-space: nowrap;
}

.row-actions {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	gap: 0.35rem;
}

.row-actions .danger {
	color: #f08080;
}

.edit-sub-modal {
	max-width: 28rem;
	width: 100%;
}

.edit-sub-form {
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
}

.edit-sub-form label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.prompt-note {
	font-size: 0.85rem;
	color: var(--realm-text-muted);
	margin: 0;
}

.users-header {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
	margin-bottom: 1rem;
}

.setting-toggle {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	cursor: pointer;
	color: var(--realm-text);
	font-weight: 500;
}

.setting-toggle input {
	width: auto;
}

.modal.add-user-modal {
	max-width: 28rem;
	padding: 1.5rem 1.6rem 1.55rem;
}

.modal.add-user-modal h2 {
	margin: 0 0 0.45rem;
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1.2rem;
}

.modal.add-user-modal .section-desc {
	margin: 0 0 1.25rem;
	line-height: 1.45;
}

.add-user-form {
	display: flex;
	flex-direction: column;
	gap: 1.1rem;
}

.add-user-form label {
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.add-user-form .modal-actions {
	margin-top: 0.25rem;
	padding-top: 1rem;
	border-top: 1px solid var(--realm-border);
}

.discord-webhook-section {
	margin-top: 1rem;
	margin-bottom: 1.25rem;
}

.discord-webhook-form {
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
	min-width: 0;
}

.discord-webhook-form label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
	min-width: 0;
}

.discord-webhook-form input {
	min-width: 0;
	max-width: 100%;
}

.webhook-status {
	margin: 0;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.publish-checklist {
	margin: 0.75rem 0 0;
	padding: 0.65rem 0.85rem 0.65rem 1.4rem;
	border-radius: 8px;
	border: 1px solid var(--realm-border);
	background: color-mix(in srgb, var(--realm-bg) 70%, transparent);
	font-size: 0.85rem;
	color: var(--realm-text-muted);
	line-height: 1.45;
}

.publish-checklist li {
	margin: 0.2rem 0;
}

.publish-range-section {
	margin-bottom: 1.25rem;
}

.publish-range-presets {
	margin: 0.5rem 0 0.85rem;
	flex-wrap: wrap;
}

.publish-range-dates {
	display: flex;
	flex-wrap: wrap;
	gap: 0.85rem;
}

.publish-range-dates label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.scheduled-publish-section,
.team-chat-section {
	margin-top: 1rem;
	margin-bottom: 1.25rem;
}

.scheduled-publish-fields {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
	gap: 0.85rem;
	margin-top: 0.5rem;
}

.scheduled-publish-fields label,
.team-chat-urls label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
}

.team-chat-urls {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	margin-top: 0.5rem;
	min-width: 0;
}

.team-chat-urls input {
	min-width: 0;
	max-width: 100%;
}

.publish-preview-modal {
	max-width: 40rem;
}

.preview-image-btn {
	display: block;
	width: 100%;
	padding: 0;
	margin: 0 0 1rem;
	border: none;
	background: transparent;
	cursor: zoom-in;
	border-radius: var(--radius);
}

.preview-image-btn:focus-visible {
	outline: 2px solid var(--realm-accent);
	outline-offset: 2px;
}

.preview-image {
	width: 100%;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	margin-bottom: 0;
	pointer-events: none;
	display: block;
}

.show-deleted-toggle {
	margin: 0.25rem 0 1rem;
}

.deleted-submissions {
	margin-top: 1.5rem;
	padding-top: 1.25rem;
	border-top: 1px dashed var(--realm-border);
}

.deleted-submissions h3 {
	font-family: var(--font-display);
	color: var(--realm-text);
	font-size: 1rem;
	margin-bottom: 0.75rem;
}

.audit-section {
	padding: 1.15rem 1.25rem 1.35rem;
}

.audit-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
	margin-bottom: 1rem;
}

.audit-header h2 {
	margin: 0 0 0.3rem;
}

.audit-count {
	margin: 0;
	padding: 0.3rem 0.65rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	font-size: 0.78rem;
	color: var(--realm-text-muted);
	white-space: nowrap;
}

.audit-feed {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
}

.audit-entry {
	padding: 0.85rem 1rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: color-mix(in srgb, var(--realm-bg) 70%, transparent);
	outline: none;
}

.audit-entry:focus-visible {
	border-color: color-mix(in srgb, var(--realm-accent) 55%, var(--realm-border));
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--realm-accent) 22%, transparent);
}

.audit-entry-top {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: center;
	gap: 0.45rem 0.85rem;
	margin-bottom: 0.4rem;
}

.audit-action {
	display: inline-flex;
	align-items: center;
	padding: 0.22rem 0.6rem;
	border-radius: 999px;
	font-size: 0.78rem;
	font-weight: 700;
	letter-spacing: 0.01em;
	border: 1px solid var(--realm-border);
	background: var(--realm-surface);
	color: var(--realm-text);
}

.audit-action.tone-ok {
	border-color: color-mix(in srgb, var(--realm-success) 45%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-success) 14%, transparent);
	color: var(--realm-success);
}

.audit-action.tone-warn {
	border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 14%, transparent);
	color: var(--realm-accent-glow);
}

.audit-action.tone-danger {
	border-color: color-mix(in srgb, #e07070 45%, var(--realm-border));
	background: color-mix(in srgb, #e07070 12%, transparent);
	color: #f0a0a0;
}

.audit-action.tone-neutral {
	color: var(--realm-accent-glow);
	border-color: color-mix(in srgb, var(--realm-accent) 35%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 10%, transparent);
}

.audit-when {
	font-size: 0.8rem;
	color: var(--realm-text-muted);
}

.audit-entry-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.35rem;
	font-size: 0.88rem;
	color: var(--realm-text-muted);
	margin-bottom: 0.55rem;
}

.audit-who {
	color: var(--realm-text);
	font-weight: 600;
}

.audit-dot {
	opacity: 0.55;
}

.audit-entity {
	font-size: 0.84rem;
}

.audit-chips {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.audit-chips li {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.3rem 0.45rem;
	max-width: 100%;
	padding: 0.28rem 0.55rem;
	border-radius: 8px;
	background: var(--realm-surface);
	border: 1px solid var(--realm-border);
	font-size: 0.78rem;
}

.chip-label {
	color: var(--realm-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	font-size: 0.68rem;
	font-weight: 700;
}

.chip-value {
	color: var(--realm-text);
	overflow-wrap: anywhere;
}

@media (max-width: 640px) {
	.audit-header {
		flex-direction: column;
	}

	.audit-entry-top {
		flex-direction: column;
		align-items: flex-start;
	}
}

</style>
