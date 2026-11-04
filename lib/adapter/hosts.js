import { CompanionAdapter } from './companion.js';

const DEFAULT_HOSTS = [{ id: 'synthetic', name: 'Synthetic campus', baseUrl: '', kind: 'synthetic' }];

export function loadHosts(env = process.env) {
  const raw = String(env.COMPANION_HOSTS || '').trim();
  if (!raw) return DEFAULT_HOSTS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_HOSTS;
    return parsed
      .filter((host) => host && host.id)
      .map((host) => ({
        id: String(host.id),
        name: String(host.name || host.id),
        baseUrl: String(host.baseUrl || '').replace(/\/+$/, ''),
        kind: host.kind || (host.baseUrl ? 'live' : 'synthetic'),
      }));
  } catch (error) {
    throw new Error(`COMPANION_HOSTS is not valid JSON: ${error.message}`);
  }
}

export function getHost(hosts, id) {
  return hosts.find((host) => host.id === id) || hosts[0];
}

export function createAdapter(host, options = {}) {
  return new CompanionAdapter({
    baseUrl: host.baseUrl,
    timeoutMs: Number(options.timeoutMs || process.env.COMPANION_TIMEOUT_MS || 8000),
  });
}
