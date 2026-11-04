const HEALTH = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
  OFF: 'off',
  OFF_HOURS: 'off-hours',
  SUSPENDED: 'suspended',
  UNKNOWN: 'unknown',
});

const HEALTH_INFO = Object.freeze({
  ok: { label: 'Operational', tone: 'ok' },
  warning: { label: 'Attention', tone: 'warning' },
  error: { label: 'Fault', tone: 'error' },
  off: { label: 'System off', tone: 'off' },
  'off-hours': { label: 'Planned off-hours', tone: 'off-hours' },
  suspended: { label: 'Suspended - renovation', tone: 'suspended' },
  unknown: { label: 'Unknown', tone: 'unknown' },
});

const CONNECTION_INFO = Object.freeze({
  ok: { label: 'Connected', tone: 'ok' },
  warning: { label: 'Warning', tone: 'warning' },
  error: { label: 'Offline', tone: 'error' },
  disabled: { label: 'Disabled', tone: 'off' },
  unknown: { label: 'Unknown', tone: 'unknown' },
});

const PCU_BITS = Object.freeze([
  { key: 'extron', label: 'Extron', index: 0 },
  { key: 'spare', label: 'Spare', index: 1 },
  { key: 'amp', label: 'Amp', index: 2 },
  { key: 'vs', label: 'VS', index: 3 },
]);

const ROLES = Object.freeze(['vs', 'amp', 'pcu', 'controller', 'switch']);

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeStatus(raw) {
  const status = clean(raw).toLowerCase();
  if (!status) return 'unknown';
  if (['ok', 'good', 'connected', 'online', 'up', 'reachable'].includes(status)) return 'ok';
  if (['warning', 'warn', 'degraded'].includes(status)) return 'warning';
  if (['error', 'failed', 'fail', 'down', 'offline', 'unreachable'].includes(status)) return 'error';
  if (['disabled', 'inactive'].includes(status)) return 'disabled';
  return 'unknown';
}

function connectionState(raw) {
  const state = normalizeStatus(raw);
  const info = CONNECTION_INFO[state] || CONNECTION_INFO.unknown;
  return { status: clean(raw), state, label: info.label, tone: info.tone };
}

function classifyProjector(powerState, connectionRaw) {
  const connection = normalizeStatus(connectionRaw);
  const power = clean(powerState).toLowerCase();
  if (connection === 'error') {
    return { powerState: clean(powerState), status: clean(connectionRaw), state: 'error', label: 'Offline', tone: 'error' };
  }
  if (connection === 'disabled') {
    return { powerState: clean(powerState), status: clean(connectionRaw), state: 'disabled', label: 'Disabled', tone: 'off' };
  }
  if (power === 'on' || power === '1' || power === 'true') {
    return { powerState: clean(powerState), status: clean(connectionRaw), state: 'on', label: 'On', tone: 'ok' };
  }
  if (['warming', 'warm-up', 'warmup', '2'].includes(power)) {
    return { powerState: clean(powerState), status: clean(connectionRaw), state: 'warming', label: 'Warming up', tone: 'warning' };
  }
  if (['cooling', '3'].includes(power)) {
    return { powerState: clean(powerState), status: clean(connectionRaw), state: 'cooling', label: 'Cooling down', tone: 'warning' };
  }
  if (['off', '0', 'false', 'standby'].includes(power)) {
    return { powerState: clean(powerState), status: clean(connectionRaw), state: 'off', label: 'Off', tone: 'off' };
  }
  if (['error', 'fault'].includes(power)) {
    return { powerState: clean(powerState), status: clean(connectionRaw), state: 'error', label: 'Error', tone: 'error' };
  }
  if (!power) {
    return { powerState: '', status: clean(connectionRaw), state: 'unknown', label: 'Unknown', tone: 'unknown' };
  }
  return { powerState: clean(powerState), status: clean(connectionRaw), state: 'unknown', label: clean(powerState), tone: 'unknown' };
}

function parseFlag(raw, labels) {
  const text = clean(raw);
  const normalized = text.toLowerCase();
  let state = 'unavailable';
  if (normalized && !['n/a', 'na', 'unknown', 'none', '-', '--'].includes(normalized)) {
    if (
      normalized.includes('unfreeze') ||
      normalized.includes('off') ||
      normalized.includes('not ') ||
      normalized === '0' ||
      normalized === 'false'
    ) {
      state = 'inactive';
    } else if (
      normalized.includes('on') ||
      normalized.includes('freez') ||
      normalized === '1' ||
      normalized === 'true'
    ) {
      state = 'active';
    }
  }
  return {
    raw: text,
    state,
    active: state === 'active' ? true : state === 'inactive' ? false : null,
    label: state === 'active' ? labels.active : state === 'inactive' ? labels.inactive : 'Unavailable',
    short: state === 'active' ? labels.activeShort : state === 'inactive' ? labels.inactiveShort : '--',
    tone: state === 'active' ? 'warning' : state === 'inactive' ? 'ok' : 'unknown',
  };
}

function parseBlank(raw) {
  return parseFlag(raw, { active: 'Blank', inactive: 'Not blank', activeShort: 'Blank', inactiveShort: 'Clear' });
}

function parseFreeze(raw) {
  return parseFlag(raw, { active: 'Frozen', inactive: 'Not frozen', activeShort: 'Frozen', inactiveShort: 'Clear' });
}

function parsePcu(raw) {
  const text = clean(raw);
  const empty = {
    raw: text,
    valid: false,
    bits: PCU_BITS.map((bit) => ({ key: bit.key, label: bit.label, on: false, known: false })),
    issue: null,
    tone: 'unknown',
  };
  if (!text) return empty;
  if (text === '$$$$' || !/^[01]{4}$/.test(text)) {
    return {
      raw: text,
      valid: false,
      bits: PCU_BITS.map((bit) => ({ key: bit.key, label: bit.label, on: false, known: false })),
      issue: 'PCU dashboard link error',
      tone: 'error',
    };
  }
  const bits = PCU_BITS.map((bit) => ({ key: bit.key, label: bit.label, on: text[bit.index] === '1', known: true }));
  const extron = bits.find((bit) => bit.key === 'extron');
  const issue = extron && !extron.on ? 'AV processor (Extron) is off' : null;
  return { raw: text, valid: true, bits, issue, tone: issue ? 'error' : 'ok' };
}

function classifyVolume(raw, defaults) {
  const thresholds = defaults || { default: -10, min: -17, max: 0 };
  if (raw === null || raw === undefined || clean(raw) === '') {
    return { value: null, state: 'unknown', label: 'Unknown', short: 'Unknown', tone: 'unknown' };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { value: null, state: 'unknown', label: clean(raw), short: 'Unknown', tone: 'unknown' };
  }
  if (value >= Number(thresholds.max)) {
    return { value, state: 'too-high', label: `${value} dB`, short: 'Too high', tone: 'warning' };
  }
  if (value <= Number(thresholds.min)) {
    return { value, state: 'too-low', label: `${value} dB`, short: 'Too low', tone: 'warning' };
  }
  if (value === Number(thresholds.default)) {
    return { value, state: 'default', label: `${value} dB`, short: 'Default', tone: 'ok' };
  }
  return { value, state: 'normal', label: `${value} dB`, short: 'Normal', tone: 'ok' };
}

function formatSource(vs, sources) {
  if (vs === null || vs === undefined || clean(vs) === '') {
    return { value: null, label: 'No source', short: '--' };
  }
  const numeric = Number(vs);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { value: vs, label: 'No source', short: '--' };
  }
  const index = numeric - 1;
  const names = Array.isArray(sources) ? sources : [];
  const name = names[index] || `Input ${vs}`;
  return { value: vs, label: name, short: name };
}

function timeToMinutes(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function isOffHours(now, operatingHours) {
  if (!operatingHours) return false;
  const off = timeToMinutes(operatingHours.connectionsOff);
  const on = timeToMinutes(operatingHours.connectionsOn);
  if (off === null || on === null || off === on) return false;
  const current = minutesInTimeZone(now, operatingHours.timezone);
  if (off < on) return current >= off && current < on;
  return current >= off || current < on;
}

function connectionFor(device, rawStatus) {
  if (!device) return null;
  if (device.enabled === false) {
    return { status: 'disabled', state: 'disabled', label: 'Disabled', tone: 'off' };
  }
  return connectionState(rawStatus);
}

function projectorFor(device, raw) {
  const info = raw || {};
  const status = classifyProjector(info.powerState, info.status);
  return {
    label: device.label,
    position: device.position || 'main',
    enabled: device.enabled !== false,
    module: device.module,
    powerState: status.powerState,
    connection: status.status,
    state: device.enabled === false ? 'disabled' : status.state,
    stateLabel: device.enabled === false ? 'Disabled' : status.label,
    tone: device.enabled === false ? 'off' : status.tone,
    model: info.model || null,
    lampHours: info.lampHours || null,
    blank: parseBlank(info.muteState),
    freeze: parseFreeze(info.freezeState),
  };
}

function isSystemOff(projectors, connections, pcu) {
  if (!projectors.length) return false;
  if (!projectors.every((projector) => projector.state === 'off')) return false;
  if (connections?.vs?.state !== 'error' || connections?.amp?.state !== 'error') return false;
  if (!pcu?.valid) return false;
  const amp = pcu.bits.find((bit) => bit.key === 'amp');
  const vs = pcu.bits.find((bit) => bit.key === 'vs');
  return Boolean(amp && vs && amp.known && vs.known && !amp.on && !vs.on);
}

function addAlert(alerts, severity, device, message) {
  alerts.push({ severity, device, message });
}

export function deriveSpaceState(space, raw = {}, options = {}) {
  const projectors = (space.devices?.projectors || []).map((device) =>
    projectorFor(device, raw.projectors?.[device.label]),
  );

  const connections = {};
  for (const role of ROLES) {
    const device = space.devices?.[role];
    if (device) connections[role] = connectionFor(device, raw.connections?.[role]);
  }

  const pcu = parsePcu(raw.pcu);
  const volume = classifyVolume(raw.volume, options.volume);
  const source = formatSource(raw.source, options.sources);

  const alerts = [];
  for (const projector of projectors) {
    if (projector.state === 'error') addAlert(alerts, 'error', projector.label, 'Projector offline');
    else if (projector.state === 'warming' || projector.state === 'cooling') {
      addAlert(alerts, 'warning', projector.label, `Projector ${projector.stateLabel.toLowerCase()}`);
    }
    if (projector.blank.active) addAlert(alerts, 'info', projector.label, 'Projector is blanked');
    if (projector.freeze.active) addAlert(alerts, 'info', projector.label, 'Projector is frozen');
  }
  for (const [role, connection] of Object.entries(connections)) {
    if (connection.state === 'error') addAlert(alerts, 'error', space.devices?.[role]?.label || role, `${role.toUpperCase()} offline`);
    else if (connection.state === 'warning') addAlert(alerts, 'warning', space.devices?.[role]?.label || role, `${role.toUpperCase()} warning`);
  }
  if (pcu.issue) addAlert(alerts, 'error', space.devices?.pcu?.label || 'PCU', pcu.issue);

  let health = HEALTH.OK;
  if (space.lifecycle === 'suspended') health = HEALTH.SUSPENDED;
  else if (isOffHours(options.now || new Date(), options.operatingHours)) health = HEALTH.OFF_HOURS;
  else if (isSystemOff(projectors, connections, pcu)) health = HEALTH.OFF;
  else if (alerts.some((alert) => alert.severity === 'error')) health = HEALTH.ERROR;
  else if (alerts.some((alert) => alert.severity === 'warning')) health = HEALTH.WARNING;
  else {
    const knownSignal =
      projectors.some((projector) => ['on', 'off', 'warming', 'cooling', 'error', 'disabled'].includes(projector.state)) ||
      Object.values(connections).some((connection) => ['ok', 'warning', 'error', 'disabled'].includes(connection.state)) ||
      pcu.valid;
    if (!knownSignal) health = HEALTH.UNKNOWN;
  }

  const info = HEALTH_INFO[health] || HEALTH_INFO.unknown;
  return {
    ...space,
    state: {
      health,
      healthLabel: info.label,
      tone: info.tone,
      projectors,
      connections,
      pcu,
      volume,
      source,
      alerts,
      observedAt: options.now ? new Date(options.now).toISOString() : new Date().toISOString(),
    },
  };
}

export function deriveSnapshot(registry, rawByRoom = {}, options = {}) {
  const spaces = (registry.spaces || []).map((space) =>
    deriveSpaceState(space, rawByRoom[space.id] || {}, { ...options, volume: registry.defaults?.volume, sources: registry.defaults?.sources }),
  );
  const counts = { total: spaces.length, ok: 0, warning: 0, error: 0, off: 0, 'off-hours': 0, suspended: 0, unknown: 0 };
  for (const space of spaces) counts[space.state.health] = (counts[space.state.health] || 0) + 1;
  return { ...registry, generatedAt: new Date().toISOString(), spaces, counts };
}

function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function simulateRaw(space) {
  if (space.lifecycle === 'suspended') return {};
  const bucket = hash(space.id) % 100;
  const devices = space.devices || {};
  const raw = { connections: {}, projectors: {} };

  const statusFor = (role, healthy) => {
    if (!devices[role]) return undefined;
    if (devices[role].enabled === false) return 'disabled';
    if (healthy) return 'ok';
    return role === 'pcu' ? 'error' : 'ok';
  };

  const fault = bucket >= 88 && bucket < 96;
  const warning = bucket >= 72 && bucket < 88;
  const off = bucket >= 96;

  for (const role of ROLES) {
    if (!devices[role]) continue;
    if (fault && (role === 'vs' || role === 'amp' || role === 'pcu')) raw.connections[role] = 'error';
    else raw.connections[role] = statusFor(role, true);
  }

  for (const device of devices.projectors || []) {
    raw.projectors[device.label] = {
      powerState: off ? 'off' : 'on',
      status: fault ? 'error' : 'ok',
      model: 'PJ-SYNTH',
      lampHours: 100 + (hash(space.id) % 900),
      muteState: warning ? 'blank on' : 'off',
      freezeState: 'off',
    };
  }

  raw.pcu = fault ? '1011' : '1111';
  raw.volume = warning ? -16 : -10;
  raw.source = warning ? 0 : 1;
  return raw;
}

export function simulateRegistry(registry) {
  const raw = {};
  for (const space of registry.spaces || []) raw[space.id] = simulateRaw(space);
  return deriveSnapshot(registry, raw);
}

export { HEALTH, HEALTH_INFO, PCU_BITS, ROLES, isOffHours, parsePcu, classifyVolume, connectionState, projectorFor, normalizeStatus };
