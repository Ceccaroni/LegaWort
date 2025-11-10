// Aufruf: node tools/build_manifests.js /pfad/zur/1_6M_woerterliste.txt
// Eingabeformat: EIN Wort pro Zeile (JSON-Array wird auch robust "entklammert").

import { createReadStream, mkdirSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { dirname } from "path";

const inFile = process.argv[2];
if (!inFile) { console.error("Pfad zur Wörterliste fehlt."); process.exit(1); }

const OUT_DIR = "public/index";
mkdirSync(OUT_DIR, { recursive: true });

function norm(s){
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g,"ss")
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue")
    .replace(/[^a-z0-9]/g,""); // nur a–z0–9 für Lemma-Index
}
function prefixOf(k){
  const a = k[0] ?? "_";
  const b = k[1] ?? "_";
  return a + b;
}

const buckets = new Map(); // "aa" -> Set()
function add(k, w){
  if (!k) return;
  if (!buckets.has(k)) buckets.set(k, new Set());
  buckets.get(k).add(w);
}

const rl = createInterface({ input: createReadStream(inFile, { encoding:"utf8" }) });

rl.on("line", (line) => {
  let raw = line.trim();
  if (!raw || raw === "[" || raw === "]") return;
  raw = raw.replace(/^"+|"+$/g,"").replace(/,$/,""); // Zeilen wie "Wort", säubern
  if (!raw) return;
  const k = norm(raw);
  if (!k) return;
  add(prefixOf(k), k);
});

rl.on("close", () => {
  for (const [pref, set] of buckets) {
    const arr = Array.from(set).sort();
    const dir = `${OUT_DIR}/${pref}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/lemmas.json`, JSON.stringify(arr), "utf8");
  }
  console.log(`Fertig. Ordner '${OUT_DIR}/<prefix>/lemmas.json' erstellt.`);
});
