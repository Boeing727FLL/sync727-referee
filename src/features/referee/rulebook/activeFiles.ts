import { extractSeasonFromFilename } from './season.ts';

export type ListedRulebookObject = { Key?: string; LastModified?: Date | string };
export type ActiveRulebookSource = { name: string; key: string; url: string };

/** Select every source for the displayed active season. Legacy UNKNOWN
 * installations retain every source because no reliable season boundary is
 * available. Result order is stable so Gemini receives deterministic context. */
export function selectActiveRulebookSources(
  objects: ListedRulebookObject[],
  activeSeason: string,
  publicUrl: (key: string) => string,
): ActiveRulebookSource[] {
  const byKey = new Map<string, ActiveRulebookSource>();
  for (const object of objects) {
    const key = object.Key;
    if (!key || key === 'fll-rules/' || !key.startsWith('fll-rules/')) continue;
    const name = key.slice('fll-rules/'.length);
    const season = extractSeasonFromFilename(name);
    // Generic names such as updates.pdf are part of the manually managed
    // active set; exclude only files positively identified as another season.
    if (activeSeason !== 'UNKNOWN' && season !== 'UNKNOWN' && season !== activeSeason) continue;
    byKey.set(key, { key, name, url: publicUrl(key) });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, 'en'));
}
