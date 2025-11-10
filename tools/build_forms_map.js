// tools/build_forms_map.js
// Baut eine Map "gebeugte Form" (norm) -> "Grundform" (norm) aus dem Kaikki/Wiktextract-Dump.
// Unterstützt zwei Pfade:
//  A) Eintrag ist eine Form:   nutzt inflection_of / form_of / alt_of
//  B) Eintrag ist ein Lemma:   nutzt forms[] und mappt jede forms[i].form -> word
//
// Aufruf:
//   node tools/build_forms_map.js --dump "/Pfad/dump.jsonl[.gz]" --out public/index/forms.map.json
//
// Hinweis: Keys/Values sind normalisiert (NFKC, lowercase, ae/oe/ue/ss).

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

/* ---------- Utils ---------- */
function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
function norm(s){
  return toCH(String(s||"")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue"));
}
function isGerman(o){
  const l = (o.lang||"").toLowerCase().trim();
  const lc = (o.lang_code||"").toLowerCase().trim();
  return l === "german" || l === "deutsch" || lc === "de";
}
function argVal(argv, flag){ const i = argv.indexOf(flag); return i === -1 ? null : argv[i+1]; }
function dumpStream(p){ const rs = fs.createReadStream(p); return p.endsWith(".gz") ? rs.pipe(zlib.createGunzip()) : rs; }

/* ---------- Lemma-Kandidaten aus Relation-Arrays ---------- */
function lemmaCandidatesFromRelations(obj){
  const out = new Set();

  const arrays = ["inflection_of", "form_of", "alt_of"];
  for (const key of arrays){
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    for (const it of arr){
      const w = it && (it.word || it.source || it.target || it.lemma);
      if (w) out.add(String(w));
    }
  }
  return Array.from(out);
}

/* ---------- Formen aus forms[] ---------- */
function formsFromLemma(obj){
  const res = [];
  if (Array.isArray(obj.forms)){
    for (const f of obj.forms){
      // Wiktextract: Einträge wie { form: "...", tags:[...] }
      if (f && f.form){
        res.push(String(f.form));
      }
    }
  }
  return res;
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

  const map = new Map(); // form(norm) -> lemma(norm)
  let read=0, kept=0, skippedLang=0, aHits=0, bHits=0;

  const rl = readline.createInterface({ input: dumpStream(dump), crlfDelay: Infinity });

  for await (const line of rl){
    if (!line || !line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    read++;

    if (!isGerman(o)) { skippedLang++; continue; }

    const word = o.word ? String(o.word) : "";
    const nWord = norm(word);

    // Pfad A: Eintrag ist eine Form, die auf Lemma verweist (Relations)
    const lemmasA = lemmaCandidatesFromRelations(o).map(norm).filter(Boolean);
    if (nWord && lemmasA.length){
      const nLemma = lemmasA[0];
      if (nLemma && nLemma !== nWord && !map.has(nWord)){
        map.set(nWord, nLemma);
        kept++;
        aHits++;
      }
    }

    // Pfad B: Eintrag ist Lemma mit Formenliste
    // word = Lemma, forms[].form = Flexionsform
    const formsB = formsFromLemma(o).map(norm).filter(Boolean);
    if (nWord && formsB.length){
      for (const nForm of formsB){
        if (!nForm) continue;
        if (nForm === nWord) continue;
        if (!map.has(nForm)){
          map.set(nForm, nWord);
          kept++;
          bHits++;
        }
      }
    }
  }

  const obj = Object.fromEntries(map);
  fs.mkdirSync(path.dirname(out), { recursive:true });
  fs.writeFileSync(out, JSON.stringify(obj), "utf8");

  console.log(`Fertig.
Gelesen: ${read}
Einträge (Form→Lemma): ${kept}
Treffer A (Relations): ${aHits}
Treffer B (forms[]):   ${bHits}
Übersprungen (Sprache≠DE): ${skippedLang}
Datei: ${out}`);
})();
