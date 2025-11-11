// web/forms_search_patch.js
(function(){
  function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
  function norm(s){
    return toCH(String(s||"").normalize("NFKC").toLowerCase()
      .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue"));
  }
  const FORMS_URL = "public/index/forms.map.json";
  let formsMap = null, loadPromise = null;

  async function loadFormsMap(){
    if (formsMap) return formsMap;
    if (!loadPromise){
      loadPromise = fetch(FORMS_URL, { cache:"no-store" })
        .then(r => { if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
        .then(x => (formsMap = x||{}))
        .catch(e => { console.warn("[forms_search_patch] forms.map.json:", e.message); return (formsMap = {}); });
    }
    return loadPromise;
  }
  function normalizeHit(h){
    if (!h) return null;
    if (typeof h === "string") return { word: h, score: 1 };
    if (typeof h.word === "string") return h;
    return null;
  }
  function install(){
    const g = window;
    const MS = g && g.ManifestSearch;
    if (!MS || typeof MS.search !== "function") return false;

    const original = MS.search.bind(MS);
    MS.search = async function(query){
      const res = await original(query).catch(()=>[]);
      const hits = Array.isArray(res) ? res.map(normalizeHit).filter(Boolean) : [];
      if (hits.length) return res;

      const map = await loadFormsMap();
      const lemma = map[norm(query||"")];
      if (lemma) return [{ word: lemma, score: 1 }];
      return res;
    };
    console.info("[forms_search_patch] Aktiv: gebeugte Formen liefern Lemma als Suchtreffer.");
    return true;
  }
  function start(){
    if (install()) return;
    let tries = 0;
    const t = setInterval(()=>{ tries++; if (install() || tries>40) clearInterval(t); }, 100);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
