import { createHash } from 'node:crypto';

const ALLOWED_PREFIXES = ['/int/export/', '/api/variable/', '/api/custom-variable/', '/api/connections'];

const ROLE_PATTERNS = [
  { role: 'vs', pattern: /-(?:VS)$/i },
  { role: 'amp', pattern: /-(?:AMP)$/i },
  { role: 'pcu', pattern: /-(?:PCU)$/i },
  { role: 'controller', pattern: /-(?:Contr?oll?er|Controlller)-ping$/i },
  { role: 'switch', pattern: /-(?:Switch)-ping$/i },
  { role: 'projector', pattern: /-(?:pjlink|PJ)$/i },
];

const IGNORED_LABELS = [/^test[-_]/i, /-R-PJ$/i];

const ROLE_ORDER = ['projector', 'vs', 'amp', 'pcu', 'switch', 'controller'];
const ROLE_LABELS = { projector: 'projector', vs: 'VS', amp: 'AMP', pcu: 'PCU', controller: 'controller', switch: 'switch' };

export class CompanionAdapter {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 8000;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.logLimit = Number.isFinite(options.logLimit) ? options.logLimit : 200;
    this.log = [];
    this.stats = { total: 0, errors: 0, notFound: 0 };
    this.capabilities = {
      export: true,
      variables: true,
      customVariables: true,
      connections: null,
      restV2: null,
    };
  }

  assertReadPath(path) {
    if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('Companion path must be absolute');
    if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      throw new Error(`Companion path is not allowed: ${path}`);
    }
    if (path.includes('..') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) {
      throw new Error(`Companion path is not allowed: ${path}`);
    }
  }

  async get(path) {
    this.assertReadPath(path);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain' },
        signal: controller.signal,
        redirect: 'follow',
      });
      const text = await response.text();
      this.stats.total += 1;
      if (response.status === 404) this.stats.notFound += 1;
      else if (!response.ok) this.stats.errors += 1;
      this.pushLog({ at: new Date().toISOString(), path, status: response.status, durationMs: Date.now() - started, ok: response.ok });
      return { ok: response.ok, status: response.status, text, notFound: response.status === 404 };
    } catch (error) {
      this.stats.total += 1;
      this.stats.errors += 1;
      const message = error.name === 'AbortError' ? 'timeout' : error.message;
      this.pushLog({ at: new Date().toISOString(), path, status: 0, durationMs: Date.now() - started, ok: false, error: message });
      return { ok: false, status: 0, text: '', notFound: false, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  pushLog(entry) {
    this.log.push(entry);
    if (this.log.length > this.logLimit) this.log.splice(0, this.log.length - this.logLimit);
  }

  async getExport() {
    const response = await this.get('/int/export/full?format=json');
    if (!response.ok) return { ...response, config: null };
    try {
      return { ...response, config: JSON.parse(response.text) };
    } catch (error) {
      return { ...response, ok: false, config: null, error: `invalid JSON: ${error.message}` };
    }
  }

  async getConnections() {
    const response = await this.get('/api/connections');
    if (!response.ok) return { ...response, connections: null };
    try {
      return { ...response, connections: JSON.parse(response.text) };
    } catch (error) {
      return { ...response, ok: false, connections: null, error: `invalid JSON: ${error.message}` };
    }
  }

  getCustomVariable(name) {
    return this.get(`/api/custom-variable/${encodeURIComponent(name)}/value`);
  }

  getVariable(label, variable) {
    return this.get(`/api/variable/${encodeURIComponent(label)}/${encodeURIComponent(variable)}/value`);
  }

  getConnectionStatus(label) {
    return this.get(`/api/variable/internal/${encodeURIComponent(`connection_${label}_status`)}/value`);
  }

  async detectCapabilities(config = null) {
    if (config) {
      this.capabilities.export = true;
      this.capabilities.variables = true;
      this.capabilities.customVariables = true;
    }
    const connections = await this.getConnections();
    this.capabilities.connections = connections.ok;
    return this.capabilities;
  }

  getStats() {
    return { ...this.stats, readOnly: true, capabilities: { ...this.capabilities } };
  }

  getRecentLog(limit = 50) {
    return this.log.slice(-limit);
  }
}

export function schemaInfo(config) {
  const version = Number(config?.version) || 0;
  const build = String(config?.companionBuild || '');
  const layered = version >= 10 || /^5\./i.test(build);
  return {
    schema: version,
    build,
    styleMode: layered ? 'layered' : 'classic',
    instanceKey: layered ? 'moduleId' : 'instance_type',
    supportsPageVariables: layered,
  };
}

function roleForLabel(label) {
  for (const { role, pattern } of ROLE_PATTERNS) {
    if (pattern.test(label)) return { role, base: label.replace(pattern, '') };
  }
  return null;
}

function roomTypeFor(roles) {
  const present = ROLE_ORDER.filter((role) => roles.includes(role));
  return present.length ? present.map((role) => ROLE_LABELS[role]).join('+') : 'unknown';
}

function capabilitiesFor(roles) {
  return {
    projector: roles.includes('projector'),
    dualProjector: false,
    vs: roles.includes('vs'),
    amp: roles.includes('amp'),
    pcu: roles.includes('pcu'),
    controller: roles.includes('controller'),
    switch: roles.includes('switch'),
    volume: roles.includes('amp'),
    source: roles.includes('vs'),
  };
}

function connectionId(label) {
  return `conn_${createHash('sha1').update(label).digest('hex').slice(0, 20)}`;
}

export function deriveRoomsFromExport(config) {
  const instances = config?.instances || {};
  const byBase = new Map();

  for (const [id, instance] of Object.entries(instances)) {
    const label = String(instance.label || '').trim();
    if (!label) continue;
    if (IGNORED_LABELS.some((pattern) => pattern.test(label))) continue;
    const match = roleForLabel(label);
    if (!match) continue;
    const base = match.base.replace(/-+$/, '');
    if (!base) continue;
    if (!byBase.has(base)) byBase.set(base, { id: base, name: base, base, devices: {}, variables: {} });
    const room = byBase.get(base);
    const module = instance.moduleId || instance.instance_type || instance.module || 'unknown';
    const device = {
      label,
      module,
      enabled: instance.enabled !== false,
      host: instance.config?.host || instance.config?.ip || '',
      port: instance.config?.port === undefined ? '' : String(instance.config.port),
      id,
    };
    if (match.role === 'projector') {
      if (!room.devices.projectors) room.devices.projectors = [];
      room.devices.projectors.push({ ...device, position: 'main' });
    } else {
      room.devices[match.role] = device;
    }
  }

  const spaces = [];
  for (const room of byBase.values()) {
    const roles = [];
    if (room.devices.projectors?.length) roles.push('projector');
    for (const role of ['vs', 'amp', 'pcu', 'controller', 'switch']) {
      if (room.devices[role]) roles.push(role);
    }
    const block = (room.id.match(/^([A-Za-z]+)/) || [])[1]?.toUpperCase() || 'Other';
    const floor = (room.id.match(/^[A-Za-z]+(\d+)/) || [])[1] || 'Unknown';
    const hasPcu = Boolean(room.devices.pcu);
    spaces.push({
      id: room.id,
      name: room.name,
      base: room.base,
      group: `block-${block}`,
      page: 1,
      column: spaces.length + 1,
      lifecycle: 'active',
      roomType: roomTypeFor(roles),
      devices: {
        projectors: room.devices.projectors || [],
        vs: room.devices.vs || null,
        amp: room.devices.amp || null,
        pcu: room.devices.pcu || null,
        controller: room.devices.controller || null,
        switch: room.devices.switch || null,
      },
      variables: {
        state: room.id,
        pcu: hasPcu ? `${room.id}PCU` : null,
      },
      capabilities: capabilitiesFor(roles),
      notes: [],
      block,
      floor,
    });
  }

  // Dual-projector rooms expose shared VS/AMP/PCU connections on a base label
  // (for example "R101") while projectors live on "R101-L" / "R101-R".
  // Fold the shared devices into the projector rooms and drop the base entry.
  const removable = new Set();
  for (const space of spaces) {
    if (space.devices.projectors?.length) continue;
    const siblings = spaces.filter((candidate) => candidate.id.startsWith(`${space.id}-`) && candidate.devices.projectors?.length);
    if (!siblings.length) continue;
    for (const sibling of siblings) {
      for (const role of ['vs', 'amp', 'pcu', 'controller', 'switch']) {
        if (!sibling.devices[role] && space.devices[role]) sibling.devices[role] = space.devices[role];
      }
      if (space.variables.state) sibling.variables.state = space.variables.state;
      if (space.variables.pcu) sibling.variables.pcu = space.variables.pcu;
      sibling.capabilities = capabilitiesFor([
        'projector',
        ...['vs', 'amp', 'pcu', 'controller', 'switch'].filter((role) => sibling.devices[role]),
      ]);
    }
    removable.add(space.id);
  }
  const finalSpaces = spaces.filter((space) => !removable.has(space.id));

  finalSpaces.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const groupMap = new Map();
  for (const space of finalSpaces) {
    if (!groupMap.has(space.group)) {
      groupMap.set(space.group, {
        id: space.group,
        name: `Block ${space.block}`,
        page: groupMap.size + 1,
        block: space.block,
        floor: space.floor,
        roomCount: 0,
      });
    }
    groupMap.get(space.group).roomCount += 1;
    space.page = groupMap.get(space.group).page;
  }

  const info = schemaInfo(config);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    synthetic: false,
    source: {
      companion: 'live export',
      build: info.build,
      schema: info.schema,
      styleMode: info.styleMode,
      readOnly: true,
    },
    operatingHours: { connectionsOff: '00:00', connectionsOn: '07:35', timezone: 'Asia/Hong_Kong' },
    defaults: { volume: { default: -10, min: -17, max: 0 }, sources: ['PC', 'Laptop', 'VGA'] },
    groups: Array.from(groupMap.values()),
    spaces: finalSpaces,
    diagnostics: { ignoredConnections: [], unmappedConnections: [], canonicalCollisions: [] },
  };
}

export function summarizeConfig(config) {
  const info = schemaInfo(config);
  const instances = Object.values(config?.instances || {});
  const modules = {};
  for (const instance of instances) {
    const module = instance.moduleId || instance.instance_type || 'unknown';
    modules[module] = (modules[module] || 0) + 1;
  }
  return {
    ...info,
    pages: Object.keys(config?.pages || {}).length,
    instances: instances.length,
    customVariables: Object.keys(config?.custom_variables || {}).length,
    triggers: Object.keys(config?.triggers || {}).length,
    modules,
  };
}

export { connectionId, ROLE_ORDER };
