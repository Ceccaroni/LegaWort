# Legasthenie‑Wörterbuch (CH‑DE)

Statisch, offline‑fähig, ohne externe Ressourcen. Für GitHub Pages gedacht. Schweizer Orthografie (ss statt ß).

## Ziel
Ein einfaches Wörterbuch für Lernende mit Legasthenie. Klarer Satz, anpassbares Schriftbild, Vorlesefunktion, Silbenanzeige, einfache Erklärungen.

## Funktionen
- Suche mit **Fehlertoleranz** (Damerau–Levenshtein).
- **Dyslexie‑Modus**: mehr Zeilenhöhe, Buchstabenabstand.
- **Leselineal** (gelber Balken, Maus folgt).
- **Hoher Kontrast** per Umschalter.
- **Silbenanzeige** (vordefiniert oder heuristisch).
- **Vorlesen** von Wort/Erklärung über Web Speech API (lokal, wenn verfügbar).
- **Import/Export** eigener Einträge (JSON/CSV, rein lokal).
- **Merkliste** lokal.

## Struktur
```
/index.html
/styles/main.css
/scripts/app.js
/data/words.json
/assets/        # optional (Icons, Logos)
/LICENSE
/README.md
```

## Datenformat
`data/words.json`:
```json
{ "version": "0.1.0", "orthography": "CH-DE", "entries": [
  {
    "wort": "Apfel",
    "silben": ["Ap","fel"],
    "erklaerung": "Eine runde Frucht. Man kann sie roh essen.",
    "beispiele": ["Ich esse einen Apfel."],
    "tags": ["Lebensmittel","Nomen"]
  }
]}
```

### CSV‑Import
Spalten‑Köpfe: `wort;erklaerung;silben;beispiele;tags`  
- `silben`: mit `-` oder `·` trennen, z. B. `Ap-fel`.  
- `beispiele`: mehrere Beispiele mit `|` trennen.  
- `tags`: mit `,` trennen.  
Alles wird auf **ss** normalisiert (kein ß).

## Lokal testen
Öffne `index.html` im Browser. Für `file://` blockieren manche Browser `fetch`. Dann lokal kurz einen Server starten:

- macOS: `python3 -m http.server 8080`
- Danach: `http://localhost:8080` öffnen.

## Deployment auf GitHub Pages
1. Neues Repo, Ordnerinhalt ins Root.
2. **Settings → Pages**: Deploy from **main**, Ordner `/root`.
3. Warten bis die URL aktiv ist.

## Hinweise zur Barrierefreiheit
- Keine Blocksatz‑Linien, saubere Wortabstände.
- Fokus‑Ringe sichtbar.
- Nur Systemschriften, kein Tracking.

## Lizenz
MIT. Siehe `LICENSE`.

## Haftung
Keine Garantie. Pädagogische Verantwortung bleibt bei der Lehrperson. Keine Tracker, keine externen Verbindungen.
