// Breaks the code on purpose, one way at a time, and checks the tests notice every one.
// Each mutation runs in a throwaway copy of the project. Run: node tests/mutations.js
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const M = [
  // contract checker
  ['contract/validate.js', 'no unknown-field check', '!extraAllowed.includes(name)', 'false'],
  ['contract/validate.js', 'no WCPM check', 'rec.wcpm !== want', 'false'],
  ['contract/validate.js', 'no newer-version refusal', 'file.version > contract.version', 'false'],
  ['contract/validate.js', 'no reference check', 'if (!target) errs', 'if (false) errs'],
  ['contract/validate.js', 'no reference kind check', '!r.to.includes(target.type)', 'false'],
  ['contract/validate.js', 'no duplicate-id check', 'byId.has(rec.id)', 'false'],
  ['contract/validate.js', 'no fixed-id rule', 'want && rec.id !== want', 'false'],
  ['contract/validate.js', 'no real-date check', 'd.toISOString().slice(0, 10) === s', 'true'],
  ['contract/validate.js', 'no UTC check', '(\\.\\d{1,3})?Z$/', '(\\.\\d{1,3})?Z?$/'],
  ['contract/validate.js', 'no envelope on deletions', 'checkFields(envOnly, contract.envelope, path, errs, refs, false)', 'checkFields(envOnly, contract.envelope, path, errs, refs, true)'],
  ['contract/validate.js', 'no map key check', '.test(k))', '.test(k) || true)'],
  ['contract/validate.js', 'no reading-unit rule', "rec.groupKind === 'reading' && !rec.unitId", 'false'],
  ['contract/validate.js', 'no marked-word count', "n('selfCorrection') > rec.selfCorrections", 'false'],
  ['contract/validate.js', 'no list limit', 'spec.max !== undefined && v.length > spec.max', 'false'],
  // merge
  ['core/merge.js', 'no tie-break by device', 'return String(a.device) > String(b.device);', 'return false;'],
  ['core/merge.js', 'no same-content check', 'if (sameContent(have, rec)) {', 'if (false) {'],
  ['core/merge.js', 'times compared as text', 'const ta = Date.parse(a.updatedAt), tb = Date.parse(b.updatedAt);', 'const ta = a.updatedAt, tb = b.updatedAt;'],
  ['core/merge.js', 'newer envelope not kept', 'if (isNewer(rec, have)) changes.push({ id: rec.id, before: have, after: rec, quiet: true });', ''],
  // importer
  ['core/import-v95.js', 'UTC day instead of Oregon day', 'let date = oregonDate(r.date);', 'let date = String(r.date).slice(0, 10);'],
  ['core/import-v95.js', 'hand-moved date ignored', 'if (copy && isDate(copy.date) && copy.srcDay && copy.date !== copy.srcDay) date = copy.date;', ''],
  ['core/import-v95.js', 'demo class kept', 'if (r.demo || demo.has(String(r.studentId))) { demoSkipped++; continue; }', ''],
  ['core/import-v95.js', 'made-up ids', "records.push(rec('orf_' + safe(r.id), 'orfCheck', f));", "records.push(rec('orf_' + Math.random().toString(36).slice(2, 10), 'orfCheck', f));"],
  ['core/import-v95.js', 'bad WCPM let through', 'if (wcpm !== want) { heldBack.push', 'if (false) { heldBack.push'],
  ['core/import-v95.js', 'links from copies not learned', 'if (learned.has(k)) return stuId.get(learned.get(k));', ''],
  ['core/import-v95.js', 'load time instead of file time', 'const T = at.toISOString();', 'const T = new Date(Date.now() + Math.random() * 1e6).toISOString();'],
  // store and page (real browser)
  ['core/store.js', 'store skips the contract', 'const check = SuiteContract.validateFile(fileOf(next), contract);', 'const check = { ok: true };', 'tests/browser.test.js'],
  ['core/store.js', 'a no-change load still writes', 'const touched = changes.length + v95Keys.length;', 'const touched = 1;', 'tests/browser.test.js'],
  ['core/store.js', 'undo forgets kept v95 data', 'u.v95.forEach(x => x.before === null ? vs.delete(x.key) : vs.put(x.before, x.key));', '', 'tests/browser.test.js'],
  ['core/store.js', 'upgrade not recorded', "tx.objectStore('meta').put(schema + 1, 'schemaVersion');", '', 'tests/browser.test.js'],
  ['import/index.html', 'older file allowed', 'if (last && Date.parse(out.savedAt) < Date.parse(last)) {', 'if (false) {', 'tests/browser.test.js'],
  // sync
  ['core/transport.js', 'phone file removed without updating the MacBook copy', 'const w = await fh.createWritable(); await w.write(JSON.stringify(f)); await w.close();', '', 'tests/sync.browser.test.js'],
  ['core/transport.js', 'refused files retried every few seconds', 'if (seen && seen.lastModified === file.lastModified) {', 'if (false) {', 'tests/sync.browser.test.js'],
  ['core/transport.js', '"not sent yet" never cleared', "await store.meta.set('unsentSince', null);", '', 'tests/sync.browser.test.js'],
  ['core/transport.js', 'Drive\'s "(1)" names ignored', '(?: ?\\(\\d+\\))?', '', false],
  ['core/transport.js', 'refused-file warning dropped after one check', "problems: refused });", "problems });", 'tests/sync.browser.test.js'],
  ['sync/index.html', 'list rebuilt over a half-typed name', 'sig !== box.dataset.sig && ', '', 'tests/sync.browser.test.js'],
  ['core/store.js', 'undo wipes edits made after the load', 'u.records.filter(stillFromLoad).forEach', 'u.records.forEach', 'tests/sync.browser.test.js'],
  ['core/store.js', 'an edit replaces the last load\'s undo', "if ((info.kind || 'load') === 'load') meta.put", 'meta.put', 'tests/sync.browser.test.js'],
  // live sync
  ['core/live.js', 'private records sent', 'if (!isLive(rec)) throw', 'if (false) throw', 'tests/live.browser.test.js'],
  ['core/live.js', 'private records accepted from the server', 'const incoming = (msg.records || []).filter(isLive);', 'const incoming = (msg.records || []);', 'tests/live.browser.test.js'],
  ['core/live.js', 'newer copy not sent again after a late older write', 'else if (incoming.length) await sendNewer(new Set(incoming.map(r => r.id)));', '', 'tests/live.browser.test.js'],
  ['core/live.js', 'an undone file load leaves its days on other devices', 'if (LIVE.has(r.type)) push({', 'if (false) push({', 'tests/live.browser.test.js'],
  ['core/live.js', 'nothing sent on first connect', 'if (!initialDone && state.connected) { initialDone = true; await sendNewer(null); }', '', 'tests/live.browser.test.js'],
  ['core/names.js', 'name check matches inside longer words', '(?!${LETTER})', '', false],
  ['core/names.js', 'nicknames not checked', '(s.aka || []).forEach(add);', '', false],
  ['sync/index.html', 'labels saved without the name check', 'if (check.hits.length) {', 'if (false) {', 'tests/live.browser.test.js'],
  ['firestore.rules', 'server rules allow deleting', 'allow create, update:', 'allow create, update, delete:', false],
  ['tools/make-rules.js', 'server rules stop checking the type', "request.resource.data.type == ${q(name)} && ", '', false],
  ['core/live-firebase.js', 'records written outside your own folder', "sdk.fs.doc(db, 'users', mustUser().uid, 'records', rec.id)", "sdk.fs.doc(db, 'records', rec.id)", false],
  // planner
  ['core/import-v95.js', 'importer runs without the name check', "if (!N || typeof N.nameHits !== 'function') throw", 'if (false) throw', false],
  ['core/import-v95.js', 'imported day notes that name a child stay live', "if (r.type === 'dayPlan' && named(r.notes)) {", 'if (false) {', false],
  ['import/index.html', 'import page without the name check', '<script src="../core/names.js"></script>\n', '', 'tests/browser.test.js'],
  ['core/plan.js', 'Reveal skips a day', 'if (s) return posOf(FLAT[s.i + 1] || s);', 'if (s) return posOf(FLAT[s.i + 2] || s);', false],
  ['core/plan.js', 'afternoon times sort before the morning', 'if (hh < 7) hh += 12;', '', false],
  ['core/plan.js', 'an untaught day counts as taught', "!l.taught || ", '', false],
  ['core/plan.js', 'days off ignored', "if (sd && sd.kind === 'noSchool') return", 'if (false) return', false],
  ['core/store.js', 'no upgrade from the version before', '6: records => records', '', 'tests/sync.browser.test.js'],
  ['planner/planner.js', 'Keep it private saves the note live', "if (choice === 'private') {\n      const writes", "if (false) {\n      const writes", 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'notes saved without the name check', "if (!hits.length) return Promise.resolve('live');", "return Promise.resolve('live');", 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'the district calendar not applied', "await applyCalendar(cal);", '', 'tests/planner.browser.test.js'],
  // planner settings (4b)
  ['core/plan.js', 'the pacing guide gives each unit a day too many', 'const n = Math.round(u.total);', 'const n = Math.round(u.total) + 1;', false],
  ['core/plan.js', 'days off count as math days', 'dayStatus(d, { year, days, plan: plans && plans[d] }).school', 'true', false],
  ['planner/planner.js', 'Settings redraws over a field being typed in', "if (route().view === 'settings' && a && $('settingsView').contains(a) && a.matches('input, select, textarea')) { renderLater = true; return; }", '', 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'any text accepted as a time', "if (kind === 'time' && !/", "if (false && !/", 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'a private standing note saved live', "if (choice === 'private') {\n        if (f !== 'note'", "if (false) {\n        if (f !== 'note'", 'tests/planner.browser.test.js'],
  // the family email (4c)
  ['core/family.js', 'planned and taught lessons ignored in the email', 'const p = rec ? rec.pos : pos;', 'const p = pos;', false],
  ['core/family.js', 'a unit\'s first writing week says "Continuing"', 'Number(p.week) === 1 ?', 'false ?', false],
  ['core/import-v95.js', 'v95 goal keys taken without checking', 'if (keyOk(k) && cut(v, 200))', 'if (cut(v, 200))', false],
  ['planner/planner.js', 'the family email rebuilt over hand edits', 'if (famShown === mon && famEdited) return;', '', 'tests/planner.browser.test.js'],
  // 4d
  ['core/import-v95.js', 'Phonics not placed inside Reading', "records.find(r => r.id === subjId.get('phonics')).within = subjId.get('reading');", '', false],
  ['planner/planner.js', 'a subject shown inside another gets its own card too', "if (inside(r)) parentRow[r.subject.within].children.push(r);", '', 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'Agenda rows out of time order', '.sort((a, b) => first(a) - first(b))', '', 'tests/planner.browser.test.js'],
  // sub plans (5)
  ['core/subplan.js', 'a block\'s sub notes left off the plan', "const x = subBlk[b.id] || {};", "const x = {};", false],
  ['core/subplan.js', 'unplanned subjects print nothing', "|| (sb && sb.on ? { pos: P.suggest(sb, lessons, iso), note: '' } : null);", ";", false],
  ['core/subplan.js', 'private day notes left off the plan', "const dayNote = iso => join(plan[iso] && plan[iso].notes, ...priv.filter(n => n.about === 'day' && n.date === iso).map(n => n.text));", "const dayNote = iso => join(plan[iso] && plan[iso].notes);", false],
  ['core/import-v95.js', 'a gone block\'s note loses its block', "records.push(rec(`bnote_${date}_${gone}`, 'blockNote', { date, blockId: gone, text: cut(text, 500) }));", '', false],
  ['planner/planner.js', 'printing does not mark the day as a sub day', "if (!flags.has('Sub')) { flags.add('Sub');", "if (false) { flags.add('Sub');", 'tests/planner.browser.test.js'],
  ['sw.js', 'offline copy missing the planner', "'planner/', 'planner/index.html', ", '', false],
  ['sw.js', 'offline copy missing the sync page', "'sync/', 'sync/index.html'", "'sync/'", false],
  // step 6a: the gradebook
  ['core/grade.js', 'a probe covers the whole unit', 's.k === \'probe\' ? lessonsOf(s.u, s.after)', 's.k === \'probe\' ? lessonsOf(s.u)', false],
  ['core/grade.js', 'tapping the same number again does not clear', 'if (have && have.value === value) return result(', 'if (false) return result(', false],
  ['core/grade.js', 'a mark leaves the child on the not-turned-in list', '.concat(handIn(recs, studentId, standard, date, today))', '', false],
  ['core/grade.js', 'undo overwrites a change made on the other device', 'if (!same(cur, e.after)) { changedSince++; return; }', '', false],
  ['core/grade.js', 'Log the rest includes children who have left', 'students.filter(s => s.active).forEach(s => {', 'students.forEach(s => {', false],
  ['core/grade.js', 'taking a lesson replaces a typed name', '(cur.what ? lessonFromCtx(cur.what) != null : !unnamed)', '(true)', false],
  ['core/grade.js', 'excused work counts toward an assignment', 'missing.forEach(m => { if (!m.excused) slot(m.standard, m.date, m.what).missing++; });', 'missing.forEach(m => { slot(m.standard, m.date, m.what).missing++; });', false],
  ['core/grade.js', 'a day off still has a lesson', 'if (!P.dayStatus(date, { year, days }).school) return null;', '', false],
  ['core/grade.js', 're-marking takes one name of several', 'return names.length === 1 && names[0] !== \'-\' ? names[0] : \'\';', 'return names[0] && names[0] !== \'-\' ? names[0] : \'\';', false],
  ['core/import-v95.js', 'marks for a child who is gone are brought in', '      const sid = stuId.get(String(x.sid));\n      if (!sid) { markGone++; continue; }', '      const sid = stuId.get(String(x.sid)) || \'stu_\' + x.sid;', false],
  ['core/import-v95.js', 'of two marks for one day, the earlier is kept', 'markIds.set(id, rec(id, \'mark\', f));', 'if (!markIds.has(id)) markIds.set(id, rec(id, \'mark\', f));', false],
  ['core/import-v95.js', 'turned-off standards come in switched on', '.filter(c => gb.active[c] && STD.test(c))', '.filter(c => STD.test(c))', false],
  ['contract/validate.js', 'a mark\'s id is not checked', 'case \'mark_<source_><studentId>_<standard>_<date>\':', 'case \'mark rule switched off\':', false],
  ['sw.js', 'offline copy missing the gradebook', '\'gradebook/\', \'gradebook/index.html\', ', '', false],
  ['gradebook/gradebook.js', 'a redraw wipes a note being typed', 'if (a && document.querySelector(\'main\').contains(a) && a.matches(\'input:not([type=checkbox]), textarea, select\')) { renderLater = true; return; }', '', 'tests/gradebook.browser.test.js'],
  ['gradebook/gradebook.js', 'a note typed before the mark is lost', 'note: UI.pending[key] || \'\', today', 'note: \'\', today', 'tests/gradebook.browser.test.js'],
  ['gradebook/gradebook.js', 'the card does not follow the day\'s lesson', '    if (UI.follow) follow();\n', '', 'tests/gradebook.browser.test.js'],
  ['gradebook/gradebook.js', 'All marks only one standard', 'else if (d.v && d.all) await tapAll(d.all, Number(d.v));', 'else if (d.v && d.all) await tapMark(d.all, UI.std, Number(d.v));', 'tests/gradebook.browser.test.js'],
  ['gradebook/gradebook.css', 'a marked 2 too light to read', '--m2: #7F5A14;', '--m2: #A87621;', 'tests/gradebook.browser.test.js'],
  ['gradebook/gradebook.css', 'the note under the marks on the MacBook', '.kid:not(:has(.mrow)) { display: grid;', '.kid:not(:has(.mrow)) { display: flex;', 'tests/gradebook.browser.test.js'],
  ['core/colors.js', 'subject colors not deepened for white text', 'for (let i = 0; i < 40 &&', 'for (let i = 0; i < 0 &&', 'tests/planner.browser.test.js'],
  // step 6b: marks for Synergy
  ['core/report.js', 'recent work does not count more', 'vals.forEach((v, i) => { const w = i + 1; num += v * w; den += w; });', 'vals.forEach((v, i) => { const w = 1; num += v * w; den += w; });', false],
  ['core/report.js', 'halves round down', 'const roundMark = x => x == null ? null : Math.max(1, Math.min(4, Math.round(x)));', 'const roundMark = x => x == null ? null : Math.max(1, Math.min(4, Math.floor(x + 0.4)));', false],
  ['core/report.js', 'marks from outside the quarter count', 'm => m.date >= term.start && m.date <= term.end).map(m => m.value);', 'm => m.date <= term.end).map(m => m.value);', false],
  ['core/report.js', 'carried from the first earlier quarter, not the latest', 'const earlier = terms.filter(t => t.end < term.start).sort((a, b) => (b.end < a.end ? -1 : b.end > a.end ? 1 : 0));', 'const earlier = terms.filter(t => t.end < term.start).sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));', false],
  ['core/report.js', 'carry forward ignores its setting', 'if (r.n === 0 && st.carryForward) {', 'if (r.n === 0) {', false],
  ['core/report.js', 'a mark set by hand does not win', 'if (o && !o.deletedAt && o.value) return { v: o.value, over: true, n: r.n };', '', false],
  ['core/report.js', 'iReady marks always count', '.concat(st.ireadyInReport ? live.filter(m => m.source === \'iready\') : [])', '.concat(live.filter(m => m.source === \'iready\'))', false],
  ['core/report.js', 'readings graded against their own season', 'st.orfAgainst === \'season\' ? seasonIndex(date, st.orfSeasons) : 2', 'seasonIndex(date, st.orfSeasons)', false],
  ['core/report.js', 'a reading set not to count still counts', 'checks.filter(c => !c.deletedAt && !out.includes(c.id))', 'checks.filter(c => !c.deletedAt)', false],
  ['core/report.js', 'the stored v95 ORF marks count beside the readings', 'return live.filter(m => !m.source)', 'return live.filter(m => m.source !== \'iready\')', false],
  ['core/import-v95.js', 'an override on a line of several standards is guessed', 'if (!std || std.length !== 1 || !STD.test(String(std[0]))) { overKept++; continue; }', 'if (!std || !STD.test(String(std[0]))) { overKept++; continue; }', false],
  ['core/import-v95.js', 'readings set not to count come in counting', 'if (leftOut.length) f.orfLeftOut = leftOut;', '', false],
  ['contract/validate.js', 'an override\'s id is not checked', 'case \'ovr_<periodId>_<studentId>_<standard>\':', 'case \'override rule switched off\':', false],
  ['gradebook/gradebook.js', 'the grid shows a standard with no marks', 'const shown = codes.filter(code => [...grid.get(code).values()].some(f => f.v));', 'const shown = codes.slice();', 'tests/synergy.browser.test.js'],
  ['gradebook/gradebook.js', 'carried marks look like this quarter\'s', '${f.carried ? \' carried\' : \'\'}" data-cell=', '" data-cell=', 'tests/synergy.browser.test.js'],
  ['gradebook/gradebook.js', 'Go back does not remove a mark you set', 'else if (before && !before.deletedAt) after = Object.assign({}, before, { deletedAt: nowIso() });', 'else if (before && !before.deletedAt) after = Object.assign({}, before);', 'tests/synergy.browser.test.js'],
  ['gradebook/gradebook.js', 'a reading ticked off still counts', '      if (!el.checked) left.push(d.orfcount);\n', '', 'tests/synergy.browser.test.js'],
  // step 6c: groups & patterns
  ['core/groups.js', 'older marks count as much as newer ones', 'const w = Math.pow(GROUP_DECAY, a.length - 1 - i);', 'const w = 1;', false],
  ['core/groups.js', 'one heavily marked standard swamps the picture', 'parts.push(r.v); n += r.n;', 'for (let i = 0; i < r.n; i++) parts.push(r.v); n += r.n;', false],
  ['core/groups.js', 'the highest group is kept smallest', 'cap.push(base + (i >= kk - rem ? 1 : 0));', 'cap.push(base + (i < rem ? 1 : 0));', false],
  ['core/groups.js', 'a child moved by hand is regrouped by the marks', 'if (r.pinned) groups[Math.max(0, Math.min(kk - 1, pins[r.sid]))].push(r); else free.push(r);', 'free.push(r);', false],
  ['core/groups.js', 'a child with no marks is guessed into a group', 'else if (pin != null || r) seated.push(row);', 'else if (true) seated.push(row);', false],
  ['core/groups.js', 'ties are not broken by the broader picture', '(av - bv) || (ab - bb) ||', '(av - bv) ||', false],
  ['core/groups.js', 'a shared need merges children who do not share it', 'if (jac >= 0.5 && union.length <= 7)', 'if (jac >= 0 && union.length <= 7)', false],
  ['core/groups.js', 'a 3 counts as a need', 'lo ? m[sid] <= 2 : m[sid] === 4', 'lo ? m[sid] <= 3 : m[sid] === 4', false],
  ['core/groups.js', 'looking back ignores the window', 'if (!days || days === \'0\' || days === 0) return true;', 'return true;', false],
  ['core/groups.js', 'slipping flags a rise too', 'a[a.length - 1].value < a[a.length - 2].value', 'a[a.length - 1].value !== a[a.length - 2].value', false],
  ['core/import-v95.js', 'skill-group moves are not brought in', '        records.push(rec(`pin_${subject}_${standard ? stdKey(standard) : \'all\'}_${sid}`, \'groupPin\', { subject, standard, studentId: sid, group }));\n', '', false],
  ['gradebook/gradebook.js', 'Undo my moves leaves the moves', 'const writes = live.map(p => Object.assign({}, p, { deletedAt: now }));', 'const writes = live.map(p => Object.assign({}, p));', 'tests/groups.browser.test.js'],
  ['gradebook/gradebook.js', 'a dragged child does not move', '    if (sid) { await movePin(sid, Number(box.dataset.gdrop)); render(); }\n', '', 'tests/groups.browser.test.js'],
  ['gradebook/gradebook.css', 'the groups card wider than the iPhone', '.g-cols > *, .g-rail { min-width: 0; }', '.g-cols > *, .g-rail { min-width: 420px; }', 'tests/groups.browser.test.js'],
  // Phonics folded into Reading; the notes bar
  ['core/fold.js', 'Phonics blocks stay Phonics\'s', 'live.filter(r => r.type === \'block\' && ids.has(r.subjectId)).forEach(b => put(Object.assign({}, b, { subjectId: reading.id })));', '', false],
  ['core/fold.js', 'a Phonics note is dropped, not moved', '      if (text) {\n', '      if (false) {\n', false],
  ['core/fold.js', 'a note that fits nowhere is cut away', '        } else return;   // fits nowhere: leave this plan as it is\n', '        }\n', false],
  ['core/fold.js', 'any subject shown inside Reading is folded', '&& s.within === reading.id && /phonics/i.test(s.name || \'\');', '&& s.within === reading.id;', false],
  ['core/import-v95.js', 'the importer brings the Phonics box back', '      const f = F.foldPhonics(records, T);', '      const f = { writes: [], moved: 0 };', false],
  ['core/subplan.js', 'the sub plan prints Reading\'s targets during phonics', 'const opener = b.subjectId && subj[b.subjectId] && subj[b.subjectId].benchmark === true && /phonics/i.test(b.name || \'\');', 'const opener = false;', false],
  ['planner/planner.js', 'the planner does not fold older records', '    await foldPhonics();\n  } catch (e) { problem(\'The planner could not open: \' + e.message); return; }', '  } catch (e) { problem(\'The planner could not open: \' + e.message); return; }', 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'a change wipes the notes bar being typed in', '    if (a && a.dataset && a.dataset.daynote) { renderLater = true; return; }   // never redraw under the notes bar being typed in\n', '', 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'the notes bar is not saved when left', '      if (await saveText({ live: Object.assign({}, plan, { saved: true }), field: \'notes\', text: ta.value, about: \'day\', where: { date } })) { ta.blur(); render(); }', '      if (false) { ta.blur(); render(); }', 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'moving to another day from a note box shows the old day', 'addEventListener(\'hashchange\', () => { const a = document.activeElement; if (a && a.dataset && a.dataset.daynote) a.blur(); render(); });', 'addEventListener(\'hashchange\', () => render());', 'tests/planner.browser.test.js'],
  ['planner/planner.js', 'Keep it private leaves the note in the bar', '{ ta.blur(); render(); }\n      else ta.focus();', '{ render(); }\n      else ta.focus();', 'tests/planner.browser.test.js'],
  // step 7 part 1: ORF Assess
  ['core/orf.js', 'a third tap does not clear the mark', '    else { delete L.marks[i]; delete S.notes[S.editLap + \':\' + i]; }', '    else L.marks[i] = \'e\';', false],
  ['core/orf.js', 'marks after the last word are counted', '      if (L.stopTok != null && (+k) > L.stopTok) return;\n      if (L.marks[k] === \'e\') e++;', '      if (L.marks[k] === \'e\') e++;', false],
  ['core/orf.js', 'an earlier pass counts only to where it stopped', 'const w = L.stopTok != null ? S.tokens[L.stopTok].wi + 1 : isLast ? 0 : N;', 'const w = L.stopTok != null && isLast ? S.tokens[L.stopTok].wi + 1 : isLast ? 0 : N - 1;', false],
  ['core/orf.js', 'errors are not taken from the words read', 'const correct = Math.max(0, wordsRead - e);', 'const correct = wordsRead;', false],
  ['core/orf.js', '95% is not instructional', 'acc >= 95 ? \'Instructional\'', 'acc > 95 ? \'Instructional\'', false],
  ['core/orf.js', 'marked words saved in position order, not errors first', '    [\'e\', \'s\'].forEach(want => S.laps.forEach((L, p) => {', '    [null].forEach(want => S.laps.forEach((L, p) => {', false],
  ['core/import-v95.js', 'the passage library is not brought in', '      records.push(rec(id, \'orfPassage\', { title: cut(p.title, 80), text: p.text.slice(0, 20000) }));\n', '', false],
  ['core/import-v95.js', 'what they said is cut to 40 characters', '        if (cut(nt.said, 60)) m.said = cut(nt.said, 60);\n        marked.push(m);\n      });\n      selfCorr', '        if (cut(nt.said, 40)) m.said = cut(nt.said, 40);\n        marked.push(m);\n      });\n      selfCorr', false],
  ['orf/orf.js', 'paused time counts as reading time', '  const readSeconds = () => (now() - UI.startTs - pausedNow()) / 1000;', '  const readSeconds = () => (now() - UI.startTs) / 1000;', 'tests/orf.browser.test.js'],
  ['orf/orf.js', 'the timer never ends on its own', '      if (left <= 0) endRead(UI.dur);\n', '', 'tests/orf.browser.test.js'],
  ['orf/orf.css', 'a tag\'s tap area is too small', '.passage .tag::before { content: \'\'; position: absolute; left: -8px; right: -8px; top: -8px; bottom: -8px; }', '.passage .tag::before { content: \'\'; }', 'tests/orf.browser.test.js']
];

// node tests/mutations.js [name filter]   or   node tests/mutations.js --from=N --to=M (by position)
const arg = process.argv[2] || '';
const range = /^--from=(\d+)(?: --to=(\d+))?$/.exec(process.argv.slice(2).join(' '));
const only = range ? null : arg;
// A throwaway copy of the project.
function copyProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
  for (const d of ['contract', 'core', 'import', 'sync', 'planner', 'gradebook', 'orf', 'data', 'icons', 'settings', 'tools', 'tests']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'package.json', 'firestore.rules']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  if (fs.existsSync(path.join(ROOT, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}
// Control: the tests must pass on an unbroken copy, or every break would look caught (a folder missing from
// the copy once made a test fail in every copy).
{
  const dir = copyProject();
  const files = fs.readdirSync(path.join(dir, 'tests')).filter(f => f.endsWith('.test.js') && !/browser\.test\.js$/.test(f)).map(f => 'tests/' + f);
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: dir, encoding: 'utf8', timeout: 900000 });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) { console.log('CONTROL FAILED: the Node tests fail on an unbroken copy, so no break can be judged.\n' + (r.stdout || '').split('\n').filter(l => /^not ok|^# fail/.test(l)).join('\n')); process.exit(1); }
}
let missed = 0;
for (const [i, [file, name, from, to, browser]] of M.entries()) {
  if (range && (i < Number(range[1]) || (range[2] !== undefined && i > Number(range[2])))) continue;
  if (only && only !== '--node-only' && !name.includes(only)) continue;
  if (only === '--node-only' && browser) continue;
  const dir = copyProject();
  const p = path.join(dir, file), src = fs.readFileSync(p, 'utf8');
  if (src.split(from).length !== 2) { console.log(`SETUP ERROR: "${name}" does not match exactly once`); missed++; continue; }
  fs.writeFileSync(p, src.replace(from, to));
  const all = fs.readdirSync(path.join(dir, 'tests')).filter(f => f.endsWith('.test.js')).map(f => 'tests/' + f);
  // browser: false = the Node tests; true = every browser test; a path = just that browser test.
  const files = typeof browser === 'string' ? [browser] : all.filter(f => browser ? /browser\.test\.js$/.test(f) : !/browser\.test\.js$/.test(f));
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: dir, encoding: 'utf8', timeout: 900000 });
  if (r.error || r.signal) {   // cut off before the tests finished: no verdict either way
    console.log(`TIMED OUT: ${name}`); missed++;
    fs.rmSync(dir, { recursive: true, force: true });
    continue;
  }
  // Caught means a test failed. (A skipped browser test cannot fail, so a break it should catch shows as not caught.)
  const caught = r.status !== 0 && /# fail [1-9]/.test(r.stdout);
  console.log(`${caught ? 'caught' : 'NOT CAUGHT'}: ${name}`);
  if (!caught) missed++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(missed ? `${missed} not caught` : 'every deliberate break was caught');
process.exit(missed ? 1 : 0);
