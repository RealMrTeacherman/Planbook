// The app's own wiring: offline copy, pages, icons, and which files count as sent from a phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const { isDropName, slug } = require(path.join(ROOT, 'core', 'transport.js'));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

function swInfo() {
  const box = { self: { addEventListener() {} }, caches: {}, location: {} };
  vm.runInNewContext(read('sw.js') + '\n;this.__v = VERSION; this.__f = FILES;', box);
  return { version: box.__v, files: box.__f };
}

test('the offline copy is stamped with this release\'s version', () => {
  assert.equal(swInfo().version, require(path.join(ROOT, 'package.json')).version);
});

test('every file the offline copy lists exists', () => {
  for (const f of swInfo().files) {
    const p = path.join(ROOT, f === './' ? 'index.html' : f.endsWith('/') ? f + 'index.html' : f);
    assert.ok(fs.existsSync(p), f);
  }
});

test('every page and script the app uses is in the offline copy', () => {
  const listed = new Set(swInfo().files);
  for (const dir of ['core', 'contract']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (/\.(js|css|json)$/.test(f)) assert.ok(listed.has(`${dir}/${f}`), `${dir}/${f}`);
    }
  }
  for (const page of ['import/', 'sync/', 'planner/']) assert.ok(listed.has(page) && listed.has(page + 'index.html'), page);
  for (const f of fs.readdirSync(path.join(ROOT, 'planner'))) assert.ok(listed.has('planner/' + f), 'planner/' + f);
  for (const f of fs.readdirSync(path.join(ROOT, 'data'))) assert.ok(listed.has('data/' + f), 'data/' + f);
});

test('every page sets up the offline copy and the home-screen app, with relative paths only', () => {
  for (const p of ['index.html', 'import/index.html', 'sync/index.html', 'planner/index.html']) {
    const html = read(p);
    assert.match(html, /core\/boot\.js/, p);
    assert.match(html, /rel="manifest"/, p);
    assert.match(html, /rel="apple-touch-icon"/, p);
    assert.doesNotMatch(html, /(src|href)="\/(?!\/)/, `${p} uses a path from the site root, which breaks under /Planbook/`);
  }
});

test('the manifest\'s icons exist and the iPhone icon is square-cornered', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
  assert.ok(fs.existsSync(path.join(ROOT, 'icons/icon-180.png')));
  assert.equal(m.start_url, './');
});

test('files sent from a phone are recognised, with Drive\'s and Chrome\'s renames', () => {
  for (const n of ['suite-from-iphone-ab12.json', 'suite-from-iphone-ab12 (1).json', 'suite-from-iphone-ab12(2).json', 'suite-from-iphone-ab12.txt', 'SUITE-FROM-IPHONE-AB12.JSON'])
    assert.equal(isDropName(n), true, n);
  for (const n of ['classroom-suite.json', 'notes.json', 'suite-from-.json', 'suite-from-iphone.json.bak', 'classroom.mac-6717bf.json', 'suite-from-a/b.json'])
    assert.equal(isDropName(n), false, n);
});

test('device names become safe file names', () => {
  assert.equal(slug('iPhone'), 'iphone');
  assert.equal(slug("Josh's MacBook Air"), 'josh-s-macbook-air');
  assert.equal(slug(''), 'device');
});
