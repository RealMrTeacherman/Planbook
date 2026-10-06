// The ORF tool's Assess logic (step 7, part 1), without v95: hand-worked readings.
// tests/orf-v95.browser.test.js reads the same passages the same way in v95's own page and compares.
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../core/orf.js');
const TEXT = 'A small red fox lived at the edge of the garden.\n\nEvery night she crept past the bean poles.';

test('tokens: words counted in order, punctuation kept on the word, paragraphs split', () => {
  const t = O.tokenize(TEXT);
  assert.equal(O.wordCount(TEXT), 19);
  assert.equal(t[10].raw, 'garden.');
  assert.equal(t[11].br, true);
  assert.equal(t[12].wi, 11);
  assert.equal(O.tokenize('Wait — what?').filter(x => x.word).length, 2, 'a dash alone is not a word');
});

test('one pass: words read to the last word, errors subtracted, per minute of reading', () => {
  const S = O.session(TEXT);
  O.tap(S, 1); O.tap(S, 4); O.tap(S, 4);       // an error, a self-correction
  O.setLastWord(S, 14);                          // token 14 is 'she', the 14th word
  const r = O.computeScores(S, 45, 60);
  assert.deepEqual([r.wordsRead, r.errors, r.sc, r.correct, r.wcpm], [14, 1, 1, 13, 17], '13 correct in 45 s is 17.3 a minute');
  assert.equal(O.accuracyLevel(r.accuracy), 'Hard — instructional edge', '13 of 14 is 92.9%');
});

test('a third tap clears the mark', () => {
  const S = O.session(TEXT);
  O.tap(S, 2); O.tap(S, 2); O.tap(S, 2);
  assert.deepEqual(S.laps[0].marks, {});
});

test('marks after the last word do not count', () => {
  const S = O.session(TEXT);
  O.tap(S, 15);
  O.setLastWord(S, 13);
  assert.equal(O.computeScores(S, 60, 60).errors, 0);
});

test('started over: the first pass counts the whole passage, its errors still count', () => {
  const S = O.session(TEXT);
  O.tap(S, 3);
  O.restartPass(S);
  O.tap(S, 0);
  O.setLastWord(S, 5);
  const r = O.computeScores(S, 60, 60);
  assert.deepEqual([r.passes, r.lapWords, r.wordsRead, r.errors, r.wcpm], [2, [19, 6], 25, 2, 23]);
  O.undoRestart(S);
  assert.equal(S.laps.length, 1);
  assert.equal(S.laps[0].stopTok, null);
});

test('stopped at the end: the pass never begun is dropped', () => {
  const S = O.session(TEXT);
  O.restartPass(S);
  O.endOfPass(S);
  assert.deepEqual(O.computeScores(S, 50, 60).lapWords, [19]);
});

test('accuracy levels as v95 names them', () => {
  assert.deepEqual([97, 96.9, 95, 94.9, 90, 89.9].map(O.accuracyLevel),
    ['Independent', 'Instructional', 'Instructional', 'Hard — instructional edge', 'Hard — instructional edge', 'Frustration level']);
});

test('what they said and teacher told: kept with each marked word, errors first, as v95 saves them', () => {
  const S = O.session(TEXT);
  O.tap(S, 6);                                        // 'the' error
  O.tap(S, 1); O.tap(S, 1);                           // 'small' self-correction
  O.tap(S, 3);                                        // 'fox' error
  O.setNote(S, 0, 3, { said: 'fix', told: true });
  O.setNote(S, 0, 1, { said: 'smell', told: true });  // teacher told only applies to an error
  O.setLastWord(S, 9);
  assert.deepEqual(O.marked(S), [
    { kind: 'error', word: 'fox', teacherTold: true, said: 'fix' },
    { kind: 'error', word: 'the', teacherTold: false },
    { kind: 'selfCorrection', word: 'small', teacherTold: false, said: 'smell' }]);
  O.tap(S, 3); O.tap(S, 3);                           // clearing the mark clears its note
  assert.equal(S.notes['0:3'], undefined);
});

test('the saved reading: the importer\'s shape, pauses kept, passage linked', () => {
  const S = O.session(TEXT);
  O.tap(S, 1);
  O.setLastWord(S, 9);
  const r = O.checkRecord(S, { id: 'orf_new1', studentId: 'stu_a', passage: { id: 'pas_1', title: 'The Garden Fox' }, takenAt: '2026-10-06T16:05:00.000Z',
    date: '2026-10-06', elapsed: 60, duration: 60, pausedSeconds: 12.4 });
  assert.deepEqual([r.type, r.wcpm, r.passageWords, r.passes, r.pausedSeconds, r.passageId, r.marked.length], ['orfCheck', 9, 19, 1, 12, 'pas_1', 1]);
  const none = O.checkRecord(O.session(TEXT), { id: 'x', studentId: 's', passage: null, takenAt: 't', date: 'd', elapsed: 60, duration: 60, pausedSeconds: 0 });
  assert.deepEqual([none.passageTitle, 'marked' in none, 'pausedSeconds' in none], ['Untitled passage', false, false]);
});
