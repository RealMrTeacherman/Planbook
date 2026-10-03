// Live sync for 'live' record types (the planner and calendar). Browser only.
// Needs SuiteMerge, SuiteNames, a store, and a backend:
//   backend.configured            false when no Firebase settings are present
//   backend.onAuth(cb)            cb({ uid, email } | null); returns (a promise of) an unsubscribe
//   backend.signIn(email, pw), backend.signOut()
//   backend.listen(cb)            cb({ records, fromCache } | { error }); records are the changed ones
//   backend.put(record)           resolves when the server has it; queues while offline
// core/live-firebase.js is the real backend; the tests use a stand-in with the same behaviour.
//
// Rules this file keeps:
//   - Only live record types are ever sent, and only live types are ever accepted.
//   - Changes arriving here merge by the usual rule (newer wins) and never touch file-load undo.
//   - If the server holds an older copy than this device (two devices wrote at nearly the
//     same moment), this device sends its newer copy again, so every device ends the same.

(function () {
  function create({ store, contract, backend }) {
    const LIVE = new Set(Object.entries(contract.types).filter(([, t]) => t.space === 'live').map(([k]) => k));
    const listeners = new Set();
    const tell = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    const state = { user: null, connected: false, pending: 0, lastUpdate: null, error: null, listening: false };
    const remote = new Map();   // id -> the copy the server last showed us
    let stopListening = null, initialDone = false;

    const isLive = r => r && LIVE.has(r.type);

    function push(rec) {
      if (!isLive(rec)) throw new Error(`Refused: a ${rec && rec.type} record is private and never leaves this device's Drive path.`);
      if (!state.user) return;
      const r = remote.get(rec.id);
      if (r && (SuiteMerge.sameContent(r, rec) && !SuiteMerge.isNewer(rec, r) || SuiteMerge.isNewer(r, rec))) return;
      state.pending++; tell();
      Promise.resolve(backend.put(rec)).then(() => {
        state.pending--; remote.set(rec.id, rec); tell();
      }, e => {
        state.pending--; state.error = `A change could not be saved to live sync: ${e.message}`; tell();
      });
    }

    // Send every local live record the server lacks or holds an older copy of.
    async function sendNewer(ids) {
      const all = await store.all();
      const pick = ids ? all.filter(r => ids.has(r.id)) : all;
      for (const rec of pick) {
        if (!isLive(rec)) continue;
        const r = remote.get(rec.id);
        if (!r || (SuiteMerge.isNewer(rec, r) && !SuiteMerge.sameContent(rec, r))) push(rec);
      }
    }

    async function onRemote(msg) {
      if (msg.error) { state.error = `Live sync stopped: ${msg.error}`; tell(); return; }
      state.connected = !msg.fromCache;
      const incoming = (msg.records || []).filter(isLive);
      incoming.forEach(r => remote.set(r.id, r));
      if (incoming.length) {
        try { await store.load(incoming, { source: 'live sync', kind: 'live' }); }
        catch (e) { state.error = `A live change could not be merged: ${e.message}`; }
        state.lastUpdate = new Date().toISOString();
      }
      if (!initialDone && state.connected) { initialDone = true; await sendNewer(null); }
      else if (incoming.length) await sendNewer(new Set(incoming.map(r => r.id)));
      tell();
    }

    // Edits, file loads and undo here all go up; changes that came from live sync do not echo back.
    store.onChange(info => {
      if (!state.user || !info || info.kind === 'live') return;
      const now = new Date().toISOString();
      for (const r of info.records || []) {
        if (r.gone) {   // an undo removed a record entirely: tell the other devices with a deletion
          if (LIVE.has(r.type)) push({ id: r.id, type: r.type, updatedAt: now, device: store.device, deletedAt: now });
          continue;
        }
        if (isLive(r)) push(r);
      }
    });

    async function listenNow() {
      if (stopListening) return;
      initialDone = false;
      state.listening = true;
      stopListening = await backend.listen(onRemote);
    }
    async function stopNow() {
      if (stopListening) { const s = stopListening; stopListening = null; await s(); }
      state.listening = false; state.connected = false; remote.clear();
    }

    async function start() {
      if (!backend || !backend.configured) { tell(); return; }
      try {
        await backend.onAuth(async user => {
          state.user = user;
          if (user) await listenNow(); else await stopNow();
          tell();
        });
      } catch (e) { state.error = `Live sync could not start: ${e.message}`; tell(); }
    }

    // What the name check finds in a live record, and whether this device could check at all.
    async function checkNames(rec) {
      const students = (await store.all()).filter(r => r.type === 'student' && !r.deletedAt);
      const hits = [...new Set(SuiteNames.textToCheck(rec, contract).flatMap(t => SuiteNames.nameHits(t, students)))];
      return { hits, classListHere: students.length > 0 };
    }

    return {
      start, checkNames, push,
      configured: !!(backend && backend.configured),
      signIn: (e, p) => backend.signIn(e, p),
      signOut: async () => { await backend.signOut(); },
      status: () => Object.assign({ configured: !!(backend && backend.configured) }, state),
      liveTypes: [...LIVE],
      onStatus: fn => { listeners.add(fn); return () => listeners.delete(fn); }
    };
  }

  const api = { create };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteLive = api;
})();
