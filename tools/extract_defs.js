// tools/extract_defs.js

// Import aus der Lib (gemeinsame Logik)
const {
  toCH, norm, prefix2, nowUnix,
  posDE, quoteDe, isGerman,
  pickBestSense, pickExample, mapEntry
} = require("./extract_defs_lib");

// Aufruf-Beispiele:
//   node tools/extract_defs.js --dump "/Pfad/wiktextract-de.jsonl" --manifest-root public/index
//   node tools/extract_defs.js --dump "/Pfad/wiktextract-de.jsonl" --wordfile needs.txt
//   node tools/extract_defs.js --dump "/Pfad/wiktextract-de.jsonl.gz" --words "Aarau,Aachen" --overwrite --max 500
//
// Erzeugt: public/data/defs/<xx>/<lemma>.json (xx = 2 Buchstaben, normalisiert)

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

// lokale Helfer
function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive:true }); }

/* ---------- CLI Args ---------- */
const args = process.argv.slice(2);
function argVal(flag){ const i = args.indexOf(flag); return i === -1 ? null : args[i+1]; }
function hasFlag(flag){ return args.includes(flag); }

const dumpPath = argVal("--dump");
const wordsArg = argVal("--words");
const wordfile = argVal("--wordfile");
const manifestRoot = argVal("--manifest-root"); // z. B. public/index
const overwrite = hasFlag("--overwrite");
const maxOut = argVal("--max") ? parseInt(argVal("--max"),10) : Infinity;

if (!dumpPath || (!wordsArg && !wordfile && !manifestRoot)) {
  console.error(
`Benutzung:
  node tools/extract_defs.js --dump "/Pfad/wiktextract-de.jsonl[.gz]" (--words "aachen,aarau" | --wordfile needs.txt | --manifest-root public/index) [--overwrite] [--max 1000]`
  );
  process.exit(1);
}

/* ---------- Zielverzeichnis ---------- */
const OUT_ROOT = "public/data/defs";
ensureDir(OUT_ROOT);

/* ---------- Wanted-Liste ---------- */
const wanted = new Map();      // norm -> Set(originale Schreibungen)
const wantedFlat = new Set();  // original Wortformen (nur für Meldungen)

function addWanted(w){
  if (!w) return;
  const orig = String(w).trim();
  const n = norm(orig);
  if (!n) return;
  if (!wanted.has(n)) wanted.set(n, new Set());
  wanted.get(n).add(orig);
  wantedFlat.add(orig);
}

if (wordsArg){
  wordsArg.split(",").map(s=>s.trim()).filter(Boolean).forEach(addWanted);
} else if (wordfile){
  fs.readFileSync(wordfile,"utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).forEach(addWanted);
} else if (manifestRoot){
  // Lädt alle lemmas.json unterhalb des Root
  function walk(dir){
    for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && entry.name === "lemmas.json") {
        try{
          const arr = JSON.parse(fs.readFileSync(p,"utf8"));
          if (Array.isArray(arr)) arr.forEach(addWanted);
        } catch(e){
          console.error("Warnung: Konnte nicht lesen:", p, e.message);
        }
      }
    }
  }
  walk(manifestRoot);
}

if (wanted.size === 0){
  console.error("Keine Zielwörter gefunden (Wanted-Liste leer).");
  process.exit(1);
}

/* ---------- Ausgabe ---------- */
function outPathFor(w){
  const pref = prefix2(w);
  const dir  = path.join(OUT_ROOT, pref);
  const file = path.join(dir, `${norm(w)}.json`);
  return { dir, file };
}

function writeOnceIfNew(w, mapped, stats){
  const { dir, file } = outPathFor(w);
  ensureDir(dir);

  if (!overwrite && fs.existsSync(file)) {
    process.stdout.write(`= existiert: ${file}\n`);
    stats.existed++;
    return false;
  }
  fs.writeFileSync(file, JSON.stringify(mapped), "utf8");
  process.stdout.write(`+ ${file}\n`);
  stats.written++;
  return true;
}

/* ---------- Stream öffnen (JSONL oder GZip) ---------- */
function dumpStream(p){
  const rs = fs.createReadStream(p);
  if (p.endsWith(".gz")) return rs.pipe(zlib.createGunzip());
  return rs;
}

/* ---------- Hauptlauf ---------- */
(async function main(){
  const foundNorm = new Set(); // normierte Keys, die bereits erzeugt wurden
  const stats = { written:0, existed:0, skippedLang:0, read:0 };

  const rl = readline.createInterface({ input: dumpStream(dumpPath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (stats.written >= maxOut) break;
    if (wanted.size === 0) break;
    if (!line || !line.trim()) continue;

    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    stats.read++;

    // Nur Deutsch
    if (!isGerman(obj)) { stats.skippedLang++; continue; }

    const w = obj.word;
    if (!w) continue;

    const key = norm(w);
    // nur bearbeiten, wenn in Wanted vorhanden
    if (!wanted.has(key)) continue;

    // Pro normiertes Lemma nur einmal (erster passender Eintrag)
    if (foundNorm.has(key)) continue;

    // Mapping via Lib
    const mapped = mapEntry(obj);

    // Repräsentative Originalschreibung aus Wanted (z. B. erstes hinzugefügtes)
    const origSet = wanted.get(key);
    const repr = origSet ? Array.from(origSet)[0] : w;

    if (writeOnceIfNew(repr, mapped, stats)) {
      foundNorm.add(key);
    }

    // Entferne alle Varianten mit gleicher Normalform aus Wanted
    wanted.delete(key);
  }

  // Abschluss
  const notFound = Array.from(wanted.keys())
    .flatMap(k => Array.from(wanted.get(k) || []));
  if (notFound.length){
    console.error("Nicht gefunden:", notFound.join(", "));
  }

  console.log(`\nFertig.
Gelesene Zeilen: ${stats.read}
Geschrieben:     ${stats.written}
Übersprungen (Sprache≠DE): ${stats.skippedLang}
Bereits vorhanden: ${stats.existed}
Offen (nicht gefunden): ${notFound.length}\n`);
})();
