// Apply pending database migrations before the API starts serving, so a deploy
// from GitHub is complete on its own. This replaces the deploy workflow's Kudu
// /api/command step, which Azure cuts off at about 4 minutes (HTTP 504) while
// `prisma migrate deploy` over the App Service file share often takes 2–4.
// Opt-in with RUN_MIGRATIONS_ON_START=true (production); local dev is unaffected.
// Same approach as the Kolo repo's market-api.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export function migrateOnStart(): void {
  if (process.env.RUN_MIGRATIONS_ON_START !== 'true') return;
  const require = createRequire(import.meta.url);
  const cli = require.resolve('prisma/build/index.js');
  console.log('[startup] applying database migrations…');
  const r = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`[startup] migrations failed (exit ${r.status}); not starting with a mismatched schema`);
    process.exit(1);
  }
}
