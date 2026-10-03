// The Firestore security rules: made from the contract, and strict.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const { makeRules } = require(path.join(ROOT, 'tools', 'make-rules.js'));
const contract = require(path.join(ROOT, 'contract', 'contract.json'));
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

test('firestore.rules is up to date with the contract (run node tools/make-rules.js)', () => {
  assert.equal(rules, makeRules(contract));
});

test('every live type may be written, and no private type is named at all', () => {
  for (const [name, t] of Object.entries(contract.types)) {
    if (t.space === 'live') assert.match(rules, new RegExp(`type == '${name}'`), name);
    else assert.doesNotMatch(rules, new RegExp(`'${name}'`), name);
  }
});

test('reading and writing need your own sign-in', () => {
  assert.match(rules, /allow read: if request\.auth != null && request\.auth\.uid == uid;/);
  assert.match(rules, /allow create, update: if request\.auth != null && request\.auth\.uid == uid/);
});

test('nothing can be deleted, the id must match, and only listed fields are allowed', () => {
  assert.doesNotMatch(rules, /allow [^:]*delete/, "no rule names delete among the actions it allows");
  assert.doesNotMatch(rules, /allow write/);
  assert.match(rules, /request\.resource\.data\.id == id/);
  const live = Object.values(contract.types).filter(t => t.space === 'live').length;
  assert.equal((rules.match(/keys\(\)\.hasOnly\(/g) || []).length, live);
});

test('records live only under users/<uid>/records, with no other paths open', () => {
  assert.equal((rules.match(/match \//g) || []).length, 2);
  assert.match(rules, /match \/users\/\{uid\}\/records\/\{id\}/);
});
