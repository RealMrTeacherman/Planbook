// Sub plans built from the invented class (the gate against v95 is subplan-v95.browser.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V95_DIR = process.env.V95_DIR || '/home/claude/v95/classroom-suite';
const ROOT = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const P = require(path.join(ROOT, 'core', 'plan.js'));
P.useCurriculum(JSON.parse(JSON.stringify(read('data/reveal-grade2.json'))), read('data/benchmark-grade2.json'));
const SUB = require(process.env.SUITE_SUBPLAN || path.join(ROOT, 'core', 'subplan.js'));
const imp = require(path.join(ROOT, 'core', 'import-v95.js'));
const out = imp.convert(read('tests/fixtures/v95-sample.json'), { names: require(path.join(ROOT, 'core', 'names.js')), extraSubjects: read('data/planner-defaults.json').extraSubjects });

test('a block\'s sub notes print on it; private notes print in place (the plan is private)', () => {
  const h = SUB.make(out.records).full('2026-09-16');
  assert.match(h, /Mila to speech at 10:15/, 'the private day note');
  assert.match(h, /Check the hallway calendar for an assembly/);
});

test('a lesson planned but not yet taught prints as the plan, not "Not happening today"', () => {
  const h = SUB.make(out.records).full('2026-09-17');
  assert.doesNotMatch(h, /Not happening today/);
  assert.match(h, /Lesson 1-2/);
});

test('a subject with nothing set for the day prints the planner\'s suggestion', () => {
  const h = SUB.make(out.records).glance('2026-09-21');
  assert.match(h, /Reveal · Lesson 1-[0-9]/);
});

test('with no standing notes, the plan says nothing is there yet', () => {
  const sp = SUB.make(out.records.filter(r => !/^sub(Plan|Block)$/.test(r.type)));
  assert.equal(sp.hasContent(), false);
});

test('v95\'s printouts are copied exactly from its source (when v95 is here)', { skip: fs.existsSync(path.join(V95_DIR, 'sub-plans.js')) ? false : 'v95 not here' }, () => {
  const src = fs.readFileSync(path.join(V95_DIR, 'sub-plans.js'), 'utf8');
  const mine = fs.readFileSync(path.join(ROOT, 'core', 'subplan-v95.js'), 'utf8');
  for (const f of ['buildFull', 'buildGlance', 'groupsHTML', 'justToday']) {
    const b = mine.indexOf('  function ' + f + '(');
    const ends = ['\n  function ', '\n    return { buildFull'].map(m => mine.indexOf(m, b + 10)).filter(x => x > 0);
    assert.ok(src.includes(mine.slice(b, Math.min(...ends)).trim()), f);
  }
});
