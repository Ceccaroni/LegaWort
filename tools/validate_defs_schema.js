// tools/validate_defs_schema.js
// Prüft alle erzeugten Definitions-JSONs auf Mindestschema.
// Lauf:  node tools/validate_defs_schema.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join("public", "data", "defs");

function isDir(p){ try{ return fs.statSync(p).isDirectory(); } catch{ return false; } }
function isFile(p){ try{ return fs.statSync(p).isFile(); } catch{ return false; } }

function* walk(dir){
  for (const name of fs.readdirSync(dir)){
    const p = path.join(dir, name);
    if (isDir(p)) yield* walk(p);
    else if (isFile(p) && p.endsWith(".json")) yield p;
  }
}

function validateOne(obj, file){
  const errs = [];
  if (typeof obj !== "object" || !obj) errs.push("kein Objekt");
  if (!obj.wort) errs.push("feld 'wort' fehlt");
  if (!obj.def_src) errs.push("feld 'def_src' fehlt");
  if (obj.def_src && typeof obj.def_src.pos === "undefined") errs.push("def_src.pos fehlt");
  if (obj.def_src && typeof obj.def_src.sense === "undefined") errs.push("def_src.sense fehlt");
  if (obj.via !== "wiktextract") errs.push("via != 'wiktextract'");
  if (obj.source !== "wiktionary") errs.push("source != 'wiktionary'");
  if (obj.license !== "CC-BY-SA 4.0") errs.push("license != 'CC-BY-SA 4.0'");
  if (typeof obj.ts_cached !== "number") errs.push("ts_cached kein number");
  if (!Array.isArray(obj.beispiele)) errs.push("beispiele nicht array");
  if (!Array.isArray(obj.tags)) errs.push("tags nicht array");
  if (errs.length) throw new Error(`${file}: ${errs.join(", ")}`);
}

(function main(){
  if (!isDir(ROOT)) {
    console.log("Hinweis: Kein defs-Verzeichnis gefunden, überspringe Prüfung.");
    process.exit(0);
  }
  let ok = 0, total = 0;
  const problems = [];
  for (const file of walk(ROOT)){
    total++;
    try {
      const raw = fs.readFileSync(file, "utf8");
      const obj = JSON.parse(raw);
      validateOne(obj, file);
      ok++;
    } catch(e){
      problems.push(e.message);
    }
  }
  if (problems.length){
    console.error("Schema-Probleme:\n" + problems.join("\n"));
    process.exit(1);
  }
  console.log(`Schema-Check OK: ${ok}/${total} Dateien gültig.`);
})();
