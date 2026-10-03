// Writes firestore.rules from the contract, so the server's rules can never drift from it.
// Run: node tools/make-rules.js   (a test fails if firestore.rules is out of date)
const fs = require('fs');
const path = require('path');

function makeRules(contract) {
  const live = Object.entries(contract.types).filter(([, t]) => t.space === 'live');
  const envelope = Object.keys(contract.envelope);
  const q = s => `'${s}'`;
  const perType = live.map(([name, t]) => {
    const keys = [...envelope, ...Object.keys(t.fields)];
    return `        (request.resource.data.type == ${q(name)} && request.resource.data.keys().hasOnly([${keys.map(q).join(', ')}]))`;
  }).join(' ||\n');
  return `rules_version = '2';
// Made by tools/make-rules.js from contract/contract.json (version ${contract.version}). Do not edit by hand.
// Only you can read or write, only under your own sign-in, and only live record types:
// the ones the contract says can never name a child. Records are never deleted, only marked deleted.
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/records/{id} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.id == id
        && (
${perType}
        );
    }
  }
}
`;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contract', 'contract.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'firestore.rules'), makeRules(contract));
  console.log('wrote firestore.rules');
}
module.exports = { makeRules };
