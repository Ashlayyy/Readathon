import { SVG_FONT_SANS } from '../lib/svgFonts.js'
import { svgToPng } from '../services/svgToPng.js'
import { formatMinutes } from './sprintState.js'

export type ProfileCardInput = {
	name: string
	nametag: string | null
	color: string | null
	backgroundUrl: string | null
	avatarUrl: string | null
	genres: string | null
	authors: string | null
	bio: string | null
	pages: number
	minutes: number
}

const WIDTH = 1400
const HEIGHT = 1200
const DEFAULT_BG = '#6d28d9'
const GOLD = '#ffe14a'

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function cleanHex(color: string | null): string {
	const raw = (color ?? '').trim()
	return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_BG
}

function isLight(hex: string): boolean {
	const n = Number.parseInt(hex.slice(1), 16)
	const r = (n >> 16) & 255
	const g = (n >> 8) & 255
	const b = n & 255
	return (r * 299 + g * 587 + b * 114) / 1000 > 170
}

function wrap(text: string, max: number, lines: number): string[] {
	const words = text.trim().split(/\s+/).filter(Boolean)
	const out: string[] = []
	let current = ''
	for (const word of words) {
		const next = current ? `${current} ${word}` : word
		if (next.length > max && current) {
			out.push(current)
			current = word
			if (out.length === lines) break
		} else {
			current = next
		}
	}
	if (current && out.length < lines) out.push(current)
	if (out.length === lines && words.join(' ').length > out.join(' ').length) {
		const last = out[lines - 1] ?? ''
		out[lines - 1] = last.length > 3 ? `${last.slice(0, max - 1)}…` : last
	}
	return out
}

async function imageDataUri(url: string | null): Promise<string | null> {
	const target = url?.trim()
	if (!target || !/^https:\/\//i.test(target)) return null
	try {
		const res = await fetch(target, { signal: AbortSignal.timeout(8000) })
		if (!res.ok) return null
		const type = (res.headers.get('content-type') || 'image/png').split(';')[0]?.trim() || 'image/png'
		if (!type.startsWith('image/')) return null
		const bytes = Buffer.from(await res.arrayBuffer())
		if (bytes.length === 0 || bytes.length > 4_000_000) return null
		return `data:${type};base64,${bytes.toString('base64')}`
	} catch {
		return null
	}
}

export async function renderProfileCardSvg(input: ProfileCardInput): Promise<string> {
	const bg = cleanHex(input.color)
	const nameColor = isLight(bg) ? '#1a1028' : GOLD
	const labelColor = isLight(bg) ? '#3b2760' : GOLD
	const textColor = isLight(bg) ? '#1a1028' : '#f7f4ff'
	const display = (input.nametag || input.name).trim().slice(0, 16) || 'Reader'
	const genres = wrap(input.genres?.trim() || 'Not set', 48, 2)
	const authors = wrap(input.authors?.trim() || 'Not set', 48, 2)
	const bio = wrap(input.bio?.trim() || 'No bio yet.', 70, 2)
	const [background, avatar] = await Promise.all([
		imageDataUri(input.backgroundUrl),
		imageDataUri(input.avatarUrl),
	])
	const letter = escapeXml(display.slice(0, 1).toUpperCase())
	const backgroundLayer = background
		? `<image href="${background}" xlink:href="${background}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
       <rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}" fill-opacity="0.62"/>`
		: `<rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}"/>`
	const avatarLayer = avatar
		? `<g clip-path="url(#avatar)"><image href="${avatar}" xlink:href="${avatar}" x="80" y="160" width="400" height="400" preserveAspectRatio="xMidYMid slice"/></g>`
		: `<circle cx="280" cy="360" r="190" fill="#1a1028"/><text x="280" y="410" text-anchor="middle" fill="${GOLD}" font-size="150" font-family="${SVG_FONT_SANS}" font-weight="700">${letter}</text>`

	const genreLines = genres
		.map((line, index) => `<text x="560" y="${470 + index * 48}" fill="${textColor}" font-size="36" font-family="${SVG_FONT_SANS}">${escapeXml(line)}</text>`)
		.join('')
	const authorLines = authors
		.map((line, index) => `<text x="560" y="${680 + index * 48}" fill="${textColor}" font-size="36" font-family="${SVG_FONT_SANS}">${escapeXml(line)}</text>`)
		.join('')
	const bioLines = bio
		.map((line, index) => `<text x="80" y="${1040 + index * 46}" fill="${textColor}" font-size="32" font-family="${SVG_FONT_SANS}">${escapeXml(line)}</text>`)
		.join('')

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <clipPath id="card"><rect width="${WIDTH}" height="${HEIGHT}" rx="40"/></clipPath>
    <clipPath id="avatar"><circle cx="280" cy="360" r="190"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    ${backgroundLayer}
    <text x="56" y="80" fill="${textColor}" font-size="32" font-family="${SVG_FONT_SANS}">${input.pages} pages · ${escapeXml(formatMinutes(input.minutes))}</text>
    ${avatarLayer}
    <circle cx="280" cy="360" r="198" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="8"/>
    <text x="540" y="250" fill="${nameColor}" font-size="84" font-family="${SVG_FONT_SANS}" font-weight="700">${escapeXml(display)}</text>
    <text x="560" y="420" fill="${labelColor}" font-size="32" font-family="${SVG_FONT_SANS}" font-weight="700">Preferred genres</text>
    ${genreLines}
    <text x="560" y="630" fill="${labelColor}" font-size="32" font-family="${SVG_FONT_SANS}" font-weight="700">Favorite authors</text>
    ${authorLines}
    <rect x="48" y="980" width="1304" height="170" rx="24" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.35)"/>
    ${bioLines}
  </g>
</svg>`
}

export async function renderProfileCardPng(input: ProfileCardInput): Promise<Buffer> {
	const svg = await renderProfileCardSvg(input)
	return svgToPng(svg, 1600)
}
