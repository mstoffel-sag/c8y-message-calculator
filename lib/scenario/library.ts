/**
 * The index of saved scenarios: what is in the library, not where it is kept.
 *
 * Both builds grew a library at the same time and for the same reason — one
 * estimate per customer, kept side by side rather than overwritten — but they
 * disagree about the shelf. The Web SDK build lists them in the shell's
 * navigator; the standalone build has a picker in its own top bar. What they
 * must not disagree about is the shape of an entry, the id, or which one is
 * newest, so that part lives here.
 *
 * Nothing in this file reads or writes anything. Every function takes the index
 * it is given and returns a new one, exactly like `edits.ts` — which is what
 * keeps it inside `lib/`, where browser storage may not be named, let alone
 * called. Each app supplies the four lines that actually persist.
 */

import type { Scenario } from '../engine/index.js';

/**
 * One row of the index.
 *
 * Deliberately not the whole scenario: the library is read on every page load
 * to draw a menu, and parsing a dozen fleets to print a dozen names would make
 * the menu the slowest thing on the screen. The scenario itself is fetched only
 * when one is opened.
 */
export interface ScenarioEntry {
  id: string;
  /** A copy of `Scenario.name`, kept in step by `touch`. */
  name: string;
  /** Epoch millis of the last save, so the list can put recent work first. */
  savedAt: number;
}

/**
 * Ids are opaque and travel in a URL, so they are made of characters that
 * survive one: the Web SDK build routes on `scenario/:id`.
 */
export function newScenarioId(now = Date.now(), random = Math.random): string {
  return `s${now.toString(36)}${random().toString(36).slice(2, 7)}`;
}

/**
 * What a nameless scenario is called in the list.
 *
 * The name is the customer's own and usually filled in, but a scenario created
 * and not yet named still needs a row somebody can click, and an empty row is
 * one nobody can.
 */
export function entryName(scenario: Pick<Scenario, 'name'>, fallback: string): string {
  return scenario.name.trim() || fallback;
}

/** Newest first. The library is a work queue, not an archive. */
export function sortedEntries(entries: ScenarioEntry[]): ScenarioEntry[] {
  return [...entries].sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Records a save: adds the entry if it is new, updates its name and timestamp
 * if it is not.
 *
 * Called on every edit in both builds, so it has to be cheap and it has to be
 * idempotent -- the name is copied from the scenario each time rather than
 * being a second thing to keep in step by hand.
 */
export function touch(
  entries: ScenarioEntry[],
  id: string,
  name: string,
  savedAt = Date.now(),
): ScenarioEntry[] {
  const without = entries.filter((entry) => entry.id !== id);
  return sortedEntries([...without, { id, name, savedAt }]);
}

export function removeEntry(entries: ScenarioEntry[], id: string): ScenarioEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/**
 * The entry to open when none was asked for, or when the one asked for is gone
 * -- a stale link, or a scenario deleted in another tab.
 */
export function mostRecent(entries: ScenarioEntry[]): ScenarioEntry | undefined {
  return sortedEntries(entries)[0];
}

/**
 * An index read back from storage, which may be anything at all: hand-edited,
 * written by an older build, or truncated by a browser that ran out of room.
 *
 * Same contract as `normalise` for a scenario -- a bad row is dropped rather
 * than allowed to break the menu, because a library that throws on load leaves
 * the app with no way in.
 */
export function normaliseEntries(raw: unknown): ScenarioEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ScenarioEntry[] = [];
  for (const item of raw) {
    const entry = item as Partial<ScenarioEntry>;
    if (typeof entry?.id !== 'string' || entry.id === '' || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : '',
      savedAt:
        typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt) ? entry.savedAt : 0,
    });
  }
  return sortedEntries(out);
}
