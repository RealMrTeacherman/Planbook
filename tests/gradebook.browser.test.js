// Step 6a in real Chrome: Enter scores on the iPhone and the MacBook, and the gate: a mark entered on
// the iPhone reaches the MacBook through the Drive folder (as step 2's sync test does it).
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
const TUE = '2026-10-06';
const LBL = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'standards-grade2.json'), 'utf8')).standards.map(s => [s.code, s.label]));
const MILA = 'stu_k3j9x2a', THEO = 'stu_p8q7r6s', JUNE = 'stu_z1y2x3w', OSCAR = 'stu_ab-2e9';

test('the gradebook: Enter scores on iPhone and MacBook', { skip, timeout: 240000 }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/Planbook`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const mac = await newPage(await browser.createBrowserContext(), { width: 1280 });
  const phone = await newPage(await browser.createBrowserContext(), { width: 390, iphone: true });
  const errors = [];
  for (const p of [mac, phone]) p.on('pageerror', e => errors.push(e.message));

  const settled = async page => {
    let last = await page.evaluate(() => window.__renders || 0);
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 250));
      const now = await page.evaluate(() => window.__renders || 0);
      if (now === last) return;
      last = now;
    }
  };
  const go = async (page, where) => {
    await page.goto(`${base}/${where}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true', { timeout: 15000 });
    await settled(page);
  };
  const importSample = async page => {
    await go(page, 'import/');
    await (await page.$('#file')).uploadFile(SAMPLE);
    await page.waitForFunction("!document.getElementById('preview').hidden");
    await page.click('#load');
    await page.waitForFunction("!document.getElementById('result').hidden");
  };
  const rec = (page, id) => page.evaluate(async id => (await window.__store.all()).find(r => r.id === id) || null, id);
  const live = (page, id) => page.evaluate(async id => { const r = (await window.__store.all()).find(r => r.id === id); return r && !r.deletedAt ? r : null; }, id);
  const waitRec = (page, fn, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg);
  // Tap like a person: only once the page has finished redrawing.
  const tap = async (page, sel) => { await settled(page); await page.click(sel); await settled(page); };
  const pressed = (page, sid) => page.evaluate(sid => [...document.querySelectorAll(`[data-kid="${sid}"] .mk`)].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.v + (b.closest('.mrow') && b.dataset.std ? '@' + b.dataset.std : '')), sid);
  const markId = (sid, std, date) => `mark_${sid}_${std.replace(/\./g, '-')}_${date}`;
  // The planner's lesson for Tuesday, as the planner would save it: Lesson 2-4, two standards.
  const planTuesday = page => page.evaluate(async d => {
    await window.__store.write([{ id: `les_${d}_subj_v95-math`, type: 'lessonPlan', deletedAt: null, date: d, subjectId: 'subj_v95-math', pos: { unit: 2, lesson: 4 }, taught: false }], 'the planner');
  }, TUE);

  try {
    await t.test('with no class list, the gradebook says where to start', async () => {
      await go(phone, 'gradebook/');
      assert.equal(await phone.$eval('#empty', e => e.hidden), false);
    });

    await t.test('both devices bring in v95; the gradebook shows the class and their earlier marks', async () => {
      await importSample(mac); await importSample(phone);
      await go(phone, 'gradebook/#enter/2026-09-29');
      const kids = await phone.$$eval('.kid .kname', e => e.map(x => x.textContent));
      assert.deepEqual(kids, ['Juniper Banks', 'Oscar Lindqvist', 'Mila Okafor', 'Theodore Reyes'], 'by last name, as v95; no one from outside the class list');
      assert.equal(await phone.$eval('#assignTitle', e => e.textContent), 'exit ticket', 'takes the name already on this standard and day');
      assert.deepEqual(await pressed(phone, MILA), ['4']);
      assert.match(await phone.$eval(`[data-kid="${MILA}"] .was`, e => e.textContent), /was 3 · 9\/15/);
    });

    await t.test('Settings: switch on the standards in Lesson 2-4', async () => {
      await go(mac, 'gradebook/#settings');
      for (const c of ['2.NBT.A.1', '2.NBT.A.3']) {
        await tap(mac, `[data-std-on="${c}"]`);
        await waitRec(mac, async c => (await window.__store.all()).find(r => r.id === 'gbset_main').on.includes(c), c);
      }
      const on = (await rec(mac, 'gbset_main')).on;
      assert.ok(on.indexOf('2.NBT.A.1') < on.indexOf('2.NBT.B.5'), 'kept in the catalog\'s order');
    });

    await t.test('the card opens on the day\'s lesson from the planner: its first standard and its name', async () => {
      await planTuesday(mac);
      await go(mac, `gradebook/#enter/${TUE}`);
      const card = await mac.evaluate(() => ({ when: document.querySelector('.gwhen').textContent, title: document.getElementById('assignTitle').textContent, ui: [window.__grade.std, window.__grade.what] }));
      assert.match(card.when, /Tue, Oct 6 · Lesson 2-4 in the planner/);
      assert.deepEqual(card.ui, ['2.NBT.A.1', 'Lesson 2-4']);
      assert.equal(card.title, 'Lesson 2-4');
      const chips = await mac.$$eval('.gpicks button', bs => bs.map(b => b.textContent));
      assert.deepEqual(chips, [LBL['2.NBT.A.1'], LBL['2.NBT.A.3'], 'Grade all 2 together']);
    });

    await t.test('a mark saves as you tap; the same number again clears it; Undo puts it back', async () => {
      await tap(mac, `[data-kid="${MILA}"] .mk[data-v="3"]`);
      await waitRec(mac, async id => !!(await window.__store.all()).find(r => r.id === id && !r.deletedAt), markId(MILA, '2.NBT.A.1', TUE));
      const m = await live(mac, markId(MILA, '2.NBT.A.1', TUE));
      assert.deepEqual([m.value, m.what, m.source], [3, 'Lesson 2-4', null]);
      assert.match(await mac.$eval('#progress', e => e.textContent), /1 of 4 marked/);
      await tap(mac, `[data-kid="${MILA}"] .mk[data-v="3"]`);
      await waitRec(mac, async id => !!(await window.__store.all()).find(r => r.id === id && r.deletedAt), markId(MILA, '2.NBT.A.1', TUE));
      assert.match(await mac.$eval('[data-undo]', e => e.textContent), /Undo clearing Mila/);
      await tap(mac, '[data-undo]');
      await waitRec(mac, async id => !!(await window.__store.all()).find(r => r.id === id && !r.deletedAt && r.value === 3), markId(MILA, '2.NBT.A.1', TUE));
      assert.deepEqual(await pressed(mac, MILA), ['3']);
    });

    await t.test('Undo after a change puts back that child\'s mark, and nobody else\'s', async () => {
      await tap(mac, `[data-kid="${THEO}"] .mk[data-v="4"]`);
      await tap(mac, `[data-kid="${MILA}"] .mk[data-v="1"]`);
      await tap(mac, '[data-undo]');
      await waitRec(mac, async id => ((await window.__store.all()).find(r => r.id === id) || {}).value === 3, markId(MILA, '2.NBT.A.1', TUE));
      assert.equal((await live(mac, markId(THEO, '2.NBT.A.1', TUE))).value, 4);
    });

    await t.test('a note typed before the mark is kept, and saved with it', async () => {
      await settled(mac);
      await mac.click(`[data-kid="${JUNE}"] .knote`);
      await mac.keyboard.type('Counted on from 40');
      await mac.keyboard.press('Tab');
      await mac.waitForFunction(() => /saves when you give a mark/.test(document.getElementById('toast').textContent));
      await tap(mac, `[data-kid="${JUNE}"] .mk[data-v="2"]`);
      await waitRec(mac, async id => ((await window.__store.all()).find(r => r.id === id && !r.deletedAt) || {}).note === 'Counted on from 40', markId(JUNE, '2.NBT.A.1', TUE));
    });

    await t.test('a change arriving while a note is being typed never wipes it; the page redraws once it is left', async () => {
      await settled(mac);
      await mac.click(`[data-kid="${THEO}"] .knote`);
      await mac.keyboard.type('Half typed');
      const before = await mac.evaluate(() => window.__renders);
      await mac.evaluate(async (id) => {   // as if a load from the other device changed a mark
        const r = (await window.__store.all()).find(x => x.id === id);
        await window.__store.write([Object.assign({}, r, { value: 1 })], 'a test change');
      }, markId(MILA, '2.NBT.A.1', TUE));
      await mac.waitForFunction(b => window.__renders > b, {}, before);
      await new Promise(r => setTimeout(r, 300));
      assert.equal(await mac.$eval(`[data-kid="${THEO}"] .knote`, e => e.value), 'Half typed');
      assert.ok(await mac.$eval(`[data-kid="${THEO}"] .knote`, e => e === document.activeElement), 'still typing in the field');
      await mac.keyboard.press('Tab');
      await waitRec(mac, async id => ((await window.__store.all()).find(r => r.id === id) || {}).note === 'Half typed', markId(THEO, '2.NBT.A.1', TUE));
      await mac.waitForFunction(() => document.querySelector('[data-kid="stu_k3j9x2a"] .mk[data-v="1"]').getAttribute('aria-pressed') === 'true');
    });

    await t.test('Not in toggles, is refused beside a mark, and Log the rest fills in everyone else', async () => {
      await tap(mac, `[data-kid="${OSCAR}"] .notin`);
      await waitRec(mac, async id => !!(await window.__store.all()).find(r => r.id === id && !r.deletedAt), `miss_${OSCAR}_2-NBT-A-1_${TUE}`);
      await tap(mac, `[data-kid="${OSCAR}"] .notin`);
      await waitRec(mac, async id => !!(await window.__store.all()).find(r => r.id === id && r.deletedAt), `miss_${OSCAR}_2-NBT-A-1_${TUE}`);
      await tap(mac, `[data-kid="${MILA}"] .notin`);
      await mac.waitForFunction(() => /already has a mark/.test(document.getElementById('toast').textContent));
      await tap(mac, '[data-logrest]');
      await waitRec(mac, async id => !!(await window.__store.all()).find(r => r.id === id && !r.deletedAt), `miss_${OSCAR}_2-NBT-A-1_${TUE}`);
      assert.equal(await live(mac, `miss_${MILA}_2-NBT-A-1_${TUE}`), null, 'not for a child with a mark');
      assert.match(await mac.$eval('.waiting', e => e.innerText), new RegExp(LBL['2.NBT.A.1'] + ' · 10/6 · Lesson 2-4\\s+Oscar Lindqvist'));
    });

    await t.test('giving a mark takes a child off Still waiting on; Handed in and Excuse do too', async () => {
      await tap(mac, `[data-kid="${OSCAR}"] .mk[data-v="3"]`);
      await waitRec(mac, async id => !!((await window.__store.all()).find(r => r.id === id) || {}).received, `miss_${OSCAR}_2-NBT-A-1_${TUE}`);
      const before = await mac.$$eval('.wrow', e => e.length);
      await tap(mac, `[data-handin="miss_${OSCAR}_2-OA-A-1_2026-09-15"]`);
      await waitRec(mac, async id => !!((await window.__store.all()).find(r => r.id === id) || {}).received, `miss_${OSCAR}_2-OA-A-1_2026-09-15`);
      assert.equal(await mac.$$eval('.wrow', e => e.length), before - 1);
    });

    await t.test('grading together: a row per standard and All; one tap gives every standard the mark', async () => {
      await tap(mac, '[data-change]');   // with marks entered the card is folded; Change opens it
      await tap(mac, '.gpicks [data-multi]');
      const rows = await mac.$$eval(`[data-kid="${THEO}"] .mrow`, e => e.length);
      assert.equal(rows, 3, 'two standards and All');
      await tap(mac, `[data-all="${THEO}"][data-v="2"]`);
      await waitRec(mac, async ([a, b]) => { const all = await window.__store.all(); return [a, b].every(id => (all.find(r => r.id === id && !r.deletedAt) || {}).value === 2); },
        [markId(THEO, '2.NBT.A.1', TUE), markId(THEO, '2.NBT.A.3', TUE)]);
      assert.equal((await live(mac, markId(THEO, '2.NBT.A.3', TUE))).what, 'Lesson 2-4');
      await tap(mac, '[data-multistop]');
      assert.equal(await mac.$$eval('.mrow', e => e.length), 0);
    });

    await t.test('the iPhone: design A, nothing wider than the screen, buttons big enough to tap', async () => {
      await planTuesday(phone);
      await go(phone, `gradebook/#enter/${TUE}`);
      const m = await phone.evaluate(() => ({
        sw: document.documentElement.scrollWidth, w: innerWidth,
        small: [...document.querySelectorAll('.kid button, .gfoot button, .gnav')].filter(b => b.getBoundingClientRect().height < 44).length
      }));
      assert.ok(m.sw <= m.w, `scrolls sideways: ${m.sw} > ${m.w}`);
      assert.equal(m.small, 0, 'every button at least 44 px tall');
      await phone.screenshot({ path: path.join(SHOTS, 'gradebook-enter-390.png'), fullPage: true });
    });

    await t.test('the MacBook: the note sits beside the marks', async () => {
      await go(mac, `gradebook/#enter/${TUE}`);
      const r = await mac.evaluate(sid => {
        const k = document.querySelector(`[data-kid="${sid}"]`), a = k.querySelector('.mk').getBoundingClientRect(), n = k.querySelector('.knote').getBoundingClientRect();
        return { sameRow: Math.abs((a.top + a.bottom) / 2 - (n.top + n.bottom) / 2) < 6, right: n.left > a.right };
      }, JUNE);
      assert.deepEqual(r, { sameRow: true, right: true });
      await mac.screenshot({ path: path.join(SHOTS, 'gradebook-enter-1280.png'), fullPage: true });
    });

    await t.test('every mark button\'s text reaches 4.5:1, marked or not', async () => {
      const bad = await mac.evaluate(() => {
        const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        return [...document.querySelectorAll('.kid .mk, .kid .notin')].map(b => { const s = getComputedStyle(b); return [b.dataset.v || 'notin', b.getAttribute('aria-pressed'), ratio(s.color, s.backgroundColor)]; })
          .filter(([, , r]) => r < 4.5).map(x => x.join(' ') + ' ' + x[2].toFixed(2));
      });
      assert.deepEqual(bad, []);
    });

    await t.test('the Agenda look keeps the same layout on both devices', async () => {
      for (const [p, w] of [[phone, 390], [mac, 1280]]) {
        await p.evaluate(() => localStorage.setItem('planbook.look', 'agenda'));
        await p.reload({ waitUntil: 'domcontentloaded' });   // the look is applied as a page loads
        await p.waitForFunction('window.__ready === true', { timeout: 15000 }); await settled(p);
        assert.ok(await p.evaluate(() => document.documentElement.classList.contains('look-agenda')));
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await p.screenshot({ path: path.join(SHOTS, `gradebook-agenda-${w}.png`), fullPage: true });
        await p.evaluate(() => localStorage.removeItem('planbook.look'));
      }
    });

    await t.test('Settings: add a child, rename one, and one who leaves keeps their marks', async () => {
      await go(mac, 'gradebook/#settings');
      await mac.type('#newFirst', 'Wren'); await mac.type('#newLast', 'Castillo');
      await tap(mac, '[data-addkid]');
      await waitRec(mac, async () => (await window.__store.all()).some(r => r.type === 'student' && r.firstName === 'Wren' && r.lastName === 'Castillo' && r.active));
      await settled(mac);
      await mac.click(`input[data-stu="${OSCAR}"][data-f="firstName"]`, { clickCount: 3 });
      await mac.keyboard.type('Ozzie'); await mac.keyboard.press('Tab');
      await waitRec(mac, async id => (await window.__store.all()).find(r => r.id === id).firstName === 'Ozzie', OSCAR);
      await tap(mac, `input[data-stu="${JUNE}"][data-f="active"]`);
      await waitRec(mac, async id => (await window.__store.all()).find(r => r.id === id).active === false, JUNE);
      assert.ok((await rec(mac, JUNE)).left, 'the day she left is kept');
      assert.ok(await live(mac, markId(JUNE, '2.NBT.A.1', TUE)), 'her marks stay');
      await go(mac, `gradebook/#enter/${TUE}`);
      const kids = await mac.$$eval('.kid .kname', e => e.map(x => x.textContent));
      assert.deepEqual(kids, ['Wren Castillo', 'Ozzie Lindqvist', 'Mila Okafor', 'Theodore Reyes']);
    });

    // ---------- the gate ----------
    await t.test('the gate: a mark entered on the iPhone reaches the MacBook through the Drive folder', async () => {
      await go(mac, 'sync/');
      await mac.evaluate(async () => { const root = await navigator.storage.getDirectory(); await window.__t.useFolder(await root.getDirectoryHandle('drive', { create: true })); });
      await go(phone, `gradebook/#enter/${TUE}`);
      // The iPhone has its own standards switched on (settings travel by the Drive file too), so mark whatever it shows.
      const std = await phone.evaluate(() => window.__grade.std);
      await tap(phone, `[data-kid="${MILA}"] .mk[data-v="4"]`);
      await waitRec(phone, async id => ((await window.__store.all()).find(r => r.id === id && !r.deletedAt) || {}).value === 4, markId(MILA, std, TUE));
      await go(phone, 'sync/');
      await phone.click('#send');
      await phone.waitForFunction(() => window.__shared.length > 0);
      const sent = await phone.evaluate(() => window.__shared[window.__shared.length - 1]);
      assert.ok(sent.text.includes(markId(MILA, std, TUE)));
      await mac.evaluate(async (name, text) => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('drive');
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close();
      }, sent.name, sent.text);
      const scan = await mac.evaluate(() => window.__t.scanNow());
      assert.deepEqual(scan.merged, [sent.name]);
      assert.equal((await live(mac, markId(MILA, std, TUE))).value, 4, 'the iPhone\'s mark is in the MacBook\'s store');
      await go(mac, 'gradebook/#settings');
      if (!(await rec(mac, 'gbset_main')).on.includes(std)) await tap(mac, `[data-std-on="${std}"]`);
      await go(mac, `gradebook/#enter/${TUE}`);
      await settled(mac);
      if ((await mac.evaluate(() => window.__grade.std)) !== std) { await tap(mac, '[data-change]'); await mac.select('#e-std', std); await settled(mac); }
      assert.deepEqual(await pressed(mac, MILA), ['4'], 'the iPhone\'s 4 shows on the MacBook');
    });

    await t.test('no page errors', () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    server.close();
  }
});
