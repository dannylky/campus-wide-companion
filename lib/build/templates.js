import { createHash } from 'node:crypto';

export function value(v) {
  return { value: v, isExpression: false };
}

export function hexToInt(hex, fallback = 0) {
  if (typeof hex === 'number') return hex;
  const text = String(hex || '').trim();
  if (!text) return fallback;
  const clean = text.startsWith('#') ? text.slice(1) : text;
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return parseInt(clean, 16);
}

export function actionId(seed, index = 0) {
  return `act_${createHash('sha1').update(`${seed}:${index}`).digest('hex').slice(0, 20)}`;
}

export function canvasLayer() {
  return {
    id: 'canvas',
    name: 'Canvas',
    usage: 'auto',
    type: 'canvas',
    decoration: value('border'),
    showStatusIcons: value('default'),
  };
}

export function boxLayer(color = '#30363d') {
  return {
    id: 'box0',
    name: 'Background',
    usage: 'auto',
    type: 'box',
    enabled: value(true),
    opacity: value(100),
    x: value(0),
    y: value(0),
    width: value(100),
    height: value(100),
    rotation: value(0),
    color: value(hexToInt(color)),
    borderWidth: value(0),
    borderColor: value(0),
    borderPosition: value('inside'),
  };
}

export function textLayer(text, color = '#ffffff', fontsize = 100) {
  return {
    id: 'text0',
    name: 'Text',
    usage: 'auto',
    type: 'text',
    enabled: value(true),
    opacity: value(100),
    x: value(0),
    y: value(0),
    width: value(100),
    height: value(100),
    rotation: value(0),
    text: value(text),
    color: value(hexToInt(color, 0xffffff)),
    halign: value('center'),
    valign: value('center'),
    fontsize: value(fontsize),
    fontsizeAllowShrink: value(true),
    font: value('companion-sans'),
    outlineColor: value(0xff000000),
  };
}

export function emptySteps() {
  return {
    0: {
      action_sets: { down: [], up: [] },
      options: { runWhileHeld: [] },
    },
  };
}

export function action({ connectionId, definitionId, options = {}, seed, index = 0 }) {
  return {
    type: 'action',
    id: actionId(seed, index),
    connectionId,
    definitionId,
    options,
    upgradeIndex: -1,
  };
}

export function classicButton({ text, bgcolor = '#30363d', textColor = '#ffffff', size = '18', actions = [], feedbacks = [], options = {} }) {
  return {
    type: 'button',
    style: {
      text,
      textExpression: false,
      size: String(size),
      png64: null,
      alignment: 'center:center',
      pngalignment: 'center:center',
      color: hexToInt(textColor, 0xffffff),
      bgcolor: hexToInt(bgcolor, 0x30363d),
      show_topbar: false,
    },
    options: {
      stepProgression: 'auto',
      stepExpression: '',
      rotaryActions: false,
      ...options,
    },
    feedbacks,
    steps: {
      0: {
        action_sets: { down: actions, up: [] },
        options: { runWhileHeld: [] },
      },
    },
    localVariables: [],
  };
}

export function layeredButton({ text, bgcolor = '#30363d', textColor = '#ffffff', actions = [], feedbacks = [], fontsize = 100, options = {} }) {
  return {
    type: 'button-layered',
    style: {
      layers: [canvasLayer(), boxLayer(bgcolor), textLayer(text, textColor, fontsize)],
    },
    options: {
      stepProgression: 'auto',
      stepExpression: '',
      rotaryActions: false,
      canModifyStyleInApis: false,
      notes: '',
      ...options,
    },
    feedbacks,
    steps: {
      0: {
        action_sets: { down: actions, up: [] },
        options: { runWhileHeld: [] },
      },
    },
    localVariables: [],
  };
}

export function navControl(type) {
  return { type };
}

export function buildButton({ styleMode, text, bgcolor, textColor, actions, feedbacks, fontsize }) {
  if (styleMode === 'classic') {
    return classicButton({ text, bgcolor, textColor, actions, feedbacks });
  }
  return layeredButton({ text, bgcolor, textColor, actions, feedbacks, fontsize });
}
