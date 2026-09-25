import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
/**
 * The map carries ~166 KB of vector data (state outlines + 2,000 cities).
 * Loading it lazily keeps that off the initial bundle, so Panchanga - the
 * landing tab, which never shows a map - does not pay for it.
 */
const MapPin = lazy(() => import('./MapPin.jsx'));

/**
 * Location chooser: dropdown, free search, or explicit coordinates.
 *
 * WHY NOT ONE PLAIN DROPDOWN OF "ALL CITIES": the gazetteer holds 579,363
 * places. A <select> with half a million options is not a control, it is a
 * hang. So the dropdown is populated with the most populous settlements,
 * which covers almost every real selection, and anything else is reachable
 * through the search box beneath it.
 *
 * THE LIST LOADS IN TWO STAGES. The first 300 arrive immediately so the
 * control is usable within one round trip; the remaining 1,700 are fetched
 * afterwards, off the critical path, and swapped in. A single 2,000-row
 * request would have held the whole picker empty for the duration.
 *
 * WHATEVER IS SELECTED IS ALWAYS IN THE LIST. A pin dropped in a small town
 * resolves to a settlement that may well sit outside the top 2,000, and the
 * control used to answer that by announcing the place was "not in the list" -
 * refusing to show a selection it had itself just made. The resolved place is
 * now injected as its own option, so every pin drop lands on a named city.
 *
 * COORDINATES: typing a lat/lng runs a reverse lookup against the local
 * gazetteer and adopts the nearest significant settlement, so the dropdown
 * stays in sync and the timezone and elevation come from a real record rather
 * than being guessed. If no settlement is within range the coordinates are
 * still usable, but the timezone cannot be inferred and the user is told so -
 * guessing a zone from longitude would be an hour wrong across most borders.
 */
export default function LocationPicker({ value, onPick, label = 'Location', showMap = true }) {
  const [cities, setCities] = useState([]);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState(value?.latitude ?? '');
  const [lon, setLon] = useState(value?.longitude ?? '');
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef();

  // Keep the coordinate boxes in step when the place changes from elsewhere.
  useEffect(() => {
    setLat(value?.latitude ?? '');
    setLon(value?.longitude ?? '');
  }, [value?.latitude, value?.longitude]);

  useEffect(() => {
    let cancelled = false;

    // The API returns places by POPULATION, so asking for N gets the N most
    // significant - but a dropdown ordered by population reads as random.
    // Sort each batch alphabetically for display. `localeCompare` so accented
    // and non-ASCII names ("Alīgarh", "Bengaluru") sort where a reader looks
    // for them; a plain codepoint sort files every accented name after Z.
    const byName = (list) => [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    api.topPlaces(300)
      .then((r) => {
        if (cancelled) return;
        setCities(byName(r.results));

        // Stage two, deliberately AFTER the first paint of a usable list.
        // requestIdleCallback where it exists (not Safari), a timeout
        // otherwise - the point is only that it not compete with the first
        // render, not that it be precisely scheduled.
        const loadFull = () => {
          api.topPlaces(2000)
            .then((full) => {
              if (cancelled) return;
              setCities(byName(full.results));
              setFullLoaded(true);
            })
            .catch(() => { /* the first 300 remain perfectly usable */ });
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(loadFull, { timeout: 2000 });
        else setTimeout(loadFull, 300);
      })
      .catch(() => { /* dropdown is a convenience; search still works */ });

    return () => { cancelled = true; };
  }, []);

  // Debounced search: one request per pause, not per keystroke.
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await api.searchPlaces(q.trim(), { limit: 10 });
        setHits(r.results); setOpen(true);
      } catch { /* not worth interrupting typing over */ }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  const adopt = (p) => {
    setNote(null);
    onPick({
      placeId: p.id ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.elevation ?? p.altitude ?? 0,
      timezone: p.timezone,
      name: p.name ?? p.label,
      admin1: p.admin1 ?? null,
    });
  };

  /** Shared by the "Use coordinates" button and by dragging the map pin. */
  async function resolveAndPick(la, lo) {
    setBusy(true); setNote(null);
    try {
      const r = await api.resolvePlace(la, lo);
      if (r.resolved) {
        // Adopt the settlement, but keep the coordinates the user typed -
        // they may be a specific hospital or village, and snapping them to a
        // city centroid would silently move the chart.
        onPick({
          placeId: r.id ?? null,
          latitude: la, longitude: lo,
          altitude: r.elevation ?? 0,
          timezone: r.timezone,
          name: r.name,
          admin1: r.admin1 ?? null,
        });
        setNote(`Nearest settlement: ${r.name}${r.admin1 ? ', ' + r.admin1 : ''} (${r.distanceKm.toFixed(1)} km). Timezone ${r.timezone}, elevation ${r.elevation} m.`);
      } else {
        setNote(r.note ?? 'No settlement found near those coordinates, so the timezone cannot be determined.');
      }
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }

  /** Adopt a gazetteer record by id, fetching it if it is not already loaded. */
  async function snapToPlace(id) {
    const known = cities.find((c) => c.id === id);
    if (known) { adopt(known); return; }
    setBusy(true);
    try {
      const r = await api.searchPlaces(value?.name ?? '', { limit: 20 });
      const hit = r.results.find((x) => x.id === id);
      if (hit) adopt(hit);
      else setNote('That place could not be re-read from the gazetteer; the coordinates above are unchanged.');
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }

  function useCoordinates() {
    const la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || la < -90 || la > 90) { setNote('Latitude must be between -90 and 90.'); return; }
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) { setNote('Longitude must be between -180 and 180.'); return; }
    resolveAndPick(la, lo);
  }

  /**
   * Which dropdown row is selected.
   *
   * BY IDENTITY, NOT BY COORDINATE. This used to compare the current
   * latitude/longitude against each city's centroid within 1e-4 degrees, and
   * that is wrong for the two commonest ways of choosing a place:
   *
   *   - dropping the map pin, where the coordinate is deliberately the point
   *     the user clicked and NOT the city centroid (a pin 0.7 km from the
   *     Bengaluru centroid is 0.006 degrees away, sixty times the tolerance);
   *   - the stored default, whose hardcoded coordinate was a rounded-off
   *     Bengaluru rather than the gazetteer's own record.
   *
   * In both cases the label read "Bengaluru - not in the top list" while
   * Bengaluru sat in the list. The place's GeoNames id is now carried through
   * `onPick`, so identity survives instead of being re-derived.
   *
   * The coordinate comparison is kept as a FALLBACK only, for values stored
   * before the id existed - a profile saved from the dropdown holds the exact
   * centroid, so it still matches there.
   */
  const matchedId =
    (value?.placeId != null && cities.some((c) => c.id === value.placeId)
      ? value.placeId
      : cities.find(
        (c) => Math.abs(c.latitude - (value?.latitude ?? NaN)) < 1e-4 &&
               Math.abs(c.longitude - (value?.longitude ?? NaN)) < 1e-4
      )?.id) ?? null;

  /**
   * The rows the <select> offers.
   *
   * If the selected place resolved to a settlement that is not among the
   * loaded cities - a village, or anywhere below the population cut - it is
   * prepended as its own row, so the control can always SHOW its selection
   * instead of denying it. The user's requirement is literal: any dropped pin
   * matches a city.
   *
   * The row carries the resolved settlement's identity and the settlement's
   * own coordinates, so re-picking it from the list snaps to the city centre;
   * the pin's exact coordinates stay in the boxes above and in `value`, and
   * they are what every computation uses.
   */
  const injected =
    value?.placeId != null && matchedId == null
      ? { id: value.placeId, name: value.name ?? 'Selected place', admin1: value.admin1 ?? null }
      : null;

  const selectedId = matchedId ?? injected?.id ?? '';

  return (
    <div>
      <label className="f">{label}</label>

      {value && (
        <div className="muted" style={{ marginBottom: 8 }}>
          Selected: <strong>{value.name ?? 'custom coordinates'}</strong> ·{' '}
          <span className="mono">{Number(value.latitude).toFixed(4)}, {Number(value.longitude).toFixed(4)}</span>
          {' · '}{value.altitude ?? 0} m
          {value.timezone ? ` · ${value.timezone}` : ' · timezone unknown'}
        </div>
      )}

      <select
        value={selectedId}
        onChange={(e) => {
          const c = cities.find((x) => String(x.id) === e.target.value);
          if (c) { adopt(c); return; }
          // The injected row is not in `cities`, so re-choosing it has to go
          // back to the gazetteer for the settlement's own record. Without
          // this the option would be selectable and inert.
          if (injected && String(injected.id) === e.target.value) snapToPlace(injected.id);
        }}
      >
        <option value="">
          {selectedId
            ? 'Choose a city…'
            : value?.name
              ? `${value.name} — using the exact coordinates`
              : 'Choose a city…'}
        </option>
        {injected && (
          <option key={injected.id} value={injected.id}>
            {injected.name}{injected.admin1 ? `, ${injected.admin1}` : ''} — nearest to the pin
          </option>
        )}
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.admin1 ? `, ${c.admin1}` : ''}
          </option>
        ))}
      </select>

      <div style={{ marginTop: 8 }}>
        <input
          placeholder="…or search any town or village"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
        />
        {open && hits.length > 0 && (
          <div className="card" style={{ marginTop: 6, padding: 6, maxHeight: 220, overflow: 'auto' }}>
            {hits.map((h) => (
              <button
                key={h.id}
                className="btn ghost"
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
                onClick={() => { adopt(h); setOpen(false); setQ(''); }}
              >
                {h.label}
                <span className="muted" style={{ fontSize: 12, display: 'block' }}>
                  {h.latitude.toFixed(3)}, {h.longitude.toFixed(3)} · {h.elevation} m · {h.timezone}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/*
        * Map on the left, coordinates stacked on the right.
        *
        * The coordinate boxes and the map are two views of ONE value - type a
        * latitude and the pin moves, drop the pin and the boxes change. Side
        * by side, the reader watches that happen. Stacked, as they were, the
        * boxes scroll out of view the moment the map is tall enough to be
        * useful, and the correspondence is invisible.
        *
        * The column is fixed-width rather than fractional so the map takes
        * every pixel left over: the map is the part that benefits from space,
        * and a coordinate field wider than its own content gains nothing.
        */}
      <div className={`loc-layout${showMap ? '' : ' no-map'}`} style={{ marginTop: 10 }}>
        {showMap && (
          <div className="loc-map">
            <Suspense fallback={
              <div className="empty" style={{ minHeight: 320 }}>Loading map…</div>
            }>
              <MapPin
                latitude={Number(lat)}
                longitude={Number(lon)}
                onChange={({ latitude, longitude }) => {
                  // Reflect the drag immediately, then resolve the settlement
                  // so timezone and elevation follow the pin rather than
                  // lagging it.
                  setLat(latitude);
                  setLon(longitude);
                  resolveAndPick(latitude, longitude);
                }}
              />
            </Suspense>
          </div>
        )}

        <div className="loc-coords">
          <div>
            <label className="f">Latitude</label>
            <input type="number" step="0.0001" min={-90} max={90}
              value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div>
            <label className="f">Longitude</label>
            <input type="number" step="0.0001" min={-180} max={180}
              value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
          <button className="btn loc-use" onClick={useCoordinates} disabled={busy}>
            {busy ? 'Looking up…' : 'Use coordinates'}
          </button>
        </div>
      </div>

      {note && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{note}</div>}
    </div>
  );
}
