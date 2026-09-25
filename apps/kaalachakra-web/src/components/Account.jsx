import React, { useState } from 'react';
import QRCode from 'qrcode';
import { authApi } from '../api.js';
import { useAuth } from '../auth.jsx';
import ChangePassword from './ChangePassword.jsx';

/** The signed-in user's own account: password and two-factor authentication. */
export default function Account() {
  const { user, refresh, logout } = useAuth();
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl, qr }
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const guard = (fn) => async (e) => {
    e?.preventDefault?.();
    setErr(null); setMsg(null);
    try { await fn(); } catch (x) { setErr(x.message); }
  };

  // The QR code is drawn in the browser; the secret never goes to a third party.
  const startSetup = guard(async () => {
    const s = await authApi.totpSetup();
    setSetup({ ...s, qr: await QRCode.toDataURL(s.otpauthUrl, { margin: 1, width: 220 }) });
  });
  const enable = guard(async () => {
    await authApi.totpEnable(code.replace(/\s/g, ''));
    setSetup(null); setCode(''); setMsg('Two-factor authentication is on.');
    await refresh();
  });
  const disable = guard(async () => {
    await authApi.totpDisable(password, code.replace(/\s/g, ''));
    setPassword(''); setCode(''); setMsg('Two-factor authentication is off.');
    await refresh();
  });

  return (
    <div style={{ marginTop: 16 }}>
      <div className="card">
        <h2>Account</h2>
        <p style={{ marginTop: 0 }}><strong>{user.email}</strong> <span className="pill">{user.role}</span></p>
        <button className="btn ghost" type="button" onClick={logout}>Sign out</button>
      </div>
      <div className="card">
        <h2>Password</h2>
        <ChangePassword />
      </div>
      <div className="card">
        <h2>Two-factor authentication (TOTP)</h2>
        {err && <div className="err">{err}</div>}
        {msg && <div className="notice is-ok" style={{ marginBottom: 10 }}>{msg}</div>}
        {user.totpEnabled ? (
          <form onSubmit={disable}>
            <p className="muted" style={{ marginTop: 0 }}>On. Signing in asks for a code from your authenticator app.</p>
            <label className="f" htmlFor="td-pw">Password</label>
            <input id="td-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <label className="f" htmlFor="td-code" style={{ marginTop: 10 }}>Current code</label>
            <input id="td-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required />
            <button className="btn danger" type="submit" style={{ marginTop: 12 }}>Turn off</button>
          </form>
        ) : setup ? (
          <form onSubmit={enable}>
            <p className="muted" style={{ marginTop: 0 }}>Scan this with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the code it shows.</p>
            <img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} />
            <p className="muted" style={{ fontSize: 12 }}>Or enter this key by hand: <code className="mono">{setup.secret}</code></p>
            <label className="f" htmlFor="te-code">Code</label>
            <input id="te-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required />
            <button className="btn primary" type="submit" style={{ marginTop: 12 }}>Turn on</button>
          </form>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Off. With it on, a stolen password is not enough to sign in.</p>
            <button className="btn primary" type="button" onClick={startSetup}>Set up</button>
          </>
        )}
      </div>
    </div>
  );
}
