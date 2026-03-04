import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

const dataDir = path.resolve(__dirname, '..', 'data');

// Ensure DATA_DIR exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load .env from server directory
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

export const PORT = parseInt(process.env.PORT ?? '3001', 10);
export const NODE_ENV = process.env.NODE_ENV ?? 'development';

// Ensure ENCRYPTION_SALT exists
function ensureEncryptionSalt(): string {
  if (process.env.ENCRYPTION_SALT) {
    return process.env.ENCRYPTION_SALT;
  }

  // Generate a new random 32-byte hex salt
  const salt = crypto.randomBytes(32).toString('hex');

  // Write to .env file
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  // Append or update ENCRYPTION_SALT line
  if (envContent.includes('ENCRYPTION_SALT=')) {
    envContent = envContent.replace(/^ENCRYPTION_SALT=.*/m, `ENCRYPTION_SALT=${salt}`);
  } else {
    envContent = envContent.trimEnd();
    if (envContent.length > 0) {
      envContent += '\n';
    }
    envContent += `ENCRYPTION_SALT=${salt}\n`;
  }

  fs.writeFileSync(envPath, envContent, 'utf-8');
  process.env.ENCRYPTION_SALT = salt;

  return salt;
}

const _encryptionSalt = ensureEncryptionSalt();

export function getEncryptionSalt(): string {
  return _encryptionSalt;
}
