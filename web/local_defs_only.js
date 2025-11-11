// web/local_defs_only.js
(function(){
  const g = window;
  function apply(){
    if (!g.WortDB) return false;
    // Hart local-only: Remote-Lader neutralisieren
    if (typeof g.WortDB.fetchRemoteDef === "function"){
      g.WortDB.fetchRemoteDef = async function(){ return null; };
    }
    // Optionaler Schalter, falls der Shim ihn auswertet
    g.LEGA_FLAGS = g.LEGA_FLAGS || {};
    g.LEGA_FLAGS.LOCAL_DEFS_ONLY = true;

    console.info("[local_defs_only] Aktiv: Remote-Definitionen deaktiviert.");
    return true;
  }
  if (!apply()){
    let tries = 0;
    const t = setInterval(()=>{ tries++; if (apply() || tries>40) clearInterval(t); }, 100);
  }
})();
