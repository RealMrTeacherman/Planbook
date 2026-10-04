// Copies v95's standards catalog (the gradebook's CATALOG) into data/standards-grade2.json,
// unchanged apart from field names. Run: node tools/extract-standards.js <path to v95 gradebook/index.html>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('const CATALOG = [');
if (a < 0) throw new Error('no CATALOG');
const b = src.indexOf('\n];', a);
const CATALOG = vm.runInNewContext('(' + src.slice(a + 'const CATALOG = '.length, b + 2) + ')');
const standards = CATALOG.map(s => ({
  code: s.c, subject: s.s, domain: s.d,
  on: s.lvl === 1,   // v95's blankState() turns on every level-1 standard
  label: s.lbl, text: s.t
}));
const codes = new Set(standards.map(s => s.code));
if (codes.size !== standards.length) throw new Error('a code appears twice');
const out = {
  source: "v95 gradebook/index.html CATALOG, copied by tools/extract-standards.js. Oregon 2021 codes (what Synergy uses).",
  standards
};
fs.writeFileSync(path.join(__dirname, '..', 'data', 'standards-grade2.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote data/standards-grade2.json:', standards.length, 'standards,', standards.filter(s => s.on).length, 'on by default');
