// Step 7 part 1's gate: v95's running-records page (with fluency-assess.js) and Planbook's ORF page run in
// Chrome on the same test clock, and the same taps are made on both: errors, self-corrections, what they
// said, teacher told, pauses, a second pass, stopped at the end, editing an earlier pass, changing the last
// word. v95's saved reading, brought in by Planbook's importer, must equal what Planbook's page saved, and
// both pages must show the same results. Needs the v95 suite on this machine (skipped elsewhere).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { findChrome, loadPuppeteer, serve, newPage } = require('./helpers/browser');

const V95 = process.env.V95_DIR || '/home/claude/v95/classroom-suite';
const ROOT = path.join(__dirname, '..');
const imp = require(path.join(ROOT, 'core', 'import-v95.js'));
const names = require(path.join(ROOT, 'core', 'names.js'));
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !fs.existsSync(path.join(V95, 'fluency', 'index.html')) ? 'v95 not on this machine' : !chrome || !puppeteer ? 'no Chrome here' : false;
const T0 = Date.parse('2026-10-06T16:00:00Z');
const FOX = "A small red fox lived at the edge of Mr. Patel's garden.\n\nEvery night she crept past the bean poles and sniffed the warm dirt. One morning the gate was open.";

const SCENES = {
  'errors, a self-correction, a pause, what they said and teacher told': [
    { start: 1 }, { tap: 3 }, { tap: 6 }, { tap: 6 }, { advance: 5000 }, { pause: 1 }, { advance: 10000 }, { pause: 1 },
    { tag: '0:3', said: 'fix', told: true }, { tag: '0:6', said: 'tha' }, { advance: 40000 }, { stop: 1 }, { last: 17 }, { save: 1 }],
  'two passes, time runs out, then a mark added on the first pass': [
    { start: 1 }, { tap: 1 }, { restart: 1 }, { tap: 2 }, { tap: 2 }, { tap: 9 }, { advance: 61000 }, { last: 10 }, { lap: 0 }, { tap: 5 },
    { tag: '0:5', said: 'egg' }, { save: 1 }],
  'started over, then stopped at the end': [
    { start: 1 }, { tap: 0 }, { restart: 1 }, { advance: 61000 }, { endOfPass: 1 }, { save: 1 }],
  'a restart taken back, the last word changed, a mark after it ignored': [
    { start: 1 }, { tap: 4 }, { restart: 1 }, { undoRestart: 1 }, { tap: 22 }, { advance: 30000 }, { stop: 1 }, { last: 13 }, { restop: 1 }, { last: 20 }, { save: 1 }]
};
const V95_SEL = { start: '#btnStart', pause: '#btnPause', restart: '#btnRestart', undoRestart: '#btnUndoRestart', stop: '#btnFinished',
  endOfPass: '#btnEndOfPass', restop: '#btnRestop', save: '#btnSaveRec', word: i => `#passage .w[data-i="${i}"]`, lap: n => `#results [data-lap="${n}"]`,
  tag: k => `[data-fa="${k}"]`, said: '#faSaid', told: '.fa-told', done: '.fa-done', results: '#results' };
const PB_SEL = { start: '[data-a="start"]', pause: '[data-a="pause"]', restart: '[data-a="restart"]', undoRestart: '[data-a="undoRestart"]', stop: '[data-a="stop"]',
  endOfPass: '[data-a="endOfPass"]', restop: '[data-a="restop"]', save: '[data-a="save"]', word: i => `.passage .w[data-i="${i}"]`, lap: n => `[data-lap="${n}"]`,
  tag: k => `[data-tag="${k}"]`, said: '#tagSaid', told: '[data-told]', done: '[data-tagdone]', results: '#results' };

async function play(page, sel, steps) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const click = async s => { await page.waitForSelector(s, { visible: true, timeout: 5000 }); await page.click(s); await wait(120); };
  let shown = null;
  for (const s of steps) {
    if (s.start) await click(sel.start);
    else if (s.tap != null) await click(sel.word(s.tap));
    else if (s.last != null) { await click(sel.word(s.last)); shown = await page.$eval(sel.results, e => e.innerText.replace(/\s+/g, ' ')); }
    else if (s.advance) { await page.evaluate(ms => { window.__t += ms; }, s.advance); await wait(450); }
    else if (s.pause) await click(sel.pause);
    else if (s.restart) await click(sel.restart);
    else if (s.undoRestart) await click(sel.undoRestart);
    else if (s.stop) await click(sel.stop);
    else if (s.endOfPass) { await click(sel.endOfPass); shown = await page.$eval(sel.results, e => e.innerText.replace(/\s+/g, ' ')); }
    else if (s.restop) await click(sel.restop);
    else if (s.lap != null) await click(sel.lap(s.lap));
    else if (s.tag) {
      await click(sel.tag(s.tag));
      await page.waitForSelector(sel.said, { visible: true });
      await page.type(sel.said, s.said);
      if (s.told) await click(sel.told);
      await click(sel.done);
    } else if (s.save) { shown = shown || await page.$eval(sel.results, e => e.innerText.replace(/\s+/g, ' ')); await click(sel.save); await wait(900); }
  }
  // The headline numbers as each page shows them: WCPM and accuracy.
  return (shown.match(/(\d+) words correct per minute/) || [])[1] + ' | ' + (shown.match(/([\d.]+%) accuracy/) || [])[1];
}

test('the same taps on v95\'s page and Planbook\'s save the same reading', { skip, timeout: 240000 }, async (t) => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v95-sample.json'), 'utf8'));
  const rr = JSON.parse(file.keys['running-records-v1']);
  rr.passages.push({ id: 'pfox', title: 'The Garden Fox', text: FOX });
  file.keys['running-records-v1'] = JSON.stringify(rr);
  const tmp = path.join(require('os').tmpdir(), 'orf-gate-sample.json');
  fs.writeFileSync(tmp, JSON.stringify(file));

  const v95srv = await new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = path.join(V95, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(V95) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : /\.css$/.test(p) ? 'text/css' : 'text/html' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
  const pbsrv = await serve();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const clock = () => { window.__t = 1791302400000; window.__now = () => window.__t; Date.now = () => window.__t; };
  try {
    for (const [name, steps] of Object.entries(SCENES)) {
      await t.test(name, async () => {
        // v95: its file in local storage (put in from a page with no scripts), its own clock driven.
        const vp = await (await browser.createBrowserContext()).newPage();
        await vp.setViewport({ width: 1280, height: 900 });
        await vp.setRequestInterception(true);
        vp.on('request', r => /^http:\/\/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.abort());
        await vp.evaluateOnNewDocument(clock);
        const vbase = `http://127.0.0.1:${v95srv.address().port}`;
        await vp.goto(vbase + '/_headers', { waitUntil: 'domcontentloaded' });
        await vp.evaluate(keys => { localStorage.clear(); for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); }, file.keys);
        await vp.goto(vbase + '/fluency/', { waitUntil: 'load' });
        await vp.waitForSelector('#btnPause');
        await vp.select('#selStudent', 'gb:k3j9x2a'); await vp.select('#selPassage', 'pfox');
        await new Promise(r => setTimeout(r, 300));
        const v95shown = await play(vp, V95_SEL, steps);
        const stored = await vp.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
        const before = new Set(rr.records.map(r => r.id));
        const newV95 = JSON.parse(stored['running-records-v1']).records.filter(r => !before.has(r.id));
        assert.equal(newV95.length, 1, 'v95 saved one reading');
        const o = imp.convert(Object.assign({}, file, { keys: stored }), { names, extraSubjects: read('data/planner-defaults.json').extraSubjects });
        const theirs = o.records.find(r => r.id === 'orf_' + newV95[0].id) || o.records.find(r => r.type === 'orfCheck' && r.passageId && /pfox/.test(r.passageId) && !/^orf_r_/.test(r.id));
        assert.ok(theirs, 'the importer brought v95\'s new reading in');

        // Planbook: the same file imported, the same taps.
        const pp = await newPage(await browser.createBrowserContext(), { width: 1280 });
        await pp.evaluateOnNewDocument(clock);
        const pbase = `http://127.0.0.1:${pbsrv.address().port}/Planbook`;
        await pp.goto(`${pbase}/import/`, { waitUntil: 'domcontentloaded' }); await pp.waitForFunction('window.__ready');
        await (await pp.$('#file')).uploadFile(tmp);
        await pp.waitForFunction("!document.getElementById('preview').hidden"); await pp.click('#load'); await pp.waitForFunction("!document.getElementById('result').hidden");
        await pp.goto(`${pbase}/orf/`, { waitUntil: 'domcontentloaded' }); await pp.waitForFunction('window.__ready === true');
        await pp.select('#a-sid', 'stu_k3j9x2a'); await new Promise(r => setTimeout(r, 200));
        await pp.select('#a-pid', theirs.passageId); await new Promise(r => setTimeout(r, 300));
        const pbShown = await play(pp, PB_SEL, steps);
        const mine = (await pp.evaluate(async () => (await window.__store.all()).filter(r => r.type === 'orfCheck' && !/^orf_r_/.test(r.id))))[0];
        assert.ok(mine, 'Planbook saved the reading');

        assert.equal(pbShown, v95shown, 'the same WCPM and accuracy shown');
        const keep = r => ({ studentId: r.studentId, passageId: r.passageId, passageTitle: r.passageTitle, passageWords: r.passageWords, seconds: r.seconds,
          passes: r.passes, wordsRead: r.wordsRead, errors: r.errors, selfCorrections: r.selfCorrections, wcpm: r.wcpm, pausedSeconds: r.pausedSeconds || 0, marked: r.marked || [] });
        assert.deepEqual(keep(mine), keep(theirs));
      });
    }
  } finally {
    await browser.close();
    v95srv.close(); pbsrv.close();
  }
});
