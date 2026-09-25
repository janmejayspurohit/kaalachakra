/**
 * Screen-space label decluttering for the offline map.
 *
 * Lives in its own plain-JS module, apart from the JSX component, for one
 * reason: it is the part that can be WRONG in a way you cannot see. A label
 * that overlaps its neighbour is obvious in a screenshot; a label that is
 * dropped when there was room, or kept when there was not, at one of the
 * hundreds of zoom and pan combinations a user will actually reach, is not.
 * As a separate module it can be exercised directly by a test over that whole
 * space, against the real city data, with no browser.
 *
 * The rule it implements: take cities biggest-first and keep a label only if
 * its box clears every box already kept. Population decides who yields, so a
 * crowd of suburbs resolves to the city that names the area; geometry decides
 * whether there is a crowd at all, which a population threshold cannot know.
 */

/** How many labels may share the frame. A cap on work, not on quality. */
export const MAX_LABELS = 90;
/** How many on-frame candidates the collision pass will look at. */
export const MAX_CANDIDATES = 600;

/** Label typography, in SCREEN pixels. */
export const LABEL_PX = 12;
export const DOT_PX = 2.6;
export const LABEL_DX = 5.5; // gap between dot and text
export const LABEL_DY = 4;   // text baseline offset from the dot

/**
 * Approximate rendered width of a label, in screen pixels.
 *
 * Measuring each string with the Canvas API would be exact, but this runs for
 * hundreds of cities on every wheel notch. 0.55em per character is a slight
 * OVER-estimate for the mixed-case Latin these names are in, and
 * over-estimating is the safe direction: it reserves a little too much room
 * and drops a borderline label rather than letting two collide.
 */
export const labelWidthPx = (name) => name.length * LABEL_PX * 0.55;

export const overlaps = (a, b) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The screen-space box a city's dot-plus-label occupies. */
export function labelBox(name, sx, sy) {
  const w = labelWidthPx(name);
  return {
    x0: sx - DOT_PX - 1,
    x1: sx + LABEL_DX + w + 2,
    y0: sy + LABEL_DY - LABEL_PX * 0.8,
    y1: sy + LABEL_DY + LABEL_PX * 0.25,
  };
}

/**
 * Choose which cities get a label.
 *
 * @param citiesByPop cities pre-sorted descending by population, each
 *   `{ n, x, y, p }` - name, longitude, latitude, population.
 * @param project maps a city to its `{ sx, sy }` in SCREEN pixels, using the
 *   exact same transform the SVG applies. Passed in rather than derived here
 *   so there is one definition of the transform, in the component.
 * @param frame `{ w, h }` of the rendered element, in screen pixels.
 * @param reserved screen-space boxes that are already occupied by something
 *   drawn over the map - the zoom control bar. They seed the collision set,
 *   so a label is never placed underneath a control and half-hidden by it.
 *   Treating furniture as just another box means there is one rule, not a
 *   general rule plus a special case per widget.
 */
export function declutter(citiesByPop, project, frame, reserved = []) {
  const kept = [];
  const boxes = [...reserved];
  let looked = 0;

  for (const c of citiesByPop) {
    if (looked >= MAX_CANDIDATES || kept.length >= MAX_LABELS) break;

    const { sx, sy } = project(c);

    // Cull on the DOT, not on the label's extent.
    //
    // Allowing a city whose dot sits off the left edge, because its long name
    // reached back into the frame, produced exactly what it sounds like: a
    // row of beheaded words down the left margin - "gli", "okak",
    // "langaluru" - with no dot to say what they belonged to. A name is only
    // worth drawing next to the mark it names.
    //
    // Off-frame cities also do not count against the work budget; charging
    // them would let a zoomed-in view spend the whole budget on places
    // nowhere near the screen and label nothing at all.
    if (sx < -DOT_PX || sx > frame.w + DOT_PX ||
        sy < -DOT_PX || sy > frame.h + DOT_PX) continue;
    looked += 1;

    const box = labelBox(c.n, sx, sy);
    if (boxes.some((b) => overlaps(b, box))) continue;

    boxes.push(box);
    kept.push(c);
  }
  return kept;
}
