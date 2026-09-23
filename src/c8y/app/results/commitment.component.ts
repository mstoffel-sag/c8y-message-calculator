/**
 * The commit-to-consume commitment, in the only terms this tool has:
 * quantities. CONCEPT.md section 6.6.
 *
 * It sits directly under the hand-off table rather than further down the page.
 * The table states one month per period and the period's length in D21; this is
 * the same quantities carried across the term those two imply. With other
 * panels between them the two were read as unrelated figures, and the obvious
 * question -- "where is my twelve months?" -- had no answer in view.
 *
 * A panel of its own rather than part of `results-panels`, because that is what
 * lets it be placed there.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { commitmentFor } from '../../../../lib/engine/index.js';
import { compact } from '../../../../lib/format/index.js';
import { LocaleService } from '../i18n/locale.service.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';

@Component({
  selector: 'c8y-mc-commitment',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (commitment(); as c) {
      <div class="mc-panel">
        <header>
          <h2>{{ 'commitment.heading' | t }}</h2>
          <span class="mc-sub-label">{{ c.sub }}</span>
        </header>
        <div class="mc-body">
          <!-- Three figures, no captions under them. The captions restated the
               labels they sat under, and the fourth stat -- quoted minus
               expected -- is made properly in the paragraph below, which has
               room to say why the gap matters rather than only how big it is. -->
          <div class="mc-grid mc-three m-b-16">
            @for (stat of c.stats; track stat.key) {
              <div class="mc-stat">
                <span>{{ stat.label }}</span>
                <b>{{ stat.value }}</b>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CommitmentComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  readonly commitment = computed(() => {
    const t = this.locales.t();
    const c = commitmentFor(this.store.scenario(), this.store.result());
    if (c.termMonths === 0 || c.termUnitsQuoted === 0) return null;

    return {
      sub: t('commitment.sub', { months: c.termMonths }),
      stats: [
        {
          key: 'messages',
          label: t('commitment.stat.messages'),
          value: compact(c.termMessages),
        },
        {
          key: 'quoted',
          label: t('commitment.stat.quoted'),
          value: compact(c.termUnitsQuoted),
        },
        {
          key: 'actual',
          label: t('commitment.stat.actual'),
          value: compact(c.termUnitsActual),
        },
      ],
    };
  });
}
