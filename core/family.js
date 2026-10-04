// The family email: the coming week in families' words. Pure; works in the browser and in Node.
// Follows v95's familySections section by section (Math, Reading, Phonics), using v95's own
// wording (core/family-v95.js), and adds two things the teacher wrote by hand in v95: a Writing
// section and a closing sentence from the typed subjects. Day notes are never used.
(function () {
  const P = typeof SuitePlan !== 'undefined' ? SuitePlan : require('./plan.js');
  const F = typeof SuiteFamilyV95 !== 'undefined' ? SuiteFamilyV95 : require('./family-v95.js');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mdy = s => { const d = P.parse(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };
  const keyId = k => 'fam_' + String(k).replace(/[:|]/g, '-');

  // The week shown when the email opens: this week, or from Friday on, the next one.
  function defaultWeek(dateShown, today) {
    const shown = P.weekOf(dateShown)[0], now = P.weekOf(today)[0], wd = P.weekday(today);
    return shown === now && (wd === 5 || wd === 6 || wd === 0) && P.weekday(dateShown) !== 6 && P.weekday(dateShown) !== 0 ? P.addDays(now, 7) : shown;
  }

  // Each subject walked forward over the school days it is scheduled, from the last day taught.
  // A lesson already in the planner is used as it is (taught or planned); a day with none gets
  // the next one, as the planner would suggest.
  function project(D, sb, from, to) {
    const out = {};
    const has = new Set(D.blocks.filter(b => !b.deletedAt && b.subjectId === sb.id).map(b => b.weekday));
    const next = p => sb.schema === 'free' ? Object.assign({}, p) : P.advance(sb, p);
    const base = P.lastTaught(D.lessons, sb.id, from);
    let pos = base ? next(base.pos) : Object.assign({}, sb.start || {});
    for (let d = base ? P.addDays(base.date, 1) : from, i = 0; d <= to && i < 400; d = P.addDays(d, 1), i++) {
      if (!has.has(P.weekday(d)) || !P.dayStatus(d, { year: D.year, days: D.days, plan: D.plans && D.plans[d] }).school) continue;
      const rec = D.lesson[d + '|' + sb.id];
      const p = rec ? rec.pos : pos;
      if (d >= from) out[d] = { pos: p, taught: true };
      pos = next(p);
    }
    return out;
  }

  function build(D, from) {
    const to = P.addDays(from, 4), out = [];
    const on = s => s && s.on && !s.deletedAt;
    const subj = test => D.subjects.find(s => on(s) && test(s));

    // ---- Math (v95's v68 rules) ----
    const m = subj(s => P.revealOn(s)) || subj(s => /^math/i.test(s.name));
    if (m) {
      const mp = project(D, m, from, to), lines = [], units = [], segs = [], seg = {};
      const segOf = n => { if (!seg[n]) { seg[n] = { u: n, open: false, ph: [], review: false, assess: false }; segs.push(seg[n]); } return seg[n]; };
      Object.keys(mp).sort().forEach(k => {
        const st = P.revealOn(m) ? P.revealStep(mp[k].pos) : null;
        if (!st) { const f = P.label(m, mp[k].pos); if (f && f !== '—') segs.push({ own: 'Math ' + f }); return; }
        const u = D.reveal.units.find(x => x.u === st.u);
        if (u && !units.includes(u)) units.push(u);
        if (st.k === 'L') segOf(st.u).ph.push(F.famMath(st));
        else if (st.k === 'open') segOf(st.u).open = true;
        else if (st.k === 'review' || st.k === 'assess') segOf(st.u)[st.k] = true;
      });
      segs.forEach(g => {
        if (g.own) { lines.push(g.own); return; }
        const u = D.reveal.units.find(x => x.u === g.u), sum = g.ph.length ? F.famSummary(F.uniq(g.ph)) : '';
        if (g.open) lines.push('Starting Unit ' + g.u + ', ' + (u ? u.title : '') + (sum ? ': ' + sum.charAt(0).toLowerCase() + sum.slice(1) : ''));
        else if (sum) lines.push(sum);
        if (g.review || g.assess) lines.push(g.review && g.assess ? 'Unit ' + g.u + ' review and test' : g.assess ? 'Unit ' + g.u + ' test' : 'Reviewing Unit ' + g.u);
      });
      const L = F.uniq(lines.filter(Boolean));
      if (L.length) out.push({ head: 'Math' + (units.length ? ' · ' + units.map(u => 'Unit ' + u.u + ', ' + u.title).join(' → ') : ''), id: 'math', lines: L });
    }

    // ---- Reading and Phonics (v95's v66–v69 rules) ----
    const rd = subj(s => s.schema === 'uwd' && s.benchmark === true) || subj(s => /^reading/i.test(s.name));
    let spellKey = 'wk:' + from, goalOpts = [], goal = null;
    const pl = [];
    if (rd) {
      const bm = rd.schema === 'uwd' && rd.benchmark === true;
      const rp = project(D, rd, from, to), count = {}, first = {};
      Object.keys(rp).sort().forEach(k => {
        const e = rp[k]; if (!e.pos) return;
        const id = e.pos.unit + '|' + e.pos.week;
        count[id] = (count[id] || 0) + 1; first[id] = first[id] || e.pos;
      });
      let best = null;
      Object.keys(count).forEach(id => { if (!best || count[id] >= count[best]) best = id; });
      const weeks = best ? [first[best]] : [];
      const rl = [], rUnits = [], skills = [];
      let words = [];
      if (bm && weeks[0]) spellKey = 'bm:' + weeks[0].unit + '|' + weeks[0].week;
      weeks.forEach(p => {
        const u = bm ? P.benchUnit(p.unit) : null, w = bm ? P.benchWeek(p.unit, p.week) : null;
        if (u && !rUnits.includes(u)) rUnits.push(u);
        if (w && w.phonics && w.phonics['Primary Skill']) skills.push(w.phonics['Primary Skill']);
        if (w && w.words) words = words.concat(w.words.ga || [], w.words.ds || []);
        if (w && !goalOpts.length) goalOpts = F.famGoalOptions(w);
      });
      if (!words.length) rUnits.forEach(u => { words = words.concat(u.wordBank || []); });
      rUnits.forEach(u => { if (u.eq) rl.push('Our big question: ' + u.eq); });
      if (goalOpts.length) {
        const saved = (D.family[keyId(spellKey)] || {}).goal;
        goal = goalOpts.find(x => x.src === saved) || F.famGoalDefault(goalOpts);
        if (goal) rl.push({ t: goal.t, goal: true });
      }
      words = F.uniq(words);
      if (words.length) rl.push('Words to listen for: ' + words.join(', '));
      if (!bm) weeks.forEach(p => rl.push('Reading ' + P.label(rd, p)));
      if (rl.length) out.push({ head: 'Reading' + (rUnits.length ? ' · ' + rUnits.map(u => 'Unit ' + u.u + ', ' + u.title).join(' → ') : ''), id: 'reading', lines: rl });
      F.uniq(skills).forEach(x => pl.push('Sounds and spelling: ' + x));
    }
    const spell = F.parseSpelling((D.family[keyId(spellKey)] || {}).spelling);
    if (spell.length) pl.push({ t: F.spellLine(spell), spell: true });
    if (pl.length) out.push({ head: 'Phonics', id: 'phonics', lines: pl });

    // ---- Writing (new): Benchmark's writing task for the week, in families' words ----
    const wr = subj(s => /^writing/i.test(s.name));
    if (wr) {
      const wp = project(D, wr, from, to), seen = [];
      Object.keys(wp).sort().forEach(k => {
        const p = wp[k].pos;
        if (wr.schema === 'free') { if (p.text && p.text.trim()) seen.push(p.text.trim()); return; }
        const w = P.benchWeek(p.unit, p.week);
        const phrase = w && D.wording.writing[w.writing];
        if (!phrase) return;
        seen.push(phrase.startsWith('=') ? phrase.slice(1) : (Number(p.week) === 1 ? D.wording.writingStart : D.wording.writingContinue).replace('{task}', phrase));
      });
      const L = F.uniq(seen);
      if (L.length) out.push({ head: 'Writing', id: 'writing', lines: L });
    }

    // ---- The closing sentence (new): the typed subjects' topics ----
    const parts = [];
    D.wording.closing.subjects.forEach(c => {
      const s = subj(x => x.schema === 'free' && new RegExp(c.match, 'i').test(x.name));
      if (!s) return;
      const sp = project(D, s, from, to);
      // Lowercase the first letter to sit mid-sentence, unless the first word is a child's name.
      const names = new Set((D.students || []).flatMap(st => [st.firstName, st.lastName, ...(st.aka || [])]).filter(Boolean).map(n => n.toLowerCase()));
      const lower = t => names.has((t.match(/^[\p{L}]+/u) || [''])[0].toLowerCase()) ? t : t.charAt(0).toLowerCase() + t.slice(1);
      const topics = F.uniq(Object.keys(sp).sort().map(k => String(sp[k].pos.text || '').trim()).filter(Boolean).map(lower));
      if (topics.length) parts.push(c.phrase.replace('{topics}', listJoin(topics)));
    });
    const closing = parts.length ? D.wording.closing.start + listJoin(parts) + D.wording.closing.end : '';

    return { from, to, sections: out, closing, spellKey, familyId: keyId(spellKey), goalOpts, goal };
  }
  function listJoin(a) { return a.length < 2 ? a.join('') : a.length === 2 ? a[0] + ' and ' + a[1] : a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1]; }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // As v95 wrote it, plus Writing and the closing sentence.
  function html(r) {
    let h = '<p>Here’s a peek at what we’re learning the week of ' + esc(mdy(r.from)) + '.</p>';
    r.sections.forEach(s => {
      h += '<p data-fam-head="' + s.id + '"><b>' + esc(s.head) + '</b></p><ul>' + s.lines.map(l =>
        typeof l === 'object' ? '<li ' + (l.goal ? 'data-fam-goal' : 'data-fam-spell') + '>' + esc(l.t) + '</li>' : '<li>' + esc(l) + '</li>').join('') + '</ul>';
    });
    if (r.closing) h += '<p data-fam-close>' + esc(r.closing) + '</p>';
    if (!r.sections.length && !r.closing) h += '<p>Nothing is planned for this week yet.</p>';
    return h;
  }

  // Everything build() needs, from the store's records and the curriculum data.
  function collect(records, reveal, wording) {
    const live = records.filter(r => !r.deletedAt), by = t => live.filter(r => r.type === t);
    const map = (list, k) => Object.fromEntries(list.map(r => [k(r), r]));
    const lessons = by('lessonPlan');
    return {
      subjects: by('subject').sort((a, b) => a.order - b.order), blocks: by('block'), lessons,
      lesson: map(lessons, r => r.date + '|' + r.subjectId), days: map(by('schoolDay'), r => r.date),
      plans: map(by('dayPlan'), r => r.date), year: by('schoolYear').sort((a, b) => a.firstDay < b.firstDay ? 1 : -1)[0] || null,
      family: map(by('familyWeek'), r => r.id), students: by('student'), reveal, wording
    };
  }

  const api = { build, project, html, defaultWeek, keyId, mdy, collect };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteFamily = api;
})();
