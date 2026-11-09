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
const OUT = path.join(ROOT, 'out', 'mirabox-background.jpg');
const PREVIEW = path.join(ROOT, 'out', 'mirabox-background-preview.png');
const REPORT_SIZE = 1025;
const FACE_WIDTH = 800;
const FACE_HEIGHT = 480;

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function has(name) {
  return process.argv.includes(`--${name}`);
}

function findAddon() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const surfaces = path.join(appData, 'companion', 'surfaces');
  const arch = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  const candidates = fs
    .readdirSync(surfaces)
    .filter((name) => name.startsWith('mirabox-stream-dock-'))
    .sort()
    .reverse();
  for (const name of candidates) {
    const addon = path.join(surfaces, name, 'prebuilds', `HID-${arch}`, 'node-napi-v4.node');
    if (fs.existsSync(addon)) return addon;
  }
  throw new Error(`MiraBox HID addon not found under ${surfaces}`);
}

function openDevice() {
  const addon = findAddon();
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

async function writeFace(device, jpeg) {
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

async function gradientPng() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${FACE_WIDTH}px; height: ${FACE_HEIGHT}px; background: #05070d; overflow: hidden; }
    .bg {
      position: absolute; inset: 0;
      background:
        radial-gradient(60% 80% at 18% 0%, rgba(31,111,235,0.38), transparent 62%),
        radial-gradient(55% 75% at 82% 100%, rgba(137,87,229,0.34), transparent 64%),
        radial-gradient(40% 55% at 70% 15%, rgba(46,160,67,0.16), transparent 60%),
        linear-gradient(135deg, #0b1117, #111a23 52%, #05070d);
    }
    .grid {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
      background-size: 40px 40px;
    }
    .glow {
      position: absolute; left: 50%; top: 50%; width: 520px; height: 300px;
      transform: translate(-50%, -50%); border-radius: 50%;
      background: radial-gradient(circle, rgba(88,166,255,0.12), transparent 70%);
      filter: blur(20px);
    }
  </style></head><body>
    <div class="bg"></div><div class="grid"></div><div class="glow"></div>
  </body></html>`;

  const png = await rasterizeHtml({
    html,
    width: FACE_WIDTH,
    height: FACE_HEIGHT,
    name: 'mirabox-face',
    root: ROOT,
  });
  await fsPromises.writeFile(PREVIEW, png);
  return PREVIEW;
}

async function toJpeg(source) {
  const rotate = has('no-rotate') ? '' : 'hflip,vflip,';
  const filters =
    has('image') || source === PREVIEW
      ? `${rotate}scale=${FACE_WIDTH}:${FACE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FACE_WIDTH}:${FACE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`
      : `${rotate}scale=${FACE_WIDTH}:${FACE_HEIGHT}`;
  await execFileAsync(
    'ffmpeg',
    ['-y', '-i', source, '-vf', filters, '-frames:v', '1', '-q:v', '3', OUT],
    { windowsHide: true, timeout: 30000 },
  );
  const stat = await fsPromises.stat(OUT);
  return stat.size;
}

async function blackJpeg() {
  await execFileAsync(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', `color=c=black:s=${FACE_WIDTH}x${FACE_HEIGHT}`, '-frames:v', '1', '-q:v', '3', OUT],
    { windowsHide: true, timeout: 30000 },
  );
  const stat = await fsPromises.stat(OUT);
  return stat.size;
}

async function main() {
  const image = arg('image', '');
  const off = has('off');
  const dryRun = has('dry-run');

  if (!image && !off && !has('gradient') && !has('help')) {
    console.log('Usage:');
    console.log('  node tools/mirabox-background.mjs --gradient');
    console.log('  node tools/mirabox-background.mjs --image <path>');
    console.log('  node tools/mirabox-background.mjs --off');
    console.log('  add --dry-run to render without writing to the device');
    console.log('  add --no-rotate if the image is already pre-rotated 180 degrees');
    process.exit(0);
  }

  await fsPromises.mkdir(path.dirname(OUT), { recursive: true });

  let size;
  if (off) {
    size = await blackJpeg();
    console.log(`Background: black`);
  } else if (image) {
    if (!fs.existsSync(image)) throw new Error(`Image not found: ${image}`);
    size = await toJpeg(path.resolve(image));
    console.log(`Background: ${image}`);
  } else {
    const png = await gradientPng();
    size = await toJpeg(png);
    console.log('Background: Aurora gradient');
  }

  console.log(`JPEG:       ${path.relative(ROOT, OUT)} (${size} bytes, ${FACE_WIDTH}x${FACE_HEIGHT})`);

  if (dryRun) {
    console.log('Dry run; device not written.');
    return;
  }

  const { device, info } = openDevice();
  console.log(`Device:     ${info.product} (PID 0x${info.productId.toString(16)})`);
  try {
    const jpeg = await fsPromises.readFile(OUT);
    await writeFace(device, jpeg);
    console.log('Flashed full-face background. Waiting 2.5s for the flash write...');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    console.log('Done. Background persists across power cycles.');
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
