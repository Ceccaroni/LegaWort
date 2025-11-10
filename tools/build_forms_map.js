// tools/build_forms_map.js
// Erzeugt eine Map form(norm) -> lemma(norm) aus dem Kaikki/Wiktextract-Dump.
// Nutzung:
//   node tools/build_forms_map.js --dump "/Pfad/dump.jsonl[.gz]" --out public/index/forms.map.json
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

function norm(s){
  return String(s||"").normalize("NFKC").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss");
}
function isGerman(o){
  const l=(o.lang||"").toLowerCase().trim(), c=(o.lang_code||"").toLowerCase().trim();
  return l==="german"||l==="deutsch"||c==="de";
}
function argVal(argv, flag){ const i=argv.indexOf(flag); return i===-1?null:argv[i+1]; }
function dumpStream(p){ const rs=fs.createReadStream(p); return p.endsWith(".gz")?rs.pipe(zlib.createGunzip()):rs; }

(async function main(){
  const args = process.argv.slice(2);
  const dump = argVal(args, "--dump");
  const out  = argVal(args, "--out") || "public/index/forms.map.json";
  if (!dump){
    console.error('Benutzung: node tools/build_forms_map.js --dump "/Pfad/dump.jsonl[.gz]" --out public/index/forms.map.json');
    process.exit(1);
  }

  const map = new Map(); // form(norm) -> lemma(norm) (erstes Vorkommen)
  let read=0, kept=0;

  const rl = readline.createInterface({ input: dumpStream(dump), crlfDelay: Infinity });
  for await (const line of rl){
    if (!line || !line.trim()) continue;
    let o; try{ o=JSON.parse(line); }catch{ continue; }
    read++;
    if (!isGerman(o)) continue;

    const w = o.word; if (!w) continue;
    const nForm = norm(w);

    if (Array.isArray(o.form_of) && o.form_of.length){
      for (const f of o.form_of){
        const lemma = f.word || f.source || null;
        if (!lemma) continue;
        const nLemma = norm(lemma);
        if (!map.has(nForm)){
          map.set(nForm, nLemma);
          kept++;
        }
      }
    }
  }

  const obj = Object.fromEntries(map);
  fs.mkdirSync(path.dirname(out), { recursive:true });
  fs.writeFileSync(out, JSON.stringify(obj), "utf8");
  console.log(`Fertig. Gelesen: ${read}, Einträge: ${kept}, Datei: ${out}`);
})();
