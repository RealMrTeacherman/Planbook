# Changelog

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
