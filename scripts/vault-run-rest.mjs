/**
 * vault-run-rest.mjs — launcher: reads the Firebase CLI OAuth token from the
 * local configstore (never prints it) and hands it to vault-firestore-rest.mjs.
 * Pass --apply through to write. Usage:
 *   node scripts/vault-run-rest.mjs            # inventory only
 *   node scripts/vault-run-rest.mjs --apply    # encrypt + write back
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const candidates = [
  process.env.APPDATA ? join(process.env.APPDATA, 'configstore', 'firebase-tools.json') : null,
  join(homedir(), '.config', 'configstore', 'firebase-tools.json'),
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'configstore', 'firebase-tools.json') : null,
].filter(Boolean);

let accessToken = null;
for (const p of candidates) {
  try {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    const t = raw?.tokens || raw?.user?.tokens || null;
    if (t?.access_token) {
      accessToken = t.access_token;
      break;
    }
  } catch {
    // Try next candidate.
  }
}
if (!accessToken) {
  console.error('No Firebase CLI access token found — run `firebase login` first.');
  process.exit(1);
}
process.env.FIREBASE_BEARER = accessToken;
await import('./vault-firestore-rest.mjs');
