import test from 'node:test';
import assert from 'node:assert/strict';

import { CompanionAdapter, deriveRoomsFromExport, schemaInfo, summarizeConfig } from '../lib/adapter/companion.js';

function mockFetch(payload, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) });
}

test('schemaInfo detects 4.2.5 classic and 5.x layered', () => {
  assert.equal(schemaInfo({ version: 9, companionBuild: '4.2.5+8815' }).styleMode, 'classic');
  assert.equal(schemaInfo({ version: 9, companionBuild: '4.2.5+8815' }).instanceKey, 'instance_type');
  assert.equal(schemaInfo({ version: 12, companionBuild: '5.1.1+10000' }).styleMode, 'layered');
  assert.equal(schemaInfo({ version: 12, companionBuild: '5.1.1+10000' }).instanceKey, 'moduleId');
});

test('adapter only allows read paths', async () => {
  const adapter = new CompanionAdapter({ baseUrl: 'http://example', fetchImpl: mockFetch({ ok: true }) });
  await adapter.get('/int/export/full?format=json');
  await adapter.get('/api/custom-variable/X101/value');
  await assert.rejects(() => adapter.get('/api/location/1/0/1/press'), /not allowed/);
  await assert.rejects(() => adapter.get('/api/variable/../secret/value'), /not allowed/);
});

test('adapter exposes capabilities and never writes', async () => {
  const adapter = new CompanionAdapter({ baseUrl: 'http://example', fetchImpl: mockFetch([{ label: 'X101-VS' }]) });
  const result = await adapter.getConnections();
  assert.equal(result.ok, true);
  assert.equal(adapter.getStats().readOnly, true);
});

test('deriveRoomsFromExport groups connections by role for schema 12', () => {
  const config = {
    version: 12,
    companionBuild: '5.1.1+10000',
    instances: {
      a: { moduleId: 'generic-pjlink', label: 'X101-pjlink', config: { host: '192.0.2.101' }, enabled: true },
      b: { moduleId: 'generic-tcp-udp', label: 'X101-VS', config: { host: '192.0.2.111', port: '5000' }, enabled: true },
      c: { moduleId: 'generic-tcp-udp', label: 'X101-AMP', config: { host: '192.0.2.121', port: '5000' }, enabled: true },
      d: { moduleId: 'generic-tcp-udp', label: 'X101-PCU', config: { host: '192.0.2.31', port: '23' }, enabled: true },
      e: { moduleId: 'generic-ping', label: 'X101-Controller-ping', config: { host: '192.0.2.51' }, enabled: true },
      f: { moduleId: 'generic-ping', label: 'X101-Switch-ping', config: { host: '192.0.2.11' }, enabled: true },
    },
  };
  const registry = deriveRoomsFromExport(config);
  assert.equal(registry.spaces.length, 1);
  assert.equal(registry.spaces[0].roomType, 'projector+VS+AMP+PCU+switch+controller');
  assert.equal(registry.spaces[0].devices.vs.label, 'X101-VS');
  assert.equal(registry.spaces[0].variables.pcu, 'X101PCU');
});

test('deriveRoomsFromExport reads schema 9 instance_type', () => {
  const config = {
    version: 9,
    companionBuild: '4.2.5+8815',
    instances: {
      a: { instance_type: 'generic-pjlink', label: 'X101-pjlink', config: {}, enabled: true },
      b: { instance_type: 'generic-tcp-udp', label: 'X101-VS', config: { host: '192.0.2.10' }, enabled: true },
    },
  };
  const registry = deriveRoomsFromExport(config);
  assert.equal(registry.spaces[0].devices.vs.module, 'generic-tcp-udp');
  assert.equal(registry.spaces[0].devices.vs.host, '192.0.2.10');
});

test('summarizeConfig counts pages and modules', () => {
  const summary = summarizeConfig({
    version: 12,
    companionBuild: '5.1.1',
    pages: { 1: {}, 2: {} },
    instances: { a: { moduleId: 'generic-pjlink' }, b: { moduleId: 'generic-pjlink' } },
    custom_variables: { X101: {} },
  });
  assert.equal(summary.pages, 2);
  assert.equal(summary.instances, 2);
  assert.equal(summary.modules['generic-pjlink'], 2);
});
