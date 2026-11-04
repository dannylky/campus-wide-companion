import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildConfig, validateConfig, diffConfigs } from '../lib/build/engine.js';

const campus = JSON.parse(fs.readFileSync(new URL('../config/public/campus.json', import.meta.url)));
const archetypes = JSON.parse(fs.readFileSync(new URL('../config/public/archetypes.json', import.meta.url)));
const modules = JSON.parse(fs.readFileSync(new URL('../config/public/modules.json', import.meta.url))).modules;

const room = campus.spaces.find((space) => space.id === 'X101');
const archetype = archetypes.archetypes.find((entry) => entry.id === room.roomType);

test('builds a valid layered config for schema 12', () => {
  const built = buildConfig({ room, archetype, schema: 12, modules });
  assert.equal(built.config.version, 12);
  assert.equal(built.meta.styleMode, 'layered');
  assert.equal(built.meta.instances, 6);
  assert.equal(built.meta.buttons, 9);
  assert.equal(built.warnings.length, 0);

  const instance = Object.values(built.config.instances)[0];
  assert.ok(instance.moduleId);
  assert.equal(instance.instance_type, undefined);

  const control = built.config.pages['1'].controls['0']['1'];
  assert.equal(control.type, 'button-layered');
  assert.equal(control.style.layers.length, 3);
  assert.equal(control.steps['0'].action_sets.down.length, 1);

  const validation = validateConfig(built.config, { modules });
  assert.equal(validation.ok, true, validation.errors.join('; '));
});

test('builds a valid classic config for schema 9', () => {
  const built = buildConfig({ room, archetype, schema: 9, modules });
  assert.equal(built.config.version, 9);
  assert.equal(built.meta.styleMode, 'classic');

  const instance = Object.values(built.config.instances)[0];
  assert.ok(instance.instance_type);
  assert.equal(instance.moduleId, undefined);

  const control = built.config.pages['1'].controls['0']['1'];
  assert.equal(control.type, 'button');
  assert.equal(control.style.text, 'PJ On');

  const validation = validateConfig(built.config, { modules });
  assert.equal(validation.ok, true, validation.errors.join('; '));
});

test('skips buttons whose device role is missing', () => {
  const projectorOnly = campus.spaces.find((space) => space.id === 'X102');
  const simple = archetypes.archetypes.find((entry) => entry.id === projectorOnly.roomType);
  const built = buildConfig({ room: projectorOnly, archetype: simple, schema: 12, modules });
  assert.equal(built.meta.instances, 1);
  assert.equal(built.meta.buttons, 6);
  assert.equal(validateConfig(built.config, { modules }).ok, true);
});

test('diff reports removed and added connections', () => {
  const before = buildConfig({ room, archetype, schema: 12, modules }).config;
  const withoutSwitch = {
    ...room,
    devices: { ...room.devices, switch: null },
  };
  const after = buildConfig({ room: withoutSwitch, archetype, schema: 12, modules }).config;
  const diff = diffConfigs(before, after);
  assert.ok(diff.instances.removed.includes('X101-Switch-ping'));
  assert.equal(diff.instances.added.length, 0);
});

test('validation catches a broken action reference', () => {
  const built = buildConfig({ room, archetype, schema: 12, modules });
  built.config.pages['1'].controls['0']['1'].steps['0'].action_sets.down[0].connectionId = 'missing';
  const validation = validateConfig(built.config, { modules });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => /unknown connection/.test(error)));
});
