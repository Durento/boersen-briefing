# DESIGN.md: Börsen-Briefing

Designsystem für das Live-Briefing. Aufbau nach dem Muster aus
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md): Atmosphäre, Farben,
Typografie, Layout, Formen, Komponenten, Do/Don't, Responsive. Wer an der Seite etwas
ändert, hält sich an diese Datei.

## 1. Atmosphäre

Ruhiges Finanz-Terminal für eine Person, die morgens am Handy in 60 Sekunden wissen will,
was los ist. Sachlich, dicht genug für Zahlen, aber mit Luft. Inspiriert von der
Zurückhaltung von Linear und der Zahlenklarheit von Kraken/Revolut, ohne deren Markenfarben.

**Design Read:** Persönliches Markt-Dashboard (Mobile first) für eine Privatanlegerin bzw. einen
Privatanleger, ruhige Terminal-Sprache, Vanilla CSS mit Design-Tokens.

**Regler (taste-skill):** `DESIGN_VARIANCE 4` (ruhiges Raster, leichte Asymmetrie auf dem
Desktop), `MOTION_INTENSITY 3` (nur Feedback- und Zustandsübergänge), `VISUAL_DENSITY 6`
(App-Dichte, Zahlen in Mono).

## 2. Farben

Eine Akzentfarbe (Kobalt). Grün und Rot sind **nur** für Kursrichtung reserviert und werden
nie dekorativ eingesetzt. Kein reines Schwarz, kein reines Weiß.

| Token | Dunkel | Hell | Rolle |
|---|---|---|---|
| `--bg` | `#08090b` | `#f3f4f6` | Seitenhintergrund |
| `--surface` | `#111317` | `#fcfcfd` | Panels |
| `--surface-2` | `#1a1d23` | `#eceef2` | Hover, Chips, Sparkline-Fläche |
| `--border` | `#252830` | `#dcdfe5` | Haarlinien, Panel-Kanten |
| `--text` | `#e9ebef` | `#14161a` | Primärtext, Kurse |
| `--text-2` | `#a3a9b4` | `#495060` | Sekundärtext |
| `--text-3` | `#858b97` | `#5f6673` | Meta (Zeit, Quelle), mind. 4.5:1 |
| `--accent` | `#6b93ff` | `#2c5bcc` | Links, aktive Chips, Fortschritt Ziel |
| `--accent-soft` | `rgb(107 147 255 / .14)` | `rgb(44 91 204 / .10)` | Hintergrund aktiver Elemente |
| `--up` | `#34c47c` | `#0d7f45` | Kurs steigt |
| `--down` | `#f26663` | `#c3322c` | Kurs fällt |
| `--warn` | `#e0b04a` | `#94650a` | Daten veraltet |

Richtung wird **immer zusätzlich** über Vorzeichen (+/−) und Pfeil-Icon vermittelt
(Rot-Grün-Schwäche).

## 3. Typografie

- **Sans:** Geist (Variable, selbst gehostet, `font-display: swap`)
- **Mono:** Geist Mono für alle Zahlen, Kurse, Prozente, Uhrzeiten
- Zahlen immer `font-variant-numeric: tabular-nums`
- Deutsche Zahlformate über `Intl.NumberFormat('de-DE')`, Zeiten über
  `Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin' })`

| Rolle | Größe | Gewicht | Zeilenhöhe | Laufweite |
|---|---|---|---|---|
| Ziel-Satz | 20px / 24px (≥1024) | 600 | 1.2 | -0.01em |
| Panel-Titel | 15px | 600 | 1.3 | 0 |
| Großzahl (Depotwert) | 32px | 600 Mono | 1.1 | -0.02em |
| Kurs in Kachel | 15px | 500 Mono | 1.2 | 0 |
| Fließtext / Schlagzeile | 15px | 450 | 1.4 | 0 |
| Meta | 12.5px | 450 | 1.3 | 0 |

Mindestgröße im Inhalt: 12.5px. Keine Versalien-Eyebrows über jedem Panel.

## 4. Layout

- Abstände in 4er-Schritten: 4, 8, 12, 16, 20, 24, 32
- Seitenrand: 16px (Handy), 24px (Tablet), 32px (Desktop); max. Breite 1440px
- **Handy (<768):** eine Spalte. Reihenfolge: Ziel, Ticker (horizontal wischbar, nur der
  Streifen scrollt, nie die Seite), Depot, Beobachtungsliste, Nachrichten, Weltpolitik,
  Kalender. Untere Tab-Leiste zum Springen.
- **Tablet (768–1199):** zwei Spalten.
- **Desktop (≥1200):** Ticker als 10er-Raster in einer Zeile (5×2 unter 1360px), darunter
  drei Spalten `1fr 1.35fr 1fr`: links Depot + Beobachtungsliste, Mitte Nachrichten,
  rechts Kalender + Weltpolitik.

## 5. Formen

Fester Radius-Satz, überall gleich:
- Panels und Bottom-Sheet: `12px`
- Kacheln, Buttons, Eingaben: `8px`
- Filter-Chips und Status-Pillen: voll rund (`999px`)

Keine Schatten im Dunkelmodus, im Hellmodus nur `0 1px 2px rgb(20 22 26 / .05)`.
Gruppierung bevorzugt über Haarlinien (`divide`) statt Karten in Karten.

## 6. Komponenten

Referenz aus awesome-design-md: **Linear** (Flächen-Leiter statt Schatten, 1px-Haarlinien,
feine helle Oberkante an Panels `--edge`, enge Laufweite bei großen Zahlen und Titeln).

- **Briefing-Kopf:** Begrüßung nach Tageszeit + Datum, Ziel-Satz 24/28/32px (-0.03em),
  Fortschrittsbalken 8px mit Skala 0 / 50.000 / 100.000 €, daneben Marktlage-Leiste
  (Xetra, New York mit echtem Offen/Geschlossen-Punkt, Anteil der Indizes im Plus).
  Der Status-Punkt ist der einzige erlaubte farbige Punkt (echter Zustand).
- **Mini-Verlauf** in jeder Ticker-Kachel (letzte ca. 16 Std., Farbe = Tagesrichtung).
- **Depot-Chart:** Flächenverlauf mit gestrichelter Linie beim Einstiegskurs, G/V als Pille.
- **Kalender-Zeitleiste:** senkrechte Haarlinie, Punkt je Termin (hoch = gefüllt Akzent,
  mittel = Akzent-Ring, niedrig = grauer Ring), Countdown-Pille beim nächsten Termin (7 Tage).
- **Aufmacher:** erste Marktnachricht 18.5px/600.

- **Ziel-Banner:** Ziel-Satz, Fortschrittsbalken in `--accent`, darunter Resttage und
  benötigter Betrag pro Monat. Eine Zeile Meta.
- **Ticker-Kachel:** Name, Kurs, Tagesänderung % mit Pfeil. Tippen öffnet ein Bottom-Sheet
  (Desktop: zentriertes Dialogfenster) mit Sparkline, Hoch/Tief, Vortag, Quelle, Stand.
- **Depot:** Großzahl in €, darunter $ und G/V absolut + %; je Position eine Zeile.
- **Beobachtungsliste:** Segmented Control Long/Short, Zeilen mit Symbol, Notiz, Kurs, %.
- **Nachrichten:** Filter-Chips (Alle, Märkte, Tech & Halbleiter, Unternehmen) mit Anzahl.
  Zeile = Schlagzeile (Link, öffnet neuen Tab), darunter Quelle und relative Zeit.
- **Weltpolitik:** gleiche Zeilen, Chips Geopolitik, Konflikte, Rohstoffe, Notenbanken.
- **Kalender:** nach Tagen gruppiert, „Heute“ hervorgehoben, Wichtigkeit als Pille
  (hoch = gefüllt Akzent, mittel = Umriss, niedrig = gedämpft). Filter nach Wichtigkeit.
- **Stand-Leiste:** „Stand: 13:40 Uhr“, Aktualisieren-Button, Hinweis bei veralteten Quellen.
- **Leer-/Lade-/Fehlerzustände:** Skelett-Zeilen in Panelform; Fehler inline im Panel mit
  Hinweis, dass die letzten Daten gezeigt werden.

## 7. Bewegung

- Nur `transform` und `opacity`, 180–240ms, `cubic-bezier(0.16, 1, 0.3, 1)`
- Erlaubt: Kurswechsel-Blink (Hintergrund 600ms), Sheet einfahren, Tab-Indikator,
  Druck-Feedback `scale(.98)`, einmaliges Einblenden beim Laden (Bereiche 70ms versetzt,
  Kacheln 35ms versetzt), weil es zeigt, in welcher Reihenfolge die Daten ankommen
- Unter `prefers-reduced-motion: reduce` alles sofort, ohne Animation

## 8. Do / Don't

**Do:** Zahlen in Mono und tabular. Quelle und Zeit zu jeder Meldung. Touch-Flächen ≥ 44px.
Sichtbarer Fokus (`:focus-visible`, 2px Akzent-Ring). Geviertstrich-freier Text.

**Don't:** Lila Verläufe, Glows, Glassmorphism, dekorative Statuspunkte, Emojis,
Versalien-Labels über jedem Panel, Karten in Karten, horizontales Scrollen der Seite,
Gedankenstriche (—, –) in sichtbarem Text.

## 9. Responsive & Touch

- Breakpoints: 768, 1200, 1360
- Touch-Ziele min. 44×44px, Chips 36px hoch mit 44px Trefferfläche
- `100dvh` statt `100vh`, `env(safe-area-inset-*)` für die untere Tab-Leiste
- `overflow-x: clip` am Body als Sicherung, Ticker-Streifen mit `scroll-snap`

## 10. Iteration

Neue Panels: gleicher Panel-Rahmen, Titel 15px/600, Inhalt mit Haarlinien. Neue Farben nur
als Token in `styles.css` unter `:root` und beiden Themes ergänzen.
