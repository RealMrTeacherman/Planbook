// The family email, built from the invented v95 class. Every name is invented.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const P = require(path.join(ROOT, 'core', 'plan.js'));
const FAM = require(process.env.SUITE_FAMILY || path.join(ROOT, 'core', 'family.js'));
const imp = require(path.join(ROOT, 'core', 'import-v95.js'));
const reveal = read('data/reveal-grade2.json'), bench = read('data/benchmark-grade2.json'), wording = read('data/family-email.json');
P.useCurriculum(JSON.parse(JSON.stringify(reveal)), bench);
const EXTRA = read('data/planner-defaults.json').extraSubjects;
const out = imp.convert(read('tests/fixtures/v95-sample.json'), { names: require(path.join(ROOT, 'core', 'names.js')), extraSubjects: EXTRA });
const D = (extra = []) => FAM.collect(out.records.concat(extra), reveal, wording);
const text = r => FAM.html(r).replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);

test('v95\'s family wording is copied exactly from its source (when v95 is here)', { skip: fs.existsSync('/home/claude/v95/classroom-suite/curriculum.js') ? false : 'v95 not here' }, () => {
  const src = fs.readFileSync('/home/claude/v95/classroom-suite/curriculum.js', 'utf8');
  const mine = fs.readFileSync(path.join(ROOT, 'core', 'family-v95.js'), 'utf8');
  for (const name of ['var FAM_MATH', 'var FAM_META', 'var FAM_COMP', 'function famSummary', 'function parseSpelling']) {
    const a = src.indexOf(name), b = mine.indexOf(name);
    assert.ok(a > 0 && b > 0, name);
    const n = name === 'function parseSpelling' ? 200 : 400;   // the copy ends shortly after parseSpelling
    assert.equal(mine.slice(b, b + n), src.slice(a, a + n), name);
  }
});

test('the goals and spelling lists chosen in v95 come across; a key that is not a week does not', () => {
  const f = out.records.filter(r => r.type === 'familyWeek');
  assert.deepEqual(f.map(r => r.id).sort(), ['fam_bm-1-1', 'fam_wk-2026-09-21']);
  assert.equal(f.find(r => r.id === 'fam_bm-1-1').goal, 'Metacognitive: Create Mental Images');
});

test('the week of Sep 14: Math in families\' words, merged as v95 merges it', () => {
  const r = FAM.build(D(), '2026-09-14');
  const math = r.sections.find(s => s.id === 'math');
  assert.equal(math.head, 'Math · Unit 1, Math Is ...');
  assert.match(math.lines[0], /^Starting Unit 1, Math Is \.\.\.: sharing our own math stories/);
});

test('Reading: the big question, the chosen goal, and the week\'s words', () => {
  const r = FAM.build(D(), '2026-09-14');
  const rd = r.sections.find(s => s.id === 'reading');
  assert.equal(rd.head, 'Reading · Unit 1, Plants and Animals in Their Habitats');
  assert.equal(rd.lines[0], 'Our big question: How do living things get what they need to survive?');
  assert.equal(r.goal.src, 'Metacognitive: Create Mental Images', 'the goal chosen in v95');
  assert.match(rd.lines[1].t, /mental images/i);
  assert.equal(rd.lines[2], 'Words to listen for: survive, paddle, habitats, burrow');
  assert.equal(r.familyId, 'fam_bm-1-1');
});

test('Phonics: the sound-and-spelling skill and the pasted spelling list, cleaned up', () => {
  const ph = FAM.build(D(), '2026-09-14').sections.find(s => s.id === 'phonics');
  assert.match(ph.lines[0], /^Sounds and spelling: short vowels/);
  assert.equal(ph.lines[1].t, 'Spelling words to practice at home: hat, map, sat, cap');
});

test('Writing (new): Benchmark\'s writing task in families\' words, beginning or continuing', () => {
  const w = FAM.build(D(), '2026-09-14').sections.find(s => s.id === 'writing');
  assert.deepEqual(w.lines, ['Beginning our informative essay, using facts from what we read']);
});

test('the closing sentence (new) gathers the typed topics of Science, Health and STEAM', () => {
  const r = FAM.build(D(), '2026-09-14');
  assert.equal(r.closing, 'We will also explore plants: what do they need? and Oscar\'s plant report, and much, much more!',
    'a topic starting with a child\'s name keeps its capital');
  const extra = [
    { id: 'les_2026-09-14_subj_health-sel', type: 'lessonPlan', updatedAt: '2026-10-01T00:00:00Z', device: 'x', deletedAt: null, date: '2026-09-14', subjectId: 'subj_health-sel', pos: { text: 'Safety in our communities' }, taught: false }
  ];
  assert.equal(FAM.build(D(extra), '2026-09-14').closing, 'We will also explore plants: what do they need? and Oscar\'s plant report and learn about safety in our communities in Health, and much, much more!');
});

test('day notes never appear in the email', () => {
  const all = text(FAM.build(D(), '2026-09-14')).join(' ');
  assert.doesNotMatch(all, /Picture forms due|Mila|speech/);
});

test('a week ahead with nothing planned is projected from the last lesson taught', () => {
  const r = FAM.build(D(), '2026-09-28');
  const math = r.sections.find(s => s.id === 'math');
  assert.ok(math && math.lines.length, 'math is projected');
  assert.ok(r.sections.find(s => s.id === 'reading'));
});

test('from Friday on, the email opens on the next week', () => {
  assert.equal(FAM.defaultWeek('2026-09-16', '2026-09-16'), '2026-09-14');
  assert.equal(FAM.defaultWeek('2026-09-18', '2026-09-18'), '2026-09-21');
  assert.equal(FAM.defaultWeek('2026-09-02', '2026-09-18'), '2026-08-31', 'a different week shown stays as shown');
});
