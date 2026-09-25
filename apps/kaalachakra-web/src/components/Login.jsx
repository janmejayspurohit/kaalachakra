import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';

/** Sign-in: email and password, then the authenticator code when TOTP is on. Accounts are created by the admin. */
export default function Login() {
  const { status, login, submitTotp, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = (fn) => async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { await fn(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2>Kaalachakra — sign in</h2>
        {err && <div className="err">{err}</div>}
        {status === 'mfa' ? (
          <form onSubmit={run(() => submitTotp(code.replace(/\s/g, '')))}>
            <label className="f" htmlFor="totp">Authenticator code</label>
            <input id="totp" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
              autoComplete="one-time-code" maxLength={7} autoFocus required />
            <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 12 }}>Verify</button>
            <button className="btn ghost" type="button" onClick={logout} style={{ marginTop: 8 }}>Start again</button>
          </form>
        ) : (
          <form onSubmit={run(() => login(email.trim(), password))}>
            <label className="f" htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
            <label className="f" htmlFor="password" style={{ marginTop: 10 }}>Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 12 }}>Sign in</button>
          </form>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Accounts are created by the administrator.</p>
      </div>
    </div>
  );
}
