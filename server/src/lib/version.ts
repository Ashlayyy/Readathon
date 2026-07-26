import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Root package.json — single source of truth for the app version. */
function readRootPackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Resolve app version from env (override) or root package.json. */
export function resolveAppVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_VERSION?.trim() || readRootPackageVersion()
}

/** App version for health checks and deploy verification. Override with APP_VERSION. */
export const APP_VERSION = resolveAppVersion()
