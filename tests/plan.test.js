// The planner's logic. The Reveal stepping is checked against v95's own curriculum.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const P = require(process.env.SUITE_PLAN || path.join(ROOT, 'core', 'plan.js'));
const reveal = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reveal-grade2.json'), 'utf8'));
const bench = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'benchmark-grade2.json'), 'utf8'));
const defaults = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'planner-defaults.json'), 'utf8'));
P.useCurriculum(JSON.parse(JSON.stringify(reveal)), bench);

const V95 = '/home/claude/v95/classroom-suite/curriculum.js';
const math = { id: 'subj_v95-math', schema: 'ul', pacing: true, lessonsPerUnit: 10, start: { unit: 1, lesson: 1 } };
const reading = { id: 'subj_v95-reading', schema: 'uwd', weeksPerUnit: 3, daysPerWeek: 5, benchmark: true, start: { unit: 1, week: 1, day: 1 } };

test('Reveal stepping matches v95 at every step of the guide, and from leftover positions', { skip: fs.existsSync(V95) ? false : 'v95 not here' }, () => {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(V95, 'utf8'), box);
  const RP = box.window.RevealPacing;
  const positions = RP.FLAT.map(s => s.k === 'L' ? { unit: s.u, lesson: s.n } : { unit: s.u, lesson: s.after || 0, k: s.k });
  positions.push({ unit: 1, lesson: 8 }, { unit: 2, lesson: 99 }, { unit: 12, lesson: 1 }, { unit: 5, lesson: 0 });
  for (const p of positions) {
    const plain = x => JSON.parse(JSON.stringify(x));
    assert.deepEqual(P.revealNext(p), plain(RP.next(p)), `next of ${JSON.stringify(p)}`);
    assert.deepEqual(P.revealPrev(p), plain(RP.prev(p)), `prev of ${JSON.stringify(p)}`);
    assert.equal(P.label(math, p), RP.short(p), `label of ${JSON.stringify(p)}`);
    const s = RP.find(p);
    if (s) assert.equal(P.title(math, p), RP.name(s), `title of ${JSON.stringify(p)}`);
  }
  assert.equal(RP.FLAT.length, 143);
});

test('the guide walks from the course diagnostic to the end without a gap', () => {
  let p = { unit: 1, lesson: 0, k: 'diag' }, n = 1;
  for (;;) { const q = P.revealNext(p); if (P.samePos(q, p)) break; p = q; n++; }
  assert.equal(n, 143);
});

test('without the guide, math rolls over at the unit size, as v95 did', () => {
  const plain = Object.assign({}, math, { pacing: false });
  assert.deepEqual(P.advance(plain, { unit: 1, lesson: 10 }), { unit: 2, lesson: 1 });
  assert.deepEqual(P.retreat(plain, { unit: 2, lesson: 1 }), { unit: 1, lesson: 10 });
  assert.equal(P.label(plain, { unit: 2, lesson: 4 }), 'U2 · L4');
});

test('unit/week/day positions roll over by week and unit, and never go below the start', () => {
  assert.deepEqual(P.advance(reading, { unit: 1, week: 1, day: 5 }), { unit: 1, week: 2, day: 1 });
  assert.deepEqual(P.advance(reading, { unit: 1, week: 3, day: 5 }), { unit: 2, week: 1, day: 1 });
  assert.deepEqual(P.retreat(reading, { unit: 2, week: 1, day: 1 }), { unit: 1, week: 3, day: 5 });
  assert.deepEqual(P.retreat(reading, { unit: 1, week: 1, day: 1 }), { unit: 1, week: 1, day: 1 });
  assert.equal(P.label(reading, { unit: 2, week: 3, day: 4 }), 'U2 · W3 · D4');
  assert.equal(P.title(reading, { unit: 2, week: 1, day: 1 }), 'Unit 2 · Characters Facing Challenges');
});

test('free text stays as typed; an empty one shows a dash', () => {
  const sci = { id: 'x', schema: 'free' };
  assert.equal(P.label(sci, { text: '  Plants, lesson 3 ' }), 'Plants, lesson 3');
  assert.equal(P.label(sci, { text: '' }), '—');
  assert.deepEqual(P.advance(sci, { text: 'a' }), { text: 'a' });
});

test('the suggestion is the lesson after the last one taught before that day', () => {
  const L = (date, pos, taught = true) => ({ type: 'lessonPlan', date, subjectId: math.id, pos, taught });
  const lessons = [L('2026-09-14', { unit: 1, lesson: 0, k: 'diag' }), L('2026-09-15', { unit: 1, lesson: 0, k: 'open' }),
    L('2026-09-16', { unit: 1, lesson: 1 }, false), L('2026-09-17', { unit: 1, lesson: 1 })];
  assert.deepEqual(P.suggest(math, lessons, '2026-09-16'), { unit: 1, lesson: 1 });
  // Thursday: Wednesday was planned as L1 but not taught, so the suggestion still follows Tuesday's opener.
  assert.deepEqual(P.suggest(math, lessons, '2026-09-17'), { unit: 1, lesson: 1 }, 'a planned but untaught day does not count');
  assert.deepEqual(P.lastTaught(lessons, math.id, '2026-09-17'), { pos: { unit: 1, lesson: 0, k: 'open' }, date: '2026-09-15' });
  assert.deepEqual(P.suggest(math, lessons, '2026-09-18'), { unit: 1, lesson: 2 });
  assert.deepEqual(P.suggest(math, lessons, '2026-09-01'), { unit: 1, lesson: 1 }, 'nothing taught yet: the subject\'s start');
  const gone = lessons.map(l => Object.assign({}, l, { deletedAt: '2026-09-20T00:00:00Z' }));
  assert.deepEqual(P.suggest(math, gone, '2026-09-18'), { unit: 1, lesson: 1 }, 'deleted lessons do not count');
  assert.deepEqual(P.lastTaught(lessons, math.id, '2026-09-18'), { pos: { unit: 1, lesson: 1 }, date: '2026-09-17' });
});

test('day status: days off, weekends, outside the year, Wednesday early release', () => {
  const year = { firstDay: '2026-09-01', lastDay: '2027-06-09', earlyReleaseWeekday: 'wed' };
  const days = { '2026-11-11': { kind: 'noSchool', label: 'Veterans Day' }, '2026-10-08': { kind: 'earlyRelease', label: 'Conferences' } };
  assert.deepEqual(P.dayStatus('2026-11-11', { year, days }), { school: false, label: 'Veterans Day' });
  assert.equal(P.dayStatus('2026-10-03', { year, days }).label, 'Weekend');
  assert.equal(P.dayStatus('2026-08-31', { year, days }).outside, true);
  assert.equal(P.dayStatus('2027-06-10', { year, days }).outside, true);
  assert.deepEqual(P.dayStatus('2026-10-07', { year, days }), { school: true, early: true, label: 'Early release' });
  assert.deepEqual(P.dayStatus('2026-10-08', { year, days }), { school: true, early: true, label: 'Conferences' });
  assert.deepEqual(P.dayStatus('2026-10-06', { year, days }), { school: true, early: false, label: '' });
  const removed = { '2026-11-11': { kind: 'noSchool', label: 'Veterans Day', deletedAt: '2026-10-01T00:00:00Z' } };
  assert.equal(P.dayStatus('2026-11-11', { year, days: removed }).school, true, 'a removed day off is a school day');
  assert.equal(P.dayStatus('2026-10-03', { year, days, plan: { saved: true } }).school, true, 'a weekend you planned stays open');
});

test('times without am/pm sort as a school day: 1:00 comes after 11:40', () => {
  assert.ok(P.mins('1:00') > P.mins('11:40'));
  assert.ok(P.mins('8:05') < P.mins('10:15'));
  assert.equal(P.mins('nope'), null);
});

test('a v95 Monday lays out in schedule order, each subject\'s card at its first block', () => {
  const subjects = defaults.subjects.map((s, i) => ({ id: s.id, on: s.on, order: i }));
  const blocks = defaults.schedule[1].map((b, i) => ({ id: 'b' + i, weekday: 1, start: b.t, name: b.l, subjectId: b.s || null }));
  const rows = P.dayLayout(blocks.slice().reverse(), subjects, 1);
  assert.deepEqual(rows.map(r => r.block.start), defaults.schedule[1].map(b => b.t));
  const reading = rows.filter(r => r.subject && r.subject.id === 'reading').map(r => r.kind);
  assert.deepEqual(reading, ['lesson', 'continued', 'continued']);
  assert.equal(rows.find(r => r.kind === 'lesson' && r.subject.id === 'math').blocks.length, 3);
  assert.equal(rows.find(r => r.block.name === 'Recess').kind, 'plain');
  assert.equal(rows[0].end, '8:05', 'a block ends when the next starts');
  assert.equal(rows.at(-1).end, null);
});

test('a subject that is on but has no block that day comes last; one switched off never shows', () => {
  const subjects = [{ id: 'a', on: true, order: 0 }, { id: 'b', on: true, order: 1 }, { id: 'c', on: false, order: 2 }];
  const blocks = [{ id: 'x', weekday: 3, start: '9:00', name: 'A', subjectId: 'a' }, { id: 'y', weekday: 3, start: '10:00', name: 'C', subjectId: 'c' }];
  const rows = P.dayLayout(blocks, subjects, 3);
  assert.deepEqual(rows.map(r => [r.kind, r.subject && r.subject.id, !!r.unscheduled]), [['lesson', 'a', false], ['plain', undefined, false], ['lesson', 'b', true]]);
});

test('weeks run Monday to Friday; a weekend shows the coming week', () => {
  assert.deepEqual(P.weekOf('2026-10-07'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  assert.equal(P.weekOf('2026-10-03')[0], '2026-10-05');
  assert.equal(P.weekOf('2026-10-04')[0], '2026-10-05');
});

test('the tile\'s curriculum detail: a Reveal lesson\'s targets, materials, standards and what comes next', () => {
  const d = P.detail(math, { unit: 1, lesson: 1 });
  assert.equal(d.kind, 'reveal');
  assert.deepEqual(d.targets, ['I can tell my math story.', 'I can recognize the ways in which we are all doers of math.']);
  assert.deepEqual(d.materials, ['blank paper', 'crayons, markers, or colored pencils']);
  assert.deepEqual(d.standards, [{ code: '1.NBT.B.3', label: 'Compare two-digit numbers', oregon: [] }]);
  assert.equal(d.gradeOne, true, 'the launch unit teaches to grade 1 standards');
  assert.equal(d.next, 'Lesson 1-2 · Math Is Exploring and Thinking');
  const two = P.detail(math, { unit: 2, lesson: 1 });
  assert.equal(two.gradeOne, false);
  assert.ok(two.standards.every(s => s.oregon.length), 'grade 2 lessons map to Oregon codes');
});

test('the tile\'s curriculum detail: a Benchmark week\'s texts, skills with mapped standards, and words', () => {
  const d = P.detail(reading, { unit: 1, week: 1, day: 3 });
  assert.equal(d.kind, 'benchmark');
  assert.equal(d.question, 'How do living things get what they need to survive?');
  assert.equal(d.reads.interactive, 'The Frogs and the Well');
  assert.deepEqual(d.parts.reading[0], { kind: 'Comprehension', t: 'Identify Main Topic and Key Details', codes: ['2.RI.2'] });
  assert.deepEqual(d.words, { ga: ['survive', 'paddle'], ds: ['habitats', 'burrow'] });
  assert.equal(P.detail({ id: 'x', schema: 'free' }, { text: 'a' }), null, 'free text has no curriculum');
});

test('the Reveal guide lands on this calendar exactly as v95 places it', { skip: fs.existsSync(V95) ? false : 'v95 not here' }, () => {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(V95, 'utf8'), box);
  const RP = box.window.RevealPacing;
  const cal = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'calendar-2026-27.json'), 'utf8'));
  const year = { firstDay: cal.firstDay, lastDay: cal.lastDay, earlyReleaseWeekday: 'wed' };
  const days = Object.fromEntries(Object.entries(cal.closed).map(([d, label]) => [d, { kind: 'noSchool', label }]));
  const blocks = [1, 2, 3, 4, 5].map(wd => ({ weekday: wd, subjectId: 'm' }));
  const list = P.mathDays({ year, days, blocks, subjectId: 'm' });
  assert.equal(list[0], '2026-09-01');
  assert.ok(!list.includes('2026-11-11') && !list.includes('2026-12-21'), 'days off are not math days');
  const mine = P.revealPlan(list).map(r => ({ u: r.u, from: r.from, to: r.to, short: r.short }));
  const theirs = JSON.parse(JSON.stringify(RP.plan(list)));
  assert.deepEqual(mine, theirs);
  assert.equal(P.unitOnDate(P.revealPlan(list), '2026-10-05'), RP.unitOnDate(RP.plan(list), '2026-10-05'));
});

test('a weekday with no Math block is not a math day; what was taught is counted by unit', () => {
  const year = { firstDay: '2026-09-01', lastDay: '2026-09-30' };
  const list = P.mathDays({ year, days: {}, blocks: [{ weekday: 1, subjectId: 'm' }, { weekday: 3, subjectId: 'm', deletedAt: 'x' }], subjectId: 'm' });
  assert.deepEqual(list, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  const L = (date, unit, taught = true) => ({ date, subjectId: 'm', pos: { unit, lesson: 1 }, taught });
  assert.deepEqual(P.revealActuals([L('2026-09-02', 1), L('2026-09-01', 1), L('2026-09-03', 2, false), L('2026-09-08', 2)], 'm'),
    { 1: { from: '2026-09-01', to: '2026-09-02', n: 2 }, 2: { from: '2026-09-08', to: '2026-09-08', n: 1 } });
  assert.equal(P.revealSteps().length, 143);
});

test('the guide gives each unit exactly its days, in order, and days off are not math days (no v95 needed)', () => {
  const year = { firstDay: '2026-09-01', lastDay: '2027-06-09' };
  const days = { '2026-09-02': { kind: 'noSchool' }, '2026-09-03': { kind: 'noSchool', deletedAt: 'x' } };
  const blocks = [1, 2, 3, 4, 5].map(wd => ({ weekday: wd, subjectId: 'm' }));
  const list = P.mathDays({ year, days, blocks, subjectId: 'm' });
  assert.ok(!list.includes('2026-09-02'), 'a day off is not a math day');
  assert.ok(list.includes('2026-09-03'), 'a removed day off is');
  const plan = P.revealPlan(list);
  assert.equal(plan.length, 12);
  let i = 0;
  for (const r of plan) {
    const u = reveal.units.find(x => x.u === r.u);
    assert.equal(r.from, list[i], `Unit ${r.u} starts on the next math day`);
    assert.equal(r.to, list[Math.min(i + Math.round(u.total), list.length) - 1], `Unit ${r.u} gets exactly its ${u.total} days`);
    i += Math.round(u.total);
  }
});
