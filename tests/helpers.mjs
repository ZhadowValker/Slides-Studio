import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Load index.html without network resources (fonts, CDN scripts).
const SOURCE = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/<script src="[^"]+"[^>]*><\/script>/g, '')
  .replace(/<link[^>]+googleapis[^>]*>/g, '');

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function boot({ PptxGenJS } = {}) {
  const errors = [];
  const dom = new JSDOM(SOURCE, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.github.io/Slides-Studio/',
    beforeParse(w) {
      w.ResizeObserver = class { observe() {} disconnect() {} };
      w.addEventListener('error', (e) => errors.push(e.message));
      if (PptxGenJS) w.PptxGenJS = PptxGenJS;
    },
  });
  await wait(250);
  const w = dom.window, d = w.document;
  const $ = (s) => d.querySelector(s);
  const $$ = (s) => [...d.querySelectorAll(s)];
  const press = (el) => el.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  const release = () => w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
  const key = (k, extra = {}) => w.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  const sectionNames = () => $$('#gridView .sec > span:first-child').map((x) => x.textContent);
  return { w, d, $, $$, errors, press, release, key, sectionNames, close: () => w.close() };
}
