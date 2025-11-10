// tools/extract_defs.js
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

/* ---------- Utilities (selbständig) ---------- */
function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
function norm(s){
  return String(s||"")
    .normalize("NFKC").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss");
}
function prefix2(w){ const k = norm(w); return (k[0]||"_") + (k[1]||"_"); }
function nowUnix(){ return Math.floor(Date.now()/1000); }

/** Basename für Dateien hart absichern (keine Slashes, nur a–z0–9 und '-') */
function safeBase(w){
  const k = norm(w);
  const b = k.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g,"");
  return b || "_";
}

/**
 * POS-Erkennung strikt auf:
 * - Nomen
 * - Verb
 * - Adjektiv
 * - Pronomen
 * - Partikel  (einschliesslich: adverb, adposition/präposition, conjunction, interjection,
 *              sowie particle: modal/focus/degree/negative)
 * Alles andere -> "" (kein POS, keine Tags).
 */
function posDE(p, tags){
  const x = String(p || "").toLowerCase();
  const t = Array.isArray(tags) ? tags.map(s => String(s||"").toLowerCase()) : [];

  // Nomen / Verb / Adjektiv
  if (x.startsWith("noun")) return "Nomen";
  if (x.startsWith("verb")) return "Verb";
  if (x.startsWith("adj") || x.startsWith("adjective")) return "Adjektiv";
  if (t.some(s => /^noun/.test(s))) return "Nomen";
  if (t.some(s => /^verb/.test(s))) return "Verb";
  if (t.some(s => /^adj|^adjective/.test(s))) return "Adjektiv";

  // Pronomen
  if (x.startsWith("pron")) return "Pronomen";
  if (t.some(s => /(^|[^a-z])pron(oun)?( |$)/.test(s))) return "Pronomen";
  if (t.some(s => /(personal|possessive|demonstrative|relative|interrogative|reflexive|indefinite|reciprocal)[ _-]?pronoun/.test(s))) {
    return "Pronomen";
  }

  // Partikel (breit gefasst)
  if (x.includes("particle")) return "Partikel";
  if (t.some(s => /(modal|focus|degree|negative)[ _-]?particle/.test(s))) return "Partikel";
  if (x.startsWith("adv") || x.startsWith("adverb")) return "Partikel";
  if (t.some(s => /^adv|^adverb/.test(s))) return "Partikel";
  if (x.startsWith("prep") || x.includes("adposition") || t.some(s => /(^|_)adp($|_)/.test(s))) return "Partikel"; // Präpositionen
  if (t.some(s => /^prep|adposition/.test(s))) return "Partikel";
  if (x.startsWith("conj")) return "Partikel";      // Konjunktionen
  if (t.some(s => /^conj/.test(s))) return "Partikel";
  if (x.startsWith("interj")) return "Partikel";    // Interjektionen
  if (t.some(s => /^interj/.test(s))) return "Partikel";

  // Alles andere ignorieren
  return "";
}

function quoteDe(s){
  if(!s) return "";
  const t = String(s).trim().replace(/^["“”'«»]+|["“”'«»]+$/g,"");
  return "„"+t+"“";
}
function isGerman(obj){
  const l = (obj.lang || "").toLowerCase().trim();
  const lc = (obj.lang_code || "").toLowerCase().trim();
  return l === "german" || l === "deutsch" || lc === "de";
}
function pickBestSense(obj){
  if (Array.isArray(obj.senses) && obj.senses.length){
    const candidates = obj.senses
      .map(s => {
        const gloss = Array.isArray(s.glosses) && s.glosses.length ? s.glosses[0] : (s.definition || "");
        return gloss ? String(gloss) : "";
      })
      .filter(Boolean);
    if (candidates.length){
      candidates.sort((a,b)=>a.length-b.length);
      return candidates[0];
    }
  }
  return "";
}
function pickExample(obj){
  if (Array.isArray(obj.examples) && obj.examples.length){
    const e = obj.examples.find(e => e && e.text);
    if (e && e.text) return String(e.text);
  }
  return "";
}
function mapEntry(obj){
  const wortRaw = obj.word || "";
  const wort = toCH(wortRaw);
  const pos  = posDE(obj.pos || "", obj.tags);
  const sense = toCH(pickBestSense(obj));
  const beisp = toCH(pickExample(obj));
  const out = {
    wort,
    def_src: { pos, sense },
    def_kid: null,
    beispiele: beisp ? [quoteDe(beisp)] : [],
    tags: pos ? [pos] : [],           // nur Tag, wenn POS in der erlaubten Menge
    source: "wiktionary",
    via: "wiktextract",
    license: "CC-BY-SA 4.0",
    ts_cached: nowUnix()
  };
  if (Array.isArray(obj.hyphenation) && obj.hyphenation.length) {
    out.silben = obj.hyphenation.map(String);
  }
  return out;
}
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
  const file = path.join(dir, `${safeBase(w)}.json`); // <- sanitised filename
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
  const foundNorm = new Set();
  const stats = { written:0, existed:0, skippedLang:0, read:0 };

  const rl = readline.createInterface({ input: dumpStream(dumpPath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (stats.written >= maxOut) break;
    if (wanted.size === 0) break;
    if (!line || !line.trim()) continue;

    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    stats.read++;

    if (!isGerman(obj)) { stats.skippedLang++; continue; }

    const w = obj.word;
    if (!w) continue;

    const key = norm(w);
    if (!wanted.has(key)) continue;
    if (foundNorm.has(key)) continue;

    const mapped = mapEntry(obj);

    const origSet = wanted.get(key);
    const repr = origSet ? Array.from(origSet)[0] : w;

    if (writeOnceIfNew(repr, mapped, stats)) {
      foundNorm.add(key);
    }

    wanted.delete(key);
  }

  const notFound = Array.from(wanted.keys()).flatMap(k => Array.from(wanted.get(k) || []));
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
