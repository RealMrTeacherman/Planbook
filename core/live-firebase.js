// The real live-sync backend: Firebase Auth (email and password) and Firestore.
// Records live at users/<your sign-in id>/records/<record id>; the security rules in
// firestore.rules let only you read or write there, and only live record types.
// The Firebase code is loaded from Google's CDN the first time, then kept by the offline copy.

(function () {
  const VERSION = '10.12.2';
  const BASE = `https://www.gstatic.com/firebasejs/${VERSION}/`;
  const FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => BASE + f);

  const loadSdk = () => Promise.all(FILES.map(u => import(u))).then(([app, auth, fs]) => ({ app, auth, fs }));

  // config: the object Firebase gives you for a web app; null turns live sync off.
  // sdkLoader is swapped out only by the tests.
  function create(config, sdkLoader = loadSdk) {
    if (!config || !config.apiKey || !config.projectId) return { configured: false };
    let ready = null, auth = null, db = null, user = null;
    const init = () => ready || (ready = sdkLoader().then(sdk => {
      const app = sdk.app.initializeApp(config);
      auth = sdk.auth.getAuth(app);
      db = sdk.fs.initializeFirestore(app, { localCache: sdk.fs.persistentLocalCache({ tabManager: sdk.fs.persistentMultipleTabManager() }) });
      return sdk;
    }));
    const mustUser = () => { if (!user) throw new Error('Not signed in.'); return user; };

    return {
      configured: true,
      async onAuth(cb) {
        const sdk = await init();
        return sdk.auth.onAuthStateChanged(auth, u => { user = u ? { uid: u.uid, email: u.email } : null; cb(user); });
      },
      async signIn(email, password) {
        const sdk = await init();
        try { await sdk.auth.signInWithEmailAndPassword(auth, String(email).trim(), password); }
        catch (e) { throw new Error(/invalid|wrong|not-found|credential/i.test(e.code || '') ? 'That email and password did not match.' : `Could not sign in (${e.code || e.message}).`); }
      },
      async signOut() { const sdk = await init(); await sdk.auth.signOut(auth); },
      async listen(cb) {
        const sdk = await init();
        const col = sdk.fs.collection(db, 'users', mustUser().uid, 'records');
        return sdk.fs.onSnapshot(col, { includeMetadataChanges: true },
          snap => cb({ records: snap.docChanges().map(ch => ch.doc.data()), fromCache: snap.metadata.fromCache }),
          err => cb({ error: err.message }));
      },
      async put(rec) {
        const sdk = await init();
        return sdk.fs.setDoc(sdk.fs.doc(db, 'users', mustUser().uid, 'records', rec.id), rec);
      }
    };
  }

  const api = { create, VERSION, FILES };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteLiveFirebase = api;
})();
