#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { importPage } from '../lib/companion-import.js';
import { value } from '../lib/build/templates.js';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.COMPANION_URL || 'http://127.0.0.1:8000';
const PAGE = Number(arg('page', '8'));
const APPLY = process.argv.includes('--apply');
const OUT = path.resolve(ROOT, arg('out', 'config/public/layouts/mirabox-n4-pro-icons.json'));
const MDI_VERSION = '7.4.47';

const ICON_MAP = {
  'SYSTEM ON': 'power',
  'SYSTEM OFF': 'power-off',
  'TV ON': 'television',
  'TV OFF': 'television-off',
  'VIDEO PC': 'monitor',
  'VIDEO LAPTOP': 'laptop',
  'LIGHT ON': 'lightbulb-on',
  'LIGHT OFF': 'lightbulb-off',
  'VOLUME UP': 'volume-high',
  'VOLUME DOWN': 'volume-low',
  FOCUS: 'target',
  PRESENT: 'presentation',
  MEDIA: 'play-circle',
  LIGHTS: 'lightbulb-group',
  OFF: 'power-standby',
};

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const iconCache = new Map();
const FORCE_SVG = process.argv.includes('--svg');
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findBrowser() {
  if (FORCE_SVG) return null;
  return BROWSERS.find((candidate) => fsSync.existsSync(candidate)) || null;
}

async function rasterizeSvg(name, svg) {
  const browser = findBrowser();
  if (!browser) return null;

  const hash = createHash('sha1').update(name).digest('hex').slice(0, 10);
  const dir = path.join(ROOT, 'out', 'icons');
  await fs.mkdir(dir, { recursive: true });
  const htmlPath = path.join(dir, `icon-${hash}.html`);
  const pngPath = path.join(dir, `icon-${hash}.png`);
  const profileDir = path.join(dir, `profile-${hash}`);
  const html = `<!doctype html><html><head><style>
    html, body { margin: 0; padding: 0; background: transparent; }
    svg { display: block; width: 64px; height: 64px; }
  </style></head><body>${svg}</body></html>`;

  await fs.writeFile(htmlPath, html, 'utf8');
  try {
    await execFileAsync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--default-background-color=00000000',
        '--window-size=64,64',
        `--screenshot=${pngPath}`,
        `--user-data-dir=${profileDir}`,
        pathToFileURL(htmlPath).href,
      ],
      { windowsHide: true, timeout: 20000 },
    );
    const png = await fs.readFile(pngPath);
    return `data:image/png;base64,${png.toString('base64')}`;
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function iconDataUrl(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const url = `https://cdn.jsdelivr.net/npm/@mdi/svg@${MDI_VERSION}/svg/${name}.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Icon ${name}: HTTP ${response.status}`);
  const text = await response.text();
  const inner = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1];
  if (!inner) throw new Error(`Icon ${name}: no SVG body`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff">${inner}</svg>`;

  const png = await rasterizeSvg(name, svg);
  const dataUrl = png || `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  iconCache.set(name, dataUrl);
  return dataUrl;
}

function imageLayer({ isTouch, dataUrl }) {
  return {
    id: 'icon0',
    name: 'Icon',
    usage: 'auto',
    type: 'image',
    enabled: value(true),
    opacity: value(100),
    x: value(isTouch ? 4 : 22),
    y: value(isTouch ? 18 : 2),
    width: value(isTouch ? 22 : 56),
    height: value(isTouch ? 64 : 56),
    rotation: value(0),
    base64Image: value(dataUrl),
    halign: value('center'),
    valign: value('center'),
    fillMode: value('fit'),
  };
}

function layoutText(textLayer, { isTouch, label }) {
  textLayer.text.value = label;
  textLayer.x.value = isTouch ? 28 : 0;
  textLayer.y.value = isTouch ? 0 : 60;
  textLayer.width.value = isTouch ? 70 : 100;
  textLayer.height.value = isTouch ? 100 : 40;
  textLayer.halign.value = isTouch ? 'left' : 'center';
  textLayer.valign.value = 'center';
  textLayer.fontsize.value = isTouch ? 60 : 50;
  textLayer.fontsizeAllowShrink.value = true;
}

const exportResponse = await fetch(`${BASE}/int/export/full?format=json`, { signal: AbortSignal.timeout(30000) });
if (!exportResponse.ok) throw new Error(`Companion export failed: HTTP ${exportResponse.status}`);
const companion = await exportResponse.json();
const page = companion.pages[String(PAGE)];
if (!page) throw new Error(`Page ${PAGE} not found`);

console.log(`Renderer: ${findBrowser() ? 'headless browser -> PNG' : 'SVG fallback'}`);

const controls = JSON.parse(JSON.stringify(page.controls || {}));
const applied = [];

for (const [row, columns] of Object.entries(controls)) {
  for (const [column, control] of Object.entries(columns)) {
    const layers = control.style?.layers;
    if (!Array.isArray(layers)) continue;
    const textLayer = layers.find((layer) => layer.type === 'text');
    if (!textLayer) continue;

    const label = String(textLayer.text?.value || '').replace(/\s+/g, ' ').trim().toUpperCase();
    const iconName = ICON_MAP[label];
    if (!iconName) {
      console.log(`  skip ${row}/${column}: no icon for "${label}"`);
      continue;
    }

    const dataUrl = await iconDataUrl(iconName);
    const isTouch = Number(row) === 2;

    const textIndex = layers.findIndex((layer) => layer.type === 'text');
    const filtered = layers.filter((layer) => layer.type !== 'image');
    const insertAt = filtered.findIndex((layer) => layer.type === 'text');
    filtered.splice(insertAt, 0, imageLayer({ isTouch, dataUrl }));
    control.style.layers = filtered;

    layoutText(textLayer, { isTouch, label });
    applied.push({ row, column, label, icon: iconName });
  }
}

const config = {
  version: 12,
  type: 'full',
  companionBuild: companion.companionBuild,
  pages: {
    1: {
      ...page,
      controls,
    },
  },
  instances: {},
  custom_variables: {},
  triggers: {},
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(`Page:     ${PAGE} (${page.name})`);
console.log(`Icons:    ${applied.length}`);
for (const entry of applied) console.log(`  ${entry.row}/${entry.column}  ${entry.label}  ->  ${entry.icon}`);
console.log(`Wrote:    ${path.relative(ROOT, OUT)}`);

if (!APPLY) {
  console.log('Dry run. Add --apply to import the iconized page into Companion.');
  process.exit(0);
}

try {
  const result = await importPage({
    baseUrl: BASE,
    sourcePage: 1,
    targetPage: PAGE,
    config,
    name: 'mirabox-n4-pro-icons.companionconfig',
  });
  console.log(`Imported: ${result.bytes} bytes, sha1 ${result.checksum}`);
  console.log(`Remap:    ${JSON.stringify(result.remap ?? {})}`);
  console.log('Done. Refresh Companion page 8.');
} catch (error) {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
}
