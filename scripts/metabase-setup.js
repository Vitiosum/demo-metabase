// One-shot provisioning, the same code the server runs at boot:
//   npm run metabase:setup
// Needs POSTGRESQL_ADDON_URI and the METABASE_* variables (see .env.example).
import { isConfigured, metabaseConfig, provision } from '../src/metabase.js';
import { pool, seed } from '../src/db.js';

const cfg = metabaseConfig();
if (!isConfigured(cfg)) {
  console.error('Set METABASE_SITE_URL, METABASE_ADMIN_PASSWORD (16+ chars) and METABASE_EMBEDDING_SECRET_KEY (64 hex chars); see .env.example.');
  process.exit(1);
}
const log = [];
try {
  await seed();
  const result = await provision(cfg, { log });
  for (const entry of log) console.log(`${String(entry.status).padEnd(4)} ${entry.method.padEnd(6)} ${entry.path} (${entry.ms} ms)`);
  console.log(`\nMetabase ${result.version}: database ${result.databaseId}, collection ${result.collectionId}, dashboard ${result.dashboardId}`);
  console.log('Questions:', result.cards);
} catch (err) {
  for (const entry of log) console.log(`${String(entry.status).padEnd(4)} ${entry.method.padEnd(6)} ${entry.path}`);
  console.error(`\nProvisioning failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
