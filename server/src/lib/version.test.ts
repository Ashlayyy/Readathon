import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { APP_VERSION, resolveAppVersion } from './version.js'

function readRootPackageVersion(): string {
	const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../../package.json')
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
	return pkg.version ?? '0.0.0'
}

describe('resolveAppVersion', () => {
	it('respects APP_VERSION env override', () => {
		assert.equal(resolveAppVersion({ APP_VERSION: ' 9.9.9 ' }), '9.9.9')
	})

	it('reads root package version when APP_VERSION is unset', () => {
		assert.equal(resolveAppVersion({}), readRootPackageVersion())
	})
})

describe('APP_VERSION', () => {
	it('matches resolveAppVersion at module load', () => {
		assert.equal(APP_VERSION, resolveAppVersion())
		assert.match(APP_VERSION, /^\d+\.\d+\.\d+/)
	})
})
