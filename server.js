// The Bakery Ledger: companion app of the Metabase add-on demo.
// Node.js standard library + pg. Routes:
//   GET  /              the page (chalkboard, stories, embedded Metabase)
//   GET  /health        200, touches nothing
//   GET  /health/deep   bakery PostgreSQL + Metabase add-on
//   GET  /api/ledger    everything the page shows, as JSON
//   GET  /api/embed     a freshly signed embed URL (?shop=… or ?question=…)
//   GET  /api/till      last tickets          POST /api/till   ring up a sale
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILL_INSERT_SQL, TILL_PRODUCTS, deepCheck, lastTickets, ledgerFacts, pool, ringUp, seed } from './src/db.js';
import { isConfigured, metabaseConfig, metabaseHealth, provisionInBackground, state as metabase } from './src/metabase.js';
import { embedUrl } from './src/embed.js';
import { QUESTIONS, SHOP_NAMES } from './src/questions.js';
import { PRODUCTS, SHOPS } from './src/dataset.js';

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const cfg = metabaseConfig();
const db = { status: 'starting', facts: null, error: null };

// ---------------------------------------------------------------- data for the page

const PLATFORM_KEYS = ['CC_APP_NAME', 'APP_ID', 'INSTANCE_NUMBER', 'INSTANCE_TYPE', 'CC_PRETTY_INSTANCE_NAME', 'CC_COMMIT_ID', 'CC_DEPLOYMENT_ID'];
const platform = () => Object.fromEntries(PLATFORM_KEYS.map((k) => {
  const v = process.env[k] || null;
  return [k, k === 'CC_COMMIT_ID' && v ? v.slice(0, 7) : v];
}));

const metabaseReady = () => metabase.status === 'ready' && isConfigured(cfg);
const sign = (resource, params = {}) => embedUrl({ siteUrl: cfg.siteUrl, secret: cfg.secret, resource, params });

function signedDashboard(shop) {
  const value = SHOP_NAMES.includes(shop) ? shop : []; // [] = all shops
  return { shop: SHOP_NAMES.includes(shop) ? shop : 'all', ...sign({ dashboard: metabase.dashboardId }, { shop: value }) };
}

async function pageData() {
  const ready = metabaseReady();
  return {
    db: { status: db.status, error: db.error },
    facts: db.facts,
    tickets: db.status === 'ready' ? await lastTickets().catch(() => []) : [],
    till: {
      sql: TILL_INSERT_SQL,
      shops: SHOPS.map(({ id, name }) => ({ id, name })),
      products: PRODUCTS.filter((p) => TILL_PRODUCTS.includes(p.id)).map(({ id, name, price }) => ({ id, name, price })),
    },
    questions: QUESTIONS.filter((q) => q.story).map((q) => ({
      key: q.key,
      name: q.name,
      display: q.display,
      sql: q.sql,
      id: metabase.cards[q.key] ?? null,
      embed: ready ? sign({ question: metabase.cards[q.key] }) : null,
    })),
    dashboard: ready ? { id: metabase.dashboardId, ...signedDashboard('all') } : null,
    metabase: {
      status: metabase.status,
      version: metabase.version,
      siteUrl: cfg.siteUrl || null,
      databaseId: metabase.databaseId,
      collectionId: metabase.collectionId,
      dashboardId: metabase.dashboardId,
      questions: Object.keys(metabase.cards).length,
      provisionedAt: metabase.provisionedAt,
      log: metabase.log,
      error: metabase.error,
    },
    platform: platform(),
  };
}

// ---------------------------------------------------------------- http helpers

const SECURITY_HEADERS = () => ({
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    `frame-src ${cfg.siteUrl ? new URL(cfg.siteUrl).origin : "'none'"}`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
});

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY_HEADERS() });
  res.end(payload);
}

async function readJson(req, limit = 2048) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw Object.assign(new Error('body too large'), { status: 413 });
  }
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function serveStatic(res, pathname) {
  const file = normalize(join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR) || !TYPES[extname(file)]) return send(res, 404, { error: 'not found' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': `${TYPES[extname(file)]}; charset=utf-8`, 'cache-control': 'public, max-age=300', ...SECURITY_HEADERS() });
    res.end(body);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

// A public till must not be hammered: 20 tickets per minute and per address.
const rings = new Map();
function allowRing(ip, now = Date.now()) {
  const recent = (rings.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  rings.set(ip, recent);
  if (rings.size > 5000) rings.clear();
  return true;
}

// ---------------------------------------------------------------- routes

export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname}`;
  try {
    switch (route) {
      case 'GET /': {
        const html = await readFile(join(PUBLIC_DIR, 'index.html'), 'utf8');
        const json = JSON.stringify(await pageData()).replace(/</g, '\\u003c');
        return send(res, 200, html.replace('<!--LEDGER_DATA-->', `<script id="ledger-data" type="application/json">${json}</script>`), 'text/html; charset=utf-8');
      }
      case 'GET /health':
        return send(res, 200, { status: 'ok' });
      case 'GET /health/deep': {
        const [postgres, metabaseCheck] = await Promise.all([
          deepCheck().catch((err) => ({ status: 'error', error: err.code || err.message })),
          metabaseHealth(cfg),
        ]);
        const ok = postgres.status === 'ok' && metabaseCheck.status === 'ok';
        return send(res, ok ? 200 : 503, { status: ok ? 'ok' : 'degraded', postgres, metabase: { ...metabaseCheck, provisioning: metabase.status } });
      }
      case 'GET /api/ledger':
        return send(res, 200, await pageData());
      case 'GET /api/embed': {
        if (!metabaseReady()) return send(res, 503, { error: 'Metabase is not provisioned yet', status: metabase.status });
        const key = url.searchParams.get('question');
        if (key) {
          const id = metabase.cards[key];
          if (!id) return send(res, 404, { error: 'unknown question' });
          return send(res, 200, sign({ question: id }));
        }
        return send(res, 200, signedDashboard(url.searchParams.get('shop')));
      }
      case 'GET /api/till':
        return send(res, 200, { tickets: await lastTickets() });
      case 'POST /api/till': {
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        if (!allowRing(ip)) return send(res, 429, { error: 'The till needs a breather: 20 tickets per minute at most.' });
        const body = await readJson(req);
        const shopId = Number(body.shop);
        const productId = Number(body.product);
        const units = Number(body.units);
        if (!SHOPS.some((s) => s.id === shopId) || !TILL_PRODUCTS.includes(productId) || !Number.isInteger(units) || units < 1 || units > 12) {
          return send(res, 400, { error: 'Pick a shop, a product from the till and 1 to 12 units.' });
        }
        const ticket = await ringUp({ shopId, productId, units });
        return send(res, 201, { ticket, sql: TILL_INSERT_SQL, params: [shopId, productId, units], tickets: await lastTickets() });
      }
      default:
        if (req.method === 'GET') return serveStatic(res, url.pathname);
        return send(res, 405, { error: 'method not allowed' });
    }
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.message });
    console.error(`[http] ${route}:`, err.message);
    return send(res, 500, { error: 'The bakery database did not answer. Check /health/deep.' });
  }
}

// ---------------------------------------------------------------- boot

async function withAdvisoryLock(fn) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(4242)'); // one instance provisions at a time
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock(4242)').catch(() => {});
    client.release();
  }
}

async function boot() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await seed();
      db.facts = await ledgerFacts();
      Object.assign(db, { status: 'ready', error: null });
      break;
    } catch (err) {
      Object.assign(db, { status: 'error', error: err.code || err.message });
      console.error(`[db] not ready (${err.message}); retry in 15s`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  await provisionInBackground({ cfg, lock: withAdvisoryLock });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer(handle);
  server.listen(PORT, '0.0.0.0', () => console.log(`[http] The Bakery Ledger listening on 0.0.0.0:${PORT}`));
  boot();
  const stop = () => server.close(() => pool.end().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
