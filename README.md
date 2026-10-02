# Börsen-Briefing

Persönliches Live-Briefing für Börse und Weltgeschehen. Läuft kostenlos auf GitHub Pages,
funktioniert auf dem Handy und lässt sich als App auf den Startbildschirm legen.

**Keine Anlageberatung.**

## So funktioniert es

```
GitHub Action (alle 20 Min.)  ──>  fetch.mjs holt Kurse, News, Termine
                                    └─> schreibt briefing.json + history.json
                                    └─> veröffentlicht die Seite auf GitHub Pages
Webseite (index.html, app.js)  ──>  liest briefing.json, history.json und deine Einstellungs-Dateien
                                    └─> lädt Bitcoin zusätzlich live im Browser (CoinGecko)
```

- Keine Server, kein Build-Schritt. Nur HTML, CSS, JavaScript.
- API-Schlüssel liegen nur in den GitHub Secrets und werden nur in der Action benutzt.
- Fällt eine Quelle aus, bleiben die letzten Werte stehen (mit Warnsymbol). Offline zeigt die
  App den zuletzt geladenen Stand.

## Einmalige Einrichtung

### 1. Kostenlose API-Schlüssel holen

| Dienst | Wofür | Wo |
|---|---|---|
| **Finnhub** | Aktienkurse (NIQ, Beobachtungsliste, ETFs für Nasdaq/S&P/Dow/SOX), Firmen-News, Quartalszahlen-Termine | [finnhub.io/register](https://finnhub.io/register) → nach dem Login steht der Key im Dashboard |
| **Twelve Data** | DAX, Gold, Brent, WTI, EUR/USD | [twelvedata.com/register](https://twelvedata.com/register) → *API Keys* im Dashboard |

Ohne Schlüssel gehen: Bitcoin (CoinGecko), US-Rendite (U.S. Treasury), EUR/USD als Ersatz
(EZB), Nachrichten (RSS), Wirtschaftskalender (ForexFactory).

### 2. Repository anlegen und Dateien hochladen (nur im Browser)

1. Auf [github.com/new](https://github.com/new) ein Repository `boersen-briefing` anlegen,
   **Public**, ohne README. (Pages und Action-Minuten sind nur bei öffentlichen Repos
   kostenlos. Achtung: Dann ist auch dein Depot öffentlich sichtbar.)
2. Im Repository auf **„uploading an existing file“** bzw. **Add file → Upload files** klicken.
3. Im Explorer im Ordner `boersen-briefing` alle Dateien markieren (Strg + A) und ins
   Upload-Feld ziehen. Es gibt keine Unterordner. Die Datei `workflow-update.yml` darf mit
   hoch, sie wird aber erst in Schritt 5 gebraucht.
4. Unten auf **Commit changes** klicken.

### 3. Secrets eintragen

Im Repository: **Settings → Secrets and variables → Actions → New repository secret**

- Name `FINNHUB_KEY`, Wert = dein Finnhub-Schlüssel
- Name `TWELVEDATA_KEY`, Wert = dein Twelve-Data-Schlüssel

### 4. GitHub Pages einschalten

**Settings → Pages → Build and deployment → Source: „GitHub Actions“** auswählen.

### 5. GitHub Action anlegen (startet den ersten Lauf)

GitHub erwartet die Action in einem Unterordner. Den legst du direkt auf der Webseite an:

1. **Add file → Create new file**.
2. Als Namen genau `.github/workflows/update.yml` eintippen (nach jedem `/` legt GitHub
   automatisch den Ordner an).
3. Den kompletten Inhalt der Datei `workflow-update.yml` (mit dem Editor öffnen, Strg + A,
   Strg + C) ins große Feld einfügen.
4. **Commit changes**. Unter **Actions** läuft jetzt „Daten aktualisieren und veröffentlichen“,
   nach 1 bis 2 Minuten erscheint ein grüner Haken. Die Adresse steht unter **Settings → Pages**:
   `https://DEIN-NAME.github.io/boersen-briefing/`

Später von Hand starten: **Actions → Daten aktualisieren und veröffentlichen → Run workflow**.

### 6. Aufs Handy holen

- **iPhone (Safari):** Link öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
- **Android (Chrome):** Link öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

## Anpassen

Alle Dateien kannst du direkt auf github.com bearbeiten (Datei öffnen → Stift-Symbol →
„Commit changes“). Die Seite ist danach in 1 bis 2 Minuten aktualisiert.

### Depot ändern: `depot.json`

```json
{
  "positionen": [
    { "symbol": "NIQ", "name": "NIQ Global Intelligence", "boerse": "NYSE", "stueck": 2, "einstieg": 17.84, "waehrung": "USD" },
    { "symbol": "AAPL", "name": "Apple", "boerse": "NASDAQ", "stueck": 1, "einstieg": 230.10, "waehrung": "USD" }
  ]
}
```

- `stueck` = Anzahl Aktien, `einstieg` = Kaufkurs in Dollar (Punkt als Dezimaltrennzeichen).
- Funktioniert für US-Aktien und US-ETFs (Finnhub-Gratisplan).

### Beobachtungsliste ändern: `watchlist.json`

```json
{
  "long":  [ { "symbol": "NVDA", "name": "Nvidia", "notiz": "Zahlen am 19.11." } ],
  "short": [ { "symbol": "INTC", "name": "Intel", "notiz": "Margen schwach" } ]
}
```

Die mitgelieferten Einträge sind nur Beispiele. Quartalszahlen-Termine dieser Firmen
erscheinen automatisch im Kalender (Depot = Wichtigkeit hoch, Liste = mittel).

### Ziel ändern: `ziel.json`

```json
{
  "satz": "100.000 € bis Juni 2027",
  "betragEUR": 100000,
  "datum": "2027-06-30",
  "weiteresVermoegenEUR": 0
}
```

`weiteresVermoegenEUR`: alles, was nicht im Depot steht (Tagesgeld, andere Depots). Wird für
den Fortschrittsbalken zum Depotwert addiert.

### Eigene Termine: `kalender.json`

Zum Beispiel Notenbank-Sitzungen. Zeit mit Zeitzone angeben, die Seite rechnet in deutsche
Zeit um:

```json
{ "zeit": "2026-12-17T14:15:00+01:00", "titel": "EZB Zinsentscheid", "land": "Eurozone", "wichtigkeit": "hoch", "art": "notenbank" }
```

## Gut zu wissen

- **Indizes:** Echte Indexstände von Nasdaq 100, S&P 500, Dow und SOX gibt es kostenlos nicht
  legal. Die Seite zeigt deshalb die ETFs QQQ, SPY, DIA und SOXX (Kachel: „via QQQ“). Die
  Tagesveränderung in % ist praktisch gleich, der Kurs ist der ETF-Preis.
- **Verzögerung:** Gratis-Kurse sind teils um 15 Minuten verzögert. GitHub startet geplante
  Läufe manchmal später als alle 20 Minuten.
- **US-Rendite:** Tageswert des U.S. Treasury (kommt abends nach US-Börsenschluss).
- **Wirtschaftskalender:** aus den öffentlichen Wochen-Dateien von ForexFactory (diese und
  nächste Woche). Fällt die Quelle weg, bleiben deine eigenen Termine und die Quartalszahlen.
- **Status:** Ganz unten auf der Seite unter „Status der Datenquellen“ siehst du, welche Quelle
  beim letzten Lauf funktioniert hat.
- **Credits pro Tag:** 72 Läufe × 5 Twelve-Data-Abfragen = 360 von 800 erlaubten. Finnhub: ca.
  25 Abfragen pro Lauf, Limit 60 pro Minute.

## Lokal testen

```bash
node fetch.mjs
python -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Für Kurse vorher die Schlüssel setzen
(PowerShell: `$env:FINNHUB_KEY="..."; $env:TWELVEDATA_KEY="..."`).

## Dateien

Alle Dateien liegen in einem Ordner, ohne Unterordner.

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css`, `app.js` | Die Seite |
| `depot.json`, `watchlist.json`, `ziel.json`, `kalender.json` | Deine Einstellungen |
| `briefing.json`, `history.json` | Von der Action erzeugt, nicht von Hand ändern |
| `fetch.mjs` | Holt alle Daten |
| `workflow-update.yml` | Vorlage für `.github/workflows/update.yml` (Zeitplan und Veröffentlichung) |
| `sw.js`, `manifest.webmanifest`, `icon*.png`, `icon.svg` | App-Funktion (PWA, Offline) |
| `icons.svg`, `Geist*.woff2` | Symbole und Schrift |
| `DESIGN.md` | Designsystem (Farben, Schrift, Abstände, Regeln) |

Schriften: Geist (SIL Open Font License), Icons: Phosphor (MIT).
