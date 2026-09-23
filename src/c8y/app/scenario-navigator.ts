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
import { NavigatorNode, type NavigatorNodeFactory } from '@c8y/ngx-components';
import { catchError, map, of, type Observable } from 'rxjs';

import { scenarioNavTree } from '../../../lib/wizard/navigator.js';
import { ScenarioStore } from './scenario.store.js';

@Injectable({ providedIn: 'root' })
export class ScenarioNavigator implements NavigatorNodeFactory {
  private readonly store = inject(ScenarioStore);

  /** The app's own entry, with no library under it. Always safe to return. */
  private root(): NavigatorNode {
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
          const tree = scenarioNavTree(entries);
          const root = this.root();
          for (const child of tree.children) {
            root.add(
              new NavigatorNode({
                label: child.label,
                translateLabel: child.translateLabel,
                icon: 'file-text-o',
                path: child.path,
                priority: 10,
              }),
            );
          }
          return [root];
        } catch {
          // A bad entry must cost its own row, not the menu. The bare root
          // keeps the application reachable, which is the one thing this
          // factory must never take away.
          return [this.root()];
        }
      }),
      catchError(() => of([this.root()])),
    );
  }
}
