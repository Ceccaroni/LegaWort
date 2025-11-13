// web/forms_search_patch.js
(function(){
  console.info("[forms_search_patch] Loaded");

  function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
  function norm(s){
    return toCH(String(s||"").normalize("NFKC").toLowerCase()
      .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue"));
  }

  const FORMS_URL = "public/index/forms.map.json";
  let formsMap = null;
  let loadPromise = null;

  // forms.map.json immer gleich vorladen, damit Network sichtbar ist
  function preloadFormsMap(){
    if (formsMap) return Promise.resolve(formsMap);
    if (!loadPromise){
      loadPromise = fetch(FORMS_URL, { cache:"no-store" })
        .then(r => { if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
        .then(json => {
          formsMap = json || {};
          const k = Object.keys(formsMap).length;
          console.info("[forms_search_patch] forms.map.json geladen, Keys:", k);
          return formsMap;
        })
        .catch(err => {
          console.warn("[forms_search_patch] Konnte forms.map.json nicht laden:", err.message);
          formsMap = {};
          return formsMap;
        });
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

    // Original sichern
    const original = MS.search.bind(MS);

    MS.search = async function(query){
      // Erst die normale Manifest-Suche
      let res = [];
      try { res = await original(query); }
      catch { res = []; }

      const hits = Array.isArray(res) ? res.map(normalizeHit).filter(Boolean) : [];

      // Wenn Manifest etwas hat, liefern wir das unverändert zurück
      if (hits.length) return res;

      // Sonst: Flexion → Lemma aus Map
      const map = await preloadFormsMap();
      const key = norm(query||"");
      const lemma = map[key];

      if (lemma) {
        console.info("[forms_search_patch] Flexion:", query, "→ Lemma:", lemma);
        return [{ word: lemma, score: 1 }];
      }
      return res; // bleibt leer
    };

    console.info("[forms_search_patch] Aktiv: gebeugte Formen liefern Lemma als Suchtreffer.");
    return true;
  }

  async function start(){
    // forms.map.json direkt anstossen, unabhängig vom Hook
    preloadFormsMap();

    // Hook mit geduldigem Retry
    let tries = 0;
    if (install()) return;
    const t = setInterval(() => {
      tries++;
      if (install() || tries > 200) clearInterval(t);
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
