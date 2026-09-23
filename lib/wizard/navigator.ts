/**
 * What the shell's left navigator should show for the scenario library: one
 * top-level entry per saved scenario.
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
 * How many scenarios reach the menu.
 *
 * All of them. There was a cap of eight while the page also carried a picker,
 * on the grounds that a menu shared with every other application should not
 * become a filing cabinet. The picker is gone -- the navigator is the library
 * now -- so a cap would not tidy the menu, it would strand the ninth scenario
 * somewhere only a saved URL could reach. The parameter survives for tests.
 */
export const MAX_NAV_SCENARIOS = Number.POSITIVE_INFINITY;

export interface NavEntry {
  label: string;
  /**
   * Whether the shell should translate the label. True only for the tool's own
   * words: a scenario carries the customer's name for it, and translating that
   * would be translating data.
   */
  translateLabel: boolean;
  path: string;
  /**
   * The shell orders the menu by this, highest first. Handing out descending
   * numbers is what keeps the library in its own order -- most recently saved
   * at the top -- rather than in whatever order the shell happens to sort
   * equal priorities in.
   */
  priority: number;
}

/** Where the app sits among every other application's entries. */
const TOP_PRIORITY = 100;

/**
 * One top-level entry per scenario.
 *
 * Not a parent node with the library nested under it. A nested menu makes the
 * scenarios two clicks away and hides which one is open behind a collapsed
 * parent; at the top level each is a tab, which is what a library of estimates
 * behaves like -- you switch between them constantly and want to see at a
 * glance which you are in.
 *
 * @param untitled what a scenario nobody has named is called. English, because
 *   the navigator is the shell's furniture and takes the shell's own
 *   translation route rather than `lib/i18n`.
 */
export function scenarioNavNodes(
  entries: ScenarioEntry[],
  untitled = 'Untitled scenario',
  max = MAX_NAV_SCENARIOS,
): NavEntry[] {
  const shown = entries.slice(0, Math.max(0, max));
  // An empty library cannot happen -- both stores open one on first load -- but
  // a menu is the way into the application, so it does not get to be empty on
  // a technicality.
  if (shown.length === 0) {
    return [
      { label: 'Message calculator', translateLabel: true, path: '/', priority: TOP_PRIORITY },
    ];
  }
  return shown.map((entry, i) => {
    const named = entry.name.trim();
    return {
      label: named || untitled,
      translateLabel: named === '',
      path: `/scenario/${entry.id}`,
      priority: TOP_PRIORITY - i,
    };
  });
}
