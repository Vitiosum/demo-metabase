import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handle } from '../server.js';
import { lastTickets, pool, ringUp, seed } from '../src/db.js';

let base;
const server = createServer(handle);
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await pool.end();
});

test('GET /health answers without touching any add-on', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('the till rejects what is not on the counter', async () => {
  const res = await fetch(`${base}/api/till`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shop: 1, product: 12, units: 3 }) });
  assert.equal(res.status, 400);
});

test('embed tokens are refused until Metabase is provisioned', async () => {
  const res = await fetch(`${base}/api/embed?shop=all`);
  assert.equal(res.status, 503);
});

test('unknown files are 404, and the page sets a strict CSP', async () => {
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
  const res = await fetch(`${base}/health`);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
});

const withDb = { skip: process.env.POSTGRESQL_ADDON_URI ? false : 'POSTGRESQL_ADDON_URI not set' };

test('seed is idempotent and the till writes then reads back', withDb, async () => {
  await seed();
  assert.equal((await seed()).seeded, false);
  const ticket = await ringUp({ shopId: 3, productId: 15, units: 2 });
  assert.equal(Number(ticket.amount_eur), 6.4);
  const [last] = await lastTickets(1);
  assert.equal(last.id, ticket.id);
  assert.equal(last.product, 'Citronnade maison');
});
