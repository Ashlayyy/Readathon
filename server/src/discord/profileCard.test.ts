import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderProfileCardSvg } from './profileCard.js'

describe('profile card', () => {
	it('draws the name, genres, and pages on the card', async () => {
		const svg = await renderProfileCardSvg({
			name: 'Ashlay',
			nametag: 'ashlayyyyyyy',
			color: '#6d28d9',
			backgroundUrl: null,
			avatarUrl: null,
			genres: 'Fantasy, Romance',
			authors: 'Chloe Walsh',
			bio: 'I love reading.',
			pages: 66,
			minutes: 60,
		})
		assert.match(svg, /ashlayyyyyyy/)
		assert.match(svg, /Fantasy, Romance/)
		assert.match(svg, /66 pages/)
		assert.match(svg, /#6d28d9/)
	})
})
