#!/usr/bin/env node

import { openDb } from './db/index.js';
import { getUserByEmail, setPassword, disableTotp, deleteUserSessions, clearFailures } from './auth/store.js';
import { hashPassword, generatePassword } from './auth/crypto.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.KAALACHAKRA_DB ?? resolve(here, '..', 'data', 'kaalachakra.db');

function usage() {
  console.error('Usage: node src/cli.js reset-admin');
  process.exit(2);
}

async function resetAdmin() {
  const db = openDb(DB_PATH);
  
  try {
    // Find admin user
    const adminEmail = process.env.KAALACHAKRA_ADMIN_EMAIL || 'admin@janmejay.info';
    const admin = getUserByEmail(db, adminEmail);
    
    if (!admin) {
      console.error('Admin user not found');
      process.exit(1);
    }
    
    // Generate new password
    const newPassword = generatePassword(20);
    
    // Hash the password
    const passwordHash = await hashPassword(newPassword);
    
    // Set new password and reset must_change_password flag
    setPassword(db, admin.id, passwordHash, { mustChange: true });
    
    // Disable TOTP
    disableTotp(db, admin.id);
    
    // Clear lock
    clearFailures(db, admin.id);
    
    // Delete all sessions for this user
    deleteUserSessions(db, admin.id);
    
    // Print the new password to stdout
    console.log(newPassword);
  } finally {
    db.close();
  }
}

const command = process.argv[2];

switch (command) {
  case 'reset-admin':
    await resetAdmin();
    break;
  default:
    usage();
}