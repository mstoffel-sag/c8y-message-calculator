/**
 * The catalogue, wired into preact.
 *
 * `lib/i18n` holds the strings and the lookup; this holds the three things that
 * need a framework: which locale the session is in, how the markup becomes
 * elements, and the switch. Keeping the split there means an Angular port
 * rewrites this file and reuses every word.
 *
 * The locale lives in a context with `en` as its default, so a component
 * rendered on its own -- every test in this repo, and the snapshot tool -- is
 * English without arranging anything.
 */

import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';

import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  makeT,
  parseRich,
  parseRichProse,
  type Key,
  type Locale,
  type Params,
  type RichParagraph,
  type T,
} from '../../lib/i18n/index.js';
import { setFormatLocale } from './format.js';

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function useLocaleCode(): Locale {
  return useContext(LocaleContext);
}

/** A `t` bound to the session's locale. Rebuilt only when the locale changes. */
export function useT(): T {
  const locale = useLocaleCode();
  return useMemo(() => makeT(locale), [locale]);
}

const STORAGE_KEY = 'c8y.message-calculator.locale';

/**
 * The session's locale: what was chosen last, else what the browser asks for,
 * else English.
 *
 * A viewer preference, like expert mode -- it does not travel with an exported
 * scenario, because the scenario is a description of a fleet and not of a
 * reader. Every access is wrapped: private windows and blocked site data throw
 * on `localStorage`, and `navigator.language` is absent outside a browser.
 */
function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Fall through to the browser's preference.
  }
  try {
    const asked = navigator.language.slice(0, 2).toLowerCase();
    if (isLocale(asked)) return asked;
  } catch {
    // Not a browser. English it is.
  }
  return DEFAULT_LOCALE;
}

export function useLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>(readLocale);

  useEffect(() => {
    // Numbers are formatted by Intl rather than by the catalogue, so the
    // formatter has to be told separately -- 46,0 Mio. and 46.0 M differ in
    // more than the suffix.
    setFormatLocale(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Losing the preference is not worth interrupting the session for.
    }
  }, [locale]);

  return [locale, useCallback((next: Locale) => setLocale(next), [])];
}

function tokensOf(paragraph: RichParagraph): ComponentChildren {
  return paragraph.map((token, i) => {
    switch (token.kind) {
      case 'b':
        return <b key={i}>{token.text}</b>;
      case 'em':
        return <em key={i}>{token.text}</em>;
      case 'code':
        return <code key={i}>{token.text}</code>;
      default:
        return token.text;
    }
  });
}

/** One string's marks, inline -- for a table cell, a hint, a heading. */
export function Rich({ k, p }: { k: Key; p?: Params }) {
  const t = useT();
  return <>{tokensOf(parseRich(t(k, p)))}</>;
}

/** A string's paragraphs, as paragraphs. */
export function Prose({ k, p }: { k: Key; p?: Params }) {
  const t = useT();
  return (
    <>
      {parseRichProse(t(k, p)).map((paragraph, i) => (
        <p key={i}>{tokensOf(paragraph)}</p>
      ))}
    </>
  );
}

/**
 * The language switch.
 *
 * Each language is named in itself -- "Deutsch", not "German" -- because the
 * reader who needs the switch is by definition the one who cannot read the
 * current language.
 */
export function LocaleSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  const t = useT();
  return (
    <label class="locale" title={t('app.language')}>
      <span class="sr">{t('app.language')}</span>
      <select
        value={locale}
        onChange={(e) => {
          const picked = (e.target as HTMLSelectElement).value;
          if (isLocale(picked)) onChange(picked);
        }}
      >
        {LOCALES.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}
