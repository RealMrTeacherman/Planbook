# Changelog

## Step 3, follow-up — your Firebase settings

- `settings/firebase.js` now holds your Firebase project's settings, so live sync is on for your site.
- Two tests assumed that file was always empty. The settings check now accepts empty or a complete setup and rejects a half-filled one; I confirmed all three cases. The "live sync is off" test now hands its page an empty file itself.
- Every test page now sees empty settings, so GitHub's test machines never contact your real Firebase.
- Still owed for step 9: the Creslane share copy must ship with empty settings, checked by a test there.

## Step 3 — live sync for the planner

**What it does.** Records the contract marks **live** (for now the school year, days off and grading periods; the planner's types join in step 4) sync instantly between devices through Firebase on your personal Google account. Edits made offline wait and go up on reconnect. Everything marked **private** never leaves on this path. The Sync page has a Live sync section (sign in, connection, last change) and a Try live sync list of days off.

**Files.**
- `core/live.js`: the live-sync logic, written against a small backend interface.
- `core/live-firebase.js`: the real backend (Firebase Auth by email and password, Firestore with its offline cache).
- `core/names.js`: the name check.
- `settings/firebase.js`: your Firebase settings. It ships empty, which means live sync is off.
- `firestore.rules`: the server's security rules, made by `tools/make-rules.js` from the contract.

**Protecting student data, three ways.**
- The contract gives every type a `space`. Tests prove that anything naming or pointing at a child is private, and that no live type points at a private one.
- The app refuses to send a private record, and ignores one if it ever arrives.
- The server's rules allow only your sign-in, only live types, only their listed fields, and no deleting. The rules are generated from the contract, and a test fails if the two disagree.

**The name check.** Before a live text field is saved, it is checked against first names, nicknames, display names and last names on this device's class list. Whole words, any case: "Mila's" counts, "Milan" does not. A match asks before saving. A device with no class list says it cannot check.

**Changes to earlier files.**
- Store change events now carry the changed records.
- Only file loads can be undone. Changes arriving by live sync leave "Undo the last load" alone.
- An undone file load removes its live days on every device, as deletions.
- The iPhone's Send and Load wording now describes the Drive-app route, since the Files connection is blocked.
- Messages appear at the top of the Sync page.

**Mistakes in this step, found and fixed before release.**
- Two of my new tests were wrong. One mistook the field name `deletedAt` for permission to delete. The other compared two identical lists from different JavaScript sandboxes, which never count as the same.
- The iPhone's Send and Load help still described the Files picker your district blocks.
- Day-off dates ran into their labels.

**Tests.** 144 tests. The live-sync gate test runs a MacBook, an iPhone and an iPad without a class list in three Chrome profiles, against a stand-in Firebase that applies the same rules. The hardest case is checked to actually happen, not just to come out right: both devices edit the same day offline, the iPhone's older edit reaches the server after the MacBook's newer one, and every device and the server still end on the newer edit. `npm run test:breaks` makes 50 deliberate breaks.

**Not tested here.** Real Firebase. My test machine cannot reach it, so the first real connection is this step's gate on your devices.

## Step 2 — MacBook and iPhone sync

**What it does.** `sync/` keeps the MacBook and iPhone in step through one folder in the district Google Drive, with no Google sign-in.
- **MacBook (Chrome):** choose the folder once. The MacBook keeps its full copy there as `classroom-suite.json`, rewritten a moment after every change. It checks the folder every 8 seconds while open, merges any file sent from the iPhone, and then removes it (Drive keeps it in its trash for 30 days).
- **iPhone:** **Send** opens the share sheet (Save to Files → Google Drive → the folder). **Load** picks `classroom-suite.json` from Google Drive. The page shows when it last sent and loaded, and flags changes not sent yet.
- **Home-screen app and offline:** `Planbook` installs to the iPhone home screen and opens with no signal. The home screen also matters because Safari clears a website's saved data after 7 days unvisited, and home-screen apps are exempt.
- **Try it:** rename math groups on each device to check sync for yourself.
- `index.html` is a small home page linking to Sync and to the v95 import.

**Files.** `core/transport.js` (the only code that moves files), `sync/index.html`, `index.html`, `sw.js`, `manifest.webmanifest`, `core/boot.js`, `icons/`.

**Changes to step 1's files.**
- `core/store.js` tells the page when data changes, and can ask the browser to keep its data.
- **Undo is for loads only.** An edit no longer replaces the last load's undo, and undoing a load keeps anything changed since then. Before this, renaming a group after a load made Undo undo the rename while saying it undid a load.
- The import page no longer shows v95's file name as if it were a device ("on classroom.mac-6717bf.json").

**Mistakes in this step, found and fixed before release.**
- A refused file in the folder was reported for 8 seconds, then the next check wiped the warning. It now stays until the file is gone.
- The MacBook's background check redrew the Try it list every 8 seconds, wiping a name typed but not yet saved. The list now redraws only when the groups change.
- The Save buttons used the class name `small`, which is also the grey small-text style, so their text was grey on teal. They now use `compact`.
- The gate test was flaky (2 failures in 5 runs) because it read the screen before the page had redrawn. It now waits for the page to settle, as a person would; 12 runs of 12 then passed.

**Tests.** 100 Node and real-browser tests. The browser gate test runs a MacBook and an iPhone as two separate Chrome profiles, served under `/Planbook/` as GitHub Pages serves it, with a real folder standing in for Drive. It covers both editing offline, swapping files in either order, the same group renamed on both, Drive's "(1)" names, refused files, older-version files, undo, and opening with no signal. `npm run test:breaks` makes 39 deliberate breaks; all 39 are caught.

**Not tested here.** A real iPhone's share sheet, the Files picker, and Google Drive for Desktop itself. Those are this step's gate on your devices.

## Step 1 — data store and v95 importer

**What it does.** `import/` loads a v95 sync file. It shows what the file holds before anything is written, then loads it in one go, and the last load can be undone. Everything v95 stored comes across: contract records are converted, and every v95 key is also kept exactly as v95 wrote it, for the steps that convert marks, planner days, sub notes and Walk to WIN.

**Files.**
- `core/merge.js`: record-by-record merge. Newer change wins; ties go to the larger device name; same content is not a change. The result does not depend on load order.
- `core/import-v95.js`: v95 file → contract records. Ids come from v95 ids and every record carries the file's own time, so a second load of the same file changes nothing.
- `core/store.js`: IndexedDB. Checks the whole result against the contract before writing, writes in one transaction, keeps an exact undo, runs schema upgrades once each.
- `core/look.css`: v92's one look, carried over.
- `import/index.html`: the page.

**How v95 data is read** (each checked against v95's own code):
- An ORF check finds its child through the gradebook's copy of the reading, the `gb:` id, `orfLink`, or a link learned from another reading by the same ORF student, in that order. An ORF student linked by none of these comes in as an inactive student and is reported.
- Dates are the Oregon day the reading was taken. A date moved by hand in the gradebook wins.
- WCPM is never recalculated. A check whose stored WCPM disagrees with its counts is held back and reported, and stays in the kept v95 data.
- The ORF tool's demo class is left out.

**Contract change.** Ids may now be up to 100 characters after the prefix (was 60). A reading placement built from long v95 ids could pass 60.

**Mistakes in this step, found and fixed before release.**
- The id helper added a hash to short pieces like `fox` and `t1` even when the full id was already long enough. Three importer tests caught it.
- The browser test's server did not serve `index.html` for a folder, so the first browser run failed every check.
- One deliberate break matched two lines and could not run; it now names the exact line.
- The break checker counted a run with any skipped test as "not caught", so from a clean unzip (where the names guard skips) it reported 25 misses. It now counts a break as caught when a test fails.

**Tests.** 77 Node tests and 12 real-browser checks in Chrome at 390 px and 1280 px. `npm run test:breaks` makes 30 deliberate breaks across the checker, merge, importer, store and page; all 30 are caught. `tests/no-names.test.js` is v95's names guard, skipped without the private names file.

**Not done yet.** Your real v95 file has not been loaded. That is this step's gate.

## Step 0, revision 2 — contract matched to v95

- The contract now follows what v95 actually stores, and each type names its v95 source (`fromV95`).
- Students gain `eld`, `aka` (nicknames) and `districtId` (v95's Synergy `sid`).
- ORF checks follow v95: `passes`, `selfCorrections`, `passageWords`, `pausedSeconds`, `takenAt`, and one `marked` list for missed and self-corrected words with what the child said. WCPM uses v95's exact expression, so part-second times give the same number.
- New types: `orfGoal` (typed goals only) and `unit` (reading volunteer units). Reading placements belong to a unit.
- Math groups carry their starting station and a page per station; stations say whether they take pages.
- Mistake in revision 1: it assumed extra ORF passes were practice reads kept outside the check. In v95 several passes of one passage inside the timed read are one check.
- Mistake in revision 1: deleted records skipped their envelope check. Caught by its own test and fixed.
- 26 tests; 14 deliberately broken validators, all caught.
