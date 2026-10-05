// Step 6b's gate: for every child × standard × quarter, under all three rules, with carry forward on and off
// and iReady in and out, v95's own finalMark (called with a line of one standard, in Chrome) and Planbook's
// report.js give the same mark, the same "set by you", the same count and the same "carried from".
// v95's data is a year of invented marks; Planbook works from what v95 stores, through the importer.
// Needs the v95 suite on this machine (skipped elsewhere, e.g. on GitHub).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { findChrome, loadPuppeteer } = require('./helpers/browser');

const V95 = process.env.V95_DIR || '/home/claude/v95/classroom-suite';
const ROOT = path.join(__dirname, '..');
const imp = require(path.join(ROOT, 'core', 'import-v95.js'));
const R = require(path.join(ROOT, 'core', 'report.js'));
const names = require(path.join(ROOT, 'core', 'names.js'));
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !fs.existsSync(path.join(V95, 'gradebook', 'index.html')) ? 'v95 not on this machine' : !chrome || !puppeteer ? 'no Chrome here' : false;

// A year of invented marks. Values chosen so averages land on .5 and weighted sums round both ways.
function yearOfMarks(gb) {
  let n = 0;
  const add = (sid, std, date, v, extra) => gb.scores.push(Object.assign({ id: 'y' + (n++), sid, std, v, date, note: '', ctx: '' }, extra || {}));
  const K = ['k3j9x2a', 'p8q7r6s', 'z1y2x3w', 'ab'];
  const plan = {
    '2.OA.A.1': [['2026-09-22', [2, 3, 1, 4]], ['2026-10-13', [3, 3, 2, 4]], ['2026-12-02', [3, 2, 2, 3]], ['2027-02-10', [4, 3, 3, 3]]],
    '2.OA.B.2': [['2026-08-25', [2, 1, 3, 2]], ['2026-12-09', [2, 3, 1, 4]], ['2026-12-16', [3, 2, 2, 4]]],
    '2.NBT.B.5': [['2026-11-12', [1, 2, 4, 3]], ['2026-11-30', [4, 3, 1, 2]], ['2027-01-20', [3, 3, 4, 2]]],
    '2.W.1': [['2026-10-20', [2, 2, 3, 1]]],
    '2.RL.1': [['2026-09-29', [3, 1, 4, 2]], ['2026-10-27', [2, 2, 3, 3]], ['2026-11-03', [4, 3, 2, 2]]]
  };
  for (const [std, rows] of Object.entries(plan)) rows.forEach(([d, vs]) => vs.forEach((v, i) => { if (!(std === '2.W.1' && i === 2)) add(K[i], std, d, v); }));
  add('k3j9x2a', '2.NBT.B.5', '2026-12-04', 2, { source: 'iready', ctx: 'iReady diagnostic', id: 'ir-x-1' });
  add('ab', '2.NBT.B.5', '2026-12-04', 4, { source: 'iready', ctx: 'iReady diagnostic', id: 'ir-x-2' });
  // Report card lines: one of one standard (its overrides become the standard's), one of several (kept only).
  gb.rc = [{ id: 'solo', s: 'Math', n: 'Fluently adds and subtracts within 20', std: ['2.OA.B.2'] },
    { id: 'many', s: 'Math', n: 'Solves addition and subtraction problems', std: ['2.OA.A.1', '2.GM.C.8'] },
    { id: 'flu', s: 'ELA', n: 'Reads grade-level text fluently', std: ['2.RF.4'] }];
  gb.overrides = { 't2|k3j9x2a|solo': 4, 't3|ab|solo': 1, 't1|z1y2x3w|flu': 3, 't2|p8q7r6s|many': 2 };
  gb.settings.carryForward = true;
  return gb;
}

test('every child × standard × quarter matches v95\'s gradebook', { skip, timeout: 180000 }, async () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v95-sample.json'), 'utf8'));
  file.keys.gb2_standards_v1 = JSON.stringify(yearOfMarks(JSON.parse(file.keys.gb2_standards_v1)));
  const server = await new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = path.join(V95, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(V95) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : /\.css$/.test(p) ? 'text/css' : 'text/html' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await (await browser.createBrowserContext()).newPage();
    await page.setRequestInterception(true);
    page.on('request', r => /^http:\/\/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.abort());
    const base = `http://127.0.0.1:${server.address().port}`;
    // Put the file in from a page with no scripts: an open gradebook saves its own state as it is left.
    await page.goto(base + '/_headers', { waitUntil: 'domcontentloaded' });
    await page.evaluate(keys => { localStorage.clear(); for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); }, file.keys);
    await page.goto(base + '/gradebook/', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof S !== 'undefined' && typeof finalMark === 'function' && S.students.length > 0, { timeout: 15000 });
    // On purpose: Planbook's importer holds back a reading whose counts do not add up (and says so); v95's
    // gradebook copy still counts it. Compare with v95 leaving those out, and check v95 still counts them.
    const first = imp.convert(file, { names, extraSubjects: read('data/planner-defaults.json').extraSubjects });
    const have = new Set(first.records.filter(r => r.type === 'orfCheck').map(r => r.id));
    const readings = JSON.parse(file.keys['running-records-v1']).records.filter(r => !r.demo);
    const heldBack = readings.filter(r => !have.has('orf_' + r.id)).map(r => r.id);
    assert.deepEqual(heldBack, ['r_bad'], 'the one broken reading in the sample');
    const counted = await page.evaluate(ids => { syncOrfScores(); return S.scores.filter(x => x.source === 'orf' && ids.includes(x.id.replace('orf-orf:', ''))).length; }, heldBack);
    assert.equal(counted, 1, 'v95 still makes a mark from it (else this filter can go)');
    await page.evaluate(ids => { S.orf.forEach(c => { if (ids.includes(c.srcId)) c.exclude = true; }); syncOrfScores(); }, heldBack);   // this saves
    const CODES = read('data/standards-grade2.json').standards.map(s => s.code);
    const COMBOS = [];
    for (const rule of ['weighted', 'mean', 'latest']) for (const carryForward of [true, false]) for (const ireadyInReport of [false, true]) COMBOS.push({ rule, carryForward, ireadyInReport });

    const theirs = await page.evaluate((codes, combos) => {
      const solo = {}; S.rc.forEach(l => { if (l.std.length === 1) solo[l.std[0]] = l; });
      const out = {}, keep = Object.assign({}, S.settings);
      combos.forEach(c => {
        Object.assign(S.settings, c);
        S.students.forEach(st => S.terms.forEach(t => codes.forEach(code => {
          const f = finalMark(st.id, solo[code] || { id: 'one:' + code, std: [code] }, t);
          out[[c.rule, c.carryForward, c.ireadyInReport, st.first, t.name, code].join('|')] = [f.v || null, !!f.over, f.n, f.carried || null];
        })));
      });
      Object.assign(S.settings, keep);
      return { out, stored: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])),
        orfMarks: S.scores.filter(x => x.source === 'orf').map(x => [x.sid, x.date, x.v]).sort() };
    }, CODES, COMBOS);

    // Planbook, on what v95 stored.
    const o = imp.convert(Object.assign({}, file, { keys: theirs.stored }), { names, extraSubjects: read('data/planner-defaults.json').extraSubjects });
    const recs = o.records.filter(r => !r.deletedAt), by = t => recs.filter(r => r.type === t);
    R.useNorms(read('data/orf-norms.json'));
    const students = by('student').filter(s => s.active), terms = by('gradingPeriod'), base0 = by('gradebookSettings')[0];
    assert.equal(by('markOverride').length, 3, 'three overrides on one-standard lines came across');
    assert.ok(o.notes.some(n => /1 report card mark you set was on a line of several standards/.test(n)));
    assert.ok(theirs.orfMarks.length >= 1, 'v95 made ORF marks');
    const ours = {};
    let compared = 0, set = 0, carried = 0, orfCells = 0;
    COMBOS.forEach(c => {
      const ctx = R.context({ marks: by('mark'), checks: by('orfCheck'), settings: Object.assign({}, base0, c), terms, overrides: by('markOverride') });
      students.forEach(st => terms.forEach(t => CODES.forEach(code => {
        const f = R.finalMark(ctx, st.id, code, t);
        const k = [c.rule, c.carryForward, c.ireadyInReport, st.firstName, t.name, code].join('|');
        ours[k] = [f.v || null, !!f.over, f.n, f.carried || null];
        compared++; if (f.over) set++; if (f.carried) carried++; if (code === '2.RF.4' && f.n) orfCells++;
      })));
    });
    const diffs = Object.keys(theirs.out).filter(k => JSON.stringify(theirs.out[k]) !== JSON.stringify(ours[k]));
    assert.deepEqual(diffs.slice(0, 10).map(k => `${k}: v95 ${JSON.stringify(theirs.out[k])}, Planbook ${JSON.stringify(ours[k])}`), []);
    assert.equal(Object.keys(ours).length, Object.keys(theirs.out).length);
    // The comparison is only worth something if it covers the hard cases.
    assert.ok(compared > 10000 && set > 0 && carried > 0 && orfCells > 0, `covers overrides, carried marks and ORF (${compared}, ${set}, ${carried}, ${orfCells})`);
  } finally {
    await browser.close();
    server.close();
  }
});
