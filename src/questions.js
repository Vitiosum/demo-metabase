// Every Metabase question of the demo, in one place.
// The same SQL is sent to Metabase by the setup script and printed on the
// "receipts" of the companion page: what you read is what Metabase runs.
//
// {{shop}} is an optional Metabase variable. The dashboard maps its "Shop"
// filter to it; the companion app locks it inside the signed embed token.

export const COLLECTION_NAME = 'The Bakery Ledger';
export const DASHBOARD_NAME = 'The Bakery Ledger: Les Trois Fournils, 2025';
export const DATABASE_NAME = 'Bakery ledger (PostgreSQL add-on)';
export const SHOP_NAMES = ['Montmartre', 'Croix-Rousse', 'Vieux-Port'];

export const COLORS = {
  shops: { Montmartre: '#3E5C8A', 'Croix-Rousse': '#B8443F', 'Vieux-Port': '#2E8F84' },
  products: {
    'Baguette tradition': '#B4652A',
    Croissant: '#E0A92E',
    'Pain au chocolat': '#5A3825',
    'Jambon-beurre': '#C46B7C',
    'Galette des rois': '#7A5FA8',
    'Bûche de Noël': '#2F7A5A',
  },
  baguettes: '#B4652A',
  citronnades: '#3E9BB3',
};

const euro = { number_style: 'currency', currency: 'EUR', currency_style: 'symbol' };
const col = (name) => JSON.stringify(['name', name]);
const shopTag = {
  shop: { id: 'a7c1e3f0-5b0b-4c1d-9e2f-5d0b5f1a5c01', name: 'shop', 'display-name': 'Shop', type: 'text' },
};
const scalar = (key, name, sql, settings = {}) => ({
  key,
  name,
  display: 'scalar',
  sql,
  tags: shopTag,
  viz: { 'scalar.compact_primary_number': false, ...settings },
});

export const QUESTIONS = [
  scalar(
    'kpi_revenue',
    'Revenue in 2025',
    `SELECT SUM(s.revenue_eur) AS revenue
FROM sales_hourly s
JOIN shops sh ON sh.id = s.shop_id
WHERE TRUE
  [[AND sh.name = {{shop}}]]`,
    { column_settings: { [col('revenue')]: { ...euro, decimals: 0 } } },
  ),
  scalar(
    'kpi_items',
    'Items sold',
    `SELECT SUM(s.units) AS items
FROM sales_hourly s
JOIN shops sh ON sh.id = s.shop_id
WHERE TRUE
  [[AND sh.name = {{shop}}]]`,
  ),
  scalar(
    'kpi_visitors',
    'Visitors',
    `SELECT SUM(f.visitors) AS visitors
FROM footfall_hourly f
JOIN shops sh ON sh.id = f.shop_id
WHERE TRUE
  [[AND sh.name = {{shop}}]]`,
  ),
  scalar(
    'kpi_basket',
    'Average basket',
    `SELECT ROUND(SUM(s.revenue_eur)
  / (SELECT SUM(f.visitors)
     FROM footfall_hourly f
     JOIN shops sh ON sh.id = f.shop_id
     WHERE TRUE
       [[AND sh.name = {{shop}}]]), 2)
  AS basket
FROM sales_hourly s
JOIN shops sh ON sh.id = s.shop_id
WHERE TRUE
  [[AND sh.name = {{shop}}]]`,
    { column_settings: { [col('basket')]: { ...euro, decimals: 2 } } },
  ),
  {
    key: 'revenue_by_shop',
    name: 'Revenue by shop, month by month',
    display: 'line',
    story: 'shops',
    sql: `SELECT date_trunc('month', s.sold_at)::date
         AS month,
       sh.name AS shop,
       SUM(s.revenue_eur) AS revenue
FROM sales_hourly s
JOIN shops sh ON sh.id = s.shop_id
WHERE TRUE
  [[AND sh.name = {{shop}}]]
GROUP BY 1, 2
ORDER BY 1, 2`,
    tags: shopTag,
    viz: {
      'graph.dimensions': ['month', 'shop'],
      'graph.metrics': ['revenue'],
      'graph.show_values': false,
      'graph.y_axis.title_text': 'Revenue',
      'graph.x_axis.title_text': '2025',
      series_settings: Object.fromEntries(Object.entries(COLORS.shops).map(([k, color]) => [k, { color, 'line.marker_enabled': false }])),
      column_settings: { [col('revenue')]: { ...euro, decimals: 0 }, [col('month')]: { date_style: 'MMMM' } },
    },
  },
  {
    key: 'bestseller_race',
    name: 'The best-seller race',
    display: 'line',
    story: 'race',
    sql: `WITH weeks AS (
  SELECT generate_series(date '2024-12-30',
    date '2025-12-29', interval '1 week')
    ::date AS week
), contenders AS (
  SELECT id, name FROM products
  WHERE name IN ('Baguette tradition',
    'Croissant', 'Pain au chocolat',
    'Jambon-beurre', 'Galette des rois',
    'Bûche de Noël')
), weekly AS (
  SELECT date_trunc('week', s.sold_at)
           ::date AS week,
         s.product_id,
         SUM(s.revenue_eur) AS revenue
  FROM sales_hourly s
  JOIN shops sh ON sh.id = s.shop_id
  WHERE TRUE
    [[AND sh.name = {{shop}}]]
  GROUP BY 1, 2
)
SELECT w.week, c.name AS product,
  SUM(COALESCE(wk.revenue, 0)) OVER (
    PARTITION BY c.id ORDER BY w.week
  ) AS revenue_so_far
FROM weeks w
CROSS JOIN contenders c
LEFT JOIN weekly wk
  ON wk.week = w.week
 AND wk.product_id = c.id
ORDER BY w.week, c.name`,
    tags: shopTag,
    viz: {
      'graph.dimensions': ['week', 'product'],
      'graph.metrics': ['revenue_so_far'],
      'graph.y_axis.title_text': 'Revenue so far',
      'graph.x_axis.title_text': 'Week of 2025',
      series_settings: Object.fromEntries(Object.entries(COLORS.products).map(([k, color]) => [k, { color, 'line.marker_enabled': false }])),
      column_settings: { [col('revenue_so_far')]: { ...euro, decimals: 0 } },
    },
  },
  {
    key: 'croissant_heatmap',
    name: 'Croissants by hour and weekday',
    display: 'table',
    story: 'sunday',
    sql: `WITH c AS (
  SELECT EXTRACT(HOUR FROM s.sold_at) AS h,
    EXTRACT(ISODOW FROM s.sold_at) AS d,
    s.units
  FROM sales_hourly s
  JOIN products p ON p.id = s.product_id
  JOIN shops sh ON sh.id = s.shop_id
  WHERE p.name = 'Croissant'
    [[AND sh.name = {{shop}}]]
)
SELECT LPAD(h::text, 2, '0') || ':00'
         AS hour,
  ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map((day, i) => `SUM(units) FILTER (WHERE d = ${i + 1}) AS "${day}"`)
    .join(',\n  ')}
FROM c
GROUP BY h
ORDER BY h`,
    tags: shopTag,
    viz: {
      'table.column_formatting': [
        {
          id: 0,
          columns: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          type: 'range',
          colors: ['#FFF8EC', '#F2C46B', '#9C4A12'],
          min_type: null,
          max_type: null,
          min_value: 0,
          max_value: 100,
          operator: '=',
          value: '',
          color: '#E0A92E',
          highlight_row: false,
        },
      ],
      'table.cell_column': 'Sun',
    },
  },
  {
    key: 'weather_impact',
    name: 'Heat waves kill bread',
    display: 'combo',
    story: 'heat',
    sql: `WITH shop_days AS (
  SELECT s.shop_id, s.sold_at::date AS day,
    SUM(s.units) FILTER (WHERE
      p.name = 'Baguette tradition')
      AS baguettes,
    SUM(s.units) FILTER (WHERE
      p.name = 'Citronnade maison')
      AS citronnades
  FROM sales_hourly s
  JOIN products p
    ON p.id = s.product_id
  JOIN shops sh ON sh.id = s.shop_id
  WHERE TRUE
    [[AND sh.name = {{shop}}]]
  GROUP BY 1, 2
)
SELECT (FLOOR(w.tmax_c / 3) * 3)::int
         AS max_temp_c,
  ROUND(AVG(d.baguettes)) AS baguettes,
  ROUND(AVG(COALESCE(d.citronnades, 0)))
    AS citronnades,
  COUNT(*) AS shop_days
FROM shop_days d
JOIN shops sh ON sh.id = d.shop_id
JOIN weather_daily w
  ON w.city = sh.city AND w.day = d.day
GROUP BY 1
ORDER BY 1`,
    tags: shopTag,
    viz: {
      'graph.dimensions': ['max_temp_c'],
      'graph.metrics': ['baguettes', 'citronnades'],
      'graph.x_axis.scale': 'ordinal',
      'graph.x_axis.title_text': 'Max temperature of the day (°C, 3° steps)',
      'graph.y_axis.title_text': 'Average per shop and day',
      series_settings: {
        baguettes: { display: 'bar', color: COLORS.baguettes, title: 'Baguettes', axis: 'left' },
        citronnades: { display: 'line', color: COLORS.citronnades, title: 'Citronnades', axis: 'right' },
      },
    },
  },
  {
    key: 'till_live',
    name: 'The till, live',
    display: 'table',
    story: 'till',
    sql: `SELECT t.id AS "Ticket",
  to_char(t.rung_at AT TIME ZONE
    'Europe/Paris', 'HH24:MI:SS') AS "Time",
  sh.name AS "Shop",
  t.units || ' × ' || p.name AS "Sale",
  t.amount_eur AS "Amount"
FROM till_tickets t
JOIN shops sh ON sh.id = t.shop_id
JOIN products p ON p.id = t.product_id
ORDER BY t.id DESC
LIMIT 8`,
    tags: {},
    viz: { column_settings: { [col('Amount')]: { ...euro, decimals: 2 } } },
  },
];

// Dashboard grid: 24 columns. The till is embedded on its own, not here.
export const DASHBOARD_LAYOUT = [
  { key: 'kpi_revenue', row: 0, col: 0, size_x: 6, size_y: 3 },
  { key: 'kpi_items', row: 0, col: 6, size_x: 6, size_y: 3 },
  { key: 'kpi_visitors', row: 0, col: 12, size_x: 6, size_y: 3 },
  { key: 'kpi_basket', row: 0, col: 18, size_x: 6, size_y: 3 },
  { key: 'bestseller_race', row: 3, col: 0, size_x: 13, size_y: 8 },
  { key: 'revenue_by_shop', row: 3, col: 13, size_x: 11, size_y: 8 },
  { key: 'croissant_heatmap', row: 11, col: 0, size_x: 14, size_y: 14 },
  { key: 'weather_impact', row: 11, col: 14, size_x: 10, size_y: 14 },
];

export const SHOP_PARAMETER = {
  id: 'shop',
  name: 'Shop',
  slug: 'shop',
  type: 'string/=',
  sectionId: 'string',
  values_query_type: 'list',
  values_source_type: 'static-list',
  values_source_config: { values: SHOP_NAMES },
};

export const byKey = (key) => QUESTIONS.find((q) => q.key === key);
