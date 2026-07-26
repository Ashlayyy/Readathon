import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { avatarFilePath } from '../services/coverUpload.js'

export const avatarRoutes = new Hono()

avatarRoutes.get('/files/:filename', async (c) => {
	const filename = c.req.param('filename')
	const path = avatarFilePath(filename)
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
