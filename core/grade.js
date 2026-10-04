// The gradebook's logic. Pure: no storage, no page. Ported from v95's gradebook (Enter scores).
// Every entry action returns { writes, undo }: the records to write, and how to put back exactly
// what was there before. Undo restores a record only if nobody has changed it since.
(function () {
  // ---------- the Reveal guide, as v95's curriculum.js reads it ----------
  let FLAT = [], BYUNIT = {}, CROSS = {}, SHOW = {};
  function useGuide(reveal) {
    FLAT = []; BYUNIT = {}; CROSS = (reveal && reveal.cross) || {}; SHOW = {};
    (reveal ? reveal.units : []).forEach(u => { BYUNIT[u.u] = u; u.steps.forEach(s => { FLAT.push(Object.assign({}, s, { u: u.u, i: FLAT.length })); }); });
    // Oregon -> the CCSS code to show for it: the first CCSS code that maps to it alone, else the first that maps to it at all.
    Object.keys(CROSS).forEach(c => { const or = CROSS[c].or; if (or.length === 1 && !SHOW[or[0]] && c.split('.').length === 3) SHOW[or[0]] = c; });
    Object.keys(CROSS).forEach(c => { CROSS[c].or.forEach(o => { if (!SHOW[o]) SHOW[o] = c; }); });
  }
  const uniq = a => a.filter((x, i) => x && a.indexOf(x) === i);
  const units = () => Object.keys(BYUNIT).map(Number).sort((a, b) => a - b).map(n => BYUNIT[n]);
  const stepAt = i => FLAT[i] || null;
  // The guide step a planner position points at (as plan.js's find), with its place in the guide.
  function stepOf(pos) {
    if (!pos) return null;
    const k = pos.k || 'L';
    return FLAT.find(s => s.u === Number(pos.unit) && s.k === k && (k !== 'L' || s.n === Number(pos.lesson))) || null;
  }
  function lessonsOf(u, upTo) {
    const U = BYUNIT[Number(u)];
    return U ? U.steps.filter(s => s.k === 'L' && (upTo == null || s.n <= upTo)) : [];
  }
  // CCSS codes a day works on. A lesson has its own; a review or a unit test covers the unit; a probe covers the lessons before it.
  function ccss(s) {
    if (!s) return [];
    if (s.k === 'L') return (s.std || []).slice();
    const from = s.k === 'assess' || s.k === 'review' ? lessonsOf(s.u) : s.k === 'probe' ? lessonsOf(s.u, s.after) : [];
    return uniq([].concat(...from.map(l => l.std || [])));
  }
  const toOregon = c => CROSS[c] ? CROSS[c].or.slice() : [];
  const oregon = s => uniq([].concat(...ccss(s).map(toOregon)));
  const ccssFor = or => SHOW[or] || null;
  // What to call marks from a guide day: "Lesson 2-3", "Unit 2 test".
  function ctxFor(s) {
    if (!s) return '';
    if (s.k === 'L') return `Lesson ${s.u}-${s.n}`;
    if (s.k === 'assess') return `Unit ${s.u} test`;
    if (s.k === 'probe') return `Unit ${s.u} probe`;
    if (s.k === 'review') return `Unit ${s.u} review`;
    return s.t;
  }
  const lessonFromCtx = ctx => { if (!ctx) return null; const s = FLAT.find(x => ctxFor(x) === ctx); return s ? s.i : null; };
  const stepName = s => !s ? '' : s.k === 'L' ? `Lesson ${s.u}-${s.n} · ${s.t}` : s.t;

  // ---------- the planner's day ----------
  // The Reveal lesson the planner shows for a date: the one planned, else the one it suggests.
  // P is SuitePlan. A day off, a weekend, or a day whose schedule has no Math has none.
  // On purpose unlike v95: a lesson planned but not yet marked taught counts (as everywhere in the new planner).
  function dayLesson(P, { date, subjects, lessons, blocks, days, year }) {
    const sb = subjects.find(s => !s.deletedAt && P.revealOn(s));
    if (!sb || !date) return null;
    if (!P.dayStatus(date, { year, days }).school) return null;
    const rec = lessons.find(l => !l.deletedAt && l.date === date && l.subjectId === sb.id);
    if (rec) return stepOf(rec.pos);
    if (!sb.on) return null;
    const mine = blocks.filter(b => !b.deletedAt && b.weekday === P.weekday(date));
    if (mine.length && !mine.some(b => b.subjectId === sb.id)) return null;
    return stepOf(P.suggest(sb, lessons, date));
  }
  // The dates the planner has a guide step marked taught, oldest first.
  function datesTaught(lessons, subjectId, i) {
    return lessons.filter(l => !l.deletedAt && l.subjectId === subjectId && l.taught && (stepOf(l.pos) || {}).i === i).map(l => l.date).sort();
  }

  // ---------- ids ----------
  const stdKey = c => String(c).replace(/\./g, '-');
  const markId = (studentId, standard, date, source) => `mark_${source ? source + '_' : ''}${studentId}_${stdKey(standard)}_${date}`;
  const missId = (studentId, standard, date) => `miss_${studentId}_${stdKey(standard)}_${date}`;
  const live = r => r && !r.deletedAt ? r : null;

  // ---------- reading the data ----------
  // recs: every record the store holds, deleted ones too, as a Map by id.
  const markOf = (recs, studentId, standard, date) => live(recs.get(markId(studentId, standard, date)));
  const openMiss = (recs, studentId, standard, date) => { const m = live(recs.get(missId(studentId, standard, date))); return m && !m.received && !m.excused ? m : null; };
  // A child's marks on a standard, oldest first (v95 scoresFor).
  const marksFor = (marks, studentId, standard) => marks.filter(m => m.studentId === studentId && m.standard === standard).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  // The last mark before this assignment's day, for "was 3".
  function previous(marks, studentId, standard, date) {
    const a = marksFor(marks, studentId, standard).filter(m => m.date !== date);
    return a.length ? a[a.length - 1] : null;
  }
  // Every assignment: marks given (not derived) and work not turned in that share standard, date and what it was.
  // Newest first. total counts the children in the class now.
  function assignments(marks, missing, students, byCode) {
    const map = new Map();
    const slot = (std, date, what) => {
      const k = std + '|' + date + '|' + (what || '');
      if (!map.has(k)) map.set(k, { key: k, std, date, what: what || '', marked: 0, missing: 0 });
      return map.get(k);
    };
    marks.forEach(m => { if (!m.source) slot(m.standard, m.date, m.what).marked++; });
    missing.forEach(m => { if (!m.excused) slot(m.standard, m.date, m.what).missing++; });
    const total = students.filter(s => s.active).length;
    return [...map.values()].filter(a => byCode[a.std]).map(a => Object.assign(a, {
      subject: byCode[a.std].subject, label: byCode[a.std].label, total, done: a.marked + a.missing,
      complete: total > 0 && a.marked + a.missing >= total
    })).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0) || (x.std < y.std ? -1 : x.std > y.std ? 1 : 0));
  }
  // Other standards already marked (or logged as not in) under this date and name: the rest of the same assessment.
  function siblings(marks, missing, { std, date, what, on }) {
    if (!what || !std) return [];
    const out = [];
    marks.concat(missing).forEach(x => {
      if (x.source || x.excused || x.date !== date || (x.what || '') !== what) return;
      if (x.standard !== std && on.includes(x.standard) && !out.includes(x.standard)) out.push(x.standard);
    });
    return out;
  }
  // Would naming the assignment split it? True when marks on this standard and day were entered with no name.
  const unnamedThere = (marks, codes, date) => marks.some(m => codes.includes(m.standard) && m.date === date && !m.what && !m.source);
  // The name already on this standard and day, when every mark there has the same one (so re-marking never renames it).
  function nameThere(marks, std, date) {
    const names = uniq(marks.filter(m => m.standard === std && m.date === date && !m.source).map(m => m.what || '-'));
    return names.length === 1 && names[0] !== '-' ? names[0] : '';
  }
  // The card takes a lesson the way v95's followDayLesson and chooseLesson do: its first standard (unless the one
  // showing is in it) and its name, replacing only a name this made, never one typed, never beside unnamed marks.
  function takeLesson(cur, step, marks, on) {
    const codes = oregon(step).filter(c => on.includes(c));
    if (!codes.length) return cur;
    const std = codes.includes(cur.std) ? cur.std : codes[0];
    const unnamed = unnamedThere(marks, [std], cur.date);
    const what = (cur.what ? lessonFromCtx(cur.what) != null : !unnamed) ? ctxFor(step) : cur.what;
    return Object.assign({}, cur, { std, what });
  }

  // ---------- entry actions ----------
  // One change: the record before (or null) and after. Undo puts `before` back.
  const ENV = ['updatedAt', 'device'];
  const body = r => r ? Object.fromEntries(Object.entries(r).filter(([k, v]) => !ENV.includes(k) && v !== undefined)) : null;
  const same = (a, b) => JSON.stringify(sortKeys(body(a))) === JSON.stringify(sortKeys(body(b)));
  const sortKeys = o => o && Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  function result(changes, extra) {
    return Object.assign({ writes: changes.map(c => c.after), undo: changes.map(c => ({ id: c.after.id, before: c.before, after: body(c.after) })) }, extra || {});
  }
  const gone = (r, now) => Object.assign({}, r, { deletedAt: now });
  // Giving a mark hands in that child's open "not turned in" for the assignment (v95 clearMissingOnScore).
  function handIn(recs, studentId, std, date, today) {
    const m = openMiss(recs, studentId, std, date);
    return m ? [{ before: m, after: Object.assign({}, m, { received: today }) }] : [];
  }
  function newMark(studentId, standard, date, value, what, note) {
    const r = { id: markId(studentId, standard, date), type: 'mark', deletedAt: null, studentId, standard, date, value, source: null };
    if (what) r.what = what;
    if (note) r.note = note;
    return r;
  }
  // Tap a number: set it; tap the same number again: clear it. A note typed before the mark comes with it.
  function setMark(recs, { studentId, standard, date, what, value, note, today, now }) {
    const have = markOf(recs, studentId, standard, date);
    if (have && have.value === value) return result([{ before: have, after: gone(have, now) }], { cleared: true });
    const after = have ? Object.assign({}, have, { value }) : newMark(studentId, standard, date, value, what, note);
    if (have) { if (what) after.what = what; else delete after.what; }
    return result([{ before: recs.get(after.id) || null, after }].concat(handIn(recs, studentId, standard, date, today)));
  }
  // Grading together: one tap gives every standard the same mark; tapping the mark they all have clears them all.
  function setAll(recs, { studentId, codes, date, what, value, today, now }) {
    const cur = codes.map(c => markOf(recs, studentId, c, date));
    const clear = cur.every(r => r && r.value === value);
    const changes = [];
    codes.forEach((c, i) => {
      if (clear) { changes.push({ before: cur[i], after: gone(cur[i], now) }); return; }
      const after = cur[i] ? Object.assign({}, cur[i], { value }) : newMark(studentId, c, date, value, what, '');
      if (cur[i]) { if (what) after.what = what; else delete after.what; }
      changes.push({ before: recs.get(after.id) || null, after });
      changes.push(...handIn(recs, studentId, c, date, today));
    });
    return result(changes, { cleared: clear });
  }
  // A note saves with the mark. With no mark yet, nothing is written and the page keeps it until one is given.
  function setNote(recs, { studentId, codes, date, note }) {
    const have = codes.map(c => markOf(recs, studentId, c, date)).filter(Boolean);
    if (!have.length) return result([], { pending: true });
    return result(have.filter(m => (m.note || '') !== note).map(m => {
      const after = Object.assign({}, m);
      if (note) after.note = note; else delete after.note;
      return { before: m, after };
    }));
  }
  // "Not in": mark it for the standards with no mark; tap again to take it back. A child with a mark is refused.
  function toggleMissing(recs, { studentId, codes, date, what, now }) {
    const open = codes.map(c => openMiss(recs, studentId, c, date)).filter(Boolean);
    const unmarked = codes.filter(c => !markOf(recs, studentId, c, date) && !openMiss(recs, studentId, c, date));
    if (open.length && !unmarked.length) return result(open.map(m => ({ before: m, after: gone(m, now) })));
    if (codes.some(c => markOf(recs, studentId, c, date))) return result([], { refused: 'has a mark' });
    return result(unmarked.map(c => {
      const after = { id: missId(studentId, c, date), type: 'missingWork', deletedAt: null, studentId, standard: c, date, received: null, excused: false };
      if (what) after.what = what;
      return { before: recs.get(after.id) || null, after };
    }));
  }
  // Everyone in the class with nothing for this assignment yet is logged as not turned in.
  function logRest(recs, { students, codes, date, what }) {
    const changes = [];
    students.filter(s => s.active).forEach(s => {
      if (codes.some(c => markOf(recs, s.id, c, date) || openMiss(recs, s.id, c, date))) return;
      codes.forEach(c => {
        const after = { id: missId(s.id, c, date), type: 'missingWork', deletedAt: null, studentId: s.id, standard: c, date, received: null, excused: false };
        if (what) after.what = what;
        changes.push({ before: recs.get(after.id) || null, after });
      });
    });
    return result(changes, { children: changes.length / Math.max(1, codes.length) });
  }
  const handedIn = (recs, { id, today }) => { const m = live(recs.get(id)); return result(m ? [{ before: m, after: Object.assign({}, m, { received: today }) }] : []); };
  const excuse = (recs, { id }) => { const m = live(recs.get(id)); return result(m ? [{ before: m, after: Object.assign({}, m, { excused: true }) }] : []); };

  // Undo: put each record back as it was, unless it has changed since (on this device or the other one).
  function undo(recs, entries, now) {
    const writes = [];
    let changedSince = 0;
    entries.forEach(e => {
      const cur = recs.get(e.id) || null;
      if (!same(cur, e.after)) { changedSince++; return; }
      if (e.before && !e.before.deletedAt) writes.push(Object.assign({}, e.before));
      else writes.push(Object.assign({}, e.before || cur, { deletedAt: now }));
    });
    return { writes, changedSince };
  }

  const api = {
    useGuide, units, stepAt, stepOf, lessonsOf, ccss, oregon, ccssFor, ctxFor, lessonFromCtx, stepName, dayLesson, datesTaught,
    markId, missId, markOf, openMiss, marksFor, previous, assignments, siblings, unnamedThere, nameThere, takeLesson,
    setMark, setAll, setNote, toggleMissing, logRest, handedIn, excuse, undo
  };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteGrade = api;
})();
