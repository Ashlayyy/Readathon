import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	getSvgFontFaceStyles,
	getSvgFontStatus,
	injectSvgFonts,
	loadBundledFontBuffers,
	SVG_FONT_SANS,
} from './svgFonts.js'

describe('svgFonts', () => {
	it('exposes the sans stack name used in SVG templates', () => {
		assert.match(SVG_FONT_SANS, /DejaVu Sans/)
	})

	it('loads bundled font buffers when assets exist', () => {
		const status = getSvgFontStatus()
		assert.equal(status.ready, status.files > 0)
		if (status.ready) {
			const buffers = loadBundledFontBuffers()
			assert.ok(buffers.length > 0)
			assert.ok(buffers.every((b) => Buffer.isBuffer(b) && b.length > 0))
		}
	})

	it('injectSvgFonts embeds @font-face once', () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
		const styles = getSvgFontFaceStyles()
		if (!styles) {
			assert.equal(injectSvgFonts(svg), svg)
			return
		}

		const injected = injectSvgFonts(svg)
		assert.match(injected, /@font-face\{font-family:'DejaVu Sans'/)
		assert.equal(injectSvgFonts(injected), injected)
	})

	it('returns null font-face styles only when no font files resolve', () => {
		const status = getSvgFontStatus()
		const styles = getSvgFontFaceStyles()
		if (status.ready) assert.ok(styles)
		else assert.equal(styles, null)
	})
})
