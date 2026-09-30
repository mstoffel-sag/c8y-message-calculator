/**
 * Light or dark, or whatever the operating system is doing.
 *
 * The Web SDK build has no equivalent and should not grow one: it takes its
 * theme from the Cumulocity shell, the same way it takes its language, and a
 * second switch inside the page would fight the one in the user's profile.
 * This build draws its own frame, so the choice is its own to offer.
 *
 * Three states rather than two. A plain toggle has to start somewhere, and
 * whichever way it starts is wrong for half the people who open it; "system"
 * is the honest default and the only one that follows a machine that switches
 * itself at sunset.
 *
 * The resolved value goes on `<html data-theme>` because that is what the
 * stylesheet keys on -- one dark block, no `prefers-color-scheme` duplicate to
 * drift out of step. `index.html` sets the same attribute before first paint,
 * so a dark reader never sees a white flash while the bundle loads.
 *
 * A viewer preference, not scenario data: it lives in browser storage and does
 * not travel with an exported scenario.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const KEY = 'c8y.message-calculator.theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

function read(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // Private windows and blocked site data both throw.
  }
  return 'system';
}

/** What `system` means right now. Outside a browser there is nothing to ask. */
function systemIsDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return systemIsDark() ? 'dark' : 'light';
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    try {
      document.documentElement.dataset.theme = resolveTheme(theme);
    } catch {
      // Not a browser. Nothing to paint.
    }
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Losing the preference is not worth interrupting the session for.
    }
  }, [theme]);

  // A machine that flips at sunset should take the page with it, but only
  // while the reader has not overruled it.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    let query: MediaQueryList;
    try {
      query = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    const follow = () => {
      document.documentElement.dataset.theme = resolveTheme('system');
    };
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [theme]);

  return [theme, useCallback((next: Theme) => setTheme(next), [])];
}
