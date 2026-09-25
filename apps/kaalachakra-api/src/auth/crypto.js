import { createHash, scryptSync, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Helper to convert buffer to base64url
function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper to convert base64url to buffer
function fromBase64Url(base64url) {
  let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64');
}

// Helper to convert buffer to hex
function toHex(buffer) {
  return buffer.toString('hex');
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = stored.split('$');
    if (alg !== 'scrypt' || N !== '32768' || r !== '8' || p !== '1') {
      return false;
    }
    
    const salt = Buffer.from(saltB64, 'base64');
    const key = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const storedKey = Buffer.from(hashB64, 'base64');
    
    return timingSafeEqual(key, storedKey);
  } catch (err) {
    return false;
  }
}

// Generate a dummy hash for unknown emails to ensure constant work
export const DUMMY_HASH = hashPassword(randomBytes(32).toString('hex'));

export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Uniform over PASSWORD_ALPHABET: a random byte b is used only when
 * b < 256 - (256 % n), so every character has exactly the same number of
 * byte values mapping to it (no modulo bias).
 */
export function generatePassword(length = 20) {
  const n = PASSWORD_ALPHABET.length;
  const limit = 256 - (256 % n);
  let result = '';
  while (result.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit) result += PASSWORD_ALPHABET[b % n];
      if (result.length === length) break;
    }
  }
  return result;
}

export function newSessionToken() {
  return toBase64Url(randomBytes(32));
}

export function sha256hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Base32 encoding/decoding according to RFC 4648
export function base32Encode(buffer) {
  // Convert buffer to binary string
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += buffer[i].toString(2).padStart(8, '0');
  }
  
  // Pad to make length multiple of 5
  while (binary.length % 5 !== 0) {
    binary += '0';
  }
  
  // Convert 5-bit chunks to base32 characters
  let result = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for (let i = 0; i < binary.length; i += 5) {
    const chunk = binary.substring(i, i + 5);
    if (chunk.length === 5) {
      const index = parseInt(chunk, 2);
      result += alphabet[index];
    }
  }
  
  return result;
}

export function base32Decode(string) {
  // Remove spaces and convert to uppercase
  string = string.replace(/\s/g, '').toUpperCase();
  
  // Strip padding characters before validation
  string = string.replace(/=+$/, '');
  
  // Validate characters
  const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for (let i = 0; i < string.length; i++) {
    if (!validChars.includes(string[i])) {
      throw new Error('Invalid base32 character');
    }
  }
  
  // Convert to binary
  let binary = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  for (let i = 0; i < string.length; i++) {
    const index = alphabet.indexOf(string[i]);
    if (index !== -1) {
      binary += index.toString(2).padStart(5, '0');
    }
  }
  
  // Remove padding bits
  while (binary.length % 8 !== 0) {
    binary = binary.slice(0, -1);
  }
  
  // Convert to bytes
  const result = [];
  for (let i = 0; i < binary.length; i += 8) {
    const byte = parseInt(binary.substring(i, i + 8), 2);
    if (!isNaN(byte)) {
      result.push(byte);
    }
  }
  
  return Buffer.from(result);
}

export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}

// HOTP per RFC 4226
export function totpAt(secretBase32, step, digits = 6) {
  const key = base32Decode(secretBase32);
  
  // Convert step to big-endian 8-byte buffer
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step), 0);
  
  // Calculate HMAC-SHA1 (RFC 4226)
  const hmac = createHmac('sha1', key);
  hmac.update(counter);
  const hash = hmac.digest();
  
  // Dynamic truncation (RFC 4226)
  const offset = hash[hash.length - 1] & 0x0F;
  let binary = ((hash[offset] & 0x7F) << 24) |
               ((hash[offset + 1] & 0xFF) << 16) |
               ((hash[offset + 2] & 0xFF) << 8) |
               (hash[offset + 3] & 0xFF);
  
  // Generate the code
  let code = binary % Math.pow(10, digits);
  return code.toString().padStart(digits, '0');
}

export function verifyTotp(secretBase32, code, { lastStep = null, now = Date.now() } = {}) {
  if (typeof code !== 'string') {
    return { ok: false, step: null };
  }
  
  // Strip all whitespace before validation
  const cleanCode = code.replace(/\s/g, '');
  
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, step: null };
  }
  
  const step = Math.floor(now / 1000 / 30);
  const currentStep = step;
  
  // Check if the code matches any of the allowed steps
  for (let i = -1; i <= 1; i++) {
    const testStep = currentStep + i;
    if (lastStep !== null && testStep <= lastStep) {
      continue; // Skip replayed steps
    }
    
    const expectedCode = totpAt(secretBase32, testStep);
    if (timingSafeEqual(Buffer.from(cleanCode), Buffer.from(expectedCode))) {
      return { ok: true, step: testStep };
    }
  }
  
  return { ok: false, step: null };
}

export function totpUri(email, secretBase32) {
  return 'otpauth://totp/Kaalachakra:' + encodeURIComponent(email) + 
         '?secret=' + secretBase32 + 
         '&issuer=Kaalachakra&algorithm=SHA1&digits=6&period=30';
}

export function loadSecretKey(dataDir) {
  if (process.env.KAALACHAKRA_SECRET_KEY) {
    const key = Buffer.from(process.env.KAALACHAKRA_SECRET_KEY, 'base64');
    if (key.length !== 32) {
      throw new Error('Invalid secret key length');
    }
    return key;
  }
  
  // Read from file
  const path = `${dataDir}/secret.key`;
  try {
    mkdirSync(dataDir, { recursive: true });
    const text = readFileSync(path, 'utf8');
    const key = Buffer.from(text.trim(), 'base64');
    if (key.length !== 32) {
      throw new Error('secret.key is not 32 bytes of base64');
    }
    return key;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    // File doesn't exist, create it
    const key = randomBytes(32);
    writeFileSync(path, key.toString('base64'), { mode: 0o600, flag: 'wx' });
    return key;
  }
}

export function encryptSecret(key, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(key, blob) {
  if (!blob.startsWith('v1:')) {
    throw new Error('Invalid encryption version');
  }
  
  const parts = blob.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted blob format');
  }
  
  const [version, ivB64, tagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.alloc(0));
  
  try {
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('Decryption failed');
  }
}