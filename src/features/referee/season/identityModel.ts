/** Per-season badge identity: pure types, seeds, prompt, and validation.
 *  No firebase/react imports so the model stays unit-testable and light. */

export const BADGE_MOTIFS = ['leaf', 'wave', 'bolt', 'gear', 'mountain', 'rocket', 'star', 'drop', 'sun', 'circuit', 'atom', 'compass', 'globe', 'flame', 'shield'] as const;
export const BADGE_STYLES = ['parallelogram', 'pill', 'ticket'] as const;
export type BadgeMotif = (typeof BADGE_MOTIFS)[number];
export type BadgeStyle = (typeof BADGE_STYLES)[number];

export type SeasonIdentity = {
  wordmark: string;
  from: string;
  via: string;
  to: string;
  edge: string;
  ink: string;
  iconInk: string;
  glow: string;
  motif: BadgeMotif;
  style: BadgeStyle;
  source: 'gemini' | 'seed' | 'default';
};

/** BIOGLOW's badge, recreated from the season's game-mat artwork. Shipped as a
 *  seed so the current season never needs a generation round-trip. */
export const BIOGLOW_IDENTITY: SeasonIdentity = {
  wordmark: 'BIOGLOW',
  from: '#e4ef70',
  via: '#c6da4a',
  to: '#a2c034',
  edge: '#8a56c2',
  ink: '#131c06',
  iconInk: '#2d4a10',
  glow: 'rgba(180,215,60,0.35)',
  motif: 'leaf',
  style: 'parallelogram',
  source: 'seed',
};

export const SEED_IDENTITIES: Record<string, SeasonIdentity> = {
  BIOGLOW: BIOGLOW_IDENTITY,
};

/** Neutral badge for a known season whose identity has not been generated
 *  yet. Dark slate, no motif claim; replaced as soon as generation lands. */
export const NEUTRAL_IDENTITY: SeasonIdentity = {
  wordmark: '',
  from: '#5b6b82',
  via: '#46536a',
  to: '#333f52',
  edge: '#8fa3bf',
  ink: '#f4f7fb',
  iconInk: '#e2e9f2',
  glow: 'rgba(148,163,184,0.25)',
  motif: 'atom',
  style: 'pill',
  source: 'default',
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const GLOW = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;

/** Validate a model- or cache-produced config. Returns null on any violation
 *  so a bad generation never reaches the screen. */
export function parseSeasonIdentity(raw: unknown, season: string): SeasonIdentity | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const colorKeys = ['from', 'via', 'to', 'edge', 'ink', 'iconInk'] as const;
  for (const key of colorKeys) {
    if (typeof value[key] !== 'string' || !HEX.test(value[key] as string)) return null;
  }
  if (typeof value.glow !== 'string' || !GLOW.test(value.glow)) return null;
  if (!BADGE_MOTIFS.includes(value.motif as BadgeMotif)) return null;
  if (!BADGE_STYLES.includes(value.style as BadgeStyle)) return null;
  return {
    wordmark: typeof value.wordmark === 'string' && value.wordmark.trim() ? value.wordmark.trim().slice(0, 24).toUpperCase() : season,
    from: value.from as string,
    via: value.via as string,
    to: value.to as string,
    edge: value.edge as string,
    ink: value.ink as string,
    iconInk: value.iconInk as string,
    glow: value.glow,
    motif: value.motif as BadgeMotif,
    style: value.style as BadgeStyle,
    source: 'gemini',
  };
}

/** Pull the first JSON object out of a model reply that may carry prose. */
export function extractIdentityJson(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** One-shot prompt for the per-season identity generation. Google Search
 *  grounding supplies the official branding; an attached rulebook cover
 *  overrides it when they disagree. */
export function buildIdentityPrompt(season: string): string {
  return `FIRST LEGO League (FLL) Challenge season named "${season}".
Use Google Search to find this season's official visual identity: its logo, brand colors, and signature motif (check firstlegoleague.org, the season reveal assets, and the challenge mat artwork). If an official identity cannot be found, infer a fitting identity from the season's name and theme.
Then design a small season badge (about 26px tall) and answer with ONLY a minified JSON object, no markdown, no explanation:
{"wordmark":"<season name in caps>","from":"#RRGGBB","via":"#RRGGBB","to":"#RRGGBB","edge":"#RRGGBB","ink":"#RRGGBB","iconInk":"#RRGGBB","glow":"rgba(R,G,B,0.35)","motif":"<one of: ${BADGE_MOTIFS.join('|')}>","style":"<one of: ${BADGE_STYLES.join('|')}>"}
Rules: from/via/to are the badge gradient, taken from the season's real branding; edge is a contrasting accent from the same branding; ink is the wordmark color and must contrast strongly against from/via/to; iconInk is a darker shade of ink for the motif icon; glow derives from via; motif is the closest icon to the season's signature symbol; style is the badge silhouette closest to the season's logo shape (parallelogram = slanted rectangle, pill = rounded capsule, ticket = plain rounded rectangle).`;
}
