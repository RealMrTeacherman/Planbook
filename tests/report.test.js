// Marks for Synergy (step 6b), without v95: hand-worked values for each rule, carrying, overrides and ORF.
// tests/report-v95.browser.test.js checks the same functions against v95's own, cell by cell.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require(path.join(__dirname, '..', 'core', 'report.js'));
R.useNorms(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'orf-norms.json'), 'utf8')));

const Q = [
  { id: 'gp_q1', name: 'Quarter 1', start: '2026-09-02', end: '2026-11-06' },
  { id: 'gp_q2', name: 'Quarter 2', start: '2026-11-07', end: '2027-01-29' },
  { id: 'gp_q3', name: 'Quarter 3', start: '2027-01-30', end: '2027-04-09' }
];
const mk = (date, value, extra) => Object.assign({ studentId: 'stu_a', standard: '2.OA.A.1', date, value }, extra || {});
const ctx = (marks, s, extra) => R.context(Object.assign({ marks, checks: [], settings: Object.assign({ rule: 'weighted' }, s), terms: Q, overrides: [] }, extra));
const fin = (c, term, code) => R.finalMark(c, 'stu_a', code || '2.OA.A.1', term || Q[0]);

test('the three rules, as v95 figures them', () => {
  assert.equal(R.computeMark([2, 3], 'weighted'), 2.7, '(2·1 + 3·2) / 3');
  assert.equal(R.computeMark([3, 2], 'weighted'), 2.3);
  assert.equal(R.computeMark([2, 3], 'mean'), 2.5);
  assert.equal(R.computeMark([1, 2, 2], 'mean'), 1.7);
  assert.equal(R.computeMark([4, 1], 'latest'), 1);
  assert.equal(R.computeMark([], 'weighted'), null);
});

test('rounding: halves go up, and the mark stays 1 to 4', () => {
  assert.deepEqual([2.5, 2.4, 1.5, 0.2, 4.6, null].map(R.roundMark), [3, 2, 2, 1, 4, null]);
});

test('a quarter\'s mark uses only that quarter\'s marks, oldest first', () => {
  const c = ctx([mk('2026-10-01', 2), mk('2026-10-20', 4), mk('2026-11-07', 1)]);
  assert.deepEqual(fin(c), { v: 3, over: false, n: 2, raw: 3.3 });
  assert.deepEqual(fin(c, Q[1]), { v: 1, over: false, n: 1, raw: 1 });
});

test('the rule changes the mark: 1, 1, 4 is 3 weighted, 2 averaged, 4 latest', () => {
  const marks = [mk('2026-09-10', 1), mk('2026-10-01', 1), mk('2026-10-20', 4)];
  assert.equal(fin(ctx(marks, { rule: 'weighted' })).v, 3, '(1 + 2 + 12) / 6 = 2.5, rounded up');
  assert.equal(fin(ctx(marks, { rule: 'mean' })).v, 2);
  assert.equal(fin(ctx(marks, { rule: 'latest' })).v, 4);
});

test('carry forward: no marks this quarter takes the latest earlier quarter that has some', () => {
  const c = ctx([mk('2026-10-01', 3), mk('2026-10-02', 3)]);
  assert.deepEqual(fin(c, Q[2]), { v: 3, over: false, n: 0, carried: 'Quarter 1' });
  const later = ctx([mk('2026-10-01', 1), mk('2026-12-01', 4)]);
  assert.equal(fin(later, Q[2]).carried, 'Quarter 2', 'the latest earlier quarter, not the first');
  assert.equal(fin(later, Q[2]).v, 4);
});

test('marks from before any quarter carry as "earlier work"', () => {
  assert.deepEqual(fin(ctx([mk('2026-08-25', 2)]), Q[0]), { v: 2, over: false, n: 0, carried: 'earlier work' });
});

test('with carry forward off, a quarter with no marks has none', () => {
  assert.deepEqual(fin(ctx([mk('2026-10-01', 3)], { carryForward: false }), Q[1]), { v: null, over: false, n: 0, raw: null });
});

test('a mark set by you wins, and only for its quarter, child and standard', () => {
  const o = { id: R.overrideId('gp_q1', 'stu_a', '2.OA.A.1'), type: 'markOverride', periodId: 'gp_q1', studentId: 'stu_a', standard: '2.OA.A.1', value: 4 };
  const c = ctx([mk('2026-10-01', 1)], {}, { overrides: [o] });
  assert.deepEqual(fin(c), { v: 4, over: true, n: 1 });
  assert.equal(fin(c, Q[1]).over, false);
  assert.equal(R.finalMark(c, 'stu_b', '2.OA.A.1', Q[0]).over, false);
  const gone = ctx([mk('2026-10-01', 1)], {}, { overrides: [Object.assign({}, o, { deletedAt: '2026-10-05T00:00:00.000Z' })] });
  assert.equal(fin(gone).v, 1, 'a removed override no longer counts');
});

test('iReady marks count only when switched on; deleted marks never', () => {
  const marks = [mk('2026-10-01', 1), mk('2026-10-02', 4, { source: 'iready' }), mk('2026-10-03', 4, { deletedAt: '2026-10-04T00:00:00.000Z' })];
  assert.equal(fin(ctx(marks)).n, 1);
  assert.equal(fin(ctx(marks, { ireadyInReport: true })).n, 2);
});

// ---------- ORF ----------
const check = (id, date, wcpm, extra) => Object.assign({ id, type: 'orfCheck', studentId: 'stu_a', date, wcpm, wordsRead: 60, errors: 3 }, extra || {});

test('a reading is graded against end-of-year norms: 54 WCPM in the fall is a 1', () => {
  const s = R.settings({});
  assert.equal(R.wcpmToMark(54, '2026-09-20', s), 1, 'spring 25th is 72');
  assert.equal(R.wcpmToMark(72, '2026-09-20', s), 2);
  assert.equal(R.wcpmToMark(100, '2026-09-20', s), 3);
  assert.equal(R.wcpmToMark(124, '2026-09-20', s), 4);
});

test('against its own season instead: 54 in the fall is above the fall 50th, a 3', () => {
  assert.equal(R.wcpmToMark(54, '2026-09-20', R.settings({ orfAgainst: 'season' })), 3);
  assert.equal(R.wcpmToMark(54, '2027-01-10', R.settings({ orfAgainst: 'season' })), 1, 'winter 25th is 59');
});

test('the seasons start Aug 1, Dec 1 and Mar 1 unless set', () => {
  assert.deepEqual(['2026-08-01', '2026-11-30', '2026-12-01', '2027-02-28', '2027-03-01', '2027-07-31'].map(d => R.seasonIndex(d)), [0, 0, 1, 1, 2, 2]);
  assert.equal(R.seasonIndex('2026-11-15', { fall: '08-01', winter: '11-01', spring: '03-01' }), 1);
});

test('readings become marks on the ORF standard only; one set not to count stays out', () => {
  const checks = [check('orf_a', '2026-09-20', 100), check('orf_b', '2026-10-01', 124), check('orf_c', '2026-10-02', 30, { deletedAt: '2026-10-03T00:00:00.000Z' })];
  const m = R.orfMarks(checks, { orfLeftOut: ['orf_b'] });
  assert.deepEqual(m.map(x => [x.standard, x.date, x.value, x.source]), [['2.RF.4', '2026-09-20', 3, 'orf']]);
  assert.match(m[0].note, /^100 WCPM, 95% accurate$/);
  assert.deepEqual(R.orfMarks(checks, { orfAuto: false }), []);
  assert.equal(R.orfMarks(checks, { orfStandard: '2.RF.3' })[0].standard, '2.RF.3');
});

test('the ORF marks stored by the v95 import are not used: the readings are', () => {
  const c = R.context({ marks: [mk('2026-09-20', 4, { standard: '2.RF.4', source: 'orf' })], checks: [check('orf_a', '2026-09-20', 54)],
    settings: {}, terms: Q, overrides: [] });
  assert.deepEqual(fin(c, Q[0], '2.RF.4'), { v: 1, over: false, n: 1, raw: 1 });
});

test('on a day with a given mark and a reading, the given mark comes first (as in v95\'s list)', () => {
  const c = R.context({ marks: [mk('2026-09-20', 4, { standard: '2.RF.4' })], checks: [check('orf_a', '2026-09-20', 54)],
    settings: { rule: 'latest' }, terms: Q, overrides: [] });
  assert.equal(fin(c, Q[0], '2.RF.4').v, 1, 'latest is the reading\'s 1');
});
