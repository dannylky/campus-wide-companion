import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = path.join(ROOT, 'config', 'public');
const DOC_DIRS = [path.join(ROOT, 'docs', 'kb'), path.join(ROOT, 'docs', 'study')];

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were', 'with', 'this', 'these', 'those', 'what',
  'how', 'why', 'when', 'where', 'which', 'who', 'do', 'does', 'can', 'should', 'would', 'could',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/g)
    .map((token) => token.replace(/^\.+|\.+$/g, ''))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function listMarkdown(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isDirectory()) files.push(...(await listMarkdown(path.join(dir, entry.name))));
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path.join(dir, entry.name));
    }
    return files;
  } catch {
    return [];
  }
}

function roomDoc(room) {
  const devices = [];
  for (const projector of room.devices?.projectors || []) devices.push(`${projector.label} (${projector.module})`);
  for (const role of ['vs', 'amp', 'pcu', 'controller', 'switch']) {
    const device = room.devices?.[role];
    if (device) devices.push(`${role.toUpperCase()} ${device.label} (${device.module} ${device.host}:${device.port})`);
  }
  return {
    id: `room:${room.id}`,
    type: 'room',
    title: `Room ${room.name}`,
    tags: [room.id, room.roomType, room.lifecycle, ...room.notes],
    body: [
      `Room ${room.name} is in ${room.group} (page ${room.page}).`,
      `Lifecycle: ${room.lifecycle}. Room type: ${room.roomType}.`,
      devices.length ? `Devices: ${devices.join('; ')}.` : 'No devices mapped.',
      room.variables?.state ? `State variable: ${room.variables.state}.` : '',
      room.variables?.pcu ? `PCU variable: ${room.variables.pcu}.` : '',
      ...(room.notes || []),
    ].filter(Boolean).join(' '),
  };
}

function moduleDoc(module) {
  return {
    id: `module:${module.id}`,
    type: 'module',
    title: `${module.name} (${module.id})`,
    tags: [module.id, module.category, module.protocol],
    body: [
      `${module.name} is a ${module.category} connection using ${module.protocol}.`,
      `Configuration: ${(module.config || []).map((field) => `${field.key} (${field.type}${field.required ? ', required' : ''})`).join(', ') || 'none'}.`,
      `Actions: ${(module.actions || []).map((action) => action.label).join(', ') || 'none'}.`,
      `Feedbacks: ${(module.feedbacks || []).map((feedback) => feedback.label).join(', ') || 'none'}.`,
      `Variables: ${(module.variables || []).map((variable) => variable.label).join(', ') || 'none'}.`,
      module.notes || '',
    ].filter(Boolean).join(' '),
  };
}

function archetypeDoc(archetype) {
  return {
    id: `archetype:${archetype.id}`,
    type: 'archetype',
    title: `Archetype ${archetype.label}`,
    tags: [archetype.id, ...(archetype.roles || [])],
    body: [
      `${archetype.label} uses roles: ${(archetype.roles || []).join(', ') || 'none'}.`,
      `Buttons: ${(archetype.buttons || []).map((button) => button.label).join(', ') || 'none'}.`,
    ].join(' '),
  };
}

export class KnowledgeBase {
  constructor(documents = []) {
    this.documents = documents;
    this.byId = new Map(documents.map((doc) => [doc.id, doc]));
    this.modules = new Map();
    this.archetypes = new Map();
    this.rooms = new Map();
    this._tokens = new Map();
  }

  static async load(options = {}) {
    const campus = await readJson(options.campus || path.join(CONFIG, 'campus.json'));
    const modules = await readJson(options.modules || path.join(CONFIG, 'modules.json'));
    const archetypes = await readJson(options.archetypes || path.join(CONFIG, 'archetypes.json'));

    const docs = [];
    for (const room of campus.spaces || []) docs.push(roomDoc(room));
    for (const module of modules.modules || []) docs.push(moduleDoc(module));
    for (const archetype of archetypes.archetypes || []) docs.push(archetypeDoc(archetype));

    for (const dir of DOC_DIRS) {
      for (const file of await listMarkdown(dir)) {
        const body = await fs.readFile(file, 'utf8');
        const relative = path.relative(ROOT, file).replace(/\\/g, '/');
        const title = (body.match(/^#\s+(.+)$/m) || [])[1] || path.basename(file, '.md');
        docs.push({
          id: `doc:${relative}`,
          type: 'doc',
          title,
          tags: [relative],
          body,
          source: relative,
        });
      }
    }

    const kb = new KnowledgeBase(docs);
    kb.campus = campus;
    kb.moduleCatalog = modules.modules || [];
    kb.archetypeCatalog = archetypes.archetypes || [];
    for (const module of kb.moduleCatalog) kb.modules.set(module.id, module);
    for (const archetype of kb.archetypeCatalog) kb.archetypes.set(archetype.id, archetype);
    for (const room of campus.spaces || []) kb.rooms.set(room.id, room);
    return kb;
  }

  tokensFor(doc) {
    if (!this._tokens.has(doc.id)) {
      this._tokens.set(doc.id, {
        title: tokenize(doc.title),
        tags: tokenize((doc.tags || []).join(' ')),
        body: tokenize(doc.body),
      });
    }
    return this._tokens.get(doc.id);
  }

  search(query, limit = 8) {
    const terms = tokenize(query);
    if (!terms.length) return [];
    const phrase = String(query || '').toLowerCase().trim();
    const results = [];

    for (const doc of this.documents) {
      const tokens = this.tokensFor(doc);
      let score = 0;
      for (const term of terms) {
        const titleHits = tokens.title.filter((token) => token === term).length;
        const tagHits = tokens.tags.filter((token) => token === term).length;
        const bodyHits = tokens.body.filter((token) => token === term).length;
        if (titleHits) score += titleHits * 6;
        if (tagHits) score += tagHits * 3;
        if (bodyHits) score += Math.min(bodyHits, 5);
      }
      if (phrase && doc.body.toLowerCase().includes(phrase)) score += 4;
      if (score > 0) results.push({ doc, score });
    }

    results.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return results.slice(0, limit).map(({ doc, score }) => ({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      tags: doc.tags || [],
      score,
      snippet: snippet(doc.body, terms),
      source: doc.source || null,
    }));
  }

  context(query, limit = 5) {
    return this.search(query, limit)
      .map((result, index) => `[${index + 1}] ${result.title}\n${result.snippet}`)
      .join('\n\n');
  }

  getModule(id) {
    return this.modules.get(id) || null;
  }

  getArchetype(id) {
    return this.archetypes.get(id) || null;
  }

  getRoom(id) {
    return this.rooms.get(id) || null;
  }

  stats() {
    const types = {};
    for (const doc of this.documents) types[doc.type] = (types[doc.type] || 0) + 1;
    return {
      documents: this.documents.length,
      types,
      modules: this.moduleCatalog.length,
      archetypes: this.archetypeCatalog.length,
      rooms: this.rooms.size,
    };
  }
}

function snippet(body, terms) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  let index = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, start + 260);
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}
