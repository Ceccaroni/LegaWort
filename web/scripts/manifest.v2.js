// web/scripts/manifest.v2.js
window.LEGA_FLAGS = Object.assign({ V2_MANIFEST_SEARCH:false }, window.LEGA_FLAGS||{});

(function(){
  const cache = new Map(); // prefix -> Promise<string[]>
  async function loadManifestV2(prefix){
    if (!prefix || prefix.length < 2) return [];
    if (cache.has(prefix)) return cache.get(prefix);
    const url = `/LegaWort/public/index/${prefix}/lemmas.json`;
    const p = fetch(url, { cache:"force-cache" })
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
    cache.set(prefix, p);
    return p;
  }
  window.ManifestV2 = { loadManifestV2 };
})();

