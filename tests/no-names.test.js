// No real student name in any project file. The names are read at run time from
// private files that are never committed, so this file holds none. Without them
// (CI, a fresh clone) it reports skipped, not passed. Same rule as v95.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NOTES = process.env.SUB_NOTES || path.join(ROOT, 'sub-plan-standing-notes.json');
const EXTRA = path.join(path.dirname(NOTES), 'private-names.txt');

const names = new Set();
if (fs.existsSync(NOTES)) {
  const sub = (JSON.parse(fs.readFileSync(NOTES, 'utf8')).sub) || {};
  (sub.watch || []).forEach(w => w && w.name && names.add(String(w.name).trim()));
  String(sub.trusted || '').split(/[,;\n]| and /).forEach(n => { n = n.trim(); if (n) names.add(n); });
  if (sub.contact) names.add(String(sub.contact).trim());
}
if (fs.existsSync(EXTRA)) fs.readFileSync(EXTRA, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
(process.env.EXTRA_NAMES || '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));

test('no real student name in any project file', { skip: names.size ? false : 'no private names file here to check against' }, () => {
  const SKIP = new Set(['node_modules', '.git']);
  const PRIVATE = new Set([path.basename(NOTES), 'private-names.txt']);
  const hits = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      if (SKIP.has(f) || PRIVATE.has(f)) continue;
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(html|js|css|json|md|txt|yml)$/i.test(f)) continue;
      const text = fs.readFileSync(p, 'utf8');
      for (const n of names) if (n.length > 2 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) hits.push(`${path.relative(ROOT, p)}: a private name`);
    }
  })(ROOT);
  assert.deepEqual(hits, []);
});
