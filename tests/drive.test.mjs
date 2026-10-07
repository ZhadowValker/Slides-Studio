import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, wait } from './helpers.mjs';

const CLIENT = '123-abc.apps.googleusercontent.com';
const read = (blob, w) => new Promise((res) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.readAsText(blob); });

// A tiny in-memory Google: token client, picker and Drive REST.
function fakeGoogle({ expire401 = false, apiKey = 'AIzaTEST' } = {}) {
  const g = { calls: [], tokens: 0, files: new Map(), nextId: 1, revoked: [], picks: [], authHeaders: [], fail401: expire401 };
  g.init = (w) => {
    w.localStorage.setItem('slides-studio:google', JSON.stringify({ clientId: CLIENT, apiKey }));
    w.google = {
      accounts: { oauth2: {
        initTokenClient: (cfg) => ({ requestAccessToken: (o) => { g.tokens++; g.lastPrompt = o && o.prompt; setTimeout(() => cfg.callback({ access_token: 'tok' + g.tokens, expires_in: 3600 }), 0); } }),
        revoke: (t, cb) => { g.revoked.push(t); cb && cb(); },
      } },
      picker: {
        ViewId: { DOCS: 'docs', DOCS_IMAGES: 'images' }, Action: { PICKED: 'picked', CANCEL: 'cancel' },
        DocsView: class { constructor(v) { this.v = v; } setMimeTypes() { return this; } setIncludeFolders() { return this; } },
        PickerBuilder: class {
          setOAuthToken() { return this; } setDeveloperKey() { return this; } setAppId() { return this; } addView(v) { this.v = v; return this; } setTitle() { return this; }
          setCallback(cb) { this.cb = cb; return this; }
          build() { return { setVisible: () => { const next = g.picks.shift(); setTimeout(() => this.cb(next || { action: 'cancel' }), 0); } }; }
        },
      },
    };
    w.fetch = async (url, opts = {}) => {
      url = String(url); const method = opts.method || 'GET';
      g.authHeaders.push(opts.headers && opts.headers.Authorization);
      g.calls.push({ method, url });
      if (g.fail401) { g.fail401 = false; return { ok: false, status: 401, json: async () => ({ error: { message: 'expired' } }) }; }
      const json = (o) => ({ ok: true, status: 200, json: async () => o });
      if (url.startsWith('https://www.googleapis.com/upload/')) {
        const body = await read(opts.body, w);
        const parts = body.split(/--ss\w+/).filter((p) => p.includes('Content-Type'));
        const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim() || '{}');
        const data = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '');
        const m = url.match(/files\/([^?]+)/);
        let id = m && decodeURIComponent(m[1]);
        if (method === 'PATCH') { if (!g.files.has(id)) return { ok: false, status: 404, json: async () => ({ error: { message: 'File not found' } }) }; Object.assign(g.files.get(id), { data }); }
        else { id = 'f' + g.nextId++; g.files.set(id, { id, name: meta.name, meta, data }); }
        const f = g.files.get(id);
        return json({ id, name: f.name, webViewLink: 'https://drive.google.com/file/d/' + id + '/view' });
      }
      if (url.includes('alt=media')) {
        const id = decodeURIComponent(url.match(/files\/([^?]+)/)[1]); const f = g.files.get(id);
        return { ok: true, status: 200, text: async () => f.data, blob: async () => f.blob || new w.Blob([f.data], { type: 'text/plain' }) };
      }
      if (method === 'GET' && url.includes('slides-studio.json')) {
        return json({ files: [...g.files.values()].filter((f) => f.name && f.name.endsWith('.slides-studio.json')).map((f) => ({ id: f.id, name: f.name, modifiedTime: '2026-10-07T00:00:00Z' })) });
      }
      if (method === 'GET' && url.includes('/drive/v3/files?q=')) {
        const hit = [...g.files.values()].find((f) => f.meta && f.meta.mimeType === 'application/vnd.google-apps.folder');
        return json({ files: hit ? [{ id: hit.id, name: hit.name }] : [] });
      }
      if (method === 'POST' && url.includes('/drive/v3/files')) {
        const meta = JSON.parse(opts.body); const id = 'f' + g.nextId++; g.files.set(id, { id, name: meta.name, meta, data: '' }); return json({ id });
      }
      return { ok: false, status: 400, json: async () => ({}) };
    };
  };
  return g;
}
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
const menuItem = (a, label) => a.$$('.pop .mi').find((b) => b.textContent.includes(label));
const openCloud = (a) => click(a.$('#viewBar [aria-label="Google Drive"], #viewBar [title="Google Drive"]'));

test('without keys the cloud menu opens the setup dialog and saves keys', async () => {
  const a = await boot();
  a.$('#driveDlg').showModal = function () { this.setAttribute('open', ''); };
  a.$('#driveDlg').close = function () { this.removeAttribute('open'); };
  openCloud(a); click(menuItem(a, 'Use my own Google keys'));
  assert.ok(a.$('#driveDlg').hasAttribute('open'));
  a.$('#gClient').value = 'nope'; click(a.$('#gSave'));
  assert.match(a.$('#gWarn').textContent, /apps\.googleusercontent\.com/);
  a.$('#gClient').value = CLIENT; click(a.$('#gSave'));
  assert.equal(JSON.parse(a.w.localStorage.getItem('slides-studio:google')).clientId, CLIENT);
  assert.deepEqual(a.errors, []); a.close();
});

test('save creates the folder and file, then updates it and autosaves', async () => {
  const g = fakeGoogle(); const a = await boot({ init: g.init });
  assert.ok(a.$('#driveChip').hidden);
  openCloud(a); click(menuItem(a, 'Save deck to Drive')); await wait(300);
  const file = [...g.files.values()].find((f) => f.name.endsWith('.slides-studio.json'));
  assert.ok(file, 'deck file created');
  assert.equal(g.lastPrompt, 'consent');
  assert.ok(g.files.size === 2 && [...g.files.values()].some((f) => f.meta.mimeType.includes('folder')));
  assert.deepEqual(file.meta.parents.length, 1);
  assert.equal(JSON.parse(file.data).format, 'slides-studio');
  assert.ok(!a.$('#driveChip').hidden);
  assert.match(a.$('#driveChip').textContent, /Saved to Drive/);
  // edit -> autosave PATCHes the same file
  a.$('#deckTitle').value = 'Renamed'; a.$('#deckTitle').dispatchEvent(new a.w.Event('change', { bubbles: true }));
  assert.match(a.$('#driveChip').textContent, /not in Drive/);
  await wait(4600);
  assert.equal(g.calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.equal(JSON.parse(file.data).deck.title, 'Renamed');
  assert.equal(g.tokens, 1, 'token reused');
  const saved = JSON.parse(a.w.localStorage.getItem('slides-studio:v1'));
  assert.equal(saved.drive.id, file.id);
  assert.deepEqual(a.errors, []); a.close();
});

test('a 401 refreshes the token once and retries', async () => {
  const g = fakeGoogle(); const a = await boot({ init: g.init });
  openCloud(a); click(menuItem(a, 'Save deck to Drive')); await wait(300);
  g.fail401 = true; openCloud(a); click(menuItem(a, 'Save to Drive now')); await wait(300);
  assert.equal(g.tokens, 2);
  assert.match(a.$('#driveChip').textContent, /Saved to Drive/);
  a.close();
});

test('open a deck from Drive', async () => {
  const g = fakeGoogle(); const a = await boot({ init: g.init });
  const deck = { format: 'slides-studio', version: 1, deck: { title: 'From Drive', theme: 'ink', slides: [{ id: 's1', elements: [] }] }, assets: {} };
  g.files.set('abc', { id: 'abc', name: 'x.slides-studio.json', meta: {}, data: JSON.stringify(deck) });
  g.picks.push({ action: 'picked', docs: [{ id: 'abc', name: 'x.slides-studio.json' }] });
  openCloud(a); click(menuItem(a, 'Open deck from Drive')); await wait(300);
  assert.equal(a.$('#deckTitle').value, 'From Drive');
  assert.ok(!a.$('#driveChip').hidden);
  assert.equal(JSON.parse(a.w.localStorage.getItem('slides-studio:v1')).drive.id, 'abc');
  a.close();
});

test('export PowerPoint and Google Slides to Drive', async () => {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const g = fakeGoogle(); const a = await boot({ init: g.init, PptxGenJS: undefined });
  // jsdom has no real Blob writer for pptx, so fake the library surface.
  a.w.PptxGenJS = class { constructor() { this.ShapeType = {}; } addSlide() { return { addText() {}, addShape() {}, addImage() {}, addTable() {}, addNotes() {} }; } async write() { return new a.w.Blob(['PK']); } };
  openCloud(a); click(menuItem(a, 'Export PowerPoint to Drive')); await wait(400);
  openCloud(a); click(menuItem(a, 'Export as Google Slides')); await wait(400);
  const outs = [...g.files.values()].filter((f) => f.name && !f.name.endsWith('.json') && !f.meta.mimeType.includes('folder'));
  assert.equal(outs.length, 2);
  assert.ok(outs.some((f) => f.name.endsWith('.pptx') && f.meta.mimeType.includes('presentationml')));
  assert.ok(outs.some((f) => f.meta.mimeType === 'application/vnd.google-apps.presentation'));
  assert.match(a.$('#toast').innerHTML, /href="https:\/\/drive\.google\.com/);
  assert.equal(PptxGenJS.name.length > 0, true);
  a.close();
});

test('insert an image from Drive', async () => {
  const g = fakeGoogle(); const a = await boot({ init: g.init });
  let added = null;
  g.files.set('img1', { id: 'img1', name: 'pic.png', meta: {}, data: '', blob: new a.w.Blob(['x'], { type: 'image/png' }) });
  g.picks.push({ action: 'picked', docs: [{ id: 'img1', name: 'pic.png', mimeType: 'image/png' }] });
  const before = a.$$('#stage [data-id]').length;
  // jsdom cannot decode images, so the handler is exercised up to the fetch.
  click(a.$('#insertBar [aria-label="Add image"], #insertBar [title="Add image"]'));
  click(menuItem(a, 'From Google Drive')); await wait(400);
  assert.ok(g.calls.some((c) => c.url.includes('/files/img1?alt=media')));
  a.close();
});

test('disconnect revokes the token and unlinks the deck', async () => {
  const g = fakeGoogle(); const a = await boot({ init: g.init });
  openCloud(a); click(menuItem(a, 'Save deck to Drive')); await wait(300);
  openCloud(a); click(menuItem(a, 'Disconnect Google'));
  assert.deepEqual(g.revoked, ['tok1']);
  assert.ok(a.$('#driveChip').hidden);
  assert.equal(JSON.parse(a.w.localStorage.getItem('slides-studio:v1')).drive, null);
  a.close();
});

test('with only a Client ID: sign in, then choose a deck from the in-app list', async () => {
  const g = fakeGoogle({ apiKey: '' }); const a = await boot({ init: g.init });
  a.$$('#insertBar button')[1].click();
  assert.ok(!menuItem(a, 'From Google Drive'), 'no Drive image option without an API key');
  a.d.body.click();
  openCloud(a);
  assert.ok(menuItem(a, 'Sign in with Google'));
  click(menuItem(a, 'Sign in with Google')); await wait(100);
  assert.equal(g.tokens, 1);
  const deck = { format: 'slides-studio', version: 1, deck: { title: 'Listed', theme: 'ink', slides: [{ id: 's1', elements: [] }] }, assets: {} };
  g.files.set('d1', { id: 'd1', name: 'Listed.slides-studio.json', meta: {}, data: JSON.stringify(deck) });
  a.d.querySelectorAll('dialog').forEach((x) => { if (!x.showModal) x.showModal = function () { this.setAttribute('open', ''); }; });
  a.w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  a.w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  openCloud(a); click(menuItem(a, 'Open deck from Drive')); await wait(150);
  const row = a.$$('#deckPick .mi')[0];
  assert.match(row.textContent, /Listed/);
  click(row); await wait(150);
  assert.equal(a.$('#deckTitle').value, 'Listed');
  assert.deepEqual(a.errors, []); a.close();
});
