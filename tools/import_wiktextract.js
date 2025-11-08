#!/usr/bin/env node
'use strict';
// Importer for Wiktextract JSONL dumps.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs() {
  const opts = { dry: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry' || arg === '--dry-run') {
      opts.dry = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      opts[key] = value;
      continue;
    }
    throw new Error(`Unrecognized argument: ${arg}`);
  }
  if (!opts.prefix) throw new Error('Missing --prefix');
  if (!opts.in) throw new Error('Missing --in');
  if (!opts.out) throw new Error('Missing --out');
  opts.prefix = normalizePrefix(opts.prefix);
  return opts;
}

function normalizePrefix(prefix) {
  const normalized = norm(prefix).slice(0, 2);
  if (!normalized) throw new Error(`Invalid prefix: ${prefix}`);
  return normalized;
}

function norm(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue');
}

function sanitizeFilename(value) {
  const normalized = norm(value)
    .replace(/[^a-z0-9_]/g, '_');
  return normalized || '_';
}

function pickSense(entry) {
  if (!Array.isArray(entry?.senses)) return null;
  for (const sense of entry.senses) {
    if (sense?.glosses?.length) return sense;
    if (typeof sense?.gloss === 'string' && sense.gloss.trim()) return sense;
    if (typeof sense?.sense === 'string' && sense.sense.trim()) return sense;
    if (sense?.definitions?.length) return sense;
  }
  return entry.senses[0] || null;
}

function extractSenseText(sense) {
  if (!sense) return null;
  if (Array.isArray(sense.glosses) && sense.glosses.length) return String(sense.glosses[0]);
  if (typeof sense.gloss === 'string' && sense.gloss.trim()) return sense.gloss.trim();
  if (typeof sense.sense === 'string' && sense.sense.trim()) return sense.sense.trim();
  if (Array.isArray(sense.definitions) && sense.definitions.length) return String(sense.definitions[0]);
  return null;
}

function extractExamples(sense) {
  if (!sense) return [];
  const examples = [];
  if (Array.isArray(sense.examples)) {
    for (const ex of sense.examples) {
      if (typeof ex === 'string' && ex.trim()) {
        examples.push(ex.trim());
      } else if (ex && typeof ex.text === 'string' && ex.text.trim()) {
        examples.push(ex.text.trim());
      }
      if (examples.length) break;
    }
  }
  return examples;
}

function collectTags(entry, sense) {
  const tags = new Set();
  const pushTags = (list) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (typeof item === 'string' && item.trim()) tags.add(item.trim());
    }
  };
  pushTags(entry?.tags);
  if (sense) {
    pushTags(sense.tags);
    pushTags(sense.raw_tags);
  }
  return Array.from(tags);
}

function mapEntry(entry) {
  const sense = pickSense(entry);
  const def_src = {
    pos: entry?.pos || sense?.pos || null,
    sense: extractSenseText(sense) || null,
  };

  return {
    wort: entry?.word || '',
    def_src: def_src,
    def_kid: null,
    beispiele: extractExamples(sense),
    tags: collectTags(entry, sense),
    source: 'wiktionary',
    via: 'wiktextract',
    license: 'CC-BY-SA 4.0',
    ts_cached: Date.now(),
  };
}

async function processFile(opts) {
  const inPath = opts.in;
  if (!fs.existsSync(inPath)) throw new Error(`Input file not found: ${inPath}`);
  const outRoot = opts.out;
  const prefixDir = path.join(outRoot, opts.prefix);
  const rl = readline.createInterface({
    input: fs.createReadStream(inPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let created = 0;
  let skipped = 0;
  let processed = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch (err) {
      console.warn('Skipping unparsable line:', err.message);
      continue;
    }
    if (!entry?.word) continue;
    const normWord = norm(entry.word);
    if (!normWord.startsWith(opts.prefix)) continue;

    processed += 1;
    const fileName = sanitizeFilename(entry.word) + '.json';
    const targetDir = prefixDir;
    const targetPath = path.join(targetDir, fileName);

    if (fs.existsSync(targetPath)) {
      skipped += 1;
      console.info(`skip existing ${path.relative(process.cwd(), targetPath)}`);
      continue;
    }

    const data = mapEntry(entry);
    if (opts.dry) {
      created += 1;
      console.info(`dry new ${path.relative(process.cwd(), targetPath)}`);
      continue;
    }

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    created += 1;
    console.info(`write ${path.relative(process.cwd(), targetPath)}`);
  }

  console.info(`Done. processed=${processed} new=${created} skipped=${skipped}`);
  return { processed, created, skipped };
}

(async function main() {
  try {
    const opts = parseArgs();
    await processFile(opts);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
})();
