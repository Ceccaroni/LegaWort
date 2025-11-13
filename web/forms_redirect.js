// web/forms_redirect.js
// Additiver Redirect: gebeugte Form → Grundform via public/index/forms.map.json.
// Greift nur, wenn die originale Definition nicht gefunden wurde.
// Robuster Hook: wartet/pollt kurz, bis window.WortDB.getDefinition verfügbar ist.

(function(){
  function toCH(s){ return String(s||"").replace(/ß/g,"ss"); }
  function norm(s){
    return toCH(String(s||"").normalize("NFKC").toLowerCase()
      .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue"));
  }

  const FORMS_URL = "public/index/forms.map.json"; // relativ zur index.html
  let formsMap = null;
  let loadPromise = null;

  async function loadFormsMap(){
    if (formsMap) return formsMap;
    if (!loadPromise){
      loadPromise = fetch(FORMS_URL, { cache:"no-store" })
        .then(r => { if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
        .then(obj => { formsMap = obj || {}; return formsMap; })
        .catch(err => { console.warn("[forms_redirect] forms.map.json:", err.message); formsMap = {}; return formsMap; });
    }
    return loadPromise;
  }

  async function tryRedirect(word, original){
    // 1) Original versuchen
    try{
      const def = await original(word);
      if (def) return def;
    }catch{/* ignorieren */}

    // 2) Map laden und Grundform versuchen
    const map = await loadFormsMap();
    const key = norm(word);
    const lemma = map[key];
    if (lemma && lemma !== key){
      try{
        const def2 = await original(lemma);
        if (def2){
          try { def2.form_of_note = `Form von „${lemma}“ (Eingabe: „${word}“)"; } catch {}
          return def2;
        }
      }catch{/* egal */}
    }
    return null;
  }

  function installHook(){
    const g = (typeof window !== "undefined") ? window : globalThis;
    if (!g || !g.WortDB || typeof g.WortDB.getDefinition !== "function") return false;
    const original = g.WortDB.getDefinition.bind(g.WortDB);
    g.WortDB.getDefinition = async function(word){
      return tryRedirect(word, original);
    };
    console.info("[forms_redirect] Aktiv: gebeugte Formen werden auf Grundformen abgebildet.");
    return true;
  }

  // Sofort versuchen, sonst kurz pollen bis WortDB vorhanden ist
  function start(){
    if (installHook()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (installHook() || tries > 40) { // bis ~4s
        clearInterval(timer);
        if (tries > 40) console.info("[forms_redirect] Kein WortDB.getDefinition gefunden (Timeout).");
      }
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
