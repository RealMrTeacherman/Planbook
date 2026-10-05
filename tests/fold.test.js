// Phonics folded into Reading (core/fold.js): hand-made cases.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../core/fold.js');
const NOW = '2026-10-06T00:00:00.000Z';
const base = () => [
  { id: 'subj_r', type: 'subject', name: 'Reading', benchmark: true, on: true },
  { id: 'subj_p', type: 'subject', name: 'Phonics', within: 'subj_r', on: true },
  { id: 'subj_w', type: 'subject', name: 'WIN', on: true },
  { id: 'blk_p', type: 'block', weekday: 1, start: '8:15', name: 'Phonics', subjectId: 'subj_p', note: 'Cards on the easel' },
  { id: 'blk_r', type: 'block', weekday: 1, start: '8:30', name: 'Reading', subjectId: 'subj_r' }
];
const run = recs => { const r = F.foldPhonics(recs, NOW); return { r, by: id => r.writes.find(w => w.id === id) }; };

test('Phonics is switched off and no longer inside Reading; its blocks become Reading\'s, time, name and note kept', () => {
  const { by } = run(base());
  assert.deepEqual([by('subj_p').on, 'within' in by('subj_p')], [false, false]);
  assert.deepEqual([by('blk_p').subjectId, by('blk_p').start, by('blk_p').name, by('blk_p').note], ['subj_r', '8:15', 'Phonics', 'Cards on the easel']);
  assert.equal(by('blk_r'), undefined, 'Reading\'s own blocks are untouched');
});

test('a Phonics note moves to Reading\'s note that day; without one, to the day\'s notes; the plan goes', () => {
  const recs = base().concat([
    { id: 'les_2026-10-05_subj_p', type: 'lessonPlan', date: '2026-10-05', subjectId: 'subj_p', pos: {}, taught: true, note: 'Short a sort' },
    { id: 'les_2026-10-05_subj_r', type: 'lessonPlan', date: '2026-10-05', subjectId: 'subj_r', pos: {}, taught: true, note: 'Partner read' },
    { id: 'les_2026-10-06_subj_p', type: 'lessonPlan', date: '2026-10-06', subjectId: 'subj_p', pos: {}, taught: false, note: 'Blends' },
    { id: 'les_2026-10-07_subj_p', type: 'lessonPlan', date: '2026-10-07', subjectId: 'subj_p', pos: {}, taught: false },
    { id: 'dayp_2026-10-06', type: 'dayPlan', date: '2026-10-06', notes: 'Assembly at 9', saved: true }]);
  const { r, by } = run(recs);
  assert.equal(by('les_2026-10-05_subj_r').note, 'Partner read\nPhonics: Short a sort');
  assert.equal(by('dayp_2026-10-06').notes, 'Assembly at 9\nPhonics: Blends');
  ['les_2026-10-05_subj_p', 'les_2026-10-06_subj_p', 'les_2026-10-07_subj_p'].forEach(id => assert.equal(by(id).deletedAt, NOW, id));
  assert.equal(r.moved, 2);
});

test('with no day plan yet, one is made for the note', () => {
  const { by } = run(base().concat([{ id: 'les_2026-10-08_subj_p', type: 'lessonPlan', date: '2026-10-08', subjectId: 'subj_p', pos: {}, note: 'Digraphs' }]));
  assert.deepEqual([by('dayp_2026-10-08').notes, by('dayp_2026-10-08').saved, by('dayp_2026-10-08').deletedAt], ['Phonics: Digraphs', true, null]);
});

test('a note that fits nowhere stays where it is; nothing is cut', () => {
  const long = 'x'.repeat(1995);
  const { by } = run(base().concat([
    { id: 'les_2026-10-09_subj_p', type: 'lessonPlan', date: '2026-10-09', subjectId: 'subj_p', pos: {}, note: 'Too much to fit' },
    { id: 'les_2026-10-09_subj_r', type: 'lessonPlan', date: '2026-10-09', subjectId: 'subj_r', pos: {}, note: 'y'.repeat(495) },
    { id: 'dayp_2026-10-09', type: 'dayPlan', date: '2026-10-09', notes: long, saved: true }]));
  assert.equal(by('les_2026-10-09_subj_p'), undefined, 'left as it is');
  assert.equal(by('dayp_2026-10-09'), undefined);
});

test('private notes about Phonics become about Reading', () => {
  const { by } = run(base().concat([{ id: 'pnote_1', type: 'privateNote', about: 'lesson', subjectId: 'subj_p', date: '2026-10-05', text: 'x' }]));
  assert.equal(by('pnote_1').subjectId, 'subj_r');
});

test('running it again changes nothing; a subject shown inside Reading that is not Phonics is left alone', () => {
  const recs = base();
  const once = run(recs).r.writes;
  const after = recs.map(x => once.find(w => w.id === x.id) || x);
  assert.deepEqual(F.foldPhonics(after, NOW).writes, []);
  const other = base().map(x => x.id === 'subj_w' ? Object.assign({}, x, { within: 'subj_r' }) : x).filter(x => x.id !== 'subj_p');
  assert.deepEqual(F.foldPhonics(other, NOW).writes, []);
});
