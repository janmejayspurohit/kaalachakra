/**
 * Label decluttering, exercised over the space a user can actually reach.
 *
 * A screenshot proves one view. This walks a grid of zoom levels and pan
 * positions across the real 2,000-city dataset and asserts the property that
 * matters at EVERY one of them: no two labels the map decides to draw may
 * overlap on screen. That is the claim the user's complaint was about, so it
 * is the claim worth testing rather than eyeballing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { declutter, labelBox, overlaps, DOT_PX, MAX_LABELS } from '../src/components/declutter.js';

const here = dirname(fileURLToPath(import.meta.url));
const mapdata = JSON.parse(readFileSync(join(here, '..', 'src', 'mapdata.json'), 'utf8'));

const [MIN_X, MIN_Y, MAX_X, MAX_Y] = mapdata.bbox;
const SPAN_X = MAX_X - MIN_X;
const SPAN_Y = MAX_Y - MIN_Y;
const VIEW_W = 1000;
const VIEW_H = Math.round((SPAN_Y / SPAN_X) * VIEW_W);
const toX = (lon) => ((lon - MIN_X) / SPAN_X) * VIEW_W;
const toY = (lat) => ((MAX_Y - lat) / SPAN_Y) * VIEW_H;

const CITIES = [...mapdata.cities].sort((a, b) => b.p - a.p);
// 368px wide is what the picker measured in the browser at desktop width.
const PX_PER_UNIT = 0.368;
const FRAME = { w: VIEW_W * PX_PER_UNIT, h: VIEW_H * PX_PER_UNIT };

const projector = (zoom, pan) => (c) => ({
  sx: ((toX(c.x) - VIEW_W / 2 + pan.x) * zoom + VIEW_W / 2) * PX_PER_UNIT,
  sy: ((toY(c.y) - VIEW_H / 2 + pan.y) * zoom + VIEW_H / 2) * PX_PER_UNIT,
});

/** Every view a user can land on: zoom levels crossed with centres on cities. */
function* views() {
  const zooms = [1, 1.5, 2.4, 4, 6.5, 10, 16, 24, 30]; // 30 is MAX_ZOOM
  // Centre on the 40 largest cities - the crowded metro cores are exactly
  // where labels collided, so they are the cases worth covering - plus the
  // untouched default view.
  const centres = [{ x: 0, y: 0 }, ...CITIES.slice(0, 40).map((c) => ({
    x: VIEW_W / 2 - toX(c.x), y: VIEW_H / 2 - toY(c.y),
  }))];
  for (const zoom of zooms) for (const pan of centres) yield { zoom, pan };
}

test('no two drawn labels ever overlap', () => {
  let checked = 0, totalLabels = 0, worstFrame = { n: 0 };
  for (const { zoom, pan } of views()) {
    const kept = declutter(CITIES, projector(zoom, pan), FRAME);
    const project = projector(zoom, pan);
    const boxes = kept.map((c) => {
      const { sx, sy } = project(c);
      return { box: labelBox(c.n, sx, sy), name: c.n };
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        assert.ok(
          !overlaps(boxes[i].box, boxes[j].box),
          `zoom ${zoom} pan ${pan.x.toFixed(0)},${pan.y.toFixed(0)}: ` +
          `"${boxes[i].name}" overlaps "${boxes[j].name}"`
        );
      }
    }
    checked += 1;
    totalLabels += kept.length;
    if (kept.length > worstFrame.n) worstFrame = { n: kept.length, zoom };
  }
  assert.ok(checked > 300, `expected a wide sweep, checked ${checked}`);
  console.log(`  ${checked} views, ${totalLabels} labels, densest ${worstFrame.n} at zoom ${worstFrame.zoom}`);
});

test('a crowd resolves to the biggest city in it', () => {
  // Centred on Hyderabad at the zoom level from the bug report.
  const hyd = CITIES.find((c) => c.n === 'Hyderabad');
  assert.ok(hyd, 'Hyderabad should be in the map data');
  const pan = { x: VIEW_W / 2 - toX(hyd.x), y: VIEW_H / 2 - toY(hyd.y) };
  const kept = declutter(CITIES, projector(24, pan), FRAME);
  const names = kept.map((c) => c.n);
  assert.ok(names.includes('Hyderabad'), `Hyderabad must survive; got ${names.join(', ')}`);
  // Its immediate suburbs must not crowd it out.
  const biggest = Math.max(...kept.map((c) => c.p));
  assert.equal(biggest, hyd.p, 'the largest place in frame must be labelled');
  console.log(`  Hyderabad at 24x: ${kept.length} labels — ${names.slice(0, 8).join(', ')}…`);
});

test('every labelled city has its dot on the frame', () => {
  // Not a tolerance question: a label whose dot is off-screen renders as a
  // truncated word against the edge with nothing to attach it to, which is
  // what the left margin of the map used to look like.
  for (const { zoom, pan } of views()) {
    const project = projector(zoom, pan);
    for (const c of declutter(CITIES, project, FRAME)) {
      const { sx, sy } = project(c);
      assert.ok(sx >= -DOT_PX && sx <= FRAME.w + DOT_PX && sy >= -DOT_PX && sy <= FRAME.h + DOT_PX,
        `${c.n}'s dot is off-frame at zoom ${zoom} (${sx.toFixed(0)}, ${sy.toFixed(0)})`);
    }
  }
});

test('the label budget is respected', () => {
  for (const { zoom, pan } of views()) {
    assert.ok(declutter(CITIES, projector(zoom, pan), FRAME).length <= MAX_LABELS);
  }
});

test('nothing is labelled underneath the floating zoom bar', () => {
  // The bar sits bottom-centre over the map, roughly 200x30 screen pixels.
  const bar = {
    x0: FRAME.w / 2 - 100, x1: FRAME.w / 2 + 100,
    y0: FRAME.h - 44, y1: FRAME.h - 8,
  };
  let checkedFrames = 0;
  for (const { zoom, pan } of views()) {
    const project = projector(zoom, pan);
    for (const c of declutter(CITIES, project, FRAME, [bar])) {
      const { sx, sy } = project(c);
      assert.ok(
        !overlaps(bar, labelBox(c.n, sx, sy)),
        `"${c.n}" is drawn under the control bar at zoom ${zoom}`
      );
    }
    checkedFrames += 1;
  }
  assert.ok(checkedFrames > 300);
});

test('reserving the bar costs only the labels it covers', () => {
  // A sanity check on the mechanism: it must not thin the map out generally.
  const bar = {
    x0: FRAME.w / 2 - 100, x1: FRAME.w / 2 + 100,
    y0: FRAME.h - 44, y1: FRAME.h - 8,
  };
  const pan = { x: 0, y: 0 };
  const free = declutter(CITIES, projector(1, pan), FRAME).length;
  const withBar = declutter(CITIES, projector(1, pan), FRAME, [bar]).length;
  assert.ok(withBar <= free, 'reserving space cannot add labels');
  assert.ok(withBar >= free - 6, `expected a small loss, went ${free} -> ${withBar}`);
  console.log(`  default view: ${free} labels, ${withBar} with the bar reserved`);
});
