# Changelog

## Step 4b — the planner's Settings

**A Settings tab beside Day and Week.**
- **Schedule:** pick Monday to Friday; edit each block's time, name, subject and standing note; add or delete blocks; copy another weekday's schedule. Blocks sort by time, and every change syncs live. A standing note that names a child can be kept private.
- **Subjects:** name, color (twelve swatches, each deepened for contrast), curriculum, how it is counted, unit sizes, on/off, the Reveal and Benchmark switches, quick picks for free-text subjects, and adding a subject.
- **Calendar:** first and last day, the early-release weekday, the grading periods, and every day off (rename, remove, add).
- **Reveal Math · the year:** where the pacing guide puts each unit on this year's calendar, beside what was taught, and which unit the guide has you in. Ported from v95's `plan()`; a test runs v95's own code on the district calendar and the two agree date for date.
- **On the Math card:** "on pace with the guide" or "the guide has you in Unit 3 by now".
- **Jump to a lesson:** tap a card's big position to choose a Reveal lesson from the guide, or type a unit, week and day.

**Contract version 3:** a subject may carry `picks` (its quick choices). No other record changes; version-2 files upgrade on load. **Paste the new `firestore.rules` into Firebase**: the old rules refuse a subject with picks.

**Mistakes found and fixed before release.**
- A change from the other device would have redrawn Settings and wiped a field you were typing in. Settings now waits until you leave the field; a test and a deliberate break cover it.
- The deliberate break for a missing upgrade step pointed at the 1→2 step, which the tests no longer exercise. It now removes the newest step.
- Repeated column labels on every schedule row; they show once on the MacBook (screen readers still hear them on every row).
- In my tests: clicks that raced the redraw after choosing a weekday, and an older test that assumed the Week view was still open.

**Tests.** 209 tests (208 pass, 1 skipped), with 35 checks in the planner gate test, including the 4b gate: a schedule change on the iPhone shows on the MacBook within seconds. Deliberate breaks: 67.

## Step 4a, design — typed subjects show their key word in This week

- In the This week grid, a typed subject (Science, WIN, STEAM, Health/SEL, the 9:45 block) shows the first meaningful word you typed ("Plants: what do they need?" → Plants; "More math" → Math), not a ✓ or a dot.
- A taught word shows in its subject's color and bold, rather than with a ✓, so the word has room. Hovering shows the full text and "taught". Curriculum positions keep "W1 D1 ✓".
- To give the words room, the subject column is a little narrower and the cell padding a little smaller. A test checks the word fits its cell.
- A correction to the last entry's commit message: it said 199 tests; it was 198 (197 passing, 1 skipped).

## Step 4a, design — a subject's blocks fold into its card

- A subject's later blocks (Reading's 8:50 whole-group and 9:10 small groups, Math's core lesson and small groups) no longer get rows of their own. They are small lines inside the subject's card, each with its time, name and standing note.
- A note for one of those blocks today shows on its line, and so do private notes for it.
- The card's time chip shows the whole span, e.g. 8:30–9:30.

## Step 4a, design — wider, and the day comes first

From your first look at Color blocks with your real schedule.
- **Uses more of a wide screen.** The page grows to 1680 px, the side column to 420 px, and on screens 1400 px and wider the curriculum boxes go three across.
- **This week, beside the day** on the MacBook: each subject's lesson Monday to Friday, ✓ for taught; tap a day to open it. Free-text subjects show a mark, with the words on hover. Hidden on the iPhone, which has the Week tab.
- **Lessons not on the day's schedule fold away.** One line at the bottom, "Not on Wed's schedule · Writing · Science / SS", opens to their tiles. They are never among the scheduled rows.

**Mistakes found and fixed before release.**
- The week grid first cut subject names to "Pho…", let long free text wrap down the column, and wrapped the ✓ under the position.
- In my tests: a visibility check Chrome does not support for closed folds, a selector that also matched the folded list, and a new test that left the MacBook on a different day for the next two tests.

## Step 4a, design — Color blocks

**The look you chose (direction B), on every page.** Each lesson is a tile in its subject's color, with a big bold position (U1 · L1) and large buttons; routines are slim white rows. The type is Figtree for reading, Bricolage Grotesque for headings and positions, and JetBrains Mono for standard codes. The date is the page heading. The day panel and the week grid match.

**The curriculum in every tile.**
- Reveal: learning targets, materials, standards with their Oregon codes (or the note that Unit 1 is grade 1), and what comes next.
- Benchmark: the essential question, the week's texts, skills with mapped Oregon standards, words, strategies, word study, and writing and grammar.
- On the MacBook every section shows; on the iPhone the first two are open and the rest open with a tap.
- Benchmark's mapped standards now travel with the data (`data/benchmark-grade2.json`, `parts` per week), extracted from v95's code.

**Every instruction period gets a bold header.**
- STEAM and Health/SEL are now subjects; your schedule blocks with those names are linked to them.
- The Wednesday 9:45 block is now **Assembly / Enrichments / Other**, its own subject in indigo. Quick picks (Assembly, Enrichment, More math, More reading, Science, Social studies) set the day's header; the pencil writes your own. The picks are data in `data/planner-defaults.json`.
- Free-text subjects (WIN, STEAM, Health/SEL, the 9:45 block) show the day's topic as the big header, with "Add today's topic" until you set one.

**Contrast.** White text on a subject's color must reach 4.5:1, so a light color is deepened automatically (Math's v95 amber was 2.4:1). A test checks every chip.

**Mistakes found and fixed before release.**
- Long positions wrapped onto two lines on the iPhone.
- The line under each tile crammed the last lesson, the blocks and the standing notes into one run. They are now three lines.

**No contract change**, so the Firebase rules from step 4a still apply. The new subjects come from the importer, so **load a fresh v95 sync file**: an already-loaded file carries the same time, so it would not replace what is there.

**Tests.** 195 tests, including the new design's curriculum sections, the quick picks, the pencil, and contrast.

## Step 4a — the planner: Day and Week

**What it does.** `planner/` is the new planner, laid out for both the iPhone and the MacBook.
- **Day:** the day in schedule order. Each subject's card sits at its first block, with:
  - its lesson, which you can step with ‹ ›; Reveal and Benchmark titles show under it
  - the next lesson suggested after the last one taught
  - Mark taught, and a note
  Plain blocks show their standing note and a note for that day. Beside or above the schedule: the day's flags, its notes, and private notes. Days off, weekends and Wednesday early release are marked.
- **Week:** subjects by days on the MacBook; a list of days on the iPhone. Any cell opens that day.
- Everything syncs live. On the MacBook, the planner page also keeps the Drive folder copy current.

**Contract version 2.** New live types: `subject`, `block` (one per block per weekday), `dayPlan`, `lessonPlan` (one per subject per day), `blockNote`. New private type: `privateNote`. Version 1 records are unchanged; a version-1 file from a device that has not updated yet is upgraded and loaded.

**Data, not code.** The district calendar (31 days off, first and last day, Wednesday early release), the Reveal pacing guide, the Benchmark scope and sequence, and the default subjects and schedule. All are now JSON in `data/`, extracted by running v95's own code, not retyped.

**Importing v95's planner.** Subjects, every weekday's schedule, planned days, lessons (Reveal's openers, probes and tests kept), flags and block notes. A block note for a block that is gone joins that day's notes.
- **Planner notes that name a child become private notes**, so they never go to live sync.
- Names left in a block name, subject name or lesson text are reported, because they will sync live.

**The name check, three ways.** A planner note that names a child asks: Keep it private (Drive path only), Save it live anyway, or Edit it.

**Ported from v95 and checked against it.**
- Reveal stepping matches v95's `curriculum.js` at all 143 steps of the guide and from leftover positions.
- Times with no AM/PM sort as a school day (1:00 after 11:40).
- The suggestion counts only days marked taught.

**Left out, by your choice:** v95's Team tab. The family preview is step 4c.

**Mistakes in this step, found and fixed before release.**
- **A privacy bug.** The import page did not load the name check, and the importer quietly skipped it, so imported notes naming a child would have gone live. My Node tests passed because Node found the module another way; the browser screenshot showed it. The page now loads the check, and the importer refuses to run without it. A test proves the refusal, and a deliberate break proves the test.
- The "Mark taught" toggle had a tangled condition, and clearing a never-saved note would have crashed. Both were found on rereading.
- The iPhone week ran lesson titles into the ✓ ("✓Unit 1"). The MacBook day had loud note buttons and steppers at opposite edges.
- The import report still listed the planner as "kept for later" after it was converted.
- A gate check compared the two devices at a fixed moment; it now waits until they agree.

**Tests.** 188 tests. The planner gate test runs a MacBook and an iPhone, with the stand-in Firebase. The MacBook imports v95 and the iPhone receives the planner live. The same lessons show day by day on both devices. Edits made on either device arrive on the other: steps, taught, flags, free text and notes. All three name-check answers are tested, and private notes never reach the server. The planner also opens offline. `npm run test:breaks`: 62 deliberate breaks.

**Found after the push, by GitHub's own test run.** It failed on the deliberate breaks, and the cause was two weaknesses in my tests:
- **The break runner gave each break 3 minutes.** With four browser test files, a run took about 3½ minutes and was cut off before its tally, which the runner counted as "not caught." Each break now runs only the test file for its feature (about a minute), the limit is 15 minutes, and a cut-off run reports TIMED OUT instead of a verdict.
- **The "untaught day doesn't count" test never set up that case:** the untaught lesson fell on the same date being suggested. It now puts one in between, and that break is caught.

**You need to do one thing:** paste the new `firestore.rules` into Firebase. The old rules refuse the planner's new types.

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
