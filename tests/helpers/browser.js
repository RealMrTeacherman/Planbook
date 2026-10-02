// Shared by the real-browser tests: finds Chrome, serves the project, opens pages.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..', '..');

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  return [
    '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome'
  ].find(p => fs.existsSync(p));
}
function loadPuppeteer() {
  for (const t of [process.env.PUPPETEER, 'puppeteer-core'].filter(Boolean)) { try { return require(t); } catch (e) { } }
  return null;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
// Served under /Planbook/, like GitHub Pages, so relative paths are tested as they really run.
function serve() {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x').pathname;
      if (!u.startsWith('/Planbook/')) { res.writeHead(404); return res.end(); }
      let p = path.join(ROOT, decodeURIComponent(u.slice('/Planbook'.length)));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

// A page that never waits on Google Fonts, and collects real errors.
async function newPage(context, { width = 390, iphone = false } = {}) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) page.errors.push(m.text()); });
  if (iphone) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    // An iPhone has no folder picker, and has a share sheet. The share sheet here records what it was given.
    await page.evaluateOnNewDocument(() => {
      delete window.showDirectoryPicker;
      window.__shared = [];
      navigator.canShare = d => !!(d && d.files && d.files.length);
      navigator.share = async d => { const f = d.files[0]; window.__shared.push({ name: f.name, text: await f.text() }); };
    });
  }
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  return page;
}

module.exports = { ROOT, findChrome, loadPuppeteer, serve, newPage };
