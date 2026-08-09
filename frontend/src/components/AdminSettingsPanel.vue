<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
	api,
	apiUrl,
	TEAM_CHAT_TEMPLATE_VARS,
	type AdminSiteSettings,
	type DiscordGuildConfig,
} from '../lib/api';
import { useConfig } from '../composables/useConfig';
import { useAdminCopy } from '../composables/useAdminCopy';
import AdminSearchableSelect from './AdminSearchableSelect.vue';

const emit = defineEmits<{ message: [text: string, isError?: boolean] }>();

const { config, loadConfig } = useConfig();
const { section, msg, confirmMsg } = useAdminCopy();

const loaded = ref(false);
const saving = ref(false);
const autoSaving = ref('');

const showTeamRosters = ref(false);
const downtimeMode = ref(false);
const monthlyWrapOnPublish = ref(false);
const closeSeasonDowntime = ref(false);
const closingSeason = ref(false);
const seasonArchiveSlug = ref('');
const discordHealthLoading = ref(false);
const discordHealth = ref<{
	botTokenConfigured: boolean
	gatewayReady: boolean
	gatewayUser: string | null
	productionConfigured: boolean
	productionRoleId: boolean
	lastPublishedAt: string | null
	lastPublishedWeekLabel: string | null
	lastMonthlyWrapAt: string | null
} | null>(null);

function emptyGuildConfig(guildId: string, name = ''): DiscordGuildConfig {
	return {
		guildId,
		name,
		testDeliveryMode: 'webhook',
		productionDeliveryMode: 'webhook',
		testWebhookUrl: '',
		testRoleId: '',
		productionWebhookUrl: '',
		productionRoleId: '',
		testChannelId: '',
		productionChannelId: '',
		botCommandRoleIds: [],
		teamChatWebhookUrls: {},
		teamChatChannelIds: {},
	};
}

const discordGuildConfigs = ref<Record<string, DiscordGuildConfig>>({});
const discordGuildConfigsSaved = ref<Record<string, DiscordGuildConfig>>({});
const discordPrimaryGuildId = ref('');
const discordPrimaryGuildIdSaved = ref('');
const editingGuildId = ref('');
const sendTargetGuildId = ref('');
const sendTargetGuildIdSaved = ref('');
const botGuilds = ref<Array<{ id: string; name: string }>>([]);
const botGuildsLoading = ref(false);
const botGuildsFetchedAt = ref('');
const addGuildIdDraft = ref('');

/** Session-level cache so remounting Settings doesn't blank the picker. */
let sessionBotGuilds: {
	guilds: Array<{ id: string; name: string }>;
	fetchedAt: string;
} | null = null;

function hydrateBotGuildsFromCache(
	guilds: Array<{ id: string; name: string }>,
	fetchedAt = '',
) {
	botGuilds.value = guilds.map((g) => ({ id: g.id, name: g.name }));
	botGuildsFetchedAt.value = fetchedAt;
	sessionBotGuilds = {
		guilds: botGuilds.value.map((g) => ({ ...g })),
		fetchedAt,
	};
}

function addGuildById(raw: string) {
	const id = raw.trim();
	if (!/^\d{5,30}$/.test(id)) return;
	ensureGuildConfig(id);
	selectEditingGuild(id);
	if (!sendTargetGuildId.value) sendTargetGuildId.value = id;
	if (!discordPrimaryGuildId.value) discordPrimaryGuildId.value = id;
	addGuildIdDraft.value = '';
}

const discordTestWebhookUrl = ref('');
const discordTestWebhookDraft = ref('');
const discordTestRoleId = ref('');
const discordTestRoleIdDraft = ref('');
const discordProductionWebhookUrl = ref('');
const discordProductionWebhookDraft = ref('');
const discordProductionRoleId = ref('');
const discordProductionRoleIdDraft = ref('');

const discordTestDeliveryMode = ref<'webhook' | 'bot'>('webhook');
const discordTestDeliveryModeSaved = ref<'webhook' | 'bot'>('webhook');
const discordProductionDeliveryMode = ref<'webhook' | 'bot'>('webhook');
const discordProductionDeliveryModeSaved = ref<'webhook' | 'bot'>('webhook');
const discordBotTokenConfigured = ref(false);
const discordBotTokenDraft = ref('');
const clearDiscordBotToken = ref(false);
const discordGuildId = ref('');
const discordGuildIdDraft = ref('');
const discordTestChannelId = ref('');
const discordTestChannelIdDraft = ref('');
const discordProductionChannelId = ref('');
const discordProductionChannelIdDraft = ref('');
const discordBotCommandRoleIds = ref<string[]>([]);
const discordBotCommandRoleIdsDraft = ref<string[]>([]);
const guildRoles = ref<Array<{ id: string; name: string }>>([]);
const guildRolesLoading = ref(false);

const scheduledPublishEnabled = ref(false);
const scheduledPublishDay = ref(1);
const scheduledPublishHour = ref(9);
const scheduledPublishTimezone = ref('Europe/Amsterdam');

const teamChatHooksEnabled = ref(false);
const teamChatWebhookUrls = ref<Record<string, string>>({});
const teamChatWebhookDrafts = ref<Record<string, string>>({});
const teamChatChannelIds = ref<Record<string, string>>({});
const teamChatChannelDrafts = ref<Record<string, string>>({});
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
	if (
		discordPrimaryGuildId.value.trim() !==
		discordPrimaryGuildIdSaved.value.trim()
	)
		return true;
	if (sendTargetGuildId.value.trim() !== sendTargetGuildIdSaved.value.trim())
		return true;
	if (
		JSON.stringify(discordGuildConfigs.value) !==
		JSON.stringify(discordGuildConfigsSaved.value)
	)
		return true;
	if (discordTestDeliveryMode.value !== discordTestDeliveryModeSaved.value)
		return true;
	if (
		discordProductionDeliveryMode.value !==
		discordProductionDeliveryModeSaved.value
	)
		return true;
	if (discordBotTokenDraft.value.trim()) return true;
	if (clearDiscordBotToken.value) return true;
	if (discordGuildIdDraft.value.trim() !== discordGuildId.value) return true;
	if (discordTestChannelIdDraft.value.trim() !== discordTestChannelId.value)
		return true;
	if (
		discordProductionChannelIdDraft.value.trim() !==
		discordProductionChannelId.value
	)
		return true;
	if (
		!listsEqual(
			discordBotCommandRoleIdsDraft.value,
			discordBotCommandRoleIds.value,
		)
	)
		return true;
	if (discordTestWebhookDraft.value.trim() !== discordTestWebhookUrl.value)
		return true;
	if (discordTestRoleIdDraft.value.trim() !== discordTestRoleId.value)
		return true;
	if (
		discordProductionWebhookDraft.value.trim() !==
		discordProductionWebhookUrl.value
	)
		return true;
	if (
		discordProductionRoleIdDraft.value.trim() !== discordProductionRoleId.value
	)
		return true;
	const teams = config.value?.teams ?? [];
	for (const team of teams) {
		const draft = (teamChatWebhookDrafts.value[team.id] ?? '').trim();
		const saved = (teamChatWebhookUrls.value[team.id] ?? '').trim();
		if (draft !== saved) return true;
		const chDraft = (teamChatChannelDrafts.value[team.id] ?? '').trim();
		const chSaved = (teamChatChannelIds.value[team.id] ?? '').trim();
		if (chDraft !== chSaved) return true;
	}
	if (!listsEqual(teamChatAddDrafts.value, teamChatAddTemplates.value))
		return true;
	if (
		!listsEqual(teamChatSabotageDrafts.value, teamChatSabotageTemplates.value)
	)
		return true;
	return false;
});

const testChannelReady = computed(() => {
	if (discordTestDeliveryMode.value === 'bot') {
		return (
			discordBotTokenConfigured.value &&
			Boolean(discordTestChannelId.value.trim())
		);
	}
	return Boolean(discordTestWebhookUrl.value.trim());
});

const productionChannelReady = computed(() => {
	if (discordProductionDeliveryMode.value === 'bot') {
		return (
			discordBotTokenConfigured.value &&
			Boolean(discordProductionChannelId.value.trim())
		);
	}
	return Boolean(discordProductionWebhookUrl.value.trim());
});

/** Effective config for the server manual sends/verifies target. */
function sendTargetGuildConfig(): DiscordGuildConfig | null {
	const gid = sendTargetGuildId.value.trim();
	if (!gid) return null;
	if (gid === editingGuildId.value.trim()) {
		const prev = discordGuildConfigs.value[gid] ?? emptyGuildConfig(gid);
		return {
			...prev,
			guildId: gid,
			testDeliveryMode: discordTestDeliveryMode.value,
			productionDeliveryMode: discordProductionDeliveryMode.value,
			testWebhookUrl: discordTestWebhookDraft.value.trim(),
			testRoleId: discordTestRoleIdDraft.value.trim(),
			productionWebhookUrl: discordProductionWebhookDraft.value.trim(),
			productionRoleId: discordProductionRoleIdDraft.value.trim(),
			testChannelId: discordTestChannelIdDraft.value.trim(),
			productionChannelId: discordProductionChannelIdDraft.value.trim(),
		};
	}
	return discordGuildConfigs.value[gid] ?? null;
}

const sendTargetTestReady = computed(() => {
	const cfg = sendTargetGuildConfig();
	if (!cfg) return false;
	if (cfg.testDeliveryMode === 'bot') {
		return discordBotTokenConfigured.value && Boolean(cfg.testChannelId.trim());
	}
	return Boolean(cfg.testWebhookUrl.trim());
});

const sendTargetProductionReady = computed(() => {
	const cfg = sendTargetGuildConfig();
	if (!cfg) return false;
	if (cfg.productionDeliveryMode === 'bot') {
		return (
			discordBotTokenConfigured.value && Boolean(cfg.productionChannelId.trim())
		);
	}
	return Boolean(cfg.productionWebhookUrl.trim());
});

function roleIdForSendChannel(channel: 'test' | 'production'): string {
	const cfg = sendTargetGuildConfig();
	if (!cfg) return '';
	return channel === 'test'
		? cfg.testRoleId.trim()
		: cfg.productionRoleId.trim();
}

function guildLabel(guildId: string): string {
	const id = guildId.trim();
	if (!id) return '—';
	const opt = configuredGuildOptions().find((g) => g.id === id);
	return opt?.label ?? id;
}

const botTokenStatus = computed(() => {
	if (clearDiscordBotToken.value) {
		return {
			tone: 'warn' as const,
			text: 'Clear armed — Save to remove token',
		};
	}
	if (discordBotTokenDraft.value.trim()) {
		return { tone: 'warn' as const, text: 'New token pasted — Save to store' };
	}
	if (discordBotTokenConfigured.value) {
		return { tone: 'ok' as const, text: 'Token stored (encrypted)' };
	}
	return { tone: 'off' as const, text: 'No bot token yet' };
});

const discordFlowStatus = computed(() => [
	{
		label: 'Token',
		value: botTokenStatus.value.text,
		tone: botTokenStatus.value.tone,
	},
	{
		label: 'Servers',
		value: botGuildsLoading.value
			? 'Loading…'
			: botGuilds.value.length
				? `${botGuilds.value.length} known`
				: 'None loaded',
		tone: botGuilds.value.length ? ('ok' as const) : ('off' as const),
	},
	{
		label: 'Primary',
		value: guildLabel(discordPrimaryGuildId.value),
		tone: discordPrimaryGuildId.value ? ('ok' as const) : ('off' as const),
	},
	{
		label: 'Editing',
		value: guildLabel(editingGuildId.value),
		tone: editingGuildId.value ? ('ok' as const) : ('off' as const),
	},
	{
		label: 'Send tests to',
		value: guildLabel(sendTargetGuildId.value),
		tone: sendTargetGuildId.value ? ('ok' as const) : ('off' as const),
	},
]);

const statusChips = computed(() => [
	{
		id: 'discord',
		label: productionChannelReady.value
			? `Discord prod ${discordProductionDeliveryMode.value}`
			: 'Discord publish off',
		on: productionChannelReady.value,
	},
	{
		id: 'schedule',
		label: scheduledPublishEnabled.value
			? 'Auto-publish on'
			: 'Auto-publish off',
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
			? '4-week wrap enabled'
			: '4-week wrap off',
		on: monthlyWrapOnPublish.value,
	},
]);

function applySettings(settings: AdminSiteSettings) {
	showTeamRosters.value = settings.showTeamRosters ?? false;
	downtimeMode.value = settings.downtimeMode ?? false;
	monthlyWrapOnPublish.value = settings.monthlyWrapOnPublish ?? false;
	seasonArchiveSlug.value = settings.seasonArchive?.slug?.trim() || '';
	discordTestDeliveryMode.value =
		settings.discordTestDeliveryMode === 'bot'
			? 'bot'
			: settings.discordDeliveryMode === 'bot'
				? 'bot'
				: 'webhook';
	discordTestDeliveryModeSaved.value = discordTestDeliveryMode.value;
	discordProductionDeliveryMode.value =
		settings.discordProductionDeliveryMode === 'bot'
			? 'bot'
			: settings.discordDeliveryMode === 'bot'
				? 'bot'
				: 'webhook';
	discordProductionDeliveryModeSaved.value =
		discordProductionDeliveryMode.value;
	discordBotTokenConfigured.value = Boolean(settings.discordBotTokenConfigured);
	discordBotTokenDraft.value = '';
	clearDiscordBotToken.value = false;
	discordGuildId.value = settings.discordGuildId ?? '';
	discordGuildIdDraft.value = settings.discordGuildId ?? '';
	discordTestChannelId.value = settings.discordTestChannelId ?? '';
	discordTestChannelIdDraft.value = settings.discordTestChannelId ?? '';
	discordProductionChannelId.value = settings.discordProductionChannelId ?? '';
	discordProductionChannelIdDraft.value =
		settings.discordProductionChannelId ?? '';
	discordBotCommandRoleIds.value = [
		...(settings.discordBotCommandRoleIds ?? []),
	];
	discordBotCommandRoleIdsDraft.value = [
		...(settings.discordBotCommandRoleIds ?? []),
	];
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
	teamChatChannelIds.value = { ...(settings.teamChatChannelIds ?? {}) };
	teamChatChannelDrafts.value = { ...(settings.teamChatChannelIds ?? {}) };
	teamChatAddTemplates.value = [...(settings.teamChatAddTemplates ?? [])];
	teamChatAddDrafts.value = [...(settings.teamChatAddTemplates ?? [])];
	teamChatSabotageTemplates.value = [
		...(settings.teamChatSabotageTemplates ?? []),
	];
	teamChatSabotageDrafts.value = [
		...(settings.teamChatSabotageTemplates ?? []),
	];

	const configs = { ...(settings.discordGuildConfigs ?? {}) };
	if (
		!Object.keys(configs).length &&
		(settings.discordPrimaryGuildId || settings.discordGuildId)
	) {
		const id = settings.discordPrimaryGuildId || settings.discordGuildId;
		configs[id] = {
			...emptyGuildConfig(id),
			testDeliveryMode:
				settings.discordTestDeliveryMode === 'bot' ? 'bot' : 'webhook',
			productionDeliveryMode:
				settings.discordProductionDeliveryMode === 'bot' ? 'bot' : 'webhook',
			testWebhookUrl: settings.discordTestWebhookUrl ?? '',
			testRoleId: settings.discordTestRoleId ?? '',
			productionWebhookUrl:
				settings.discordProductionWebhookUrl ||
				settings.discordWebhookUrl ||
				'',
			productionRoleId:
				settings.discordProductionRoleId || settings.discordRoleId || '',
			testChannelId: settings.discordTestChannelId ?? '',
			productionChannelId: settings.discordProductionChannelId ?? '',
			botCommandRoleIds: [...(settings.discordBotCommandRoleIds ?? [])],
			teamChatWebhookUrls: { ...(settings.teamChatWebhookUrls ?? {}) },
			teamChatChannelIds: { ...(settings.teamChatChannelIds ?? {}) },
		};
	}
	discordGuildConfigs.value = configs;
	discordGuildConfigsSaved.value = JSON.parse(JSON.stringify(configs));
	const primary =
		settings.discordPrimaryGuildId ||
		settings.discordGuildId ||
		Object.keys(configs)[0] ||
		'';
	discordPrimaryGuildId.value = primary;
	discordPrimaryGuildIdSaved.value = primary;
	editingGuildId.value = primary;
	const sendTarget =
		(settings.discordSendTargetGuildId || '').trim() || primary;
	sendTargetGuildId.value = sendTarget;
	sendTargetGuildIdSaved.value = sendTarget;
	const cachedGuilds = settings.discordBotGuildsCache?.guilds?.length
		? settings.discordBotGuildsCache
		: sessionBotGuilds;
	if (cachedGuilds?.guilds?.length) {
		hydrateBotGuildsFromCache(
			cachedGuilds.guilds,
			cachedGuilds.fetchedAt ?? '',
		);
	}
	if (primary) loadGuildDrafts(primary);
}

function loadGuildDrafts(guildId: string) {
	const cfg = discordGuildConfigs.value[guildId] ?? emptyGuildConfig(guildId);
	discordTestDeliveryMode.value = cfg.testDeliveryMode;
	discordTestDeliveryModeSaved.value = cfg.testDeliveryMode;
	discordProductionDeliveryMode.value = cfg.productionDeliveryMode;
	discordProductionDeliveryModeSaved.value = cfg.productionDeliveryMode;
	discordTestWebhookUrl.value = cfg.testWebhookUrl;
	discordTestWebhookDraft.value = cfg.testWebhookUrl;
	discordTestRoleId.value = cfg.testRoleId;
	discordTestRoleIdDraft.value = cfg.testRoleId;
	discordProductionWebhookUrl.value = cfg.productionWebhookUrl;
	discordProductionWebhookDraft.value = cfg.productionWebhookUrl;
	discordProductionRoleId.value = cfg.productionRoleId;
	discordProductionRoleIdDraft.value = cfg.productionRoleId;
	discordTestChannelId.value = cfg.testChannelId;
	discordTestChannelIdDraft.value = cfg.testChannelId;
	discordProductionChannelId.value = cfg.productionChannelId;
	discordProductionChannelIdDraft.value = cfg.productionChannelId;
	discordBotCommandRoleIds.value = [...cfg.botCommandRoleIds];
	discordBotCommandRoleIdsDraft.value = [...cfg.botCommandRoleIds];
	teamChatWebhookUrls.value = { ...cfg.teamChatWebhookUrls };
	teamChatWebhookDrafts.value = { ...cfg.teamChatWebhookUrls };
	teamChatChannelIds.value = { ...cfg.teamChatChannelIds };
	teamChatChannelDrafts.value = { ...cfg.teamChatChannelIds };
	discordGuildId.value = guildId;
	discordGuildIdDraft.value = guildId;
}

function flushGuildDrafts(guildId: string) {
	if (!guildId) return;
	const prev = discordGuildConfigs.value[guildId] ?? emptyGuildConfig(guildId);
	const webhookDrafts: Record<string, string> = {};
	const channelDrafts: Record<string, string> = {};
	for (const team of config.value?.teams ?? []) {
		webhookDrafts[team.id] = (
			teamChatWebhookDrafts.value[team.id] ?? ''
		).trim();
		channelDrafts[team.id] = (
			teamChatChannelDrafts.value[team.id] ?? ''
		).trim();
	}
	discordGuildConfigs.value = {
		...discordGuildConfigs.value,
		[guildId]: {
			...prev,
			guildId,
			testDeliveryMode: discordTestDeliveryMode.value,
			productionDeliveryMode: discordProductionDeliveryMode.value,
			testWebhookUrl: discordTestWebhookDraft.value.trim(),
			testRoleId: discordTestRoleIdDraft.value.trim(),
			productionWebhookUrl: discordProductionWebhookDraft.value.trim(),
			productionRoleId: discordProductionRoleIdDraft.value.trim(),
			testChannelId: discordTestChannelIdDraft.value.trim(),
			productionChannelId: discordProductionChannelIdDraft.value.trim(),
			botCommandRoleIds: [...discordBotCommandRoleIdsDraft.value],
			teamChatWebhookUrls: webhookDrafts,
			teamChatChannelIds: channelDrafts,
		},
	};
}

function selectEditingGuild(guildId: string) {
	if (!guildId || guildId === editingGuildId.value) return;
	flushGuildDrafts(editingGuildId.value);
	ensureGuildConfig(guildId);
	editingGuildId.value = guildId;
	loadGuildDrafts(guildId);
}

function setPrimaryGuild(guildId: string) {
	if (!guildId) return;
	ensureGuildConfig(guildId);
	discordPrimaryGuildId.value = guildId;
}

async function loadBotGuilds(opts?: { silent?: boolean; force?: boolean }) {
	botGuildsLoading.value = true;
	if (!opts?.silent) emit('message', '');
	try {
		const q = opts?.force ? '?refresh=1' : '';
		const data = await api<{
			guilds: Array<{ id: string; name: string }>;
			cached?: boolean;
			fetchedAt?: string;
		}>(`/admin/discord/bot-guilds${q}`);
		hydrateBotGuildsFromCache(data.guilds, data.fetchedAt ?? '');
		// Refresh names on already-saved configs only (don't invent dirty empty rows)
		const next = { ...discordGuildConfigs.value };
		const savedNext = { ...discordGuildConfigsSaved.value };
		let touched = false;
		for (const g of data.guilds) {
			const current = next[g.id];
			if (current && g.name && current.name !== g.name) {
				next[g.id] = { ...current, name: g.name };
				touched = true;
			}
			const saved = savedNext[g.id];
			if (saved && g.name && saved.name !== g.name) {
				savedNext[g.id] = { ...saved, name: g.name };
			}
		}
		if (touched) {
			discordGuildConfigs.value = next;
			discordGuildConfigsSaved.value = savedNext;
		}
		if (!editingGuildId.value && data.guilds[0]) {
			ensureGuildConfig(data.guilds[0].id, data.guilds[0].name);
			editingGuildId.value = data.guilds[0].id;
			sendTargetGuildId.value = data.guilds[0].id;
			loadGuildDrafts(data.guilds[0].id);
		}
		if (!opts?.silent) {
			const via = data.cached ? 'cache' : 'Discord';
			emit('message', `Found ${data.guilds.length} server(s) (via ${via}).`);
		}
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to list bot servers',
			true,
		);
	} finally {
		botGuildsLoading.value = false;
	}
}

function ensureGuildConfig(guildId: string, name = '') {
	if (!guildId || discordGuildConfigs.value[guildId]) return;
	const fromBot = botGuilds.value.find((g) => g.id === guildId);
	discordGuildConfigs.value = {
		...discordGuildConfigs.value,
		[guildId]: emptyGuildConfig(guildId, name || fromBot?.name || ''),
	};
}

function configuredGuildOptions() {
	const ids = new Set([
		...Object.keys(discordGuildConfigs.value),
		...botGuilds.value.map((g) => g.id),
	]);
	return [...ids]
		.map((id) => {
			const fromBot = botGuilds.value.find((g) => g.id === id);
			const fromCfg = discordGuildConfigs.value[id];
			const name =
				(fromBot?.name || fromCfg?.name || '').trim() || 'Unknown server';
			const isPrimary = id === discordPrimaryGuildId.value;
			return {
				id,
				name,
				label: `${name} (${id})${isPrimary ? ' · primary' : ''}`,
				isPrimary,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

const guildSelectOptions = computed(() =>
	configuredGuildOptions().map((g) => ({
		id: g.id,
		label: g.label,
		keywords: `${g.name} ${g.id}`,
	})),
);

function armClearBotToken() {
	if (!discordBotTokenConfigured.value || saving.value) return;
	const ok = confirm(
		'Clear the stored Discord bot token on the next Save?\n\nSlash commands, bot delivery, and role loading will stop until you paste a new token.',
	);
	if (!ok) return;
	clearDiscordBotToken.value = true;
	discordBotTokenDraft.value = '';
	emit(
		'message',
		'Bot token clear armed — click Save to apply, or Discard to cancel.',
	);
}

function cancelClearBotToken() {
	clearDiscordBotToken.value = false;
}

async function loadSettings() {
	const { settings } = await api<{ settings: AdminSiteSettings }>(
		'/admin/settings',
	);
	applySettings(settings);
	loaded.value = true;
}

onMounted(async () => {
	try {
		await Promise.all([loadConfig(), loadSettings()]);
		if (discordBotTokenConfigured.value) {
			// Use server memory/DB cache; Refresh button forces Discord.
			await loadBotGuilds({ silent: true, force: false });
		}
		void loadDiscordHealth();
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : msg('settingsLoadFailed'),
			true,
		);
	}
});

async function patchSettings(body: Record<string, unknown>, busyKey = 'save') {
	autoSaving.value = busyKey;
	try {
		const { settings } = await api<{ settings: AdminSiteSettings }>(
			'/admin/settings',
			{
				method: 'PATCH',
				body: JSON.stringify(body),
			},
		);
		applySettings(settings);
		await loadConfig(true);
		return settings;
	} finally {
		autoSaving.value = '';
	}
}

async function saveAllWebhookSettings() {
	if (!dirty.value || saving.value) return;
	if (clearDiscordBotToken.value) {
		const ok = confirm(
			'Save settings and permanently clear the Discord bot token from the database?',
		);
		if (!ok) return;
	}
	saving.value = true;
	emit('message', '');
	try {
		flushGuildDrafts(editingGuildId.value);
		const body: Record<string, unknown> = {
			discordPrimaryGuildId: discordPrimaryGuildId.value.trim(),
			discordSendTargetGuildId: sendTargetGuildId.value.trim(),
			discordGuildConfigs: discordGuildConfigs.value,
			teamChatAddTemplates: teamChatAddDrafts.value
				.map((s) => s.trim())
				.filter(Boolean),
			teamChatSabotageTemplates: teamChatSabotageDrafts.value
				.map((s) => s.trim())
				.filter(Boolean),
		};
		if (clearDiscordBotToken.value) {
			body.clearDiscordBotToken = true;
		} else if (discordBotTokenDraft.value.trim()) {
			body.discordBotToken = discordBotTokenDraft.value.trim();
		}
		await patchSettings(body, 'save');
		emit('message', 'Settings saved.');
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to save settings',
			true,
		);
		discardDrafts();
	} finally {
		saving.value = false;
	}
}

function discardDrafts() {
	discordGuildConfigs.value = JSON.parse(
		JSON.stringify(discordGuildConfigsSaved.value),
	);
	discordPrimaryGuildId.value = discordPrimaryGuildIdSaved.value;
	sendTargetGuildId.value = sendTargetGuildIdSaved.value;
	if (editingGuildId.value && discordGuildConfigs.value[editingGuildId.value]) {
		loadGuildDrafts(editingGuildId.value);
	} else if (discordPrimaryGuildId.value) {
		editingGuildId.value = discordPrimaryGuildId.value;
		loadGuildDrafts(discordPrimaryGuildId.value);
	}
	discordBotTokenDraft.value = '';
	clearDiscordBotToken.value = false;
	teamChatAddDrafts.value = [...teamChatAddTemplates.value];
	teamChatSabotageDrafts.value = [...teamChatSabotageTemplates.value];
}

function toggleCommandRole(roleId: string) {
	const set = new Set(discordBotCommandRoleIdsDraft.value);
	if (set.has(roleId)) set.delete(roleId);
	else set.add(roleId);
	discordBotCommandRoleIdsDraft.value = [...set];
}

function addCommandRoleFromInput(raw: string) {
	const id = raw.trim().replace(/^<@&|>$/g, '');
	if (!/^\d{5,30}$/.test(id)) return;
	if (!discordBotCommandRoleIdsDraft.value.includes(id)) {
		discordBotCommandRoleIdsDraft.value = [
			...discordBotCommandRoleIdsDraft.value,
			id,
		];
	}
}

const commandRoleInput = ref('');

async function loadGuildRoles() {
	const guildId = editingGuildId.value.trim();
	if (!discordBotTokenConfigured.value) {
		emit(
			'message',
			'Save a bot token first, then click Load guild roles.',
			true,
		);
		return;
	}
	if (!guildId) {
		emit('message', 'Select a server first, then load roles.', true);
		return;
	}
	guildRolesLoading.value = true;
	emit('message', '');
	try {
		const q = new URLSearchParams({ guildId });
		const data = await api<{
			guildId: string;
			roles: Array<{ id: string; name: string }>;
		}>(`/admin/discord/guild-roles?${q}`);
		guildRoles.value = data.roles;
		emit(
			'message',
			`Loaded ${data.roles.length} roles from guild ${data.guildId}.`,
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to load guild roles',
			true,
		);
	} finally {
		guildRolesLoading.value = false;
	}
}

async function copyBotInvite() {
	emit('message', '');
	try {
		const data = await api<{ url: string }>('/admin/discord/bot-invite');
		await navigator.clipboard.writeText(data.url);
		emit(
			'message',
			'Invite link copied. Open it while logged into Discord and re-invite the bot (needs applications.commands for slash commands).',
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to build invite link',
			true,
		);
	}
}

async function verifyRoleId(roleId: string, guildIdOverride?: string) {
	if (!roleId.trim()) return;
	const guildId =
		(guildIdOverride ?? '').trim() ||
		sendTargetGuildId.value.trim() ||
		editingGuildId.value.trim();
	autoSaving.value = 'verify-role';
	emit('message', '');
	try {
		const data = await api<{
			ok: boolean;
			roleName: string;
			roleId: string;
			guildId?: string;
		}>('/admin/discord/verify-role', {
			method: 'POST',
			body: JSON.stringify({
				roleId: roleId.trim(),
				guildId: guildId || undefined,
			}),
		});
		emit(
			'message',
			`Role OK: ${data.roleName} (${data.roleId}) on ${guildLabel(data.guildId ?? guildId)}`,
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Role verification failed',
			true,
		);
	} finally {
		autoSaving.value = '';
	}
}

async function verifySendChannelRole(channel: 'test' | 'production') {
	// Always use the role ID sitting in the form for the server you're Editing.
	const guildId = editingGuildId.value.trim();
	if (!guildId) {
		emit('message', 'Select a server under Editing first.', true);
		return;
	}
	const roleId =
		channel === 'test'
			? discordTestRoleIdDraft.value.trim()
			: discordProductionRoleIdDraft.value.trim();
	if (!roleId) {
		emit('message', `Paste a ${channel} role ID in the field above first.`, true);
		return;
	}
	const mode =
		channel === 'test'
			? discordTestDeliveryMode.value
			: discordProductionDeliveryMode.value;
	const webhookUrl =
		channel === 'test'
			? discordTestWebhookDraft.value.trim()
			: discordProductionWebhookDraft.value.trim();
	const channelId =
		channel === 'test'
			? discordTestChannelIdDraft.value.trim()
			: discordProductionChannelIdDraft.value.trim();

	autoSaving.value = 'verify-role';
	emit('message', '');
	try {
		const data = await api<{
			ok: boolean;
			roleName: string;
			roleId: string;
			guildId?: string;
		}>('/admin/discord/verify-role', {
			method: 'POST',
			body: JSON.stringify({
				roleId,
				webhookUrl: mode === 'webhook' ? webhookUrl || undefined : undefined,
				channelId: mode === 'bot' ? channelId || undefined : undefined,
				guildId,
			}),
		});
		emit(
			'message',
			`Role OK: ${data.roleName} (${data.roleId}) on ${guildLabel(data.guildId ?? guildId)} — this is the ${channel} field value.`,
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Role verification failed',
			true,
		);
	} finally {
		autoSaving.value = '';
	}
}

/** Manual sends use the Editing server + the role IDs in the form fields. */
async function ensureManualSendReady(_withPing: boolean): Promise<boolean> {
	const guildId = editingGuildId.value.trim();
	if (!guildId) {
		emit('message', 'Select a server under Editing first.', true);
		return false;
	}
	if (dirty.value) {
		const ok = confirm(
			`You have unsaved Discord settings for ${guildLabel(guildId)}.\n\nSave now so channel/webhook settings match the form? (The role ID in the form is still sent as-is.)`,
		);
		if (ok) {
			await saveAllWebhookSettings();
			if (dirty.value) return false;
		}
	}
	// Keep Send-tests-to aligned with what we're actually sending
	if (sendTargetGuildId.value !== guildId) {
		sendTargetGuildId.value = guildId;
	}
	return true;
}

function selectSendTargetGuild(guildId: string) {
	if (!guildId) return;
	ensureGuildConfig(guildId);
	sendTargetGuildId.value = guildId;
	void persistSendTargetGuild(guildId);
}

async function persistSendTargetGuild(guildId: string) {
	if (!guildId || guildId === sendTargetGuildIdSaved.value) return;
	try {
		await patchSettings({ discordSendTargetGuildId: guildId }, 'send-target');
		sendTargetGuildIdSaved.value = guildId;
		emit('message', `Send tests to saved: ${guildId}`);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to save send-tests guild',
			true,
		);
	}
}

function applyManualGuildId(raw: string, target: 'configure' | 'tests') {
	const id = raw.trim().replace(/\D/g, '');
	if (!/^\d{5,30}$/.test(id)) {
		emit('message', 'Guild ID must be a numeric snowflake.', true);
		return;
	}
	ensureGuildConfig(id);
	if (target === 'configure') {
		selectEditingGuild(id);
	} else {
		selectSendTargetGuild(id);
	}
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
		const list =
			previewKind.value === 'add' ? teamChatAddDrafts : teamChatSabotageDrafts;
		if (!list.value.length) addTemplate(previewKind.value);
		const index = Math.max(0, list.value.length - 1);
		list.value[index] = `${list.value[index] ?? ''}${example}`;
		focusedTemplate.value = { kind: previewKind.value, index };
		return;
	}
	const list =
		focus.kind === 'add' ? teamChatAddDrafts : teamChatSabotageDrafts;
	const current = list.value[focus.index] ?? '';
	list.value[focus.index] = `${current}${example}`;
}

function fillPreview(template: string): string {
	return template.replace(
		/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
		(_m, key: string) => {
			return SAMPLE_VARS[key] ?? '';
		},
	);
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
		previewKind.value === 'add'
			? teamChatAddDrafts.value
			: teamChatSabotageDrafts.value;
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
		emit(
			'message',
			downtimeMode.value ? msg('downtimeOn') : msg('downtimeOff'),
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : msg('downtimeSettingFailed'),
			true,
		);
		downtimeMode.value = config.value?.site?.downtimeMode ?? false;
	}
}

async function onCloseSeason() {
	const ok = confirm(
		closeSeasonDowntime.value
			? 'Close this season and enable downtime for non-admins? This creates /archive from the latest publish.'
			: 'Close this season? This creates a public /archive page from the latest publish. Downtime stays as-is.',
	);
	if (!ok) return;
	closingSeason.value = true;
	try {
		const data = await api<{
			archive: { slug: string; title: string }
			downtimeMode: boolean
		}>('/admin/season/close', {
			method: 'POST',
			body: JSON.stringify({ enableDowntime: closeSeasonDowntime.value }),
		});
		seasonArchiveSlug.value = data.archive.slug;
		downtimeMode.value = data.downtimeMode;
		await loadConfig(true);
		emit(
			'message',
			`Season archived at /archive/${data.archive.slug}`,
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to close season',
			true,
		);
	} finally {
		closingSeason.value = false;
	}
}

async function loadDiscordHealth() {
	discordHealthLoading.value = true;
	try {
		const data = await api<{
			health: NonNullable<typeof discordHealth.value>
		}>('/admin/discord/health');
		discordHealth.value = data.health;
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to load Discord health',
			true,
		);
	} finally {
		discordHealthLoading.value = false;
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
		emit(
			'message',
			e instanceof Error ? e.message : msg('rosterSettingFailed'),
			true,
		);
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
			e instanceof Error
				? e.message
				: 'Failed to save scheduled publish settings',
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

async function sendDiscord(channel: 'test' | 'production', withPing: boolean) {
	if (!(await ensureManualSendReady(withPing))) return;
	const roleId =
		channel === 'test'
			? discordTestRoleIdDraft.value.trim()
			: discordProductionRoleIdDraft.value.trim();
	if (withPing && !roleId) {
		emit(
			'message',
			`Paste a ${channel} role ID in the field above before sending with ping.`,
			true,
		);
		return;
	}
	const busyKey = `discord-${channel}-${withPing ? 'ping' : 'nopping'}`;
	autoSaving.value = busyKey;
	emit('message', '');
	try {
		const result = await api<{
			ok: boolean;
			roleId?: string;
			channel?: string;
			withPing?: boolean;
			guildId?: string | null;
		}>('/admin/discord/send', {
			method: 'POST',
			body: JSON.stringify({
				channel,
				withPing,
				guildId: editingGuildId.value.trim() || undefined,
				roleId: withPing ? roleId : undefined,
			}),
		});
		const label = channel === 'test' ? 'Test' : 'Production';
		const pingNote = withPing
			? result.roleId
				? ` with role ping (${result.roleId})`
				: ' with role ping'
			: ' without ping';
		emit(
			'message',
			`${label} Discord message sent${pingNote} → ${guildLabel(result.guildId ?? editingGuildId.value)}.`,
		);
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
	return (
		autoSaving.value === `discord-${channel}-${withPing ? 'ping' : 'nopping'}`
	);
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

async function sendDiscordStandings(
	includeMonthlyWrap: boolean,
	withPing = false,
) {
	if (!(await ensureManualSendReady(withPing))) return;
	const roleId = discordTestRoleIdDraft.value.trim();
	if (withPing && !roleId) {
		emit(
			'message',
			'Paste a test role ID in the field above before sending with ping.',
			true,
		);
		return;
	}
	const busyKey = includeMonthlyWrap
		? withPing
			? 'discord-standings-wrap-ping'
			: 'discord-standings-wrap'
		: withPing
			? 'discord-standings-ping'
			: 'discord-standings';
	autoSaving.value = busyKey;
	emit('message', '');
	try {
		await api('/admin/discord/send-standings', {
			method: 'POST',
			body: JSON.stringify({
				channel: 'test',
				includeMonthlyWrap,
				withPing,
				guildId: editingGuildId.value.trim() || undefined,
				roleId: withPing ? roleId : undefined,
			}),
		});
		const wrapNote = includeMonthlyWrap ? ' + 4-week wrap' : '';
		const pingNote = withPing ? ` with ping (${roleId})` : '';
		emit(
			'message',
			`Live standings${wrapNote} sent to test${pingNote} → ${guildLabel(editingGuildId.value)}.`,
		);
	} catch (e) {
		emit(
			'message',
			e instanceof Error ? e.message : 'Failed to send standings preview',
			true,
		);
	} finally {
		autoSaving.value = '';
	}
}

async function sendMonthlyWrap(channel: 'test' | 'production') {
	if (!(await ensureManualSendReady(false))) return;
	autoSaving.value = `discord-wrap-${channel}`;
	emit('message', '');
	try {
		const result = await api<{ label?: string }>('/admin/discord/send-monthly-wrap', {
			method: 'POST',
			body: JSON.stringify({
				channel,
				withPing: false,
				guildId: editingGuildId.value.trim() || undefined,
			}),
		});
		emit(
			'message',
			`${channel === 'test' ? 'Test' : 'Production'}: 4-week wrap sent (${result.label ?? 'ok'}) → ${guildLabel(editingGuildId.value)}.`,
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

async function sendMonthlyWrapOnly(channel: 'test' | 'production') {
	await sendMonthlyWrap(channel);
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

				<article class="card settings-card danger-zone-card">
					<h3>Close season</h3>
					<p class="section-desc">
						One-click archive: freezes a public
						<code>/archive</code> page from the latest published standings.
						Does nothing until you press the button.
					</p>
					<label class="setting-toggle">
						<input v-model="closeSeasonDowntime" type="checkbox" />
						<span>Also enable downtime mode for non-admins</span>
					</label>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						:disabled="closingSeason"
						@click="onCloseSeason"
					>
						{{ closingSeason ? 'Closing…' : 'Close / archive season' }}
					</button>
					<p v-if="seasonArchiveSlug" class="auto-hint">
						Current archive:
						<a :href="`/archive/${seasonArchiveSlug}`">/archive/{{ seasonArchiveSlug }}</a>
					</p>
				</article>

				<article class="card settings-card">
					<h3>Discord health</h3>
					<p class="section-desc">Quick readiness check for publish &amp; bot.</p>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						:disabled="discordHealthLoading"
						@click="loadDiscordHealth"
					>
						{{ discordHealthLoading ? 'Checking…' : 'Refresh health' }}
					</button>
					<ul v-if="discordHealth" class="discord-health-list">
						<li>
							Bot token:
							<strong>{{ discordHealth.botTokenConfigured ? 'yes' : 'no' }}</strong>
						</li>
						<li>
							Gateway:
							<strong>{{
								discordHealth.gatewayReady
									? `ready (${discordHealth.gatewayUser ?? 'bot'})`
									: 'not ready'
							}}</strong>
						</li>
						<li>
							Production destination:
							<strong>{{
								discordHealth.productionConfigured ? 'configured' : 'missing'
							}}</strong>
						</li>
						<li>
							Production role:
							<strong>{{ discordHealth.productionRoleId ? 'set' : 'missing' }}</strong>
						</li>
						<li>
							Last publish:
							<strong>{{
								discordHealth.lastPublishedWeekLabel ||
								discordHealth.lastPublishedAt ||
								'none'
							}}</strong>
						</li>
						<li>
							Last wrap:
							<strong>{{ discordHealth.lastMonthlyWrapAt || 'none' }}</strong>
						</li>
					</ul>
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
						<h3>Discord settings</h3>
						<p class="section-desc">
							Work top to bottom: connect the bot, pick servers, then configure
							test / production channels for the server you’re editing.
						</p>
					</div>
				</div>

				<ul class="discord-flow-status" aria-label="Discord setup status">
					<li
						v-for="row in discordFlowStatus"
						:key="row.label"
						:class="['flow-status-item', row.tone]"
					>
						<span class="flow-status-label">{{ row.label }}</span>
						<span class="flow-status-value">{{ row.value }}</span>
					</li>
				</ul>

				<label class="setting-toggle">
					<input
						v-model="monthlyWrapOnPublish"
						type="checkbox"
						:disabled="autoSaving === 'wrap'"
						@change="saveMonthlyWrapToggle"
					/>
					<span>Enable 4-week wrap with weekly publish</span>
				</label>
				<p class="auto-hint">
					Unlocks the wrap toggle next to <strong>Publish this week</strong>.
					Scheduled Monday publish still auto-attaches the wrap on the first
					Monday of the month (once per month). Manual publish can attach it any
					day, with a confirmation if it’s not that first Monday or it was
					already sent.
				</p>

				<!-- 1. Bot token (shared) -->
				<section class="discord-panel">
					<header class="discord-panel-head">
						<div>
							<p class="discord-step">Step 1</p>
							<h4>Bot token</h4>
							<p class="hint">
								One shared token for all servers. Stored encrypted. Needed for
								bot delivery, listing servers, and slash commands on the
								<strong>primary</strong> server.
							</p>
						</div>
						<span class="token-badge" :class="botTokenStatus.tone">
							{{ botTokenStatus.text }}
						</span>
					</header>

					<div class="bot-token-row">
						<label class="bot-token-field">
							{{
								discordBotTokenConfigured && !clearDiscordBotToken
									? 'Replace token (optional)'
									: 'Paste Discord bot token'
							}}
							<input
								v-model="discordBotTokenDraft"
								type="password"
								:placeholder="
									clearDiscordBotToken
										? 'Will clear on Save'
										: discordBotTokenConfigured
											? '•••• leave blank to keep current token'
											: 'Paste token from Discord Developer Portal'
								"
								autocomplete="new-password"
								spellcheck="false"
								:disabled="saving || clearDiscordBotToken"
							/>
						</label>
						<div class="discord-actions-row bot-token-actions">
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								:disabled="saving || !discordBotTokenConfigured"
								@click="copyBotInvite"
							>
								Copy bot invite link
							</button>
						</div>
					</div>
					<p class="hint">
						Invite with <code>bot</code> + <code>applications.commands</code>.
						Needs Send Messages, Attach Files, and Mention Everyone for role
						pings. Token changes apply when you click
						<strong>Save Discord settings</strong>
						at the bottom.
					</p>

					<details class="discord-danger-zone">
						<summary>Danger: clear stored token</summary>
						<div v-if="discordBotTokenConfigured" class="danger-token-row">
							<p class="hint danger-hint">
								Removes the encrypted token from the database. Bot delivery and
								slash commands stop until you paste a new one and Save.
							</p>
							<button
								v-if="!clearDiscordBotToken"
								type="button"
								class="btn btn-ghost btn-sm danger-btn"
								:disabled="saving"
								@click="armClearBotToken"
							>
								Clear stored bot token…
							</button>
							<div v-else class="danger-armed">
								<span>Clear armed — will remove token on Save</span>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									:disabled="saving"
									@click="cancelClearBotToken"
								>
									Cancel clear
								</button>
							</div>
						</div>
						<p v-else class="hint">No token stored.</p>
					</details>
				</section>

				<!-- 2. Servers -->
				<section
					class="discord-panel"
					:class="{ dimmed: !discordBotTokenConfigured }"
				>
					<header class="discord-panel-head">
						<div>
							<p class="discord-step">Step 2</p>
							<h4>Servers</h4>
							<p class="hint">
								<strong>Primary</strong> = weekly publish + realm chat.
								<strong>Editing</strong> = channels/roles you change below.
								<strong>Send tests to</strong> = where manual send buttons go
								(saved immediately).
							</p>
						</div>
					</header>

					<p v-if="!discordBotTokenConfigured" class="hint panel-blocked">
						Save a bot token in Step 1 first, then refresh the server list.
					</p>

					<div class="server-picker">
						<label>
							Editing (configure channels &amp; roles)
							<AdminSearchableSelect
								:model-value="editingGuildId"
								:options="guildSelectOptions"
								:disabled="saving || !discordBotTokenConfigured"
								placeholder="Search by name or id…"
								@update:model-value="selectEditingGuild"
							/>
						</label>
						<label>
							Send tests to (manual buttons)
							<AdminSearchableSelect
								:model-value="sendTargetGuildId"
								:options="guildSelectOptions"
								:disabled="saving || !discordBotTokenConfigured"
								placeholder="Search by name or id…"
								@update:model-value="selectSendTargetGuild"
							/>
						</label>
					</div>

					<div class="discord-actions-row">
						<button
							type="button"
							class="btn btn-secondary btn-sm"
							:disabled="
								saving || botGuildsLoading || !discordBotTokenConfigured
							"
							@click="loadBotGuilds({ force: true })"
						>
							{{
								botGuildsLoading ? 'Loading servers…' : 'Refresh server list'
							}}
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							:disabled="
								saving ||
								!editingGuildId ||
								editingGuildId === discordPrimaryGuildId
							"
							@click="setPrimaryGuild(editingGuildId)"
						>
							{{
								editingGuildId && editingGuildId === discordPrimaryGuildId
									? 'Already primary'
									: 'Make editing server primary'
							}}
						</button>
					</div>

					<dl class="server-summary">
						<div>
							<dt>Primary</dt>
							<dd>{{ guildLabel(discordPrimaryGuildId) }}</dd>
						</div>
						<div>
							<dt>Editing</dt>
							<dd>{{ guildLabel(editingGuildId) }}</dd>
						</div>
						<div>
							<dt>Send tests to</dt>
							<dd>{{ guildLabel(sendTargetGuildId) }}</dd>
						</div>
					</dl>

					<details class="discord-advanced">
						<summary>Advanced: paste a guild ID</summary>
						<div class="server-picker" style="margin-top: 0.65rem">
							<label>
								Set as Editing
								<input
									type="text"
									inputmode="numeric"
									placeholder="Guild snowflake"
									autocomplete="off"
									spellcheck="false"
									:disabled="saving"
									@change="
										(e) =>
											applyManualGuildId(
												(e.target as HTMLInputElement).value,
												'configure',
											)
									"
								/>
							</label>
							<label>
								Set as Send tests to
								<input
									type="text"
									inputmode="numeric"
									placeholder="Guild snowflake"
									autocomplete="off"
									spellcheck="false"
									:disabled="saving"
									@change="
										(e) =>
											applyManualGuildId(
												(e.target as HTMLInputElement).value,
												'tests',
											)
									"
								/>
							</label>
						</div>
						<label
							style="
								margin-top: 0.65rem;
								display: flex;
								flex-direction: column;
								gap: 0.35rem;
							"
						>
							Add server by ID (then select in Editing)
							<input
								v-model="addGuildIdDraft"
								type="text"
								placeholder="Paste snowflake then Enter"
								autocomplete="off"
								spellcheck="false"
								inputmode="numeric"
								:disabled="saving"
								@keydown.enter.prevent="addGuildById(addGuildIdDraft)"
							/>
						</label>
					</details>
				</section>

				<!-- 3. Slash roles for primary server -->
				<section
					class="discord-panel"
					:class="{
						dimmed: !discordBotTokenConfigured || !discordPrimaryGuildId,
					}"
				>
					<header class="discord-panel-head">
						<div>
							<p class="discord-step">Step 3</p>
							<h4>Slash command roles (primary only)</h4>
							<p class="hint">
								<code>/readathon</code> is admin-only and registered only on
								<strong>{{ guildLabel(discordPrimaryGuildId) }}</strong
								>. Configure these roles while that server is selected under
								<strong>Editing</strong>, then Save.
							</p>
						</div>
					</header>

					<p
						v-if="
							discordPrimaryGuildId &&
							editingGuildId &&
							editingGuildId !== discordPrimaryGuildId
						"
						class="hint panel-blocked"
					>
						You’re editing a non-primary server. Switch
						<strong>Editing</strong> to the primary server to change
						slash-command roles.
					</p>

					<div class="discord-actions-row">
						<button
							type="button"
							class="btn btn-secondary btn-sm"
							:disabled="
								saving ||
								guildRolesLoading ||
								!discordBotTokenConfigured ||
								!discordPrimaryGuildId.trim() ||
								editingGuildId !== discordPrimaryGuildId
							"
							@click="loadGuildRoles"
						>
							{{
								guildRolesLoading
									? 'Loading roles…'
									: 'Load roles for primary server'
							}}
						</button>
					</div>

					<div v-if="guildRoles.length" class="role-picker">
						<p class="section-desc">Select roles that may run commands:</p>
						<div class="role-chip-list">
							<label
								v-for="role in guildRoles"
								:key="role.id"
								class="role-chip"
								:title="role.id"
							>
								<input
									type="checkbox"
									:checked="discordBotCommandRoleIdsDraft.includes(role.id)"
									:disabled="saving"
									@change="toggleCommandRole(role.id)"
								/>
								<span>{{ role.name }}</span>
							</label>
						</div>
					</div>
					<label>
						Or paste a command role ID
						<div class="role-add-row">
							<input
								v-model="commandRoleInput"
								type="text"
								placeholder="123456789012345678"
								autocomplete="off"
								spellcheck="false"
								inputmode="numeric"
								:disabled="saving"
							/>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								:disabled="saving || !commandRoleInput.trim()"
								@click="
									addCommandRoleFromInput(commandRoleInput);
									commandRoleInput = '';
								"
							>
								Add
							</button>
						</div>
					</label>
					<div
						v-if="discordBotCommandRoleIdsDraft.length"
						class="allowed-roles"
					>
						<span class="hint" style="margin: 0">Allowed:</span>
						<span
							v-for="id in discordBotCommandRoleIdsDraft"
							:key="id"
							class="role-pill"
						>
							<code>{{ id }}</code>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								:disabled="saving"
								@click="toggleCommandRole(id)"
							>
								×
							</button>
						</span>
					</div>
				</section>

				<!-- 4. Per-server channels -->
				<section class="discord-panel">
					<header class="discord-panel-head">
						<div>
							<p class="discord-step">Step 4</p>
							<h4>Channels for {{ guildLabel(editingGuildId) }}</h4>
							<p class="hint">
								Webhook or bot per channel for the server under
								<strong>Editing</strong>. Manual send / verify buttons always
								use
								<strong>Send tests to</strong>
								({{ guildLabel(sendTargetGuildId) }}) — set Editing to that same
								server, configure roles, then Save before sending with ping.
							</p>
						</div>
					</header>

					<div class="webhook-columns">
						<div class="webhook-block">
							<h4>Test channel</h4>
							<div class="delivery-mode-row">
								<label class="setting-toggle">
									<input
										v-model="discordTestDeliveryMode"
										type="radio"
										value="webhook"
										:disabled="saving"
									/>
									<span>Webhook</span>
								</label>
								<label class="setting-toggle">
									<input
										v-model="discordTestDeliveryMode"
										type="radio"
										value="bot"
										:disabled="saving"
									/>
									<span>Bot</span>
								</label>
							</div>
							<template v-if="discordTestDeliveryMode === 'bot'">
								<label>
									Test channel ID
									<input
										v-model="discordTestChannelIdDraft"
										type="text"
										placeholder="Channel snowflake"
										autocomplete="off"
										spellcheck="false"
										inputmode="numeric"
										:disabled="saving"
									/>
								</label>
							</template>
							<template v-else>
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
							</template>
							<label>
								Test role ID (optional ping)
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
									class="btn btn-ghost btn-sm"
									:disabled="
										saving ||
										autoSaving === 'verify-role' ||
										!discordTestRoleIdDraft.trim()
									"
									@click="verifySendChannelRole('test')"
								>
									Verify test role
								</button>
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									:disabled="
										saving || discordBusy('test', false) || !testChannelReady
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
										!testChannelReady ||
										!discordTestRoleIdDraft.trim()
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
										!testChannelReady
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
										!testChannelReady
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
									class="btn btn-secondary btn-sm"
									:disabled="
										saving ||
										autoSaving === 'discord-standings-wrap-ping' ||
										!testChannelReady ||
										!discordTestRoleIdDraft.trim()
									"
									@click="sendDiscordStandings(true, true)"
								>
									{{
										autoSaving === 'discord-standings-wrap-ping'
											? 'Sending…'
											: 'Send standings + wrap with ping'
									}}
								</button>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									:disabled="
										saving ||
										autoSaving === 'discord-wrap-test' ||
										!testChannelReady
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
							<h4>Production channel</h4>
							<div class="delivery-mode-row">
								<label class="setting-toggle">
									<input
										v-model="discordProductionDeliveryMode"
										type="radio"
										value="webhook"
										:disabled="saving"
									/>
									<span>Webhook</span>
								</label>
								<label class="setting-toggle">
									<input
										v-model="discordProductionDeliveryMode"
										type="radio"
										value="bot"
										:disabled="saving"
									/>
									<span>Bot</span>
								</label>
							</div>
							<template v-if="discordProductionDeliveryMode === 'bot'">
								<label>
									Production channel ID
									<input
										v-model="discordProductionChannelIdDraft"
										type="text"
										placeholder="Channel snowflake"
										autocomplete="off"
										spellcheck="false"
										inputmode="numeric"
										:disabled="saving"
									/>
								</label>
							</template>
							<template v-else>
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
							</template>
							<label>
								Production role ID (optional ping)
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
									class="btn btn-ghost btn-sm"
									:disabled="
										saving ||
										autoSaving === 'verify-role' ||
										!discordProductionRoleIdDraft.trim()
									"
									@click="verifySendChannelRole('production')"
								>
									Verify production role
								</button>
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									:disabled="
										saving ||
										discordBusy('production', false) ||
										!productionChannelReady
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
										!productionChannelReady ||
										!discordProductionRoleIdDraft.trim()
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
								Verify / send use the <strong>Production role ID</strong> in the
								field above for
								<strong>{{ guildLabel(editingGuildId) }}</strong> (Editing).
							</p>
							<div class="btn-row discord-send-row" style="margin-top: 0.5rem">
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									:disabled="
										saving ||
										autoSaving === 'discord-wrap-production' ||
										!productionChannelReady
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
								Posts a short note to each realm’s Discord channel when a member
								logs a book. Follows
								<strong>production</strong> delivery ({{
									discordProductionDeliveryMode
								}}).
							</p>
							<label class="setting-toggle">
								<input
									v-model="teamChatHooksEnabled"
									type="checkbox"
									:disabled="autoSaving === 'realm-toggle'"
									@change="saveTeamChatToggle"
								/>
								<span>Enable realm chat</span>
							</label>
							<div
								v-if="config && discordProductionDeliveryMode === 'bot'"
								class="team-chat-urls"
							>
								<label v-for="team in config.teams" :key="team.id">
									{{ team.icon }} {{ team.name }} (channel ID)
									<input
										v-model="teamChatChannelDrafts[team.id]"
										type="text"
										placeholder="Channel snowflake"
										autocomplete="off"
										spellcheck="false"
										inputmode="numeric"
										:disabled="saving"
									/>
								</label>
							</div>
							<div v-else-if="config" class="team-chat-urls">
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
				</section>

				<section class="template-editor">
					<div class="template-editor-head">
						<div>
							<h4>Realm chat messages</h4>
							<p class="section-desc">
								One line is picked at random when someone logs a book. Click a
								variable to insert it into the focused line. Empty categories
								re-seed five defaults on save / load.
							</p>
						</div>
					</div>

					<div
						class="var-toolbar"
						role="toolbar"
						aria-label="Template variables"
					>
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
									<span class="col-count"
										>{{ teamChatAddDrafts.length }} lines</span
									>
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
										focusedTemplate?.kind === 'add' &&
										focusedTemplate.index === i,
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
								<p
									v-if="line.trim()"
									class="row-preview"
									v-html="previewHtml(line)"
								/>
							</div>
							<p v-if="!teamChatAddDrafts.length" class="empty-col">
								No add lines yet.
							</p>
						</div>

						<div class="template-column card">
							<div class="template-column-head">
								<div>
									<strong>Sabotage</strong>
									<span class="col-count"
										>{{ teamChatSabotageDrafts.length }} lines</span
									>
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
										focusedTemplate?.kind === 'sabotage' &&
										focusedTemplate.index === i,
								}"
							>
								<textarea
									v-model="teamChatSabotageDrafts[i]"
									rows="4"
									spellcheck="true"
									:disabled="saving"
									placeholder="⚔️ **{{displayName}}** sabotaged **{{targetTeamName}}**…"
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
								<p
									v-if="line.trim()"
									class="row-preview"
									v-html="previewHtml(line)"
								/>
							</div>
							<p v-if="!teamChatSabotageDrafts.length" class="empty-col">
								No sabotage lines yet.
							</p>
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
						{{ saving ? 'Saving…' : dirty ? 'Save Discord settings' : 'Saved' }}
					</button>
				</div>
			</article>
		</template>

		<Teleport to="body">
			<div v-if="dirty" class="unsaved-sticky" role="status" aria-live="polite">
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
						{{ saving ? 'Saving…' : 'Save Discord settings' }}
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
.discord-health-list {
	list-style: none;
	margin: 0.75rem 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.85rem;
	color: var(--realm-text-muted);
}

.discord-health-list strong {
	color: var(--realm-text);
	font-weight: 600;
}

.danger-zone-card {
	border-color: color-mix(in srgb, var(--realm-accent) 35%, var(--realm-border));
}

.server-picker {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
	margin-bottom: 0.85rem;
	align-items: start;
}

.server-picker label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.82rem;
	color: var(--realm-text-muted);
	min-width: 0;
}

.server-picker .discord-actions-row,
.server-picker > .hint {
	grid-column: 1 / -1;
}

.server-picker code {
	font-size: 0.78rem;
	word-break: break-all;
}

.discord-flow-status {
	list-style: none;
	margin: 0 0 1rem;
	padding: 0;
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
	gap: 0.5rem;
}

.flow-status-item {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	padding: 0.55rem 0.65rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: color-mix(
		in srgb,
		var(--realm-bg) 88%,
		var(--realm-surface, #fff)
	);
	min-width: 0;
}

.flow-status-item.ok {
	border-color: color-mix(in srgb, #2f8f5b 35%, var(--realm-border));
}

.flow-status-item.warn {
	border-color: color-mix(in srgb, #c48a1a 45%, var(--realm-border));
}

.flow-status-item.off {
	opacity: 0.78;
}

.flow-status-label {
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--realm-text-muted);
}

.flow-status-value {
	font-size: 0.84rem;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.discord-panel {
	margin: 1rem 0 1.25rem;
	padding: 0.9rem 1rem 1rem;
	border: 1px solid var(--realm-border);
	border-radius: var(--radius);
	background: color-mix(in srgb, var(--realm-bg) 94%, var(--realm-accent) 6%);
}

.discord-panel.dimmed {
	opacity: 0.72;
}

.discord-panel-head {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 0.75rem;
	margin-bottom: 0.85rem;
}

.discord-panel-head h4 {
	margin: 0.1rem 0 0.35rem;
	font-size: 1.05rem;
}

.discord-step {
	margin: 0;
	font-size: 0.72rem;
	font-weight: 650;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--realm-accent);
}

.token-badge {
	flex-shrink: 0;
	align-self: flex-start;
	padding: 0.3rem 0.55rem;
	border-radius: 999px;
	font-size: 0.75rem;
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
}

.token-badge.ok {
	border-color: color-mix(in srgb, #2f8f5b 40%, var(--realm-border));
	color: #2f8f5b;
}

.token-badge.warn {
	border-color: color-mix(in srgb, #c48a1a 45%, var(--realm-border));
	color: #a36d10;
}

.token-badge.off {
	color: var(--realm-text-muted);
}

.bot-token-row {
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
}

.bot-token-field {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.82rem;
	color: var(--realm-text-muted);
}

.bot-token-actions {
	justify-content: flex-start;
}

.panel-blocked {
	padding: 0.55rem 0.65rem;
	border-radius: var(--radius);
	border: 1px dashed var(--realm-border);
	background: var(--realm-bg);
}

.server-summary {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.55rem;
	margin: 0.85rem 0 0;
}

.server-summary > div {
	padding: 0.5rem 0.6rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	min-width: 0;
}

.server-summary dt {
	margin: 0;
	font-size: 0.7rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--realm-text-muted);
}

.server-summary dd {
	margin: 0.2rem 0 0;
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.discord-advanced {
	margin-top: 0.85rem;
	padding-top: 0.55rem;
	border-top: 1px dashed var(--realm-border);
}

.discord-advanced summary {
	cursor: pointer;
	font-size: 0.8rem;
	color: var(--realm-text-muted);
	user-select: none;
}

@media (max-width: 720px) {
	.server-summary {
		grid-template-columns: 1fr;
	}

	.discord-panel-head {
		flex-direction: column;
	}
}

.discord-danger-zone {
	margin-top: 0.75rem;
	padding: 0.55rem 0.7rem;
	border: 1px dashed color-mix(in srgb, var(--realm-border) 80%, #c44);
	border-radius: var(--radius);
	background: color-mix(in srgb, var(--realm-bg) 92%, #c44 8%);
}

.discord-danger-zone summary {
	cursor: pointer;
	font-size: 0.8rem;
	color: var(--realm-text-muted);
	user-select: none;
}

.discord-danger-zone[open] summary {
	margin-bottom: 0.65rem;
}

.discord-danger-zone label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.82rem;
	color: var(--realm-text-muted);
	margin-bottom: 0.75rem;
}

.discord-danger-zone input {
	padding: 0.55rem 0.65rem;
	border-radius: var(--radius);
	border: 1px solid var(--realm-border);
	background: var(--realm-bg);
	color: var(--realm-text);
}

.danger-token-row {
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
}

.danger-hint {
	margin: 0;
	color: color-mix(in srgb, var(--realm-text-muted) 70%, #c44);
}

.danger-btn {
	align-self: flex-start;
	color: #c44 !important;
	border-color: color-mix(in srgb, #c44 35%, var(--realm-border)) !important;
}

.danger-armed {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.85rem;
	color: #c44;
}

@media (max-width: 720px) {
	.server-picker {
		grid-template-columns: 1fr;
	}
}

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
	border-color: color-mix(
		in srgb,
		var(--realm-success) 45%,
		var(--realm-border)
	);
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
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 1rem;
}

.webhook-block {
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
	padding: 1rem 1.05rem;
	border: 1px solid var(--realm-border);
	border-radius: var(--radius);
	background: color-mix(in srgb, var(--realm-bg) 70%, transparent);
}

.webhook-block h4 {
	margin: 0;
}

.delivery-mode-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem 1.1rem;
	padding: 0.35rem 0 0.15rem;
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

.role-picker {
	margin-top: 0.75rem;
}

.role-chip-list {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
	gap: 0.45rem;
	max-height: 260px;
	overflow: auto;
	padding: 0.15rem;
}

.role-chip {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 0.45rem;
	padding: 0.45rem 0.55rem;
	border: 1px solid var(--realm-border);
	border-radius: var(--radius);
	background: color-mix(in srgb, var(--realm-bg) 80%, transparent);
	font-size: 0.85rem;
	cursor: pointer;
}

.role-chip:has(input:checked) {
	border-color: color-mix(
		in srgb,
		var(--realm-accent) 55%,
		var(--realm-border)
	);
	background: color-mix(in srgb, var(--realm-accent) 12%, var(--realm-bg));
}

.role-chip input {
	flex-shrink: 0;
	margin: 0;
}

.role-chip span {
	flex: 1;
	min-width: 0;
	color: var(--realm-text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.role-chip .role-id {
	display: none;
}

.bot-cred-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.bot-cred-grid > label:last-child {
	grid-column: 1 / -1;
}

.discord-actions-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	align-items: center;
}

.discord-actions-row .btn {
	flex: 1 1 10rem;
}

.role-add-row {
	display: flex;
	gap: 0.45rem;
	align-items: stretch;
}

.role-add-row input {
	flex: 1;
}

.allowed-roles {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
	align-items: center;
	margin: 0.35rem 0 0;
}

.allowed-roles .role-pill {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.2rem 0.45rem;
	border-radius: 999px;
	border: 1px solid var(--realm-border);
	font-size: 0.78rem;
	background: color-mix(in srgb, var(--realm-bg) 70%, transparent);
}

@media (max-width: 720px) {
	.bot-cred-grid {
		grid-template-columns: 1fr;
	}
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
	border: 1px solid
		color-mix(in srgb, var(--realm-accent) 35%, var(--realm-border));
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
	border-color: color-mix(
		in srgb,
		var(--realm-accent) 45%,
		var(--realm-border)
	);
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
	border-color: color-mix(
		in srgb,
		var(--realm-accent) 55%,
		var(--realm-border)
	);
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
	border-color: color-mix(
		in srgb,
		var(--realm-accent) 45%,
		var(--realm-border)
	);
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

@media (max-width: 1100px) {
	.webhook-columns {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 900px) {
	.settings-grid,
	.field-row,
	.template-columns,
	.bot-cred-grid {
		grid-template-columns: 1fr;
	}
}
</style>
