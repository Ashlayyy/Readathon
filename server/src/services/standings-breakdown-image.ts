import { getStaticConfig } from '../config.js'
import type { StandingsBreakdown, TeamBreakdown } from './standings-breakdown.js'

const width = 800
const teamHeaderH = 36
const tableHeaderH = 28
const rowH = 22
const attackSectionH = 20
const teamGap = 24
const pagePad = 40
const headerHeight = 88

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function teamBlockHeight(team: TeamBreakdown): number {
  let h = teamHeaderH + tableHeaderH
  h += Math.max(team.members.length, 1) * rowH
  if (team.attacksFromOthers.length > 0) {
    h += attackSectionH + team.attacksFromOthers.length * rowH
  }
  return h + 8
}

export function generateBreakdownSvg(breakdown: StandingsBreakdown, weekLabel: string): string {
  const eventName = getStaticConfig().event.name as string
  const title = `${eventName} — ${weekLabel} · Score breakdown`
  const height =
    headerHeight +
    breakdown.teams.reduce((sum, team) => sum + teamBlockHeight(team), 0) +
    pagePad +
    (breakdown.teams.length - 1) * teamGap

  let y = headerHeight

  const teamBlocks = breakdown.teams
    .map((team) => {
      const block = renderTeamBlock(team, y)
      y += teamBlockHeight(team) + teamGap
      return block
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f0e14"/>
  <text x="400" y="42" fill="#c45c3e" font-size="24" font-weight="bold" text-anchor="middle" font-family="Georgia, serif">${escapeXml(title)}</text>
  <text x="400" y="68" fill="#a89f94" font-size="12" text-anchor="middle" font-family="system-ui, sans-serif">Gained = add XP for your realm · Dealt = sabotage damage sent</text>
  ${teamBlocks}
</svg>`
}

function renderTeamBlock(team: TeamBreakdown, startY: number): string {
  let y = startY
  const lines: string[] = []

  lines.push(`
  <rect x="32" y="${y}" width="736" height="${teamBlockHeight(team) - 8}" rx="8" fill="#181622" stroke="${team.color}" stroke-width="2"/>
  <text x="48" y="${y + 24}" fill="${team.color}" font-size="20" font-family="Georgia, serif">${team.icon}</text>
  <text x="78" y="${y + 24}" fill="#f0ebe3" font-size="16" font-weight="bold" font-family="system-ui, sans-serif">${escapeXml(team.teamName)}</text>`)
  y += teamHeaderH

  lines.push(`
  <text x="48" y="${y + 16}" fill="#a89f94" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">Member</text>
  <text x="420" y="${y + 16}" fill="#a89f94" font-size="11" font-weight="bold" text-anchor="end" font-family="system-ui, sans-serif">Gained</text>
  <text x="540" y="${y + 16}" fill="#a89f94" font-size="11" font-weight="bold" text-anchor="end" font-family="system-ui, sans-serif">Dealt</text>
  <text x="720" y="${y + 16}" fill="#a89f94" font-size="11" font-weight="bold" text-anchor="end" font-family="system-ui, sans-serif">Books</text>`)
  y += tableHeaderH

  if (team.members.length === 0) {
    lines.push(`
  <text x="48" y="${y + 14}" fill="#6a635a" font-size="12" font-style="italic" font-family="system-ui, sans-serif">No members assigned yet</text>`)
    y += rowH
  } else {
    for (const m of team.members) {
      const books = `${m.addCount} add · ${m.sabotageCount} atk`
      lines.push(`
  <text x="48" y="${y + 14}" fill="#f0ebe3" font-size="12" font-family="system-ui, sans-serif">${escapeXml(m.displayName)}</text>
  <text x="420" y="${y + 14}" fill="#7ec89a" font-size="12" text-anchor="end" font-family="system-ui, sans-serif">+${m.xpGained}</text>
  <text x="540" y="${y + 14}" fill="#d4634a" font-size="12" text-anchor="end" font-family="system-ui, sans-serif">${m.xpDealt > 0 ? `−${m.xpDealt}` : '0'}</text>
  <text x="720" y="${y + 14}" fill="#a89f94" font-size="11" text-anchor="end" font-family="system-ui, sans-serif">${books}</text>`)
      y += rowH
    }
  }

  if (team.attacksFromOthers.length > 0) {
    y += 4
    lines.push(`
  <text x="48" y="${y + 12}" fill="#a89f94" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">Attacked by rivals</text>`)
    y += attackSectionH
    for (const atk of team.attacksFromOthers) {
      lines.push(`
  <text x="56" y="${y + 12}" fill="#d4634a" font-size="11" font-family="system-ui, sans-serif">${escapeXml(atk.displayName)} (${escapeXml(atk.attackerTeamName)}) — −${atk.damage} XP</text>`)
      y += rowH
    }
  }

  return lines.join('')
}
