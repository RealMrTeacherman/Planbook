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
  // Each card's own position and Taught, not those of a subject shown inside it.
  const labels = page => page.$$eval('[data-card]', cs => cs.map(c => {
    const own = sel => c.querySelector(`:scope > ${sel}`);
    const l = own('.pos .label'), i = own('.pos input');
    return [c.dataset.card, l ? l.textContent : i.value, own('.tile-foot .taught').getAttribute('aria-pressed')];
  }));
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
        assert.match(await p.$eval('#daySide', e => e.innerText), /Old block \(9:00\): Gone from the schedule/);
      }
      await open(mac, '#day/2026-09-16'); await open(phone, '#day/2026-09-16');
      assert.match(await mac.$eval('#daySide', e => e.innerText), /PRIVATE · DRIVE ONLY\s*Mila to speech/i);
      assert.doesNotMatch(await phone.$eval('#daySide', e => e.innerText), /Mila/, 'the iPhone has not loaded the Drive file');
      assert.equal(await mac.$eval('[data-flag="Early release"]', e => e.getAttribute('aria-pressed')), 'true');
      assert.match(await mac.$eval('#daySide', e => e.innerText), /Early release/);
    });

    await t.test('a subject\'s later blocks fold into its card as small text, with no rows of their own', async () => {
      await open(mac, '#day/2026-09-14');
      assert.equal(await mac.$$eval('#dayMain .slim.continued', e => e.length), 0);
      const blk = await mac.$eval('[data-card="subj_v95-reading"] > .blk', e => e.innerText);
      assert.match(blk, /8:50 Whole-group comprehension/);
      assert.match(blk, /9:10 Reading small groups · Colors shift one slot down/);
      assert.match(await mac.$eval('[data-card="subj_v95-reading"] > .tile-head .subj-chip', e => e.textContent), /8:15–9:30/, 'Phonics inside, so the chip spans both');
      const times = await mac.$$eval('#dayMain > .rows > *', els => els.map(e => (e.querySelector('.time, .subj-chip .t') || {}).textContent));
      assert.ok(!times.includes('8:50') && !times.includes('9:10'), 'no rows for the later reading blocks');
    });

    await t.test('Phonics sits inside the Reading card, first, still tracked on its own', async () => {
      await open(mac, '#day/2026-09-14');
      const r = await mac.$eval('[data-card="subj_v95-reading"]', c => ({
        nested: !!c.querySelector(':scope > .subsec[data-card="subj_v95-phonics"]'),
        firstChild: c.children[1].dataset.card,
        phonicsTaught: c.querySelector('[data-card="subj_v95-phonics"] .taught').getAttribute('aria-pressed') }));
      assert.deepEqual(r, { nested: true, firstChild: 'subj_v95-phonics', phonicsTaught: 'true' });
      assert.equal(await mac.$$eval('#dayMain > .rows > [data-card="subj_v95-phonics"]', e => e.length), 0, 'no Phonics card of its own');
      const lefts = await mac.$$eval('[data-card="subj_v95-reading"] .pos .label', ls => ls.map(l => Math.round(l.getBoundingClientRect().left - l.closest('.pos').getBoundingClientRect().left)));
      assert.ok(lefts.every(x => x <= 2), `positions sit at the left of their row, not centered: ${lefts}`);
      await mac.click('[data-card="subj_v95-phonics"] [data-taught]');
      await waitRec(mac, async () => (await window.__store.all()).find(x => x.id === 'les_2026-09-14_subj_v95-phonics').taught === false);
      assert.equal(await mac.$eval('[data-card="subj_v95-reading"] > .tile-foot .taught', e => e.getAttribute('aria-pressed')), 'true', 'Reading untouched');
      await mac.click('[data-card="subj_v95-phonics"] [data-taught]');
      // ...and it is a setting: Phonics back on its own card, then inside Reading again.
      await open(mac, '#settings/2026-09-14');
      await mac.select('[data-rec="subj_v95-phonics"][data-f="within"]', '');
      await open(mac, '#day/2026-09-14');
      await mac.waitForFunction(() => !!document.querySelector('#dayMain > .rows > [data-card="subj_v95-phonics"]'));
      await open(mac, '#settings/2026-09-14');
      await mac.select('[data-rec="subj_v95-phonics"][data-f="within"]', 'subj_v95-reading');
      await open(mac, '#day/2026-09-14');
      await mac.waitForFunction(() => !!document.querySelector('[data-card="subj_v95-reading"] > .subsec[data-card="subj_v95-phonics"]'));
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
      assert.match(text, /Plants/, 'a typed subject shows its key word');
      const cell = await mac.$eval('.miniweek a[title="Plants: what do they need?"]', e => [e.textContent, e.parentElement.className, e.getAttribute('aria-label'), e.scrollWidth <= e.clientWidth]);
      assert.deepEqual(cell.slice(0, 3), ['Plants', 'done word', 'Science / SS, Mon: Plants: what do they need?, taught']);
      assert.equal(cell[3], true, 'the word fits its cell');
      await mac.click('.miniweek thead a[href="#day/2026-09-17"]');
      await mac.waitForFunction(() => location.hash === '#day/2026-09-17');
    });

    await t.test('every subject chip meets 4.5:1 contrast with its white text', async () => {
      await open(mac, '#day/2026-09-16');   // a settled page of its own, not one still switching days
      const ratios = await mac.$$eval('.subj-chip', chips => chips.map(c => {
        const rgb = getComputedStyle(c).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
        const L = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        return [c.textContent.trim(), 1.05 / (L + 0.05), getComputedStyle(c).backgroundColor, location.hash];
      }));
      assert.ok(ratios.length >= 6);
      for (const [name, r, bg, where] of ratios) assert.ok(r >= 4.5, `${name}: ${r.toFixed(2)} on ${bg} at ${where}`);
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

    // ---------- step 4b: Settings ----------
    const pickDay = async (page, n) => {
      await page.click(`[data-dow="${n}"]`);
      await page.waitForFunction(n => { const b = document.querySelector(`[data-dow="${n}"]`); return b && b.getAttribute('aria-pressed') === 'true'; }, {}, n);
    };
    const setField = async (page, sel, value) => {
      await page.click(sel, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      if (value) await page.type(sel, value);
      await page.$eval(sel, e => e.blur());
    };

    await t.test('gate 4b: a schedule change made on the iPhone shows on the MacBook within seconds', async () => {
      await open(phone, '#settings/2026-09-21');
      await open(mac, '#day/2026-09-21');
      const start = Date.now();
      await setField(phone, '[data-rec="blk_d1-800"][data-f="name"]', 'Arrival and tubs');
      await waitRec(mac, () => /Arrival and tubs/.test(document.getElementById('dayMain').innerText));
      assert.ok(Date.now() - start < 6000);
    });

    await t.test('a time that is not a time is refused, and nothing changes', async () => {
      await setField(phone, '[data-rec="blk_d1-800"][data-f="start"]', 'soon');
      await phone.waitForFunction(() => /A time looks like/.test(document.getElementById('problemText').textContent));
      assert.equal((await rec(phone, 'blk_d1-800')).start, '8:00');
    });

    await t.test('blocks can be added and deleted, and a weekday can copy another', async () => {
      await open(mac, '#settings/2026-09-21');
      await pickDay(mac, 5);
      const before = await mac.$$eval('.srow', e => e.length);
      await mac.click('[data-addblk]');
      await mac.waitForFunction(n => document.querySelectorAll('.srow').length === n + 1, {}, before);
      await new Promise(r => setTimeout(r, 300));
      assert.match(await mac.$eval('.srow:last-child [data-f="name"]', e => e.value), /New block/);
      mac.once('dialog', d => d.accept());
      await mac.click('.srow:last-child [data-delblk]');
      await mac.waitForFunction(n => document.querySelectorAll('.srow').length === n, {}, before);
      await pickDay(mac, 2);
      await mac.select('#copyFrom', '3');
      mac.once('dialog', d => d.accept());
      await mac.click('[data-copyday]');
      await waitRec(mac, () => [...document.querySelectorAll('.srow [data-f="name"]')].some(i => i.value === 'Assembly / Enrichments / Other'));
      const tue = await mac.evaluate(async () => (await window.__store.all()).filter(r => r.type === 'block' && r.weekday === 2 && !r.deletedAt).length);
      assert.equal(tue, 13, 'Tuesday now has Wednesday\'s 13 blocks');
    });

    await t.test('a standing note that names a child can be kept private', async () => {
      await pickDay(mac, 1);
      await setField(mac, '[data-rec="blk_d1-930"][data-f="note"]', 'Juniper needs a buddy');
      await mac.waitForFunction(() => document.getElementById('nameDialog').open);
      await mac.click('#nameDialog button[value="private"]');
      await waitRec(mac, () => /Juniper needs a buddy/.test(document.getElementById('settingsView').innerText));
      assert.equal((await rec(mac, 'blk_d1-930')).note, undefined);
      assert.equal(fb.allDocs().some(r => JSON.stringify(r).includes('Juniper needs')), false);
    });

    await t.test('a subject\'s color and quick picks change everywhere', async () => {
      await mac.click('[data-s="subj_steam"][data-color="#2F7D4E"]');
      await mac.waitForFunction(() => { const b = document.querySelector('[data-s="subj_steam"][data-color="#2F7D4E"]'); return b && b.getAttribute('aria-checked') === 'true'; });
      await setField(mac, '[data-rec="subj_flex"][data-f="picks"]', 'Assembly, Library, Art');
      await open(phone, '#day/2026-09-16');
      await waitRec(phone, () => [...document.querySelectorAll('[data-card="subj_flex"] .picks button')].map(b => b.textContent).join('|') === 'Assembly|Library|Art');
      const steam = await phone.$eval('[data-card="subj_steam"]', e => getComputedStyle(e).getPropertyValue('--subj').trim());
      assert.equal(steam.toLowerCase(), '#2f7d4e');
    });

    await t.test('a day off added in Settings shows on the day, on both devices', async () => {
      await mac.$eval('#offDate', e => { e.value = '2026-10-09'; });
      await mac.type('#offLabel', 'Teacher work day');
      await mac.click('[data-addoff]');
      await open(phone, '#day/2026-10-09');
      await waitRec(phone, () => /Teacher work day/.test(document.getElementById('daySide').innerText));
    });

    await t.test('Reveal Math · the year: twelve units on this calendar, and the Math card says where the guide is', async () => {
      await open(mac, '#settings/2026-10-05');
      assert.equal(await mac.$$eval('table.pace tbody tr', r => r.length), 12);
      assert.match(await mac.$eval('#settingsView', e => e.innerText), /the guide uses 153/);
      assert.equal(await mac.$$eval('table.pace tr.here', r => r.length), 1);
      await open(mac, '#day/2026-10-05');
      assert.match(await mac.$eval('[data-card="subj_v95-math"]', e => e.innerText), /guide has you in Unit \d+ by now|on pace with the guide/);
    });

    await t.test('tapping a lesson\'s position jumps straight to another lesson', async () => {
      await open(mac, '#day/2026-10-05');
      await mac.click('[data-card="subj_v95-math"] [data-jump]');
      await mac.waitForFunction(() => document.getElementById('jumpDialog').open);
      await mac.select('#jumpSel', JSON.stringify({ unit: 2, lesson: 3 }));
      await mac.click('#jumpDialog button[value="go"]');
      await waitRec(mac, () => document.querySelector('[data-card="subj_v95-math"] .label').textContent === 'U2 · L3');
      await mac.click('[data-card="subj_v95-reading"] > .pos [data-jump]');
      await mac.waitForFunction(() => document.getElementById('jumpDialog').open);
      await setField(mac, '#jumpBody [data-j="week"]', '2');
      await mac.click('#jumpDialog button[value="go"]');
      await waitRec(mac, () => /^U\d+ · W2 · D\d+$/.test(document.querySelector('[data-card="subj_v95-reading"] > .pos .label').textContent));
    });

    await t.test('a change arriving from the other device never wipes a Settings field being typed in', async () => {
      await open(mac, '#settings/2026-09-21'); await open(phone, '#settings/2026-09-21');
      await mac.click('[data-rec="blk_d1-805"][data-f="note"]', { clickCount: 3 });
      await mac.keyboard.type('Half typed note');
      await setField(phone, '[data-rec="blk_d1-1100"][data-f="name"]', 'Lunch and recess');
      await new Promise(r => setTimeout(r, 1500));
      assert.equal(await mac.$eval('[data-rec="blk_d1-805"][data-f="note"]', e => e.value), 'Half typed note');
      await mac.$eval('[data-rec="blk_d1-805"][data-f="note"]', e => e.blur());
      await waitRec(mac, () => document.querySelector('[data-rec="blk_d1-1100"][data-f="name"]').value === 'Lunch and recess');
    });

    // ---------- step 4c: the family email ----------
    await t.test('the family email opens from Week, in families\' words', async () => {
      await open(mac, '#week/2026-09-14');
      await mac.click('[data-famopen]');
      await mac.waitForFunction(() => /^#family\//.test(location.hash) && document.getElementById('famPrev'));
      await mac.goto(mac.url().replace(/#.*/, '#family/2026-09-14'), { waitUntil: 'domcontentloaded' });
      await mac.waitForFunction('window.__ready === true && !!document.getElementById("famPrev")', { timeout: 15000 });
      const mail = await mac.$eval('#famPrev', e => e.innerText);
      assert.match(mail, /Math · Unit 1/);
      assert.match(mail, /Our big question: How do living things get what they need to survive\?/);
      assert.match(mail, /Spelling words to practice at home: hat, map, sat, cap/);
      assert.match(mail, /Beginning our informative essay/);
      assert.doesNotMatch(mail, /Picture forms due|speech/, 'day notes never appear');
    });

    await t.test('choosing a goal changes that line, keeps hand edits, and reaches the iPhone', async () => {
      await mac.$eval('#famPrev', e => { e.querySelector('[data-fam-head="math"] + ul li').textContent = 'My own math line'; e.dispatchEvent(new Event('input')); });
      const pick = await mac.$$eval('input[name="famgoal"]', is => is.find(i => !i.checked).value);
      await mac.click(`input[name="famgoal"][value="${pick}"]`);
      await waitRec(mac, async v => (await window.__store.all()).some(r => r.id === 'fam_bm-1-1' && r.goal === v), pick);
      assert.match(await mac.$eval('#famPrev', e => e.innerText), /My own math line/, 'the hand edit stays');
      await waitRec(phone, async v => (await window.__store.all()).some(r => r.id === 'fam_bm-1-1' && r.goal === v), pick);
    });

    await t.test('a spelling list typed on the iPhone is cleaned up into the email and kept for that Benchmark week', async () => {
      await open(phone, '#family/2026-09-14');
      await phone.$eval('#famSpell', e => { e.value = ''; e.focus(); });
      await phone.type('#famSpell', '1. sun\n2. fun, run');
      await phone.$eval('#famSpell', e => e.blur());
      await phone.waitForFunction(() => /Spelling words to practice at home: sun, fun, run$/m.test(document.getElementById('famPrev').innerText));
      await waitRec(mac, async () => (await window.__store.all()).some(r => r.id === 'fam_bm-1-1' && /sun/.test(r.spelling || '')));
    });

    await t.test('Copy gives a bulleted plain-text version as well as the formatted one', async () => {
      await phone.click('#famCopy');
      await phone.waitForFunction(() => window.__famLastCopy);
      const c = await phone.evaluate(() => window.__famLastCopy);
      assert.match(c.text, /^Here’s a peek/);
      assert.match(c.text, /\n• Our big question: /);
      assert.match(c.html, /<ul>/);
    });

    await t.test('the week moves by a week; the day skips weekends', async () => {
      await open(mac, '#week/2026-09-14');
      await mac.click('#next');
      await mac.waitForFunction(() => location.hash === '#week/2026-09-21');
      await open(mac, '#day/2026-09-18');
      await mac.click('#next');
      await mac.waitForFunction(() => location.hash === '#day/2026-09-21');
    });

    await t.test('the Agenda look: chosen on the MacBook only, a compact list with the lesson beside it', async () => {
      await open(mac, '#settings/2026-09-14');
      await mac.click('[data-look="agenda"]');
      await mac.waitForFunction(() => document.documentElement.classList.contains('look-agenda'));
      await open(mac, '#day/2026-09-14');
      assert.equal(await mac.evaluate(() => document.documentElement.classList.contains('look-agenda')), true, 'kept after reload');
      await open(phone, '#day/2026-09-14');
      assert.equal(await phone.evaluate(() => document.documentElement.classList.contains('look-agenda')), false, 'the iPhone keeps its own look');
      assert.ok(await mac.$$eval('.agenda .arow', r => r.length) >= 4);
      const order = await mac.$$eval('.agenda .arow', r => r.map(x => x.dataset.arow));
      assert.ok(order.indexOf('subj_v95-phonics') < order.indexOf('subj_v95-reading'), 'Phonics (8:15) before Reading (8:30)');
      assert.ok(await mac.$('.apane [data-card]'), 'a lesson open beside the list');
      await mac.click('[data-sel="subj_v95-math"]');
      await mac.waitForFunction(() => document.querySelector('.apane [data-card]').dataset.card === 'subj_v95-math');
      assert.match(await mac.$eval('.apane', e => e.innerText), /Learning targets|Course Diagnostic/);
      await mac.click('[data-arow="subj_v95-math"] [data-step="1"]');
      await waitRec(phone, () => document.querySelector('[data-card="subj_v95-math"] > .pos .label').textContent === 'U1 · Opener');
      const wide = await mac.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      assert.ok(wide, 'nothing runs off the side');
      await mac.click('[data-arow="subj_v95-math"] [data-step="-1"]');
      await open(mac, '#settings/2026-09-14');
      await mac.click('[data-look="blocks"]');
      await mac.waitForFunction(() => !document.documentElement.classList.contains('look-agenda'));
    });

    // ---------- step 5: sub plans ----------
    await t.test('the Day view opens the day\'s sub plan: the full plan, built from the planner and the sub notes', async () => {
      await open(mac, '#day/2026-09-14');
      await mac.click('.subbtn');
      await mac.waitForFunction(() => location.hash === '#sub/2026-09-14' && /Monday, 14 September/.test(window.__subHtml || ''));
      const h = await mac.evaluate(() => window.__subHtml);
      assert.match(h, /The day, block by block/);
      assert.match(h, /Teacher Guide is on my desk/, 'a block\'s What to do');
      assert.match(h, /If you cannot find it:<\/b> Do the Number Corner page instead/);
      assert.match(h, /Mila<\/b><\/td><td>Needs a movement break/, 'What helps');
      // Tuesday's schedule was replaced by an earlier test, so its block notes now print under Just for this day.
      await open(mac, '#sub/2026-09-15');
      await mac.waitForFunction(() => /Tuesday, 15 September/.test(window.__subHtml || ''));
      const tue = await mac.evaluate(() => window.__subHtml);
      assert.match(tue, /Old block \(9:00\):<\/b> Gone from the schedule/);
      assert.match(tue, /Math core lesson \(10:15\):<\/b> Use the big ten frames/, 'a deleted block keeps its note, labeled');
      assert.equal(await mac.$eval('#subFrame', f => f.contentDocument.body.innerHTML.length > 500), true, 'the preview shows it');
      assert.equal(await mac.$eval('#subFrame', f => f.contentWindow.getComputedStyle(f.contentDocument.querySelector('h2')).textTransform), 'uppercase', 'with v95\'s printout styles');
    });

    await t.test('At a glance is one table of the day; printing marks the day as a sub day on both devices', async () => {
      await mac.click('[data-subkind="glance"]');
      await mac.waitForFunction(() => /At a glance/.test(window.__subHtml));
      await mac.waitForSelector('#subFrame');
      await mac.evaluate(() => { document.getElementById('subFrame').contentWindow.print = () => { window.__printed = true; }; });
      await mac.click('#subPrint');
      await mac.waitForFunction(() => window.__printed === true);
      await waitRec(phone, async () => ((await window.__store.all()).find(r => r.id === 'dayp_2026-09-15') || {}).flags?.includes('Sub'));
    });

    await t.test('a device without the sub notes says where they live', async () => {
      await open(phone, '#sub/2026-09-15');
      assert.match(await phone.$eval('#subView', e => e.innerText), /No standing sub notes on this device yet/);
    });

    await t.test('sub notes are edited in Settings, show in the plan, and never reach the server', async () => {
      await open(mac, '#settings/2026-09-15');
      await mac.$eval('[data-rec="subplan_main"][data-f="intro"]', e => { e.value = 'Welcome! Lunch count is on the clipboard.'; e.dispatchEvent(new Event('change', { bubbles: true })); });
      await pickDay(mac, 1);
      await mac.$eval('[data-blk="blk_d1-930"][data-f="detail"]', e => { e.value = 'Recess duty is on the playground map.'; e.dispatchEvent(new Event('change', { bubbles: true })); });
      await mac.$eval('[data-special="T"][data-i="0"]', e => { e.value = 'Music'; e.dispatchEvent(new Event('change', { bubbles: true })); });
      await waitRec(mac, async () => (await window.__store.all()).some(r => r.id === 'subblk_blk_d1-930'));
      await open(mac, '#sub/2026-09-14');
      await mac.click('[data-subkind="full"]');
      await mac.waitForFunction(() => /Welcome! Lunch count/.test(window.__subHtml) && /Recess duty is on the playground map/.test(window.__subHtml));
      await new Promise(r => setTimeout(r, 600));
      assert.equal(fb.allDocs().some(r => /^sub(Plan|Block)$/.test(r.type) || JSON.stringify(r).includes("Lunch count")), false);
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
