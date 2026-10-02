// v95 importer tests, on an invented v95 sync file in v95's real shapes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const IMPORTER = process.env.SUITE_IMPORTER || path.join(__dirname, '..', 'core', 'import-v95.js');
const imp = require(IMPORTER);
const { validateFile } = require(path.join(__dirname, '..', 'contract', 'validate.js'));
const contract = require(path.join(__dirname, '..', 'contract', 'contract.json'));
const FILE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const sample = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
const out = () => imp.convert(sample());
const byId = (o, id) => o.records.find(r => r.id === id);
const NAMES = ['Mila', 'Okafor', 'Theodore', 'Theo', 'Reyes', 'Juniper', 'June', 'Banks', 'Oscar', 'Lindqvist', 'Wren', 'Castillo', 'Odette'];

test('the result passes the contract', () => {
  const o = out();
  const r = validateFile({ contract: 'classroom-suite', version: 1, exportedAt: o.savedAt, device: 'test', records: o.records }, contract);
  assert.deepEqual(r.errors, []);
});

test('every kind of record comes in, in the expected numbers', () => {
  assert.deepEqual(out().counts, {
    student: 5, schoolYear: 1, gradingPeriod: 4, schoolDay: 1, orfCheck: 4, orfGoal: 2,
    station: 4, group: 8, placement: 6, visitor: 1, unit: 2
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
  assert.equal(k['Gradebook marks'], 3);
  assert.equal(k['Planner days'], 2);
  assert.equal(k['iReady rows'], undefined, 'an empty list is not shown');
  assert.equal(k['suite:win:v1'], 1);
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
