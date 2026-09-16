/**
 * The preact app's scenario store: the edits, plus where this build keeps one.
 *
 * Every immutable operation lives in `lib/scenario/edits.ts` and is re-exported
 * here, so the fifty call sites in `src/ui` keep importing `./store.js` and the
 * Web SDK app in `src/c8y` reads the same functions out of `lib/` without
 * reaching into another app's folder.
 *
 * What stays here is the half that is genuinely this build's own: a scenario in
 * `localStorage`, under a key scoped to this app.
 */

import { normalise } from '../../lib/scenario/edits.js';
import type { Scenario } from '../../lib/engine/index.js';

export * from '../../lib/scenario/edits.js';

export const STORAGE_KEY = 'c8y.message-calculator.scenario';

export function save(scenario: Scenario): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
  } catch {
    // Private windows and blocked site data both throw; losing autosave is not
    // worth interrupting the session for.
  }
}

export function load(): Scenario | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
