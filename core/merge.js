// Record-by-record merge. Pure: no storage, no page. Works in the browser and in Node.
//
// For each id, the newer change wins (later updatedAt; on an exact tie, the larger
// device string). Two copies with the same content are not a change, whatever their
// times, but the newer envelope is kept so every device ends on the same one.
// The result does not depend on the order files are loaded in, and loading the same
// file twice changes nothing.

(function () {
  const ENVELOPE = ['id', 'updatedAt', 'device'];

  // JSON with keys sorted at every level, so equal content gives equal text.
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined)
        .map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  // What a record says, apart from who wrote it and when. A deletion counts as
  // content (deleted or not), but its exact time does not.
  function contentOf(rec) {
    const o = {};
    for (const k of Object.keys(rec)) {
      if (ENVELOPE.includes(k)) continue;
      if (k === 'deletedAt') { o.deleted = !!rec.deletedAt; continue; }
      if (rec[k] === null || rec[k] === undefined) continue;
      o[k] = rec[k];
    }
    if (!('deleted' in o)) o.deleted = false;
    return stable(o);
  }

  function sameContent(a, b) { return contentOf(a) === contentOf(b); }

  // true when a is the later change
  function isNewer(a, b) {
    const ta = Date.parse(a.updatedAt), tb = Date.parse(b.updatedAt);
    if (ta !== tb) return ta > tb;
    return String(a.device) > String(b.device);
  }

  // local, incoming: arrays of records. Returns the changes to write and a count of each kind.
  function mergeRecords(local, incoming) {
    const byId = new Map(local.map(r => [r.id, r]));
    const changes = [];   // { id, before, after }: before is null for a new record
    const counts = { added: 0, updated: 0, deleted: 0, unchanged: 0, keptLocal: 0 };
    const seen = new Set();

    for (const rec of incoming) {
      if (seen.has(rec.id)) throw new Error(`the file has ${rec.id} twice`);
      seen.add(rec.id);
      const have = byId.get(rec.id);

      if (!have) {
        changes.push({ id: rec.id, before: null, after: rec });
        counts[rec.deletedAt ? 'deleted' : 'added']++;
        continue;
      }
      if (have.type !== rec.type) throw new Error(`${rec.id} is a ${have.type} here and a ${rec.type} in the file`);

      if (sameContent(have, rec)) {
        // Nothing to see, but keep the newer envelope so devices converge.
        if (isNewer(rec, have)) changes.push({ id: rec.id, before: have, after: rec, quiet: true });
        counts.unchanged++;
        continue;
      }
      if (isNewer(rec, have)) {
        changes.push({ id: rec.id, before: have, after: rec });
        counts[rec.deletedAt && !have.deletedAt ? 'deleted' : 'updated']++;
      } else {
        counts.keptLocal++;
      }
    }
    return { changes, counts };
  }

  // Apply changes to a list, returning a new list. Used by the store and the tests.
  function applyChanges(list, changes) {
    const byId = new Map(list.map(r => [r.id, r]));
    for (const c of changes) byId.set(c.id, c.after);
    return [...byId.values()];
  }

  const api = { mergeRecords, applyChanges, sameContent, isNewer, stable };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteMerge = api;
})();
