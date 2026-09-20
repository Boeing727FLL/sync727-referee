/** Derive the FLL season identifier from a rulebook filename. */
export function extractSeasonFromFilename(filename: string): string {
  const value = filename.toLowerCase();
  const known: Array<[RegExp, string]> = [
    [/submerged/, 'SUBMERGED'],
    [/unearthed|unearth/, 'UNEARTHED'],
    [/masterpiece|mustrpiece|master/, 'MASTERPIECE'],
    [/superpowered|super power/, 'SUPERPOWERED'],
    [/cargoconnect|cargo connect/, 'CARGO_CONNECT'],
    [/replay|re-play/, 'REPLAY'],
    [/cityshaper|city shaper/, 'CITY_SHAPER'],
    [/intoorbit|into orbit/, 'INTO_ORBIT'],
  ];
  for (const [pattern, season] of known) if (pattern.test(value)) return season;

  const match = value.match(/fll[_-]?(?:challenge[_-])?([a-z]+)[_-]/);
  if (match?.[1] && !['challenge', 'robot'].includes(match[1])) return match[1].toUpperCase();

  const baseName = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim();
  const seasonBase = baseName
    .replace(/\s*[_\-()\s]+\s*updates?\s*[)\-]*$/i, '')
    .replace(/\s+updates?\s*$/i, '')
    .trim();
  if (seasonBase && !/(update|text|image)/i.test(seasonBase)) return seasonBase.toUpperCase();
  return 'UNKNOWN';
}
