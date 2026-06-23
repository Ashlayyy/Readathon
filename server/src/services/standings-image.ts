import type { TeamStanding } from './scoring.js'

export function generateStandingsSvg(standings: TeamStanding[], title = 'REALMATHON 5.0 — Standings'): string {
  const width = 800
  const rowHeight = 72
  const headerHeight = 100
  const height = headerHeight + standings.length * rowHeight + 40

  const rows = standings
    .map((team, i) => {
      const y = headerHeight + i * rowHeight + 20
      const rank = i + 1
      return `
    <g>
      <rect x="40" y="${y}" width="720" height="60" rx="8" fill="#242033" stroke="${team.color}" stroke-width="2"/>
      <text x="70" y="${y + 38}" fill="${team.color}" font-size="28" font-family="Georgia, serif">${team.icon}</text>
      <text x="110" y="${y + 28}" fill="#f0ebe3" font-size="18" font-weight="bold" font-family="system-ui, sans-serif">#${rank} ${escapeXml(team.teamName)}</text>
      <text x="110" y="${y + 48}" fill="#a89f94" font-size="13" font-family="system-ui, sans-serif">${team.memberCount} members · +${team.xpGained} / -${team.xpLost} XP</text>
      <text x="680" y="${y + 38}" fill="${team.color}" font-size="22" font-weight="bold" text-anchor="end" font-family="system-ui, sans-serif">${team.averagePerMember}</text>
      <text x="680" y="${y + 52}" fill="#a89f94" font-size="11" text-anchor="end" font-family="system-ui, sans-serif">avg/person</text>
    </g>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0f0e14"/>
  <text x="400" y="45" fill="#c45c3e" font-size="26" font-weight="bold" text-anchor="middle" font-family="Georgia, serif">${escapeXml(title)}</text>
  <text x="400" y="72" fill="#a89f94" font-size="13" text-anchor="middle" font-family="system-ui, sans-serif">Ranked by average XP per member</text>
  ${rows}
</svg>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
