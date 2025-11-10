// Aufruf-Beispiel:
//   node tools/extract_defs.js --dump "/Pfad/wiktextract-de.jsonl" --wordfile needs.txt
//
// Erzeugt: public/data/defs/<xx>/<lemma>.json (xx = 2 Buchstaben, normalisiert)

const fs = require("fs");
const readline = require("readline");
const path = require("path");

function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
function norm(s){
  return String(s||"")
    .normalize("NFKC").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss");
}
function prefix2(w){ const k = norm(w); return (k[0]||"_") + (k[1]||"_"); }
function posDE(p){
  const m = { noun:"Nomen", verb:"Verb", adjective:"Adjektiv", adj:"Adjektiv", adverb:"Adverb", proper_noun:"Eigenname" };
  return m[p] || p || "";
}
function quoteDe(s){
  if(!s) return "";
  const t = String(s).trim().replace(/^["“”'«»]+|["“”'«»]+$/g,"");
  return "„"+t+"“";
}

// Args
const args = process.argv.slice(2);
const dumpIdx = args.indexOf("--dump");
const wordsIdx = args.indexOf("--words");
const fileIdx  = args.indexOf("--wordfile");
if (dumpIdx === -1 || (wordsIdx === -1 && fileIdx === -1)) {
  console.error("Benutzung:\n  node tools/extract_defs.js --dump \"/Pfad/wiktextract-de.jsonl\" (--words \"aachen,aarau\" | --wordfile needs.txt)");
  process.exit(1);
}
const dumpPath = args[dumpIdx+1];
let wanted = new Set();
if (wordsIdx !== -1) {
  String(args[wordsIdx+1]).split(",").map(s=>s.trim()).filter(Boolean).forEach(w=>wanted.add(w));
} else {
  const list = fs.readFileSync(args[fileIdx+1], "utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  list.forEach(w=>wanted.add(w));
}

const OUT_ROOT = "public/data/defs";
fs.mkdirSync(OUT_ROOT, { recursive: true });

// Mapping einer Wiktextract-Zeile (Objekt) auf unser Schema (nur 1. Sinn kurz)
function mapEntry(obj){
  const wort = obj.word || "";
  const pos  = posDE(obj.pos || "");
  const sense = obj.senses && obj.senses[0] && (obj.senses[0].glosses?.[0] || obj.senses[0].definition || "");
  const beisp = obj.examples && obj.examples[0] && obj.examples[0].text || "";
  const out = {
    wort,
    def_src: { pos, sense: toCH(sense) },
    def_kid: null,
    beispiele: beisp ? [quoteDe(toCH(beisp))] : [],
    tags: pos ? [pos] : [],
    source: "wiktionary",
    via: "wiktextract",
    license: "CC-BY-SA 4.0",
    ts_cached: 0
  };
  if (Array.isArray(obj.hyphenation) && obj.hyphenation.length) {
    out.silben = obj.hyphenation;
  }
  return out;
}

// Zeilenweise lesen, nur gewünschte Wörter sammeln, 1 Datei pro Wort (falls noch nicht existiert)
const found = new Map(); // wort -> gemapptes Objekt (nur erster passender Eintrag)
const rl = readline.createInterface({ input: fs.createReadStream(dumpPath, { encoding:"utf8" }) });

rl.on("line", (line) => {
  if (wanted.size === 0) return; // alles schon gefunden
  if (!line || !line.trim()) return;
  let obj;
  try { obj = JSON.parse(line); } catch { return; }

  const w = obj.word;
  if (!w || !wanted.has(w)) return;

  // Nur einmal pro Wort
  if (!found.has(w)) {
    const mapped = mapEntry(obj);
    found.set(w, mapped);
    // sofort schreiben, wenn Ziel nicht existiert
    const pref = prefix2(w);
    const dir  = path.join(OUT_ROOT, pref);
    const file = path.join(dir, `${norm(w)}.json`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(mapped), "utf8");
      process.stdout.write(`+ ${file}\n`);
    } else {
      process.stdout.write(`= existiert: ${file}\n`);
    }
    wanted.delete(w);
  }
});

rl.on("close", () => {
  if (wanted.size > 0) {
    console.error("Nicht gefunden:", Array.from(wanted).join(", "));
  } else {
    console.log("Fertig.");
  }
});

