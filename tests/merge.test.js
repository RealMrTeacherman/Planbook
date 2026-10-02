// Merge tests. Every name is invented.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const M = require(process.env.SUITE_MERGE || path.join(__dirname, '..', 'core', 'merge.js'));

const stu = (id, at, device, extra = {}) => Object.assign({ id, type: 'student', updatedAt: at, device, deletedAt: null, firstName: 'Mila', active: true, eld: false }, extra);
const T1 = '2026-10-01T10:00:00Z', T2 = '2026-10-01T11:00:00Z', T3 = '2026-10-01T12:00:00Z';
const merge = (a, b) => M.applyChanges(a, M.mergeRecords(a, b).changes);
const sorted = list => [...list].sort((x, y) => x.id < y.id ? -1 : 1);

test('a new record is added', () => {
  const r = M.mergeRecords([], [stu('stu_a1', T1, 'mac')]);
  assert.equal(r.counts.added, 1);
  assert.equal(r.changes.length, 1);
});

test('the same file twice changes nothing', () => {
  const file = [stu('stu_a1', T1, 'mac'), stu('stu_b2', T1, 'mac', { firstName: 'Theo' })];
  const once = merge([], file);
  const r = M.mergeRecords(once, file);
  assert.equal(r.changes.length, 0);
  assert.equal(r.counts.unchanged, 2);
});

test('the newer change wins, from either side', () => {
  const older = stu('stu_a1', T1, 'mac', { firstName: 'Mila' });
  const newer = stu('stu_a1', T2, 'phone', { firstName: 'Milagros' });
  assert.equal(merge([older], [newer])[0].firstName, 'Milagros');
  assert.equal(merge([newer], [older])[0].firstName, 'Milagros');
  assert.equal(M.mergeRecords([newer], [older]).counts.keptLocal, 1);
});

test('an exact tie is broken by device name, the same way on both devices', () => {
  const a = stu('stu_a1', T1, 'mac', { firstName: 'A' }), b = stu('stu_a1', T1, 'phone', { firstName: 'B' });
  assert.equal(merge([a], [b])[0].firstName, 'B');
  assert.equal(merge([b], [a])[0].firstName, 'B');
});

test('times with and without milliseconds compare as times, not text', () => {
  const a = stu('stu_a1', '2026-10-01T10:00:00.500Z', 'mac', { firstName: 'Later' });
  const b = stu('stu_a1', '2026-10-01T10:00:00Z', 'zzz', { firstName: 'Earlier' });
  assert.equal(merge([b], [a])[0].firstName, 'Later');
});

test('same content with a newer envelope is not a change, but the newer envelope is kept', () => {
  const a = stu('stu_a1', T1, 'mac'), b = stu('stu_a1', T2, 'phone');
  const r = M.mergeRecords([a], [b]);
  assert.equal(r.counts.unchanged, 1);
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].quiet, true);
  assert.equal(M.mergeRecords([b], [a]).changes.length, 0);
});

test('an empty field and a missing field are the same content', () => {
  const a = stu('stu_a1', T1, 'mac', { left: null }), b = stu('stu_a1', T2, 'phone');
  assert.equal(M.mergeRecords([a], [b]).counts.unchanged, 1);
});

test('a deletion travels as a change, and an older edit does not bring it back', () => {
  const live = stu('stu_a1', T1, 'mac');
  const gone = { id: 'stu_a1', type: 'student', updatedAt: T2, device: 'phone', deletedAt: T2 };
  const after = merge([live], [gone]);
  assert.ok(after[0].deletedAt);
  assert.equal(M.mergeRecords([live], [gone]).counts.deleted, 1);
  assert.ok(merge(after, [live])[0].deletedAt);
});

test('an edit made after a deletion wins', () => {
  const gone = { id: 'stu_a1', type: 'student', updatedAt: T2, device: 'phone', deletedAt: T2 };
  const edit = stu('stu_a1', T3, 'mac', { firstName: 'Back' });
  assert.equal(merge([gone], [edit])[0].firstName, 'Back');
});

test('a file with one id twice is refused', () => {
  assert.throws(() => M.mergeRecords([], [stu('stu_a1', T1, 'mac'), stu('stu_a1', T2, 'mac')]), /twice/);
});

test('one id with two types is refused', () => {
  const g = { id: 'stu_a1', type: 'group', updatedAt: T2, device: 'mac', deletedAt: null, kind: 'math', name: 'Fox', order: 0 };
  assert.throws(() => M.mergeRecords([stu('stu_a1', T1, 'mac')], [g]), /student here and a group/);
});

test('key order inside a record does not make it look changed', () => {
  const a = { id: 'grp_x1234', type: 'group', updatedAt: T1, device: 'mac', deletedAt: null, kind: 'math', name: 'Fox', order: 0, pages: { stn_a1234: 'p. 1', stn_b1234: 'p. 2' } };
  const b = { order: 0, name: 'Fox', kind: 'math', pages: { stn_b1234: 'p. 2', stn_a1234: 'p. 1' }, deletedAt: null, device: 'phone', updatedAt: T2, type: 'group', id: 'grp_x1234' };
  assert.equal(M.mergeRecords([a], [b]).counts.unchanged, 1);
});

test('two devices editing at random end up identical, whichever file is loaded first', () => {
  // A small random walk: both devices start from the same class, edit, then swap files.
  let seed = 7;
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let round = 0; round < 200; round++) {
    const base = [1, 2, 3, 4].map(i => stu(`stu_s${i}aa`, T1, 'mac', { firstName: 'N' + i }));
    const edit = (list, device) => list.map(r => {
      const k = rand(4);
      const at = `2026-10-01T1${1 + rand(3)}:00:00Z`;
      if (k === 0) return Object.assign({}, r, { firstName: r.firstName + device[0], updatedAt: at, device });
      if (k === 1) return { id: r.id, type: 'student', updatedAt: at, device, deletedAt: at };
      return r;
    });
    const mac = edit(base, 'mac'), phone = edit(base, 'phone');
    const macAfter = merge(mac, phone), phoneAfter = merge(phone, mac);
    assert.deepEqual(sorted(macAfter), sorted(phoneAfter), `round ${round}`);
    assert.equal(M.mergeRecords(macAfter, phoneAfter).changes.length, 0, `round ${round} settles`);
  }
});
