const GOLD_URL = 'bench/gold.jsonl';
const TARGETS = {
  recall: 0.95,
  mrr: 0.90,
  p95: 150
};
const SEARCH_TIMEOUT_MS = 2000;
let goldPromise = null;
let readyPromise = null;

async function loadGold(){
  if(!goldPromise){
    goldPromise = fetch(GOLD_URL)
      .then(res => {
        if(!res.ok) throw new Error(`gold.jsonl nicht ladbar (${res.status})`);
        return res.text();
      })
      .then(parseGold)
      .catch(err => {
        goldPromise = null;
        throw err;
      });
  }
  return goldPromise;
}

function parseGold(text){
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      try{
        const row = JSON.parse(line);
        if(!row || typeof row.query !== 'string' || !Array.isArray(row.expected)){
          throw new Error('Schema');
        }
        const expected = row.expected.map(v => String(v)).filter(Boolean);
        if(!expected.length){
          throw new Error('keine erwarteten Treffer');
        }
        return {
          query: row.query,
          expected,
          note: row.note ? String(row.note) : ''
        };
      }catch(err){
        throw new Error(`gold.jsonl Zeile ${idx + 1} ungültig: ${err.message}`);
      }
    });
}

async function ensureSearchReady(){
  if(!readyPromise){
    readyPromise = (async ()=>{
      const started = performance.now();
      while(typeof window.doSearch !== 'function'){
        if(performance.now() - started > 5000){
          throw new Error('Suchfunktion nicht initialisiert');
        }
        await delay(50);
      }
    })().catch(err => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

function delay(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nextFrame(){
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function waitForResults(minCards = 1){
  const started = performance.now();
  while(true){
    const cards = document.querySelectorAll('#results .card');
    if(cards.length >= minCards) return;
    if(performance.now() - started > SEARCH_TIMEOUT_MS) return;
    await nextFrame();
  }
}

async function warmUp(dataset){
  for(const item of dataset){
    const input = document.getElementById('q');
    if(input){
      input.value = item.query;
    }
    await window.doSearch(item.query);
    await waitForResults(0);
  }
}

async function runCase(entry){
  const input = document.getElementById('q');
  if(input){
    input.value = entry.query;
  }
  const start = performance.now();
  await window.doSearch(entry.query);
  await waitForResults(1);
  const elapsed = performance.now() - start;
  const results = collectTopResults();
  const rank = findRank(results, entry.expected);
  return {
    query: entry.query,
    expected: entry.expected,
    results,
    latency: elapsed,
    rank,
    hit: typeof rank === 'number' && rank > -1
  };
}

function collectTopResults(limit = 5){
  const nodes = document.querySelectorAll('#results .card h2');
  const words = [];
  for(const node of nodes){
    if(words.length >= limit) break;
    words.push(node.textContent.trim());
  }
  return words;
}

function findRank(results, expected){
  if(!results.length) return null;
  const expectedSet = expected.map(v => v.toLowerCase());
  for(let i = 0; i < results.length; i++){
    const word = results[i];
    if(expectedSet.includes(word.toLowerCase())){
      return i;
    }
  }
  return null;
}

function percentile(values, ratio){
  if(!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function renderMetrics(container, metrics){
  const { recall, mrr, p95, recallPass, mrrPass, p95Pass } = metrics;
  container.innerHTML = `
    <div class="metric ${recallPass ? 'ok' : 'fail'}">
      <strong>${(recall * 100).toFixed(1)}%</strong>
      <span>Recall @5</span>
      <span class="bench-inline-note">Ziel ≥ ${(TARGETS.recall * 100).toFixed(0)}%</span>
    </div>
    <div class="metric ${mrrPass ? 'ok' : 'fail'}">
      <strong>${mrr.toFixed(3)}</strong>
      <span>MRR</span>
      <span class="bench-inline-note">Ziel ≥ ${TARGETS.mrr.toFixed(2)}</span>
    </div>
    <div class="metric ${p95Pass ? 'ok' : 'fail'}">
      <strong>${p95.toFixed(1)} ms</strong>
      <span>P95 Latenz</span>
      <span class="bench-inline-note">Ziel &lt; ${TARGETS.p95} ms</span>
    </div>`;
}

function renderDetails(table, details){
  const tbody = table.querySelector('tbody');
  if(!tbody) return;
  const rows = details.map(item => {
    const rankText = typeof item.rank === 'number' ? (item.rank + 1).toString() : '–';
    const top = item.results.join(', ');
    const expected = item.expected.join(', ');
    return `<tr>
      <td>${escapeHtml(item.query)}</td>
      <td>${escapeHtml(expected)}</td>
      <td>${escapeHtml(top)}</td>
      <td>${rankText}</td>
      <td>${item.latency.toFixed(1)}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function escapeHtml(text){
  return String(text).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function setStatus(el, message, ok){
  el.textContent = message;
  el.classList.toggle('ok', !!ok);
  el.classList.toggle('fail', ok === false);
}

async function runBenchmark({ warmOnly = false } = {}){
  const [dataset] = await Promise.all([loadGold(), ensureSearchReady()]);
  const status = document.getElementById('bench-status');
  const metricsEl = document.getElementById('bench-metrics');
  const table = document.getElementById('bench-table');
  const runBtn = document.getElementById('bench-run');
  const warmBtn = document.getElementById('bench-warm');
  runBtn.disabled = true;
  warmBtn.disabled = true;
  setStatus(status, warmOnly ? 'Wärme Suchcache auf …' : 'Benchmark läuft …', null);
  try{
    await warmUp(dataset);
    if(warmOnly){
      setStatus(status, 'Aufwärmen abgeschlossen.', true);
      return;
    }
    const details = [];
    const latencies = [];
    let recallHits = 0;
    let rrSum = 0;
    for(const entry of dataset){
      const result = await runCase(entry);
      details.push(result);
      latencies.push(result.latency);
      if(typeof result.rank === 'number' && result.rank > -1){
        if(result.rank <= 4) recallHits += 1;
        rrSum += 1 / (result.rank + 1);
      }
    }
    const recall = details.length ? recallHits / details.length : 0;
    const mrr = details.length ? rrSum / details.length : 0;
    const p95 = percentile(latencies, 0.95);
    const recallPass = recall >= TARGETS.recall;
    const mrrPass = mrr >= TARGETS.mrr;
    const p95Pass = p95 < TARGETS.p95;
    const ok = recallPass && mrrPass && p95Pass;
    setStatus(status, ok ? 'Benchmark erfüllt alle Zielwerte.' : 'Zielwerte nicht erreicht – Details prüfen.', ok);
    renderMetrics(metricsEl, { recall, mrr, p95, recallPass, mrrPass, p95Pass });
    renderDetails(table, details);
  }catch(err){
    console.error(err);
    setStatus(status, err.message || 'Benchmark fehlgeschlagen.', false);
  }finally{
    runBtn.disabled = false;
    warmBtn.disabled = false;
  }
}

function setupUI(){
  const runBtn = document.getElementById('bench-run');
  const warmBtn = document.getElementById('bench-warm');
  runBtn?.addEventListener('click', () => runBenchmark({ warmOnly: false }));
  warmBtn?.addEventListener('click', () => runBenchmark({ warmOnly: true }));
}

setupUI();
