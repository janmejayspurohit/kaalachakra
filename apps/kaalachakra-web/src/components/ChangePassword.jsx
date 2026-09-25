import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';

/** Change password. `forced` = the first sign-in on a generated password. */
export default function ChangePassword({ forced = false }) {
  const { changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setOk(false);
    if (next.length < 12) return setErr('The new password must be at least 12 characters.');
    if (next !== confirm) return setErr('The two new passwords do not match.');
    if (next === current) return setErr('The new password must differ from the current one.');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm(''); setOk(true);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  const form = (
    <form onSubmit={submit}>
      {err && <div className="err">{err}</div>}
      {ok && !forced && <div className="notice is-ok" style={{ marginBottom: 10 }}>Password changed. Your other sessions were signed out.</div>}
      <label className="f" htmlFor="cp-current">{forced ? 'Generated password' : 'Current password'}</label>
      <input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      <label className="f" htmlFor="cp-new" style={{ marginTop: 10 }}>New password (at least 12 characters)</label>
      <input id="cp-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      <label className="f" htmlFor="cp-confirm" style={{ marginTop: 10 }}>New password again</label>
      <input id="cp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 12 }}>Change password</button>
    </form>
  );

  if (!forced) return form;
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2>Choose your password</h2>
        <p className="muted" style={{ marginTop: 0 }}>Your password was generated for you. Choose a new one to continue.</p>
        {form}
        <button className="btn ghost" type="button" onClick={logout} style={{ marginTop: 10 }}>Sign out</button>
      </div>
    </div>
  );
}
