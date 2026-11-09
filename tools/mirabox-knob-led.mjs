#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const BASE = process.env.COMPANION_URL || 'http://127.0.0.1:8000';
const REPORT_SIZE = 1025;
const DEFAULT_COLORS = ['#ffb347', '#ff8c42', '#ffd166', '#fff1c1'];
const ZONE_COLORS = ['#ffb347', '#ff8c42', '#ffd166', '#fff1c1'];

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

function hexToRgb(hex) {
  const clean = String(hex).trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) throw new Error(`Invalid color: ${hex}`);
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function scaleRgb(rgb, level) {
  const factor = Math.max(0, Math.min(100, Number(level) || 0)) / 100;
  return rgb.map((channel) => Math.round(channel * factor));
}

function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((channel) => Math.round((channel + m) * 255));
}

function randomPalette() {
  const base = Math.random() * 360;
  const jitter = () => Math.random() * 24 - 12;
  const saturation = 80 + Math.random() * 20;
  const lightness = 50 + Math.random() * 15;
  return [0, 1, 2, 3].map((index) =>
    hslToRgb(base + index * 90 + jitter(), saturation, lightness),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad(payload) {
  const out = [...payload];
  while (out.length < REPORT_SIZE) out.push(0);
  return out;
}

function setBrightness(device, percent) {
  const payload = [
    0x00, 0x43, 0x52, 0x54, 0x00, 0x00,
    0x4c, 0x42, 0x4c, 0x49, 0x47,
    Math.max(0, Math.min(100, Number(percent) || 0)),
  ];
  return device.write(pad(payload));
}

function setColors(device, colors) {
  const payload = [
    0x00, 0x43, 0x52, 0x54, 0x00, 0x00,
    0x53, 0x45, 0x54, 0x4c, 0x42,
  ];
  for (const rgb of colors) payload.push(rgb[0], rgb[1], rgb[2]);
  return device.write(pad(payload));
}

function colorsFromArg() {
  const raw = arg('colors', DEFAULT_COLORS.join(','));
  const colors = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(hexToRgb);
  while (colors.length < 4 && colors.length > 0) colors.push(colors[colors.length - 1]);
  if (colors.length !== 4) throw new Error('Provide four colors, for example --colors "#ffb347,#ff8c42,#ffd166,#fff1c1"');
  return colors;
}

async function getVar(name) {
  try {
    const response = await fetch(`${BASE}/api/custom-variable/${encodeURIComponent(name)}/value`);
    if (!response.ok) return '';
    return String(await response.text()).trim();
  } catch {
    return '';
  }
}

async function demoColors() {
  const colors = [];
  for (let zone = 1; zone <= 2; zone += 1) {
    const on = await getVar(`demo_z${zone}_on`);
    const level = Number(await getVar(`demo_z${zone}_level`));
    const base = hexToRgb(ZONE_COLORS[zone - 1]);
    colors.push(String(on) === '1' ? scaleRgb(base, level) : [0, 0, 0]);
  }

  const volume1 = Number(await getVar('demo_volume1')) || 0;
  const mute1 = String(await getVar('demo_volume1_mute')) === '1';
  colors.push(mute1 ? [255, 59, 48] : scaleRgb(hexToRgb('#00d4ff'), volume1));

  const volume2 = Number(await getVar('demo_volume2')) || 0;
  const mute2 = String(await getVar('demo_volume2_mute')) === '1';
  colors.push(mute2 ? [255, 59, 48] : scaleRgb(hexToRgb('#00ffc8'), volume2));
  return colors;
}

function describe(colors) {
  return colors.map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`).join(' ');
}

async function main() {
  const dryRun = has('dry-run');
  const off = has('off');
  const demo = has('demo');
  const random = has('random');
  const once = has('once');
  const watch = has('watch');
  const quiet = has('quiet');
  const brightness = Number(arg('brightness', '100'));
  const interval = Number(arg('interval', '500'));
  const duration = Number(arg('duration', '0'));

  if (!demo && !random && !off && !process.argv.includes('--colors') && !has('help')) {
    console.log('Usage:');
    console.log('  node tools/mirabox-knob-led.mjs --colors "#ffb347,#ff8c42,#ffd166,#fff1c1" --brightness 80');
    console.log('  node tools/mirabox-knob-led.mjs --off');
    console.log('  node tools/mirabox-knob-led.mjs --demo --once');
    console.log('  node tools/mirabox-knob-led.mjs --demo --watch [--interval 500] [--duration 5000]');
    console.log('  node tools/mirabox-knob-led.mjs --random');
    console.log('  node tools/mirabox-knob-led.mjs --random --watch [--interval 300] [--duration 5000]');
    process.exit(0);
  }

  if (demo && random) throw new Error('Use either --demo or --random, not both');
  if (demo && !once && !watch) throw new Error('Use --demo --once or --demo --watch');
  if (watch && !demo && !random) throw new Error('--watch requires --demo or --random');

  const { device, info } = openDevice();
  console.log(`Device: ${info.product} (PID 0x${info.productId.toString(16)})`);

  const write = (label, colors) => {
    if (dryRun) {
      console.log(`${label}: ${describe(colors)}`);
      return;
    }
    setBrightness(device, brightness);
    const written = setColors(device, colors);
    if (!quiet) console.log(`${label}: ${describe(colors)} (${written} bytes)`);
  };

  try {
    if (off) {
      write('LEDs off', [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      return;
    }

    if (random) {
      if (watch) {
        let previousCount = Number(await getVar('demo_press_count')) || 0;
        let palette = randomPalette();
        write('Random', palette);
        const started = Date.now();
        while (true) {
          const count = Number(await getVar('demo_press_count')) || 0;
          if (count !== previousCount) {
            palette = randomPalette();
            write('Random', palette);
            previousCount = count;
          } else if (!quiet) {
            process.stdout.write('.');
          }
          if (duration > 0 && Date.now() - started >= duration) break;
          await sleep(Math.max(100, interval));
        }
        if (!quiet) process.stdout.write('\n');
      } else {
        write('Random', randomPalette());
      }
      return;
    }

    if (!demo) {
      write('Static', colorsFromArg());
      return;
    }

    if (once) {
      write('Demo', await demoColors());
      return;
    }

    let previous = '';
    const started = Date.now();
    while (true) {
      const colors = await demoColors();
      const key = describe(colors);
      if (key !== previous) {
        write('Demo', colors);
        previous = key;
      } else if (!quiet) {
        process.stdout.write('.');
      }
      if (duration > 0 && Date.now() - started >= duration) break;
      await sleep(Math.max(100, interval));
    }
    if (!quiet) process.stdout.write('\n');
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
