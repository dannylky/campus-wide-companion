import { createHash } from 'node:crypto';

export function wsUrl(baseUrl) {
  return `${String(baseUrl).replace(/^http/, 'ws').replace(/\/+$/, '')}/trpc`;
}

export function connect(url) {
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

export function call(ws, method, procedure, input) {
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

export async function importPage({ baseUrl, sourcePage, targetPage, config, name }) {
  const bytes = Buffer.from(JSON.stringify(config), 'utf8');
  const checksum = createHash('sha1').update(bytes).digest('hex');
  const ws = await connect(wsUrl(baseUrl));
  try {
    const sessionId = await call(ws, 'mutation', 'importExport.prepareImport.start', {
      name: name || 'page.companionconfig',
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
      sourcePage,
      targetPage,
      connectionIdRemapping: {},
    });
    return { bytes: bytes.length, checksum, remap, snapshotPages: Object.keys(snapshot.pages || {}) };
  } finally {
    ws.close();
  }
}
