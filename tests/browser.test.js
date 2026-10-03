// Real-browser tests: the import page and the store, in Chrome, with real IndexedDB.
// Set CHROME to a Chrome binary and PUPPETEER to puppeteer-core's path if they are not found.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SAMPLE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'suite-screens');

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const tries = [
    '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  return tries.find(p => fs.existsSync(p));
}
function loadPuppeteer() {
  const tries = [process.env.PUPPETEER, 'puppeteer-core',
    path.join(os.homedir(), '.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core')].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { } }
  return null;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function serve() {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !chrome || !puppeteer ? 'no Chrome or puppeteer-core here' : false;

test('the import page and the store, in a real browser', { skip, timeout: 120000 }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // Fonts come from Google; the test machine may not reach them, and the page must not wait for them.
  await page.setRequestInterception(true);
  page.on('request', r => /fonts\.(googleapis|gstatic)/.test(r.url()) ? r.abort() : r.continue());

  const open = async (width) => {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.goto(base + '/import/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true', { timeout: 10000 });
  };
  const text = sel => page.$eval(sel, e => e.innerText);
  const visible = sel => page.$eval(sel, e => !e.hidden);
  const choose = async (file) => { const input = await page.$('#file'); await input.uploadFile(file); await page.waitForFunction("!document.getElementById('preview').hidden || !document.getElementById('problem').hidden"); };
  const counts = () => page.evaluate(async () => {
    const c = await (await fetch('../contract/contract.json')).json();
    const s = await SuiteStore.open({ contract: c }); const n = await s.counts(); s.close(); return n;
  });

  try {
    await t.test('an empty device says so, at phone width', async () => {
      await open(390);
      assert.match(await text('#nowBody'), /Nothing yet/);
      await page.screenshot({ path: path.join(SHOTS, '1-empty-phone.png'), fullPage: true });
    });

    await t.test('choosing the file shows what it holds before anything is written', async () => {
      await choose(SAMPLE);
      assert.equal(await visible('#preview'), true);
      const coming = await text('#coming');
      assert.match(coming, /Students\s+5/);
      assert.match(coming, /ORF checks\s+4/);
      assert.match(await text('#held'), /48 WCPM/);
      assert.deepEqual(await counts(), {});
      await page.screenshot({ path: path.join(SHOTS, '2-preview-phone.png'), fullPage: true });
    });

    await t.test('loading writes every record', async () => {
      await page.click('#load');
      await page.waitForFunction("!document.getElementById('result').hidden");
      assert.match(await text('#resultText'), /160 new, 0 changed, 0 already here/);
      assert.deepEqual(await counts(), {
        student: 5, schoolYear: 1, gradingPeriod: 4, schoolDay: 1, orfCheck: 4, orfGoal: 2,
        station: 4, group: 8, placement: 6, visitor: 1, unit: 2,
        subject: 6, block: 94, dayPlan: 5, lessonPlan: 12, blockNote: 2, privateNote: 3
      });
      assert.equal(await visible('#undoBox'), true);
      await page.screenshot({ path: path.join(SHOTS, '3-loaded-phone.png'), fullPage: true });
    });

    await t.test('the kept v95 data is all there', async () => {
      const keys = await page.evaluate(async () => {
        const c = await (await fetch('../contract/contract.json')).json();
        const s = await SuiteStore.open({ contract: c }); const k = await s.v95Keys(); s.close(); return k;
      });
      const want = Object.keys(JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).keys).sort();
      assert.deepEqual(keys.sort(), want);
    });

    await t.test('loading the same file again changes nothing, and the first load stays undoable', async () => {
      const undoBefore = await text('#undoText');
      await choose(SAMPLE);
      await page.click('#load');
      await page.waitForFunction("!document.getElementById('result').hidden");
      assert.match(await text('#resultText'), /already here, so nothing changed/);
      assert.equal(await text('#undoText'), undoBefore);
    });

    await t.test('an older v95 file is refused', async () => {
      const older = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
      older.updatedAt = '2026-09-30T12:00:00.000Z';
      const p = path.join(os.tmpdir(), 'v95-older.json');
      fs.writeFileSync(p, JSON.stringify(older));
      await choose(p);
      assert.equal(await visible('#problem'), true);
      assert.match(await text('#problemText'), /before the v95 file already loaded/);
      assert.equal(await visible('#preview'), false);
    });

    await t.test('a file that is not a sync file is refused with directions', async () => {
      const p = path.join(os.tmpdir(), 'not-sync.json');
      fs.writeFileSync(p, '{"hello": 1}');
      await choose(p);
      assert.match(await text('#problemText'), /Save a sync file/);
    });

    await t.test('a write that breaks the contract writes nothing', async () => {
      const r = await page.evaluate(async () => {
        const c = await (await fetch('../contract/contract.json')).json();
        const s = await SuiteStore.open({ contract: c });
        const before = (await s.all()).length;
        let msg = '';
        try { await s.write([{ id: 'orf_broken1', type: 'orfCheck', deletedAt: null, studentId: 'stu_nobody01', date: '2026-10-01', passageTitle: 'X', seconds: 60, passes: 1, wordsRead: 10, errors: 0, selfCorrections: 0, wcpm: 10 }]); }
        catch (e) { msg = e.message + ' ' + (e.details || []).join(' '); }
        const after = (await s.all()).length; s.close();
        return { before, after, msg };
      });
      assert.equal(r.after, r.before);
      assert.match(r.msg, /Nothing was loaded.*not in the file/);
    });

    await t.test('undo puts the device back exactly as before the load', async () => {
      await open(1280);
      await page.screenshot({ path: path.join(SHOTS, '4-loaded-desktop.png'), fullPage: true });
      const order = (await text('#nowBody')).split('\n').filter(l => /\t/.test(l)).map(l => l.split('\t')[0]);
      assert.deepEqual(order.slice(0, 3), ['Students', 'School year', 'Days off'], 'device list follows the preview order');
      await page.click('#undo');
      await page.waitForFunction("document.getElementById('undoBox').hidden");
      assert.deepEqual(await counts(), {});
      assert.match(await text('#nowBody'), /Nothing yet/);
      const kept = await page.evaluate(async () => {
        const c = await (await fetch('../contract/contract.json')).json();
        const s = await SuiteStore.open({ contract: c }); const k = await s.v95Keys(); const last = await s.meta.get('lastV95At'); s.close(); return { k, last };
      });
      assert.deepEqual(kept.k, []);
      assert.equal(kept.last, undefined);
    });

    await t.test('a schema upgrade runs once, in order, and is checked against the contract', async () => {
      const r = await page.evaluate(async () => {
        const c1 = await (await fetch('../contract/contract.json')).json();
        const name = 'upgrade-test';
        indexedDB.deleteDatabase(name);
        let s = await SuiteStore.open({ contract: c1, name });
        await s.write([{ id: 'stu_up1234', type: 'student', deletedAt: null, firstName: ' Ana ', active: true, eld: false }]);
        s.close();
        const next = c1.version + 1;
        const c2 = Object.assign({}, c1, { version: next });
        let runs = 0;
        const upgrades = { [next]: recs => { runs++; return recs.map(x => x.type === 'student' ? Object.assign({}, x, { firstName: x.firstName.trim() }) : x); } };
        s = await SuiteStore.open({ contract: c2, name, upgrades });
        const after = (await s.all())[0].firstName, v = await s.meta.get('schemaVersion'); s.close();
        s = await SuiteStore.open({ contract: c2, name, upgrades }); s.close();
        let refused = '';
        try { await SuiteStore.open({ contract: c1, name }); } catch (e) { refused = e.message; }
        const bad = 'upgrade-bad'; indexedDB.deleteDatabase(bad);
        s = await SuiteStore.open({ contract: c1, name: bad });
        await s.write([{ id: 'stu_up5678', type: 'student', deletedAt: null, firstName: 'Ana', active: true, eld: false }]); s.close();
        let badMsg = '';
        try { await SuiteStore.open({ contract: c2, name: bad, upgrades: { [next]: recs => recs.map(x => Object.assign({}, x, { surprise: 1 })) } }); } catch (e) { badMsg = e.message; }
        s = await SuiteStore.open({ contract: c1, name: bad }); const stillV1 = await s.meta.get('schemaVersion'); s.close();
        return { after, v, runs, refused, badMsg, stillV1, next, cur: c1.version };
      });
      assert.equal(r.after, 'Ana');
      assert.equal(r.v, r.next);
      assert.equal(r.runs, 1);
      assert.match(r.refused, /newer version/);
      assert.match(r.badMsg, /bad data/);
      assert.equal(r.stillV1, r.cur);
    });

    await t.test('an edit on this device beats the older v95 copy, and is stamped with this device', async () => {
      await choose(SAMPLE);
      await page.click('#load');
      await page.waitForFunction("!document.getElementById('result').hidden");
      const r = await page.evaluate(async () => {
        const c = await (await fetch('../contract/contract.json')).json();
        const s = await SuiteStore.open({ contract: c });
        const mila = (await s.all()).find(x => x.id === 'stu_k3j9x2a');
        await s.write([Object.assign({}, mila, { firstName: 'Milagros' })]);
        const now = (await s.all()).find(x => x.id === 'stu_k3j9x2a');
        s.close();
        return { name: now.firstName, device: now.device, dev: s.device };
      });
      assert.equal(r.name, 'Milagros');
      assert.equal(r.device, r.dev);
      assert.match(r.dev, /^dev-/);
    });

    await t.test('no page errors', () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    server.close();
  }
});
