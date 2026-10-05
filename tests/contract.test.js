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
    version: contract.version,
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
      { id: 'stu_deleted01', type: 'student', updatedAt: T, device: 'phone', deletedAt: '2026-10-01T16:00:00Z' },
      env('subj_v95-math', 'subject', { name: 'Math', curriculum: 'Reveal', schema: 'ul', color: '#D89A1C', on: true, order: 3, start: { unit: 1, lesson: 1 }, lessonsPerUnit: 10, pacing: true }),
      env('subj_v95-science', 'subject', { name: 'Science / SS', schema: 'free', on: true, order: 4, start: { text: '' } }),
      env('blk_d1-1015', 'block', { weekday: 1, start: '10:15', name: 'Math core lesson', subjectId: 'subj_v95-math', note: 'Reveal Teacher Guide' }),
      env('blk_d1-0930', 'block', { weekday: 1, start: '9:30', name: 'Recess', subjectId: null }),
      env('dayp_2026-09-21', 'dayPlan', { date: '2026-09-21', notes: 'Fire drill at 10', flags: ['Fire drill'], saved: true }),
      env('les_2026-09-21_subj_v95-math', 'lessonPlan', { date: '2026-09-21', subjectId: 'subj_v95-math', pos: { unit: 2, lesson: 4, k: 'probe' }, taught: true }),
      env('les_2026-09-21_subj_v95-science', 'lessonPlan', { date: '2026-09-21', subjectId: 'subj_v95-science', pos: { text: 'Plants, lesson 3' }, taught: false }),
      env('bnote_2026-09-21_blk_d1-1015', 'blockNote', { date: '2026-09-21', blockId: 'blk_d1-1015', text: 'Use the big ten frames' }),
      env('pnote_a1b2c3d4', 'privateNote', { about: 'standing', weekday: 1, blockId: 'blk_d1-0930', text: 'Mila to speech' }),
      env('fam_bm-1-1', 'familyWeek', { key: 'bm:1|1', goal: 'Metacognitive: Create Mental Images', spelling: 'hat, map' }),
      env('subplan_main', 'subPlan', { signal: 'Clap twice', watch: [{ name: 'Mila', note: 'Needs a break' }], specials: { M: ['Library', 'PE'] } }),
      env('subblk_blk_d1-1015', 'subBlock', { blockId: 'blk_d1-1015', detail: 'Guide on my desk', emergency: 'Number Corner page' }),
      env('mark_stu_a1b2c3d4e5_2-NBT-B-5_2026-10-05', 'mark', { studentId: 'stu_a1b2c3d4e5', standard: '2.NBT.B.5', date: '2026-10-05', value: 3, what: 'Lesson 2-3', note: 'Used a number line', source: null }),
      env('mark_orf_stu_a1b2c3d4e5_2-RF-4_2026-09-20', 'mark', { studentId: 'stu_a1b2c3d4e5', standard: '2.RF.4', date: '2026-09-20', value: 2, what: 'ORF check', note: '54 WCPM', source: 'orf' }),
      env('miss_stu_f6g7h8i9j0_2-NBT-B-5_2026-10-05', 'missingWork', { studentId: 'stu_f6g7h8i9j0', standard: '2.NBT.B.5', date: '2026-10-05', what: 'Lesson 2-3', received: null, excused: false }),
      env('gbset_main', 'gradebookSettings', { on: ['2.NBT.B.5', '2.RF.4'], rule: 'weighted', codes: 'oregon', subject: 'Math',
        carryForward: true, ireadyInReport: false, orfAuto: true, orfStandard: '2.RF.4', orfCut4: 75, orfCut3: 50, orfCut2: 25,
        orfAgainst: 'eoy', orfSeasons: { fall: '08-01', winter: '12-01', spring: '03-01' }, orfLeftOut: ['orf_r1'] }),
      env('pin_Math_2-NBT-B-5_stu_a1b2c3d4e5', 'groupPin', { subject: 'Math', standard: '2.NBT.B.5', studentId: 'stu_a1b2c3d4e5', group: 0 }),
      env('pin_ELA_all_stu_f6g7h8i9j0', 'groupPin', { subject: 'ELA', standard: null, studentId: 'stu_f6g7h8i9j0', group: -1 }),
      env('ovr_gp_t1xyz_stu_a1b2c3d4e5_2-NBT-B-5', 'markOverride', { periodId: 'gp_t1xyz', studentId: 'stu_a1b2c3d4e5', standard: '2.NBT.B.5', value: 3 })
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
  const newer = sample(); newer.version = contract.version + 1;
  const r1 = validateFile(newer, contract);
  assert.equal(r1.ok, false); assert.match(r1.errors[0], /newer version/);
  const older = sample(); older.version = contract.version - 1;
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
  const f = sample(); f.records.push(env('hwk_abcd', 'homework', {}));
  expectFail(f, 'unknown type');
});

test('a mark\'s id is built from its child, standard and date', () => {
  const f = sample(); find(f, 'mark_stu_a1b2c3d4e5_2-NBT-B-5_2026-10-05').date = '2026-10-06';
  expectFail(f, 'must be mark_stu_a1b2c3d4e5_2-NBT-B-5_2026-10-06');
  const g = sample(); find(g, 'mark_orf_stu_a1b2c3d4e5_2-RF-4_2026-09-20').source = null;
  expectFail(g, 'must be mark_stu_a1b2c3d4e5_2-RF-4_2026-09-20');
  const h = sample(); find(h, 'miss_stu_f6g7h8i9j0_2-NBT-B-5_2026-10-05').standard = '2.NBT.B.6';
  expectFail(h, 'must be miss_stu_f6g7h8i9j0_2-NBT-B-6_2026-10-05');
});

test('a mark is 1 to 4, under a real standard code, for a child in the file', () => {
  const f = sample(); find(f, 'mark_stu_a1b2c3d4e5_2-NBT-B-5_2026-10-05').value = 5;
  expectFail(f, 'above 4');
  const g = sample(); const m = find(g, 'mark_stu_a1b2c3d4e5_2-NBT-B-5_2026-10-05'); m.standard = 'NBT 5';
  expectFail(g, 'bad format');
  const h = sample(); h.records = h.records.filter(r => r.id !== 'stu_f6g7h8i9j0');
  expectFail(h, 'stu_f6g7h8i9j0 is not in the file');
});

test('a mark set by hand is one per quarter, child and standard, 1 to 4', () => {
  const id = 'ovr_gp_t1xyz_stu_a1b2c3d4e5_2-NBT-B-5';
  const f = sample(); find(f, id).value = 0;
  expectFail(f, 'below 1');
  const g = sample(); find(g, id).standard = '2.NBT.B.6';
  expectFail(g, 'must be ovr_gp_t1xyz_stu_a1b2c3d4e5_2-NBT-B-6');
  const h = sample(); find(h, id).periodId = 'gp_nowhere';
  expectFail(h, 'gp_nowhere is not in the file');
});

test('a skill-group move is one per subject, standard and child, in a group or Not placed', () => {
  const f = sample(); find(f, 'pin_Math_2-NBT-B-5_stu_a1b2c3d4e5').group = 6;
  expectFail(f, 'above 5');
  const g = sample(); find(g, 'pin_ELA_all_stu_f6g7h8i9j0').standard = '2.RL.1';
  expectFail(g, 'must be pin_ELA_2-RL-1_stu_f6g7h8i9j0');
});

test('ORF season lines must be MM-DD', () => {
  const f = sample(); find(f, 'gbset_main').orfSeasons.winter = 'Dec 1';
  expectFail(f, 'bad format');
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

test('planner ids follow their rules: one day plan per date, one lesson per subject per day, one note per block per day', () => {
  const f1 = sample(); find(f1, 'dayp_2026-09-21').id = 'dayp_other';
  expectFail(f1, 'must be dayp_2026-09-21');
  const f2 = sample(); find(f2, 'les_2026-09-21_subj_v95-math').id = 'les_random1';
  expectFail(f2, 'must be les_2026-09-21_subj_v95-math');
  const f3 = sample(); find(f3, 'bnote_2026-09-21_blk_d1-1015').id = 'bnote_random1';
  expectFail(f3, 'must be bnote_2026-09-21_blk_d1-1015');
});

test('schedule times, flags and positions are checked', () => {
  const f1 = sample(); find(f1, 'blk_d1-1015').start = '25:00';
  expectFail(f1, 'bad format');
  const f2 = sample(); find(f2, 'dayp_2026-09-21').flags = ['Pajama day'];
  expectFail(f2, 'must be one of');
  const f3 = sample(); find(f3, 'les_2026-09-21_subj_v95-math').pos.k = 'quiz';
  expectFail(f3, 'must be one of');
});

test('a lesson must point at a subject, and a block note at a block', () => {
  const f = sample(); find(f, 'les_2026-09-21_subj_v95-math').subjectId = 'blk_d1-1015';
  f.records.find(r => r.id === 'les_2026-09-21_subj_v95-math').id = 'les_2026-09-21_blk_d1-1015';
  expectFail(f, 'expected subject');
});

test('every record type says whether it is live or private', () => {
  for (const [name, t] of Object.entries(contract.types)) assert.ok(['live', 'private'].includes(t.space), name);
});

test('anything that names or points at a child is private', () => {
  for (const name of ['student', 'orfCheck', 'orfGoal', 'placement', 'visitor', 'privateNote']) assert.equal(contract.types[name].space, 'private', name);
});

test('a live type never points at a private one', () => {
  for (const [name, t] of Object.entries(contract.types)) {
    if (t.space !== 'live') continue;
    const walk = (fields, where) => {
      for (const [k, f] of Object.entries(fields)) {
        if (f.type === 'ref') for (const to of [].concat(f.to)) assert.equal(contract.types[to].space, 'live', `${where}.${k} points at ${to}`);
        if (f.fields) walk(f.fields, `${where}.${k}`);
        if (f.of && f.of.fields) walk(f.of.fields, `${where}.${k}`);
      }
    };
    walk(t.fields, name);
  }
});

test('every free-text field in a live type is marked for the name check', () => {
  const free = ['label', 'name', 'note', 'notes', 'text', 'title'];
  for (const [name, t] of Object.entries(contract.types)) {
    if (t.space !== 'live') continue;
    for (const [k, f] of Object.entries(t.fields)) {
      if (f.type === 'string' && free.some(w => k.toLowerCase().includes(w))) assert.equal(f.nameCheck, true, `${name}.${k}`);
    }
  }
});
