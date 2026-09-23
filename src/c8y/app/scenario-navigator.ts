/**
 * The library, in the shell's left navigator: one child node per saved
 * scenario, plus a row that makes another.
 *
 * A factory rather than a constant node, because the list is the user's work
 * and changes while they are in it. `get()` may return an Observable, so the
 * nodes are derived from the store's index signal and the menu redraws the
 * moment a scenario is added, renamed or deleted -- no reload, no second copy
 * of the list to keep in step.
 *
 * Deliberately flat and short. The navigator is app-level furniture shared with
 * every other application in the tenant, so a presales engineer with thirty
 * customers would make it unusable; the nodes are capped and the rest are
 * reached from the picker on the page. See CONCEPT.md section 6.
 */

import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { NavigatorNode, type NavigatorNodeFactory } from '@c8y/ngx-components';
import { map, type Observable } from 'rxjs';

import { ScenarioStore } from './scenario.store.js';

/**
 * How many scenarios reach the menu. Past this the list stops being navigation
 * and starts being a filing cabinet, which belongs on the page.
 */
const MAX_NODES = 8;

@Injectable({ providedIn: 'root' })
export class ScenarioNavigator implements NavigatorNodeFactory {
  private readonly store = inject(ScenarioStore);

  get(): Observable<NavigatorNode[]> {
    return toObservable(this.store.entries).pipe(
      map(entries => {
        const root = new NavigatorNode({
          label: 'Message calculator',
          // The navigator is the shell's furniture, so its label goes through
          // the shell's own translation pipeline rather than through lib/i18n.
          translateLabel: true,
          icon: 'calculator',
          path: '/',
          priority: 100,
        });

        for (const entry of entries.slice(0, MAX_NODES)) {
          root.add(
            new NavigatorNode({
              // A customer's own name, so it is not translated -- same rule as
              // the metric catalogue in lib/i18n.
              label: entry.name.trim() || 'Untitled scenario',
              translateLabel: !entry.name.trim(),
              icon: 'file-text-o',
              path: `/scenario/${entry.id}`,
              priority: 10,
            }),
          );
        }
        return [root];
      }),
    );
  }
}
