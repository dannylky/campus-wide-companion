#!/usr/bin/env node
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { rasterizeHtml } from '../lib/rasterize.js';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'out');
const PREVIEW = path.join(OUT_DIR, 'animated-background-preview.png');
const FACE_RAW = path.join(OUT_DIR, 'animated-face.raw');
const FACE_JPEG = path.join(OUT_DIR, 'animated-face.jpg');

const REPORT_SIZE = 1025;
const FACE_W = 800;
const FACE_H = 480;
const TILE = 112;
const GAP = 31;
const COLS = 5;
const ROWS = 2;
const XK = 58;
const CANVAS_W = 800;
const CANVAS_H = 404;
const BAND_Y = 286;
const STRIP_Y = 292;
const STRIP_X = [0, 208, 416, 624];
const STRIP_W = 176;
const STRIP_H = 112;
const KEY_LO = 24;
const KEY_HI = 64;

const OVERLAYS = [
  { kind: 'key', slot: 11, label: 'SYSTEM ON', icon: 'power' },
  { kind: 'key', slot: 12, label: 'TV ON', icon: 'television' },
  { kind: 'key', slot: 13, label: 'VIDEO PC', icon: 'monitor' },
  { kind: 'key', slot: 14, label: 'LIGHT ON', icon: 'lightbulb-on' },
  { kind: 'key', slot: 15, label: 'ZONE 1', icon: 'volume-high' },
  { kind: 'key', slot: 6, label: 'SYSTEM OFF', icon: 'power-off' },
  { kind: 'key', slot: 7, label: 'TV OFF', icon: 'television-off' },
  { kind: 'key', slot: 8, label: 'VIDEO LAPTOP', icon: 'laptop' },
  { kind: 'key', slot: 9, label: 'LIGHT OFF', icon: 'lightbulb-off' },
  { kind: 'key', slot: 10, label: 'ZONE 2', icon: 'volume-low' },
  { kind: 'strip', slot: 1, label: 'FOCUS', icon: 'target' },
  { kind: 'strip', slot: 2, label: 'PRESENT', icon: 'presentation' },
  { kind: 'strip', slot: 3, label: 'MEDIA', icon: 'play-circle' },
  { kind: 'strip', slot: 4, label: 'LIGHTS', icon: 'lightbulb-group' },
];

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function has(name) {
  return process.argv.includes(`--${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findSurfaceModule() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const surfaces = path.join(appData, 'companion', 'surfaces');
  const candidates = fs
    .readdirSync(surfaces)
    .filter((name) => name.startsWith('mirabox-stream-dock-'))
    .sort()
    .reverse();
  if (!candidates.length) throw new Error(`MiraBox surface module not found under ${surfaces}`);
  return path.join(surfaces, candidates[0]);
}

function findAddon(moduleDir, folder, file) {
  const arch = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  const addon = path.join(moduleDir, 'prebuilds', `${folder}-${arch}`, file);
  if (!fs.existsSync(addon)) throw new Error(`Addon not found: ${addon}`);
  return addon;
}

function findImageAddon(moduleDir) {
  const arch = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  const addon = path.join(moduleDir, 'prebuilds', `julusian-image-rs.${arch}-msvc.node`);
  if (!fs.existsSync(addon)) throw new Error(`Image addon not found: ${addon}`);
  return addon;
}

function openDevice(moduleDir) {
  const addon = findAddon(moduleDir, 'HID', 'node-napi-v4.node');
  const { HID, devices } = require(addon);
  const pids = [0x1008, 0x1021];
  const candidates = devices().filter(
    (device) => device.vendorId === 0x5548 && pids.includes(device.productId),
  );
  const target =
    candidates.find((device) => /MI_00/i.test(device.path)) ||
    candidates.find((device) => !/KBD/i.test(device.path)) ||
    candidates[0];
  if (!target) throw new Error('MiraBox N4 Pro not found (VID 0x5548, PID 0x1008/0x1021).');
  return { device: new HID(target.path), info: target };
}

function pad(payload) {
  const out = [...payload];
  while (out.length < REPORT_SIZE) out.push(0);
  return out;
}

function sendBat(device, slot, jpeg) {
  const size = jpeg.length;
  const header = [
    0x00, 0x43, 0x52, 0x54, 0x00, 0x00,
    0x42, 0x41, 0x54,
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    slot,
  ];
  device.write(pad(header));
  for (let offset = 0; offset < jpeg.length; offset += 1024) {
    const chunk = jpeg.subarray(offset, Math.min(offset + 1024, jpeg.length));
    device.write(pad([0x00, ...chunk]));
  }
  device.write(pad([0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x53, 0x54, 0x50]));
}

function sendFace(device, jpeg) {
  const size = jpeg.length;
  const header = [
    0x00, 0x43, 0x52, 0x54, 0x00, 0x00,
    0x4c, 0x4f, 0x47,
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    0x01,
  ];
  device.write(pad(header));
  for (let offset = 0; offset < jpeg.length; offset += 1024) {
    const chunk = jpeg.subarray(offset, Math.min(offset + 1024, jpeg.length));
    device.write(pad([0x00, ...chunk]));
  }
  device.write(pad([0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x53, 0x54, 0x50]));
}

function makeAurora() {
  const buf = Buffer.alloc(CANVAS_W * CANVAS_H * 3);
  for (let y = 0; y < CANVAS_H; y += 1) {
    const v = y / CANVAS_H;
    for (let x = 0; x < CANVAS_W; x += 1) {
      const u = x / CANVAS_W;
      const a = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 2) + v * 3.2);
      const b = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 3 + 0.35) + v * 4.7 + 1.7);
      const c = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 1 - 0.2) + v * 2.1 + 3.1);
      const r = 8 + 34 * a + 22 * c;
      const g = 12 + 58 * b + 24 * a;
      const bl = 26 + 108 * c + 42 * b;
      const i = (y * CANVAS_W + x) * 3;
      buf[i] = Math.max(0, Math.min(255, Math.round(r)));
      buf[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      buf[i + 2] = Math.max(0, Math.min(255, Math.round(bl)));
    }
  }
  return buf;
}

function shift(buf, offset) {
  const out = Buffer.alloc(buf.length);
  const rowBytes = CANVAS_W * 3;
  const cut = offset * 3;
  for (let y = 0; y < CANVAS_H; y += 1) {
    const row = y * rowBytes;
    buf.copy(out, row, row + cut, row + rowBytes);
    buf.copy(out, row + rowBytes - cut, row, row + cut);
  }
  return out;
}

function crop(buf, x, y, w, h) {
  const out = Buffer.alloc(w * h * 3);
  for (let row = 0; row < h; row += 1) {
    const src = ((y + row) * CANVAS_W + x) * 3;
    buf.copy(out, row * w * 3, src, src + w * 3);
  }
  return out;
}

function rotate180(buf, w, h) {
  const out = Buffer.alloc(buf.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (y * w + x) * 3;
      const dst = ((h - 1 - y) * w + (w - 1 - x)) * 3;
      out[dst] = buf[src];
      out[dst + 1] = buf[src + 1];
      out[dst + 2] = buf[src + 2];
    }
  }
  return out;
}

async function iconInner(name) {
  const url = `https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/${name}.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Icon ${name}: HTTP ${response.status}`);
  const text = await response.text();
  const inner = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1];
  if (!inner) throw new Error(`Icon ${name}: no SVG body`);
  return inner;
}

function keyHtml(label, icon) {
  const lines = label.split(' ').join('<br>');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${TILE}px; height: ${TILE}px; background: #000; overflow: hidden; }
    .key { position: relative; width: ${TILE}px; height: ${TILE}px; background: #000;
      font-family: "Segoe UI Variable Display", "Segoe UI", Arial, sans-serif; }
    .icon { position: absolute; left: 50%; top: 10px; width: 46px; height: 46px;
      transform: translateX(-50%); fill: #fff; }
    .label { position: absolute; left: 6px; right: 6px; bottom: 6px; text-align: center;
      color: #fff; font-weight: 700; font-size: 16px; line-height: 1.05;
      letter-spacing: 0.8px; text-transform: uppercase; }
  </style></head><body>
    <div class="key"><svg class="icon" viewBox="0 0 24 24">${icon}</svg><div class="label">${lines}</div></div>
  </body></html>`;
}

function stripHtml(label, icon) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${STRIP_W}px; height: ${STRIP_H}px; background: #000; overflow: hidden; }
    .strip { position: relative; width: ${STRIP_W}px; height: ${STRIP_H}px; background: #000;
      font-family: "Segoe UI Variable Display", "Segoe UI", Arial, sans-serif; }
    .icon { position: absolute; left: 10px; top: 50%; width: 34px; height: 34px;
      transform: translateY(-50%); fill: #fff; }
    .label { position: absolute; left: 52px; right: 8px; top: 50%; transform: translateY(-50%);
      color: #fff; font-weight: 700; font-size: 20px; letter-spacing: 0.8px;
      text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style></head><body>
    <div class="strip"><svg class="icon" viewBox="0 0 24 24">${icon}</svg><div class="label">${label}</div></div>
  </body></html>`;
}

async function buildOverlay(spec) {
  const icon = await iconInner(spec.icon);
  const html = spec.kind === 'key' ? keyHtml(spec.label, icon) : stripHtml(spec.label, icon);
  const png = await rasterizeHtml({
    html,
    width: spec.kind === 'key' ? TILE : STRIP_W,
    height: spec.kind === 'key' ? TILE : STRIP_H,
    name: `overlay-${spec.slot}`,
    root: ROOT,
  });
  return png;
}

function decodeOverlay(png, imageAddon) {
  const { ImageTransformer } = require(imageAddon);
  const img = ImageTransformer.fromEncodedImage(png);
  const raw = img.toBufferSync('rgba');
  const rgba = raw.buffer;
  const alpha = Buffer.alloc(raw.width * raw.height);
  for (let i = 0; i < alpha.length; i += 1) {
    const v = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    alpha[i] = v <= KEY_LO ? 0 : v >= KEY_HI ? 255 : Math.round(((v - KEY_LO) * 255) / (KEY_HI - KEY_LO));
  }
  return { width: raw.width, height: raw.height, rgba, alpha };
}

function composite(background, overlay, w, h) {
  const out = Buffer.from(background);
  for (let i = 0; i < w * h; i += 1) {
    const a = overlay.alpha[i];
    if (!a) continue;
    const inv = 255 - a;
    const s = i * 4;
    const d = i * 3;
    out[d] = Math.round((overlay.rgba[s] * a + out[d] * inv) / 255);
    out[d + 1] = Math.round((overlay.rgba[s + 1] * a + out[d + 1] * inv) / 255);
    out[d + 2] = Math.round((overlay.rgba[s + 2] * a + out[d + 2] * inv) / 255);
  }
  return out;
}

function tileFor(spec, canvas, overlays) {
  if (spec.kind === 'key') {
    const row = spec.slot >= 11 ? 0 : 1;
    const col = spec.slot >= 11 ? spec.slot - 11 : spec.slot - 6;
    const x = XK + col * (TILE + GAP);
    const y = row * (TILE + GAP);
    const base = crop(canvas, x, y, TILE, TILE);
    const composed = composite(base, overlays.get(spec.slot), TILE, TILE);
    return { jpeg: null, raw: composed, w: TILE, h: TILE };
  }
  const col = spec.slot - 1;
  const x = STRIP_X[col];
  const base = crop(canvas, x, STRIP_Y, STRIP_W, STRIP_H);
  const composed = composite(base, overlays.get(spec.slot), STRIP_W, STRIP_H);
  return { jpeg: null, raw: composed, w: STRIP_W, h: STRIP_H };
}

function encodeTile(raw, w, h, jt, quality) {
  const result = jt.compressSync(raw, {
    width: w,
    height: h,
    format: jt.FORMAT_RGB,
    quality,
  });
  return result.data.subarray(0, result.size);
}

function pastePreview(canvas, tiles) {
  const out = Buffer.alloc(CANVAS_W * CANVAS_H * 3);
  canvas.copy(out);
  for (const tile of tiles) {
    const x = tile.kind === 'key'
      ? XK + (tile.slot >= 11 ? tile.slot - 11 : tile.slot - 6) * (TILE + GAP)
      : STRIP_X[tile.slot - 1];
    const y = tile.kind === 'key'
      ? (tile.slot >= 11 ? 0 : TILE + GAP)
      : STRIP_Y;
    for (let row = 0; row < tile.h; row += 1) {
      const src = row * tile.w * 3;
      const dst = ((y + row) * CANVAS_W + x) * 3;
      tile.raw.copy(out, dst, src, src + tile.w * 3);
    }
  }
  return out;
}

async function rawToPng(raw, w, h, outPath) {
  const rawPath = path.join(OUT_DIR, 'animated-preview.raw');
  await fsPromises.writeFile(rawPath, raw);
  await execFileAsync(
    'ffmpeg',
    ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', rawPath, '-frames:v', '1', outPath],
    { windowsHide: true, timeout: 30000 },
  );
}

async function buildFace(canvas) {
  const rawPath = path.join(OUT_DIR, 'animated-face.raw');
  await fsPromises.writeFile(rawPath, canvas);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${CANVAS_W}x${CANVAS_H}`, '-i', rawPath,
      '-filter_complex',
      `[0:v]crop=${CANVAS_W}:${BAND_Y}:0:0,scale=${FACE_W}:${FACE_H - 118}:flags=lanczos[keys];` +
        `[0:v]crop=${CANVAS_W}:118:0:${BAND_Y}[band];` +
        `[keys][band]vstack=inputs=2,hflip,vflip[out]`,
      '-map', '[out]',
      '-frames:v', '1',
      '-q:v', '3',
      FACE_JPEG,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  return fsPromises.readFile(FACE_JPEG);
}

async function main() {
  const fps = Math.max(1, Math.min(30, Number(arg('fps', '5'))));
  const duration = Number(arg('duration', '0'));
  const quality = Math.max(50, Math.min(95, Number(arg('quality', '80'))));
  const dryRun = has('dry-run');
  const noFace = has('no-face');
  const speed = Math.max(1, Number(arg('speed', '4')));

  const moduleDir = findSurfaceModule();
  const imageAddon = findImageAddon(moduleDir);
  const jpegAddon = findAddon(moduleDir, 'jpeg-turbo', 'node-napi-v10.node');
  const jt = require(jpegAddon);

  console.log(`Module:  ${path.basename(moduleDir)}`);
  console.log(`Overlays: generating ${OVERLAYS.length} icon/text overlays...`);

  const overlays = new Map();
  for (const spec of OVERLAYS) {
    const png = await buildOverlay(spec);
    overlays.set(spec.slot, decodeOverlay(png, imageAddon));
    console.log(`  ${spec.kind} ${spec.slot}: ${spec.label}`);
  }

  const canvas = makeAurora();
  const tiles = OVERLAYS.map((spec) => ({ ...spec, ...tileFor(spec, canvas, overlays) }));
  const preview = pastePreview(canvas, tiles);
  await fsPromises.mkdir(OUT_DIR, { recursive: true });
  await rawToPng(preview, CANVAS_W, CANVAS_H, PREVIEW);
  console.log(`Preview: ${path.relative(ROOT, PREVIEW)}`);

  if (dryRun) {
    console.log('Dry run; device not written.');
    return;
  }

  const { device, info } = openDevice(moduleDir);
  console.log(`Device:  ${info.product} (PID 0x${info.productId.toString(16)})`);

  try {
    if (!noFace) {
      const face = await buildFace(canvas);
      console.log(`Face:    ${path.relative(ROOT, FACE_JPEG)} (${face.length} bytes), flashing...`);
      sendFace(device, face);
      await sleep(2500);
    }

    console.log(`Streaming at ${fps} FPS. Press Ctrl+C to stop.`);
    const started = Date.now();
    let frame = 0;
    let offset = 0;
    while (true) {
      const frameStarted = Date.now();
      const shifted = shift(canvas, offset);
      for (const spec of OVERLAYS) {
        const tile = tileFor(spec, shifted, overlays);
        const rotated = rotate180(tile.raw, tile.w, tile.h);
        const jpeg = encodeTile(rotated, tile.w, tile.h, jt, quality);
        sendBat(device, spec.slot, jpeg);
        await sleep(1);
      }
      frame += 1;
      offset = (offset + speed) % CANVAS_W;
      if (duration > 0 && Date.now() - started >= duration) break;
      const elapsed = Date.now() - frameStarted;
      await sleep(Math.max(0, Math.round(1000 / fps) - elapsed));
      if (frame % 10 === 0) console.log(`  frame ${frame}`);
    }
    console.log('Stopped. Companion will repaint its buttons on the next update.');
  } finally {
    try {
      device.close();
    } catch {
      // ignore
    }
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  console.error('If the device is busy, close Companion or disable the MiraBox surface integration and retry.');
  process.exit(1);
});
