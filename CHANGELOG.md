# Changelog

## Step 7, part 1 — Reading fluency: Assess

A **Reading fluency** page (Planbook home → Reading fluency), in the design you chose (A, "v95's screen, tidied"). It works for anyone: a colleague opens the same address, pastes their class list, and everything stays private in their own browser (and their Drive folder, if they use one). With your Gradebook, it uses your class list, and readings feed 2.RF.4 in For Synergy as before.

**Assess**, as v95's running-records page with its two add-ons:
- Pick the child, the passage and the read time (1 minute, 90 seconds, 2 minutes). A dark timer bar holds the clock, progress, and the counts of errors, self-corrections and passes.
- Tap a word once for an error, twice for a self-correction, a third time to clear. **Started over** begins a new pass (errors from earlier passes still count); **Undo restart**; **Stop timer**; at time it beeps (and buzzes on a phone) and asks for the last word read; **Stopped at the end** if they finished a pass exactly; **Change last word**; edit any pass's marks afterwards.
- **Pause / Resume** for an interruption: the clock holds, taps still work, only reading time is counted, and how long it was paused is saved with the check (the norms assume one unbroken minute), as v95's fluency-assess.js did.
- **What they said:** a small tag above each marked word. Tap it to type what the child said, or mark that you told them the word ("T"), as on a paper running record. Kept with the reading.
- Results: words correct per minute, accuracy and its level (Independent, Instructional, Hard — instructional edge, Frustration level), words read, errors, self-corrections, passes.

**Passages:** the library (your v95 passages come in on import, and readings point at the one they were), and adding a passage by hand. The PDF import comes with the later parts of step 7.
**Students:** your Gradebook's class list; or, for someone using the tool on its own, a pasted list ("First Last" or "Last, First", one per line).

**Contract version 10:** `orfPassage`, `orfCheck.passageId`, and "what they said" up to 60 characters, as v95 kept it (it had been 40, so the importer was cutting longer notes). The ORF tool may add children when there is no gradebook. All private; the Firebase rules change only in their header.

**On purpose, not as planned:** passages are private (Drive path) rather than live. A live record must pass the name check, and a story's character can easily share a child's name.

**The gate.** v95's page (with fluency-assess.js) and Planbook's run in Chrome on the same test clock, and the same taps are made on both, in four scenes: errors, a self-correction, a pause, what they said and teacher told; two passes with time running out and a mark added on the first pass afterwards; started over then stopped at the end; a restart taken back, the last word changed, and a mark past it. Both pages show the same WCPM and accuracy, and v95's saved reading, brought in by the importer, equals Planbook's field for field.

**Caught before release:** a tag was 28 px tall (it now has a 44 px tap area around it); a line in the new logic that nothing depended on (removed); two of my deliberate breaks could not be seen by any test (a test now imports a long "said" note, and the browser test now pauses), and two could not happen through the page at all (dropped).

**Tests.** 384 tests: 383 pass with v95 present (1 skipped, the private names file); without it, as on GitHub, 368 pass and 12 are skipped. Deliberate breaks: 153, the 11 new ones all caught.

## Fix: GitHub's break check after the Phonics fold

GitHub's run for the fold (a6ed46d) passed every test but failed the deliberate-break check: **"Agenda rows out of time order" was not caught.** My mistake: the check compared Phonics's row with Reading's, and Phonics has no row now, so it compared "not there" (-1) with Reading and always passed. When I updated the planner tests for the fold I missed it. The check now shows Writing (11:40) inside WIN (12:05) in the Agenda look and requires Writing's row first, which only the sort gives. The full break check was run here, as GitHub runs it: all 142 caught. Only a test changed.

## Phonics folded into Reading; a notes bar on every day

**Phonics is part of Reading.** It follows Reading's unit, week and day, so it is no longer a subject of its own.
- No Phonics box inside Reading's card, and no Phonics row in the Week view. Reading's card starts when Phonics did (8:15 on the sample Monday) and runs through Reading's blocks.
- Reading's card leads with **Phonics and word study**, open: the phonics skill and spiral review, phonemic awareness and high-frequency words for Reading's unit, week and day. On the iPhone that section and the texts open; Skills now starts folded to keep the card short. On the MacBook every section shows, as before.
- **Your data:** the Phonics subject is switched off, not deleted. Its blocks become Reading's, keeping their time, name ("Phonics") and notes. A Phonics day note moves to that day's Reading note as "Phonics: …", or to the day's notes if Reading's is full; a note that fits nowhere is left where it is, never cut. Phonics's own positions and "taught" go; Reading's stand. This is one rule (`core/fold.js`), used by the importer, so bringing in v95 again never brings the box back, and by the planner as it opens and as records arrive, so an older file or device cannot either. Running it again changes nothing.
- **Sub plans:** the Phonics block now shows Reading's position. Reading's targets and materials still print with the first Reading block after it (8:30), where v95 put them, not during phonics. The gate against v95 allows exactly this and nothing else. The family email is unchanged.
- The **Show inside** setting stays, for any other subject; its tests now use WIN inside Reading.

**A notes bar at the top of every day:** in the Day view (both looks, and on a day off) and under each day in the Week view (the MacBook grid and the iPhone list). It saves when you leave it, through the same name check as every note (a note that names a child offers "Keep it private"), and grows to fit. The day's existing notes show in it; the side panel's "Add notes" button is gone. Typing in it is never wiped by a change arriving from the other device.

**Bugs in my first version, caught before release:** on the iPhone the Week view's note boxes would have been zero height; pressing Tab into another day's box kept the page from moving to a new day; after "Keep it private" the bar kept the cursor, so the page did not redraw. And one deliberate break (the planner not folding older records) was not caught at first, because only the importer's fold was tested; a check now writes unfolded records where nothing folds and opens the planner.

**Tests.** 359 tests: 358 pass with v95 present (1 skipped, the private names file); 348 without it, as on GitHub (11 skipped). Deliberate breaks: 142, the 11 new ones all caught, and the older "Show inside" breaks still caught.

## Step 6c — Groups & patterns

A new **Groups** tab in the Gradebook, in the design you chose (C, "One dashboard"), with all of v95's Groups & Patterns.
- **Skill groups** (left): pick Math, ELA or All, the standard to group on (the one with the newest mark, unless you choose; or all of them together), and 2–6 groups. Each child shows their worked-out score and its mark.
- **Moving a child:** drag them on the MacBook, or click or tap them for the Move sheet (a group, Not placed, or "Let the marks place them"). A child you move stays there as marks come in, and has a heavy border. **Undo my moves** puts everyone back where the marks place them. **Print these groups** prints just the table.
- **Worth a look** (a child who slipped on a standard, or has only one or two marks), **Shared needs** (Reteach / More practice, with where the evidence comes from) and **Ready to extend** sit alongside; **Class at a glance** underneath.
- Across the tab: which marks count (classwork and iReady, classwork only, iReady only) and how far back to look (all year, 45 days, 3 weeks).
- On the iPhone it stacks, and the Gradebook's four tabs sit two by two.

**v95's logic, exactly:** each older mark counts 0.62 of the one after it; across standards each counts once; groups as even as the class allows, the lowest smallest; ties broken by the broader picture, then the latest mark, then the name; needs gathered from latest 1s and 2s (or 4s to extend), merged when they share at least half their children, up to seven.

**Contract version 9:** `groupPin`, one per child per subject and standard grouped on; private. Your v95 moves come across on import; a move for a child no longer on the class list is held back and reported.

**The gate.** v95's gradebook runs in Chrome on a year of invented marks with children moved by hand (into a group, to Not placed, on all standards together, past the group count) and a child who joined late. For every subject, standard and all together, 2–6 groups, each evidence choice and each look-back, v95 and Planbook give the same groups (each child's weighted score too), the same Not placed, the same shared-need and extend groups and the same default standard; v95's drawn Worth a look and Class at a glance rows match Planbook's. Zero differences.

**Differences from v95, on purpose.**
- Only children in the class are grouped and flagged; v95 grouped everyone on its list, including a child who had left.
- Left out by your choice: the iReady-only parts (domain groups, placement mismatches, growth flags; the iReady rows stay in the kept v95 data) and the planning analysis (Planning tab). The link to the Small Groups board waits until Small Groups is rebuilt.

**Mistakes of mine caught before release.**
- Four of my new deliberate breaks were not caught at first: the tests never had needs with no children in common, a child with a 3, a mark that rose, or moves to import. Those cases are now tested and all 14 breaks are caught.
- On the iPhone, four tabs no longer fit and the page scrolled sideways; the skill-groups card was clipped; every button in the Move sheet looked selected. Fixed and covered by the browser test.
- Test mistakes: changing two menus back to back (under load one change was lost), and adding marks after the page had chosen its standard without reloading it.
- **A false alarm I raised:** I reported the sync page's "order 2" check failing about one run in five and said I could not rule 6c out. The cause was mine: a full test suite left running in the background after a command hit the time limit, so two suites ran at once and that check's 30-second wait ran out. On `main` and on 6c it passed every run (8 and 22 in a row) with nothing else running, and both full suites passed back to back. HANDOFF now warns about this.

**Tests.** 348 tests: 347 pass with v95 present (1 skipped, the private names file); 337 without it, as on GitHub (11 skipped). Deliberate breaks: 131, the 14 new ones all caught.

## Step 6b — marks for Synergy (the export comes later)

Grading itself happens in Synergy, so this step works out each child's mark for each Oregon standard in a quarter, ready to go there. **The Synergy file is not built yet:** it will match your Grade Book Import template exactly once you can send it, when the grading window opens.

**For Synergy** (a new Gradebook tab).
- On the MacBook: pick the quarter. A grid of children, in last-name order as in Synergy, × the standards that have marks. Click a mark to see the marks behind it and how it was worked out, set your own 1–4 (it stays put however the marks change), or go back to the worked-out one. A carried mark has a dashed border, one you set a heavy one.
- **Gaps before you submit:** standards with nothing to go on, marks carried from an earlier quarter, and work still not turned in this quarter.
- On the iPhone: one child at a time; tap a standard to see or fix its mark.
- On the same screen: how marks are figured (recent work counts more, the default; straight average; most recent only), carry forward (on), and whether iReady marks count (off).

**The calculation is v95's, exactly:** its `computeMark`, `roundMark`, `lineMark`, `carriedMark` and `finalMark`, called with one standard. A quarter's marks give the mark; with none, the latest earlier quarter that has some is carried, else earlier work.

**ORF readings as marks** (Gradebook Settings): each reading becomes a fluency mark on 2.RF.4, graded against end-of-year Hasbrouck & Tindal 2017 norms with v95's cuts (75th → 4, 50th → 3, 25th → 2). Comprehension does not count. You can change the standard, the norms (end of year or the reading's own season) and the cuts, and untick any reading to leave it out. The readings v95 had set not to count came across that way. The norms are copied out of v95's `suite-orf.js` by `tools/extract-orf-norms.js`.

**Import:** v95's settings for all of this, the readings set not to count, and your overrides. v95 kept overrides per report-card line, so one on a line of a single standard becomes that standard's; one on a line of several standards has no single standard to go on and stays in the kept v95 data (the import says how many).

**Contract version 8:** `markOverride` (one per quarter, child and standard) and optional settings fields, all private. A setting v95 never saved is left out and means v95's default. The Firebase rules change only in their header; pasting them is optional.

**The gate.** v95's gradebook runs in Chrome on a year of invented marks: several quarters, marks from before the year, averages landing on .5, iReady marks, overrides on lines of one and several standards, and ORF readings including one set not to count. For every child × standard × quarter, under all three rules, with carry forward on and off and iReady in and out (over 10,000 comparisons), v95 and Planbook give the same mark, the same "set by you", the same count and the same "carried from". Zero differences. The page's own cells are checked against the same calculation in a browser test.

**Differences from v95, on purpose.**
- A reading whose word counts do not add up was held back at import in step 1, so it gives no mark; v95's gradebook copy still counted it. The gate leaves it out of v95's side and checks v95 still counts it.
- A reading keeps the Oregon date it was taken. v95's gradebook moved an evening reading to the next day, which could only matter on a quarter's last evening.
- The ORF marks stored by the v95 import are not used; the readings are, as v95 rebuilt them on every load.
- Dropped by your choice: report-card lines and their editor, and the printed entry sheet.

**Small fixes:** the three Gradebook tabs fit on one line on the iPhone.

**Mistakes of mine caught before release:** a test of the rules I first wrote with a wrong value and a confused message; two browser-test expectations that forgot the sample's own marks. All were in the tests, not the app.

**Tests.** 321 tests: 320 pass with v95 present (1 skipped, the private names file). Deliberate breaks: 117, the 17 new ones all caught.

## Step 6a — the gradebook: Enter scores

**A Gradebook page** (Planbook home → Gradebook), with Enter scores and Settings. Phone first, in the design you chose: A, "Roster list", with a note line under each child's marks on the iPhone and beside them on the MacBook.
- **It opens on the day's lesson** from the planner (the one planned, else the one it suggests), as v95 did: the lesson's first Oregon standard and its name ("Lesson 2-4"). The card says so ("Tue, Oct 6 · Lesson 2-4 in the planner"). A typed name is never replaced, and a name is never added beside marks entered without one (that would split an assignment), both as in v95.
- **Each child:** 1–4 in v95's colors, their last mark ("was 3 · 9/15"), Not in, and a note. Tap a number to save it; tap it again to clear it. A note typed before the mark is kept and saved with it.
- **Grade all together** for a lesson with two or more standards (a row per standard and All), from the lesson's chips or from "also covers" when the same name is used on the same day.
- **‹ ›** step through assignments; **Next unfinished**; **Change** opens the subject, standard, date, "What was it?", and the Reveal unit and lesson menus.
- **Undo** undoes exactly your last action (a mark, a change, a clear, Grade all, a batch of Not in), and puts back only what has not changed since on the other device. It says so if something had.
- **Log the rest as not in**, and **Still waiting on**, with Handed in and Excuse. Giving a mark takes a child off the list.
- **Settings:** the class list (add a child; first and last name, Also called, Synergy id, ELD; untick In the class when a child leaves, and their marks stay), and which standards you track, with Math codes shown as Oregon or CCSS.

**Contract version 7:** `mark`, `missingWork` and `gradebookSettings`, all **private** (Drive path only), so on the iPhone your tracked standards arrive with the Drive file, like the marks. One mark per child, per standard, per day; its id is built from those, so the iPhone and MacBook cannot make two. The Firebase rules change only in their header comment; pasting them is optional.

**Import:** your marks (derived ones from ORF and iReady keep their source and show as derived), work not turned in, your tracked standards and settings. A mark for a child no longer on your class list, or one that is not 1 to 4 under a standard code with a date, is held back and reported. If v95 has two marks for one child, standard and day, the later one, which v95 counts, is kept. iReady rows stay in the kept v95 data. The import page now names every kind of record, including the sub plan records it showed by their code names since step 5.

**The standards catalog** (107 standards, 67 on by default) is copied out of v95's gradebook by `tools/extract-standards.js` into `data/standards-grade2.json`, not retyped.

**The gates.**
- Which standards a guide day covers (a lesson its own, a probe the lessons before it, a review or test the unit) and the CCSS code shown for each match v95's `curriculum.js` at all 143 steps.
- v95's own gradebook runs in Chrome on the invented class (`tests/gradebook-v95.browser.test.js`): every mark, every assignment with its counts, in order, and the Still waiting on list are the same in Planbook.
- The device gate, as a test: a mark entered on the iPhone is sent through the Drive folder and shows on the MacBook. **On your real devices this is still yours to do.**

**Differences from v95, on purpose.**
- A lesson planned but not yet marked taught counts as the day's lesson (as everywhere in the new planner).
- v95's "Undo last" removes the newest mark in its list, which after a change or a clear is a different mark. Undo here is exact.
- If every mark on a standard and day already has one name, the card takes it, so re-marking never quietly drops "exit ticket".
- v95 counts a mark for a child no longer on its class list toward an assignment (so "done" can exceed the class). Planbook holds that mark back at import and says so. The gate compares with v95's count over its class list, and checks that v95 still does this.
- The ELA "Taught this day" chips came from v95's Planning tab, which you left out, so they did not come across.
- A note typed before a mark is kept (v95: "Give a mark first").

**Shared now:** subject colors (`core/colors.js`) and the page header and tabs (`core/look.css`), used by the planner and the gradebook.

**Mistakes found and fixed before release.**
- The invented class's marks were stored as `score`; real v95 data uses `v`. An importer built on the sample alone would have read none of your marks. The sample now has v95's real shapes.
- **My break check was hollow for a while.** The runner did not copy the new `gradebook/` folder into its throwaway copies, so one test failed in every copy and every break looked caught; I reported "63 caught" on that basis. The runner now copies it and first checks that an unbroken copy passes. All breaks were rerun with that check.
- Moving the colors made two old planner test races show more often: reading a card, and changing a Settings field, just as a redraw replaced it. The tests now wait for redraws to stop and read or change an element in one step. These were in the tests, not the planner: a person typing in a field is protected from redraws.
- Four v95 tests ignored `V95_DIR`. HANDOFF gave v95's gradebook as 5,472 lines; it is 5,346.
- In my first draft of the page: the day's lesson unnamed when it had no grade 2 standards, the standard's label shown twice, and the bottom button cut off on the iPhone.

**Tests.** 290 tests: 289 pass with v95 present (1 skipped, the private names file); 281 pass without it, as on GitHub (9 skipped). Deliberate breaks: 100.

## Fix — two deliberate breaks GitHub could not catch, and a9fce9c was not green

**What happened:** after a9fce9c, GitHub's `npm test` passed but `npm run test:breaks` still failed. GitHub's log was out of reach, so the whole break check was rerun without v95, as GitHub runs it. All 49 Node-side breaks were caught (a9fce9c's pacing test works). Two browser-side breaks were not, steadily, and neither depends on v95:
- **"Settings redraws over a field being typed in."** The test checked only that the half-typed text was still there. In current Chrome, removing a focused field fires `change`, so the planner *saves* the half-typed text, and the redrawn field shows it. Without the guard the text is not lost; it is saved unfinished and the cursor leaves the field. The test could not see that.
- **"The family email rebuilt over hand edits."** The test checked the hand edit as soon as the new goal was *stored*. The redraw runs 50 ms later, so the check always came first. It also never sent a change from the iPhone, which is what the guard is for.

**The fix, in the tests:**
- The Settings test now waits for the iPhone's change to arrive and the MacBook to redraw. It then checks that the cursor is still in the field and nothing half-typed was saved.
- The family email test now has the iPhone send a change after the goal is chosen. It waits for the MacBook to redraw, then checks the hand edit.
- Both breaks are confirmed caught, and both tests pass on correct code.
- To wait for a redraw instead of guessing a pause, the planner counts its redraws (`window.__renders`, beside the existing test hooks). That one line is the only change to the app. Since `planner/planner.js` is cached, `VERSION` is now 0.8.2-step5.

**Unexplained:** in one full local run, "nothing sent on first connect" ran over 20 minutes without a verdict. Alone, it was caught in 28 seconds. It is not what failed on GitHub, whose break step took its usual time.

## Fix — GitHub's deliberate-break check had failed since step 4b

**What happened:** GitHub's machines do not have the v95 suite, so tests that compare against v95 are skipped there. Two of step 4b's deliberate breaks ("the pacing guide gives each unit a day too many", "days off count as math days") were caught only by such a test. They were caught on my machine and slipped through on GitHub, and every run since 4b failed at `npm run test:breaks`. I checked GitHub's result on some pushes but not every one, and missed it for four releases.

**The fix:** a pacing test that needs no v95 (each unit gets exactly its days, in order; days off are not math days). Every Node-side break is now confirmed caught with v95 hidden (`node tests/mutations.js --node-only`). The browser-side breaks never relied on v95.

**From now on:** each release waits for GitHub's run to finish green, not just for my own runs.

## Step 5 — sub plans

**Sub plan for this day,** from the Day view's side panel: the **full plan** and the **one-page At a glance**, previewed as they print, with Print. Printing marks the day with the Sub flag, as v95 did.
- **v95's printouts, copied out of its source** by `tools/extract-subplan.js` into `core/subplan-v95.js`, not retyped. `core/subplan.js` feeds them from the new planner: schedule blocks, lessons with Reveal targets and materials and Benchmark's focus and texts, your day and block notes, the math board, and your standing sub notes.
- **The gate:** v95's own sub-plan panel runs in Chrome on the invented class and prints both, and the new builder's HTML is the same, character for character, for two days (`tests/subplan-v95.browser.test.js`). The comparison sets aside the groups table, which v95 shows only when its Small Groups code has loaded. It uses what v95 stores after its own upgrades run, as a real export would.
- **Three deliberate differences**, each following how the new planner works:
  - a lesson planned but not yet taught prints as the plan (v95: "Not happening today")
  - a subject with nothing set prints the planner's suggestion on any day (v95: only on the day the planner had open)
  - private notes print in place, since the plan is private

**Settings → Sub plans:** your name, contact, welcome, signal, trusted students, arrival, incentives, consequences, end of day; the What helps list; each weekday's specials; each block's What to do and If you cannot find it, weekday by weekday; and anything from v95 that matched no block, to place.

**Contract version 6:** `subPlan` and `subBlock`, both **private** (Drive path only). The Firebase rules do not change; only the version in their header comment does.

**Import:** your sub notes come across. Block details go onto every weekday their block runs, including the renamed Assembly / Enrichments / Other block, and any that match no block are kept to place.

**Changed from 4a:** a day note for a block no longer on the schedule now stays with that block (kept as a deleted block), so the Day view and the sub plan say "Old block (9:00): …" as v95 did, instead of folding it into the day's notes.

**Not yet:** the Walk to WIN table. Its lists come across with step 8.

**Mistakes found and fixed before release.**
- The extraction tool first cut one-line functions short and missed `dayKeyOf`, `DAYKEY` and the printout styles (`DOC_CSS`).
- The preview first showed the plan unstyled: v95's styles are written for `#subprint`.
- "Your name on the plan" could not have saved (a stray text replacement removed its marker). Text areas were not protected from a redraw while typing.
- In my tests: the browser's own way of writing `&middot;`, a check that matched `subject` when it meant `subPlan`, an older-version test still shaped for version 1, earlier tests that had replaced Tuesday's schedule, and a click racing a redraw on the Sync page.

**Tests.** 238 tests (237 pass, 1 skipped). Deliberate breaks: 87.

## Step 4d — Phonics inside Reading, and the Agenda look

**Phonics inside Reading.** Phonics is shown as a section at the top of the Reading card: its own position, ‹ ›, Taught and note, still tracked on its own (week grid, family email). Reading's chip spans both (8:15–9:30). Any subject can be shown inside another (Settings → Subjects → Show inside); import sets Phonics inside Reading. *Follow-up:* the first push of 4d had only the import default, not the Settings control, so a device that had already imported could not turn it on. Added, with a test. **Contract version 5** adds `within` to subjects: **paste the new `firestore.rules`.**

**The Agenda look, chosen per device** (Settings → Look on this device). It has a dark header, monospace times, and the day as a compact list: time, subject, position with ‹ ›, title, a Taught box. On the MacBook, tapping a subject shows its full card beside the list; on the iPhone the card opens in place under its row. Phonics keeps its place in time, indented under Reading. Color blocks is unchanged, and each device keeps its own choice.

**Mistakes found and fixed before release.**
- Since 4b, a lesson's big position was centered in its card. The ‹ › icon rule ("center the contents") also applied to the position, which became a button in 4b, and current Chrome honors that inside ordinary blocks. A test now checks the position sits at the left.
- In Agenda: the detail pane's curriculum ran off the side (three across in a narrow pane), free-text subjects showed their text twice, Phonics was listed after Reading, and on the iPhone the Taught box wrapped to its own line.
- My first draft of the breaks included one ("the Agenda look shared across devices") that changed nothing a test could see. It was replaced with a real one.
- **The contrast test failed again,** once in two runs, and three reruns did not reproduce it. The likely cause is in the test: the test before it moves to another day and continues as soon as the address changes, so the check could measure mid-redraw. It now opens a settled page of its own and still reports the color and page it measured, so if the cause is something else, the next failure will say so.

**Tests.** 227 tests (226 pass, 1 skipped); 41 checks in the planner test.

## Step 4c — the family email

**A Family email button on the Week view** opens the coming week in families' words, ready to edit and paste. It defaults to next week from Friday on, and ‹ › moves by week. On the MacBook the email sits on the right and the controls on the left; on the iPhone the controls come first. Copy puts a formatted version (bullets) and a plain-text version on the clipboard.
- **Math, Reading and Phonics follow v95 exactly:** lessons in families' words, merged into lines; the big question, the reading goal you choose, words to listen for; sounds and spelling, and your spelling list.
- **v95's family wording is copied out of its source** by `tools/extract-family.js` into `core/family-v95.js`, not retyped. A test checks the copy against v95's file.
- **New: Writing,** from Benchmark's writing task, with "Beginning" in a unit's first week and "Continuing" after. The wording is in `data/family-email.json`.
- **New: a closing sentence** from the topics typed in Science / Social Studies, Health/SEL and STEAM ("We will also explore …, and much, much more!"). It is configured in the same file.
- **Day notes, WIN and the 9:45 block are never included.**
- **Choosing a goal or typing spelling words updates just that line,** so hand edits stay. Once you edit the email, a change arriving from the other device does not rebuild it.
- **One difference from v95, on purpose:** a lesson planned but not yet taught counts as what's coming. In v95 an untaught saved day meant "skipped".

**Contract version 4:** `familyWeek` holds the chosen goal and spelling list, per Benchmark week (`bm:1|1`) or calendar week. Your v95 choices are imported. **Paste the new `firestore.rules` into Firebase.**

**The gate.** v95's own planner runs in Chrome on the invented class, with its clock set to each week, and the new email's Math, Reading and Phonics lines match it word for word for two weeks (`tests/family-v95.browser.test.js`; skipped where v95 is absent, e.g. on GitHub).

**Found in v95:** its family preview's week arrows close the preview. Opening a new sheet calls `closeSheet()`, and the old dialog's late "close" event then removes the new one. The new email is a page, not a sheet.

**Mistakes and loose ends.**
- In my tests: the copy check matched my generated file's header comment and read past the copied piece; a "not a week" key that was in fact valid; v95's full month names; clicking v95's arrows; triple-click selecting only one line of a text box; a click racing the redraw after a color change.
- The closing first lowercased "Oscar's"; a topic starting with a class-list name now keeps its capital. On a device without the class list (the iPhone, until it loads the Drive file) it cannot tell, so edit those by hand.
- **Unexplained:** the contrast test failed once in about eight full runs and has not recurred. Its message now reports the color and page it measured, so a repeat will say why.

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
