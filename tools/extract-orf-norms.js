// Copies v95's ORF norms (Hasbrouck & Tindal 2017, as suite-orf.js holds them) and its default season
// lines into data/orf-norms.json, unchanged. Run: node tools/extract-orf-norms.js <path to v95 suite-orf.js>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(process.argv[2], 'utf8'), ctx);
const O = ctx.window.SuiteOrf;
if (!O || !O.HT) throw new Error('no SuiteOrf.HT');
const grades = JSON.parse(JSON.stringify(O.HT));
const out = {
  source: 'Hasbrouck & Tindal (2017), An update to compiled ORF norms (Technical Report No. 1702), University of Oregon; copied from v95 suite-orf.js by tools/extract-orf-norms.js. Words correct per minute at each percentile for [fall, winter, spring].',
  percentiles: JSON.parse(JSON.stringify(O.PCTS)),
  seasons: JSON.parse(JSON.stringify(O.SEASONS)),
  seasonLines: { fall: '08-01', winter: '12-01', spring: '03-01' },
  grades
};
// The season lines here must be v95's defaults: check them against its own rule.
const probe = { '2026-09-15': 0, '2026-12-01': 1, '2027-02-28': 1, '2027-03-01': 2, '2027-07-31': 2, '2026-08-01': 0 };
for (const [d, want] of Object.entries(probe)) if (O.seasonIndex(d) !== want) throw new Error('season lines differ at ' + d);
fs.writeFileSync(path.join(__dirname, '..', 'data', 'orf-norms.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote data/orf-norms.json: grades', Object.keys(grades).join(', '));
