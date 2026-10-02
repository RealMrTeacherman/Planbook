// Contract tests. Every name here is invented.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const VALIDATOR = process.env.SUITE_VALIDATOR || path.join(__dirname, '..', 'contract', 'validate.js');
const { validateFile, validateDisplay } = require(VALIDATOR);
const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contract', 'contract.json'), 'utf8'));

const T = '2026-10-01T15:00:00Z';
const env = (id, type, extra = {}) => ({ id, type, updatedAt: T, device: 'mac', deletedAt: null, ...extra });

function sample() {
  return {
    contract: 'classroom-suite',
    version: 1,
    exportedAt: T,
    device: 'mac',
    records: [
      env('stu_a1b2c3d4e5', 'student', { firstName: 'Mila', lastName: 'Okafor', active: true, eld: false, joined: '2026-09-02', left: null, districtId: '900001' }),
      env('stu_f6g7h8i9j0', 'student', { firstName: 'Theodore', aka: ['Theo'], active: true, eld: true }),
      env('stu_k1l2m3n4o5', 'student', { firstName: 'Juniper', displayName: 'Juniper B.', active: false, eld: false, joined: '2026-09-02', left: '2026-09-30' }),
      env('year_2026', 'schoolYear', { firstDay: '2026-09-02', lastDay: '2027-06-10', earlyReleaseWeekday: 'wed' }),
      env('sday_2026-11-11', 'schoolDay', { date: '2026-11-11', kind: 'noSchool', label: 'Veterans Day' }),
      env('gp_t1xyz', 'gradingPeriod', { name: 'Trimester 1', start: '2026-09-02', end: '2026-11-26' }),
      env('orf_q1w2e3r4', 'orfCheck', {
        studentId: 'stu_a1b2c3d4e5', date: '2026-09-20', takenAt: '2026-09-21T00:30:00Z', passageTitle: 'The Lost Kite', passageWords: 120,
        seconds: 60, passes: 1, wordsRead: 58, errors: 4, selfCorrections: 1, wcpm: 54, pausedSeconds: 0,
        marked: [{ kind: 'error', word: 'string', said: 'sting', teacherTold: false },
                 { kind: 'selfCorrection', word: 'kite', teacherTold: false }],
        comprehension: { asked: 3, correct: 2 }
      }),
      env('orf_z9x8c7v6', 'orfCheck', {
        studentId: 'stu_k1l2m3n4o5', date: '2026-09-21', passageTitle: 'The Lost Kite',
        seconds: 47.5, passes: 2, wordsRead: 160, errors: 2, selfCorrections: 0, wcpm: 200, comprehension: null
      }),
      env('ogoal_stu_a1b2c3d4e5', 'orfGoal', { studentId: 'stu_a1b2c3d4e5', winter: 84, spring: null }),
      env('unit_u1abc', 'unit', { name: 'Unit 1', start: '2026-09-08', order: 0 }),
      env('grp_fox01', 'group', { kind: 'math', name: 'Fox', look: 'fox', order: 0, station: 'stn_teacher1', pages: { stn_desk01: 'p. 112' } }),
      env('grp_orange1', 'group', { kind: 'reading', name: 'Orange', look: 'orange', order: 0 }),
      env('vis_odette1', 'visitor', { firstName: 'Odette', active: true }),
      env('plc_math_stu_a1b2c3d4e5', 'placement', { groupKind: 'math', studentId: 'stu_a1b2c3d4e5', groupId: 'grp_fox01' }),
      env('plc_reading_unit_u1abc_stu_f6g7h8i9j0', 'placement', { groupKind: 'reading', unitId: 'unit_u1abc', studentId: 'stu_f6g7h8i9j0', groupId: 'grp_orange1' }),
      env('plc_walkToWin_vis_odette1', 'placement', { groupKind: 'walkToWin', studentId: 'vis_odette1', groupId: 'grp_orange1' }),
      env('stn_teacher1', 'station', { kind: 'math', name: 'Teacher Table', order: 0, hasPages: false }),
      env('stn_desk01', 'station', { kind: 'math', name: 'Desk Work', order: 2, hasPages: true }),
      { id: 'stu_deleted01', type: 'student', updatedAt: T, device: 'phone', deletedAt: '2026-10-01T16:00:00Z' }
    ]
  };
}
const find = (f, id) => f.records.find(r => r.id === id);
const expectFail = (f, part) => {
  const r = validateFile(f, contract);
  assert.equal(r.ok, false, 'should be refused');
  assert.ok(r.errors.some(e => e.includes(part)), `expected an error mentioning "${part}", got:\n${r.errors.join('\n')}`);
};

test('a complete invented class passes', () => {
  const r = validateFile(sample(), contract);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('every record type in the contract appears in the sample', () => {
  const seen = new Set(sample().records.map(r => r.type));
  for (const t of Object.keys(contract.types)) assert.ok(seen.has(t), `sample has no ${t}`);
});

test('a file from a newer version is refused, an older one asks for an upgrade', () => {
  const newer = sample(); newer.version = 2;
  const r1 = validateFile(newer, contract);
  assert.equal(r1.ok, false); assert.match(r1.errors[0], /newer version/);
  const older = sample(); older.version = 0;
  const r2 = validateFile(older, contract);
  assert.equal(r2.ok, false); assert.equal(r2.needsUpgrade, true);
});

test('a file without the contract name is refused', () => {
  const f = sample(); delete f.contract;
  expectFail(f, 'file.contract');
});

test('missing required field is refused', () => {
  const f = sample(); delete find(f, 'stu_f6g7h8i9j0').firstName;
  expectFail(f, 'firstName: missing');
});

test('a field not in the contract is refused', () => {
  const f = sample(); find(f, 'stu_f6g7h8i9j0').marks = [3, 4];
  expectFail(f, 'marks: not in the contract');
});

test('unknown record type is refused', () => {
  const f = sample(); f.records.push(env('mark_abcd', 'mark', {}));
  expectFail(f, 'unknown type');
});

test('impossible dates and local times are refused', () => {
  const f1 = sample(); find(f1, 'sday_2026-11-11').date = '2026-02-30';
  find(f1, 'sday_2026-11-11').id = 'sday_2026-02-30';
  expectFail(f1, 'must be a date');
  const f2 = sample(); find(f2, 'stu_f6g7h8i9j0').updatedAt = '2026-10-01T08:00:00';
  expectFail(f2, 'UTC time');
});

test('date-keyed and placement ids must follow their rule', () => {
  const f1 = sample(); find(f1, 'sday_2026-11-11').id = 'sday_holiday';
  expectFail(f1, 'must be sday_2026-11-11');
  const f2 = sample(); find(f2, 'plc_math_stu_a1b2c3d4e5').id = 'plc_random1';
  expectFail(f2, 'must be plc_math_stu_a1b2c3d4e5');
});

test('wrong id prefix and duplicate ids are refused', () => {
  const f1 = sample(); find(f1, 'grp_fox01').id = 'stu_fox01';
  expectFail(f1, 'must start with grp_');
  const f2 = sample(); f2.records.push({ ...find(f2, 'stu_f6g7h8i9j0') });
  expectFail(f2, 'appears twice');
});

test('a reference to a missing record is refused', () => {
  const f = sample(); find(f, 'orf_q1w2e3r4').studentId = 'stu_nobody0000';
  expectFail(f, 'not in the file');
});

test('a reference to the wrong kind of record is refused', () => {
  const f = sample(); find(f, 'orf_q1w2e3r4').studentId = 'grp_fox01';
  expectFail(f, 'expected student');
});

test('a reference to a deleted student is allowed (history stays)', () => {
  const f = sample(); find(f, 'orf_z9x8c7v6').studentId = 'stu_deleted01';
  assert.deepEqual(validateFile(f, contract).errors, []);
});

test('WCPM uses v95\'s formula, including part-second times and several passes', () => {
  const f = sample();
  assert.equal(find(f, 'orf_z9x8c7v6').wcpm, Math.round(158 / (47.5 / 60)));
  assert.deepEqual(validateFile(f, contract).errors, []);
});

test('WCPM must match words read, errors and seconds', () => {
  const f = sample(); find(f, 'orf_q1w2e3r4').wcpm = 58;
  expectFail(f, 'should be 54');
});

test('more errors than words, or more correct than asked, is refused', () => {
  const f1 = sample(); Object.assign(find(f1, 'orf_q1w2e3r4'), { errors: 70, wcpm: -12 });
  expectFail(f1, 'more errors than words');
  const f2 = sample(); find(f2, 'orf_q1w2e3r4').comprehension.correct = 5;
  expectFail(f2, 'more correct than asked');
});

test('more marked words than counted are refused', () => {
  const f = sample(); find(f, 'orf_q1w2e3r4').selfCorrections = 0;
  expectFail(f, 'more self-corrected words');
});

test('reading placements need their unit, and others must not have one', () => {
  const f1 = sample(); const p = find(f1, 'plc_reading_unit_u1abc_stu_f6g7h8i9j0'); delete p.unitId; p.id = 'plc_reading_stu_f6g7h8i9j0';
  expectFail(f1, 'needs its unit');
  const f2 = sample(); const m = find(f2, 'plc_math_stu_a1b2c3d4e5'); m.unitId = 'unit_u1abc';
  expectFail(f2, 'only reading placements');
});

test('ORF goals are one per student', () => {
  const f = sample(); find(f, 'ogoal_stu_a1b2c3d4e5').id = 'ogoal_other1';
  expectFail(f, 'must be ogoal_stu_a1b2c3d4e5');
});

test('page maps are keyed by station id and point at real stations only through refs', () => {
  const f = sample(); find(f, 'grp_fox01').pages = { 'Desk Work': 'p. 112' };
  expectFail(f, 'is not an id');
});

test('nickname lists have a limit', () => {
  const f = sample(); find(f, 'stu_f6g7h8i9j0').aka = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  expectFail(f, 'more than 6 items');
});

test('reversed date ranges are refused', () => {
  const f = sample(); find(f, 'gp_t1xyz').end = '2026-08-01';
  expectFail(f, 'end is before start');
});

test('a deleted record may drop its fields but keeps its envelope', () => {
  const f = sample(); delete find(f, 'stu_deleted01').device;
  expectFail(f, 'device: missing');
});

function display() {
  return {
    contract: 'classroom-suite-display', version: 1, date: '2026-10-01',
    groups: [{ kind: 'math', name: 'Fox', look: 'fox', station: 'Teacher table', page: 'p. 112', members: ['Mila', 'Odette'] }]
  };
}

test('a display file with only names and groups passes', () => {
  assert.deepEqual(validateDisplay(display(), contract).errors, []);
});

test('a display file carrying scores, notes or ids is refused', () => {
  const d1 = display(); d1.groups[0].wcpm = [54];
  assert.equal(validateDisplay(d1, contract).ok, false);
  const d2 = display(); d2.notes = 'watch Theo';
  assert.equal(validateDisplay(d2, contract).ok, false);
  const d3 = display(); d3.groups[0].members = [{ id: 'stu_a1b2c3d4e5', name: 'Mila' }];
  assert.equal(validateDisplay(d3, contract).ok, false);
});

test('the contract file itself names no owner outside the known tools', () => {
  const tools = ['gradebook', 'planner', 'subplans', 'orf', 'smallgroups', 'display'];
  for (const [t, spec] of Object.entries(contract.types)) {
    assert.ok(tools.includes(spec.owner), `${t} owner`);
    spec.readers.forEach(r => assert.ok(tools.includes(r), `${t} reader ${r}`));
    assert.ok(!spec.readers.includes(spec.owner), `${t} lists its owner as a reader`);
  }
});
