/**
 * Opt-in CLI: run tenancy migration without starting the HTTP server.
 *
 *   cd server && npm run migrate:tenancy
 *   cd server && npm run migrate:tenancy -- --force
 */
import { config as loadEnv } from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDb } from '../db/connect.js'
import { getTenancyMigrateMode, runTenancyMigration } from './migrate.js'

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') })

async function main() {
  const force = process.argv.includes('--force')
  await connectDb()
  const report = await runTenancyMigration({
    mode: force ? 'force' : getTenancyMigrateMode(),
    force,
  })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ran && report.skippedReason === 'TENANCY_MIGRATE=off' && !force) {
    console.log(
      'Hint: re-run with --force, or set TENANCY_MIGRATE=force / auto in server/.env',
    )
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('[tenancy] migrate CLI failed:', err)
  process.exit(1)
})
