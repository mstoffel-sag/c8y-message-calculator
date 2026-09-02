/**
 * The string catalogue. CONCEPT.md section 8.
 *
 * Every word the user reads comes from here, in one of two languages. Three
 * things this is deliberately not:
 *
 * - **Not a framework.** No `i18next`, no ICU MessageFormat. The whole surface
 *   is `t(key, params)` plus a `count` rule with two branches, because that is
 *   all English and German need. A dependency that has to be learned before a
 *   sentence can be corrected is a dependency that stops sentences being
 *   corrected.
 * - **Not in the components.** `en` is the source of truth and `de` is typed as
 *   `Record<Key, string>`, so a missing German string is a compile error rather
 *   than an English sentence appearing mid-paragraph in a German session.
 * - **Not everything.** Configurator row labels, counter names, REST paths and
 *   the metric catalogue stay in English on purpose -- see NOT_TRANSLATED below.
 */

import { en, type Key } from './en.js';
import { de } from './de.js';

export type { Key };
export { en, de };
export * from './rich.js';

export type Locale = 'en' | 'de';

/**
 * Named in their own language, which is the only way a language switch is
 * readable: the reader who needs it is the one who cannot read the current one.
 *
 * `short` is what the top bar shows. That row is the most crowded in the app --
 * a scenario name, three figures and the expert switch, all of them longer in
 * German than in English -- and a full "Deutsch" pushed the switch onto a second
 * line. Two letters, with the full name in the control's title.
 */
export const LOCALES: Array<{ code: Locale; label: string; short: string; numbers: string }> = [
  { code: 'en', label: 'English', short: 'EN', numbers: 'en-GB' },
  { code: 'de', label: 'Deutsch', short: 'DE', numbers: 'de-DE' },
];

export const CATALOGUES: Record<Locale, Record<Key, string>> = { en, de };

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'de';
}

/**
 * What stays in English in every locale, and why. Asserted by test, so the list
 * is a decision rather than an observation.
 *
 * - **Configurator row labels** (`Public/Shared Cloud`, `Operational Data
 *   Store`) name a row in an English workbook. Translating them would break the
 *   only thing they are for: finding that row.
 * - **Counter names** (`Measurements Created`) are the platform's own, and are
 *   what a tenant's usage screen shows.
 * - **The metric catalogue** (`Filter blocked`, `Firmware version`) is not UI
 *   text at all -- a chosen name becomes the metric's name, travels into the
 *   generated fragment names and payload examples, and is quoted back in the
 *   workbook. A scenario would otherwise mean different things depending on
 *   which language it was built in.
 * - **The generated workbook**, which mirrors an English Configurator.
 * - **REST paths and MQTT topics**, which are API surface.
 */
export const NOT_TRANSLATED = [
  'Configurator row labels',
  'counter names',
  'the metric catalogue',
  'the generated workbook',
  'REST paths and MQTT topics',
] as const;

export type Params = Record<string, string | number>;

/**
 * The keys that have plural forms, named without the suffix: every `x.one` in
 * the catalogue makes `x` a legal argument to `t.plural`, and a typo in one is a
 * compile error rather than a blank in the UI.
 */
export type PluralBase<K extends string = Key> = K extends `${infer B}.one` ? B : never;

/**
 * The string for a key, with `{placeholders}` filled in.
 *
 * A missing placeholder is left in the text rather than blanked: a visible
 * `{count}` in the UI is a bug report, and a silently empty sentence is not.
 */
export function translate(locale: Locale, key: Key, params?: Params): string {
  const catalogue = CATALOGUES[locale] ?? en;
  const text = catalogue[key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * Singular or plural, by `count`.
 *
 * Both languages here need exactly two forms and both treat 1 as the singular,
 * so this is two keys and a comparison. A language with a dual or a paucal form
 * needs a real plural rule, and that is the point at which this should grow a
 * dependency rather than a special case.
 */
export function translatePlural(
  locale: Locale,
  key: PluralBase,
  count: number,
  params?: Params,
): string {
  const chosen = (Math.abs(count) === 1 ? `${key}.one` : `${key}.other`) as Key;
  return translate(locale, chosen, { count, ...params });
}

/** A `t` bound to one locale, for a component or a render pass. */
export interface T {
  (key: Key, params?: Params): string;
  locale: Locale;
  plural: (key: PluralBase, count: number, params?: Params) => string;
}

export function makeT(locale: Locale): T {
  const t = ((key: Key, params?: Params) => translate(locale, key, params)) as T;
  t.locale = locale;
  t.plural = (key, count, params) => translatePlural(locale, key, count, params);
  return t;
}
