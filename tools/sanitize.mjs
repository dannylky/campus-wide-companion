#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const input = path.resolve(ROOT, arg('in', 'config/private/rooms.json'));
const output = path.resolve(ROOT, arg('out', 'config/public/campus.json'));

let registry;
try {
  registry = JSON.parse(await fs.readFile(input, 'utf8'));
} catch (error) {
  console.error(`Cannot read private inventory: ${input}`);
  console.error('Run "npm run extract" against a Companion host first.');
  process.exit(0);
}

const idMap = new Map();
const blockLetters = ['X', 'Y', 'Z'];
registry.spaces
  .slice()
  .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
  .forEach((space, index) => {
    const block = blockLetters[Math.floor(index / 12) % blockLetters.length];
    const number = 101 + (index % 12);
    idMap.set(space.id, `${block}${number}`);
  });

const hostMap = new Map();
const pools = ['192.0.2', '198.51.100', '203.0.113'];
function mapHost(host) {
  if (!host) return '';
  if (!hostMap.has(host)) {
    const pool = pools[hostMap.size % pools.length];
    const octet = 20 + (hostMap.size % 200);
    hostMap.set(host, `${pool}.${octet}`);
  }
  return hostMap.get(host);
}

function mapLabel(label, space) {
  const newId = idMap.get(space.id) || 'X100';
  const oldBase = space.base || space.id;
  const newBase = newId.replace(/-[LR]$/, '');
  return String(label).replace(oldBase, newBase);
}

const groupMap = new Map();
const spaces = registry.spaces.map((space, index) => {
  const newId = idMap.get(space.id);
  const block = (newId.match(/^[A-Z]+/) || [])[0] || 'X';
  const groupId = `page-${Math.floor(index / 12) + 1}`;
  if (!groupMap.has(groupId)) {
    groupMap.set(groupId, {
      id: groupId,
      name: `Block ${block} ${Math.floor(index / 12) + 1}/F`,
      page: groupMap.size + 1,
      block,
      floor: `${Math.floor(index / 12) + 1}/F`,
      roomCount: 0,
    });
  }
  groupMap.get(groupId).roomCount += 1;

  const devices = {
    projectors: (space.devices?.projectors || []).map((device) => ({
      label: mapLabel(device.label, space),
      position: device.position || 'main',
      enabled: device.enabled !== false,
      module: device.module,
      host: mapHost(device.host),
      port: device.port || '',
    })),
    vs: null,
    amp: null,
    pcu: null,
    controller: null,
    switch: null,
  };
  for (const role of ['vs', 'amp', 'pcu', 'controller', 'switch']) {
    const device = space.devices?.[role];
    if (!device) continue;
    devices[role] = {
      label: mapLabel(device.label, space),
      module: device.module,
      enabled: device.enabled !== false,
      host: mapHost(device.host),
      port: device.port || '',
    };
  }

  return {
    id: newId,
    name: newId,
    base: newId.replace(/-[LR]$/, ''),
    group: groupId,
    page: groupMap.get(groupId).page,
    column: (index % 12) + 1,
    lifecycle: space.lifecycle || 'active',
    roomType: space.roomType,
    devices,
    variables: {
      state: space.variables?.state ? (idMap.get(space.variables.state) || space.variables.state) : null,
      pcu: space.variables?.pcu ? (idMap.get(space.variables.pcu) || space.variables.pcu) : null,
    },
    capabilities: space.capabilities,
    notes: (space.notes || []).filter((note) => !/^\d+\.\d+\.\d+\.\d+/.test(note)),
  };
});

const sanitized = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  synthetic: true,
  source: {
    companion: 'synthetic://sanitized',
    build: registry.source?.build || 'synthetic',
    schema: registry.source?.schema || 9,
    readOnly: true,
  },
  operatingHours: registry.operatingHours,
  defaults: registry.defaults,
  groups: Array.from(groupMap.values()),
  spaces,
  diagnostics: { ignoredConnections: [], unmappedConnections: [], canonicalCollisions: [] },
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
console.log(`Sanitized ${spaces.length} spaces from ${path.relative(ROOT, input)}`);
console.log(`Wrote ${path.relative(ROOT, output)}`);
console.log(`Hosts remapped: ${hostMap.size}`);
