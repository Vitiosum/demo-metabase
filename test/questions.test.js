import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_LAYOUT, QUESTIONS, byKey } from '../src/questions.js';
import { bakeryDatabaseDetails, isConfigured, metabaseConfig } from '../src/metabase.js';

test('every dashboard cell points to a question that uses the shop variable', () => {
  for (const cell of DASHBOARD_LAYOUT) {
    const q = byKey(cell.key);
    assert.ok(q, cell.key);
    assert.match(q.sql, /\[\[AND sh\.name = \{\{shop\}\}\]\]/);
    assert.ok(cell.col + cell.size_x <= 24, `${cell.key} fits the 24-column grid`);
  }
});

test('the SQL fits on a till receipt (44 characters per line)', () => {
  for (const q of QUESTIONS) {
    for (const line of q.sql.split('\n')) assert.ok(line.length <= 44, `${q.key}: "${line}"`);
  }
});

test('Metabase connection details come from the add-on URI', () => {
  const d = bakeryDatabaseDetails('postgresql://u%40x:p%3Aw@host.example:6543/bakery');
  assert.deepEqual([d.host, d.port, d.dbname, d.user, d.password], ['host.example', 6543, 'bakery', 'u@x', 'p:w']);
});

test('provisioning refuses a missing or weak secret, with no fallback', () => {
  const env = { METABASE_SITE_URL: 'https://mb/', METABASE_ADMIN_PASSWORD: 'a'.repeat(32), METABASE_EMBEDDING_SECRET_KEY: 'f'.repeat(64) };
  const cfg = metabaseConfig(env);
  assert.equal(cfg.siteUrl, 'https://mb');
  assert.equal(cfg.email, 'baker@les-trois-fournils.example');
  assert.equal(isConfigured(cfg), true);
  assert.equal(metabaseConfig({ ...env, METABASE_EMBEDDING_SECRET_KEY: '' }).secret, '');
  assert.equal(isConfigured(metabaseConfig({ ...env, METABASE_EMBEDDING_SECRET_KEY: '' })), false);
  assert.equal(isConfigured(metabaseConfig({ ...env, METABASE_EMBEDDING_SECRET_KEY: 'abc123' })), false);
  assert.equal(isConfigured(metabaseConfig({ ...env, METABASE_ADMIN_PASSWORD: 'short1' })), false);
  assert.equal(isConfigured(metabaseConfig({ ...env, METABASE_SITE_URL: '' })), false);
});
