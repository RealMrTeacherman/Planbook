// Step 7 part 1 in real Chrome: the ORF tool's Assess, Passages and Students, for a colleague using it alone
// and for the teacher with a gradebook. (tests/orf-v95.browser.test.js compares the readings with v95's.)
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
const FOX = "A small red fox lived at the edge of Mr. Patel's garden.\n\nEvery night she crept past the bean poles and sniffed the warm dirt.";

test('the ORF tool: alone, and beside a gradebook', { skip, timeout: 240000 }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/Planbook`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const colleague = await newPage(await browser.createBrowserContext(), { width: 390, iphone: true });
  const mac = await newPage(await browser.createBrowserContext(), { width: 1280 });
  const phone = await newPage(await browser.createBrowserContext(), { width: 390, iphone: true });
  const errors = [];
  for (const p of [colleague, mac, phone]) {
    p.on('pageerror', e => errors.push(e.message));
    await p.evaluateOnNewDocument(() => { window.__t = Date.parse('2026-10-06T16:00:00Z'); window.__now = () => window.__t; });
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const go = async (page, where) => { await page.goto(`${base}/${where}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction('window.__ready === true', { timeout: 15000 }); await wait(300); };
  const tap = async (page, sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel); await wait(150); };
  const checks = page => page.evaluate(async () => (await window.__store.all()).filter(r => r.type === 'orfCheck' && !r.deletedAt && !/^orf_r_/.test(r.id)));
  const read = async (page, kid) => {
    await page.select('#a-sid', kid); await wait(150);
    await tap(page, '[data-a="start"]');
    await tap(page, '.passage .w[data-i="3"]');
    await page.evaluate(() => { window.__t += 30000; });
    await tap(page, '[data-a="stop"]');
    await tap(page, '.passage .w[data-i="13"]');
    await tap(page, '[data-a="save"]');
    await wait(500);
  };

  try {
    await t.test('a colleague with nothing yet: the page says where to start', async () => {
      await go(colleague, 'orf/');
      assert.match(await colleague.$eval('#cue', e => e.textContent), /Add your class on the Students tab first/);
      assert.equal(await colleague.$eval('[data-a="start"]', e => e.disabled), true);
    });

    await t.test('alone: paste a class list, "Last, First" or "First Last"; a name twice is added once', async () => {
      await go(colleague, 'orf/#students');
      await colleague.type('#rosterInput', 'Ada Lovelace\nCarter, Ben\nChloe Nguyen\nAda Lovelace');
      await tap(colleague, '[data-roster]');
      await colleague.waitForFunction(() => document.querySelectorAll('.slist li').length === 3);
      const kids = await colleague.evaluate(async () => (await window.__store.all()).filter(r => r.type === 'student').map(s => [s.firstName, s.lastName || '']).sort());
      assert.deepEqual(kids, [['Ada', 'Lovelace'], ['Ben', 'Carter'], ['Chloe', 'Nguyen']]);
    });

    await t.test('alone: add a passage, then read it and save', async () => {
      await go(colleague, 'orf/#passages');
      await colleague.type('#newTitle', 'The Garden Fox');
      await colleague.evaluate(t => { document.getElementById('newText').value = t; }, FOX);
      await tap(colleague, '[data-padd]');
      await colleague.waitForFunction(() => /The Garden Fox/.test(document.querySelector('.plist').innerText));
      await go(colleague, 'orf/');
      const kid = await colleague.$eval('#a-sid', e => e.value);
      await read(colleague, kid);
      const c = await checks(colleague);
      assert.equal(c.length, 1);
      assert.deepEqual([c[0].wordsRead, c[0].errors, c[0].wcpm, c[0].seconds, c[0].passageTitle], [13, 1, 24, 30, 'The Garden Fox'], '12 correct in 30 s is 24 a minute');
      assert.match(await colleague.$eval('#toast', e => e.textContent), /Saved — .*, 24 WCPM/);
    });

    await t.test('the iPhone: nothing wider than the screen, every control big enough to tap', async () => {
      await tap(colleague, '[data-a="start"]');
      await tap(colleague, '.passage .w[data-i="1"]');
      const m = await colleague.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth,
        small: [...document.querySelectorAll('#assessView button, #assessView select')].filter(b => b.offsetParent && !b.classList.contains('tag') && b.getBoundingClientRect().height < 40).map(b => b.textContent.trim()) }));
      assert.ok(m.sw <= m.w, `scrolls sideways: ${m.sw}`);
      assert.deepEqual(m.small, []);
      const tagArea = await colleague.$eval('.passage .tag', e => { const s = getComputedStyle(e, '::before'); return [e.getBoundingClientRect().height + parseFloat(s.top) * -1 + parseFloat(s.bottom) * -1]; });
      assert.ok(tagArea[0] >= 44, 'a tag\'s tap area is 44 px');
      await colleague.screenshot({ path: path.join(SHOTS, 'orf-390.png'), fullPage: true });
      await tap(colleague, '[data-a="stop"]');
      await tap(colleague, '[data-a="clear"]');
    });

    await t.test('with a gradebook: the class list is the Gradebook\'s, and cannot be pasted here', async () => {
      for (const p of [mac, phone]) {
        await go(p, 'import/');
        await (await p.$('#file')).uploadFile(SAMPLE);
        await p.waitForFunction("!document.getElementById('preview').hidden");
        await p.click('#load');
        await p.waitForFunction("!document.getElementById('result').hidden");
      }
      await go(mac, 'orf/#students');
      assert.match(await mac.$eval('#studentsView', e => e.innerText), /comes from the Gradebook/);
      assert.equal(await mac.$('#rosterInput'), null);
      await go(mac, 'orf/');
      assert.deepEqual(await mac.$$eval('#a-sid option', o => o.map(x => x.textContent)), ['Banks, Juniper', 'Lindqvist, Oscar', 'Okafor, Mila', 'Reyes, Theodore'], 'the class, by last name; not the child who left');
    });

    await t.test('the iPhone: a tag for what they said, teacher told, saved with the reading', async () => {
      await go(phone, 'orf/');
      await phone.evaluate(async t => { await window.__store.write([{ id: 'pas_garden1', type: 'orfPassage', deletedAt: null, title: 'The Garden Fox', text: t }], 'a test'); }, FOX);
      await wait(400);
      await phone.select('#a-pid', 'pas_garden1'); await wait(200);
      await phone.select('#a-sid', 'stu_k3j9x2a'); await wait(150);
      await tap(phone, '[data-a="start"]');
      await tap(phone, '.passage .w[data-i="3"]');
      await tap(phone, '[data-tag="0:3"]');
      await phone.type('#tagSaid', 'fix');
      await tap(phone, '[data-told="0:3"]');
      await tap(phone, '[data-tagdone]');
      assert.equal(await phone.$eval('[data-tag="0:3"]', e => e.textContent), 'fix · T');
      await phone.evaluate(() => { window.__t += 61000; });
      await phone.waitForFunction(() => /Time\. Tap the last word/.test(document.getElementById('cue').textContent), { timeout: 5000 });
      await tap(phone, '.passage .w[data-i="9"]');
      await tap(phone, '[data-a="save"]');
      await wait(500);
      const c = (await checks(phone)).find(r => r.studentId === 'stu_k3j9x2a');
      assert.deepEqual(c.marked, [{ kind: 'error', word: 'fox', teacherTold: true, said: 'fix' }]);
      assert.equal(c.passageId, 'pas_garden1');
    });

    await t.test('every word, mark and tag readable at 4.5:1, in both looks', async () => {
      for (const look of ['', 'agenda']) {
        await mac.evaluate(l => { if (l) localStorage.setItem('planbook.look', l); else localStorage.removeItem('planbook.look'); }, look);
        await go(mac, 'orf/');
        await mac.evaluate(async t => { await window.__store.write([{ id: 'pas_garden1', type: 'orfPassage', deletedAt: null, title: 'The Garden Fox', text: t }], 'a test'); }, FOX);
        await wait(300);
        await mac.select('#a-pid', 'pas_garden1'); await wait(200);
        await tap(mac, '[data-a="start"]');
        await tap(mac, '.passage .w[data-i="3"]');
        await tap(mac, '.passage .w[data-i="5"]'); await tap(mac, '.passage .w[data-i="5"]');
        const bad = await mac.evaluate(() => {
          const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
          const bg = e => { while (e) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; e = e.parentElement; } return 'rgb(255,255,255)'; };
          return [...document.querySelectorAll('.passage .w, .passage .tag, .clock, .tally b, .cue')].map(e => [e.className, ratio(getComputedStyle(e).color, bg(e))]).filter(([, r]) => r < 4.5).map(x => x.join(' '));
        });
        assert.deepEqual(bad, [], look || 'color blocks');
        if (look) await mac.screenshot({ path: path.join(SHOTS, 'orf-agenda-1280.png'), fullPage: true });
        await tap(mac, '[data-a="stop"]');
        await tap(mac, '[data-a="clear"]');
      }
      await mac.evaluate(() => localStorage.removeItem('planbook.look'));
    });

    await t.test('no page errors', () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    server.close();
  }
});
