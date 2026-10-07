import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, wait } from './helpers.mjs';

test('the privacy link lives in the i chip, not in the top bar', async () => {
  const a = await boot();
  assert.equal(a.$$('header.top a[href="privacy.html"]').length, 0, 'no Privacy link in the top bar');
  const chip = a.$('footer.bottom details.info');
  assert.ok(chip, 'i chip is in the bottom bar');
  assert.ok(chip.querySelector('a[href="privacy.html"]'), 'privacy link is inside the chip');
  assert.equal(chip.open, false, 'chip starts closed');
  chip.open = true;
  a.d.body.dispatchEvent(new a.w.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(chip.open, false, 'clicking elsewhere closes it');
  a.close();
});

test('Install app is always reachable, uses the browser prompt when offered, and the page links the manifest', async () => {
  const a = await boot();
  assert.ok(!a.$('#btnInstall').hidden, 'visible even before the browser offers a prompt');
  assert.ok(a.$('link[rel="manifest"]'));
  const ev = new a.w.Event('beforeinstallprompt', { cancelable: true });
  let prompted = false; ev.prompt = () => { prompted = true; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' });
  a.w.dispatchEvent(ev);
  a.$('#btnInstall').click(); await wait(20);
  assert.ok(prompted);
  assert.deepEqual(a.errors, []); a.close();
});

test('presenting: swipe left/right changes slides, tap works, and the close button exits', async () => {
  const a = await boot();
  a.w.matchMedia = a.w.matchMedia || (() => ({ matches: false }));
  const pn = () => a.$('#presenter .pn').textContent;
  const ev = (type, x, y = 100) => a.$('#presenter').dispatchEvent(new a.w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
  a.$('#viewBar [aria-label="Present"]').click(); await wait(30);
  assert.equal(a.$('#presenter').hidden, false);
  assert.equal(pn(), '1 / 5');
  ev('pointerdown', 400); ev('pointermove', 330); ev('pointermove', 250); ev('pointerup', 250); await wait(10);
  a.$('#presenter').dispatchEvent(new a.w.MouseEvent('click', { bubbles: true, clientX: 250 }));
  assert.equal(pn(), '2 / 5', 'swipe left goes forward (and the click that follows is ignored)');
  ev('pointerdown', 200); ev('pointermove', 260); ev('pointermove', 330); ev('pointerup', 330); await wait(10);
  a.$('#presenter').dispatchEvent(new a.w.MouseEvent('click', { bubbles: true, clientX: 330 }));
  assert.equal(pn(), '1 / 5', 'swipe right goes back');
  ev('pointerdown', 400); ev('pointermove', 395); ev('pointerup', 395); await wait(10);
  assert.equal(pn(), '1 / 5', 'a tiny move is not a swipe');
  ev('pointerdown', 200); ev('pointermove', 330); ev('pointerup', 330); await wait(10);
  a.$('#presenter').dispatchEvent(new a.w.MouseEvent('click', { bubbles: true, clientX: 330 }));
  assert.equal(pn(), '1 / 5', 'swiping right on the first slide does nothing');
  a.$('#presenter .px').click(); await wait(10);
  assert.equal(a.$('#presenter').hidden, true, 'close button exits');
  assert.deepEqual(a.errors, []); a.close();
});
