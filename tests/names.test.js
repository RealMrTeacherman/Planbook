// The name check. Every name here is invented.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { nameHits, namesOf, textToCheck } = require(process.env.SUITE_NAMES || path.join(__dirname, '..', 'core', 'names.js'));
const contract = require(path.join(__dirname, '..', 'contract', 'contract.json'));

const kids = [
  { firstName: 'Mila', lastName: 'Okafor' },
  { firstName: 'Theodore', aka: ['Theo'], lastName: 'Reyes' },
  { firstName: 'Juniper', displayName: 'Juniper B.', aka: ['June'] },
  { firstName: 'Ana María', lastName: 'Núñez' },
  { firstName: 'Jo' },
  { firstName: 'Gone', deletedAt: '2026-10-01T00:00:00Z' }
];

test('a first name, any case, is found', () => {
  assert.deepEqual(nameHits('call mila home', kids), ['Mila']);
  assert.deepEqual(nameHits('MILA', kids), ['Mila']);
});

test('possessives and punctuation do not hide a name', () => {
  assert.deepEqual(nameHits("Mila's party", kids), ['Mila']);
  assert.deepEqual(nameHits('(Theo)', kids), ['Theo']);
  assert.deepEqual(nameHits('see Reyes.', kids), ['Reyes']);
});

test('a longer word that contains a name is not a hit', () => {
  assert.deepEqual(nameHits('Milan trip', kids), []);
  assert.deepEqual(nameHits('Theodora visit', kids), []);
  assert.deepEqual(nameHits('Joke day', kids), []);
});

test('nicknames, display names and last names count', () => {
  assert.deepEqual(nameHits('Theo out', kids), ['Theo']);
  assert.deepEqual(nameHits('Okafor family', kids), ['Okafor']);
  assert.deepEqual(nameHits('June 5 assembly', kids), ['June'], 'a name that is also a word still asks; asking is cheap');
});

test('names with accents and two words are checked word by word', () => {
  assert.deepEqual(nameHits('María at the nurse', kids), ['María']);
  assert.deepEqual(nameHits('Núñez pickup', kids), ['Núñez']);
});

test('short names count, single letters do not', () => {
  assert.deepEqual(nameHits('Jo to office', kids), ['Jo']);
  assert.ok(!namesOf([{ firstName: 'A' }]).length);
});

test('a student marked deleted is not checked for', () => {
  assert.deepEqual(nameHits('Gone fishing', kids), []);
});

test('several names are each listed once', () => {
  assert.deepEqual(nameHits('Mila and Theo and mila', kids), ['Mila', 'Theo']);
});

test('only the fields the contract marks are checked', () => {
  const day = { type: 'schoolDay', date: '2026-11-11', kind: 'noSchool', label: 'Mila day' };
  assert.deepEqual(textToCheck(day, contract), ['Mila day']);
  assert.deepEqual(textToCheck({ type: 'schoolYear', firstDay: '2026-09-02', lastDay: '2027-06-10' }, contract), []);
});
