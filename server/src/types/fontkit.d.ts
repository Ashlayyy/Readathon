declare module 'fontkit' {
	export interface GlyphPosition {
		xAdvance: number
		xOffset: number
		yOffset: number
	}

	export interface GlyphPath {
		scale(x: number, y: number): GlyphPath
		translate(x: number, y: number): GlyphPath
		toSVG(): string
	}

	export interface Glyph {
		path: GlyphPath
	}

	export interface GlyphRun {
		glyphs: Glyph[]
		positions: GlyphPosition[]
	}

	export interface Font {
		unitsPerEm: number
		layout(text: string): GlyphRun
	}

	export function openSync(path: string): Font
}
