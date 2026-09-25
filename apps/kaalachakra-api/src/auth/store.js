import { randomUUID } from 'node:crypto';
import { sha256hex } from './crypto.js';

/** Create a new user */
export function createUser(db, { email, passwordHash, role, mustChangePassword = true }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, role, must_change_password, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, email, passwordHash, role, mustChangePassword ? 1 : 0, now, now);
  
  return getUserById(db, id);
}

/** Get user by ID */
export function getUserById(db, id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return null;
  return row;
}

/** Get user by email (case-insensitive) */
export function getUserByEmail(db, email) {
  const row = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
  if (!row) return null;
  return row;
}

/** Get user password hash */
export function getUserPasswordHash(db, id) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id);
  return row ? row.password_hash : null;
}

/** List all users */
export function listUsers(db) {
  const rows = db.prepare('SELECT * FROM users ORDER BY email COLLATE NOCASE').all();
  return rows.map(publicUser);
}

/** Set user password */
export function setPassword(db, id, hash, { mustChange = false } = {}) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users 
    SET password_hash = ?, must_change_password = ?, updated_at = ?
    WHERE id = ?
  `).run(hash, mustChange ? 1 : 0, now, id);
}

/** Record a failed login attempt */
export function recordFailure(db, id, { maxAttempts = 5, lockMinutes = 15 } = {}) {
  const row = db.prepare('SELECT failed_attempts FROM users WHERE id = ?').get(id);
  if (!row) return false;
  const attempts = row.failed_attempts + 1;
  const now = new Date();
  const lockedUntil = attempts >= maxAttempts ? new Date(now.getTime() + lockMinutes * 60000).toISOString() : null;
  if (lockedUntil) {
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ?, updated_at = ? WHERE id = ?').run(lockedUntil, now.toISOString(), id);
    return true;
  }
  db.prepare('UPDATE users SET failed_attempts = ?, updated_at = ? WHERE id = ?').run(attempts, now.toISOString(), id);
  return false;
}

/** Clear failed login attempts */
export function clearFailures(db, id) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users 
    SET failed_attempts = 0, locked_until = NULL, updated_at = ?
    WHERE id = ?
  `).run(now, id);
}

/** Set TOTP pending secret */
export function setTotpPending(db, id, encrypted) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users 
    SET totp_pending_secret = ?, updated_at = ?
    WHERE id = ?
  `).run(encrypted, now, id);
}

/** Enable TOTP for user */
export function enableTotp(db, id, encrypted) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users 
    SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = 1, updated_at = ?
    WHERE id = ?
  `).run(encrypted, now, id);
}

/** Disable TOTP for user */
export function disableTotp(db, id) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users 
    SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = 0, totp_last_step = NULL, updated_at = ?
    WHERE id = ?
  `).run(now, id);
}

/** Set TOTP last step */
export function setTotpLastStep(db, id, step) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users 
    SET totp_last_step = ?, updated_at = ?
    WHERE id = ?
  `).run(step, now, id);
}

/** Touch login (update last_login_at) */
export function touchLogin(db, id) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users 
    SET last_login_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, id);
}

/** Delete user */
export function deleteUser(db, id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

/** Create a session */
export function createSession(db, { tokenHash, userId, stage, ttlSeconds }) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, stage, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenHash, userId, stage, now, expiresAt, now);
}

/** Get session */
export function getSession(db, tokenHash) {
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
  if (!row) return null;
  if (row.expires_at <= new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(new Date().toISOString(), tokenHash);
  return row;
}

/** Delete session */
export function deleteSession(db, tokenHash) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/** Delete all user's sessions (except one if specified) */
export function deleteUserSessions(db, userId, { exceptTokenHash = null } = {}) {
  if (exceptTokenHash) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, exceptTokenHash);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

/** Convert DB row to public user object */
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    totpEnabled: Boolean(row.totp_enabled),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}