#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const hyphenation = require('../shared/hyphenation');

let hyphenationCompiled = null;
try {
  const hyphenationPath = path.join(__dirname, '..', 'data', 'hyphenation', 'de-ch.json');
  if (fs.existsSync(hyphenationPath)) {
    const raw = JSON.parse(fs.readFileSync(hyphenationPath, 'utf8'));
    hyphenationCompiled = hyphenation.compileHyphenation(raw);
  }
} catch (err) {
  console.warn('Hyphenation unavailable for extractor:', err.message);
}

function parseArgs() {
  const opts = {
    out: path.join(__dirname, '..', 'public', 'data', 'defs'),
    dry: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry' || arg === '--dry-run') {
      opts.dry = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'dump') {
        opts.dump = value;
        continue;
      }
      if (key === 'wordfile') {
        opts.wordfile = value;
        continue;
      }
      if (key === 'out') {
        opts.out = value;
        continue;
      }
      throw new Error(`Unrecognized option --${key}`);
    }
    throw new Error(`Unrecognized argument: ${arg}`);
  }
  if (!opts.dump) throw new Error('Missing required --dump path');
  if (!opts.wordfile) throw new Error('Missing required --wordfile path');
  return opts;
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

function normName(value) {
  return norm(value).replace(/[^a-z0-9_]/g, '_');
}

function resolvePaths(word) {
  const normalized = normName(word);
  const fileBase = normalized || '_';
  const prefix = fileBase.slice(0, 2) || '_';
  return { normalized: fileBase, prefix, fileName: `${fileBase}.json` };
}

function resolveFilePath(word, outRoot) {
  const { prefix, fileName } = resolvePaths(word);
  const targetDir = path.join(outRoot, prefix || '_');
  const targetPath = path.join(targetDir, fileName);
  return { targetDir, targetPath, prefix: prefix || '_', fileName };
}

function stripMarkup(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/~~/g, '')
    .replace(/[\u0332-\u0338]/g, '')
    .replace(/&[a-z]+;/gi, ' ');
}

function sanitizeSenseText(value) {
  if (typeof value !== 'string') return '';
  let text = stripMarkup(value).trim();
  text = text.replace(/^[-•·\u2022]+\s*/, '');
  text = text.replace(/^\.+\s*/, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function sanitizeExampleText(value) {
  if (typeof value !== 'string') return '';
  let text = stripMarkup(value).trim();
  if (!text) return '';
  text = text.replace(/^[-•·\u2022]+\s*/, '');
  text = text.replace(/^"+/, '').replace(/"+$/, '');
  text = text.replace(/^„+/, '„').replace(/“+$/, '“');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text.startsWith('„')) text = `„${text.replace(/^„/, '')}`;
  if (!text.endsWith('“')) text = `${text.replace(/“$/, '')}“`;
  return text;
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
  return examples.map(sanitizeExampleText).filter(Boolean);
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
    sense: sanitizeSenseText(extractSenseText(sense)) || null,
  };

  const mapped = {
    wort: entry?.word || '',
    def_src,
    def_kid: null,
    beispiele: extractExamples(sense),
    tags: collectTags(entry, sense),
    source: 'wiktionary',
    via: 'wiktextract',
    license: 'CC-BY-SA 4.0',
    ts_cached: Date.now(),
  };

  if (hyphenationCompiled && mapped.wort) {
    const parts = hyphenation.hyphenate(mapped.wort, hyphenationCompiled);
    if (Array.isArray(parts) && parts.length) {
      mapped.silben = parts;
    }
  }

  return mapped;
}

function loadWordList(wordfile) {
  if (!fs.existsSync(wordfile)) throw new Error(`Word list not found: ${wordfile}`);
  const raw = fs.readFileSync(wordfile, 'utf8');
  const lines = raw.split(/\r?\n/);
  const map = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = normName(trimmed);
    if (!normalized) continue;
    if (!map.has(normalized)) {
      map.set(normalized, { words: new Set(), created: false, skipped: false, path: null });
    }
    map.get(normalized).words.add(trimmed);
  }
  return map;
}

async function extract(opts) {
  if (!fs.existsSync(opts.dump)) {
    throw new Error(`Dump file not found: ${opts.dump}`);
  }
  const targets = loadWordList(opts.wordfile);
  if (!targets.size) {
    console.warn('No words to process (needs.txt empty?)');
    return { created: 0, skipped: 0, missing: [] };
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(opts.dump, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let created = 0;
  let skippedExisting = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch (err) {
      console.warn('Skip unparsable line:', err.message);
      continue;
    }
    if (!entry?.word) continue;
    const normalized = normName(entry.word);
    const targetInfo = targets.get(normalized);
    if (!targetInfo) continue;
    if (targetInfo.created || targetInfo.skipped) continue;

    const { targetDir, targetPath } = resolveFilePath(entry.word, opts.out);
    if (fs.existsSync(targetPath)) {
      targetInfo.skipped = true;
      targetInfo.path = targetPath;
      skippedExisting += 1;
      console.info(`skip existing ${path.relative(process.cwd(), targetPath)}`);
      continue;
    }

    const data = mapEntry(entry);
    if (opts.dry) {
      targetInfo.created = true;
      targetInfo.path = targetPath;
      created += 1;
      console.info(`dry -> ${path.relative(process.cwd(), targetPath)}`);
      continue;
    }

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    targetInfo.created = true;
    targetInfo.path = targetPath;
    created += 1;
    console.info(`write ${path.relative(process.cwd(), targetPath)}`);
  }

  const missing = [];
  for (const [normalized, info] of targets.entries()) {
    if (!info.created && !info.skipped) {
      const sample = info.words.values().next().value;
      missing.push(sample || normalized);
    }
  }

  console.info(`Done. new=${created} skipped=${skippedExisting} missing=${missing.length}`);
  if (missing.length) {
    console.warn('Missing definitions:', missing.join(', '));
  }
  return { created, skipped: skippedExisting, missing };
}

(async function main() {
  try {
    const opts = parseArgs();
    await extract(opts);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
})();
