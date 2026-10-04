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
  let store, live, contract, t, FLAGS, D, REVEAL_DATA, WORDING;
  try {
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u} did not load`); return r.json(); });
    const [c, reveal, bench, cal, defs, fw] = await Promise.all([get('../contract/contract.json'), get('../data/reveal-grade2.json'),
      get('../data/benchmark-grade2.json'), get('../data/calendar-2026-27.json'), get('../data/planner-defaults.json'), get('../data/family-email.json')]);
    contract = c; FLAGS = defs.flags; D = defs; REVEAL_DATA = reveal; WORDING = fw;
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
  let X = null, ALL = [];
  async function index() {
    const all = (await store.all()).filter(r => !r.deletedAt);
    ALL = all;
    const by = type => all.filter(r => r.type === type);
    const map = (list, key) => Object.fromEntries(list.map(r => [key(r), r]));
    const subjects = by('subject').sort((a, b) => a.order - b.order);
    const lessons = by('lessonPlan');
    X = {
      subjects, subj: map(subjects, r => r.id), blocks: by('block'), lessons,
      lesson: map(lessons, r => r.date + '|' + r.subjectId), dayPlan: map(by('dayPlan'), r => r.date),
      bnote: map(by('blockNote'), r => r.date + '|' + r.blockId), days: map(by('schoolDay'), r => r.date),
      year: by('schoolYear').sort((a, b) => a.firstDay < b.firstDay ? 1 : -1)[0] || null,
      pnotes: by('privateNote'), students: by('student'), periods: map(by('gradingPeriod'), r => r.id), family: map(by('familyWeek'), r => r.id)
    };
  }

  // ---------- routing ----------
  function route() {
    const m = /^#(day|week|settings|family)\/(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
    return m ? { view: m[1], date: m[2] } : { view: 'day', date: todayIso() };
  }
  const go = (view, date) => { location.hash = `#${view}/${date}`; };
  function step(dir) {
    const r = route();
    if (r.view === 'week' || r.view === 'family') return go(r.view, P.addDays(r.date, 7 * dir));
    let d = P.addDays(r.date, dir);
    while ([0, 6].includes(P.weekday(d))) d = P.addDays(d, dir);
    go('day', d);
  }
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('todayBtn').onclick = () => go(route().view, todayIso());
  $('tabToday').onclick = () => go('day', route().date);
  $('tabWeek').onclick = () => go('week', route().date);
  $('tabSettings').onclick = () => go('settings', route().date);

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
  // "The guide has you in Unit 2 today": the pacing guide against this year's calendar.
  function paceLine(sb, pos, date) {
    if (!P.revealOn(sb)) return '';
    const days = P.mathDays({ year: X.year, days: X.days, plans: X.dayPlan, blocks: X.blocks, subjectId: sb.id });
    const expect = P.unitOnDate(P.revealPlan(days), date);
    if (!expect) return '';
    return Number(pos.unit) === expect ? ' · on pace with the guide' : ` · the guide has you in Unit ${expect} by now`;
  }
  // ---------- the Agenda look (chosen per device) ----------
  const LOOK = () => { try { return localStorage.getItem('planbook.look') === 'agenda' ? 'agenda' : 'blocks'; } catch (e) { return 'blocks'; } };
  let selSubj = null;
  const wide = () => matchMedia('(min-width: 900px)').matches;
  matchMedia('(min-width: 900px)').addEventListener('change', () => { if (LOOK() === 'agenda') render(); });
  function agendaRow(r, date, nested) {
    const sb = r.subject, rec = X.lesson[date + '|' + sb.id];
    const pos = rec ? rec.pos : P.suggest(sb, X.lessons, date);
    const t = P.title(sb, pos);   // free text already shows in the position slot
    const sel = selSubj === sb.id;
    const stepUI = sb.schema === 'free'
      ? `<span class="apos">${esc(pos.text || '—')}</span>`
      : `<span class="asteps"><button class="ast" data-step="-1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: previous">${SVG.prev}</button><span class="apos">${esc(P.label(sb, pos))}</span><button class="ast" data-step="1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: next">${SVG.next}</button></span>`;
    const time = r.blocks && r.blocks.length ? r.blocks[0].start : '';
    return `<div class="arow${sel ? ' sel' : ''}${nested ? ' nested' : ''}" style="${colorVars(sb)}" data-arow="${esc(sb.id)}">
      <span class="atime">${esc(time)}</span><span class="adot"></span>
      <button class="aname" data-sel="${esc(sb.id)}" aria-expanded="${sel}" aria-label="${esc(sb.name)}: ${sel ? 'hide' : 'show'} details">${esc(sb.name)}</button>
      ${stepUI}<span class="atitle">${esc(rec ? '' : (sb.schema === 'free' ? '' : 'Suggested · '))}${esc(t)}</span>
      <button class="acheck" aria-pressed="${rec && rec.taught ? 'true' : 'false'}" data-taught="${esc(sb.id)}" aria-label="${esc(sb.name)}: ${rec && rec.taught ? 'taught' : 'mark taught'}">${rec && rec.taught ? SVG.check : ''}</button></div>`;
  }
  function renderAgenda(date, sched, un) {
    const lessons = sched.filter(r => r.kind === 'lesson');
    const all = [...lessons, ...lessons.flatMap(r => r.children || []), ...un];
    if (!all.some(r => r.subject.id === selSubj)) selSubj = wide() && lessons[0] ? lessons[0].subject.id : (all.some(r => r.subject.id === selSubj) ? selSubj : null);
    const detail = r => lessonCard(Object.assign({}, r, { children: [] }), date);
    const findRow = id => all.find(r => r.subject.id === id);
    const line = r => {
      if (r.kind !== 'lesson') return `<div class="aplain"><span class="atime">${esc(r.block.start)}</span><span class="aname-plain">${esc(r.block.name)}</span>${r.block.note ? `<span class="anote">${esc(r.block.note)}</span>` : ''}</div>`;
      // A subject shown inside this one (Phonics in Reading) keeps its place in time, indented.
      const first = x => (x.blocks && x.blocks[0] ? P.mins(x.blocks[0].start) : 1e9);
      const rowsHtml = [r, ...(r.children || [])].sort((a, b) => first(a) - first(b)).map(x => agendaRow(x, date, x !== r)).join('');
      // On the phone the chosen lesson opens in place, under its row.
      const open = !wide() && [r, ...(r.children || [])].find(x => x.subject.id === selSubj);
      return rowsHtml + (open ? `<div class="ainline">${detail(open)}</div>` : '');
    };
    $('dayMain').innerHTML = `<div class="agenda">${sched.map(line).join('')}</div>
      ${un.length ? `<details class="unsched"><summary><span class="unsched-title">Not on ${DAY[P.weekday(date)]}'s schedule</span>
        <span class="unsched-names">${un.map(r => esc(r.subject.name)).join(' · ')}</span></summary><div class="agenda">${un.map(line).join('')}</div></details>` : ''}`;
    // On the MacBook the chosen lesson's full card sits beside the list, above the day.
    const pick = selSubj && findRow(selSubj);
    if (wide() && pick) $('daySide').insertAdjacentHTML('afterbegin', `<div class="apane">${detail(pick)}</div>`);
    if (wide()) document.querySelectorAll('.apane .cur details').forEach(d => { d.open = true; });
  }
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

  function lessonCard(row, date, nested) {
    const sb = row.subject;
    const rec = X.lesson[date + '|' + sb.id];
    const pos = rec ? rec.pos : P.suggest(sb, X.lessons, date);
    const last = P.lastTaught(X.lessons, sb.id, date);
    const bl = row.blocks || [];
    // With a subject shown inside it (Phonics in Reading), the chip spans both.
    const span = [...bl, ...(row.children || []).flatMap(c => c.blocks || [])].sort(P.byTime);
    const lastEnd = span.length ? span.map(b => ENDS[b.id] || '').filter(Boolean).sort((a, b) => P.mins(a) - P.mins(b)).pop() || '' : '';
    const when = span.length ? (lastEnd ? `${span[0].start}–${lastEnd}` : span[0].start) : '';
    const notes = X.pnotes.filter(n => n.about === 'lesson' && n.date === date && n.subjectId === sb.id);
    const free = sb.schema === 'free';
    const picks = (sb.picks && sb.picks.length ? sb.picks : null) || PICKS()[sb.id];
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
      : `<div class="pos"><button class="labelbtn" data-jump="${esc(sb.id)}" aria-label="${esc(sb.name)}: ${esc(P.label(sb, pos))}. Jump to a lesson"><span class="label">${esc(P.label(sb, pos))}</span></button>
          <button class="prev" data-step="-1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: previous">${SVG.prev}</button>
          <button class="next" data-step="1" data-s="${esc(sb.id)}" aria-label="${esc(sb.name)}: next">${SVG.next}</button></div>`;
    const title = P.title(sb, pos);
    const d = P.detail(sb, pos);
    const kids = (row.children || []).map(c => lessonCard(c, date, true)).join('');
    const tag = nested ? 'section class="subsec"' : 'article class="tile"';
    return `<${tag} style="${colorVars(sb)}" data-card="${esc(sb.id)}"${nested ? ` aria-label="${esc(sb.name)}"` : ''}>
      <div class="tile-head"><span class="subj-chip">${when ? `<span class="t">${esc(when)}</span>` : ''}${esc(sb.name)}</span>${rec || free ? '' : '<span class="tag">Suggested</span>'}</div>
      ${kids}
      ${head}
      ${picks ? `<div class="picks" role="group" aria-label="What ${esc(sb.name)} is today">${picks.map(p => `<button aria-pressed="${pos.text === p}" data-pick="${esc(sb.id)}" data-text="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
      ${title && !(d && d.kind === 'benchmark') ? `<div class="ttl">${esc(title)}</div>` : ''}
      ${d && d.kind === 'benchmark' ? `<div class="ttl">${esc(d.unit)}</div><div class="hint"><i>${esc(d.question)}</i></div><div class="hint">Benchmark plans by the week, so this is all of week ${d.week}${d.project ? ` · unit project: ${esc(d.project)}` : ''} · standards are mapped from the skill names</div>` : ''}
      ${d && d.kind === 'reveal' ? `<div class="hint">${esc(d.unit)}${paceLine(sb, pos, date)}</div>` : ''}
      ${where ? `<div class="hint">${esc(where)}</div>` : ''}
      ${blockLines.length ? `<ul class="blk" aria-label="${esc(sb.name)} blocks">${blockLines.join('')}</ul>` : ''}
      ${curriculum(sb, pos)}
      ${rec && rec.note ? `<div class="lnote">${esc(rec.note)}</div>` : ''}${privateList(notes, sb.name)}
      <div class="tile-foot">
        <button class="taught" aria-pressed="${rec && rec.taught ? 'true' : 'false'}" data-taught="${esc(sb.id)}">${rec && rec.taught ? SVG.check + ' Taught' : 'Mark taught'}</button>
        <button class="soft" data-lnote="${esc(sb.id)}">${rec && rec.note ? 'Edit note' : 'Add note'}</button>
      </div><div data-lnote-host="${esc(sb.id)}"></div></${nested ? 'section' : 'article'}>`;
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
    // A subject shown inside another (Phonics inside Reading) joins that card, which sits at the earlier of the two.
    const parentRow = {};
    rows.forEach(r => { if (r.kind === 'lesson' && !r.unscheduled) parentRow[r.subject.id] = r; });
    const inside = r => r.kind === 'lesson' && r.subject.within && parentRow[r.subject.within] && parentRow[r.subject.within] !== r;
    rows.forEach(r => { r.children = []; });
    rows.forEach(r => { if (inside(r)) parentRow[r.subject.within].children.push(r); });
    const placed = new Set(), ordered = [];
    rows.forEach(r => {
      if (r.kind === 'continued' || r.unscheduled) return;
      const p = inside(r) ? parentRow[r.subject.within] : r;
      if (p.kind === 'lesson') { if (!placed.has(p)) { placed.add(p); ordered.push(p); } }
      else ordered.push(p);
    });
    const sched = ordered, un = rows.filter(r => r.unscheduled && !inside(r));
    if (LOOK() === 'agenda') { renderAgenda(date, sched, un); $('daySide').insertAdjacentHTML('beforeend', miniWeek(date)); return; }
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
    $('weekView').innerHTML = `<div class="week-actions"><button data-famopen="${esc(FAM.defaultWeek(date, todayIso()))}">Family email</button>
      <span class="small">The coming week in families’ words, ready to edit and paste.</span></div>` + grid + list;
  }

  // ---------- settings ----------
  const PALETTE = ['#5E8C3A', '#16706B', '#7A4A6B', '#D89A1C', '#C8511C', '#45607C', '#7B3A93', '#A63D63', '#3D4FB0', '#2F7D4E', '#0E7490', '#8B5A2B'];
  const WD_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WD_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  let setDow = null;
  const fld = (rec, f, kind, value, label, extra = '') => `<label class="sf"><span>${esc(label)}</span><input type="${kind === 'date' ? 'date' : kind === 'int' ? 'number' : 'text'}" data-rec="${esc(rec.id)}" data-f="${f}" data-kind="${kind}" value="${esc(value == null ? '' : value)}" ${extra}></label>`;

  function renderSettings(date) {
    if (setDow == null) { const w = P.weekday(date); setDow = w >= 1 && w <= 5 ? w : 1; }
    const subjOpts = sel => `<option value="">No subject</option>${X.subjects.map(s => `<option value="${esc(s.id)}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}`;
    const blocks = X.blocks.filter(b => b.weekday === setDow).sort(P.byTime);
    const sched = `<section class="side sset" aria-labelledby="hSched"><div class="side-head"><h2 id="hSched">Schedule</h2></div>
      <div class="flags" role="group" aria-label="Weekday">${[1, 2, 3, 4, 5].map(w => `<button aria-pressed="${w === setDow}" data-dow="${w}">${WD_NAMES[w]}</button>`).join('')}</div>
      <div class="srows">${blocks.map(b => {
        const priv = X.pnotes.filter(n => n.about === 'standing' && n.blockId === b.id);
        return `<div class="srow" data-blk="${esc(b.id)}">
          ${fld(b, 'start', 'time', b.start, 'Time', 'inputmode="numeric" maxlength="5" class="t"')}
          ${fld(b, 'name', 'text', b.name, 'Block', 'maxlength="60"')}
          <label class="sf"><span>Subject</span><select data-rec="${esc(b.id)}" data-f="subjectId" data-kind="ref">${subjOpts(b.subjectId)}</select></label>
          ${fld(b, 'note', 'text', b.note || '', 'Standing note', 'maxlength="300"')}
          <button class="quiet compact del" data-delblk="${esc(b.id)}" aria-label="Delete ${esc(b.start)} ${esc(b.name)}">Delete</button>
          ${priv.length ? `<div class="spriv">${privateList(priv, b.name)}</div>` : ''}</div>`;
      }).join('') || `<p class="small">No blocks on ${WD_NAMES[setDow]} yet.</p>`}</div>
      <div class="tile-foot"><button data-addblk="1">Add a block</button>
        <label class="sf inline"><span>Copy from</span><select id="copyFrom">${[1, 2, 3, 4, 5].filter(w => w !== setDow).map(w => `<option value="${w}">${WD_NAMES[w]}</option>`).join('')}</select></label>
        <button class="quiet" data-copyday="1">Copy that day here</button></div></section>`;

    const subjects = `<section class="side sset" aria-labelledby="hSubj"><div class="side-head"><h2 id="hSubj">Subjects</h2></div>
      <div class="scards">${X.subjects.map(s => `<div class="tile scard" style="${colorVars(s)}" data-subj="${esc(s.id)}">
        <div class="tile-head"><span class="subj-chip">${esc(s.name)}</span>
          <label class="check"><input type="checkbox" data-rec="${esc(s.id)}" data-f="on" data-kind="bool"${s.on ? ' checked' : ''}> On the planner</label></div>
        <div class="sgrid">${fld(s, 'name', 'text', s.name, 'Name', 'maxlength="40"')}${fld(s, 'curriculum', 'text', s.curriculum || '', 'Curriculum', 'maxlength="60"')}
          <label class="sf"><span>Counted by</span><select data-rec="${esc(s.id)}" data-f="schema" data-kind="enum">${[['uwd', 'Unit · week · day'], ['ul', 'Unit · lesson'], ['l', 'Lesson'], ['free', 'Free text']].map(([v, l]) => `<option value="${v}"${s.schema === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          ${s.schema === 'uwd' ? fld(s, 'weeksPerUnit', 'int', s.weeksPerUnit || 3, 'Weeks per unit', 'min="1" max="20"') + fld(s, 'daysPerWeek', 'int', s.daysPerWeek || 5, 'Days per week', 'min="1" max="7"') : ''}
          ${s.schema === 'ul' ? fld(s, 'lessonsPerUnit', 'int', s.lessonsPerUnit || 10, 'Lessons per unit', 'min="1" max="60"') : ''}
          ${s.schema === 'free' ? fld(s, 'picks', 'picks', (s.picks || PICKS()[s.id] || []).join(', '), 'Quick picks (commas between)', 'maxlength="400"') : ''}</div>
        ${s.schema === 'ul' ? `<label class="check"><input type="checkbox" data-rec="${esc(s.id)}" data-f="pacing" data-kind="bool"${s.pacing ? ' checked' : ''}> Follows the Reveal Math pacing guide</label>` : ''}
        ${s.schema === 'uwd' ? `<label class="check"><input type="checkbox" data-rec="${esc(s.id)}" data-f="benchmark" data-kind="bool"${s.benchmark ? ' checked' : ''}> Follows Benchmark Advance</label>` : ''}
        <div class="swatches" role="radiogroup" aria-label="${esc(s.name)} color">${PALETTE.map(c => `<button role="radio" aria-checked="${(s.color || '').toLowerCase() === c.toLowerCase()}" data-color="${c}" data-s="${esc(s.id)}" style="background:${deep(c)}" aria-label="Color ${c}"></button>`).join('')}</div>
      </div>`).join('')}</div>
      <div class="tile-foot"><button data-addsubj="1">Add a subject</button></div></section>`;

    const yr = X.year;
    const offs = Object.values(X.days).filter(d => d.kind === 'noSchool' && !d.deletedAt).sort((a, b) => a.date < b.date ? -1 : 1);
    const periods = Object.values(X.periods || {}).sort((a, b) => a.start < b.start ? -1 : 1);
    const cal = `<section class="side sset" aria-labelledby="hCal"><div class="side-head"><h2 id="hCal">Calendar</h2></div>
      ${yr ? `<div class="sgrid">${fld(yr, 'firstDay', 'date', yr.firstDay, 'First day')}${fld(yr, 'lastDay', 'date', yr.lastDay, 'Last day')}
        <label class="sf"><span>Early release</span><select data-rec="${esc(yr.id)}" data-f="earlyReleaseWeekday" data-kind="enum-null"><option value="">None</option>${[1, 2, 3, 4, 5].map(w => `<option value="${WD_KEYS[w]}"${yr.earlyReleaseWeekday === WD_KEYS[w] ? ' selected' : ''}>Every ${WD_NAMES[w]}</option>`).join('')}</select></label></div>` : '<p class="small">No school year yet.</p>'}
      <h3>Grading periods</h3>
      <div class="sgrid three">${periods.map(g => fld(g, 'name', 'text', g.name, 'Name', 'maxlength="30"') + fld(g, 'start', 'date', g.start, 'Starts') + fld(g, 'end', 'date', g.end, 'Ends')).join('')}</div>
      <h3>Days off</h3>
      <div class="offs">${offs.map(d => `<div class="off"><span class="od">${esc(longDate(d.date))}</span>
        <input type="text" aria-label="Name for ${esc(longDate(d.date))}" data-rec="${esc(d.id)}" data-f="label" data-kind="text" value="${esc(d.label || '')}" maxlength="60">
        <button class="quiet compact" data-deloff="${esc(d.id)}" aria-label="Remove the day off on ${esc(longDate(d.date))}">Remove</button></div>`).join('')}</div>
      <div class="tile-foot"><label class="sf inline"><span>Date</span><input type="date" id="offDate"></label>
        <label class="sf inline"><span>Name</span><input type="text" id="offLabel" maxlength="60" placeholder="e.g. Teacher work day"></label>
        <button data-addoff="1">Add a day off</button></div></section>`;

    // Reveal: where the guide lands on this calendar, beside what was taught.
    const math = X.subjects.find(s => P.revealOn(s));
    let pace = '';
    if (math) {
      const days = P.mathDays({ year: yr, days: X.days, plans: X.dayPlan, blocks: X.blocks, subjectId: math.id });
      const pl = P.revealPlan(days), act = P.revealActuals(X.lessons, math.id);
      const expect = P.unitOnDate(pl, date);
      const fmtD = d => d ? `${MON[P.parse(d).getMonth()]} ${P.parse(d).getDate()}` : '';
      pace = `<section class="side sset" aria-labelledby="hPace"><div class="side-head"><h2 id="hPace">Reveal Math · the year</h2></div>
        <p class="small">${days.length} school days this year have a ${esc(math.name)} block; the guide uses ${P.revealTotal()}.${expect ? ` By the calendar the guide has you in Unit ${expect} on ${esc(longDate(date))}.` : ''}</p>
        <div class="tablewrap"><table class="pace"><thead><tr><th>Unit</th><th class="n">Days</th><th>The guide, on this calendar</th><th>Taught</th></tr></thead><tbody>
        ${pl.map(r => { const a = act[r.u]; return `<tr${r.u === expect ? ' class="here"' : ''}><td><b>${r.u}</b> ${esc(r.title)}</td><td class="n">${r.days}</td>
          <td>${r.from ? `${fmtD(r.from)}–${fmtD(r.to)}${r.short ? ' (runs out)' : ''}` : 'not on the calendar'}</td>
          <td>${a ? `${fmtD(a.from)}–${fmtD(a.to)} · ${a.n} ${a.n === 1 ? 'day' : 'days'}` : '—'}</td></tr>`; }).join('')}</tbody></table></div></section>`;
    }
    const look = `<section class="side sset" aria-labelledby="hLook"><div class="side-head"><h2 id="hLook">Look on this device</h2></div>
      <p class="small">Each device keeps its own. Everything else is the same either way.</p>
      <div class="flags" role="radiogroup" aria-label="Look">${[['blocks', 'Color blocks'], ['agenda', 'Agenda']].map(([v, l]) => `<button role="radio" aria-checked="${LOOK() === v}" aria-pressed="${LOOK() === v}" data-look="${v}">${l}</button>`).join('')}</div></section>`;
    $('settingsView').innerHTML = `<div class="settings">${look}${sched}${subjects}${cal}${pace}</div>`;
  }

  // Settings edits: one handler for every field, each change written at once (and synced live).
  async function settingsChange(el) {
    const rec = (await store.all()).find(r => r.id === el.dataset.rec);
    if (!rec) return;
    const f = el.dataset.f, kind = el.dataset.kind;
    let v = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (kind === 'int') v = Math.max(1, parseInt(v, 10) || 1);
    if (kind === 'ref' || kind === 'enum-null') v = v || null;
    if (kind === 'picks') v = v.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);
    if (kind === 'time' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) { problem('A time looks like 9:15 or 12:40.'); render(); return; }
    const next = Object.assign({}, rec, { [f]: v });
    if (kind === 'text' && !v && f === 'note') delete next.note;
    if (kind === 'text' && !v && f === 'label') delete next.label;
    if ((f === 'note' || f === 'name' || f === 'label') && v) {
      const choice = await nameCheck(v);
      if (!choice) { el.focus(); return; }
      if (choice === 'private') {
        if (f !== 'note' || rec.type !== 'block') { problem('Only a standing note can be kept private; rename this without the name.'); render(); return; }
        delete next.note;
        await store.write([next, { id: rid('pnote'), type: 'privateNote', deletedAt: null, about: 'standing', weekday: rec.weekday, blockId: rec.id, text: v }], 'a private standing note');
        return;
      }
    }
    try { problem(''); await store.write([next], 'a setting'); }
    catch (e) { problem('Not saved: ' + e.message); render(); }
  }
  document.addEventListener('change', e => { if ($('settingsView').contains(e.target) && e.target.dataset.rec) settingsChange(e.target); });
  $('settingsView').addEventListener('focusout', () => setTimeout(() => { if (renderLater) render(); }, 0));

  async function settingsClick(el) {
    const d = el.dataset, all = await store.all();
    const now = () => new Date().toISOString();
    if (d.dow) { setDow = Number(d.dow); render(); return; }
    if (d.look) {
      try { localStorage.setItem('planbook.look', d.look); } catch (e) { }
      document.documentElement.classList.toggle('look-agenda', d.look === 'agenda');
      render(); return;
    }
    if (d.addblk) {
      const mine = X.blocks.filter(b => b.weekday === setDow).sort(P.byTime);
      const last = mine[mine.length - 1];
      let start = '8:00';
      if (last) { const m = P.mins(last.start) + 15, h = Math.floor(m / 60), h12 = h > 12 ? h - 12 : h; start = `${h12}:${String(m % 60).padStart(2, '0')}`; }
      await store.write([{ id: rid('blk'), type: 'block', deletedAt: null, weekday: setDow, start, name: 'New block', subjectId: null }], 'a new block');
    } else if (d.delblk) {
      const b = all.find(r => r.id === d.delblk);
      if (b && confirm(`Delete ${b.start} ${b.name} from every ${WD_NAMES[b.weekday]}?`)) await store.write([Object.assign({}, b, { deletedAt: now() })], 'a block deleted');
    } else if (d.copyday) {
      const from = Number($('copyFrom').value);
      const src = X.blocks.filter(b => b.weekday === from), old = X.blocks.filter(b => b.weekday === setDow);
      if (!confirm(`Replace ${WD_NAMES[setDow]}'s ${old.length} blocks with a copy of ${WD_NAMES[from]}'s ${src.length}?`)) return;
      await store.write([...old.map(b => Object.assign({}, b, { deletedAt: now() })),
        ...src.map(b => Object.assign({}, b, { id: rid('blk'), weekday: setDow, deletedAt: null }))], 'a day copied');
    } else if (d.color) {
      const s = all.find(r => r.id === d.s);
      await store.write([Object.assign({}, s, { color: d.color })], 'a color');
    } else if (d.addsubj) {
      await store.write([{ id: rid('subj'), type: 'subject', deletedAt: null, name: 'New subject', schema: 'free', on: true, order: X.subjects.length, start: { text: '' }, color: PALETTE[X.subjects.length % PALETTE.length] }], 'a new subject');
    } else if (d.addoff) {
      const date = $('offDate').value, label = $('offLabel').value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { problem('Choose a date for the day off.'); return; }
      const rec = { id: 'sday_' + date, type: 'schoolDay', deletedAt: null, date, kind: 'noSchool' };
      if (label) {
        const choice = await nameCheck(label);
        if (choice !== 'live') { if (choice === 'private') problem('A day off\'s name syncs live; name it without the child.'); return; }
        rec.label = label;
      }
      await store.write([rec], 'a day off');
    } else if (d.deloff) {
      const r = all.find(x => x.id === d.deloff);
      await store.write([Object.assign({}, r, { deletedAt: now() })], 'a day off removed');
    } else return;
    problem('');
  }

  // Jump straight to a lesson instead of stepping there.
  async function jump(sid, date) {
    const sb = X.subj[sid];
    const rec = X.lesson[date + '|' + sid];
    const pos = rec ? rec.pos : P.suggest(sb, X.lessons, date);
    const num = (k, l, v, max) => `<label class="sf"><span>${l}</span><input type="number" min="1" max="${max}" data-j="${k}" value="${v || 1}"></label>`;
    let body;
    if (P.revealOn(sb)) {
      const steps = P.revealSteps();
      const units = [...new Set(steps.map(s => s.unit))];
      body = `<label class="sf"><span>${esc(sb.name)}</span><select id="jumpSel">${units.map(u => `<optgroup label="Unit ${u}">${steps.filter(s => s.unit === u).map((s, i) =>
        `<option value='${esc(JSON.stringify(s.pos))}'${P.samePos(s.pos, pos) ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
    } else if (sb.schema === 'uwd') body = `<div class="sgrid three">${num('unit', 'Unit', pos.unit, 50)}${num('week', 'Week', pos.week, 20)}${num('day', 'Day', pos.day, 7)}</div>`;
    else if (sb.schema === 'ul') body = `<div class="sgrid">${num('unit', 'Unit', pos.unit, 50)}${num('lesson', 'Lesson', pos.lesson, 60)}</div>`;
    else if (sb.schema === 'l') body = `<div class="sgrid">${num('lesson', 'Lesson', pos.lesson, 60)}</div>`;
    else return;
    $('jumpTitle').textContent = `${sb.name}: jump to a lesson`;
    $('jumpBody').innerHTML = body;
    const dlg = $('jumpDialog');
    dlg.returnValue = '';
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'go') return;
      let next;
      if (P.revealOn(sb)) next = JSON.parse($('jumpSel').value);
      else { next = {}; dlg.querySelectorAll('[data-j]').forEach(i => { next[i.dataset.j] = Math.max(1, parseInt(i.value, 10) || 1); }); }
      try { await setLesson(sid, date, () => ({ pos: next })); } catch (e) { problem('Not saved: ' + e.message); }
    };
    dlg.showModal();
  }

  // ---------- render ----------
  let queued = false;
  // ---------- the family email ----------
  const FAM = SuiteFamily;
  let famShown = null, famEdited = false;
  function renderFamily(date) {
    const mon = P.weekOf(date)[0];
    // Once the email has been edited by hand, a change arriving from elsewhere never rebuilds it.
    if (famShown === mon && famEdited) return;
    const r = FAM.build(FAM.collect(ALL, REVEAL_DATA, WORDING), mon);
    const fam = (X.family || {})[r.familyId] || {};
    famShown = mon; famEdited = false;
    $('dateLabel').textContent = `${FAM.mdy(r.from)} – ${FAM.mdy(r.to)}`;
    $('famView').innerHTML = `<div class="fam">
      <section class="side fam-tools">
        <p class="small"><a href="#week/${mon}">‹ Back to the week</a></p>
        ${r.goalOpts.length ? `<h2>Reading goal</h2><p class="small">Pick the one most useful for families to practise at home.</p>
          <div class="goals" role="radiogroup" aria-label="Reading goal">${r.goalOpts.map(o => `<label class="goal"><input type="radio" name="famgoal" value="${esc(o.src)}"${r.goal && r.goal.src === o.src ? ' checked' : ''}> <span>${esc(o.t)}</span></label>`).join('')}</div>` : ''}
        <h2>Spelling words</h2>
        <label class="sf"><span>This week’s list, one per line or with commas</span><textarea id="famSpell" rows="4">${esc(fam.spelling || '')}</textarea></label>
        <p class="small">${/^bm:/.test(r.spellKey) ? `Kept with Benchmark Unit ${esc(r.spellKey.slice(3).replace('|', ', Week '))}, so it’s here next year too. ` : ''}Built from the planner, Reveal and Benchmark. Your day notes are never included.</p>
      </section>
      <section class="side fam-mail"><div class="side-head"><h2>Edit anything before you copy</h2><button id="famCopy" class="compact">Copy the email</button></div>
        <p class="small" id="famCopied" role="status"></p>
        <div class="fam-prev" id="famPrev" contenteditable="true" spellcheck="true" aria-label="The family email">${FAM.html(r)}</div></section></div>`;
    $('famPrev').addEventListener('input', () => { famEdited = true; });
    $('famView').dataset.familyId = r.familyId; $('famView').dataset.key = r.spellKey;
  }
  async function saveFamily(change) {
    const id = $('famView').dataset.familyId, key = $('famView').dataset.key;
    const cur = (await store.all()).find(x => x.id === id) || { id, type: 'familyWeek', deletedAt: null, key };
    const next = Object.assign({}, cur, change, { deletedAt: null });
    Object.keys(change).forEach(k => { if (!change[k]) delete next[k]; });
    await store.write([next], 'the family email');
  }
  // Put a new goal or spelling list into the email without rebuilding it, so hand edits are kept (as v95 did).
  function patchFam(sel, text, headId) {
    const prev = $('famPrev');
    let li = prev.querySelector(sel);
    if (li) { if (text) li.textContent = text; else li.remove(); return; }
    if (!text) return;
    let head = prev.querySelector(`[data-fam-head="${headId}"]`), ul = head && head.nextElementSibling && head.nextElementSibling.tagName === 'UL' ? head.nextElementSibling : null;
    if (!ul) {
      head = document.createElement('p'); head.dataset.famHead = headId; head.innerHTML = `<b>${headId === 'phonics' ? 'Phonics' : 'Reading'}</b>`;
      ul = document.createElement('ul');
      const before = prev.querySelector('[data-fam-head="writing"], [data-fam-close]');
      before ? (prev.insertBefore(head, before), prev.insertBefore(ul, before)) : (prev.appendChild(head), prev.appendChild(ul));
    }
    li = document.createElement('li'); li.setAttribute(sel.slice(1, -1), ''); li.textContent = text; ul.appendChild(li);
  }
  document.addEventListener('change', async e => {
    if (!$('famView').contains(e.target)) return;
    try {
      if (e.target.name === 'famgoal') {
        await saveFamily({ goal: e.target.value });
        patchFam('[data-fam-goal]', e.target.nextElementSibling.textContent.trim(), 'reading');
      } else if (e.target.id === 'famSpell') {
        const v = e.target.value;
        if (v.trim() && (await nameCheck(v)) !== 'live') { problem('Spelling lists sync live; take the name out first.'); return; }
        await saveFamily({ spelling: v });
        const words = SuiteFamilyV95.parseSpelling(v);
        patchFam('[data-fam-spell]', words.length ? SuiteFamilyV95.spellLine(words) : '', 'phonics');
      }
      famEdited = true;
    } catch (err) { problem('Not saved: ' + err.message); }
  });
  // Copy as formatted text (so it pastes as a bulleted list) with a plain-text copy beside it.
  function famText(el) {
    const t = [];
    [...el.children].forEach(n => {
      if (n.tagName === 'UL') [...n.children].forEach(li => t.push('• ' + li.textContent.trim()));
      else { if (t.length) t.push(''); t.push(n.textContent.trim()); }
    });
    return t.join('\n');
  }
  async function famCopy() {
    const el = $('famPrev'), html = el.innerHTML, text = famText(el);
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      } else await navigator.clipboard.writeText(text);
      $('famCopied').textContent = 'Copied. Paste it into your email.';
    } catch (e) { $('famCopied').textContent = 'Copying was blocked here; select the email and copy it instead.'; }
    window.__famLastCopy = { html, text };
  }

  let renderLater = false;
  async function render() {
    if (editing) return;
    // Never redraw Settings under a field being typed in; redraw when it is left.
    const a = document.activeElement;
    if (route().view === 'settings' && a && $('settingsView').contains(a) && a.matches('input, select')) { renderLater = true; return; }
    renderLater = false;
    await index();
    const r = route();
    const isWeek = r.view === 'week', isSet = r.view === 'settings';
    $('tabToday').setAttribute('aria-selected', String(r.view === 'day'));
    $('tabWeek').setAttribute('aria-selected', String(isWeek || r.view === 'family'));
    $('tabSettings').setAttribute('aria-selected', String(isSet));
    const wk = P.weekOf(r.date);
    const dd = P.parse(r.date);
    $('heading').textContent = isWeek ? `Week of ${MON[P.parse(wk[0]).getMonth()]} ${P.parse(wk[0]).getDate()}` : `${DAY[dd.getDay()]}, ${MON[dd.getMonth()]} ${dd.getDate()}`;
    $('dateLabel').textContent = isWeek ? `${MON[P.parse(wk[0]).getMonth()]} ${P.parse(wk[0]).getDate()} – ${MON[P.parse(wk[4]).getMonth()]} ${P.parse(wk[4]).getDate()}, ${P.parse(wk[4]).getFullYear()}` : String(dd.getFullYear());
    const isFam = r.view === 'family';
    if (isSet) { $('heading').textContent = 'Settings'; }
    if (isFam) $('heading').textContent = 'Family email';
    $('famView').hidden = !isFam;
    document.querySelector('.datenav').hidden = isSet;
    const nothing = !X.subjects.length && !X.blocks.length;
    $('empty').hidden = !nothing;
    $('dayView').hidden = nothing || r.view !== 'day';
    $('weekView').hidden = nothing || !isWeek;
    $('settingsView').hidden = !isSet;
    if (isFam) { if (!nothing) renderFamily(r.date); renderChip(); return; }
    if (isSet) renderSettings(r.date);
    else if (!nothing) isWeek ? renderWeek(r.date) : renderDay(r.date);
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
    if (el && $('settingsView').contains(el)) { try { await settingsClick(el); } catch (err) { problem('Not saved: ' + err.message); } return; }
    if (el && el.dataset.famopen) { famShown = null; go('family', el.dataset.famopen); return; }
    if (el && el.id === 'famCopy') { famCopy(); return; }
    if (!el || !$('dayView').contains(el)) return;
    const date = route().date, d = el.dataset;
    try {
      if (d.step) await setLesson(d.s, date, r => ({ pos: Number(d.step) > 0 ? P.advance(X.subj[d.s], r.pos) : P.retreat(X.subj[d.s], r.pos) }));
      else if (d.taught) await setLesson(d.taught, date, r => ({ taught: !r.taught }));
      else if (d.pick) await setLesson(d.pick, date, () => ({ pos: { text: d.text } }));
      else if (d.sel) { selSubj = selSubj === d.sel && !wide() ? null : d.sel; render(); }
      else if (d.jump) await jump(d.jump, date);
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
