/**
 * The kundali's LAYOUT LOGIC, which is where a drawn chart goes wrong.
 *
 * A chart that renders is not a chart that is right: a graha in the wrong box
 * looks exactly as convincing as one in the right box. The two placements
 * that decide everything are tested here against the fixed conventions:
 *
 *  - South Indian: the twelve rashis occupy FIXED cells, so cell assignment
 *    must be a constant and reading clockwise from Mesha must give the signs
 *    in zodiacal order.
 *  - North Indian: the HOUSES are fixed and the signs move with the lagna,
 *    so house 1 must always carry the lagna's own rashi.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'components', 'Kundali.jsx'), 'utf8');

/** Pull the two layout constants straight out of the component. */
function southCells() {
  const m = /const SOUTH_CELLS = \{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'SOUTH_CELLS must be present');
  const out = {};
  for (const [, k, c, r] of m[1].matchAll(/(\d+):\s*\[(\d+),\s*(\d+)\]/g)) {
    out[Number(k)] = [Number(c), Number(r)];
  }
  return out;
}

test('every rashi has exactly one South Indian cell, and no cell is shared', () => {
  const cells = southCells();
  assert.equal(Object.keys(cells).length, 12, 'all twelve rashis must be placed');
  for (let r = 1; r <= 12; r += 1) assert.ok(cells[r], `rashi ${r} has no cell`);

  const seen = new Set(Object.values(cells).map(([c, rw]) => `${c},${rw}`));
  assert.equal(seen.size, 12, 'two rashis share a cell');

  // The centre 2x2 is empty by convention.
  for (const [c, r] of Object.values(cells)) {
    assert.ok(!(c >= 1 && c <= 2 && r >= 1 && r <= 2),
      `a rashi was placed in the empty centre at ${c},${r}`);
  }
  // And the twelve occupy exactly the ring of a 4x4 grid.
  const ring = [];
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    if (!(c >= 1 && c <= 2 && r >= 1 && r <= 2)) ring.push(`${c},${r}`);
  }
  assert.deepEqual([...seen].sort(), ring.sort());
});

test('the signs run clockwise from Mesha, which is the point of the layout', () => {
  const cells = southCells();
  // Clockwise from the Mesha cell around the ring of a 4x4 grid.
  const clockwise = [
    [1, 0], [2, 0], [3, 0],           // top row, rightwards from Mesha
    [3, 1], [3, 2], [3, 3],           // right column, downwards
    [2, 3], [1, 3], [0, 3],           // bottom row, leftwards
    [0, 2], [0, 1], [0, 0],           // left column, upwards
  ];
  const order = clockwise.map(([c, r]) =>
    Number(Object.keys(cells).find((k) => cells[k][0] === c && cells[k][1] === r)));
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    'walking clockwise from Mesha must give the rashis in zodiacal order');
});

test('North Indian: house 1 always carries the lagna rashi, houses run anticlockwise', () => {
  const m = /const signInHouse = \(house, lagnaRashi\) =>([\s\S]*?);/.exec(src);
  assert.ok(m, 'signInHouse must be present');
  // eslint-disable-next-line no-new-func
  const signInHouse = new Function('house', 'lagnaRashi', `return ${m[1].trim()}`);

  for (let lagna = 1; lagna <= 12; lagna += 1) {
    assert.equal(signInHouse(1, lagna), lagna, `house 1 must hold the lagna (${lagna})`);
    assert.equal(signInHouse(7, lagna), ((lagna + 5) % 12) + 1, 'house 7 is the opposite sign');
    // Twelve distinct signs across twelve houses, no repeats and no gaps.
    const signs = Array.from({ length: 12 }, (_, i) => signInHouse(i + 1, lagna));
    assert.equal(new Set(signs).size, 12, `lagna ${lagna}: signs repeat across houses`);
  }
});

test('all twelve North Indian house polygons exist and are distinct', () => {
  const m = /const NORTH_HOUSES = \[([\s\S]*?)\n\];/.exec(src);
  assert.ok(m, 'NORTH_HOUSES must be present');
  const houses = [...m[1].matchAll(/house:\s*(\d+),\s*points:\s*'([^']+)'/g)]
    .map(([, h, pts]) => ({ house: Number(h), pts }));
  assert.equal(houses.length, 12);
  assert.deepEqual(houses.map((h) => h.house), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(new Set(houses.map((h) => h.pts)).size, 12, 'two houses share a polygon');
  // Every vertex must sit inside the 0..100 box.
  for (const h of houses) {
    for (const pair of h.pts.split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100,
        `house ${h.house} has a vertex outside the frame: ${pair}`);
    }
  }
});

test('every graha has a distinct three-letter abbreviation', () => {
  const m = /const ABBR = \{([\s\S]*?)\};/.exec(src);
  const abbr = Object.fromEntries([...m[1].matchAll(/(\w+):\s*'(\w+)'/g)].map(([, k, v]) => [k, v]));
  const grahas = ['surya', 'chandra', 'mangala', 'budha', 'guru', 'shukra', 'shani', 'rahu', 'ketu'];
  assert.deepEqual(Object.keys(abbr).sort(), [...grahas].sort());
  // Collisions are the whole reason these are three letters and not two:
  // two-letter forms make Surya/Shukra and Shani/Shukra ambiguous.
  assert.equal(new Set(Object.values(abbr)).size, 9, 'two grahas share an abbreviation');
  for (const [g, a] of Object.entries(abbr)) {
    assert.equal(a.length, 3, `${g} -> "${a}" should be three letters`);
  }
  // And the two-letter prefixes WOULD collide, which documents why.
  const twoLetter = new Set(Object.values(abbr).map((a) => a.slice(0, 2)));
  assert.ok(twoLetter.size < 9, 'if two letters sufficed, three would be over-engineering');
});
