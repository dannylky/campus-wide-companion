import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePcu, classifyVolume, deriveSpaceState, isOffHours, simulateRaw } from '../lib/state.js';

const room = {
  id: 'X101',
  name: 'X101',
  lifecycle: 'active',
  roomType: 'projector+VS+AMP+PCU+switch+controller',
  devices: {
    projectors: [{ label: 'X101-pjlink', module: 'generic-pjlink', enabled: true }],
    vs: { label: 'X101-VS', module: 'generic-tcp-udp', enabled: true },
    amp: { label: 'X101-AMP', module: 'generic-tcp-udp', enabled: true },
    pcu: { label: 'X101-PCU', module: 'generic-tcp-udp', enabled: true },
    controller: { label: 'X101-Controller-ping', module: 'generic-ping', enabled: true },
    switch: { label: 'X101-Switch-ping', module: 'generic-ping', enabled: true },
  },
  variables: { state: 'X101', pcu: 'X101PCU' },
};

test('parsePcu accepts four bits and flags Extron off', () => {
  const ok = parsePcu('1111');
  assert.equal(ok.valid, true);
  assert.equal(ok.issue, null);
  assert.equal(ok.bits.find((bit) => bit.key === 'amp').on, true);

  const bad = parsePcu('0111');
  assert.equal(bad.valid, true);
  assert.match(bad.issue, /Extron/);
});

test('parsePcu rejects a broken link', () => {
  const broken = parsePcu('$$$$');
  assert.equal(broken.valid, false);
  assert.equal(broken.tone, 'error');
});

test('classifyVolume handles defaults and thresholds', () => {
  assert.equal(classifyVolume(-10).state, 'default');
  assert.equal(classifyVolume(-17).state, 'too-low');
  assert.equal(classifyVolume(0).state, 'too-high');
  assert.equal(classifyVolume('').state, 'unknown');
});

test('deriveSpaceState reports healthy, fault, and suspended', () => {
  const healthy = deriveSpaceState(room, {
    projectors: { 'X101-pjlink': { powerState: 'on', status: 'ok', muteState: 'off', freezeState: 'off' } },
    connections: { vs: 'ok', amp: 'ok', pcu: 'ok', controller: 'ok', switch: 'ok' },
    pcu: '1111',
    volume: -10,
    source: 1,
  });
  assert.equal(healthy.state.health, 'ok');

  const fault = deriveSpaceState(room, {
    projectors: { 'X101-pjlink': { powerState: 'on', status: 'ok' } },
    connections: { vs: 'error', amp: 'ok', pcu: 'ok' },
    pcu: '1111',
  });
  assert.equal(fault.state.health, 'error');
  assert.ok(fault.state.alerts.some((alert) => /VS offline/.test(alert.message)));

  const suspended = deriveSpaceState({ ...room, lifecycle: 'suspended' }, {});
  assert.equal(suspended.state.health, 'suspended');
});

test('system-off is not a fault when projector, VS/AMP and PCU agree', () => {
  const off = deriveSpaceState(room, {
    projectors: { 'X101-pjlink': { powerState: 'off', status: 'ok' } },
    connections: { vs: 'error', amp: 'error', pcu: 'ok', controller: 'ok', switch: 'ok' },
    pcu: '1000',
  });
  assert.equal(off.state.health, 'off');
});

test('isOffHours wraps across midnight', () => {
  const hours = { connectionsOff: '00:00', connectionsOn: '07:35', timezone: 'UTC' };
  assert.equal(isOffHours(new Date('2026-11-04T02:00:00Z'), hours), true);
  assert.equal(isOffHours(new Date('2026-11-04T08:00:00Z'), hours), false);
});

test('simulateRaw is deterministic', () => {
  const a = simulateRaw(room);
  const b = simulateRaw(room);
  assert.deepEqual(a, b);
});
