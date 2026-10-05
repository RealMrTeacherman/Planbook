// Marks for Synergy (step 6b): each child's mark for each Oregon standard in a quarter. Pure.
// Ported exactly from v95's gradebook: computeMark, roundMark, lineMark, carriedMark, finalMark
// (called here with a line of one standard), and its ORF marks (wcpmToMark, syncOrfScores).
(function () {
  // ---------- settings, with v95's defaults ----------
  const DEFAULTS = { rule: 'weighted', carryForward: true, ireadyInReport: false, orfAuto: true, orfStandard: '2.RF.4',
    orfCut4: 75, orfCut3: 50, orfCut2: 25, orfAgainst: 'eoy', orfSeasons: null, orfLeftOut: [] };
  const settings = s => { const o = Object.assign({}, DEFAULTS); for (const k of Object.keys(DEFAULTS)) if (s && s[k] != null) o[k] = s[k]; return o; };

  // ---------- the mark rules (v95 computeMark, roundMark) ----------
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  function computeMark(vals, rule) {
    if (!vals.length) return null;
    if (rule === 'latest') return vals[vals.length - 1];
    if (rule === 'mean') return Math.round(avg(vals) * 10) / 10;
    let num = 0, den = 0;
    vals.forEach((v, i) => { const w = i + 1; num += v * w; den += w; });
    return Math.round((num / den) * 10) / 10;
  }
  const roundMark = x => x == null ? null : Math.max(1, Math.min(4, Math.round(x)));

  // ---------- ORF readings as marks (v95 wcpmToMark, syncOrfScores) ----------
  let NORMS = null, LINES = { fall: '08-01', winter: '12-01', spring: '03-01' };
  function useNorms(n) { NORMS = n ? n.grades[2] : null; if (n && n.seasonLines) LINES = n.seasonLines; }
  const mdOf = s => s.slice(5, 10);
  // 0 fall, 1 winter, 2 spring, by the season lines (v95 suite-orf.js seasonIndex).
  function seasonIndex(date, lines) {
    const L = {}; ['fall', 'winter', 'spring'].forEach(k => { const v = lines && lines[k]; L[k] = /^\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : LINES[k]; });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return 0;
    const md = mdOf(String(date));
    if (md >= L.winter) return 1;
    if (md < L.spring) return 1;
    if (md < L.fall) return 2;
    return 0;
  }
  function pctBand(wcpm, season) {
    const w = Number(wcpm);
    if (!isFinite(w) || !NORMS) return null;
    for (const p of [90, 75, 50, 25, 10]) if (w >= NORMS[p][season]) return p;
    return 0;
  }
  // Against end-of-year expectations by default: a 3 is the spring 50th whenever the reading was taken.
  function wcpmToMark(wcpm, date, st) {
    const band = pctBand(wcpm, st.orfAgainst === 'season' ? seasonIndex(date, st.orfSeasons) : 2);
    if (band == null) return null;
    if (band >= st.orfCut4) return 4;
    if (band >= st.orfCut3) return 3;
    if (band >= st.orfCut2) return 2;
    return 1;
  }
  // Every reading that counts becomes a mark on the ORF standard (fluency only; comprehension does not count).
  function orfMarks(checks, s) {
    const st = settings(s);
    if (!st.orfAuto || !NORMS) return [];
    const out = st.orfLeftOut || [];
    return checks.filter(c => !c.deletedAt && !out.includes(c.id)).map(c => {
      const v = wcpmToMark(c.wcpm, c.date, st);
      if (!v) return null;
      const acc = c.wordsRead > 0 ? Math.round(Math.max(0, c.wordsRead - c.errors) / c.wordsRead * 100) : null;
      return { id: 'orfmark_' + c.id, studentId: c.studentId, standard: st.orfStandard, date: c.date, value: v,
        what: 'ORF check', note: c.wcpm + ' WCPM' + (acc != null ? `, ${acc}% accurate` : ''), source: 'orf' };
    }).filter(Boolean);
  }

  // ---------- the marks that count ----------
  // Marks given, then iReady's (if switched on), then the ORF readings', in that order for a day that has
  // more than one (v95's list order: given marks first, derived ones appended as they are rebuilt).
  // Stored ORF marks (from the v95 import) are not used: the readings are, as v95 rebuilds them on load.
  function marksThatCount(marks, checks, s) {
    const st = settings(s);
    const live = marks.filter(m => !m.deletedAt);
    return live.filter(m => !m.source)
      .concat(st.ireadyInReport ? live.filter(m => m.source === 'iready') : [])
      .concat(orfMarks(checks, st));
  }
  // A child's marks on these standards, by date, keeping that order within a day (v95's stable sort).
  function byDate(marks, studentId, codes, keep) {
    return marks.map((m, i) => [m, i]).filter(([m]) => m.studentId === studentId && codes.includes(m.standard) && keep(m))
      .sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map(([m]) => m);
  }
  // v95 lineMark: the marks in this quarter.
  function lineMark(counted, studentId, codes, term, rule) {
    const vals = byDate(counted, studentId, codes, m => m.date >= term.start && m.date <= term.end).map(m => m.value);
    return { raw: computeMark(vals, rule), n: vals.length };
  }
  // v95 carriedMark: the latest earlier quarter with marks, else all earlier work.
  function carriedMark(counted, studentId, codes, term, terms, rule) {
    const vals = byDate(counted, studentId, codes, m => m.date < term.start);
    if (!vals.length) return null;
    const earlier = terms.filter(t => t.end < term.start).sort((a, b) => (b.end < a.end ? -1 : b.end > a.end ? 1 : 0));
    for (const t of earlier) {
      const inT = vals.filter(m => m.date >= t.start && m.date <= t.end).map(m => m.value);
      if (inT.length) return { v: roundMark(computeMark(inT, rule)), from: t.name, n: inT.length };
    }
    return { v: roundMark(computeMark(vals.map(m => m.value), rule)), from: 'earlier work', n: vals.length };
  }
  // v95 finalMark: set by you, else this quarter's, else carried (if on), else nothing.
  const overrideId = (periodId, studentId, standard) => `ovr_${periodId}_${studentId}_${String(standard).replace(/\./g, '-')}`;
  function finalMark(c, studentId, code, term) {
    const st = settings(c.settings);
    const r = lineMark(c.counted, studentId, [code], term, st.rule);
    const o = c.overrides.get(overrideId(term.id, studentId, code));
    if (o && !o.deletedAt && o.value) return { v: o.value, over: true, n: r.n };
    if (r.n === 0 && st.carryForward) {
      const k = carriedMark(c.counted, studentId, [code], term, c.terms, st.rule);
      if (k && k.v) return { v: k.v, over: false, n: 0, carried: k.from };
    }
    return { v: roundMark(r.raw), over: false, n: r.n, raw: r.raw };
  }
  // Everything the preview needs, worked out once: c = { marks, checks, settings, terms, overrides (array) }.
  function context({ marks, checks, settings: s, terms, overrides }) {
    return { settings: s, terms: terms.filter(t => !t.deletedAt), counted: marksThatCount(marks, checks || [], s),
      overrides: new Map((overrides || []).map(o => [o.id, o])) };
  }

  const api = { DEFAULTS, settings, computeMark, roundMark, useNorms, seasonIndex, wcpmToMark, orfMarks, marksThatCount,
    lineMark, carriedMark, finalMark, overrideId, context };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteReport = api;
})();
