// Holt Kurse, Nachrichten und Termine und schreibt sie nach briefing.json.
// Läuft in der GitHub Action (Node 20+, keine Abhängigkeiten).
// Fällt eine Quelle aus, bleiben die letzten Werte erhalten und werden als veraltet markiert.

import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const file = (p) => new URL(p, root);

const FINNHUB_KEY = process.env.FINNHUB_KEY || '';
const TWELVE_KEY = process.env.TWELVEDATA_KEY || '';
const UA = 'Mozilla/5.0 (compatible; BoersenBriefing/1.0; persoenliches Dashboard)';
const HISTORY_POINTS = 120;

const quellen = {};
const markOk = (name) => (quellen[name] = { ok: true, at: new Date().toISOString() });
const markFail = (name, err) => {
  quellen[name] = { ok: false, at: new Date().toISOString(), fehler: String(err?.message || err).slice(0, 160) };
  console.warn(`[${name}] ${quellen[name].fehler}`);
};

// ---------- Hilfsfunktionen ----------

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(file(path), 'utf8'));
  } catch {
    return fallback;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, { timeout = 15000, retries = 1, headers = {} } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries) await sleep(1500);
    }
  }
  throw lastErr;
}

const getJson = async (url, opts) => (await request(url, opts)).json();
const getText = async (url, opts) => (await request(url, opts)).text();

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Wandelt eine Wanduhrzeit in einer Zeitzone (z. B. 16:05 in New York) in UTC um.
function zonedToUtc(dateStr, timeStr, tz) {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(guess).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

// ---------- Kurse ----------

async function finnhubQuote(symbol) {
  if (!FINNHUB_KEY) throw new Error('FINNHUB_KEY fehlt');
  const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
  if (!q || !num(q.c)) throw new Error(`keine Daten für ${symbol}`);
  return {
    price: num(q.c), change: num(q.d), dp: num(q.dp), high: num(q.h), low: num(q.l), prev: num(q.pc),
    asOf: q.t ? new Date(q.t * 1000).toISOString() : new Date().toISOString(), currency: 'USD',
  };
}

async function twelveQuotes(symbols) {
  if (!TWELVE_KEY) throw new Error('TWELVEDATA_KEY fehlt');
  const url = `https://api.twelvedata.com/quote?symbol=${symbols.map(encodeURIComponent).join(',')}&apikey=${TWELVE_KEY}`;
  const data = await getJson(url);
  const bySymbol = symbols.length === 1 ? { [symbols[0]]: data } : data;
  const out = {};
  for (const s of symbols) {
    const q = bySymbol?.[s];
    if (!q || q.status === 'error' || q.code) {
      out[s] = { error: q?.message || 'keine Daten' };
      continue;
    }
    out[s] = {
      price: num(q.close), change: num(q.change), dp: num(q.percent_change),
      high: num(q.high), low: num(q.low), prev: num(q.previous_close),
      asOf: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : new Date().toISOString(),
      currency: q.currency || null,
    };
  }
  return out;
}

async function coingeckoBtc() {
  const d = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true');
  const b = d?.bitcoin;
  if (!num(b?.usd)) throw new Error('keine BTC-Daten');
  const dp = num(b.usd_24h_change);
  const prev = dp != null ? b.usd / (1 + dp / 100) : null;
  return {
    price: b.usd, dp, change: prev != null ? b.usd - prev : null, prev, high: null, low: null,
    asOf: new Date((b.last_updated_at || Date.now() / 1000) * 1000).toISOString(), currency: 'USD',
  };
}

async function frankfurterEurUsd() {
  const from = isoDay(addDays(new Date(), -10));
  const d = await getJson(`https://api.frankfurter.dev/v1/${from}..?base=EUR&symbols=USD`);
  const days = Object.keys(d?.rates || {}).sort();
  if (days.length < 1) throw new Error('keine EZB-Kurse');
  const last = d.rates[days.at(-1)].USD;
  const prev = days.length > 1 ? d.rates[days.at(-2)].USD : null;
  return {
    price: last, prev, change: prev ? last - prev : null, dp: prev ? ((last - prev) / prev) * 100 : null,
    high: null, low: null, asOf: new Date(`${days.at(-1)}T14:00:00Z`).toISOString(), currency: 'USD',
  };
}

async function treasury10y() {
  const year = new Date().getUTCFullYear();
  const load = async (y) => {
    const csv = await getText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`);
    const lines = csv.trim().split(/\r?\n/);
    const head = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
    const col = head.indexOf('10 Yr');
    if (col < 0) throw new Error('Spalte 10 Yr fehlt');
    return lines.slice(1).map((l) => {
      const c = l.split(',');
      const [m, dd, yy] = c[0].split('/');
      return { date: `${yy}-${m}-${dd}`, v: num(c[col]) };
    }).filter((r) => r.v != null);
  };
  let rows = await load(year);
  if (rows.length < 2) rows = rows.concat(await load(year - 1));
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  const [cur, prev] = rows;
  return {
    price: cur.v, prev: prev?.v ?? null, change: prev ? cur.v - prev.v : null,
    dp: prev ? ((cur.v - prev.v) / prev.v) * 100 : null, high: null, low: null,
    asOf: new Date(`${cur.date}T21:00:00Z`).toISOString(), currency: null,
  };
}

// ---------- RSS ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '-', mdash: '-', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };

function clean(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  for (const b of blocks) {
    const tag = (n) => b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`))?.[1];
    const title = clean(tag('title'));
    let link = clean(tag('link') || '');
    if (!link) link = b.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
    if (!link) link = clean(tag('guid') || '');
    const date = clean(tag('pubDate') || tag('dc:date') || tag('updated') || tag('published') || '');
    const ts = date ? Date.parse(date) : NaN;
    if (title && /^https?:\/\//.test(link)) items.push({ t: title, url: link, ts: Number.isFinite(ts) ? new Date(ts).toISOString() : null });
  }
  return items;
}

const RE = {
  tech: /\b(chip|chips|semiconductor|halbleiter|nvidia|amd|intel|tsmc|asml|broadcom|micron|qualcomm|arm holdings|infineon|samsung|sk hynix|ki\b|künstliche intelligenz|\bai\b|openai|anthropic|apple|microsoft|alphabet|google|meta\b|amazon|tesla|software|cloud|rechenzentr|data center|tech)/i,
  unternehmen: /(earnings|quartal|übernahme|acquir|merger|fusion|\bceo\b|umsatz|gewinnwarnung|guidance|\bipo\b|börsengang|stellenabbau|layoff|dividend|aktienrückkauf|buyback|revenue|profit)/i,
  konflikte: /(krieg|\bwar\b|angriff|attack|militär|military|missile|rakete|drohne|drone|gaza|ukrain|russ|israel|iran|hamas|hisbollah|hezbollah|truppen|troops|airstrike|luftangriff|ceasefire|waffenruhe|konflikt|conflict|\bnato\b)/i,
  rohstoffe: /(\böl\b|ölpreis|\boil\b|crude|opec|erdgas|\bgas\b|\blng\b|gold|kupfer|copper|rohstoff|commodit|brent|weizen|wheat|lithium|seltene erden|rare earth)/i,
  geo: /(sanktion|sanction|\bzoll|zölle|tariff|\bwahl|election|regierung|government|präsident|president|minister|kanzler|gipfel|summit|diplomat|\beu\b|\bnato\b|china|peking|beijing|washington|moskau|moscow|kreml|kremlin|handel|\btrade\b|export|import|grenze|border|flüchtling|refugee|botschaft|embassy|\bun\b|vereinte nationen|united nations|\bg7\b|\bg20\b|brics|taiwan|korea|indien|\bindia\b|venezuela|syrien|syria|libanon|lebanon|türkei|turkey|sudan|jemen|yemen|opec|parlament|parliament|protest|putsch|\bcoup\b)/i,
  notenbanken: /(\bfed\b|federal reserve|fomc|\bezb\b|\becb\b|leitzins|zinsentscheid|zinssenkung|zinserhöhung|rate cut|rate hike|interest rate|notenbank|zentralbank|central bank|lagarde|powell|bank of japan|\bboj\b|bank of england|bundesbank|inflation)/i,
};

const NEWS_FEEDS = [
  { name: 'tagesschau', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml', tags: ['maerkte'] },
  { name: 'DW', url: 'https://rss.dw.com/xml/rss-de-eco', tags: ['maerkte'] },
  { name: 'Handelsblatt', url: 'https://www.handelsblatt.com/contentexport/feed/finanzen', tags: ['maerkte'] },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', tags: ['maerkte'] },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', tags: ['maerkte'] },
  { name: 'CNBC Tech', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', tags: ['tech'] },
];

const WORLD_FEEDS = [
  { name: 'tagesschau', url: 'https://www.tagesschau.de/ausland/index~rss2.xml', tags: [] },
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tags: [] },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', tags: [] },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', tags: ['notenbanken'] },
  { name: 'EZB', url: 'https://www.ecb.europa.eu/rss/press.html', tags: ['notenbanken'] },
  { name: 'OilPrice', url: 'https://oilprice.com/rss/main', tags: ['rohstoffe'] },
];

async function loadFeeds(feeds, prefix) {
  const all = [];
  await Promise.all(feeds.map(async (f) => {
    const key = `${prefix}: ${f.name}`;
    try {
      const items = parseFeed(await getText(f.url, { timeout: 20000 }));
      if (!items.length) throw new Error('Feed leer');
      for (const it of items.slice(0, 30)) all.push({ ...it, src: f.name, tags: [...f.tags] });
      markOk(key);
    } catch (err) {
      markFail(key, err);
    }
  }));
  return all;
}

function finalize(items, { maxAgeDays, limit }) {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const seen = new Set();
  return items
    .filter((i) => !i.ts || Date.parse(i.ts) >= cutoff)
    .sort((a, b) => (Date.parse(b.ts || 0) || 0) - (Date.parse(a.ts || 0) || 0))
    .filter((i) => {
      const k = i.t.toLowerCase().replace(/[^a-z0-9äöüß]/g, '').slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

// ---------- Kalender ----------

const CAL_DE = [
  [/^Core CPI m\/m/i, 'Kern-Inflation (CPI) ggü. Vormonat'],
  [/^Core CPI y\/y/i, 'Kern-Inflation (CPI) ggü. Vorjahr'],
  [/^CPI m\/m/i, 'Inflation (CPI) ggü. Vormonat'],
  [/^CPI y\/y/i, 'Inflation (CPI) ggü. Vorjahr'],
  [/^Prelim CPI m\/m/i, 'Inflation vorläufig ggü. Vormonat'],
  [/^Flash CPI y\/y/i, 'Inflation Schnellschätzung ggü. Vorjahr'],
  [/^Core Flash CPI y\/y|^Core CPI Flash Estimate/i, 'Kern-Inflation Schnellschätzung ggü. Vorjahr'],
  [/^CPI Flash Estimate/i, 'Inflation Schnellschätzung ggü. Vorjahr'],
  [/^Core PCE Price Index/i, 'PCE-Kerninflation'],
  [/^Core PPI/i, 'Kern-Erzeugerpreise'],
  [/^PPI/i, 'Erzeugerpreise (PPI)'],
  [/^Non-Farm Employment Change/i, 'US-Arbeitsmarktbericht (Non-Farm Payrolls)'],
  [/^ADP Non-Farm Employment Change/i, 'ADP Beschäftigung'],
  [/^Unemployment Claims/i, 'Erstanträge Arbeitslosenhilfe'],
  [/^Unemployment Rate/i, 'Arbeitslosenquote'],
  [/^Average Hourly Earnings/i, 'Stundenlöhne'],
  [/^JOLTS Job Openings/i, 'Offene Stellen (JOLTS)'],
  [/^Federal Funds Rate/i, 'Fed Zinsentscheid'],
  [/^FOMC Meeting Minutes/i, 'Fed-Sitzungsprotokoll'],
  [/^FOMC Statement/i, 'Fed-Erklärung'],
  [/^FOMC Press Conference/i, 'Fed-Pressekonferenz'],
  [/^Main Refinancing Rate/i, 'EZB Leitzins'],
  [/^ECB Press Conference/i, 'EZB-Pressekonferenz'],
  [/^Monetary Policy Statement/i, 'Geldpolitische Erklärung'],
  [/^Advance GDP q\/q/i, 'BIP vorläufig ggü. Vorquartal'],
  [/GDP/i, 'Bruttoinlandsprodukt (BIP)'],
  [/^Core Retail Sales/i, 'Kern-Einzelhandelsumsatz'],
  [/^Retail Sales/i, 'Einzelhandelsumsatz'],
  [/^ISM Manufacturing PMI/i, 'ISM Einkaufsmanager Industrie'],
  [/^ISM Services PMI/i, 'ISM Einkaufsmanager Dienstleister'],
  [/Flash Manufacturing PMI/i, 'Einkaufsmanager Industrie (vorläufig)'],
  [/Flash Services PMI/i, 'Einkaufsmanager Dienstleister (vorläufig)'],
  [/ifo Business Climate/i, 'ifo-Geschäftsklima'],
  [/ZEW Economic Sentiment/i, 'ZEW-Konjunkturerwartungen'],
  [/Consumer Confidence|Consumer Sentiment/i, 'Verbrauchervertrauen'],
  [/Crude Oil Inventories/i, 'US-Rohöllagerbestände'],
  [/Durable Goods Orders/i, 'Auftragseingang langlebige Güter'],
  [/Industrial Production/i, 'Industrieproduktion'],
  [/Factory Orders/i, 'Auftragseingang Industrie'],
  [/Trade Balance/i, 'Handelsbilanz'],
  [/Building Permits/i, 'Baugenehmigungen'],
  [/Housing Starts/i, 'Baubeginne'],
  [/Bank Holiday/i, 'Feiertag'],
];

const COUNTRY_DE = { USD: 'USA', EUR: 'Eurozone', GBP: 'Großbritannien', JPY: 'Japan', CNY: 'China', CHF: 'Schweiz', CAD: 'Kanada', AUD: 'Australien', NZD: 'Neuseeland' };

function translateTitle(t) {
  let out = t;
  for (const [re, de] of CAL_DE) {
    if (re.test(t)) { out = de; break; }
  }
  if (out === t) out = t.replace(/ Speaks$/i, ' spricht');
  if (/^German /i.test(t) && out !== t) out = `Deutschland: ${out}`;
  return out;
}

function artOf(t) {
  if (/cpi|pce|ppi|inflation|price index/i.test(t)) return 'inflation';
  if (/employment|payroll|unemployment|jobless|claims|jolts|earnings/i.test(t)) return 'arbeitsmarkt';
  if (/fomc|fed|ecb|rate|monetary|lagarde|powell|speaks|boj|boe/i.test(t)) return 'notenbank';
  return 'konjunktur';
}

async function economicCalendar() {
  const urls = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];
  const events = [];
  let anyOk = false;
  for (const url of urls) {
    try {
      const list = await getJson(url, { timeout: 20000 });
      anyOk = true;
      for (const e of list) {
        const major = e.country === 'USD' || e.country === 'EUR';
        if (!major && e.impact !== 'High') continue;
        if (e.impact === 'Non-Economic') continue;
        const impact = { High: 'hoch', Medium: 'mittel', Low: 'niedrig', Holiday: 'niedrig' }[e.impact] || 'niedrig';
        const title = clean(e.title);
        events.push({
          zeit: new Date(e.date).toISOString(),
          ganztags: e.impact === 'Holiday' || /All Day|Tentative/i.test(e.time || ''),
          titel: translateTitle(title), original: title,
          land: COUNTRY_DE[e.country] || e.country, wichtigkeit: impact,
          art: e.impact === 'Holiday' ? 'feiertag' : artOf(title),
          prognose: e.forecast || null, vorher: e.previous || null,
        });
      }
    } catch (err) {
      if (url.includes('thisweek')) markFail('Kalender: ForexFactory', err);
    }
  }
  if (anyOk) markOk('Kalender: ForexFactory');
  return anyOk ? events : null;
}

async function earningsCalendar(symbols, depotSymbols) {
  if (!FINNHUB_KEY) throw new Error('FINNHUB_KEY fehlt');
  const from = isoDay(addDays(new Date(), -1));
  const to = isoDay(addDays(new Date(), 90));
  const out = [];
  for (const s of symbols) {
    const d = await getJson(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(s)}&token=${FINNHUB_KEY}`);
    for (const e of d?.earningsCalendar || []) {
      const hour = e.hour;
      const time = hour === 'bmo' ? '07:00' : hour === 'amc' ? '16:05' : '12:00';
      const zeit = hour === 'bmo' || hour === 'amc' ? zonedToUtc(e.date, time, 'America/New_York') : new Date(`${e.date}T12:00:00Z`);
      out.push({
        zeit: zeit.toISOString(), ganztags: !(hour === 'bmo' || hour === 'amc'),
        titel: `Quartalszahlen ${e.symbol}`,
        original: e.quarter ? `Q${e.quarter} ${e.year}` : null,
        land: 'USA', wichtigkeit: depotSymbols.includes(e.symbol) ? 'hoch' : 'mittel', art: 'quartalszahlen',
        symbol: e.symbol,
        hinweis: hour === 'bmo' ? 'vor US-Börsenstart (ca.)' : hour === 'amc' ? 'nach US-Börsenschluss (ca.)' : 'Uhrzeit noch offen',
        prognose: e.epsEstimate != null ? `EPS ${e.epsEstimate}` : null,
      });
    }
    await sleep(250);
  }
  return out;
}

// ---------- Hauptlauf ----------

const TICKER = [
  { id: 'ndx', name: 'Nasdaq 100', src: 'finnhub', symbol: 'QQQ', proxy: 'QQQ' },
  { id: 'spx', name: 'S&P 500', src: 'finnhub', symbol: 'SPY', proxy: 'SPY' },
  { id: 'dji', name: 'Dow Jones', src: 'finnhub', symbol: 'DIA', proxy: 'DIA' },
  { id: 'dax', name: 'DAX', src: 'twelve', symbol: 'GDAXI', fallbackSymbol: 'EXS1:XETR', fallbackProxy: 'EXS1' },
  { id: 'sox', name: 'Halbleiter (SOX)', src: 'finnhub', symbol: 'SOXX', proxy: 'SOXX' },
  { id: 'btc', name: 'Bitcoin', src: 'coingecko' },
  { id: 'gold', name: 'Gold', src: 'twelve', symbol: 'XAU/USD', unit: '$/oz' },
  { id: 'oil', name: 'Öl Brent', src: 'twelve', symbol: 'XBR/USD', unit: '$/bbl', sub: { name: 'WTI', symbol: 'WTI/USD' } },
  { id: 'eurusd', name: 'EUR/USD', src: 'twelve', symbol: 'EUR/USD' },
  { id: 'us10y', name: 'US-Rendite 10J', src: 'treasury', unit: '%' },
];

async function main() {
  const prev = await readJson('briefing.json', {});
  const history = await readJson('history.json', {});
  const depot = await readJson('depot.json', { positionen: [] });
  const watch = await readJson('watchlist.json', { long: [], short: [] });
  const extra = await readJson('kalender.json', { termine: [] });

  const now = new Date().toISOString();
  const prevTicker = Object.fromEntries((prev.ticker || []).map((t) => [t.id, t]));

  // Twelve Data in einem Abruf (spart Credits)
  let twelve = {};
  const twelveSymbols = TICKER.filter((t) => t.src === 'twelve').flatMap((t) => [t.symbol, t.sub?.symbol].filter(Boolean));
  try {
    twelve = await twelveQuotes(twelveSymbols);
    const errors = Object.entries(twelve).filter(([, v]) => v.error);
    if (errors.length === twelveSymbols.length) throw new Error(errors[0][1].error);
    markOk('Kurse: Twelve Data');
  } catch (err) {
    markFail('Kurse: Twelve Data', err);
  }

  const ticker = [];
  for (const t of TICKER) {
    let q = null;
    let proxy = t.proxy || null;
    try {
      if (t.src === 'finnhub') q = await finnhubQuote(t.symbol);
      else if (t.src === 'coingecko') { q = await coingeckoBtc(); markOk('Kurse: CoinGecko'); }
      else if (t.src === 'treasury') { q = await treasury10y(); markOk('Rendite: US Treasury'); }
      else if (t.src === 'twelve') {
        q = twelve[t.symbol] && !twelve[t.symbol].error ? twelve[t.symbol] : null;
        if (!q && t.id === 'eurusd') { q = await frankfurterEurUsd(); markOk('Devisen: EZB (Frankfurter)'); }
        if (!q && t.fallbackSymbol && TWELVE_KEY) {
          const [sym, ex] = t.fallbackSymbol.split(':');
          const r = await getJson(`https://api.twelvedata.com/quote?symbol=${sym}&exchange=${ex}&apikey=${TWELVE_KEY}`);
          if (r && !r.code) {
            q = { price: num(r.close), change: num(r.change), dp: num(r.percent_change), high: num(r.high), low: num(r.low), prev: num(r.previous_close), asOf: new Date((r.timestamp || Date.now() / 1000) * 1000).toISOString(), currency: r.currency };
            proxy = t.fallbackProxy;
          }
        }
        if (!q) throw new Error(twelve[t.symbol]?.error || 'keine Daten');
      }
    } catch (err) {
      markFail(`Kurs: ${t.name}`, err);
    }

    let entry;
    if (q && q.price != null) {
      entry = { id: t.id, name: t.name, ...q, unit: t.unit || null, proxy, src: t.src, stale: false };
    } else if (prevTicker[t.id]) {
      entry = { ...prevTicker[t.id], stale: true };
    } else {
      entry = { id: t.id, name: t.name, price: null, unit: t.unit || null, src: t.src, stale: true };
    }

    if (t.sub) {
      const s = twelve[t.sub.symbol];
      entry.sub = s && !s.error && s.price != null
        ? { name: t.sub.name, price: s.price, dp: s.dp, change: s.change, asOf: s.asOf, stale: false }
        : prevTicker[t.id]?.sub ? { ...prevTicker[t.id].sub, stale: true } : null;
    }
    ticker.push(entry);
    if (t.src === 'finnhub') await sleep(200);
  }
  if (ticker.some((t) => t.src === 'finnhub' && !t.stale)) markOk('Kurse: Finnhub');

  // Depot + Beobachtungsliste
  const depotSymbols = depot.positionen.map((p) => p.symbol);
  const watchSymbols = [...watch.long, ...watch.short].map((w) => w.symbol);
  const allSymbols = [...new Set([...depotSymbols, ...watchSymbols])];
  const quotes = {};
  for (const s of allSymbols) {
    try {
      quotes[s] = { ...(await finnhubQuote(s)), stale: false };
    } catch (err) {
      markFail(`Kurs: ${s}`, err);
      if (prev.quotes?.[s]) quotes[s] = { ...prev.quotes[s], stale: true };
    }
    await sleep(200);
  }

  // Verlauf für Sparklines
  const pushHistory = (id, price) => {
    if (price == null) return;
    const arr = (history[id] ||= []);
    if (arr.length && arr.at(-1)[1] === price) return;
    arr.push([Math.round(Date.now() / 1000), price]);
    if (arr.length > HISTORY_POINTS) arr.splice(0, arr.length - HISTORY_POINTS);
  };
  ticker.filter((t) => !t.stale).forEach((t) => pushHistory(t.id, t.price));
  Object.entries(quotes).filter(([, q]) => !q.stale).forEach(([s, q]) => pushHistory(`q:${s}`, q.price));

  // Nachrichten
  let news = await loadFeeds(NEWS_FEEDS, 'News');
  if (FINNHUB_KEY) {
    try {
      const g = await getJson(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`);
      for (const n of (g || []).slice(0, 40)) news.push({ t: clean(n.headline), url: n.url, ts: new Date(n.datetime * 1000).toISOString(), src: n.source || 'Finnhub', tags: ['maerkte'] });
      const from = isoDay(addDays(new Date(), -4));
      const to = isoDay(new Date());
      for (const s of allSymbols) {
        const c = await getJson(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(s)}&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
        for (const n of (c || []).slice(0, 5)) news.push({ t: clean(n.headline), url: n.url, ts: new Date(n.datetime * 1000).toISOString(), src: n.source || 'Finnhub', tags: ['unternehmen'], symbol: s });
        await sleep(200);
      }
      markOk('News: Finnhub');
    } catch (err) {
      markFail('News: Finnhub', err);
    }
  }
  news = news.filter((n) => n.t && n.url).map((n) => {
    const tags = new Set(n.tags);
    if (RE.tech.test(n.t)) tags.add('tech');
    if (RE.unternehmen.test(n.t)) tags.add('unternehmen');
    if (!tags.size) tags.add('maerkte');
    return { ...n, tags: [...tags] };
  });
  news = finalize(news, { maxAgeDays: 3, limit: 90 });
  if (!news.length && prev.news?.length) news = prev.news.map((n) => ({ ...n, stale: true }));

  // Weltpolitik
  let welt = await loadFeeds(WORLD_FEEDS, 'Welt');
  try {
    const q = encodeURIComponent('(sanctions OR tariffs OR ceasefire OR OPEC OR "central bank" OR geopolitical) sourcelang:english');
    const g = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=15&timespan=1d&sort=datedesc`, { timeout: 30000, retries: 0 });
    for (const a of g?.articles || []) {
      const m = a.seendate?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      welt.push({ t: clean(a.title), url: a.url, ts: m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null, src: a.domain || 'GDELT', tags: [] });
    }
    markOk('Welt: GDELT');
  } catch (err) {
    markFail('Welt: GDELT', err);
  }
  // Breite Weltfeeds enthalten auch Vermischtes: nur Meldungen mit Bezug zu Politik, Konflikten, Rohstoffen, Notenbanken
  welt = welt.filter((n) => n.src === 'tagesschau' || n.tags.length || ['geo', 'konflikte', 'rohstoffe', 'notenbanken'].some((k) => RE[k].test(n.t)));
  welt = welt.map((n) => {
    const tags = new Set(n.tags);
    for (const k of ['konflikte', 'rohstoffe', 'notenbanken']) if (RE[k].test(n.t)) tags.add(k);
    tags.add('geopolitik');
    return { ...n, tags: [...tags] };
  });
  welt = finalize(welt, { maxAgeDays: 3, limit: 70 });
  if (!welt.length && prev.welt?.length) welt = prev.welt.map((n) => ({ ...n, stale: true }));

  // Kalender
  let econ = await economicCalendar();
  if (!econ) econ = (prev.kalender || []).filter((k) => k.art !== 'quartalszahlen' && !k.eigen).map((k) => ({ ...k, stale: true }));
  let earnings = [];
  try {
    earnings = await earningsCalendar(allSymbols, depotSymbols);
    markOk('Kalender: Quartalszahlen (Finnhub)');
  } catch (err) {
    markFail('Kalender: Quartalszahlen (Finnhub)', err);
    earnings = (prev.kalender || []).filter((k) => k.art === 'quartalszahlen').map((k) => ({ ...k, stale: true }));
  }
  const eigene = (extra.termine || []).map((e) => ({
    zeit: new Date(e.zeit).toISOString(), ganztags: !!e.ganztags, titel: e.titel, land: e.land || '',
    wichtigkeit: e.wichtigkeit || 'mittel', art: e.art || 'termin', eigen: true,
  }));
  const calFrom = Date.now() - 86400000;
  const calTo = Date.now() + 90 * 86400000;
  const kalender = [...econ, ...earnings, ...eigene]
    .filter((k) => { const t = Date.parse(k.zeit); return t >= calFrom && t <= calTo; })
    .sort((a, b) => Date.parse(a.zeit) - Date.parse(b.zeit));

  const briefing = { generatedAt: now, quellen, ticker, quotes, news, welt, kalender };

  await writeFile(file('briefing.json'), JSON.stringify(briefing));
  await writeFile(file('history.json'), JSON.stringify(history));

  const ok = Object.values(quellen).filter((q) => q.ok).length;
  console.log(`Fertig: ${ok}/${Object.keys(quellen).length} Quellen ok, ${ticker.filter((t) => !t.stale).length}/${ticker.length} Ticker frisch, ${news.length} News, ${welt.length} Welt, ${kalender.length} Termine.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
