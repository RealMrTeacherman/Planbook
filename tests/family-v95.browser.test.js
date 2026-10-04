// Step 4c's gate: v95's own planner, running in Chrome with the invented class, builds its family
// preview; the new builder must give the same Math, Reading and Phonics lines, word for word.
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
const skip = !fs.existsSync(path.join(V95, 'planner', 'index.html')) ? 'v95 not on this machine' : !chrome || !puppeteer ? 'no Chrome here' : false;

// The invented class, with that week made plain: Thursday's math taught, Friday's draft gone.
// (v95 drops a saved-but-untaught day as "skipped"; the new planner counts it as planned.)
function gateFile() {
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v95-sample.json'), 'utf8'));
  const days = JSON.parse(f.keys['lp:days:v2']);
  days['2026-09-17'].entries.math.taught = true;
  delete days['2026-09-18'];
  f.keys['lp:days:v2'] = JSON.stringify(days);
  return f;
}

function sectionsFromHtml(html) {
  const out = {}, re = /<p[^>]*><b>([^<]+)<\/b><\/p><ul>([\s\S]*?)<\/ul>/g;
  let m;
  const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  while ((m = re.exec(html))) out[dec(m[1])] = [...m[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(x => dec(x[1]));
  return out;
}

test('the family email matches v95\'s, line for line (Math, Reading, Phonics)', { skip, timeout: 120000 }, async () => {
  const file = gateFile();
  // ---- v95, in Chrome ----
  const server = await new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = path.join(V95, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(V95) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : /\.css$/.test(p) ? 'text/css' : /\.json$/.test(p) ? 'application/json' : 'text/html' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const theirs = {};
  try {
    // v95's week arrows close its preview (a sheet's late "close" event removes the next sheet), so
    // instead the browser's clock is set to each week and the preview opens on it.
    for (const [day, name] of [['2026-09-14', 'Sep 14'], ['2026-09-21', 'Sep 21']]) {
      const page = await (await browser.createBrowserContext()).newPage();
      await page.evaluateOnNewDocument(fixed => {
        const Real = Date, offset = fixed - Real.now();
        class Fake extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + offset); } static now() { return Real.now() + offset; } }
        window.Date = Fake;
      }, Date.parse(day + 'T10:00:00'));
      await page.setRequestInterception(true);
      page.on('request', r => /^http:\/\/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.abort());
      const base = `http://127.0.0.1:${server.address().port}`;
      await page.goto(base + '/planner/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(keys => { localStorage.clear(); for (const [k, v] of Object.entries(keys)) if (/^lp:/.test(k)) localStorage.setItem(k, v); }, file.keys);
      await page.reload({ waitUntil: 'load' });
      const tap = sel => page.$eval(sel, e => e.click());
      await page.waitForSelector('.tab[data-view="week"]');
      await tap('.tab[data-view="week"]');
      await page.waitForSelector('[data-fam]');
      await tap('[data-fam]');
      await page.waitForSelector('.fam-prev');
      const label = await page.$eval('.fam-nav b', e => e.textContent);
      assert.ok(label.startsWith(name.replace('Sep', 'September')), `v95 shows ${label}`);
      theirs[name] = sectionsFromHtml(await page.$eval('.fam-prev', e => e.innerHTML));
    }
  } finally { await browser.close(); server.close(); }

  // ---- the new builder, on the same file ----
  const P = require(path.join(ROOT, 'core', 'plan.js'));
  const FAM = require(path.join(ROOT, 'core', 'family.js'));
  const imp = require(path.join(ROOT, 'core', 'import-v95.js'));
  const reveal = read('data/reveal-grade2.json');
  P.useCurriculum(JSON.parse(JSON.stringify(reveal)), read('data/benchmark-grade2.json'));
  const out = imp.convert(file, { names: require(path.join(ROOT, 'core', 'names.js')), extraSubjects: read('data/planner-defaults.json').extraSubjects });
  const D = FAM.collect(out.records, reveal, read('data/family-email.json'));
  for (const [week, mon] of [['Sep 14', '2026-09-14'], ['Sep 21', '2026-09-21']]) {
    const mine = sectionsFromHtml(FAM.html(FAM.build(D, mon)));
    const pick = s => Object.fromEntries(Object.entries(s).filter(([h]) => /^(Math|Reading|Phonics)/.test(h)));
    assert.ok(Object.keys(pick(theirs[week])).length >= 3, `v95 built ${week}: ${JSON.stringify(theirs[week])}`);
    assert.deepEqual(pick(mine), pick(theirs[week]), week);
  }
});
