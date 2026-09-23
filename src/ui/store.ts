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
import {
  newScenarioId,
  normaliseEntries,
  removeEntry,
  touch,
  type ScenarioEntry,
} from '../../lib/scenario/library.js';
import type { Scenario } from '../../lib/engine/index.js';

export * from '../../lib/scenario/edits.js';
export * from '../../lib/scenario/library.js';

/**
 * The single scenario this build kept before it kept several.
 *
 * Still read, once, by `migrate`: somebody with work in progress must not lose
 * it to an upgrade. Never written again.
 */
export const STORAGE_KEY = 'c8y.message-calculator.scenario';

/** The index of saved scenarios: `ScenarioEntry[]`, newest first. */
export const INDEX_KEY = 'c8y.message-calculator.scenarios';

/** One scenario, by id. The index names them; this holds them. */
const scenarioKey = (id: string) => `c8y.message-calculator.scenario.${id}`;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private windows, blocked site data, and half-written JSON all land here.
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Losing autosave is not worth interrupting the session for.
  }
}

export function listScenarios(): ScenarioEntry[] {
  return normaliseEntries(read(INDEX_KEY));
}

export function loadScenario(id: string): Scenario | null {
  const raw = read(scenarioKey(id));
  return raw ? normalise(raw) : null;
}

/** Writes the scenario and records it in the index under the same id. */
export function saveScenario(id: string, scenario: Scenario): void {
  write(scenarioKey(id), scenario);
  write(INDEX_KEY, touch(listScenarios(), id, scenario.name));
}

export function deleteScenario(id: string): void {
  try {
    localStorage.removeItem(scenarioKey(id));
  } catch {
    // The index entry is what the menu reads, so dropping that is what counts.
  }
  write(INDEX_KEY, removeEntry(listScenarios(), id));
}

/**
 * Moves a pre-library scenario into the library, once.
 *
 * Runs before the first read on every load and does nothing when the old key
 * is absent, which is every load after the first. The old key is left where it
 * is rather than deleted: a browser that opens an older build of either app
 * still finds its work, and an index entry costs nothing.
 */
export function migrate(): void {
  const old = read(STORAGE_KEY);
  if (!old || listScenarios().length > 0) return;
  saveScenario(newScenarioId(), normalise(old));
}


