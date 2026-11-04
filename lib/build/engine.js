import { createHash } from 'node:crypto';
import { buildButton, navControl, action } from './templates.js';

const ROLE_OFFSETS = { projector: 101, vs: 111, amp: 121, pcu: 31, controller: 51, switch: 11 };
const ROLE_ORDER = ['projector', 'vs', 'amp', 'pcu', 'controller', 'switch'];
const NETWORK_MODULES = new Set(['generic-pjlink', 'generic-tcp-udp', 'generic-ping', 'generic-pingandwake', 'aver-ptz', 'obs-studio']);

function hash(value) {
  return createHash('sha1').update(String(value)).digest('hex');
}

export function connectionId(label) {
  return `conn_${hash(label).slice(0, 20)}`;
}

export function styleModeFor(schema) {
  return Number(schema) >= 10 ? 'layered' : 'classic';
}

function moduleFor(modules, id) {
  return (modules || []).find((module) => module.id === id) || null;
}

function moduleVersion(modules, id) {
  return moduleFor(modules, id)?.version || '1.0.0';
}

function deriveHost(room, role) {
  const hosts = ['vs', 'amp', 'pcu', 'controller', 'switch']
    .map((key) => room.devices?.[key]?.host)
    .filter(Boolean);
  if (hosts.length) {
    const prefix = hosts[0].split('.').slice(0, 3).join('.');
    return `${prefix}.${ROLE_OFFSETS[role] || 100}`;
  }
  const octet = (parseInt(hash(`${room.id}:${role}`).slice(0, 4), 16) % 200) + 20;
  return `192.0.2.${octet}`;
}

function configFor(moduleId, device, room, role) {
  const host = device.host || deriveHost(room, role);
  const port = device.port || '';
  switch (moduleId) {
    case 'generic-pjlink':
      return { host, port: Number(port || 4352) };
    case 'generic-tcp-udp':
      return { port: String(port || 5000), prot: 'tcp', saveresponse: true, convertresponse: 'string', host };
    case 'generic-ping':
      return { host, interval: 5000 };
    case 'generic-pingandwake':
      return { host, mac: '' };
    case 'aver-ptz':
      return { port: String(port || 52381), isviscaoverip: true, host };
    case 'obs-studio':
      return { host, port: Number(port || 4455) };
    default:
      return { host, port };
  }
}

function instanceFor({ id, label, moduleId, version, config, enabled, sortOrder, schema }) {
  const instance = {
    moduleInstanceType: 'connection',
    moduleVersionId: version,
    updatePolicy: 'stable',
    sortOrder,
    label,
    isFirstInit: false,
    config,
    secrets: {},
    lastUpgradeIndex: -1,
    enabled: enabled !== false,
  };
  if (Number(schema) >= 10) instance.moduleId = moduleId;
  else instance.instance_type = moduleId;
  return instance;
}

function statusText(device, moduleId) {
  if (moduleId === 'generic-tcp-udp') return `$(${device.label}:tcp_response)`;
  if (moduleId === 'generic-ping') return `$(${device.label}:status)`;
  if (moduleId === 'generic-pjlink') return `$(${device.label}:powerState)`;
  return `$(${device.label}:status)`;
}

function actionOptions(spec, module) {
  if (spec.action !== 'send') return {};
  return {
    id_send: { value: String(spec.command || ''), isExpression: false },
    id_end: { value: String(spec.end || '\r\n'), isExpression: false },
  };
}

export function buildConfig(options) {
  const {
    room,
    archetype,
    schema = 12,
    page = 1,
    pageName,
    modules = [],
    generatedAt = new Date().toISOString(),
  } = options;

  if (!room) throw new Error('room is required');
  if (!archetype) throw new Error('archetype is required');

  const styleMode = styleModeFor(schema);
  const instances = {};
  const roleTargets = {};
  const warnings = [];
  let sortOrder = 1;

  for (const device of room.devices?.projectors || []) {
    const id = connectionId(device.label);
    instances[id] = instanceFor({
      id,
      label: device.label,
      moduleId: device.module,
      version: moduleVersion(modules, device.module),
      config: configFor(device.module, device, room, 'projector'),
      enabled: device.enabled,
      sortOrder: sortOrder++,
      schema,
    });
    if (!roleTargets.projector) roleTargets.projector = [];
    roleTargets.projector.push({ device, id });
  }

  for (const role of ['vs', 'amp', 'pcu', 'controller', 'switch']) {
    const device = room.devices?.[role];
    if (!device) continue;
    const id = connectionId(device.label);
    instances[id] = instanceFor({
      id,
      label: device.label,
      moduleId: device.module,
      version: moduleVersion(modules, device.module),
      config: configFor(device.module, device, room, role),
      enabled: device.enabled,
      sortOrder: sortOrder++,
      schema,
    });
    roleTargets[role] = { device, id };
  }

  const customVariables = {};
  if (room.variables?.state) {
    customVariables[room.variables.state] = {
      description: `Room state for ${room.name}`,
      defaultValue: '',
      persistCurrentValue: false,
      sortOrder: 0,
    };
  }
  if (room.variables?.pcu) {
    customVariables[room.variables.pcu] = {
      description: `PCU bits for ${room.name}`,
      defaultValue: '',
      persistCurrentValue: false,
      sortOrder: 1,
    };
  }

  const controls = {};
  const used = new Set();
  const place = (row, col, control) => {
    let r = Number.isFinite(Number(row)) ? Number(row) : 0;
    let c = Number.isFinite(Number(col)) ? Number(col) : 1;
    while (used.has(`${r}:${c}`)) {
      c += 1;
      if (c > 4) {
        c = 1;
        r += 1;
      }
      if (r > 2) return false;
    }
    used.add(`${r}:${c}`);
    controls[r] = controls[r] || {};
    controls[r][c] = control;
    return true;
  };

  for (const [row, type] of [[0, 'pageup'], [1, 'pagenum'], [2, 'pagedown']]) {
    place(row, 0, navControl(type));
  }

  let buttonCount = 0;
  for (const spec of archetype.buttons || []) {
    const target = spec.role === 'projector' ? roleTargets.projector?.[0] : roleTargets[spec.role];
    if (!target) {
      warnings.push(`Skipped "${spec.label}": room has no ${spec.role} device`);
      continue;
    }
    const device = target.device;
    const module = moduleFor(modules, device.module);
    const actions = [];

    if (spec.kind !== 'status') {
      const definitionId = spec.action === 'send' ? 'send' : spec.action;
      const moduleActions = module?.actions || [];
      if (moduleActions.length && !moduleActions.some((entry) => entry.id === definitionId)) {
        warnings.push(`"${spec.label}": ${device.module} has no action "${definitionId}"`);
      }
      actions.push(
        action({
          connectionId: target.id,
          definitionId,
          options: actionOptions(spec, module),
          seed: `${room.id}:${spec.label}`,
          index: actions.length,
        }),
      );
    }

    const text = spec.kind === 'status' ? statusText(device, device.module) : spec.label;
    const control = buildButton({
      styleMode,
      text,
      bgcolor: spec.bgcolor,
      textColor: spec.textColor || '#ffffff',
      actions,
      feedbacks: [],
      fontsize: spec.fontsize,
    });
    if (place(spec.row ?? 0, spec.col ?? 1, control)) buttonCount += 1;
    else warnings.push(`"${spec.label}": no free grid cell`);
  }

  const config = {
    version: Number(schema),
    type: 'full',
    companionBuild: 'campus-wide-companion-generated',
    pages: {
      [page]: {
        id: `page_${page}`,
        name: pageName || room.name,
        controls,
        gridSize: { columns: 5, rows: 3 },
      },
    },
    triggers: {},
    custom_variables: customVariables,
    instances,
  };

  return {
    config,
    warnings,
    meta: {
      generatedAt,
      room: room.id,
      page: Number(page),
      schema: Number(schema),
      styleMode,
      instances: Object.keys(instances).length,
      buttons: buttonCount,
      customVariables: Object.keys(customVariables).length,
    },
  };
}

function collectVariableRefs(config) {
  const refs = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.value === 'string') {
      for (const match of node.value.matchAll(/\$\(([^)]+)\)/g)) refs.push(match[1]);
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(config.pages);
  return refs;
}

export function validateConfig(config, options = {}) {
  const modules = options.modules || [];
  const errors = [];
  const warnings = [];

  if (![9, 12].includes(Number(config?.version))) {
    errors.push(`Unsupported config version: ${config?.version}. Expected 9 or 12.`);
  }
  if (!config?.pages || typeof config.pages !== 'object') errors.push('pages must be an object');
  if (!config?.instances || typeof config.instances !== 'object') errors.push('instances must be an object');

  const instances = Object.entries(config?.instances || {});
  const labels = new Map();
  const connectionIds = new Set();
  for (const [id, instance] of instances) {
    connectionIds.add(id);
    const label = instance.label;
    if (!label) errors.push(`Instance ${id} has no label`);
    else if (labels.has(label)) errors.push(`Duplicate instance label: ${label}`);
    else labels.set(label, id);
    const moduleId = instance.moduleId || instance.instance_type;
    if (!moduleId) errors.push(`Instance ${id} has no module id`);
    if (!instance.config || typeof instance.config !== 'object') errors.push(`Instance ${label || id} has no config object`);
    if (NETWORK_MODULES.has(moduleId) && !instance.config?.host) warnings.push(`Instance ${label || id} has no host`);
    if (moduleId && modules.length && !moduleFor(modules, moduleId)) warnings.push(`Instance ${label || id} uses unknown module ${moduleId}`);
  }

  let controls = 0;
  let buttons = 0;
  let actions = 0;
  for (const [pageId, page] of Object.entries(config?.pages || {})) {
    if (!page || typeof page !== 'object') {
      errors.push(`Page ${pageId} is not an object`);
      continue;
    }
    if (!page.controls || typeof page.controls !== 'object') {
      errors.push(`Page ${pageId} has no controls`);
      continue;
    }
    for (const [row, columns] of Object.entries(page.controls)) {
      for (const [col, control] of Object.entries(columns)) {
        controls += 1;
        if (!control?.type) {
          errors.push(`Page ${pageId} ${row}/${col} has no type`);
          continue;
        }
        if (control.type !== 'button' && control.type !== 'button-layered') continue;
        buttons += 1;
        if (!control.steps || !control.steps['0']) {
          errors.push(`Page ${pageId} ${row}/${col} has no step 0`);
          continue;
        }
        const down = control.steps['0'].action_sets?.down || [];
        for (const entry of down) {
          actions += 1;
          if (!entry.connectionId || !connectionIds.has(entry.connectionId)) {
            errors.push(`Page ${pageId} ${row}/${col} action references unknown connection ${entry.connectionId}`);
          }
          if (!entry.definitionId) errors.push(`Page ${pageId} ${row}/${col} action has no definitionId`);
          const instance = config.instances[entry.connectionId];
          const moduleId = instance?.moduleId || instance?.instance_type;
          const module = moduleId ? moduleFor(modules, moduleId) : null;
          if (module?.actions?.length && entry.definitionId && !module.actions.some((a) => a.id === entry.definitionId)) {
            warnings.push(`Page ${pageId} ${row}/${col}: ${moduleId} has no action ${entry.definitionId}`);
          }
        }
      }
    }
  }

  for (const ref of collectVariableRefs(config)) {
    const [target] = ref.split(':');
    if (ref.includes(':')) {
      if (!labels.has(target)) warnings.push(`Variable reference $(${ref}) targets unknown label ${target}`);
    } else if (!(config.custom_variables || {})[target]) {
      warnings.push(`Variable reference $(${ref}) targets unknown custom variable ${target}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      pages: Object.keys(config?.pages || {}).length,
      controls,
      buttons,
      actions,
      instances: instances.length,
      customVariables: Object.keys(config?.custom_variables || {}).length,
    },
  };
}

function instanceByLabel(config) {
  const map = new Map();
  for (const [id, instance] of Object.entries(config?.instances || {})) map.set(instance.label, { id, ...instance });
  return map;
}

export function diffConfigs(current, desired) {
  const currentInstances = instanceByLabel(current);
  const desiredInstances = instanceByLabel(desired);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [label, instance] of desiredInstances) {
    if (!currentInstances.has(label)) added.push(label);
    else {
      const before = currentInstances.get(label);
      const fields = [];
      if (String(before.config?.host || '') !== String(instance.config?.host || '')) fields.push('host');
      if (String(before.config?.port || '') !== String(instance.config?.port || '')) fields.push('port');
      if (Boolean(before.enabled) !== Boolean(instance.enabled)) fields.push('enabled');
      if ((before.moduleId || before.instance_type) !== (instance.moduleId || instance.instance_type)) fields.push('module');
      if (fields.length) changed.push({ label, fields });
    }
  }
  for (const label of currentInstances.keys()) if (!desiredInstances.has(label)) removed.push(label);

  const currentVars = new Set(Object.keys(current?.custom_variables || {}));
  const desiredVars = new Set(Object.keys(desired?.custom_variables || {}));
  const varsAdded = [...desiredVars].filter((name) => !currentVars.has(name));
  const varsRemoved = [...currentVars].filter((name) => !desiredVars.has(name));

  const pageChanges = [];
  for (const [pageId, page] of Object.entries(desired?.pages || {})) {
    const before = current?.pages?.[pageId];
    if (!before) {
      pageChanges.push({ page: pageId, name: page.name, status: 'added' });
      continue;
    }
    const beforeControls = countControls(before);
    const afterControls = countControls(page);
    if (before.name !== page.name || beforeControls !== afterControls) {
      pageChanges.push({ page: pageId, name: page.name, status: 'changed', before: beforeControls, after: afterControls });
    }
  }
  for (const pageId of Object.keys(current?.pages || {})) {
    if (!desired?.pages?.[pageId]) pageChanges.push({ page: pageId, status: 'removed' });
  }

  return {
    instances: { added, removed, changed },
    customVariables: { added: varsAdded, removed: varsRemoved },
    pages: pageChanges,
    summary: `${added.length} added, ${removed.length} removed, ${changed.length} changed connections; ${varsAdded.length} added, ${varsRemoved.length} removed variables.`,
  };
}

function countControls(page) {
  let count = 0;
  for (const columns of Object.values(page?.controls || {})) count += Object.keys(columns || {}).length;
  return count;
}

export { ROLE_ORDER };
