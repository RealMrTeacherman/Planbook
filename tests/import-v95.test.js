// v95 importer tests, on an invented v95 sync file in v95's real shapes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const IMPORTER = process.env.SUITE_IMPORTER || path.join(__dirname, '..', 'core', 'import-v95.js');
const imp0 = require(IMPORTER);
const NAMES_MOD = require(path.join(__dirname, '..', 'core', 'names.js'));
// Every conversion gets the name check, as the import page gives it.
const EXTRA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'planner-defaults.json'), 'utf8')).extraSubjects;
const imp = Object.assign({}, imp0, { convert: (f, o = {}) => imp0.convert(f, Object.assign({ names: NAMES_MOD, extraSubjects: EXTRA }, o)) });
const { validateFile } = require(path.join(__dirname, '..', 'contract', 'validate.js'));
const contract = require(path.join(__dirname, '..', 'contract', 'contract.json'));
const FILE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const sample = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
const out = () => imp.convert(sample());
const byId = (o, id) => o.records.find(r => r.id === id);
const NAMES = ['Mila', 'Okafor', 'Theodore', 'Theo', 'Reyes', 'Juniper', 'June', 'Banks', 'Oscar', 'Lindqvist', 'Wren', 'Castillo', 'Odette'];
// The report must not name a child; planner text that names one is checked separately below.

test('the result passes the contract', () => {
  const o = out();
  const r = validateFile({ contract: 'classroom-suite', version: contract.version, exportedAt: o.savedAt, device: 'test', records: o.records }, contract);
  assert.deepEqual(r.errors, []);
});

test('every kind of record comes in, in the expected numbers', () => {
  assert.deepEqual(out().counts, {
    student: 5, schoolYear: 1, gradingPeriod: 4, schoolDay: 1, orfCheck: 4, orfGoal: 2,
    station: 4, group: 8, placement: 6, visitor: 1, unit: 2,
    subject: 9, block: 95, dayPlan: 5, lessonPlan: 12, blockNote: 3, privateNote: 3, familyWeek: 2, subBlock: 5, subPlan: 1,
    mark: 8, missingWork: 3, gradebookSettings: 1
  });
});

test('converting the same file twice gives identical records', () => {
  assert.deepEqual(out().records, out().records);
});

test('every record carries the file\'s own time and the device v95', () => {
  for (const r of out().records) {
    assert.equal(r.updatedAt, '2026-10-01T22:04:05.000Z');
    assert.equal(r.device, 'v95');
  }
});

test('every v95 key is kept exactly as v95 wrote it', () => {
  const f = sample(), o = imp.convert(f);
  assert.deepEqual(o.archive, f.keys);
});

test('students keep ELD, nicknames and the Synergy id; an empty id is left out', () => {
  const o = out();
  assert.deepEqual(byId(o, 'stu_p8q7r6s').aka, ['Theo']);
  assert.equal(byId(o, 'stu_p8q7r6s').eld, true);
  assert.equal(byId(o, 'stu_p8q7r6s').districtId, undefined);
  assert.equal(byId(o, 'stu_k3j9x2a').districtId, '900001');
});

test('a short v95 id becomes a valid, repeatable id', () => {
  const ids = out().records.filter(r => r.type === 'student').map(r => r.id);
  const short = ids.find(i => i.startsWith('stu_ab'));
  assert.ok(short && short.length >= 8);
  assert.equal(imp.safe('ab'), imp.safe('ab'));
});

test('an evening reading lands on its Oregon day, not the UTC day', () => {
  const r = byId(out(), 'orf_r_evening');
  assert.equal(r.date, '2026-09-16');
  assert.equal(r.takenAt, '2026-09-17T01:15:00.000Z');
});

test('the Oregon day does not depend on the computer\'s time zone', () => {
  for (const tz of ['Asia/Tokyo', 'UTC', 'America/New_York']) {
    const d = execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(IMPORTER)}).oregonDate('2026-09-17T01:15:00.000Z'))`], { env: { ...process.env, TZ: tz } }).toString().trim();
    assert.equal(d, '2026-09-16', tz);
  }
});

test('a date moved by hand in the gradebook is kept', () => {
  assert.equal(byId(out(), 'orf_r_moved').date, '2026-09-18');
});

test('WCPM comes across unchanged, including part-minute, two-pass reads', () => {
  const o = out();
  assert.equal(byId(o, 'orf_r_moved').wcpm, 202);
  assert.equal(byId(o, 'orf_r_moved').seconds, 47);
  assert.equal(byId(o, 'orf_r_moved').passes, 2);
  assert.equal(byId(o, 'orf_r_evening').wcpm, 54);
});

test('each ORF check finds its gradebook child by every route v95 used', () => {
  const o = out();
  assert.equal(byId(o, 'orf_r_evening').studentId, 'stu_k3j9x2a'); // gb: id
  assert.equal(byId(o, 'orf_r_moved').studentId, 'stu_p8q7r6s');   // the gradebook's copy
  assert.equal(byId(o, 'orf_r_linked').studentId, 'stu_z1y2x3w');  // orfLink
});

test('an ORF student never linked comes in inactive, and is reported', () => {
  const o = out(), s = byId(o, 'stu_orf_o_orphan1');
  assert.equal(s.active, false);
  assert.equal(s.firstName, 'Wren');
  assert.equal(byId(o, 'orf_r_orphan').studentId, 'stu_orf_o_orphan1');
  assert.equal(byId(o, 'orf_r_orphan').passageTitle, 'Untitled passage');
  assert.ok(o.notes.some(n => n.includes('never linked')));
});

test('missed words carry what the child said and whether they were told', () => {
  const r = byId(out(), 'orf_r_evening');
  assert.equal(r.marked.length, 5);
  assert.deepEqual(r.marked[0], { kind: 'error', word: 'string,', said: 'sting', teacherTold: false });
  assert.deepEqual(r.marked[2], { kind: 'error', word: 'windy', teacherTold: true });
  assert.deepEqual(r.marked[4], { kind: 'selfCorrection', word: 'tail', said: 'tall', teacherTold: false });
  assert.equal(r.pausedSeconds, 4);
});

test('comprehension 0-3 becomes asked 3, and Not asked stays empty', () => {
  const o = out();
  assert.deepEqual(byId(o, 'orf_r_evening').comprehension, { asked: 3, correct: 2 });
  assert.deepEqual(byId(o, 'orf_r_linked').comprehension, { asked: 3, correct: 3 });
  assert.equal(byId(o, 'orf_r_moved').comprehension, null);
});

test('a check whose WCPM does not match its counts is held back with the reason, not changed', () => {
  const o = out();
  assert.equal(byId(o, 'orf_r_bad'), undefined);
  assert.ok(o.heldBack.some(h => h.why.includes('48 WCPM') && h.why.includes('give 50')));
});

test('the ORF tool\'s demo class is left out, checks and goals', () => {
  const o = out();
  assert.equal(byId(o, 'orf_r_demo'), undefined);
  assert.ok(!o.records.some(r => r.type === 'orfGoal' && r.winter === 1));
  assert.ok(o.notes.some(n => n.includes('demo class')));
});

test('ORF goals find their child; blanks stay empty and typed text becomes a number', () => {
  const o = out();
  assert.deepEqual([byId(o, 'ogoal_stu_k3j9x2a').winter, byId(o, 'ogoal_stu_k3j9x2a').spring], [84, 100]);
  assert.deepEqual([byId(o, 'ogoal_stu_p8q7r6s').winter, byId(o, 'ogoal_stu_p8q7r6s').spring], [null, 110]);
});

test('the math board: stations, groups, starting stations, pages and placements', () => {
  const o = out();
  assert.equal(byId(o, 'stn_math_2').hasPages, true);
  assert.equal(byId(o, 'grp_math_fox').station, 'stn_math_0');
  assert.deepEqual(byId(o, 'grp_math_fox').pages, { stn_math_2: 'p. 112–113' });
  assert.equal(byId(o, 'plc_math_stu_k3j9x2a').groupId, 'grp_math_fox');
  assert.equal(byId(o, 'plc_math_vis_g_odette').groupId, 'grp_math_lion');
  assert.ok(o.heldBack.some(h => h.what === 'a math board placement'));
});

test('reading units keep their placements, and a visitor in two places is one visitor', () => {
  const o = out();
  assert.equal(byId(o, 'plc_reading_unit_v95u1_stu_z1y2x3w').groupId, 'grp_reading_pink');
  assert.equal(byId(o, 'plc_reading_unit_v95u1_vis_g_odette').groupId, 'grp_reading_green');
  assert.equal(o.records.filter(r => r.type === 'visitor').length, 1);
  assert.equal(byId(o, 'unit_v95u2').start, null);
});

test('calendar: school year, four quarters, and days off with their names', () => {
  const o = out();
  assert.deepEqual([byId(o, 'year_2026').firstDay, byId(o, 'year_2026').lastDay], ['2026-09-02', '2027-06-10']);
  assert.equal(byId(o, 'gp_term_t2').name, 'Quarter 2');
  assert.equal(byId(o, 'sday_2026-11-11').label, 'Veterans Day');
});

test('what is not converted yet is listed as kept', () => {
  const k = out().kept;
  assert.equal(k['Gradebook marks'], undefined, 'marks are converted now, not just kept');
  assert.equal(k['Planner days'], undefined, 'the planner is converted now, not just kept');
  assert.equal(k['lp:settings:v2'], undefined);
  assert.equal(k['iReady rows'], undefined, 'an empty list is not shown');
  assert.equal(k['suite:win:v1'], 1);
});

// ---------- step 6a: the gradebook ----------
const marksOf = o => o.records.filter(r => r.type === 'mark');
test('marks come in one per child, standard and day, with the value, what it was and the note', () => {
  const o = out();
  const m = byId(o, 'mark_stu_p8q7r6s_2-OA-A-1_2026-09-15');
  assert.deepEqual([m.studentId, m.standard, m.date, m.value, m.what, m.note, m.source],
    ['stu_p8q7r6s', '2.OA.A.1', '2026-09-15', 2, 'Lesson 1-3', 'Used a number line', null]);
  const plain = byId(o, 'mark_stu_k3j9x2a_2-NBT-B-5_2026-09-28');
  assert.equal('what' in plain, false, 'no name stays no name: its own assignment');
  assert.equal('note' in plain, false, 'an empty note is left out');
});

test('marks worked out from ORF or iReady keep their source and a separate id', () => {
  const o = out();
  assert.equal(byId(o, 'mark_orf_stu_k3j9x2a_2-RF-4_2026-09-16').source, 'orf');
  assert.equal(byId(o, 'mark_iready_stu_z1y2x3w_2-NBT-B-5_2026-09-10').value, 3);
  assert.equal(marksOf(o).filter(m => m.source).length, 2);
  assert.match(o.notes.join(' '), /8 gradebook marks came in, 2 of them worked out from the ORF tool or iReady/);
});

test('a mark for a child no longer in the class list is held back and reported', () => {
  const o = out();
  assert.equal(marksOf(o).length, 8);
  assert.ok(o.heldBack.some(h => h.what === '1 gradebook mark' && /no longer in the class list/.test(h.why)));
});

test('two marks for one child, standard and day: the later one, which v95 counts, is kept', () => {
  const f = sample(), g = JSON.parse(f.keys.gb2_standards_v1);
  g.scores.push({ id: 's9', sid: 'k3j9x2a', std: '2.OA.A.1', v: 1, date: '2026-09-15', note: '', ctx: 'retake' });
  f.keys.gb2_standards_v1 = JSON.stringify(g);
  const o = imp.convert(f);
  const m = byId(o, 'mark_stu_k3j9x2a_2-OA-A-1_2026-09-15');
  assert.deepEqual([m.value, m.what], [1, 'retake']);
  assert.equal(marksOf(o).length, 8);
  assert.match(o.notes.join(' '), /1 mark was a second mark for the same child, standard and day/);
});

test('a broken mark is held back rather than guessed at', () => {
  const f = sample(), g = JSON.parse(f.keys.gb2_standards_v1);
  g.scores.push({ id: 'b1', sid: 'k3j9x2a', std: '2.OA.A.1', v: 7, date: '2026-09-15' },
    { id: 'b2', sid: 'k3j9x2a', std: 'place value', v: 3, date: '2026-09-15' },
    { id: 'b3', sid: 'k3j9x2a', std: '2.OA.A.1', v: 3, date: 'Sept 15' });
  f.keys.gb2_standards_v1 = JSON.stringify(g);
  const o = imp.convert(f);
  assert.ok(o.heldBack.some(h => h.what === '3 gradebook marks'));
  assert.equal(byId(o, 'mark_stu_k3j9x2a_2-OA-A-1_2026-09-15').value, 3, 'the good mark is untouched');
});

test('work not turned in comes in still out, handed in, or excused', () => {
  const o = out();
  const out1 = byId(o, 'miss_stu_ab-2e9_2-OA-A-1_2026-09-15');
  assert.deepEqual([out1.received, out1.excused, out1.what], [null, false, 'Lesson 1-3']);
  assert.equal(byId(o, 'miss_stu_p8q7r6s_2-NBT-B-5_2026-09-28').received, '2026-09-30');
  assert.equal(byId(o, 'miss_stu_z1y2x3w_2-NBT-B-5_2026-09-28').excused, true);
});

test('the tracked standards and settings come in; a turned-off standard stays off', () => {
  const s = byId(out(), 'gbset_main');
  assert.deepEqual(s.on, ['2.OA.A.1', '2.NBT.B.5', '2.RF.4', '2.RL.1', '2.L.4']);
  assert.deepEqual([s.rule, s.codes, s.subject], ['weighted', 'oregon', 'Math']);
});

// ---------- step 6b: marks for Synergy ----------
test('the Synergy-mark settings come in; a reading set not to count stays out', () => {
  const s = byId(out(), 'gbset_main');
  assert.deepEqual([s.orfCut4, s.orfCut3, s.orfCut2], [75, 50, 25]);
  assert.deepEqual(s.orfLeftOut, ['orf_r_moved']);
  assert.equal('carryForward' in s, false, 'never saved by v95: left out, so the default (true) applies');
});

test('settings v95 did save come in as they are', () => {
  const f = sample(), g = JSON.parse(f.keys.gb2_standards_v1);
  Object.assign(g.settings, { carryForward: false, ireadyInReport: true, orfAutoScore: false, orfStandard: '2.RF.3', orfAgainst: 'season',
    orfSeason: { fall: '08-15', winter: '12-01', spring: '03-01' }, orfCuts: { 4: 80, 3: 50, 2: 20 } });
  f.keys.gb2_standards_v1 = JSON.stringify(g);
  const s = byId(imp.convert(f), 'gbset_main');
  assert.deepEqual([s.carryForward, s.ireadyInReport, s.orfAuto, s.orfStandard, s.orfAgainst, s.orfSeasons.fall, s.orfCut4, s.orfCut2],
    [false, true, false, '2.RF.3', 'season', '08-15', 80, 20]);
});

test('a mark set by hand on a line of one standard becomes that standard\'s; on a line of several it stays kept', () => {
  const f = sample(), g = JSON.parse(f.keys.gb2_standards_v1);
  g.rc = [{ id: 'solo', s: 'Math', n: 'Fluently adds and subtracts within 20', std: ['2.OA.B.2'] }, { id: 'many', s: 'Math', n: 'Place value', std: ['2.NBT.A.1', '2.NBT.A.3'] }];
  g.overrides = { 't1|k3j9x2a|solo': 4, 't1|p8q7r6s|many': 2, 't1|gone99|solo': 3, 't9|k3j9x2a|solo': 2 };
  f.keys.gb2_standards_v1 = JSON.stringify(g);
  const o = imp.convert(f);
  const ov = o.records.filter(r => r.type === 'markOverride');
  assert.deepEqual(ov.map(r => [r.id, r.periodId, r.studentId, r.standard, r.value]),
    [['ovr_gp_term_t1_stu_k3j9x2a_2-OA-B-2', 'gp_term_t1', 'stu_k3j9x2a', '2.OA.B.2', 4]]);
  assert.match(o.notes.join(' '), /1 report card mark you set was on a line of several standards/);
  assert.ok(o.heldBack.some(h => h.what === '2 report card marks you set'), 'a gone child and a gone quarter');
  const file = { contract: 'classroom-suite', version: contract.version, exportedAt: '2026-10-01T22:04:05.000Z', device: 'v95', records: o.records };
  assert.deepEqual(validateFile(file, contract).errors, []);
});

test('children moved into skill groups come in, per subject and standard', () => {
  const f = sample(), g = JSON.parse(f.keys.gb2_standards_v1);
  g.groupPins = { 'Math|2.NBT.B.5': { k3j9x2a: 0, ab: -1 }, 'ELA|__all': { z1y2x3w: 2, gone99: 1 }, 'Science|2.L.4': { k3j9x2a: 1 } };
  f.keys.gb2_standards_v1 = JSON.stringify(g);
  const o = imp.convert(f);
  assert.deepEqual(o.records.filter(r => r.type === 'groupPin').map(r => [r.id, r.subject, r.standard, r.studentId, r.group]), [
    ['pin_Math_2-NBT-B-5_stu_k3j9x2a', 'Math', '2.NBT.B.5', 'stu_k3j9x2a', 0],
    ['pin_Math_2-NBT-B-5_stu_ab-2e9', 'Math', '2.NBT.B.5', 'stu_ab-2e9', -1],
    ['pin_ELA_all_stu_z1y2x3w', 'ELA', null, 'stu_z1y2x3w', 2]]);
  assert.ok(o.heldBack.some(h => h.what === '2 skill group moves'), 'a gone child and an unknown subject');
});

test('the imported gradebook passes the contract', () => {
  const o = out();
  const file = { contract: 'classroom-suite', version: contract.version, exportedAt: '2026-10-01T22:04:05.000Z', device: 'v95', records: o.records };
  const r = validateFile(file, contract);
  assert.deepEqual(r.errors, []);
});

test('the report never names a child', () => {
  const o = out();
  const text = JSON.stringify([o.notes, o.heldBack, o.kept, o.counts]);
  for (const n of NAMES) assert.ok(!text.includes(n), n);
});

test('a file that is not a v95 sync file is refused with directions', () => {
  assert.throws(() => imp.convert({ hello: 1 }), /Save a sync file/);
  assert.throws(() => imp.convert({ contract: 'classroom-suite', version: 1, records: [] }), /not a v95 sync file/);
  const f = sample(); f.updatedAt = 'yesterday';
  assert.throws(() => imp.convert(f), /no save time/);
});

test('a v95 file with empty or broken keys still converts what it can', () => {
  const f = sample();
  f.keys['suite:groups:v1'] = '{not json';
  delete f.keys['running-records-v1'];
  const o = imp.convert(f);
  assert.equal(o.counts.orfCheck, undefined);
  assert.equal(o.counts.station, undefined);
  assert.equal(o.archive['suite:groups:v1'], '{not json');
});

// ---------- the planner (step 4a) ----------
test('the planner comes in: subjects, every weekday\'s schedule, days, lessons, block notes', () => {
  const c = out().counts;
  assert.equal(c.subject, 9);
  assert.equal(c.block, 95, '94 on the schedule, and one kept (deleted) for a note');
  assert.equal(c.dayPlan, 5);
  assert.equal(c.lessonPlan, 12);
  assert.equal(c.blockNote, 3);
});

test('Reveal positions keep their kind, free text stays as typed, untaught days stay untaught', () => {
  const o = out();
  assert.deepEqual(byId(o, 'les_2026-09-14_subj_v95-math').pos, { unit: 1, lesson: 0, k: 'diag' });
  assert.deepEqual(byId(o, 'les_2026-09-14_subj_v95-science').pos, { text: 'Plants: what do they need?' });
  assert.equal(byId(o, 'les_2026-09-18_subj_v95-math').taught, false);
  assert.equal(byId(o, 'dayp_2026-09-18'), undefined, 'a draft day with no notes or flags needs no day record');
});

test('math follows the pacing guide and reading follows Benchmark, as switches on the subject', () => {
  const o = out();
  assert.equal(byId(o, 'subj_v95-math').pacing, true);
  assert.equal(byId(o, 'subj_v95-reading').benchmark, true);
  assert.equal(byId(o, 'subj_v95-science').pacing, undefined);
  assert.equal(byId(o, 'year_2026').earlyReleaseWeekday, 'wed');
});

test('schedule blocks keep their times, names, subjects and standing notes', () => {
  const o = out();
  const b = byId(o, 'blk_d1-1015');
  assert.deepEqual([b.weekday, b.start, b.name, b.subjectId], [1, '10:15', 'Math core lesson', 'subj_v95-math']);
  assert.match(b.note, /Reveal/);
  assert.equal(byId(o, 'blk_d1-930').subjectId, null, 'recess has no subject');
  assert.equal(o.records.filter(r => r.type === 'block' && r.weekday === 3).length, 13, 'the Wednesday early-release day');
});

test('flags keep only real flags; a block note for a block that is gone joins the day\'s notes', () => {
  const o = out();
  assert.deepEqual(byId(o, 'dayp_2026-09-17').flags, ['Fire drill']);
  const gone = o.records.find(r => r.type === 'blockNote' && r.text === 'Gone from the schedule');
  const blk = byId(o, gone.blockId);
  assert.deepEqual([blk.name, blk.start, !!blk.deletedAt], ['Old block', '9:00', true], 'kept with its block, which is marked deleted');
  assert.equal(byId(o, 'bnote_2026-09-15_blk_d2-1015').text, 'Use the big ten frames');
  assert.ok(o.notes.some(n => /block no longer on the schedule/.test(n)));
  assert.equal(byId(o, 'dayp_2026-09-15').notes, undefined, 'the day\'s own notes are untouched');
});

test('planner notes that name a child become private notes, and leave the live records', () => {
  const o = out();
  assert.equal(byId(o, 'dayp_2026-09-16').notes, undefined);
  assert.equal(byId(o, 'pnote_v95-day-2026-09-16').text, 'Mila to speech at 10:15');
  assert.equal(byId(o, 'les_2026-09-17_subj_v95-math').note, undefined);
  assert.equal(byId(o, 'pnote_v95-lesson-les_2026-09-17_subj_v95-math').subjectId, 'subj_v95-math');
  assert.equal(byId(o, 'blk_d2-745').note, undefined);
  assert.deepEqual([byId(o, 'pnote_v95-standing-blk_d2-745').about, byId(o, 'pnote_v95-standing-blk_d2-745').weekday], ['standing', 2]);
  assert.equal(byId(o, 'les_2026-09-15_subj_v95-math').note, 'Attitude survey first', 'a note with no name stays live');
  assert.ok(o.notes.some(n => /3 planner notes name a child/.test(n)));
});

test('no live record carries a class-list name in a checked field, except those reported', () => {
  const o = out();
  const N = require(path.join(__dirname, '..', 'core', 'names.js'));
  const kids = o.records.filter(r => r.type === 'student');
  const leaks = o.records.filter(r => contract.types[r.type].space === 'live')
    .filter(r => N.textToCheck(r, contract).some(t => N.nameHits(t, kids).length));
  assert.deepEqual(leaks.map(r => r.id), ['les_2026-09-17_subj_v95-science']);
  assert.ok(o.heldBack.some(h => /contain a name from your class list/.test(h.why)));
});

test('a lesson for a subject the planner does not have is held back with the reason', () => {
  assert.ok(out().heldBack.some(h => h.what === 'a planned lesson on 2026-09-16' && /not in the planner settings/.test(h.why)));
});

test('without the name check the importer stops, rather than letting names reach live sync', () => {
  assert.throws(() => imp0.convert(sample()), /name check did not load/);
});

test('STEAM, Health/SEL and Assembly / Enrichments / Other become subjects, linked to their blocks', () => {
  const o = out();
  assert.equal(byId(o, 'subj_steam').schema, 'free');
  assert.equal(byId(o, 'blk_d3-1145').subjectId, 'subj_steam');
  assert.equal(byId(o, 'blk_d3-1220').subjectId, 'subj_health-sel', 'Core Arts — Health/SEL Block A');
  assert.equal(byId(o, 'blk_d1-130').subjectId, 'subj_health-sel', 'Monday specials: Health/SEL');
  const flex = byId(o, 'blk_d3-945');
  assert.deepEqual([flex.name, flex.subjectId], ['Assembly / Enrichments / Other', 'subj_flex']);
  assert.equal(byId(o, 'blk_d3-915').subjectId, 'subj_v95-math', 'the 9:15 Math block stays Math');
  assert.equal(byId(o, 'subj_flex').color, '#3D4FB0');
});

test('Phonics comes in shown inside Reading, still its own subject', () => {
  const o = out();
  assert.equal(byId(o, 'subj_v95-phonics').within, 'subj_v95-reading');
  assert.equal(byId(o, 'subj_v95-reading').within, undefined);
});

test('the sub notes come across: standing notes, specials, block details on every day the block runs, leftovers', () => {
  const o = out();
  const sp = byId(o, 'subplan_main');
  assert.equal(sp.signal, 'Clap twice; they clap back.');
  assert.deepEqual(sp.watch, [{ name: 'Mila', note: 'Needs a movement break after Reading. Sits near the door.' }]);
  assert.deepEqual(sp.specials.M, ['Library', 'PE']);
  assert.equal(byId(o, 'subblk_blk_d1-1015').emergency, 'Do the Number Corner page instead.');
  assert.equal(o.records.filter(r => r.type === 'subBlock' && /Teacher Guide/.test(r.detail || '')).length, 4, 'the 10:15 block runs Monday, Tuesday, Thursday and Friday');
  assert.equal(byId(o, 'subblk_blk_d3-945').detail, 'Check the hallway calendar for an assembly.', 'follows the renamed 9:45 block');
  assert.deepEqual(sp.unplaced, ['9:99 Gone block: Old text with nowhere to go.']);
});
