// tools/extract_defs_lib.js
const toCH = (s) => String(s || "").replace(/ß/g, "ss");
const norm = (s) =>
  String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
const prefix2 = (w) => { const k = norm(w); return (k[0] || "_") + (k[1] || "_"); };
const nowUnix = () => Math.floor(Date.now() / 1000);

function posDE(p, tags) {
  const x = String(p || "").toLowerCase();
  if (x.includes("proper")) return "Eigenname";
  if (x.startsWith("noun")) return "Nomen";
  if (x.startsWith("verb")) return "Verb";
  if (x.startsWith("adj") || x.startsWith("adjective")) return "Adjektiv";
  if (x.startsWith("adv") || x.startsWith("adverb")) return "Adverb";
  const t = Array.isArray(tags) ? tags.map((s) => String(s || "").toLowerCase()) : [];
  if (t.some((s) => /proper_noun|proper-noun|proper/.test(s))) return "Eigenname";
  if (t.some((s) => /^noun/.test(s))) return "Nomen";
  if (t.some((s) => /^verb/.test(s))) return "Verb";
  if (t.some((s) => /^adj|^adjective/.test(s))) return "Adjektiv";
  if (t.some((s) => /^adv|^adverb/.test(s))) return "Adverb";
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
  const wort = toCH(obj.word || "");
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

module.exports = {
  toCH, norm, prefix2, nowUnix,
  posDE, quoteDe, isGerman,
  pickBestSense, pickExample, mapEntry
};
