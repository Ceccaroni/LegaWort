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

/* Zusatz-Heuristik für sehr kurze Eingaben (2–3 Zeichen)
   – vergleicht gegen Wortanfang
   – berücksichtigt Verwechslungsgruppen (b/d/p/q, g/k, ei/ie, Vokale)
*/
function confusableStarts(q){
  if(!q) return null;
  const groups = {
    a: '[aäàáâeio]',
    e: '[eèéêiy]',
    i: '[iíìîye]',
    o: '[oóòôu]',
    u: '[uúùûo]',
    b: '[bdpq]',
    d: '[bdpq]',
    p: '[bdpq]',
    q: '[bdpq]',
    g: '[gk]',
    k: '[gk]',
    s: '[sz]',
    z: '[zs]'
  };
  const nq = q.toLowerCase().replace(/ß/g,'ss');
  if(nq === 'ei' || nq === 'ie'){
    return /^(ei|ie)/i;
  }
  let pattern = '^';
  for(const ch of nq){
    const cls = groups[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    pattern += cls;
  }
  return new RegExp(pattern, 'i');
}

function prefixDistance(a, word){
  const b = norm(word).slice(0, Math.max(3, a.length));
  return distance(a, b);
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
    const mapped = list.map(e => ({
      wort: (e.wort||e.word||String(e)).replace(/ß/g,'ss').trim(),
      silben: e.silben ? String(e.silben).split(/[-·\s]/).filter(Boolean) : [],
      erklaerung: (e.erklaerung||e.definition||'').trim(),
      beispiele: e.beispiele ? (Array.isArray(e.beispiele)?e.beispiele:String(e.beispiele).split(/\s*[|]\s*/).filter(Boolean)) : [],
      tags: e.tags ? (Array.isArray(e.tags)?e.tags:String(e.tags).split(/\s*[,;]\s*/).filter(Boolean)) : []
    })).filter(x=>x.wort);
    state.chunkCache.set(p, mapped);
    return mapped;
  }catch(err){
    console.warn('Chunk-Load fehlgeschlagen', p, err);
    state.chunkCache.set(p, []);
    return [];
  }
}

async function doSearch(input){
  const q = norm(input);
  if(q.length < 2){ render([]); return; }

  // Basis + User
  let pool = state.data.concat(state.userData);

  // Grosse Daten: passenden Chunk nachladen
  if(state.chunkIndex){
    const pref = q.slice(0, state.chunkPrefixLen);
    const chunk = await ensureChunk(pref);
    pool = pool.concat(chunk);
  }

  // Direkte Treffer
  const direct = pool.filter(it => norm(it.wort).includes(q));

  // Kurz-Query-Heuristik (2–3 Zeichen): Wortanfang + Verwechslungsgruppen
  let shortHits = [];
  if(q.length <= 3){
    const rx = confusableStarts(q);
    if(rx){
      shortHits = pool.filter(it => rx.test(norm(it.wort)));
    }
    const nearPrefix = pool.filter(it => prefixDistance(q, it.wort) <= 2);
    shortHits = shortHits.concat(nearPrefix);
  }

  // Fuzzy (allgemein, aber gedrosselt)
  const fuzzy = pool
    .map(it => ({ it, d: distance(q, norm(it.wort)) }))
    .sort((a,b)=>a.d-b.d)
    .filter(x => x.d > 0 && x.d <= Math.max(2, Math.floor(q.length/3)))
    .slice(0, 24)
    .map(x => x.it);

  // Mischen, Dedup, Limit
  const merged = [...new Set([...direct, ...shortHits, ...fuzzy])].slice(0, 24);
  render(merged, q);
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

/* Damerau–Levenshtein (einfach) */
function distance(a,b){
  const al=a.length, bl=b.length;
  const dp = Array.from({length: al+1}, ()=>Array(bl+1).fill(0));
  for(let i=0;i<=al;i++) dp[i][0]=i;
  for(let j=0;j<=bl;j++) dp[0][j]=j;
  for(let i=1;i<=al;i++){
    for(let j=1;j<=bl;j++){
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + cost
      );
      if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]){
        dp[i][j] = Math.min(dp[i][j], dp[i-2][j-2] + 1);
      }
    }
  }
  return dp[al][bl];
}

/* Rendering */
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
  const w = esc(entry.wort);
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
  }catch{ return text; }
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
  if(raw){ try{ state.learnWords = JSON.parse(raw) || []; }catch{} }
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
