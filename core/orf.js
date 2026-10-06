// The ORF tool's reading logic (step 7, part 1: Assess). Pure. Ported exactly from v95's fluency page
// (tokenize, computeScores, the accuracy levels) and fluency-assess.js (what they said, teacher told,
// paused time). A session is { tokens, laps: [{ marks: { tokenIndex: 'e'|'s' }, stopTok }], notes }.
(function () {
  // v95 tokenize: blank lines split paragraphs; a token with a letter or digit is a word, counted in order.
  function tokenize(text) {
    const tokens = [];
    let wi = 0;
    const blocks = String(text).split(/\n\s*\n/);
    blocks.forEach((block, bi) => {
      block.split(/\s+/).filter(Boolean).forEach(raw => {
        const isWord = /[A-Za-z0-9]/.test(raw);
        tokens.push({ raw, word: isWord, wi: isWord ? wi++ : -1 });
      });
      if (bi < blocks.length - 1) tokens.push({ br: true, word: false, wi: -1 });
    });
    return tokens;
  }
  const wordCount = text => tokenize(text).filter(t => t.word).length;
  const lastWordTok = tokens => { for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].word) return i; return null; };

  // A new session, and the moves v95 makes on it.
  const session = text => ({ tokens: tokenize(text), laps: [{ marks: {}, stopTok: null }], lap: 0, editLap: 0, notes: {} });
  // Tap a word: error, then self-correction, then clear (on the pass being edited).
  function tap(S, i) {
    const L = S.laps[S.editLap] || S.laps[S.laps.length - 1];
    const cur = L.marks[i];
    if (!cur) L.marks[i] = 'e';
    else if (cur === 'e') L.marks[i] = 's';
    else { delete L.marks[i]; delete S.notes[S.editLap + ':' + i]; }
  }
  // "Started over": this pass ran to the end of the passage; a new pass begins.
  function restartPass(S) {
    const lt = lastWordTok(S.tokens);
    if (lt == null) return;
    S.laps[S.lap].stopTok = lt;
    S.laps.push({ marks: {}, stopTok: null });
    S.lap = S.editLap = S.laps.length - 1;
  }
  function undoRestart(S) {
    if (S.laps.length < 2) return;
    S.laps.pop();
    S.lap = S.editLap = S.laps.length - 1;
    S.laps[S.lap].stopTok = null;
  }
  // Time is up: the last word read, on the last pass.
  function setLastWord(S, i) { S.editLap = S.laps.length - 1; S.laps[S.editLap].stopTok = i; }
  // "Stopped at the end": the pass they never got into is dropped.
  function endOfPass(S) { if (S.laps.length < 2) return; S.laps.pop(); S.lap = S.editLap = S.laps.length - 1; }

  // Errors and self-corrections up to each pass's last word.
  function tally(S) {
    let e = 0, s = 0;
    S.laps.forEach(L => Object.keys(L.marks).forEach(k => {
      if (L.stopTok != null && (+k) > L.stopTok) return;
      if (L.marks[k] === 'e') e++; else if (L.marks[k] === 's') s++;
    }));
    return { e, s };
  }
  // v95 computeScores, exactly. elapsed: seconds of reading (pauses not counted); duration: the read time chosen.
  function computeScores(S, elapsed, duration) {
    const N = S.tokens.filter(t => t.word).length;
    let wordsRead = 0;
    const lapWords = [];
    S.laps.forEach((L, li) => {
      const isLast = li === S.laps.length - 1;
      const w = L.stopTok != null ? S.tokens[L.stopTok].wi + 1 : isLast ? 0 : N;
      lapWords.push(w);
      wordsRead += w;
    });
    const { e, s } = tally(S);
    const correct = Math.max(0, wordsRead - e);
    const mins = (elapsed || duration) / 60;
    const wcpm = mins > 0 ? Math.round(correct / mins) : 0;
    const acc = wordsRead > 0 ? (correct / wordsRead) * 100 : 0;
    return { wordsRead, errors: e, sc: s, correct, wcpm, accuracy: acc, elapsed: elapsed || duration, passes: S.laps.length, lapWords, passageWords: N };
  }
  // v95's accuracy levels.
  const accuracyLevel = acc => acc >= 97 ? 'Independent' : acc >= 95 ? 'Instructional' : acc >= 90 ? 'Hard — instructional edge' : 'Frustration level';

  // What they said / teacher told, per pass and word ("pass:index"), as fluency-assess.js keeps it.
  function setNote(S, pass, i, change) {
    const k = pass + ':' + i, kind = (S.laps[pass] || {}).marks && S.laps[pass].marks[i];
    if (!kind) return;
    const nt = Object.assign({ said: '', told: false }, S.notes[k], change);
    if (kind !== 'e') nt.told = false;   // only an error can be a word the teacher told
    S.notes[k] = nt;
  }
  // The marked words as v95 saved them: every error (each pass in turn, by position), then every
  // self-correction; with what was said and whether the teacher told the word (the importer's shape).
  function marked(S) {
    const out = [];
    ['e', 's'].forEach(want => S.laps.forEach((L, p) => {
      Object.keys(L.marks).map(Number).sort((a, b) => a - b).forEach(i => {
        if (L.stopTok != null && i > L.stopTok) return;
        if (L.marks[i] !== want) return;
        const nt = S.notes[p + ':' + i] || {};
        const x = { kind: want === 'e' ? 'error' : 'selfCorrection', word: String(S.tokens[i].raw).slice(0, 40) || '?', teacherTold: want === 'e' && !!nt.told };
        const said = String(nt.said || '').trim().slice(0, 60);
        if (said) x.said = said;
        out.push(x);
      });
    }));
    return out;
  }
  // The reading as Planbook saves it (an orfCheck), from a finished session.
  function checkRecord(S, { id, studentId, passage, takenAt, date, elapsed, duration, pausedSeconds }) {
    const r = computeScores(S, elapsed, duration);
    const rec = { id, type: 'orfCheck', deletedAt: null, studentId, date, takenAt,
      passageTitle: (passage && String(passage.title).trim().slice(0, 80)) || 'Untitled passage', passageWords: r.passageWords,
      seconds: Math.round(r.elapsed * 10) / 10, passes: r.passes, wordsRead: r.wordsRead, errors: r.errors,
      selfCorrections: r.sc, wcpm: r.wcpm };
    const m = marked(S);
    if (m.length) rec.marked = m;
    if (passage && passage.id) rec.passageId = passage.id;
    if (pausedSeconds >= 1) rec.pausedSeconds = Math.round(pausedSeconds);
    return rec;
  }

  const api = { tokenize, wordCount, lastWordTok, session, tap, restartPass, undoRestart, setLastWord, endOfPass, tally, computeScores,
    accuracyLevel, setNote, marked, checkRecord };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteOrfAssess = api;
})();
