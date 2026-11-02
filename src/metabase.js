// Metabase add-on: provisioning by API, idempotent, run at every boot.
//
//   1. first-run wizard (POST /api/setup) or login (POST /api/session)
//   2. static embedding on, with our embedding secret key
//   3. the bakery PostgreSQL connected as a data source
//   4. a collection, the questions of questions.js, the dashboard
//
// Every call is recorded (method, path, status, duration: never a body) so the
// companion page can show what was done to Metabase.
import {
  COLLECTION_NAME, DASHBOARD_LAYOUT, DASHBOARD_NAME, DATABASE_NAME, QUESTIONS, SHOP_PARAMETER,
} from './questions.js';

const MARK = 'demo-metabase key:'; // stored in descriptions to find our objects again

export function metabaseConfig(env = process.env) {
  return {
    siteUrl: (env.METABASE_SITE_URL || '').replace(/\/+$/, ''),
    email: env.METABASE_ADMIN_EMAIL || 'baker@les-trois-fournils.example',
    password: env.METABASE_ADMIN_PASSWORD || '',
    // Static embedding secret: its own random value (scripts/set-secrets.sh), never
    // derived from anything else. Tokens signed with it travel in public iframe URLs.
    secret: env.METABASE_EMBEDDING_SECRET_KEY || '',
  };
}

// The admin password must be long, the embedding secret exactly 64 hex characters.
export const isConfigured = (cfg) => Boolean(cfg.siteUrl && cfg.email && cfg.password.length >= 16 && /^[0-9a-f]{64}$/i.test(cfg.secret));

export const state = {
  status: 'not-configured', // not-configured | provisioning | waiting | ready
  version: null,
  databaseId: null,
  collectionId: null,
  dashboardId: null,
  cards: {}, // question key -> card id
  log: [],
  provisionedAt: null,
  error: null,
};

export class MetabaseError extends Error {
  constructor(method, path, status, detail) {
    super(`${method} ${path} -> ${status}${detail ? `: ${detail}` : ''}`);
    this.status = status;
  }
}

function client(cfg, log) {
  let session = null;
  const call = async (method, path, body) => {
    const t0 = performance.now();
    const res = await fetch(cfg.siteUrl + path, {
      method,
      headers: { 'content-type': 'application/json', ...(session ? { 'x-metabase-session': session } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    log.push({ method, path, status: res.status, ms: Math.round(performance.now() - t0) });
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const detail = typeof data === 'string' ? data.slice(0, 160) : data?.message || data?.errors && JSON.stringify(data.errors).slice(0, 160);
      throw new MetabaseError(method, path, res.status, detail);
    }
    return data;
  };
  return { call, setSession: (id) => { session = id; } };
}

const list = (data) => (Array.isArray(data) ? data : data?.data ?? []);
const keyOf = (obj) => obj?.description?.split(MARK)[1]?.trim() ?? null;
const describe = (key, text) => `${text}\n\n${MARK} ${key}`;

// Bakery PostgreSQL connection details, read from the add-on's own variable.
export function bakeryDatabaseDetails(uri = process.env.POSTGRESQL_ADDON_URI) {
  const u = new URL(uri);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    dbname: decodeURIComponent(u.pathname.slice(1)),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: true,
    'ssl-mode': 'prefer', // TLS when the server offers it
    'tunnel-enabled': false,
    'advanced-options': false,
  };
}

async function setting(api, key, value) {
  await api.call('PUT', `/api/setting/${key}`, { value });
}

export async function provision(cfg, { log = [], dbDetails = bakeryDatabaseDetails() } = {}) {
  const api = client(cfg, log);
  const out = { cards: {} };

  // 1. Wizard on a fresh add-on, login afterwards.
  const props = await api.call('GET', '/api/session/properties');
  out.version = props.version?.tag ?? null;
  if (!props['has-user-setup'] && props['setup-token']) {
    const site = 'The Bakery Ledger';
    const session = await api.call('POST', '/api/setup', {
      token: props['setup-token'],
      user: { first_name: 'Head', last_name: 'Baker', email: cfg.email, password: cfg.password, password_confirm: cfg.password, site_name: site },
      prefs: { site_name: site, site_locale: 'en', allow_tracking: false },
    });
    api.setSession(session.id);
  } else {
    const session = await api.call('POST', '/api/session', { username: cfg.email, password: cfg.password });
    api.setSession(session.id);
  }

  // 2. Static embedding ("enable-embedding" before Metabase 0.52).
  try { await setting(api, 'enable-embedding-static', true); } catch { await setting(api, 'enable-embedding', true); }
  await setting(api, 'embedding-secret-key', cfg.secret);

  // 3. The bakery database. Credentials are refreshed on every boot.
  const databases = list(await api.call('GET', '/api/database'));
  let database = databases.find((d) => d.name === DATABASE_NAME);
  if (database) {
    database = await api.call('PUT', `/api/database/${database.id}`, { details: dbDetails });
  } else {
    database = await api.call('POST', '/api/database', {
      engine: 'postgres', name: DATABASE_NAME, details: dbDetails, is_full_sync: true, auto_run_queries: true,
    });
  }
  out.databaseId = database.id;

  // 4. Collection, questions, dashboard.
  const collections = list(await api.call('GET', '/api/collection'));
  let collection = collections.find((c) => c.name === COLLECTION_NAME && !c.archived);
  collection ??= await api.call('POST', '/api/collection', {
    name: COLLECTION_NAME, description: 'Les Trois Fournils, 2025. Created by the demo-metabase setup script.',
  });
  out.collectionId = collection.id;

  const items = list(await api.call('GET', `/api/collection/${collection.id}/items?models=card&models=dashboard`));
  const existing = new Map(items.filter(keyOf).map((item) => [keyOf(item), item.id]));

  for (const q of QUESTIONS) {
    const body = {
      name: q.name,
      description: describe(q.key, `Native SQL on the bakery PostgreSQL add-on (${q.key}).`),
      display: q.display,
      collection_id: collection.id,
      dataset_query: { type: 'native', database: database.id, native: { query: q.sql, 'template-tags': q.tags } },
      visualization_settings: q.viz,
    };
    let id = existing.get(q.key);
    if (!id) id = (await api.call('POST', '/api/card', body)).id;
    await api.call('PUT', `/api/card/${id}`, { ...body, enable_embedding: true, embedding_params: {} });
    out.cards[q.key] = id;
  }

  let dashboardId = existing.get('dashboard');
  const dashDescription = describe('dashboard', 'A year in three artisan bakeries: revenue, best-sellers, Sunday croissants and the weather.');
  if (!dashboardId) {
    dashboardId = (await api.call('POST', '/api/dashboard', {
      name: DASHBOARD_NAME, description: dashDescription, collection_id: collection.id, parameters: [SHOP_PARAMETER],
    })).id;
  }
  await api.call('PUT', `/api/dashboard/${dashboardId}`, {
    name: DASHBOARD_NAME,
    description: dashDescription,
    width: 'full',
    parameters: [SHOP_PARAMETER],
    dashcards: DASHBOARD_LAYOUT.map((cell, i) => {
      const cardId = out.cards[cell.key];
      return {
        id: -(i + 1),
        card_id: cardId,
        row: cell.row,
        col: cell.col,
        size_x: cell.size_x,
        size_y: cell.size_y,
        visualization_settings: {},
        parameter_mappings: [{ parameter_id: SHOP_PARAMETER.id, card_id: cardId, target: ['variable', ['template-tag', 'shop']] }],
      };
    }),
  });
  await api.call('PUT', `/api/dashboard/${dashboardId}`, { enable_embedding: true, embedding_params: { shop: 'locked' } });
  out.dashboardId = dashboardId;
  return out;
}

// Background loop for the web server: retries while Metabase boots.
export async function provisionInBackground({ cfg = metabaseConfig(), lock, logger = console } = {}) {
  if (!isConfigured(cfg)) {
    state.status = 'not-configured';
    logger.log('[metabase] METABASE_SITE_URL, METABASE_ADMIN_PASSWORD (16+ chars) or METABASE_EMBEDDING_SECRET_KEY (64 hex) missing: provisioning skipped');
    return;
  }
  let delay = 10_000;
  for (;;) {
    state.status = state.status === 'ready' ? 'ready' : 'provisioning';
    const log = [];
    try {
      const result = await (lock ? lock(() => provision(cfg, { log })) : provision(cfg, { log }));
      Object.assign(state, result, { status: 'ready', log, provisionedAt: new Date().toISOString(), error: null });
      logger.log(`[metabase] ready: Metabase ${result.version}, dashboard ${result.dashboardId}, ${Object.keys(result.cards).length} questions, ${log.length} API calls`);
      return;
    } catch (err) {
      Object.assign(state, { status: 'waiting', log, error: err.message });
      logger.log(`[metabase] not ready yet (${err.message}); retry in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 120_000);
    }
  }
}

export async function metabaseHealth(cfg = metabaseConfig()) {
  if (!cfg.siteUrl) return { status: 'not-configured' };
  const t0 = Date.now();
  try {
    const res = await fetch(`${cfg.siteUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    const body = await res.json().catch(() => ({}));
    return { status: res.ok && body.status === 'ok' ? 'ok' : 'down', http: res.status, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 'unreachable', error: err.name, ms: Date.now() - t0 };
  }
}
