import { getStaticConfig } from '../config.js'
import type { TeamStanding } from './scoring.js'

export function getStandingsImageTitle(weekLabel: string): string {
  const eventName = getStaticConfig().event.name as string
  return `${eventName} — ${weekLabel}`
}

function memberLabel(count: number): string {
  return count === 1 ? '1 member' : `${count} members`
}

function leaderSubtitle(standings: TeamStanding[]): string {
  if (standings.length < 2) {
    return 'Ranked by avg gain + attack per member (400 team XP starting pool, not counted in avg)'
  }
  const leader = standings[0]!
  const runnerUp = standings[1]!
  const avgGap = Math.round((leader.averagePerMember - runnerUp.averagePerMember) * 10) / 10
  const xpGap = leader.totalTeamXp - runnerUp.totalTeamXp
  return `${escapeXml(leader.teamName)} leads by ${avgGap} avg/person (+${leader.xpGained} gain, +${leader.xpDealt} attack) · ${xpGap} team XP ahead`
}

export function generateStandingsSvg(standings: TeamStanding[], weekLabel: string): string {
  const resolvedTitle = getStandingsImageTitle(weekLabel)
  const width = 800
  const rowHeight = 72
  const headerHeight = 100
  const height = headerHeight + standings.length * rowHeight + 40

  const rows = standings
    .map((team, i) => {
      const y = headerHeight + i * rowHeight + 20
      const rank = i + 1
      const isLeader = rank === 1
      const strokeWidth = isLeader ? 3 : 2
      const rowFill = isLeader ? '#2a2438' : '#242033'
      const rankLabel = isLeader ? `#${rank} ${escapeXml(team.teamName)} ★` : `#${rank} ${escapeXml(team.teamName)}`
      const detailLine =
        team.memberCount > 0
          ? `${memberLabel(team.memberCount)} · ${team.averagePerMember} avg/person · +${team.xpGained} gain · +${team.xpDealt} attack`
          : 'No members assigned yet'

      return `
    <g>
      <rect x="40" y="${y}" width="720" height="60" rx="8" fill="${rowFill}" stroke="${team.color}" stroke-width="${strokeWidth}"/>
      <text x="70" y="${y + 38}" fill="${team.color}" font-size="28" font-family="Georgia, serif">${team.icon}</text>
      <text x="110" y="${y + 28}" fill="#f0ebe3" font-size="18" font-weight="bold" font-family="system-ui, sans-serif">${rankLabel}</text>
      <text x="110" y="${y + 48}" fill="#a89f94" font-size="13" font-family="system-ui, sans-serif">${detailLine}</text>
      <text x="680" y="${y + 38}" fill="${team.color}" font-size="22" font-weight="bold" text-anchor="end" font-family="system-ui, sans-serif">${team.totalTeamXp}</text>
      <text x="680" y="${y + 52}" fill="#a89f94" font-size="11" text-anchor="end" font-family="system-ui, sans-serif">team XP</text>
    </g>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f0e14"/>
  <text x="400" y="45" fill="#c45c3e" font-size="26" font-weight="bold" text-anchor="middle" font-family="Georgia, serif">${escapeXml(resolvedTitle)}</text>
  <text x="400" y="72" fill="#a89f94" font-size="13" text-anchor="middle" font-family="system-ui, sans-serif">${leaderSubtitle(standings)}</text>
  ${rows}
</svg>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
