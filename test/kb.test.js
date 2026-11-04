import test from 'node:test';
import assert from 'node:assert/strict';

import { KnowledgeBase } from '../lib/kb/index.js';

const kb = await KnowledgeBase.load();

test('knowledge base loads rooms, modules, and archetypes', () => {
  const stats = kb.stats();
  assert.ok(stats.documents > 0);
  assert.equal(stats.modules, 16);
  assert.ok(stats.archetypes >= 8);
  assert.equal(stats.rooms, 8);
});

test('search finds a module by name and protocol', () => {
  const results = kb.search('pjlink projector');
  assert.ok(results.length > 0);
  assert.ok(results.some((result) => result.id === 'module:generic-pjlink'));
});

test('search finds a room by id', () => {
  const results = kb.search('X101');
  assert.ok(results.some((result) => result.id === 'room:X101'));
});

test('search finds an archetype by role string', () => {
  const results = kb.search('projector+VS+AMP+PCU+switch+controller');
  assert.ok(results.some((result) => result.type === 'archetype'));
});

test('lookup helpers return catalog entries', () => {
  assert.equal(kb.getModule('generic-tcp-udp').name, 'Generic TCP/UDP');
  assert.ok(kb.getArchetype('projector'));
  assert.equal(kb.getRoom('Y202').name, 'Y202');
});

test('context is numbered for citations', () => {
  const context = kb.context('generic-pjlink');
  assert.match(context, /^\[1\]/);
});
