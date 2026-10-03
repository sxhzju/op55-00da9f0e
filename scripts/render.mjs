// Frame-accurate renderer: headless Chrome draws each frame from its frame number,
// PNGs stream into FFmpeg in order.
//
//   node scripts/render.mjs                 -> op55-hd.mp4 (full film)
//   node scripts/render.mjs --stills 1,2.5  -> out/stills/*.png (single moments, seconds)
//   node scripts/render.mjs --frames 60-90  -> out/frames/*.png (a frame range)
//   options: --workers 4  --out file.mp4
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const workers = parseInt(opt('workers', String(Math.max(1, Math.min(6, os.cpus().length - 2)))), 10);

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  const hit = cands.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('Chrome not found: set CHROME_PATH to a Chrome/Chromium binary');
  return hit;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(root, 'src', decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(path.join(root, 'src')) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

async function openPages(browser, port, n) {
  const pages = [];
  for (let i = 0; i < n; i++) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.waitForFunction('window.ready === true', { timeout: 60000 });
    pages.push(page);
  }
  return pages;
}

const grab = async (page, n) => {
  const { K, url } = await page.evaluate((f) => window.frameDataURL(f), n);
  return { K, png: Buffer.from(url.slice(url.indexOf(',') + 1), 'base64') };
};

async function main() {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--disable-gpu', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    protocolTimeout: 600000,
  });
  try {
    const stills = opt('stills');
    const range = opt('frames');
    if (stills || range) {
      const dir = path.join(root, 'out', stills ? 'stills' : 'frames');
      fs.mkdirSync(dir, { recursive: true });
      let list;
      if (stills) list = stills.split(',').map((s) => Math.round(parseFloat(s) * 30));
      else { const [a, b, st] = range.split(/[-:]/).map(Number); list = []; for (let f = a; f <= b; f += st || 1) list.push(f); }
      const pages = await openPages(browser, port, Math.min(workers, list.length));
      let next = 0;
      await Promise.all(pages.map(async (page) => {
        while (next < list.length) {
          const f = list[next++];
          const { png } = await grab(page, f);
          fs.writeFileSync(path.join(dir, `f${String(f).padStart(4, '0')}.png`), png);
        }
      }));
      console.log(`wrote ${list.length} images to ${path.relative(root, dir)}`);
      return;
    }
    const outFile = path.resolve(root, opt('out', 'op55-hd.mp4'));
    const pages = await openPages(browser, port, workers);
    const FR = await pages[0].evaluate(() => window.FRAMES);
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-tune', 'film', '-pix_fmt', 'yuv420p',
      '-r', '30', '-an', '-movflags', '+faststart', outFile,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, bad) => ff.on('close', (c) => (c === 0 ? ok() : bad(new Error(`ffmpeg exited ${c}`)))));
    const buf = new Map();
    let written = 0, next = 0;
    const t0 = Date.now();
    const flush = async () => {
      while (buf.has(written)) {
        const png = buf.get(written);
        buf.delete(written);
        if (!ff.stdin.write(png)) await new Promise((ok) => ff.stdin.once('drain', ok));
        written++;
      }
    };
    await Promise.all(pages.map(async (page) => {
      while (next < FR) {
        const f = next++;
        const { K, png } = await grab(page, f);
        buf.set(f, png);
        await flush();
        if (f % 15 === 0) process.stdout.write(`frame ${f}/${FR} (K=${K}) ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
      }
    }));
    await flush();
    ff.stdin.end();
    await done;
    console.log(`wrote ${path.relative(root, outFile)} (${FR} frames) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
