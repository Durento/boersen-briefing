// Börsen-Briefing: liest briefing.json und history.json (von der GitHub Action) sowie depot.json, watchlist.json, ziel.json (von dir).
// Bitcoin wird zusätzlich live im Browser von CoinGecko nachgeladen (ohne Schlüssel).
'use strict';

const TZ = 'Europe/Berlin';
const ICONS = 'icons.svg';
const PAGE = { news: 12, welt: 10, calDays: 7 };

const state = {
  data: null, history: {}, depot: { positionen: [] }, watch: { long: [], short: [] }, ziel: null,
  newsFilter: load('newsFilter', 'alle'), weltFilter: load('weltFilter', 'alle'),
  calFilter: load('calFilter', 'wichtig'), watchSide: load('watchSide', 'long'),
  newsShown: PAGE.news, weltShown: PAGE.welt, calDays: PAGE.calDays,
  lastSeen: load('lastSeen', null),
};

// ---------- Hilfen ----------

function load(k, d) { try { const v = localStorage.getItem(k); return v ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* privat */ } }

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="${ICONS}#i-${id}"></use></svg>`;
const MINUS = '−';

const nf = new Map();
function fmt(n, digits = 2, opts = {}) {
  if (n == null || !Number.isFinite(n)) return 'n. v.';
  const key = `${digits}|${JSON.stringify(opts)}`;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits, ...opts }));
  return nf.get(key).format(n).replace('-', MINUS);
}
const signed = (n, digits = 2) => (n == null || !Number.isFinite(n) ? 'n. v.' : (n > 0 ? '+' : '') + fmt(n, digits));
const dir = (n) => (n == null || Math.abs(n) < 0.005 ? 'flat' : n > 0 ? 'up' : 'down');

function chg(dp, { digits = 2, suffix = ' %', value } = {}) {
  const d = dir(dp);
  const ic = d === 'up' ? icon('arrow-up-right') : d === 'down' ? icon('arrow-down-right') : '';
  const label = d === 'up' ? 'gestiegen' : d === 'down' ? 'gefallen' : 'unverändert';
  return `<span class="chg ${d}"><span class="sr">${label}</span>${ic}${value ?? signed(dp, digits) + suffix}</span>`;
}

const dtf = (o) => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, ...o });
const fTime = dtf({ hour: '2-digit', minute: '2-digit' });
const fDay = dtf({ weekday: 'short', day: 'numeric', month: 'short' });
const fDayLong = dtf({ weekday: 'long', day: 'numeric', month: 'long' });
const fDate = dtf({ day: '2-digit', month: '2-digit', year: 'numeric' });
const fShort = dtf({ day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dayKey = (d) => dtf({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function ago(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (dayKey(d) === dayKey(new Date())) return `${fTime.format(d)} Uhr`;
  const yest = new Date(Date.now() - 86400000);
  if (dayKey(d) === dayKey(yest)) return `gestern, ${fTime.format(d)} Uhr`;
  return `${fShort.format(d)} Uhr`;
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ---------- Ticker ----------

const DIGITS = { eurusd: 4, btc: 0, us10y: 2 };

function priceText(t) {
  if (t.price == null) return 'n. v.';
  if (t.id === 'us10y') return `${fmt(t.price, 2)} %`;
  if (t.id === 'eurusd') return fmt(t.price, 4);
  if (t.id === 'btc') return `${fmt(t.price, 0)} $`;
  if (t.id === 'dax') return fmt(t.price, t.proxy ? 2 : 0);
  if (t.proxy) return `${fmt(t.price, 2)} $`;
  return `${fmt(t.price, 2)} ${t.currency === 'EUR' ? '€' : '$'}`;
}

function tickerChange(t) {
  if (t.id === 'us10y') {
    const bp = t.change != null ? t.change * 100 : null;
    return chg(bp, { value: bp == null ? 'n. v.' : `${signed(bp, 0)} Bp` });
  }
  return chg(t.dp);
}

function tickerSub(t) {
  if (t.sub) return `${esc(t.sub.name)} ${fmt(t.sub.price, 2)}`;
  if (t.proxy) return `via ${esc(t.proxy)}`;
  if (t.id === 'us10y') return 'Vortag';
  if (t.id === 'btc') return '24 Std.';
  return '';
}

function renderTicker(prev = {}) {
  const list = state.data?.ticker || [];
  if (!list.length) {
    $('#ticker').innerHTML = `<li class="empty">${icon('warning-circle')}Noch keine Kursdaten. Die GitHub Action füllt sie beim nächsten Lauf.</li>`;
    return;
  }
  $('#ticker').innerHTML = list.map((t) => `
    <li class="tile" data-id="${esc(t.id)}">
      <button type="button" data-open="t:${esc(t.id)}" aria-label="${esc(t.name)}: Details">
        <span class="tile-name">${esc(t.name)}${t.stale ? icon('warning-circle', 'ic stale-ic') : ''}</span>
        <span class="tile-price">${priceText(t)}</span>
        <span class="tile-foot">${tickerChange(t)}<span class="tile-sub">${tickerSub(t)}</span></span>
      </button>
    </li>`).join('');
  for (const t of list) {
    const p = prev[t.id];
    if (p != null && t.price != null && p !== t.price) flash(t.id, t.price > p);
  }
}

function flash(id, up) {
  const el = document.querySelector(`.tile[data-id="${id}"]`);
  if (!el) return;
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(up ? 'flash-up' : 'flash-down');
}

// ---------- Depot & Ziel ----------

function eurusd() {
  return state.data?.ticker?.find((t) => t.id === 'eurusd')?.price || null;
}

function depotTotals() {
  const fx = eurusd();
  let usd = 0, cost = 0, day = 0, complete = true, priced = 0;
  for (const p of state.depot.positionen) {
    const q = state.data?.quotes?.[p.symbol];
    if (!q?.price) { complete = false; continue; }
    priced++;
    usd += q.price * p.stueck;
    cost += p.einstieg * p.stueck;
    day += (q.change ?? 0) * p.stueck;
  }
  return { usd, cost, day, eur: fx && priced ? usd / fx : null, fx, complete, priced };
}

function renderDepot() {
  const body = $('#depot-body');
  const pos = state.depot.positionen || [];
  if (!pos.length) {
    body.innerHTML = `<p class="empty">${icon('info')}Noch keine Positionen. Trage sie in <code>depot.json</code> ein.</p>`;
    return;
  }
  const t = depotTotals();
  if (!t.priced) {
    body.innerHTML = `<p class="error-note">${icon('warning-circle')}Noch keine Kurse für dein Depot. Sie erscheinen nach dem ersten Lauf der GitHub Action mit Finnhub-Schlüssel.</p>`;
    return;
  }
  const pl = t.usd - t.cost;
  const plPct = t.cost ? (pl / t.cost) * 100 : null;
  const plEur = t.fx ? pl / t.fx : null;
  const rows = pos.map((p) => {
    const q = state.data?.quotes?.[p.symbol];
    const ppl = q?.price ? (q.price - p.einstieg) * p.stueck : null;
    const pplPct = q?.price ? ((q.price - p.einstieg) / p.einstieg) * 100 : null;
    return `<li><button class="row" type="button" data-open="q:${esc(p.symbol)}">
      <span class="row-main"><span class="row-sym" translate="no">${esc(p.symbol)}</span><span class="row-name">${esc(p.name || '')}</span></span>
      <span class="row-price">${q?.price ? fmt(q.price) + ' $' : 'n. v.'}${q?.stale ? icon('warning-circle', 'ic stale-ic') : ''}</span>
      <span class="row-note">${fmt(p.stueck, 0)} Stk. zu ${fmt(p.einstieg)} $</span>
      <span class="row-right">${ppl != null ? `<span class="pl ${dir(ppl)}">${signed(ppl)} $ (${signed(pplPct)} %)</span>` : ''}</span>
    </button></li>`;
  }).join('');
  body.innerHTML = `
    <div class="depot-total">
      <span class="depot-eur">${t.eur != null ? fmt(t.eur) + ' €' : 'n. v.'}</span>
      <span class="depot-line">
        <span><span class="num">${fmt(t.usd)} $</span></span>
        <span>G/V <span class="pl ${dir(pl)}">${signed(plEur)} € (${signed(plPct)} %)</span></span>
        <span>Heute <span class="pl ${dir(t.day)}">${signed(t.day)} $</span></span>
      </span>
    </div>
    <ul class="rows">${rows}</ul>`;
}

function renderGoal() {
  const z = state.ziel;
  if (!z) return;
  $('#goal-title').textContent = z.satz;
  const t = depotTotals();
  const have = (t.eur || 0) + (z.weiteresVermoegenEUR || 0);
  const pct = Math.max(0, Math.min(100, (have / z.betragEUR) * 100));
  const end = new Date(`${z.datum}T23:59:59`);
  const days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
  const months = Math.max(1, days / 30.44);
  const need = Math.max(0, z.betragEUR - have);
  $('#goal-fill').style.width = `${pct}%`;
  $('.goal-bar').setAttribute('aria-valuenow', pct.toFixed(1));
  $('#goal-meta').innerHTML = `
    <span>Stand <strong>${fmt(have, 0)}</strong> € (${fmt(pct, pct < 1 ? 2 : 1)} %)</span>
    <span>Noch <strong>${fmt(days, 0)}</strong> Tage</span>
    <span>Nötig <strong>${fmt(need / months, 0)}</strong> € pro Monat</span>`;
}

// ---------- Beobachtungsliste ----------

function renderWatch() {
  const side = state.watchSide;
  document.querySelectorAll('#watch .segmented button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.side === side)));
  const items = state.watch[side] || [];
  if (!items.length) {
    $('#watch-list').innerHTML = `<li class="empty">${icon('info')}Keine Einträge auf der ${side === 'long' ? 'Long' : 'Short'}-Seite. Ergänze sie in <code>watchlist.json</code>.</li>`;
    return;
  }
  $('#watch-list').innerHTML = items.map((w) => {
    const q = state.data?.quotes?.[w.symbol];
    return `<li><button class="row" type="button" data-open="q:${esc(w.symbol)}">
      <span class="row-main"><span class="row-sym" translate="no">${esc(w.symbol)}</span><span class="row-name">${esc(w.name || '')}</span></span>
      <span class="row-price">${q?.price ? fmt(q.price) + ' $' : 'n. v.'}${q?.stale ? icon('warning-circle', 'ic stale-ic') : ''}</span>
      <span class="row-note">${esc(w.notiz || '')}</span>
      <span class="row-right">${q ? chg(q.dp) : ''}</span>
    </button></li>`;
  }).join('');
}

// ---------- Nachrichten ----------

const NEWS_CATS = [['alle', 'Alle'], ['maerkte', 'Märkte'], ['tech', 'Tech & Halbleiter'], ['unternehmen', 'Unternehmen']];
const WELT_CATS = [['alle', 'Alle'], ['konflikte', 'Konflikte'], ['rohstoffe', 'Rohstoffe'], ['notenbanken', 'Notenbanken']];
const TAG_LABEL = { maerkte: 'Märkte', tech: 'Tech', unternehmen: 'Unternehmen', konflikte: 'Konflikte', rohstoffe: 'Rohstoffe', notenbanken: 'Notenbanken' };

function renderChips(el, cats, items, active, key) {
  el.innerHTML = cats.map(([id, label]) => {
    const n = id === 'alle' ? items.length : items.filter((i) => i.tags?.includes(id)).length;
    return `<button type="button" class="chip" data-filter="${key}" data-value="${id}" aria-pressed="${id === active}">${label}<span class="count">${n}</span></button>`;
  }).join('');
}

function renderFeed({ listEl, moreEl, items, filter, shown, ownTags }) {
  const list = filter === 'alle' ? items : items.filter((i) => i.tags?.includes(filter));
  if (!list.length) {
    listEl.innerHTML = `<li class="empty">${icon('info')}Gerade keine Meldungen in dieser Kategorie.</li>`;
    moreEl.hidden = true;
    return;
  }
  const seen = state.lastSeen ? Date.parse(state.lastSeen) : null;
  listEl.innerHTML = list.slice(0, shown).map((n) => {
    const isNew = seen && n.ts && Date.parse(n.ts) > seen;
    const tags = (n.tags || []).filter((t) => ownTags.includes(t) && t !== filter).slice(0, 2).map((t) => `<span class="tag">${TAG_LABEL[t]}</span>`).join('');
    return `<li class="${isNew ? 'is-new' : ''}"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">
      <span class="feed-title">${esc(n.t)}</span>
      <span class="feed-meta"><span class="src">${esc(n.src)}${n.symbol ? ` (${esc(n.symbol)})` : ''}</span><time datetime="${esc(n.ts || '')}">${ago(n.ts)}</time>${tags}</span>
    </a></li>`;
  }).join('');
  moreEl.hidden = list.length <= shown;
  moreEl.textContent = `Mehr anzeigen (${list.length - shown})`;
}

function renderNews() {
  const items = state.data?.news || [];
  renderChips($('#news-chips'), NEWS_CATS, items, state.newsFilter, 'news');
  renderFeed({ listEl: $('#news-list'), moreEl: $('#news-more'), items, filter: state.newsFilter, shown: state.newsShown, ownTags: ['maerkte', 'tech', 'unternehmen'] });
}

function renderWelt() {
  const items = state.data?.welt || [];
  renderChips($('#welt-chips'), WELT_CATS, items, state.weltFilter, 'welt');
  renderFeed({ listEl: $('#welt-list'), moreEl: $('#welt-more'), items, filter: state.weltFilter, shown: state.weltShown, ownTags: ['konflikte', 'rohstoffe', 'notenbanken'] });
}

// ---------- Kalender ----------

const CAL_CATS = [['wichtig', 'Wichtig'], ['hoch', 'Nur hoch'], ['alle', 'Alle'], ['quartal', 'Quartalszahlen']];

function calItems() {
  const all = state.data?.kalender || [];
  const f = state.calFilter;
  if (f === 'hoch') return all.filter((k) => k.wichtigkeit === 'hoch');
  if (f === 'wichtig') return all.filter((k) => k.wichtigkeit !== 'niedrig');
  if (f === 'quartal') return all.filter((k) => k.art === 'quartalszahlen');
  return all;
}

function renderCalendar() {
  const all = state.data?.kalender || [];
  $('#cal-chips').innerHTML = CAL_CATS.map(([id, label]) =>
    `<button type="button" class="chip" data-filter="cal" data-value="${id}" aria-pressed="${id === state.calFilter}">${label}</button>`).join('');

  const next = all.find((k) => k.wichtigkeit === 'hoch' && Date.parse(k.zeit) > Date.now() && !k.ganztags);
  $('#cal-next').textContent = next ? `Nächster wichtiger Termin ${relFuture(next.zeit)}` : '';

  const todayKey = dayKey(new Date());
  const items = calItems().filter((k) => dayKey(new Date(k.zeit)) >= todayKey || Date.parse(k.zeit) > Date.now() - 86400000 && dayKey(new Date(k.zeit)) === todayKey);
  const groups = new Map();
  for (const k of items) {
    const key = dayKey(new Date(k.zeit));
    if (key < todayKey) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(k);
  }
  const keys = [...groups.keys()];
  if (!keys.length) {
    $('#cal-list').innerHTML = `<p class="empty">${icon('info')}Keine Termine für diesen Filter.</p>`;
    $('#cal-more').hidden = true;
    return;
  }
  const tomorrowKey = dayKey(new Date(Date.now() + 86400000));
  $('#cal-list').innerHTML = keys.slice(0, state.calDays).map((key) => {
    const list = groups.get(key);
    const d = new Date(list[0].zeit);
    const label = key === todayKey ? `Heute, ${fDayLong.format(d)}` : key === tomorrowKey ? `Morgen, ${fDayLong.format(d)}` : fDayLong.format(d);
    return `<div class="cal-day"><h3 class="cal-date ${key === todayKey ? 'is-today' : ''}">${label}</h3>
      ${list.map((k) => {
        const past = !k.ganztags && Date.parse(k.zeit) < Date.now() - 30 * 60000;
        const meta = [k.land, k.hinweis, k.prognose ? `Prognose ${deNum(k.prognose)}` : null, k.vorher ? `zuvor ${deNum(k.vorher)}` : null].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('');
        return `<div class="cal-row ${past ? 'is-past' : ''}">
          <span class="cal-time ${k.ganztags ? 'allday' : ''}">${k.ganztags ? 'ganztags' : fTime.format(new Date(k.zeit))}</span>
          <div><p class="cal-title" ${k.original && k.original !== k.titel ? `title="${esc(k.original)}"` : ''}>${esc(k.titel)}</p><p class="cal-meta">${meta}</p></div>
          <span class="imp imp-${esc(k.wichtigkeit)}">${esc(k.wichtigkeit)}</span>
        </div>`;
      }).join('')}</div>`;
  }).join('');
  $('#cal-more').hidden = keys.length <= state.calDays;
}

const deNum = (v) => String(v).replace(/(\d)\.(\d)/g, '$1,$2');

function relFuture(iso) {
  const min = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (min < 60) return `in ${min} Min.`;
  if (min < 24 * 60) return `in ${Math.round(min / 60)} Std.`;
  return `am ${fDay.format(new Date(iso))}, ${fTime.format(new Date(iso))} Uhr`;
}

// ---------- Stand & Quellen ----------

function renderStand() {
  const g = state.data?.generatedAt;
  const el = $('#stand');
  if (!g) { el.querySelector('span').textContent = 'Keine Daten'; return; }
  const age = (Date.now() - Date.parse(g)) / 60000;
  el.classList.toggle('is-old', age > 120);
  const d = new Date(g);
  const sameDay = dayKey(d) === dayKey(new Date());
  el.querySelector('span').textContent = `Stand ${sameDay ? '' : fDate.format(d) + ', '}${fTime.format(d)} Uhr${age > 120 ? ' (veraltet)' : ''}`;
  el.title = `Zuletzt aktualisiert: ${fDate.format(d)} ${fTime.format(d)} Uhr (Europe/Berlin)`;

  const q = state.data?.quellen || {};
  $('#sources-list').innerHTML = Object.entries(q).sort(([a], [b]) => a.localeCompare(b, 'de')).map(([name, s]) =>
    `<li><span class="${s.ok ? 'ok' : 'fail'}">${s.ok ? 'OK' : 'Ausfall'}</span><span>${esc(name)}${s.ok ? '' : `: ${esc(s.fehler || '')}`}</span></li>`).join('');
}

// ---------- Detail-Sheet ----------

function sparkline(points) {
  if (!points || points.length < 2) return `<p class="spark-note">Verlauf erscheint, sobald die Action mehrere Kurse gesammelt hat.</p>`;
  const w = 520, h = 120, pad = 6;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (x) => pad + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * pad);
  const sy = (y) => h - pad - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
  const up = ys.at(-1) >= ys[0];
  const color = up ? 'var(--up)' : 'var(--down)';
  const from = new Date(x0 * 1000), to = new Date(x1 * 1000);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Kursverlauf von ${fShort.format(from)} bis ${fShort.format(to)} Uhr">
      <path d="${d}L${sx(x1)},${h}L${sx(x0)},${h}Z" fill="${color}" opacity=".10"></path>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"></path>
    </svg>
    <p class="spark-note">Verlauf seit ${fShort.format(from)} Uhr, ${points.length} Messpunkte</p>`;
}

function stat(label, value) { return `<div><dt>${label}</dt><dd>${value}</dd></div>`; }

const SRC_LABEL = { finnhub: 'Finnhub', twelve: 'Twelve Data', coingecko: 'CoinGecko', treasury: 'U.S. Treasury' };

function openSheet(key) {
  const [kind, id] = key.split(':');
  let title, price, change, stats = '', hint = '', hist;
  if (kind === 't') {
    const t = state.data.ticker.find((x) => x.id === id);
    if (!t) return;
    title = t.name;
    price = priceText(t);
    change = `${tickerChange(t)}<span class="spark-note">${t.change != null && t.id !== 'us10y' ? signed(t.change, DIGITS[t.id] ?? 2) + ' heute' : ''}</span>`;
    hist = state.history[t.id];
    stats = [
      t.prev != null ? stat('Vortag', fmt(t.prev, DIGITS[t.id] ?? 2)) : '',
      t.high != null ? stat('Tageshoch', fmt(t.high, DIGITS[t.id] ?? 2)) : '',
      t.low != null ? stat('Tagestief', fmt(t.low, DIGITS[t.id] ?? 2)) : '',
      t.sub ? stat(`${esc(t.sub.name)}`, `${fmt(t.sub.price)} (${signed(t.sub.dp)} %)`) : '',
      stat('Quelle', SRC_LABEL[t.src] || esc(t.src || '')),
      stat('Kurszeit', t.asOf ? `${fShort.format(new Date(t.asOf))} Uhr` : 'n. v.'),
    ].join('');
    if (t.proxy) hint = `Abgebildet über den ETF ${esc(t.proxy)}. Der Kurs ist der ETF-Preis, die Tagesveränderung entspricht fast genau dem Index.`;
    if (t.id === 'us10y') hint = 'Tageswert der 10-jährigen US-Staatsanleihe vom U.S. Treasury, Veränderung in Basispunkten zum Vortag.';
    if (t.id === 'btc') hint = 'Bitcoin wird alle 60 Sekunden live von CoinGecko nachgeladen. Veränderung über 24 Stunden.';
    if (t.stale) hint = `Die Quelle hat zuletzt nicht geantwortet. Angezeigt wird der letzte bekannte Wert. ${hint}`;
  } else {
    const q = state.data?.quotes?.[id];
    const meta = [...state.depot.positionen, ...state.watch.long, ...state.watch.short].find((x) => x.symbol === id) || {};
    title = `${id}${meta.name ? ' · ' + meta.name : ''}`;
    price = q?.price ? `${fmt(q.price)} $` : 'n. v.';
    change = q ? `${chg(q.dp)}<span class="spark-note">${signed(q.change)} $ heute</span>` : '';
    hist = state.history[`q:${id}`];
    const pos = state.depot.positionen.find((p) => p.symbol === id);
    stats = [
      q?.prev != null ? stat('Vortag', fmt(q.prev)) : '',
      q?.high != null ? stat('Tageshoch', fmt(q.high)) : '',
      q?.low != null ? stat('Tagestief', fmt(q.low)) : '',
      pos ? stat('Stück', fmt(pos.stueck, 0)) : '',
      pos ? stat('Einstieg', `${fmt(pos.einstieg)} $`) : '',
      pos && q?.price ? stat('Wert', `${fmt(q.price * pos.stueck)} $`) : '',
      q?.asOf ? stat('Kurszeit', `${fShort.format(new Date(q.asOf))} Uhr`) : '',
    ].join('');
    if (meta.notiz) hint = esc(meta.notiz);
  }
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = `
    <p class="sheet-price">${price}</p>
    <div class="sheet-chg">${change}</div>
    ${sparkline(hist)}
    <dl class="stats">${stats}</dl>
    ${hint ? `<p class="sheet-hint">${icon('info')}<span>${hint}</span></p>` : ''}`;
  const dlg = $('#sheet');
  if (!dlg.open) dlg.showModal();
}

// ---------- Theme ----------

const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'System', light: 'Hell', dark: 'Dunkel' };
const THEME_ICON = { auto: 'monitor', light: 'sun', dark: 'moon' };

function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const btn = $('#theme');
  btn.innerHTML = icon(THEME_ICON[t]);
  btn.setAttribute('aria-label', `Darstellung: ${THEME_LABEL[t]}. Tippen zum Wechseln`);
  btn.title = `Darstellung: ${THEME_LABEL[t]}`;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (t === 'auto') m.content = m.media.includes('dark') ? '#0c0d10' : '#f3f4f6';
    else m.content = dark ? '#0c0d10' : '#f3f4f6';
  });
}

// ---------- Laden ----------

async function loadAll({ manual = false } = {}) {
  const btn = $('#refresh');
  btn.classList.add('is-spinning');
  const prevPrices = Object.fromEntries((state.data?.ticker || []).map((t) => [t.id, t.price]));
  const results = await Promise.allSettled([
    getJson('briefing.json'), getJson('history.json'),
    getJson('depot.json'), getJson('watchlist.json'), getJson('ziel.json'),
  ]);
  const [b, h, d, w, z] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
  if (b) state.data = b;
  if (h) state.history = h;
  if (d) state.depot = d;
  if (w) state.watch = w;
  if (z) state.ziel = z;
  btn.classList.remove('is-spinning');

  if (!state.data) {
    const msg = `<p class="error-note">${icon('warning-circle')}Die Daten konnten nicht geladen werden. Prüfe die Verbindung und tippe oben auf Aktualisieren.</p>`;
    ['#depot-body', '#cal-list'].forEach((s) => ($(s).innerHTML = msg));
    $('#news-list').innerHTML = $('#welt-list').innerHTML = `<li>${msg}</li>`;
    $('#stand span').textContent = 'Offline';
    return;
  }
  renderAll(prevPrices);
  liveBitcoin();
  if (manual) $('#stand span').textContent += ' (neu geladen)';
}

function renderAll(prevPrices) {
  renderTicker(prevPrices);
  renderDepot();
  renderGoal();
  renderWatch();
  renderNews();
  renderWelt();
  renderCalendar();
  renderStand();
}

async function liveBitcoin() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
    if (!r.ok) return;
    const j = await r.json();
    const t = state.data?.ticker?.find((x) => x.id === 'btc');
    if (!t || !j?.bitcoin?.usd) return;
    const old = t.price;
    t.price = j.bitcoin.usd;
    t.dp = j.bitcoin.usd_24h_change;
    t.prev = t.price / (1 + t.dp / 100);
    t.change = t.price - t.prev;
    t.asOf = new Date().toISOString();
    t.stale = false;
    const el = document.querySelector('.tile[data-id="btc"] button');
    if (el) {
      el.querySelector('.tile-price').textContent = priceText(t);
      el.querySelector('.tile-foot').innerHTML = `${tickerChange(t)}<span class="tile-sub">${tickerSub(t)}</span>`;
      el.querySelector('.stale-ic')?.remove();
      if (old !== t.price) flash('btc', t.price > old);
    }
  } catch { /* offline: letzter Wert bleibt */ }
}

// ---------- Ereignisse ----------

document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) { openSheet(open.dataset.open); return; }

  const chip = e.target.closest('[data-filter]');
  if (chip) {
    const { filter, value } = chip.dataset;
    if (filter === 'news') { state.newsFilter = value; state.newsShown = PAGE.news; save('newsFilter', value); renderNews(); }
    if (filter === 'welt') { state.weltFilter = value; state.weltShown = PAGE.welt; save('weltFilter', value); renderWelt(); }
    if (filter === 'cal') { state.calFilter = value; state.calDays = PAGE.calDays; save('calFilter', value); renderCalendar(); }
    return;
  }

  const seg = e.target.closest('.segmented button');
  if (seg) { state.watchSide = seg.dataset.side; save('watchSide', seg.dataset.side); renderWatch(); }
});

$('#news-more').addEventListener('click', () => { state.newsShown += PAGE.news; renderNews(); });
$('#welt-more').addEventListener('click', () => { state.weltShown += PAGE.welt; renderWelt(); });
$('#cal-more').addEventListener('click', () => { state.calDays += PAGE.calDays; renderCalendar(); });
$('#refresh').addEventListener('click', () => loadAll({ manual: true }));
$('#sheet-close').addEventListener('click', () => $('#sheet').close());
$('#sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

let theme = load('theme', 'auto');
applyTheme(theme);
$('#theme').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  save('theme', theme);
  applyTheme(theme);
});

// Pfeiltasten im Long/Short-Umschalter
$('#watch .segmented').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  state.watchSide = state.watchSide === 'long' ? 'short' : 'long';
  save('watchSide', state.watchSide);
  renderWatch();
  $(`#watch .segmented [data-side="${state.watchSide}"]`).focus();
});

// Aktiver Bereich in der Tab-Leiste
const tabs = [...document.querySelectorAll('.tabbar a')];
let atTop = true;
let current = 'top';
const setTab = () => tabs.forEach((t) => t.setAttribute('aria-current', String(t.dataset.target === (atTop ? 'top' : current))));
new IntersectionObserver(([en]) => { atTop = en.isIntersecting; setTab(); }).observe(document.getElementById('ziel'));
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (en.isIntersecting) current = en.target.id === 'watch' ? 'depot' : en.target.id;
  }
  setTab();
}, { rootMargin: '-45% 0px -50% 0px' });
['depot', 'watch', 'news', 'welt', 'kalender'].forEach((id) => io.observe(document.getElementById(id)));
tabs.forEach((t) => t.addEventListener('click', (e) => {
  if (t.dataset.target === 'top') { e.preventDefault(); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
}));

// Beim Verlassen merken, was schon gesehen wurde (für die "Neu"-Markierung)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.data?.generatedAt) save('lastSeen', new Date().toISOString());
  if (document.visibilityState === 'visible') loadAll();
});

loadAll();
setInterval(() => { if (document.visibilityState === 'visible') loadAll(); }, 5 * 60 * 1000);
setInterval(() => { if (document.visibilityState === 'visible') liveBitcoin(); }, 60 * 1000);
setInterval(() => { if (state.data) { renderStand(); renderCalendar(); } }, 60 * 1000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
