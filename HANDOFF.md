# HANDOFF — classroom suite rebuild

The rebuild of the v95 suite as two tools on one written data contract: Gradebook + Planner, and ORF. The plan and its eight steps are in the build plan doc; `CHANGELOG.md` has each step, newest first, mistakes included.

## Where things are
| Path | Does |
|---|---|
| `contract/contract.json` | The data contract. Every record type, its owner, its fields, and where it came from in v95 (`fromV95`). |
| `contract/validate.js` | Checks a sync file or display file against the contract. Browser and Node. |
| `core/merge.js` | Record-by-record merge. Pure. |
| `core/import-v95.js` | v95 sync file → contract records + every v95 key kept whole. Pure. |
| `core/store.js` | IndexedDB store: contract check before every write, one transaction per load, exact undo, schema upgrades. |
| `core/look.css` | The one look (v92's). |
| `import/` | The import page. |
| `core/transport.js` | The only code that moves files: the MacBook's watched folder, the iPhone's Send and Load. |
| `sync/` | The sync page. |
| `index.html`, `sw.js`, `manifest.webmanifest`, `core/boot.js`, `icons/` | Home page, offline copy, home-screen app. |
| `core/live.js`, `core/live-firebase.js` | Live sync for live record types, and its real Firebase backend. |
| `core/names.js` | The name check for live text fields. |
| `settings/firebase.js` | Firebase settings. Empty means live sync is off; the Creslane copy ships empty. |
| `core/plan.js` | Planner logic: positions, Reveal stepping, suggestions, day status, day layout. Pure; tested against v95. |
| `planner/` | The planner page: Day and Week, phone and desktop. |
| `data/` | The district calendar, Reveal guide, Benchmark scope and sequence, planner defaults. Extracted from v95's code by running it. |
| `firestore.rules`, `tools/make-rules.js` | Server security rules, generated from the contract. Re-run the tool after any contract change. |
| `core/grade.js` | Gradebook logic: the day's lesson, a guide day's standards (v95's rule), assignments, every entry action with exact undo. Pure; tested against v95. |
| `core/colors.js` | Subject colors (`deep`, `tint`), shared by every page. |
| `gradebook/` | The gradebook page: Enter scores and Settings (class list, standards). |
| `tests/` | Node tests, real-browser tests, deliberate breaks (`mutations.js`), the names guard. |

## Rules carried over from v95
- No real student name in any file: code, tests, docs. Fixtures use invented names. Private files (standing sub notes, Walk to WIN lists, `private-names.txt`) are never committed; `.gitignore` lists them.
- Nothing is built without an approved plan.
- Every release: all tests from a clean unzip, checksums, a frank changelog.
- A new test must fail on deliberately broken code (`npm run test:breaks`) and screens are checked in a real browser.
- A load never loses work, an older file is refused, the last load can be undone.

## Rules new in the rebuild
- No protected files; every file is the suite's own.
- One copy of everything; one owner per record type (see the contract).
- Defaults are data, never text baked into code.
- Phone first for marking and day planning.

## Sync, and what is easy to break
- `classroom-suite.json` in the watched folder is the MacBook's full copy. Files named `suite-from-<device>-<id>.json` (also with Drive's " (1)" and as .txt) are sent from other devices.
- The MacBook rewrites its copy **before** removing a sent file, so a crash in between loses nothing.
- A file the MacBook refuses is remembered by name and time and not retried until it changes; the warning stays while it is in the folder.
- **Send must not wait for anything before `navigator.share`.** Safari needs the tap. The send-ready file is kept current in memory after every change for this reason.
- Undo is for loads. Edits do not replace it, and undoing a load keeps records changed since.
- `sw.js` caches files one by one and fetches pages network-first (both from v95 failures). Its `VERSION` must match `package.json`; a test checks.

## Live sync, and what is easy to break
- Two paths, chosen by each type's `space` in the contract. Live types sync through Firebase at `users/<uid>/records/<id>`; private types use only the Drive folder.
- `live.js` never sends a private record and ignores one arriving. The server rules refuse them too. All three are tested.
- If the server shows an older copy than a device holds (a late older write), that device sends its newer copy again. This keeps every device in step; a test proves the case occurs.
- Live sync runs on pages that load `core/live.js`; for now only the Sync page. **Every page that edits live records must start it** (step 4's planner pages).
- After changing the contract, run `node tools/make-rules.js`, then paste the new `firestore.rules` into the Firebase console.
- Firebase's code comes from Google's CDN at the version in `core/live-firebase.js`. The offline copy keeps the same version; a test checks they match.

## The planner, and what is easy to break
- A lesson is one `lessonPlan` per subject per day (`les_<date>_<subjectId>`). No record means "suggested": the next position after the last day **marked taught**.
- A day off on the calendar wins over a plan; to plan on it, remove the day off. The district calendar is applied on every planner open with an early timestamp, so any change you make wins and a removal stays removed.
- Every save of planner text goes through `nameCheck`. The importer moves name-bearing notes to `privateNote` and **refuses to run without the name check**; every page that imports must load `core/names.js` first.
- **The look is "Color blocks"** (chosen by the teacher from four directions). `core/look.css` holds the shared tokens; `planner/planner.css` the tiles. The page header and tabs are in `core/look.css` too, for every page. A subject's color is deepened by `deep` in `core/colors.js` until white text reaches 4.5:1; never hand-pick a chip color without that check.
- Desktop and phone are equal: each release is checked by screenshot at 1280 px and 390 px. The Week view is a grid from 900 px and a list below.

## The family email
- `core/family-v95.js` is generated: re-run `node tools/extract-family.js <v95 curriculum.js>` rather than editing it.
- `core/family.js` builds the email; `data/family-email.json` holds the Writing wording and the closing sentence's rules.
- The gate test needs the v95 suite on the machine (`V95_DIR`); it is skipped elsewhere.

## Sub plans
- `core/subplan-v95.js` is generated: re-run `node tools/extract-subplan.js <v95 sub-plans.js>`.
- `core/subplan.js` supplies the copied builders with the day (blocksFor, lessonFor, notes, math board) from records.
- Standing notes are `subPlan` (one record, `subplan_main`) and per-block `subBlock`; both private.

## The gradebook, and what is easy to break
- Everything is private (Drive path): `mark`, `missingWork`, `gradebookSettings`, and the class list. So the iPhone's tracked standards come with the Drive file, like its marks.
- **One mark per child, per standard, per day** (what v95 actually does). The id is built from them (`mark_<source_><studentId>_<standard>_<date>`, dots as dashes), so two devices make one record. A derived mark (ORF, iReady) carries `source` and its own id.
- **Undo is exact and per action** (a mark, a change, a clear, a batch). It puts back only what has not changed since, on either device. v95's "remove the newest mark" is not copied.
- The card follows the planner's lesson for the day (planned, else suggested) when it opens and when the date changes, and takes the lesson's first standard and name, never over a typed name or beside unnamed marks. If every mark on a standard and day shares one name, the card takes it, so re-marking never renames.
- A note typed before a mark is held and saved with the mark. **Never redraw under a field being typed in**; the page waits until it is left (a test and a deliberate break cover it).
- **Phonics is part of Reading** (`core/fold.js`): no subject of its own. The importer and the planner both fold, so do not re-create Phonics as a subject or set it inside Reading. A Reading block named Phonics opens Reading in the sub plan without the lesson's targets (`core/subplan.js`); `core/subplan-v95.js` is v95's code and must stay byte for byte.
- **The day's notes** live in `dayPlan.notes`, edited in the notes bar; the bar is protected from redraws while typed in, and is left (saved) when the page moves to another day.
- **For Synergy** shows only what `core/report.js` says (v95's calculation). Stored ORF marks from the v95 import are not used: the readings are, as v95 rebuilds them on load. A reading v95 counted but the importer held back (counts that do not add up) gives no mark, on purpose; the gate checks v95 still does this. ORF norms are `data/orf-norms.json`, from `tools/extract-orf-norms.js <v95 suite-orf.js>`.
- The standards catalog is `data/standards-grade2.json`, extracted by `node tools/extract-standards.js <v95 gradebook/index.html>`.
- `core/grade.js`'s step-to-standards rule is checked against v95's `curriculum.js` at all 143 guide steps; the gate (`tests/gradebook-v95.browser.test.js`) runs v95's gradebook in Chrome.

## Releasing
- **Wait for GitHub's run to finish green** before calling a release done. Tests comparing against v95 skip there, so a deliberate break must also be caught by a test that needs no v95: check with v95 hidden and `node tests/mutations.js --node-only`.
- **Any change to a cached file needs a new `VERSION` in `sw.js`** (and `package.json`), or devices keep the old script. Step 4d's follow-up missed this once.
- **A new folder must be added to `copyProject` in `tests/mutations.js`.** The runner now checks an unbroken copy passes first (it once did not, and every break looked caught).
- **Never run two full test suites at once** (or a suite beside the break check): the machine slows enough that browser checks with fixed 30 s waits (the sync page's "order 2") time out. A long command that hits the 5-minute tool limit can leave its background job running; check `ps` before judging a failure.
- A page keeps choices made as it opened (the Groups standard, as v95 does); a test that adds data afterwards must reload, and navigating to the same address with only a new hash does not reload.
- In browser tests, wait for the page to stop redrawing (`settled`) before reading or tapping, change one menu at a time, and read an element in one `evaluate`, not `$eval` (a redraw can land between finding and reading).

## Where the build stands, and what is next

Done and passed on the teacher's devices: 0 contract, 1 store and v95 import, 2 Drive-folder sync (MacBook side; the iPhone uses the Drive app: Send to the Drive app, Load via Drive → Send a copy → Save to Files), 3 live sync (Firebase), 4a–4d planner (Day, Week, Settings, family email, Phonics inside Reading, Agenda look per device), 5 sub plans. 6a Enter scores (device gate passed: an iPhone mark reached the MacBook through the Drive app). **6b released without its export** (For Synergy view, the calculation, ORF marks, overrides); the export waits for the teacher's Synergy template, available when the grading window opens. **6c released** (Groups & patterns, design C); its device check is the teacher's. **Phonics folded into Reading** (`core/fold.js`; the teacher's choice, Oct 2026) and **a notes bar on every day** (Day and Week views).

**Now: step 6, the gradebook.** Approved shape (from v95's 5,346-line gradebook/index.html; an earlier note here said 5,472, a miscount):
- **6a: Enter scores.** Phone-first entry opening on the day's Reveal lesson (v95 `plannedStepOn`, `followDayLesson`); assignments are marks sharing std + date + ctx; undo; "not turned in". Roster in Settings (add, rename, ELD, aka, Synergy id). Import the 524 marks (gb2_standards_v1.scores; derived marks carry `source`). All private (Drive path). Gate: a mark entered on the iPhone reaches the MacBook through the Drive app (the step 2 device gate). **Approved details (Oct 2026):** one mark per child per standard per day; imported iReady marks kept, shown as derived; Grade all together in 6a; design A ("Roster list") with an always-visible note line, under the marks on the phone and beside them on the MacBook. **Done**; device gate passed.
- **6b: Marks for Synergy** (revised and approved Oct 2026; grading itself is done in Synergy). For each child × **Oregon standard** × quarter: v95's calculation exactly (`computeMark` rule weighted / mean / latest, default weighted; `roundMark`; carry forward from the latest earlier quarter with marks, else earlier work; `finalMark` with overrides), as v95's `lineMark`/`carriedMark`/`finalMark` with a line of one standard. ORF feeds **2.RF.4 only** (comprehension does not count), worked out from the ORF checks against end-of-year H&T 2017 with v95's cuts 4 = 75th, 3 = 50th, 2 = 25th; a check marked "don't count" stays out. iReady marks only if switched on. Overrides per quarter × child × standard. A MacBook preview (children in last-name order × standards with marks or carried; cell detail; gaps before you submit) and a phone view-and-fix. **Export:** shaped exactly like the teacher's Synergy Grade Book Import file (TeacherVUE wants .xlsx); built when the teacher sends a blank template. Quarters are edited in **Planner Settings** with the calendar (gradingPeriod is the planner's). Dropped from v95: report-card lines and their editor, the entry sheet printout. Gate: v95's own functions in Chrome, called with one-standard lines, match every child × standard × quarter under all three rules, carry on and off. **Built (Oct 2026), except the export:** `core/report.js`, the For Synergy tab, ORF settings in Gradebook Settings, contract 8 (`markOverride`, optional Synergy-mark settings). Gate `tests/report-v95.browser.test.js` passes with zero differences. **Next for 6b:** the export, from the teacher's blank Grade Book Import template (header row with made-up values; names and ids removed). Device check for the teacher: a mark set by hand on the iPhone reaches the MacBook through the Drive app.
- **6c: Groups & patterns** (approved Oct 2026: all of v95's tab; **design C, "One dashboard"**: skill groups on the left as a 2×2 grid, Worth a look and the shared needs alongside, Class at a glance underneath; on the iPhone, groups stacked and a "Move" sheet). Ported exactly: skill groups (`buildSkillGroups`, GROUP_DECAY 0.62, even groups with the lowest smallest, pins kept per subject and standard, "Not placed", "Undo my moves"), groups with a shared need (`buildNeedGroups`: Reteach / More practice) and Ready to extend, Worth a look (slipping, thin data), Class at a glance; the evidence and look-back choices. Left out: the iReady-only parts (rows stay in kept v95 data) and the planning analysis (Planning tab left out). **The Small Groups board link (send / take back) waits until Small Groups is rebuilt.** Pins become a private record (contract 9), imported from groupPins. Gate: v95's own functions in Chrome on a year of invented marks with pins give the same groups. **Built (Oct 2026):** `core/groups.js`, the Groups tab, contract 9 (`groupPin`), gate `tests/groups-v95.browser.test.js` (every subject × standard × 2–6 groups × evidence × look-back, plus the drawn Worth a look and Class at a glance), zero differences. On purpose: only children in the class are grouped (v95 grouped everyone on its list).
- **To revisit after 6b: marks through live sync, encrypted.** The teacher asked for marks to reach the other device without the Drive app. Agreed direction, not yet a plan: the devices share a key (sent once in the Drive file, like the class list) and encrypt each gradebook record before it goes live (child, mark, note, what it was; record ids made with a keyed hash, so one-per-day merging still works). Firebase would hold only unreadable text; it still sees how many records and when. Rotating student ids was considered and is weaker (history must stay joined for the report card). Plain id-only marks in Firebase were set aside: nothing about an individual child is in Firebase today, and it may need district approval. Mention to district IT alongside the `drive.file` request. If adopted, ORF checks and groups could later be encrypted the same way.
- **Left out by the teacher's choice:** the iReady, Students, Planning and Fluency tabs (ORF has its own step 7). The 51 iReady rows stay in the kept v95 data.

Each release keeps the habits: a plan approved first, tests from a clean copy, deliberate breaks (`npm run test:breaks`), screenshots at 1280 and 390 px in both looks, a frank CHANGELOG, a new `VERSION` in sw.js, and GitHub's run green.

## Running the tests
`npm install` once, then `npm test` and `npm run test:breaks`. The browser test finds Chrome on its own on a Mac; elsewhere set `CHROME` to a Chrome binary. Tests that compare against v95 look in `V95_DIR` (default `/home/claude/v95/classroom-suite`; the teacher's v98 zip is that copy) and skip when it is absent; `V95_DIR=/nonexistent` runs them as GitHub does.
