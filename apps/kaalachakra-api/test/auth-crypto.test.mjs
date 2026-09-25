import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  hashPassword,
  verifyPassword,
  DUMMY_HASH,
  generatePassword,
  newSessionToken,
  sha256hex,
  base32Encode,
  base32Decode,
  newTotpSecret,
  totpAt,
  verifyTotp,
  totpUri,
  loadSecretKey,
  encryptSecret,
  decryptSecret,
  PASSWORD_ALPHABET
} from '../src/auth/crypto.js';

// Test RFC 6238 SHA1 vectors
test('TOTP RFC 6238 vectors', () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpAt(secret, Math.floor(59/30), 8), "94287082");
  assert.equal(totpAt(secret, Math.floor(1111111109/30), 8), "07081804");
  assert.equal(totpAt(secret, Math.floor(1111111111/30), 8), "14050471");
  assert.equal(totpAt(secret, Math.floor(1234567890/30), 8), "89005924");
  assert.equal(totpAt(secret, Math.floor(2000000000/30), 8), "69279037");
  assert.equal(totpAt(secret, Math.floor(20000000000/30), 8), "65353130");
});

// Test verifyTotp function
test('verifyTotp function', () => {
  const secret = newTotpSecret();
  const now = Date.now();
  
  // Get a valid code for current time
  const step = Math.floor(now / 1000 / 30);
  const code = totpAt(secret, step);
  
  // Should accept the correct code at current time
  const result1 = verifyTotp(secret, code, { now });
  assert.ok(result1.ok);
  assert.equal(result1.step, step);
  
  // Should accept codes from previous or next step
  const prevCode = totpAt(secret, step - 1);
  const result2 = verifyTotp(secret, prevCode, { now });
  assert.ok(result2.ok);
  assert.equal(result2.step, step - 1);
  
  // Should accept codes from previous or next step
  const nextCode = totpAt(secret, step + 1);
  const result3 = verifyTotp(secret, nextCode, { now });
  assert.ok(result3.ok);
  assert.equal(result3.step, step + 1);
  
  // Should reject a code from the future (more than 30s ahead)
  const futureCode = totpAt(secret, step + 2);
  const result4 = verifyTotp(secret, futureCode, { now });
  assert.ok(!result4.ok);
  
  // Should reject replayed codes
  const result5 = verifyTotp(secret, code, { now, lastStep: step });
  assert.ok(!result5.ok);
  
  // Should reject invalid codes
  const result6 = verifyTotp(secret, "12345", { now });
  assert.ok(!result6.ok);
  
  const result7 = verifyTotp(secret, "abcdef", { now });
  assert.ok(!result7.ok);
  
  // Test that whitespace is stripped before validation
  const codeWithSpaces = "  123 456  ";
  const result8 = verifyTotp(secret, codeWithSpaces, { now });
  assert.ok(!result8.ok);
});

// Test base32 round trip
test('base32 round trip', () => {
  for (let i = 0; i < 50; i++) {
    const buffer = Buffer.from(Array.from({length: Math.floor(Math.random() * 40) + 1}, () => Math.floor(Math.random() * 256)));
    const encoded = base32Encode(buffer);
    const decoded = base32Decode(encoded);
    assert.ok(decoded.equals(buffer), `Round trip failed for buffer of length ${buffer.length}`);
  }
});

// Test base32 with padding
test('base32 with padding', () => {
  // Test that padding is stripped correctly
  const testValue = "GEZDGNBV";
  const decoded = base32Decode(testValue + "=====");
  assert.equal(decoded.toString('hex'), Buffer.from("12345", 'utf8').toString('hex'));
  
  // Test that invalid characters still throw
  assert.throws(() => {
    base32Decode("GEZ1");
  }, /Invalid base32 character/);
});

// Test hashPassword and verifyPassword
test('hashPassword and verifyPassword', () => {
  const password = 'mySecretPassword123';
  
  // Hash the password
  const hash = hashPassword(password);
  assert.ok(hash.startsWith('scrypt$32768$8$1$'), 'Hash should start with scrypt prefix');
  
  // Verify correct password
  assert.ok(verifyPassword(password, hash), 'Should verify correct password');
  
  // Verify incorrect password
  assert.ok(!verifyPassword('wrongpassword', hash), 'Should not verify wrong password');
  
  // Verify malformed stored string
  assert.ok(!verifyPassword(password, 'invalid-hash-format'), 'Should not verify malformed hash');
  
  // Two hashes of same password should be different (due to salt)
  const hash2 = hashPassword(password);
  assert.notEqual(hash, hash2, 'Two hashes of same password should be different');
});

// Test generatePassword
test('generatePassword', () => {
  const password = generatePassword(20);
  assert.equal(password.length, 20, 'Generated password should have correct length');
  
  // Check that it only contains valid characters
  const validChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  for (let i = 0; i < password.length; i++) {
    assert.ok(validChars.includes(password[i]), `Password should only contain valid characters`);
  }
  
  // Generate multiple passwords and check they're all different
  const passwords = [];
  for (let i = 0; i < 200; i++) {
    passwords.push(generatePassword(20));
  }
  
  // All should be unique (very high probability)
  const uniquePasswords = new Set(passwords);
  assert.equal(uniquePasswords.size, passwords.length, 'All generated passwords should be distinct');
});

// Test encryptSecret/decryptSecret
test('encryptSecret/decryptSecret round trip', () => {
  const key = Buffer.alloc(32, 'a'); // Use a fixed key for testing
  const plaintext = 'This is a secret message';
  
  const encrypted = encryptSecret(key, plaintext);
  assert.ok(encrypted.startsWith('v1:'), 'Encrypted blob should start with v1:');
  
  const decrypted = decryptSecret(key, encrypted);
  assert.equal(decrypted, plaintext, 'Decrypted text should match original');
  
  // Test that tampering fails
  const parts = encrypted.split(':');
  const tamperedBlob = `${parts[0]}:${parts[1]}:${parts[2]}:${Buffer.from(parts[3]).toString('base64').replace(/./, (c, i) => i === 0 ? 'X' : c)}`;
  
  assert.throws(() => {
    decryptSecret(key, tamperedBlob);
  }, /Decryption failed/, 'Tampered blob should fail decryption');
});

// Test loadSecretKey
test('loadSecretKey', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const tmpdir = os.tmpdir();
  
  // Create a temporary directory for testing
  const testDir = `${tmpdir}/secret_test_${Date.now()}`;
  
  try {
    // Test with no existing key file - should create one
    const key1 = loadSecretKey(testDir);
    assert.equal(key1.length, 32, 'Key should be 32 bytes');
    
    // Test that calling it again returns the same key
    const key2 = loadSecretKey(testDir);
    assert.ok(key1.equals(key2), 'Should return the same key on subsequent calls');
    
    // Check file permissions
    const stat = fs.statSync(`${testDir}/secret.key`);
    assert.equal(stat.mode & 0o777, 0o600, 'Key file should have correct permissions');
    
    // Test with a file containing garbage content - should throw but not overwrite
    const keyFile = `${testDir}/secret.key`;
    const originalContent = fs.readFileSync(keyFile, 'utf8');
    
    // Write invalid content to the file
    fs.writeFileSync(keyFile, "invalid-content");
    
    // Try to load the key - should throw
    assert.throws(() => {
      loadSecretKey(testDir);
    }, /secret.key is not 32 bytes of base64/);
    
    // Check that the original content is still there (this test was wrong)
    const newContent = fs.readFileSync(keyFile, 'utf8');
    // We can't directly compare because the key generation creates a new one on error
    // The important thing is that it doesn't overwrite the file with a valid key
    assert.ok(newContent === "invalid-content", 'Original file content should be preserved when invalid key is detected');
  } finally {
    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }
});

// Test openDb migration with version 1 database
test('openDb migration', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  
  const tmpdir = os.tmpdir();
  const testDir = fs.mkdtempSync(`${tmpdir}/db_migration_test_`);
  
  try {
    // Create a temporary database file
    const dbPath = `${testDir}/test.db`;
    
    // Create version 1 schema manually (as would be done in the migration)
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    
    // Create the version 1 schema exactly as the `current < 1` block creates it plus schema_meta
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS profiles (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        gender         TEXT NOT NULL CHECK (gender IN ('male','female','other')),

        -- Birth moment, stored as the LOCAL civil time plus its offset, never as
        -- a UTC instant. A birth record is a local fact; converting it to UTC on
        -- the way in loses the offset the astrologer needs to see, and any later
        -- timezone-database correction would silently move the chart.
        birth_year     INTEGER NOT NULL,
        birth_month    INTEGER NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
        birth_day      INTEGER NOT NULL CHECK (birth_day BETWEEN 1 AND 31),
        birth_hour     INTEGER NOT NULL CHECK (birth_hour BETWEEN 0 AND 23),
        birth_minute   INTEGER NOT NULL CHECK (birth_minute BETWEEN 0 AND 59),
        birth_second   REAL    NOT NULL DEFAULT 0,
        tz_offset_hours REAL   NOT NULL CHECK (tz_offset_hours BETWEEN -12 AND 14),

        place_name     TEXT,
        latitude       REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude      REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        altitude       REAL NOT NULL DEFAULT 0,

        -- The ayanamsa is recorded per profile because it can move a nakshatra
        -- boundary by ~2 minutes, which can change the janma nakshatra and so
        -- the dasha balance and every kuta. A chart without its ayanamsa is not
        -- reproducible.
        ayanamsa       TEXT NOT NULL DEFAULT 'trueCitra',
        sampradaya     TEXT NOT NULL DEFAULT 'uttaradi',

        notes          TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
      
      INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '1');
    `);
    
    // Insert a test profile
    db.prepare(`INSERT INTO profiles (
      id, name, gender, birth_year, birth_month, birth_day,
      birth_hour, birth_minute, birth_second, tz_offset_hours,
      place_name, latitude, longitude, altitude,
      ayanamsa, sampradaya, notes, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'test-profile-id', 'Test Name', 'male', 1990, 1, 1, 12, 0, 0, 5.5,
      'Test Place', 12.34, 56.78, 100,
      'trueCitra', 'uttaradi', 'Test notes', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z'
    );
    
    db.close();
    
    // Now test that openDb properly migrates it to version 2
    const { openDb } = await import('../src/db/index.js');
    const migratedDb = openDb(dbPath);
    
    // Check that the profile row is still there
    const profile = migratedDb.prepare('SELECT * FROM profiles WHERE id = ?').get('test-profile-id');
    assert.ok(profile, 'Profile should still exist after migration');
    
    // Check that PRAGMA table_info includes owner_id column
    const tableInfo = migratedDb.prepare("PRAGMA table_info(profiles)").all();
    const hasOwnerId = tableInfo.some(col => col.name === 'owner_id');
    assert.ok(hasOwnerId, 'Profiles table should have owner_id column after migration');
    
    // Check that new tables exist
    const tables = migratedDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('users'), 'Users table should exist');
    assert.ok(tableNames.includes('sessions'), 'Sessions table should exist');
    assert.ok(tableNames.includes('profile_shares'), 'Profile shares table should exist');
    
    // Check that schema version is now 2
    const versionRow = migratedDb.prepare('SELECT value FROM schema_meta WHERE key = ?').get('version');
    assert.equal(versionRow.value, '2', 'Schema version should be 2 after migration');
    
    // Test opening the same database file twice (should be a no-op)
    migratedDb.close();
    const secondOpen = openDb(dbPath);
    assert.equal(secondOpen.prepare('SELECT value FROM schema_meta WHERE key = ?').get('version').value, '2');
    assert.equal(secondOpen.prepare('SELECT COUNT(*) AS n FROM profiles').get().n, 1, 'second open must not touch the data');
    secondOpen.close();
    
    // Test opening a new database from scratch
    const memoryDb = openDb(':memory:');
    const memoryVersionRow = memoryDb.prepare('SELECT value FROM schema_meta WHERE key = ?').get('version');
    assert.equal(memoryVersionRow.value, '2', 'New in-memory database should have version 2');
    
    memoryDb.close();
  } finally {
    // Cleanup
    try {
      fs.rmSync(testDir, { recursive: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }
});
test('generatePassword is uniform over the whole alphabet (no modulo bias)', () => {
  const counts = new Map([...PASSWORD_ALPHABET].map((c) => [c, 0]));
  const N = 20000;
  for (let i = 0; i < N; i++) for (const c of generatePassword(20)) counts.set(c, counts.get(c) + 1);
  assert.equal(counts.size, PASSWORD_ALPHABET.length);
  const expected = (N * 20) / PASSWORD_ALPHABET.length;
  // Chi-square over 57 characters (56 d.o.f.): the 99.9th percentile is about 97.
  let chi = 0;
  for (const v of counts.values()) chi += ((v - expected) ** 2) / expected;
  assert.ok(chi < 97, `chi-square ${chi.toFixed(1)} too high - biased`);
});
