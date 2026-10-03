// Transport: the only code that moves data between devices. Browser only.
// Needs SuiteContract, SuiteMerge and a store from SuiteStore.open().
//
// No Google sign-in is involved. The MacBook watches one folder that Google Drive for
// Desktop keeps in step; the iPhone sends a file into that folder through the share
// sheet and loads the MacBook's copy from it. If the district ever allows the Drive
// client id, only this file changes.
//
//   classroom-suite.json            the MacBook's full copy, rewritten after every change
//   suite-from-<device>-<id>.json   a file sent from another device, merged then removed

(function () {
  const HUB = 'classroom-suite.json';
  const SCAN_MS = 8000;
  const WRITE_DELAY_MS = 1500;

  // A file another device sent. Drive and Chrome may add " (1)"; Chrome may send it as .txt.
  const DROP = /^suite-from-[a-z0-9-]+(?: ?\(\d+\))?\.(json|txt)$/i;
  const isDropName = name => DROP.test(name);

  const slug = s => String(s || 'device').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'device';

  function guessName() {
    const ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/Macintosh/.test(ua)) return 'MacBook';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Android/.test(ua)) return 'Android phone';
    return 'This device';
  }

  // Check a parsed file before it goes anywhere near the store.
  function checkFile(f, contract) {
    if (f && f.suite === 1 && f.keys) return 'This is a v95 sync file. Bring it in with the v95 import page instead.';
    if (!f || f.contract !== 'classroom-suite') return 'This is not a suite sync file.';
    let r = SuiteContract.validateFile(f, contract);
    if (r.needsUpgrade) {
      // A file from a device that has not updated yet: bring its records up to this version.
      const ups = (typeof SuiteStore !== 'undefined' && SuiteStore.UPGRADES) || {};
      for (let v = f.version + 1; v <= contract.version; v++) {
        if (!ups[v]) return `This file was made by an older version of the suite (${f.version}). Open the suite on that device so it updates, then send it again.`;
        f.records = ups[v](f.records);
      }
      f.version = contract.version;
      r = SuiteContract.validateFile(f, contract);
    }
    if (!r.ok) return 'This file does not match the contract, so nothing was loaded: ' + r.errors.slice(0, 3).join('; ');
    return null;
  }

  function create({ store, contract }) {
    const statusListeners = new Set();
    const tell = () => statusListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

    let ready = null;          // the send-ready file, kept current so Send needs no waiting (Safari needs the tap)
    let deviceName = null;
    let folder = null;         // FileSystemDirectoryHandle on the MacBook
    let timer = null, writeTimer = null;
    let queue = Promise.resolve();
    const serial = fn => (queue = queue.then(fn, fn));   // one folder job at a time

    async function prepare() {
      const f = await store.exportFile();
      const text = JSON.stringify(f);
      ready = { text, name: `suite-from-${slug(deviceName)}-${store.device.slice(4, 8)}.json` };
    }

    store.onChange(async (info) => {
      if (info && info.kind === 'edit') await store.meta.set('unsentSince', (await store.meta.get('unsentSince')) || new Date().toISOString());
      await prepare();
      if (folder) scheduleWrite();
      tell();
    });

    // ---------- Loading a file (both devices) ----------
    async function loadText(text, source) {
      let f;
      try { f = JSON.parse(text); } catch (e) { throw new Error('That file is not a sync file.'); }
      const problem = checkFile(f, contract);
      if (problem) throw new Error(problem);
      const r = await store.load(f.records, { source, kind: 'load' });
      await store.meta.set('lastLoaded', { at: new Date().toISOString(), source, from: f.device, exportedAt: f.exportedAt });
      tell();
      return r;
    }

    // ---------- Sending (the iPhone) ----------
    // Must be called straight from a tap, with nothing awaited first.
    function send() {
      if (!ready) return Promise.reject(new Error('Still opening; try again in a moment.'));
      const { text, name } = ready;
      const asJson = new File([text], name, { type: 'application/json' });
      const asTxt = new File([text], name.replace(/\.json$/, '.txt'), { type: 'text/plain' });
      const done = async (how) => {
        if (how !== 'cancelled') { await store.meta.set('lastSent', { at: new Date().toISOString(), how, name }); await store.meta.set('unsentSince', null); }
        tell();
        return how;
      };
      const pick = navigator.canShare && navigator.canShare({ files: [asJson] }) ? asJson
        : navigator.canShare && navigator.canShare({ files: [asTxt] }) ? asTxt : null;
      if (pick) {
        return navigator.share({ files: [pick], title: 'Classroom suite' })
          .then(() => done('shared'), e => e && e.name === 'AbortError' ? done('cancelled') : download(asJson).then(() => done('downloaded')));
      }
      return download(asJson).then(() => done('downloaded'));
    }

    function download(file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return Promise.resolve();
    }

    // ---------- The watched folder (the MacBook) ----------
    const folderSupported = typeof window.showDirectoryPicker === 'function';

    async function permission(h) {
      if (!h.queryPermission) return 'granted';
      return h.queryPermission({ mode: 'readwrite' });
    }

    async function useFolder(handle) {
      folder = handle;
      await store.meta.set('folder', handle);
      await store.meta.set('folderSkipped', {});
      startWatching();
      await writeHub();
      await scanNow();
      tell();
    }

    async function chooseFolder() {
      const h = await window.showDirectoryPicker({ id: 'classroom-suite', mode: 'readwrite' });
      if (h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Chrome was not allowed to change that folder.');
      await useFolder(h);
    }

    // After a restart Chrome may ask again; this must run from a click.
    async function reconnect() {
      const h = await store.meta.get('folder');
      if (!h) throw new Error('No folder chosen yet.');
      if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Chrome was not allowed to use that folder.');
      folder = h;
      startWatching();
      await writeHub();
      await scanNow();
      tell();
    }

    async function folderState() {
      const h = folder || await store.meta.get('folder');
      if (!h) return { state: 'none' };
      const p = await permission(h);
      return { state: folder && p === 'granted' ? 'watching' : 'reconnect', name: h.name };
    }

    function writeHub() {
      return serial(async () => {
        if (!folder) return;
        const f = await store.exportFile();
        const fh = await folder.getFileHandle(HUB, { create: true });
        const w = await fh.createWritable();       // written to a side file, swapped in on close
        await w.write(JSON.stringify(f));
        await w.close();
        await store.meta.set('lastHubWrite', new Date().toISOString());
      });
    }

    function scheduleWrite() {
      clearTimeout(writeTimer);
      writeTimer = setTimeout(() => writeHub().then(tell, e => { console.error(e); tell(); }), WRITE_DELAY_MS);
    }

    function scanNow() {
      return serial(async () => {
        if (!folder) return { merged: [], skipped: [] };
        // skipped: name -> { lastModified, why }. why is empty for a file merged but not removable.
        const skipped = (await store.meta.get('folderSkipped')) || {};
        const merged = [], problems = [], refused = [];
        const present = new Set();
        for await (const [name, entry] of folder.entries()) {
          if (entry.kind !== 'file' || !isDropName(name)) continue;
          present.add(name);
          const file = await entry.getFile();
          const seen = skipped[name];
          if (seen && seen.lastModified === file.lastModified) {   // already handled; try again only if it changes
            if (seen.why) refused.push({ name, why: seen.why });
            continue;
          }
          try {
            await loadText(await file.text(), name);
            // The MacBook's copy must hold the change before the sent file goes.
            const f = await store.exportFile();
            const fh = await folder.getFileHandle(HUB, { create: true });
            const w = await fh.createWritable(); await w.write(JSON.stringify(f)); await w.close();
            await store.meta.set('lastHubWrite', new Date().toISOString());
            try { await folder.removeEntry(name); present.delete(name); delete skipped[name]; }
            catch (e) { skipped[name] = { lastModified: file.lastModified, why: '' }; }  // cannot delete here: remember it instead
            merged.push(name);
          } catch (e) {
            skipped[name] = { lastModified: file.lastModified, why: e.message };
            problems.push({ name, why: e.message });
            refused.push({ name, why: e.message });
          }
        }
        for (const n of Object.keys(skipped)) if (!present.has(n)) delete skipped[n];   // gone from the folder: forget it
        await store.meta.set('folderSkipped', skipped);
        // problems: every refused file still in the folder, so the warning stays until it is dealt with
        await store.meta.set('lastScan', { at: new Date().toISOString(), merged: merged.length, problems: refused });
        if (merged.length) await store.meta.set('lastMerged', { at: new Date().toISOString(), names: merged });
        tell();
        return { merged, skipped: problems };
      });
    }

    function startWatching() {
      clearInterval(timer);
      timer = setInterval(() => scanNow().catch(e => console.error(e)), SCAN_MS);
    }
    function stopWatching() { clearInterval(timer); timer = null; }

    async function start() {
      deviceName = (await store.meta.get('deviceName')) || guessName();
      await prepare();
      const h = await store.meta.get('folder');
      if (h && (await permission(h)) === 'granted') { folder = h; startWatching(); scanNow().catch(e => console.error(e)); }
      tell();
    }

    async function rename(name) {
      deviceName = String(name || '').trim().slice(0, 30) || guessName();
      await store.meta.set('deviceName', deviceName);
      await prepare();
      tell();
    }

    async function status() {
      const g = k => store.meta.get(k);
      return {
        deviceName, sendName: ready && ready.name, folderSupported,
        folder: await folderState(),
        lastSent: await g('lastSent'), lastLoaded: await g('lastLoaded'), unsentSince: await g('unsentSince'),
        lastScan: await g('lastScan'), lastMerged: await g('lastMerged'), lastHubWrite: await g('lastHubWrite'),
        undo: await g('undo')
      };
    }

    return {
      start, status, rename, send, loadText, chooseFolder, reconnect, useFolder, scanNow, writeHub, stopWatching,
      onStatus: fn => { statusListeners.add(fn); return () => statusListeners.delete(fn); },
      HUB, folderSupported
    };
  }

  const api = { create, isDropName, slug, HUB };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteTransport = api;
})();
