// The ORF tool (step 7, part 1): Assess, as v95's running-records page with fluency-assess.js (Pause,
// what they said). Works alone: with no gradebook, its Students tab takes a pasted class list.
// Readings, passages and the class list are private: they travel only through the Drive folder.
(async function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const O = SuiteOrfAssess, P = SuitePlan;
  const now = () => (window.__now ? window.__now() : Date.now());   // the browser tests drive the clock
  const rid = p => p + '_' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  function problem(text) { $('problemText').textContent = text; $('problem').hidden = !text; }
  let toastTimer = null;
  function toast(text) { $('toast').textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 5000); }

  let store;
  try {
    const contract = await fetch('../contract/contract.json').then(r => { if (!r.ok) throw new Error('the contract did not load'); return r.json(); });
    store = await SuiteStore.open({ contract });
    store.persist();
    const t = SuiteTransport.create({ store, contract });   // on the MacBook this also keeps the Drive folder copy current
    await t.start();
  } catch (e) { problem('The reading tool could not open: ' + e.message); return; }

  // ---------- the data ----------
  let X = null;
  const sortKey = s => ((s.lastName || '') + (s.firstName || '')).toLowerCase();
  const fullName = s => s ? s.firstName + (s.lastName ? ' ' + s.lastName : '') : '';
  const lastFirst = s => s ? (s.lastName ? s.lastName + ', ' + s.firstName : s.firstName) : '';
  async function index() {
    const lv = (await store.all()).filter(r => !r.deletedAt), by = t => lv.filter(r => r.type === t);
    X = {
      kids: by('student').filter(s => s.active).sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
      passages: by('orfPassage').sort((a, b) => a.title.localeCompare(b.title)),
      checks: by('orfCheck'),
      // With a gradebook, the class list is the gradebook's; alone, this tool keeps it.
      gradebook: lv.some(r => r.type === 'gradebookSettings' || r.type === 'mark')
    };
  }

  // ---------- the read ----------
  const UI = { view: 'assess', sid: '', pid: '', dur: 60, phase: 'idle', S: null, startTs: null, pausedAt: null, pausedMs: 0,
    lastPaused: 0, elapsed: 0, tick: null, tag: null };
  const passage = () => X.passages.find(p => p.id === UI.pid) || null;
  const pausedNow = () => UI.pausedMs + (UI.pausedAt != null ? now() - UI.pausedAt : 0);
  const readSeconds = () => (now() - UI.startTs - pausedNow()) / 1000;
  const clockText = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  function reset() {
    clearInterval(UI.tick);
    Object.assign(UI, { phase: 'idle', startTs: null, pausedAt: null, pausedMs: 0, elapsed: 0, tick: null, tag: null, S: passage() ? O.session(passage().text) : null });
  }
  function startRead() {
    if (!passage() || !UI.sid) return;
    reset();
    Object.assign(UI, { phase: 'running', startTs: now(), lastPaused: 0 });
    UI.tick = setInterval(() => {
      if (UI.pausedAt != null) return;   // the clock holds while paused; taps still work
      const el = readSeconds(), left = Math.max(0, UI.dur - el);
      const c = $('clock'), pr = $('prog');
      if (c) { c.textContent = clockText(left); c.classList.toggle('low', left <= 10); }
      if (pr) pr.style.width = Math.min(100, (el / UI.dur) * 100) + '%';
      if (left <= 0) endRead(UI.dur);
    }, 200);
  }
  function endRead(elapsed) {
    clearInterval(UI.tick); UI.tick = null;
    UI.lastPaused = pausedNow(); UI.pausedAt = null;
    UI.elapsed = elapsed;
    UI.phase = 'stopmark';
    beep();
    render();
  }
  function beep() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = new C();
      [0, 0.22].forEach(off => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + off + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + off + 0.16);
        o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + 0.18);
      });
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } catch (e) { /* no sound here */ }
  }
  function cue() {
    const S = UI.S, n = S ? S.lap + 1 : 1, many = S && S.laps.length > 1;
    if (!X.kids.length) return X.gradebook ? 'Add your class in the Gradebook first.' : 'Add your class on the Students tab first.';
    if (!X.passages.length) return 'Add a passage on the Passages tab first.';
    if (UI.phase === 'idle') return 'Pick a student and passage, then start the timer.';
    if (UI.phase === 'running') return (UI.pausedAt != null ? 'Paused. ' : '') + (many ? `Pass ${n}. ` : '') + 'Tap each word the student misses. Tap twice if they self-correct. If they reach the end and start over, tap “Started over”.';
    if (UI.phase === 'stopmark') return `Time. Tap the last word the student read${many ? ` on pass ${n}` : ''}.`;
    return 'Tap words to adjust marks, or tap “Change last word” below.';
  }

  // ---------- drawing ----------
  let renderLater = false;
  async function render() {
    window.__renders = (window.__renders || 0) + 1;
    const a = document.activeElement;
    if (a && document.querySelector('main').contains(a) && a.matches('input[type=text], textarea')) { renderLater = true; return; }
    renderLater = false;
    await index();
    if (!X.kids.some(k => k.id === UI.sid)) UI.sid = X.kids[0] ? X.kids[0].id : '';
    if (!X.passages.some(p => p.id === UI.pid)) { UI.pid = X.passages[0] ? X.passages[0].id : ''; if (UI.phase === 'idle') reset(); }
    if (!UI.S && passage()) reset();
    UI.view = /^#passages/.test(location.hash) ? 'passages' : /^#students/.test(location.hash) ? 'students' : 'assess';
    ['assess', 'passages', 'students'].forEach(v => {
      $(v + 'View').hidden = UI.view !== v;
      $('tab' + v[0].toUpperCase() + v.slice(1)).setAttribute('aria-selected', String(UI.view === v));
    });
    if (UI.view === 'assess') renderAssess(); else if (UI.view === 'passages') renderPassages(); else renderStudents();
  }

  function renderAssess() {
    const S = UI.S, ph = UI.phase, run = ph === 'running', paused = UI.pausedAt != null;
    const t = S ? O.tally(S) : { e: 0, s: 0 };
    const left = run ? Math.max(0, UI.dur - readSeconds()) : ph === 'idle' ? UI.dur : 0;
    const progress = run ? Math.min(100, (readSeconds() / UI.dur) * 100) : ph === 'idle' ? 0 : 100;
    let h = `<div class="pick side">
      <label class="sf"><span>Student</span><select id="a-sid"${run ? ' disabled' : ''}>${X.kids.length ? X.kids.map(k => `<option value="${esc(k.id)}"${k.id === UI.sid ? ' selected' : ''}>${esc(lastFirst(k))}</option>`).join('') : '<option value="">No students yet</option>'}</select></label>
      <label class="sf"><span>Passage</span><select id="a-pid"${run ? ' disabled' : ''}>${X.passages.length ? X.passages.map(p => `<option value="${esc(p.id)}"${p.id === UI.pid ? ' selected' : ''}>${esc(p.title)}</option>`).join('') : '<option value="">No passages yet</option>'}</select></label>
      <label class="sf"><span>Read time</span><select id="a-dur"${ph !== 'idle' ? ' disabled' : ''}>${[[60, '1 minute'], [90, '90 seconds'], [120, '2 minutes']].map(([v, l]) => `<option value="${v}"${v === UI.dur ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="small hint">${passage() ? O.wordCount(passage().text) + ' words in this passage.' : ''}</p></div>
    <div class="timerbar${paused ? ' paused' : ''}">
      <div class="clock${left <= 10 && run ? ' low' : ''}" id="clock" aria-live="off">${clockText(left)}</div>
      <div class="progress" aria-hidden="true"><i id="prog" style="width:${progress}%"></i></div>
      <div class="tally"><span><b id="tErr">${t.e}</b>errors</span><span><b id="tSc">${t.s}</b>self-corrections</span><span><b id="tPass">${S ? S.laps.length : 1}</b>pass${S && S.laps.length > 1 ? 'es' : ''}</span></div>
      <div class="tbtns">
        ${run ? '' : `<button data-a="start"${!X.kids.length || !passage() ? ' disabled' : ''}>${ph === 'idle' ? 'Start reading' : 'Start a new check'}</button>`}
        ${run ? `<button class="ghost" data-a="pause" aria-pressed="${paused}">${paused ? 'Resume' : 'Pause'}</button>` : ''}
        ${run ? '<button class="ghost" data-a="restart">Started over</button>' : ''}
        ${run && S.laps.length > 1 ? '<button class="ghost" data-a="undoRestart">Undo restart</button>' : ''}
        ${ph === 'stopmark' && S.laps.length > 1 ? '<button class="ghost" data-a="endOfPass">Stopped at the end</button>' : ''}
        ${run ? '<button class="solid" data-a="stop">Stop timer</button>' : ''}
        ${ph !== 'idle' && !run ? '<button class="ghost" data-a="clear">Clear</button>' : ''}
      </div>
      <p class="cue${ph === 'stopmark' ? ' act' : ''}" id="cue">${esc(cue())}</p>
    </div>`;
    h += `<div class="side passage-card"><div class="passage${ph === 'idle' ? ' locked' : ''}" id="passage">${S ? passageHTML() : '<p class="small">No passage selected.</p>'}</div>
      <div class="legend"><span><i class="sw e"></i>Tap once: error</span><span><i class="sw s"></i>Twice: self-correction</span><span>A third time clears it</span>
      ${ph !== 'idle' ? '<span>The small tag above a marked word: what they said, or teacher told</span>' : ''}</div>
      ${ph === 'done' ? resultsHTML() : ''}</div>`;
    $('assessView').innerHTML = h;
  }
  function passageHTML() {
    const S = UI.S, cur = S.laps[S.editLap] || S.laps[S.laps.length - 1], isLast = S.editLap === S.laps.length - 1;
    const tags = UI.phase !== 'idle' && UI.phase !== 'stopmark';
    return S.tokens.map((tk, i) => {
      if (tk.br) return '<span class="br"></span>';
      if (!tk.word) return `<span class="p">${esc(tk.raw)}</span> `;
      const m = cur.marks[i];
      let cls = 'w';
      if (m === 'e') cls += ' e'; else if (m === 's') cls += ' s';
      else if (S.laps.some((L, li) => li !== S.editLap && L.marks[i])) cls += ' prev';
      if (isLast && cur.stopTok != null) { if (i === cur.stopTok) cls += ' stopw'; if (i > cur.stopTok) cls += ' past'; }
      const label = esc(tk.raw) + (m === 'e' ? ', error' : m === 's' ? ', self-correction' : '');
      const word = `<button class="${cls}" data-i="${i}" aria-label="${label}">${esc(tk.raw)}</button>`;
      if (!m || !tags) return word + ' ';
      const k = S.editLap + ':' + i, nt = S.notes[k] || {}, said = (nt.said || '').trim();
      const filled = !!(said || (m === 'e' && nt.told));
      const text = said && m === 'e' && nt.told ? esc(said) + ' · T' : said ? esc(said) : m === 'e' && nt.told ? 'T' : '✎';
      let box = '';
      if (UI.tag === k) box = `<span class="tagbox" role="group" aria-label="What they said for ${esc(tk.raw)}">
        <label>What they said for <b>${esc(tk.raw)}</b><input type="text" id="tagSaid" maxlength="60" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(nt.said || '')}"></label>
        <span class="tagrow">${m === 'e' ? `<button data-told="${k}" aria-pressed="${!!nt.told}">Teacher told</button>` : '<span class="small">Self-corrected</span>'}<button data-tagdone="1">Done</button></span></span>`;
      return `<span class="wt"><button class="tag ${m}${filled ? '' : ' empty'}" data-tag="${k}" aria-label="${filled ? 'Change' : 'Add'} what they said for ${esc(tk.raw)}">${text}</button>${word}${box}</span> `;
    }).join('');
  }
  function resultsHTML() {
    const S = UI.S, r = O.computeScores(S, UI.elapsed, UI.dur);
    const breakdown = r.passes > 1 ? `<p class="small">${r.lapWords.map((w, i) => `Pass ${i + 1}: ${w} words`).join(' · ')} — ${r.wordsRead} in total across the ${r.passageWords}-word passage.</p>` : '';
    const lapPicker = r.passes > 1 ? `<div class="small">Editing marks on: ${S.laps.map((L, i) => `<button class="compact${i === S.editLap ? ' on' : ''}" data-lap="${i}" aria-pressed="${i === S.editLap}">Pass ${i + 1}</button>`).join(' ')}</div>` : '';
    const paused = UI.lastPaused >= 1000 ? `<p class="small">Paused ${clockText(UI.lastPaused / 1000)} in all; reading time only is counted.</p>` : '';
    return `<div class="results" id="results"><div class="scores">
      <div class="score"><b id="rWcpm">${r.wcpm}</b><span>words correct per minute</span></div>
      <div class="score"><b>${r.accuracy.toFixed(1)}%</b><span>accuracy — ${esc(O.accuracyLevel(r.accuracy))}</span></div>
      <div class="score"><b>${r.wordsRead}</b><span>words read</span></div>
      <div class="score"><b>${r.errors}</b><span>errors</span></div>
      <div class="score"><b>${r.sc}</b><span>self-corrections</span></div>
      ${r.passes > 1 ? `<div class="score"><b>${r.passes}</b><span>passes</span></div>` : ''}</div>
      ${breakdown}${lapPicker}${paused}
      <div class="rbtns"><button class="solid" data-a="save">Save this check</button><button class="quiet compact" data-a="restop">Change last word</button></div></div>`;
  }

  // ---------- doing things ----------
  async function save() {
    const S = UI.S, kid = X.kids.find(k => k.id === UI.sid);
    if (!kid) { toast('Pick a student first.'); return; }
    const r = O.computeScores(S, UI.elapsed, UI.dur);
    if (!r.wordsRead) { toast('Mark the last word read first.'); return; }
    const at = new Date(now());
    const rec = O.checkRecord(S, { id: rid('orf'), studentId: kid.id, passage: passage(), takenAt: at.toISOString(), date: P.iso(at),
      elapsed: UI.elapsed, duration: UI.dur, pausedSeconds: UI.lastPaused / 1000 });
    try { problem(''); await store.write([rec], 'a reading'); }
    catch (e) { problem('Not saved: ' + e.message); return; }
    toast(`Saved — ${fullName(kid)}, ${r.wcpm} WCPM.`);
    reset();
    render();
  }
  function closeTag() { UI.tag = null; }
  document.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || !document.querySelector('main').contains(b)) return;
    const d = b.dataset;
    if (d.view) { location.hash = '#' + d.view; return; }
    if (UI.view === 'passages') { await passagesClick(b); return; }
    if (UI.view === 'students') { await studentsClick(b); return; }
    const S = UI.S;
    if (d.a === 'start') startRead();
    else if (d.a === 'pause') { if (UI.pausedAt == null) UI.pausedAt = now(); else { UI.pausedMs += now() - UI.pausedAt; UI.pausedAt = null; } }
    else if (d.a === 'restart' && UI.phase === 'running') { O.restartPass(S); toast(`Pass ${S.lap + 1} started — errors from earlier passes still count.`); }
    else if (d.a === 'undoRestart') { O.undoRestart(S); toast(`Back on pass ${S.lap + 1}.`); }
    else if (d.a === 'stop' && UI.phase === 'running') { endRead(Math.max(1, readSeconds())); return; }
    else if (d.a === 'endOfPass' && UI.phase === 'stopmark') { O.endOfPass(S); UI.phase = 'done'; }
    else if (d.a === 'clear') reset();
    else if (d.a === 'save') { await save(); return; }
    else if (d.a === 'restop') { S.editLap = S.laps.length - 1; S.laps[S.editLap].stopTok = null; UI.phase = 'stopmark'; closeTag(); }
    else if (d.lap != null) { S.editLap = Number(d.lap); closeTag(); }
    else if (d.tag) UI.tag = UI.tag === d.tag ? null : d.tag;
    else if (d.told) { const [p, i] = d.told.split(':').map(Number); O.setNote(S, p, i, { told: !(S.notes[d.told] || {}).told }); }
    else if (d.tagdone) closeTag();
    else if (d.i != null && S) {
      const i = Number(d.i);
      if (UI.phase === 'stopmark') { O.setLastWord(S, i); UI.phase = 'done'; closeTag(); }
      else if (UI.phase === 'running' || UI.phase === 'done') { O.tap(S, i); if (UI.tag && !(S.laps[S.editLap].marks[i])) closeTag(); }
      else return;
    } else return;
    render();
    if (UI.tag) { const inp = $('tagSaid'); if (inp) inp.focus({ preventScroll: true }); }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'tagSaid' || !UI.tag) return;
    const [p, i] = UI.tag.split(':').map(Number);
    O.setNote(UI.S, p, i, { said: e.target.value });
    const tg = document.querySelector(`[data-tag="${UI.tag}"]`), nt = UI.S.notes[UI.tag] || {}, said = (nt.said || '').trim(), m = UI.S.laps[p].marks[i];
    if (tg) { tg.textContent = said && m === 'e' && nt.told ? said + ' · T' : said || (m === 'e' && nt.told ? 'T' : '✎'); tg.classList.toggle('empty', !(said || (m === 'e' && nt.told))); }
  });
  document.addEventListener('keydown', e => { if (e.target.id === 'tagSaid' && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); closeTag(); e.target.blur(); render(); } });
  document.addEventListener('change', async e => {
    const el = e.target;
    if (el.id === 'a-sid') { UI.sid = el.value; }
    else if (el.id === 'a-pid') { UI.pid = el.value; reset(); }
    else if (el.id === 'a-dur') { UI.dur = Number(el.value); reset(); }
    else return;
    render();
  });
  document.querySelector('main').addEventListener('focusout', () => setTimeout(() => { if (renderLater) render(); }, 0));

  // ---------- Passages: the library (adding one by hand; the PDF import comes with step 7's later parts) ----------
  function renderPassages() {
    $('passagesView').innerHTML = `<section class="side"><div class="side-head"><h2>Saved passages</h2><span class="small">${X.passages.length}</span></div>
      ${X.passages.length ? `<div class="plist">${X.passages.map(p => `<div class="prow"><span><b>${esc(p.title)}</b> <span class="small">${O.wordCount(p.text)} words</span></span>
        <button class="compact quiet" data-pdel="${esc(p.id)}">Remove</button></div>`).join('')}</div>` : '<p class="small">No passages yet.</p>'}</section>
      <section class="side"><h2>Add a passage</h2>
        <label class="sf"><span>Title</span><input type="text" id="newTitle" maxlength="80"></label>
        <label class="sf"><span>Text (a blank line between paragraphs)</span><textarea id="newText" rows="8"></textarea></label>
        <button class="solid" data-padd="1">Add passage</button></section>`;
  }
  async function passagesClick(b) {
    const d = b.dataset;
    if (d.padd) {
      const title = $('newTitle').value.trim(), text = $('newText').value.replace(/\r/g, '').trim();
      if (!title || !O.wordCount(text)) { toast('A passage needs a title and some words.'); return; }
      try { problem(''); await store.write([{ id: rid('pas'), type: 'orfPassage', deletedAt: null, title: title.slice(0, 80), text: text.slice(0, 20000) }], 'a passage'); }
      catch (e) { problem('Not saved: ' + e.message); return; }
      $('newTitle').value = ''; $('newText').value = '';
      toast(`Added “${title}”.`);
    } else if (d.pdel) {
      const p = X.passages.find(x => x.id === d.pdel);
      if (!p) return;
      try { await store.write([Object.assign({}, p, { deletedAt: new Date().toISOString() })], 'removing a passage'); } catch (e) { problem('Not removed: ' + e.message); return; }
      toast(`Removed “${p.title}”. Readings of it keep their title.`);
    } else return;
    render();
  }

  // ---------- Students: the gradebook's list, or (alone) a pasted one ----------
  function renderStudents() {
    const list = X.kids.length ? `<ul class="slist">${X.kids.map(k => `<li>${esc(lastFirst(k))}</li>`).join('')}</ul>` : '<p class="small">No students yet.</p>';
    $('studentsView').innerHTML = X.gradebook
      ? `<section class="side"><h2>Class roster</h2><p class="small">Your class list comes from the Gradebook; change it there.</p>${list}</section>`
      : `<section class="side"><h2>Class roster</h2><p class="small">Private: the class list stays on this device (and your Drive folder, if you use one).</p>${list}
        <label class="sf"><span>Add students, one name per line</span><textarea id="rosterInput" rows="6" placeholder="Ada Lovelace&#10;Ben Carter&#10;Chloe Nguyen"></textarea></label>
        <button class="solid" data-roster="1">Add to roster</button></section>`;
  }
  // "First Last", or "Last, First".
  function splitName(n) {
    n = n.replace(/\s+/g, ' ').trim();
    if (n.includes(',')) { const [last, first] = n.split(',').map(x => x.trim()); return { firstName: first || last, lastName: first ? last : '' }; }
    const parts = n.split(' ');
    return parts.length > 1 ? { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] } : { firstName: n, lastName: '' };
  }
  async function studentsClick(b) {
    if (!b.dataset.roster || X.gradebook) return;
    const names = $('rosterInput').value.split('\n').map(s => s.trim()).filter(Boolean);
    const have = new Set(X.kids.map(k => fullName(k).toLowerCase()));
    const today = P.iso(new Date(now()));
    const recs = [];
    names.forEach(n => {
      const nm = splitName(n), full = fullName(nm).toLowerCase();
      if (!nm.firstName || have.has(full)) return;
      have.add(full);
      const r = { id: rid('stu'), type: 'student', deletedAt: null, firstName: nm.firstName.slice(0, 40), eld: false, active: true, joined: today };
      if (nm.lastName) r.lastName = nm.lastName.slice(0, 40);
      recs.push(r);
    });
    if (recs.length) { try { problem(''); await store.write(recs, 'the class list'); } catch (e) { problem('Not saved: ' + e.message); return; } $('rosterInput').value = ''; }
    toast(recs.length ? `Added ${recs.length} student${recs.length > 1 ? 's' : ''}.` : 'Those names are already on the roster.');
    render();
  }

  store.onChange(() => { if (UI.phase === 'idle' || UI.phase === 'done') render(); });
  addEventListener('hashchange', () => render());
  await render();
  window.__ready = true;
  window.__store = store; window.__orf = UI;   // for the browser tests
})();
