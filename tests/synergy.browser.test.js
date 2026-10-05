// Step 6b in real Chrome: the For Synergy view. Every cell on screen is checked against core/report.js
// (which tests/report-v95.browser.test.js checks against v95), on the page's own records.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findChrome, loadPuppeteer, serve, newPage } = require('./helpers/browser');
const R = require('../core/report.js');
R.useNorms(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'orf-norms.json'), 'utf8')));

const SAMPLE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'suite-screens');
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !chrome || !puppeteer ? 'no Chrome or puppeteer-core here' : false;
const K = ['stu_k3j9x2a', 'stu_p8q7r6s', 'stu_z1y2x3w', 'stu_ab-2e9'];
const MILA = 'stu_k3j9x2a', OSCAR = 'stu_ab-2e9';
// Weeks of marks in Quarter 1 (Sep 2 – Nov 6), and a little in Quarter 2.
const PLAN = { '2.OA.A.1': [['2026-09-22', [2, 3, 1, 4]], ['2026-10-01', [3, 3, 2, 4]], ['2026-11-20', [4, 2, 2, 3]]],
  '2.NBT.B.5': [['2026-09-24', [1, 2, 4, 3]], ['2026-10-02', [2, 3, 4, 2]]], '2.RL.1': [['2026-09-29', [3, 1, 4, 2]]] };

test('For Synergy: each child\'s mark for each standard, on MacBook and iPhone', { skip, timeout: 240000 }, async (t) => {
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
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 250)); const now = await page.evaluate(() => window.__renders || 0); if (now === last) return; last = now; }
  };
  const go = async (page, where) => {
    await page.goto(`${base}/${where}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true', { timeout: 15000 });
    await settled(page);
  };
  const tap = async (page, sel) => { await settled(page); await page.click(sel); await settled(page); };
  const waitRec = (page, fn, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg);
  const all = page => page.evaluate(async () => (await window.__store.all()).filter(r => !r.deletedAt));
  const setup = async page => {
    await go(page, 'import/');
    await (await page.$('#file')).uploadFile(SAMPLE);
    await page.waitForFunction("!document.getElementById('preview').hidden");
    await page.click('#load');
    await page.waitForFunction("!document.getElementById('result').hidden");
    await go(page, 'gradebook/#synergy');
    await page.evaluate(async (plan, K) => {
      const rows = [];
      for (const [std, ds] of Object.entries(plan)) ds.forEach(([d, vs]) => vs.forEach((v, i) => rows.push({ id: `mark_${K[i]}_${std.replace(/\./g, '-')}_${d}`, type: 'mark', deletedAt: null, studentId: K[i], standard: std, date: d, value: v, source: null })));
      await window.__store.write(rows, 'Enter scores');
    }, PLAN, K);
    await settled(page);
  };
  // What core/report.js says each cell should be, from the page's own records.
  const expected = async (page, periodName, codes) => {
    const recs = await all(page), by = ty => recs.filter(r => r.type === ty);
    const terms = by('gradingPeriod'), term = terms.find(x => x.name === periodName);
    const c = R.context({ marks: by('mark'), checks: by('orfCheck'), settings: by('gradebookSettings')[0], terms, overrides: by('markOverride') });
    const out = {};
    by('student').filter(s => s.active).forEach(s => codes.forEach(code => { const f = R.finalMark(c, s.id, code, term); out[s.id + '|' + code] = f; }));
    return out;
  };
  const cells = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('button.cell[data-cell]')].map(b => [b.dataset.cell, { text: b.textContent.trim(), over: b.classList.contains('over'), carried: b.classList.contains('carried') }])));
  const same = (shown, want) => {
    for (const [k, s] of Object.entries(shown)) {
      const f = want[k];
      assert.ok(f, 'a cell for ' + k);
      assert.deepEqual(s, { text: f.v ? String(f.v) : '–', over: !!f.over, carried: !!f.carried }, k);
    }
  };

  try {
    await setup(mac); await setup(phone);

    await t.test('every cell is what the calculation gives; only standards with a mark get a column', async () => {
      await mac.select('#y-subject', 'Math'); await settled(mac);
      const shown = await cells(mac);
      const want = await expected(mac, 'Quarter 1', ['2.OA.A.1', '2.NBT.B.5']);
      assert.equal(Object.keys(shown).length, 8, 'four children × two Math standards with marks');
      same(shown, want);
      assert.equal(shown[OSCAR + '|2.OA.A.1'].text, '4');
      assert.equal(shown['stu_z1y2x3w|2.NBT.B.5'].text, '4');
    });

    await t.test('Quarter 2: a standard with no marks this quarter shows the carried mark, dashed', async () => {
      await tap(mac, '[data-period="gp_term_t2"]');
      const shown = await cells(mac);
      same(shown, await expected(mac, 'Quarter 2', ['2.OA.A.1', '2.NBT.B.5']));
      assert.ok(shown[MILA + '|2.NBT.B.5'].carried, 'carried from Quarter 1');
      assert.match(await mac.$eval(`[data-cell="${MILA}|2.NBT.B.5"]`, e => e.getAttribute('aria-label')), /carried from Quarter 1/);
      assert.match(await mac.$eval('.gaps', e => e.innerText), /2\.NBT\.B\.5 .*: 4 students carried from an earlier quarter/);
    });

    await t.test('with carry forward off, those cells have nothing to go on', async () => {
      await tap(mac, '#y-carry');
      await waitRec(mac, async () => (await window.__store.all()).find(r => r.id === 'gbset_main').carryForward === false);
      await settled(mac);
      same(await cells(mac), await expected(mac, 'Quarter 2', ['2.OA.A.1', '2.NBT.B.5']));
      assert.equal(await mac.$$eval('button.cell[data-cell$="|2.NBT.B.5"]', e => e.length), 0, 'no marks at all: no column');
      await tap(mac, '#y-carry');
      await waitRec(mac, async () => (await window.__store.all()).find(r => r.id === 'gbset_main').carryForward === true);
    });

    await t.test('the marks behind a cell, and setting your own; Undo and "go back" take it away', async () => {
      await tap(mac, '[data-period="gp_term_t1"]');
      await tap(mac, `[data-cell="${MILA}|2.OA.A.1"]`);
      const detail = await mac.$eval('.syn-detail', e => e.innerText);
      assert.match(detail, /Mila Okafor/);
      assert.match(detail, /Worked out with recent work counting more/);
      assert.deepEqual(await mac.$$eval('.syn-detail .evm b', e => e.map(x => x.textContent)), ['3', '2', '4', '3'], 'Sep 15 and Sep 29 (imported), Sep 22, Oct 1: oldest first');
      await tap(mac, '.syn-detail [data-over="4"]');
      await waitRec(mac, async () => ((await window.__store.all()).find(r => r.id === 'ovr_gp_term_t1_stu_k3j9x2a_2-OA-A-1' && !r.deletedAt) || {}).value === 4);
      let shown = await cells(mac);
      assert.deepEqual(shown[MILA + '|2.OA.A.1'], { text: '4', over: true, carried: false });
      same(shown, await expected(mac, 'Quarter 1', ['2.OA.A.1', '2.NBT.B.5']));
      await tap(mac, '.syn-detail [data-over="0"]');
      await waitRec(mac, async () => !!(await window.__store.all()).find(r => r.id === 'ovr_gp_term_t1_stu_k3j9x2a_2-OA-A-1' && r.deletedAt));
      shown = await cells(mac);
      assert.equal(shown[MILA + '|2.OA.A.1'].over, false);
    });

    await t.test('changing the rule changes the marks, and is kept', async () => {
      await mac.select('#y-rule', 'latest');
      await waitRec(mac, async () => (await window.__store.all()).find(r => r.id === 'gbset_main').rule === 'latest');
      await settled(mac);
      same(await cells(mac), await expected(mac, 'Quarter 1', ['2.OA.A.1', '2.NBT.B.5']));
      await mac.select('#y-rule', 'weighted');
      await waitRec(mac, async () => (await window.__store.all()).find(r => r.id === 'gbset_main').rule === 'weighted');
    });

    await t.test('ORF: a reading ticked off in Settings leaves the fluency marks', async () => {
      await go(mac, 'gradebook/#settings');
      assert.equal(await mac.$eval('[data-orfcount="orf_r_moved"]', e => e.checked), false, 'imported as not counting');
      await tap(mac, '[data-orfcount="orf_r_evening"]');
      await waitRec(mac, async () => (await window.__store.all()).find(r => r.id === 'gbset_main').orfLeftOut.includes('orf_r_evening'));
      await go(mac, 'gradebook/#synergy');
      await mac.select('#y-subject', 'ELA'); await settled(mac);
      const shown = await cells(mac);
      same(shown, await expected(mac, 'Quarter 1', ['2.RF.4', '2.RL.1']));
      assert.deepEqual(shown[MILA + '|2.RF.4'], { text: '–', over: false, carried: false }, 'Mila\'s only reading no longer counts; Juniper\'s keeps the column');
      await go(mac, 'gradebook/#settings');
      await tap(mac, '[data-orfcount="orf_r_evening"]');
      await waitRec(mac, async () => !(await window.__store.all()).find(r => r.id === 'gbset_main').orfLeftOut.includes('orf_r_evening'));
      await go(mac, 'gradebook/#synergy'); await settled(mac);
      assert.equal((await cells(mac))[MILA + '|2.RF.4'].text, '1', '54 WCPM against end-of-year norms');
    });

    await t.test('the iPhone: one child at a time; tap a standard to see and set it', async () => {
      await go(phone, 'gradebook/#synergy');
      await phone.select('#y-subject', 'Math'); await settled(phone);
      const rows = await phone.$$eval('.syn-row', e => e.map(x => x.dataset.cell));
      assert.deepEqual(rows, ['stu_z1y2x3w|2.OA.A.1', 'stu_z1y2x3w|2.NBT.B.5'], 'Juniper first, as in Synergy');
      await tap(phone, '.syn-row[data-cell="stu_z1y2x3w|2.OA.A.1"]');
      await tap(phone, '.syn-detail [data-over="3"]');
      await waitRec(phone, async () => ((await window.__store.all()).find(r => r.id === 'ovr_gp_term_t1_stu_z1y2x3w_2-OA-A-1') || {}).value === 3);
      const m = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth,
        small: [...document.querySelectorAll('#synergyView button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 40).map(b => b.textContent.trim()) }));
      assert.ok(m.sw <= m.w, 'nothing wider than the screen');
      assert.deepEqual(m.small, []);
      await phone.screenshot({ path: path.join(SHOTS, 'synergy-390.png'), fullPage: true });
      await tap(phone, '[data-synkid="1"]');
      assert.match(await phone.$eval('#y-kid', e => e.selectedOptions[0].textContent), /Oscar Lindqvist/);
    });

    await t.test('every mark\'s text reaches 4.5:1, and both looks keep the layout', async () => {
      await go(mac, 'gradebook/#synergy');
      await mac.select('#y-subject', 'All'); await settled(mac);
      const bad = await mac.evaluate(() => {
        const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        return [...document.querySelectorAll('button.cell')].map(b => { const s = getComputedStyle(b); return [b.dataset.cell, ratio(s.color, s.backgroundColor)]; }).filter(([, r]) => r < 4.5).map(x => x.join(' '));
      });
      assert.deepEqual(bad, []);
      await mac.screenshot({ path: path.join(SHOTS, 'synergy-1280.png'), fullPage: true });
      for (const [p, w] of [[phone, 390], [mac, 1280]]) {
        await p.evaluate(() => localStorage.setItem('planbook.look', 'agenda'));
        await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction('window.__ready === true'); await settled(p);
        assert.ok(await p.evaluate(() => document.documentElement.classList.contains('look-agenda') && document.documentElement.scrollWidth <= innerWidth));
        await p.screenshot({ path: path.join(SHOTS, `synergy-agenda-${w}.png`), fullPage: true });
        await p.evaluate(() => localStorage.removeItem('planbook.look'));
      }
    });

    await t.test('no page errors', () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    server.close();
  }
});
