import React, { useState } from 'react';
import { api } from '../api.js';
import LocationPicker from './LocationPicker.jsx';
import DateField from './DateField.jsx';
import { useDateFormat, useSettings } from '../settings.jsx';
import { ConfirmDialog, Modal } from './Modal.jsx';
import Kundali from './Kundali.jsx';
import ShareDialog from './ShareDialog.jsx';

const EMPTY = {
  name: '', gender: 'male',
  birth: { year: 1990, month: 1, day: 1, hour: 6, minute: 0 },
  place: null,
  ayanamsa: 'trueCitra', sampradaya: 'uttaradi', notes: '',
};

export default function Profiles({ profiles, onChange }) {
  const { settings } = useSettings();
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  const fmt = useDateFormat();

  /**
   * The profile awaiting confirmation, or null.
   *
   * Holding the profile itself rather than a boolean means the dialog can
   * name it, and there is no second piece of state to keep in step.
   */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * The profile whose kundali is open, plus the fetched chart.
   *
   * The chart is fetched on demand rather than carried on every profile in
   * the list: it costs nine sidereal longitudes and an ascendant, and the
   * list never shows it. `chart` stays null while loading so the dialog can
   * say so instead of rendering an empty grid.
   */
  const [kundaliFor, setKundaliFor] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartErr, setChartErr] = useState(null);

  async function openKundali(p) {
    setKundaliFor(p);
    setChart(null);
    setChartErr(null);
    try {
      setChart(await api.chart(p.id, settings.ganita));
    } catch (e) {
      setChartErr(e.message);
    }
  }

  async function confirmDelete() {
    const p = pendingDelete;
    if (!p) return;
    setDeleting(true);
    setErr(null);
    try {
      await api.deleteProfile(p.id);
      setPendingDelete(null);
      onChange();
    } catch (e) {
      // Report the failure in the dialog's own context rather than closing it
      // and leaving a banner behind an unchanged list.
      setErr(e.message);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {err && <div className="err">{err}</div>}

      <Modal
        open={Boolean(kundaliFor)}
        onClose={() => setKundaliFor(null)}
        title={kundaliFor ? `Kundali — ${kundaliFor.name}` : 'Kundali'}
        footer={<button type="button" className="btn ghost" onClick={() => setKundaliFor(null)}>Close</button>}
      >
        {chartErr
          ? <div className="err">{chartErr}</div>
          : !chart
            ? <div className="empty">Computing the chart…</div>
            : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Born {fmt(`${pad(chart.birth.year, 4)}-${pad(chart.birth.month)}-${pad(chart.birth.day)}`)}
                  {' '}<span className="mono">{pad(chart.birth.hour)}:{pad(chart.birth.minute)}</span>
                  {' at '}{chart.place.name ?? 'custom coordinates'}
                  {' · '}<span className="muted">{chart.ayanamsa} ayanamsa</span>
                </p>
                <Kundali chart={chart.chart} size={340} />
                {chart.janma && (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    Janma nakshatra <strong>{chart.janma.nakshatra.name}</strong> (pada {chart.janma.nakshatra.pada}),
                    {' '}janma rashi <strong>{chart.janma.rashi.name}</strong>
                    {' · '}{chart.janma.ganita === 'surya' ? 'Surya Siddhanta' : 'drik'}
                  </p>
                )}
                {chart.reckoningNote && <div className="notice is-plain" style={{ marginTop: 8 }}>{chart.reckoningNote}</div>}
              </>
            )}
      </Modal>

      <ShareDialog profile={sharing} onClose={() => setSharing(null)} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        busy={deleting}
        title="Delete this profile?"
        confirmLabel="Delete profile"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      >
        <p style={{ marginTop: 0 }}>
          <strong>{pendingDelete?.name}</strong>
          {pendingDelete ? ` — born ${fmt(`${pad(pendingDelete.birth.year, 4)}-${pad(pendingDelete.birth.month)}-${pad(pendingDelete.birth.day)}`)} at ${pendingDelete.place.name ?? 'custom coordinates'}` : ''}
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          This removes the profile and every chart derived from it, including
          any matrimony match that used it. It cannot be undone.
        </p>
      </ConfirmDialog>

      {editing ? (
        <ProfileForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange(); }}
        />
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Profiles</h2>
            <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>Add profile</button>
          </div>

          {profiles.length === 0 ? (
            <div className="empty">
              No profiles yet. Add one to see the day summary, dashas and matching.
            </div>
          ) : (
            <table style={{ marginTop: 14 }}>
              <thead>
                <tr><th>Name</th><th>Born</th><th>Place</th><th>Janma</th><th></th></tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{cap(p.gender)} · {p.sampradaya}</div>
                      {p.access && p.access !== 'owner' && (
                        <span className="pill" title="Shared with you">shared by {p.ownerEmail} · {p.access === 'edit' ? 'can edit' : 'view only'}</span>
                      )}
                    </td>
                    <td className="mono">
                      {fmt(`${pad(p.birth.year, 4)}-${pad(p.birth.month)}-${pad(p.birth.day)}`)}
                      <div className="muted">{pad(p.birth.hour)}:{pad(p.birth.minute)}</div>
                    </td>
                    <td>
                      {p.place.name ?? '—'}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.place.latitude.toFixed(3)}, {p.place.longitude.toFixed(3)} · {p.place.altitude} m
                      </div>
                    </td>
                    <td>
                      {p.janma.nakshatra.name} {p.janma.nakshatra.pada}
                      <div className="muted" style={{ fontSize: 12 }}>{p.janma.rashi.name}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn ghost" onClick={() => openKundali(p)}>Kundali</button>
                        {p.access !== 'view' && <button className="btn ghost" onClick={() => setEditing(toForm(p))}>Edit</button>}
                        {p.access === 'owner' && <button className="btn ghost" onClick={() => setSharing(p)}>Share</button>}
                        {p.access === 'owner' && <button className="btn danger" onClick={() => setPendingDelete(p)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Capitalise a stored lowercase enum for display. Values stay lowercase. */
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function toForm(p) {
  return {
    id: p.id, name: p.name, gender: p.gender, birth: { ...p.birth },
    place: { ...p.place }, ayanamsa: p.ayanamsa, sampradaya: p.sampradaya,
    notes: p.notes ?? '',
  };
}

function ProfileForm({ initial, onCancel, onSaved }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setBirth = (k, v) => setF((s) => ({ ...s, birth: { ...s.birth, [k]: Number(v) } }));

  async function save() {
    setErr(null);
    if (!f.place) { setErr('Choose a birth place — it supplies the coordinates, altitude and timezone.'); return; }
    setBusy(true);
    try {
      const body = {
        name: f.name, gender: f.gender, birth: f.birth,
        place: {
          latitude: f.place.latitude, longitude: f.place.longitude,
          altitude: f.place.altitude ?? 0,
          timezone: f.place.timezone, name: f.place.name ?? f.place.label,
        },
        ayanamsa: f.ayanamsa, sampradaya: f.sampradaya,
        ...(f.notes ? { notes: f.notes } : {}),
      };
      if (f.id) await api.updateProfile(f.id, body, settings.ganita);
      else await api.createProfile(body, settings.ganita);
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{f.id ? 'Edit profile' : 'New profile'}</h2>
      {err && <div className="err">{err}</div>}

      <div className="row c2">
        <div>
          <label className="f">Name</label>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="f">Gender</label>
          <select value={f.gender} onChange={(e) => set('gender', e.target.value)}>
            {/* Stored values stay lowercase so the API enum and the SQLite
                CHECK constraint are untouched; only the labels are capitalised.
                Kuta matching is bride/groom based, so the picker offers the two
                genders it can actually match on. */}
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      <div className="row c3">
        <div>
          <DateField
            id="birth-date"
            label="Birth date"
            value={`${pad(f.birth.year, 4)}-${pad(f.birth.month)}-${pad(f.birth.day)}`}
            onChange={(v) => {
              const [y, m, d] = v.split('-').map(Number);
              setF((s) => ({ ...s, birth: { ...s.birth, year: y, month: m, day: d } }));
            }}
          />
        </div>
        <div>
          <label className="f">Hour (0–23)</label>
          <input type="number" min={0} max={23} value={f.birth.hour}
            onChange={(e) => setBirth('hour', e.target.value)} />
        </div>
        <div>
          <label className="f">Minute</label>
          <input type="number" min={0} max={59} value={f.birth.minute}
            onChange={(e) => setBirth('minute', e.target.value)} />
        </div>
      </div>

      <div className="row">
        <LocationPicker
          label="Birth place"
          value={f.place}
          onPick={(p) => set('place', p)}
        />
      </div>

      <div className="row c2">
        <div>
          <label className="f">Ayanamsa</label>
          <select value={f.ayanamsa} onChange={(e) => set('ayanamsa', e.target.value)}>
            <option value="trueCitra">True Chitra (default)</option>
            <option value="lahiri">Lahiri</option>
            <option value="raman">Raman</option>
            <option value="krishnamurti">Krishnamurti (KP)</option>
          </select>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Lahiri and True Chitra differ by about one arcminute, which moves a
            nakshatra boundary by roughly two minutes.
          </div>
        </div>
        <div>
          <label className="f">Sampradaya</label>
          <select value={f.sampradaya} onChange={(e) => set('sampradaya', e.target.value)}>
            <option value="uttaradi">Uttaradi Math</option>
            <option value="raghavendra">Raghavendra (Rayara) Mutt</option>
            <option value="smarta">Smarta (for comparison)</option>
          </select>
        </div>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={save} disabled={busy || !f.name}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
