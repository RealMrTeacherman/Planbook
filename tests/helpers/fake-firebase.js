// A stand-in for Firebase in the browser tests. My test machine cannot reach Firebase, so
// this copies the behaviour live sync depends on:
//   - the server keeps one document per record and lets the last write win, as Firestore does;
//   - it enforces the same rules as firestore.rules (sign-in, live types only, allowed fields);
//   - each device's backend echoes its own writes at once, queues them while offline, sends
//     them in order on reconnect, and gets every document again when it reconnects.
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'contract', 'contract.json'), 'utf8'));
const LIVE = Object.fromEntries(Object.entries(contract.types).filter(([, t]) => t.space === 'live')
  .map(([k, t]) => [k, new Set([...Object.keys(contract.envelope), ...Object.keys(t.fields)])]));

class FakeServer {
  constructor() {
    this.accounts = new Map();   // email -> { password, uid }
    this.docs = new Map();       // uid -> Map(id -> record)
    this.devices = new Map();    // page -> { uid, listening, offline }
    this.writes = [];            // every accepted write, for the tests to inspect
    this.refused = [];
  }
  addAccount(email, password) { this.accounts.set(email, { password, uid: 'uid-' + email.split('@')[0] }); }
  docsOf(uid) { if (!this.docs.has(uid)) this.docs.set(uid, new Map()); return this.docs.get(uid); }
  allDocs() { return [...this.docs.values()].flatMap(m => [...m.values()]); }

  // The same checks as firestore.rules.
  allowed(uid, rec, id) {
    if (!uid) return 'not signed in';
    if (!rec || rec.id !== id) return 'id does not match';
    const keys = LIVE[rec.type];
    if (!keys) return `type ${rec && rec.type} is not live`;
    const extra = Object.keys(rec).filter(k => !keys.has(k));
    if (extra.length) return `fields not allowed: ${extra.join(', ')}`;
    return null;
  }

  async attach(page) {
    const dev = { uid: null, listening: false, offline: false };
    this.devices.set(page, dev);
    await page.exposeFunction('__srvSignIn', (email, password) => {
      const a = this.accounts.get(email);
      if (!a || a.password !== password) throw new Error('That email and password did not match.');
      return { uid: a.uid, email };
    });
    await page.exposeFunction('__srvListen', uid => {
      dev.uid = uid; dev.listening = true;
      setTimeout(() => this.sendAll(page), 10);
    });
    await page.exposeFunction('__srvUnlisten', () => { dev.listening = false; });
    await page.exposeFunction('__srvPut', (uid, rec) => {
      const why = this.allowed(uid, rec, rec && rec.id);
      if (why) { this.refused.push({ rec, why }); throw new Error('permission-denied: ' + why); }
      this.docsOf(uid).set(rec.id, rec);
      this.writes.push(rec);
      for (const [p, d] of this.devices) {   // everyone else listening and online hears about it
        if (p !== page && d.listening && !d.offline && d.uid === uid) setTimeout(() => this.deliver(p, [rec], false), 10);
      }
    });
    await page.evaluateOnNewDocument(BACKEND);
  }

  deliver(page, records, fromCache) {
    return page.evaluate((records, fromCache) => window.__liveDeliver && window.__liveDeliver({ records, fromCache }), records, fromCache).catch(() => {});
  }
  sendAll(page) {
    const d = this.devices.get(page);
    if (!d || !d.listening || d.offline) return;
    return this.deliver(page, [...this.docsOf(d.uid).values()], false);
  }

  async setOffline(page, offline) {
    const d = this.devices.get(page);
    d.offline = offline;
    await page.evaluate(v => window.__liveSetOffline(v), offline);
    if (!offline) await this.sendAll(page);
  }
}

// Runs in the page: a backend with Firestore's offline behaviour, talking to the server above.
const BACKEND = `
window.__liveBackend = (() => {
  let authCb = null, user = null, deliver = null, offline = false;
  const queue = [];
  const KEY = '__fakeAuth';
  async function flush() {
    while (queue.length && !offline) {
      const q = queue[0];
      try { await window.__srvPut(user.uid, q.rec); queue.shift(); q.ok(); }
      catch (e) { queue.shift(); q.no(new Error(String(e && e.message || e))); }
    }
  }
  window.__liveDeliver = msg => deliver && deliver(msg);
  window.__liveSetOffline = async v => {
    offline = v;
    if (v) { if (deliver) deliver({ records: [], fromCache: true }); }
    else await flush();
  };
  window.__liveQueue = () => queue.length;
  return {
    configured: true,
    async onAuth(cb) {
      authCb = cb;
      try { user = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { user = null; }
      setTimeout(() => cb(user), 0);
      return () => { authCb = null; };
    },
    async signIn(email, password) {
      user = await window.__srvSignIn(email, password);
      localStorage.setItem(KEY, JSON.stringify(user));
      if (authCb) await authCb(user);
    },
    async signOut() { user = null; localStorage.removeItem(KEY); if (authCb) await authCb(null); },
    async listen(cb) {
      deliver = cb;
      if (offline) cb({ records: [], fromCache: true });
      else await window.__srvListen(user.uid);
      return async () => { deliver = null; await window.__srvUnlisten(); };
    },
    put(rec) {
      if (deliver) setTimeout(() => deliver && deliver({ records: [rec], fromCache: offline }), 0);   // Firestore shows your own write at once
      return new Promise((ok, no) => { queue.push({ rec, ok, no }); if (!offline && queue.length === 1) flush(); });
    }
  };
})();
`;

module.exports = { FakeServer, LIVE };
