/**
 * Build 26x26 Präfix-Manifeste als Entry-Objekte.
 * Vorher: ["wort1", "wort2", ...]
 * Neu:   [{ wort:"...", pos:null, def:null, silben:[], source:"manifest" }, ...]
 *
 * Aufruf:
 *   node tools/build_manifests.js "/Pfad/wordlist.txt"
 */

const fs = require("fs");
const readline = require("readline");
const path = require("path");

const inFile = process.argv[2];
if (!inFile) {
  console.error("Pfad zur Wörterliste fehlt.\nBeispiel:\n  node tools/build_manifests.js \"/Users/ich/Desktop/words.txt\"");
  process.exit(1);
}

const OUT_DIR = "public/index";
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ---------- Normalisierung CH-DE ---------- */
function norm(s) {
  return String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]/g, "");  // nur a–z0–9 für die Bucket-Zuordnung
}

/* ---------- Präfix-Extraktion ---------- */
function prefixOf(k) {
  const a = k[0] || "_";
  const b = k[1] || "_";
  return a + b;
}

/* ---------- Entry-Objekt erzeugen ---------- */
function makeEntry(wort) {
  // Nimmt bereits normalisiertes Lemma (k) und erzeugt ein Entry-Objekt.
  return {
    wort,           // z.B. "saarland"
    pos: null,      // später aus Kaikki
    def: null,      // später aus Kaikki
    silben: [],     // später aus Hyphenation
    source: "manifest"
  };
}

const buckets = new Map(); // z.B. "sa" -> Set(["saarland","saat",...])

function add(prefix, lemma) {
  if (!prefix || !lemma) return;
  let set = buckets.get(prefix);
  if (!set) {
    set = new Set();
    buckets.set(prefix, set);
  }
  set.add(lemma);
}

const rl = readline.createInterface({
  input: fs.createReadStream(inFile, { encoding: "utf8" })
});

let n = 0;

/* ---------- Zeilen lesen ---------- */
rl.on("line", (line) => {
  let raw = (line || "").trim();
  if (!raw || raw === "[" || raw === "]") return;          // JSON-Array-Klammern ignorieren
  raw = raw.replace(/^"+|"+$/g, "").replace(/,$/, "");     // Zeilen wie "Wort", säubern
  if (!raw) return;

  const k = norm(raw);
  if (!k) return;

  add(prefixOf(k), k);

  if ((++n % 100000) === 0) {
    process.stdout.write(`\rVerarbeitet: ${n.toLocaleString("de-CH")} Zeilen…`);
  }
});

/* ---------- Schreiben der Objekt-Manifeste ---------- */
rl.on("close", () => {
  process.stdout.write(`\rVerarbeitet: ${n.toLocaleString("de-CH")} Zeilen. Schreibe Dateien…\n`);

  for (const [pref, set] of buckets) {
    const arr = Array.from(set).sort();

    // Hier erfolgt der entscheidende Umbau: Strings -> Entry-Objekte
    const entries = arr.map(w => makeEntry(w));

    const dir = path.join(OUT_DIR, pref);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "lemmas.json"), JSON.stringify(entries), "utf8");
  }

  console.log("Fertig. Neue Objekt-Manifeste unter public/index/<prefix>/lemmas.json erzeugt.");
});
