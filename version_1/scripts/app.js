/* Legasthenie‑Wörterbuch – CH‑DE
   Keine externen Ressourcen, läuft auf GitHub Pages.
*/
const state = {
  data: [],
  userData: [],
  voices: [],
  showSyll: true,
  dys: false,
  contrast: false,
  ruler: false,
  ls: 3,
  lh: 18
};

const $ = sel => document.querySelector(sel);
const resultsEl = $('#results');
const rulerEl = $('#ruler');

(async function init(){
  // Load base data
  try{
    const res = await fetch('data/words.json');
    const base = await res.json();
    state.data = base.entries || [];
  }catch(e){
    console.warn('Kein Basis-Datensatz geladen', e);
  }
  // Load user data
  const u = localStorage.getItem('lw_user_entries');
  if(u){ try{ state.userData = JSON.parse(u); }catch(e){} }

  // Settings
  hydrateSettings();

  // Render initial
  render(state.data.concat(state.userData));

  // Wire UI
  $('#q').addEventListener('input', onSearch);
  $('#toggle-syll').addEventListener('change', (e)=>{ state.showSyll = e.target.checked; render(); saveSettings(); });
  $('#toggle-dys').addEventListener('change', (e)=>{ state.dys = e.target.checked; document.body.classList.toggle('dys', state.dys); saveSettings(); });
  $('#toggle-contrast').addEventListener('change', (e)=>{ state.contrast = e.target.checked; document.body.classList.toggle('contrast', state.contrast); saveSettings(); });
  $('#toggle-ruler').addEventListener('change', (e)=>{ state.ruler = e.target.checked; rulerEl.hidden = !state.ruler; saveSettings(); });

  $('#ls').addEventListener('input', (e)=>{ state.ls = +e.target.value; document.documentElement.style.setProperty('--ls', (state.ls/100)+'em'); saveSettings(); });
  $('#lh').addEventListener('input', (e)=>{ state.lh = +e.target.value; document.documentElement.style.setProperty('--lh', (state.lh/10)); saveSettings(); });

  // Import/Export
  $('#btn-import').addEventListener('click', ()=> $('#file').click());
  $('#file').addEventListener('change', onImport);
  $('#btn-export').addEventListener('click', onExport);

  // Voices
  setupVoices();

  // Ruler follow
  document.addEventListener('mousemove', (e)=>{
    if(!state.ruler) return;
    rulerEl.style.top = Math.max(0, e.clientY - rulerEl.offsetHeight/2) + 'px';
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
  $('#toggle-syll').checked = state.showSyll;
  $('#toggle-dys').checked = state.dys;
  $('#toggle-contrast').checked = state.contrast;
  $('#toggle-ruler').checked = state.ruler;
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

/* Search */
function onSearch(e){
  const q = norm(e.target.value);
  const all = state.data.concat(state.userData);
  if(q.length === 0){ render(all); return; }

  const direct = all.filter(it => norm(it.wort).includes(q));
  // Fuzzy suggestions
  const fuzzy = all
    .map(it => ({ it, d: distance(q, norm(it.wort)) }))
    .sort((a,b)=>a.d-b.d)
    .filter(x => x.d > 0 && x.d <= Math.max(2, Math.floor(q.length/3)))
    .slice(0, 12)
    .map(x => x.it);

  const merged = [...new Set([...direct, ...fuzzy])];
  render(merged, q);
}

/* Normalisierung: Kleinbuchstaben, ss statt ß, Diakritika entfernen */
function norm(s){
  if(!s) return '';
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue');
}

/* Damerau–Levenshtein (einfach, ohne Gewichte) */
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
  const items = (list || state.data.concat(state.userData));
  resultsEl.innerHTML = '';
  if(items.length === 0){
    resultsEl.innerHTML = `<div class="card"><h2>Keine Treffer</h2><p class="definition">Tipp: Schreibe, wie du hörst. Das System findet auch ähnliche Wörter.</p></div>`;
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
      <button aria-label="Merken" data-act="remember">Merken</button>
    </div>
  `;

  card.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      const act = ev.currentTarget.dataset.act;
      if(act==='speak-word') speak(entry.wort);
      else if(act==='speak-def') speak(entry.erklaerung||entry.wort);
      else if(act==='remember') remember(entry);
    });
  });

  return card;
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
      // Silbenende vor Konsonantenwechsel
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
  // Erste Silbe gross/Original übernehmen
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

/* Merkliste – einfach via localStorage */
function remember(entry){
  let list = JSON.parse(localStorage.getItem('lw_favs')||'[]');
  if(!list.find(x=>x.wort===entry.wort)){
    list.push({wort:entry.wort, ts:Date.now()});
    localStorage.setItem('lw_favs', JSON.stringify(list));
    alert('Gespeichert.');
  }else{
    alert('Schon gespeichert.');
  }
}

/* Import/Export */
async function onImport(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const text = await file.text();
  let entries = [];
  if(/\.json$/i.test(file.name)){
    try{
      const obj = JSON.parse(text);
      entries = obj.entries || obj || [];
    }catch(e){ alert('JSON fehlerhaft.'); return; }
  }else{ // CSV
    entries = parseCSV(text);
  }
  if(!Array.isArray(entries)){ alert('Keine Liste gefunden.'); return; }
  // Normierung
  const normed = entries.map(e => ({
    wort: (e.wort||e.word||'').replace(/ß/g,'ss').trim(),
    silben: e.silben ? String(e.silben).split(/[-·\s]/).filter(Boolean) : [],
    erklaerung: (e.erklaerung||e.definition||'').trim(),
    beispiele: e.beispiele ? String(e.beispiele).split(/\s*[|]\s*/).filter(Boolean) : (e.beispiel ? [String(e.beispiel)] : []),
    tags: e.tags ? String(e.tags).split(/\s*[,;]\s*/).filter(Boolean) : []
  })).filter(x => x.wort);

  state.userData = (state.userData||[]).concat(normed);
  localStorage.setItem('lw_user_entries', JSON.stringify(state.userData));
  $('#q').value = '';
  render(state.data.concat(state.userData));
  alert(`${normed.length} Einträge importiert (nur lokal).`);
  ev.target.value = '';
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

/* sehr einfache CSV-Parserin (Trennzeichen ; oder ,) */
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
