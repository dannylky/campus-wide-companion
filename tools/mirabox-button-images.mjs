#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importPage } from '../lib/companion-import.js';
import { rasterizeHtml, pngDataUrl, findBrowser } from '../lib/rasterize.js';
import { value, textLayer as makeTextLayer } from '../lib/build/templates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.COMPANION_URL || 'http://127.0.0.1:8000';
const PAGE = Number(arg('page', '8'));
const APPLY = process.argv.includes('--apply');
const OUT = path.resolve(ROOT, arg('out', 'config/public/layouts/mirabox-n4-pro-modern.json'));
const PREVIEW = path.resolve(ROOT, arg('preview', 'out/mirabox-button-preview.png'));
const MDI_VERSION = '7.4.47';
const KEY_SIZE = 224;
const TOUCH_WIDTH = 352;
const TOUCH_HEIGHT = 248;

const THEMES = {
  'SYSTEM ON': { icon: 'power', c1: '#34d399', c2: '#047857' },
  'SYSTEM OFF': { icon: 'power-off', c1: '#fb7185', c2: '#9f1239' },
  'TV ON': { icon: 'television', c1: '#a78bfa', c2: '#6d28d9' },
  'TV OFF': { icon: 'television-off', c1: '#c084fc', c2: '#7e22ce' },
  'VIDEO PC': { icon: 'monitor', c1: '#60a5fa', c2: '#1d4ed8' },
  'VIDEO LAPTOP': { icon: 'laptop', c1: '#818cf8', c2: '#4338ca' },
  'LIGHT ON': { icon: 'lightbulb-on', c1: '#fbbf24', c2: '#b45309' },
  'LIGHT OFF': { icon: 'lightbulb-off', c1: '#fb923c', c2: '#9a3412' },
  'VOLUME UP': { icon: 'volume-high', c1: '#22d3ee', c2: '#0e7490' },
  'VOLUME DOWN': { icon: 'volume-low', c1: '#2dd4bf', c2: '#0f766e' },
  FOCUS: { icon: 'target', c1: '#38bdf8', c2: '#0369a1' },
  PRESENT: { icon: 'presentation', c1: '#e879f9', c2: '#a21caf' },
  MEDIA: { icon: 'play-circle', c1: '#f472b6', c2: '#be185d' },
  LIGHTS: { icon: 'lightbulb-group', c1: '#a3e635', c2: '#4d7c0f' },
  OFF: { icon: 'power-standby', c1: '#94a3b8', c2: '#1e293b' },
};

const TOUCH_LABELS = ['FOCUS', 'PRESENT', 'MEDIA', 'LIGHTS', 'OFF'];

const LABEL_BY_POSITION = {
  '0/0': 'SYSTEM ON',
  '0/1': 'TV ON',
  '0/2': 'VIDEO PC',
  '0/3': 'LIGHT ON',
  '0/4': 'VOLUME UP',
  '1/0': 'SYSTEM OFF',
  '1/1': 'TV OFF',
  '1/2': 'VIDEO LAPTOP',
  '1/3': 'LIGHT OFF',
  '1/4': 'VOLUME DOWN',
  '2/0': 'FOCUS',
  '2/1': 'PRESENT',
  '2/2': 'MEDIA',
  '2/3': 'LIGHTS',
  '2/4': 'OFF',
};

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const iconCache = new Map();

async function iconInner(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const url = `https://cdn.jsdelivr.net/npm/@mdi/svg@${MDI_VERSION}/svg/${name}.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Icon ${name}: HTTP ${response.status}`);
  const text = await response.text();
  const inner = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1];
  if (!inner) throw new Error(`Icon ${name}: no SVG body`);
  iconCache.set(name, inner);
  return inner;
}

function keyHtml({ icon, c1, c2 }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${KEY_SIZE}px; height: ${KEY_SIZE}px; background: transparent; overflow: hidden; }
    .button {
      position: relative; width: ${KEY_SIZE}px; height: ${KEY_SIZE}px; border-radius: 32px; overflow: hidden;
      background:
        radial-gradient(120% 120% at 18% 0%, ${c1} 0%, ${c2} 72%),
        linear-gradient(145deg, ${c2}, #05070d);
      font-family: "Segoe UI Variable Display", "Segoe UI", Arial, sans-serif;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.35);
    }
    .button::before {
      content: ""; position: absolute; inset: 0;
      background:
        radial-gradient(55% 55% at 82% 16%, rgba(255,255,255,0.28), transparent 62%),
        linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 48%);
    }
    .glass {
      position: absolute; inset: 10px; border-radius: 24px;
      background: rgba(6, 10, 18, 0.30);
      border: 1px solid rgba(255,255,255,0.20);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.20);
    }
    .noise { position: absolute; inset: 0; opacity: 0.07; mix-blend-mode: overlay; }
    .glow {
      position: absolute; left: 50%; top: 35%; width: 172px; height: 172px;
      transform: translate(-50%, -50%); border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.40), transparent 66%);
      filter: blur(8px);
    }
    .icon {
      position: absolute; left: 50%; top: 36%; width: 96px; height: 96px;
      transform: translate(-50%, -50%); fill: #ffffff;
      filter: drop-shadow(0 10px 18px rgba(0,0,0,0.42));
    }
    .pill {
      position: absolute; top: 20px; left: 50%; width: 36px; height: 4px;
      transform: translateX(-50%); border-radius: 2px; background: rgba(255,255,255,0.55);
    }
  </style></head><body>
    <div class="button">
      <div class="glass"></div>
      <svg class="noise" xmlns="http://www.w3.org/2000/svg">
        <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/></filter>
        <rect width="100%" height="100%" filter="url(#n)"/>
      </svg>
      <div class="glow"></div>
      <svg class="icon" viewBox="0 0 24 24">${icon}</svg>
      <div class="pill"></div>
    </div>
  </body></html>`;
}

function touchHtml({ icon, col, thumb }) {
  const radius = col === 0 ? '28px 0 0 28px' : col === 4 ? '0 28px 28px 0' : '0';
  const divider = col === 4 ? 'none' : '1px solid rgba(255,255,255,0.10)';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${TOUCH_WIDTH}px; height: ${TOUCH_HEIGHT}px; background: transparent; overflow: hidden; }
    .button {
      position: relative; width: ${TOUCH_WIDTH}px; height: ${TOUCH_HEIGHT}px;
      border-radius: ${radius}; overflow: hidden;
      font-family: "Segoe UI Variable Display", "Segoe UI", Arial, sans-serif;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.22);
    }
    .bg {
      position: absolute; top: 0; left: 0; width: 1760px; height: ${TOUCH_HEIGHT}px;
      background: linear-gradient(90deg, #0b3d91 0%, #1f6feb 25%, #6e40c9 50%, #a371f7 75%, #8b2f5f 100%);
      background-position: -${col * TOUCH_WIDTH}px 0;
      background-size: 1760px ${TOUCH_HEIGHT}px;
    }
    .glass {
      position: absolute; inset: 0;
      background: rgba(6, 10, 18, 0.24);
      border-top: 1px solid rgba(255,255,255,0.18);
      border-bottom: 1px solid rgba(255,255,255,0.12);
      border-right: ${divider};
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.20);
    }
    .noise { position: absolute; inset: 0; opacity: 0.07; mix-blend-mode: overlay; }
    .track {
      position: absolute; top: 22px; left: 0; right: 0; height: 6px;
      background: rgba(255,255,255,0.55);
    }
    .thumb {
      position: absolute; bottom: 24px; left: 50%; width: 72px; height: 12px;
      transform: translateX(-50%); border-radius: 6px; background: #ffffff;
      box-shadow: 0 0 16px rgba(255,255,255,0.65);
    }
    .icon {
      position: absolute; left: 24px; top: 50%; width: 64px; height: 64px;
      transform: translateY(-50%); fill: #ffffff;
      filter: drop-shadow(0 8px 14px rgba(0,0,0,0.40));
    }
  </style></head><body>
    <div class="button">
      <div class="bg"></div>
      <div class="glass"></div>
      <svg class="noise" xmlns="http://www.w3.org/2000/svg">
        <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/></filter>
        <rect width="100%" height="100%" filter="url(#n)"/>
      </svg>
      <div class="track"></div>
      ${thumb ? '<div class="thumb"></div>' : ''}
      <svg class="icon" viewBox="0 0 24 24">${icon}</svg>
    </div>
  </body></html>`;
}

function fullImageLayer(dataUrl) {
  return {
    id: 'bg0',
    name: 'Background',
    usage: 'auto',
    type: 'image',
    enabled: value(true),
    opacity: value(100),
    x: value(0),
    y: value(0),
    width: value(100),
    height: value(100),
    rotation: value(0),
    base64Image: value(dataUrl),
    halign: value('center'),
    valign: value('center'),
    fillMode: value('fill'),
  };
}

function canvasLayer(existing) {
  return {
    ...(existing || {
      id: 'canvas',
      name: 'Canvas',
      usage: 'auto',
      type: 'canvas',
      showStatusIcons: value('default'),
    }),
    decoration: value('none'),
  };
}

function companionText(label, isTouch) {
  const display = isTouch ? label : label.replace(' ', '\n');
  const layer = makeTextLayer(display, '#ffffff', isTouch ? 65 : 55);
  if (isTouch) {
    layer.x.value = 28;
    layer.y.value = 0;
    layer.width.value = 70;
    layer.height.value = 100;
    layer.halign.value = 'left';
    layer.valign.value = 'center';
  } else {
    layer.x.value = 0;
    layer.y.value = 62;
    layer.width.value = 100;
    layer.height.value = 38;
    layer.halign.value = 'center';
    layer.valign.value = 'center';
  }
  return layer;
}

const response = await fetch(`${BASE}/int/export/full?format=json`, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Companion export failed: HTTP ${response.status}`);
const companion = await response.json();
const page = companion.pages[String(PAGE)];
if (!page) throw new Error(`Page ${PAGE} not found`);

console.log(`Renderer: ${findBrowser() ? 'headless browser -> PNG' : 'NOT FOUND'}`);
console.log(`Page:     ${PAGE} (${page.name})`);

const controls = JSON.parse(JSON.stringify(page.controls || {}));
const previews = [];

for (const [row, columns] of Object.entries(controls)) {
  for (const [column, control] of Object.entries(columns)) {
    const layers = control.style?.layers;
    if (!Array.isArray(layers)) continue;
    const existingText = layers.find((layer) => layer.type === 'text');
    const label = existingText
      ? String(existingText.text?.value || '').replace(/\s+/g, ' ').trim().toUpperCase()
      : LABEL_BY_POSITION[`${row}/${column}`];
    if (!label) {
      console.log(`  skip ${row}/${column}: no label`);
      continue;
    }
    const theme = THEMES[label];
    if (!theme) {
      console.log(`  skip ${row}/${column}: no theme for "${label}"`);
      continue;
    }

    const icon = await iconInner(theme.icon);
    const isTouch = Number(row) === 2;
    let dataUrl;
    let previewSize;

    if (isTouch) {
      const col = Number(column);
      const thumb = label === 'MEDIA';
      const png = await rasterizeHtml({
        html: touchHtml({ icon, col, thumb }),
        width: TOUCH_WIDTH,
        height: TOUCH_HEIGHT,
        name: `touch-${col}`,
        root: ROOT,
      });
      dataUrl = pngDataUrl(png);
      previewSize = { width: 176, height: 124 };
    } else {
      const png = await rasterizeHtml({
        html: keyHtml({ icon, c1: theme.c1, c2: theme.c2 }),
        width: KEY_SIZE,
        height: KEY_SIZE,
        name: `key-${label}`,
        root: ROOT,
      });
      dataUrl = pngDataUrl(png);
      previewSize = { width: 112, height: 112 };
    }

    control.style.layers = [
      canvasLayer(layers.find((layer) => layer.type === 'canvas')),
      fullImageLayer(dataUrl),
      companionText(label, isTouch),
    ];
    previews.push({ row, column, label, dataUrl, isTouch, ...previewSize });
    console.log(`  ${row}/${column}  ${label}  ->  ${theme.icon}`);
  }
}

const config = {
  version: 12,
  type: 'full',
  companionBuild: companion.companionBuild,
  pages: { 1: { ...page, controls } },
  instances: {},
  custom_variables: {},
  triggers: {},
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Wrote:    ${path.relative(ROOT, OUT)}`);

const keys = previews.filter((entry) => Number(entry.row) < 2);
const touch = previews.filter((entry) => Number(entry.row) === 2);
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 28px; background: #0b1117; color: #e6edf3;
    font-family: "Segoe UI Variable Display", "Segoe UI", Arial, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 18px; font-weight: 700; }
  h2 { font-size: 12px; letter-spacing: 2px; color: #8b98a5; text-transform: uppercase; margin: 22px 0 10px; }
  .keys { display: grid; grid-template-columns: repeat(5, 112px); gap: 14px; }
  .cell { position: relative; width: 112px; height: 112px; }
  .cell img { display: block; width: 112px; height: 112px; }
  .cap {
    position: absolute; left: 0; right: 0; bottom: 11px; text-align: center;
    font-size: 11px; font-weight: 700; letter-spacing: 1px; line-height: 1.08;
    color: #fff; text-transform: uppercase; text-shadow: 0 1px 4px rgba(0,0,0,0.65);
  }
  .touch { display: flex; gap: 0; }
  .tcell { position: relative; width: 176px; height: 124px; }
  .tcell img { display: block; width: 176px; height: 124px; }
  .tcap {
    position: absolute; left: 46px; right: 10px; top: 50%; transform: translateY(-50%);
    font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #fff;
    text-transform: uppercase; text-shadow: 0 1px 4px rgba(0,0,0,0.65);
  }
</style></head><body>
  <h1>MiraBox N4 Pro — Aurora Glass</h1>
  <h2>Keys</h2>
  <div class="keys">${keys.map((entry) => `<div class="cell"><img src="${entry.dataUrl}" width="112" height="112"><span class="cap">${entry.label.split(' ').join('<br>')}</span></div>`).join('')}</div>
  <h2>Touch bar</h2>
  <div class="touch">${touch.map((entry) => `<div class="tcell"><img src="${entry.dataUrl}" width="176" height="124"><span class="tcap">${entry.label}</span></div>`).join('')}</div>
</body></html>`;

await fs.mkdir(path.dirname(PREVIEW), { recursive: true });
const previewPng = await rasterizeHtml({
  html: sheet,
  width: 960,
  height: 700,
  name: 'mirabox-modern-preview',
  root: ROOT,
});
await fs.writeFile(PREVIEW, previewPng);
console.log(`Preview:  ${path.relative(ROOT, PREVIEW)}`);

if (!APPLY) {
  console.log('Dry run. Add --apply to import the modern button images into Companion.');
  process.exit(0);
}

try {
  const result = await importPage({
    baseUrl: BASE,
    sourcePage: 1,
    targetPage: PAGE,
    config,
    name: 'mirabox-n4-pro-modern.companionconfig',
  });
  console.log(`Imported: ${result.bytes} bytes, sha1 ${result.checksum}`);
  console.log('Done. Refresh Companion page 8.');
} catch (error) {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
}
