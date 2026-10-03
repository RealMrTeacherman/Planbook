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
  ['core/store.js', 'store skips the contract', 'const check = SuiteContract.validateFile(fileOf(next), contract);', 'const check = { ok: true };', true],
  ['core/store.js', 'a no-change load still writes', 'const touched = changes.length + v95Keys.length;', 'const touched = 1;', true],
  ['core/store.js', 'undo forgets kept v95 data', 'u.v95.forEach(x => x.before === null ? vs.delete(x.key) : vs.put(x.before, x.key));', '', true],
  ['core/store.js', 'upgrade not recorded', "tx.objectStore('meta').put(schema + 1, 'schemaVersion');", '', true],
  ['import/index.html', 'older file allowed', 'if (last && Date.parse(out.savedAt) < Date.parse(last)) {', 'if (false) {', true],
  // sync
  ['core/transport.js', 'phone file removed without updating the MacBook copy', 'const w = await fh.createWritable(); await w.write(JSON.stringify(f)); await w.close();', '', true],
  ['core/transport.js', 'refused files retried every few seconds', 'if (seen && seen.lastModified === file.lastModified) {', 'if (false) {', true],
  ['core/transport.js', '"not sent yet" never cleared', "await store.meta.set('unsentSince', null);", '', true],
  ['core/transport.js', 'Drive\'s "(1)" names ignored', '(?: ?\\(\\d+\\))?', '', false],
  ['core/transport.js', 'refused-file warning dropped after one check', "problems: refused });", "problems });", true],
  ['sync/index.html', 'list rebuilt over a half-typed name', 'sig !== box.dataset.sig && ', '', true],
  ['core/store.js', 'undo wipes edits made after the load', 'u.records.filter(stillFromLoad).forEach', 'u.records.forEach', true],
  ['core/store.js', 'an edit replaces the last load\'s undo', "if ((info.kind || 'load') === 'load') meta.put", 'meta.put', true],
  // live sync
  ['core/live.js', 'private records sent', 'if (!isLive(rec)) throw', 'if (false) throw', true],
  ['core/live.js', 'private records accepted from the server', 'const incoming = (msg.records || []).filter(isLive);', 'const incoming = (msg.records || []);', true],
  ['core/live.js', 'newer copy not sent again after a late older write', 'else if (incoming.length) await sendNewer(new Set(incoming.map(r => r.id)));', '', true],
  ['core/live.js', 'an undone file load leaves its days on other devices', 'if (LIVE.has(r.type)) push({', 'if (false) push({', true],
  ['core/live.js', 'nothing sent on first connect', 'if (!initialDone && state.connected) { initialDone = true; await sendNewer(null); }', '', true],
  ['core/names.js', 'name check matches inside longer words', '(?!${LETTER})', '', false],
  ['core/names.js', 'nicknames not checked', '(s.aka || []).forEach(add);', '', false],
  ['sync/index.html', 'labels saved without the name check', 'if (check.hits.length) {', 'if (false) {', true],
  ['firestore.rules', 'server rules allow deleting', 'allow create, update:', 'allow create, update, delete:', false],
  ['tools/make-rules.js', 'server rules stop checking the type', "request.resource.data.type == ${q(name)} && ", '', false],
  ['core/live-firebase.js', 'records written outside your own folder', "sdk.fs.doc(db, 'users', mustUser().uid, 'records', rec.id)", "sdk.fs.doc(db, 'records', rec.id)", false],
  ['sw.js', 'offline copy missing the sync page', "'sync/', 'sync/index.html'", "'sync/'", false]
];

const only = process.argv[2];
let missed = 0;
for (const [file, name, from, to, browser] of M) {
  if (only && !name.includes(only)) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
  for (const d of ['contract', 'core', 'import', 'sync', 'icons', 'settings', 'tools', 'tests']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'package.json', 'firestore.rules']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  if (fs.existsSync(path.join(ROOT, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  const p = path.join(dir, file), src = fs.readFileSync(p, 'utf8');
  if (src.split(from).length !== 2) { console.log(`SETUP ERROR: "${name}" does not match exactly once`); missed++; continue; }
  fs.writeFileSync(p, src.replace(from, to));
  const all = fs.readdirSync(path.join(dir, 'tests')).filter(f => f.endsWith('.test.js')).map(f => 'tests/' + f);
  const files = all.filter(f => browser ? /browser\.test\.js$/.test(f) : !/browser\.test\.js$/.test(f));
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: dir, encoding: 'utf8', timeout: 180000 });
  // Caught means a test failed. (A skipped browser test cannot fail, so a break it should catch shows as not caught.)
  const caught = r.status !== 0 && /# fail [1-9]/.test(r.stdout);
  console.log(`${caught ? 'caught' : 'NOT CAUGHT'}: ${name}`);
  if (!caught) missed++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(missed ? `${missed} not caught` : 'every deliberate break was caught');
process.exit(missed ? 1 : 0);
