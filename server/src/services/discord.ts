import {
	getDiscordChannelConfig,
	getSiteSettingsAdminSync,
	type DiscordWebhookChannel,
} from './siteSettings.js';
import { svgToPng, isPngBuffer } from './svgToPng.js';
import { discordWebhookTotal } from './metrics.js';
import { getSvgEventName } from './svgTheme.js';
import {
	getLiveMonthlyDiscordTemplates,
	renderDiscordCaption,
} from './monthlyThemeExtras.js';
import { assertDiscordRolePingAllowed } from './discordRoleVerify.js';
import {
	deliverySendImage,
	deliverySendTeamChat,
	deliverySendText,
	isDiscordChannelConfigured,
	resolveStandingsTransport,
} from '../discord/delivery.js';

/** Fallback when a publish label wasn't provided (legacy ISO key → "Week 30"). */
function weekNumberLabel(weekKey: string): string {
	const match = weekKey.match(/W(\d+)$/i);
	if (!match) return weekKey;
	return `Week ${parseInt(match[1]!, 10)}`;
}

function discordWeekHeading(
	weekKey: string,
	weekLabel?: string | null,
): string {
	const trimmed = weekLabel?.trim();
	return trimmed || weekNumberLabel(weekKey);
}

const SHORT_MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
] as const;

/** Turn `2026-07-06` into `Jul 6`. */
function formatWrapDay(iso: string): string {
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return iso;
	const month = SHORT_MONTHS[Number(m[2]) - 1];
	const day = Number(m[3]);
	if (!month || !Number.isFinite(day)) return iso;
	return `${month} ${day}`;
}

/**
 * Pretty range for Discord copy.
 * Accepts labels like `2026-07-06 → 2026-08-02 (4 weeks)`.
 */
export function formatDiscordWrapRange(label: string): string {
	const trimmed = label.trim();
	const m = trimmed.match(
		/^(\d{4}-\d{2}-\d{2})\s*(?:→|->|-)\s*(\d{4}-\d{2}-\d{2})/,
	);
	if (!m) return trimmed.replace(/\s*→\s*/g, ' - ');
	const from = formatWrapDay(m[1]!);
	const to = formatWrapDay(m[2]!);
	const fromYear = m[1]!.slice(0, 4);
	const toYear = m[2]!.slice(0, 4);
	if (fromYear === toYear) return `${from} - ${to}, ${toYear}`;
	return `${from}, ${fromYear} - ${to}, ${toYear}`;
}

/** Caption for the 4-week wrap image (standalone or after standings). */
export function discordMonthlyWrapContent(opts: {
	channel: DiscordWebhookChannel;
	label: string;
	/** Role mention prefix including trailing space, e.g. `<@&123> `. */
	mention?: string;
}): string {
	const mention = opts.mention ?? '';
	const eventName = getSvgEventName();
	const range = formatDiscordWrapRange(opts.label || 'Last 4 weeks');
	const isTest = opts.channel === 'test';
	if (isTest) {
		return [
			`${mention}**[TEST] ${eventName} - 4-week wrap**`,
			`Looking back at **${range}**`,
		].join('\n');
	}
	return [
		`${mention}**${eventName} - the 4-week wrap is here!**`,
		`Looking back at **${range}**`,
	].join('\n');
}

function assertDiscordPng(png: Buffer, label: string): void {
	if (!isPngBuffer(png)) {
		throw new Error(`[discord] ${label} is not a valid PNG`);
	}
	if (png.length < 5000) {
		throw new Error(
			`[discord] ${label} PNG is too small (${png.length} bytes)`,
		);
	}
}

async function postChannelImage(
	label: string,
	channel: DiscordWebhookChannel,
	png: Buffer,
	filename: string,
	content: string,
	roleId?: string,
	guildId?: string,
): Promise<boolean> {
	assertDiscordPng(png, filename);

	const message = content.trim();
	if (!message) {
		throw new Error(
			`[discord] ${label}: refusing to post ${filename} with empty message content`,
		);
	}

	console.log(`[discord] ${label}: preparing post`, {
		channel,
		guildId: guildId || null,
		filename,
		contentLength: message.length,
		contentPreview: message.slice(0, 120),
		pngBytes: png.length,
		pngHeader: png.subarray(0, 8).toString('hex'),
	});

	const result = await deliverySendImage({
		channel,
		content: message,
		png,
		filename,
		roleId,
		guildId,
	});
	if (!result.ok) {
		console.error(`[discord] ${label}: send failed`, {
			error: result.error,
			filename,
			contentLength: message.length,
			pngBytes: png.length,
		});
		return false;
	}

	console.log(`[discord] ${label}: uploaded OK`, {
		filename,
		bytes: png.length,
	});
	return true;
}

/**
 * Plain text webhook smoke test content (test channel).
 * Production “message” buttons use a standings-style sample announce.
 */
export const DISCORD_TEST_WEBHOOK_CONTENT = 'This is a test message!';

export const DISCORD_SAMPLE_ANNOUNCE_CONTENT =
	'**Testing standings announce** - Testing webhook!';

export type DiscordSendResult = {
	sent: boolean;
	error?: string;
	roleId?: string;
	channel?: DiscordWebhookChannel;
	withPing?: boolean;
};

/**
 * Send a plain text message to the test or production standings destination
 * (webhook or bot channel, depending on delivery mode).
 */
export async function sendDiscordChannelMessage(opts: {
	channel: DiscordWebhookChannel;
	withPing: boolean;
	/** test = short smoke string; announce = sample standings-style line */
	kind?: 'test' | 'announce';
	/** Target Discord server; defaults to primary */
	guildId?: string | null;
	/** When set, use this role for ping/check instead of saved settings */
	roleIdOverride?: string | null;
}): Promise<DiscordSendResult> {
	const channel = opts.channel === 'test' ? 'test' : 'production';
	const withPing = Boolean(opts.withPing);
	const kind = opts.kind ?? (channel === 'test' ? 'test' : 'announce');
	const guildId = opts.guildId?.trim() || undefined;
	const cfg = getDiscordChannelConfig(channel, guildId);
	const webhookUrl = cfg.webhookUrl;
	const channelId = cfg.channelId;
	const roleId =
		(opts.roleIdOverride ?? '').trim() || cfg.roleId;

	const resolved = resolveStandingsTransport(channel, guildId);
	if (!resolved.ok) {
		return {
			sent: false,
			error: resolved.error,
			channel,
			withPing,
		};
	}
	if (withPing && !roleId) {
		return {
			sent: false,
			error: `No ${channel} Discord role ID configured — copy Role ID (Developer Mode → right-click the role), not a user ID.`,
			channel,
			withPing,
		};
	}
	if (withPing && roleId) {
		const check = await assertDiscordRolePingAllowed({
			webhookUrl: webhookUrl || undefined,
			channelId: channelId || undefined,
			roleId,
			guildId,
		});
		if (!check.ok) {
			return {
				sent: false,
				error: `${check.error} (checked role ${roleId})`,
				roleId,
				channel,
				withPing,
			};
		}
	}

	const bodyText =
		kind === 'announce'
			? DISCORD_SAMPLE_ANNOUNCE_CONTENT
			: DISCORD_TEST_WEBHOOK_CONTENT;
	const content = withPing && roleId ? `<@&${roleId}> ${bodyText}` : bodyText;
	const metric = `${channel}_${withPing ? 'ping' : 'nopping'}`;

	try {
		const result = await deliverySendText({
			channel,
			content,
			roleId: withPing && roleId ? roleId : undefined,
			guildId,
		});
		if (!result.ok) {
			console.error('[discord] channel send failed', {
				channel,
				withPing,
				error: result.error,
				roleId: roleId || null,
			});
			discordWebhookTotal.labels(metric, 'fail').inc();
			return {
				sent: false,
				error: result.error,
				roleId: roleId || undefined,
				channel,
				withPing,
			};
		}
		console.log('[discord] channel send OK', {
			channel,
			withPing,
			roleId: roleId || null,
		});
		discordWebhookTotal.labels(metric, 'ok').inc();
		return { sent: true, roleId: roleId || undefined, channel, withPing };
	} catch (e) {
		console.error('[discord] channel send error:', e);
		discordWebhookTotal.labels(metric, 'fail').inc();
		return {
			sent: false,
			error: e instanceof Error ? e.message : 'Failed to send Discord message',
			roleId: roleId || undefined,
			channel,
			withPing,
		};
	}
}

/** @deprecated Prefer sendDiscordChannelMessage({ channel: 'production', withPing: false }) */
export async function sendDiscordWebhookTest(): Promise<DiscordSendResult> {
	return sendDiscordChannelMessage({
		channel: 'production',
		withPing: false,
		kind: 'test',
	});
}

/** @deprecated Prefer sendDiscordChannelMessage({ channel: 'production', withPing: true }) */
export async function sendDiscordRolePingTest(): Promise<DiscordSendResult> {
	return sendDiscordChannelMessage({
		channel: 'production',
		withPing: true,
		kind: 'test',
	});
}

export type DiscordStandingsBundleOpts = {
	weekKey: string;
	standingsSvg: string;
	breakdownSvg?: string;
	vibesSvg?: string;
	weekLabel?: string | null;
	/** Defaults to production (real publishes). */
	channel?: DiscordWebhookChannel;
	/** When false, skip role ping even if configured (test previews). Default true for production. */
	withPing?: boolean;
	/** Optional 4-week wrap image after vibes. */
	monthlyWrapSvg?: string | null;
	monthlyWrapLabel?: string | null;
	/** Target Discord server; defaults to primary */
	guildId?: string | null;
	/** When set, use this role for ping/check instead of saved settings */
	roleIdOverride?: string | null;
};

/**
 * Post standings (+ optional breakdown/vibes/monthly wrap) via webhook or bot.
 */
export async function notifyDiscordStandingsPublished(
	weekKeyOrOpts: string | DiscordStandingsBundleOpts,
	standingsSvg?: string,
	breakdownSvg?: string,
	vibesSvg?: string,
	weekLabel?: string | null,
): Promise<{ sent: boolean; error?: string }> {
	const opts: DiscordStandingsBundleOpts =
		typeof weekKeyOrOpts === 'string'
			? {
					weekKey: weekKeyOrOpts,
					standingsSvg: standingsSvg ?? '',
					breakdownSvg,
					vibesSvg,
					weekLabel,
					channel: 'production',
					withPing: true,
				}
			: weekKeyOrOpts;

	const channel = opts.channel === 'test' ? 'test' : 'production';
	const guildId = opts.guildId?.trim() || undefined;
	const { webhookUrl, roleId: savedRoleId, channelId } = getDiscordChannelConfig(
		channel,
		guildId,
	);
	const roleId = (opts.roleIdOverride ?? '').trim() || savedRoleId;
	if (!isDiscordChannelConfigured(channel, guildId)) {
		const resolved = resolveStandingsTransport(channel, guildId);
		console.log(
			`[discord] publish skipped: ${resolved.ok ? 'unknown' : resolved.error}`,
		);
		return {
			sent: false,
			error: resolved.ok
				? `No ${channel} Discord destination configured.`
				: resolved.error,
		};
	}

	const heading = discordWeekHeading(opts.weekKey, opts.weekLabel);
	const usePing = opts.withPing !== false && Boolean(roleId);
	if (usePing && roleId) {
		const check = await assertDiscordRolePingAllowed({
			webhookUrl: webhookUrl || undefined,
			channelId: channelId || undefined,
			roleId,
			guildId,
		});
		if (!check.ok) {
			return { sent: false, error: `${check.error} (checked role ${roleId})` };
		}
	}
	const mention = usePing && roleId ? `<@&${roleId}> ` : '';
	const standingsFilename = `standings-${opts.weekKey.toLowerCase()}.png`;
	const breakdownFilename = `standings-breakdown-${opts.weekKey.toLowerCase()}.png`;
	const vibesFilename = `standings-vibes-${opts.weekKey.toLowerCase()}.png`;
	const wrapFilename = `standings-wrap-${opts.weekKey.toLowerCase()}.png`;
	const hasBreakdown = Boolean(opts.breakdownSvg?.trim());
	const hasVibes = Boolean(opts.vibesSvg?.trim());
	const hasWrap = Boolean(opts.monthlyWrapSvg?.trim());

	console.log('[discord] publish started', {
		channel,
		weekKey: opts.weekKey,
		weekLabel: heading,
		hasBreakdown,
		hasVibes,
		hasWrap,
		standingsSvgChars: opts.standingsSvg.length,
		breakdownSvgChars: opts.breakdownSvg?.length ?? 0,
		vibesSvgChars: opts.vibesSvg?.length ?? 0,
		wrapSvgChars: opts.monthlyWrapSvg?.length ?? 0,
		roleConfigured: Boolean(roleId),
		withPing: usePing,
	});

	try {
		const themeTpl = getLiveMonthlyDiscordTemplates();
		const eventName = getSvgEventName();
		const captionVarsBase = {
			mention,
			weekLabel: heading,
			eventName,
			wrapLabel: '',
			wrapRange: '',
		};

		console.log('[discord] standings: rasterizing SVG to PNG…');
		const standingsPng = svgToPng(opts.standingsSvg);
		const standingsFallback =
			channel === 'test'
				? `${mention}**[TEST]** ${heading} standings preview`
				: `${mention}**${heading} standings are live!**`;
		const standingsContent = renderDiscordCaption(
			themeTpl?.standings,
			captionVarsBase,
			standingsFallback,
		);
		const standingsSent = await postChannelImage(
			'standings',
			channel,
			standingsPng,
			standingsFilename,
			standingsContent,
			usePing ? roleId || undefined : undefined,
			guildId,
		);
		if (!standingsSent)
			return { sent: false, error: 'Discord rejected standings image' };

		if (hasBreakdown && opts.breakdownSvg) {
			console.log('[discord] breakdown: rasterizing SVG to PNG…');
			const breakdownPng = svgToPng(opts.breakdownSvg);
			const breakdownFallback =
				channel === 'test'
					? `**[TEST]** ${heading} score breakdown`
					: `**${heading} score breakdown**`;
			const breakdownContent = renderDiscordCaption(
				themeTpl?.breakdown,
				{ ...captionVarsBase, mention: '' },
				breakdownFallback,
			);
			const breakdownSent = await postChannelImage(
				'breakdown',
				channel,
				breakdownPng,
				breakdownFilename,
				breakdownContent,
				undefined,
				guildId,
			);
			if (!breakdownSent) {
				console.error(
					'[discord] breakdown failed after standings was sent successfully',
				);
				return { sent: false, error: 'Discord rejected breakdown image' };
			}
		} else {
			console.log('[discord] breakdown: skipped (no breakdown SVG)');
		}

		if (hasVibes && opts.vibesSvg) {
			console.log('[discord] vibes: rasterizing SVG to PNG…');
			const vibesPng = svgToPng(opts.vibesSvg);
			const vibesFallback =
				channel === 'test'
					? `**[TEST]** ${heading} reading vibes`
					: `**${heading} reading vibes**`;
			const vibesContent = renderDiscordCaption(
				themeTpl?.vibes,
				{ ...captionVarsBase, mention: '' },
				vibesFallback,
			);
			const vibesSent = await postChannelImage(
				'vibes',
				channel,
				vibesPng,
				vibesFilename,
				vibesContent,
				undefined,
				guildId,
			);
			if (!vibesSent) {
				console.error('[discord] vibes failed after earlier posts succeeded');
				return { sent: false, error: 'Discord rejected vibes image' };
			}
		} else {
			console.log('[discord] vibes: skipped (no vibes SVG)');
		}

		if (hasWrap && opts.monthlyWrapSvg) {
			console.log('[discord] monthly wrap: rasterizing SVG to PNG…');
			const wrapPng = svgToPng(opts.monthlyWrapSvg);
			const wrapLabel = opts.monthlyWrapLabel?.trim() || 'Last 4 weeks';
			const wrapRange = formatDiscordWrapRange(wrapLabel);
			const wrapFallback = discordMonthlyWrapContent({
				channel,
				label: wrapLabel,
			});
			const wrapContent = renderDiscordCaption(
				themeTpl?.wrap,
				{
					...captionVarsBase,
					mention: '',
					wrapLabel,
					wrapRange,
				},
				wrapFallback,
			);
			const wrapSent = await postChannelImage(
				'monthly_wrap',
				channel,
				wrapPng,
				wrapFilename,
				wrapContent,
				undefined,
				guildId,
			);
			if (!wrapSent) {
				console.error(
					'[discord] monthly wrap failed after earlier posts succeeded',
				);
				return { sent: false, error: 'Discord rejected monthly wrap image' };
			}
		}

		console.log('[discord] publish finished successfully');
		return { sent: true };
	} catch (e) {
		console.error('[discord] publish error before/during post:', e);
		return {
			sent: false,
			error:
				e instanceof Error ? e.message : 'Failed to send Discord standings',
		};
	}
}

/** Send only the 4-week wrap image to a channel. */
export async function sendDiscordMonthlyWrap(opts: {
	channel: DiscordWebhookChannel;
	wrapSvg: string;
	label?: string;
	withPing?: boolean;
	guildId?: string | null;
}): Promise<DiscordSendResult> {
	const channel = opts.channel === 'test' ? 'test' : 'production';
	const guildId = opts.guildId?.trim() || undefined;
	const { webhookUrl, roleId, channelId } = getDiscordChannelConfig(channel, guildId);
	if (!isDiscordChannelConfigured(channel, guildId)) {
		const resolved = resolveStandingsTransport(channel, guildId);
		return {
			sent: false,
			error: resolved.ok
				? `No ${channel} Discord destination configured.`
				: resolved.error,
			channel,
		};
	}
	const usePing = Boolean(opts.withPing && roleId);
	if (usePing && roleId) {
		const check = await assertDiscordRolePingAllowed({
			webhookUrl: webhookUrl || undefined,
			channelId: channelId || undefined,
			roleId,
			guildId,
		});
		if (!check.ok) {
			return { sent: false, error: check.error, channel, roleId };
		}
	}
	const mention = usePing && roleId ? `<@&${roleId}> ` : '';
	const label = opts.label?.trim() || 'Last 4 weeks';
	try {
		const png = svgToPng(opts.wrapSvg);
		const themeTpl = getLiveMonthlyDiscordTemplates();
		const wrapRange = formatDiscordWrapRange(label);
		const fallback = discordMonthlyWrapContent({ channel, label, mention });
		const content = renderDiscordCaption(
			themeTpl?.wrap,
			{
				mention,
				weekLabel: '',
				eventName: getSvgEventName(),
				wrapLabel: label,
				wrapRange,
			},
			fallback,
		);
		const ok = await postChannelImage(
			'monthly_wrap',
			channel,
			png,
			`standings-wrap-${Date.now()}.png`,
			content,
			usePing ? roleId : undefined,
			guildId,
		);
		return {
			sent: ok,
			error: ok ? undefined : 'Discord rejected monthly wrap image',
			channel,
			roleId: roleId || undefined,
		};
	} catch (e) {
		return {
			sent: false,
			error: e instanceof Error ? e.message : 'Failed to send monthly wrap',
			channel,
		};
	}
}

/**
 * Optional per-realm chat via webhook (legacy) or bot channel ID.
 * Fire-and-forget: failures are logged and ignored so a bad destination
 * never breaks submission.
 */
export function notifyTeamChatSubmission(
	teamId: string | null | undefined,
	message: string,
): void {
	if (!teamId) return;
	const settings = getSiteSettingsAdminSync();
	if (!settings.teamChatHooksEnabled) return;

	void deliverySendTeamChat(teamId, message)
		.then((result) => {
			discordWebhookTotal.labels('team_chat', result.ok ? 'ok' : 'fail').inc();
			if (!result.ok) {
				console.error(
					`[discord] team chat failed for team ${teamId}: ${result.error}`,
				);
			}
		})
		.catch((e) => {
			discordWebhookTotal.labels('team_chat', 'fail').inc();
			console.error(
				`[discord] team chat failed for team ${teamId} (ignored):`,
				e,
			);
		});
}
