#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { importPage, connect, call, wsUrl } from '../lib/companion-import.js';
import { value, boxLayer, textLayer } from '../lib/build/templates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.COMPANION_URL || 'http://127.0.0.1:8000';
const APPLY = process.argv.includes('--apply');
const TEST = process.argv.includes('--test');
const TEST_ONLY = process.argv.includes('--test-only');
const OUT_DIR = path.join(ROOT, 'out');
const PAGE_8 = 8;
const PAGE_9 = 9;
const BACKUP = path.join(OUT_DIR, 'backup-before-light-demo.companionconfig');
const PAGE8_CONFIG = path.join(OUT_DIR, 'light-demo-page8.companionconfig');
const PAGE9_CONFIG = path.join(OUT_DIR, 'light-demo-page9.companionconfig');

const ZONE_COLORS = ['#ffb347', '#ff8c42', '#ffd166', '#fff1c1'];

function expr(text) {
  return { value: text, isExpression: true };
}

function actionId() {
  return `act_${randomBytes(10).toString('hex')}`;
}

function setVarAction(name, expression) {
  return {
    type: 'action',
    id: actionId(),
    connectionId: 'internal',
    definitionId: 'custom_variable_set_value',
    options: {
      name: { value: name, isExpression: false },
      create: { value: true, isExpression: false },
      value: expr(expression),
    },
    upgradeIndex: -1,
  };
}

function referenceControl(page, row, column) {
  return {
    type: 'button-reference',
    options: {
      location: { value: `${page}/${row}/${column}`, isExpression: false },
    },
  };
}

function knobControl(zone, backgroundImage, canvas) {
  const on = `demo_z${zone}_on`;
  const level = `demo_z${zone}_level`;
  const color = ZONE_COLORS[zone - 1];

  const toggle = setVarAction(on, `1 - $(custom:${on})`);
  const bump = setVarAction('demo_press_count', '$(custom:demo_press_count) + 1');
  const levelLeft = setVarAction(level, `min(100, max(0, $(custom:${level}) + $(this:delta)))`);
  const levelRight = setVarAction(level, `min(100, max(0, $(custom:${level}) + $(this:delta)))`);

  const glow = {
    ...boxLayer(color),
    id: 'glow',
    name: 'Glow',
    opacity: expr(`bool($(custom:${on})) ? 15 + $(custom:${level}) * 0.75 : 0`),
  };

  const text = textLayer('', '#ffffff', 50);
  text.text = expr(
    '`ZONE ' +
      zone +
      '\\n${bool($(custom:' +
      on +
      ")) ? 'ON' : 'OFF'} · ${$(custom:" +
      level +
      ')}%`',
  );
  text.x.value = 0;
  text.y.value = 62;
  text.width.value = 100;
  text.height.value = 38;
  text.halign.value = 'center';
  text.valign.value = 'center';
  text.fontsize.value = 50;

  return {
    type: 'button-layered',
    style: {
      layers: [
        { ...canvas, decoration: value('none') },
        JSON.parse(JSON.stringify(backgroundImage)),
        glow,
        text,
      ],
    },
    options: {
      stepProgression: 'auto',
      stepExpression: '',
      rotaryActions: true,
      canModifyStyleInApis: false,
      notes: '',
    },
    feedbacks: [],
    steps: {
      0: {
        action_sets: {
          down: [toggle, bump],
          up: [],
          rotate_left: [levelLeft],
          rotate_right: [levelRight],
        },
        options: { runWhileHeld: [] },
      },
    },
    localVariables: [],
  };
}

function masterControl(existing) {
  const control = JSON.parse(JSON.stringify(existing));
  control.style.layers = control.style.layers.filter(
    (layer) => layer.id !== 'track' && layer.id !== 'thumb',
  );

  const onExpr =
    '(bool($(custom:demo_z1_on)) ? 1 : 0) + ' +
    '(bool($(custom:demo_z2_on)) ? 1 : 0) + ' +
    '(bool($(custom:demo_z3_on)) ? 1 : 0) + ' +
    '(bool($(custom:demo_z4_on)) ? 1 : 0)';
  const avgExpr =
    '($(custom:demo_z1_level) + $(custom:demo_z2_level) + ' +
    '$(custom:demo_z3_level) + $(custom:demo_z4_level)) / 4';

  const glow = {
    ...boxLayer('#ffb347'),
    id: 'glow',
    name: 'Glow',
    opacity: expr(`on = ${onExpr}; avg = ${avgExpr}; on > 0 ? 20 + avg * 0.8 : 0`),
  };

  const text = control.style.layers.find((layer) => layer.type === 'text');
  if (text) {
    text.text = expr(
      `on = ${onExpr}; avg = ${avgExpr}; ` + '`LIGHTS ${on}/4 · ${round(avg)}%`',
    );
    text.x.value = 28;
    text.y.value = 0;
    text.width.value = 70;
    text.height.value = 100;
    text.halign.value = 'left';
    text.valign.value = 'center';
    text.fontsize.value = 55;
  }

  const textIndex = control.style.layers.findIndex((layer) => layer.type === 'text');
  control.style.layers.splice(textIndex < 0 ? control.style.layers.length : textIndex, 0, glow);

  const allExpr =
    'all = bool($(custom:demo_z1_on)) && bool($(custom:demo_z2_on)) && ' +
    'bool($(custom:demo_z3_on)) && bool($(custom:demo_z4_on)); all ? 0 : 1';
  control.steps[0].action_sets.down = [1, 2, 3, 4].map((zone) =>
    setVarAction(`demo_z${zone}_on`, allExpr),
  );
  control.steps[0].action_sets.up = [];
  control.options.rotaryActions = false;
  return control;
}

function demoVariables() {
  const vars = {
    demo_press_count: {
      description: 'Demo knob press counter',
      defaultValue: '0',
      persistCurrentValue: false,
      sortOrder: 0,
    },
  };
  for (let zone = 1; zone <= 4; zone += 1) {
    vars[`demo_z${zone}_on`] = {
      description: `Demo light zone ${zone} on/off`,
      defaultValue: '0',
      persistCurrentValue: false,
      sortOrder: (zone - 1) * 2 + 1,
    };
    vars[`demo_z${zone}_level`] = {
      description: `Demo light zone ${zone} brightness`,
      defaultValue: '50',
      persistCurrentValue: false,
      sortOrder: (zone - 1) * 2 + 2,
    };
  }
  return vars;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getVar(name) {
  const text = await fetchJson(`${BASE}/api/custom-variable/${encodeURIComponent(name)}/value`);
  return String(text).trim();
}

async function setVar(name, valueText) {
  await fetchJson(
    `${BASE}/api/custom-variable/${encodeURIComponent(name)}/value?value=${encodeURIComponent(valueText)}`,
    { method: 'POST' },
  );
  await sleep(150);
}

async function press(page, row, column, action = 'press') {
  await fetchJson(`${BASE}/api/location/${page}/${row}/${column}/${action}`, { method: 'POST' });
  await sleep(500);
}

async function resetDemo() {
  await setVar('demo_press_count', '0');
  for (let zone = 1; zone <= 4; zone += 1) {
    await setVar(`demo_z${zone}_on`, '0');
    await setVar(`demo_z${zone}_level`, '50');
  }
}

async function ensureVariables() {
  const vars = demoVariables();
  const ws = await connect(wsUrl(BASE));
  try {
    for (const [name, definition] of Object.entries(vars)) {
      try {
        const result = await call(ws, 'mutation', 'customVariables.create', {
          name,
          defaultVal: definition.defaultValue,
        });
        if (typeof result === 'string' && result) {
          console.log(`Variable ${name}: ${result}`);
        } else {
          console.log(`Variable ${name}: created`);
        }
      } catch (error) {
        console.log(`Variable ${name}: ${error.message}`);
      }
      try {
        await call(ws, 'mutation', 'customVariables.setCurrent', {
          name,
          value: definition.defaultValue,
        });
      } catch {
        // current value can be set later by the demo actions
      }
    }
  } finally {
    ws.close();
  }
}

async function testDemo() {
  console.log('Testing demo...');
  await resetDemo();

  if ((await getVar('demo_z1_on')) !== '0') throw new Error('reset failed');

  await press(PAGE_8, 3, 0, 'press');
  if ((await getVar('demo_z1_on')) !== '1') throw new Error('knob press did not toggle zone 1');

  await press(PAGE_8, 3, 0, 'rotate-right');
  const level = Number(await getVar('demo_z1_level'));
  if (!(level > 50)) throw new Error(`rotate did not raise level: ${level}`);

  await press(PAGE_8, 0, 3, 'press');
  if ((await getVar('demo_z1_on')) !== '0') throw new Error('LIGHT ON mirror did not toggle zone 1');

  await press(PAGE_8, 2, 3, 'press');
  for (let zone = 1; zone <= 4; zone += 1) {
    if ((await getVar(`demo_z${zone}_on`)) !== '1') {
      throw new Error(`master did not turn on zone ${zone}`);
    }
  }

  await resetDemo();
  console.log('Demo test: PASS');
}

if (TEST_ONLY) {
  await testDemo();
  process.exit(0);
}

await fs.mkdir(OUT_DIR, { recursive: true });

const companion = await fetchJson(`${BASE}/int/export/full?format=json`);
const page8 = companion.pages[String(PAGE_8)];
if (!page8) throw new Error(`Page ${PAGE_8} not found`);

await fs.writeFile(BACKUP, `${JSON.stringify(companion, null, 2)}\n`, 'utf8');

const controls = JSON.parse(JSON.stringify(page8.controls || {}));
const lightOn = controls['0']?.['3'];
if (!lightOn) throw new Error('LIGHT ON button at 0/3 not found');

let sourceButton = lightOn;
if (!sourceButton.style?.layers) {
  const modernPath = path.join(ROOT, 'config/public/layouts/mirabox-n4-pro-modern.json');
  const modern = JSON.parse(await fs.readFile(modernPath, 'utf8'));
  sourceButton = modern.pages?.['1']?.controls?.['0']?.['3'];
  if (!sourceButton?.style?.layers) {
    throw new Error('Aurora Glass LIGHT ON image not found in the modern layout artifact');
  }
}

const backgroundImage = sourceButton.style.layers.find((layer) => layer.type === 'image');
const canvas = sourceButton.style.layers.find((layer) => layer.type === 'canvas');
if (!backgroundImage || !canvas) throw new Error('LIGHT ON image/canvas layer not found');

controls['3'] = controls['3'] || {};
for (let zone = 1; zone <= 4; zone += 1) {
  controls['3'][String(zone - 1)] = knobControl(zone, backgroundImage, canvas);
}
controls['0']['3'] = referenceControl(PAGE_8, 3, 0);
controls['1']['3'] = referenceControl(PAGE_8, 3, 1);
controls['2']['3'] = masterControl(controls['2']['3']);

const controls9 = JSON.parse(JSON.stringify(controls));
controls9['0']['3'] = referenceControl(PAGE_9, 3, 0);
controls9['1']['3'] = referenceControl(PAGE_9, 3, 1);

const customVariables = {
  ...(companion.custom_variables || {}),
  ...demoVariables(),
};

function makeConfig(pageControls) {
  return {
    version: 12,
    type: 'full',
    companionBuild: companion.companionBuild,
    pages: {
      1: {
        ...page8,
        controls: pageControls,
      },
    },
    instances: {},
    custom_variables: customVariables,
    triggers: {},
  };
}

const config8 = makeConfig(controls);
const config9 = makeConfig(controls9);

await fs.writeFile(PAGE8_CONFIG, `${JSON.stringify(config8, null, 2)}\n`, 'utf8');
await fs.writeFile(PAGE9_CONFIG, `${JSON.stringify(config9, null, 2)}\n`, 'utf8');

console.log(`Demo variables: ${Object.keys(demoVariables()).join(', ')}`);
console.log(`Knob buttons:   page ${PAGE_8} 3/0-3/3`);
console.log(`Mirrors:        LIGHT ON -> ${PAGE_8}/3/0, LIGHT OFF -> ${PAGE_8}/3/1, LIGHTS -> master`);
console.log(`Wrote:          ${path.relative(ROOT, PAGE8_CONFIG)}`);
console.log(`Wrote:          ${path.relative(ROOT, PAGE9_CONFIG)}`);
console.log(`Backup:         ${path.relative(ROOT, BACKUP)}`);

if (!APPLY) {
  console.log('Dry run. Add --apply to import the demo into pages 8 and 9.');
  process.exit(0);
}

try {
  await ensureVariables();

  const result8 = await importPage({
    baseUrl: BASE,
    sourcePage: 1,
    targetPage: PAGE_8,
    config: config8,
    name: 'light-demo-page8.companionconfig',
  });
  console.log(`Page ${PAGE_8}: imported ${result8.bytes} bytes`);

  const result9 = await importPage({
    baseUrl: BASE,
    sourcePage: 1,
    targetPage: PAGE_9,
    config: config9,
    name: 'light-demo-page9.companionconfig',
  });
  console.log(`Page ${PAGE_9}: imported ${result9.bytes} bytes`);

  const ws = await connect(wsUrl(BASE));
  try {
    await call(ws, 'mutation', 'pages.setName', {
      pageNumber: PAGE_9,
      name: 'MiraBox N4 Pro (Backup)',
    });
  } finally {
    ws.close();
  }
  console.log(`Page ${PAGE_9}: name restored`);

  if (TEST) await testDemo();
  console.log('Done. Refresh Companion pages 8 and 9.');
} catch (error) {
  console.error(`Apply failed: ${error.message}`);
  process.exit(1);
}
