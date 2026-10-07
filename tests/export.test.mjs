import test from 'node:test';
import assert from 'node:assert/strict';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { boot, wait } from './helpers.mjs';

// Exports the sample deck with the same PptxGenJS version the page loads from the CDN
// and checks the PowerPoint file: slide count, notes, and the opacity values.
test('PowerPoint export keeps slides, notes and opacity', async () => {
  let file;
  class TestPptx extends PptxGenJS {
    async writeFile() { file = await this.write({ outputType: 'nodebuffer' }); }
  }
  const t = await boot({ PptxGenJS: TestPptx });

  t.press(t.$$('#stage .el-text')[0]); await wait(20);
  t.$('#fmtBar [aria-label^="Opacity,"]').click(); await wait(20);
  const r = t.$('.pop .rng'); r.value = 40;
  r.dispatchEvent(new t.w.Event('input')); r.dispatchEvent(new t.w.Event('change')); await wait(30);

  t.$('#viewBar [aria-label="Save and export"]').click(); await wait(20);
  [...t.$$('.pop .mi')].find((x) => x.textContent.includes('PowerPoint')).click();
  for (let i = 0; i < 40 && !file; i++) await wait(100);
  assert.ok(file, 'a .pptx was produced');

  const zip = await JSZip.loadAsync(file);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(slides.length, 5, 'five slides');
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml, /<a:alpha val="40000"\/>/, 'text opacity 40% is exported');
  assert.ok(Object.keys(zip.files).some((f) => f.startsWith('ppt/notesSlides/')), 'speaker notes are exported');
  assert.deepEqual(t.errors, []);
  t.close();
});
