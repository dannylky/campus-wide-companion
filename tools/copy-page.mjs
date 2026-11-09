#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importPage, connect, call, wsUrl } from '../lib/companion-import.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.COMPANION_URL || 'http://127.0.0.1:8000';
const FROM = Number(arg('from', '8'));
const TO = Number(arg('to', '9'));
const NAME = arg('name', '');
const APPLY = process.argv.includes('--apply');
const OUT = path.resolve(ROOT, arg('out', `out/page-${FROM}-to-${TO}.companionconfig`));

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const response = await fetch(`${BASE}/int/export/full?format=json`, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Companion export failed: HTTP ${response.status}`);
const companion = await response.json();

const source = companion.pages[String(FROM)];
const target = companion.pages[String(TO)];
if (!source) throw new Error(`Source page ${FROM} not found`);
if (!target) throw new Error(`Target page ${TO} not found`);
const targetName = target.name;

const sourceControls = Object.entries(source.controls || {}).flatMap(([row, cols]) =>
  Object.keys(cols).map((column) => `${row}/${column}`),
);
const targetControls = Object.entries(target.controls || {}).flatMap(([row, cols]) =>
  Object.keys(cols).map((column) => `${row}/${column}`),
);

console.log(`From:   page ${FROM} "${source.name}" (${sourceControls.length} controls)`);
console.log(`To:     page ${TO} "${target.name}" (${targetControls.length} controls)`);
console.log(`Grid:   ${JSON.stringify(source.gridSize)} -> ${JSON.stringify(target.gridSize)}`);

const config = {
  version: 12,
  type: 'full',
  companionBuild: companion.companionBuild,
  pages: { 1: source },
  instances: {},
  custom_variables: {},
  triggers: {},
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Wrote:  ${path.relative(ROOT, OUT)}`);

if (!APPLY) {
  console.log('Dry run. Add --apply to replace the target page buttons.');
  process.exit(0);
}

const result = await importPage({
  baseUrl: BASE,
  sourcePage: 1,
  targetPage: TO,
  config,
  name: `page-${FROM}-to-${TO}.companionconfig`,
});
console.log(`Imported: ${result.bytes} bytes, sha1 ${result.checksum}`);

const finalName = NAME || targetName || source.name;
const ws = await connect(wsUrl(BASE));
try {
  await call(ws, 'mutation', 'pages.setName', { pageNumber: TO, name: finalName });
  console.log(`Name:     page ${TO} -> "${finalName}"`);
} finally {
  ws.close();
}

console.log('Done. Refresh Companion.');
