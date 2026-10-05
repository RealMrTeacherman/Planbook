// Groups & patterns (step 6c). Pure. Ported exactly from v95's gradebook: weightedOn, weightedAcross,
// skillScore, byRank, buildSkillGroups (GROUP_DECAY 0.62, pins, Not placed), buildNeedGroups (jaccard
// merging), the "Worth a look" flags, Class at a glance, and the evidence mix of a shared-need group.
(function () {
  const GROUP_DECAY = 0.62;   // each older mark counts this much of the one after it
  const UNPLACED = -1;
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  // ---------- the marks v95 had in S.scores ----------
  // Marks given, then iReady's, then the ORF readings' (v95's list order: derived ones appended when rebuilt).
  // R is SuiteReport (for the ORF marks); settings are the gradebook's.
  function allMarks(R, marks, checks, settings) {
    const live = marks.filter(m => !m.deletedAt);
    return live.filter(m => !m.source).concat(live.filter(m => m.source === 'iready')).concat(R.orfMarks(checks || [], settings));
  }
  // Which marks count here: classwork and iReady (both), classwork only, or iReady only.
  const allowed = (m, ev) => ev === 'classroom' ? m.source !== 'iready' : ev === 'iready' ? m.source === 'iready' : true;
  // v95 inWindow, exactly: "last N days" from this moment; a mark's date read as midnight UTC.
  function inWindow(m, days, now) {
    if (!days || days === '0' || days === 0) return true;
    const cut = new Date(now.getTime()); cut.setDate(cut.getDate() - Number(days));
    return new Date(m.date) >= cut;
  }
  // A child's marks on a standard, by date, keeping list order within a day (v95's stable sort).
  function scoresFor(all, sid, code) {
    return all.map((m, i) => [m, i]).filter(([m]) => m.studentId === sid && m.standard === code)
      .sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map(([m]) => m);
  }

  // ---------- skill groups ----------
  // One standard, one child: the newest mark counts most, older ones fade.
  function weightedOn(o, sid, code) {
    const a = scoresFor(o.all, sid, code).filter(x => inWindow(x, o.days, o.now) && allowed(x, o.ev));
    if (!a.length) return null;
    let num = 0, den = 0;
    a.forEach((x, i) => { const w = Math.pow(GROUP_DECAY, a.length - 1 - i); num += x.value * w; den += w; });
    return { v: num / den, n: a.length, last: a[a.length - 1] };
  }
  // Across several standards each counts once, however many marks it holds.
  function weightedAcross(o, sid, codes) {
    const parts = []; let n = 0, last = null;
    codes.forEach(c => {
      const r = weightedOn(o, sid, c);
      if (!r) return;
      parts.push(r.v); n += r.n;
      if (!last || r.last.date.localeCompare(last.date) > 0) last = r.last;
    });
    return parts.length ? { v: avg(parts), n, last, stds: parts.length } : null;
  }
  const skillScore = (o, sid, sel) => sel === '__all' ? weightedAcross(o, sid, o.codes) : weightedAcross(o, sid, [sel]);
  // The standards that can be grouped on: switched on, with a mark that counts.
  const groupable = o => o.codes.filter(c => o.all.some(x => x.standard === c && allowed(x, o.ev)));
  // With nothing picked: the standard with the most recent mark, else all of them together.
  function defaultSel(o) {
    const codes = groupable(o);
    let best = null, bestDate = '';
    o.all.forEach(x => { if (!codes.includes(x.standard) || !allowed(x, o.ev)) return; if (x.date > bestDate) { bestDate = x.date; best = x.standard; } });
    return best || '__all';
  }
  function byRank(a, b) {
    const av = a.v == null ? 99 : a.v, bv = b.v == null ? 99 : b.v;
    const ab = a.broad == null ? 99 : a.broad, bb = b.broad == null ? 99 : b.broad;
    return (av - bv) || (ab - bb) || ((a.last ? a.last.value : 9) - (b.last ? b.last.value : 9)) || a.sort.localeCompare(b.sort);
  }
  // o: { students, all, codes, days, ev, now }. pins: child id -> group index (or -1, Not placed).
  function buildSkillGroups(o, sel, k, pins) {
    pins = pins || {};
    const seated = [], out = [];
    o.students.forEach(st => {
      const r = skillScore(o, st.id, sel);
      const broad = sel === '__all' ? (r ? r.v : null) : (weightedAcross(o, st.id, o.codes) || {}).v;
      const pin = pins[st.id];
      const row = { sid: st.id, st, sort: ((st.lastName || '') + st.firstName).toLowerCase(),
        v: r ? r.v : null, n: r ? r.n : 0, last: r ? r.last : null, broad: broad == null ? null : broad, pinned: pin != null };
      if (pin === UNPLACED) out.push(row);
      else if (pin != null || r) seated.push(row);
      else out.push(row);
    });
    const kk = Math.max(1, Math.min(Number(k) || 4, seated.length || 1));
    const base = Math.floor(seated.length / kk), rem = seated.length % kk;
    const cap = [];
    for (let i = 0; i < kk; i++) cap.push(base + (i >= kk - rem ? 1 : 0));   // the lowest group stays smallest
    const groups = []; for (let i = 0; i < kk; i++) groups.push([]);
    const free = [];
    seated.forEach(r => { if (r.pinned) groups[Math.max(0, Math.min(kk - 1, pins[r.sid]))].push(r); else free.push(r); });
    free.sort(byRank);
    let gi = 0;
    free.forEach(r => { while (gi < kk - 1 && groups[gi].length >= cap[gi]) gi++; groups[gi].push(r); });
    groups.forEach(g => g.sort(byRank));
    out.sort((a, b) => a.sort.localeCompare(b.sort));
    return { groups, out, moved: Object.keys(pins).length };
  }

  // ---------- groups with a shared need, and ready to extend ----------
  function latestMap(o, code) {
    const m = {};
    o.students.forEach(st => { const a = scoresFor(o.all, st.id, code).filter(x => inWindow(x, o.days, o.now) && allowed(x, o.ev)); if (a.length) m[st.id] = a[a.length - 1].value; });
    return m;
  }
  function jaccard(a, b) {
    const A = new Set(a), B = new Set(b);
    let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    const uni = A.size + B.size - inter;
    return uni ? inter / uni : 0;
  }
  // lo: children with a 1 or 2 (reteach / more practice); else children with a 4 (extend).
  function buildNeedGroups(o, lo) {
    let seeds = [];
    o.codes.forEach(c => {
      const m = latestMap(o, c);
      const kids = Object.keys(m).filter(sid => lo ? m[sid] <= 2 : m[sid] === 4);
      if (kids.length >= 2) seeds.push({ stds: [c], kids });
    });
    let merged = true, guard = 0;
    while (merged && guard++ < 60) {
      merged = false;
      outer:
      for (let i = 0; i < seeds.length; i++) {
        for (let j = i + 1; j < seeds.length; j++) {
          const jac = jaccard(seeds[i].kids, seeds[j].kids);
          const union = Array.from(new Set(seeds[i].kids.concat(seeds[j].kids)));
          if (jac >= 0.5 && union.length <= 7) { seeds[i] = { stds: seeds[i].stds.concat(seeds[j].stds), kids: union }; seeds.splice(j, 1); merged = true; break outer; }
        }
      }
    }
    seeds.sort((a, b) => b.kids.length * b.stds.length - a.kids.length * a.stds.length);
    return seeds.slice(0, 8).map(g => Object.assign(g, { reteach: lo && g.kids.some(sid => latestMap(o, g.stds[0])[sid] === 1) }));
  }
  // How many in a shared-need group have a 1 or 2 from classwork, iReady, or both.
  function evidenceMix(o, g) {
    const out = { both: 0, classroom: 0, iready: 0 };
    g.kids.forEach(sid => {
      let c = false, i = false;
      g.stds.forEach(code => o.all.forEach(x => {
        if (x.studentId !== sid || x.standard !== code || x.value > 2 || !inWindow(x, o.days, o.now)) return;
        if (x.source === 'iready') i = true; else c = true;
      }));
      if (c && i) out.both++; else if (c) out.classroom++; else if (i) out.iready++;
    });
    return out;
  }

  // ---------- worth a look ----------
  // Slipping: the last mark on a standard is below the one before. Thin data: 1 or 2 marks in all.
  // (v95's iReady flags need the iReady rows, which stay in the kept v95 data.)
  function flags(o) {
    const out = [];
    o.students.forEach(st => {
      o.codes.forEach(c => {
        const a = scoresFor(o.all, st.id, c);
        if (a.length >= 2 && a[a.length - 1].value < a[a.length - 2].value) out.push({ t: 'down', sid: st.id, code: c, from: a[a.length - 2].value, to: a[a.length - 1].value });
      });
      const n = o.all.filter(x => x.studentId === st.id && o.codes.includes(x.standard)).length;
      if (n > 0 && n < 3) out.push({ t: 'thin', sid: st.id, n });
    });
    return out;
  }

  // ---------- class at a glance ----------
  // Each child's latest mark that counts, on each standard with any mark, and the average of those.
  function glance(o) {
    const codes = o.codes.filter(c => o.all.some(x => x.standard === c));
    const rows = o.students.map(st => {
      const cells = codes.map(c => { const a = scoresFor(o.all, st.id, c).filter(x => allowed(x, o.ev)); return a.length ? a[a.length - 1] : null; });
      const vals = cells.filter(Boolean).map(m => m.value);
      return { sid: st.id, cells, avg: avg(vals) };
    });
    return { codes, rows };
  }

  const api = { GROUP_DECAY, UNPLACED, allMarks, allowed, inWindow, scoresFor, weightedOn, weightedAcross, skillScore, groupable, defaultSel,
    buildSkillGroups, buildNeedGroups, evidenceMix, flags, glance };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteGroups = api;
})();
