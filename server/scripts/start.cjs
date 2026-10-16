/**
 * Production entry that works in cmd.exe and bash.
 * `NODE_ENV=production tsx ...` is a Unix assignment, so npm start on Windows
 * exited before Node launched.
 */
const { spawn } = require('node:child_process')
const path = require('node:path')

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production'

const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
	cwd: path.join(__dirname, '..'),
	env: process.env,
	stdio: 'inherit',
	windowsHide: false,
})

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal)
		return
	}
	process.exit(code ?? 1)
})

child.on('error', (err) => {
	console.error('Failed to launch server:', err)
	process.exit(1)
})
