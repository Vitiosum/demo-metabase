// The story lives here: a deterministic year (2025) in the life of
// "Les Trois Fournils", three artisan bakeries in Paris, Lyon and Marseille.
// Same seed, same numbers, every time: the charts tell the same story in
// every meeting.
//
//   - croissants peak on Sunday mornings
//   - the galette des rois rules January, the bûche de Noël rules December
//   - heat waves (late June, mid-August) kill bread and sell citronnade
//   - Croix-Rousse closes three weeks in August, Vieux-Port lives on tourists

export const YEAR = 2025;
export const DATASET_VERSION = 'trois-fournils-2025-v1';

export const SHOPS = [
  { id: 1, name: 'Montmartre', city: 'Paris', district: 'Paris 18e', closedOn: 1, opened: 1987, scale: 1.15, signature: 'Paris-Brest' },
  { id: 2, name: 'Croix-Rousse', city: 'Lyon', district: 'Lyon 4e', closedOn: 3, opened: 2004, scale: 0.95, signature: 'Brioche aux pralines' },
  { id: 3, name: 'Vieux-Port', city: 'Marseille', district: 'Marseille 2e', closedOn: 2, opened: 2015, scale: 1.0, signature: 'Fougasse aux olives' },
];

// base = units per normal weekday in a shop of scale 1.
// specialty = the shop where the product is a local favourite (base ×5).
export const PRODUCTS = [
  { id: 1, name: 'Baguette tradition', category: 'Bread', price: 1.3, base: 520, rhythm: 'bread' },
  { id: 2, name: 'Pain de campagne', category: 'Bread', price: 4.2, base: 45, rhythm: 'bread' },
  { id: 3, name: 'Croissant', category: 'Viennoiserie', price: 1.4, base: 210, rhythm: 'morning' },
  { id: 4, name: 'Pain au chocolat', category: 'Viennoiserie', price: 1.55, base: 190, rhythm: 'morning' },
  { id: 5, name: 'Brioche aux pralines', category: 'Viennoiserie', price: 4.8, base: 9, rhythm: 'morning', specialty: 'Croix-Rousse' },
  { id: 6, name: 'Fougasse aux olives', category: 'Bread', price: 3.6, base: 11, rhythm: 'bread', specialty: 'Vieux-Port' },
  { id: 7, name: 'Paris-Brest', category: 'Pâtisserie', price: 4.9, base: 8, rhythm: 'afternoon', specialty: 'Montmartre' },
  { id: 8, name: 'Éclair au chocolat', category: 'Pâtisserie', price: 3.4, base: 50, rhythm: 'afternoon' },
  { id: 9, name: 'Flan pâtissier', category: 'Pâtisserie', price: 3.0, base: 34, rhythm: 'afternoon' },
  { id: 10, name: 'Tarte aux fraises', category: 'Pâtisserie', price: 4.5, base: 44, rhythm: 'afternoon', season: 'strawberry' },
  { id: 11, name: 'Tarte aux pommes', category: 'Pâtisserie', price: 3.8, base: 30, rhythm: 'afternoon', season: 'apple' },
  { id: 12, name: 'Galette des rois', category: 'Festive', price: 24.0, base: 24, rhythm: 'festive', season: 'galette' },
  { id: 13, name: 'Bûche de Noël', category: 'Festive', price: 34.0, base: 4, rhythm: 'afternoon', season: 'buche' },
  { id: 14, name: 'Jambon-beurre', category: 'Snacking', price: 5.2, base: 75, rhythm: 'lunch' },
  { id: 15, name: 'Citronnade maison', category: 'Drinks', price: 3.2, base: 0, rhythm: 'drinks', season: 'heat' },
];

// Weekday multipliers, index 0 = Sunday … 6 = Saturday.
const WEEKDAY = {
  bread: [0.85, 0.97, 0.97, 1.0, 1.0, 1.06, 1.15],
  morning: [2.6, 0.92, 0.92, 0.95, 0.95, 1.0, 1.5],
  afternoon: [2.3, 0.85, 0.85, 0.95, 0.95, 1.1, 1.6],
  festive: [3.2, 0.8, 0.8, 1.0, 0.9, 1.2, 2.4],
  lunch: [0.3, 1.05, 1.05, 1.05, 1.05, 1.0, 0.6],
  drinks: [0.8, 1, 1, 1, 1, 1.05, 1.3],
};

// Hourly weights. Monday–Saturday 6:30–20:00, Sunday 7:00–13:00.
const HOURS = {
  bread: { 6: 2, 7: 10, 8: 9, 9: 5, 10: 4, 11: 7, 12: 9, 13: 4, 14: 2, 15: 2, 16: 4, 17: 9, 18: 12, 19: 7 },
  morning: { 6: 4, 7: 16, 8: 18, 9: 14, 10: 10, 11: 5, 12: 2, 13: 1, 14: 1, 15: 3, 16: 4, 17: 3, 18: 2, 19: 1 },
  afternoon: { 7: 1, 8: 2, 9: 3, 10: 5, 11: 8, 12: 7, 13: 6, 14: 6, 15: 9, 16: 12, 17: 12, 18: 10, 19: 6 },
  festive: { 8: 2, 9: 4, 10: 7, 11: 9, 12: 8, 13: 5, 14: 5, 15: 7, 16: 10, 17: 13, 18: 14, 19: 9 },
  lunch: { 8: 1, 9: 1, 10: 3, 11: 15, 12: 40, 13: 30, 14: 8, 15: 2, 16: 2, 17: 2, 18: 2, 19: 1 },
  drinks: { 9: 1, 10: 3, 11: 6, 12: 12, 13: 14, 14: 14, 15: 15, 16: 14, 17: 10, 18: 6, 19: 3 },
};
const SUNDAY_HOURS = {
  bread: { 7: 14, 8: 16, 9: 15, 10: 14, 11: 16, 12: 14 },
  morning: { 7: 10, 8: 22, 9: 26, 10: 22, 11: 12, 12: 5 },
  afternoon: { 7: 2, 8: 5, 9: 10, 10: 18, 11: 24, 12: 20 },
  festive: { 7: 3, 8: 8, 9: 14, 10: 22, 11: 26, 12: 20 },
  lunch: { 10: 10, 11: 40, 12: 50 },
  drinks: { 9: 5, 10: 15, 11: 35, 12: 45 },
};

const CLIMATE = {
  Paris: { mean: 16, amp: 9.5, rain: 0.3, wave1: 10, wave2: 9 },
  Lyon: { mean: 17, amp: 11, rain: 0.26, wave1: 11.5, wave2: 10.5 },
  Marseille: { mean: 19.5, amp: 9.5, rain: 0.13, wave1: 9, wave2: 8.5 },
};

const HOLIDAYS = new Set(['01-01', '05-01', '12-25']);

// ---------------------------------------------------------------- helpers

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// Poisson for small means, normal approximation above.
function sampleCount(rand, mean) {
  if (mean <= 0) return 0;
  if (mean < 30) {
    const limit = Math.exp(-mean);
    let k = 0;
    let p = rand();
    while (p > limit) {
      k += 1;
      p *= rand();
    }
    return k;
  }
  return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian(rand)));
}

const pad = (n) => String(n).padStart(2, '0');

export function daysOfYear(year = YEAR) {
  const days = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + 86400000)) {
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    days.push({
      iso: `${year}-${pad(month)}-${pad(day)}`,
      month,
      day,
      doy: days.length + 1,
      dow: d.getUTCDay(),
    });
  }
  return days;
}

// ---------------------------------------------------------------- weather

function heatWave(doy, climate) {
  // Wave 1: builds from June 19 to a peak on July 1, breaks by July 4.
  if (doy >= 170 && doy <= 182) return climate.wave1 * ((doy - 169) / 13);
  if (doy > 182 && doy <= 185) return climate.wave1 * ((185 - doy) / 3);
  // Wave 2: August 8–18.
  if (doy >= 220 && doy <= 230) return climate.wave2 * Math.sin((Math.PI * (doy - 219)) / 12);
  return 0;
}

export function generateWeather(days, rand) {
  const rows = [];
  for (const city of Object.keys(CLIMATE)) {
    const c = CLIMATE[city];
    let anomaly = 0;
    for (const day of days) {
      anomaly = 0.7 * anomaly + 2.0 * gaussian(rand);
      const wave = heatWave(day.doy, c);
      const seasonal = c.mean + c.amp * Math.sin((2 * Math.PI * (day.doy - 105)) / 365);
      const tmax = Math.round((seasonal + anomaly * (wave > 0 ? 0.3 : 1) + wave) * 10) / 10;
      const tmin = Math.round((tmax - 8.5 - 1.5 * Math.abs(gaussian(rand))) * 10) / 10;
      const summer = day.month >= 6 && day.month <= 8;
      const rains = wave === 0 && rand() < c.rain * (summer ? 0.6 : 1);
      const rain = rains ? Math.round(Math.exp(1.1 + 0.9 * gaussian(rand)) * 10) / 10 : 0;
      const conditions = tmax >= 33 ? 'Heat wave' : rain >= 4 ? 'Rain' : rain > 0 ? 'Showers' : tmax >= 24 ? 'Sunny' : 'Cloudy';
      rows.push({ day: day.iso, city, tmax, tmin, rain, conditions });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- demand

function isOpen(shop, day) {
  if (day.dow === shop.closedOn) return false;
  if (HOLIDAYS.has(`${pad(day.month)}-${pad(day.day)}`)) return false;
  // Croix-Rousse takes its "congés annuels" like every Lyon bakery.
  if (shop.name === 'Croix-Rousse' && day.month === 8 && day.day >= 4 && day.day <= 24) return false;
  return true;
}

function shopSeason(shop, day) {
  const { month: m, day: d } = day;
  if (shop.name === 'Montmartre') {
    if (m === 8) return 0.82;
    if (m === 7 && d >= 15) return 0.92;
    if (m === 12) return 1.08;
  }
  if (shop.name === 'Croix-Rousse') {
    if ((m === 7 && d >= 20) || (m === 8 && d <= 3)) return 0.85;
    if (m === 8) return 0.9;
    if (m === 12) return 1.08;
  }
  if (shop.name === 'Vieux-Port') {
    // Tourists in summer, and a young shop that keeps growing all year.
    const trend = 1 + (0.12 * day.doy) / 365;
    const tourism = { 6: 1.15, 7: 1.3, 8: 1.3, 9: 1.1, 11: 0.9, 12: 0.95, 1: 0.88, 2: 0.9 }[m] ?? 1;
    return trend * tourism;
  }
  return 1;
}

function productSeason(product, day) {
  const { month: m, day: d, doy } = day;
  switch (product.season) {
    case 'strawberry':
      return doy >= 105 && doy <= 212 ? Math.exp(-(((doy - 148) / 30) ** 2)) : 0;
    case 'apple':
      if (m >= 10 && m <= 11) return 1;
      return m >= 9 || m <= 3 ? 0.6 : 0;
    case 'galette': {
      if (m !== 1) return 0;
      const epiphany = d === 4 || d === 5 ? 1.8 : 1;
      return (1.7 - (1.3 * (d - 1)) / 30) * epiphany;
    }
    case 'buche':
      if (m !== 12) return 0;
      if (d >= 12 && d <= 24) return Math.exp((d - 12) / 3.2);
      return d === 31 ? 14 : 0;
    default:
      return 1;
  }
}

function weatherFactor(product, w) {
  const hot = (from) => Math.max(0, w.tmax - from);
  switch (product.category) {
    case 'Bread':
      return Math.max(0.5, 1 - 0.034 * hot(27));
    case 'Viennoiserie':
      return Math.max(0.6, 1 - 0.02 * hot(27));
    case 'Pâtisserie':
      return product.season === 'strawberry' ? 1 - 0.01 * hot(28) : Math.max(0.55, 1 - 0.026 * hot(26));
    case 'Snacking':
      return (1 - 0.012 * hot(30)) * (w.rain >= 4 ? 0.8 : 1);
    default:
      return 1;
  }
}

function dailyMean(product, shop, day, w) {
  if (product.season === 'heat') {
    // Citronnade: nobody wants it under 17 °C, everybody wants it at 36 °C.
    const thirst = w.tmax < 17 ? 0 : 2.4 * (w.tmax - 17) ** 1.35;
    return thirst * (w.rain >= 3 ? 0.5 : 1) * shop.scale * shopSeason(shop, day) * WEEKDAY.drinks[day.dow];
  }
  const base = product.specialty === shop.name ? product.base * 5 : product.base;
  const footfall = (w.rain >= 4 ? 0.88 : 1) * (1 - 0.012 * Math.max(0, w.tmax - 30));
  const weekday = product.season === 'buche' ? 1 : WEEKDAY[product.rhythm][day.dow];
  return base * shop.scale * shopSeason(shop, day) * footfall * weekday * productSeason(product, day) * weatherFactor(product, w);
}

// ---------------------------------------------------------------- the year

export function generateYear({ seed = 2025 } = {}) {
  const rand = mulberry32(seed);
  const days = daysOfYear();
  const weather = generateWeather(days, rand);
  const weatherBy = new Map(weather.map((w) => [`${w.city}|${w.day}`, w]));
  const sales = [];
  const footfall = [];

  for (const shop of SHOPS) {
    for (const day of days) {
      if (!isOpen(shop, day)) continue;
      const w = weatherBy.get(`${shop.city}|${day.iso}`);
      const unitsByHour = new Map();
      for (const product of PRODUCTS) {
        const mean = dailyMean(product, shop, day, w);
        if (mean <= 0.05) continue;
        const weights = (day.dow === 0 ? SUNDAY_HOURS : HOURS)[product.rhythm];
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        for (const [hour, weight] of Object.entries(weights)) {
          const units = sampleCount(rand, (mean * weight) / total);
          if (units === 0) continue;
          sales.push({
            shopId: shop.id,
            productId: product.id,
            soldAt: `${day.iso} ${pad(hour)}:00:00`,
            units,
            revenue: Math.round(units * product.price * 100) / 100,
          });
          unitsByHour.set(hour, (unitsByHour.get(hour) ?? 0) + units);
        }
      }
      for (const [hour, units] of unitsByHour) {
        const basket = 2.0 * (1 + 0.08 * gaussian(rand));
        footfall.push({ shopId: shop.id, hour: `${day.iso} ${pad(hour)}:00:00`, visitors: Math.max(1, Math.round(units / basket)) });
      }
    }
  }
  return { shops: SHOPS, products: PRODUCTS, weather, sales, footfall };
}
