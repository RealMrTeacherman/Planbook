// The gradebook page (step 6a): Enter scores, phone first, and Settings (class list, standards).
// Marks, work not turned in and the class list are private: they travel only through the Drive folder.
// The planner's records (the day's lesson) are read, never written.
(async function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = SuitePlan, G = SuiteGrade, C = SuiteColors;
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const longDate = s => { const d = P.parse(s); return `${DAY[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
  const md = s => { const d = P.parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const todayIso = () => P.iso(new Date());
  const nowIso = () => new Date().toISOString();
  const rid = p => p + '_' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  function problem(text) { $('problemText').textContent = text; $('problem').hidden = !text; }
  let toastTimer = null;
  function toast(text) { $('toast').textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 5000); }

  // ---------- open everything ----------
  let store, live, CATALOG, byCode;
  try {
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u} did not load`); return r.json(); });
    const [contract, reveal, bench, stds, norms] = await Promise.all([get('../contract/contract.json'), get('../data/reveal-grade2.json'),
      get('../data/benchmark-grade2.json'), get('../data/standards-grade2.json'), get('../data/orf-norms.json')]);
    SuiteReport.useNorms(norms);
    P.useCurriculum(JSON.parse(JSON.stringify(reveal)), bench);
    G.useGuide(reveal);
    CATALOG = stds.standards; byCode = Object.fromEntries(CATALOG.map(s => [s.code, s]));
    store = await SuiteStore.open({ contract });
    store.persist();
    const backend = window.__liveBackend || SuiteLiveFirebase.create(window.PLANBOOK_FIREBASE);
    live = SuiteLive.create({ store, contract, backend });   // keeps the planner's lessons current here; never sends a private record
    const t = SuiteTransport.create({ store, contract });    // on the MacBook this also keeps the Drive folder copy current
    await t.start();
    live.start();
  } catch (e) { problem('The gradebook could not open: ' + e.message); return; }

  // ---------- the data ----------
  let X = null, RECS = new Map();
  const DEFAULTS = () => ({ id: 'gbset_main', type: 'gradebookSettings', deletedAt: null,
    on: CATALOG.filter(s => s.on).map(s => s.code), rule: 'weighted', codes: 'oregon', subject: 'Math' });
  const sortKey = s => ((s.lastName || '') + (s.firstName || '')).toLowerCase();
  async function index() {
    const all = await store.all();
    RECS = new Map(all.map(r => [r.id, r]));
    const lv = all.filter(r => !r.deletedAt);
    const by = type => lv.filter(r => r.type === type);
    const students = by('student').sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    X = {
      students, kids: students.filter(s => s.active),
      marks: by('mark'), missing: by('missingWork'),
      settings: by('gradebookSettings')[0] || DEFAULTS(),
      subjects: by('subject'), lessons: by('lessonPlan'), blocks: by('block'),
      checks: by('orfCheck'), overrides: by('markOverride'), pins: by('groupPin'), periods: by('gradingPeriod').sort((a, b) => a.start < b.start ? -1 : 1),
      days: Object.fromEntries(by('schoolDay').map(r => [r.date, r])),
      year: by('schoolYear').sort((a, b) => a.firstDay < b.firstDay ? 1 : -1)[0] || null
    };
  }
  const fullName = s => s ? `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}` : '?';
  const mathSubject = () => X.subjects.find(s => P.revealOn(s)) || null;
  const elaSubject = () => X.subjects.find(s => s.benchmark === true) || null;
  const isOn = c => X.settings.on.includes(c);
  const codesFor = subject => CATALOG.filter(s => isOn(s.code) && (subject === 'All' || s.subject === subject)).map(s => s.code);
  const dispCode = c => X.settings.codes === 'ccss' && byCode[c] && byCode[c].subject === 'Math' ? (G.ccssFor(c) || c) : c;
  const label = c => byCode[c] ? byCode[c].label : c;

  // ---------- what is on screen ----------
  const UI = { view: 'enter', subject: null, std: '', date: todayIso(), what: '', lesson: null, follow: true, unit: null,
    multi: null, open: null, pending: {}, undo: [] };
  const route = () => /^#settings/.test(location.hash) ? 'settings' : /^#synergy/.test(location.hash) ? 'synergy' : /^#groups/.test(location.hash) ? 'groups' : 'enter';
  const dayContext = () => ({ date: UI.date, subjects: X.subjects, lessons: X.lessons, blocks: X.blocks, days: X.days, year: X.year });
  const lessonRowShown = () => !!mathSubject() && UI.subject !== 'ELA';
  const dayStep = () => lessonRowShown() ? G.dayLesson(P, dayContext()) : null;
  const shownStep = () => UI.lesson != null ? G.stepAt(UI.lesson) : dayStep();
  function multiCodes() {
    if (!UI.multi) return null;
    const act = codesFor(UI.subject);
    const codes = UI.multi.filter((c, i, a) => act.includes(c) && a.indexOf(c) === i);
    if (codes.length < 2) { UI.multi = null; if (codes[0]) UI.std = codes[0]; return null; }
    UI.multi = codes;
    if (!codes.includes(UI.std)) UI.std = codes[0];
    return codes;
  }
  const current = () => multiCodes() || (UI.std ? [UI.std] : []);
  // The card follows the day's lesson when it opens and when the date changes, not on every redraw.
  function follow() {
    UI.follow = false;
    if (UI.lesson != null || UI.multi) return;
    const s = dayStep();
    if (s) Object.assign(UI, G.takeLesson({ std: UI.std, date: UI.date, what: UI.what }, s, X.marks, codesFor(UI.subject)));
  }

  // ---------- drawing ----------
  let renderLater = false;
  async function render() {
    window.__renders = (window.__renders || 0) + 1;   // counted for the browser tests
    // Never redraw under a field being typed in; redraw when it is left.
    const a = document.activeElement;
    if (a && document.querySelector('main').contains(a) && a.matches('input:not([type=checkbox]), textarea, select')) { renderLater = true; return; }
    renderLater = false;
    await index();
    if (UI.subject == null) UI.subject = X.settings.subject;
    UI.view = route();
    $('tabEnter').setAttribute('aria-selected', String(UI.view === 'enter'));
    $('tabSettings').setAttribute('aria-selected', String(UI.view === 'settings'));
    $('tabSynergy').setAttribute('aria-selected', String(UI.view === 'synergy'));
    $('tabGroups').setAttribute('aria-selected', String(UI.view === 'groups'));
    const none = !X.kids.length;
    $('empty').hidden = !(none && UI.view !== 'settings');
    $('enterView').hidden = UI.view !== 'enter' || none;
    $('settingsView').hidden = UI.view !== 'settings';
    $('synergyView').hidden = UI.view !== 'synergy' || none;
    $('groupsView').hidden = UI.view !== 'groups' || none;
    if (UI.view === 'settings') renderSettings();
    else if (UI.view === 'synergy') { if (!none) renderSynergy(); }
    else if (UI.view === 'groups') { if (!none) renderGroups(); }
    else if (!none) renderEnter();
    renderChip();
  }
  function renderChip() {
    const s = live.status(), c = $('liveChip');
    const [text, cls] = !s.configured ? ['Live sync off', ''] : !s.user ? ['Sign in to sync', 'warn'] : !s.connected ? ['Offline · saved here', 'warn']
      : s.pending ? ['Sending…', ''] : ['Synced', 'ok'];
    c.textContent = text; c.className = 'chip ' + cls;
  }
  let queued = false;
  const soon = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; render(); }, 50); };
  store.onChange(soon);
  live.onStatus(() => renderChip());
  // #enter/2026-09-29 opens Enter scores on that day, following its lesson.
  function dateFromHash() {
    const m = /^#enter\/(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
    if (m && m[1] !== UI.hashDate) { UI.hashDate = m[1]; Object.assign(UI, { date: m[1], lesson: null, unit: null, multi: null, follow: true, open: null }); }
  }
  addEventListener('hashchange', () => { dateFromHash(); render(); });
  dateFromHash();
  document.querySelector('main').addEventListener('focusout', () => setTimeout(() => { if (renderLater) render(); }, 0));

  // The assignments to step through: those saved, plus the one being started.
  function stepList() {
    const list = G.assignments(X.marks, X.missing, X.students, byCode).filter(a => UI.subject === 'All' || a.subject === UI.subject);
    const k = UI.std + '|' + UI.date + '|' + (UI.what || '');
    if (!UI.std || list.some(a => a.key === k)) return list;
    return [{ key: k, std: UI.std, date: UI.date, what: UI.what || '', fresh: true }].concat(list);
  }

  function subjectColors() {
    const sb = UI.subject === 'Math' ? mathSubject() : UI.subject === 'ELA' ? elaSubject() : null;
    return sb && sb.color ? `--subj:${C.deep(sb.color)};--tint:${C.tint(sb.color)}` : '--subj:#16181D;--tint:#E6EBF1';
  }

  function renderEnter() {
    const el = $('enterView');
    const codes = codesFor(UI.subject);
    if (!codes.includes(UI.std)) UI.std = codes[0] || '';
    if (UI.follow) follow();
    const multi = multiCodes();
    if (!UI.what && !multi && UI.std) UI.what = G.nameThere(X.marks, UI.std, UI.date);
    const cur = current();
    const step = shownStep(), day = dayStep();
    const following = !!day && (UI.lesson == null || day.i === UI.lesson);
    // How far along this assignment is.
    const has = (sid, c) => !!G.markOf(RECS, sid, c, UI.date);
    const missOf = (sid, c) => { const m = RECS.get(G.missId(sid, c, UI.date)); return m && !m.deletedAt && !m.excused ? m : null; };
    const marked = X.kids.filter(k => cur.length && cur.every(c => has(k.id, c))).length;
    const notIn = X.kids.filter(k => cur.some(c => { const m = missOf(k.id, c); return m && !m.received; })).length;
    const anyMarks = X.kids.some(k => cur.some(c => has(k.id, c)));
    const open = UI.open != null ? UI.open : !anyMarks;
    const title = UI.what || (multi ? `${multi.length} standards together` : label(UI.std));

    let h = `<div class="gcard" style="${subjectColors()}">
      <div class="gcard-top"><span class="gchip">${esc(UI.subject === 'All' ? 'All subjects' : UI.subject)}</span>
        <span class="gwhen">${esc(longDate(UI.date))}${step ? ' · ' + esc(G.ctxFor(step)) + (following && UI.lesson == null ? ' in the planner' : '') : ''}</span></div>
      <div class="gpos">
        <button class="gnav" data-step="1" aria-label="Older assignment">‹</button>
        <div class="gtitle"><div class="gname" id="assignTitle">${esc(title)}</div>
          <div class="gstd">${multi ? multi.map(c => `<code>${esc(dispCode(c))}</code>`).join(' ') : UI.std ? `<code>${esc(dispCode(UI.std))}</code>${UI.what ? ' ' + esc(label(UI.std)) : ''}` : 'No standards switched on'}</div></div>
        <button class="gnav" data-step="-1" aria-label="Newer assignment">›</button>
      </div>
      <div class="gprog"><span id="progress">${marked} of ${X.kids.length} marked${notIn ? ` · ${notIn} not in` : ''}</span>
        <span class="gacts"><button class="linkbtn" data-unfinished="1">Next unfinished</button>
        <button class="linkbtn" data-change="1" aria-expanded="${open}">${open ? 'Done' : 'Change'}</button></span></div>`;
    if (open) h += changeHTML(codes, step, day, following);
    h += '</div>';

    if (!UI.std) h += `<p class="panel small">No ${esc(UI.subject)} standards are switched on. Choose them in <a href="#settings">Settings</a>.</p>`;
    else {
      const sib = !multi ? G.siblings(X.marks, X.missing, { std: UI.std, date: UI.date, what: UI.what, on: codes }) : [];
      if (sib.length) h += `<p class="gsib small">“${esc(UI.what)}” on this date also covers ${esc(sib.map(dispCode).join(', '))}. <button class="compact" data-multi="${esc([UI.std].concat(sib).join(' '))}">Grade all ${sib.length + 1} together</button></p>`;
      if (multi) h += `<div class="gmulti"><span class="small">Grading together:</span> ${multi.map(c => `<span class="gm-std"><code>${esc(dispCode(c))}</code> ${esc(label(c))}
        <button class="gm-x" data-drop="${esc(c)}" aria-label="Take ${esc(dispCode(c))} out">×</button></span>`).join('')}
        <button class="compact quiet" data-multistop="1">One at a time</button></div>`;
      h += '<div class="kids" id="kids">' + X.kids.map(k => kidHTML(k, cur, multi)).join('') + '</div>';
    }
    h += waitingHTML();
    const last = UI.undo[UI.undo.length - 1];
    h += `<div class="gfoot"><button class="quiet" data-undo="1" ${last ? '' : 'disabled'}>${last ? 'Undo ' + esc(last.label) : 'Undo'}</button>
      <button data-logrest="1" ${UI.std ? '' : 'disabled'}>Log the rest as not in</button></div>`;
    el.innerHTML = h;
  }

  function changeHTML(codes, step, day, following) {
    const domains = [];
    codes.forEach(c => { const d = byCode[c].subject + ' · ' + byCode[c].domain; if (!domains.includes(d)) domains.push(d); });
    const stdOpts = domains.map(d => `<optgroup label="${esc(UI.subject === 'All' ? d : d.replace(/^[^·]+· /, ''))}">` +
      codes.filter(c => byCode[c].subject + ' · ' + byCode[c].domain === d).map(c => `<option value="${esc(c)}"${c === UI.std ? ' selected' : ''}>${esc(dispCode(c) + ' — ' + label(c))}</option>`).join('') + '</optgroup>').join('');
    let h = `<div class="gchange">
      <label class="sf"><span>Subject</span><select id="e-subject">${['Math', 'ELA', 'All'].map(s => `<option${s === UI.subject ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="sf wide"><span>Standard</span><select id="e-std">${stdOpts}</select></label>
      <label class="sf"><span>Date</span><input type="date" id="e-date" value="${esc(UI.date)}"></label>
      <label class="sf wide"><span>What was it? (optional)</span><input type="text" id="e-what" maxlength="120" placeholder="exit ticket, small group, observation" value="${esc(UI.what)}"></label>`;
    if (lessonRowShown()) {
      const gradeable = x => G.oregon(x).some(c => byCode[c]);
      const shownU = UI.unit != null ? UI.unit : step ? step.u : 2;
      const unitOpts = G.units().map(u => {
        const none = !u.steps.some(s => gradeable(Object.assign({}, s, { u: u.u })));
        return `<option value="${u.u}"${u.u === shownU ? ' selected' : ''}${none ? ' disabled' : ''}>Unit ${u.u} · ${esc(u.title)}${none ? ' · grade 1 review' : ''}</option>`;
      }).join('');
      const inUnit = step && step.u === shownU;
      const ms = mathSubject();
      const dayOpts = (inUnit ? '' : `<option value="" selected disabled>Pick a day in Unit ${shownU}</option>`) +
        [...Array(400).keys()].map(G.stepAt).filter(s => s && s.u === shownU).map(s => {
          const none = !gradeable(s), when = G.datesTaught(X.lessons, ms.id, s.i);
          return `<option value="${s.i}"${inUnit && step.i === s.i ? ' selected' : ''}${none ? ' disabled' : ''}>${esc(G.stepName(s))}${day && day.i === s.i ? ' · this day' : when.length ? ' · taught ' + md(when[when.length - 1]) : ''}${none ? ' · no grade 2 standards' : ''}</option>`;
        }).join('');
      h += `<label class="sf"><span>Reveal unit</span><select id="e-unit">${unitOpts}</select></label>
        <label class="sf wide"><span>Lesson</span><select id="e-lesson">${dayOpts}</select></label>`;
      if (day && !following) h += `<button class="compact quiet" data-back="1">Back to this day’s lesson</button>`;
      if (step) {
        const sc = G.oregon(step).filter(c => codes.includes(c));
        h += `<div class="gpicks"><span class="tag">In this lesson</span>` + (sc.length
          ? sc.map(c => `<button class="compact${current().includes(c) ? ' on' : ''}" data-pick="${esc(c)}" aria-pressed="${current().includes(c)}">${esc(label(c))}</button>`).join('') +
            (sc.length > 1 && !UI.multi ? `<button class="compact" data-multi="${esc(sc.join(' '))}">Grade all ${sc.length} together</button>` : '')
          : `<span class="small">No grade 2 standards to mark on this day${G.oregon(step).length ? ' that are switched on in Settings' : ''}.</span>`) + '</div>';
      } else h += '<p class="small">The planner has no Reveal lesson on this date. Pick one above, or choose a standard.</p>';
    }
    return h + '</div>';
  }

  function kidHTML(k, cur, multi) {
    const marks = cur.map(c => G.markOf(RECS, k.id, c, UI.date));
    const miss = cur.some(c => G.openMiss(RECS, k.id, c, UI.date));
    const key = k.id + '|' + cur.join(' ');
    const note = (marks.find(m => m && m.note) || {}).note || UI.pending[key] || '';
    const btns = (c, m) => [1, 2, 3, 4].map(v => `<button class="mk m${v}" data-v="${v}" data-sid="${esc(k.id)}" data-std="${esc(c)}" aria-pressed="${!!m && m.value === v}" aria-label="${esc(k.firstName)}: ${v}${multi ? ' on ' + esc(dispCode(c)) : ''}">${v}</button>`).join('');
    const prevText = c => { const p = G.previous(X.marks, k.id, c, UI.date); return p ? `was ${p.value} · ${md(p.date)}` : 'no prior'; };
    let h = `<div class="kid${miss ? ' out' : ''}" data-kid="${esc(k.id)}">
      <div class="kid-top"><span class="kname">${esc(fullName(k))}</span>${k.eld ? '<span class="eld">ELD</span>' : ''}
        ${multi ? '' : `<span class="was">${esc(prevText(UI.std))}</span>`}</div>`;
    if (!multi) h += `<div class="marks">${btns(UI.std, marks[0])}<button class="notin" data-miss="${esc(k.id)}" aria-pressed="${miss}">Not in</button></div>`;
    else {
      const same = marks.every(m => m) && marks.every(m => m.value === marks[0].value) ? marks[0].value : 0;
      h += multi.map((c, i) => `<div class="mrow"><span class="mlbl"><code>${esc(dispCode(c))}</code> ${esc(label(c))} <span class="was">${esc(prevText(c))}</span></span><div class="marks four">${btns(c, marks[i])}</div></div>`).join('') +
        `<div class="mrow all"><span class="mlbl"><b>All</b></span><div class="marks">${[1, 2, 3, 4].map(v => `<button class="mk m${v}" data-all="${esc(k.id)}" data-v="${v}" aria-pressed="${same === v}" aria-label="${esc(k.firstName)}: ${v} on every standard">${v}</button>`).join('')}<button class="notin" data-miss="${esc(k.id)}" aria-pressed="${miss}">Not in</button></div></div>`;
    }
    h += `<input type="text" class="knote" data-note="${esc(k.id)}" maxlength="500" value="${esc(note)}" aria-label="Note for ${esc(k.firstName)}" placeholder="${marks.some(Boolean) || miss ? 'Note' : 'Note (saves with a mark)'}"></div>`;
    return h;
  }

  function waitingHTML() {
    const open = X.missing.filter(m => !m.received && !m.excused);
    if (!open.length) return '';
    const groups = new Map();
    open.forEach(m => { const k = m.standard + '|' + m.date + '|' + (m.what || ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
    const stu = id => X.students.find(s => s.id === id);
    return `<section class="side waiting"><div class="side-head"><h2>Still waiting on</h2><span class="count">${open.length}</span></div>` +
      [...groups.entries()].sort((a, b) => a[1][0].date < b[1][0].date ? 1 : -1).map(([k, items]) => {
        const m0 = items[0];
        return `<div class="wgroup"><div class="wlabel">${esc(label(m0.standard))} · ${esc(md(m0.date))}${m0.what ? ' · ' + esc(m0.what) : ''}</div>` +
          items.map(m => `<div class="wrow"><span>${esc(fullName(stu(m.studentId)))}</span>
            <button class="compact" data-handin="${esc(m.id)}">Handed in</button><button class="compact quiet" data-excuse="${esc(m.id)}">Excuse</button></div>`).join('') + '</div>';
      }).join('') + '<p class="small">Giving a mark takes a child off this list.</p></section>';
  }

  // ---------- doing things ----------
  // Write an action's records, and remember how to undo it.
  async function act(res, undoLabel) {
    if (res.refused) { toast('That child already has a mark for this one.'); return false; }
    if (!res.writes.length) return false;
    try { problem(''); await store.write(res.writes, 'the gradebook'); }
    catch (e) { problem('Not saved: ' + e.message); return false; }
    if (undoLabel) UI.undo.push({ label: undoLabel, entries: res.undo });
    return true;
  }
  const kidName = id => { const s = X.students.find(x => x.id === id); return s ? s.firstName : ''; };
  async function tapMark(sid, std, v) {
    UI.open = false;
    const key = sid + '|' + current().join(' ');
    const res = G.setMark(RECS, { studentId: sid, standard: std, date: UI.date, what: UI.what, value: v, note: UI.pending[key] || '', today: todayIso(), now: nowIso() });
    if (await act(res, res.cleared ? `clearing ${kidName(sid)}` : `${kidName(sid)} ${v}`)) delete UI.pending[key];
  }
  async function tapAll(sid, v) {
    UI.open = false;
    const codes = current(), key = sid + '|' + codes.join(' ');
    const res = G.setAll(RECS, { studentId: sid, codes, date: UI.date, what: UI.what, value: v, today: todayIso(), now: nowIso() });
    if (UI.pending[key] && !res.cleared) {   // a note typed before the marks goes on all of them
      const after = new Map(res.writes.map(w => [w.id, w]));
      const view = new Map([...RECS, ...after]);
      const n = G.setNote(view, { studentId: sid, codes, date: UI.date, note: UI.pending[key] });
      n.writes.forEach(w => after.set(w.id, w));
      res.writes = [...after.values()];
      res.undo = res.undo.map(u => after.has(u.id) ? Object.assign({}, u, { after: Object.fromEntries(Object.entries(after.get(u.id)).filter(([k]) => k !== 'updatedAt' && k !== 'device')) }) : u);
    }
    if (await act(res, res.cleared ? `clearing ${kidName(sid)}` : `${kidName(sid)} all ${v}`)) delete UI.pending[key];
  }
  async function saveNote(sid, text) {
    const codes = current(), key = sid + '|' + codes.join(' ');
    const res = G.setNote(RECS, { studentId: sid, codes, date: UI.date, note: text.trim() });
    if (res.pending) { if (text.trim()) { UI.pending[key] = text.trim(); toast('The note saves when you give a mark.'); } else delete UI.pending[key]; return; }
    await act(res, `${kidName(sid)}’s note`);
  }
  function gotoAssignment(a) {
    if (!a) return;
    if (byCode[a.std] && UI.subject !== 'All' && UI.subject !== byCode[a.std].subject) UI.subject = byCode[a.std].subject;
    Object.assign(UI, { std: a.std, date: a.date, what: a.what || '', multi: null, lesson: G.lessonFromCtx(a.what), unit: null, open: null, follow: false });
  }
  function chooseLesson(v) {
    if (v === '' || v == null) { Object.assign(UI, { lesson: null, unit: null, follow: true }); return; }
    const s = G.stepAt(Number(v));
    if (!s) return;
    Object.assign(UI, { lesson: s.i, unit: null, multi: null });
    const day = dayStep(), ms = mathSubject();
    if (!day || day.i !== s.i) {
      const dates = G.datesTaught(X.lessons, ms.id, s.i);
      if (dates.length) { UI.date = dates[dates.length - 1]; toast(`Dated ${longDate(UI.date)}, when ${G.stepName(s)} was taught. Change the date if the work is from another day.`); }
    }
    Object.assign(UI, G.takeLesson({ std: UI.std, date: UI.date, what: UI.what }, s, X.marks, codesFor(UI.subject)));
  }
  function startMulti(codes) {
    UI.multi = codes.slice();
    if (!codes.includes(UI.std)) UI.std = codes[0];
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button, [data-view]');
    if (!b || !document.querySelector('main').contains(b)) return;
    const d = b.dataset;
    if (d.view) { location.hash = '#' + d.view; return; }
    if (UI.view === 'settings') { await settingsClick(b); return; }
    if (UI.view === 'synergy') { await synergyClick(b); return; }
    if (UI.view === 'groups') { await groupsClick(b); return; }
    if (d.v && d.sid) await tapMark(d.sid, d.std, Number(d.v));
    else if (d.v && d.all) await tapAll(d.all, Number(d.v));
    else if (d.miss) {
      UI.open = false;
      const res = G.toggleMissing(RECS, { studentId: d.miss, codes: current(), date: UI.date, what: UI.what, now: nowIso() });
      await act(res, `${kidName(d.miss)} not in`);
    } else if (d.logrest) {
      const res = G.logRest(RECS, { students: X.kids, codes: current(), date: UI.date, what: UI.what });
      if (!res.writes.length) toast('Everyone has a mark for this one.');
      else if (await act(res, `the ${res.children} logged as not in`)) toast(`Logged ${res.children} as not turned in.`);
    } else if (d.undo) {
      const u = UI.undo.pop();
      if (!u) return;
      await index();
      const r = G.undo(RECS, u.entries, nowIso());
      if (r.writes.length) { try { await store.write(r.writes, 'undo in the gradebook'); } catch (err) { problem('Not undone: ' + err.message); } }
      toast(r.changedSince ? `Undone, except ${r.changedSince === 1 ? 'one mark' : r.changedSince + ' marks'} changed since on the other device, left as ${r.changedSince === 1 ? 'it is' : 'they are'}.` : `Undid ${u.label}.`);
    } else if (d.step) {
      const list = stepList(), k = UI.std + '|' + UI.date + '|' + (UI.what || '');
      let i = list.findIndex(a => a.key === k); if (i < 0) i = 0;
      const next = list[i + Number(d.step)];
      if (!next) { toast(Number(d.step) > 0 ? 'That is the oldest one.' : 'That is the newest one.'); return; }
      gotoAssignment(next);
    } else if (d.unfinished) {
      const list = G.assignments(X.marks, X.missing, X.students, byCode).filter(a => !a.complete && (UI.subject === 'All' || a.subject === UI.subject));
      if (!list.length) { toast('Every assignment has a mark for each child.'); return; }
      const k = UI.std + '|' + UI.date + '|' + (UI.what || '');
      gotoAssignment(list[(list.findIndex(a => a.key === k) + 1) % list.length]);
    } else if (d.change) UI.open = !(b.getAttribute('aria-expanded') === 'true');
    else if (d.back) chooseLesson('');
    else if (d.pick) {
      if (UI.multi) {
        const codes = UI.multi.slice(), i = codes.indexOf(d.pick);
        if (i >= 0) { if (codes.length <= 2) { toast('Grading together needs two standards. Choose One at a time to grade just one.'); return; } codes.splice(i, 1); } else codes.push(d.pick);
        UI.multi = codes;
      } else {
        UI.std = d.pick;
        const s = shownStep();
        if (s && !UI.what && !G.unnamedThere(X.marks, [UI.std], UI.date)) UI.what = G.ctxFor(s);
      }
    } else if (d.multi) startMulti(d.multi.split(' '));
    else if (d.multistop) UI.multi = null;
    else if (d.drop) {
      const codes = (UI.multi || []).filter(c => c !== d.drop);
      if (codes.length < 2) { toast('Grading together needs two standards. Choose One at a time to grade just one.'); return; }
      UI.multi = codes;
    } else if (d.handin) await act(G.handedIn(RECS, { id: d.handin, today: todayIso() }), 'handed in');
    else if (d.excuse) await act(G.excuse(RECS, { id: d.excuse }), 'excused');
    else return;
    render();
  });

  document.addEventListener('change', async e => {
    const el = e.target;
    if (!document.querySelector('main').contains(el)) return;
    if (UI.view === 'settings') { await settingsChange(el); return; }
    if (UI.view === 'synergy') { await synergyChange(el); return; }
    if (UI.view === 'groups') { await groupsChange(el); return; }
    if (el.dataset.note) { await saveNote(el.dataset.note, el.value); return; }
    if (el.id === 'e-subject') { UI.subject = el.value; UI.multi = null; UI.follow = true; await saveSettings({ subject: el.value }); }
    else if (el.id === 'e-std') { UI.std = el.value; UI.multi = null; }
    else if (el.id === 'e-date') {
      if (!el.value) return;
      UI.date = el.value; UI.unit = null;
      if (dayStep()) { UI.lesson = null; UI.follow = true; }
    } else if (el.id === 'e-what') UI.what = el.value.trim();
    else if (el.id === 'e-unit') UI.unit = Number(el.value);
    else if (el.id === 'e-lesson') chooseLesson(el.value);
    else return;
    el.blur();
    render();
  });

  // ---------- For Synergy: each child's mark for each standard in a quarter ----------
  // Every number comes from core/report.js (v95's calculation, checked against v95 cell by cell).
  const R = SuiteReport;
  const wide = () => matchMedia('(min-width: 900px)').matches;
  function synergyContext() {
    return R.context({ marks: X.marks, checks: X.checks, settings: X.settings, terms: X.periods, overrides: X.overrides });
  }
  function currentPeriod() {
    const today = todayIso(), p = X.periods;
    if (!p.length) return null;
    if (UI.period && p.some(t => t.id === UI.period)) return p.find(t => t.id === UI.period);
    return p.find(t => t.start <= today && today <= t.end) || p.filter(t => t.end < today).pop() || p[0];
  }
  const fmtMark = f => f.v ? String(f.v) : '–';
  function cellNote(f) { return f.over ? 'set by you' : f.carried ? (f.carried === 'earlier work' ? 'carried from earlier work' : 'carried from ' + f.carried) : f.n ? 'from ' + f.n + (f.n === 1 ? ' mark' : ' marks') : 'nothing to go on'; }
  function renderSynergy() {
    const el = $('synergyView'), term = currentPeriod();
    if (!term) { el.innerHTML = '<section class="side"><h2>No quarters yet</h2><p class="small">Add the grading periods in <a href="../planner/#settings">Planner Settings</a>, beside the calendar.</p></section>'; return; }
    UI.period = term.id;
    const c = synergyContext(), st = R.settings(X.settings);
    const codes = codesFor(UI.subject);
    const grid = new Map();   // code -> child id -> finalMark
    codes.forEach(code => { const row = new Map(); X.kids.forEach(k => row.set(k.id, R.finalMark(c, k.id, code, term))); grid.set(code, row); });
    const shown = codes.filter(code => [...grid.get(code).values()].some(f => f.v));
    const hasIready = X.marks.some(m => m.source === 'iready');
    let h = `<div class="syn-bar side">
      <div class="seg" role="group" aria-label="Quarter">${X.periods.map(t => `<button class="compact" data-period="${esc(t.id)}" aria-pressed="${t.id === term.id}">${esc(t.name)}</button>`).join('')}</div>
      <label class="sf inline"><span>Subject</span><select id="y-subject">${['Math', 'ELA', 'All'].map(x => `<option${x === UI.subject ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="sf inline"><span>Marks from</span><select id="y-rule">${[['weighted', 'Recent work counts more'], ['mean', 'Straight average'], ['latest', 'Most recent mark only']].map(([v, l]) => `<option value="${v}"${st.rule === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="y-carry"${st.carryForward ? ' checked' : ''}> Carry forward a standard with no marks this quarter</label>
      ${hasIready ? `<label class="check"><input type="checkbox" id="y-iready"${st.ireadyInReport ? ' checked' : ''}> Count iReady marks</label>` : ''}
    </div>
    <p class="small">${esc(term.name)}, ${esc(longDate(term.start))} to ${esc(longDate(term.end))}. Each mark is worked out from that quarter's marks${st.carryForward ? ', or carried from an earlier quarter when there are none' : ''}. ${wide() ? 'Click a mark to see the marks behind it or set your own.' : 'Tap a standard to see the marks behind it or set your own.'}</p>`;
    if (!shown.length) h += `<section class="side"><p>No ${UI.subject === 'All' ? '' : esc(UI.subject) + ' '}marks to go on in ${esc(term.name)} yet.</p></section>`;
    else if (wide()) {
      h += `<div class="syn-wrap side"><table class="syn"><thead><tr><th class="kid-h">Last-name order, as in Synergy</th>${shown.map(code => `<th class="std-h" title="${esc(label(code))}"><span><code>${esc(dispCode(code))}</code> ${esc(label(code))}</span></th>`).join('')}</tr></thead><tbody>` +
        X.kids.map(k => `<tr><th class="kid-n" scope="row">${esc(k.lastName ? k.lastName + ', ' + k.firstName : k.firstName)}</th>` + shown.map(code => {
          const f = grid.get(code).get(k.id), open = UI.cell === k.id + '|' + code;
          return `<td><button class="cell${f.v ? ' m' + f.v : ''}${f.over ? ' over' : ''}${f.carried ? ' carried' : ''}" data-cell="${esc(k.id + '|' + code)}" aria-expanded="${open}" aria-label="${esc(fullName(k))}, ${esc(dispCode(code))}: ${fmtMark(f)}, ${cellNote(f)}">${fmtMark(f)}</button></td>`;
        }).join('') + '</tr>').join('') + '</tbody></table></div>';
    } else {
      const kid = X.kids.find(k => k.id === UI.synKid) || X.kids[0];
      UI.synKid = kid.id;
      h += `<div class="syn-kid"><button class="gnav" data-synkid="-1" aria-label="Previous student">‹</button>
        <select id="y-kid" aria-label="Student">${X.kids.map(k => `<option value="${esc(k.id)}"${k.id === kid.id ? ' selected' : ''}>${esc(fullName(k))}</option>`).join('')}</select>
        <button class="gnav" data-synkid="1" aria-label="Next student">›</button></div>
        <div class="syn-list">` + shown.map(code => {
          const f = grid.get(code).get(kid.id);
          return `<button class="syn-row${f.carried || !f.v ? ' warn' : ''}" data-cell="${esc(kid.id + '|' + code)}" aria-expanded="${UI.cell === kid.id + '|' + code}">
            <span class="syn-l"><span class="syn-n"><code>${esc(dispCode(code))}</code> ${esc(label(code))}</span><span class="small">${cellNote(f)}</span></span>
            <span class="cell${f.v ? ' m' + f.v : ''}${f.over ? ' over' : ''}${f.carried ? ' carried' : ''}">${fmtMark(f)}</span></button>`;
        }).join('') + '</div>';
    }
    if (UI.cell) h += cellDetail(c, term);
    // Gaps before you submit.
    const gaps = [];
    const outNow = X.missing.filter(m => !m.received && !m.excused && m.date >= term.start && m.date <= term.end);
    if (outNow.length) gaps.push(`${outNow.length} piece${outNow.length === 1 ? '' : 's'} of work still not turned in from ${term.name}`);
    shown.forEach(code => {
      const fs = [...grid.get(code).values()], blank = fs.filter(f => !f.v).length, carried = fs.filter(f => f.carried).length;
      if (blank) gaps.push(`${dispCode(code)} ${label(code)}: ${blank} student${blank === 1 ? '' : 's'} with nothing to go on`);
      else if (carried) gaps.push(`${dispCode(code)} ${label(code)}: ${carried} student${carried === 1 ? '' : 's'} carried from an earlier quarter`);
    });
    if (gaps.length) h += `<section class="side"><h2>Gaps before you submit</h2><ul class="gaps">${gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul></section>`;
    el.innerHTML = h;
  }
  // The marks behind one cell, and setting your own.
  function cellDetail(c, term) {
    const [sid, code] = UI.cell.split('|');
    const k = X.students.find(s => s.id === sid);
    if (!k) return '';
    const f = R.finalMark(c, sid, code, term), st = R.settings(X.settings);
    const inQ = c.counted.filter(m => m.studentId === sid && m.standard === code && m.date >= term.start && m.date <= term.end).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const worked = Object.assign({}, c, { overrides: new Map() });
    const auto = R.finalMark(worked, sid, code, term);
    return `<section class="side syn-detail" aria-label="Marks behind this one">
      <div class="side-head"><h2>${esc(fullName(k))} · <code>${esc(dispCode(code))}</code> ${esc(label(code))}</h2><button class="quiet compact" data-cellclose="1">Close</button></div>
      <p class="small">${esc(term.name)}. ${inQ.length ? `Worked out ${st.rule === 'weighted' ? 'with recent work counting more' : st.rule === 'mean' ? 'as a straight average' : 'from the most recent mark'}: ${auto.raw != null ? auto.raw + ', so ' : ''}${fmtMark(auto)}.` : auto.carried ? `No marks this quarter; ${fmtMark(auto)} is carried from ${esc(auto.carried)}.` : 'No marks this quarter.'}</p>
      ${inQ.length ? `<div class="ev">${inQ.map(m => `<span class="evm m${m.value}" title="${esc((m.what || '') + (m.note ? ' · ' + m.note : ''))}"><b>${m.value}</b><span>${esc(md(m.date))}${m.source ? ' · ' + (m.source === 'orf' ? 'ORF' : 'iReady') : ''}</span></span>`).join('')}</div>` : ''}
      <div class="marks four syn-set">${[1, 2, 3, 4].map(v => `<button class="mk m${v}" data-over="${v}" aria-pressed="${f.over && f.v === v}" aria-label="Set ${v} for Synergy">${v}</button>`).join('')}</div>
      ${f.over ? `<button class="linkbtn" data-over="0">Go back to the worked-out ${fmtMark(auto)}</button>` : '<p class="small">Pick a number to set it yourself. It stays put however the marks change.</p>'}
    </section>`;
  }
  async function setOverride(v) {
    const [sid, code] = UI.cell.split('|'), term = currentPeriod();
    const id = R.overrideId(term.id, sid, code), before = RECS.get(id) || null;
    let after;
    if (v) after = { id, type: 'markOverride', deletedAt: null, periodId: term.id, studentId: sid, standard: code, value: v };
    else if (before && !before.deletedAt) after = Object.assign({}, before, { deletedAt: nowIso() });
    else return;
    const body = r => Object.fromEntries(Object.entries(r).filter(([k2]) => k2 !== 'updatedAt' && k2 !== 'device'));
    await act({ writes: [after], undo: [{ id, before, after: body(after) }] }, v ? `${kidName(sid)}'s ${v} for Synergy` : `${kidName(sid)}'s mark set by you`);
  }
  async function synergyClick(b) {
    const d = b.dataset;
    if (d.period) { UI.period = d.period; UI.cell = null; }
    else if (d.cell) UI.cell = UI.cell === d.cell ? null : d.cell;
    else if (d.cellclose) UI.cell = null;
    else if (d.over != null) await setOverride(Number(d.over));
    else if (d.synkid) { const i = X.kids.findIndex(k => k.id === UI.synKid); UI.synKid = X.kids[(i + Number(d.synkid) + X.kids.length) % X.kids.length].id; UI.cell = null; }
    else return;
    render();
  }
  async function synergyChange(el) {
    if (el.id === 'y-subject') { UI.subject = el.value; UI.cell = null; await saveSettings({ subject: el.value }); }
    else if (el.id === 'y-rule') await saveSettings({ rule: el.value });
    else if (el.id === 'y-carry') await saveSettings({ carryForward: el.checked });
    else if (el.id === 'y-iready') await saveSettings({ ireadyInReport: el.checked });
    else if (el.id === 'y-kid') { UI.synKid = el.value; UI.cell = null; }
    else return;
    el.blur();
    render();
  }

  // ---------- Groups & patterns (design C): everything from core/groups.js, v95's logic ----------
  const GR = SuiteGroups;
  Object.assign(UI, { gStd: null, gK: 4, gEv: 'both', gDays: '0', gMove: null });
  function groupsOpt() {
    return { students: X.kids, all: GR.allMarks(R, X.marks, X.checks, X.settings), codes: codesFor(UI.subject), days: UI.gDays, ev: UI.gEv, now: new Date() };
  }
  const selKey = sel => sel === '__all' ? null : sel;
  const pinsFor = sel => Object.fromEntries(X.pins.filter(p => p.subject === UI.subject && p.standard === selKey(sel)).map(p => [p.studentId, p.group]));
  const pinId = (sel, sid) => `pin_${UI.subject}_${sel === '__all' ? 'all' : sel.replace(/\./g, '-')}_${sid}`;
  function currentSel(o) {
    const ok = GR.groupable(o);
    if (UI.gStd === '__all' || (UI.gStd && ok.includes(UI.gStd))) return UI.gStd;
    UI.gStd = GR.defaultSel(o);
    return UI.gStd;
  }
  const selLabel = sel => sel === '__all' ? `All ${UI.subject === 'All' ? '' : UI.subject + ' '}standards together` : `${dispCode(sel)} · ${label(sel)}`;
  const markChip = v => v == null ? '' : `<span class="gmk m${R.roundMark(v)}">${R.roundMark(v)}</span>`;
  function chipHTML(r, gi) {
    const k = r.st, dec = r.v == null ? '–' : r.v.toFixed(1);
    const title = r.n ? `${r.n} mark${r.n === 1 ? '' : 's'}${r.last ? ', most recent ' + md(r.last.date) : ''}` : 'No marks on this in the chosen time';
    return `<button class="gchipk${r.pinned ? ' moved' : ''}" draggable="true" data-gkid="${esc(k.id)}" data-gfrom="${gi}" title="${esc(title)}"
      aria-label="${esc(fullName(k))}, ${dec}${r.pinned ? ', moved by you' : ''}. Move">
      <span class="gk-n">${esc(fullName(k))}${k.eld ? ' <span class="eld">ELD</span>' : ''}</span><span class="gk-v">${dec}</span>${markChip(r.v)}</button>`;
  }
  function renderGroups() {
    const el = $('groupsView'), o = groupsOpt(), sel = currentSel(o);
    const res = GR.buildSkillGroups(o, sel, UI.gK, pinsFor(sel)), ok = GR.groupable(o);
    const seg = (id, val, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button class="compact" data-${id}="${v}" aria-pressed="${v === val}">${l}</button>`).join('')}</div>`;
    let h = `<div class="g-top"><h2>Groups &amp; patterns</h2>${seg('gsubj', UI.subject, [['Math', 'Math'], ['ELA', 'ELA'], ['All', 'All']])}
      <label class="sf inline"><span>Marks from</span><select id="g-ev"><option value="both"${UI.gEv === 'both' ? ' selected' : ''}>Classwork and iReady</option><option value="classroom"${UI.gEv === 'classroom' ? ' selected' : ''}>Classwork only</option><option value="iready"${UI.gEv === 'iready' ? ' selected' : ''}>iReady only</option></select></label>
      <label class="sf inline"><span>Looking back</span><select id="g-days"><option value="0"${UI.gDays === '0' ? ' selected' : ''}>All year</option><option value="45"${UI.gDays === '45' ? ' selected' : ''}>Last 45 days</option><option value="21"${UI.gDays === '21' ? ' selected' : ''}>Last 3 weeks</option></select></label></div>
      <div class="g-cols"><section class="side g-skill"><div class="g-head"><h3>Skill groups</h3>
        <select id="g-std" aria-label="Group on"><option value="__all"${sel === '__all' ? ' selected' : ''}>${esc(selLabel('__all'))}</option>${ok.map(c => `<option value="${esc(c)}"${c === sel ? ' selected' : ''}>${esc(selLabel(c))}</option>`).join('')}</select>
        <select id="g-k" aria-label="How many groups">${[2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === Number(UI.gK) ? ' selected' : ''}>${n} groups</option>`).join('')}</select>
        ${res.moved ? `<button class="compact quiet" data-gclear="1">Undo my moves (${res.moved})</button>` : ''}<button class="compact quiet" data-gprint="1">Print these groups</button></div>`;
    if (!ok.length) h += '<p class="small">No marks yet. Enter a few scores and the groups build themselves.</p>';
    else {
      h += `<p class="small">Every mark counts, the newest most. Groups are as even as the class allows, from most support to least. ${wide() ? 'Drag a child, or click them,' : 'Tap a child'} to move them; they stay there as marks come in.</p><div class="g-grid">` +
        res.groups.map((g, i) => { const vals = g.filter(r => r.v != null).map(r => r.v);
          const range = vals.length ? Math.min(...vals).toFixed(1) + (vals.length > 1 ? '–' + Math.max(...vals).toFixed(1) : '') : 'no marks';
          return `<div class="g-box" data-gdrop="${i}"><div class="g-bh"><b>Group ${i + 1}</b><span class="small">${esc(range)} · ${g.length} ${g.length === 1 ? 'child' : 'children'}</span></div><div class="g-kids">${g.length ? g.map(r => chipHTML(r, i)).join('') : '<span class="small">Empty: move someone here.</span>'}</div></div>`; }).join('') + '</div>';
      if (res.out.length) h += `<div class="g-out" data-gdrop="-1"><b>Not placed</b><span class="small">Nothing recorded on this yet, so no guess. Move them in if you know where they belong.</span><div class="g-kids">${res.out.map(r => chipHTML(r, -1)).join('')}</div></div>`;
    }
    h += '</section><div class="g-rail">';
    // Worth a look.
    const flags = GR.flags(o);
    h += `<section class="side"><h3>Worth a look</h3>${flags.length ? flags.slice(0, 30).map(f => { const k = X.students.find(x => x.id === f.sid);
      return `<div class="g-flag"><span class="tagk ${f.t}">${f.t === 'down' ? 'Slipping' : 'Thin data'}</span> <b>${esc(fullName(k))}</b><div class="small">${f.t === 'down' ? `${esc(label(f.code))} dropped from ${f.from} to ${f.to}` : `only ${f.n} mark${f.n === 1 ? '' : 's'} recorded so far`}</div></div>`; }).join('') : '<p class="small">Nothing flagged. Come back after a few more entries.</p>'}</section>`;
    // Shared needs and ready to extend.
    const need = GR.buildNeedGroups(o, true), ext = GR.buildNeedGroups(o, false);
    const kidsOf = g => g.kids.map(id => fullName(X.students.find(x => x.id === id))).sort().join(', ');
    const mix = g => { const x = GR.evidenceMix(o, g), b = []; if (x.both) b.push(x.both + ' backed by both'); if (x.classroom) b.push(x.classroom + ' from classwork only'); if (x.iready) b.push(x.iready + ' from iReady only'); return b.length ? `<div class="small">Evidence: ${b.join(' · ')}</div>` : ''; };
    h += `<section class="side"><h3>Shared needs</h3>${need.length ? need.map(g => `<div class="g-need"><span class="tagk ${g.reteach ? 'reteach' : 'practice'}">${g.reteach ? 'Reteach' : 'More practice'}</span> <b>${esc(g.stds.map(label).join(' · '))}</b><div>${esc(kidsOf(g))}</div>${mix(g)}</div>`).join('')
      : '<p class="small">Once two or more children have a 1 or 2 on the same standard, groups appear here.</p>'}
      ${ext.slice(0, 4).map(g => `<div class="g-need ext"><span class="tagk extend">Extend</span> <b>${esc(g.stds.map(label).join(' · '))}</b><div>${esc(kidsOf(g))}</div></div>`).join('')}</section></div></div>`;
    // Class at a glance.
    const gl = GR.glance(o);
    if (gl.codes.length) h += `<section class="side g-glance"><h3>Class at a glance</h3><p class="small">Each child's latest mark on each standard with marks, and the average of those.</p><div class="syn-wrap"><table class="syn"><thead><tr><th class="kid-h">Student</th>${gl.codes.map(c => `<th class="std-h" title="${esc(label(c))}"><span><code>${esc(dispCode(c))}</code></span></th>`).join('')}<th>Avg</th></tr></thead><tbody>` +
      gl.rows.map(r => { const k = X.students.find(x => x.id === r.sid); return `<tr><th class="kid-n" scope="row">${esc(fullName(k))}${k.eld ? ' <span class="eld">ELD</span>' : ''}</th>${r.cells.map(m => `<td><span class="cell${m ? ' m' + m.value : ''}" title="${m ? esc(md(m.date) + (m.source === 'iready' ? ', from iReady' : m.source === 'orf' ? ', from an ORF reading' : '')) : ''}">${m ? m.value + (m.source === 'iready' ? '<small>i</small>' : '') : '–'}</span></td>`).join('')}<td><b>${r.avg ? r.avg.toFixed(1) : '–'}</b></td></tr>`; }).join('') + '</tbody></table></div></section>';
    // Moving one child.
    if (UI.gMove) {
      const k = X.students.find(x => x.id === UI.gMove), pin = pinsFor(sel)[UI.gMove];
      if (k) h += `<div class="g-sheet" role="dialog" aria-label="Move ${esc(fullName(k))}"><div class="g-bh"><b>Move ${esc(fullName(k))}</b><button class="compact quiet" data-gclose="1">Close</button></div>
        <span class="g-to-l">To group</span><div class="g-to">${res.groups.map((g, i) => `<button data-gto="${i}" aria-pressed="${pin === i}" aria-label="Group ${i + 1}">${i + 1}</button>`).join('')}</div>
        <div class="g-to two"><button class="dash" data-gto="-1" aria-pressed="${pin === -1}">Not placed</button><button class="quiet" data-gunpin="1"${pin == null ? ' disabled' : ''}>Let the marks place ${esc(k.firstName)}</button></div></div>`;
    }
    el.innerHTML = h;
  }
  async function movePin(sid, group) {
    const o = groupsOpt(), sel = currentSel(o), id = pinId(sel, sid), before = RECS.get(id) || null;
    let after;
    if (group === null) { if (!before || before.deletedAt) return; after = Object.assign({}, before, { deletedAt: nowIso() }); }
    else after = { id, type: 'groupPin', deletedAt: null, subject: UI.subject, standard: selKey(sel), studentId: sid, group };
    const body = r => Object.fromEntries(Object.entries(r).filter(([k2]) => k2 !== 'updatedAt' && k2 !== 'device'));
    await act({ writes: [after], undo: [{ id, before, after: body(after) }] }, `${kidName(sid)}'s move`);
  }
  async function clearPins() {
    const o = groupsOpt(), sel = currentSel(o), now = nowIso();
    const live = X.pins.filter(p => p.subject === UI.subject && p.standard === selKey(sel));
    const body = r => Object.fromEntries(Object.entries(r).filter(([k2]) => k2 !== 'updatedAt' && k2 !== 'device'));
    const writes = live.map(p => Object.assign({}, p, { deletedAt: now }));
    if (await act({ writes, undo: writes.map((w, i) => ({ id: w.id, before: live[i], after: body(w) })) }, 'undoing your moves')) toast('Back to the groups the marks make.');
  }
  function printGroups() {
    const o = groupsOpt(), sel = currentSel(o), res = GR.buildSkillGroups(o, sel, UI.gK, pinsFor(sel));
    $('printSheet').innerHTML = `<h2>${esc(selLabel(sel))}</h2><p>${esc(UI.subject)} skill groups, printed ${esc(longDate(todayIso()))}. Newer marks count more.</p><table><thead><tr><th>Group</th><th>Children</th></tr></thead><tbody>` +
      res.groups.map((g, i) => `<tr><td><b>${i + 1}</b></td><td>${g.length ? g.map(r => esc(fullName(r.st)) + (r.v == null ? '' : ' <span>' + r.v.toFixed(1) + '</span>')).join(' · ') : '—'}</td></tr>`).join('') +
      (res.out.length ? `<tr><td>Not placed</td><td>${res.out.map(r => esc(fullName(r.st))).join(' · ')}</td></tr>` : '') + '</tbody></table>';
    window.print();
  }
  async function groupsClick(b) {
    const d = b.dataset;
    if (d.gsubj) { UI.subject = d.gsubj; UI.gStd = null; UI.gMove = null; await saveSettings({ subject: d.gsubj }); }
    else if (d.gkid) UI.gMove = UI.gMove === d.gkid ? null : d.gkid;
    else if (d.gclose) UI.gMove = null;
    else if (d.gto != null) { await movePin(UI.gMove, Number(d.gto)); UI.gMove = null; }
    else if (d.gunpin) { await movePin(UI.gMove, null); UI.gMove = null; }
    else if (d.gclear) await clearPins();
    else if (d.gprint) { printGroups(); return; }
    else return;
    render();
  }
  async function groupsChange(el) {
    if (el.id === 'g-std') { UI.gStd = el.value; UI.gMove = null; }
    else if (el.id === 'g-k') UI.gK = Number(el.value);
    else if (el.id === 'g-ev') { UI.gEv = el.value; UI.gStd = null; }
    else if (el.id === 'g-days') UI.gDays = el.value;
    else return;
    el.blur();
    render();
  }
  // Dragging a child to another group on the MacBook.
  document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('[data-gkid]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.gkid); e.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('[data-gdrop]')) e.preventDefault(); });
  document.addEventListener('drop', async e => {
    const box = e.target.closest && e.target.closest('[data-gdrop]');
    if (!box) return;
    e.preventDefault();
    const sid = e.dataTransfer.getData('text/plain');
    if (sid) { await movePin(sid, Number(box.dataset.gdrop)); render(); }
  });

  // ---------- Settings: the class list and the standards ----------
  async function saveSettings(change) {
    const next = Object.assign({}, X.settings, change);
    try { problem(''); await store.write([next], 'the gradebook settings'); } catch (e) { problem('Not saved: ' + e.message); }
  }
  function renderSettings() {
    const rows = X.students.map(s => `<div class="srow${s.active ? '' : ' gone'}" data-stu="${esc(s.id)}">
      <label class="sf"><span>First name</span><input type="text" data-stu="${esc(s.id)}" data-f="firstName" maxlength="40" value="${esc(s.firstName)}"></label>
      <label class="sf"><span>Last name</span><input type="text" data-stu="${esc(s.id)}" data-f="lastName" maxlength="40" value="${esc(s.lastName || '')}"></label>
      <label class="sf"><span>Also called</span><input type="text" data-stu="${esc(s.id)}" data-f="aka" maxlength="200" placeholder="Theo, T" value="${esc((s.aka || []).join(', '))}"></label>
      <label class="sf"><span>Synergy id</span><input type="text" data-stu="${esc(s.id)}" data-f="districtId" maxlength="20" inputmode="numeric" value="${esc(s.districtId || '')}"></label>
      <label class="check"><input type="checkbox" data-stu="${esc(s.id)}" data-f="eld"${s.eld ? ' checked' : ''}> ELD</label>
      <label class="check"><input type="checkbox" data-stu="${esc(s.id)}" data-f="active"${s.active ? ' checked' : ''}> In the class</label>
    </div>`).join('');
    const groups = [];
    CATALOG.forEach(s => { const g = s.subject + ' · ' + s.domain; if (!groups.includes(g)) groups.push(g); });
    const stds = groups.map(g => `<fieldset class="sgroup"><legend>${esc(g)}</legend>` + CATALOG.filter(s => s.subject + ' · ' + s.domain === g).map(s =>
      `<label class="check std"><input type="checkbox" data-std-on="${esc(s.code)}"${isOn(s.code) ? ' checked' : ''}> <code>${esc(dispCode(s.code))}</code> ${esc(s.label)}</label>`).join('') + '</fieldset>').join('');
    $('settingsView').innerHTML = `<section class="side"><div class="side-head"><h2>Class list</h2><span class="small">${X.kids.length} in the class</span></div>
      <p class="small">Private: the class list travels only through your district Drive folder. A child who leaves keeps their marks; untick In the class.</p>
      <div class="roster">${rows || '<p class="small">No children yet.</p>'}</div>
      <div class="addkid"><label class="sf"><span>Add a child: first name</span><input type="text" id="newFirst" maxlength="40"></label>
        <label class="sf"><span>Last name</span><input type="text" id="newLast" maxlength="40"></label><button class="compact" data-addkid="1">Add</button></div></section>
      <section class="side"><div class="side-head"><h2>Standards</h2><span class="small">${X.settings.on.length} switched on</span></div>
      <label class="sf"><span>Math codes shown as</span><select id="s-codes"><option value="oregon"${X.settings.codes !== 'ccss' ? ' selected' : ''}>Oregon 2021 (Synergy)</option><option value="ccss"${X.settings.codes === 'ccss' ? ' selected' : ''}>CCSS (Reveal)</option></select></label>
      <p class="small">Marks are always kept under the Oregon code.</p>
      <div class="stds">${stds}</div></section>` + orfSettingsHTML();
  }
  // ORF readings as marks for Synergy (fluency only): v95's settings, and which readings count.
  function orfSettingsHTML() {
    const st = R.settings(X.settings), left = st.orfLeftOut || [];
    const fs = CATALOG.filter(x => x.subject === 'ELA' && /Foundational/.test(x.domain));
    const checks = X.checks.slice().sort((a, b) => a.date < b.date ? 1 : -1);
    const stu = id => X.students.find(x => x.id === id);
    return `<section class="side" id="orfSettings"><div class="side-head"><h2>ORF readings as marks</h2></div>
      <p class="small">Each reading becomes a fluency mark (words correct per minute; comprehension does not count), graded against Hasbrouck &amp; Tindal 2017.</p>
      <label class="check"><input type="checkbox" id="o-auto"${st.orfAuto ? ' checked' : ''}> Turn readings into marks</label>
      <div class="sgrid">
        <label class="sf"><span>Marks go on</span><select id="o-std">${fs.map(x => `<option value="${esc(x.code)}"${x.code === st.orfStandard ? ' selected' : ''}>${esc(x.code + ' — ' + x.label)}</option>`).join('')}</select></label>
        <label class="sf"><span>Graded against</span><select id="o-against"><option value="eoy"${st.orfAgainst !== 'season' ? ' selected' : ''}>End-of-year norms (a 3 is the spring 50th)</option><option value="season"${st.orfAgainst === 'season' ? ' selected' : ''}>The norms for the season it was read</option></select></label>
        ${[4, 3, 2].map(k => `<label class="sf"><span>A ${k} from the</span><select id="o-cut${k}">${[90, 75, 50, 25, 10].map(p => `<option value="${p}"${st['orfCut' + k] === p ? ' selected' : ''}>${p}th percentile</option>`).join('')}</select></label>`).join('')}
      </div>
      ${checks.length ? `<h3>Readings</h3><div class="orf-list">${checks.map(ch => `<label class="check orf-r"><input type="checkbox" data-orfcount="${esc(ch.id)}"${left.includes(ch.id) ? '' : ' checked'}>
        <span>${esc(fullName(stu(ch.studentId)))} · ${esc(md(ch.date))} · ${esc(ch.passageTitle)} · ${ch.wcpm} WCPM</span></label>`).join('')}</div>
        <p class="small">Untick a reading to leave it out of the marks (a practice read, say).</p>` : '<p class="small">No readings yet.</p>'}
    </section>`;
  }
  async function writeStudent(next) {
    if (!next.firstName) { problem('A child needs a first name.'); render(); return; }
    try { problem(''); await store.write([next], 'the class list'); } catch (e) { problem('Not saved: ' + e.message); render(); }
  }
  async function settingsChange(el) {
    const d = el.dataset;
    if (d.stu) {
      const s = X.students.find(x => x.id === d.stu);
      if (!s) return;
      const next = Object.assign({}, s), v = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (d.f === 'aka') { const a = v.split(',').map(x => x.trim().slice(0, 40)).filter((x, i, all) => x && all.indexOf(x) === i); if (a.length) next.aka = a.slice(0, 6); else delete next.aka; }
      else if (d.f === 'lastName' || d.f === 'districtId') { if (v) next[d.f] = v; else delete next[d.f]; }
      else if (d.f === 'active') { next.active = v; next.left = v ? null : todayIso(); }
      else next[d.f] = v;
      await writeStudent(next);
    } else if (d.stdOn) {
      const on = X.settings.on.filter(c => c !== d.stdOn);
      if (el.checked) on.push(d.stdOn);
      await saveSettings({ on: CATALOG.map(s => s.code).filter(c => on.includes(c)) });
    } else if (el.id === 's-codes') await saveSettings({ codes: el.value === 'ccss' ? 'ccss' : 'oregon' });
    else if (el.id === 'o-auto') await saveSettings({ orfAuto: el.checked });
    else if (el.id === 'o-std') await saveSettings({ orfStandard: el.value });
    else if (el.id === 'o-against') await saveSettings({ orfAgainst: el.value === 'season' ? 'season' : 'eoy' });
    else if (/^o-cut[234]$/.test(el.id)) await saveSettings({ ['orfCut' + el.id.slice(-1)]: Number(el.value) });
    else if (d.orfcount) {
      const left = (R.settings(X.settings).orfLeftOut || []).filter(id => id !== d.orfcount);
      if (!el.checked) left.push(d.orfcount);
      await saveSettings({ orfLeftOut: left });
    }
  }
  async function settingsClick(b) {
    if (!b.dataset.addkid) return;
    const first = $('newFirst').value.trim(), last = $('newLast').value.trim();
    if (!first) { problem('A child needs a first name.'); return; }
    const rec = { id: rid('stu'), type: 'student', deletedAt: null, firstName: first, eld: false, active: true, joined: todayIso() };
    if (last) rec.lastName = last;
    $('newFirst').value = ''; $('newLast').value = '';
    await writeStudent(rec);
    toast(`${first} added.`);
  }

  await render();
  window.__ready = true;
  window.__store = store; window.__live = live; window.__grade = UI;   // for the browser tests
})();
