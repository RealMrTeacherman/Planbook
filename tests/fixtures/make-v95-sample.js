// Builds tests/fixtures/v95-sample.json: a v95 sync file in v95's real shapes.
// Every name is invented. Run: node tests/fixtures/make-v95-sample.js
const fs = require('fs');
const path = require('path');

const gb = {
  v: 1,
  students: [
    { id: 'k3j9x2a', first: 'Mila', last: 'Okafor', sid: '900001', eld: false },
    { id: 'p8q7r6s', first: 'Theodore', last: 'Reyes', sid: '', eld: true, aka: 'Theo' },
    { id: 'z1y2x3w', first: 'Juniper', last: 'Banks', sid: '900003', eld: false, aka: ['June'] },
    { id: 'ab', first: 'Oscar', last: 'Lindqvist', eld: false }          // a short v95 id
  ],
  terms: [
    { id: 't1', name: 'Quarter 1', start: '2026-09-02', end: '2026-11-06' },
    { id: 't2', name: 'Quarter 2', start: '2026-11-07', end: '2027-01-29' },
    { id: 't3', name: 'Quarter 3', start: '2027-01-30', end: '2027-04-09' },
    { id: 't4', name: 'Quarter 4', start: '2027-04-10', end: '2027-06-10' }
  ],
  settings: { teacher: '', year: '2026–2027', yearStart: '2026-09-02', yearEnd: '2027-06-10', orfCuts: { 4: 75, 3: 50, 2: 25 } },
  orfLink: { o_linked1: 'z1y2x3w' },
  orf: [
    { id: 'orf:r_evening', srcId: 'r_evening', sid: 'k3j9x2a', date: '2026-09-16', srcDay: '2026-09-16', link: true, exclude: false, wcpm: 54 },
    { id: 'orf:r_moved', srcId: 'r_moved', sid: 'p8q7r6s', date: '2026-09-18', srcDay: '2026-09-17', link: true, exclude: true, wcpm: 202 }
  ],
  scores: [
    { id: 's1', sid: 'k3j9x2a', std: '2.OA.A.1', date: '2026-09-15', ctx: 'Lesson 1-3', score: 3 },
    { id: 's2', sid: 'p8q7r6s', std: '2.OA.A.1', date: '2026-09-15', ctx: 'Lesson 1-3', score: 2 },
    { id: 's3', sid: 'z1y2x3w', std: '2.OA.A.1', date: '2026-09-15', ctx: 'Lesson 1-3', score: 4 }
  ],
  iready: [], missing: [], groupPins: {}
};

const rr = {
  students: [
    { id: 'gb:k3j9x2a', name: 'Okafor, Mila' },
    { id: 'o_theo01', name: 'Theo Reyes' },        // linked only through the gradebook's copy
    { id: 'o_linked1', name: 'Banks, June' },      // linked through orfLink
    { id: 'o_orphan1', name: 'Wren Castillo' },    // never linked
    { id: 'd1', name: 'Sample, Ada', demo: true }
  ],
  passages: [{ id: 'p1', title: 'The Lost Kite', text: '…' }],
  records: [
    { // read at 6:15 pm Pacific on Sept 16, which is Sept 17 in UTC
      id: 'r_evening', studentId: 'gb:k3j9x2a', passageId: 'p1', passageTitle: 'The Lost Kite',
      date: '2026-09-17T01:15:00.000Z', wordsRead: 58, errors: 4, sc: 1, wcpm: 54, accuracy: 93.1,
      elapsed: 60, passes: 1, passageWords: 120, missed: ['string,', 'kite', 'windy', 'above'], selfCorr: ['tail']
    },
    { // two passes, 47 seconds; the gradebook moved its date by hand to the 18th
      id: 'r_moved', studentId: 'o_theo01', passageId: null, passageTitle: 'Short practice passage',
      date: '2026-09-17T16:00:00.000Z', wordsRead: 160, errors: 2, sc: 0, wcpm: 202, accuracy: 98.8,
      elapsed: 47, passes: 2, passageWords: 96, missed: ['the', 'went'], selfCorr: []
    },
    {
      id: 'r_linked', studentId: 'o_linked1', passageId: 'p1', passageTitle: 'The Lost Kite',
      date: '2026-09-18T17:00:00.000Z', wordsRead: 70, errors: 3, sc: 2, wcpm: 67, accuracy: 95.7,
      elapsed: 60, passes: 1, passageWords: 120, missed: ['a', 'b', 'c'], selfCorr: ['d', 'e']
    },
    {
      id: 'r_orphan', studentId: 'o_orphan1', passageId: 'p1', passageTitle: '',
      date: '2026-09-19T17:00:00.000Z', wordsRead: 40, errors: 5, sc: 0, wcpm: 35, elapsed: 60, passes: 1
    },
    { // its WCPM does not match its counts
      id: 'r_bad', studentId: 'gb:k3j9x2a', passageId: 'p1', passageTitle: 'The Lost Kite',
      date: '2026-09-20T17:00:00.000Z', wordsRead: 50, errors: 0, sc: 0, wcpm: 48, elapsed: 60, passes: 1
    },
    {
      id: 'r_demo', studentId: 'd1', demo: true, passageTitle: 'Milo and the Mitten (sample)',
      date: '2026-09-10T16:30:00.000Z', wordsRead: 65, errors: 3, sc: 2, wcpm: 62, elapsed: 60, passes: 1
    }
  ],
  settings: { goalWcpm: 100 }
};

const keys = {
  'gb2_standards_v1': gb,
  'running-records-v1': rr,
  'suite:orfcomp:v1': { records: { r_evening: 2, r_linked: '3' } },
  'suite:orfnotes:v1': { records: { r_evening: { paused: 4, notes: [
    { w: 'string', kind: 'e', n: 0, said: 'sting', told: false },
    { w: 'windy', kind: 'e', n: 2, told: true },
    { w: 'tail', kind: 's', n: 0, said: 'tall', told: false }
  ] } } },
  'suite:orfgoals:v1': { grade: 2, goals: { 'gb:k3j9x2a': { winter: 84, spring: 100 }, o_theo01: { winter: '', spring: '110' }, d1: { winter: 1 } } },
  'suite:groups:v1': { v: 1, math: {
    title: 'Math Groups', look: 'animals',
    stations: ['Teacher Table', 'iReady Goal', 'Desk Work', 'McGraw Hill'], pageStations: [false, false, true, false],
    groups: [
      { animal: 'fox', name: 'Fox', station: 0, pages: { 2: 'p. 112–113' } },
      { animal: 'bear', name: 'Bear', station: 1, pages: {} },
      { animal: 'tiger', name: 'Tiger', station: 2, pages: {} },
      { animal: 'lion', name: 'Lion', station: 3, pages: {} }
    ],
    place: { k3j9x2a: 0, p8q7r6s: 1, gone999: 2 },
    guests: { g_odette: { name: 'Odette', group: 3 } }
  } },
  'suite:readgroups:v1': { v: 1, current: 'u1', scope: 'unit', units: {
    u1: { name: 'Unit 1', start: '2026-09-08', weeks: ['', '', ''], subs: {}, place: { k3j9x2a: 'orange', z1y2x3w: 'pink' }, guests: { g_odette: { name: 'Odette', group: 'green' } } },
    u2: { name: '', start: '', weeks: ['', '', ''], subs: {}, place: {}, guests: {} }
  } },
  'lp:days:v2': {
    '2026-11-11': { saved: true, noSchool: true, closedLabel: 'Veterans Day', entries: {} },
    // The week of Sept 14: Reveal days that are not lessons, a free-text science day, notes and flags.
    '2026-09-14': { saved: true, notes: 'Picture forms due', flags: ['Picture day'], entries: {
      math: { pos: { unit: 1, lesson: 0, k: 'diag' }, taught: true }, reading: { pos: { unit: 1, week: 1, day: 1 }, taught: true },
      phonics: { pos: { unit: 1, week: 1, day: 1 }, taught: true }, science: { pos: { text: 'Plants: what do they need?' }, taught: true } } },
    '2026-09-15': { saved: true, notes: '', flags: [], entries: {
      math: { pos: { unit: 1, lesson: 0, k: 'open' }, taught: true, note: 'Attitude survey first' }, reading: { pos: { unit: 1, week: 1, day: 2 }, taught: true } },
      blockNotes: { '10:15|Math core lesson': 'Use the big ten frames', '7:45|Before-school duty': 'Bus line today', '9:00|Old block': 'Gone from the schedule' } },
    '2026-09-16': { saved: true, notes: 'Mila to speech at 10:15', flags: ['Early release'], entries: {
      math: { pos: { unit: 1, lesson: 1 }, taught: true }, reading: { pos: { unit: 1, week: 1, day: 3 }, taught: true },
      art: { pos: { text: 'Leaf rubbings' }, taught: true } } },
    '2026-09-17': { saved: true, notes: '', flags: ['Fire drill', 'Not a flag'], entries: {
      math: { pos: { unit: 1, lesson: 2 }, taught: false, note: 'Theo may need the number line' }, reading: { pos: { unit: 1, week: 1, day: 4 }, taught: true },
      science: { pos: { text: "Oscar's plant report" }, taught: true } } },
    '2026-09-18': { saved: false, notes: '', flags: [], entries: { math: { pos: { unit: 1, lesson: 3 }, taught: false } } }
  },
  'lp:settings:v2': (() => {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'planner-defaults.json'), 'utf8'));
    const templates = JSON.parse(JSON.stringify(d.schedule));
    templates[2].push({ t: '7:45', l: 'Before-school duty', s: '', n: 'Juniper waits with me' });   // a standing note that names a child
    return { subjects: d.subjects, templates };
  })(),
  'suite:subplan:v1': { details: {} },
  'suite:win:v1': { v: 1, me: 'teacher1', teachers: {}, lists: {} },
  'suite:migrations': {}
};

const file = { suite: 1, updatedAt: '2026-10-01T22:04:05.000Z', from: 'MacBook', keys: {} };
for (const [k, v] of Object.entries(keys)) file.keys[k] = JSON.stringify(v);   // v95 stores each key as text
fs.writeFileSync(path.join(__dirname, 'v95-sample.json'), JSON.stringify(file, null, 1) + '\n');
console.log('wrote v95-sample.json');
