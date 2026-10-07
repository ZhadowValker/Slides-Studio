// Fast static checks for index.html. No dependencies, runs in about a second.
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const errors = [];
const note = (msg) => console.log(`  ok   ${msg}`);
const fail = (msg) => { errors.push(msg); console.log(`  FAIL ${msg}`); };

console.log('Checking index.html');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');

// 1. Every inline script must at least parse.
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) fail('no inline <script> found');
scripts.forEach((code, i) => {
  try { new vm.Script(code, { filename: `index.html <script #${i + 1}>` }); note(`inline script #${i + 1} parses (${code.length} chars)`); }
  catch (e) { fail(`inline script #${i + 1} has a syntax error: ${e.message}`); }
});

// 2. The elements the app wires up at start-up must exist.
const ids = ['app', 'deckTitle', 'btnShare', 'insertBar', 'fmtBar', 'viewBar', 'viewport', 'stage', 'gridView',
  'notesBar', 'notes', 'strip', 'presenter', 'printRoot', 'shareDlg', 'btnAdd', 'btnSlide', 'bottomRight', 'driveDlg', 'driveChip', 'gClient', 'gKey', 'gSave'];
const missing = ids.filter((id) => !new RegExp(`id="${id}"`).test(html));
missing.length ? fail(`missing element ids: ${missing.join(', ')}`) : note(`all ${ids.length} required element ids are present`);

// 3. Basic page hygiene.
/<title>[^<]+<\/title>/.test(html) ? note('has a <title>') : fail('missing <title>');
/<meta name="viewport"/.test(html) ? note('has a viewport meta tag') : fail('missing viewport meta tag');
const kb = Buffer.byteLength(html) / 1024;
kb < 2048 ? note(`file size is ${kb.toFixed(0)} KB`) : fail(`index.html is ${kb.toFixed(0)} KB (over 2 MB)`);

// 3b. The privacy policy page Google requires for sign-in must ship with the site.
fs.existsSync(new URL('privacy.html', root)) && /Limited Use/.test(fs.readFileSync(new URL('privacy.html', root), 'utf8')) ? note('privacy.html is present') : fail('privacy.html is missing or incomplete');
/href="privacy\.html"/.test(html) ? note('index.html links to the privacy policy') : fail('index.html has no link to privacy.html');

// 4. Any deck.json that ships with the site must be a valid Slides Studio deck.
for (const name of ['deck.json']) {
  const file = new URL(name, root);
  if (!fs.existsSync(file)) { note(`${name} not present (optional)`); continue; }
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (d.format !== 'slides-studio' || !Array.isArray(d.deck?.slides) || !d.deck.slides.length) throw new Error('not a Slides Studio deck');
    note(`${name} is valid (${d.deck.slides.length} slides)`);
  } catch (e) { fail(`${name} is invalid: ${e.message}`); }
}

if (errors.length) { console.error(`\n${errors.length} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
