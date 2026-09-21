/** Automatic season identity: generated once per season by Gemini (Google
 *  Search grounding + the uploaded rulebook cover), persisted to Firestore,
 *  and read from cache/Firestore at runtime. Gemini never runs on page load
 *  for a season whose identity already exists. */
import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase/firestore';
import {
  SEED_IDENTITIES,
  buildIdentityPrompt,
  extractIdentityJson,
  parseSeasonIdentity,
  type SeasonIdentity,
} from './identityModel';

export type { SeasonIdentity } from './identityModel';
export { NEUTRAL_IDENTITY } from './identityModel';

export type SeasonIdentityEvidence = { imageBase64?: string; mimeType?: string };

const GENERATION_MODEL = 'gemini-3.5-flash-lite';
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const cacheKey = (season: string) => `season_identity_${season}`;
const attemptKey = (season: string) => `season_identity_attempt_${season}`;
const inFlight = new Set<string>();

export function readCachedIdentity(season: string): SeasonIdentity | null {
  try {
    const raw = localStorage.getItem(cacheKey(season));
    return raw ? parseSeasonIdentity(JSON.parse(raw), season) : null;
  } catch {
    return null;
  }
}

/** Firestore wins over cache so a regenerated identity propagates; the seed
 *  is the instant fallback for the shipped season. */
export async function loadSeasonIdentity(season: string): Promise<SeasonIdentity | null> {
  if (!season || season === 'UNKNOWN') return null;
  try {
    const snap = await getDoc(doc(db, 'season_identities', season));
    if (snap.exists()) {
      const parsed = parseSeasonIdentity(snap.data(), season);
      if (parsed) {
        try { localStorage.setItem(cacheKey(season), JSON.stringify(parsed)); } catch {}
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Season identity load failed:', err);
  }
  return readCachedIdentity(season) || SEED_IDENTITIES[season] || null;
}

/** Identity for rendering: seed/cache instantly, Firestore when it lands. */
export function useSeasonIdentity(season: string): SeasonIdentity | null {
  const [identity, setIdentity] = useState<SeasonIdentity | null>(
    () => SEED_IDENTITIES[season] || readCachedIdentity(season),
  );
  useEffect(() => {
    let cancelled = false;
    setIdentity(SEED_IDENTITIES[season] || readCachedIdentity(season));
    if (!season || season === 'UNKNOWN') return;
    void loadSeasonIdentity(season)
      .then(result => { if (!cancelled && result) setIdentity(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [season]);
  return identity;
}

async function generateSeasonIdentity(season: string, evidence?: SeasonIdentityEvidence): Promise<SeasonIdentity | null> {
  const [{ GoogleGenAI }, { getAllApiKeys }] = await Promise.all([
    import('@google/genai'),
    import('../../../services/geminiService'),
  ]);
  const keys = await getAllApiKeys();
  const client = new GoogleGenAI({ apiKey: keys[0] });
  const prompt = buildIdentityPrompt(season);
  const parts: Record<string, unknown>[] = [{ text: evidence?.imageBase64 ? `${prompt}\nThe season's rulebook cover is attached; prefer its branding over web results.` : prompt }];
  if (evidence?.imageBase64) {
    parts.push({ inlineData: { data: evidence.imageBase64, mimeType: evidence.mimeType || 'image/jpeg' } });
  }
  const contents = [{ role: 'user', parts }];
  // Grounding first; if the tool or the reply fails, one plain retry.
  for (const useSearch of [true, false]) {
    try {
      const response = await client.models.generateContent({
        model: GENERATION_MODEL,
        contents,
        config: useSearch ? { tools: [{ googleSearch: {} }] } : {},
      });
      const parsed = parseSeasonIdentity(extractIdentityJson(response.text || ''), season);
      if (parsed) return parsed;
    } catch (err) {
      console.warn(`Season identity generation (search=${useSearch}) failed:`, err);
    }
  }
  return null;
}

/** Generate and persist the season's identity if it does not exist yet.
 *  Best-effort and throttled: one attempt per season per day, never blocks
 *  the caller, and a season with a stored identity costs zero model calls. */
export async function ensureSeasonIdentity(season: string, evidence?: SeasonIdentityEvidence): Promise<void> {
  if (!season || season === 'UNKNOWN' || inFlight.has(season)) return;
  try {
    const snap = await getDoc(doc(db, 'season_identities', season));
    if (snap.exists() && parseSeasonIdentity(snap.data(), season)) return;
  } catch {
    return; // No store access: do not burn model quota blindly.
  }
  try {
    const lastAttempt = Number(localStorage.getItem(attemptKey(season)) || 0);
    if (Date.now() - lastAttempt < RETRY_AFTER_MS) return;
    localStorage.setItem(attemptKey(season), String(Date.now()));
  } catch {}
  inFlight.add(season);
  try {
    const identity = await generateSeasonIdentity(season, evidence);
    if (!identity) return;
    await setDoc(doc(db, 'season_identities', season), { ...identity, season, updatedAt: Date.now(), model: GENERATION_MODEL });
    try { localStorage.setItem(cacheKey(season), JSON.stringify(identity)); } catch {}
  } catch (err) {
    console.warn('Season identity generation failed:', err);
  } finally {
    inFlight.delete(season);
  }
}
