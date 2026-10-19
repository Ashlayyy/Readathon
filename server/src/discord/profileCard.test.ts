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
			sprintsDone: 3,
		})
		assert.match(svg, /ashlayyyyyyy/)
		assert.match(svg, /Preferred Genres/)
		assert.match(svg, /Sprints Done/)
		assert.match(svg, /Pages Read/)
		assert.match(svg, /1 hr/)
		assert.match(svg, /#6d28d9/)
	})

	it('draws website books and team on the second page', async () => {
		const svg = await renderProfileCardSvg({
			name: 'Ashlay',
			nametag: null,
			color: '#6d28d9',
			backgroundUrl: null,
			avatarUrl: null,
			genres: null,
			authors: null,
			bio: null,
			pages: 0,
			minutes: 0,
			sprintsDone: 0,
			page: 1,
			site: {
				linked: true,
				teamName: 'Wielders',
				booksFinished: 4,
				booksInProgress: 1,
				pagesLogged: 900,
				points: 120,
				currentlyReading: 'Kindred',
				recentBooks: ['Kindred'],
			},
		})
		assert.match(svg, /Books finished/)
		assert.match(svg, /Pages logged/)
		assert.match(svg, /Wielders/)
		assert.match(svg, /Kindred/)
	})
})
