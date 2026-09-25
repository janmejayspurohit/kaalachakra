import React, { useCallback, useEffect, useState } from 'react';
import { sharesApi } from '../api.js';
import { Modal } from './Modal.jsx';

/** The owner's sharing controls for one profile. */
export default function ShareDialog({ profile, onClose }) {
  const [shares, setShares] = useState([]);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('view');
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try { setShares((await sharesApi.list(profile.id)).shares); } catch (x) { setErr(x.message); }
  }, [profile]);
  useEffect(() => { setErr(null); setShares([]); load(); }, [load]);

  const add = async (e) => {
    e.preventDefault(); setErr(null);
    try { await sharesApi.add(profile.id, email.trim(), permission); setEmail(''); await load(); }
    catch (x) { setErr(x.message); }
  };
  const remove = async (s) => {
    setErr(null);
    try { await sharesApi.remove(profile.id, s.userId); await load(); } catch (x) { setErr(x.message); }
  };

  return (
    <Modal open={Boolean(profile)} onClose={onClose} title={profile ? `Share — ${profile.name}` : 'Share'}
      footer={<button type="button" className="btn ghost" onClick={onClose}>Close</button>}>
      {err && <div className="err">{err}</div>}
      {shares.length === 0
        ? <p className="muted" style={{ marginTop: 0 }}>Not shared with anyone.</p>
        : (
          <table>
            <tbody>
              {shares.map((s) => (
                <tr key={s.userId}>
                  <td>{s.email}</td>
                  <td>{s.permission === 'edit' ? 'can edit' : 'can view'}</td>
                  <td><button className="btn ghost" type="button" onClick={() => remove(s)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <form onSubmit={add} style={{ marginTop: 12 }}>
        <label className="f" htmlFor="sh-email">Share with (their account email)</label>
        <input id="sh-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="f" htmlFor="sh-perm" style={{ marginTop: 10 }}>Permission</label>
        <select id="sh-perm" value={permission} onChange={(e) => setPermission(e.target.value)}>
          <option value="view">Can view</option>
          <option value="edit">Can edit</option>
        </select>
        <button className="btn primary" type="submit" style={{ marginTop: 12 }}>Share</button>
      </form>
    </Modal>
  );
}
