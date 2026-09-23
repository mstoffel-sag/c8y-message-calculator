/**
 * The library, in the shell's left navigator: one **top-level** entry per saved
 * scenario, so each reads as a tab rather than something folded inside the
 * application's own node.
 *
 * A factory rather than a constant node, because the list is the user's work
 * and changes while they are in it. `get()` may return an Observable, so the
 * nodes are derived from the store's index signal and the menu redraws the
 * moment a scenario is added, renamed or deleted -- no reload, no second copy
 * of the list to keep in step.
 *
 * Deliberately short. The navigator is furniture shared with every other
 * application in the tenant, so a presales engineer with thirty customers would
 * make it unusable; the nodes are capped and the rest are reached from the
 * picker on the page. See CONCEPT.md section 8.2.
 */

import { Injectable, inject } from '@angular/core';
import { NavigatorNode, type NavigatorNodeFactory } from '@c8y/ngx-components';
import { catchError, map, of, type Observable } from 'rxjs';

import { scenarioNavNodes } from '../../../lib/wizard/navigator.js';
import { ScenarioStore } from './scenario.store.js';

@Injectable({ providedIn: 'root' })
export class ScenarioNavigator implements NavigatorNodeFactory {
  private readonly store = inject(ScenarioStore);

  /** The app itself, with no library on it. Always safe to return. */
  private fallback(): NavigatorNode {
    return new NavigatorNode({
      label: 'Message calculator',
      // The navigator is the shell's furniture, so its label goes through the
      // shell's own translation pipeline rather than through lib/i18n.
      translateLabel: true,
      icon: 'calculator',
      path: '/',
      priority: 100,
    });
  }

  get(): Observable<NavigatorNode[]> {
    // The store's subject, not `toObservable(signal)`: this runs whenever the
    // shell asks, which is outside any injection context, and `toObservable`
    // throws there. It did, the factory returned nothing, and the left menu
    // vanished entirely -- this app's node and every other app's with it.
    return this.store.entries$.pipe(
      map(entries => {
        try {
          return scenarioNavNodes(entries).map(
            entry =>
              new NavigatorNode({
                label: entry.label,
                translateLabel: entry.translateLabel,
                icon: 'calculator',
                path: entry.path,
                priority: entry.priority,
              }),
          );
        } catch {
          // A bad entry must cost its own row, not the menu. One node keeps the
          // application reachable, which is the one thing this factory must
          // never take away.
          return [this.fallback()];
        }
      }),
      catchError(() => of([this.fallback()])),
    );
  }
}
