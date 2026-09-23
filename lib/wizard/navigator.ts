/**
 * What the shell's left navigator should show for the scenario library.
 *
 * The shape only. Building the SDK's `NavigatorNode` objects is four lines in
 * the Angular factory; deciding what goes in them is this, where it can be
 * tested — the SDK cannot be imported outside a bundler, so anything left in
 * that factory is verified by nothing but a deploy.
 *
 * That distinction earned itself immediately. The first factory built its
 * Observable with `toObservable(signal)` inside `get()`, which the shell calls
 * outside any injection context, so it threw exactly there: the factory
 * produced no nodes and the **entire left menu disappeared** — this app's entry
 * and every other application's with it. Type-checking had nothing to say, and
 * there was no test that could have.
 */

import type { ScenarioEntry } from '../scenario/library.js';

/**
 * How many scenarios reach the menu. Past this, a list shared with every other
 * application in the tenant stops being navigation and becomes a filing
 * cabinet, which belongs on the page instead.
 */
export const MAX_NAV_SCENARIOS = 8;

export interface NavEntry {
  label: string;
  /**
   * Whether the shell should translate the label. True only for the tool's own
   * words: a scenario carries the customer's name for it, and translating that
   * would be translating data.
   */
  translateLabel: boolean;
  path: string;
}

export interface NavTree {
  root: NavEntry;
  children: NavEntry[];
}

/**
 * @param untitled what a scenario nobody has named is called. English, because
 *   the navigator is the shell's furniture and takes the shell's own
 *   translation route rather than `lib/i18n`.
 */
export function scenarioNavTree(
  entries: ScenarioEntry[],
  untitled = 'Untitled scenario',
  max = MAX_NAV_SCENARIOS,
): NavTree {
  const children = entries.slice(0, Math.max(0, max)).map((entry) => {
    const named = entry.name.trim();
    return { label: named || untitled, translateLabel: named === '', path: `/scenario/${entry.id}` };
  });
  return {
    root: { label: 'Message calculator', translateLabel: true, path: '/' },
    children,
  };
}
