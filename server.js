import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { loadHosts, getHost } from './lib/adapter/hosts.js';
import { loadRegistry, loadSnapshot, loadRoom } from './lib/adapter/live.js';
import { KnowledgeBase } from './lib/kb/index.js';
import { buildConfig, validateConfig, diffConfigs } from './lib/build/engine.js';
import { ask, aiStatus } from './lib/ai/client.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');

loadEnv(path.join(ROOT, '.env'));

const SESSION_TOKEN = process.env.DASHBOARD_TOKEN || '';
const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || '127.0.0.1';

function loadEnv(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // .env is optional
  }
}

const hosts = loadHosts();
let kb;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function authorized(req, url) {
  if (!SESSION_TOKEN) return true;
  const header = req.headers.authorization || '';
  if (header === `Bearer ${SESSION_TOKEN}`) return true;
  return url.searchParams.get('token') === SESSION_TOKEN;
}

async function readJson(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative || relative.includes('..')) return false;
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`) && file !== path.join(PUBLIC_DIR, 'index.html')) return false;
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return false;
    const data = await fsp.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': relative === 'index.html' ? 'no-store' : 'no-cache',
      'Content-Length': data.length,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function hostFor(url) {
  return getHost(hosts, url.searchParams.get('host') || '');
}

function scopeExportForRoom(config, room, desired) {
  const labels = new Set(Object.values(desired.instances || {}).map((instance) => instance.label));
  for (const projector of room.devices?.projectors || []) labels.add(projector.label);
  for (const role of ['vs', 'amp', 'pcu', 'controller', 'switch']) {
    const device = room.devices?.[role];
    if (device?.label) labels.add(device.label);
  }
  const variableNames = new Set(Object.keys(desired.custom_variables || {}));
  if (room.variables?.state) variableNames.add(room.variables.state);
  if (room.variables?.pcu) variableNames.add(room.variables.pcu);

  const instances = Object.fromEntries(
    Object.entries(config.instances || {}).filter(([, instance]) => labels.has(instance.label)),
  );
  const customVariables = Object.fromEntries(
    Object.entries(config.custom_variables || {}).filter(([name]) => variableNames.has(name)),
  );
  return { ...config, instances, custom_variables: customVariables, pages: {} };
}

async function handle(req, res) {
  securityHeaders(res);
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/') && !authorized(req, url)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'campus-wide-companion',
      readOnly: true,
      hosts: hosts.map((host) => ({ id: host.id, name: host.name, kind: host.kind })),
      kb: kb.stats(),
      ai: aiStatus(),
      time: new Date().toISOString(),
    });
  }

  if (pathname === '/api/hosts' && req.method === 'GET') {
    return json(res, 200, { hosts, defaultHost: hosts[0]?.id || null });
  }

  const summaryMatch = pathname.match(/^\/api\/hosts\/([^/]+)\/summary$/);
  if (summaryMatch && req.method === 'GET') {
    const host = getHost(hosts, decodeURIComponent(summaryMatch[1]));
    try {
      const snapshot = await loadSnapshot(host, { force: url.searchParams.get('refresh') === '1' });
      return json(res, 200, { host, snapshot });
    } catch (error) {
      return json(res, 502, { error: error.message, host });
    }
  }

  const roomsMatch = pathname.match(/^\/api\/hosts\/([^/]+)\/rooms$/);
  if (roomsMatch && req.method === 'GET') {
    const host = getHost(hosts, decodeURIComponent(roomsMatch[1]));
    try {
      const snapshot = await loadSnapshot(host);
      const rooms = snapshot.spaces.map((space) => ({
        id: space.id,
        name: space.name,
        group: space.group,
        page: space.page,
        lifecycle: space.lifecycle,
        roomType: space.roomType,
        health: space.state.health,
        healthLabel: space.state.healthLabel,
        tone: space.state.tone,
        projectors: space.state.projectors,
        alerts: space.state.alerts,
      }));
      return json(res, 200, { host, generatedAt: snapshot.generatedAt, counts: snapshot.counts, rooms });
    } catch (error) {
      return json(res, 502, { error: error.message, host });
    }
  }

  const roomMatch = pathname.match(/^\/api\/hosts\/([^/]+)\/rooms\/([^/]+)$/);
  if (roomMatch && req.method === 'GET') {
    const host = getHost(hosts, decodeURIComponent(roomMatch[1]));
    const roomId = decodeURIComponent(roomMatch[2]);
    try {
      const room = await loadRoom(host, roomId);
      if (!room) return json(res, 404, { error: `Room not found: ${roomId}` });
      return json(res, 200, { host, room });
    } catch (error) {
      return json(res, 502, { error: error.message, host, roomId });
    }
  }

  if (pathname === '/api/kb/search' && req.method === 'GET') {
    const query = url.searchParams.get('q') || '';
    return json(res, 200, { query, results: kb.search(query, Number(url.searchParams.get('limit') || 8)) });
  }

  if (pathname === '/api/kb/modules' && req.method === 'GET') {
    return json(res, 200, { modules: kb.moduleCatalog });
  }

  if (pathname === '/api/kb/archetypes' && req.method === 'GET') {
    return json(res, 200, { archetypes: kb.archetypeCatalog });
  }

  if (pathname === '/api/kb/stats' && req.method === 'GET') {
    return json(res, 200, kb.stats());
  }

  if (pathname === '/api/build/preview' && req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    const host = getHost(hosts, body.hostId || '');
    try {
      const registry = await loadRegistry(host);
      const room = (registry.spaces || []).find((space) => space.id === body.roomId) || registry.spaces?.[0];
      if (!room) return json(res, 404, { error: 'No rooms available' });
      const archetype = kb.getArchetype(room.roomType) || kb.getArchetype(body.archetypeId || 'projector');
      const schema = Number(body.schema || process.env.BUILD_SCHEMA || 12);
      const page = Number(body.page || 1);
      const built = buildConfig({ room, archetype, schema, page, pageName: body.pageName || room.name, modules: kb.moduleCatalog });
      const validation = validateConfig(built.config, { modules: kb.moduleCatalog });

      let diff = null;
      if (host.kind !== 'synthetic' && body.diff !== false) {
        const adapter = (await import('./lib/adapter/hosts.js')).createAdapter(host);
        const response = await adapter.getExport();
        if (response.ok && response.config) {
          const scoped = scopeExportForRoom(response.config, room, built.config);
          diff = diffConfigs(scoped, built.config);
        }
      }

      return json(res, 200, {
        host,
        room: { id: room.id, name: room.name, roomType: room.roomType },
        archetype: { id: archetype.id, label: archetype.label },
        meta: built.meta,
        warnings: built.warnings,
        validation,
        diff,
        config: built.config,
      });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }

  if (pathname === '/api/ai/status' && req.method === 'GET') {
    return json(res, 200, aiStatus());
  }

  if (pathname === '/api/ai/ask' && req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    try {
      const host = getHost(hosts, body.hostId || '');
      const snapshot = await loadSnapshot(host).catch(() => null);
      const result = await ask({ question: body.question, kb, snapshot });
      return json(res, 200, { host, ...result });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }

  if (pathname.startsWith('/api/')) {
    return json(res, 404, { error: `Unknown API route: ${pathname}` });
  }

  if (req.method === 'GET' && (await serveStatic(res, pathname))) return;
  return json(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    if (!res.headersSent) json(res, 500, { error: error.message });
    else res.end();
  });
});

kb = await KnowledgeBase.load();

server.listen(PORT, HOST, () => {
  console.log(`Campus Wide Companion on http://${HOST}:${PORT}`);
  console.log(`Read-only. Hosts: ${hosts.map((host) => `${host.id}(${host.kind})`).join(', ')}`);
  console.log(`Knowledge base: ${JSON.stringify(kb.stats())}`);
});
