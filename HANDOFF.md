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
| `tests/` | Node tests, a real-browser test, deliberate breaks (`mutations.js`), the names guard. |

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
- **The look is "Color blocks"** (chosen by the teacher from four directions). `core/look.css` holds the shared tokens; `planner/planner.css` the tiles. A subject's color is deepened in `planner.js` (`deep`) until white text reaches 4.5:1; never hand-pick a chip color without that check.
- Desktop and phone are equal: each release is checked by screenshot at 1280 px and 390 px. The Week view is a grid from 900 px and a list below.

## The family email
- `core/family-v95.js` is generated: re-run `node tools/extract-family.js <v95 curriculum.js>` rather than editing it.
- `core/family.js` builds the email; `data/family-email.json` holds the Writing wording and the closing sentence's rules.
- The gate test needs the v95 suite on the machine (`V95_DIR`); it is skipped elsewhere.

## Running the tests
`npm install` once, then `npm test` and `npm run test:breaks`. The browser test finds Chrome on its own on a Mac; elsewhere set `CHROME` to a Chrome binary.
