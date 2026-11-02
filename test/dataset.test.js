import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, generateYear } from '../src/dataset.js';

const year = generateYear();
const product = (name) => PRODUCTS.find((p) => p.name === name).id;
const sum = (rows) => rows.reduce((total, r) => total + r.units, 0);

test('the year is deterministic: same seed, same ledger', () => {
  const again = generateYear();
  assert.equal(again.sales.length, year.sales.length);
  assert.equal(sum(again.sales), sum(year.sales));
});

test('croissants peak on Sunday mornings', () => {
  const croissants = year.sales.filter((s) => s.productId === product('Croissant') && s.soldAt.endsWith('09:00:00'));
  const dow = (s) => new Date(`${s.soldAt.slice(0, 10)}T12:00:00Z`).getUTCDay();
  const sunday = croissants.filter((s) => dow(s) === 0);
  const tuesday = croissants.filter((s) => dow(s) === 2);
  assert.ok(sum(sunday) / sunday.length > 3 * (sum(tuesday) / tuesday.length));
});

test('galettes are sold in January only, bûches in December only', () => {
  const months = (name) => new Set(year.sales.filter((s) => s.productId === product(name)).map((s) => s.soldAt.slice(5, 7)));
  assert.deepEqual([...months('Galette des rois')], ['01']);
  assert.deepEqual([...months('Bûche de Noël')], ['12']);
});

test('Croix-Rousse closes for its summer holidays', () => {
  const august = year.sales.filter((s) => s.shopId === 2 && s.soldAt >= '2025-08-04' && s.soldAt < '2025-08-25');
  assert.equal(august.length, 0);
});

test('heat waves kill bread and sell citronnade', () => {
  const tmax = new Map(year.weather.map((w) => [`${w.city}|${w.day}`, w.tmax]));
  const city = { 1: 'Paris', 2: 'Lyon', 3: 'Marseille' };
  const perDay = (name, hot) => {
    const days = new Map();
    for (const s of year.sales) {
      if (s.productId !== product(name)) continue;
      const t = tmax.get(`${city[s.shopId]}|${s.soldAt.slice(0, 10)}`);
      if (hot ? t < 33 : t < 15 || t > 25) continue;
      const key = `${s.shopId}|${s.soldAt.slice(0, 10)}`;
      days.set(key, (days.get(key) ?? 0) + s.units);
    }
    return [...days.values()].reduce((a, b) => a + b, 0) / days.size;
  };
  assert.ok(perDay('Baguette tradition', true) < 0.85 * perDay('Baguette tradition', false));
  assert.ok(perDay('Citronnade maison', true) > 4 * perDay('Citronnade maison', false));
});
