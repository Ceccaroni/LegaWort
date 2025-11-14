/**
 * build_manifests_v2.js
 *
 * Erzeugt neue Manifeste nach Präfix (2 Buchstaben).
 * Erwartet eine grosse Wortliste als JSON-Array.
 *
 * Ablauf:
 * 1. Wortliste einlesen
 * 2. Normalisieren (CH-DE)
 * 3. Duplikate entfernen
 * 4. Prefix = erste 2 Buchstaben
 * 5. Objektstruktur erzeugen
 * 6. Buckets in public/index/xx/lemmas.json schreiben
 *
 * Optionale Vorbereitung für Schritt 4:
 *  - pos: null
 *  - lemma: null
 *  - isInflected: false
 *  - phon: Platzhalter
 */

const fs = require("fs");
const path = require("path");

// Pfade anpassen: relative Struktur zu deinem Repo.
const WORDLIST_PATH = path.join(__dirname, "..", "German-words-1600000-words-multilines.json");
const OUTPUT_ROOT = path.join(__dirname, "..", "public", "index");

/**
 * CH-DE Normalisierung
 * - lowercase
 * - ss statt ß
 * - ä/ö/ü -> ae/oe/ue (nur intern für norm)
 */
function normalize(word){
  if(!word || typeof word !== "string") return "";

  let w = word.trim();

  // interne Normalform
  let n = w.toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-zA-ZäöüÄÖÜß]/g, ""); // entferne Satzzeichen

  return n;
}

/**
 * sehr einfacher Phonetik-Stummel (Platzhalter)
 * CH-kompatible Grundabstraktion
 */
function phonStub(norm){
  if(!norm) return "";
  return norm
    .replace(/sch/g, "6")
    .replace(/ch/g, "7")
    .replace(/[aeiou]/g, "1")
    .replace(/[bcdfghjklmnpqrstvwxyz]/g, "2");
}

/**
 * Prefix bestimmen
 */
function prefix2(norm){
  if(!norm) return "";
  if(norm.length === 1) return norm + "_";
  return norm.slice(0,2);
}

/**
 * Hauptprozess
 */
function run(){
  console.log("Lade Wortliste…");

  const raw = fs.readFileSync(WORDLIST_PATH, "utf8");
  const words = JSON.parse(raw);

  console.log(`Wörter geladen: ${words.length}`);

  const buckets = new Map();   // key: 'aa', value: Array

  let count = 0;
  let dropped = 0;

  for(const w of words){
    if(!w || typeof w !== "string") continue;
    const norm = normalize(w);
    if(!norm) { dropped++; continue; }

    const pref = prefix2(norm);
    if(!pref) { dropped++; continue; }

    const phon = phonStub(norm);

    const entry = {
      wort: w,            // Originalform
      norm: norm,         // interne Normalform
      phon: phon,         // Platzhalter
      len: norm.length,   // Länge
      pos: null,          // Stub für Schritt 4
      lemma: null,        // Stub
      isInflected: false  // Stub
    };

    if(!buckets.has(pref)){
      buckets.set(pref, []);
    }
    buckets.get(pref).push(entry);

    count++;
  }

  console.log(`Verwendbare Wörter: ${count}`);
  console.log(`Verworfen durch Normalisierung: ${dropped}`);

  console.log("Schreibe Dateien…");

  // Zielordner vorbereiten
  if(!fs.existsSync(OUTPUT_ROOT)){
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  }

  // 26x26 mögliche Präfixe
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");

  for(const a of letters){
    for(const b of letters){
      const pref = a + b;
      const arr = buckets.get(pref) || [];
      const outDir = path.join(OUTPUT_ROOT, pref);
      const outFile = path.join(outDir, "lemmas.json");

      if(!fs.existsSync(outDir)){
        fs.mkdirSync(outDir, { recursive: true });
      }

      fs.writeFileSync(outFile, JSON.stringify(arr, null, 2), "utf8");
    }
  }

  console.log("Fertig. Neue Manifeste erzeugt.");
}

run();
