// Groups & patterns (step 6c), without v95: hand-worked cases. tests/groups-v95.browser.test.js checks the
// same functions against v95's own, grouping by grouping.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const G = require(path.join(__dirname, '..', 'core', 'groups.js'));

const NOW = new Date('2026-10-15T18:00:00Z');
const kid = (id, first, last) => ({ id, type: 'student', firstName: first, lastName: last, active: true });
const K = [kid('a', 'Ava', 'Adams'), kid('b', 'Ben', 'Brook'), kid('c', 'Cy', 'Cole'), kid('d', 'Di', 'Dunn'), kid('e', 'Eve', 'Eng'), kid('f', 'Fay', 'Fox'), kid('g', 'Gus', 'Gale'), kid('h', 'Hal', 'Hart')];
const m = (sid, std, date, value, source) => ({ studentId: sid, standard: std, date, value, source: source || null });
const opt = (all, extra) => Object.assign({ students: K, all, codes: ['2.OA.A.1', '2.NBT.B.5'], days: '0', ev: 'both', now: NOW }, extra);
const names = g => g.map(r => r.st.firstName);

test('the newest mark counts most: each older one counts 0.62 of the next', () => {
  const r = G.weightedOn(opt([m('a', '2.OA.A.1', '2026-09-10', 2), m('a', '2.OA.A.1', '2026-10-01', 4)]), 'a', '2.OA.A.1');
  assert.equal(r.v, (2 * 0.62 + 4) / 1.62);
  assert.equal(r.n, 2);
});

test('across standards each counts once, however many marks it has', () => {
  const all = [m('a', '2.OA.A.1', '2026-09-10', 4), m('a', '2.OA.A.1', '2026-09-11', 4), m('a', '2.OA.A.1', '2026-09-12', 4), m('a', '2.NBT.B.5', '2026-09-12', 2)];
  assert.equal(G.weightedAcross(opt(all), 'a', ['2.OA.A.1', '2.NBT.B.5']).v, 3);
});

test('even groups, lowest first, the lowest group kept smallest; no marks means Not placed', () => {
  const vals = { a: 1, b: 2, c: 2, d: 3, e: 3, f: 4, g: 4 };
  const all = Object.entries(vals).map(([s, v]) => m(s, '2.OA.A.1', '2026-10-01', v));
  const r = G.buildSkillGroups(opt(all), '2.OA.A.1', 3);
  assert.deepEqual(r.groups.map(names), [['Ava', 'Ben'], ['Cy', 'Di'], ['Eve', 'Fay', 'Gus']], '7 into 3: 2, 2, 3');
  assert.deepEqual(names(r.out), ['Hal']);
});

test('ties go to the broader picture, then the latest mark, then the name', () => {
  const all = [m('a', '2.OA.A.1', '2026-10-01', 2), m('b', '2.OA.A.1', '2026-10-01', 2), m('a', '2.NBT.B.5', '2026-10-01', 4), m('b', '2.NBT.B.5', '2026-10-01', 1)];
  const r = G.buildSkillGroups(opt(all), '2.OA.A.1', 2);
  assert.deepEqual(r.groups.map(names), [['Ben'], ['Ava']], 'Ben\'s broader average is lower');
});

test('a child moved by hand stays put; Not placed and too-high groups are honored', () => {
  const all = ['a', 'b', 'c', 'd'].map((s, i) => m(s, '2.OA.A.1', '2026-10-01', i + 1));
  const r = G.buildSkillGroups(opt(all), '2.OA.A.1', 2, { d: 0, a: -1, h: 9 });
  assert.deepEqual(r.groups.map(names), [['Ben', 'Di'], ['Cy', 'Hal']], 'Di moved down; Hal (no marks) pinned past the last group lands in it');
  assert.deepEqual(names(r.out).slice(0, 1), ['Ava']);
  assert.equal(r.moved, 3);
  assert.ok(r.groups[0].find(x => x.sid === 'd').pinned);
});

test('a shared need: two or more with a 1 or 2 on a standard; standards with the same children merge', () => {
  const all = [m('a', '2.OA.A.1', '2026-10-01', 1), m('b', '2.OA.A.1', '2026-10-01', 2), m('c', '2.OA.A.1', '2026-10-01', 4),
    m('a', '2.NBT.B.5', '2026-10-01', 2), m('b', '2.NBT.B.5', '2026-10-01', 2)];
  const g = G.buildNeedGroups(opt(all), true);
  assert.deepEqual(g.map(x => [x.stds, x.kids.sort(), x.reteach]), [[['2.OA.A.1', '2.NBT.B.5'], ['a', 'b'], true]]);
  const ext = G.buildNeedGroups(opt([m('c', '2.OA.A.1', '2026-10-01', 4), m('d', '2.OA.A.1', '2026-10-01', 4), m('e', '2.OA.A.1', '2026-10-01', 3)]), false);
  assert.deepEqual(ext.map(x => x.kids.sort()), [['c', 'd']]);
});

test('only the latest mark counts toward a need, and one child alone is no group', () => {
  const all = [m('a', '2.OA.A.1', '2026-09-01', 1), m('a', '2.OA.A.1', '2026-10-01', 4), m('b', '2.OA.A.1', '2026-10-01', 1)];
  assert.deepEqual(G.buildNeedGroups(opt(all), true), []);
});

test('looking back 45 days leaves out older marks', () => {
  const all = [m('a', '2.OA.A.1', '2026-08-01', 1), m('a', '2.OA.A.1', '2026-10-10', 4)];
  assert.equal(G.weightedOn(opt(all, { days: '45' }), 'a', '2.OA.A.1').n, 1);
  assert.equal(G.weightedOn(opt(all), 'a', '2.OA.A.1').n, 2);
});

test('evidence: classwork only leaves out iReady marks; iReady only keeps just them', () => {
  const all = [m('a', '2.OA.A.1', '2026-10-01', 1), m('a', '2.OA.A.1', '2026-10-02', 4, 'iready')];
  assert.equal(G.weightedOn(opt(all, { ev: 'classroom' }), 'a', '2.OA.A.1').v, 1);
  assert.equal(G.weightedOn(opt(all, { ev: 'iready' }), 'a', '2.OA.A.1').v, 4);
});

test('worth a look: a child who slipped, and one with only one or two marks', () => {
  const all = [m('a', '2.OA.A.1', '2026-09-01', 3), m('a', '2.OA.A.1', '2026-10-01', 2), m('a', '2.NBT.B.5', '2026-10-01', 3), m('b', '2.OA.A.1', '2026-10-01', 2)];
  assert.deepEqual(G.flags(opt(all)), [{ t: 'down', sid: 'a', code: '2.OA.A.1', from: 3, to: 2 }, { t: 'thin', sid: 'b', n: 1 }]);
});

test('class at a glance: the latest mark on each standard with marks, and their average', () => {
  const all = [m('a', '2.OA.A.1', '2026-09-01', 1), m('a', '2.OA.A.1', '2026-10-01', 3), m('a', '2.NBT.B.5', '2026-10-01', 4)];
  const g = G.glance(opt(all));
  assert.deepEqual(g.codes, ['2.OA.A.1', '2.NBT.B.5']);
  assert.deepEqual([g.rows[0].cells.map(c => c.value), g.rows[0].avg], [[3, 4], 3.5]);
  assert.equal(g.rows[1].avg, null);
});

test('with nothing picked, groups are on the standard with the newest mark', () => {
  const all = [m('a', '2.OA.A.1', '2026-09-01', 1), m('a', '2.NBT.B.5', '2026-10-01', 3)];
  assert.equal(G.defaultSel(opt(all)), '2.NBT.B.5');
  assert.equal(G.defaultSel(opt([])), '__all');
});

test('needs that share no children stay separate; a 3 is no need', () => {
  const all = [m('a', '2.OA.A.1', '2026-10-01', 1), m('b', '2.OA.A.1', '2026-10-01', 2), m('e', '2.OA.A.1', '2026-10-01', 3),
    m('c', '2.NBT.B.5', '2026-10-01', 2), m('d', '2.NBT.B.5', '2026-10-01', 1), m('e', '2.NBT.B.5', '2026-10-01', 3)];
  assert.deepEqual(G.buildNeedGroups(opt(all), true).map(g => [g.stds, g.kids.sort()]), [[['2.OA.A.1'], ['a', 'b']], [['2.NBT.B.5'], ['c', 'd']]]);
});

test('a mark that rose is not slipping', () => {
  assert.deepEqual(G.flags(opt([m('a', '2.OA.A.1', '2026-09-01', 2), m('a', '2.OA.A.1', '2026-10-01', 3), m('a', '2.NBT.B.5', '2026-10-02', 3)])), []);
});
