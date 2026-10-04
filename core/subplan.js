// Sub plans: v95's own printouts (core/subplan-v95.js, copied unchanged) fed from the new planner's
// records. Pure: works in the browser and in Node. Everything here reads; nothing is written.
//
// Two deliberate differences from v95, both from how the new planner works:
//   - A lesson planned but not yet taught prints as the plan. (v95 printed "Not happening today",
//     because there an untaught saved day meant skipped; here untaught means planned.)
//   - Private notes (ones naming a child) print in place: the sub plan itself is private.
//   - A subject with nothing set for the day prints the planner's suggestion on any day. (v95 did
//     this only for the day the planner had open, through its unsaved draft.)
(function () {
  const P = typeof SuitePlan !== 'undefined' ? SuitePlan : require('./plan.js');
  const V = typeof SuiteSubV95 !== 'undefined' ? SuiteSubV95 : require('./subplan-v95.js');
  const DK = ['', 'M', 'T', 'W', 'R', 'F', ''];

  // The standing notes, in the shape v95's printouts read.
  function standing(rec) {
    const r = rec || {};
    const S = { intro: '', contact: '', signal: '', trusted: '', incentives: '', consequences: '', arrival: '', closing: '' };
    Object.keys(S).forEach(k => { if (typeof r[k] === 'string') S[k] = r[k]; });
    S.watch = (r.watch || []).map(w => ({ name: w.name, note: w.note || '' }));
    S.specials = r.specials || {};
    S.teacher = r.teacher || '';
    S.unplaced = r.unplaced || [];
    return S;
  }

  function make(records) {
    const all = records, live = all.filter(r => !r.deletedAt);
    const by = t => live.filter(r => r.type === t);
    const subj = Object.fromEntries(by('subject').map(s => [s.id, s]));
    const lessons = by('lessonPlan');
    const lesson = Object.fromEntries(lessons.map(r => [r.date + '|' + r.subjectId, r]));
    const plan = Object.fromEntries(by('dayPlan').map(r => [r.date, r]));
    const subBlk = Object.fromEntries(by('subBlock').map(r => [r.blockId, r]));
    const bnotes = all.filter(r => r.type === 'blockNote' && !r.deletedAt);
    const blockAny = Object.fromEntries(all.filter(r => r.type === 'block').map(b => [b.id, b]));
    const priv = by('privateNote');
    const students = Object.fromEntries(by('student').map(s => [s.id, s]));
    const S = standing(by('subPlan')[0]);
    const join = (...t) => t.filter(x => x && String(x).trim()).join('\n');

    function blocksFor(iso) {
      const wd = P.weekday(iso);
      const tpl = by('block').filter(b => b.weekday === wd).sort(P.byTime);
      return tpl.map((b, i) => {
        const x = subBlk[b.id] || {};
        const pstand = priv.filter(n => n.about === 'standing' && n.blockId === b.id).map(n => n.text);
        return { start: b.start, end: tpl[i + 1] ? tpl[i + 1].start : '', title: b.name, subject: b.subjectId || '',
          standing: join(b.note, ...pstand), detail: x.detail || '', emergency: x.emergency || '', key: b.id };
      });
    }
    // As v95's lessonFor: the lesson set for that day, named from the curriculum where it can be.
    function lessonFor(iso, subjectId) {
      if (!subjectId) return null;
      const sb = subj[subjectId];
      // Nothing set for the day: the planner's suggestion, as v95 printed from the planner's day.
      const e = lesson[iso + '|' + subjectId] || (sb && sb.on ? { pos: P.suggest(sb, lessons, iso), note: '' } : null);
      if (!e) return null;
      const p = e.pos || {};
      let where = '', targets = [], materials = [];
      const step = sb && (P.revealOn(sb) || (/^math/i.test(sb.name) && p.k)) ? P.revealStep(p) : null;
      const bw = sb && sb.schema === 'uwd' && sb.benchmark === true ? P.benchWeek(p.unit, p.week) : null;
      if (step) {
        where = step.k === 'L' ? `Lesson ${step.u}-${step.n} · ${step.t}` : step.t;
        targets = (step.tg || []).slice();
        materials = (step.m || []).concat(step.tr || []);
      } else if (bw) {
        where = 'Unit ' + p.unit + ' · Week ' + p.week + ' · Day ' + p.day;
        targets = (bw.comp || []).slice(0, 2);
        materials = (bw.anchor || []).map(a => a.kind + ': \u201c' + a.t + '\u201d');
      } else if (p.unit && p.week && p.day) where = 'Unit ' + p.unit + ' · Week ' + p.week + ' · Day ' + p.day;
      else if (p.unit && p.lesson) where = 'Unit ' + p.unit + ' · Lesson ' + p.lesson;
      else if (p.lesson) where = 'Lesson ' + p.lesson;
      else if (p.text) where = String(p.text);
      const free = !!(sb && sb.schema === 'free');
      const pnote = priv.filter(n => n.about === 'lesson' && n.date === iso && n.subjectId === subjectId).map(n => n.text);
      return { name: sb ? sb.name : subjectId, label: free ? (sb ? sb.name : subjectId) : (sb && sb.curriculum ? sb.curriculum : (sb ? sb.name : subjectId)),
        where, note: join(e.note, ...pnote), targets, materials, taught: true, free };
    }
    const dayNote = iso => join(plan[iso] && plan[iso].notes, ...priv.filter(n => n.about === 'day' && n.date === iso).map(n => n.text));
    const dayFlags = iso => ((plan[iso] && plan[iso].flags) || []).filter(f => f && f !== 'Sub');
    // A note for a block that has since been deleted prints under "Just for this day".
    const dayBlockNotes = iso => bnotes.filter(n => n.date === iso && (!blockAny[n.blockId] || blockAny[n.blockId].deletedAt))
      .map(n => ({ t: (blockAny[n.blockId] || {}).start || '', l: (blockAny[n.blockId] || {}).name || 'A block', note: n.text }))
      .sort((a, b) => (P.mins(a.t) || 0) - (P.mins(b.t) || 0));
    const blockNoteFor = (iso, b) => join((bnotes.find(n => n.date === iso && n.blockId === b.key) || {}).text,
      ...priv.filter(n => n.about === 'block' && n.date === iso && n.blockId === b.key).map(n => n.text));
    function mathBoard() {
      const groups = by('group').filter(g => g.kind === 'math').sort((a, b) => a.order - b.order);
      if (!groups.length) return null;
      const stations = Object.fromEntries(by('station').map(s => [s.id, s.name]));
      const visitors = Object.fromEntries(by('visitor').map(v => [v.id, v.firstName]));
      const placed = by('placement').filter(p => p.groupKind === 'math');
      const out = groups.map(g => ({ name: g.name, station: stations[g.station] || '',
        names: placed.filter(p => p.groupId === g.id).map(p => students[p.studentId] ? (students[p.studentId].displayName || students[p.studentId].firstName) : visitors[p.studentId]).filter(Boolean).sort() }));
      return out.some(x => x.names.length) ? { title: 'Math Groups', groups: out } : null;
    }
    const v = V.make({ S, blocksFor, lessonFor, dayNote, dayFlags, dayBlockNotes, blockNoteFor, bkey: (t, l) => String(t || '') + '|' + String(l || ''), mathBoard, win: null });
    const who = S.teacher || 'Grade 2';
    const hasContent = () => !!(S.intro || S.contact || S.signal || S.trusted || S.watch.length || by('subBlock').length);
    return { full: iso => v.buildFull(iso, who), glance: iso => v.buildGlance(iso, who), css: v.DOC_CSS, S, hasContent, blocksFor, dayKey: iso => DK[P.weekday(iso)] };
  }

  const api = { make, standing };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteSub = api;
})();
