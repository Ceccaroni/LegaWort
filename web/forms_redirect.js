// web/forms_redirect.js
// Additiver Redirect: gebeugte Form → Grundform via public/index/forms.map.json
// Greift nur, wenn die originale Definition nicht gefunden wurde.
// Keine Änderung an bestehender App-Struktur notwendig.

(function(){
  function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
  function norm(s){
    return toCH(String(s||"").normalize("NFKC").toLowerCase()
      .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue"));
  }

  const FORMS_URL = "/public/index/forms.map.json";
  let formsMap = null;
  let loadPromise = null;

  async function loadFormsMap(){
    if (formsMap) return formsMap;
    if (!loadPromise){
      loadPromise = fetch(FORMS_URL, { cache: "no-store" })
        .then(r => { if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
        .then(obj => { formsMap = obj || {}; return formsMap; })
        .catch(err => { console.warn("[forms_redirect] forms.map.json:", err.message); formsMap = {}; return formsMap; });
    }
    return loadPromise;
  }

  async function tryRedirect(word, original){
    // 1) direkt versuchen
    try{
      const def = await original(word);
      if (def) return def;
    }catch{/* ignorieren */}

    // 2) Map laden, Grundform suchen, erneut versuchen
    const map = await loadFormsMap();
    const key = norm(word);
    const lemma = map[key];
    if (lemma && lemma !== key){
      try{
        const def2 = await original(lemma);
        if (def2){
          try { def2.form_of_note = `Form von „${lemma}“ (Eingabe: „${word}“)`; } catch {}
          return def2;
        }
      }catch{/* egal */}
    }
    return null;
  }

  function hook(){
    const g = (typeof window !== "undefined") ? window : globalThis;
    if (!g || !g.WortDB || typeof g.WortDB.getDefinition !== "function"){
      console.info("[forms_redirect] Kein WortDB.getDefinition gefunden.");
      return;
    }
    const original = g.WortDB.getDefinition.bind(g.WortDB);
    g.WortDB.getDefinition = async function(word){
      return tryRedirect(word, original);
    };
    console.info("[forms_redirect] Aktiv: gebeugte Formen werden auf Grundformen abgebildet.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hook);
  } else {
    hook();
  }
})();
