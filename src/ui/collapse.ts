/**
 * Which machine types are collapsed.
 *
 * A fleet with one machine type wants its editing block open; a fleet with six
 * wants a list it can read. So the default follows the count, and after that it
 * follows whatever the reader did.
 *
 * Kept outside the scenario on purpose. Whether a block is folded is not part of
 * the estimate, must not travel in an exported scenario, and must not mark the
 * scenario dirty. It is also shared by StepTimeSeries and StepDiscrete, keyed
 * by machine type id, so folding the HVAC block away stays folded as you walk
 * the wizard.
 *
 * Same shape as useExpert: a viewer preference in localStorage, and every access
 * wrapped, because private windows and blocked site data both throw.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';

const KEY = 'c8y.message-calculator.collapsed';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export interface Collapse {
  /** Is this machine type folded away right now? */
  isCollapsed: (id: string) => boolean;
  toggle: (id: string, collapsed: boolean) => void;
}

/**
 * @param ids every machine type currently in the scenario, in order. The first
 *   one stays open by default so a single-type fleet behaves as it always did;
 *   the rest start folded, which is the point of having them fold at all.
 */
export function useCollapse(ids: string[]): Collapse {
  const [explicit, setExplicit] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    for (const id of read()) seed[id] = true;
    return seed;
  });

  // Only ids the scenario still has are written back. Machine type ids come off
  // a counter, so a stale "mt-2" left behind by a deleted type would otherwise
  // fold a completely unrelated machine type in some later session.
  const present = ids.join(',');
  useEffect(() => {
    try {
      const keep = Object.entries(explicit)
        .filter(([id, collapsed]) => collapsed && ids.includes(id))
        .map(([id]) => id);
      localStorage.setItem(KEY, JSON.stringify(keep));
    } catch {
      // Losing the preference is not worth interrupting the session for.
    }
    // `present` stands in for `ids`, which is a fresh array on every render.
  }, [explicit, present]);

  const isCollapsed = useCallback(
    (id: string) => {
      const choice = explicit[id];
      if (choice !== undefined) return choice;
      // No choice made yet: open the first, fold the rest.
      return ids.length > 1 && ids.indexOf(id) > 0;
    },
    [explicit, ids],
  );

  const toggle = useCallback(
    (id: string, collapsed: boolean) => setExplicit((prev) => ({ ...prev, [id]: collapsed })),
    [],
  );

  return { isCollapsed, toggle };
}
