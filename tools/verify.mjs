#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', 'config/private', 'out', 'logs', 'backups', '.env']);

const RULES = [
  { name: 'private 10/8 address', pattern: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'private 172.16/12 address', pattern: /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'private 192.168/16 address', pattern: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'API key', pattern: /\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g },
  { name: 'private key', pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/g },
];

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(ROOT, full).replace(/\\/g, '/');
    if (SKIP.has(relative) || SKIP.has(entry.name)) continue;
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const findings = [];
for await (const file of walk(ROOT)) {
  if (/\.(png|jpg|jpeg|gif|webp|ico|zip|tgz|woff2?)$/i.test(file)) continue;
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      findings.push({ file: path.relative(ROOT, file), line, rule: rule.name, value: match[0] });
    }
  }
}

if (!findings.length) {
  console.log('Leak check: clean');
  process.exit(0);
}

console.error(`Leak check: ${findings.length} finding(s)`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  ${finding.rule}  ${finding.value}`);
}
process.exit(1);
