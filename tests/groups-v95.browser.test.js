// Step 6c's gate: v95's gradebook runs in Chrome on a year of invented marks with children moved by hand.
// For every subject, standard grouped on (and all together), group count 2–6, evidence choice and look-back,
// v95's buildSkillGroups gives the same groups (each child's weighted score too) and Not placed as Planbook's;
// its buildNeedGroups the same shared-need and extend groups; its default standard the same; and its
// rendered "Worth a look" and "Class at a glance" the same rows. Needs the v95 suite (skipped elsewhere).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { findChrome, loadPuppeteer } = require('./helpers/browser');
const { yearOfMarks } = require('./helpers/year');

const V95 = process.env.V95_DIR || '/home/claude/v95/classroom-suite';
const ROOT = path.join(__dirname, '..');
const imp = require(path.join(ROOT, 'core', 'import-v95.js'));
const R = require(path.join(ROOT, 'core', 'report.js'));
const G = require(path.join(ROOT, 'core', 'groups.js'));
const names = require(path.join(ROOT, 'core', 'names.js'));
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !fs.existsSync(path.join(V95, 'gradebook', 'index.html')) ? 'v95 not on this machine' : !chrome || !puppeteer ? 'no Chrome here' : false;
const SUBJECTS = ['Math', 'ELA', 'All'], EVS = ['both', 'classroom', 'iready'], DAYS = ['0', '45', '21'], KS = [2, 3, 4, 5, 6];

test('skill groups, shared needs, flags and the class grid match v95\'s gradebook', { skip, timeout: 240000 }, async () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v95-sample.json'), 'utf8'));
  const gb = yearOfMarks(JSON.parse(file.keys.gb2_standards_v1));
  // Children moved by hand: into a group, to Not placed, on all standards together, and past the group count.
  gb.groupPins = { 'Math|2.NBT.B.5': { k3j9x2a: 0, ab: -1 }, 'Math|__all': { z1y2x3w: 3 }, 'ELA|2.RL.1': { p8q7r6s: 5 } };
  // A child who joined late, with only two marks: "thin data".
  gb.students.push(Object.assign({}, gb.students[0], { id: 'late01', first: 'Ada', last: 'Quill', eld: false, aka: [], sid: '' }));
  gb.scores.push({ id: 'late-a', sid: 'late01', std: '2.OA.A.1', v: 3, date: '2027-02-10', note: '', ctx: '' }, { id: 'late-b', sid: 'late01', std: '2.NBT.B.5', v: 2, date: '2027-01-20', note: '', ctx: '' });
  // Active standards on, so every one with marks can be grouped on.
  for (const c of ['2.OA.B.2', '2.W.1']) gb.active[c] = true;
  file.keys.gb2_standards_v1 = JSON.stringify(gb);
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
    await page.goto(base + '/_headers', { waitUntil: 'domcontentloaded' });
    await page.evaluate(keys => { localStorage.clear(); for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); }, file.keys);
    await page.goto(base + '/gradebook/', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof S !== 'undefined' && typeof buildSkillGroups === 'function' && S.students.length > 0, { timeout: 15000 });
    // As in the 6b gate: leave out of v95 the reading Planbook's importer held back, then rebuild its ORF marks.
    await page.evaluate(() => { S.orf.forEach(c => { if (c.srcId === 'r_bad') c.exclude = true; }); syncOrfScores(); });

    const theirs = await page.evaluate((SUBJECTS, EVS, DAYS, KS) => {
      const first = sid => (S.students.find(s => s.id === sid) || {}).first;
      const row = r => [r.st.first, r.v, r.n, r.pinned];
      const out = { order: S.students.map(s => s.first), now: Date.now(), skill: {}, need: {}, sel: {}, flags: {}, glance: {} };
      SUBJECTS.forEach(subj => {
        UI.subject = subj;
        EVS.forEach(ev => DAYS.forEach(days => {
          UI.groupEvidence = ev; UI.groupWindow = days;
          const codes = activeCodes(subj).filter(c => S.scores.some(x => x.std === c && scoreAllowed(x)));
          UI.groupStd = null; out.sel[[subj, ev, days].join('|')] = skillSel();
          ['__all'].concat(codes).forEach(sel => KS.forEach(k => {
            const r = buildSkillGroups(subj, sel, days, k);
            out.skill[[subj, ev, days, sel, k].join('|')] = { groups: r.groups.map(g => g.map(row)), out: r.out.map(row), moved: r.moved };
          }));
          [true, false].forEach(lo => {
            out.need[[subj, ev, days, lo].join('|')] = buildNeedGroups(subj, days, lo).map(g => ({ stds: g.stds, kids: g.kids.map(first).sort(), mix: groupEvidenceMix(g, days) }));
          });
        }));
        // Worth a look and Class at a glance, as v95 draws them (evidence both, all year).
        UI.groupEvidence = 'both'; UI.groupWindow = '0'; UI.groupStd = null;
        renderGroups();
        const panel = document.getElementById('panel-groups');
        const h2 = t => [...panel.querySelectorAll('h2')].find(h => h.textContent.trim() === t);
        const tableAfter = h => { let n = h && h.nextElementSibling; while (n && !n.querySelector('table')) n = n.nextElementSibling; return n ? n.querySelector('table') : null; };
        const look = tableAfter(h2('Worth a look'));
        out.flags[subj] = look ? [...look.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.innerText.trim()).join(' | ')).sort() : [];
        const gl = tableAfter(h2('Class at a glance'));
        out.glance[subj] = gl ? { codes: [...gl.querySelectorAll('thead th')].slice(1, -1).map(th => th.innerText.trim()),
          rows: [...gl.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.innerText.replace(/\s+/g, ' ').trim())) } : null;
      });
      return Object.assign(out, { stored: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])) });
    }, SUBJECTS, EVS, DAYS, KS);

    // Planbook, on what v95 stored.
    const o = imp.convert(Object.assign({}, file, { keys: theirs.stored }), { names, extraSubjects: read('data/planner-defaults.json').extraSubjects });
    const recs = o.records.filter(r => !r.deletedAt), by = t => recs.filter(r => r.type === t);
    R.useNorms(read('data/orf-norms.json'));
    const catalog = read('data/standards-grade2.json').standards;
    const settings = by('gradebookSettings')[0];
    const stu = by('student').filter(s => s.active);
    const students = theirs.order.map(n => stu.find(s => s.firstName === n));   // v95's list order
    const firstOf = id => stu.find(s => s.id === id).firstName;
    const all = G.allMarks(R, by('mark'), by('orfCheck'), settings);
    const now = new Date(theirs.now);
    const codesFor = subj => catalog.filter(c => settings.on.includes(c.code) && (subj === 'All' || c.subject === subj)).map(c => c.code);
    const pinsFor = (subj, sel) => Object.fromEntries(by('groupPin').filter(p => p.subject === subj && (sel === '__all' ? p.standard === null : p.standard === sel)).map(p => [p.studentId, p.group]));
    assert.equal(by('groupPin').length, 4, 'every move came across');
    const row = r => [r.st.firstName, r.v, r.n, r.pinned];
    const diffs = [];
    let compared = 0, pinnedSeen = 0, outSeen = 0;
    SUBJECTS.forEach(subj => EVS.forEach(ev => DAYS.forEach(days => {
      const opt = { students, all, codes: codesFor(subj), days, ev, now };
      const sk = [subj, ev, days].join('|');
      if (G.defaultSel(opt) !== theirs.sel[sk]) diffs.push(`default standard ${sk}: v95 ${theirs.sel[sk]}, Planbook ${G.defaultSel(opt)}`);
      ['__all'].concat(G.groupable(opt)).forEach(sel => KS.forEach(k => {
        const key = [subj, ev, days, sel, k].join('|'), want = theirs.skill[key];
        if (!want) { diffs.push('v95 has no ' + key); return; }
        const r = G.buildSkillGroups(opt, sel, k, pinsFor(subj, sel));
        const got = { groups: r.groups.map(g => g.map(row)), out: r.out.map(row), moved: r.moved };
        compared++; pinnedSeen += got.groups.flat().filter(x => x[3]).length; outSeen += got.out.length;
        if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`skill ${key}: v95 ${JSON.stringify(want)}, Planbook ${JSON.stringify(got)}`);
      }));
      [true, false].forEach(lo => {
        const key = [subj, ev, days, lo].join('|');
        const got = G.buildNeedGroups(opt, lo).map(g => ({ stds: g.stds, kids: g.kids.map(firstOf).sort(), mix: G.evidenceMix(opt, g) }));
        if (JSON.stringify(got) !== JSON.stringify(theirs.need[key])) diffs.push(`need ${key}: v95 ${JSON.stringify(theirs.need[key])}, Planbook ${JSON.stringify(got)}`);
      });
    })));
    // Worth a look and Class at a glance, drawn the way v95 draws them.
    const byCode = Object.fromEntries(catalog.map(c => [c.code, c]));
    SUBJECTS.forEach(subj => {
      const opt = { students, all, codes: codesFor(subj), days: '0', ev: 'both', now };
      const flags = G.flags(opt).map(f => { const n = stu.find(s => s.id === f.sid); const who = n.firstName + (n.lastName ? ' ' + n.lastName : '');
        return f.t === 'down' ? `Slipping ${who} | ${byCode[f.code].label} dropped from ${f.from} to ${f.to}` : `Thin data ${who} | only ${f.n} mark${f.n === 1 ? '' : 's'} recorded so far`; }).sort();   // v95: the tag and name share a cell
      if (JSON.stringify(flags) !== JSON.stringify(theirs.flags[subj])) diffs.push(`flags ${subj}: v95 ${JSON.stringify(theirs.flags[subj])}, Planbook ${JSON.stringify(flags)}`);
      const gl = G.glance(opt), want = theirs.glance[subj];
      const sorted = gl.rows.slice().sort((a, b) => { const A = stu.find(s => s.id === a.sid), B = stu.find(s => s.id === b.sid); return ((A.lastName || '') + A.firstName).toLowerCase().localeCompare(((B.lastName || '') + B.firstName).toLowerCase()); });
      const got = { codes: gl.codes, rows: sorted.map(r => { const s = stu.find(x => x.id === r.sid); return [s.firstName + (s.lastName ? ' ' + s.lastName : '') + (s.eld ? ' ELD' : '')]
        .concat(r.cells.map(m => m ? String(m.value) + (m.source === 'iready' ? 'i' : '') : '–')).concat([r.avg ? r.avg.toFixed(1) : '–']); }) };
      if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`glance ${subj}: v95 ${JSON.stringify(want)}, Planbook ${JSON.stringify(got)}`);
    });
    assert.deepEqual(diffs.slice(0, 6), []);
    assert.ok(SUBJECTS.some(s => theirs.flags[s].some(f => /^Slipping/.test(f))) && theirs.flags.Math.some(f => /^Thin data Ada Quill/.test(f)), 'the comparison includes slipping and thin-data flags');
    assert.ok(compared > 300 && pinnedSeen > 0 && outSeen > 0, `covers moves and Not placed (${compared} groupings, ${pinnedSeen} moved, ${outSeen} not placed)`);
  } finally {
    await browser.close();
    server.close();
  }
});
