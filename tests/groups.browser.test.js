// Step 6c in real Chrome: the Groups view (design C). What is on screen is checked against core/groups.js
// (which tests/groups-v95.browser.test.js checks against v95), on the page's own records.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findChrome, loadPuppeteer, serve, newPage } = require('./helpers/browser');
const R = require('../core/report.js');
const G = require('../core/groups.js');
R.useNorms(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'orf-norms.json'), 'utf8')));
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'standards-grade2.json'), 'utf8')).standards;

const SAMPLE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'suite-screens');
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !chrome || !puppeteer ? 'no Chrome or puppeteer-core here' : false;
const K = ['stu_k3j9x2a', 'stu_p8q7r6s', 'stu_z1y2x3w', 'stu_ab-2e9'];
const MILA = 'stu_k3j9x2a', JUNE = 'stu_z1y2x3w', OSCAR = 'stu_ab-2e9';
const PLAN = { '2.OA.A.1': [['2026-09-22', [2, 3, 1, 4]], ['2026-10-01', [3, 3, 2, 4]]], '2.NBT.B.5': [['2026-09-24', [1, 2, 4, 3]], ['2026-10-02', [2, 3, 4, 2]]] };

test('Groups & patterns on MacBook and iPhone', { skip, timeout: 240000 }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/Planbook`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const mac = await newPage(await browser.createBrowserContext(), { width: 1280 });
  const phone = await newPage(await browser.createBrowserContext(), { width: 390, iphone: true });
  const errors = [];
  for (const p of [mac, phone]) { p.on('pageerror', e => errors.push(e.message)); await p.evaluateOnNewDocument(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; }); }
  const settled = async page => {
    let last = await page.evaluate(() => window.__renders || 0);
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 250)); const now = await page.evaluate(() => window.__renders || 0); if (now === last) return; last = now; }
  };
  const go = async (page, where) => { await page.goto(`${base}/${where}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction('window.__ready === true', { timeout: 15000 }); await settled(page); };
  const tap = async (page, sel) => { await settled(page); await page.click(sel); await settled(page); };
  const waitRec = (page, fn, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg);
  const setup = async page => {
    await go(page, 'import/');
    await (await page.$('#file')).uploadFile(SAMPLE);
    await page.waitForFunction("!document.getElementById('preview').hidden");
    await page.click('#load');
    await page.waitForFunction("!document.getElementById('result').hidden");
    await go(page, 'gradebook/#groups');
    await page.evaluate(async (plan, K) => {
      const rows = [];
      for (const [std, ds] of Object.entries(plan)) ds.forEach(([d, vs]) => vs.forEach((v, i) => rows.push({ id: `mark_${K[i]}_${std.replace(/\./g, '-')}_${d}`, type: 'mark', deletedAt: null, studentId: K[i], standard: std, date: d, value: v, source: null })));
      await window.__store.write(rows, 'Enter scores');
    }, PLAN, K);
    // The page picks its standard as it opens (and keeps it, as v95 does): open it again, a real reload.
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction('window.__ready === true', { timeout: 15000 }); await settled(page);
  };
  // What core/groups.js gives, from the page's own records.
  const expected = async (page, sel, k, subject = 'Math') => {
    const recs = await page.evaluate(async () => (await window.__store.all()).filter(r => !r.deletedAt));
    const by = ty => recs.filter(r => r.type === ty), settings = by('gradebookSettings')[0];
    const o = { students: by('student').filter(s => s.active), all: G.allMarks(R, by('mark'), by('orfCheck'), settings),
      codes: catalog.filter(c => settings.on.includes(c.code) && (subject === 'All' || c.subject === subject)).map(c => c.code), days: '0', ev: 'both', now: new Date() };
    const s = sel || G.defaultSel(o);
    const pins = Object.fromEntries(by('groupPin').filter(p => p.subject === subject && p.standard === (s === '__all' ? null : s)).map(p => [p.studentId, p.group]));
    const r = G.buildSkillGroups(o, s, k, pins);
    return { sel: s, groups: r.groups.map(g => g.map(x => x.sid)), out: r.out.map(x => x.sid), moved: r.moved, flags: G.flags(o).length, need: G.buildNeedGroups(o, true).length, glance: G.glance(o).codes.length };
  };
  const shown = page => page.evaluate(() => ({
    sel: document.getElementById('g-std').value,
    groups: [...document.querySelectorAll('.g-box')].map(b => [...b.querySelectorAll('[data-gkid]')].map(c => c.dataset.gkid)),
    out: [...document.querySelectorAll('.g-out [data-gkid]')].map(c => c.dataset.gkid),
    moved: [...document.querySelectorAll('.gchipk.moved')].map(c => c.dataset.gkid),
    flags: document.querySelectorAll('.g-flag').length, need: document.querySelectorAll('.g-need:not(.ext)').length,
    glance: document.querySelectorAll('.g-glance thead .std-h').length }));
  const same = async (page, k, sel) => {
    const s = await shown(page), want = await expected(page, sel, k);
    assert.equal(s.sel, want.sel);
    assert.deepEqual([s.groups, s.out, s.flags, s.need, s.glance], [want.groups, want.out, want.flags, want.need, want.glance]);
    return s;
  };

  try {
    await setup(mac); await setup(phone);

    await t.test('the groups on screen are what the grouping gives; the standard with the newest mark is picked', async () => {
      const s = await same(mac, 4);
      assert.equal(s.sel, '2.NBT.B.5');
      assert.equal(s.groups.length, 4);
    });

    await t.test('three groups, or all Math standards together', async () => {
      await mac.select('#g-k', '3'); await settled(mac);
      await same(mac, 3);
      await mac.select('#g-std', '__all'); await settled(mac);
      await same(mac, 3, '__all');
      await mac.select('#g-std', '2.NBT.B.5'); await settled(mac);   // each change redraws the card: one at a time
      await mac.select('#g-k', '4'); await settled(mac);
      assert.equal(await mac.$eval('#g-k', e => e.value), '4');
    });

    await t.test('moving a child: the sheet, a pin that stays, Not placed, and letting the marks place them again', async () => {
      await tap(mac, `[data-gkid="${JUNE}"]`);
      await tap(mac, '.g-sheet [data-gto="0"]');
      await waitRec(mac, async () => ((await window.__store.all()).find(r => r.id === 'pin_Math_2-NBT-B-5_stu_z1y2x3w' && !r.deletedAt) || {}).group === 0);
      let s = await same(mac, 4);
      assert.ok(s.groups[0].includes(JUNE) && s.moved.includes(JUNE), 'Juniper in Group 1, marked as moved');
      await tap(mac, `[data-gkid="${OSCAR}"]`);
      await tap(mac, '.g-sheet [data-gto="-1"]');
      await waitRec(mac, async () => ((await window.__store.all()).find(r => r.id === 'pin_Math_2-NBT-B-5_stu_ab-2e9' && !r.deletedAt) || {}).group === -1);
      s = await same(mac, 4);
      assert.deepEqual(s.out, [OSCAR]);
      await tap(mac, `[data-gkid="${OSCAR}"]`);
      await tap(mac, '.g-sheet [data-gunpin]');
      await waitRec(mac, async () => !!(await window.__store.all()).find(r => r.id === 'pin_Math_2-NBT-B-5_stu_ab-2e9' && r.deletedAt));
      await same(mac, 4);
    });

    await t.test('dragging a child to another group on the MacBook', async () => {
      await settled(mac);
      await mac.evaluate(sid => {
        const chip = document.querySelector(`[data-gkid="${sid}"]`), box = document.querySelectorAll('.g-box')[3], dt = new DataTransfer();
        chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        box.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        box.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      }, MILA);
      await waitRec(mac, async () => ((await window.__store.all()).find(r => r.id === 'pin_Math_2-NBT-B-5_stu_k3j9x2a' && !r.deletedAt) || {}).group === 3);
      await settled(mac);
      const s = await same(mac, 4);
      assert.ok(s.groups[3].includes(MILA));
    });

    await t.test('Undo my moves puts everyone back where the marks place them', async () => {
      assert.match(await mac.$eval('[data-gclear]', e => e.textContent), /Undo my moves \(2\)/);
      await tap(mac, '[data-gclear]');
      await waitRec(mac, async () => !(await window.__store.all()).some(r => r.type === 'groupPin' && !r.deletedAt));
      const s = await same(mac, 4);
      assert.deepEqual(s.moved, []);
      assert.equal(await mac.$('[data-gclear]'), null);
    });

    await t.test('Print these groups prints just the groups', async () => {
      await tap(mac, '[data-gprint]');
      assert.equal(await mac.evaluate(() => window.__printed), 1);
      assert.match(await mac.$eval('#printSheet', e => e.textContent), /2\.NBT\.B\.5 · Fluency within 100.*Math skill groups/s);
      await mac.screenshot({ path: path.join(SHOTS, 'groups-1280.png'), fullPage: true });
    });

    await t.test('the iPhone: tabs two by two, nothing wider than the screen, the Move sheet', async () => {
      await go(phone, 'gradebook/#groups');
      const m = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth,
        small: [...document.querySelectorAll('#groupsView button, .tabs button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 40).map(b => b.textContent.trim()) }));
      assert.ok(m.sw <= m.w, `scrolls sideways: ${m.sw}`);
      assert.deepEqual(m.small, []);
      await same(phone, 4);
      await tap(phone, `[data-gkid="${MILA}"]`);
      assert.deepEqual(await phone.$$eval('.g-sheet [data-gto]', e => e.map(x => x.getAttribute('aria-label') || x.textContent.trim())), ['Group 1', 'Group 2', 'Group 3', 'Group 4', 'Not placed']);
      await phone.screenshot({ path: path.join(SHOTS, 'groups-390.png'), fullPage: true });
      await tap(phone, '.g-sheet [data-gclose]');
    });

    await t.test('ELA, and every mark and tag readable at 4.5:1, in both looks', async () => {
      await tap(mac, '[data-gsubj="ELA"]');
      assert.equal((await shown(mac)).groups.length > 0 || (await shown(mac)).out.length > 0, true);
      for (const [p, w] of [[mac, 1280], [phone, 390]]) {
        for (const look of ['', 'agenda']) {
          await p.evaluate(l => { if (l) localStorage.setItem('planbook.look', l); else localStorage.removeItem('planbook.look'); }, look);
          await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction('window.__ready === true'); await settled(p);
          const bad = await p.evaluate(() => {
            const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
            const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
            return [...document.querySelectorAll('#groupsView .gmk, #groupsView .tagk, #groupsView .cell')].map(e => { const s = getComputedStyle(e); return [e.className, ratio(s.color, s.backgroundColor)]; })
              .filter(([, r]) => r < 4.5).map(x => x.join(' '));
          });
          assert.deepEqual(bad, [], `${w} ${look || 'color blocks'}`);
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          if (look) await p.screenshot({ path: path.join(SHOTS, `groups-agenda-${w}.png`), fullPage: true });
        }
        await p.evaluate(() => localStorage.removeItem('planbook.look'));
      }
    });

    await t.test('no page errors', () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    server.close();
  }
});
