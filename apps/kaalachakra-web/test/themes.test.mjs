/**
 * Every theme must be listed, swatched and styled.
 *
 * These three lists live in three files and nothing links them, so a theme
 * can be added to one and missed in the others. Each omission fails
 * differently and none is caught by the build:
 *   - missing from styles.css  -> the theme "works" but silently renders as
 *     the default palette, which looks like a theme that does nothing;
 *   - missing from SWATCH      -> `SWATCH[id].map` throws and the entire
 *     Settings tab unmounts to a blank page.
 * The second is the one that actually happened while adding five themes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, '..', 'src', ...p), 'utf8');

const themeIds = [...read('settings.jsx')
  .matchAll(/\{\s*id:\s*'([\w-]+)',\s*label:\s*'[^']*',\s*group:\s*'(light|dark)'/g)]
  .map((m) => ({ id: m[1], group: m[2] }));

test('the theme list parses and holds both groups', () => {
  assert.ok(themeIds.length >= 10, `expected 10+ themes, parsed ${themeIds.length}`);
  assert.ok(themeIds.some((t) => t.group === 'light'));
  assert.ok(themeIds.some((t) => t.group === 'dark'));
  const ids = themeIds.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate theme id');
});

test('every theme has a CSS block defining the full token set', () => {
  const css = read('styles.css');
  // The tokens every theme must redefine. A theme that omits one inherits it
  // from :root, which is the LIGHT default - so a dark theme missing --text
  // renders dark-on-dark.
  const required = ['--bg', '--surface', '--surface-2', '--border', '--text',
    '--text-dim', '--accent', '--accent-soft', '--ok', '--warn', '--bad', '--info'];

  for (const { id } of themeIds) {
    const sel = `:root[data-theme="${id}"] {`;
    const at = css.indexOf(sel);
    assert.notEqual(at, -1, `${id} has no CSS block`);
    const block = css.slice(at, css.indexOf('}', at));
    for (const token of required) {
      assert.ok(new RegExp(`${token}:`).test(block), `${id} does not define ${token}`);
    }
  }
});

test('every theme has a swatch, so the picker cannot crash', () => {
  const settings = read('components/Settings.jsx');
  const swatchIds = [...settings.matchAll(/^\s+'?([\w-]+)'?:\s*\['#/gm)].map((m) => m[1]);
  const ids = themeIds.map((t) => t.id);
  assert.deepEqual([...ids].sort(), [...swatchIds].sort(),
    'the THEMES list and the SWATCH table have drifted apart');
  // And each swatch is exactly three colours.
  for (const m of settings.matchAll(/^\s+'?[\w-]+'?:\s*(\['#[^\]]+\])/gm)) {
    assert.equal(JSON.parse(m[1].replace(/'/g, '"')).length, 3);
  }
});

test('the swatch reads from a literal, never the live palette', () => {
  // A picker that draws its swatches with var(--accent) paints every swatch
  // in the ACTIVE theme, so all ten look identical and the control is
  // useless. The colours must be hardcoded.
  const settings = read('components/Settings.jsx');
  const swatchBlock = settings.slice(settings.indexOf('const SWATCH'), settings.indexOf('const NO_SWATCH'));
  assert.ok(!/var\(--/.test(swatchBlock), 'swatches must not use theme variables');
});
