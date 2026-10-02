// v95 importer. Pure: takes the parsed v95 sync file and returns contract records,
// the untouched v95 data to keep, and a plain-words report. Works in the browser and in Node.
//
// Two rules make a second load of the same file change nothing:
//   - every id is built from the v95 id it came from, never made up;
//   - every record carries the file's own time and the device "v95".
//
// Anything the contract does not cover yet (marks, planner days, schedules, sub notes,
// Walk to WIN lists) is kept whole as v95 wrote it, for the step that converts it.

(function () {
  const TZ = 'America/Los_Angeles';
  // A v95 id made safe for the contract's id pattern, always the same for the same input.
  // min is how long this piece must be on its own: 4 when it is the whole tail of an id
  // (stu_<id>), 0 when the id already has a fixed part in front (grp_math_<animal>).
  function safe(v95id, min = 4) {
    const s = String(v95id);
    if (/^[A-Za-z0-9_-]+$/.test(s) && s.length >= min && s.length <= 40) return s;
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return (s.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 30) + '-' + h.toString(36));
  }

  function parseKey(keys, name) {
    if (!(name in keys)) return undefined;
    const v = keys[name];
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch (e) { return undefined; }
  }

  // The Oregon calendar date of a v95 time stamp. A bare date is already local.
  function oregonDate(v) {
    const s = String(v == null ? '' : v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
    const d = new Date(s);
    if (isNaN(d)) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = t => parts.find(p => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const cut = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  function akaList(v) {
    const a = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;/]+/);
    const out = [], seen = new Set();
    for (const x of a) {
      const t = cut(x, 40), k = t.toLowerCase();
      if (t && !seen.has(k)) { seen.add(k); out.push(t); }
    }
    return out;
  }

  // "Last, First" or "First Last", for ORF students the gradebook never linked.
  function splitName(n) {
    const t = String(n == null ? '' : n).trim();
    if (t.includes(',')) {
      const [last, first] = t.split(',').map(x => x.trim());
      return { first: first || last, last: first ? last : '' };
    }
    const parts = t.split(/\s+/).filter(Boolean);
    return { first: parts[0] || 'Student', last: parts.slice(1).join(' ') };
  }

  function convert(file) {
    if (!file || typeof file !== 'object' || file.suite !== 1 || !file.keys || typeof file.keys !== 'object') {
      throw new Error('This is not a v95 sync file. In v95, use Save a sync file and load that.');
    }
    const at = new Date(file.updatedAt);
    if (isNaN(at)) throw new Error('This sync file has no save time, so it cannot be merged safely.');
    const T = at.toISOString();
    const rec = (id, type, fields) => Object.assign({ id, type, updatedAt: T, device: 'v95', deletedAt: null }, fields);

    const records = [];
    const notes = [];      // plain-words lines for the report
    const heldBack = [];   // { what, why } for anything not converted, still kept in the archive
    const keys = file.keys;

    // ---- Everything, kept whole ----
    const archive = {};
    for (const k of Object.keys(keys)) archive[k] = keys[k];

    // ---- Students (gradebook) ----
    const gb = parseKey(keys, 'gb2_standards_v1') || {};
    const stuId = new Map();   // gradebook id -> contract id
    for (const s of Array.isArray(gb.students) ? gb.students : []) {
      if (!s || s.id == null) continue;
      const id = 'stu_' + safe(s.id);
      const first = cut(s.first, 40) || cut(s.last, 40) || 'Student';
      const fields = { firstName: first, active: true, eld: !!s.eld };
      if (cut(s.last, 40) && cut(s.first, 40)) fields.lastName = cut(s.last, 40);
      const aka = akaList(s.aka);
      if (aka.length > 6) heldBack.push({ what: 'a student\'s other names', why: `only the first 6 of ${aka.length} were kept` });
      if (aka.length) fields.aka = aka.slice(0, 6);
      if (cut(s.sid, 20)) fields.districtId = cut(s.sid, 20);
      records.push(rec(id, 'student', fields));
      stuId.set(String(s.id), id);
    }

    // ---- Calendar ----
    const st = gb.settings || {};
    if (isDate(st.yearStart) && isDate(st.yearEnd)) {
      records.push(rec('year_' + st.yearStart.slice(0, 4), 'schoolYear', { firstDay: st.yearStart, lastDay: st.yearEnd }));
    }
    for (const t of Array.isArray(gb.terms) ? gb.terms : []) {
      if (!t || !isDate(t.start) || !isDate(t.end)) continue;
      records.push(rec('gp_term_' + safe(t.id, 1), 'gradingPeriod', { name: cut(t.name, 30) || 'Term', start: t.start, end: t.end }));
    }
    const days = parseKey(keys, 'lp:days:v2') || {};
    for (const [date, d] of Object.entries(days)) {
      if (!isDate(date) || !d || !d.noSchool) continue;
      const f = { date, kind: 'noSchool' };
      if (cut(d.closedLabel, 60)) f.label = cut(d.closedLabel, 60);
      records.push(rec('sday_' + date, 'schoolDay', f));
    }

    // ---- ORF ----
    const rr = parseKey(keys, 'running-records-v1') || {};
    const orfStudents = Array.isArray(rr.students) ? rr.students : [];
    const demo = new Set(orfStudents.filter(o => o && o.demo).map(o => String(o.id)));
    const orfLink = gb.orfLink || {};
    const copies = new Map();  // ORF record id -> the gradebook's copy, which knows the student and any hand-moved date
    for (const c of Array.isArray(gb.orf) ? gb.orf : []) if (c && c.srcId != null) copies.set(String(c.srcId), c);

    // A copy of a reading tells us which gradebook child an ORF student is, which goals need too.
    const learned = new Map();
    for (const r of Array.isArray(rr.records) ? rr.records : []) {
      const c = r && copies.get(String(r.id));
      if (c && c.sid != null && stuId.has(String(c.sid)) && !learned.has(String(r.studentId))) learned.set(String(r.studentId), String(c.sid));
    }

    const orfOnly = new Map(); // ORF student id -> contract id, for children the gradebook never linked
    function studentForOrf(orfSid, copy) {
      const k = String(orfSid);
      if (copy && copy.sid != null && stuId.has(String(copy.sid))) return stuId.get(String(copy.sid));
      if (learned.has(k)) return stuId.get(learned.get(k));
      if (/^gb:/.test(k) && stuId.has(k.slice(3))) return stuId.get(k.slice(3));
      if (orfLink[k] != null && stuId.has(String(orfLink[k]))) return stuId.get(String(orfLink[k]));
      if (orfOnly.has(k)) return orfOnly.get(k);
      const os = orfStudents.find(o => o && String(o.id) === k);
      if (!os) return null;
      const p = splitName(os.name);
      const id = 'stu_orf_' + safe(k);
      const f = { firstName: cut(p.first, 40) || 'Student', active: false, eld: false };
      if (cut(p.last, 40)) f.lastName = cut(p.last, 40);
      records.push(rec(id, 'student', f));
      orfOnly.set(k, id);
      return id;
    }

    const comp = (parseKey(keys, 'suite:orfcomp:v1') || {}).records || {};
    const orfNotes = (parseKey(keys, 'suite:orfnotes:v1') || {}).records || {};
    let demoSkipped = 0, excluded = 0;
    for (const r of Array.isArray(rr.records) ? rr.records : []) {
      if (!r || r.id == null) continue;
      if (r.demo || demo.has(String(r.studentId))) { demoSkipped++; continue; }
      const copy = copies.get(String(r.id));
      const label = `The ORF check of "${String(r.passageTitle || '').trim() || 'an untitled passage'}" on ${oregonDate(r.date) || 'an unknown day'}`;
      const studentId = studentForOrf(r.studentId, copy);
      if (!studentId) { heldBack.push({ what: label, why: 'its student is not in either roster' }); continue; }

      const seconds = Number(r.elapsed);
      const wordsRead = Number(r.wordsRead), errors = Number(r.errors);
      const wcpm = Number(r.wcpm);
      if (!(seconds >= 1) || !Number.isInteger(wordsRead) || !Number.isInteger(errors)) {
        heldBack.push({ what: label, why: 'it has no reading time or word counts' }); continue;
      }
      const want = Math.round(Math.max(0, wordsRead - errors) / (seconds / 60));
      if (wcpm !== want) { heldBack.push({ what: label, why: `v95 shows ${wcpm} WCPM but its counts give ${want}` }); continue; }

      // The date: a date moved by hand in the gradebook wins; otherwise the Oregon day it was taken.
      let date = oregonDate(r.date);
      if (copy && isDate(copy.date) && copy.srcDay && copy.date !== copy.srcDay) date = copy.date;
      if (!date) { heldBack.push({ what: label, why: 'its date cannot be read' }); continue; }
      if (copy && copy.exclude) excluded++;

      const missed = Array.isArray(r.missed) ? r.missed : [];
      const selfCorr = Array.isArray(r.selfCorr) ? r.selfCorr : [];
      const nrec = orfNotes[r.id] || {};
      const noteFor = (kind, n) => (Array.isArray(nrec.notes) ? nrec.notes : []).find(x => x && x.kind === kind && Number(x.n) === n) || {};
      const marked = [];
      missed.forEach((w, n) => {
        const nt = noteFor('e', n), m = { kind: 'error', word: cut(w, 40) || '?', teacherTold: !!nt.told };
        if (cut(nt.said, 40)) m.said = cut(nt.said, 40);
        marked.push(m);
      });
      selfCorr.forEach((w, n) => {
        const nt = noteFor('s', n), m = { kind: 'selfCorrection', word: cut(w, 40) || '?', teacherTold: !!nt.told };
        if (cut(nt.said, 40)) m.said = cut(nt.said, 40);
        marked.push(m);
      });

      const sc = Number(r.sc);
      const f = {
        studentId, date,
        passageTitle: cut(r.passageTitle, 80) || 'Untitled passage',
        seconds, passes: Number.isInteger(r.passes) && r.passes >= 1 ? r.passes : 1,
        wordsRead, errors, selfCorrections: Number.isInteger(sc) && sc >= 0 ? sc : selfCorr.length,
        wcpm
      };
      if (!isNaN(Date.parse(r.date)) && /T/.test(String(r.date))) f.takenAt = new Date(r.date).toISOString();
      if (Number.isInteger(r.passageWords) && r.passageWords >= 0) f.passageWords = r.passageWords;
      if (Number(nrec.paused) > 0) f.pausedSeconds = Number(nrec.paused);
      if (marked.length) f.marked = marked;
      const c = comp[r.id];
      f.comprehension = (c === 0 || c === 1 || c === 2 || c === 3 || /^[0-3]$/.test(String(c))) ? { asked: 3, correct: Number(c) } : null;
      records.push(rec('orf_' + safe(r.id), 'orfCheck', f));
    }
    if (demoSkipped) notes.push(`${plural(demoSkipped, 'sample ORF check', 'sample ORF checks')} from the ORF tool's demo class ${demoSkipped === 1 ? 'was' : 'were'} left out.`);
    if (excluded) notes.push(`${plural(excluded, 'ORF check is', 'ORF checks are')} set not to count toward marks. That choice moves over with the gradebook in step 5.`);
    if (orfOnly.size) notes.push(`${plural(orfOnly.size, 'ORF student was', 'ORF students were')} never linked to a gradebook student. They came in as inactive students, to match up in step 6.`);

    const goals = (parseKey(keys, 'suite:orfgoals:v1') || {}).goals || {};
    for (const [orfSid, g] of Object.entries(goals)) {
      if (demo.has(String(orfSid)) || !g) continue;
      const studentId = studentForOrf(orfSid, null);
      if (!studentId) { heldBack.push({ what: 'an ORF goal', why: 'its student is not in either roster' }); continue; }
      const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Math.round(Number(v));
      const id = 'ogoal_' + studentId;
      if (records.some(x => x.id === id)) { heldBack.push({ what: 'an ORF goal', why: 'two ORF names point at the same child; the first was kept' }); continue; }
      records.push(rec(id, 'orfGoal', { studentId, winter: num(g.winter), spring: num(g.spring) }));
    }

    // ---- Small groups: math board ----
    const visitors = new Map();
    function visitor(gid, name) {
      const id = 'vis_' + safe(gid);
      if (!visitors.has(id)) {
        visitors.set(id, true);
        records.push(rec(id, 'visitor', { firstName: cut(name, 40) || 'Visitor', active: true }));
      }
      return id;
    }
    const groups = parseKey(keys, 'suite:groups:v1');
    const math = groups && groups.math;
    if (math) {
      const stations = Array.isArray(math.stations) ? math.stations : [];
      const pageSt = Array.isArray(math.pageStations) ? math.pageStations : [];
      stations.forEach((name, i) => records.push(rec(`stn_math_${i}`, 'station', {
        kind: 'math', name: cut(name, 40) || `Station ${i + 1}`, order: i, hasPages: !!pageSt[i]
      })));
      const slots = Array.isArray(math.groups) ? math.groups : [];
      const groupIds = slots.map((g, i) => `grp_math_${safe(g && g.animal ? g.animal : 'slot' + i, 1)}`);
      slots.forEach((g, i) => {
        if (!g) return;
        const f = { kind: 'math', name: cut(g.name, 30) || `Group ${i + 1}`, order: i };
        if (g.animal) f.look = cut(g.animal, 30);
        if (Number.isInteger(g.station) && stations[g.station] !== undefined) f.station = `stn_math_${g.station}`;
        const pages = {};
        for (const [si, text] of Object.entries(g.pages || {})) {
          if (stations[Number(si)] !== undefined && cut(text, 40)) pages[`stn_math_${si}`] = cut(text, 40);
        }
        if (Object.keys(pages).length) f.pages = pages;
        records.push(rec(groupIds[i], 'group', f));
      });
      for (const [sid, gi] of Object.entries(math.place || {})) {
        const s = stuId.get(String(sid));
        if (!s) { heldBack.push({ what: 'a math board placement', why: 'its student is no longer in the gradebook' }); continue; }
        if (!groupIds[gi]) continue;
        records.push(rec(`plc_math_${s}`, 'placement', { groupKind: 'math', studentId: s, groupId: groupIds[gi] }));
      }
      for (const [gid, v] of Object.entries(math.guests || {})) {
        if (!v || !groupIds[v.group]) continue;
        const vid = visitor(gid, v.name);
        records.push(rec(`plc_math_${vid}`, 'placement', { groupKind: 'math', studentId: vid, groupId: groupIds[v.group] }));
      }
    }

    // ---- Small groups: reading volunteer units ----
    const rg = parseKey(keys, 'suite:readgroups:v1');
    if (rg && rg.units) {
      const COLORS = ['orange', 'green', 'yellow', 'pink'];
      COLORS.forEach((c, i) => records.push(rec(`grp_reading_${c}`, 'group', {
        kind: 'reading', name: c[0].toUpperCase() + c.slice(1), look: c, order: i
      })));
      Object.keys(rg.units).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).forEach((uk, i) => {
        const u = rg.units[uk];
        if (!u) return;
        const unitId = 'unit_v95' + safe(uk, 1);
        const f = { order: i, start: isDate(u.start) ? u.start : null };
        if (cut(u.name, 40)) f.name = cut(u.name, 40);
        records.push(rec(unitId, 'unit', f));
        for (const [sid, color] of Object.entries(u.place || {})) {
          const s = stuId.get(String(sid));
          if (!s) { heldBack.push({ what: 'a reading placement', why: 'its student is no longer in the gradebook' }); continue; }
          if (!COLORS.includes(color)) continue;
          records.push(rec(`plc_reading_${unitId}_${s}`, 'placement', { groupKind: 'reading', unitId, studentId: s, groupId: `grp_reading_${color}` }));
        }
        for (const [gid, v] of Object.entries(u.guests || {})) {
          if (!v || !COLORS.includes(v.group)) continue;
          const vid = visitor(gid, v.name);
          records.push(rec(`plc_reading_${unitId}_${vid}`, 'placement', { groupKind: 'reading', unitId, studentId: vid, groupId: `grp_reading_${v.group}` }));
        }
      });
    }

    // ---- Report ----
    const counts = {};
    for (const r of records) counts[r.type] = (counts[r.type] || 0) + 1;
    const kept = {};
    const sizeOf = v => { const p = (typeof v === 'string') ? (() => { try { return JSON.parse(v); } catch (e) { return null; } })() : v; return p; };
    const g2 = sizeOf(keys.gb2_standards_v1) || {};
    const some = (label, n) => { if (n) kept[label] = n; };
    some('Gradebook marks', Array.isArray(g2.scores) ? g2.scores.length : 0);
    some('iReady rows', Array.isArray(g2.iready) ? g2.iready.length : 0);
    some('Not-turned-in entries', Array.isArray(g2.missing) ? g2.missing.length : 0);
    const dd = sizeOf(keys['lp:days:v2']);
    some('Planner days', dd && typeof dd === 'object' ? Object.keys(dd).length : 0);
    for (const k of ['lp:settings:v2', 'suite:subplan:v1', 'suite:win:v1']) if (k in keys) kept[k] = 1;

    return { records, archive, from: file.from || null, savedAt: T, counts, kept, notes, heldBack };
  }

  const api = { convert, oregonDate, safe };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteImportV95 = api;
})();
