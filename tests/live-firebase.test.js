// The real Firebase backend, driven by a pretend Firebase library that records every call.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const FB = require(process.env.SUITE_LIVE_FIREBASE || path.join(ROOT, 'core', 'live-firebase.js'));

function pretend() {
  const calls = [];
  let authCb = null, snapCb = null;
  const sdk = {
    app: { initializeApp: cfg => { calls.push(['initializeApp', cfg.projectId]); return { app: true }; } },
    auth: {
      getAuth: () => ({ auth: true }),
      onAuthStateChanged: (a, cb) => { authCb = cb; return () => calls.push(['unsubAuth']); },
      signInWithEmailAndPassword: async (a, email, pw) => {
        calls.push(['signIn', email]);
        if (pw !== 'right') { const e = new Error('x'); e.code = 'auth/invalid-credential'; throw e; }
        authCb({ uid: 'u1', email });
      },
      signOut: async () => { calls.push(['signOut']); authCb(null); }
    },
    fs: {
      initializeFirestore: (app, opts) => { calls.push(['initializeFirestore', !!opts.localCache]); return { db: true }; },
      persistentLocalCache: o => ({ persistent: true, o }), persistentMultipleTabManager: () => ({ tabs: true }),
      collection: (db, ...p) => ({ path: p.join('/') }),
      doc: (db, ...p) => ({ path: p.join('/') }),
      onSnapshot: (col, opts, cb, err) => { calls.push(['onSnapshot', col.path, opts.includeMetadataChanges]); snapCb = cb; return () => calls.push(['unsubSnap']); },
      setDoc: async (ref, data) => { calls.push(['setDoc', ref.path, data.id]); }
    }
  };
  return { sdk, calls, snap: s => snapCb(s) };
}
const CONFIG = { apiKey: 'k', projectId: 'planbook-test', authDomain: 'x', appId: 'a' };

test('with no settings, live sync is simply off', () => {
  assert.equal(FB.create(null).configured, false);
  assert.equal(FB.create({}).configured, false);
});

test('it keeps an offline copy, signs in by email, and listens under your own id', async () => {
  const p = pretend();
  const be = FB.create(CONFIG, async () => p.sdk);
  const seen = [];
  await be.onAuth(u => seen.push(u));
  await be.signIn(' me@example.com ', 'right');
  assert.deepEqual(seen.at(-1), { uid: 'u1', email: 'me@example.com' });
  const got = [];
  await be.listen(m => got.push(m));
  assert.deepEqual(p.calls.find(c => c[0] === 'initializeFirestore'), ['initializeFirestore', true]);
  assert.deepEqual(p.calls.find(c => c[0] === 'onSnapshot'), ['onSnapshot', 'users/u1/records', true]);
  p.snap({ docChanges: () => [{ doc: { data: () => ({ id: 'sday_2026-11-11' }) } }], metadata: { fromCache: false } });
  assert.deepEqual(got[0], { records: [{ id: 'sday_2026-11-11' }], fromCache: false });
  await be.put({ id: 'sday_2026-11-11', type: 'schoolDay' });
  assert.deepEqual(p.calls.find(c => c[0] === 'setDoc'), ['setDoc', 'users/u1/records/sday_2026-11-11', 'sday_2026-11-11']);
});

test('a wrong password gives a plain message', async () => {
  const p = pretend();
  const be = FB.create(CONFIG, async () => p.sdk);
  await be.onAuth(() => {});
  await assert.rejects(be.signIn('me@example.com', 'wrong'), /did not match/);
});

test('nothing is read or written before signing in', async () => {
  const p = pretend();
  const be = FB.create(CONFIG, async () => p.sdk);
  await be.onAuth(() => {});
  await assert.rejects(be.put({ id: 'x' }), /Not signed in/);
  await assert.rejects(be.listen(() => {}), /Not signed in/);
});

test('Firebase loads once, however many times it is used', async () => {
  let loads = 0;
  const p = pretend();
  const be = FB.create(CONFIG, async () => { loads++; return p.sdk; });
  await Promise.all([be.onAuth(() => {}), be.signIn('a@b.c', 'right')]);
  await be.put({ id: 'y' });
  assert.equal(loads, 1);
});

test('the offline copy keeps the same Firebase version this file loads', () => {
  const box = { self: { addEventListener() {} }, caches: {}, location: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + ';this.__r = REMOTE;', box);
  assert.deepEqual([...box.__r], FB.FILES);
});

test('the settings file is either empty (live sync off) or a complete Firebase setup', () => {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'settings', 'firebase.js'), 'utf8'), box);
  const c = box.window.PLANBOOK_FIREBASE;
  if (c === null) return;
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) assert.equal(typeof c[k], 'string', k);
  assert.match(c.authDomain, /\.firebaseapp\.com$/);
  assert.equal(FB.create(c).configured, true);
});
