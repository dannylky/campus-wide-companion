#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildButton, boxLayer, value } from '../lib/build/templates.js';

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

const TOUCH_BAR = [
  { col: 0, text: 'FOCUS', bgcolor: '#0b3d91' },
  { col: 1, text: 'PRESENT', bgcolor: '#1f6feb' },
  { col: 2, text: 'MEDIA', bgcolor: '#6e40c9', thumb: true },
  { col: 3, text: 'LIGHTS', bgcolor: '#a371f7' },
  { col: 4, text: 'OFF', bgcolor: '#8b2f5f' },
];

function touchBarButton({ text, bgcolor, thumb }) {
  const button = buildButton({
    styleMode: 'layered',
    text,
    bgcolor,
    textColor: '#ffffff',
    actions: [],
    feedbacks: [],
    fontsize: 55,
  });

  const track = { ...boxLayer('#ffffff'), id: 'track', name: 'Track', opacity: value(45), height: value(6) };
  button.style.layers.splice(2, 0, track);

  if (thumb) {
    const thumbLayer = {
      ...boxLayer('#ffffff'),
      id: 'thumb',
      name: 'Thumb',
      x: value(35),
      y: value(84),
      width: value(30),
      height: value(10),
    };
    button.style.layers.splice(3, 0, thumbLayer);
  }

  return button;
}

const BUTTONS = [
  { row: 0, col: 0, text: 'SYSTEM\nON', bgcolor: '#238636' },
  { row: 0, col: 1, text: 'SYSTEM\nOFF', bgcolor: '#b62324' },
  { row: 0, col: 2, text: 'VIDEO\nPC', bgcolor: '#1f6feb' },
  { row: 0, col: 3, text: 'VIDEO\nLAPTOP', bgcolor: '#1f6feb' },
  { row: 0, col: 4, text: 'VOLUME\nUP', bgcolor: '#0e7490' },
  { row: 1, col: 0, text: 'TV\nON', bgcolor: '#8957e5' },
  { row: 1, col: 1, text: 'TV\nOFF', bgcolor: '#6e40c9' },
  { row: 1, col: 2, text: 'LIGHT\nON', bgcolor: '#d29922' },
  { row: 1, col: 3, text: 'LIGHT\nOFF', bgcolor: '#9e6a03' },
  { row: 1, col: 4, text: 'VOLUME\nDOWN', bgcolor: '#155e75' },
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

  for (const spec of TOUCH_BAR) {
    controls[2] = controls[2] || {};
    controls[2][spec.col] = touchBarButton(spec);
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

console.log(`Layout:   5x2 keys + 5-segment touch bar`);
console.log(`Buttons:  ${BUTTONS.length} keys + ${TOUCH_BAR.length} touch-bar segments`);
for (const spec of BUTTONS) console.log(`  ${spec.row}/${spec.col}  ${spec.text.replace('\n', ' ')}`);
for (const spec of TOUCH_BAR) console.log(`  2/${spec.col}  ${spec.text}${spec.thumb ? ' (thumb)' : ''}`);
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
