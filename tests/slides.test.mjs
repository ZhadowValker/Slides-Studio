import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, wait } from './helpers.mjs';

test('starts with the 5-slide sample deck and no errors', async () => {
  const t = await boot();
  assert.equal(t.$$('#strip .tw').length, 5);
  assert.equal(t.$('#counter').textContent, '1 / 5');
  assert.equal(t.$$('#strip .tw.gap').length, 2, 'two gaps between three sections');
  assert.deepEqual(t.errors, []);
  t.close();
});

test('add slide, undo and redo', async () => {
  const t = await boot();
  t.$('#btnAdd').click();
  [...t.$$('.pop .mi')][1].click();
  await wait(60);
  assert.equal(t.$('#counter').textContent, '2 / 6');
  t.$('#btnUndo').click(); await wait(40);
  assert.equal(t.$$('#strip .tw').length, 5);
  t.$('#btnRedo').click(); await wait(40);
  assert.equal(t.$$('#strip .tw').length, 6);
  t.close();
});

test('select, drag, edit and delete an element', async () => {
  const t = await boot();
  const title = t.$$('#stage .el-text')[0];
  const left0 = parseInt(title.style.left, 10);
  t.press(title); await wait(20);
  assert.ok(t.$('#stage .el.sel'), 'selected');
  assert.equal(t.$$('#stage .el.sel .h').length, 8, 'eight resize handles');
  t.w.dispatchEvent(new t.w.MouseEvent('pointermove', { clientX: 40, clientY: 0 })); t.release(); await wait(30);
  assert.notEqual(parseInt(t.$('#stage .el.sel').style.left, 10), left0, 'moved');
  // double-click: two quick presses, the second released without moving
  t.press(t.$('#stage .el.sel')); t.release(); t.press(t.$('#stage .el.sel')); t.release(); await wait(30);
  assert.ok(t.$('#stage .el.editing'), 'double-click starts editing');
  const node = t.$('#stage .el.editing .txt');
  node.textContent = 'Hello';
  node.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(40);
  assert.equal(t.$('#stage .el-text .txt').textContent, 'Hello', 'edit committed');
  // (jsdom has no isContentEditable, so Escape also deselects here; select again before deleting)
  t.press(t.$$('#stage .el-text')[0]); await wait(20);
  const n = t.$$('#stage .el').length;
  t.key('Delete'); await wait(30);
  assert.equal(t.$$('#stage .el').length, n - 1, 'deleted');
  t.close();
});

test('opacity applies to every element type and leaves the handles solid', async () => {
  const t = await boot();
  const setOpacity = async (v) => {
    t.$('#fmtBar [aria-label^="Opacity,"]').click(); await wait(20);
    const r = t.$('.pop .rng'); r.value = v;
    r.dispatchEvent(new t.w.Event('input')); r.dispatchEvent(new t.w.Event('change')); await wait(30);
  };
  t.press(t.$$('#stage .el-text')[0]); await wait(20);
  await setOpacity(40);
  assert.equal(t.$('#stage .el.sel .txt').style.opacity, '0.4', 'text');
  assert.equal(t.$('#stage .el.sel').style.opacity, '', 'selection wrapper stays opaque');
  t.press(t.$$('#stage .el-shape')[0]); await wait(20);
  await setOpacity(30);
  assert.equal(t.$('#stage .el.sel .shp').style.opacity, '0.3', 'shape');
  t.$('#insertBar [aria-label="Add table"]').click(); await wait(40);
  await setOpacity(60);
  assert.equal(t.$('#stage .el.sel table').style.opacity, '0.6', 'table');
  t.$('#btnUndo').click(); await wait(30);
  assert.equal(t.$$('#stage .el-table table')[0]?.style.opacity ?? '1', '1', 'undo restores the previous opacity');
  t.close();
});

test('thumbnail chips duplicate and delete slides', async () => {
  const t = await boot();
  const chip = (i, label) => t.$$('#strip .tw')[i].querySelector(`.tact button[title="${label}"]`);
  chip(2, 'Duplicate slide').click(); await wait(40);
  assert.equal(t.$$('#strip .tw').length, 6);
  assert.equal(t.$('#counter').textContent, '4 / 6', 'the copy becomes the current slide');
  chip(0, 'Delete slide').click(); await wait(40);
  assert.equal(t.$$('#strip .tw').length, 5);
  assert.equal(t.$('#counter').textContent, '3 / 5', 'deleting an earlier slide keeps you on the same slide');
  t.close();
});

test('section view: remove, add, rename and drag to reorder', async () => {
  const t = await boot();
  t.$('#btnGrid').click(); await wait(40);
  assert.deepEqual(t.sectionNames(), ['Intro', 'Build', 'Ship']);
  assert.equal(t.$$('#gridView .addsec').length, 1, 'a single "+" at the end');

  // drag "Ship" above "Intro" using real DragEvent-like events
  const dt = () => ({ types: [], data: {}, setData(k, v) { this.data[k] = v; this.types.push(k); }, getData(k) { return this.data[k] || ''; }, setDragImage() {} });
  const fire = (el, type, data, y) => { const e = new t.w.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }); Object.defineProperty(e, 'dataTransfer', { value: data }); el.dispatchEvent(e); };
  const data = dt();
  fire(t.$$('#gridView .sec')[2], 'dragstart', data, 0);
  fire(t.$$('#gridView .block')[0], 'dragover', data, -1);
  fire(t.$$('#gridView .block')[0], 'drop', data, -1); await wait(40);
  assert.deepEqual(t.sectionNames(), ['Ship', 'Intro', 'Build']);
  assert.equal(t.$$('#gridView .tw').length, 5, 'no slides lost');

  // remove a section: its slides stay and join the neighbour
  t.$$('#gridView .sec')[1].querySelector('[data-tip^="Remove"]').click(); await wait(40);
  assert.equal(t.sectionNames().length, 2);
  assert.equal(t.$$('#gridView .tw').length, 5);

  // add a section at the end and rename it
  t.$('#gridView .addsec button').click(); await wait(60);
  const label = t.$('#gridView .sec span[contenteditable]');
  assert.ok(label, 'new section is in rename mode');
  label.textContent = 'Appendix';
  label.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(50);
  assert.equal(t.sectionNames().at(-1), 'Appendix');
  t.close();
});

test('autosaves the deck in localStorage', async () => {
  const t = await boot();
  t.$('#btnAdd').click(); [...t.$$('.pop .mi')][3].click();
  await wait(700);
  const saved = JSON.parse(t.w.localStorage.getItem('slides-studio:v1'));
  assert.equal(saved.format, 'slides-studio');
  assert.equal(saved.deck.slides.length, 6);
  t.close();
});
