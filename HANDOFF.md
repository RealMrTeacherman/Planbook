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

## Running the tests
`npm install` once, then `npm test` and `npm run test:breaks`. The browser test finds Chrome on its own on a Mac; elsewhere set `CHROME` to a Chrome binary.
