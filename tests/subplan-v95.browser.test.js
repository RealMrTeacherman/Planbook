// Step 5's gate: v95's own sub-plan panel, running in Chrome with the invented class, prints
// the full plan and the one-pager; the new builder, on the same file, must give the same HTML.
// Needs the v95 suite on this machine (skipped elsewhere, e.g. on GitHub).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { findChrome, loadPuppeteer } = require('./helpers/browser');

const V95 = process.env.V95_DIR || '/home/claude/v95/classroom-suite';
const ROOT = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !fs.existsSync(path.join(V95, 'sub-plans.js')) ? 'v95 not on this machine' : !chrome || !puppeteer ? 'no Chrome here' : false;

// v95 shows its group tables only when its Small Groups code has loaded; leave them out of the comparison.
const noGroups = h => h.replace(/<h2>Math Groups<\/h2>[\s\S]*?(?=<h2>|<div class="two"|$)/, '');
// The browser writes &middot; and the like back out as the characters themselves; compare them as characters.
const ENT = { middot: '\u00b7', mdash: '\u2014', ndash: '\u2013', nbsp: '\u00a0', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d' };
const tidy = h => noGroups(h).replace(/&(middot|mdash|ndash|nbsp|rsquo|lsquo|ldquo|rdquo);/g, (m, n) => ENT[n]).replace(/\s+/g, ' ').trim();

test('both sub plan printouts match v95\'s, block for block', { skip, timeout: 120000 }, async () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v95-sample.json'), 'utf8'));
  const server = await new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = path.join(V95, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(V95) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : /\.css$/.test(p) ? 'text/css' : 'text/html' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const theirs = {};
  let stored = null;
  const DAYS = ['2026-09-14', '2026-09-15'];
  try {
    for (const day of DAYS) {
      const page = await (await browser.createBrowserContext()).newPage();
      await page.evaluateOnNewDocument(fixed => {
        const Real = Date, offset = fixed - Real.now();
        class Fake extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + offset); } static now() { return Real.now() + offset; } }
        window.Date = Fake;
        window.print = () => {};
      }, Date.parse(day + 'T10:00:00'));
      await page.setRequestInterception(true);
      page.on('request', r => /^http:\/\/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.abort());
      const base = `http://127.0.0.1:${server.address().port}`;
      await page.goto(base + '/planner/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(keys => { localStorage.clear(); for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); }, file.keys);
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#subbtn');
      // What v95 stores once it has loaded (its own upgrades run on load): the state a real export carries.
      if (!stored) stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
      await page.$eval('#subbtn', e => e.click());
      theirs[day] = {};
      for (const kind of ['full', 'glance']) {
        await page.waitForSelector(`[data-act="${kind}"]`);
        await page.$eval(`[data-act="${kind}"]`, e => e.click());
        await page.waitForFunction(() => { const b = document.getElementById('subprint'); return b && b.innerHTML.length > 200; });
        theirs[day][kind] = await page.$eval('#subprint', e => e.innerHTML);
        await page.$eval('#subprint', e => { e.innerHTML = ''; });
        if (kind === 'full' && !(await page.$('[data-act="glance"]'))) await page.$eval('#subbtn', e => e.click());
      }
    }
  } finally { await browser.close(); server.close(); }

  const P = require(path.join(ROOT, 'core', 'plan.js'));
  P.useCurriculum(JSON.parse(JSON.stringify(read('data/reveal-grade2.json'))), read('data/benchmark-grade2.json'));
  const imp = require(path.join(ROOT, 'core', 'import-v95.js'));
  const out = imp.convert(Object.assign({}, file, { keys: Object.assign({}, file.keys, stored) }), { names: require(path.join(ROOT, 'core', 'names.js')), extraSubjects: read('data/planner-defaults.json').extraSubjects });
  const SP = require(path.join(ROOT, 'core', 'subplan.js')).make(out.records);
  for (const day of DAYS) {
    assert.match(theirs[day].full, /The day, block by block/, `v95 printed ${day}`);
    for (const kind of ['full', 'glance']) {
      const mine = tidy(SP[kind](day)), v95 = tidy(theirs[day][kind]);
      let i = 0; while (i < mine.length && mine[i] === v95[i]) i++;
      assert.ok(mine === v95, `${kind}, ${day}: first difference at ${i}\n  new: …${mine.slice(Math.max(0, i - 120), i + 160)}\n  v95: …${v95.slice(Math.max(0, i - 120), i + 160)}`);
    }
  }
});
