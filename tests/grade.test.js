// The gradebook's logic (step 6a). Which standards a guide day covers is checked against v95's own curriculum.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const G = require(process.env.SUITE_GRADE || path.join(ROOT, 'core', 'grade.js'));
const P = require(path.join(ROOT, 'core', 'plan.js'));
const reveal = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reveal-grade2.json'), 'utf8'));
const bench = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'benchmark-grade2.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'standards-grade2.json'), 'utf8')).standards;
const byCode = Object.fromEntries(catalog.map(s => [s.code, s]));
P.useCurriculum(JSON.parse(JSON.stringify(reveal)), bench);
G.useGuide(JSON.parse(JSON.stringify(reveal)));
const V95 = process.env.V95_DIR || '/home/claude/v95/classroom-suite';

const NOW = '2026-10-05T20:00:00.000Z', LATER = '2026-10-05T20:05:00.000Z', TODAY = '2026-10-05';
const KIDS = [
  { id: 'stu_mila01', type: 'student', firstName: 'Mila', active: true, eld: false },
  { id: 'stu_theo01', type: 'student', firstName: 'Theodore', active: true, eld: true },
  { id: 'stu_june01', type: 'student', firstName: 'Juniper', active: true, eld: false },
  { id: 'stu_left01', type: 'student', firstName: 'Odette', active: false, eld: false }
];
// A tiny store: apply writes the way the real one does (stamping the envelope).
function box(records = []) {
  const recs = new Map(records.map(r => [r.id, Object.assign({ updatedAt: NOW, device: 'mac', deletedAt: null }, r)]));
  const apply = (writes, device = 'mac') => writes.forEach(w => recs.set(w.id, Object.assign({}, w, { updatedAt: LATER, device })));
  const live = type => [...recs.values()].filter(r => r.type === type && !r.deletedAt);
  return { recs, apply, live };
}
const A = { studentId: 'stu_mila01', standard: '2.NBT.A.3', date: TODAY, what: 'Lesson 2-3', today: TODAY, now: NOW };

// ---------- the guide ----------
test('a lesson gives its own standards in Oregon codes; a probe the lessons before it; a test or review the whole unit', () => {
  const at = i => G.oregon(G.stepAt(i));
  assert.deepEqual(at(12), ['2.NBT.A.3']);                               // Lesson 2-3
  assert.deepEqual(at(13), ['2.NBT.A.1', '2.NBT.A.3']);                  // Lesson 2-4
  assert.deepEqual(at(14), ['2.NBT.A.1', '2.NBT.A.3']);                  // the probe after lesson 4
  assert.deepEqual(at(17), ['2.NBT.A.1', '2.NBT.A.3', '2.NBT.A.4']);     // the Unit 2 test
  assert.deepEqual(at(9), [], 'an opener has none');
  assert.ok(G.lessonsOf(1).length > 0 && G.lessonsOf(1).every(l => G.oregon(Object.assign({ k: 'L' }, l)).length === 0), 'Unit 1 is grade 1 review');
});

test('marks from a guide day are named as v95 names them', () => {
  assert.deepEqual([12, 14, 16, 17].map(i => G.ctxFor(G.stepAt(i))), ['Lesson 2-3', 'Unit 2 probe', 'Unit 2 review', 'Unit 2 test']);
  assert.equal(G.lessonFromCtx('Unit 2 test'), 17);
  assert.equal(G.lessonFromCtx('exit ticket'), null);
});

test('a guide day\'s standards and the CCSS code shown for each match v95 at every step of the guide', { skip: fs.existsSync(path.join(V95, 'curriculum.js')) ? false : 'v95 not here' }, () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(V95, 'curriculum.js'), 'utf8'), ctx);
  const RP = ctx.window.RevealPacing;
  assert.equal(RP.FLAT.length, 143);
  RP.FLAT.forEach((s, i) => {
    assert.deepEqual(G.oregon(G.stepAt(i)), JSON.parse(JSON.stringify(RP.oregon(s))), `step ${i}`);
  });
  catalog.filter(s => s.subject === 'Math').forEach(s => assert.equal(G.ccssFor(s.code), RP.ccssFor(s.code), s.code));
});

// ---------- the planner's day ----------
const math = { id: 'subj_math', type: 'subject', schema: 'ul', pacing: true, on: true, lessonsPerUnit: 10, start: { unit: 1, lesson: 1 } };
const day = over => Object.assign({ subjects: [math], lessons: [], blocks: [{ id: 'blk_m', weekday: 1, subjectId: 'subj_math', start: '10:15' }],
  days: {}, year: { firstDay: '2026-09-02', lastDay: '2027-06-10' } }, over);
const taught = (date, pos, t = true) => ({ id: `les_${date}_subj_math`, type: 'lessonPlan', date, subjectId: 'subj_math', pos, taught: t });

test('the day\'s lesson is the one planned, else the next after the last one taught', () => {
  const lessons = [taught('2026-09-28', { unit: 2, lesson: 2 })];
  assert.equal(G.dayLesson(P, Object.assign(day({ lessons }), { date: '2026-10-05' })).i, 12, 'suggested: Lesson 2-3');
  lessons.push(taught('2026-10-05', { unit: 2, lesson: 4 }, false));
  assert.equal(G.dayLesson(P, Object.assign(day({ lessons }), { date: '2026-10-05' })).i, 13, 'planned, not yet taught, still counts');
});

test('a weekend, a day off or a day with no Math block has no lesson', () => {
  assert.equal(G.dayLesson(P, Object.assign(day(), { date: '2026-10-04' })), null, 'Sunday');
  const days = { '2026-10-05': { date: '2026-10-05', kind: 'noSchool', label: 'Teacher work day' } };
  assert.equal(G.dayLesson(P, Object.assign(day({ days }), { date: '2026-10-05' })), null);
  const blocks = [{ id: 'blk_r', weekday: 1, subjectId: 'subj_read', start: '8:15' }];
  assert.equal(G.dayLesson(P, Object.assign(day({ blocks }), { date: '2026-10-05' })), null);
});

test('the dates a guide day was taught', () => {
  const lessons = [taught('2026-09-30', { unit: 2, lesson: 3 }), taught('2026-09-29', { unit: 2, lesson: 3 }), taught('2026-10-01', { unit: 2, lesson: 3 }, false)];
  assert.deepEqual(G.datesTaught(lessons, 'subj_math', 12), ['2026-09-29', '2026-09-30']);
});

test('taking a lesson: its first standard and its name, but never a typed name, and never beside unnamed marks', () => {
  const on = ['2.NBT.A.1', '2.NBT.A.3'];
  const s = G.stepAt(13);   // Lesson 2-4
  assert.deepEqual(G.takeLesson({ std: '', date: TODAY, what: '' }, s, [], on), { std: '2.NBT.A.1', date: TODAY, what: 'Lesson 2-4' });
  assert.equal(G.takeLesson({ std: '2.NBT.A.3', date: TODAY, what: '' }, s, [], on).std, '2.NBT.A.3', 'a standard in the lesson stays');
  assert.equal(G.takeLesson({ std: '', date: TODAY, what: 'exit ticket' }, s, [], on).what, 'exit ticket', 'a typed name stays');
  assert.equal(G.takeLesson({ std: '', date: TODAY, what: 'Lesson 2-3' }, s, [], on).what, 'Lesson 2-4', 'a name this made is replaced');
  const unnamed = [{ studentId: 'stu_mila01', standard: '2.NBT.A.1', date: TODAY, value: 3 }];
  assert.equal(G.takeLesson({ std: '', date: TODAY, what: '' }, s, unnamed, on).what, '', 'naming it would split an assignment');
  assert.deepEqual(G.takeLesson({ std: 'x', date: TODAY, what: '' }, s, [], ['2.RF.4']), { std: 'x', date: TODAY, what: '' }, 'none switched on: unchanged');
});

// ---------- entering marks ----------
test('a mark is one record per child, standard and day; tapping the same number clears it', () => {
  const b = box(KIDS);
  b.apply(G.setMark(b.recs, Object.assign({ value: 3 }, A)).writes);
  const m = b.recs.get('mark_stu_mila01_2-NBT-A-3_2026-10-05');
  assert.deepEqual([m.value, m.what, m.source, m.deletedAt], [3, 'Lesson 2-3', null, null]);
  b.apply(G.setMark(b.recs, Object.assign({ value: 2 }, A)).writes);
  assert.equal(b.live('mark').length, 1);
  assert.equal(b.recs.get(m.id).value, 2);
  const r = G.setMark(b.recs, Object.assign({ value: 2 }, A));
  assert.equal(r.cleared, true);
  b.apply(r.writes);
  assert.equal(b.live('mark').length, 0);
});

test('a note typed before the mark is saved with it; after, it changes just the note', () => {
  const b = box(KIDS);
  assert.equal(G.setNote(b.recs, { studentId: 'stu_mila01', codes: ['2.NBT.A.3'], date: TODAY, note: 'counted on' }).pending, true);
  b.apply(G.setMark(b.recs, Object.assign({ value: 3, note: 'counted on' }, A)).writes);
  assert.equal(b.recs.get('mark_stu_mila01_2-NBT-A-3_2026-10-05').note, 'counted on');
  b.apply(G.setNote(b.recs, { studentId: 'stu_mila01', codes: ['2.NBT.A.3'], date: TODAY, note: '' }).writes);
  assert.equal('note' in b.recs.get('mark_stu_mila01_2-NBT-A-3_2026-10-05'), false);
});

test('giving a mark hands in that child\'s "not turned in"', () => {
  const b = box(KIDS);
  b.apply(G.toggleMissing(b.recs, { studentId: 'stu_mila01', codes: ['2.NBT.A.3'], date: TODAY, what: 'Lesson 2-3', now: NOW }).writes);
  assert.equal(b.live('missingWork').length, 1);
  b.apply(G.setMark(b.recs, Object.assign({ value: 4 }, A)).writes);
  assert.equal(b.recs.get('miss_stu_mila01_2-NBT-A-3_2026-10-05').received, TODAY);
});

test('"Not in" toggles, and is refused for a child who has a mark', () => {
  const b = box(KIDS);
  const t = { studentId: 'stu_theo01', codes: ['2.NBT.A.3'], date: TODAY, what: 'Lesson 2-3', now: NOW };
  b.apply(G.toggleMissing(b.recs, t).writes);
  assert.equal(b.live('missingWork').length, 1);
  b.apply(G.toggleMissing(b.recs, t).writes);
  assert.equal(b.live('missingWork').length, 0);
  b.apply(G.setMark(b.recs, Object.assign({}, A, { studentId: 'stu_theo01', value: 2 })).writes);
  assert.equal(G.toggleMissing(b.recs, t).refused, 'has a mark');
});

test('Log the rest: everyone in the class with nothing yet, and nobody who has left', () => {
  const b = box(KIDS);
  b.apply(G.setMark(b.recs, Object.assign({ value: 3 }, A)).writes);
  const r = G.logRest(b.recs, { students: KIDS, codes: ['2.NBT.A.3'], date: TODAY, what: 'Lesson 2-3' });
  assert.equal(r.children, 2);
  b.apply(r.writes);
  assert.deepEqual(b.live('missingWork').map(m => m.studentId).sort(), ['stu_june01', 'stu_theo01']);
});

test('grading together: one tap marks every standard; the same tap again clears them all', () => {
  const b = box(KIDS);
  const t = { studentId: 'stu_mila01', codes: ['2.NBT.A.1', '2.NBT.A.3'], date: TODAY, what: 'Lesson 2-4', value: 3, today: TODAY, now: NOW };
  b.apply(G.setAll(b.recs, t).writes);
  assert.deepEqual(b.live('mark').map(m => [m.standard, m.value, m.what]).sort(), [['2.NBT.A.1', 3, 'Lesson 2-4'], ['2.NBT.A.3', 3, 'Lesson 2-4']]);
  const r = G.setAll(b.recs, t);
  assert.equal(r.cleared, true);
  b.apply(r.writes);
  assert.equal(b.live('mark').length, 0);
});

// ---------- undo ----------
test('undo puts back exactly what was there: a new mark, a changed one, a cleared one, a handed-in "not in"', () => {
  const b = box(KIDS);
  const snap = () => JSON.stringify([...b.recs.values()].filter(r => !r.deletedAt).map(r => [r.id, r.value, r.received || null]).sort());
  b.apply(G.toggleMissing(b.recs, { studentId: 'stu_mila01', codes: ['2.NBT.A.3'], date: TODAY, now: NOW }).writes);
  const steps = [Object.assign({ value: 3 }, A), Object.assign({ value: 2 }, A), Object.assign({ value: 2 }, A)];
  for (const s of steps) {
    const before = snap();
    const r = G.setMark(b.recs, s);
    b.apply(r.writes);
    b.apply(G.undo(b.recs, r.undo, NOW).writes);
    assert.equal(snap(), before, `undoing ${s.value}`);
    b.apply(r.writes.map(w => Object.assign({}, w)));   // and do it again, to go on
  }
});

test('undo is not v95\'s "remove the newest mark": after a change, the other children\'s marks stay', () => {
  const b = box(KIDS);
  b.apply(G.setMark(b.recs, Object.assign({ value: 3 }, A)).writes);
  b.apply(G.setMark(b.recs, Object.assign({}, A, { studentId: 'stu_theo01', value: 4 })).writes);
  const change = G.setMark(b.recs, Object.assign({ value: 1 }, A));
  b.apply(change.writes);
  b.apply(G.undo(b.recs, change.undo, NOW).writes);
  assert.equal(b.recs.get('mark_stu_mila01_2-NBT-A-3_2026-10-05').value, 3);
  assert.equal(b.recs.get('mark_stu_theo01_2-NBT-A-3_2026-10-05').value, 4);
});

test('undo leaves alone a record changed since on the other device, and says so', () => {
  const b = box(KIDS);
  const r = G.setMark(b.recs, Object.assign({ value: 3 }, A));
  b.apply(r.writes);
  b.apply([Object.assign({}, b.recs.get('mark_stu_mila01_2-NBT-A-3_2026-10-05'), { value: 4 })], 'phone');
  const u = G.undo(b.recs, r.undo, NOW);
  assert.deepEqual([u.writes.length, u.changedSince], [0, 1]);
});

test('undo of a batch of "not in" removes the whole batch', () => {
  const b = box(KIDS);
  const r = G.logRest(b.recs, { students: KIDS, codes: ['2.NBT.A.3'], date: TODAY, what: 'Lesson 2-3' });
  b.apply(r.writes);
  b.apply(G.undo(b.recs, r.undo, NOW).writes);
  assert.equal(b.live('missingWork').length, 0);
});

// ---------- assignments ----------
test('assignments: marks and "not in" sharing standard, date and name; derived marks are not assignments', () => {
  const marks = [
    { studentId: 'stu_mila01', standard: '2.NBT.A.3', date: TODAY, value: 3, what: 'Lesson 2-3' },
    { studentId: 'stu_theo01', standard: '2.NBT.A.3', date: TODAY, value: 2, what: 'Lesson 2-3' },
    { studentId: 'stu_mila01', standard: '2.NBT.A.3', date: '2026-09-30', value: 2 },
    { studentId: 'stu_mila01', standard: '2.RF.4', date: TODAY, value: 2, source: 'orf' }
  ];
  const missing = [{ studentId: 'stu_june01', standard: '2.NBT.A.3', date: TODAY, what: 'Lesson 2-3', excused: false },
    { studentId: 'stu_june01', standard: '2.NBT.A.3', date: '2026-09-30', excused: true }];
  const a = G.assignments(marks, missing, KIDS, byCode);
  assert.deepEqual(a.map(x => [x.key, x.marked, x.missing, x.total, x.complete]), [
    ['2.NBT.A.3|2026-10-05|Lesson 2-3', 2, 1, 3, true],
    ['2.NBT.A.3|2026-09-30|', 1, 0, 3, false]
  ]);
});

test('the rest of the same assessment: other standards under this date and name', () => {
  const marks = [{ standard: '2.NBT.A.1', date: TODAY, what: 'Unit 2 test' }, { standard: '2.NBT.A.4', date: TODAY, what: 'Unit 2 test' },
    { standard: '2.NBT.A.1', date: TODAY, what: 'exit ticket' }];
  assert.deepEqual(G.siblings(marks, [], { std: '2.NBT.A.3', date: TODAY, what: 'Unit 2 test', on: ['2.NBT.A.1', '2.NBT.A.3', '2.NBT.A.4'] }), ['2.NBT.A.1', '2.NBT.A.4']);
  assert.deepEqual(G.siblings(marks, [], { std: '2.NBT.A.3', date: TODAY, what: '', on: ['2.NBT.A.1'] }), [], 'no name, no siblings');
});

test('the previous mark is the last one on another day', () => {
  const marks = [{ studentId: 'k', standard: 's', date: '2026-09-29', value: 2 }, { studentId: 'k', standard: 's', date: '2026-09-15', value: 4 },
    { studentId: 'k', standard: 's', date: TODAY, value: 3 }];
  assert.equal(G.previous(marks, 'k', 's', TODAY).value, 2);
  assert.equal(G.previous([], 'k', 's', TODAY), null);
});

test('re-marking never renames: the card takes the name already on a standard and day, if they all share it', () => {
  const m = (what, extra) => Object.assign({ studentId: 'k', standard: 's', date: TODAY, value: 3, what }, extra);
  assert.equal(G.nameThere([m('exit ticket'), m('exit ticket')], 's', TODAY), 'exit ticket');
  assert.equal(G.nameThere([m('exit ticket'), m(undefined)], 's', TODAY), '', 'some unnamed: no single name');
  assert.equal(G.nameThere([m('exit ticket'), m('quiz')], 's', TODAY), '');
  assert.equal(G.nameThere([m('ORF check', { source: 'orf' })], 's', TODAY), '', 'derived marks are not assignments');
});
