// tools/build_forms_map.js
// Baut eine Map gebeugte Form (norm) -> Grundform (norm) aus dem Kaikki/Wiktextract-Dump.
//
// Nutzung:
//   node tools/build_forms_map.js --dump "/Pfad/dump.jsonl[.gz]" --out public/index/forms.map.json
//
// Hinweis:
//  - Wiktextract verwendet für Flexionsangaben i. d. R. `inflection_of` (DE).
//  - Wir unterstützen: inflection_of, form_of, alt_of (Fallback).
//  - Es wird nur DE ausgewertet. Keys sind normalisiert (ae/oe/ue/ss, lowercase).

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

/* ---------- Utils ---------- */
function norm(s){
  return String(s||"")
    .normalize("NFKC").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss");
}
function isGerman(o){
  const l = (o.lang||"").toLowerCase().trim();
  const lc = (o.lang_code||"").toLowerCase().trim();
  return l === "german" || l === "deutsch" || lc === "de";
}
function argVal(argv, flag){ const i = argv.indexOf(flag); return i === -1 ? null : argv[i+1]; }
function dumpStream(p){ const rs = fs.createReadStream(p); return p.endsWith(".gz") ? rs.pipe(zlib.createGunzip()) : rs; }

/* ---------- Lemma-Extraktion ---------- */
function lemmaCandidates(obj){
  const out = new Set();

  // 1) Bevorzugt: inflection_of (DE-üblich)
  if (Array.isArray(obj.inflection_of)){
    for (const it of obj.inflection_of){
      const w = it && (it.word || it.source || it.target || it.lemma);
      if (w) out.add(String(w));
    }
  }

  // 2) form_of (anderes Feld, selten)
  if (Array.isArray(obj.form_of)){
    for (const it of obj.form_of){
      const w = it && (it.word || it.source || it.target || it.lemma);
      if (w) out.add(String(w));
    }
  }

  // 3) alt_of (orthographische Varianten)
  if (Array.isArray(obj.alt_of)){
    for (const it of obj.alt_of){
      const w = it && (it.word || it.source || it.target || it.lemma);
      if (w) out.add(String(w));
    }
  }

  // 4) Fallback: nichts
  return Array.from(out);
}

/* ---------- Main ---------- */
(async function main(){
  const args = process.argv.slice(2);
  const dump = argVal(args, "--dump");
  const out  = argVal(args, "--out") || "public/index/forms.map.json";
  if (!dump){
    console.error('Benutzung: node tools/build_forms_map.js --dump "/Pfad/dump.jsonl[.gz]" --out public/index/forms.map.json');
    process.exit(1);
  }

  const map = new Map(); // form(norm) -> lemma(norm) (erstes Vorkommen gewinnt)
  let read = 0, kept = 0, skippedLang = 0, withoutLemma = 0;

  const rl = readline.createInterface({ input: dumpStream(dump), crlfDelay: Infinity });
  for await (const line of rl){
    if (!line || !line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    read++;

    if (!isGerman(o)) { skippedLang++; continue; }

    const form = o.word;
    if (!form) { withoutLemma++; continue; }
    const nForm = norm(form);

    const lemmas = lemmaCandidates(o).map(norm).filter(Boolean);

    // Nur eintragen, wenn es mind. einen Lemma-Kandidaten gibt
    if (lemmas.length){
      const nLemma = lemmas[0]; // erstes Vorkommen reicht
      if (nLemma && nLemma !== nForm && !map.has(nForm)){
        map.set(nForm, nLemma);
        kept++;
      }
    } else {
      withoutLemma++;
    }
  }

  const obj = Object.fromEntries(map);
  fs.mkdirSync(path.dirname(out), { recursive:true });
  fs.writeFileSync(out, JSON.stringify(obj), "utf8");

  console.log(`Fertig.
Gelesen: ${read}
Einträge (Form→Lemma): ${kept}
Übersprungen (Sprache≠DE): ${skippedLang}
Ohne Lemmahinweis: ${withoutLemma}
Datei: ${out}`);
})();
