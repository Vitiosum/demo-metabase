import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { embedUrl, signToken } from '../src/embed.js';

const secret = 'a'.repeat(64);

test('signToken produces a valid HS256 JWT', () => {
  const token = signToken({ resource: { dashboard: 7 }, params: {} }, secret);
  const [head, body, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')).resource, { dashboard: 7 });
  assert.equal(signature, createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url'));
});

test('embedUrl locks params, expires, and hides Metabase chrome', () => {
  const now = Date.UTC(2026, 10, 1, 12);
  const { url, payload } = embedUrl({ siteUrl: 'https://mb.example', secret, resource: { dashboard: 3 }, params: { shop: 'Montmartre' }, now });
  assert.match(url, /^https:\/\/mb\.example\/embed\/dashboard\/[\w-]+\.[\w-]+\.[\w-]+#bordered=false&titled=false$/);
  assert.deepEqual(payload.params, { shop: 'Montmartre' });
  assert.equal(payload.exp, now / 1000 + 3600);
  assert.match(embedUrl({ siteUrl: 'https://mb.example', secret, resource: { question: 9 } }).url, /\/embed\/question\//);
});
