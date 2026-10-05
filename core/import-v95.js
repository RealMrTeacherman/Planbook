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

  function convert(file, options = {}) {
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
    if (excluded) notes.push(`${plural(excluded, 'ORF check is', 'ORF checks are')} set not to count toward marks. That choice moves over when the gradebook is rebuilt.`);
    if (orfOnly.size) notes.push(`${plural(orfOnly.size, 'ORF student was', 'ORF students were')} never linked to a gradebook student. They came in as inactive students, to match up when the ORF tool is rebuilt.`);

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

    // ---- Planner: subjects, schedule, days ----
    const lp = parseKey(keys, 'lp:settings:v2');
    const lpDays = parseKey(keys, 'lp:days:v2') || {};
    const FLAGS = ['Assembly', 'Early release', 'Sub', 'Fire drill', 'Field trip', 'Picture day', 'Testing', 'Half day'];
    const subjId = new Map();      // v95 subject id -> contract id
    const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
    function cleanPos(p) {
      const q = {};
      if (!p || typeof p !== 'object') return q;
      [['unit', 0, 50], ['week', 1, 20], ['day', 1, 7], ['lesson', 0, 60]].forEach(([k, lo, hi]) => { const n = int(p[k], lo, hi); if (n !== null) q[k] = n; });
      if (['diag', 'open', 'probe', 'review', 'assess', 'bench', 'summ'].includes(p.k)) q.k = p.k;
      if (typeof p.text === 'string') q.text = cut(p.text, 120);
      return q;
    }
    if (lp && Array.isArray(lp.subjects)) {
      lp.subjects.forEach((sb, i) => {
        if (!sb || !sb.id) return;
        const id = 'subj_v95-' + safe(sb.id, 1);
        const schema = ['uwd', 'ul', 'l', 'free'].includes(sb.schema) ? sb.schema : 'free';
        const f = { name: cut(sb.name, 40) || 'Subject', schema, on: sb.on !== false, order: i, start: cleanPos(sb.start) };
        if (cut(sb.curriculum, 60)) f.curriculum = cut(sb.curriculum, 60);
        if (/^#[0-9A-Fa-f]{6}$/.test(sb.color || '')) f.color = sb.color;
        const w = int(sb.weeksPerUnit, 1, 20), d = int(sb.daysPerWeek, 1, 7), l = int(sb.lessonsPerUnit, 1, 60);
        if (w !== null) f.weeksPerUnit = w;
        if (d !== null) f.daysPerWeek = d;
        if (l !== null) f.lessonsPerUnit = l;
        // v95 decided these by subject id; here they are the subject's own switches.
        if (sb.id === 'math' && schema === 'ul') f.pacing = sb.pacing !== false;
        if (sb.id === 'reading' && schema === 'uwd') f.benchmark = sb.benchmark !== false;
        records.push(rec(id, 'subject', f));
        subjId.set(String(sb.id), id);
      });
      // Wednesday early release was built into v95's planner; keep it with the school year.
      const yr = records.find(r => r.type === 'schoolYear');
      if (yr) yr.earlyReleaseWeekday = 'wed';
    }
    // Phonics is part of reading instruction: shown inside Reading's card, still tracked on its own.
    if (subjId.has('phonics') && subjId.has('reading')) records.find(r => r.id === subjId.get('phonics')).within = subjId.get('reading');
    const blockAt = new Map();     // "<weekday>|<start>|<name>" -> block id
    if (lp && lp.templates && typeof lp.templates === 'object') {
      for (const [dow, list] of Object.entries(lp.templates)) {
        const wd = int(dow, 0, 6);
        if (wd === null || !Array.isArray(list)) continue;
        const used = new Set();
        list.forEach(b => {
          if (!b || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(b.t || '').trim())) { if (b) heldBack.push({ what: 'a schedule block', why: 'its start time cannot be read' }); return; }
          const start = String(b.t).trim();
          let id = `blk_d${wd}-${start.replace(':', '')}`, n = 2;
          while (used.has(id)) id = `blk_d${wd}-${start.replace(':', '')}-${n++}`;
          used.add(id);
          const f = { weekday: wd, start, name: cut(b.l, 60) || 'Block', subjectId: subjId.get(String(b.s)) || null };
          if (cut(b.n, 300)) f.note = cut(b.n, 300);
          records.push(rec(id, 'block', f));
          blockAt.set(`${wd}|${start}|${f.name}`, id);
        });
      }
    }
    // Subjects v95 never had: STEAM, Health/SEL, and the flexible Assembly / Enrichments / Other block.
    // Each is linked to the schedule blocks whose names match, as the teacher asked.
    const nSubj = records.filter(r => r.type === 'subject').length;
    (options.extraSubjects || []).forEach((x, i) => {
      const hits = records.filter(r => r.type === 'block' && r.name.includes(x.matchBlock));
      if (!hits.length || records.some(r => r.id === x.id)) return;
      hits.forEach(b => { b.subjectId = x.id; if (x.renameBlock) b.name = x.renameBlock; });
      const f = { name: x.name, schema: 'free', on: true, order: nSubj + i, start: { text: '' } };
      if (x.color) f.color = x.color;
      if (x.curriculum) f.curriculum = x.curriculum;
      if (Array.isArray(x.picks) && x.picks.length) f.picks = x.picks.slice(0, 12);
      records.push(rec(x.id, 'subject', f));
    });
    for (const [k, id] of blockAt) {   // keep the lookup in step with any renamed block
      const b = records.find(r => r.id === id);
      const [wd, start] = k.split('|');
      if (b && b.name !== k.split('|').slice(2).join('|')) blockAt.set(`${wd}|${start}|${b.name}`, id);
    }

    // The family email's choices: Reading's chosen goal and pasted spelling list, per week.
    const rdV95 = lp && Array.isArray(lp.subjects) ? lp.subjects.find(x => x && x.id === 'reading') : null;
    if (rdV95) {
      const fam = {};
      const keyOk = k => /^(bm:\d{1,2}\|\d{1,2}|wk:\d{4}-\d{2}-\d{2})$/.test(k);
      Object.entries(rdV95.goal || {}).forEach(([k, v]) => { if (keyOk(k) && cut(v, 200)) (fam[k] = fam[k] || {}).goal = cut(v, 200); });
      Object.entries(rdV95.spelling || {}).forEach(([k, v]) => { if (keyOk(k) && cut(v, 2000)) (fam[k] = fam[k] || {}).spelling = String(v).slice(0, 2000); });
      Object.entries(fam).forEach(([k, f]) => records.push(rec('fam_' + k.replace(/[:|]/g, '-'), 'familyWeek', Object.assign({ key: k }, f))));
    }

    // The sub plan's standing notes, and each block's What to do / If you cannot find it.
    const sp = parseKey(keys, 'suite:subplan:v1');
    if (sp && typeof sp === 'object') {
      const t4 = v => cut(v, 4000);
      const f = {};
      ['intro', 'signal', 'incentives', 'consequences', 'arrival', 'closing'].forEach(k => { if (t4(sp[k])) f[k] = String(sp[k]).slice(0, 4000); });
      if (cut(sp.contact, 400)) f.contact = String(sp.contact).slice(0, 400);
      if (cut(sp.trusted, 1000)) f.trusted = String(sp.trusted).slice(0, 1000);
      if (gb.settings && cut(gb.settings.teacher, 80)) f.teacher = cut(gb.settings.teacher, 80);
      const watch = (Array.isArray(sp.watch) ? sp.watch : []).filter(w => w && cut(w.name, 60)).slice(0, 60)
        .map(w => Object.assign({ name: cut(w.name, 60) }, cut(w.note, 1000) ? { note: String(w.note).slice(0, 1000) } : {}));
      if (watch.length) f.watch = watch;
      const spec = {};
      'MTWRF'.split('').forEach(d => { const p = sp.specials && sp.specials[d]; if (Array.isArray(p) && p.some(x => cut(x, 60))) spec[d] = p.slice(0, 2).map(x => cut(x, 60)); });
      if (Object.keys(spec).length) f.specials = spec;
      // Details were kept by "<start>|<block name>", on every weekday that block runs.
      const unplaced = [];
      Object.entries(sp.details || {}).forEach(([k, x]) => {
        if (!x || !(cut(x.detail, 4000) || cut(x.emergency, 4000))) return;
        const [start, ...rest] = k.split('|'), name = rest.join('|');
        const hits = records.filter(r => r.type === 'block' && r.start === start && (r.name === cut(name, 60) || (/^Assembly \/ Enrichments/.test(name) && r.name === 'Assembly / Enrichments / Other')));
        if (!hits.length) { unplaced.push(`${start} ${name}: ${[x.detail, x.emergency && 'If you cannot find it: ' + x.emergency].filter(Boolean).join(' · ')}`.slice(0, 4000)); return; }
        hits.forEach(b => records.push(rec('subblk_' + b.id, 'subBlock', Object.assign({ blockId: b.id },
          cut(x.detail, 4000) ? { detail: String(x.detail).slice(0, 4000) } : {}, cut(x.emergency, 4000) ? { emergency: String(x.emergency).slice(0, 4000) } : {}))));
      });
      if (unplaced.length) { f.unplaced = unplaced.slice(0, 100); notes.push(`${plural(unplaced.length, 'sub plan note was', 'sub plan notes were')} for a block no longer on the schedule; Settings → Sub plans lists ${unplaced.length === 1 ? 'it' : 'them'} to place.`); }
      if (Object.keys(f).length) records.push(rec('subplan_main', 'subPlan', f));
    }

    let notesMoved = 0;
    for (const [date, d] of Object.entries(lpDays)) {
      if (!isDate(date) || !d || typeof d !== 'object') continue;
      const wd = new Date(date + 'T12:00:00Z').getUTCDay();
      let notes = cut(d.notes, 2000);
      for (const [bk, text] of Object.entries(d.blockNotes || {})) {
        if (!cut(text, 500)) continue;
        const [start, ...rest] = String(bk).split('|');
        const bid = blockAt.get(`${wd}|${start}|${cut(rest.join('|'), 60)}`);
        if (bid) { records.push(rec(`bnote_${date}_${bid}`, 'blockNote', { date, blockId: bid, text: cut(text, 500) })); continue; }
        // A note for a block no longer on the schedule stays with that block (kept as a deleted block),
        // so the day and the sub plan can still say which block it was for, as v95 did.
        const name = cut(rest.join('|'), 60) || 'Block', gone = `blk_gone-${wd}-${safe(start + '-' + name, 1)}`.slice(0, 100);
        if (!records.some(r => r.id === gone)) records.push(Object.assign(rec(gone, 'block', { weekday: wd, start: /^([01]?\d|2[0-3]):[0-5]\d$/.test(start) ? start : '0:00', name, subjectId: null }), { deletedAt: T }));
        records.push(rec(`bnote_${date}_${gone}`, 'blockNote', { date, blockId: gone, text: cut(text, 500) }));
        notesMoved++;
      }
      const flags = (Array.isArray(d.flags) ? d.flags : []).filter(x => FLAGS.includes(x));
      if (notes || flags.length || d.saved) {
        const f = { date, saved: !!d.saved };
        if (notes) f.notes = notes;
        if (flags.length) f.flags = [...new Set(flags)];
        records.push(rec('dayp_' + date, 'dayPlan', f));
      }
      for (const [sid, e] of Object.entries(d.entries || {})) {
        if (!e || !e.pos) continue;
        const sj = subjId.get(String(sid));
        if (!sj) { heldBack.push({ what: `a planned lesson on ${date}`, why: 'its subject is not in the planner settings' }); continue; }
        const f = { date, subjectId: sj, pos: cleanPos(e.pos), taught: !!e.taught };
        if (cut(e.note, 500)) f.note = cut(e.note, 500);
        records.push(rec(`les_${date}_${sj}`, 'lessonPlan', f));
      }
    }
    if (notesMoved) notes.push(`${plural(notesMoved, 'block note was', 'block notes were')} for a block no longer on the schedule; ${notesMoved === 1 ? 'it shows' : 'they show'} with that day's notes, labeled with the block.`);

    // Planner text that names a child must not go to live sync: move it to a private note.
    // Without the name check, planner notes could carry names to live sync, so stop instead of skipping it.
    const N = options.names || (typeof SuiteNames !== 'undefined' ? SuiteNames : null);
    if (!N || typeof N.nameHits !== 'function') throw new Error('The name check did not load, so nothing was converted. Reload the page and try again.');
    const kids = records.filter(r => r.type === 'student');
    let madePrivate = 0, namesLeft = 0;
    const pid = (...parts) => 'pnote_v95-' + safe(parts.join('-').replace(/[^A-Za-z0-9_-]/g, '-'), 1);
    const named = t => N && typeof t === 'string' && N.nameHits(t, kids).length > 0;
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      if (r.type === 'dayPlan' && named(r.notes)) {
        records.push(rec(pid('day', r.date), 'privateNote', { about: 'day', date: r.date, text: r.notes })); delete r.notes; madePrivate++;
      } else if (r.type === 'block' && named(r.note)) {
        records.push(rec(pid('standing', r.id), 'privateNote', { about: 'standing', weekday: r.weekday, blockId: r.id, text: r.note })); delete r.note; madePrivate++;
      } else if (r.type === 'lessonPlan' && named(r.note)) {
        records.push(rec(pid('lesson', r.id), 'privateNote', { about: 'lesson', date: r.date, subjectId: r.subjectId, text: r.note })); delete r.note; madePrivate++;
      } else if (r.type === 'blockNote' && named(r.text)) {
        records.push(rec(pid('block', r.id), 'privateNote', { about: 'block', date: r.date, blockId: r.blockId, text: r.text })); records.splice(i, 1); madePrivate++;
      } else if ((r.type === 'block' || r.type === 'subject') && named(r.name)) namesLeft++;
      else if (r.type === 'lessonPlan' && r.pos && named(r.pos.text)) namesLeft++;
    }
    if (madePrivate) notes.push(`${plural(madePrivate, 'planner note names', 'planner notes name')} a child on your class list, so ${madePrivate === 1 ? 'it was' : 'they were'} kept as private notes: they travel only through the Drive folder, never live sync.`);
    if (namesLeft) heldBack.push({ what: `${plural(namesLeft, 'block name, subject name or lesson', 'block names, subject names or lessons')}`, why: 'they contain a name from your class list and will sync live; rename them in the planner' });

    // ---- Gradebook: marks, work not turned in, settings ----
    // One mark per child, standard and day, as v95 saves them; if v95 has two, the later one in its
    // list is the one v95 counts, so that one is kept. Derived marks (ORF, iReady) keep their source.
    const STD = /^[0-9]\.[A-Z]{1,3}(\.[A-Z])?\.[0-9]{1,2}$/;
    const stdKey = c => String(c).replace(/\./g, '-');
    const markIds = new Map();
    let markGone = 0, markBad = 0, markTwice = 0;
    for (const x of Array.isArray(gb.scores) ? gb.scores : []) {
      if (!x) continue;
      const sid = stuId.get(String(x.sid));
      if (!sid) { markGone++; continue; }
      const v = Number(x.v), source = x.source == null || x.source === '' ? null : String(x.source);
      if (!STD.test(String(x.std)) || !isDate(x.date) || !Number.isInteger(v) || v < 1 || v > 4 || (source && source !== 'orf' && source !== 'iready')) { markBad++; continue; }
      const id = `mark_${source ? source + '_' : ''}${sid}_${stdKey(x.std)}_${x.date}`;
      const f = { studentId: sid, standard: String(x.std), date: x.date, value: v, source };
      if (cut(x.ctx, 120)) f.what = cut(x.ctx, 120);
      if (cut(x.note, 500)) f.note = cut(x.note, 500);
      if (markIds.has(id)) markTwice++;
      markIds.set(id, rec(id, 'mark', f));
    }
    const marks = [...markIds.values()];
    records.push(...marks);
    const derived = marks.filter(m => m.source).length;
    if (marks.length) notes.push(`${plural(marks.length, 'gradebook mark', 'gradebook marks')} came in` + (derived ? `, ${derived} of them worked out from the ORF tool or iReady (shown as derived).` : '.'));
    if (markTwice) notes.push(`${plural(markTwice, 'mark was', 'marks were')} a second mark for the same child, standard and day; the later one, which v95 counts, was kept.`);
    if (markGone) heldBack.push({ what: plural(markGone, 'gradebook mark', 'gradebook marks'), why: 'for a child no longer in the class list' });
    if (markBad) heldBack.push({ what: plural(markBad, 'gradebook mark', 'gradebook marks'), why: 'not a mark from 1 to 4 under a standard code, with a date' });

    // Not turned in. If v95 has two for one child and assignment, one still open wins, else the later.
    const missIds = new Map();
    let missGone = 0;
    for (const m of Array.isArray(gb.missing) ? gb.missing : []) {
      if (!m) continue;
      const sid = stuId.get(String(m.sid));
      if (!sid) { missGone++; continue; }
      if (!STD.test(String(m.std)) || !isDate(m.date)) continue;
      const id = `miss_${sid}_${stdKey(m.std)}_${m.date}`;
      const f = { studentId: sid, standard: String(m.std), date: m.date, received: isDate(m.received) ? m.received : null, excused: !!m.excused };
      if (cut(m.ctx, 120)) f.what = cut(m.ctx, 120);
      const open = r => !r.received && !r.excused;
      const have = missIds.get(id);
      if (!have || open(f) || !open(have)) missIds.set(id, rec(id, 'missingWork', f));
    }
    records.push(...missIds.values());
    if (missGone) heldBack.push({ what: plural(missGone, 'not-turned-in entry', 'not-turned-in entries'), why: 'for a child no longer in the class list' });

    // Settings. With no list of standards in the file, the gradebook starts from the defaults.
    // The Synergy-mark settings come too; one v95 never saved is left out, which means v95's default.
    if (gb.active && typeof gb.active === 'object') {
      const st = gb.settings || {};
      const f = {
        on: Object.keys(gb.active).filter(c => gb.active[c] && STD.test(c)).slice(0, 200),
        rule: ['latest', 'mean', 'weighted'].includes(st.rule) ? st.rule : 'weighted',
        codes: st.mathCodes === 'ccss' ? 'ccss' : 'oregon',
        subject: ['Math', 'ELA', 'All'].includes(st.subject) ? st.subject : 'Math'
      };
      if (typeof st.carryForward === 'boolean') f.carryForward = st.carryForward;
      if (typeof st.ireadyInReport === 'boolean') f.ireadyInReport = st.ireadyInReport;
      if (typeof st.orfAutoScore === 'boolean') f.orfAuto = st.orfAutoScore;
      if (STD.test(String(st.orfStandard))) f.orfStandard = st.orfStandard;
      const cuts = st.orfCuts || {};
      for (const k of [4, 3, 2]) { const v = Number(cuts[k]); if (Number.isInteger(v) && v >= 0 && v <= 90) f['orfCut' + k] = v; }
      if (st.orfAgainst === 'season' || st.orfAgainst === 'eoy') f.orfAgainst = st.orfAgainst;
      const se = st.orfSeason, MD = /^[01][0-9]-[0-3][0-9]$/;
      if (se && MD.test(se.fall) && MD.test(se.winter) && MD.test(se.spring)) f.orfSeasons = { fall: se.fall, winter: se.winter, spring: se.spring };
      // ORF checks set not to count: their gradebook copies say so.
      const leftOut = [...copies.values()].filter(c => c.exclude).map(c => 'orf_' + safe(c.srcId)).filter(id => records.some(r => r.id === id));
      if (leftOut.length) f.orfLeftOut = leftOut;
      records.push(rec('gbset_main', 'gradebookSettings', f));
    }

    // Marks set by hand. v95 keeps them per report-card line; a line of one standard becomes that standard's.
    const lines = new Map((Array.isArray(gb.rc) ? gb.rc : []).filter(l => l && Array.isArray(l.std)).map(l => [String(l.id), l.std]));
    const periods = new Set((Array.isArray(gb.terms) ? gb.terms : []).filter(t => t && isDate(t.start) && isDate(t.end)).map(t => String(t.id)));
    let overKept = 0, overGone = 0;
    for (const [k, v] of Object.entries(gb.overrides && typeof gb.overrides === 'object' ? gb.overrides : {})) {
      const [term, sidRaw, line] = k.split('|');
      const val = Number(v), sid = stuId.get(String(sidRaw)), std = lines.get(String(line));
      if (!sid || !periods.has(String(term)) || !Number.isInteger(val) || val < 1 || val > 4) { overGone++; continue; }
      if (!std || std.length !== 1 || !STD.test(String(std[0]))) { overKept++; continue; }
      const periodId = 'gp_term_' + safe(term, 1);
      records.push(rec(`ovr_${periodId}_${sid}_${stdKey(std[0])}`, 'markOverride', { periodId, studentId: sid, standard: std[0], value: val }));
    }
    if (overKept) notes.push(`${plural(overKept, 'report card mark you set was', 'report card marks you set were')} on a line of several standards, so ${overKept === 1 ? 'it has' : 'they have'} no single standard to go on. ${overKept === 1 ? 'It stays' : 'They stay'} in the kept v95 data.`);
    if (overGone) heldBack.push({ what: plural(overGone, 'report card mark you set', 'report card marks you set'), why: 'for a child no longer in the class list, a quarter that is gone, or not 1 to 4' });

    // Children moved by hand into skill groups: v95 keeps them per "subject|standard" (or "|__all").
    let pinGone = 0;
    for (const [key, m] of Object.entries(gb.groupPins && typeof gb.groupPins === 'object' ? gb.groupPins : {})) {
      const [subject, sel] = key.split('|');
      if (!['Math', 'ELA', 'All'].includes(subject) || !(sel === '__all' || STD.test(String(sel))) || !m || typeof m !== 'object') { pinGone += Object.keys(m || {}).length; continue; }
      for (const [sidRaw, g] of Object.entries(m)) {
        const sid = stuId.get(String(sidRaw)), group = Number(g);
        if (!sid || !Number.isInteger(group) || group < -1 || group > 5) { pinGone++; continue; }
        const standard = sel === '__all' ? null : sel;
        records.push(rec(`pin_${subject}_${standard ? stdKey(standard) : 'all'}_${sid}`, 'groupPin', { subject, standard, studentId: sid, group }));
      }
    }
    if (pinGone) heldBack.push({ what: plural(pinGone, 'skill group move', 'skill group moves'), why: 'for a child no longer in the class list, or not a group' });

    // Phonics follows Reading's unit, week and day: folded in (core/fold.js), so no separate Phonics box comes back.
    {
      const F = typeof SuiteFold !== 'undefined' ? SuiteFold : require('./fold.js');   // pages load core/fold.js first
      const f = F.foldPhonics(records, T);
      if (f.writes.length) {
        const w = new Map(f.writes.map(r => [r.id, r]));
        for (let i = 0; i < records.length; i++) if (w.has(records[i].id)) { records[i] = w.get(records[i].id); w.delete(records[i].id); }
        records.push(...w.values());
        notes.push('Phonics now follows Reading: its blocks are Reading\'s and it has no box of its own' + (f.moved ? `; ${plural(f.moved, 'Phonics note', 'Phonics notes')} moved to Reading or the day's notes.` : '.'));
      }
    }

    // ---- Report ----
    const counts = {};
    for (const r of records) counts[r.type] = (counts[r.type] || 0) + 1;
    const kept = {};
    const sizeOf = v => { const p = (typeof v === 'string') ? (() => { try { return JSON.parse(v); } catch (e) { return null; } })() : v; return p; };
    const g2 = sizeOf(keys.gb2_standards_v1) || {};
    const some = (label, n) => { if (n) kept[label] = n; };
    some('iReady rows', Array.isArray(g2.iready) ? g2.iready.length : 0);
    for (const k of ['suite:subplan:v1', 'suite:win:v1']) if (k in keys) kept[k] = 1;

    return { records, archive, from: file.from || null, savedAt: T, counts, kept, notes, heldBack };
  }

  const api = { convert, oregonDate, safe };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteImportV95 = api;
})();
