/**
 * Dasha level vocabulary.
 *
 * The trap this guards is not a missing word but a SHIFTED one. "Antara" is
 * the third level in South Indian usage, while the north's similarly-spelled
 * "antardasha" is the second. Map one onto the other by spelling and a reader
 * mis-reads the nesting by a whole level - which is worse than showing them a
 * word they do not know, because it looks right.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRADITIONS, DEFAULT_TRADITION, dashaTerm, dashaTermShort, dashaTermLower,
} from '../src/dasha-terms.js';

test('the default tradition is South Indian', () => {
  // This is a Madhwa / South-Indian Kannada panchanga; its readers expect
  // dasha, bhukti, antara.
  assert.equal(DEFAULT_TRADITION, 'south');
  assert.deepEqual(TRADITIONS.map((t) => t.id), ['south', 'north']);
  assert.equal(dashaTerm(1), 'Dasha');
  assert.equal(dashaTerm(2), 'Bhukti');
  assert.equal(dashaTerm(3), 'Antara');
});

test('each tradition names all five levels', () => {
  for (const { id } of TRADITIONS) {
    for (let level = 1; level <= 5; level += 1) {
      const full = dashaTerm(level, id);
      assert.ok(full && !/^level /.test(full), `${id} level ${level} is unnamed`);
      assert.ok(dashaTermShort(level, id), `${id} level ${level} has no short form`);
    }
  }
});

test('the two vocabularies do not collide across levels', () => {
  // "Antara" (south, level 3) must never be produced for level 2 in either
  // tradition, and no term may mean two different levels.
  const seen = new Map();
  for (const { id } of TRADITIONS) {
    for (let level = 1; level <= 5; level += 1) {
      const key = `${id}:${dashaTerm(level, id)}`;
      assert.equal(seen.has(key), false, `${key} names two levels`);
      seen.set(key, level);
    }
  }
  assert.equal(dashaTerm(2, 'south'), 'Bhukti');
  assert.equal(dashaTerm(3, 'south'), 'Antara');
  assert.equal(dashaTerm(2, 'north'), 'Antardasha');
  assert.equal(dashaTerm(3, 'north'), 'Pratyantardasha');
  assert.notEqual(dashaTerm(2, 'south'), dashaTerm(2, 'north'));
});

test('the short forms are short enough for a timeline track', () => {
  for (const { id } of TRADITIONS) {
    for (let level = 1; level <= 3; level += 1) {
      assert.ok(dashaTermShort(level, id).length <= 10,
        `${id} level ${level} short form is too long for the track label`);
    }
  }
  // The north's level 3 is the longest word in either vocabulary, which is
  // exactly why it has a distinct short form.
  assert.equal(dashaTermShort(3, 'north'), 'Pratyantar');
  assert.equal(dashaTerm(3, 'north'), 'Pratyantardasha');
});

test('unknown traditions and levels degrade rather than throw', () => {
  // A settings blob from an older build can carry anything.
  assert.equal(dashaTerm(1, 'klingon'), 'Dasha', 'falls back to the default');
  assert.equal(dashaTerm(1, undefined), 'Dasha');
  assert.match(dashaTerm(9, 'south'), /level 9/);
  assert.match(dashaTermShort(9, 'south'), /L9/);
});

test('the lower-case form is for mid-sentence use', () => {
  assert.equal(dashaTermLower(1, 'south'), 'dasha');
  assert.equal(dashaTermLower(2, 'south'), 'bhukti');
  assert.equal(dashaTermLower(1, 'north'), 'mahadasha');
  assert.equal(dashaTermLower(2, 'north'), 'antardasha');
});
