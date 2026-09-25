import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import mapdata from '../mapdata.json';
import { declutter, DOT_PX, LABEL_DX, LABEL_DY, LABEL_PX } from './declutter.js';

/**
 * Offline map with a draggable pin, zoom, pan and progressive city labels.
 *
 * No tiles, no network, no API key. Outlines are Natural Earth (public domain)
 * and the city list comes from the same GeoNames gazetteer the API ships,
 * simplified at build time by scripts/build-map.mjs.
 *
 * PROJECTION: equirectangular (longitude -> x, latitude -> y) rather than Web
 * Mercator. Over India's ~33 degrees of latitude the shape distortion is
 * slight, and the linear mapping converts a pixel back to a coordinate with no
 * inverse-projection maths.
 *
 * SCREEN <-> COORDINATE conversion goes through the SVG's own getScreenCTM(),
 * never getBoundingClientRect arithmetic. The rect approach assumes the
 * viewBox exactly fills the element; `max-width` and the zoom transform both
 * break that, and the pin then lands offset from the cursor - which it did,
 * toward the north-east. The CTM accounts for viewBox, letterboxing and every
 * transform exactly, so the pin is under the cursor by construction.
 */
const [MIN_X, MIN_Y, MAX_X, MAX_Y] = mapdata.bbox;
const SPAN_X = MAX_X - MIN_X;
const SPAN_Y = MAX_Y - MIN_Y;

const VIEW_W = 1000;
const VIEW_H = Math.round((SPAN_Y / SPAN_X) * VIEW_W);

const toX = (lon) => ((lon - MIN_X) / SPAN_X) * VIEW_W;
const toY = (lat) => ((MAX_Y - lat) / SPAN_Y) * VIEW_H;
const toLon = (x) => MIN_X + (x / VIEW_W) * SPAN_X;
const toLat = (y) => MAX_Y - (y / VIEW_H) * SPAN_Y;

const pathOf = (rings) =>
  rings.map((r) => 'M' + r.map(([x, y]) => `${toX(x).toFixed(1)},${toY(y).toFixed(1)}`).join('L') + 'Z').join(' ');

const MIN_ZOOM = 1;
/**
 * 30x. At that scale the frame spans roughly 1.2 degrees of longitude, about
 * 130 km across India - close enough to pick out a specific town rather than
 * a district. The ceiling is a UI limit, not a data one: the outlines are
 * simplified vectors and will look increasingly angular past this, while the
 * pin's own precision is unaffected by zoom, since a click is converted
 * through the SVG's CTM and not from pixel arithmetic.
 */
const MAX_ZOOM = 30;

/**
 * Cities pre-sorted by population, once.
 *
 * The declutter pass takes them in this order, so the sort has to be stable
 * across renders and must not be redone on every wheel event. `p` is
 * population; `x`/`y` are longitude/latitude.
 */
const CITIES_BY_POP = [...(mapdata.cities ?? [])].sort((a, b) => b.p - a.p);

export default function MapPin({ latitude, longitude, onChange, height = 380 }) {
  const svgRef = useRef(null);
  /**
   * Zoom and pan live in ONE state object, updated functionally.
   *
   * They were separate `useState`s updated from the render closure. Several
   * wheel events delivered in the same frame - which a trackpad flick does
   * routinely - all read the same stale zoom and collapsed into a single
   * step: three notches produced 1.18x instead of 1.18^3. Deriving each
   * update from the previous state makes every event compose, and keeps pan
   * consistent with the zoom it was computed against.
   */
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const { zoom, pan } = view;

  /**
   * City markers on or off.
   *
   * Off hides the dots as well as the names. A dot with no name says only
   * "a place is here", which is not information you can act on, and a field
   * of anonymous dots is the clutter the switch exists to remove. So the
   * switch clears the layer outright, leaving the coastline, the state
   * borders and the pin - which is the view you want when you are aiming the
   * pin at a spot rather than reading the map.
   */
  const [showLabels, setShowLabels] = useState(true);

  /**
   * Rendered pixels per viewBox unit.
   *
   * Counter-scaling by 1/zoom alone was not enough: the viewBox is 1000 units
   * wide but renders at roughly 320px, so an "11 unit" label actually drew at
   * ~3.5 screen pixels and was illegible. Text, dots and strokes have to be
   * divided by the FULL transform - the viewBox-to-screen scale as well as the
   * zoom - to hold a constant size on screen.
   */
  const [pxPerUnit, setPxPerUnit] = useState(0.32);

  /**
   * The zoom bar's footprint, in the map's own screen pixels.
   *
   * It floats over the map, so whatever it covers is unreadable - the first
   * build of it sat squarely on "Tirunelveli". Rather than nudge the bar or
   * blacklist a corner, its measured rectangle is handed to the declutter
   * pass as one more occupied box. MEASURED, not assumed: the bar's width
   * changes with the zoom readout ("1.0x" versus "24.0x") and with font
   * settings, so a hardcoded rectangle would drift out of step with it.
   */
  const toolsRef = useRef(null);
  const [toolsBox, setToolsBox] = useState(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const measure = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0) setPxPerUnit(r.width / VIEW_W);

      const t = toolsRef.current?.getBoundingClientRect();
      setToolsBox(t && t.width > 0 ? {
        x0: t.left - r.left - 4, x1: t.right - r.left + 4,
        y0: t.top - r.top - 4, y1: t.bottom - r.top + 4,
      } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    if (toolsRef.current) ro.observe(toolsRef.current);
    return () => ro.disconnect();
  }, []);
  const drag = useRef(null);

  const statePaths = useMemo(
    () => mapdata.states.map((s) => ({ d: pathOf(s.rings), claimed: Boolean(s.claimed) })),
    []
  );
  const contextPaths = useMemo(() => mapdata.context.map((c) => pathOf(c.rings)), []);

  /**
   * Which cities get a label - decided by COLLISION, not by population alone.
   *
   * The old rule was a population floor per zoom level. That is density-blind:
   * around Hyderabad a dozen suburbs all clear the same floor and their labels
   * pile on top of each other, which is exactly what they did. Population
   * cannot express "there is no room here", because room depends on zoom, on
   * the length of the neighbouring name and on how close the two places are.
   *
   * So the test is geometric and runs in SCREEN space:
   *   1. project each city through the same transform the <g> applies;
   *   2. discard anything off-frame (most of the 2,000, at any real zoom);
   *   3. walk the survivors in descending population, and keep a label only
   *      if its box clears every box already kept.
   *
   * Taking them biggest-first is what makes a crowd resolve to the city that
   * matters: Hyderabad is placed before Meerpet, so Meerpet is the one that
   * yields. A city that loses its label is dropped entirely rather than left
   * as a bare dot - an unlabelled dot in a cluster tells you nothing and is
   * just more ink under the name you are trying to read.
   *
   * Zooming in frees space, so the suburbs reappear one by one on their own;
   * there is no longer a hardcoded threshold deciding when.
   */
  const visibleCities = useMemo(() => {
    // With the layer switched off there is nothing to place, so the collision
    // pass does not run at all - it would otherwise re-run on every wheel
    // notch to produce a list nobody draws.
    if (!showLabels || !(zoom * pxPerUnit > 0)) return [];
    // World -> viewBox -> screen, mirroring the <g> transform exactly. This is
    // the single definition of that projection; `declutter` is handed it.
    const project = (c) => ({
      sx: ((toX(c.x) - VIEW_W / 2 + pan.x) * zoom + VIEW_W / 2) * pxPerUnit,
      sy: ((toY(c.y) - VIEW_H / 2 + pan.y) * zoom + VIEW_H / 2) * pxPerUnit,
    });
    return declutter(
      CITIES_BY_POP, project,
      { w: VIEW_W * pxPerUnit, h: VIEW_H * pxPerUnit },
      toolsBox ? [toolsBox] : []
    );
  }, [showLabels, zoom, pan.x, pan.y, pxPerUnit, toolsBox]);

  const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);

  /**
   * Follow the pin when it is moved from OUTSIDE the map.
   *
   * Choosing Chennai from the dropdown while zoomed into Karnataka used to
   * leave the view exactly where it was, looking at a pin that had silently
   * left the frame - the control appeared not to have worked. So an external
   * coordinate change re-centres the view on the new point, keeping the
   * current zoom: you stay at the scale you had chosen, over the place you
   * just picked.
   *
   * "External" is the whole subtlety. A click on the map is also a coordinate
   * change, and re-centring on THAT would jerk the map out from under the
   * cursor on every click. So the coordinates this component emits are
   * remembered, and an incoming pair that matches them is recognised as our
   * own and ignored.
   *
   * At zoom 1 the entire country is already in frame, so there is nothing to
   * navigate to and panning would only push the map off-centre. Left alone.
   */
  const lastEmitted = useRef(null);
  useEffect(() => {
    if (!hasPin) return;
    const mine = lastEmitted.current;
    if (mine && Math.abs(mine.latitude - latitude) < 1e-9 && Math.abs(mine.longitude - longitude) < 1e-9) return;
    setView((v) => {
      if (v.zoom <= 1) return v;
      return { zoom: v.zoom, pan: { x: VIEW_W / 2 - toX(longitude), y: VIEW_H / 2 - toY(latitude) } };
    });
  }, [latitude, longitude, hasPin]);

  /** Client point -> viewBox point, exact under any transform. */
  const toViewBox = (evt) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    return new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse());
  };

  /** viewBox point -> world point, undoing a given zoom/pan transform. */
  const worldAt = (p, z, pn) => ({
    x: (p.x - VIEW_W / 2) / z + VIEW_W / 2 - pn.x,
    y: (p.y - VIEW_H / 2) / z + VIEW_H / 2 - pn.y,
  });
  const toWorld = (p) => worldAt(p, zoom, pan);

  const placePin = (evt) => {
    const vb = toViewBox(evt);
    if (!vb) return;
    const w = toWorld(vb);
    const next = {
      latitude: Math.round(Math.min(MAX_Y, Math.max(MIN_Y, toLat(w.y))) * 1e4) / 1e4,
      longitude: Math.round(Math.min(MAX_X, Math.max(MIN_X, toLon(w.x))) * 1e4) / 1e4,
    };
    lastEmitted.current = next;
    onChange(next);
  };

  /** Zoom by `factor` about a viewBox point, anchoring that point. */
  const zoomBy = (vb, factor) => {
    setView((v) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      // Keep the point under the cursor fixed, or the map slides away from
      // whatever you were aiming at.
      const before = worldAt(vb, v.zoom, v.pan);
      return {
        zoom: next,
        pan: {
          x: (vb.x - VIEW_W / 2) / next + VIEW_W / 2 - before.x,
          y: (vb.y - VIEW_H / 2) / next + VIEW_H / 2 - before.y,
        },
      };
    });
  };

  /** Zoom about the centre of the frame, for the +/- buttons. */
  const zoomCentre = (factor) =>
    zoomBy({ x: VIEW_W / 2, y: VIEW_H / 2 }, factor);

  /**
   * Wheel zoom, via a NATIVE non-passive listener.
   *
   * React registers `onWheel` as a PASSIVE listener, so calling
   * preventDefault() from a React handler is ignored and the browser scrolls
   * the page underneath while you are zooming the map. The only way to stop
   * that is to attach the listener ourselves with `{ passive: false }`.
   *
   * The handler is held in a ref so the effect can register once instead of
   * re-attaching on every zoom/pan state change.
   */
  const wheelHandler = useRef(null);
  wheelHandler.current = (e) => {
    e.preventDefault();
    const vb = toViewBox(e);
    if (!vb) return;
    zoomBy(vb, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  };

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheelNative = (e) => wheelHandler.current?.(e);
    svg.addEventListener('wheel', onWheelNative, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNative);
  }, []);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startVb: toViewBox(e), startPan: { ...pan }, moved: false };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d?.startVb) return;
    const vb = toViewBox(e);
    if (!vb) return;
    const dx = (vb.x - d.startVb.x) / zoom;
    const dy = (vb.y - d.startVb.y) / zoom;
    // A few pixels of slop, so a click with a shaky hand still drops the pin.
    if (Math.hypot(dx * zoom, dy * zoom) > 4) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, pan: { x: d.startPan.x + dx, y: d.startPan.y + dy } }));
  };

  const onPointerUp = (e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) placePin(e); // drag pans, click places
  };

  /**
   * viewBox units per SCREEN pixel. Multiply any desired pixel size by this to
   * get the viewBox value that renders at that many pixels, at any zoom and
   * any element size.
   */
  const u = 1 / (zoom * Math.max(pxPerUnit, 1e-6));

  return (
    <div className="mapwrap">
      <div className="map-frame">
        <div className="map-tools" ref={toolsRef}>
          <button type="button" className="btn ghost"
            onClick={() => zoomCentre(1.5)} title="Zoom in">+</button>
          <button type="button" className="btn ghost"
            onClick={() => zoomCentre(1 / 1.5)} title="Zoom out">−</button>
          <button type="button" className="btn ghost"
            onClick={() => setView({ zoom: 1, pan: { x: 0, y: 0 } })} title="Reset view">Reset</button>
          <button
            type="button"
            role="switch"
            aria-checked={showLabels}
            className={`map-switch${showLabels ? ' is-on' : ''}`}
            onClick={() => setShowLabels((v) => !v)}
            title={showLabels ? 'Hide city names' : 'Show city names'}
          >
            <span className="map-switch-track" aria-hidden="true">
              <span className="map-switch-knob" />
            </span>
            <span className="map-switch-text">Cities</span>
          </button>
          <span className="muted mono" style={{ fontSize: 11 }}>{zoom.toFixed(1)}×</span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mappin"
          style={{ height, width: `${Math.round(height * (VIEW_W / VIEW_H))}px`, maxWidth: '100%', touchAction: 'none' }}
          role="application"
          aria-label="Map of India. Click to place the birth location pin, drag to pan, scroll to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; }}
        >
          <g transform={`translate(${VIEW_W / 2} ${VIEW_H / 2}) scale(${zoom}) translate(${-VIEW_W / 2 + pan.x} ${-VIEW_H / 2 + pan.y})`}>
            {contextPaths.map((d, i) => (
              <path key={`c${i}`} d={d} className="map-context" />
            ))}
            {statePaths.map((s, i) => (
              <path key={`s${i}`} d={s.d}
                className={`map-state${s.claimed ? ' is-claimed' : ''}`}
                style={{ strokeWidth: 1.1 * u }} />
            ))}

            {showLabels && visibleCities.map((c) => (
              <g key={`${c.n}-${c.x}-${c.y}`} transform={`translate(${toX(c.x)} ${toY(c.y)})`}>
                <circle r={DOT_PX * u} className="map-city-dot" />
                <text x={LABEL_DX * u} y={LABEL_DY * u} className="map-city-label"
                  style={{ fontSize: `${LABEL_PX * u}px`, strokeWidth: 3 * u }}>{c.n}</text>
              </g>
            ))}

            {hasPin && (
              <g transform={`translate(${toX(longitude)}, ${toY(latitude)})`} className="map-pin">
                <line x1={-11 * u} y1={0} x2={11 * u} y2={0} className="map-cross" style={{ strokeWidth: 1.5 * u }} />
                <line x1={0} y1={-11 * u} x2={0} y2={11 * u} className="map-cross" style={{ strokeWidth: 1.5 * u }} />
                <circle r={5 * u} className="map-pin-dot" style={{ strokeWidth: 2 * u }} />
              </g>
            )}
          </g>
        </svg>
      </div>

      {/*
        * Instructions only. The data credits that used to sit here are in the
        * footer and on the licences page: GeoNames is CC BY 4.0, so the line
        * could be moved but not simply deleted.
        */}
      <div className="muted" style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>
        Click to place the pin · drag to pan · scroll to zoom. More city names
        appear as you zoom.
      </div>
    </div>
  );
}
