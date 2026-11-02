// The Bakery Ledger: renders the page from the JSON the server embeds,
// signs nothing itself (tokens come from the server), and runs the till.
const data = JSON.parse(document.getElementById('ledger-data').textContent);
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-GB');
const millions = (v, unit = '') => `${unit}${(v / 1e6).toFixed(2)} M`;
const parisTime = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' }).format(d);

const ICONS = {
  'Baguette tradition': 'baguette', 'Pain de campagne': 'baguette', 'Fougasse aux olives': 'baguette',
  Croissant: 'croissant', 'Brioche aux pralines': 'croissant', 'Pain au chocolat': 'chocolatine',
  'Éclair au chocolat': 'eclair', 'Paris-Brest': 'eclair', 'Flan pâtissier': 'flan', 'Tarte aux fraises': 'flan',
  'Tarte aux pommes': 'flan', 'Galette des rois': 'galette', 'Bûche de Noël': 'galette', 'Jambon-beurre': 'baguette',
  'Citronnade maison': 'citronnade',
};
const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const productIcon = (product) => icon(ICONS[product] || 'wheat');

// ------------------------------------------------------------------ chalkboard

function renderBoard() {
  const f = data.facts;
  if (!f) {
    $('#menu').innerHTML = `<li><span class="menu__name">The baker is still writing the ledger…</span></li>`;
    $('#menu-note').textContent = data.db.status === 'error' ? `The bakery PostgreSQL did not answer (${data.db.error}). Check /health/deep.` : 'First boot: 103,410 sales lines are being written. Refresh in a few seconds.';
    return;
  }
  const t = f.totals;
  $('#totals').innerHTML = [
    ['Revenue in 2025', millions(t.revenue, '€')],
    ['Items sold', millions(t.units)],
    ['Visitors', num.format(t.visitors)],
    ['Sales lines in PostgreSQL', num.format(t.rows)],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  const seasonal = { 'Galette des rois': 'January only', 'Citronnade maison': 'when it is hot' };
  const lines = [...f.menu.slice(0, 7), ...f.menu.filter((p) => seasonal[p.name])];
  $('#menu').innerHTML = lines.map((p) => `
    <li class="${seasonal[p.name] ? 'is-seasonal' : ''}">
      <span class="menu__name">${productIcon(p.name)}${esc(p.name)}</span><span class="menu__dots"></span><span class="menu__price">${eur2.format(p.price)}</span>
      <span class="menu__sold">${num.format(p.units)} sold${seasonal[p.name] ? `, ${seasonal[p.name]}` : ''}</span>
    </li>`).join('');
  $('#diagram-rows').textContent = `${num.format(t.rows)} sales lines`;
}

// ------------------------------------------------------------------ shop tags

function sparkline(values) {
  const w = 300; const h = 52; const max = Math.max(...values); const min = Math.min(...values);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * (w - 8) + 4},${h - 12 - ((v - min) / (max - min || 1)) * (h - 20)}`).join(' ');
  return `<svg class="tag__spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Monthly revenue, January to December">
    <polyline points="${points}"/><text x="2" y="${h - 1}">Jan</text><text x="${w - 22}" y="${h - 1}">Dec</text></svg>`;
}

function renderShops() {
  const shops = data.facts?.shops ?? [];
  $('#shops').innerHTML = shops.map((s) => `
    <li class="tag" data-shop="${esc(s.name)}">
      <div class="tag__head">${icon('shop')}<div><div class="tag__name">${esc(s.name)}</div><div class="tag__where">${esc(s.district)}, since ${s.opened_year}</div></div></div>
      <p class="tag__revenue">${eur0.format(s.revenue)}<small>in 2025, over ${s.open_days} days open</small></p>
      ${sparkline(s.monthly)}
      <p class="tag__facts">Closed on ${esc(s.closed_on)}s. Local favourite: <strong>${esc(s.signature)}</strong>, ${num.format(s.signature_units)} sold.</p>
    </li>`).join('');
}

// ------------------------------------------------------------------ stories

const STORIES = [
  {
    key: 'croissant_heatmap', icon: 'clock', title: 'Sunday, 9 a.m.', height: 640,
    text: ({ croissants: c }) => `The croissant is a Sunday ritual. Between 9 and 10 on a Sunday, a shop sells <b>${c.sunday} croissants in one hour</b>, against ${c.weekday} on a weekday. The shops close at 1 p.m. on Sundays, and each one closes one weekday: Montmartre on Monday, Vieux-Port on Tuesday, Croix-Rousse on Wednesday. You can see it in the paler columns.`,
  },
  {
    key: 'bestseller_race', icon: 'galette', title: 'The galette rules January', height: 460,
    text: ({ galette: g }) => `For one month a year, the best earner on the counter is a ${eur0.format(24)} frangipane cake with a paper crown. In January the galette des rois brings in <b>${eur0.format(g.galette_january)}</b>, against ${eur0.format(g.baguette_january)} for the baguette. The baguette only takes the lead for good on <b>${new Date(g.overtaken_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</b>. Croissant and pain au chocolat run neck and neck all year, and the bûche de Noël sprints in December.`,
  },
  {
    key: 'weather_impact', icon: 'sun', title: 'Heat waves kill bread', height: 460,
    text: ({ heat: h }) => `Nobody wants a warm baguette at 36 °C. On days above 33 °C a shop sells <b>${h.hot_baguettes} baguettes instead of ${h.mild_baguettes}</b> on a mild day, and ${h.hot_citronnades} glasses of citronnade instead of ${h.mild_citronnades}. Two heat waves did it, late June and mid-August, with a peak at ${h.hottest} °C in Lyon.`,
  },
  {
    key: 'revenue_by_shop', icon: 'shop', title: 'Three shops, three temperaments', height: 460,
    text: () => 'Montmartre is the biggest and loses a part of its regulars in August. Croix-Rousse closes for three weeks in August, like a good Lyon bakery. Vieux-Port, the youngest, lives on tourists: its summer months are its best, and it keeps growing all year. Every shop peaks in January and December, thanks to the galette and the bûche.',
  },
];

const SQL_WORDS = /\b(SELECT|FROM|LEFT JOIN|CROSS JOIN|JOIN|WHERE|GROUP BY|ORDER BY|WITH|AS|ON|AND|IN|OVER|PARTITION BY|FILTER|LIMIT|ROUND|SUM|AVG|COUNT|COALESCE|FLOOR|EXTRACT|LPAD|INSERT INTO|RETURNING|TRUE)\b/g;
const highlight = (sql) => esc(sql)
  .replace(SQL_WORDS, '<span class="kw">$1</span>')
  .replace(/\{\{(\w+)\}\}/g, '<span class="var">{{$1}}</span>');

function receipt({ title, number, sql, lines = [] }) {
  return `<div class="receipt">
    <div class="receipt__head"><strong>LES TROIS FOURNILS</strong>${esc(title)}<br>${esc(number)}<br>${esc(parisTime())}</div>
    <hr class="receipt__rule">
    <pre>${highlight(sql)}</pre>
    <hr class="receipt__rule">
    ${lines.map(([k, v]) => `<div class="receipt__line"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
    <div class="receipt__barcode" aria-hidden="true"></div>
    <p class="receipt__thanks">Merci, à bientôt !</p>
  </div>`;
}

function emptyFrame() {
  const m = data.metabase;
  const why = {
    'not-configured': ['Metabase is not connected yet.', 'Set METABASE_SITE_URL, then run scripts/set-secrets.sh and restart the app.'],
    provisioning: ['Metabase is being set up.', 'The companion app is creating the questions through the Metabase API.'],
    waiting: ['Metabase is warming up.', 'A new add-on takes a few minutes to start. This page refreshes on its own.'],
  }[m.status] || ['Metabase is not ready.', ''];
  return `<div class="frame__empty"><div><strong>${why[0]}</strong>${why[1]}</div></div>`;
}

function mountFrame(container, embed, title, height) {
  if (!embed) { container.innerHTML = emptyFrame(); return null; }
  const iframe = document.createElement('iframe');
  iframe.title = title;
  iframe.loading = 'lazy';
  iframe.height = height;
  iframe.src = embed.url;
  container.replaceChildren(iframe);
  return iframe;
}

function renderStories() {
  const story = data.facts?.story;
  $('#stories').innerHTML = STORIES.map((s) => {
    const q = data.questions.find((x) => x.key === s.key);
    return `<article class="story" id="story-${s.key}">
      <div class="story__main">
        <div class="story__head"><span class="story__stamp">${icon(s.icon)}</span><h3>${s.title}</h3></div>
        <p class="story__text">${story ? s.text(story) : 'The numbers appear once the ledger is written.'}</p>
        <figure class="pinned"><span class="tape" aria-hidden="true"></span>
          <figcaption><strong>${esc(q.name)}</strong><span>${q.id ? `Metabase question #${q.id}` : ''}</span></figcaption>
          <div class="frame" data-frame="${s.key}"></div>
        </figure>
      </div>
      ${receipt({ title: q.name, number: q.id ? `Metabase question #${q.id}` : 'Metabase question', sql: q.sql, lines: [['Chart', q.display], ['Variable', '{{shop}}, optional'], ['Runs', 'on every view']] })}
    </article>`;
  }).join('');
  for (const s of STORIES) {
    const q = data.questions.find((x) => x.key === s.key);
    mountFrame(document.querySelector(`[data-frame="${s.key}"]`), q.embed, q.name, s.height);
  }
}

// Metabase embeds post the height of their content: grow the iframe to it,
// so the dashboard never scrolls inside the page.
window.addEventListener('message', (event) => {
  const frame = event.data?.metabase?.frame;
  if (!data.metabase.siteUrl || event.origin !== new URL(data.metabase.siteUrl).origin || !frame?.height) return;
  for (const iframe of document.querySelectorAll('iframe')) {
    if (iframe.contentWindow === event.source && frame.height > Number(iframe.height) + 4) iframe.height = Math.ceil(frame.height);
  }
});

// ------------------------------------------------------------------ the till

let tillFrame = null;

function renderTill() {
  const till = data.till;
  $('#till-shops').innerHTML = till.shops.map((s, i) => `<label><input type="radio" name="shop" value="${s.id}" ${i === 0 ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('');
  $('#till-products').innerHTML = till.products.map((p, i) => `<label><input type="radio" name="product" value="${p.id}" ${i === 1 ? 'checked' : ''}><span>${productIcon(p.name)}${esc(p.name)}<em>${eur2.format(p.price)}</em></span></label>`).join('');
  const q = data.questions.find((x) => x.key === 'till_live');
  $('#till-qid').textContent = q.id ? `Metabase question #${q.id}, reads till_tickets` : '';
  tillFrame = mountFrame($('#till-frame'), q.embed, q.name, 420);

  const units = $('#till-units');
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    units.value = Math.min(12, Math.max(1, Number(units.value || 1) + Number(b.dataset.step)));
  }));

  $('#till-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const key = event.target.querySelector('.till__key');
    const status = $('#till-status');
    key.disabled = true;
    status.textContent = 'Printing…';
    try {
      const res = await fetch('/api/till', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shop: form.get('shop'), product: form.get('product'), units: Number(form.get('units')) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const shop = till.shops.find((s) => String(s.id) === form.get('shop')).name;
      const product = till.products.find((p) => String(p.id) === form.get('product')).name;
      $('#till-receipt').innerHTML = receipt({
        title: `Ticket #${body.ticket.id}, ${shop}`,
        number: `${body.ticket.units} × ${product}`,
        sql: body.sql.replace('$1', body.params[0]).replace('$2', body.params[1]).replace(/\$3/g, body.params[2]),
        lines: [['Total', eur2.format(body.ticket.amount_eur)], ['Written to', 'PostgreSQL add-on']],
      });
      status.textContent = `Ticket #${body.ticket.id} is in PostgreSQL. Metabase is reading it again…`;
      await refreshTillFrame();
      status.textContent = `Ticket #${body.ticket.id} is in PostgreSQL, and on the Metabase question.`;
    } catch (err) {
      status.textContent = err.message;
    } finally {
      key.disabled = false;
    }
  });
}

async function refreshTillFrame() {
  if (!tillFrame) return;
  const res = await fetch('/api/embed?question=till_live');
  if (res.ok) tillFrame.src = (await res.json()).url; // a fresh token, so the iframe reloads
}

// ------------------------------------------------------------------ the ledger

let dashboardFrame = null;

function showToken(signed) {
  const until = new Date(signed.payload.exp * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  const payload = Object.entries(signed.payload).map(([k, v]) => `  "${k}": ${JSON.stringify(v).replace(/[{:,]/g, '$& ').replace(/}/g, ' }')}`).join(',\n');
  $('#token').innerHTML = `<p>Token signed by the companion app with the embedding secret (HS256), valid until ${until}. Its payload:</p><pre>${esc(`{\n${payload}\n}`)}</pre>`;
}

function renderLedger() {
  const tabs = [['all', 'All three shops'], ...data.till.shops.map((s) => [s.name, s.name])];
  $('#ledger-tabs').innerHTML = tabs.map(([v, label]) => `<button type="button" data-shop="${esc(v)}" aria-pressed="${v === 'all'}">${esc(label)}</button>`).join('');
  dashboardFrame = mountFrame($('#dashboard-frame'), data.dashboard, 'The Bakery Ledger dashboard', 1300);
  // Metabase lays the dashboard out on its 24-column grid above 752 px, in one column below.
  const fit = () => { if (dashboardFrame) dashboardFrame.height = dashboardFrame.clientWidth >= 752 ? 1300 : 2200; };
  fit();
  window.addEventListener('resize', fit);
  if (data.dashboard) showToken(data.dashboard);
  else $('#token').innerHTML = '<p>The signed token appears here once Metabase is ready.</p>';

  $('#ledger-tabs').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || !dashboardFrame) return;
    document.querySelectorAll('#ledger-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    const res = await fetch(`/api/embed?shop=${encodeURIComponent(button.dataset.shop)}`);
    if (!res.ok) return;
    const signed = await res.json();
    dashboardFrame.src = signed.url;
    showToken(signed);
  });
}

// ------------------------------------------------------------------ behind the counter + frame

function renderBehind() {
  const m = data.metabase;
  $('#log-when').textContent = m.provisionedAt ? `at boot, ${parisTime(new Date(m.provisionedAt))}` : `status: ${m.status}`;
  $('#log').innerHTML = m.log.length
    ? m.log.map((e) => `<li><span class="${e.status < 400 ? 'ok' : 'ko'}">${e.status}</span><span>${esc(e.method)}</span><span class="path">${esc(e.path)}</span><span class="ms">${e.ms} ms</span></li>`).join('')
    : `<li><span></span><span></span><span class="path">${esc(m.error || 'No call yet.')}</span></li>`;
  $('#mb-facts').innerHTML = [
    ['Metabase', m.version || '…'],
    ['Status', m.status],
    ['Data source', m.databaseId ? `database #${m.databaseId}` : '…'],
    ['Questions', m.questions || '…'],
    ['Dashboard', m.dashboardId ? `#${m.dashboardId}` : '…'],
    ['Bakery PostgreSQL', data.facts?.postgres?.split(' ')[0] || '…'],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  if (m.siteUrl) $('#mb-open').innerHTML = `<a href="${esc(m.siteUrl)}" target="_blank" rel="noopener">Open Metabase itself</a> (sign-in required: the admin account is created by the setup script).`;
  if (m.error && m.status !== 'ready') $('#mb-open').insertAdjacentHTML('beforeend', `<br>Last error: ${esc(m.error)}`);
  const pill = $('#stack-pill');
  pill.textContent = ['Node.js', data.facts?.postgres && `PostgreSQL ${data.facts.postgres.split(' ')[0]}`, m.version && `Metabase ${m.version}`].filter(Boolean).join(' · ');
}

function renderPlatform() {
  const p = data.platform;
  const rows = [
    ['Application', p.CC_APP_NAME], ['App ID', p.APP_ID], ['Instance', p.INSTANCE_NUMBER != null ? `#${p.INSTANCE_NUMBER}${p.CC_PRETTY_INSTANCE_NAME ? `, ${p.CC_PRETTY_INSTANCE_NAME}` : ''}` : null],
    ['Instance type', p.INSTANCE_TYPE], ['Commit', p.CC_COMMIT_ID], ['Deployment', p.CC_DEPLOYMENT_ID],
  ];
  $('#platform').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd class="${v ? '' : 'is-empty'}">${esc(v || 'set on Clever Cloud')}</dd></div>`).join('');
  if (!p.APP_ID) $('#platform-pill').innerHTML = '<span class="cc-dot cc-dot--muted"></span>Local run';
}

renderBoard();
renderShops();
renderStories();
renderTill();
renderLedger();
renderBehind();
renderPlatform();

// While Metabase starts, check every 20 s and reload once it is ready.
if (data.metabase.status !== 'ready' && data.metabase.status !== 'not-configured') {
  const timer = setInterval(async () => {
    const res = await fetch('/api/ledger').catch(() => null);
    const next = res && res.ok ? await res.json() : null;
    if (next?.metabase?.status === 'ready') { clearInterval(timer); window.location.reload(); }
  }, 20_000);
}
