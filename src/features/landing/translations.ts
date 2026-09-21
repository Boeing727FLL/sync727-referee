import {translations} from '../../locales/index.ts';
import type {LandingTranslations} from './language';

/**
 * Landing copy is a projection of the canonical locale registry, never a
 * second dictionary: the intro must say exactly the same thing on the
 * public landing route and inside the app, in every shipped language.
 * Add a key here when IntroScreen starts using it.
 */
const LANDING_KEYS = [
  'intro.subtitle',
  'intro.descFull',
  'intro.feature1Title',
  'intro.feature1Desc',
  'intro.feature2Title',
  'intro.feature2Desc',
  'intro.feature3Title',
  'intro.feature3Desc',
  'intro.continue',
  'intro.continueLogin',
  'intro.badge',
  'intro.notOfficial',
  'common.privacy',
] as const;

export const landingTranslations: LandingTranslations = Object.fromEntries(
  Object.entries(translations).map(([code, dict]) => [
    code,
    Object.fromEntries(LANDING_KEYS.map(key => [key, dict[key]])),
  ]),
);
