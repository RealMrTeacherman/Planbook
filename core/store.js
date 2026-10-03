// The one place records live on a device. Browser only (IndexedDB).
// Needs SuiteMerge and SuiteContract loaded first.
//
// Promises it keeps:
//   - Nothing is written unless the whole result passes the contract.
//   - A load is one transaction: all of it lands, or none of it.
//   - The last load can be undone, exactly.
//   - Schema upgrades run once each, in order, when the store opens.

(function () {
  const DB_NAME = 'classroom-suite';
  const DB_VERSION = 1;

  // One upgrade step per contract version: UPGRADES[n] turns version n-1 records into version n.
  // Empty until version 2 exists; tests add a step to prove the mechanism.
  const UPGRADES = {};

  const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const done = tx => new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error || new Error('write cancelled')); });

  function openDb(name) {
    return new Promise((ok, no) => {
      const r = indexedDB.open(name, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' }).createIndex('type', 'type');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('v95')) db.createObjectStore('v95');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
      r.onblocked = () => no(new Error('Close the suite in your other tabs, then try again.'));
    });
  }

  function makeDeviceId() {
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    return 'dev-' + [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  }

  async function open(opts) {
    const { contract, name = DB_NAME, upgrades = UPGRADES } = opts;
    const db = await openDb(name);

    async function metaGet(k) { return req(db.transaction('meta').objectStore('meta').get(k)); }
    async function metaSet(k, v) { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(v, k); await done(tx); }
    async function all() { return req(db.transaction('records').objectStore('records').getAll()); }

    // Anything that wants to know the data changed (the folder writer, the send-ready copy).
    const listeners = new Set();
    const changed = (why) => listeners.forEach(fn => { try { fn(why); } catch (e) { console.error(e); } });

    // Device id, made once.
    let device = await metaGet('device');
    if (!device) { device = makeDeviceId(); await metaSet('device', device); }

    // Schema upgrades.
    let schema = await metaGet('schemaVersion');
    if (schema == null) { schema = contract.version; await metaSet('schemaVersion', schema); }
    if (schema > contract.version) throw new Error('This device holds data from a newer version of the suite. Update the app first.');
    while (schema < contract.version) {
      const step = upgrades[schema + 1];
      if (!step) throw new Error(`No upgrade step from version ${schema} to ${schema + 1}.`);
      const before = await all();
      const after = step(before.map(r => JSON.parse(JSON.stringify(r))));
      // The contract file describes the current version only, so the last step is checked against it.
      const check = schema + 1 === contract.version ? SuiteContract.validateFile(fileOf(after, device), contract) : { ok: true };
      if (!check.ok) throw new Error('Upgrade step ' + (schema + 1) + ' produced bad data: ' + check.errors.slice(0, 3).join('; '));
      const tx = db.transaction(['records', 'meta'], 'readwrite');
      const rs = tx.objectStore('records');
      rs.clear();
      after.forEach(r => rs.put(r));
      tx.objectStore('meta').put(schema + 1, 'schemaVersion');
      await done(tx);
      schema++;
    }

    function fileOf(records, dev, version) {
      return { contract: 'classroom-suite', version: version || contract.version, exportedAt: new Date().toISOString(), device: dev || device, records };
    }

    // Merge incoming records. Validates the whole result first; writes nothing if it fails.
    // extra: { v95: {key: value} } to keep v95 data alongside, { meta: {k: v} } for bookkeeping.
    async function load(incoming, info = {}, extra = {}) {
      const current = await all();
      const { changes, counts } = SuiteMerge.mergeRecords(current, incoming);
      const next = SuiteMerge.applyChanges(current, changes);
      const check = SuiteContract.validateFile(fileOf(next), contract);
      if (!check.ok) {
        const e = new Error('Nothing was loaded: the result would not match the contract.');
        e.details = check.errors;
        throw e;
      }
      // Kept v95 data: only keys whose value actually differs are written.
      const v95Store = db.transaction('v95').objectStore('v95');
      const v95Before = {};
      const v95Keys = [];
      for (const k of Object.keys(extra.v95 || {})) {
        v95Before[k] = await req(v95Store.get(k));
        if (SuiteMerge.stable(v95Before[k]) !== SuiteMerge.stable(extra.v95[k])) v95Keys.push(k);
      }
      const metaKeys = Object.keys(extra.meta || {});
      const metaBefore = {};
      for (const k of metaKeys) metaBefore[k] = await metaGet(k);
      const visible = changes.filter(c => !c.quiet).length;
      // A load that changes nothing writes nothing, so the last real load stays undoable.
      const touched = changes.length + v95Keys.length;

      if (touched) {
        const tx = db.transaction(['records', 'meta', 'v95'], 'readwrite');
        const rs = tx.objectStore('records');
        changes.forEach(c => rs.put(c.after));
        v95Keys.forEach(k => tx.objectStore('v95').put(extra.v95[k], k));
        const meta = tx.objectStore('meta');
        Object.entries(extra.meta || {}).forEach(([k, v]) => meta.put(v, k));
        // Undo holds exactly what this load replaced. Only file loads can be undone: edits
        // made here, and changes arriving by live sync, leave the last load's undo in place.
        if ((info.kind || 'load') === 'load') meta.put({
          at: new Date().toISOString(), source: info.source || 'a file',
          records: changes.map(c => ({ id: c.id, type: c.after.type, before: c.before, afterAt: c.after.updatedAt, afterDevice: c.after.device })),
          v95: v95Keys.map(k => ({ key: k, before: v95Before[k] === undefined ? null : v95Before[k] })),
          meta: metaKeys.map(k => ({ key: k, before: metaBefore[k] === undefined ? null : metaBefore[k] }))
        }, 'undo');
        await done(tx);
        changed({ kind: info.kind || 'load', source: info.source || 'a file', records: changes.map(c => c.after) });
      }
      return { counts, changed: visible };
    }

    // Edits made in the app: stamp them and load them like anything else.
    async function write(records, source = 'an edit') {
      const now = new Date().toISOString();
      return load(records.map(r => Object.assign({}, r, { updatedAt: now, device })), { source, kind: 'edit' });
    }

    async function undo() {
      const u = await metaGet('undo');
      if (!u) throw new Error('There is no load to undo.');
      // A record changed again since the load (an edit made here afterwards) is kept as it is now.
      const now = new Map((await all()).map(r => [r.id, r]));
      const stillFromLoad = x => { const c = now.get(x.id); return !x.afterAt || (c && c.updatedAt === x.afterAt && c.device === x.afterDevice); };
      const kept = u.records.filter(x => !stillFromLoad(x)).length;
      const tx = db.transaction(['records', 'meta', 'v95'], 'readwrite');
      const rs = tx.objectStore('records'), vs = tx.objectStore('v95'), ms = tx.objectStore('meta');
      u.records.filter(stillFromLoad).forEach(x => x.before ? rs.put(x.before) : rs.delete(x.id));
      u.v95.forEach(x => x.before === null ? vs.delete(x.key) : vs.put(x.before, x.key));
      (u.meta || []).forEach(x => x.before === null ? ms.delete(x.key) : ms.put(x.before, x.key));
      ms.delete('undo');
      await done(tx);
      changed({ kind: 'undo', source: u.source, records: u.records.filter(stillFromLoad).map(x => x.before || { id: x.id, type: x.type, gone: true }) });
      return { source: u.source, at: u.at, kept };
    }

    async function counts() {
      const out = {};
      (await all()).forEach(r => { if (!r.deletedAt) out[r.type] = (out[r.type] || 0) + 1; });
      return out;
    }

    async function v95Keys() { return req(db.transaction('v95').objectStore('v95').getAllKeys()); }

    return {
      device, all, load, write, undo, counts, v95Keys,
      meta: { get: metaGet, set: metaSet },
      exportFile: async () => fileOf(await all()),
      onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      // Ask the browser not to clear this data when space runs low.
      persist: async () => { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; } },
      close: () => db.close()
    };
  }

  window.SuiteStore = { open, UPGRADES, DB_NAME };
})();
