// The name check. Before a live record's text leaves the device, look for any name from
// the class list on this device: first names, nicknames, display names, last names.
// Whole words only, any case, so "Mila's" is caught and "Milan" is not.
// The class list is only read here; it never goes anywhere.

(function () {
  const LETTER = '[\\p{L}\\p{N}]';
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Every name a child on this device could be written as.
  function namesOf(students) {
    const out = new Set();
    const add = n => {
      for (const part of String(n || '').split(/\s+/)) {
        const t = part.replace(/[^\p{L}\p{N}'-]/gu, '').replace(/^['-]+|['-]+$/g, '');
        if (t.length >= 2) out.add(t);
      }
    };
    for (const s of students || []) {
      if (!s || s.deletedAt) continue;
      add(s.firstName); add(s.lastName); add(s.displayName);
      (s.aka || []).forEach(add);
    }
    return [...out];
  }

  // The names found in text, each once, in the order the class list gives them.
  function nameHits(text, students) {
    const t = String(text || '');
    if (!t.trim()) return [];
    return namesOf(students).filter(n => new RegExp(`(?<!${LETTER})${escape(n)}(?!${LETTER})`, 'iu').test(t));
  }

  // The text fields of a record that the contract marks for checking.
  function textToCheck(rec, contract) {
    const spec = contract.types[rec.type];
    if (!spec) return [];
    return Object.entries(spec.fields).filter(([, f]) => f.nameCheck).map(([k]) => rec[k]).filter(v => typeof v === 'string' && v.trim());
  }

  const api = { nameHits, namesOf, textToCheck };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteNames = api;
})();
