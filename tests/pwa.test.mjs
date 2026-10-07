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

test('Install app appears only once the browser offers it, and the page links the manifest', async () => {
  const a = await boot();
  assert.ok(a.$('#btnInstall').hidden);
  assert.ok(a.$('link[rel="manifest"]'));
  const ev = new a.w.Event('beforeinstallprompt', { cancelable: true });
  let prompted = false; ev.prompt = () => { prompted = true; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' });
  a.w.dispatchEvent(ev);
  assert.ok(!a.$('#btnInstall').hidden);
  a.$('#btnInstall').click(); await wait(20);
  assert.ok(prompted);
  assert.ok(a.$('#btnInstall').hidden);
  assert.deepEqual(a.errors, []); a.close();
});
