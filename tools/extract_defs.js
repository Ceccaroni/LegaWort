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
function posDE(p, tags){
  const x = String(p||"").toLowerCase();
  if (x.includes("proper")) return "Eigenname";
  if (x.startsWith("noun")) return "Nomen";
  if (x.startsWith("verb")) return "Verb";
  if (x.startsWith("adj") || x.startsWith("adjective")) return "Adjektiv";
  if (x.startsWith("adv") || x.startsWith("adverb")) return "Adverb";
  const t = Array.isArray(tags) ? tags.map(s=>String(s||"").toLowerCase()) : [];
  if (t.some(s => /proper_noun|proper-noun|proper/.test(s))) return "Eigenname";
  if (t.some(s => /^noun/.test(s))) return "Nomen";
  if (t.some(s => /^verb/.test(s))) return "Verb";
  if (t.some(s => /^adj|^adjective/.test(s))) return "Adjektiv";
  if (t.some(s => /^adv|^adverb/.test(s))) return "Adverb";
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
    tags: pos ? [pos] : [],
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
  const file = path.join(dir, `${norm(w)}.json`);
  return { dir, file };
}
function writeOnceIfNew(w, mapped, stats){
  const { dir, file } = outPathFor(w);
  ensureDir(dir);
  if (!overwrite &
