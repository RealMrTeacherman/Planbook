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
    contract = c; FLAGS = defs.flags;
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

  const privateList = (list, label) => list.map(n => `<div class="private"><span class="lock">Private · Drive only</span>${esc(n.text)}
    <br><button class="quiet compact" data-delpnote="${esc(n.id)}" aria-label="Delete this private note${label ? ' for ' + esc(label) : ''}">Delete</button></div>`).join('');

  // ---------- the day ----------
  function lessonCard(row, date) {
    const sb = row.subject;
    const rec = X.lesson[date + '|' + sb.id];
    const pos = rec ? rec.pos : P.suggest(sb, X.lessons, date);
    const last = P.lastTaught(X.lessons, sb.id, date);
    const when = row.blocks && row.blocks.length ? `${row.blocks[0].start}` : '';
    const blockLine = row.blocks && row.blocks.length > 1 ? `<div class="blocks">${row.blocks.map(b => `${esc(b.start)} ${esc(b.name)}`).join(' · ')}</div>`
      : row.block && row.block.name !== sb.name ? `<div class="blocks">${esc(row.block.name)}</div>` : '';
    const standing = (row.blocks || []).filter(b => b.note).map(b => `<div class="blocks">${esc(b.note)}</div>`).join('');
    const notes = X.pnotes.filter(n => n.about === 'lesson' && n.date === date && n.subjectId === sb.id);
    const posUI = sb.schema === 'free'
      ? `<div class="pos"><input type="text" maxlength="120" data-free="${esc(sb.id)}" value="${esc(pos.text || '')}" placeholder="What you are teaching" aria-label="${esc(sb.name)}: what you are teaching"></div>`
      : `<div class="pos"><button class="quiet" data-step="-1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: previous">‹</button>
          <span class="label">${esc(P.label(sb, pos))}</span>
          <button class="quiet" data-step="1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: next">›</button></div>`;
    const title = P.title(sb, pos);
    return `<article class="row card" style="--subj:${esc(sb.color || '#10655C')}" data-card="${esc(sb.id)}">
      <div class="card-head"><span class="subj">${esc(sb.name)}</span><span class="when">${esc(when)}</span></div>
      ${blockLine}${posUI}
      ${title ? `<div class="title">${esc(title)}</div>` : ''}
      <div class="title">${rec ? '' : '<span class="tag">Suggested</span>'}${last ? `${sb.schema === 'free' ? 'Last time:' : 'after'} ${esc(P.label(sb, last.pos))} · ${esc(shortDate(last.date))}` : 'starting point'}</div>
      ${standing}
      ${rec && rec.note ? `<div class="lnote">${esc(rec.note)}</div>` : ''}${privateList(notes, sb.name)}
      <div class="card-foot">
        <button class="taught" aria-pressed="${rec && rec.taught ? 'true' : 'false'}" data-taught="${esc(sb.id)}">${rec && rec.taught ? '✓ Taught' : 'Mark taught'}</button>
        <button class="quiet compact" data-lnote="${esc(sb.id)}">${rec && rec.note ? 'Edit note' : 'Add note'}</button>
      </div><div data-lnote-host="${esc(sb.id)}"></div></article>`;
  }
  function plainRow(row, date, continued) {
    const b = row.block;
    const bn = X.bnote[date + '|' + b.id];
    const priv = X.pnotes.filter(n => n.blockId === b.id && ((n.about === 'block' && n.date === date) || (n.about === 'standing' && n.weekday === b.weekday)));
    return `<div class="row ${continued ? 'continued' : 'plain'}">
      <span class="time">${esc(b.start)}</span><span class="name">${esc(b.name)}${continued ? ` <span class="muted">· continues ${esc(row.subject.name)}</span>` : ''}</span>
      ${b.note ? `<span class="standing">${esc(b.note)}</span>` : ''}
      ${bn ? `<span class="bnote">${esc(bn.text)}</span>` : ''}
      ${priv.length ? `<span class="bnote">${privateList(priv, b.name)}</span>` : ''}
      <button class="quiet compact addnote" data-bnote="${esc(b.id)}">${bn ? 'Edit today\'s note' : 'Note for today'}</button>
      <span class="bnote" data-bnote-host="${esc(b.id)}"></span></div>`;
  }
  function renderDay(date) {
    const st = P.dayStatus(date, { year: X.year, days: X.days, plan: X.dayPlan[date] });
    const plan = X.dayPlan[date];
    const flags = new Set((plan && plan.flags) || []);
    const dayPriv = X.pnotes.filter(n => n.about === 'day' && n.date === date);
    $('daySide').innerHTML = `
      ${st.school ? (st.early ? `<div class="banner">${esc(st.label || 'Early release')}</div>` : '') : `<div class="banner off">${esc(st.label)}</div>`}
      <section class="panel"><h2>The day</h2>
        <div class="flags" role="group" aria-label="Flags for the day">${FLAGS.map(f => `<button aria-pressed="${flags.has(f)}" data-flag="${esc(f)}">${esc(f)}</button>`).join('')}</div>
        ${plan && plan.notes ? `<p style="white-space:pre-wrap">${esc(plan.notes)}</p>` : '<p class="small">No notes for this day.</p>'}
        ${privateList(dayPriv, 'the day')}
        <div id="dayNoteHost"><button class="quiet compact" id="dayNoteBtn">${plan && plan.notes ? 'Edit notes' : 'Add notes'}</button></div>
      </section>`;
    const main = $('dayMain');
    if (!st.school) { main.innerHTML = `<p class="small">${st.outside ? 'Outside the school year.' : 'No school this day.'} Use ‹ and › to move to a school day.</p>`; return; }
    const rows = P.dayLayout(X.blocks, X.subjects, P.weekday(date));
    if (!rows.length) { main.innerHTML = `<p class="small">There is no schedule for ${DAY[P.weekday(date)]}days yet. The schedule editor arrives in the next release.</p>`; return; }
    const sched = rows.filter(r => !r.unscheduled), un = rows.filter(r => r.unscheduled);
    main.innerHTML = `<div class="rows">${sched.map(r => r.kind === 'lesson' ? lessonCard(r, date) : plainRow(r, date, r.kind === 'continued')).join('')}</div>
      ${un.length ? `<p class="unsched-head">Not on ${DAY[P.weekday(date)]}'s schedule</p><div class="rows">${un.map(r => lessonCard(r, date)).join('')}</div>` : ''}`;
  }

  // ---------- the week ----------
  function renderWeek(date) {
    const dates = P.weekOf(date);
    const st = Object.fromEntries(dates.map(d => [d, P.dayStatus(d, { year: X.year, days: X.days, plan: X.dayPlan[d] })]));
    const on = X.subjects.filter(s => s.on);
    const cell = (sb, d) => {
      const r = X.lesson[d + '|' + sb.id];
      if (!r) return '<span class="muted">—</span>';
      const ttl = P.title(sb, r.pos);
      return `<b>${esc(P.label(sb, r.pos))}</b> ${r.taught ? '<span class="tick" aria-label="taught">✓</span>' : '<span class="muted">planned</span>'}${ttl ? `<span class="t">${esc(ttl)}</span>` : ''}`;
    };
    const head = d => `${DAY[P.weekday(d)]} ${P.parse(d).getMonth() + 1}/${P.parse(d).getDate()}`;
    const grid = `<div class="week-grid"><table><thead><tr><th class="subj" style="border-left-color:transparent">Subject</th>
      ${dates.map(d => `<th><a href="#day/${d}">${esc(head(d))}</a>${st[d].school ? (st[d].early ? '<span class="small muted"> · early</span>' : '') : ''}</th>`).join('')}</tr></thead><tbody>
      ${on.map(sb => `<tr><th class="subj" style="--subj:${esc(sb.color || '#10655C')}">${esc(sb.name)}</th>${dates.map(d => st[d].school
        ? `<td><a class="cell" href="#day/${d}">${cell(sb, d)}</a></td>` : `<td class="off">${esc(st[d].label)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
    const list = `<div class="week-days">${dates.map(d => `<section class="panel wday"><h2><a href="#day/${d}">${esc(longDate(d))}</a></h2>
      ${st[d].school ? on.map(sb => `<div class="wline"><span class="s">${esc(sb.name)}</span><span>${cell(sb, d)}</span></div>`).join('') : `<p class="muted">${esc(st[d].label)}</p>`}
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
    $('dateLabel').textContent = isWeek ? `${MON[P.parse(wk[0]).getMonth()]} ${P.parse(wk[0]).getDate()} – ${MON[P.parse(wk[4]).getMonth()]} ${P.parse(wk[4]).getDate()}, ${P.parse(wk[4]).getFullYear()}` : longDate(r.date);
    $('heading').textContent = isWeek ? 'Week' : 'Day';
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
