import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdapter } from './hosts.js';
import { deriveRoomsFromExport, summarizeConfig } from './companion.js';
import { deriveSnapshot, deriveSpaceState, simulateRaw, simulateRegistry } from '../state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_CAMPUS = path.join(ROOT, 'config', 'public', 'campus.json');
const PRIVATE_CAMPUS = path.join(ROOT, 'config', 'private', 'rooms.json');

const registryCache = new Map();
const snapshotCache = new Map();
const TTL_MS = 60_000;

function fresh(entry, ttl = TTL_MS) {
  return entry && Date.now() - entry.at < ttl;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readSyntheticRegistry() {
  if (await exists(PRIVATE_CAMPUS)) return { ...(await readJson(PRIVATE_CAMPUS)), synthetic: false, private: true };
  return readJson(PUBLIC_CAMPUS);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function loadRegistry(host, options = {}) {
  const key = host.id;
  if (!options.force && fresh(registryCache.get(key))) return registryCache.get(key).value;

  let value;
  if (host.kind === 'synthetic') {
    value = await readSyntheticRegistry();
  } else {
    const adapter = createAdapter(host, options);
    const response = await adapter.getExport();
    if (!response.ok || !response.config) {
      throw new Error(`Companion export failed for ${host.name}: ${response.error || response.status}`);
    }
    value = deriveRoomsFromExport(response.config);
    value.exportSummary = summarizeConfig(response.config);
  }
  registryCache.set(key, { at: Date.now(), value });
  return value;
}

function rawFromConnections(registry, connections) {
  const byLabel = new Map((connections || []).map((connection) => [connection.label, connection]));
  const raw = {};
  for (const space of registry.spaces || []) {
    const roomRaw = { connections: {}, projectors: {} };
    for (const role of ['vs', 'amp', 'pcu', 'controller', 'switch']) {
      const device = space.devices?.[role];
      if (!device) continue;
      const connection = byLabel.get(device.label);
      roomRaw.connections[role] = connection
        ? connection.enabled === false
          ? 'disabled'
          : connection.status?.level || connection.status?.category || 'unknown'
        : device.enabled === false
          ? 'disabled'
          : 'unknown';
    }
    raw[space.id] = roomRaw;
  }
  return raw;
}

export async function loadSnapshot(host, options = {}) {
  const key = host.id;
  if (!options.force && fresh(snapshotCache.get(key), 30_000)) return snapshotCache.get(key).value;

  const registry = await loadRegistry(host, options);
  let snapshot;
  if (host.kind === 'synthetic') {
    snapshot = simulateRegistry(registry);
  } else {
    const adapter = createAdapter(host, options);
    const connections = await adapter.getConnections();
    const raw = connections.ok ? rawFromConnections(registry, connections.connections) : {};
    snapshot = deriveSnapshot(registry, raw, { volume: registry.defaults?.volume, sources: registry.defaults?.sources });
    snapshot.host = { id: host.id, name: host.name, kind: host.kind, capabilities: adapter.getStats().capabilities };
  }
  snapshotCache.set(key, { at: Date.now(), value: snapshot });
  return snapshot;
}

async function readProjector(adapter, device) {
  const info = {};
  const fields = [
    ['powerState', 'powerState'],
    ['muteState', 'muteState'],
    ['freezeState', 'freezeState'],
    ['lamp1Hrs', 'lampHours'],
    ['projectorModel', 'model'],
  ];
  await Promise.all(
    fields.map(async ([variable, key]) => {
      const response = await adapter.getVariable(device.label, variable);
      if (response.ok && response.text.trim()) info[key] = response.text.trim();
    }),
  );
  return info;
}

export async function readLiveRoom(host, room) {
  const adapter = createAdapter(host, { timeoutMs: 5000 });
  const raw = { connections: {}, projectors: {} };

  const stateVar = room.variables?.state;
  if (stateVar) {
    const response = await adapter.getCustomVariable(stateVar);
    if (response.ok) raw.state = response.text.trim();
  }
  if (room.variables?.pcu) {
    const response = await adapter.getCustomVariable(room.variables.pcu);
    if (response.ok) raw.pcu = response.text.trim();
  }

  await Promise.all(
    ['vs', 'amp', 'pcu', 'controller', 'switch'].map(async (role) => {
      const device = room.devices?.[role];
      if (!device) return;
      if (device.enabled === false) {
        raw.connections[role] = 'disabled';
        return;
      }
      const response = await adapter.getConnectionStatus(device.label);
      raw.connections[role] = response.ok && response.text.trim() ? response.text.trim() : 'unknown';
    }),
  );

  await Promise.all(
    (room.devices?.projectors || []).map(async (device) => {
      if (device.enabled === false) {
        raw.projectors[device.label] = { powerState: '', status: 'disabled' };
        return;
      }
      const status = await adapter.getConnectionStatus(device.label);
      raw.projectors[device.label] = {
        ...(await readProjector(adapter, device)),
        status: status.ok && status.text.trim() ? status.text.trim() : 'unknown',
      };
    }),
  );

  return raw;
}

export async function loadRoom(host, roomId, options = {}) {
  const registry = await loadRegistry(host, options);
  const room = (registry.spaces || []).find((space) => space.id === roomId);
  if (!room) return null;
  let raw;
  if (host.kind === 'synthetic') raw = simulateRaw(room);
  else raw = await readLiveRoom(host, room);
  return deriveSpaceState(room, raw, {
    volume: registry.defaults?.volume,
    sources: registry.defaults?.sources,
    operatingHours: registry.operatingHours,
  });
}

export function clearCache() {
  registryCache.clear();
  snapshotCache.clear();
}

export { PUBLIC_CAMPUS, PRIVATE_CAMPUS };
