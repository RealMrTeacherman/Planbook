// The planner page. Day view (the day in schedule order) and Week view, on phone and desktop.
// Data: live records sync through Firebase; private notes travel only through the Drive folder.
(async function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = SuitePlan;
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const longDate = s => { const d = P.parse(s); return `${DAY[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
  const shortDate = s => { const d = P.parse(s); return `${DAY[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`; };
  const todayIso = () => P.iso(new Date());
  const rid = p => p + '_' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  function problem(text) { $('problemText').textContent = text; $('problem').hidden = !text; }

  // ---------- open everything ----------
  let store, live, contract, t, FLAGS, D;
  try {
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u} did not load`); return r.json(); });
    const [c, reveal, bench, cal, defs] = await Promise.all([get('../contract/contract.json'), get('../data/reveal-grade2.json'),
      get('../data/benchmark-grade2.json'), get('../data/calendar-2026-27.json'), get('../data/planner-defaults.json')]);
    contract = c; FLAGS = defs.flags; D = defs;
    P.useCurriculum(reveal, bench);
    store = await SuiteStore.open({ contract });
    store.persist();
    const backend = window.__liveBackend || SuiteLiveFirebase.create(window.PLANBOOK_FIREBASE);
    live = SuiteLive.create({ store, contract, backend });
    t = SuiteTransport.create({ store, contract });   // on the MacBook this also keeps the Drive folder copy current
    await t.start();
    live.start();
    await applyCalendar(cal);
  } catch (e) { problem('The planner could not open: ' + e.message); return; }

  // The district calendar, as data. Its records carry an early date, so anything you change wins.
  async function applyCalendar(cal) {
    const env = { updatedAt: '2026-08-01T00:00:00.000Z', device: 'district', deletedAt: null };
    const recs = Object.entries(cal.closed).map(([date, label]) => Object.assign({ id: 'sday_' + date, type: 'schoolDay', date, kind: 'noSchool', label }, env));
    recs.push(Object.assign({ id: 'year_' + cal.firstDay.slice(0, 4), type: 'schoolYear', firstDay: cal.firstDay, lastDay: cal.lastDay, earlyReleaseWeekday: cal.earlyReleaseWeekday }, env));
    await store.load(recs, { source: 'the district calendar', kind: 'defaults' });
  }

  // ---------- the data, indexed ----------
  let X = null;
  async function index() {
    const all = (await store.all()).filter(r => !r.deletedAt);
    const by = type => all.filter(r => r.type === type);
    const map = (list, key) => Object.fromEntries(list.map(r => [key(r), r]));
    const subjects = by('subject').sort((a, b) => a.order - b.order);
    const lessons = by('lessonPlan');
    X = {
      subjects, subj: map(subjects, r => r.id), blocks: by('block'), lessons,
      lesson: map(lessons, r => r.date + '|' + r.subjectId), dayPlan: map(by('dayPlan'), r => r.date),
      bnote: map(by('blockNote'), r => r.date + '|' + r.blockId), days: map(by('schoolDay'), r => r.date),
      year: by('schoolYear').sort((a, b) => a.firstDay < b.firstDay ? 1 : -1)[0] || null,
      pnotes: by('privateNote'), students: by('student')
    };
  }

  // ---------- routing ----------
  function route() {
    const m = /^#(day|week)\/(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
    return m ? { view: m[1], date: m[2] } : { view: 'day', date: todayIso() };
  }
  const go = (view, date) => { location.hash = `#${view}/${date}`; };
  function step(dir) {
    const r = route();
    if (r.view === 'week') return go('week', P.addDays(r.date, 7 * dir));
    let d = P.addDays(r.date, dir);
    while ([0, 6].includes(P.weekday(d))) d = P.addDays(d, dir);
    go('day', d);
  }
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('todayBtn').onclick = () => go(route().view, todayIso());
  $('tabToday').onclick = () => go('day', route().date);
  $('tabWeek').onclick = () => go('week', route().date);

  // ---------- the name check ----------
  // Returns 'live', 'private' or null (edit it). Text with no class-list name is simply live.
  function nameCheck(text) {
    const hits = SuiteNames.nameHits(text, X.students);
    if (!hits.length) return Promise.resolve('live');
    const dlg = $('nameDialog');
    $('nameText').textContent = `${hits.map(h => `"${h}"`).join(', ')} ${hits.length === 1 ? 'is a name' : 'are names'} on your class list.`;
    return new Promise(ok => {
      dlg.onclose = () => ok(dlg.returnValue === 'private' ? 'private' : dlg.returnValue === 'anyway' ? 'live' : null);
      dlg.returnValue = '';
      dlg.showModal();
    });
  }
  // Save text to a live record's field, or as a private note instead. Empty text clears it.
  async function saveText({ live: rec, field, text, about, where }) {
    text = text.trim();
    if (!text) { const c = clearField(rec, field); if (c) await store.write([c], 'a note cleared'); return true; }
    const choice = await nameCheck(text);
    if (!choice) return false;
    if (choice === 'private') {
      const writes = [Object.assign({ id: rid('pnote'), type: 'privateNote', deletedAt: null, about, text }, where)];
      if (rec.updatedAt) writes.push(clearField(rec, field));   // the live copy, if any, loses the text
      await store.write(writes.filter(Boolean), 'a private note');
    } else {
      await store.write([Object.assign({}, rec, { [field]: text, deletedAt: null })], 'a note');
    }
    return true;
  }
  function clearField(rec, field) {
    if (!rec.updatedAt) return null;
    if (rec.type === 'blockNote') return Object.assign({}, rec, { deletedAt: new Date().toISOString() });
    const r = Object.assign({}, rec); delete r[field]; return r;
  }

  // An inline editor in place of a button; resolves when saved or cancelled.
  let editing = 0;
  function editor(host, initial, onSave, label) {
    editing++;
    host.innerHTML = `<textarea aria-label="${esc(label)}" maxlength="2000">${esc(initial)}</textarea>
      <div class="note-actions"><button class="compact" data-act="save">Save</button><button class="quiet compact" data-act="cancel">Cancel</button></div>`;
    const ta = host.querySelector('textarea'); ta.focus();
    const close = () => { editing--; render(); };
    host.querySelector('[data-act=cancel]').onclick = close;
    host.querySelector('[data-act=save]').onclick = async () => {
      try { if (await onSave(ta.value)) close(); else ta.focus(); }
      catch (e) { problem('Not saved: ' + e.message); close(); }
    };
  }

  // ---------- the day ----------
  const SVG = {
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
    pen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>'
  };
  // A subject's color and the pale wash its tile sits on.
  function tint(hex, keep = 0.16) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#E6EBF1';
    const n = parseInt(m[1], 16), mix = c => Math.round(c * keep + 255 * (1 - keep));
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  }
  // White text on the subject's color must reach 4.5:1, so a light color is deepened until it does.
  function deep(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#45607C';
    let [r, g, b] = [0, 8, 16].map(sh => (parseInt(m[1], 16) >> (16 - sh)) & 255);
    const lum = () => [r, g, b].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    for (let i = 0; i < 40 && 1.05 / (lum() + 0.05) < 4.5; i++) { r = Math.round(r * 0.92); g = Math.round(g * 0.92); b = Math.round(b * 0.92); }
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }
  const colorVars = sb => `--subj:${deep(sb.color)};--tint:${tint(sb.color)}`;
  let ENDS = {};   // block id -> the time it ends (the next block's start), for the day on screen
  const PICKS = () => Object.fromEntries((D.extraSubjects || []).filter(x => x.picks).map(x => [x.id, x.picks]));

  const privateList = (list, label) => list.map(n => `<div class="private"><span class="lock">${SVG.lock} Private · Drive only</span><div class="ptext">${esc(n.text)}</div>
    <button class="quiet" data-delpnote="${esc(n.id)}" aria-label="Delete this private note${label ? ' for ' + esc(label) : ''}">Delete</button></div>`).join('');

  // The curriculum inside the tile. Sections open on the phone; all show on the desktop.
  function curriculum(sb, pos) {
    const d = P.detail(sb, pos);
    if (!d) return '';
    const sec = (title, body, open) => `<details${open ? ' open' : ''}><summary>${esc(title)}</summary>${body}</details>`;
    const ul = items => `<ul>${items.join('')}</ul>`;
    const code = c => `<span class="code">${esc(c)}</span>`;
    const item = x => `<li>${esc(x.t)} ${(x.codes || []).map(code).join(' ')}</li>`;
    if (d.kind === 'reveal') {
      const std = d.standards.map(s => `<li>${code(s.code)} ${esc(s.label)}${s.oregon.length ? ` <span class="k">· Oregon</span> ${s.oregon.map(code).join(' ')}` : ''}</li>`);
      return `<div class="cur">
        ${d.targets.length ? sec('Learning targets', ul(d.targets.map(t => `<li>${esc(t)}</li>`)), true) : ''}
        ${d.materials.length ? sec('Materials', ul(d.materials.map(t => `<li>${esc(t)}</li>`)), true) : ''}
        ${d.note ? sec('About this day', `<p class="hint">${esc(d.note)}</p>`, !d.targets.length) : ''}
        ${std.length ? sec('Standards', ul(std) + (d.gradeOne ? '<p class="hint">Grade 1 standards: this launch unit counts toward no grade 2 mark.</p>' : ''), false) : ''}
        ${d.next ? sec('Coming next', `<p class="hint">${esc(d.next)}</p>`, false) : ''}</div>`;
    }
    const R = d.reads, texts = [['Interactive read-aloud', R.interactive], ['Accountable text', R.accountable], ['Word study reader', R.wordStudy],
      ...d.anchor.map(a => [a.kind, a.t]), ...d.practice.map(t => ['Practice', t])].filter(x => x[1]);
    const P2 = d.parts;
    const words = [...(d.words.ga || []), ...(d.words.ds || [])];
    return `<div class="cur">
      ${sec('Texts this week', ul(texts.map(([k, t]) => `<li><span class="k">${esc(k)}:</span> <b>${esc(t)}</b></li>`)), true)}
      ${sec('Skills', ul((P2.reading || []).map(x => `<li>${x.kind === 'Comprehension' ? '' : `<span class="k">${esc(x.kind)}:</span> `}${esc(x.t)} ${(x.codes || []).map(code).join(' ')}</li>`)), true)}
      ${words.length ? sec('Words to teach', `<div class="words">${words.map(w => `<span>${esc(w)}</span>`).join('')}</div>`, false) : ''}
      ${d.meta.length ? sec('Strategies', ul(d.meta.map(t => `<li>${esc(t.replace(/^Metacognitive: /, ''))}</li>`)), false) : ''}
      ${(P2.wordStudy || []).length ? sec('Word study', ul(P2.wordStudy.map(x => `<li><span class="k">${esc(x.kind)}:</span> ${esc(x.t)} ${(x.codes || []).map(code).join(' ')}</li>`)), false) : ''}
      ${(P2.writing || []).length ? sec('Writing and grammar', ul(P2.writing.map(item)), false) : ''}
    </div>`;
  }

  function lessonCard(row, date) {
    const sb = row.subject;
    const rec = X.lesson[date + '|' + sb.id];
    const pos = rec ? rec.pos : P.suggest(sb, X.lessons, date);
    const last = P.lastTaught(X.lessons, sb.id, date);
    const bl = row.blocks || [];
    const lastEnd = bl.length ? (ENDS[bl[bl.length - 1].id] || '') : '';
    const when = bl.length ? (lastEnd ? `${bl[0].start}–${lastEnd}` : bl[0].start) : '';
    const notes = X.pnotes.filter(n => n.about === 'lesson' && n.date === date && n.subjectId === sb.id);
    const free = sb.schema === 'free';
    const picks = PICKS()[sb.id];
    // The subject's blocks, folded into its card as small text: same every day, so no rows of their own.
    const blockLines = bl.map(b => {
      const bn = X.bnote[date + '|' + b.id];
      const priv = X.pnotes.filter(n => n.blockId === b.id && ((n.about === 'block' && n.date === date) || (n.about === 'standing' && n.weekday === b.weekday)));
      const showName = bl.length > 1 || b.name !== sb.name;
      if (!showName && !b.note && !bn && !priv.length) return '';
      return `<li><span class="bt">${esc(b.start)}</span>${showName ? ` ${esc(b.name)}` : ''}${b.note ? ` <span class="k">· ${esc(b.note)}</span>` : ''}
        ${bn ? `<span class="bn">Today: ${esc(bn.text)}</span>` : ''}${privateList(priv, b.name)}</li>`;
    }).filter(Boolean);
    const where = last ? `${free ? 'Last time:' : 'after'} ${P.label(sb, last.pos)} · ${shortDate(last.date)}` : (free ? '' : 'starting point');
    const head = free
      ? `<div class="pos"><input class="freehead" type="text" maxlength="120" data-free="${esc(sb.id)}" value="${esc(pos.text || '')}" placeholder="Add today’s topic" aria-label="${esc(sb.name)}: today’s topic">
          <button class="prev" data-focus="${esc(sb.id)}" aria-label="${esc(sb.name)}: edit today’s topic">${SVG.pen}</button></div>`
      : `<div class="pos"><span class="label">${esc(P.label(sb, pos))}</span>
          <button class="prev" data-step="-1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: previous">${SVG.prev}</button>
          <button class="next" data-step="1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: next">${SVG.next}</button></div>`;
    const title = P.title(sb, pos);
    const d = P.detail(sb, pos);
    return `<article class="tile" style="${colorVars(sb)}" data-card="${esc(sb.id)}">
      <div class="tile-head"><span class="subj-chip">${when ? `<span class="t">${esc(when)}</span>` : ''}${esc(sb.name)}</span>${rec || free ? '' : '<span class="tag">Suggested</span>'}</div>
      ${head}
      ${picks ? `<div class="picks" role="group" aria-label="What ${esc(sb.name)} is today">${picks.map(p => `<button aria-pressed="${pos.text === p}" data-pick="${esc(sb.id)}" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
      ${title && !(d && d.kind === 'benchmark') ? `<div class="ttl">${esc(title)}</div>` : ''}
      ${d && d.kind === 'benchmark' ? `<div class="ttl">${esc(d.unit)}</div><div class="hint"><i>${esc(d.question)}</i></div><div class="hint">Benchmark plans by the week, so this is all of week ${d.week}${d.project ? ` · unit project: ${esc(d.project)}` : ''} · standards are mapped from the skill names</div>` : ''}
      ${d && d.kind === 'reveal' ? `<div class="hint">${esc(d.unit)}</div>` : ''}
      ${where ? `<div class="hint">${esc(where)}</div>` : ''}
      ${blockLines.length ? `<ul class="blk" aria-label="${esc(sb.name)} blocks">${blockLines.join('')}</ul>` : ''}
      ${curriculum(sb, pos)}
      ${rec && rec.note ? `<div class="lnote">${esc(rec.note)}</div>` : ''}${privateList(notes, sb.name)}
      <div class="tile-foot">
        <button class="taught" aria-pressed="${rec && rec.taught ? 'true' : 'false'}" data-taught="${esc(sb.id)}">${rec && rec.taught ? SVG.check + ' Taught' : 'Mark taught'}</button>
        <button class="soft" data-lnote="${esc(sb.id)}">${rec && rec.note ? 'Edit note' : 'Add note'}</button>
      </div><div data-lnote-host="${esc(sb.id)}"></div></article>`;
  }
  function plainRow(row, date, continued) {
    const b = row.block;
    const bn = X.bnote[date + '|' + b.id];
    const priv = X.pnotes.filter(n => n.blockId === b.id && ((n.about === 'block' && n.date === date) || (n.about === 'standing' && n.weekday === b.weekday)));
    return `<div class="slim ${continued ? 'continued' : 'plain'}"${continued ? ` style="${colorVars(row.subject)}"` : ''}>
      <span class="time">${esc(b.start)}</span><span class="name">${continued ? `<span class="dot" style="background:${deep(row.subject.color)}"></span>` : ''}${esc(b.name)}${continued ? ` <span class="muted">· continues ${esc(row.subject.name)}</span>` : ''}</span>
      ${b.note ? `<span class="standing">${esc(b.note)}</span>` : ''}
      ${bn ? `<span class="bnote">${esc(bn.text)}</span>` : ''}
      ${priv.length ? `<span class="bnote">${privateList(priv, b.name)}</span>` : ''}
      <button class="linkbtn addnote" data-bnote="${esc(b.id)}">${bn ? 'Edit today’s note' : 'Note for today'}</button>
      <span class="bnote" data-bnote-host="${esc(b.id)}"></span></div>`;
  }
  function renderDay(date) {
    const st = P.dayStatus(date, { year: X.year, days: X.days, plan: X.dayPlan[date] });
    const plan = X.dayPlan[date];
    const flags = new Set((plan && plan.flags) || []);
    const dayPriv = X.pnotes.filter(n => n.about === 'day' && n.date === date);
    const tagline = !st.school ? st.label : st.early ? (st.label || 'Early release') : '';
    $('daySide').innerHTML = `<section class="side">
        <div class="side-head"><h2>The day</h2>${tagline ? `<span class="tagline">${esc(tagline)}</span>` : ''}</div>
        <div class="flags" role="group" aria-label="Flags for the day">${FLAGS.map(f => `<button aria-pressed="${flags.has(f)}" data-flag="${esc(f)}">${esc(f)}</button>`).join('')}</div>
        ${plan && plan.notes ? `<p class="daynotes">${esc(plan.notes)}</p>` : '<p class="small">No notes for this day.</p>'}
        ${privateList(dayPriv, 'the day')}
        <div id="dayNoteHost"><button class="quiet compact" id="dayNoteBtn">${plan && plan.notes ? 'Edit notes' : 'Add notes'}</button></div>
      </section>`;
    const main = $('dayMain');
    if (!st.school) { main.innerHTML = `<div class="side"><h2>${esc(st.label)}</h2><p class="small">${st.outside ? 'Outside the school year.' : 'No school this day.'} Use ‹ and › to move to a school day.</p></div>`; return; }
    const rows = P.dayLayout(X.blocks, X.subjects, P.weekday(date));
    if (!rows.length) { main.innerHTML = `<div class="side"><p class="small">There is no schedule for ${DAY[P.weekday(date)]}days yet. The schedule editor arrives in the next release.</p></div>`; return; }
    // A subject's later blocks live inside its card, so they get no row of their own.
    ENDS = Object.fromEntries(rows.filter(r => r.block).map(r => [r.block.id, r.end]));
    const sched = rows.filter(r => !r.unscheduled && r.kind !== 'continued'), un = rows.filter(r => r.unscheduled);
    // Lessons for subjects with no block today stay out of the way until asked for.
    main.innerHTML = `<div class="rows">${sched.map(r => r.kind === 'lesson' ? lessonCard(r, date) : plainRow(r, date, r.kind === 'continued')).join('')}</div>
      ${un.length ? `<details class="unsched"><summary><span class="unsched-title">Not on ${DAY[P.weekday(date)]}'s schedule</span>
        <span class="unsched-names">${un.map(r => esc(r.subject.name)).join(' · ')}</span></summary><div class="rows">${un.map(r => lessonCard(r, date)).join('')}</div></details>` : ''}`;
    $('daySide').insertAdjacentHTML('beforeend', miniWeek(date));
    // On the desktop every curriculum section shows; on the phone they open one at a time.
    if (matchMedia('(min-width: 900px)').matches) main.querySelectorAll('.cur details').forEach(d => { d.open = true; });
  }

  // The week at a glance, beside the day on wide screens and under it on the phone.
  function miniWeek(date) {
    const dates = P.weekOf(date);
    const st = Object.fromEntries(dates.map(d => [d, P.dayStatus(d, { year: X.year, days: X.days, plan: X.dayPlan[d] })]));
    const on = X.subjects.filter(s => s.on && X.blocks.some(b => !b.deletedAt && b.subjectId === s.id));
    const SKIP = new Set(['a', 'an', 'the', 'more', 'our', 'my', 'and', 'of', 'to', 'in', 'on', 'for', 'with', 'at']);
    const keyWord = t => (String(t).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).find(w => !SKIP.has(w.toLowerCase())) || '';
    const ABBR = { Diagnostic: 'Diag', Opener: 'Open', Review: 'Rev', Benchmark: 'Bench', Summative: 'Summ' };
    const short = (sb, pos) => P.label(sb, pos).replace(/^U\d+ · /, '').replace(/ · /g, ' ').replace(/^(\w+)/, w => ABBR[w] || w);
    const cell = (sb, d) => {
      if (!st[d].school) return '<td class="off" aria-label="no school"></td>';
      const r = X.lesson[d + '|' + sb.id];
      if (!r) return '<td class="none">·</td>';
      const full = P.label(sb, r.pos);
      // Free text is too long for a cell: its key word here, the whole of it on hover and in the Day view.
      // A typed word shows taught by its color and weight, leaving the cell's room for the word.
      const text = sb.schema === 'free' ? (keyWord(full) || '•') : short(sb, r.pos) + (r.taught ? ' ✓' : '');
      return `<td class="${r.taught ? 'done' : ''}${sb.schema === 'free' ? ' word' : ''}"><a href="#day/${d}" title="${esc(full)}" aria-label="${esc(sb.name)}, ${esc(DAY[P.weekday(d)])}: ${esc(full)}${r.taught ? ', taught' : ''}">${esc(text)}</a></td>`;
    };
    return `<section class="side miniweek" aria-label="This week">
      <div class="side-head"><h2>This week</h2><a href="#week/${date}">Open Week</a></div>
      <table><thead><tr><th><span class="vh">Subject</span></th>${dates.map(d => `<th${d === date ? ' class="here"' : ''}><a href="#day/${d}">${DAY[P.weekday(d)]}</a></th>`).join('')}</tr></thead>
      <tbody>${on.map(sb => `<tr style="${colorVars(sb)}"><th title="${esc(sb.name)}"><span class="dot"></span>${esc(sb.name.split(/[\s/]+/)[0])}</th>${dates.map(d => cell(sb, d)).join('')}</tr>`).join('')}</tbody></table>
    </section>`;
  }

  // ---------- the week ----------
  function renderWeek(date) {
    const dates = P.weekOf(date), today = todayIso();
    const st = Object.fromEntries(dates.map(d => [d, P.dayStatus(d, { year: X.year, days: X.days, plan: X.dayPlan[d] })]));
    const on = X.subjects.filter(s => s.on);
    const cell = (sb, d) => {
      const r = X.lesson[d + '|' + sb.id];
      if (!r) return '<span class="muted">—</span>';
      const ttl = P.title(sb, r.pos);
      return `<b>${esc(P.label(sb, r.pos))}</b> ${r.taught ? '<span class="tick" aria-label="taught">✓</span>' : '<span class="muted">planned</span>'}${ttl ? `<span class="t">${esc(ttl)}</span>` : ''}`;
    };
    const head = d => `${DAY[P.weekday(d)]} ${P.parse(d).getMonth() + 1}/${P.parse(d).getDate()}`;
    const grid = `<div class="week-grid"><table><thead><tr><th class="subj"><span class="muted">Subject</span></th>
      ${dates.map(d => `<th${d === today ? ' class="today"' : ''}><a href="#day/${d}">${esc(head(d))}</a>${st[d].school ? (st[d].early ? '<span class="small muted"> · early</span>' : '') : ''}</th>`).join('')}</tr></thead><tbody>
      ${on.map(sb => `<tr style="${colorVars(sb)}"><th class="subj"><span class="subj-chip" style="padding:4px 12px">${esc(sb.name)}</span></th>${dates.map(d => st[d].school
        ? `<td><a class="cell" href="#day/${d}">${cell(sb, d)}</a></td>` : `<td class="off">${esc(st[d].label)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
    const list = `<div class="week-days">${dates.map(d => `<section class="wday"><h2><a href="#day/${d}">${esc(longDate(d))}</a></h2>
      ${st[d].school ? on.map(sb => `<div class="wline" style="${colorVars(sb)}"><span class="s">${esc(sb.name)}</span><span>${cell(sb, d)}</span></div>`).join('') : `<p class="muted">${esc(st[d].label)}</p>`}
      </section>`).join('')}</div>`;
    $('weekView').innerHTML = grid + list;
  }

  // ---------- render ----------
  let queued = false;
  async function render() {
    if (editing) return;
    await index();
    const r = route();
    const isWeek = r.view === 'week';
    $('tabToday').setAttribute('aria-selected', String(!isWeek));
    $('tabWeek').setAttribute('aria-selected', String(isWeek));
    const wk = P.weekOf(r.date);
    const dd = P.parse(r.date);
    $('heading').textContent = isWeek ? `Week of ${MON[P.parse(wk[0]).getMonth()]} ${P.parse(wk[0]).getDate()}` : `${DAY[dd.getDay()]}, ${MON[dd.getMonth()]} ${dd.getDate()}`;
    $('dateLabel').textContent = isWeek ? `${MON[P.parse(wk[0]).getMonth()]} ${P.parse(wk[0]).getDate()} – ${MON[P.parse(wk[4]).getMonth()]} ${P.parse(wk[4]).getDate()}, ${P.parse(wk[4]).getFullYear()}` : String(dd.getFullYear());
    const nothing = !X.subjects.length && !X.blocks.length;
    $('empty').hidden = !nothing;
    $('dayView').hidden = nothing || isWeek;
    $('weekView').hidden = nothing || !isWeek;
    if (!nothing) isWeek ? renderWeek(r.date) : renderDay(r.date);
    renderChip();
  }
  function renderChip() {
    const s = live.status(), c = $('liveChip');
    const [text, cls] = !s.configured ? ['Live sync off', ''] : !s.user ? ['Sign in to sync', 'warn'] : !s.connected ? ['Offline · saved here', 'warn']
      : s.pending ? ['Sending…', ''] : ['Synced', 'ok'];
    c.textContent = text; c.className = 'chip ' + cls;
  }
  const soon = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; render(); }, 50); };
  store.onChange(soon);
  live.onStatus(() => { renderChip(); });
  addEventListener('hashchange', () => render());

  // ---------- actions ----------
  const lessonRec = (sid, date) => X.lesson[date + '|' + sid] || null;
  async function setLesson(sid, date, change) {
    const sb = X.subj[sid];
    const rec = lessonRec(sid, date);
    const base = rec || { id: `les_${date}_${sid}`, type: 'lessonPlan', deletedAt: null, date, subjectId: sid, pos: P.suggest(sb, X.lessons, date), taught: false };
    await store.write([Object.assign({}, base, change(base))], 'a lesson');
  }
  document.addEventListener('click', async e => {
    const el = e.target.closest('button');
    if (!el || !$('dayView').contains(el)) return;
    const date = route().date, d = el.dataset;
    try {
      if (d.step) await setLesson(d.s, date, r => ({ pos: Number(d.step) > 0 ? P.advance(X.subj[d.s], r.pos) : P.retreat(X.subj[d.s], r.pos) }));
      else if (d.taught) await setLesson(d.taught, date, r => ({ taught: !r.taught }));
      else if (d.pick) await setLesson(d.pick, date, () => ({ pos: { text: d.text } }));
      else if (d.focus) { const i = document.querySelector(`[data-free="${CSS.escape(d.focus)}"]`); if (i) { i.focus(); i.select(); } }
      else if (d.flag) {
        const plan = X.dayPlan[date] || { id: 'dayp_' + date, type: 'dayPlan', deletedAt: null, date, saved: true };
        const f = new Set(plan.flags || []);
        f.has(d.flag) ? f.delete(d.flag) : f.add(d.flag);
        await store.write([Object.assign({}, plan, { flags: FLAGS.filter(x => f.has(x)), saved: true })], 'a flag');
      } else if (d.delpnote) {
        const n = X.pnotes.find(x => x.id === d.delpnote);
        if (n && confirm('Delete this private note?')) await store.write([Object.assign({}, n, { deletedAt: new Date().toISOString() })], 'a private note deleted');
      } else if (el.id === 'dayNoteBtn') {
        const plan = X.dayPlan[date] || { id: 'dayp_' + date, type: 'dayPlan', deletedAt: null, date, saved: true };
        editor($('dayNoteHost'), plan.notes || '', text => saveText({ live: Object.assign({}, plan, { saved: true }), field: 'notes', text, about: 'day', where: { date } }), 'Notes for the day');
      } else if (d.lnote) {
        const sid = d.lnote, sb = X.subj[sid];
        const rec = lessonRec(sid, date) || { id: `les_${date}_${sid}`, type: 'lessonPlan', deletedAt: null, date, subjectId: sid, pos: P.suggest(sb, X.lessons, date), taught: false };
        editor(document.querySelector(`[data-lnote-host="${CSS.escape(sid)}"]`), rec.note || '',
          text => saveText({ live: rec, field: 'note', text, about: 'lesson', where: { date, subjectId: sid } }), `Note for ${sb.name}`);
      } else if (d.bnote) {
        const bid = d.bnote, b = X.blocks.find(x => x.id === bid);
        const rec = X.bnote[date + '|' + bid] || { id: `bnote_${date}_${bid}`, type: 'blockNote', deletedAt: null, date, blockId: bid };
        editor(document.querySelector(`[data-bnote-host="${CSS.escape(bid)}"]`), rec.text || '',
          text => saveText({ live: rec, field: 'text', text, about: 'block', where: { date, blockId: bid } }), `Note for ${b ? b.name : 'this block'} today`);
      }
    } catch (err) { problem('Not saved: ' + err.message); }
  });
  // Free-text subjects save when you leave the box.
  document.addEventListener('change', async e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.free) return;
    const sid = el.dataset.free, date = route().date;
    const text = el.value.trim();
    const choice = text ? await nameCheck(text) : 'live';
    if (!choice) { el.focus(); return; }
    if (choice === 'private') {
      await store.write([{ id: rid('pnote'), type: 'privateNote', deletedAt: null, about: 'lesson', date, subjectId: sid, text }], 'a private note');
      el.value = '';
      return;
    }
    await setLesson(sid, date, () => ({ pos: { text } }));
  });

  await render();
  window.__ready = true;
  window.__store = store; window.__live = live; window.__t = t;   // for the browser tests
})();
