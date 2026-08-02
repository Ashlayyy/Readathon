<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
	api,
	apiUrl,
	TEAM_CHAT_TEMPLATE_VARS,
	type AdminSiteSettings,
} from '../lib/api';
import { useConfig } from '../composables/useConfig';
import { useAdminCopy } from '../composables/useAdminCopy';

const emit = defineEmits<{ message: [text: string, isError?: boolean] }>();

const { config, loadConfig } = useConfig();
const { section, msg, confirmMsg } = useAdminCopy();

const loaded = ref(false);
const saving = ref(false);
const autoSaving = ref('');

const showTeamRosters = ref(false);
const downtimeMode = ref(false);
const monthlyWrapOnPublish = ref(false);

const discordTestWebhookUrl = ref('');
const discordTestWebhookDraft = ref('');
const discordTestRoleId = ref('');
const discordTestRoleIdDraft = ref('');
const discordProductionWebhookUrl = ref('');
const discordProductionWebhookDraft = ref('');
const discordProductionRoleId = ref('');
const discordProductionRoleIdDraft = ref('');

const scheduledPublishEnabled = ref(false);
const scheduledPublishDay = ref(1);
const scheduledPublishHour = ref(9);
const scheduledPublishTimezone = ref('Europe/Amsterdam');

const teamChatHooksEnabled = ref(false);
const teamChatWebhookUrls = ref<Record<string, string>>({});
const teamChatWebhookDrafts = ref<Record<string, string>>({});
const teamChatAddTemplates = ref<string[]>([]);
const teamChatAddDrafts = ref<string[]>([]);
const teamChatSabotageTemplates = ref<string[]>([]);
const teamChatSabotageDrafts = ref<string[]>([]);

const SCHEDULED_PUBLISH_DAYS = [
	{ value: 0, label: 'Sunday' },
	{ value: 1, label: 'Monday' },
	{ value: 2, label: 'Tuesday' },
	{ value: 3, label: 'Wednesday' },
	{ value: 4, label: 'Thursday' },
	{ value: 5, label: 'Friday' },
	{ value: 6, label: 'Saturday' },
];

function listsEqual(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	return a.every((v, i) => v === b[i]);
}

const dirty = computed(() => {
	if (discordTestWebhookDraft.value.trim() !== discordTestWebhookUrl.value) return true;
	if (discordTestRoleIdDraft.value.trim() !== discordTestRoleId.value) return true;
	if (
		discordProductionWebhookDraft.value.trim() !== discordProductionWebhookUrl.value
	)
		return true;
	if (discordProductionRoleIdDraft.value.trim() !== discordProductionRoleId.value)
		return true;
	const teams = config.value?.teams ?? [];
	for (const team of teams) {
		const draft = (teamChatWebhookDrafts.value[team.id] ?? '').trim();
		const saved = (teamChatWebhookUrls.value[team.id] ?? '').trim();
		if (draft !== saved) return true;
	}
	if (!listsEqual(teamChatAddDrafts.value, teamChatAddTemplates.value)) return true;
	if (!listsEqual(teamChatSabotageDrafts.value, teamChatSabotageTemplates.value)) return true;
	return false;
});

const statusChips = computed(() => [
	{
		id: 'discord',
		label: discordProductionWebhookUrl.value
			? 'Discord publish ready'
			: 'Discord publish off',
		on: Boolean(discordProductionWebhookUrl.value),
	},
	{
		id: 'schedule',
		label: scheduledPublishEnabled.value ? 'Auto-publish on' : 'Auto-publish off',
		on: scheduledPublishEnabled.value,
	},
	{
		id: 'realm',
		label: teamChatHooksEnabled.value ? 'Realm chat on' : 'Realm chat off',
		on: teamChatHooksEnabled.value,
	},
	{
		id: 'downtime',
		label: downtimeMode.value ? 'Downtime mode' : 'Site live',
		on: !downtimeMode.value,
	},
	{
		id: 'wrap',
		label: monthlyWrapOnPublish.value
			? '4-week wrap on 1st Mon'
			: '4-week wrap off',
		on: monthlyWrapOnPublish.value,
	},
]);

function applySettings(settings: AdminSiteSettings) {
	showTeamRosters.value = settings.showTeamRosters ?? false;
	downtimeMode.value = settings.downtimeMode ?? false;
	monthlyWrapOnPublish.value = settings.monthlyWrapOnPublish ?? false;
	discordTestWebhookUrl.value = settings.discordTestWebhookUrl ?? '';
	discordTestWebhookDraft.value = settings.discordTestWebhookUrl ?? '';
	discordTestRoleId.value = settings.discordTestRoleId ?? '';
	discordTestRoleIdDraft.value = settings.discordTestRoleId ?? '';
	discordProductionWebhookUrl.value =
		settings.discordProductionWebhookUrl || settings.discordWebhookUrl || '';
	discordProductionWebhookDraft.value =
		settings.discordProductionWebhookUrl || settings.discordWebhookUrl || '';
	discordProductionRoleId.value =
		settings.discordProductionRoleId || settings.discordRoleId || '';
	discordProductionRoleIdDraft.value =
		settings.discordProductionRoleId || settings.discordRoleId || '';
	scheduledPublishEnabled.value = settings.scheduledPublishEnabled ?? false;
	scheduledPublishDay.value = settings.scheduledPublishDay ?? 1;
	scheduledPublishHour.value = settings.scheduledPublishHour ?? 9;
	scheduledPublishTimezone.value =
		settings.scheduledPublishTimezone ?? 'Europe/Amsterdam';
	teamChatHooksEnabled.value = settings.teamChatHooksEnabled ?? false;
	teamChatWebhookUrls.value = { ...(settings.teamChatWebhookUrls ?? {}) };
	teamChatWebhookDrafts.value = { ...(settings.teamChatWebhookUrls ?? {}) };
	teamChatAddTemplates.value = [...(settings.teamChatAddTemplates ?? [])];
	teamChatAddDrafts.value = [...(settings.teamChatAddTemplates ?? [])];
	teamChatSabotageTemplates.value = [...(settings.teamChatSabotageTemplates ?? [])];
	teamChatSabotageDrafts.value = [...(settings.teamChatSabotageTemplates ?? [])];
}

async function loadSettings() {
	const { settings } = await api<{ settings: AdminSiteSettings }>('/admin/settings');
	applySettings(settings);
	loaded.value = true;
}

onMounted(async () => {
	try {
		await Promise.all([loadConfig(), loadSettings()]);
	} catch (e) {
		emit('message', e instanceof Error ? e.message : msg('settingsLoadFailed'), true);
	}
});

async function patchSettings(body: Record<string, unknown>, busyKey = 'save') {
	autoSaving.value = busyKey;
	try {
		const { settings } = await api<{ settings: AdminSiteSettings }>('/admin/settings', {
			method: 'PATCH',
			body: JSON.stringify(body),
		});
		applySettings(settings);
		await loadConfig(true);
		return settings;
	} finally {
		autoSaving.value = '';
	}
}

async function saveAllWebhookSettings() {
	if (!dirty.value || saving.value) return;
	saving.value = true;
	emit('message', '');
	try {
		const drafts: Record<string, string> = {};
		for (const team of config.value?.teams ?? []) {
			drafts[team.id] = (teamChatWebhookDrafts.value[team.id] ?? '').trim();
		}
		await patchSettings(
			{
				discordTestWebhookUrl: discordTestWebhookDraft.value.trim(),
				discordTestRoleId: discordTestRoleIdDraft.value.trim(),
				discordProductionWebhookUrl: discordProductionWebhookDraft.value.trim(),
				discordProductionRoleId: discordProductionRoleIdDraft.value.trim(),
				teamChatWebhookUrls: drafts,
				teamChatAddTemplates: teamChatAddDrafts.value
					.map((s) => s.trim())
					.filter(Boolean),
				teamChatSabotageTemplates: teamChatSabotageDrafts.value
					.map((s) => s.trim())
					.filter(Boolean),
			},
			'save',
		);
		emit('message', 'Settings saved.');
	} catch (e) {
		emit('message', e instanceof Error ? e.message : 'Failed to save settings', true);
		discardDrafts();
	} finally {
		saving.value = false;
	}
}

function discardDrafts() {
	discordTestWebhookDraft.value = discordTestWebhookUrl.value;
	discordTestRoleIdDraft.value = discordTestRoleId.value;
	discordProductionWebhookDraft.value = discordProductionWebhookUrl.value;
	discordProductionRoleIdDraft.value = discordProductionRoleId.value;
	teamChatWebhookDrafts.value = { ...teamChatWebhookUrls.value };
	teamChatAddDrafts.value = [...teamChatAddTemplates.value];
	teamChatSabotageDrafts.value = [...teamChatSabotageTemplates.value];
}

function addTemplate(kind: 'add' | 'sabotage') {
	const list = kind === 'add' ? teamChatAddDrafts : teamChatSabotageDrafts;
	list.value = [
		...list.value,
		kind === 'add'
			? '📖 **{{displayName}}** logged **"{{bookTitle}}"** for **{{teamName}}**.'
			: '⚔️ **{{displayName}}** sabotaged **{{targetTeamName}}** with **"{{bookTitle}}"**!',
	];
}

function removeTemplate(kind: 'add' | 'sabotage', index: number) {
	const list = kind === 'add' ? teamChatAddDrafts : teamChatSabotageDrafts;
	list.value = list.value.filter((_, i) => i !== index);
}

type TemplateFocus = { kind: 'add' | 'sabotage'; index: number } | null;
const focusedTemplate = ref<TemplateFocus>(null);
const previewKind = ref<'add' | 'sabotage'>('add');

const SAMPLE_VARS: Record<string, string> = {
	displayName: 'Ashlay',
	bookTitle: 'Disgrace',
	teamName: '† Wielders',
	targetTeamName: 'The Rivals',
	submissionType: 'add',
};

function onTemplateFocus(kind: 'add' | 'sabotage', index: number) {
	focusedTemplate.value = { kind, index };
	previewKind.value = kind;
}

function insertVariable(example: string) {
	const focus = focusedTemplate.value;
	if (!focus) {
		const list = previewKind.value === 'add' ? teamChatAddDrafts : teamChatSabotageDrafts;
		if (!list.value.length) addTemplate(previewKind.value);
		const index = Math.max(0, list.value.length - 1);
		list.value[index] = `${list.value[index] ?? ''}${example}`;
		focusedTemplate.value = { kind: previewKind.value, index };
		return;
	}
	const list = focus.kind === 'add' ? teamChatAddDrafts : teamChatSabotageDrafts;
	const current = list.value[focus.index] ?? '';
	list.value[focus.index] = `${current}${example}`;
}

function fillPreview(template: string): string {
	return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
		return SAMPLE_VARS[key] ?? '';
	});
}

/** Light Discord-style markdown: **bold** only. */
function previewHtml(template: string): string {
	const filled = fillPreview(template)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	return filled.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

const previewTemplate = computed(() => {
	const list =
		previewKind.value === 'add' ? teamChatAddDrafts.value : teamChatSabotageDrafts.value;
	const focus = focusedTemplate.value;
	if (focus && focus.kind === previewKind.value && list[focus.index]) {
		return list[focus.index]!;
	}
	return list[0] ?? '';
});

const previewHtmlComputed = computed(() =>
	previewTemplate.value
		? previewHtml(previewTemplate.value)
		: '<span class="preview-empty">Add a line to preview it.</span>',
);

async function onDowntimeToggle() {
	const enabling = downtimeMode.value;
	const ok = confirm(
		enabling ? confirmMsg('enableDowntime') : confirmMsg('disableDowntime'),
	);
	if (!ok) {
		downtimeMode.value = !enabling;
		return;
	}
	try {
		await patchSettings({ downtimeMode: downtimeMode.value }, 'downtime');
		emit('message', downtimeMode.value ? msg('downtimeOn') : msg('downtimeOff'));
	} catch (e) {
		emit('message', e instanceof Error ? e.message : msg('downtimeSettingFailed'), true);
		downtimeMode.value = config.value?.site?.downtimeMode ?? false;
	}
}

async function saveRosterSetting() {
	try {
		await patchSettings({ showTeamRosters: showTeamRosters.value }, 'roster');
		emit(
			'message',
			showTeamRosters.value ? msg('rostersPublic') : msg('rostersHidden'),
		);
	} catch (e) {
		emit('message', e instanceof Error ? e.message : msg('rosterSettingFailed'), true);
		showTeamRosters.value = config.value?.site?.showTeamRosters ?? false;
	}
}

async function saveScheduledPublishSettings() {
	try {
		await patchSettings(
			{
				scheduledPublishEnabled: scheduledPublishEnabled.value,
				scheduledPublishDay: scheduledPublishDay.value,
				scheduledPublishHour: scheduledPublishHour.value,
				scheduledPublishTimezone:
					scheduledPublishTimezone.value.trim() || 'Europe/Amsterdam',
			},
			'schedule',
		);
		emit('message', 'Scheduled publish updated.');
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to save scheduled publish settings',
			true,
		);
	}
}

async function saveTeamChatToggle() {
	try {
		await patchSettings(
			{ teamChatHooksEnabled: teamChatHooksEnabled.value },
			'realm-toggle',
		);
		emit(
			'message',
			teamChatHooksEnabled.value
				? 'Realm chat webhooks enabled.'
				: 'Realm chat webhooks disabled.',
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to update realm chat toggle',
			true,
		);
	}
}

async function sendDiscord(
	channel: 'test' | 'production',
	withPing: boolean,
) {
	const busyKey = `discord-${channel}-${withPing ? 'ping' : 'nopping'}`;
	autoSaving.value = busyKey;
	emit('message', '');
	try {
		const result = await api<{
			ok: boolean;
			roleId?: string;
			channel?: string;
			withPing?: boolean;
		}>('/admin/discord/send', {
			method: 'POST',
			body: JSON.stringify({ channel, withPing }),
		});
		const label = channel === 'test' ? 'Test' : 'Production';
		const pingNote = withPing
			? result.roleId
				? ` with role ping (${result.roleId})`
				: ' with role ping'
			: ' without ping';
		emit('message', `${label} Discord message sent${pingNote}.`);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : msg('webhookTestFailed'),
			true,
		);
	} finally {
		autoSaving.value = '';
	}
}

function discordBusy(channel: 'test' | 'production', withPing: boolean) {
	return autoSaving.value === `discord-${channel}-${withPing ? 'ping' : 'nopping'}`;
}

async function saveMonthlyWrapToggle() {
	try {
		await patchSettings(
			{ monthlyWrapOnPublish: monthlyWrapOnPublish.value },
			'wrap',
		);
		emit(
			'message',
			monthlyWrapOnPublish.value
				? '4-week wrap will send on the first Monday publish.'
				: '4-week wrap auto-send disabled.',
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to update wrap toggle',
			true,
		);
	}
}

async function sendDiscordStandings(includeMonthlyWrap: boolean) {
	const busyKey = includeMonthlyWrap
		? 'discord-standings-wrap'
		: 'discord-standings';
	autoSaving.value = busyKey;
	emit('message', '');
	try {
		await api('/admin/discord/send-standings', {
			method: 'POST',
			body: JSON.stringify({
				channel: 'test',
				includeMonthlyWrap,
				withPing: false,
			}),
		});
		emit(
			'message',
			includeMonthlyWrap
				? 'Test webhook: standings + 4-week wrap sent.'
				: 'Test webhook: standings sent.',
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to send standings to test webhook',
			true,
		);
	} finally {
		autoSaving.value = '';
	}
}

async function sendMonthlyWrapOnly(channel: 'test' | 'production') {
	autoSaving.value = `discord-wrap-${channel}`;
	emit('message', '');
	try {
		const result = await api<{ label?: string }>('/admin/discord/send-monthly-wrap', {
			method: 'POST',
			body: JSON.stringify({ channel, withPing: false }),
		});
		emit(
			'message',
			`${channel === 'test' ? 'Test' : 'Production'}: 4-week wrap sent (${result.label ?? 'ok'}).`,
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to send monthly wrap',
			true,
		);
	} finally {
		autoSaving.value = '';
	}
}

function openWrapPreview() {
	window.open(apiUrl('/admin/discord/monthly-wrap-preview.svg'), '_blank');
}
</script>

<template>
	<section class="admin-settings">
		<header class="settings-hero card">
			<div>
				<h2>Settings</h2>
				<p class="section-desc">
					Site mode, Discord publish, schedule, and realm chat — toggles save
					automatically; webhook URLs share one Save.
				</p>
			</div>
			<ul class="status-chips" aria-label="Settings status">
				<li
					v-for="chip in statusChips"
					:key="chip.id"
					class="status-chip"
					:class="{ on: chip.on }"
				>
					{{ chip.label }}
				</li>
			</ul>
		</header>

		<div v-if="!loaded" class="page-state" style="min-height: 12rem">
			<div class="page-spinner" role="status" aria-label="Loading" />
			<p>Loading settings…</p>
		</div>

		<template v-else>
			<div class="settings-grid">
				<article class="card settings-card">
					<h3>Site mode</h3>
					<p class="section-desc">
						{{ section('teams').downtimeHint }}
					</p>
					<label class="setting-toggle">
						<input
							v-model="downtimeMode"
							type="checkbox"
							:disabled="autoSaving === 'downtime'"
							@change="onDowntimeToggle"
						/>
						<span>{{ section('teams').downtimeToggle }}</span>
					</label>
					<label class="setting-toggle">
						<input
							v-model="showTeamRosters"
							type="checkbox"
							:disabled="autoSaving === 'roster'"
							@change="saveRosterSetting"
						/>
						<span>{{ section('teams').rostersToggle }}</span>
					</label>
					<p class="auto-hint">Saves automatically when you toggle.</p>
				</article>

				<article class="card settings-card">
					<h3>Scheduled publish</h3>
					<p class="section-desc">
						Automatically publish standings on a weekly schedule. The server
						checks every minute.
					</p>
					<label class="setting-toggle">
						<input
							v-model="scheduledPublishEnabled"
							type="checkbox"
							:disabled="autoSaving === 'schedule'"
							@change="saveScheduledPublishSettings"
						/>
						<span>Enable weekly scheduled publish</span>
					</label>
					<div class="field-row">
						<label>
							Day
							<select
								v-model.number="scheduledPublishDay"
								:disabled="autoSaving === 'schedule'"
								@change="saveScheduledPublishSettings"
							>
								<option
									v-for="day in SCHEDULED_PUBLISH_DAYS"
									:key="day.value"
									:value="day.value"
								>
									{{ day.label }}
								</option>
							</select>
						</label>
						<label>
							Hour (0–23)
							<input
								v-model.number="scheduledPublishHour"
								type="number"
								min="0"
								max="23"
								:disabled="autoSaving === 'schedule'"
								@change="saveScheduledPublishSettings"
							/>
						</label>
						<label>
							Timezone
							<input
								v-model="scheduledPublishTimezone"
								type="text"
								placeholder="Europe/Amsterdam"
								autocomplete="off"
								spellcheck="false"
								:disabled="autoSaving === 'schedule'"
								@change="saveScheduledPublishSettings"
							/>
						</label>
					</div>
					<p class="auto-hint">Saves automatically when you change a field.</p>
				</article>
			</div>

			<article class="card settings-card settings-card-wide">
				<div class="settings-card-head">
					<div>
						<h3>Theme of the month</h3>
						<p class="section-desc">
							Custom monthly themes (dates, multipliers, site overhaul, featured
							prompts) live under the <strong>Themes</strong> tab in the admin
							sidebar.
						</p>
					</div>
				</div>
			</article>

			<article class="card settings-card settings-card-wide">
				<div class="settings-card-head">
					<div>
						<h3>Webhook settings</h3>
						<p class="section-desc">
							Separate <strong>test</strong> and <strong>production</strong>
							standings webhooks (each with its own role ping), plus per-realm
							chat webhooks. Edit freely — click Save once when you’re done.
						</p>
					</div>
				</div>

				<label class="setting-toggle">
					<input
						v-model="monthlyWrapOnPublish"
						type="checkbox"
						:disabled="autoSaving === 'wrap'"
						@change="saveMonthlyWrapToggle"
					/>
					<span>Also send 4-week wrap on the first Monday of each month</span>
				</label>
				<p class="auto-hint">
					With weekly publish: first Monday also posts the dense last-4-weeks
					stats image to the production webhook. Manual send buttons are below.
				</p>

				<div class="webhook-columns">
					<div class="webhook-block">
						<h4>Test webhook</h4>
						<label>
							Test webhook URL
							<input
								v-model="discordTestWebhookDraft"
								type="url"
								:placeholder="section('standings').webhookPlaceholder"
								autocomplete="off"
								spellcheck="false"
								:disabled="saving"
							/>
						</label>
						<label>
							Test role ID (optional)
							<input
								v-model="discordTestRoleIdDraft"
								type="text"
								placeholder="123456789012345678"
								autocomplete="off"
								spellcheck="false"
								inputmode="numeric"
								:disabled="saving"
							/>
						</label>
						<div class="btn-row discord-send-row">
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="
									saving ||
									discordBusy('test', false) ||
									!discordTestWebhookUrl
								"
								@click="sendDiscord('test', false)"
							>
								{{
									discordBusy('test', false)
										? 'Sending…'
										: 'Send test message without ping'
								}}
							</button>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="
									saving ||
									discordBusy('test', true) ||
									!discordTestWebhookUrl ||
									!discordTestRoleId
								"
								@click="sendDiscord('test', true)"
							>
								{{
									discordBusy('test', true)
										? 'Sending…'
										: 'Send test message with ping'
								}}
							</button>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="
									saving ||
									autoSaving === 'discord-standings' ||
									!discordTestWebhookUrl
								"
								@click="sendDiscordStandings(false)"
							>
								{{
									autoSaving === 'discord-standings'
										? 'Sending…'
										: 'Send standings'
								}}
							</button>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="
									saving ||
									autoSaving === 'discord-standings-wrap' ||
									!discordTestWebhookUrl
								"
								@click="sendDiscordStandings(true)"
							>
								{{
									autoSaving === 'discord-standings-wrap'
										? 'Sending…'
										: 'Send standings + 4-week stats'
								}}
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								:disabled="
									saving ||
									autoSaving === 'discord-wrap-test' ||
									!discordTestWebhookUrl
								"
								@click="sendMonthlyWrapOnly('test')"
							>
								{{
									autoSaving === 'discord-wrap-test'
										? 'Sending…'
										: 'Send 4-week wrap only'
								}}
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								@click="openWrapPreview"
							>
								Preview wrap SVG
							</button>
						</div>
					</div>

					<div class="webhook-block">
						<h4>Production webhook</h4>
						<label>
							Production webhook URL
							<input
								v-model="discordProductionWebhookDraft"
								type="url"
								:placeholder="section('standings').webhookPlaceholder"
								autocomplete="off"
								spellcheck="false"
								:disabled="saving"
							/>
						</label>
						<label>
							Production role ID (optional)
							<input
								v-model="discordProductionRoleIdDraft"
								type="text"
								placeholder="123456789012345678"
								autocomplete="off"
								spellcheck="false"
								inputmode="numeric"
								:disabled="saving"
							/>
						</label>
						<div class="btn-row discord-send-row">
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="
									saving ||
									discordBusy('production', false) ||
									!discordProductionWebhookUrl
								"
								@click="sendDiscord('production', false)"
							>
								{{
									discordBusy('production', false)
										? 'Sending…'
										: 'Send message without ping'
								}}
							</button>
							<button
								type="button"
								class="btn btn-secondary btn-sm"
								:disabled="
									saving ||
									discordBusy('production', true) ||
									!discordProductionWebhookUrl ||
									!discordProductionRoleId
								"
								@click="sendDiscord('production', true)"
							>
								{{
									discordBusy('production', true)
										? 'Sending…'
										: 'Send message with ping'
								}}
							</button>
						</div>
						<p class="hint">
							Weekly publish uses the <strong>production</strong> webhook + role.
							Copy a <strong>Role ID</strong> (Developer Mode → right-click the
							role → Copy Role ID) from the <em>same server</em> as the webhook —
							a user ID shows as @unknown-role. Save before sending tests.
						</p>
						<div class="btn-row discord-send-row" style="margin-top: 0.5rem">
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								:disabled="
									saving ||
									autoSaving === 'discord-wrap-production' ||
									!discordProductionWebhookUrl
								"
								@click="sendMonthlyWrapOnly('production')"
							>
								{{
									autoSaving === 'discord-wrap-production'
										? 'Sending…'
										: 'Send 4-week wrap (production)'
								}}
							</button>
						</div>
					</div>

					<div class="webhook-block">
						<h4>Realm chat</h4>
						<p class="section-desc">
							Posts a short, fun note to each realm’s Discord channel when a
							member logs a book.
						</p>
						<label class="setting-toggle">
							<input
								v-model="teamChatHooksEnabled"
								type="checkbox"
								:disabled="autoSaving === 'realm-toggle'"
								@change="saveTeamChatToggle"
							/>
							<span>Enable realm chat webhooks</span>
						</label>
						<div v-if="config" class="team-chat-urls">
							<label v-for="team in config.teams" :key="team.id">
								{{ team.icon }} {{ team.name }}
								<input
									v-model="teamChatWebhookDrafts[team.id]"
									type="url"
									placeholder="https://discord.com/api/webhooks/..."
									autocomplete="off"
									spellcheck="false"
									:disabled="saving"
								/>
							</label>
						</div>
					</div>
				</div>

				<section class="template-editor">
					<div class="template-editor-head">
						<div>
							<h4>Realm chat messages</h4>
							<p class="section-desc">
								One line is picked at random when someone logs a book. Click a variable to
								insert it into the focused line. Empty categories re-seed five defaults on
								save / load.
							</p>
						</div>
					</div>

					<div class="var-toolbar" role="toolbar" aria-label="Template variables">
						<button
							v-for="v in TEAM_CHAT_TEMPLATE_VARS"
							:key="v.key"
							type="button"
							class="var-chip-btn"
							:disabled="saving"
							:title="`Insert ${v.example}`"
							@click="insertVariable(v.example)"
						>
							{{ v.example }}
						</button>
					</div>

					<div class="template-preview card">
						<div class="preview-tabs">
							<button
								type="button"
								:class="{ active: previewKind === 'add' }"
								@click="previewKind = 'add'"
							>
								Add preview
							</button>
							<button
								type="button"
								:class="{ active: previewKind === 'sabotage' }"
								@click="previewKind = 'sabotage'"
							>
								Sabotage preview
							</button>
						</div>
						<div class="discord-preview" v-html="previewHtmlComputed" />
					</div>

					<div class="template-columns">
						<div class="template-column card">
							<div class="template-column-head">
								<div>
									<strong>Add</strong>
									<span class="col-count">{{ teamChatAddDrafts.length }} lines</span>
								</div>
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									:disabled="saving"
									@click="addTemplate('add')"
								>
									+ Add line
								</button>
							</div>
							<div
								v-for="(line, i) in teamChatAddDrafts"
								:key="`add-${i}`"
								class="template-row"
								:class="{
									focused:
										focusedTemplate?.kind === 'add' && focusedTemplate.index === i,
								}"
							>
								<textarea
									v-model="teamChatAddDrafts[i]"
									rows="4"
									spellcheck="true"
									:disabled="saving"
									placeholder='📖 **{{displayName}}** logged "{{bookTitle}}"…'
									@focus="onTemplateFocus('add', i)"
								/>
								<button
									type="button"
									class="icon-remove"
									:disabled="saving"
									aria-label="Remove line"
									title="Remove"
									@click="removeTemplate('add', i)"
								>
									×
								</button>
								<p v-if="line.trim()" class="row-preview" v-html="previewHtml(line)" />
							</div>
							<p v-if="!teamChatAddDrafts.length" class="empty-col">No add lines yet.</p>
						</div>

						<div class="template-column card">
							<div class="template-column-head">
								<div>
									<strong>Sabotage</strong>
									<span class="col-count">{{ teamChatSabotageDrafts.length }} lines</span>
								</div>
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									:disabled="saving"
									@click="addTemplate('sabotage')"
								>
									+ Add line
								</button>
							</div>
							<div
								v-for="(line, i) in teamChatSabotageDrafts"
								:key="`sab-${i}`"
								class="template-row"
								:class="{
									focused:
										focusedTemplate?.kind === 'sabotage' && focusedTemplate.index === i,
								}"
							>
								<textarea
									v-model="teamChatSabotageDrafts[i]"
									rows="4"
									spellcheck="true"
									:disabled="saving"
									placeholder='⚔️ **{{displayName}}** sabotaged **{{targetTeamName}}**…'
									@focus="onTemplateFocus('sabotage', i)"
								/>
								<button
									type="button"
									class="icon-remove"
									:disabled="saving"
									aria-label="Remove line"
									title="Remove"
									@click="removeTemplate('sabotage', i)"
								>
									×
								</button>
								<p v-if="line.trim()" class="row-preview" v-html="previewHtml(line)" />
							</div>
							<p v-if="!teamChatSabotageDrafts.length" class="empty-col">No sabotage lines yet.</p>
						</div>
					</div>
				</section>

				<div class="btn-row save-row">
					<button
						type="button"
						class="btn btn-ghost"
						:disabled="!dirty || saving"
						@click="discardDrafts"
					>
						Discard
					</button>
					<button
						type="button"
						class="btn btn-primary"
						:disabled="!dirty || saving"
						@click="saveAllWebhookSettings"
					>
						{{ saving ? 'Saving…' : dirty ? 'Save settings' : 'Saved' }}
					</button>
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
					You have unsaved settings — save or discard before you leave.
				</p>
				<div class="unsaved-sticky-actions">
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						:disabled="saving"
						@click="discardDrafts"
					>
						Discard
					</button>
					<button
						type="button"
						class="btn btn-primary btn-sm"
						:disabled="saving"
						@click="saveAllWebhookSettings"
					>
						{{ saving ? 'Saving…' : 'Save settings' }}
					</button>
				</div>
			</div>
		</Teleport>
	</section>
</template>

<style>
/* Teleported to body — unscoped so the sticky bar works outside the component. */
.unsaved-sticky {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 10000;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.65rem 1rem;
	padding: 0.7rem 1.1rem;
	background: #8b1e1e;
	border-bottom: 2px solid #ff6b6b;
	box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
	color: #fff5f5;
}

.unsaved-sticky-text {
	margin: 0;
	font-size: 0.92rem;
	font-weight: 700;
	letter-spacing: 0.01em;
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

<style scoped>
.admin-settings {
	display: flex;
	flex-direction: column;
	gap: 1.1rem;
}

.settings-hero {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 1rem;
	padding: 1.15rem 1.25rem;
	align-items: flex-start;
}

.settings-hero h2 {
	margin: 0 0 0.35rem;
	font-family: var(--font-display);
	font-size: 1.35rem;
}

.status-chips {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	justify-content: flex-end;
}

.status-chip {
	padding: 0.28rem 0.65rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--realm-text-muted);
	background: var(--realm-bg);
}

.status-chip.on {
	border-color: color-mix(in srgb, var(--realm-success) 45%, var(--realm-border));
	color: var(--realm-success);
	background: color-mix(in srgb, var(--realm-success) 12%, transparent);
}

.settings-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1.1rem;
}

.settings-card {
	padding: 1.15rem 1.25rem;
}

.settings-card h3 {
	margin: 0 0 0.35rem;
	font-family: var(--font-display);
	font-size: 1.1rem;
}

.settings-card h4 {
	margin: 0 0 0.55rem;
	font-size: 0.92rem;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--realm-accent-glow);
}

.settings-card-wide {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.settings-card-head {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 0.85rem;
	align-items: flex-start;
}

.section-desc {
	margin: 0 0 0.85rem;
	color: var(--realm-text-muted);
	font-size: 0.92rem;
	line-height: 1.45;
}

.setting-toggle {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	margin: 0.55rem 0;
	color: var(--realm-text);
	font-size: 0.95rem;
}

.auto-hint,
.hint {
	margin: 0.65rem 0 0;
	font-size: 0.8rem;
	color: var(--realm-text-muted);
}

.field-row {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.75rem;
	margin-top: 0.75rem;
}

.field-row label,
.webhook-block label,
.team-chat-urls label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.82rem;
	color: var(--realm-text-muted);
}

.field-row input,
.field-row select,
.webhook-block input,
.team-chat-urls input {
	padding: 0.55rem 0.65rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
}

.webhook-columns {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1.25rem;
}

.webhook-block {
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
	padding: 0.85rem 0.95rem;
	border: 1px solid var(--realm-border);
	border-radius: var(--radius);
	background: color-mix(in srgb, var(--realm-bg) 70%, transparent);
}

.team-chat-urls {
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
}

.btn-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	align-items: center;
}

.discord-send-row {
	flex-direction: column;
	align-items: stretch;
}

.discord-send-row .btn {
	justify-content: center;
	text-align: center;
}


.save-row {
	flex-shrink: 0;
	justify-content: flex-end;
	margin-top: 0.25rem;
}


.template-editor {
	margin-top: 0.35rem;
	padding-top: 1rem;
	border-top: 1px solid var(--realm-border);
	display: flex;
	flex-direction: column;
	gap: 0.9rem;
}

.template-editor h4 {
	margin: 0 0 0.35rem;
	font-size: 0.92rem;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--realm-accent-glow);
}

.var-toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.var-chip-btn {
	appearance: none;
	cursor: pointer;
	padding: 0.28rem 0.55rem;
	border-radius: 999px;
	border: 1px solid color-mix(in srgb, var(--realm-accent) 35%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 12%, var(--realm-bg));
	color: var(--realm-accent-glow);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.72rem;
	transition:
		background 0.15s ease,
		transform 0.15s ease;
}

.var-chip-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--realm-accent) 22%, var(--realm-bg));
	transform: translateY(-1px);
}

.var-chip-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.template-preview {
	padding: 0.85rem 1rem;
	background: color-mix(in srgb, #1e1f22 70%, var(--realm-surface));
	border: 1px solid var(--realm-border);
}

.preview-tabs {
	display: flex;
	gap: 0.35rem;
	margin-bottom: 0.65rem;
}

.preview-tabs button {
	appearance: none;
	border: 1px solid var(--realm-border);
	background: transparent;
	color: var(--realm-text-muted);
	padding: 0.25rem 0.65rem;
	border-radius: 999px;
	font-size: 0.75rem;
	cursor: pointer;
}

.preview-tabs button.active {
	color: var(--realm-text);
	border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
	background: color-mix(in srgb, var(--realm-accent) 14%, transparent);
}

.discord-preview {
	font-size: 0.95rem;
	line-height: 1.45;
	color: #dbdee1;
	min-height: 1.5rem;
}

.discord-preview :deep(strong) {
	font-weight: 700;
	color: #f2f3f5;
}

.template-columns {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1rem;
}

.template-column {
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
	padding: 0.9rem;
	background: var(--realm-bg);
}

.template-column-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.template-column-head strong {
	display: block;
	font-size: 0.95rem;
}

.col-count {
	display: block;
	font-size: 0.72rem;
	color: var(--realm-text-muted);
}

.template-row {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	padding: 0.65rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-surface);
	transition: border-color 0.15s ease;
}

.template-row.focused {
	border-color: color-mix(in srgb, var(--realm-accent) 55%, var(--realm-border));
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--realm-accent) 25%, transparent);
}

.template-row textarea {
	width: 100%;
	padding: 0.55rem 2rem 0.55rem 0.65rem;
	border-radius: calc(var(--radius) - 2px);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
	font-family: var(--font-body);
	font-size: 0.88rem;
	resize: vertical;
	min-height: 5.5rem;
}

.icon-remove {
	position: absolute;
	top: 0.55rem;
	right: 0.55rem;
	width: 1.6rem;
	height: 1.6rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text-muted);
	cursor: pointer;
	font-size: 1.1rem;
	line-height: 1;
	display: grid;
	place-items: center;
}

.icon-remove:hover:not(:disabled) {
	color: var(--realm-accent);
	border-color: color-mix(in srgb, var(--realm-accent) 45%, var(--realm-border));
}

.row-preview {
	margin: 0;
	padding: 0.35rem 0.45rem;
	font-size: 0.8rem;
	color: var(--realm-text-muted);
	border-radius: 4px;
	background: color-mix(in srgb, var(--realm-bg) 80%, transparent);
}

.row-preview :deep(strong) {
	color: var(--realm-text);
}

.empty-col {
	margin: 0;
	font-size: 0.85rem;
	color: var(--realm-text-muted);
}

@media (max-width: 900px) {
	.settings-grid,
	.webhook-columns,
	.field-row,
	.template-columns {
		grid-template-columns: 1fr;
	}
}
</style>
