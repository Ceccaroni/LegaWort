// tools/enrich_manifests.js
// Anreichern der Manifeste aus einem Wiktextract/Kaikki-Dump.
// Ziel: fehlende Lemmata (POS ∈ {Nomen, Verb, Adjektiv, Pronomen, Partikel}) in
//       public/index/<xx>/lemmas.json ergänzen.
//
// Aufruf-Beispiele:
//   node tools/enrich_manifests.js --dump "/Pfad/kaikki.org-dictionary-German.jsonl" --manifest-root public/index
//   node tools/enrich_manifests.js --dump "/Pfad/kaikki.org-dictionary-German.jsonl" --manifest-root public/index --pos "Nomen,Verb,Adjektiv,Pronomen,Partikel" --case lower
//
// Hinweise:
// - Default-POS-Filter: Nomen, Verb, Adjektiv, Pronomen, Partikel
// - Default-Casing für neue Einträge: lower (du kannst --case original übergeben)
// - Verteilen nach Präfix = normiertes 2er-Präfix (ae/oe/ue/ss, lowercase)

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

/* ---------- Utils ---------- */
function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
function norm(s){
  return String(s||"")
    .normalize("NFKC").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss");
}
function prefix2(w){ const k = norm(w); return (k[0]||"_") + (k[1]||"_"); }
function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive:true }); }
function isGerman(obj){
  const l = (obj.lang || "").toLowerCase().trim();
  const lc = (obj.lang_code || "").toLowerCase().trim();
  return l === "german" || l === "deutsch" || lc === "de";
}

// POS strikt: Nomen, Verb, Adjektiv, Pronomen, Partikel
function posDE(p, tags){
  const x = String(p || "").toLowerCase();
  const t = Array.isArray(tags) ? tags.map(s => String(s||"").toLowerCase()) : [];

  if (x.startsWith("noun") || t.some(s => /^noun/.test(s))) return "Nomen";
  if (x.startsWith("verb") || t.some(s => /^verb/.test(s))) return "Verb";
  if (x.startsWith("adj") || x.startsWith("adjective") || t.some(s => /^adj|^adjective/.test(s))) return "Adjektiv";

  if (x.startsWith("pron")) return "Pronomen";
  if (t.some(s => /(^|[^a-z])pron(oun)?( |$)/.test(s))) return "Pronomen";
  if (t.some(s => /(personal|possessive|demonstrative|relative|interrogative|reflexive|indefinite|reciprocal)[ _-]?pronoun/.test(s))) {
    return "Pronomen";
  }

  if (x.includes("particle")) return "Partikel";
  if (t.some(s => /(modal|focus|degree|negative)[ _-]?particle/.test(s))) return "Partikel";
  if (x.startsWith("adv") || x.startsWith("adverb") || t.some(s => /^adv|^adverb/.test(s))) return "Partikel";
  if (x.startsWith("prep") || x.includes("adposition") || t.some(s => /(^|_)adp($|_)/.test(s)) || t.some(s => /^prep|adposition/.test(s))) return "Partikel";
  if (x.startsWith("conj") || t.some(s => /^conj/.test(s))) return "Partikel";
  if (x.startsWith("interj") || t.some(s => /^interj/.test(s))) return "Partikel";

  return "";
}

/* ---------- CLI ---------- */
const args = process.argv.slice(2);
function argVal(flag){ const i = args.indexOf(flag); return i === -1 ? null : args[i+1]; }
function hasFlag(flag){ return args.includes(flag); }

const dumpPath     = argVal("--dump");
const manifestRoot = argVal("--manifest-root") || "public/index";
const posListArg   = argVal("--pos");      // z. B. "Nomen,Verb,Adjektiv,Pronomen,Partikel"
const caseMode     = (argVal("--case") || "lower").toLowerCase(); // "lower" | "original"
const maxRead      = argVal("--max") ? parseInt(argVal("--max"),10) : Infinity;

if (!dumpPath){
  console.error('Benutzung: node tools/enrich_manifests.js --dump "/Pfad/dump.jsonl[.gz]" --manifest-root public/index [--pos "Nomen,Verb,..."] [--case lower|original] [--max 1000000]');
  process.exit(1);
}

const DEFAULT_POS = new Set(["Nomen","Verb","Adjektiv","Pronomen","Partikel"]);
const FILTER_POS  = (posListArg ? new Set(posListArg.split(",").map(s=>s.trim()).filter(Boolean)) : DEFAULT_POS);

/* ---------- IO ---------- */
function dumpStream(p){
  const rs = fs.createReadStream(p);
  if (p.endsWith(".gz")) return rs.pipe(zlib.createGunzip());
  return rs;
}

function readLemmaList(file){
  try {
    const txt = fs.readFileSync(file, "utf8");
    const arr = JSON.parse(txt);
    if (Array.isArray(arr)) return arr.map(String);
  } catch {}
  return [];
}

function writeLemmaList(file, arr){
  // sortiert, dedupliziert
  const seen = new Set();
  const out = [];
  for (const w of arr){
    const key = w.toLowerCase();
    if (!seen.has(key)){ seen.add(key); out.push(w); }
  }
  out.sort((a,b)=> a.localeCompare(b, "de"));
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(out, null, 0), "utf8");
}

/* ---------- Sammeln der Kandidaten aus Dump ---------- */
(async function main(){
  console.log(`Lese Dump: ${dumpPath}`);
  const rl = readline.createInterface({ input: dumpStream(dumpPath), crlfDelay: Infinity });

  // Präfix → Set(Wörter)
  const bucket = new Map();
  let read = 0, kept = 0, skippedLang = 0, skippedPos = 0;

  for await (const line of rl){
    if (!line || !line.trim()) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    read++;
    if (read > maxRead) break;

    if (!isGerman(obj)) { skippedLang++; continue; }

    const pos = posDE(obj.pos || "", obj.tags);
    if (!pos || !FILTER_POS.has(pos)) { skippedPos++; continue; }

    const wRaw = toCH(obj.word || "");
    if (!wRaw) continue;

    const w = (caseMode === "lower") ? wRaw.toLowerCase() : wRaw;
    const pref = prefix2(w);

    if (!bucket.has(pref)) bucket.set(pref, new Set());
    bucket.get(pref).add(w);
    kept++;
  }

  console.log(`Gelesen: ${read}, behalten: ${kept}, Sprache≠DE: ${skippedLang}, POS verworfen: ${skippedPos}`);
  console.log(`Buckets: ${bucket.size}`);

  // Merge in vorhandene lemmas.json
  let filesTouched = 0, wordsAdded = 0;

  for (const [pref, setWords] of bucket){
    const dir = path.join(manifestRoot, pref);
    const file = path.join(dir, "lemmas.json");

    // Nur dort ergänzen, wo es schon eine Struktur gibt (deine 26×26-Ordner)
    if (!fs.existsSync(file)) continue;

    const existing = readLemmaList(file);
    const existSet = new Set(existing.map(s=>s.toLowerCase()));

    let changed = false;
    for (const w of setWords){
      const key = w.toLowerCase();
      if (!existSet.has(key)){
        existing.push(w);
        existSet.add(key);
        wordsAdded++;
        changed = true;
      }
    }
    if (changed){
      writeLemmaList(file, existing);
      filesTouched++;
      process.stdout.write(`+ ${file}\n`);
    } else {
      process.stdout.write(`= ${file} (keine neuen Wörter)\n`);
    }
  }

  console.log(`\nFertig.
angepasste Dateien: ${filesTouched}
neu hinzugefügte Wörter: ${wordsAdded}`);
})();
