import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from './api.js';

const AuthContext = createContext(null);

/**
 * Who is signed in. `status` is one of:
 *   'loading'     - asking the API
 *   'signed-out'  - show the sign-in form
 *   'mfa'         - password accepted, waiting for the authenticator code
 *   'must-change' - signed in on a generated password; must choose one first
 *   'signed-in'
 * The session itself is an HttpOnly cookie the page never sees.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);

  const adopt = useCallback((u) => {
    setUser(u);
    setStatus(u.mustChangePassword ? 'must-change' : 'signed-in');
  }, []);

  const refresh = useCallback(async () => {
    try { adopt((await authApi.me()).user); }
    catch { setUser(null); setStatus('signed-out'); }
  }, [adopt]);

  useEffect(() => { refresh(); }, [refresh]);

  // Any API call that finds the session gone sends the user back here.
  useEffect(() => {
    const onUnauthorized = () => { setUser(null); setStatus('signed-out'); };
    window.addEventListener('kc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('kc:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await authApi.login(email, password);
    if (r.mfaRequired) { setStatus('mfa'); return; }
    adopt(r.user);
  }, [adopt]);

  const submitTotp = useCallback(async (code) => { adopt((await authApi.totp(code)).user); }, [adopt]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } finally { setUser(null); setStatus('signed-out'); }
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await authApi.changePassword(currentPassword, newPassword);
    await refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ status, user, login, submitTotp, logout, changePassword, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
