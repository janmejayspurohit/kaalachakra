# Accounts, sessions, TOTP and profile sharing

Kaalachakra is hosted at astro.janmejay.info. Every route except the auth
routes and `/health` requires a signed-in user. Profiles are private to their
owner unless the owner shares them.

This document is the specification the implementation follows. Where the code
and this document disagree, one of them is a bug.

## Rules (from the owner)

1. The first account is `admin@janmejay.info`, role `admin`, created on first
   start with a GENERATED password.
2. Every account starts with a generated password and must change it on first
   login. Until it does, the only routes it may use are `GET /auth/me`,
   `POST /auth/password` and `POST /auth/logout`.
3. Only an admin can create accounts. There is no self sign-up.
4. TOTP (authenticator app) is available to every account, as a second factor
   in addition to the password.
5. Profiles are private. The owner may share a profile with another account,
   as `view` or `edit`.

## Storage (SQLite, schema version 2)

Migration from version 1 must keep every existing profile. Existing profiles
(owner_id NULL) are assigned to the seeded admin.

```sql
CREATE TABLE users (
  id                   TEXT PRIMARY KEY,           -- randomUUID()
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,              -- see "Passwords"
  role                 TEXT NOT NULL CHECK (role IN ('admin','user')),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  totp_secret          TEXT,                       -- encrypted, see "Secrets at rest"
  totp_pending_secret  TEXT,                       -- encrypted; set by /auth/totp/setup
  totp_enabled         INTEGER NOT NULL DEFAULT 0,
  totp_last_step       INTEGER,                    -- last accepted 30 s step (replay guard)
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,                       -- ISO time
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  last_login_at        TEXT
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,                   -- sha256(token) hex; the token itself is never stored
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage        TEXT NOT NULL CHECK (stage IN ('mfa','full')),
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

ALTER TABLE profiles ADD COLUMN owner_id TEXT REFERENCES users(id);

CREATE TABLE profile_shares (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('view','edit')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, user_id)
);
```

## Cryptography - node:crypto only, no third-party crypto packages

- **Passwords**: `scrypt`, N=32768, r=8, p=1, maxmem=64 MiB, 16-byte random
  salt, 64-byte key. Stored as `scrypt$32768$8$1$<salt b64>$<hash b64>`.
  Verified with `timingSafeEqual`. Minimum new-password length 12, maximum
  256; the new password must differ from the current one.
- **Generated passwords**: 20 characters drawn uniformly (rejection sampling
  on `randomBytes`) from `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789`.
- **Session tokens**: 32 bytes from `randomBytes`, base64url. Only
  `sha256(token)` is stored.
- **TOTP**: RFC 6238 - HMAC-SHA1, 6 digits, 30-second step, secret of 20
  random bytes in RFC 4648 base32 (no padding). Accept the current step and
  one step either side. Reject a step `<= totp_last_step` (replay). Compare
  codes with `timingSafeEqual`. otpauth URI:
  `otpauth://totp/Kaalachakra:<email>?secret=<b32>&issuer=Kaalachakra&algorithm=SHA1&digits=6&period=30`.
- **Secrets at rest**: TOTP secrets are encrypted with AES-256-GCM
  (12-byte random IV) as `v1:<iv b64>:<tag b64>:<ciphertext b64>`. The key is
  32 bytes: from env `KAALACHAKRA_SECRET_KEY` (base64) if set, otherwise read
  from `<data dir>/secret.key`, creating it (mode 0600) on first start.

## Sessions and cookies

- Cookie `kc_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when
  `NODE_ENV=production` or `KAALACHAKRA_COOKIE_SECURE=1`.
- Full sessions last 30 days (`Max-Age=2592000`); `mfa` sessions 5 minutes.
  Expired sessions are rejected and deleted.
- Changing a password, an admin password reset, and an admin TOTP reset delete
  every other session of that user.
- **CSRF**: for POST/PUT/PATCH/DELETE, if an `Origin` header is present its
  host must equal the request `Host` (or be listed in env
  `KAALACHAKRA_ALLOWED_ORIGINS`, comma-separated); otherwise 403. JSON bodies
  plus SameSite=Lax cover the rest.
- CORS: `@fastify/cors` with `origin: false` in production (same origin
  through nginx); `origin: true` only when `NODE_ENV !== 'production'`.
- `/docs` (Swagger UI) is registered only when `NODE_ENV !== 'production'`.

## Brute-force limits

- Per account: 5 consecutive failed password or TOTP attempts lock the account
  for 15 minutes (`locked_until`); a success resets `failed_attempts`.
- Per client IP, in memory: at most 20 `/auth/login` + `/auth/totp` attempts
  per 15 minutes; beyond that 429. Behind Cloudflare the client IP is the
  `CF-Connecting-IP` header, trusted only when `KAALACHAKRA_TRUST_CF_IP=1`
  (jserver1 has no inbound port, so every request arrives through the tunnel);
  otherwise the socket address.
- A wrong email and a wrong password return the same 401 body
  `{ "error": "invalid email or password" }`, and a password hash is computed
  even for an unknown email (constant work), so the response does not reveal
  which emails exist. A locked account returns 423
  `{ "error": "account locked, try again later" }` only AFTER a correct
  password (so a lock does not reveal the email either).

## First start (admin seed)

When the `users` table is empty on start:

- email = env `KAALACHAKRA_ADMIN_EMAIL` or `admin@janmejay.info`
- password = env `KAALACHAKRA_ADMIN_INITIAL_PASSWORD` if set, else generated;
  a generated one is written to `<data dir>/INITIAL_ADMIN_PASSWORD` (mode
  0600) and the log says where (never the password itself).
- role `admin`, `must_change_password = 1`.
- existing profiles with `owner_id IS NULL` get the admin as owner.
- When that admin changes the password, `<data dir>/INITIAL_ADMIN_PASSWORD`
  is deleted.

Recovery if the admin is locked out: `node src/cli.js reset-admin` (run inside
the container) prints a new generated password for the admin, sets
`must_change_password=1`, disables TOTP, clears the lock and deletes the
admin's sessions.

## Routes

All bodies JSON. `user` objects are
`{ id, email, role, mustChangePassword, totpEnabled, createdAt, lastLoginAt }`.
Never return password hashes or TOTP secrets except the one-time setup payload.

| Route | Who | Behaviour |
|---|---|---|
| `POST /auth/login {email,password}` | anyone | 401/423/429 as above. TOTP enabled: sets an `mfa` session cookie, returns `{ mfaRequired: true }`. Otherwise sets a `full` session cookie, returns `{ user }`. Updates `last_login_at` on full login. |
| `POST /auth/totp {code}` | `mfa` session | Verifies the code; on success replaces the `mfa` session with a new `full` one, returns `{ user }`. Wrong code counts towards the account lock. |
| `POST /auth/logout` | any session | Deletes the session, clears the cookie, 204. |
| `GET /auth/me` | full session | `{ user }`; 401 without a full session. |
| `POST /auth/password {currentPassword,newPassword}` | full session | Verifies current, sets new, `must_change_password=0`, deletes other sessions, 204. |
| `POST /auth/totp/setup` | full, password changed | Generates a pending secret; returns `{ secret, otpauthUrl }`. |
| `POST /auth/totp/enable {code}` | full, password changed | Verifies against the pending secret; moves it to `totp_secret`, `totp_enabled=1`, 204. |
| `POST /auth/totp/disable {password,code}` | full, password changed | Requires both; clears TOTP, 204. |
| `GET /admin/users` | admin | `{ users: [...] }` |
| `POST /admin/users {email,role?}` | admin | Creates a user (role default `user`) with a generated password; returns `{ user, temporaryPassword }` - the only time it is ever shown. 409 if the email exists. |
| `POST /admin/users/:id/reset-password` | admin | New generated password, `must_change_password=1`, clears lock, deletes sessions; returns `{ temporaryPassword }`. |
| `POST /admin/users/:id/reset-totp` | admin | Clears TOTP, deletes sessions, 204. |
| `DELETE /admin/users/:id` | admin | Not yourself (400). Transfers the user's profiles to the acting admin, then deletes the user (shares and sessions cascade), 204. |
| `GET /profiles/:id/shares` | owner | `{ shares: [{ userId, email, permission }] }` |
| `POST /profiles/:id/shares {email,permission}` | owner | Shares with an existing account (404 `{error:'no such account'}` otherwise; 400 when sharing with yourself). Upsert. 204. |
| `DELETE /profiles/:id/shares/:userId` | owner, or that user (to leave) | 204. |

## Profile access

- `GET /profiles`: profiles the user owns plus those shared with them, each
  with `access: 'owner'|'edit'|'view'` and `ownerEmail`.
- Reading (GET profile, chart, dasha, saturn, muhurta with profileId, match
  with profile ids, panchanga profile summaries): owner or any share.
  Inaccessible ids return **404** (not 403), so ids are not confirmed.
- `PUT /profiles/:id`: owner or `edit` share.
- `DELETE /profiles/:id`: owner only. A user it is shared with gets 403
  `{error:'only the owner can delete'}`; anyone else 404.
- A `view` share attempting `PUT` gets 403 `{error:'read-only share'}`.
- `POST /profiles`: the new profile's owner is the caller.
- `GET /health` returns `{ ok: true }` only - no counts.
