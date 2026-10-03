// Step 4a's gate, in real Chrome: the MacBook imports v95, the iPhone gets the planner by live
// sync (the stand-in Firebase), and both show the same week. Edits on either side arrive on the
// other; notes that name a child are caught and can be kept private.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findChrome, loadPuppeteer, serve, newPage } = require('./helpers/browser');
const { FakeServer, LIVE } = require('./helpers/fake-firebase');

const SAMPLE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'suite-screens');
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !chrome || !puppeteer ? 'no Chrome or puppeteer-core here' : false;
const EMAIL = 'teacher@example.com', PW = 'correct horse';
const LIVE_TYPES = Object.keys(LIVE);

test('the planner: Day and Week on MacBook and iPhone', { skip, timeout: 240000 }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/Planbook`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const fb = new FakeServer(); fb.addAccount(EMAIL, PW);
  const device = async opts => { const p = await newPage(await browser.createBrowserContext(), opts); await fb.attach(p); return p; };
  const mac = await device({ width: 1280 });
  const phone = await device({ width: 390, iphone: true });

  const open = async (page, hash) => {
    await page.goto(`${base}/planner/${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 300));
  };
  const signIn = async page => {
    await page.goto(`${base}/sync/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true');
    await page.waitForFunction("!document.getElementById('liveSignIn').hidden");
    await page.type('#liveEmail', EMAIL); await page.type('#livePw', PW); await page.click('#liveGo');
    await page.waitForFunction(() => /up to date/.test(document.getElementById('liveStatus').innerText), { timeout: 10000 });
  };
  const labels = page => page.$$eval('[data-card]', cs => cs.map(c => [c.dataset.card, (c.querySelector('.label') || c.querySelector('input')).textContent || c.querySelector('input').value,
    c.querySelector('.taught').getAttribute('aria-pressed')]));
  const liveRecs = page => page.evaluate(async types => (await window.__store.all()).filter(r => types.includes(r.type)).sort((a, b) => a.id < b.id ? -1 : 1), LIVE_TYPES);
  const rec = (page, id) => page.evaluate(async id => (await window.__store.all()).find(r => r.id === id) || null, id);
  const waitRec = (page, fn, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg);
  const settle = () => new Promise(r => setTimeout(r, 700));
  // Wait until both devices hold the same live records (up to 10 seconds), then compare.
  const inStep = async () => {
    for (let i = 0; i < 40; i++) {
      if (JSON.stringify(await liveRecs(mac)) === JSON.stringify(await liveRecs(phone))) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.deepEqual(await liveRecs(phone), await liveRecs(mac));
  };

  try {
    await t.test('with nothing on the device, the planner says where to start', async () => {
      await open(phone, '#day/2026-09-16');
      assert.equal(await phone.$eval('#empty', e => e.hidden), false);
    });

    await t.test('the MacBook imports v95 and signs in; the iPhone signs in and receives the planner', async () => {
      await mac.goto(`${base}/import/`, { waitUntil: 'domcontentloaded' }); await mac.waitForFunction('window.__ready');
      await (await mac.$('#file')).uploadFile(SAMPLE);
      await mac.waitForFunction("!document.getElementById('preview').hidden");
      assert.match(await mac.$eval('#notes', e => e.innerText), /3 planner notes name a child/);
      await mac.click('#load'); await mac.waitForFunction("!document.getElementById('result').hidden");
      await signIn(mac);
      await signIn(phone);
      await inStep();
      assert.equal(fb.allDocs().some(r => r.type === 'privateNote'), false, 'private notes never reach the server');
    });

    await t.test('gate: the imported week shows the same lessons on both devices, day by day', async () => {
      for (const d of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']) {
        await open(mac, `#day/${d}`); await open(phone, `#day/${d}`);
        assert.deepEqual(await labels(phone), await labels(mac), d);
      }
      await open(mac, '#day/2026-09-16');
      const l = Object.fromEntries((await labels(mac)).map(([k, v, tt]) => [k, [v, tt]]));
      assert.deepEqual(l['subj_v95-math'], ['U1 · L1', 'true']);
      assert.deepEqual(l['subj_v95-reading'], ['U1 · W1 · D3', 'true']);
      assert.deepEqual(l['subj_v95-phonics'], ['U1 · W1 · D2', 'false'], 'not planned in v95: suggested after Monday');
      await mac.screenshot({ path: path.join(SHOTS, '9-planner-day-mac.png'), fullPage: true });
      await phone.screenshot({ path: path.join(SHOTS, '10-planner-day-phone.png'), fullPage: true });
    });

    await t.test('the day shows its flags, its notes, block notes and standing notes; private notes only where they live', async () => {
      await open(mac, '#day/2026-09-15'); await open(phone, '#day/2026-09-15');
      for (const p of [mac, phone]) {
        assert.match(await p.$eval('#dayMain', e => e.innerText), /Use the big ten frames/);
        assert.match(await p.$eval('#dayMain', e => e.innerText), /Reveal Teacher/);
        assert.match(await p.$eval('#daySide', e => e.innerText), /9:00 Old block: Gone from the schedule/);
      }
      await open(mac, '#day/2026-09-16'); await open(phone, '#day/2026-09-16');
      assert.match(await mac.$eval('#daySide', e => e.innerText), /PRIVATE · DRIVE ONLY\s*Mila to speech/i);
      assert.doesNotMatch(await phone.$eval('#daySide', e => e.innerText), /Mila/, 'the iPhone has not loaded the Drive file');
      assert.equal(await mac.$eval('[data-flag="Early release"]', e => e.getAttribute('aria-pressed')), 'true');
      assert.match(await mac.$eval('#daySide', e => e.innerText), /Early release/);
    });

    await t.test('a day off from the district calendar shows on both devices', async () => {
      for (const p of [mac, phone]) {
        await open(p, '#day/2026-11-25');
        assert.match(await p.$eval('#daySide', e => e.innerText), /Thanksgiving Break/);
        assert.match(await p.$eval('#dayMain', e => e.innerText), /No school this day/);
      }
    });

    await t.test('stepping a lesson on the iPhone shows on the MacBook within seconds', async () => {
      await open(phone, '#day/2026-09-17'); await open(mac, '#day/2026-09-17');
      await phone.click('[data-card="subj_v95-math"] [data-step="1"]');
      await waitRec(mac, () => /U1 · L3/.test(document.querySelector('[data-card="subj_v95-math"] .label').textContent));
      await phone.click('[data-card="subj_v95-math"] .taught');
      await waitRec(mac, () => document.querySelector('[data-card="subj_v95-math"] .taught').getAttribute('aria-pressed') === 'true');
      assert.deepEqual((await rec(mac, 'les_2026-09-17_subj_v95-math')).pos, { unit: 1, lesson: 3 });
    });

    await t.test('the next day suggests the lesson after the one just taught', async () => {
      await open(mac, '#day/2026-09-18');
      const m = (await labels(mac)).find(([k]) => k === 'subj_v95-math');
      assert.equal(m[1], 'U1 · L3', 'Friday was planned in v95 as U1 · L3, so it stays as planned');
      await open(mac, '#day/2026-09-21');
      const n = (await labels(mac)).find(([k]) => k === 'subj_v95-math');
      assert.equal(n[1], 'U1 · L4', 'Monday is suggested after Thursday\'s U1 · L3');
    });

    await t.test('a flag set on the MacBook shows on the iPhone', async () => {
      await open(mac, '#day/2026-09-21'); await open(phone, '#day/2026-09-21');
      await mac.click('[data-flag="Assembly"]');
      await waitRec(phone, () => document.querySelector('[data-flag="Assembly"]').getAttribute('aria-pressed') === 'true');
    });

    await t.test('a free-text subject typed on the iPhone shows on the MacBook', async () => {
      await phone.click('[data-free="subj_v95-science"]', { clickCount: 3 });
      await phone.type('[data-free="subj_v95-science"]', 'Seeds sprouting');
      await phone.$eval('[data-free="subj_v95-science"]', e => e.blur());
      await waitRec(mac, () => { const i = document.querySelector('[data-free="subj_v95-science"]'); return i && i.value === 'Seeds sprouting'; });
    });

    await t.test('a note that names a child asks first: Edit keeps the editor open and saves nothing', async () => {
      await mac.click('#dayNoteBtn');
      await mac.type('#dayNoteHost textarea', 'Theo to the nurse at 1');
      await mac.click('#dayNoteHost [data-act="save"]');
      await mac.waitForFunction(() => document.getElementById('nameDialog').open);
      assert.match(await mac.$eval('#nameText', e => e.textContent), /"Theo" is a name on your class list/);
      await mac.click('#nameDialog button[value="edit"]');
      await settle();
      assert.ok(await mac.$('#dayNoteHost textarea'));
      assert.equal((await rec(mac, 'dayp_2026-09-21')).notes, undefined);
    });

    await t.test('Keep it private: the note shows on the MacBook, never reaches the server or the iPhone', async () => {
      await mac.click('#dayNoteHost [data-act="save"]');
      await mac.waitForFunction(() => document.getElementById('nameDialog').open);
      await mac.click('#nameDialog button[value="private"]');
      await mac.waitForFunction(() => /PRIVATE · DRIVE ONLY\s*Theo to the nurse/i.test(document.getElementById('daySide').innerText));
      await settle();
      assert.equal(fb.allDocs().some(r => JSON.stringify(r).includes('Theo to the nurse')), false);
      assert.doesNotMatch(await phone.$eval('#daySide', e => e.innerText), /Theo/);
    });

    await t.test('Save it live anyway: the note syncs as written', async () => {
      await mac.click('[data-bnote]');
      const host = await mac.$('[data-bnote-host] textarea');
      await host.type('Bring Theo\'s library book');
      await mac.click('[data-bnote-host] [data-act="save"]');
      await mac.waitForFunction(() => document.getElementById('nameDialog').open);
      await mac.click('#nameDialog button[value="anyway"]');
      await waitRec(phone, () => /Bring Theo's library book/.test(document.getElementById('dayMain').innerText));
    });

    await t.test('a note with no name saves straight away and syncs', async () => {
      await phone.click('[data-lnote="subj_v95-math"]');
      await phone.type('[data-lnote-host="subj_v95-math"] textarea', 'Use the hundreds chart');
      await phone.click('[data-lnote-host="subj_v95-math"] [data-act="save"]');
      await waitRec(mac, () => /Use the hundreds chart/.test(document.getElementById('dayMain').innerText));
      assert.equal(await phone.$eval('#nameDialog', e => e.open), false);
    });

    await t.test('Color blocks: the curriculum shows in full on the MacBook, a section at a time on the iPhone', async () => {
      await open(mac, '#day/2026-09-16'); await open(phone, '#day/2026-09-16');
      const macMath = await mac.$eval('[data-card="subj_v95-math"]', e => e.innerText);
      assert.match(macMath, /I can tell my math story\./);
      assert.match(macMath, /crayons, markers, or colored pencils/);
      assert.match(macMath, /1\.NBT\.B\.3/);
      assert.match(macMath, /Lesson 1-2 · Math Is Exploring and Thinking/);
      const openMac = await mac.$$eval('[data-card="subj_v95-reading"] .cur details', ds => ds.map(d => d.open));
      assert.ok(openMac.length >= 5 && openMac.every(Boolean), 'every section open on the MacBook');
      const openPhone = await phone.$$eval('[data-card="subj_v95-reading"] .cur details', ds => ds.map(d => d.open));
      assert.deepEqual(openPhone.slice(0, 3), [true, true, false], 'the iPhone opens the first two');
      assert.match(await phone.$eval('[data-card="subj_v95-reading"]', e => e.textContent), /The Frogs and the Well/);
      assert.match(await mac.$eval('[data-card="subj_v95-reading"]', e => e.innerText), /2\.RI\.2/);
    });

    await t.test('lessons not on the day\'s schedule are folded away until asked for', async () => {
      await open(mac, '#day/2026-09-16');
      const u = await mac.$eval('details.unsched', d => ({ open: d.open, summary: d.querySelector('summary').innerText }));
      assert.equal(u.open, false);
      assert.match(u.summary, /Not on Wed's schedule/);
      assert.match(u.summary, /Writing/);
      assert.equal(await mac.$eval('[data-card="subj_v95-writing"]', e => e.checkVisibility()), false, 'hidden while folded');
      await mac.click('details.unsched > summary');
      assert.equal(await mac.$eval('[data-card="subj_v95-writing"]', e => e.checkVisibility()), true, 'shown once opened');
      assert.equal(await mac.$$eval('#dayMain > .rows > [data-card="subj_v95-writing"]', e => e.length), 0, 'never among the scheduled rows');
    });

    await t.test('This week sits beside the day on the MacBook, not on the iPhone', async () => {
      await open(mac, '#day/2026-09-16'); await open(phone, '#day/2026-09-16');
      assert.equal(await mac.$eval('.miniweek', e => getComputedStyle(e).display), 'block');
      assert.equal(await phone.$eval('.miniweek', e => getComputedStyle(e).display), 'none');
      const text = await mac.$eval('.miniweek', e => e.innerText);
      assert.match(text, /W1 D3 ✓/);
      assert.match(text, /Diag ✓/);
      await mac.click('.miniweek thead a[href="#day/2026-09-17"]');
      await mac.waitForFunction(() => location.hash === '#day/2026-09-17');
    });

    await t.test('every subject chip meets 4.5:1 contrast with its white text', async () => {
      const ratios = await mac.$$eval('.subj-chip', chips => chips.map(c => {
        const rgb = getComputedStyle(c).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
        const L = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        return [c.textContent.trim(), 1.05 / (L + 0.05)];
      }));
      assert.ok(ratios.length >= 6);
      for (const [name, r] of ratios) assert.ok(r >= 4.5, `${name}: ${r.toFixed(2)}`);
    });

    await t.test('Assembly / Enrichments / Other: a quick pick becomes the header and reaches the other device', async () => {
      await open(mac, '#day/2026-09-16'); await open(phone, '#day/2026-09-16');
      const flex = '[data-card="subj_flex"]';
      assert.equal(await mac.$eval(`${flex} [data-free]`, e => e.placeholder), 'Add today’s topic');
      await mac.click(`${flex} [data-pick="subj_flex"][data-text="Science"]`);
      await waitRec(mac, () => document.querySelector('[data-card="subj_flex"] [data-free]').value === 'Science');
      assert.equal(await mac.$eval(`${flex} [data-text="Science"]`, e => e.getAttribute('aria-pressed')), 'true');
      await waitRec(phone, () => { const i = document.querySelector('[data-card="subj_flex"] [data-free]'); return i && i.value === 'Science'; });
    });

    await t.test('the pencil puts you in the topic header', async () => {
      await phone.click('[data-card="subj_steam"] [data-focus="subj_steam"]');
      assert.equal(await phone.evaluate(() => document.activeElement.dataset.free), 'subj_steam');
      await phone.keyboard.type('Bridges from straws');
      await phone.$eval('[data-free="subj_steam"]', e => e.blur());
      await waitRec(mac, () => { const i = document.querySelector('[data-free="subj_steam"]'); return i && i.value === 'Bridges from straws'; });
    });

    await t.test('the Week view: a grid on the MacBook, a list of days on the iPhone, the same lessons', async () => {
      await open(mac, '#week/2026-09-14'); await open(phone, '#week/2026-09-14');
      assert.equal(await mac.$eval('.week-grid', e => getComputedStyle(e).display), 'block');
      assert.equal(await phone.$eval('.week-grid', e => getComputedStyle(e).display), 'none');
      const macText = await mac.$eval('.week-grid', e => e.innerText);
      const phoneText = await phone.$eval('.week-days', e => e.innerText);
      for (const s of ['U1 · Diagnostic', 'U1 · Opener', 'U1 · L1', 'U1 · L3', 'Plants: what do they need?', 'U1 · W1 · D4']) {
        assert.ok(macText.includes(s), `MacBook week has ${s}`); assert.ok(phoneText.includes(s), `iPhone week has ${s}`);
      }
      await mac.screenshot({ path: path.join(SHOTS, '11-planner-week-mac.png'), fullPage: true });
      await phone.screenshot({ path: path.join(SHOTS, '12-planner-week-phone.png'), fullPage: true });
    });

    await t.test('the week moves by a week; the day skips weekends', async () => {
      await mac.click('#next');
      await mac.waitForFunction(() => location.hash === '#week/2026-09-21');
      await open(mac, '#day/2026-09-18');
      await mac.click('#next');
      await mac.waitForFunction(() => location.hash === '#day/2026-09-21');
    });

    await t.test('both devices end with the same live records as the server', async () => {
      await inStep();
      const server = [...fb.docsOf('uid-teacher').values()].sort((a, b) => a.id < b.id ? -1 : 1);
      assert.deepEqual(await liveRecs(mac), server);
      assert.deepEqual(await liveRecs(phone), server);
    });

    await t.test('the planner opens with no signal once it has been opened', async () => {
      await open(phone, '#day/2026-09-16');
      await phone.evaluate(() => navigator.serviceWorker.ready);
      await phone.reload({ waitUntil: 'domcontentloaded' });
      await phone.waitForFunction('window.__ready === true && !!navigator.serviceWorker.controller', { timeout: 15000 });
      await phone.setOfflineMode(true);
      await open(phone, '#day/2026-09-16');
      assert.equal((await labels(phone)).find(([k]) => k === 'subj_v95-math')[1], 'U1 · L1');
      await phone.setOfflineMode(false);
    });

    await t.test('no page errors on either device', () => { assert.deepEqual(mac.errors, []); assert.deepEqual(phone.errors, []); });
  } finally {
    await browser.close(); server.close();
  }
});
