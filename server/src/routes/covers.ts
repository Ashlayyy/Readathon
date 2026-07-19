import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { getSessionUser, requireAuth } from '../services/auth.js'
import { lookupBookCoverCandidates } from '../services/covers.js'
import { coverFilePath, saveCoverDataUrl } from '../services/coverUpload.js'

export const coverRoutes = new Hono()

coverRoutes.get('/lookup', async (c) => {
	const title = c.req.query('title')?.trim() ?? ''
	const author = c.req.query('author')?.trim() ?? ''
	if (title.length < 2) {
		return c.json({ error: 'Title is required' }, 400)
	}
	const { best, candidates } = await lookupBookCoverCandidates(
		title,
		author || undefined,
		5,
	)
	return c.json({ cover: best, candidates })
})

coverRoutes.post('/upload', async (c) => {
	requireAuth(await getSessionUser(c))
	const body = await c.req.json<{ dataUrl?: string }>()
	const dataUrl = body.dataUrl?.trim() ?? ''
	if (!dataUrl) return c.json({ error: 'Image data is required' }, 400)

	const result = await saveCoverDataUrl(dataUrl)
	if (!result.ok) return c.json({ error: result.error }, 400)
	return c.json({ coverUrl: result.coverUrl })
})

coverRoutes.get('/files/:filename', async (c) => {
	const filename = c.req.param('filename')
	const path = coverFilePath(filename)
	if (!path || !existsSync(path)) {
		return c.json({ error: 'Not found' }, 404)
	}

	const buf = await readFile(path)
	const ext = filename.split('.').pop()?.toLowerCase()
	const type =
		ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

	c.header('Content-Type', type)
	c.header('Cache-Control', 'public, max-age=31536000, immutable')
	return c.body(buf)
})
