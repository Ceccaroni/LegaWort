const BASE = "/LegaWort/public/data/defs";
const TTL_DAYS = 180;

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
async function fetchDef(w){
  const url = defPath(w);
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`404 ${url}`);
  return await res.json();
}

window.WortDB = window.WortDB || {};
window.WortDB.getDefinition = async function(wort){
  const c = getCache(wort);
  if (c) return c;
  try {
    const obj = await fetchDef(wort);
    setCache(wort, obj);
    return obj;
  } catch {
    return { wort, def_kid: null, beispiele: [], tags: [], source: "none", license: null };
  }
};
