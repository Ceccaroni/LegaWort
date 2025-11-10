/**
 * Build 26x26 Präfix-Manifeste aus einer Wortliste (eine Zeile = ein Wort).
 * Aufruf:
 *   node tools/build_manifests.js "/Pfad/mit Leerzeichen/German-words-1600000-words-multilines.txt"
 * Output:
 *   public/index/<prefix>/lemmas.json   (prefix = 2 Zeichen, normalisiert)
 */

const fs = require("fs");
const readline = require("readline");
const path = require("path");

const inFile = process.argv[2];
if (!inFile) {
  console.error("Pfad zur Wörterliste fehlt.\nBeispiel:\n  node tools/build_manifests.js \"/Users/ich/Desktop/Woerter und Lizenz/German-words-1600000-words-multilines.txt\"");
  process.exit(1);
}

const OUT_DIR = "public/index";
fs.mkdirSync(OUT_DIR, { recursive: true });

function norm(s) {
  return String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/[^a-z0-9]/g, ""); // nur a–z0–9 für Lemma-Index
}
function prefixOf(k) {
  const a = k[0] || "_";
  const b = k[1] || "_";
  return a + b;
}

const buckets = new Map(); // "aa" -> Set()

function add(prefix, lemma) {
  if (!prefix || !lemma) return;
  let set = buckets.get(prefix);
  if (!set) { set = new Set(); buckets.set(prefix, set); }
  set.add(lemma);
}

const rl = readline.createInterface({
  input: fs.createReadStream(inFile, { encoding: "utf8" })
});

let n = 0;

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

rl.on("close", () => {
  process.stdout.write(`\rVerarbeitet: ${n.toLocaleString("de-CH")} Zeilen. Schreibe Dateien…\n`);
  for (const [pref, set] of buckets) {
    const arr = Array.from(set).sort();
    const dir = path.join(OUT_DIR, pref);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "lemmas.json"), JSON.stringify(arr), "utf8");
  }
  console.log("Fertig. Ordner 'public/index/<prefix>/lemmas.json' erstellt.");
});
