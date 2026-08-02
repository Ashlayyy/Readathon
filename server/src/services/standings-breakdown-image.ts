import { SVG_FONT_SANS } from '../lib/svgFonts.js';
import type {
	StandingsBreakdown,
	TeamBreakdown,
} from './standings-breakdown.js';
import { getSvgEventName, getSvgTheme, type SvgTheme } from './svgTheme.js';

const width = 960;
const teamHeaderH = 36;
const tableHeaderH = 28;
const rowH = 22;
const attackSectionH = 20;
const teamGap = 24;
const pagePad = 48;
const headerHeight = 108;
const contentPadX = 40;
const contentW = width - contentPadX * 2;

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function teamBlockHeight(team: TeamBreakdown): number {
	let h = teamHeaderH + tableHeaderH;
	h += Math.max(team.members.length, 1) * rowH;
	if (team.attacksFromOthers.length > 0) {
		h += attackSectionH + team.attacksFromOthers.length * rowH;
	}
	return h + 8;
}

export function generateBreakdownSvg(
	breakdown: StandingsBreakdown,
	weekLabel: string,
): string {
	const theme = getSvgTheme();
	const eventName = getSvgEventName();
	const titleLine1 = `${eventName} - Score breakdown`;
	const titleLine2 = weekLabel;
	const height =
		headerHeight +
		breakdown.teams.reduce((sum, team) => sum + teamBlockHeight(team), 0) +
		pagePad +
		(breakdown.teams.length - 1) * teamGap;

	let y = headerHeight;

	const teamBlocks = breakdown.teams
		.map((team) => {
			const block = renderTeamBlock(team, y, theme);
			y += teamBlockHeight(team) + teamGap;
			return block;
		})
		.join('');

	const cx = width / 2;

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${theme.background}"/>
  <rect x="0" y="0" width="${width}" height="4" fill="${theme.accent}"/>
  <text x="${cx}" y="40" fill="${theme.accent}" font-size="22" font-weight="bold" text-anchor="middle" font-family="${SVG_FONT_SANS}">${escapeXml(titleLine1)}</text>
  <text x="${cx}" y="64" fill="${theme.text}" font-size="15" font-weight="600" text-anchor="middle" font-family="${SVG_FONT_SANS}">${escapeXml(titleLine2)}</text>
  <text x="${cx}" y="86" fill="${theme.textMuted}" font-size="12" text-anchor="middle" font-family="${SVG_FONT_SANS}">Gained = add points for your realm - Dealt = sabotage damage sent</text>
  ${teamBlocks}
</svg>`;
}

function renderTeamBlock(
	team: TeamBreakdown,
	startY: number,
	theme: SvgTheme,
): string {
	let y = startY;
	const lines: string[] = [];
	const gainedX = Math.round(contentPadX + contentW * 0.52);
	const dealtX = Math.round(contentPadX + contentW * 0.68);
	const booksX = contentPadX + contentW - 16;

	lines.push(`
  <rect x="${contentPadX}" y="${y}" width="${contentW}" height="${teamBlockHeight(team) - 8}" rx="8" fill="${theme.surface}" stroke="${team.color}" stroke-width="2"/>
  <text x="${contentPadX + 16}" y="${y + 24}" fill="${team.color}" font-size="20" font-family="${SVG_FONT_SANS}">${team.icon}</text>
  <text x="${contentPadX + 46}" y="${y + 24}" fill="${theme.text}" font-size="16" font-weight="bold" font-family="${SVG_FONT_SANS}">${escapeXml(team.teamName)}</text>`);
	y += teamHeaderH;

	lines.push(`
  <text x="${contentPadX + 16}" y="${y + 16}" fill="${theme.textMuted}" font-size="11" font-weight="bold" font-family="${SVG_FONT_SANS}">Member</text>
  <text x="${gainedX}" y="${y + 16}" fill="${theme.textMuted}" font-size="11" font-weight="bold" text-anchor="end" font-family="${SVG_FONT_SANS}">Gained</text>
  <text x="${dealtX}" y="${y + 16}" fill="${theme.textMuted}" font-size="11" font-weight="bold" text-anchor="end" font-family="${SVG_FONT_SANS}">Dealt</text>
  <text x="${booksX}" y="${y + 16}" fill="${theme.textMuted}" font-size="11" font-weight="bold" text-anchor="end" font-family="${SVG_FONT_SANS}">Books</text>`);
	y += tableHeaderH;

	if (team.members.length === 0) {
		lines.push(`
  <text x="${contentPadX + 16}" y="${y + 14}" fill="${theme.textMuted}" font-size="12" font-style="italic" font-family="${SVG_FONT_SANS}">No members assigned yet</text>`);
		y += rowH;
	} else {
		for (const m of team.members) {
			const books = `${m.addCount} add - ${m.sabotageCount} atk`;
			lines.push(`
  <text x="${contentPadX + 16}" y="${y + 14}" fill="${theme.text}" font-size="12" font-family="${SVG_FONT_SANS}">${escapeXml(m.displayName)}</text>
  <text x="${gainedX}" y="${y + 14}" fill="${theme.success}" font-size="12" text-anchor="end" font-family="${SVG_FONT_SANS}">+${m.xpGained}</text>
  <text x="${dealtX}" y="${y + 14}" fill="${theme.accent}" font-size="12" text-anchor="end" font-family="${SVG_FONT_SANS}">${m.xpDealt > 0 ? `-${m.xpDealt}` : '0'}</text>
  <text x="${booksX}" y="${y + 14}" fill="${theme.textMuted}" font-size="11" text-anchor="end" font-family="${SVG_FONT_SANS}">${books}</text>`);
			y += rowH;
		}
	}

	if (team.attacksFromOthers.length > 0) {
		y += 4;
		lines.push(`
  <text x="${contentPadX + 16}" y="${y + 12}" fill="${theme.textMuted}" font-size="11" font-weight="bold" font-family="${SVG_FONT_SANS}">Attacked by rivals</text>`);
		y += attackSectionH;
		for (const atk of team.attacksFromOthers) {
			lines.push(`
  <text x="${contentPadX + 24}" y="${y + 12}" fill="${theme.accent}" font-size="11" font-family="${SVG_FONT_SANS}">${escapeXml(atk.displayName)} (${escapeXml(atk.attackerTeamName)}) -> -${atk.damage} points</text>`);
			y += rowH;
		}
	}

	return lines.join('');
}
