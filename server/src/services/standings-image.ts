import { getStaticConfig } from '../config.js';
import { SVG_FONT_SANS } from '../lib/svgFonts.js';
import type { TeamStanding } from './scoring.js';
import { getSvgEventName, getSvgTheme } from './svgTheme.js';

export function getStandingsImageTitle(weekLabel: string): string {
	const eventName = getSvgEventName();
	return `${eventName} - ${weekLabel}`;
}

function memberLabel(count: number): string {
	return count === 1 ? '1 member' : `${count} members`;
}

function standingsDetailLine(
	team: TeamStanding,
	index: number,
	standings: TeamStanding[],
): string {
	const activity = `+${team.xpGained} gain - +${team.xpDealt} attack`;
	if (team.memberCount <= 0) return 'No members assigned yet';

	const members = memberLabel(team.memberCount);
	if (standings.length < 2) return `${members} - ${activity}`;

	const leader = standings[0]!;
	if (index === 0) {
		const gap = leader.totalTeamXp - standings[1]!.totalTeamXp;
		return `${members} - ${gap} points ahead - ${activity}`;
	}

	const gap = leader.totalTeamXp - team.totalTeamXp;
	return `${members} - ${gap} points behind leader - ${activity}`;
}

function leaderSubtitle(standings: TeamStanding[]): string {
	const starting =
		(getStaticConfig().scoringRules as { startingTeamXp?: number })
			.startingTeamXp ?? 100;
	if (standings.length < 2) {
		return `Ranked by total team points (${starting} starting pool per realm)`;
	}
	const leader = standings[0]!;
	const runnerUp = standings[1]!;
	const xpGap = leader.totalTeamXp - runnerUp.totalTeamXp;
	return `${escapeXml(leader.teamName)} leads by ${xpGap} team points (+${leader.xpGained} gain, +${leader.xpDealt} attack)`;
}

export function generateStandingsSvg(
	standings: TeamStanding[],
	weekLabel: string,
): string {
	const theme = getSvgTheme();
	const eventName = getSvgEventName();
	const width = 960;
	const rowHeight = 72;
	const headerHeight = 108;
	const height = headerHeight + standings.length * rowHeight + 48;
	const cx = width / 2;

	const rows = standings
		.map((team, i) => {
			const y = headerHeight + i * rowHeight + 16;
			const rank = i + 1;
			const isLeader = rank === 1;
			const strokeWidth = isLeader ? 3 : 2;
			const rowFill = isLeader ? theme.surfaceAlt : theme.surface;
			const rankLabel = isLeader
				? `#${rank} ${escapeXml(team.teamName)} ★`
				: `#${rank} ${escapeXml(team.teamName)}`;
			const detailLine = standingsDetailLine(team, i, standings);

			return `
    <g>
      <rect x="40" y="${y}" width="${width - 80}" height="60" rx="8" fill="${rowFill}" stroke="${team.color}" stroke-width="${strokeWidth}"/>
      <text x="70" y="${y + 38}" fill="${team.color}" font-size="28" font-family="${SVG_FONT_SANS}">${team.icon}</text>
      <text x="110" y="${y + 28}" fill="${theme.text}" font-size="18" font-weight="bold" font-family="${SVG_FONT_SANS}">${rankLabel}</text>
      <text x="110" y="${y + 48}" fill="${theme.textMuted}" font-size="13" font-family="${SVG_FONT_SANS}">${detailLine}</text>
      <text x="${width - 80}" y="${y + 38}" fill="${team.color}" font-size="22" font-weight="bold" text-anchor="end" font-family="${SVG_FONT_SANS}">${team.totalTeamXp}</text>
      <text x="${width - 80}" y="${y + 52}" fill="${theme.textMuted}" font-size="11" text-anchor="end" font-family="${SVG_FONT_SANS}">team points</text>
    </g>`;
		})
		.join('');

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${theme.background}"/>
  <rect x="0" y="0" width="${width}" height="4" fill="${theme.accent}"/>
  <text x="${cx}" y="40" fill="${theme.accent}" font-size="24" font-weight="bold" text-anchor="middle" font-family="${SVG_FONT_SANS}">${escapeXml(eventName)} - Standings</text>
  <text x="${cx}" y="64" fill="${theme.text}" font-size="15" font-weight="600" text-anchor="middle" font-family="${SVG_FONT_SANS}">${escapeXml(weekLabel)}</text>
  <text x="${cx}" y="88" fill="${theme.textMuted}" font-size="13" text-anchor="middle" font-family="${SVG_FONT_SANS}">${leaderSubtitle(standings)}</text>
  ${rows}
</svg>`;
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
