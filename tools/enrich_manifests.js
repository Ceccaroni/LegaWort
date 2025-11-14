/**
 * tools/enrich_manifests.js
 * Erweitert die bestehenden Objekt-Manifeste (public/index/<xx>/lemmas.json).
 * Neu: Einträge sind Entry-Objekte, keine Strings mehr.
 */

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

/* ---------- Entry-Objekt ---------- */
function makeEntry(wort){
  return {
    wort,
    pos: null,
    def: null,
    silben: [],
    source: "manifest"
  };
}

/* ---------- CLI ---------- */
const args = process.argv.slice(2);
function argVal(flag){ const i = args.indexOf(flag); return i === -1 ? null : args[i+1]; }

const dumpPath     = argVal("--dump");
const manifestRoot = argVal("--manifest-root") || "public/index";

if (!dumpPath){
  console.error('Benutzung: node tools/enrich_manifests.js --dump "/Pfad/dump.jsonl[.gz]" --manifest-root public/index');
  process.exit(1);
}

const DEFAULT_POS = new Set(["Nomen","Verb","Adjektiv","Pronomen","Partikel"]);

/* POS-Mapping, wie gehabt */
function posDE(p, tags){
  const x = String(p || "").toLowerCase();
  const t = Array.isArray(tags) ? tags.map(s => String(s||"").toLowerCase()) : [];

  if (x.startsWith("noun") || t.some(s => /^noun/.test(s))) return "Nomen";
  if (x.startsWith("verb") || t.some(s => /^verb/.test(s))) return "Verb";
  if (x.startsWith("adj") || x.startsWith("adjective") || t.some(s => /^adj|^adjective/.test(s))) return "Adjektiv";
  if (x.startsWith("pron")) return "Pronomen";
  if (t.some(s => /(personal|possessive|demonstrative|relative|interrogative|reflexive|indefinite|reciprocal)[ _-]?pronoun/.test(s))) return "Pronomen";
  if (x.includes("particle")) return "Partikel";
  if (t.some(s => /(modal|focus|degree|negative)[ _-]?particle/.test(s))) return "Partikel";
  if (x.startsWith("adv") || x.startsWith("adverb")) return "Partikel";
  if (x.startsWith("prep") || x.includes("adposition") || t.some(s => /^prep|adposition/.test(s))) return "Partikel";
  if (x.startsWith("conj")) return "Partikel";
  if (x.startsWith("interj")) return "Partikel";

  return "";
}

/* ---------- IO ---------- */
function dumpStream(p){
  const rs = fs.createReadStream(p);
  if (p.endsWith(".gz")) return rs.pipe(zlib.createGunzip());
  return rs;
}

function readEntries(file){
  try {
    const txt = fs.readFileSync(file, "utf8");
    const json = JSON.parse(txt);
    if (Array.isArray(json)) return json;
  } catch {}
  return [];
}

function writeEntries(file, arr){
  // deduplizieren anhand wort
  const seen = new Set();
  const out = [];
  for (const e of arr){
    if (!e || !e.wort) continue;
    const key = e.wort.toLowerCase();
    if (!seen.has(key)){
      seen.add(key);
      out.push(e);
    }
  }
  out.sort((a,b)=> a.wort.localeCompare(b.wort, "de"));
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(out, null, 0), "utf8");
}

/* ---------- Aus Dump lesen ---------- */
(async function main(){
  console.log(`Lese Dump: ${dumpPath}`);

  const rl = readline.createInterface({ input: dumpStream(dumpPath), crlfDelay: Infinity });
  const bucket = new Map(); // prefix -> Set(wörter)

  for await (const line of rl){
    if (!line || !line.trim()) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    if (!isGerman(obj)) continue;

    const pos = posDE(obj.pos || "", obj.tags);
    if (!pos || !DEFAULT_POS.has(pos)) continue;

    const raw = toCH(obj.word || "");
    if (!raw) continue;

    const lemma = raw.toLowerCase();
    const pref = prefix2(lemma);

    if (!bucket.has(pref)) bucket.set(pref, new Set());
    bucket.get(pref).add(lemma);
  }

  // Bestehende Manifest-Dateien anreichern
  for (const [pref, setWords] of bucket){
    const dir = path.join(manifestRoot, pref);
    const file = path.join(dir, "lemmas.json");

    if (!fs.existsSync(file)) continue;

    const existing = readEntries(file);

    // Map für existierende Einträge (Stringvergleich)
    const existSet = new Set(existing.map(e=> String(e.wort||"").toLowerCase()));

    let changed = false;

    for (const w of setWords){
      if (!existSet.has(w)){
        existing.push(makeEntry(w));
        existSet.add(w);
        changed = true;
      }
    }

    if (changed){
      writeEntries(file, existing);
      console.log(`+ ${file}`);
    } else {
      console.log(`= ${file}`);
    }
  }

  console.log("Fertig. Alle Manifeste aktualisiert.");
})();
