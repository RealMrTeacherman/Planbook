// Step 2's gate, in real Chrome: a MacBook and an iPhone (two separate browser profiles,
// so two separate stores) edit offline, swap files in either order, and end identical.
// The Drive folder is a real folder in the MacBook profile's private file system.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findChrome, loadPuppeteer, serve, newPage } = require('./helpers/browser');

const SAMPLE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'suite-screens');
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !chrome || !puppeteer ? 'no Chrome or puppeteer-core here' : false;

test('MacBook and iPhone stay in step through the Drive folder', { skip, timeout: 180000 }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/Planbook`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const macCtx = await browser.createBrowserContext();
  const phoneCtx = await browser.createBrowserContext();
  const mac = await newPage(macCtx, { width: 1280 });
  const phone = await newPage(phoneCtx, { width: 390, iphone: true });

  const go = async (page, where) => {
    await page.goto(`${base}/${where}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true', { timeout: 15000 });
  };
  const importSample = async (page) => {
    await go(page, 'import');
    await (await page.$('#file')).uploadFile(SAMPLE);
    await page.waitForFunction("!document.getElementById('preview').hidden");
    await page.click('#load');
    await page.waitForFunction("!document.getElementById('result').hidden");
  };
  const records = page => page.evaluate(async () => (await window.__store.all()).sort((a, b) => a.id < b.id ? -1 : 1));
  const groupName = (page, id) => page.evaluate(async id => (await window.__store.all()).find(r => r.id === id).name, id);
  const rename = async (page, id, name) => {
    // Wait until the list on screen matches the data, as a person would see it before tapping.
    await page.waitForFunction(async () => {
      const gs = (await window.__store.all()).filter(r => r.type === 'group' && r.kind === 'math' && !r.deletedAt).sort((a, b) => a.order - b.order);
      return document.getElementById('groups').dataset.sig === JSON.stringify(gs.map(g => [g.id, g.name, g.order]));
    }, { timeout: 5000 });
    // Typed like a person: tap the box, clear it, type, tap Save.
    await page.click(`input[data-id="${id}"]`, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(`input[data-id="${id}"]`, name);
    await page.click(`button[data-save="${id}"]`);
    await page.waitForFunction(n => document.getElementById('resultText').textContent.includes(n), {}, name);
  };
  // The folder: a real directory, handed to the MacBook as if picked.
  const useFolder = page => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('drive', { create: true });
    await window.__t.useFolder(dir);
  });
  const folderFiles = page => page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('drive');
    const out = {};
    for await (const [n, e] of dir.entries()) if (e.kind === 'file') out[n] = await (await e.getFile()).text();
    return out;
  });
  const dropIntoFolder = (page, name, text) => page.evaluate(async (name, text) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('drive');
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(text); await w.close();
  }, name, text);
  // The phone sends: its share sheet hands the file over, as Save to Drive would.
  const phoneSends = async () => {
    const before = await phone.evaluate(() => window.__shared.length);
    await phone.click('#send');
    await phone.waitForFunction(n => window.__shared.length > n, {}, before);
    return phone.evaluate(() => window.__shared[window.__shared.length - 1]);
  };
  const phoneLoadsHub = async () => {
    const hub = (await folderFiles(mac))['classroom-suite.json'];
    const p = path.join(os.tmpdir(), 'classroom-suite.json');
    fs.writeFileSync(p, hub);
    await phone.$eval('#result', e => { e.hidden = true; });
    await phone.$eval('#problem', e => { e.hidden = true; });
    await (await phone.$('#file')).uploadFile(p);
    await phone.waitForFunction("!document.getElementById('result').hidden || !document.getElementById('problem').hidden");
    return phone.$eval('#resultText', e => e.textContent);
  };

  try {
    await t.test('both devices start from the same v95 data', async () => {
      await importSample(mac); await importSample(phone);
      await go(mac, 'sync'); await go(phone, 'sync');
      assert.deepEqual(await records(mac), await records(phone));
    });

    await t.test('the MacBook watches the folder and saves its copy there; the iPhone gets Send instead', async () => {
      await useFolder(mac);
      const files = await folderFiles(mac);
      assert.ok(files['classroom-suite.json']);
      assert.equal(JSON.parse(files['classroom-suite.json']).records.length, (await records(mac)).length);
      assert.equal(await mac.$eval('#sendBox', e => e.hidden), true);
      assert.equal(await mac.$eval('#folderWatching', e => e.hidden), false);
      assert.equal(await phone.$eval('#sendBox', e => e.hidden), false);
      assert.equal(await phone.$eval('#folderBox', e => e.hidden), true);
      assert.match(await phone.$eval('#status', e => e.innerText), /iPhone/);
    });

    await t.test('order 1: both edit offline, the iPhone sends, then loads the MacBook copy', async () => {
      await mac.setOfflineMode(true); await phone.setOfflineMode(true);
      await rename(mac, 'grp_math_fox', 'Foxes');
      await rename(phone, 'grp_math_bear', 'Bears');
      await phone.waitForFunction(() => /Not sent yet/.test(document.getElementById('status').innerText), { timeout: 5000 });
      await phone.screenshot({ path: path.join(SHOTS, '5-sync-phone.png'), fullPage: true });
      const sent = await phoneSends();
      assert.match(sent.name, /^suite-from-iphone-[a-z0-9]{4}\.json$/);
      await phone.waitForFunction(() => !/Not sent yet/.test(document.getElementById('status').innerText), { timeout: 5000 });

      await dropIntoFolder(mac, sent.name, sent.text);
      const scan = await mac.evaluate(() => window.__t.scanNow());
      assert.deepEqual(scan.merged, [sent.name]);
      const files = await folderFiles(mac);
      assert.equal(files[sent.name], undefined, 'the sent file is removed once merged');
      assert.match(files['classroom-suite.json'], /"Bears"/);
      assert.match(files['classroom-suite.json'], /"Foxes"/);

      assert.match(await phoneLoadsHub(), /1 changed/);
      assert.equal(await groupName(phone, 'grp_math_fox'), 'Foxes');
      assert.equal(await groupName(mac, 'grp_math_bear'), 'Bears');
      assert.deepEqual(await records(mac), await records(phone));
    });

    await t.test('order 2: the iPhone loads first, then both edit, then the iPhone sends and loads', async () => {
      await rename(mac, 'grp_math_lion', 'Lions');
      await new Promise(r => setTimeout(r, 2500));   // the MacBook rewrites its copy after a change
      assert.match((await folderFiles(mac))['classroom-suite.json'], /"Lions"/);
      await phoneLoadsHub();
      await rename(phone, 'grp_math_tiger', 'Tigers');
      await rename(mac, 'grp_math_fox', 'Fox Den');
      const sent = await phoneSends();
      await dropIntoFolder(mac, sent.name, sent.text);
      await mac.evaluate(() => window.__t.scanNow());
      await phoneLoadsHub();
      assert.deepEqual(await records(mac), await records(phone));
      const names = await phone.evaluate(async () => (await window.__store.all()).filter(r => r.type === 'group' && r.kind === 'math').map(r => r.name).sort());
      assert.deepEqual(names, ['Bears', 'Fox Den', 'Lions', 'Tigers']);
    });

    await t.test('both rename the same group: the later rename wins on both devices', async () => {
      await rename(phone, 'grp_math_bear', 'Bear Cubs');
      await new Promise(r => setTimeout(r, 20));
      await rename(mac, 'grp_math_bear', 'Grizzlies');
      const sent = await phoneSends();
      await dropIntoFolder(mac, sent.name, sent.text);
      await mac.evaluate(() => window.__t.scanNow());
      await phoneLoadsHub();
      assert.equal(await groupName(mac, 'grp_math_bear'), 'Grizzlies');
      assert.equal(await groupName(phone, 'grp_math_bear'), 'Grizzlies');
      assert.deepEqual(await records(mac), await records(phone));
    });

    await t.test('Drive\'s "(1)" names and .txt files are picked up', async () => {
      await rename(phone, 'grp_math_lion', 'Lion Pride');
      const sent = await phoneSends();
      await dropIntoFolder(mac, sent.name.replace('.json', ' (1).txt'), sent.text);
      const scan = await mac.evaluate(() => window.__t.scanNow());
      assert.equal(scan.merged.length, 1);
      assert.equal(await groupName(mac, 'grp_math_lion'), 'Lion Pride');
    });

    await t.test('a name being typed survives the MacBook\'s background check', async () => {
      await mac.waitForFunction(async () => {   // the list on screen matches the data before tapping, as in rename()
        const gs = (await window.__store.all()).filter(r => r.type === 'group' && r.kind === 'math' && !r.deletedAt).sort((a, b) => a.order - b.order);
        return document.getElementById('groups').dataset.sig === JSON.stringify(gs.map(g => [g.id, g.name, g.order]));
      }, { timeout: 5000 });
      await mac.click('input[data-id="grp_math_lion"]', { clickCount: 3 });
      await mac.keyboard.press('Backspace');
      await mac.type('input[data-id="grp_math_lion"]', 'Half typed');
      await mac.$eval('input[data-id="grp_math_lion"]', e => e.blur());   // looked away before saving
      await mac.evaluate(() => window.__t.scanNow());
      await new Promise(r => setTimeout(r, 300));
      assert.equal(await mac.$eval('input[data-id="grp_math_lion"]', e => e.value), 'Half typed');
      await mac.click('button[data-save="grp_math_lion"]');
      await mac.waitForFunction(() => /Half typed/.test(document.getElementById('resultText').textContent));
    });

    await t.test('a broken file is left alone, reported once, and other files are not touched', async () => {
      await dropIntoFolder(mac, 'suite-from-iphone-zzzz.json', '{ not json');
      await dropIntoFolder(mac, 'notes.json', '{"mine": true}');
      const first = await mac.evaluate(() => window.__t.scanNow());
      assert.equal(first.skipped.length, 1);
      const second = await mac.evaluate(() => window.__t.scanNow());
      assert.equal(second.skipped.length, 0, 'not retried until it changes');
      const files = await folderFiles(mac);
      assert.ok(files['suite-from-iphone-zzzz.json']);
      assert.equal(files['notes.json'], '{"mine": true}');
      await mac.waitForFunction(() => /could not be loaded/.test(document.getElementById('watchingText').textContent));
      await mac.evaluate(() => window.__t.scanNow());
      await new Promise(r => setTimeout(r, 300));
      assert.match(await mac.$eval('#watchingText', e => e.textContent), /could not be loaded/, 'the warning stays while the file is there');
    });

    await t.test('a file from the version before is upgraded and loads', async () => {
      const hub = JSON.parse((await folderFiles(mac))['classroom-suite.json']);
      hub.version = hub.version - 1;
      hub.records = hub.records.filter(r => !['subPlan', 'subBlock'].includes(r.type));   // the types new in this version
      const p = path.join(os.tmpdir(), 'prev-suite.json'); fs.writeFileSync(p, JSON.stringify(hub));
      await phone.$eval('#result', e => { e.hidden = true; });
      await (await phone.$('#file')).uploadFile(p);
      await phone.waitForFunction("!document.getElementById('result').hidden || !document.getElementById('problem').hidden");
      assert.equal(await phone.$eval('#problem', e => e.hidden), true, await phone.$eval('#problemText', e => e.textContent));
    });

    await t.test('a file from an older version, or a v95 file, is refused on the iPhone', async () => {
      const hub = JSON.parse((await folderFiles(mac))['classroom-suite.json']);
      hub.version = 0;
      const p = path.join(os.tmpdir(), 'old-suite.json'); fs.writeFileSync(p, JSON.stringify(hub));
      await (await phone.$('#file')).uploadFile(p);
      await phone.waitForFunction("!document.getElementById('problem').hidden");
      assert.match(await phone.$eval('#problemText', e => e.textContent), /older version/);
      await (await phone.$('#file')).uploadFile(SAMPLE);
      await phone.waitForFunction(() => /v95 sync file/.test(document.getElementById('problemText').textContent));
    });

    await t.test('undo on the iPhone puts back exactly what the last load replaced', async () => {
      await rename(mac, 'grp_math_tiger', 'Tiger Team');
      await new Promise(r => setTimeout(r, 2500));
      const before = await records(phone);
      await phoneLoadsHub();
      assert.equal(await groupName(phone, 'grp_math_tiger'), 'Tiger Team');
      await phone.click('#undo');
      await phone.waitForFunction(() => /Load undone/.test(document.getElementById('resultTitle').textContent));
      assert.deepEqual(await records(phone), before);
    });

    await t.test('an edit after a load keeps that load undoable, and undo keeps the edit', async () => {
      await rename(mac, 'grp_math_tiger', 'Stripes');
      await new Promise(r => setTimeout(r, 2500));
      await phoneLoadsHub();
      await rename(phone, 'grp_math_tiger', 'Stripes 2');
      assert.match(await phone.$eval('#undoText', e => e.textContent), /classroom-suite\.json/);
      await phone.click('#undo');
      await phone.waitForFunction(() => /Load undone/.test(document.getElementById('resultTitle').textContent));
      assert.match(await phone.$eval('#resultText', e => e.textContent), /One thing you changed since then was kept/);
      assert.equal(await groupName(phone, 'grp_math_tiger'), 'Stripes 2');
    });

    await t.test('after a restart the MacBook asks to reconnect only if Chrome needs it, and keeps watching', async () => {
      await mac.setOfflineMode(false);
      await go(mac, 'sync');
      const state = await mac.evaluate(async () => (await window.__t.status()).folder.state);
      assert.equal(state, 'watching');
      await mac.screenshot({ path: path.join(SHOTS, '6-sync-mac.png'), fullPage: true });
    });

    await t.test('the app opens with no signal once it has been opened once', async () => {
      await phone.setOfflineMode(false);
      await go(phone, 'sync');
      await phone.evaluate(() => navigator.serviceWorker.ready);
      await phone.reload({ waitUntil: 'domcontentloaded' });
      await phone.waitForFunction('window.__ready === true && !!navigator.serviceWorker.controller', { timeout: 15000 });
      await phone.setOfflineMode(true);
      for (const where of ['sync', 'import', '']) {
        await phone.goto(`${base}/${where}${where ? '/' : ''}`, { waitUntil: 'domcontentloaded' });
        const h1 = await phone.$eval('h1', e => e.textContent);
        assert.ok(h1, `${where || 'home'} opens offline`);
      }
      await phone.goto(`${base}/sync/`, { waitUntil: 'domcontentloaded' });
      await phone.waitForFunction('window.__ready === true', { timeout: 15000 });
      assert.equal(await groupName(phone, 'grp_math_fox'), 'Fox Den');
      await phone.setOfflineMode(false);
    });

    await t.test('the home page links to both pages, at phone width', async () => {
      await phone.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      const links = await phone.$$eval('a.row', as => as.map(a => a.getAttribute('href')));
      assert.deepEqual(links, ['planner/', 'sync/', 'import/']);
      await phone.screenshot({ path: path.join(SHOTS, '7-home-phone.png'), fullPage: true });
    });

    await t.test('no page errors on either device', () => {
      assert.deepEqual(mac.errors, []);
      assert.deepEqual(phone.errors, []);
    });
  } finally {
    await browser.close();
    server.close();
  }
});
