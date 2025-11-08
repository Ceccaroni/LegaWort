const BASE = "/LegaWort/public/data/defs";
const REMOTE_BASE = "https://kaikki.org/dictionary/German/words";
const TTL_DAYS = 180;
const inflight = new Map(); // wort -> Promise

function norm(s){
  return (s||"").toLowerCase()
    .normalize("NFKC")
    .replace(/ß/g,"ss")
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue");
}
function cacheKey(w){ return `def:${w}`; }
function getCache(w){
  try {
    const raw = localStorage.getItem(cacheKey(w));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const age = (Date.now() - (obj.ts_cached||0)) / 86400000;
    if (age > TTL_DAYS) return null;
    return obj;
  } catch { return null; }
}
function setCache(w, data){
  try { localStorage.setItem(cacheKey(w), JSON.stringify({...data, ts_cached: Date.now()})); } catch {}
}
function defPath(w){
  const n = norm(w);
  const p = (n.slice(0,2).replace(/[^a-z]/g,"_") || "_");
  const f = (n.replace(/[^a-z0-9_]/g,"_") || "_");
  return `${BASE}/${p}/${f}.json`;
}
async function fetchLocalDef(w){
  const url = defPath(w);
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`404 ${url}`);
  return await res.json();
}

const POS_MAP = {
  noun: "Nomen",
  "proper-noun": "Eigenname",
  verb: "Verb",
  adjective: "Adjektiv",
  adverb: "Adverb",
  interjection: "Interjektion",
  preposition: "Präposition",
  conjunction: "Konjunktion",
  pronoun: "Pronomen",
  numeral: "Numerale",
  article: "Artikel",
  determiner: "Determinativ",
  particle: "Partikel",
  suffix: "Suffix",
  prefix: "Präfix"
};

function titleCase(str){
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTag(tag){
  const cleaned = String(tag).replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (POS_MAP[lower]) return POS_MAP[lower];
  return cleaned.split(" ").map(titleCase).join(" ");
}

function pickSense(entry){
  if (!entry) return null;
  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  return senses.find(s => (s && ((Array.isArray(s.glosses) && s.glosses.length) || (Array.isArray(s.raw_glosses) && s.raw_glosses.length)))) || senses[0] || null;
}

function collectExamples(entry, sense){
  const out = [];
  const pushExample = (ex) => {
    if (!ex) return;
    if (typeof ex === "string") {
      out.push(ex);
      return;
    }
    if (ex.text) out.push(ex.text);
  };
  if (sense && Array.isArray(sense.examples)) sense.examples.forEach(pushExample);
  if (!out.length && entry && Array.isArray(entry.examples)) entry.examples.forEach(pushExample);
  return out;
}

function dedupe(arr){
  return Array.from(new Set(arr.filter(Boolean)));
}

function mapWiktextract(wort, raw){
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!entries.length) return null;
  const n = norm(wort);
  const entry = entries.find(e => e && norm(e.word || "") === n) || entries[0];
  if (!entry) return null;
  const sense = pickSense(entry);
  const gloss = sense && Array.isArray(sense.glosses) && sense.glosses.length ? sense.glosses[0] : sense && Array.isArray(sense.raw_glosses) && sense.raw_glosses.length ? sense.raw_glosses[0] : "";
  const posRaw = (sense && sense.pos) || entry.pos || "";
  const posKey = posRaw && posRaw.toLowerCase().replace(/\s+/g, "-");
  const pos = POS_MAP[posRaw] || POS_MAP[posKey] || (posRaw ? titleCase(posRaw.replace(/[-_]/g, " ")) : null);
  const tags = dedupe([
    ...((entry && Array.isArray(entry.tags)) ? entry.tags.map(formatTag) : []),
    ...((sense && Array.isArray(sense.tags)) ? sense.tags.map(formatTag) : [])
  ]);
  const examples = collectExamples(entry, sense);
  return {
    wort: entry.word || wort,
    def_src: gloss ? { pos: pos || null, sense: gloss } : (pos ? { pos, sense: "" } : null),
    def_kid: null,
    beispiele: examples,
    tags,
    source: "wiktionary",
    via: "wiktextract",
    license: "CC-BY-SA 4.0"
  };
}

async function fetchRemoteDef(w){
  const url = `${REMOTE_BASE}/${encodeURIComponent(w)}.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`remote ${res.status} ${url}`);
  const data = await res.json();
  const mapped = mapWiktextract(w, data);
  if (!mapped) throw new Error(`no remote def ${w}`);
  return mapped;
}

window.WortDB = window.WortDB || {};
window.WortDB.getDefinition = async function (wort) {
  const c = getCache(wort);
  if (c) {
    console.info("def cache hit", wort);
    return c;
  }

  if (inflight.has(wort)) return inflight.get(wort);

  const p = (async () => {
    try {
      const obj = await fetchLocalDef(wort);
      console.info("def local fetch", wort);
      setCache(wort, obj);
      return obj;
    } catch {}

    try {
      const obj = await fetchRemoteDef(wort);
      console.info("def remote fetch", wort);
      setCache(wort, obj);
      return obj;
    } catch {}

    return {
      wort,
      def_kid: null,
      beispiele: [],
      tags: [],
      source: "none",
      license: null,
      ts_cached: Date.now(),
    };
  })();

  inflight.set(wort, p);
  try {
    return await p;
  } finally {
    inflight.delete(wort);
  }
};

window.WortDB.exportCache = function(){
  try {
    const lines = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("def:")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        lines.push(JSON.stringify(obj));
      } catch {}
    }
    if (!lines.length) return null;
    const blob = new Blob(lines.map(line => `${line}\n`), { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "defs_cache.jsonl";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return null;
  }
};
