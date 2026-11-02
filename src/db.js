// PostgreSQL add-on: schema, idempotent seed, and the few queries the
// companion page runs itself (the chalkboard menu, the shop tags, the till).
import pg from 'pg';
import { DATASET_VERSION, generateYear } from './dataset.js';

// Clever Cloud injects POSTGRESQL_ADDON_URI when the add-on is linked.
export const connectionString = () => process.env.POSTGRESQL_ADDON_URI;

export const pool = new pg.Pool({
  connectionString: connectionString(),
  max: 5, // xxs_sml allows 45 connections: 5 per instance leaves room for Metabase
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
});
pool.on('error', (err) => console.error('[db] idle client error:', err.message));

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS ledger_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shops (
  id smallint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  city text NOT NULL,
  district text NOT NULL,
  closed_on text NOT NULL,
  opened_year int NOT NULL,
  signature text NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id smallint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  price_eur numeric(6,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS weather_daily (
  day date NOT NULL,
  city text NOT NULL,
  tmax_c numeric(4,1) NOT NULL,
  tmin_c numeric(4,1) NOT NULL,
  rain_mm numeric(5,1) NOT NULL,
  conditions text NOT NULL,
  PRIMARY KEY (day, city)
);
CREATE TABLE IF NOT EXISTS footfall_hourly (
  shop_id smallint NOT NULL REFERENCES shops,
  hour timestamp NOT NULL,
  visitors int NOT NULL,
  PRIMARY KEY (shop_id, hour)
);
CREATE TABLE IF NOT EXISTS sales_hourly (
  shop_id smallint NOT NULL REFERENCES shops,
  product_id smallint NOT NULL REFERENCES products,
  sold_at timestamp NOT NULL,
  units int NOT NULL,
  revenue_eur numeric(10,2) NOT NULL,
  PRIMARY KEY (shop_id, product_id, sold_at)
);
CREATE INDEX IF NOT EXISTS sales_hourly_sold_at ON sales_hourly (sold_at);
CREATE TABLE IF NOT EXISTS till_tickets (
  id bigserial PRIMARY KEY,
  rung_at timestamptz NOT NULL DEFAULT now(),
  shop_id smallint NOT NULL REFERENCES shops,
  product_id smallint NOT NULL REFERENCES products,
  units int NOT NULL CHECK (units BETWEEN 1 AND 12),
  amount_eur numeric(8,2) NOT NULL
);`;

// Insert many rows in one statement: one array per column, unnest() on the server.
async function bulkInsert(client, table, columns, types, rows, pick, chunk = 10_000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const arrays = columns.map((_, c) => slice.map((r) => pick(r)[c]));
    const unnest = types.map((t, c) => `$${c + 1}::${t}[]`).join(', ');
    await client.query(`INSERT INTO ${table} (${columns.join(', ')}) SELECT * FROM unnest(${unnest})`, arrays);
  }
}

// Creates the schema and writes the 2025 ledger once. Safe to run on every
// boot and from several instances: an advisory lock serialises them.
export async function seed({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(2025)');
    const { rows } = await client.query("SELECT value FROM ledger_meta WHERE key = 'dataset'");
    if (rows[0]?.value === DATASET_VERSION) {
      await client.query('COMMIT');
      return { seeded: false };
    }
    const t0 = Date.now();
    const year = generateYear();
    await client.query('TRUNCATE sales_hourly, footfall_hourly, weather_daily, till_tickets, products, shops');
    await bulkInsert(client, 'shops', ['id', 'name', 'city', 'district', 'closed_on', 'opened_year', 'signature'],
      ['int', 'text', 'text', 'text', 'text', 'int', 'text'], year.shops,
      (s) => [s.id, s.name, s.city, s.district, DAYS[s.closedOn], s.opened, s.signature]);
    await bulkInsert(client, 'products', ['id', 'name', 'category', 'price_eur'],
      ['int', 'text', 'text', 'numeric'], year.products, (p) => [p.id, p.name, p.category, p.price]);
    await bulkInsert(client, 'weather_daily', ['day', 'city', 'tmax_c', 'tmin_c', 'rain_mm', 'conditions'],
      ['date', 'text', 'numeric', 'numeric', 'numeric', 'text'], year.weather,
      (w) => [w.day, w.city, w.tmax, w.tmin, w.rain, w.conditions]);
    await bulkInsert(client, 'footfall_hourly', ['shop_id', 'hour', 'visitors'],
      ['int', 'timestamp', 'int'], year.footfall, (f) => [f.shopId, f.hour, f.visitors]);
    await bulkInsert(client, 'sales_hourly', ['shop_id', 'product_id', 'sold_at', 'units', 'revenue_eur'],
      ['int', 'int', 'timestamp', 'int', 'numeric'], year.sales,
      (s) => [s.shopId, s.productId, s.soldAt, s.units, s.revenue]);
    // Three opening tickets, so the live till is never empty.
    await client.query(`INSERT INTO till_tickets (shop_id, product_id, units, amount_eur)
      SELECT v.shop_id, v.product_id, v.units, p.price_eur * v.units
      FROM (VALUES (1, 3, 2), (2, 5, 1), (3, 6, 1)) AS v(shop_id, product_id, units)
      JOIN products p ON p.id = v.product_id`);
    await client.query(`INSERT INTO ledger_meta (key, value) VALUES ('dataset', $1)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [DATASET_VERSION]);
    await client.query('COMMIT');
    await client.query('ANALYZE');
    log(`[db] ledger written: ${year.sales.length} sales rows, ${year.footfall.length} footfall rows in ${Date.now() - t0} ms`);
    return { seeded: true, rows: year.sales.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- page data

// Facts for the chalkboard, the shop tags and the story captions.
// The 2025 ledger never changes after the seed: computed once at boot.
export async function ledgerFacts() {
  const q = (sql) => pool.query(sql).then((r) => r.rows);
  const [menu, shops, monthly, totals, croissants, galette, heat, version] = await Promise.all([
    q(`SELECT p.name, p.category, p.price_eur::float AS price,
         SUM(s.units)::int AS units, SUM(s.revenue_eur)::float AS revenue
       FROM sales_hourly s JOIN products p ON p.id = s.product_id
       GROUP BY p.id ORDER BY units DESC`),
    q(`SELECT sh.name, sh.city, sh.district, sh.closed_on, sh.opened_year, sh.signature,
         SUM(s.revenue_eur)::float AS revenue,
         COUNT(DISTINCT s.sold_at::date)::int AS open_days,
         SUM(s.units) FILTER (WHERE p.name = sh.signature)::int AS signature_units
       FROM shops sh
       JOIN sales_hourly s ON s.shop_id = sh.id
       JOIN products p ON p.id = s.product_id
       GROUP BY sh.id ORDER BY sh.id`),
    q(`SELECT sh.name AS shop, EXTRACT(MONTH FROM s.sold_at)::int AS month, SUM(s.revenue_eur)::float AS revenue
       FROM sales_hourly s JOIN shops sh ON sh.id = s.shop_id
       GROUP BY 1, 2 ORDER BY 1, 2`),
    q(`SELECT SUM(revenue_eur)::float AS revenue, SUM(units)::int AS units,
         (SELECT SUM(visitors)::int FROM footfall_hourly) AS visitors,
         COUNT(*)::int AS rows
       FROM sales_hourly`),
    q(`WITH nine AS (
         SELECT EXTRACT(ISODOW FROM s.sold_at) AS dow, SUM(s.units) AS units
         FROM sales_hourly s JOIN products p ON p.id = s.product_id
         WHERE p.name = 'Croissant' AND EXTRACT(HOUR FROM s.sold_at) = 9
         GROUP BY s.shop_id, s.sold_at::date, 1)
       SELECT ROUND(AVG(units) FILTER (WHERE dow = 7))::int AS sunday,
              ROUND(AVG(units) FILTER (WHERE dow BETWEEN 1 AND 5))::int AS weekday
       FROM nine`),
    q(`WITH daily AS (
         SELECT s.sold_at::date AS day,
           SUM(s.revenue_eur) FILTER (WHERE p.name = 'Baguette tradition') AS baguette,
           SUM(s.revenue_eur) FILTER (WHERE p.name = 'Galette des rois') AS galette
         FROM sales_hourly s JOIN products p ON p.id = s.product_id GROUP BY 1),
       race AS (
         SELECT day, SUM(baguette) OVER w AS baguette, SUM(COALESCE(galette, 0)) OVER w AS galette
         FROM daily WINDOW w AS (ORDER BY day))
       SELECT (SELECT SUM(galette) FROM daily WHERE day < '2025-02-01')::float AS galette_january,
              (SELECT SUM(baguette) FROM daily WHERE day < '2025-02-01')::float AS baguette_january,
              (SELECT MIN(day) FROM race WHERE day > '2025-01-15' AND baguette > galette)::text AS overtaken_on`),
    q(`WITH shop_days AS (
         SELECT s.shop_id, s.sold_at::date AS day,
           SUM(s.units) FILTER (WHERE p.name = 'Baguette tradition') AS baguettes,
           COALESCE(SUM(s.units) FILTER (WHERE p.name = 'Citronnade maison'), 0) AS citronnades
         FROM sales_hourly s JOIN products p ON p.id = s.product_id GROUP BY 1, 2)
       SELECT ROUND(AVG(d.baguettes) FILTER (WHERE w.tmax_c >= 33))::int AS hot_baguettes,
              ROUND(AVG(d.baguettes) FILTER (WHERE w.tmax_c BETWEEN 15 AND 25))::int AS mild_baguettes,
              ROUND(AVG(d.citronnades) FILTER (WHERE w.tmax_c >= 33))::int AS hot_citronnades,
              ROUND(AVG(d.citronnades) FILTER (WHERE w.tmax_c BETWEEN 15 AND 25))::int AS mild_citronnades,
              COUNT(*) FILTER (WHERE w.tmax_c >= 33)::int AS hot_shop_days,
              MAX(w.tmax_c)::float AS hottest
       FROM shop_days d JOIN shops sh ON sh.id = d.shop_id
       JOIN weather_daily w ON w.city = sh.city AND w.day = d.day`),
    q("SELECT current_setting('server_version') AS version"),
  ]);
  return {
    menu,
    shops: shops.map((s) => ({ ...s, monthly: monthly.filter((m) => m.shop === s.name).map((m) => m.revenue) })),
    totals: totals[0],
    story: { croissants: croissants[0], galette: galette[0], heat: heat[0] },
    postgres: version[0].version,
  };
}

// ---------------------------------------------------------------- the till

export const TILL_PRODUCTS = [1, 3, 4, 8, 9, 15]; // baguette, croissant, pain au chocolat, éclair, flan, citronnade
const TILL_CAP = 500; // a public URL must not grow the table forever

export const TILL_INSERT_SQL = `INSERT INTO till_tickets
  (shop_id, product_id,
   units, amount_eur)
SELECT $1::int, p.id, $3::int,
  p.price_eur * $3::int
FROM products p
WHERE p.id = $2::int
RETURNING id, rung_at, units,
  amount_eur`;

export async function ringUp({ shopId, productId, units }) {
  const { rows } = await pool.query(TILL_INSERT_SQL, [shopId, productId, units]);
  await pool.query('DELETE FROM till_tickets WHERE id <= (SELECT MAX(id) FROM till_tickets) - $1', [TILL_CAP]);
  return rows[0];
}

export async function lastTickets(limit = 8) {
  const { rows } = await pool.query(`SELECT t.id, t.rung_at, sh.name AS shop, p.name AS product,
      t.units, t.amount_eur::float AS amount
    FROM till_tickets t JOIN shops sh ON sh.id = t.shop_id JOIN products p ON p.id = t.product_id
    ORDER BY t.id DESC LIMIT $1`, [limit]);
  return rows;
}

export async function deepCheck() {
  const t0 = Date.now();
  const { rows } = await pool.query("SELECT current_setting('server_version') AS version, (SELECT COUNT(*)::int FROM till_tickets) AS tickets");
  return { status: 'ok', version: rows[0].version, tickets: rows[0].tickets, ms: Date.now() - t0 };
}
