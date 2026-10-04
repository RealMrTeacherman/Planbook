// Step 6a's gate: v95's own gradebook runs in Chrome on the invented class. Its marks, its assignments
// (marked, not turned in, done, complete) and its "still waiting on" list must be what Planbook makes of
// the same file. The file is what v95 stores after its own upgrades run on load, as a real export would.
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
const G = require(path.join(ROOT, 'core', 'grade.js'));
const names = require(path.join(ROOT, 'core', 'names.js'));
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !fs.existsSync(path.join(V95, 'gradebook', 'index.html')) ? 'v95 not on this machine' : !chrome || !puppeteer ? 'no Chrome here' : false;

test('marks, assignments and the waiting list match v95\'s gradebook', { skip, timeout: 120000 }, async () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v95-sample.json'), 'utf8'));
  const server = await new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = path.join(V95, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!p.startsWith(V95) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': /\.js$/.test(p) ? 'text/javascript' : /\.css$/.test(p) ? 'text/css' : /\.json$/.test(p) ? 'application/json' : 'text/html' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(s));
  });
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await (await browser.createBrowserContext()).newPage();
    await page.setRequestInterception(true);
    page.on('request', r => /^http:\/\/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.abort());
    const base = `http://127.0.0.1:${server.address().port}`;
    // Put the file in from a page with no scripts: an open gradebook saves its own (empty) state as it is left.
    await page.goto(base + '/_headers', { waitUntil: 'domcontentloaded' });
    await page.evaluate(keys => { localStorage.clear(); for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); }, file.keys);
    await page.goto(base + '/gradebook/', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof S !== 'undefined' && typeof assignmentsList === 'function' && S.students.length > 0, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const theirs = await page.evaluate(() => ({
      stored: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])),
      marks: S.scores.map(x => ({ who: (S.students.find(s => s.id === x.sid) || {}).first || null, std: x.std, date: x.date, v: x.v, source: x.source || null })),
      // On purpose: v95 counts a mark for a child no longer on its class list (done can pass the class size);
      // Planbook holds such a mark back at import and says so. Compare with v95's count over the class it has.
      list: (() => { const all = S.scores; S.scores = all.filter(x => S.students.some(s => s.id === x.sid));
        try { return assignmentsList().map(a => [a.key, a.marked, a.missing, a.total, a.done, a.complete]); } finally { S.scores = all; } })(),
      unfiltered: assignmentsList().map(a => [a.key, a.marked]),
      waiting: missingOpen().map(m => [S.students.find(s => s.id === m.sid).first, m.std, m.date]).sort()
    }));

    // Planbook, on what v95 stored.
    const out = imp.convert(Object.assign({}, file, { keys: theirs.stored }), { names, extraSubjects: read('data/planner-defaults.json').extraSubjects });
    G.useGuide(read('data/reveal-grade2.json'));
    const byCode = Object.fromEntries(read('data/standards-grade2.json').standards.map(s => [s.code, s]));
    const recs = out.records.filter(r => !r.deletedAt);
    const students = recs.filter(r => r.type === 'student'), marks = recs.filter(r => r.type === 'mark'), missing = recs.filter(r => r.type === 'missingWork');
    const first = id => students.find(s => s.id === id).firstName;
    const key = m => [m.who, m.std, m.date, m.v, m.source].join('|');

    // v95 counts marks only for children on its class list; the one for a child who is gone is held back.
    const known = new Set(students.filter(s => s.active).map(s => s.firstName));
    assert.deepEqual(marks.map(m => key({ who: first(m.studentId), std: m.standard, date: m.date, v: m.value, source: m.source })).sort(),
      theirs.marks.filter(m => m.who && known.has(m.who)).map(key).sort(), 'every mark, with its value and source');
    const ours = G.assignments(marks, missing, students, byCode).map(a => [a.key, a.marked, a.missing, a.total, a.done, a.complete]);
    assert.deepEqual(ours, theirs.list, 'the assignments, in order, with their counts');
    assert.deepEqual(missing.filter(m => !m.received && !m.excused).map(m => [first(m.studentId), m.standard, m.date]).sort(), theirs.waiting, 'still waiting on');
    assert.ok(theirs.list.length >= 3 && theirs.marks.length >= 6, 'the comparison covers real data');
    assert.ok(theirs.unfiltered.some(([k, n]) => k === '2.OA.A.1|2026-09-15|Lesson 1-3' && n === 4), 'the difference is still there in v95 (else drop the filter)');
  } finally {
    await browser.close();
    server.close();
  }
});
