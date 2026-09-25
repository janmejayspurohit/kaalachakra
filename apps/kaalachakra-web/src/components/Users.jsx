import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api.js';
import { useAuth } from '../auth.jsx';

/** Admin only: create accounts and reset them. Generated passwords are shown once. */
export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [shown, setShown] = useState(null); // { email, password }
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try { setUsers((await adminApi.users()).users); } catch (x) { setErr(x.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setErr(null);
    try { await fn(); await load(); } catch (x) { setErr(x.message); }
  };
  const show = (email, password) => { setCopied(false); setShown({ email, password }); };

  const create = (e) => {
    e.preventDefault();
    act(async () => {
      const r = await adminApi.createUser(email.trim(), role);
      show(r.user.email, r.temporaryPassword);
      setEmail('');
    });
  };
  const resetPassword = (u) => {
    if (!window.confirm(`Reset the password of ${u.email}? They will be signed out.`)) return;
    act(async () => show(u.email, (await adminApi.resetPassword(u.id)).temporaryPassword));
  };
  const resetTotp = (u) => {
    if (!window.confirm(`Turn off two-factor authentication for ${u.email}? They will be signed out.`)) return;
    act(() => adminApi.resetTotp(u.id));
  };
  const remove = (u) => {
    if (!window.confirm(`Delete the account ${u.email}? Their profiles move to you.`)) return;
    act(() => adminApi.deleteUser(u.id));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(shown.password); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div className="card">
        <h2>Create an account</h2>
        {err && <div className="err">{err}</div>}
        {shown && (
          <div className="notice is-warn" style={{ marginBottom: 12 }}>
            Password for <strong>{shown.email}</strong>: <code className="mono">{shown.password}</code>{' '}
            <button className="btn ghost" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            <div style={{ marginTop: 6 }}>Shown only now. Give it to the person; they must change it at first sign-in.</div>
            <button className="btn ghost" type="button" onClick={() => setShown(null)} style={{ marginTop: 6 }}>Done</button>
          </div>
        )}
        <form onSubmit={create} className="grid two">
          <div>
            <label className="f" htmlFor="nu-email">Email</label>
            <input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="f" htmlFor="nu-role">Role</label>
            <select id="nu-role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div><button className="btn primary" type="submit">Create account</button></div>
        </form>
      </div>
      <div className="card">
        <h2>Accounts</h2>
        <table>
          <thead><tr><th>Email</th><th>Role</th><th>TOTP</th><th>Password</th><th>Last sign-in</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.totpEnabled ? 'on' : 'off'}</td>
                <td>{u.mustChangePassword ? 'must change' : 'set'}</td>
                <td className="mono">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn ghost" type="button" onClick={() => resetPassword(u)}>Reset password</button>
                    {u.totpEnabled && <button className="btn ghost" type="button" onClick={() => resetTotp(u)}>Reset TOTP</button>}
                    {u.id !== me.id && <button className="btn danger" type="button" onClick={() => remove(u)}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
