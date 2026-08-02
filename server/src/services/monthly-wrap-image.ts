import { SVG_FONT_SANS } from '../lib/svgFonts.js'
import type { AdminAnalytics } from './adminAnalytics.js'
import { getSvgEventName, getSvgTheme, type SvgTheme } from './svgTheme.js'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/**
 * Truncate so the full result (including "...") fits in maxChars.
 * DejaVu Sans is wider than a naive 6px/char guess - keep estimates conservative.
 */
function ellipsize(s: string, maxChars: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  if (maxChars < 4) return t.slice(0, Math.max(0, maxChars))
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars - 3)}...`
}

type ColCursor = {
  x: number
  y: number
  width: number
  parts: string[]
  theme: SvgTheme
}

/** First column is the name (flex); the rest are fixed-width, right-aligned stats. */
type TableCol = {
  label: string
  /** Fixed width for stat columns. Omit / 0 for the flex name column. */
  width?: number
}

function panelRect(x: number, y: number, w: number, h: number, theme: SvgTheme): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${theme.surface}" stroke="${theme.border}"/>`
}

function sectionTitle(col: ColCursor, label: string, first = false): void {
  if (!first) {
    col.y += 8
    col.parts.push(
      `<line x1="${col.x + 14}" y1="${col.y}" x2="${col.x + col.width - 14}" y2="${col.y}" stroke="${col.theme.border}" stroke-width="1"/>`,
    )
    col.y += 18
  }
  col.parts.push(
    `<text x="${col.x + 16}" y="${col.y}" fill="${col.theme.accent}" font-size="11" font-family="${SVG_FONT_SANS}" font-weight="700" letter-spacing="0.1em">${escapeXml(label.toUpperCase())}</text>`,
  )
  col.y += 18
}

function statColumnsWidth(cols: TableCol[]): number {
  return cols.slice(1).reduce((sum, c) => sum + (c.width ?? 56), 0)
}

/** Column labels under a section title - table header without heavy grid lines. */
function tableHeader(col: ColCursor, columns: TableCol[]): void {
  const padX = 16
  const theme = col.theme
  let xRight = col.x + col.width - padX
  for (let i = columns.length - 1; i >= 1; i--) {
    const c = columns[i]!
    const w = c.width ?? 56
    col.parts.push(
      `<text x="${xRight}" y="${col.y}" text-anchor="end" fill="${theme.textMuted}" font-size="9" font-family="${SVG_FONT_SANS}" font-weight="700" letter-spacing="0.06em">${escapeXml(c.label.toUpperCase())}</text>`,
    )
    xRight -= w
  }
  col.parts.push(
    `<text x="${col.x + padX}" y="${col.y}" fill="${theme.textMuted}" font-size="9" font-family="${SVG_FONT_SANS}" font-weight="700" letter-spacing="0.06em">${escapeXml((columns[0]?.label ?? '').toUpperCase())}</text>`,
  )
  col.y += 6
  col.parts.push(
    `<line x1="${col.x + padX}" y1="${col.y}" x2="${col.x + col.width - padX}" y2="${col.y}" stroke="${theme.border}" stroke-width="1" opacity="0.85"/>`,
  )
  col.y += 16
}

function tableRow(
  col: ColCursor,
  cells: string[],
  columns: TableCol[],
  opts?: { muted?: boolean; small?: boolean },
): void {
  const muted = opts?.muted ?? false
  const small = opts?.small ?? false
  const size = small ? 12 : 13
  const charW = small ? 7.8 : 8.2
  const padX = 16
  const theme = col.theme
  const nameColor = muted ? theme.textMuted : theme.textSoft
  const statColor = muted ? theme.textMuted : theme.text

  const statsW = statColumnsWidth(columns)
  const nameMaxW = Math.max(48, col.width - padX * 2 - statsW - 8)
  const maxNameChars = Math.max(8, Math.floor(nameMaxW / charW))
  const name = ellipsize(cells[0] ?? '', maxNameChars)

  col.parts.push(
    `<text x="${col.x + padX}" y="${col.y}" fill="${nameColor}" font-size="${size}" font-family="${SVG_FONT_SANS}">${escapeXml(name)}</text>`,
  )

  let xRight = col.x + col.width - padX
  for (let i = columns.length - 1; i >= 1; i--) {
    const c = columns[i]!
    const w = c.width ?? 56
    const value = cells[i] ?? ''
    col.parts.push(
      `<text x="${xRight}" y="${col.y}" text-anchor="end" fill="${statColor}" font-size="${size}" font-family="${SVG_FONT_SANS}" font-weight="600">${escapeXml(value)}</text>`,
    )
    xRight -= w
  }
  col.y += small ? 18 : 20
}

function emptyRow(col: ColCursor, label: string): void {
  col.parts.push(
    `<text x="${col.x + 16}" y="${col.y}" fill="${col.theme.textMuted}" font-size="12" font-family="${SVG_FONT_SANS}">${escapeXml(label)}</text>`,
  )
  col.y += 20
}

function beginSection(
  col: ColCursor,
  title: string,
  columns: TableCol[],
  first = false,
): void {
  sectionTitle(col, title, first)
  tableHeader(col, columns)
}

function metricCard(
  x: number,
  y: number,
  w: number,
  h: number,
  card: { kicker: string; value: string; color: string; sub: string },
  theme: SvgTheme,
): string {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${theme.surface}" stroke="${theme.border}"/>
  <text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" fill="${theme.textMuted}" font-size="11" font-family="${SVG_FONT_SANS}" letter-spacing="0.08em">${escapeXml(card.kicker.toUpperCase())}</text>
  <text x="${x + w / 2}" y="${y + 54}" text-anchor="middle" fill="${card.color}" font-size="30" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(card.value)}</text>
  <text x="${x + w / 2}" y="${y + 74}" text-anchor="middle" fill="${theme.textMuted}" font-size="11" font-family="${SVG_FONT_SANS}">${escapeXml(card.sub)}</text>`
}

/**
 * Dense 4-week wrap image for Discord. Colors follow the live site theme
 * (including Theme of the Month).
 */
export function generateMonthlyWrapSvg(
  analytics: AdminAnalytics,
  opts?: { title?: string; subtitle?: string },
): string {
  const theme = getSvgTheme()
  const eventName = getSvgEventName()
  const width = 960
  const pad = 28
  const gap = 16
  const colW = (width - pad * 2 - gap) / 2
  const leftX = pad
  const rightX = pad + colW + gap

  const o = analytics.overview
  const title = opts?.title ?? `${eventName} - 4-week wrap`
  const subtitle =
    opts?.subtitle ?? (analytics.range.label || 'Last 4 weeks of chaos')

  let svg = `
  <rect width="100%" height="100%" fill="${theme.background}"/>
  <rect x="0" y="0" width="${width}" height="4" fill="${theme.accent}"/>
  <text x="${width / 2}" y="40" text-anchor="middle" fill="${theme.text}" font-size="24" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(title)}</text>
  <text x="${width / 2}" y="62" text-anchor="middle" fill="${theme.textMuted}" font-size="13" font-family="${SVG_FONT_SANS}">${escapeXml(subtitle)}</text>`

  const cards: { kicker: string; value: string; color: string; sub: string }[] = [
    {
      kicker: 'Books',
      value: String(o.submissions),
      color: theme.text,
      sub: `${fmt(o.totalPages)} pages`,
    },
    {
      kicker: 'Active readers',
      value: String(o.activeReaders),
      color: theme.text,
      sub: `${o.avgBooksPerActiveReader.toFixed(1)} books / reader`,
    },
    {
      kicker: 'Sabotage',
      value: `${o.chaosRatio}%`,
      color: theme.accentGlow,
      sub: `${o.sabotageCount} atk - ${o.addCount} add`,
    },
    {
      kicker: 'Competition',
      value: `${o.competitionRate}%`,
      color: theme.text,
      sub: `${o.competitionClaims} claims`,
    },
    {
      kicker: 'Avg pages',
      value: fmt(o.avgPages),
      color: theme.text,
      sub: `med ${fmt(o.medianPages)} - max ${fmt(o.maxPages)}`,
    },
    {
      kicker: 'Total pages',
      value: fmt(o.totalPages),
      color: theme.accent,
      sub: `min ${fmt(o.minPages)}`,
    },
  ]

  const cardY = 80
  const cardH = 92
  const cardGap = 12
  const cardW = (width - pad * 2 - cardGap * 2) / 3
  for (let i = 0; i < cards.length; i++) {
    const col = i % 3
    const rowI = Math.floor(i / 3)
    const x = pad + col * (cardW + cardGap)
    const y = cardY + rowI * (cardH + cardGap)
    svg += metricCard(x, y, cardW, cardH, cards[i]!, theme)
  }

  const midY = cardY + cardH * 2 + cardGap + 20

  const left: ColCursor = {
    x: leftX,
    y: midY + 28,
    width: colW,
    parts: [],
    theme,
  }
  const right: ColCursor = {
    x: rightX,
    y: midY + 28,
    width: colW,
    parts: [],
    theme,
  }

  const readersCols: TableCol[] = [
    { label: 'Reader' },
    { label: 'Books', width: 52 },
    { label: 'Pages', width: 64 },
    { label: 'Pts', width: 52 },
  ]
  beginSection(left, 'Top readers', readersCols, true)
  const topBooks = analytics.booksPerReader.slice(0, 7)
  if (topBooks.length === 0) emptyRow(left, 'No books yet')
  else {
    for (const r of topBooks) {
      tableRow(
        left,
        [
          `${r.displayName} - ${r.teamName}`,
          String(r.books),
          fmt(r.pages),
          `+${r.pointsGained}`,
        ],
        readersCols,
      )
    }
  }

  const warCols: TableCol[] = [
    { label: 'Reader' },
    { label: 'Damage', width: 64 },
    { label: 'Attacks', width: 56 },
  ]
  beginSection(left, 'Warmongers', warCols)
  const warmongers = analytics.warmongers.slice(0, 5)
  if (warmongers.length === 0) emptyRow(left, 'Peace for now')
  else {
    for (const r of warmongers) {
      tableRow(
        left,
        [r.displayName, `-${r.damageDealt}`, String(r.sabotageCount)],
        warCols,
      )
    }
  }

  const pacCols: TableCol[] = [
    { label: 'Reader' },
    { label: 'Adds', width: 52 },
    { label: 'Pts', width: 56 },
  ]
  beginSection(left, 'Pacifists', pacCols)
  const pacifists = analytics.pacifists.slice(0, 5)
  if (pacifists.length === 0) emptyRow(left, 'No pure adds')
  else {
    for (const r of pacifists) {
      tableRow(
        left,
        [r.displayName, String(r.addCount), `+${r.pointsGained}`],
        pacCols,
      )
    }
  }

  const realmCols: TableCol[] = [
    { label: 'Realm' },
    { label: 'Books', width: 52 },
    { label: 'Pages', width: 64 },
    { label: 'Taken', width: 56 },
  ]
  beginSection(right, 'Realms', realmCols, true)
  const teams = [...analytics.byTeam].sort(
    (a, b) => b.booksLogged - a.booksLogged || b.pagesLogged - a.pagesLogged,
  )
  if (teams.length === 0) emptyRow(right, 'No realm activity')
  else {
    for (const t of teams) {
      tableRow(
        right,
        [
          t.teamName,
          String(t.booksLogged),
          fmt(t.pagesLogged),
          `-${t.damageTaken}`,
        ],
        realmCols,
      )
      tableRow(
        right,
        [`${t.addCount} add / ${t.sabotageCount} atk`, '', '', ''],
        realmCols,
        { muted: true, small: true },
      )
    }
  }

  const rivalryCols: TableCol[] = [
    { label: 'Matchup' },
    { label: 'Hits', width: 48 },
    { label: 'Damage', width: 64 },
  ]
  beginSection(right, 'Rivalries', rivalryCols)
  const rivalries = analytics.rivalry.slice(0, 5)
  if (rivalries.length === 0) emptyRow(right, 'No cross-realm hits')
  else {
    for (const r of rivalries) {
      tableRow(
        right,
        [
          `${r.fromTeamName} -> ${r.toTeamName}`,
          String(r.hits),
          `-${r.damage}`,
        ],
        rivalryCols,
      )
    }
  }

  const formatCols: TableCol[] = [
    { label: 'Format' },
    { label: 'Books', width: 56 },
  ]
  beginSection(right, 'Formats', formatCols)
  const formats = analytics.byFormat.slice(0, 4)
  if (formats.length === 0) emptyRow(right, 'No formats logged')
  else {
    for (const f of formats) {
      tableRow(right, [f.label, String(f.count)], formatCols)
    }
  }

  const tierCols: TableCol[] = [
    { label: 'Tier' },
    { label: 'Books', width: 56 },
  ]
  beginSection(right, 'Page tiers', tierCols)
  const tiers = analytics.byPageTier.slice(0, 5)
  if (tiers.length === 0) emptyRow(right, 'No page tiers')
  else {
    for (const t of tiers) {
      tableRow(right, [t.label, String(t.count)], tierCols, { small: true })
    }
  }

  const midBottom = Math.max(left.y, right.y) + 14
  const panelH = midBottom - midY
  svg += panelRect(leftX, midY, colW, panelH, theme)
  svg += panelRect(rightX, midY, colW, panelH, theme)
  svg += left.parts.join('\n')
  svg += right.parts.join('\n')

  let bottomY = midBottom + 18
  const bottomHEstimate = 220
  const bColW = (width - pad * 2 - gap * 2) / 3
  const b1: ColCursor = { x: pad, y: bottomY + 26, width: bColW, parts: [], theme }
  const b2: ColCursor = {
    x: pad + bColW + gap,
    y: bottomY + 26,
    width: bColW,
    parts: [],
    theme,
  }
  const b3: ColCursor = {
    x: pad + (bColW + gap) * 2,
    y: bottomY + 26,
    width: bColW,
    parts: [],
    theme,
  }

  const promptCols: TableCol[] = [
    { label: 'Prompt' },
    { label: 'Uses', width: 48 },
  ]
  beginSection(b1, 'Hot prompts', promptCols, true)
  const prompts = analytics.prompts.slice(0, 8)
  if (prompts.length === 0) emptyRow(b1, 'No prompt claims')
  else {
    for (const p of prompts) {
      tableRow(
        b1,
        [`${p.label} (${p.kind})`, String(p.count)],
        promptCols,
        { small: true },
      )
    }
  }

  const authorCols: TableCol[] = [
    { label: 'Author' },
    { label: 'Books', width: 48 },
    { label: 'Pages', width: 64 },
  ]
  beginSection(b2, 'Authors', authorCols, true)
  const authors = analytics.authors.slice(0, 6)
  if (authors.length === 0) emptyRow(b2, 'No authors yet')
  else {
    for (const a of authors) {
      tableRow(
        b2,
        [a.author, String(a.books), fmt(a.pages)],
        authorCols,
        { small: true },
      )
    }
  }

  const speedCols: TableCol[] = [
    { label: 'Read' },
    { label: 'Pages', width: 52 },
    { label: 'Days', width: 44 },
  ]
  beginSection(b3, 'Speed demons', speedCols, true)
  const speeds = analytics.speedDemons.slice(0, 4)
  if (speeds.length === 0) emptyRow(b3, 'No speed runs')
  else {
    for (const s of speeds) {
      tableRow(
        b3,
        [`${s.displayName}: ${s.bookTitle}`, String(s.pages), String(s.days)],
        speedCols,
        { small: true },
      )
    }
  }

  const longCols: TableCol[] = [
    { label: 'Book' },
    { label: 'Pages', width: 52 },
    { label: 'Pts', width: 44 },
  ]
  beginSection(b3, 'Longest', longCols)
  const longest = analytics.longestBooks.slice(0, 3)
  if (longest.length === 0) emptyRow(b3, 'No long books')
  else {
    for (const b of longest) {
      tableRow(
        b3,
        [
          `${b.bookTitle} - ${b.userName}`,
          fmt(b.pageCount),
          `${b.totalImpact >= 0 ? '+' : ''}${b.totalImpact}`,
        ],
        longCols,
        { small: true },
      )
    }
  }

  const bottomInner = Math.max(b1.y, b2.y, b3.y) + 14
  const bottomPanelH = Math.max(bottomInner - bottomY, bottomHEstimate * 0.5)
  svg += panelRect(pad, bottomY, bColW, bottomPanelH, theme)
  svg += panelRect(pad + bColW + gap, bottomY, bColW, bottomPanelH, theme)
  svg += panelRect(pad + (bColW + gap) * 2, bottomY, bColW, bottomPanelH, theme)
  svg += b1.parts.join('\n')
  svg += b2.parts.join('\n')
  svg += b3.parts.join('\n')

  const height = bottomY + bottomPanelH + 28

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${svg}
</svg>`
}
