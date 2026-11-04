#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveRoomsFromExport, summarizeConfig } from '../lib/adapter/companion.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = path.join(ROOT, 'config', 'private');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const url = arg('host', process.env.COMPANION_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const exportUrl = `${url}/int/export/full?format=json`;

console.log(`Reading Companion export: GET ${exportUrl}`);
const response = await fetch(exportUrl, {
  method: 'GET',
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  console.error(`Export failed: HTTP ${response.status}`);
  process.exit(1);
}
const config = await response.json();
const registry = deriveRoomsFromExport(config);
const summary = summarizeConfig(config);

await fs.mkdir(PRIVATE, { recursive: true });
const roomsFile = path.join(PRIVATE, 'rooms.json');
const reportFile = path.join(PRIVATE, 'inventory-report.json');
await fs.writeFile(roomsFile, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
await fs.writeFile(
  reportFile,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), source: url, summary, counts: { spaces: registry.spaces.length, groups: registry.groups.length } }, null, 2)}\n`,
  'utf8',
);

console.log(`Build:       ${summary.build}`);
console.log(`Schema:      ${summary.schema} (${summary.styleMode})`);
console.log(`Pages:       ${summary.pages}`);
console.log(`Instances:   ${summary.instances}`);
console.log(`Spaces:      ${registry.spaces.length}`);
console.log(`Groups:      ${registry.groups.length}`);
console.log(`Modules:     ${Object.entries(summary.modules).map(([id, count]) => `${id} x${count}`).join(', ')}`);
console.log(`Wrote:       ${path.relative(ROOT, roomsFile)}`);
console.log(`Wrote:       ${path.relative(ROOT, reportFile)}`);
