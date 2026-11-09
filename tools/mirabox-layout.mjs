#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildButton } from '../lib/build/templates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.COMPANION_URL || 'http://127.0.0.1:8000';
const TARGET_PAGE = Number(arg('page', '8'));
const SOURCE_PAGE = Number(arg('source-page', '1'));
const APPLY = process.argv.includes('--apply');
const OUT = path.resolve(ROOT, arg('out', 'out/mirabox-n4-pro.companionconfig'));

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function pageId() {
  return randomBytes(15).toString('base64url').slice(0, 20);
}

const BUTTONS = [
  { row: 0, col: 1, text: 'SYSTEM\nON/OFF', bgcolor: '#1f6feb' },
  { row: 0, col: 2, text: 'VIDEO\nPC', bgcolor: '#238636' },
  { row: 0, col: 3, text: 'VIDEO\nLAPTOP', bgcolor: '#238636' },
  { row: 1, col: 1, text: 'TV\nON/OFF', bgcolor: '#8957e5' },
  { row: 1, col: 2, text: 'LIGHT\nON/OFF', bgcolor: '#d29922' },
  { row: 1, col: 3, text: 'VOLUME\nUP/DOWN', bgcolor: '#0e7490' },
];

function buildLayout() {
  const controls = {};
  for (const spec of BUTTONS) {
    controls[spec.row] = controls[spec.row] || {};
    controls[spec.row][spec.col] = buildButton({
      styleMode: 'layered',
      text: spec.text,
      bgcolor: spec.bgcolor,
      textColor: '#ffffff',
      actions: [],
      feedbacks: [],
      fontsize: 70,
    });
  }

  return {
    version: 12,
    type: 'full',
    companionBuild: '5.1.1+10000-stable-1e2454ae78',
    pages: {
      [SOURCE_PAGE]: {
        id: pageId(),
        name: 'MiraBox N4 Pro',
        controls,
        gridSize: { minColumn: 0, maxColumn: 9, minRow: 0, maxRow: 6 },
      },
    },
    instances: {},
    custom_variables: {},
    triggers: {},
  };
}

function wsUrl() {
  return `${BASE.replace(/^http/, 'ws').replace(/\/+$/, '')}/trpc`;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 8000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener('error', (event) => {
      clearTimeout(timer);
      reject(new Error(event.message || 'WebSocket error'));
    });
  });
}

let nextId = 1;
function call(ws, method, procedure, input) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error(`tRPC timeout: ${procedure}`));
    }, 30000);
    const onMessage = (event) => {
      let data;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const message = Array.isArray(data) ? data.find((entry) => entry.id === id) : data;
      if (!message || message.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result?.data);
    };
    ws.addEventListener('message', onMessage);
    const params = { path: procedure };
    if (input !== undefined) params.input = input;
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function uploadAndImport(config) {
  const bytes = Buffer.from(JSON.stringify(config), 'utf8');
  const checksum = createHash('sha1').update(bytes).digest('hex');
  const ws = await connect(wsUrl());
  try {
    const sessionId = await call(ws, 'mutation', 'importExport.prepareImport.start', {
      name: 'mirabox-n4-pro.companionconfig',
      size: bytes.length,
    });
    if (!sessionId) throw new Error('No import session id returned');

    await call(ws, 'mutation', 'importExport.prepareImport.uploadChunk', {
      sessionId,
      offset: 0,
      data: bytes.toString('base64'),
    });

    const completed = await call(ws, 'mutation', 'importExport.prepareImport.complete', {
      sessionId,
      expectedChecksum: checksum,
      userData: null,
    });
    const [error, snapshot] = Array.isArray(completed) ? completed : [completed, null];
    if (error || !snapshot) throw new Error(error || 'Import preparation failed');

    const remap = await call(ws, 'mutation', 'importExport.importSinglePage', {
      sourcePage: SOURCE_PAGE,
      targetPage: TARGET_PAGE,
      connectionIdRemapping: {},
    });
    return { bytes: bytes.length, checksum, remap, snapshotPages: Object.keys(snapshot.pages || {}) };
  } finally {
    ws.close();
  }
}

const config = buildLayout();
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(`Layout:   3x2 centered on the 5x4 N4 Pro surface`);
console.log(`Buttons:  ${BUTTONS.length}`);
for (const spec of BUTTONS) console.log(`  ${spec.row}/${spec.col}  ${spec.text.replace('\n', ' ')}`);
console.log(`Target:   page ${TARGET_PAGE}`);
console.log(`Wrote:    ${path.relative(ROOT, OUT)}`);

if (!APPLY) {
  console.log('Dry run. Add --apply to import the page into Companion.');
  process.exit(0);
}

try {
  const result = await uploadAndImport(config);
  console.log(`Imported: ${result.bytes} bytes, sha1 ${result.checksum}`);
  console.log(`Remap:    ${JSON.stringify(result.remap ?? {})}`);
  console.log('Done. Refresh Companion page 8.');
} catch (error) {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
}
