// Step 3's gate, in real Chrome, with the stand-in Firebase from helpers/fake-firebase.js.
// Three devices, each its own browser profile: a MacBook and an iPhone with the class list,
// and an iPad without one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findChrome, loadPuppeteer, serve, newPage } = require('./helpers/browser');
const { FakeServer } = require('./helpers/fake-firebase');

const SAMPLE = path.join(__dirname, 'fixtures', 'v95-sample.json');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'suite-screens');
const chrome = findChrome(), puppeteer = loadPuppeteer();
const skip = !chrome || !puppeteer ? 'no Chrome or puppeteer-core here' : false;
const EMAIL = 'teacher@example.com', PW = 'correct horse';

test('live sync for the planner', { skip, timeout: 240000 }, async (t) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/Planbook`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const fb = new FakeServer();
  fb.addAccount(EMAIL, PW);

  const device = async (opts) => {
    const page = await newPage(await browser.createBrowserContext(), opts);
    await fb.attach(page);
    return page;
  };
  const mac = await device({ width: 1280 });
  const phone = await device({ width: 390, iphone: true });
  const ipad = await device({ width: 820 });

  const go = async (page, where) => {
    await page.goto(`${base}/${where}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready === true', { timeout: 15000 });
  };
  const importFile = async (page, file) => {
    await go(page, 'import');
    await (await page.$('#file')).uploadFile(file);
    await page.waitForFunction("!document.getElementById('preview').hidden");
    await page.click('#load');
    await page.waitForFunction("!document.getElementById('result').hidden");
  };
  const signIn = async (page) => {
    await page.waitForFunction("!document.getElementById('liveSignIn').hidden");
    await page.type('#liveEmail', EMAIL);
    await page.type('#livePw', PW);
    await page.click('#liveGo');
    await page.waitForFunction("!document.getElementById('liveOn').hidden");
    await page.waitForFunction(() => /up to date/.test(document.getElementById('liveStatus').innerText), { timeout: 10000 });
  };
  const rec = (page, id) => page.evaluate(async id => (await window.__store.all()).find(r => r.id === id) || null, id);
  const live = page => page.evaluate(async () => (await window.__store.all()).filter(r => ['schoolDay', 'schoolYear', 'gradingPeriod'].includes(r.type)).sort((a, b) => a.id < b.id ? -1 : 1));
  const waitFor = (page, fn, arg) => page.waitForFunction(fn, { timeout: 10000 }, arg);
  const addDay = async (page, date, label, answer) => {
    let asked = null;
    const onDialog = async d => { asked = d.message(); answer === false ? await d.dismiss() : await d.accept(); };
    page.on('dialog', onDialog);
    await page.$eval('#dayDate', (e, v) => { e.value = v; }, date);
    await page.$eval('#dayLabel', e => { e.value = ''; });
    if (label) await page.type('#dayLabel', label);
    await page.click('#dayAdd');
    await new Promise(r => setTimeout(r, 400));
    page.off('dialog', onDialog);
    return asked;
  };
  const settle = () => new Promise(r => setTimeout(r, 600));

  try {
    await t.test('without Firebase settings, live sync says it is off and nothing else changes', async () => {
      const bare = await newPage(await browser.createBrowserContext(), { width: 390 });
      await go(bare, 'sync');
      assert.equal(await bare.$eval('#liveOff', e => e.hidden), false);
      assert.equal(await bare.$eval('#liveSignIn', e => e.hidden), true);
      assert.equal(await bare.$eval('#liveTry', e => e.hidden), true);
      assert.deepEqual(bare.errors, []);
      await bare.close();
    });

    await t.test('a wrong password is refused with a plain message', async () => {
      await go(mac, 'sync');
      await mac.type('#liveEmail', EMAIL);
      await mac.type('#livePw', 'nope');
      await mac.click('#liveGo');
      await waitFor(mac, () => /did not match/.test(document.getElementById('problemText').textContent));
      await mac.$eval('#liveEmail', e => { e.value = ''; });
      await mac.$eval('#livePw', e => { e.value = ''; });
    });

    await t.test('signing in sends the calendar, and only the calendar', async () => {
      await importFile(mac, SAMPLE);
      await go(mac, 'sync');
      await signIn(mac);
      await settle();
      const types = new Set(fb.allDocs().map(r => r.type));
      assert.deepEqual([...types].sort(), ['gradingPeriod', 'schoolDay', 'schoolYear']);
      assert.equal(fb.allDocs().length, 6);
      assert.deepEqual(fb.refused, []);
    });

    await t.test('the iPhone signs in and gets the calendar; its own copy of it is not sent back', async () => {
      await importFile(phone, SAMPLE);
      await go(phone, 'sync');
      const before = fb.writes.length;
      await signIn(phone);
      await settle();
      assert.equal(fb.writes.length, before, 'same content is not sent again');
      assert.deepEqual(await live(phone), await live(mac));
    });

    await t.test('a day off added on the MacBook appears on the iPhone within seconds', async () => {
      const start = Date.now();
      await addDay(mac, '2026-12-18', 'Teacher work day');
      await waitFor(phone, () => /Teacher work day/.test(document.getElementById('daysOff').innerText));
      assert.ok(Date.now() - start < 5000);
      await phone.screenshot({ path: path.join(SHOTS, '8-live-phone.png'), fullPage: true });
    });

    await t.test('a label with a class-list name asks first; No saves nothing', async () => {
      const asked = await addDay(mac, '2027-01-08', "Mila's birthday party", false);
      assert.match(asked, /"Mila" is a name on your class list/);
      await settle();
      assert.equal(await rec(mac, 'sday_2027-01-08'), null);
      assert.equal(fb.allDocs().some(r => r.id === 'sday_2027-01-08'), false);
    });

    await t.test('a nickname counts too, and Save anyway saves it', async () => {
      const asked = await addDay(phone, '2027-01-11', 'Theo out all day', true);
      assert.match(asked, /"Theo"/);
      await waitFor(mac, () => /Theo out all day/.test(document.getElementById('daysOff').innerText));
    });

    await t.test('a word that only contains a name does not count', async () => {
      const asked = await addDay(mac, '2027-01-12', 'Milan trip planning');
      assert.equal(asked, null);
    });

    await t.test('a device with no class list says it cannot check names', async () => {
      await go(ipad, 'sync');
      await signIn(ipad);
      assert.equal(await ipad.$eval('#noClassList', e => e.hidden), false);
      assert.equal(await mac.$eval('#noClassList', e => e.hidden), true);
      assert.deepEqual(await live(ipad), await live(mac));
    });

    await t.test('both devices edit offline; the later edit wins everywhere once they reconnect', async () => {
      await fb.setOffline(phone, true); await fb.setOffline(mac, true);
      await waitFor(phone, () => /offline/.test(document.getElementById('liveStatus').innerText));
      await addDay(phone, '2027-02-12', 'Phone-only day');                  // only the iPhone has this
      const vet = await rec(phone, 'sday_2026-11-11');
      await phone.evaluate(async r => window.__store.write([Object.assign({}, r, { label: 'Veterans Day (phone)' })]), vet);
      await new Promise(r => setTimeout(r, 30));
      await addDay(mac, '2027-02-15', 'Mac-only day');
      await fb.setOffline(mac, false);                                      // the MacBook is back first...
      await mac.evaluate(async r => window.__store.write([Object.assign({}, r, { label: 'Veterans Day (mac, later)' })]), vet);
      await settle();
      await fb.setOffline(phone, false);                                    // ...and the iPhone's older edit lands after it
      await waitFor(phone, () => /Mac-only day/.test(document.getElementById('daysOff').innerText));
      await waitFor(mac, () => /Phone-only day/.test(document.getElementById('daysOff').innerText));
      await settle(); await settle();
      assert.equal((await rec(mac, 'sday_2026-11-11')).label, 'Veterans Day (mac, later)');
      assert.equal((await rec(phone, 'sday_2026-11-11')).label, 'Veterans Day (mac, later)');
      assert.equal(fb.docsOf('uid-teacher').get('sday_2026-11-11').label, 'Veterans Day (mac, later)', 'the server ends on the newer copy too');
      // Prove the hard case really happened: the iPhone's older edit reached the server after the
      // MacBook's newer one, and the MacBook then sent its newer copy again.
      const vetWrites = fb.writes.filter(r => r.id === 'sday_2026-11-11').map(r => r.label);
      const iPhoneAt = vetWrites.lastIndexOf('Veterans Day (phone)');
      assert.ok(iPhoneAt > vetWrites.indexOf('Veterans Day (mac, later)'), `writes were: ${vetWrites.join(' | ')}`);
      assert.equal(vetWrites[vetWrites.length - 1], 'Veterans Day (mac, later)');
      assert.deepEqual(await live(phone), await live(mac));
      assert.deepEqual(await live(ipad), await live(mac));
    });

    await t.test('removing a day off removes it on every device', async () => {
      await phone.click('button[data-off="sday_2027-02-15"]');
      await waitFor(mac, () => !/Mac-only day/.test(document.getElementById('daysOff').innerText));
      assert.ok((await rec(ipad, 'sday_2027-02-15')).deletedAt);
    });

    await t.test('private records are refused by the app and by the server', async () => {
      const msg = await mac.evaluate(async () => {
        const s = (await window.__store.all()).find(r => r.type === 'student');
        try { window.__live.push(s); return 'sent'; } catch (e) { return e.message; }
      });
      assert.match(msg, /private/);
      const direct = await mac.evaluate(async () => {
        const s = (await window.__store.all()).find(r => r.type === 'student');
        try { await window.__srvPut('uid-teacher', s); return 'accepted'; } catch (e) { return String(e.message || e); }
      });
      assert.match(direct, /permission-denied.*not live/);
      const extra = await mac.evaluate(async () => {
        try { await window.__srvPut('uid-teacher', { id: 'sday_2027-03-01', type: 'schoolDay', updatedAt: new Date().toISOString(), device: 'x', deletedAt: null, date: '2027-03-01', kind: 'noSchool', studentId: 'stu_k3j9x2a' }); return 'accepted'; }
        catch (e) { return String(e.message || e); }
      });
      assert.match(extra, /fields not allowed: studentId/);
      assert.equal(fb.allDocs().some(r => !['schoolDay', 'schoolYear', 'gradingPeriod'].includes(r.type)), false);
    });

    await t.test('a private record arriving from the server is ignored, never merged', async () => {
      const r = await phone.evaluate(async () => {
        const s = (await window.__store.all()).find(r => r.id === 'stu_k3j9x2a');
        const bad = Object.assign({}, s, { firstName: 'Changed by server', updatedAt: new Date(Date.now() + 60000).toISOString() });
        await window.__liveDeliver({ records: [bad], fromCache: false });
        await new Promise(r => setTimeout(r, 300));
        return (await window.__store.all()).find(r => r.id === 'stu_k3j9x2a').firstName;
      });
      assert.equal(r, 'Mila');
    });

    await t.test('changes arriving live never replace "Undo the last load"', async () => {
      await go(mac, 'sync');
      assert.match(await mac.$eval('#undoText', e => e.textContent), /v95-sample\.json/);
    });

    await t.test('undoing a file load on one device takes its calendar days away everywhere, and nothing else', async () => {
      const f = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
      const days = JSON.parse(f.keys['lp:days:v2']);
      days['2027-03-26'] = { saved: true, noSchool: true, closedLabel: 'Spring break', entries: {} };
      f.keys['lp:days:v2'] = JSON.stringify(days);
      f.updatedAt = '2026-10-02T09:00:00.000Z';
      const p = path.join(os.tmpdir(), 'v95-with-break.json'); fs.writeFileSync(p, JSON.stringify(f));
      await importFile(ipad, p);
      await go(ipad, 'sync');   // live sync runs on the Sync page; it sends what the import brought in
      await waitFor(mac, async () => !!(await window.__store.all()).find(r => r.id === 'sday_2027-03-26' && !r.deletedAt));
      await ipad.click('#undo');
      await waitFor(mac, async () => !!(await window.__store.all()).find(r => r.id === 'sday_2027-03-26' && r.deletedAt));
      assert.ok(!(await rec(mac, 'sday_2026-11-11')).deletedAt, 'days that were already shared stay');
      assert.ok(!(await rec(phone, 'sday_2026-12-18')).deletedAt);
    });

    await t.test('signed out, a device hears nothing; signed back in, it catches up', async () => {
      await go(phone, 'sync');
      await phone.click('#liveOut');
      await waitFor(phone, () => !document.getElementById('liveSignIn').hidden);
      await addDay(mac, '2027-04-02', 'While signed out');
      await settle();
      assert.equal(await rec(phone, 'sday_2027-04-02'), null);
      await signIn(phone);
      await waitFor(phone, async () => !!(await window.__store.all()).find(r => r.id === 'sday_2027-04-02'));
    });

    await t.test('every device ends with the same calendar as the server', async () => {
      await settle();
      const server = [...fb.docsOf('uid-teacher').values()].sort((a, b) => a.id < b.id ? -1 : 1);
      assert.deepEqual(await live(mac), server);
      assert.deepEqual(await live(phone), server);
      assert.deepEqual(await live(ipad), server);
    });

    await t.test('no page errors on any device', () => {
      assert.deepEqual(mac.errors, []); assert.deepEqual(phone.errors, []); assert.deepEqual(ipad.errors, []);
    });
  } finally {
    await browser.close();
    server.close();
  }
});
