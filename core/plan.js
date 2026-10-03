// The planner's logic. Pure: no page, no storage. Works in the browser and in Node.
// Ported from v95's planner and curriculum.js; tests/plan.test.js checks the Reveal
// stepping against v95's own code, step by step across the whole guide.

(function () {
  // ---------- times ----------
  // Times are kept as typed ("1:00"). A school day has no hours before 7, so 1:00 is 1 pm, as in v95.
  function mins(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
    if (!m) return null;
    let hh = +m[1];
    if (hh < 7) hh += 12;
    return hh * 60 + (+m[2]);
  }
  const byTime = (a, b) => ((mins(a.start) ?? 1e9) - (mins(b.start) ?? 1e9)) || String(a.name).localeCompare(String(b.name));

  // ---------- dates ----------
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const weekday = s => parse(s).getDay();
  const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  // Monday to Friday of the week a date falls in (a weekend shows the week after).
  function weekOf(s) {
    const wd = weekday(s);
    const monday = addDays(s, wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd);
    return [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  }

  // ---------- curriculum ----------
  let REVEAL = null, BYUNIT = {}, FLAT = [], BENCH = {};
  const WORD = { diag: 'Diagnostic', open: 'Opener', probe: 'Probe', review: 'Review', assess: 'Test', bench: 'Benchmark', summ: 'Summative' };
  function useCurriculum(reveal, bench) {
    REVEAL = reveal; BYUNIT = {}; FLAT = [];
    (reveal ? reveal.units : []).forEach(u => {
      BYUNIT[u.u] = u;
      u.steps.forEach(s => { s.u = u.u; s.i = FLAT.length; FLAT.push(s); });
    });
    BENCH = {};
    (bench ? bench.units : []).forEach(u => { BENCH[u.u] = u; });
  }
  const revealOn = sb => !!(sb && sb.schema === 'ul' && sb.pacing === true && FLAT.length);
  const posOf = s => s.k === 'L' ? { unit: s.u, lesson: s.n } : { unit: s.u, lesson: s.after || 0, k: s.k };
  function find(p) {
    if (!p) return null;
    const u = BYUNIT[Number(p.unit)];
    if (!u) return null;
    const k = p.k || 'L';
    return u.steps.find(s => s.k === k && (k !== 'L' || s.n === Number(p.lesson))) || null;
  }
  function revealNext(p) {
    const s = find(p);
    if (s) return posOf(FLAT[s.i + 1] || s);
    if (!p || !BYUNIT[Number(p.unit)]) return null;
    const u = Number(p.unit), l = Number(p.lesson) || 0;
    const f = FLAT.find(f => f.u > u || (f.u === u && f.k === 'L' && f.n > l));
    return posOf(f || FLAT[FLAT.length - 1]);
  }
  function revealPrev(p) {
    const s = find(p);
    if (s) return posOf(FLAT[s.i - 1] || s);
    if (!p || !BYUNIT[Number(p.unit)]) return null;
    const u = Number(p.unit), l = Number(p.lesson) || 0;
    let hit = null;
    for (const f of FLAT) if (f.u < u || (f.u === u && f.k === 'L' && f.n < l)) hit = f;
    return posOf(hit || FLAT[0]);
  }

  // ---------- positions ----------
  function advance(sb, p) {
    if (revealOn(sb)) { const n = revealNext(p); if (n) return n; }
    const q = Object.assign({}, p);
    delete q.k;
    if (sb.schema === 'uwd') {
      q.day = (q.day || 1) + 1;
      if (q.day > (sb.daysPerWeek || 5)) { q.day = 1; q.week = (q.week || 1) + 1; }
      if (q.week > (sb.weeksPerUnit || 3)) { q.week = 1; q.unit = (q.unit || 1) + 1; }
    } else if (sb.schema === 'ul') {
      q.lesson = (q.lesson || 1) + 1;
      if (q.lesson > (sb.lessonsPerUnit || 10)) { q.lesson = 1; q.unit = (q.unit || 1) + 1; }
    } else if (sb.schema === 'l') {
      q.lesson = (q.lesson || 1) + 1;
    }
    return q;
  }
  function retreat(sb, p) {
    if (revealOn(sb)) { const n = revealPrev(p); if (n) return n; }
    const q = Object.assign({}, p);
    delete q.k;
    if (sb.schema === 'uwd') {
      q.day = (q.day || 1) - 1;
      if (q.day < 1) { q.week = (q.week || 1) - 1; q.day = sb.daysPerWeek || 5; }
      if (q.week < 1) { q.unit = (q.unit || 1) - 1; q.week = sb.weeksPerUnit || 3; }
      if (q.unit < 1) { q.unit = 1; q.week = 1; q.day = 1; }
    } else if (sb.schema === 'ul') {
      q.lesson = (q.lesson || 1) - 1;
      if (q.lesson < 1) { q.unit = (q.unit || 1) - 1; q.lesson = sb.lessonsPerUnit || 10; }
      if (q.unit < 1) { q.unit = 1; q.lesson = 1; }
    } else if (sb.schema === 'l') {
      q.lesson = Math.max(1, (q.lesson || 1) - 1);
    }
    return q;
  }
  // The short readout, as v95 wrote it: "U2 · L3", "U2 · Probe", "U1 · W2 · D3".
  function label(sb, p) {
    if (!p) return '—';
    if (revealOn(sb)) {
      const s = find(p);
      if (s && s.k === 'bench') return `U${s.u} · Benchmark ${s.n}`;
      if (p.k) return `U${p.unit} · ${WORD[p.k] || p.k}`;
      return `U${p.unit} · L${p.lesson}`;
    }
    if (sb.schema === 'uwd') return `U${p.unit} · W${p.week} · D${p.day}`;
    if (sb.schema === 'ul') return `U${p.unit} · L${p.lesson}`;
    if (sb.schema === 'l') return `L${p.lesson}`;
    return (p.text || '').trim() || '—';
  }
  // The longer name of what is taught, when the curriculum knows it.
  function title(sb, p) {
    if (!p) return '';
    if (revealOn(sb)) {
      const s = find(p);
      if (!s) return '';
      return s.k === 'L' ? `Lesson ${s.u}-${s.n} · ${s.t}` : s.t;
    }
    if (sb.schema === 'uwd' && sb.benchmark === true) {
      const u = BENCH[Number(p.unit)];
      return u ? `Unit ${u.u} · ${u.title}` : '';
    }
    return '';
  }
  const samePos = (a, b) => !!a && !!b && ['unit', 'week', 'day', 'lesson', 'k', 'text'].every(k => (a[k] ?? null) === (b[k] ?? null));

  // ---------- what was taught, what comes next ----------
  // lessons: lessonPlan records. The latest taught day before `date` for a subject.
  function lastTaught(lessons, subjectId, date) {
    let hit = null;
    for (const l of lessons) {
      if (l.deletedAt || l.subjectId !== subjectId || !l.taught || !l.pos || l.date >= date) continue;
      if (!hit || l.date > hit.date) hit = l;
    }
    return hit ? { pos: hit.pos, date: hit.date } : null;
  }
  function suggest(sb, lessons, date) {
    const prev = lastTaught(lessons, sb.id, date);
    if (!prev) return Object.assign({}, sb.start || (sb.schema === 'free' ? { text: '' } : { unit: 1, lesson: 1, week: 1, day: 1 }));
    if (sb.schema === 'free') return Object.assign({}, prev.pos);
    return advance(sb, prev.pos);
  }

  // ---------- the day ----------
  // year: the schoolYear record; days: schoolDay records by date; plan: that date's dayPlan.
  // A day off on the calendar wins; plan on it by removing the day off first.
  function dayStatus(date, { year, days, plan } = {}) {
    const sd = days && days[date] && !days[date].deletedAt ? days[date] : null;
    const wd = weekday(date);
    const early = (sd && sd.kind === 'earlyRelease') || (!!year && year.earlyReleaseWeekday === WD[wd]);
    if (sd && sd.kind === 'noSchool') return { school: false, label: sd.label || 'No school' };
    if (wd === 0 || wd === 6) return plan && plan.saved ? { school: true, early } : { school: false, label: 'Weekend' };
    if (year && date < year.firstDay) return { school: false, label: 'Before the first day of school', outside: true };
    if (year && date > year.lastDay) return { school: false, label: 'After the last day of school', outside: true };
    return { school: true, early, label: sd && sd.kind === 'earlyRelease' ? (sd.label || 'Early release') : (early ? 'Early release' : '') };
  }

  // The day in schedule order. Each subject's card sits at its first block, listing all its
  // blocks; a later block for it is a "continued" row. Subjects that are on but have no block go last.
  function dayLayout(blocks, subjects, weekdayNum) {
    const mine = blocks.filter(b => !b.deletedAt && b.weekday === weekdayNum).sort(byTime);
    const subj = new Map(subjects.filter(s => !s.deletedAt).map(s => [s.id, s]));
    const rows = [], seen = new Set();
    mine.forEach((b, i) => {
      const end = mine[i + 1] ? mine[i + 1].start : null;
      const s = b.subjectId && subj.get(b.subjectId);
      if (s && s.on) {
        if (seen.has(s.id)) rows.push({ kind: 'continued', block: b, end, subject: s });
        else { seen.add(s.id); rows.push({ kind: 'lesson', block: b, end, subject: s, blocks: mine.filter(x => x.subjectId === s.id) }); }
      } else rows.push({ kind: 'plain', block: b, end });
    });
    [...subj.values()].filter(s => s.on && !seen.has(s.id)).sort((a, b) => a.order - b.order)
      .forEach(s => rows.push({ kind: 'lesson', block: null, end: null, subject: s, blocks: [], unscheduled: true }));
    return rows;
  }

  const api = { mins, byTime, iso, parse, addDays, weekday, weekOf, useCurriculum, revealOn, revealNext, revealPrev,
    advance, retreat, label, title, samePos, lastTaught, suggest, dayStatus, dayLayout, WORD };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuitePlan = api;
})();
