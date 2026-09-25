import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { SettingsProvider } from './settings.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import Login from './components/Login.jsx';
import ChangePassword from './components/ChangePassword.jsx';
import './styles.css';

/** Nothing of the app mounts until the user is signed in and has chosen a password. */
function Root() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="auth-page"><div className="empty">Loading…</div></div>;
  if (status === 'signed-out' || status === 'mfa') return <Login />;
  if (status === 'must-change') return <ChangePassword forced />;
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SettingsProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SettingsProvider>
  </React.StrictMode>
);
