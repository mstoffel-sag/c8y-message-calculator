/**
 * Which machine types are folded away.
 *
 * A fleet with one machine type wants its editing block open; a fleet with six
 * wants a list it can read. So the default follows the count, and after that it
 * follows whatever the reader did.
 *
 * Kept outside the scenario on purpose. Whether a block is folded is not part of
 * the estimate, must not travel in an exported scenario, and must not mark the
 * scenario dirty. It is shared by the series and discrete steps, keyed by
 * machine type id, so folding the HVAC block away stays folded as you walk the
 * wizard.
 *
 * The standalone build has to be told which ids exist, because each step
 * assembles that list itself. Here the store already holds the scenario, so the
 * service reads the ids from it -- which is also what keeps a stale "mt-2" from
 * a deleted type out of storage, where it would fold a completely unrelated
 * machine type in some later session.
 */

import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { ScenarioStore } from './scenario.store.js';

const KEY = 'c8y.message-calculator.collapsed';

@Injectable({ providedIn: 'root' })
export class CollapseService {
  private readonly store = inject(ScenarioStore);

  /** Only the types the reader has actually opened or closed. */
  private readonly explicit = signal<Record<string, boolean>>(restore());

  private readonly ids = computed(() => this.store.scenario().machineTypes.map(mt => mt.id));

  constructor() {
    effect(() => {
      const present = this.ids();
      const keep = Object.entries(this.explicit())
        .filter(([id, collapsed]) => collapsed && present.includes(id))
        .map(([id]) => id);
      try {
        localStorage.setItem(KEY, JSON.stringify(keep));
      } catch {
        // Losing the preference is not worth interrupting the session for.
      }
    });
  }

  isCollapsed(id: string): boolean {
    const choice = this.explicit()[id];
    if (choice !== undefined) return choice;
    // No choice made yet: open the first, fold the rest.
    const ids = this.ids();
    return ids.length > 1 && ids.indexOf(id) > 0;
  }

  toggle(id: string, collapsed: boolean): void {
    this.explicit.update(prev => ({ ...prev, [id]: collapsed }));
  }
}

function restore(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    const seed: Record<string, boolean> = {};
    for (const id of parsed) if (typeof id === 'string') seed[id] = true;
    return seed;
  } catch {
    return {};
  }
}
