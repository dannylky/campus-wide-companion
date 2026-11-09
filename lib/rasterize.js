import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

export function findBrowser() {
  return BROWSERS.find((candidate) => fsSync.existsSync(candidate)) || null;
}

export async function rasterizeHtml({ html, width, height, name, root }) {
  const browser = findBrowser();
  if (!browser) throw new Error('No headless browser found (Edge or Chrome)');

  const hash = createHash('sha1').update(`${name}:${width}x${height}:${html.length}`).digest('hex').slice(0, 12);
  const dir = path.join(root, 'out', 'render');
  await fs.mkdir(dir, { recursive: true });
  const htmlPath = path.join(dir, `${hash}.html`);
  const pngPath = path.join(dir, `${hash}.png`);
  const profileDir = path.join(dir, `profile-${hash}`);

  await fs.writeFile(htmlPath, html, 'utf8');
  try {
    await execFileAsync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--default-background-color=00000000',
        `--window-size=${width},${height}`,
        `--screenshot=${pngPath}`,
        `--user-data-dir=${profileDir}`,
        pathToFileURL(htmlPath).href,
      ],
      { windowsHide: true, timeout: 30000 },
    );
    return await fs.readFile(pngPath);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function pngDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}
