#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ENABLE = process.argv.includes('--enable');
const DRY_RUN = process.argv.includes('--dry-run');
const VIB = ENABLE ? 0x11 : 0xff;
const REPORT_SIZE = 1025;

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
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

const addon = findAddon();
const { HID, devices } = require(addon);

const pidFilter = arg('pid', '');
const pids = pidFilter
  ? [Number.parseInt(pidFilter, 16)]
  : [0x1008, 0x1021];

const candidates = devices().filter(
  (device) => device.vendorId === 0x5548 && pids.includes(device.productId),
);
const target =
  candidates.find((device) => /MI_00/i.test(device.path)) ||
  candidates.find((device) => !/KBD/i.test(device.path)) ||
  candidates[0];

if (!target) {
  console.error('MiraBox N4 Pro not found (VID 0x5548, PID 0x1008/0x1021).');
  console.error('Connect the device and make sure the MiraBox surface is present.');
  process.exit(1);
}

const payload = [
  0x00, 0x43, 0x52, 0x54, 0x00, 0x00,
  0x51, 0x55, 0x43, 0x4d, 0x44,
  0x1f, 0x11, 0x00, VIB, 0x00, 0x11,
];
while (payload.length < REPORT_SIZE) payload.push(0);

console.log(`Device:  ${target.product} (PID 0x${target.productId.toString(16)})`);
console.log(`Action:  ${ENABLE ? 'enable' : 'disable'} vibration (QUCMD 0x${VIB.toString(16)})`);
console.log(`Report:  ${payload.length} bytes`);

if (DRY_RUN) {
  console.log('Dry run; nothing written.');
  process.exit(0);
}

let device;
try {
  device = new HID(target.path);
  const written = device.write(payload);
  console.log(`Wrote ${written} bytes. Vibration ${ENABLE ? 'enabled' : 'disabled'}.`);
} catch (error) {
  console.error(`Failed: ${error.message}`);
  console.error('If the device is busy, close Companion or disable the MiraBox surface integration and retry.');
  process.exit(1);
} finally {
  if (device) {
    try {
      device.close();
    } catch {
      // ignore
    }
  }
}
