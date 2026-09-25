import { loadSecretKey, verifyPassword, DUMMY_HASH, newSessionToken, encryptSecret, decryptSecret, verifyTotp, hashPassword, generatePassword, newTotpSecret, totpUri, sha256hex } from './crypto.js';
import { 
  createUser, getUserById, getUserByEmail, listUsers, setPassword, recordFailure, clearFailures,
  setTotpPending, enableTotp, disableTotp, setTotpLastStep, touchLogin, deleteUser, createSession,
  getSession, deleteSession, deleteUserSessions, publicUser
} from './store.js';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';

const IP_ATTEMPT_LIMIT = 20;
const IP_ATTEMPT_WINDOW_MINUTES = 15;

function getIp(req) {
  if (process.env.KAALACHAKRA_TRUST_CF_IP === '1' && req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  return req.ip;
}

export async function registerAuth(app, { db, dataDir, adminInitialPassword }) {
  // Load secret key
  const secretKey = loadSecretKey(dataDir);
  
  // In-memory IP tracking for rate limiting (per server instance)
  const ipAttempts = new Map();
  
  function isRateLimited(ip) {
    const now = Date.now();
    const windowStart = now - (IP_ATTEMPT_WINDOW_MINUTES * 60 * 1000);
    
    if (!ipAttempts.has(ip)) {
      ipAttempts.set(ip, []);
    }
    
    const attempts = ipAttempts.get(ip);
    // Remove old attempts
    const validAttempts = attempts.filter(attempt => attempt > windowStart);
    ipAttempts.set(ip, validAttempts);
    
    // Check if rate limited
    return validAttempts.length >= IP_ATTEMPT_LIMIT;
  }

  function recordAttempt(ip) {
    const now = Date.now();
    if (!ipAttempts.has(ip)) {
      ipAttempts.set(ip, []);
    }
    ipAttempts.get(ip).push(now);
  }
  
  // Admin seeding logic
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const adminEmail = process.env.KAALACHAKRA_ADMIN_EMAIL || 'admin@janmejay.info';
  const initialPasswordFile = `${dataDir}/INITIAL_ADMIN_PASSWORD`;
  if (userCount === 0) {
    // Create the admin user
    let password = adminInitialPassword;
    
    if (!password) {
      password = process.env.KAALACHAKRA_ADMIN_INITIAL_PASSWORD;
    }
    
    if (!password) {
      // Generate a new password
      password = generatePassword(20);
      
      // Write to file
      writeFileSync(initialPasswordFile, password + '\n', { mode: 0o600 });
      app.log.warn(`Admin password written to ${initialPasswordFile}`);
    }
    
    const passwordHash = hashPassword(password);
    const adminUser = createUser(db, {
      email: adminEmail,
      passwordHash,
      role: 'admin',
      mustChangePassword: true
    });
    
    // Assign existing profiles to the admin
    db.prepare('UPDATE profiles SET owner_id = ? WHERE owner_id IS NULL').run(adminUser.id);
  }
  
  // Add onRequest hook for CSRF, session lookup and gate
  app.addHook('onRequest', async (req, reply) => {
    // CSRF: a cross-site browser request carries an Origin that does not match our host.
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      const allowed = (process.env.KAALACHAKRA_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
      let ok = false;
      try {
        const o = new URL(req.headers.origin);
        ok = o.host === req.headers.host || allowed.includes(o.origin);
      } catch { ok = false; }
      if (!ok) return reply.code(403).send({ error: 'cross-site request refused' });
    }

    // Session
    req.session = null;
    const token = readSessionToken(req);
    if (token) {
      const tokenHash = sha256hex(token);
      const s = getSession(db, tokenHash);
      if (s) {
        const user = getUserById(db, s.user_id);
        if (user) req.session = { tokenHash, stage: s.stage, user };
      }
    }

    // Gate
    const route = req.routeOptions?.url;      // route pattern, undefined for unknown URLs
    if (!route) return;                        // let Fastify answer 404
    const key = `${req.method} ${route}`;
    if (key === 'GET /health' || key === 'POST /auth/login' || key === 'POST /auth/logout' || route.startsWith('/docs')) return;
    if (key === 'POST /auth/totp') {
      if (!req.session || req.session.stage !== 'mfa') return reply.code(401).send({ error: 'not signed in' });
      return;
    }
    if (!req.session || req.session.stage !== 'full') return reply.code(401).send({ error: 'not signed in' });
    if (req.session.user.must_change_password && key !== 'GET /auth/me' && key !== 'POST /auth/password') {
      return reply.code(403).send({ error: 'password change required' });
    }
    if (route.startsWith('/admin/') && req.session.user.role !== 'admin') {
      return reply.code(403).send({ error: 'admin only' });
    }
  });
  
  const secureCookie = () => process.env.NODE_ENV === 'production' || process.env.KAALACHAKRA_COOKIE_SECURE === '1';
  function setSessionCookie(reply, token, maxAgeSeconds) {
    reply.header('set-cookie', `kc_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookie() ? '; Secure' : ''}`);
  }
  function clearSessionCookie(reply) {
    reply.header('set-cookie', `kc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie() ? '; Secure' : ''}`);
  }
  function readSessionToken(req) {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'kc_session') return rest.join('=') || null;
    }
    return null;
  }
  function startSession(db, reply, userId, stage) {
    const token = newSessionToken();
    const ttl = stage === 'mfa' ? 300 : 2592000;
    createSession(db, { tokenHash: sha256hex(token), userId, stage, ttlSeconds: ttl });
    setSessionCookie(reply, token, ttl);
  }
  
  // Register auth routes
  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 256 }
        }
      }
    }
  }, async (req, reply) => {
    const { email, password } = req.body;
    
    // Rate limit IP
    const ip = getIp(req);
    if (isRateLimited(ip)) {
      return reply.code(429).send({ error: 'too many attempts, try again later' });
    }
    
    // Get user by email
    const user = getUserByEmail(db, email);
    const passwordOk = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && Boolean(user);
    if (!passwordOk) {
      recordAttempt(ip);
      if (user) recordFailure(db, user.id);
      return reply.code(401).send({ error: 'invalid email or password' });   // ALWAYS 401 for a wrong password, never 423
    }
    
    if (user.locked_until && user.locked_until > new Date().toISOString()) {
      return reply.code(423).send({ error: 'account locked, try again later' });
    }
    clearFailures(db, user.id);
    if (user.totp_enabled) {
      startSession(db, reply, user.id, 'mfa');
      return { mfaRequired: true };
    }
    startSession(db, reply, user.id, 'full');
    touchLogin(db, user.id);
    return { user: publicUser(getUserById(db, user.id)) };
  });
  
  app.post('/auth/totp', {
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', maxLength: 10 }
        }
      }
    }
  }, async (req, reply) => {
    const { code } = req.body;
    
    // Rate limit IP
    const ip = getIp(req);
    if (isRateLimited(ip)) {
      return reply.code(429).send({ error: 'too many attempts, try again later' });
    }
    
    // Get user and verify TOTP
    const user = req.session.user;

    // A locked account cannot keep guessing codes through a live mfa session.
    if (user.locked_until && user.locked_until > new Date().toISOString()) {
      deleteSession(db, req.session.tokenHash);
      clearSessionCookie(reply);
      return reply.code(423).send({ error: 'account locked, try again later' });
    }

    if (!user.totp_secret) {
      return reply.code(401).send({ error: 'not signed in' });
    }
    
    try {
      const decryptedSecret = decryptSecret(secretKey, user.totp_secret);
      const result = verifyTotp(decryptedSecret, code, { lastStep: user.totp_last_step });
      
      if (!result.ok) {
        recordAttempt(ip);
        
        // Record failure
        const isLocked = recordFailure(db, user.id, { maxAttempts: 5, lockMinutes: 15 });
        if (isLocked) {
          deleteSession(db, req.session.tokenHash);
          clearSessionCookie(reply);
          return reply.code(423).send({ error: 'account locked, try again later' });
        }
        
        return reply.code(401).send({ error: 'invalid code' });
      }
      
      // Set the last step
      setTotpLastStep(db, user.id, result.step);
      
      // Delete the MFA session and create a new full session
      deleteSession(db, req.session.tokenHash);
      
      startSession(db, reply, user.id, 'full');
      
      touchLogin(db, user.id);
      
      return { user: publicUser(getUserById(db, user.id)) };
    } catch (err) {
      recordAttempt(ip);
      return reply.code(401).send({ error: 'invalid code' });
    }
  });
  
  app.post('/auth/logout', async (req, reply) => {
    if (req.session) {
      deleteSession(db, req.session.tokenHash);
    }
    
    clearSessionCookie(reply);
    
    return reply.code(204).send();
  });
  
  app.get('/auth/me', async (req, reply) => {
    return { user: publicUser(req.session.user) };
  });
  
  app.post('/auth/password', {
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1, maxLength: 256 },
          newPassword: { type: 'string', minLength: 12, maxLength: 256 }
        }
      }
    }
  }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body;
    
    // Verify current password
    const isValid = verifyPassword(currentPassword, req.session.user.password_hash);
    
    if (!isValid) {
      return reply.code(401).send({ error: 'current password is wrong' });
    }
    
    // Check if new password is different from old one (as per spec)
    if (currentPassword === newPassword) {
      return reply.code(400).send({ error: 'new password must be different from current password' });
    }
    
    // Hash the new password
    const passwordHash = hashPassword(newPassword);
    
    // Set new password and clear must_change_password flag
    setPassword(db, req.session.user.id, passwordHash, { mustChange: false });
    
    // Delete other sessions for this user
    deleteUserSessions(db, req.session.user.id, { exceptTokenHash: req.session.tokenHash });
    
    if (req.session.user.email.toLowerCase() === adminEmail.toLowerCase() && existsSync(initialPasswordFile)) unlinkSync(initialPasswordFile);
    
    return reply.code(204).send();
  });
  
  app.post('/auth/totp/setup', async (req, reply) => {
    const secret = newTotpSecret();
    const otpauthUrl = totpUri(req.session.user.email, secret);
    
    // Store the pending secret encrypted
    const encrypted = encryptSecret(secretKey, secret);
    setTotpPending(db, req.session.user.id, encrypted);
    
    return { secret, otpauthUrl };
  });
  
  app.post('/auth/totp/enable', {
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', maxLength: 10 }
        }
      }
    }
  }, async (req, reply) => {
    const { code } = req.body;
    
    // Get the pending secret
    const user = getUserById(db, req.session.user.id);
    
    if (!user.totp_pending_secret) {
      return reply.code(400).send({ error: 'no pending TOTP setup' });
    }
    
    try {
      const decryptedSecret = decryptSecret(secretKey, user.totp_pending_secret);
      const result = verifyTotp(decryptedSecret, code, { lastStep: null });
      
      if (!result.ok) {
        return reply.code(401).send({ error: 'invalid code' });
      }
      
      // Enable TOTP
      const encryptedSecret = encryptSecret(secretKey, decryptedSecret);
      enableTotp(db, req.session.user.id, encryptedSecret);
      
      // Set the last step so the code used to enable cannot be replayed at next login
      setTotpLastStep(db, req.session.user.id, result.step);
      
      return reply.code(204).send();
    } catch (err) {
      return reply.code(401).send({ error: 'invalid code' });
    }
  });
  
  app.post('/auth/totp/disable', {
    schema: {
      body: {
        type: 'object',
        required: ['password', 'code'],
        properties: {
          password: { type: 'string', minLength: 1, maxLength: 256 },
          code: { type: 'string', maxLength: 10 }
        }
      }
    }
  }, async (req, reply) => {
    const { password, code } = req.body;
    if (!req.session.user.totp_enabled) {
      return reply.code(400).send({ error: 'totp is not enabled' });
    }

    // Verify password
    const isValid = verifyPassword(password, req.session.user.password_hash);
    
    if (!isValid) {
      return reply.code(401).send({ error: 'invalid password' });
    }
    
    // Verify TOTP code
    try {
      const decryptedSecret = decryptSecret(secretKey, req.session.user.totp_secret);
      const result = verifyTotp(decryptedSecret, code, { lastStep: req.session.user.totp_last_step });
      
      if (!result.ok) {
        return reply.code(401).send({ error: 'invalid code' });
      }
      
      // Disable TOTP
      disableTotp(db, req.session.user.id);
      
      return reply.code(204).send();
    } catch (err) {
      return reply.code(401).send({ error: 'invalid code' });
    }
  });
  
  app.get('/admin/users', async (req, reply) => {
    const users = listUsers(db);
    return { users };
  });
  
  app.post('/admin/users', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', maxLength: 254 },
          role: { type: 'string', enum: ['admin', 'user'] }
        }
      }
    }
  }, async (req, reply) => {
    const { role = 'user' } = req.body;
    const email = req.body.email.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'invalid email' });
    }

    // Check if user already exists
    const existingUser = getUserByEmail(db, email);
    
    if (existingUser) {
      return reply.code(409).send({ error: 'email already exists' });
    }
    
    // Generate a temporary password
    const tempPassword = generatePassword(20);
    const passwordHash = hashPassword(tempPassword);
    
    // Create user
    const newUser = createUser(db, {
      email,
      passwordHash,
      role,
      mustChangePassword: true
    });
    
    return reply.code(201).send({ user: publicUser(newUser), temporaryPassword: tempPassword });
  });
  
  app.post('/admin/users/:id/reset-password', async (req, reply) => {
    const userId = req.params.id;
    
    // Get user
    const user = getUserById(db, userId);
    
    if (!user) {
      return reply.code(404).send({ error: 'user not found' });
    }
    
    // Generate a new temporary password
    const tempPassword = generatePassword(20);
    const passwordHash = hashPassword(tempPassword);
    
    // Set new password and reset must_change_password flag
    setPassword(db, userId, passwordHash, { mustChange: true });
    
    // Clear lock
    clearFailures(db, userId);
    
    // Delete all sessions for this user
    deleteUserSessions(db, userId, {});
    
    return { temporaryPassword: tempPassword };
  });
  
  app.post('/admin/users/:id/reset-totp', async (req, reply) => {
    const userId = req.params.id;
    
    // Get user
    const user = getUserById(db, userId);
    
    if (!user) {
      return reply.code(404).send({ error: 'user not found' });
    }
    
    // Disable TOTP
    disableTotp(db, userId);
    
    // Delete all sessions for this user
    deleteUserSessions(db, userId, {});
    
    return reply.code(204).send();
  });
  
  app.delete('/admin/users/:id', async (req, reply) => {
    const userId = req.params.id;
    
    // Check if trying to delete self
    if (userId === req.session.user.id) {
      return reply.code(400).send({ error: 'cannot delete yourself' });
    }
    
    // Get user
    const user = getUserById(db, userId);
    
    if (!user) {
      return reply.code(404).send({ error: 'user not found' });
    }
    
    // Transfer profiles to admin (if any)
    db.prepare('UPDATE profiles SET owner_id = ? WHERE owner_id = ?').run(req.session.user.id, userId);
    
    // Delete user
    deleteUser(db, userId);
    
    return reply.code(204).send();
  });
}