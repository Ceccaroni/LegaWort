# Dyslexikon (CH-DE)

Statisch, offline-fähig, ohne externe Ressourcen. Für GitHub Pages gedacht. Schweizer Orthografie (ss statt ß).

## Ziel
Ein einfaches Wörterbuch für Lernende mit Legasthenie. Klarer Satz, anpassbares Schriftbild, Vorlesefunktion, Silbenanzeige, einfache Erklärungen.

## Funktionen
- Suche mit **Fehlertoleranz** (Damerau–Levenshtein), **nur Treffer** werden gerendert.
- **Dyslexie-Modus**: mehr Zeilenhöhe, Buchstabenabstand.
- **Leselineal** (gelber Balken, Maus folgt).
- **Hoher Kontrast** per Umschalter.
- **Silbenanzeige** (vordefiniert oder heuristisch).
- **Vorlesen** von Wort/Erklärung über Web Speech API (lokal, wenn verfügbar).
- **Import/Export** eigener Einträge (JSON/CSV, rein lokal).
- **Merkliste** lokal.
- **Lernwörter-Sammlung**: jeder Suchtreffer kann persistiert und als CSV/JSON exportiert werden.

## Struktur
```
/index.html
/styles/main.css
/scripts/app.js
/data/words.json
/assets/
/LICENSE
/README.md
```

## Datenformat
`data/words.json`:
```json
{ "version": "0.1.0", "orthography": "CH-DE", "entries": [
  { "wort": "Apfel", "silben": ["Ap","fel"], "erklaerung": "Eine runde Frucht.", "beispiele": ["Ich esse einen Apfel."], "tags": ["Lebensmittel","Nomen"] }
]}
```

### CSV-Import
Spalten-Köpfe: `wort;erklaerung;silben;beispiele;tags`  
- `silben`: mit `-` oder `·` trennen, z. B. `Ap-fel`.  
- `beispiele`: mehrere Beispiele mit `|` trennen.  
- `tags`: mit `,` trennen.  
Alles wird auf **ss** normalisiert (kein ß).

## Lokal testen
`index.html` öffnen. Falls `fetch` via `file://` blockiert wird: kurzer Server, z. B. `python3 -m http.server 8080` → `http://localhost:8080`.

## Deployment auf GitHub Pages
Repo anlegen, Dateien ins Root, unter **Settings → Pages** deployen.

## Skalierung grosser Wörterbücher
- Daten in **Chunk-Dateien** ablegen (`data/aa.json`, `data/ab.json` …) und beim Tippen nur die passenden Chunks laden (Filter: Anfangsbuchstaben).
- Optional **Web Worker** für Distanz-Berechnung bei sehr grossen Datensätzen.
- Kein initiales Rendern des gesamten Bestandes.

## Barrierefreiheit
Sichtbare Fokusringe, klare Abstände, keine Blocksatzlöcher, Systemschriften.

## Lizenz
MIT. Siehe `LICENSE`.
