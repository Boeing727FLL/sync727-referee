/**
 * vault-encrypt.mjs — OWNER-ONLY helper. Run LOCALLY, never commit its output
 * anywhere except the Firestore `secrets/api_keys` doc.
 *
 * WHAT: wraps plaintext Gemini keys (AIza...) into ENC1 envelopes that the app
 * unwraps at runtime (see src/lib/keyVault.ts). After pasting envelopes into
 * Firestore, no plaintext key exists at rest — not in Firestore, not in git,
 * not in the Netlify bundle.
 *
 * USAGE:
 *   node scripts/vault-encrypt.mjs AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX [AIza...]
 *   node scripts/vault-encrypt.mjs --selftest
 *
 * CHECKLIST (the crypto is the speed bump — THESE are the real locks):
 *   1. ROTATE first: old plaintext keys were readable by every signed-in user.
 *      Create fresh keys in AI Studio, delete the old ones.
 *   2. Google Cloud Console → APIs & Services → Credentials → each key:
 *        Application restrictions → HTTP referrers:
 *          https://fllref.abrdns.com/*  and  https://fllref.netlify.app/*
 *        API restrictions → Generative Language API only.
 *   3. Set per-minute quotas + a budget alert on the project.
 *   4. Paste the ENC1 strings below into Firestore secrets/api_keys
 *      (gemini_keys array), replacing every plaintext key.
 *
 * KEEP IN SYNC with src/lib/keyVault.ts: PEPPER, PBKDF2_ITERATIONS,
 * FIREBASE_* identifiers, and the envelope format.
 */
import { encryptKey, decryptEnvelope, VAULT_PREFIX } from './vault-crypto.mjs';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/vault-encrypt.mjs <AIza...key> [more keys...]');
  console.log('       node scripts/vault-encrypt.mjs --selftest');
  process.exit(args.length === 0 ? 1 : 0);
}

if (args[0] === '--selftest') {
  const probe = `AIzaSelfTest${'x'.repeat(29)}`;
  const enc = await encryptKey(probe);
  const back = await decryptEnvelope(enc);
  if (back !== probe || !enc.startsWith(VAULT_PREFIX) || /AIza/.test(enc)) {
    console.error('SELFTEST FAILED');
    process.exit(1);
  }
  console.log('SELFTEST OK: round-trip works, envelope leaks no AIza substring.');
  process.exit(0);
}

for (const raw of args) {
  const key = raw.trim();
  if (!key.startsWith('AIza')) {
    console.error(`SKIP (not an AIza key): ${key.slice(0, 12)}...`);
    continue;
  }
  console.log(await encryptKey(key));
}
