#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KnowledgeBase } from '../lib/kb/index.js';
import { buildConfig, validateConfig } from '../lib/build/engine.js';
import { loadHosts } from '../lib/adapter/hosts.js';
import { loadRegistry } from '../lib/adapter/live.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const kb = await KnowledgeBase.load();
const hosts = loadHosts();
const host = hosts[0];
const registry = await loadRegistry(host, { force: true });
const roomId = process.argv[2] || registry.spaces.find((space) => space.lifecycle !== 'suspended')?.id;
const room = registry.spaces.find((space) => space.id === roomId);

if (!room) {
  console.error(`Room not found: ${roomId}`);
  console.error(`Available: ${registry.spaces.map((space) => space.id).join(', ')}`);
  process.exit(1);
}

const archetype = kb.getArchetype(room.roomType);
if (!archetype) {
  console.error(`No archetype for room type: ${room.roomType}`);
  process.exit(1);
}

const schema = Number(process.env.BUILD_SCHEMA || 12);
const built = buildConfig({
  room,
  archetype,
  schema,
  page: 1,
  pageName: room.name,
  modules: kb.moduleCatalog,
});
const validation = validateConfig(built.config, { modules: kb.moduleCatalog });

const outDir = path.join(ROOT, 'out');
await fs.mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `${room.id}-generated.companionconfig`);
await fs.writeFile(outFile, `${JSON.stringify(built.config, null, 2)}\n`, 'utf8');

console.log(`Room:        ${room.id} (${room.roomType})`);
console.log(`Archetype:   ${archetype.label}`);
console.log(`Schema:      ${schema} (${built.meta.styleMode})`);
console.log(`Connections: ${built.meta.instances}`);
console.log(`Buttons:     ${built.meta.buttons}`);
console.log(`Variables:   ${built.meta.customVariables}`);
console.log(`Validation:  ${validation.ok ? 'OK' : 'FAILED'}`);
for (const error of validation.errors) console.log(`  error: ${error}`);
for (const warning of [...built.warnings, ...validation.warnings]) console.log(`  warn:  ${warning}`);
console.log(`Wrote:       ${path.relative(ROOT, outFile)}`);

if (!validation.ok) process.exitCode = 1;
