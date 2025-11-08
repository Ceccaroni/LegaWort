/* Dyslexikon – CH-DE
   Keine externen Ressourcen, läuft auf GitHub Pages.
*/
const state = {
  data: [],            // kleiner Basis-Datensatz (optional)
  userData: [],        // lokale Importe
  voices: [],
  showSyll: true,
  dys: false,
  contrast: false,
  ruler: false,
  ls: 3,
  lh: 18,
  lastResults: [],
  lastQuery: '',
  learnWords: [],
  // Grossdatensatz via Prefix-Chunks (optional)
  chunkIndex: null,        // { prefixLen: 2, prefixes: { "aa": "aa.json", ... } }
  chunkCache: new Map(),   // prefix -> Array<{wort,...}>
  chunkPrefixLen: 2
};

const $ = sel => document.querySelector(sel);
const resultsEl = $('#results');
const rulerEl = $('#ruler');
const SETTINGS_PANEL_VARS = [
  '--settings-panel-top',
  '--settings-panel-left',
  '--settings-panel-right',
  '--settings-panel-gap',
  '--settings-panel-caret-right',
  '--settings-panel-caret-opacity'
];

function clearSettingsPanelVars(){
  const rootStyle = document.documentElement?.style;
  if(!rootStyle) return;
  SETTINGS_PANEL_VARS.forEach(prop => rootStyle.removeProperty(prop));
}

(async function init(){
  // Basisdaten (optional)
  try{
    const res = await fetch('data/words.json');
    if(res.ok){
      const base = await res.json();
      state.data = base.entries || [];
    }
  }catch(e){
    console.warn('Kein Basis-Datensatz geladen', e);
  }

  // Chunk-Index (für grosse Listen, optional)
  try{
    const ci = await fetch('data/_chunks/index.json');
    if(ci.ok){
      state.chunkIndex = await ci.json(); // {prefixLen, prefixes:{..}}
      if(typeof state.chunkIndex.prefixLen === 'number'){
        state.chunkPrefixLen = state.chunkIndex.prefixLen;
      }
    }
  }catch(e){
    // kein Chunk-Betrieb aktiv – OK
  }

  // Userdaten laden
  const u = localStorage.getItem('lw_user_entries');
  if(u){ try{ state.userData = JSON.parse(u); }catch(e){} }

  // Settings
  hydrateSettings();

  // Sicherheits-Top-Layer für das Lineal (sichtbar über Karten/Header)
  if (rulerEl) { rulerEl.style.zIndex = '9999'; }

  // Initial: leer – erst nach Suche
  render([]);
  hydrateLearn();

  // UI
  const settingsToggle = $('#btn-settings');
  const settingsPanel = $('#settings-panel');
  const settingsWrapper = settingsToggle ? settingsToggle.closest('.settings-wrapper') : null;

  const rootStyle = document.documentElement.style;
  const updateSettingsPanelMetrics = ()=>{
    if(!settingsPanel || !settingsToggle) return;
    if(settingsPanel.hidden || settingsPanel.hasAttribute('hidden')) return;
    const toggleRect = settingsToggle.getBoundingClientRect();
    const gap = Math.max(12, Math.min(window.innerWidth * 0.05, 24));
    const top = Math.max(gap, toggleRect.bottom + gap);
    rootStyle.setProperty('--settings-panel-gap', `${gap}px`);
    rootStyle.setProperty('--settings-panel-top', `${top}px`);

    if(window.innerWidth <= 640){
      rootStyle.setProperty('--settings-panel-left', `${gap}px`);
      rootStyle.setProperty('--settings-panel-right', `${gap}px`);
      rootStyle.setProperty('--settings-panel-caret-opacity', '0');
      rootStyle.removeProperty('--settings-panel-caret-right');
      return;
    }

    const panelWidth = Math.min(420, window.innerWidth - gap * 2);
    let right = Math.max(gap, window.innerWidth - toggleRect.right);
    if(window.innerWidth - right - panelWidth < gap){
      right = Math.max(gap, window.innerWidth - panelWidth - gap);
    }
    const left = Math.max(gap, window.innerWidth - right - panelWidth);
    rootStyle.setProperty('--settings-panel-left', `${left}px`);
    rootStyle.setProperty('--settings-panel-right', `${right}px`);
    rootStyle.setProperty('--settings-panel-caret-opacity', '1');

    requestAnimationFrame(()=>{
      if(!settingsPanel || settingsPanel.hidden || settingsPanel.hasAttribute('hidden')) return;
      const panelRect = settingsPanel.getBoundingClientRect();
      const buttonCenter = toggleRect.left + (toggleRect.width / 2);
      const caretRight = Math.min(
        Math.max(18, panelRect.right - buttonCenter - 8),
        panelRect.width - 24
      );
      rootStyle.setProperty('--settings-panel-caret-right', `${caretRight}px`);
    });
  };

  const setSettingsOpen = (open)=>{
    if(!settingsPanel || !settingsToggle) return;
    if(open){
      settingsPanel.hidden = false;
      settingsPanel.removeAttribute('hidden');
      settingsPanel.style.display = 'flex';
      settingsToggle.setAttribute('aria-expanded', 'true');
      if(settingsWrapper){
        settingsWrapper.classList.add('open');
      }
      updateSettingsPanelMetrics();
      if(document.activeElement === settingsToggle){
        const focusTarget = settingsPanel.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
        if(focusTarget){
          focusTarget.focus({ preventScroll: true });
        }
      }
    }else{
      settingsPanel.hidden = true;
      settingsPanel.setAttribute('hidden', '');
      settingsPanel.style.display = 'none';
      settingsToggle.setAttribute('aria-expanded', 'false');
      if(settingsWrapper){
        settingsWrapper.classList.remove('open');
      }
      clearSettingsPanelVars();
    }
  };

  const closeSettings = ()=> setSettingsOpen(false);

  setSettingsOpen(false);

  if(settingsToggle && settingsPanel){
    settingsToggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      const expanded = settingsToggle.getAttribute('aria-expanded') === 'true';
      setSettingsOpen(!expanded);
    });

    settingsPanel.addEventListener('click', (e)=> e.stopPropagation());

    document.addEventListener('click', ()=>{
      closeSettings();
    });

    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        if(settingsPanel && !settingsPanel.hidden){
          closeSettings();
          settingsToggle.focus();
        }
      }
    });

    window.addEventListener('resize', updateSettingsPanelMetrics);
    window.addEventListener('scroll', updateSettingsPanelMetrics, { passive: true });
  }

  $('#q').addEventListener('input', onSearch);
  $('#toggle-syll').addEventListener('change', (e)=>{
    state.showSyll = e.target.checked;
    render(state.lastResults, state.lastQuery);
    saveSettings();
  });
  $('#toggle-dys').addEventListener('change', (e)=>{
    state.dys = e.target.checked;
    document.body.classList.toggle('dys', state.dys);
    render(state.lastResults, state.lastQuery);
    saveSettings();
  });
  $('#toggle-contrast').addEventListener('change', (e)=>{ state.contrast = e.target.checked; document.body.classList.toggle('contrast', state.contrast); saveSettings(); });

  let lastPointerY = null;
  const getRulerHeight = ()=>{
    if(!rulerEl) return 36;
    const h = rulerEl.offsetHeight;
    if(h) return h;
    const parsed = parseFloat(getComputedStyle(rulerEl).height);
    return Number.isFinite(parsed) ? parsed : 36;
  };
  const applyRulerPosition = (y)=>{
    if(typeof y !== 'number' || !rulerEl) return;
    const h = getRulerHeight();
    const maxTop = Math.max(0, window.innerHeight - h);
    const clamped = Math.min(maxTop, Math.max(0, y - h/2));
    rulerEl.style.top = clamped + 'px';
  };
  const rememberPointerY = (y)=>{
    if(typeof y !== 'number') return;
    lastPointerY = y;
    if(state.ruler){
      applyRulerPosition(lastPointerY);
    }
  };

  $('#toggle-ruler').addEventListener('change', (e)=>{
    state.ruler = e.target.checked;
    rulerEl.hidden = !state.ruler;
    rulerEl.setAttribute('aria-hidden', String(!state.ruler));

    if (state.ruler) {
      // Feste Basis-Positionierung sicherstellen (Browser-Defaults neutralisieren)
      rulerEl.style.position = 'fixed';
      rulerEl.style.left = '0';
      rulerEl.style.right = '0';
      rulerEl.style.zIndex = '9999';

      // Einmalige sinnvolle Startposition setzen
      requestAnimationFrame(()=>{
        const y = typeof lastPointerY === 'number' ? lastPointerY : window.innerHeight * 0.40;
        applyRulerPosition(y);
      });
    }
    saveSettings();
  });

  $('#ls').addEventListener('input', (e)=>{ state.ls = +e.target.value; document.documentElement.style.setProperty('--ls', (state.ls/100)+'em'); saveSettings(); });
  $('#lh').addEventListener('input', (e)=>{ state.lh = +e.target.value; document.documentElement.style.setProperty('--lh', (state.lh/10)); saveSettings(); });

  // Import/Export
  $('#btn-import').addEventListener('click', ()=> $('#file').click());
  $('#file').addEventListener('change', onImport);

  // Benutzerdaten leeren
  const clearBtn = document.getElementById('btn-clear-user');
  if(clearBtn){ clearBtn.addEventListener('click', clearUserData); }

  // Sprachsuche
  setupSpeechSearch();

  // TTS
  setupVoices();

  // Leselineal: robuste Pointer-/Touch-Listener auf Dokumentebene
  const resolvePointerY = (e)=>{
    if(typeof e?.clientY === 'number') return e.clientY;
    if(e?.pageY && !e.touches) return e.pageY - window.pageYOffset;
    if(e?.touches && e.touches[0]) return e.touches[0].clientY;
    if(e?.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
    return null;
  };

  const handlePointerUpdate = (e)=>{
    const y = resolvePointerY(e);
    if(typeof y !== 'number') return;
    rememberPointerY(y);
  };

  const pointerTargets = [document, window];
  const passivePointer = { passive: true };
  pointerTargets.forEach((target)=>{
    ['pointermove', 'pointerdown', 'mousemove'].forEach((evt)=>{
      target.addEventListener(evt, handlePointerUpdate, passivePointer);
    });
  });

  const touchListenerOptions = { passive: false };
  pointerTargets.forEach((target)=>{
    ['touchstart', 'touchmove'].forEach((evt)=>{
      target.addEventListener(evt, handlePointerUpdate, touchListenerOptions);
    });
  });
})();

function hydrateSettings(){
  const s = localStorage.getItem('lw_settings');
  if(s){
    try{
      const o = JSON.parse(s);
      Object.assign(state, o);
    }catch(e){}
  }

  // Immer mit ausgeschaltetem Leselineal starten (Policy)
  state.ruler = false;
  state.lastResults = [];
  state.lastQuery = '';

  $('#toggle-syll').checked = state.showSyll;
  $('#toggle-dys').checked = state.dys;
  $('#toggle-contrast').checked = state.contrast;
  $('#toggle-ruler').checked = false;          // Checkbox sicher "off"
  rulerEl.hidden = true;                       // Lineal verstecken
  rulerEl.setAttribute('aria-hidden', 'true');

  const settingsPanel = $('#settings-panel');
  if(settingsPanel){
    settingsPanel.hidden = true;
    settingsPanel.setAttribute('hidden', '');
    settingsPanel.style.display = 'none';
  }
  clearSettingsPanelVars();
  const settingsToggle = $('#btn-settings');
  if(settingsToggle){
    settingsToggle.setAttribute('aria-expanded', 'false');
    const wrapper = settingsToggle.closest('.settings-wrapper');
    if(wrapper){
      wrapper.classList.remove('open');
    }
  }

  document.body.classList.toggle('dys', state.dys);
  document.body.classList.toggle('contrast', state.contrast);
  document.documentElement.style.setProperty('--ls', (state.ls/100)+'em');
  document.documentElement.style.setProperty('--lh', (state.lh/10));
  $('#ls').value = state.ls;
  $('#lh').value = state.lh;
}

function saveSettings(){
  const {showSyll,dys,contrast,ruler,ls,lh} = state;
  localStorage.setItem('lw_settings', JSON.stringify({showSyll,dys,contrast,ruler,ls,lh}));
}

/* Suche (debounced) – erst ab 2 Zeichen */
let _searchTimer = null;
function onSearch(e){
  const val = e.target.value;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(()=>doSearch(val), 120);
}

const SEARCH_MAX_RESULTS = 50;
const SEARCH_POOL_LIMIT = SEARCH_MAX_RESULTS + 50;
const SEARCH_MIN_PRIMARY = 5;
const SUBSTITUTION_COSTS = new Map([
  ['b|p', 0.4],
  ['d|t', 0.4],
  ['g|k', 0.5],
  ['k|ck', 0.5],
  ['k|ch', 0.5],
  ['sch|ch', 0.6],
  ['ei|ie', 0.6],
  ['ä|e', 0.5],
  ['e|r', 0.3],
  ['t|z', 0.3]
]);
const TRANSPOSE_SPECIAL_COSTS = new Map([
  ['e|i', 0.6],
  ['i|e', 0.6]
]);
const CONFUSION_RULES = [
  ['g', 'k'],
  ['d', 't'],
  ['b', 'p'],
  ['ei', 'ie'],
  ['ae', 'e'],
  ['ch', 'sch'],
  ['k', 'ck'],
  ['k', 'ch']
];

const WDL_SUB_COSTS_V2 = new Map([
  ['b|p', 0.4], ['p|b', 0.4],
  ['d|t', 0.4], ['t|d', 0.4],
  ['g|k', 0.5], ['k|g', 0.5],
  ['ä|e', 0.5], ['e|ä', 0.5],
  ['ß|ss', 0.4], ['ss|ß', 0.4],
  ['ei|ie', 0.6], ['ie|ei', 0.6],
  ['ch|sch', 0.6], ['sch|ch', 0.6],
  ['k|ck', 0.5], ['ck|k', 0.5],
  ['e|r', 0.3], ['r|e', 0.3],
  ['t|z', 0.3], ['z|t', 0.3]
]);

function matchKey(str){
  if(!str) return '';
  const base = String(str)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue');
  const stripped = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return stripped.replace(/[^a-z]/g, '');
}

function normalizeV2(str){
  if(!str) return '';
  const base = String(str)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue');
  const stripped = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return stripped.replace(/[^a-z]/g, '');
}

function phonKeyV2(str){
  if(!str) return '';
  return normalizeV2(str);
}

function entryKey(entry){
  if(!entry) return '';
  if(typeof entry._matchKey === 'string') return entry._matchKey;
  const key = matchKey(entry.wort || entry.word || '');
  entry._matchKey = key;
  return key;
}

function expandAnlautVariants(query){
  const q = matchKey(query);
  if(!q) return new Set();
  const variants = new Set([q]);
  const limit = Math.max(state.chunkPrefixLen || 2, 2);
  const queue = [q];

  const enqueue = (candidate)=>{
    if(!candidate) return;
    if(candidate.length < 2) return; // nur sinnvolle Varianten
    if(!variants.has(candidate)){
      variants.add(candidate);
      queue.push(candidate);
    }
  };

  while(queue.length){
    const current = queue.shift();
    for(const [a, b] of CONFUSION_RULES){
      const nextA = replaceAtStart(current, a, b, limit);
      const nextB = replaceAtStart(current, b, a, limit);
      nextA.forEach(enqueue);
      nextB.forEach(enqueue);
    }
  }

  return variants;
}

function collectBucketsV2(queryNorm, options){
  const q = typeof queryNorm === 'string' ? queryNorm : '';
  if(!q) return { basePrefix: '', fallbackPrefixes: [] };
  const prefixLen = Math.max(1, state.chunkPrefixLen || 2);
  const minLength = Math.min(2, prefixLen);
  const limit = Math.max(5, options?.maxFallback || 50);
  const basePrefix = q.slice(0, prefixLen);
  const seen = new Set();
  if(basePrefix) seen.add(basePrefix);
  const fallback = [];

  const push = (pref)=>{
    if(!pref) return;
    if(pref.length < minLength) return;
    if(seen.has(pref)) return;
    seen.add(pref);
    if(fallback.length >= limit) return;
    fallback.push(pref);
  };

  const confusionPairs = [
    ['g', 'k'],
    ['k', 'g'],
    ['d', 't'],
    ['t', 'd'],
    ['b', 'p'],
    ['p', 'b'],
    ['ch', 'k'],
    ['ch', 'ck'],
    ['k', 'ch'],
    ['ck', 'k'],
    ['sch', 'ch'],
    ['ch', 'sch'],
    ['ae', 'e'],
    ['e', 'ae'],
    ['ei', 'ie'],
    ['ie', 'ei']
  ];

  for(const [from, to] of confusionPairs){
    if(fallback.length >= limit) break;
    if(!from || !to) continue;
    let idx = q.indexOf(from);
    while(idx !== -1 && idx < prefixLen){
      const replaced = `${q.slice(0, idx)}${to}${q.slice(idx + from.length)}`;
      const pref = replaced.slice(0, prefixLen);
      push(pref);
      if(fallback.length >= limit) break;
      idx = q.indexOf(from, idx + 1);
    }
    if(fallback.length >= limit) break;
  }

  return { basePrefix, fallbackPrefixes: fallback };
}

function replaceAtStart(str, from, to, limit){
  const out = [];
  if(!from || from === to) return out;
  let idx = str.indexOf(from);
  while(idx !== -1 && idx < limit){
    const next = str.slice(0, idx) + to + str.slice(idx + from.length);
    out.push(next);
    idx = str.indexOf(from, idx + 1);
  }
  return out;
}

async function ensureChunk(prefix){
  if(!state.chunkIndex) return [];
  const p = prefix.toLowerCase();
  if(state.chunkCache.has(p)) return state.chunkCache.get(p);
  const file = state.chunkIndex.prefixes?.[p];
  if(!file) { state.chunkCache.set(p, []); return []; }
  try{
    const res = await fetch(`data/_chunks/${file}`);
    if(!res.ok) throw new Error(res.status);
    const obj = await res.json();
    const list = Array.isArray(obj) ? obj.map(s=>({wort:String(s)})) : (obj.entries || obj || []);
    const mapped = list.map(e => {
      const wort = (e.wort||e.word||String(e)).replace(/ß/g,'ss').trim();
      const entry = {
        wort,
        silben: e.silben ? String(e.silben).split(/[-·\s]/).filter(Boolean) : [],
        erklaerung: (e.erklaerung||e.definition||'').trim(),
        beispiele: e.beispiele ? (Array.isArray(e.beispiele)?e.beispiele:String(e.beispiele).split(/\s*[|]\s*/).filter(Boolean)) : [],
        tags: e.tags ? (Array.isArray(e.tags)?e.tags:String(e.tags).split(/\s*[,;]\s*/).filter(Boolean)) : []
      };
      entry._matchKey = matchKey(entry.wort);
      return entry;
    }).filter(x=>x.wort);
    state.chunkCache.set(p, mapped);
    return mapped;
  }catch(err){
    console.warn('Chunk-Load fehlgeschlagen', p, err);
    state.chunkCache.set(p, []);
    return [];
  }
}

async function doSearch(input){
  const raw = typeof input === 'string' ? input : '';
  const trimmed = raw.trim();
  const q = matchKey(trimmed);
  const qNormV2 = normalizeV2(trimmed);
  const primaryQuery = qNormV2 || q;
  if(primaryQuery.length < 2){
    render([]);
    return;
  }

  const prefixLen = Math.max(1, state.chunkPrefixLen || 2);
  const bucketInfoV2 = collectBucketsV2(primaryQuery);
  const primaryPrefix = bucketInfoV2.basePrefix || primaryQuery.slice(0, prefixLen);
  const fallbackPrefixesV2 = bucketInfoV2.fallbackPrefixes || [];
  const processedPrefixes = new Set();
  const prefixQueue = [];
  if(primaryPrefix){ prefixQueue.push(primaryPrefix); }

  const patterns = new Set([primaryQuery]);
  if(q && q !== primaryQuery){ patterns.add(q); }
  const variantsToConsider = [];
  const seenKeys = new Map();
  const candidates = [];

  function addEntry(entry, replace=false, keyOverride){
    const key = keyOverride || entryKey(entry);
    if(!key) return false;
    if(seenKeys.has(key)){
      if(replace){
        const idx = seenKeys.get(key);
        candidates[idx] = entry;
      }
      return false;
    }
    seenKeys.set(key, candidates.length);
    candidates.push(entry);
    return true;
  }

  function addFromSource(list, prefix, replace){
    if(!Array.isArray(list)) return false;
    for(const entry of list){
      const key = entryKey(entry);
      if(!key || !prefix || !key.startsWith(prefix)) continue;
      const added = addEntry(entry, replace, key);
      if(added && candidates.length >= SEARCH_POOL_LIMIT) return true;
    }
    return false;
  }

  async function processPrefix(prefix){
    if(!prefix || processedPrefixes.has(prefix)) return;
    processedPrefixes.add(prefix);

    if(addFromSource(state.userData, prefix, true)) return;

    if(state.chunkIndex){
      const chunkEntries = await ensureChunk(prefix);
      for(const entry of chunkEntries){
        const key = entryKey(entry);
        if(!key.startsWith(prefix)) continue;
        const added = addEntry(entry, false, key);
        if(added && candidates.length >= SEARCH_POOL_LIMIT) return;
      }
    }

    addFromSource(state.data, prefix, false);
  }

  while(prefixQueue.length){
    const pref = prefixQueue.shift();
    await processPrefix(pref);
  }

  let results = filterMatches(candidates, patterns, primaryQuery).slice(0, SEARCH_MAX_RESULTS);

  if(results.length < SEARCH_MIN_PRIMARY && fallbackPrefixesV2.length){
    for(const pref of fallbackPrefixesV2){
      if(candidates.length >= SEARCH_POOL_LIMIT) break;
      if(!pref || processedPrefixes.has(pref)) continue;
      prefixQueue.push(pref);
      while(prefixQueue.length){
        const nextPref = prefixQueue.shift();
        await processPrefix(nextPref);
        if(candidates.length >= SEARCH_POOL_LIMIT) break;
      }
      results = filterMatches(candidates, patterns, primaryQuery).slice(0, SEARCH_MAX_RESULTS);
      if(results.length >= SEARCH_MIN_PRIMARY) break;
    }
  }
  if(!scored.length) return scored;
  const ranked = rankV2(scored, baseQuery);
  if(Array.isArray(ranked) && ranked.length){
    return ranked;
  }
  scored.sort((a, b)=>{
    const da = typeof a._dlDist === 'number' ? a._dlDist : Infinity;
    const db = typeof b._dlDist === 'number' ? b._dlDist : Infinity;
    if(da !== db) return da - db;
    return String(a.wort || '').localeCompare(String(b.wort || ''), 'de');
  });
  return scored;
}

  if(results.length < SEARCH_MIN_PRIMARY){
    const variantSet = expandAnlautVariants(primaryQuery);
    for(const variant of variantSet){
      if(variant.length < 2) continue;
      if(!patterns.has(variant)){
        patterns.add(variant);
        variantsToConsider.push(variant);
      }
    }

    for(const variant of variantsToConsider){
      if(candidates.length >= SEARCH_POOL_LIMIT) break;
      const pref = variant.slice(0, prefixLen);
      if(!pref || processedPrefixes.has(pref)) continue;
      prefixQueue.push(pref);
      while(prefixQueue.length){
        const nextPref = prefixQueue.shift();
        await processPrefix(nextPref);
      }
      results = filterMatches(candidates, patterns, primaryQuery).slice(0, SEARCH_MAX_RESULTS);
      if(results.length >= SEARCH_MIN_PRIMARY) break;
    }
  }

  render(results.slice(0, SEARCH_MAX_RESULTS), trimmed);
}

function filterMatches(list, patterns, baseQuery){
  const patternList = Array.from(patterns).filter(p => typeof p === 'string' && p.length >= 2);
  if(!patternList.length) return [];
  const patternTokens = patternList.map(p => ({ key: p, tokens: tokenizeKey(p) }));
  const baseLen = typeof baseQuery === 'string' ? baseQuery.length : 0;
  const threshold = baseLen <= 2 ? 1.2 : 1.6;
  const scored = [];
  for(const entry of list){
    const key = entryKey(entry);
    if(!key) continue;
    const entryTokens = tokenizeKey(key);
    let bestLegacy = Infinity;
    let bestV2 = Infinity;
    for(const pattern of patternTokens){
      if(key.startsWith(pattern.key)){
        bestLegacy = 0;
        bestV2 = 0;
        break;
      }
      const { distance } = weightedDamerauLevenshtein(pattern.tokens, entryTokens);
      if(distance < bestLegacy){
        bestLegacy = distance;
      }
      const distV2 = wdlDistanceV2(pattern.tokens, entryTokens);
      if(distV2 < bestV2){
        bestV2 = distV2;
      }
      if(bestLegacy === 0 && bestV2 === 0) break;
    }
    if(bestLegacy === Infinity && bestV2 === Infinity) continue;
    if(bestLegacy === Infinity || bestLegacy > threshold) continue;
    if(bestV2 === Infinity || bestV2 > threshold) continue;
    entry._dlDist = bestLegacy;
    entry._dlScore = 1 / (1 + bestLegacy);
    entry._dist = bestV2;
    entry._wdl = wdlScoreV2(bestV2);
    entry._len = key.length;
    entry._lenDelta = key.length - baseLen;
    entry._freqHint = getEntryFrequency(entry);
    scored.push(entry);
  }
  if(!scored.length) return scored;
  const ranked = rankV2(scored, baseQuery);
  if(Array.isArray(ranked) && ranked.length){
    return ranked;
  }
  scored.sort((a, b)=>{
    const da = typeof a._dlDist === 'number' ? a._dlDist : Infinity;
    const db = typeof b._dlDist === 'number' ? b._dlDist : Infinity;
    if(da !== db) return da - db;
    return String(a.wort || '').localeCompare(String(b.wort || ''), 'de');
  });
  return scored;
}

function getEntryFrequency(entry){
  if(!entry || typeof entry !== 'object') return 0;
  const candidates = [
    entry.freq,
    entry.frequency,
    entry.freqScore,
    entry.rank,
    entry.count,
    entry.weight,
    entry.frequencyScore,
    entry.freq_rank,
    entry.meta?.freq,
    entry.meta?.frequency
  ];
  for(const value of candidates){
    const num = typeof value === 'string' ? Number(value) : value;
    if(Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function tokenizeKey(key){
  const out = [];
  if(!key) return out;
  const str = String(key);
  const patterns = [
    ['sch', 'sch'],
    ['ch', 'ch'],
    ['ck', 'ck'],
    ['ss', 'ß'],
    ['ei', 'ei'],
    ['ie', 'ie'],
    ['ae', 'ä']
  ];
  for(let i = 0; i < str.length;){
    let matched = false;
    for(const [pat, token] of patterns){
      if(str.startsWith(pat, i)){
        out.push(token);
        i += pat.length;
        matched = true;
        break;
      }
    }
    if(matched) continue;
    out.push(str[i]);
    i += 1;
  }
  return out;
}

function positionWeight(index){
  return index <= 2 ? 2 : 1;
}

function insertionCost(index){
  return positionWeight(index);
}

function deletionCost(index){
  return positionWeight(index);
}

function computeScoreV2(metrics){
  if(!metrics || typeof metrics !== 'object') return 0;
  const prefix = Number.isFinite(metrics.prefixScore) ? metrics.prefixScore : 0;
  const phon = Number.isFinite(metrics.phonScore) ? metrics.phonScore : 0;
  const wdl = Number.isFinite(metrics.weightedDL) ? metrics.weightedDL : 0;
  const freq = Number.isFinite(metrics.freq) && metrics.freq > 0 ? metrics.freq : 0;
  const lenDelta = Number.isFinite(metrics.lenDelta) ? metrics.lenDelta : 0;
  const freqTerm = freq > 0 ? (Math.log1p ? Math.log1p(freq) : Math.log(1 + freq)) : 0;
  return (3 * prefix) + (2.5 * phon) + (2 * wdl) + (0.8 * freqTerm) - (0.3 * Math.abs(lenDelta));
}

function rankV2(candidates, query){
  if(!Array.isArray(candidates) || !candidates.length) return candidates || [];
  const q = typeof query === 'string' ? query : '';
  const qLen = q.length;
  const qPhon = phonKeyV2(q);
  const scored = candidates.map(entry => {
    const key = entryKey(entry);
    const len = key.length;
    const prefixLen = q && key ? longestCommonPrefix(key, q) : 0;
    const prefixScore = qLen ? prefixLen / qLen : 0;
    const candidatePhon = typeof entry.phon === 'string' ? entry.phon : '';
    const phonScore = qPhon && candidatePhon && qPhon === candidatePhon ? 1 : 0;
    const legacyPhonScore = typeof entry._dlScore === 'number' ? entry._dlScore : 0;
    const weightedDL = typeof entry._wdl === 'number' ? entry._wdl : legacyPhonScore;
    const freq = Number.isFinite(entry._freqHint) ? entry._freqHint : getEntryFrequency(entry);
    const lenDelta = Number.isFinite(entry._lenDelta) ? entry._lenDelta : (len - qLen);
    const score = computeScoreV2({
      prefixScore,
      phonScore,
      weightedDL,
      freq,
      lenDelta
    });
    entry._rankV2 = score;
    entry._prefixScore = prefixScore;
    entry._phonScore = phonScore;
    entry._phonKey = candidatePhon;
    entry._freqHint = freq;
    entry._len = len;
    entry._lenDelta = lenDelta;
    return {
      entry,
      score,
      dist: Number.isFinite(entry._dist) ? entry._dist : Number.isFinite(entry._dlDist) ? entry._dlDist : Infinity,
      freq,
      len
    };
  });

  scored.sort((a, b) => {
    if(a.score !== b.score) return b.score - a.score;
    if(a.dist !== b.dist) return a.dist - b.dist;
    if(a.freq !== b.freq) return b.freq - a.freq;
    if(a.len !== b.len) return a.len - b.len;
    const aw = String(a.entry.wort || '');
    const bw = String(b.entry.wort || '');
    return aw.localeCompare(bw, 'de');
  });

  return scored.map(item => item.entry);
}

function longestCommonPrefix(a, b){
  const len = Math.min(a.length, b.length);
  let i = 0;
  while(i < len && a[i] === b[i]) i += 1;
  return i;
}

function substitutionCostV2(aToken, bToken, index){
  if(aToken === bToken) return 0;
  const key = `${aToken}|${bToken}`;
  const cost = WDL_SUB_COSTS_V2.get(key);
  const base = typeof cost === 'number' ? cost : 1;
  return base * positionWeight(index);
}

function transpositionCostV2(idxA, idxB){
  if(idxA === 0 && idxB === 1) return 0.5;
  const w1 = positionWeight(idxA);
  const w2 = positionWeight(idxB);
  return (w1 + w2) / 2;
}

function wdlDistanceV2(aTokens, bTokens){
  const a = Array.isArray(aTokens) ? aTokens : [];
  const b = Array.isArray(bTokens) ? bTokens : [];
  const m = a.length;
  const n = b.length;
  if(m === 0 && n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, ()=>Array(n + 1).fill(0));
  for(let i = 1; i <= m; i++){
    dp[i][0] = dp[i - 1][0] + positionWeight(i - 1);
  }
  for(let j = 1; j <= n; j++){
    dp[0][j] = dp[0][j - 1] + positionWeight(j - 1);
  }
  for(let i = 1; i <= m; i++){
    for(let j = 1; j <= n; j++){
      const del = dp[i - 1][j] + positionWeight(i - 1);
      const ins = dp[i][j - 1] + positionWeight(j - 1);
      const sub = dp[i - 1][j - 1] + substitutionCostV2(a[i - 1], b[j - 1], Math.min(i - 1, j - 1));
      let val = Math.min(del, ins, sub);
      if(i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]){
        val = Math.min(val, dp[i - 2][j - 2] + transpositionCostV2(i - 2, i - 1));
      }
      dp[i][j] = val;
    }
  }
  return dp[m][n];
}

function wdlScoreV2(dist){
  if(typeof dist !== 'number' || !isFinite(dist)) return 0;
  return 1 / (1 + dist);
}

function substitutionCost(aToken, bToken, index){
  if(aToken === bToken) return 0;
  const key = `${aToken}|${bToken}`;
  const reverse = `${bToken}|${aToken}`;
  const base = SUBSTITUTION_COSTS.get(key) ?? SUBSTITUTION_COSTS.get(reverse) ?? 1;
  return base * positionWeight(index);
}

function transpositionCost(aTokens, i){
  const idx1 = i - 2;
  const idx2 = i - 1;
  if(idx1 < 0 || idx2 < 0) return 1;
  if(idx1 <= 1 && idx2 <= 1) return 0.5;
  const pairKey = `${aTokens[idx1]}|${aTokens[idx2]}`;
  const special = TRANSPOSE_SPECIAL_COSTS.get(pairKey);
  if(typeof special === 'number'){
    return Math.min((positionWeight(idx1) + positionWeight(idx2)) / 2, special * Math.max(positionWeight(idx1), positionWeight(idx2)));
  }
  return (positionWeight(idx1) + positionWeight(idx2)) / 2;
}

function weightedDamerauLevenshtein(aTokens, bTokens){
  const a = Array.isArray(aTokens) ? aTokens : [];
  const b = Array.isArray(bTokens) ? bTokens : [];
  const m = a.length;
  const n = b.length;
  if(m === 0 && n === 0){
    return { distance: 0, score: 1 };
  }
  const dp = Array.from({ length: m + 1 }, ()=>Array(n + 1).fill(0));
  for(let i = 1; i <= m; i++){
    dp[i][0] = dp[i - 1][0] + deletionCost(i - 1);
  }
  for(let j = 1; j <= n; j++){
    dp[0][j] = dp[0][j - 1] + insertionCost(j - 1);
  }
  for(let i = 1; i <= m; i++){
    for(let j = 1; j <= n; j++){
      const del = dp[i - 1][j] + deletionCost(i - 1);
      const ins = dp[i][j - 1] + insertionCost(j - 1);
      const sub = dp[i - 1][j - 1] + substitutionCost(a[i - 1], b[j - 1], Math.min(i - 1, j - 1));
      let val = Math.min(del, ins, sub);
      if(i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]){
        const tCost = transpositionCost(a, i);
        val = Math.min(val, dp[i - 2][j - 2] + tCost);
      }
      dp[i][j] = val;
    }
  }
  const distance = dp[m][n];
  return { distance, score: 1 / (1 + distance) };
}

/* Normalisierung */
function norm(s){
  if(!s) return '';
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue');
}

/* Rendering */
function displayHeadwordV2(wort, pos){
  if(!wort) return '';
  const raw = String(wort);
  if(pos === 'Nomen' || pos === 'Eigenname'){
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return raw.toLowerCase();
}

function render(list, query=''){
  const items = Array.isArray(list) ? list.slice() : [];
  state.lastResults = items;
  state.lastQuery = typeof query === 'string' ? query : '';
  resultsEl.innerHTML = '';
  if(items.length === 0){
    resultsEl.innerHTML = `<div class="card"><p class="definition">Gib mindestens zwei Buchstaben ein. Oder mache eine Aufnahme.</p></div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for(const e of items){
    frag.appendChild(renderCard(e, query));
  }
  resultsEl.appendChild(frag);
}

function renderCard(entry, query){
  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  const headwordPos = (entry.def_src && entry.def_src.pos) || (Array.isArray(entry.tags) && entry.tags.length ? entry.tags[0] : '');
  const headword = displayHeadwordV2(entry.wort, headwordPos);
  const w = esc(headword);
  const s = state.showSyll ? ' · ' + esc(showSyllables(entry)) : '';
  const tags = (entry.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join(' ');
  const def = esc(entry.erklaerung || '');
  const ex = (entry.beispiele||[]).map(x=>`<div class="example">„${esc(x)}“</div>`).join('');

  card.innerHTML = `
    <h2>${highlight(w, query)}</h2>
    <div class="meta">
      <span class="syll">${state.showSyll ? highlight(s.trim(), query) : ''}</span>
      ${tags}
    </div>
    <div class="definition">${highlight(def, query)}</div>
    ${ex}
    <div class="actions">
      <button aria-label="Wort vorlesen" data-act="speak-word">Wort vorlesen</button>
      <button aria-label="Erklärung vorlesen" data-act="speak-def">Erklärung vorlesen</button>
      <button aria-label="Zur Lernliste" data-act="learn">Zur Lernliste</button>
    </div>
  `;
  card.dataset.word = entry.wort;

  card.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      const act = ev.currentTarget.dataset.act;
      if(act==='speak-word') speak(entry.wort);
      else if(act==='speak-def') speak(entry.erklaerung||entry.wort);
      else if(act==='learn') addLearn(entry.wort);
    });
  });

  hydrateDefinitionForCard(card, entry, query);
  return card;
}

function hydrateDefinitionForCard(card, entry, query){
  if(!card || !entry) return;
  if(entry._defResolved) return;
  if(entry.erklaerung && entry.erklaerung.trim()){
    entry._defResolved = true;
    return;
  }
  if(entry._defLoading) return;
  const api = window.WortDB && typeof window.WortDB.getDefinition === 'function'
    ? window.WortDB.getDefinition
    : null;
  if(!api) return;
  entry._defLoading = true;
  card.dataset.word = entry.wort;
  api(entry.wort).then(def => {
    entry._defLoading = false;
    entry._defResolved = true;
    if(!def) return;
    if(def.def_kid){
      entry.erklaerung = def.def_kid;
    }else if(def.def_src){
      const pieces = [];
      if(def.def_src.pos) pieces.push(def.def_src.pos);
      if(def.def_src.sense) pieces.push(def.def_src.sense);
      const text = pieces.join(' · ').trim();
      if(text) entry.erklaerung = text;
    }
    if(Array.isArray(def.beispiele) && def.beispiele.length){
      entry.beispiele = def.beispiele.slice();
    }
    if(Array.isArray(def.tags) && def.tags.length){
      const merged = new Set([...(entry.tags || []), ...def.tags]);
      entry.tags = Array.from(merged);
    }
    if(!card.isConnected) return;
    if(card.dataset.word !== entry.wort) return;
    const fresh = renderCard(entry, query);
    card.replaceWith(fresh);
  }).catch(err => {
    entry._defLoading = false;
    entry._defResolved = true;
    console.warn('def fetch failed', entry.wort, err);
  });
}

function highlight(text, q){
  if(!q || !text) return text;
  try{
    const re = new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')+')','ig');
    return text.replace(re, '<mark>$1</mark>');
  }catch(err){ return text; }
}

function esc(s){ return (s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function showSyllables(entry){
  if(entry.silben && entry.silben.length) return entry.silben.join('·');
  return guessSyllables(entry.wort).join('·');
}

/* sehr einfache Silbenheuristik, nur Fallback */
function guessSyllables(word){
  if(!word) return [];
  const w = word.toLowerCase().replace(/ß/g,'ss');
  const vowels = 'aeiouäöüy';
  const parts = [];
  let cur = '';
  for(let i=0;i<w.length;i++){
    cur += w[i];
    const c = w[i], n = w[i+1]||'';
    if(vowels.includes(c) && (!n || !vowels.includes(n))){
      if(n && !vowels.includes(n)){
        const nn = w[i+2]||'';
        if(nn && !vowels.includes(nn)){
          parts.push(cur); cur='';
        }
      }else{
        parts.push(cur); cur='';
      }
    }
  }
  if(cur) parts.push(cur);
  if(parts.length){
    const start = word.slice(0, parts[0].length);
    parts[0] = start;
    let pos = parts[0].length;
    for(let i=1;i<parts.length;i++){
      parts[i] = word.slice(pos, pos + parts[i].length);
      pos += parts[i].length;
    }
  }
  return parts;
}

/* TTS – lokal via Web Speech API, bevorzugt de-CH */
function setupVoices(){
  function load(){
    state.voices = speechSynthesis.getVoices().filter(v => /^de(-|$)/i.test(v.lang));
  }
  load();
  window.speechSynthesis.onvoiceschanged = load;
}

function pickVoice(){
  const ch = state.voices.find(v => /de-CH/i.test(v.lang)) || state.voices.find(v => /swiss/i.test(v.name));
  return ch || state.voices[0] || null;
}

function speak(text){
  if(!('speechSynthesis' in window)) return alert('Vorlesen wird von diesem Gerät nicht unterstützt.');
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if(v) u.voice = v;
  u.rate = 0.92;
  u.pitch = 1.0;
  u.lang = (v && v.lang) || 'de-DE';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* Benutzerdaten leeren (nur eigene Importe) */
function clearUserData(){
  if(!confirm('Benutzerdaten (eigene Importe) wirklich löschen? Lernwörter bleiben erhalten.')) return;
  state.userData = [];
  localStorage.removeItem('lw_user_entries');
  render([]);
  alert('Benutzerdaten gelöscht.');
}

/* ===== Sprachsuche (Web Speech API) ===== */
function setupSpeechSearch(){
  const micBtn = document.getElementById('btn-mic');
  if(!micBtn) return;

  micBtn.setAttribute('aria-pressed', 'false');
  micBtn.title = 'Sprachsuche starten';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){
    micBtn.disabled = true;
    micBtn.title = 'Sprachsuche wird von diesem Gerät/Browser nicht unterstützt.';
    return;
  }

  const rec = new SR();
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  let active = false;

  function updateLanguage(){
    const lang = navigator.language && /^de-CH/i.test(navigator.language) ? 'de-CH' : 'de-DE';
    rec.lang = lang;
  }

  function resetUI(message){
    active = false;
    micBtn.setAttribute('aria-pressed','false');
    micBtn.classList.remove('rec');
    micBtn.title = message || 'Sprachsuche starten';
  }

  function start(){
    if(active) return;
    updateLanguage();
    try{
      rec.start();
    }catch(err){
      resetUI();
      console.warn('SpeechRecognition start() fehlgeschlagen', err);
    }
  }

  function stop(){
    try{
      rec.stop();
    }catch(err){
      resetUI();
      console.warn('SpeechRecognition stop() fehlgeschlagen', err);
    }
  }

  micBtn.addEventListener('click', ()=>{
    if(active){
      stop();
      return;
    }
    start();
  });

  rec.onstart = ()=>{
    active = true;
    micBtn.setAttribute('aria-pressed','true');
    micBtn.classList.add('rec');
    micBtn.title = 'Zuhören … erneut klicken zum Stoppen';
  };

  rec.onend = ()=>{
    resetUI();
  };

  rec.onerror = (ev)=>{
    if(!ev) return;
    if(ev.error === 'not-allowed' || ev.error === 'service-not-allowed'){
      resetUI('Mikrofonzugriff verweigert.');
      micBtn.disabled = true;
      micBtn.title = 'Zugriff auf das Mikrofon wurde blockiert.';
      return;
    }
    if(ev.error === 'no-speech'){
      resetUI('Keine Sprache erkannt – erneut versuchen.');
      return;
    }
    if(ev.error !== 'aborted'){
      resetUI();
      alert('Sprachsuche Fehler: ' + ev.error);
    }
  };

  rec.onresult = (ev)=>{
    const idx = ev.resultIndex ?? 0;
    const list = ev.results && ev.results[idx] ? ev.results[idx] : (ev.results && ev.results[0]);
    const alt = list && list[0];
    const text = alt ? String(alt.transcript || '').trim() : '';
    if(!text) return;
    const q = $('#q');
    if(!q) return;
    q.value = text;
    q.focus();
    q.dispatchEvent(new Event('input', { bubbles: true }));
  };
}

/* ===== Import/Export mit Dubletten-Schutz und String-Listen-Unterstützung ===== */
async function onImport(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const text = await file.text();
  let entries = [];
  if(/\.json$/i.test(file.name)){
    try{
      const obj = JSON.parse(text);
      if(Array.isArray(obj)){ // z. B. 5000er Wortliste
        entries = obj.map(s => ({ wort: String(s) }));
      }else{
        entries = obj.entries || obj.items || [];
      }
    }catch(e){ alert('JSON fehlerhaft.'); return; }
  }else{ // CSV
    entries = parseCSV(text);
  }
  if(!Array.isArray(entries)){ alert('Keine Liste gefunden.'); return; }

  const normed = entries.map(e => ({
    wort: (e.wort||e.word||'').replace(/ß/g,'ss').trim(),
    silben: e.silben ? String(e.silben).split(/[-·\s]/).filter(Boolean) : [],
    erklaerung: (e.erklaerung||e.definition||'').trim(),
    beispiele: e.beispiele
      ? (Array.isArray(e.beispiele) ? e.beispiele : String(e.beispiele).split(/\s*[|]\s*/).filter(Boolean))
      : (e.beispiel ? [String(e.beispiel)] : []),
    tags: e.tags
      ? (Array.isArray(e.tags) ? e.tags : String(e.tags).split(/\s*[,;]\s*/).filter(Boolean))
      : []
  })).filter(x => x.wort);

  const m = mergeUserData(state.userData||[], normed);
  state.userData = m.out;
  localStorage.setItem('lw_user_entries', JSON.stringify(state.userData));

  $('#q').value = '';
  render([]);
  alert(`${m.added} Einträge neu, ${m.skipped} übersprungen (bereits vorhanden).`);
  ev.target.value = '';
}

function mergeUserData(existing, incoming){
  const normKey = e => norm(String((e.wort||'').replace(/ß/g,'ss')).trim());
  const seen = new Set((existing||[]).map(normKey));
  let added = 0, skipped = 0;
  const out = (existing||[]).slice();
  for(const e of (incoming||[])){
    const w = String(e.wort||'').replace(/ß/g,'ss').trim();
    const key = norm(w);
    if(!w){ skipped++; continue; }
    if(seen.has(key)){ skipped++; continue; }
    out.push({...e, wort: w});
    seen.add(key);
    added++;
  }
  return {out, added, skipped};
}

function onExport(){
  const entries = state.userData;
  const blob = new Blob([JSON.stringify({version:'0.1.0', orthography:'CH-DE', entries}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'woerterbuch-benutzer.json';
  a.click();
  URL.revokeObjectURL(url);
}

/* CSV utils */
function parseCSV(text){
  const delim = text.indexOf(';')>-1 ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  const head = lines.shift().split(delim).map(s=>s.trim().toLowerCase());
  const rows = lines.map(l => splitCSVLine(l, delim));
  return rows.map(cols => {
    const obj = {};
    head.forEach((h,i) => obj[h] = cols[i] || '');
    return obj;
  });
}
function splitCSVLine(line, delim){
  const out=[]; let cur=''; let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='\"'){ quoted=!quoted; continue; }
    if(ch===delim && !quoted){ out.push(cur); cur=''; continue; }
    cur+=ch;
  }
  out.push(cur);
  return out.map(s=>s.trim());
}

/* Lernwörter */
function hydrateLearn(){
  const raw = localStorage.getItem('lw_learn');
  if(raw){ try{ state.learnWords = JSON.parse(raw) || []; }catch(err){} }
  renderLearn();
}
function saveLearn(){
  localStorage.setItem('lw_learn', JSON.stringify(state.learnWords));
  renderLearn();
}
function renderLearn(){
  const list = $('#learn-list');
  const cnt = $('#learn-count');
  if(!list || !cnt) return;
  list.innerHTML = '';
  (state.learnWords||[]).forEach((w, i)=>{
    const li = document.createElement('li');
    li.innerHTML = esc(w) + ' <button class="rm" data-i="'+i+'">entfernen</button>';
    list.appendChild(li);
  });
  cnt.textContent = String(state.learnWords.length);
  list.querySelectorAll('.rm').forEach(btn=>btn.addEventListener('click', ev=>{
    const i = +ev.currentTarget.dataset.i;
    state.learnWords.splice(i,1);
    saveLearn();
  }));
}
function addLearn(word){
  if(!word) return;
  if(!state.learnWords.find(w=>norm(w)===norm(word))){
    state.learnWords.push(word);
    saveLearn();
  }
}

/* Delegation für Export/Leeren */
document.addEventListener('click', (e)=>{
  const t = e.target;
  if(!t) return;

  if(t.id==='btn-clear-user'){ clearUserData(); return; }

  if(t.id==='learn-export-csv'){
    const rows = ['wort'];
    state.learnWords.forEach(w => rows.push('"'+w.replace(/"/g,'""')+'"'));
    const blob = new Blob([rows.join('\n')], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'lernwoerter.csv'; a.click(); URL.revokeObjectURL(url);
  }else if(t.id==='learn-export-json'){
    const blob = new Blob([JSON.stringify({lernwoerter: state.learnWords}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'lernwoerter.json'; a.click(); URL.revokeObjectURL(url);
  }else if(t.id==='learn-clear'){
    if(confirm('Liste wirklich leeren?')){ state.learnWords = []; saveLearn(); }
  }
});
