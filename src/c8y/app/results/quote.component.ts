/**
 * What each contract period is quoted at: messages and storage, per month and
 * over the period. The results page leads with this and, outside Expert mode,
 * shows little else.
 *
 * Four figures a period, all on the safe side -- the peak month rounded up to
 * whole billing units, times the months -- and printed with every digit: a
 * shortened "1.4 B" can read below the 1,44x,000,000 it stands for. The nine counters, the storage
 * breakdown and the volume panels are how these were reached; somebody
 * checking the estimate wants them, somebody quoting it does not.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { periodQuotes, termQuote } from '../../../../lib/engine/index.js';
import { monthYear, n, wholeGib, wholeGibMonths } from '../../../../lib/format/index.js';
import { LocaleService } from '../i18n/locale.service.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';

@Component({
  selector: 'c8y-mc-quote',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length > 0) {
      <div class="mc-panel">
        <header>
          <h2>{{ 'quote.heading' | t }}</h2>
          <span class="mc-sub-label">{{ 'quote.sub' | t }}</span>
        </header>
        <div class="mc-body">
          <table class="table mc-table">
            <thead>
              <tr>
                <th></th>
                <th class="text-right">{{ 'quote.messages.perMonth' | t }}</th>
                <th class="text-right">{{ 'quote.messages.overPeriod' | t }}</th>
                <th class="text-right">{{ 'quote.storage.perMonth' | t }}</th>
                <th class="text-right">{{ 'quote.storage.overPeriod' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.index) {
                <tr>
                  <td>
                    <b>{{ row.label }}</b>
                    <div class="mc-hint">{{ row.span }}</div>
                  </td>
                  <td class="text-right"><b>{{ row.messagesPerMonth }}</b></td>
                  <td class="text-right">{{ row.messagesOverPeriod }}</td>
                  <td class="text-right">
                    <b>{{ row.storagePerMonth }}</b>
                    @if (row.stated) {
                      <div class="mc-hint">{{ 'quote.storage.stated' | t }}</div>
                    }
                  </td>
                  <td class="text-right">{{ row.storageOverPeriod }}</td>
                </tr>
              }
              @if (term(); as term) {
                <tr class="mc-total">
                  <td>
                    <b>{{ term.label }}</b>
                    <div class="mc-hint">{{ term.span }}</div>
                  </td>
                  <td></td>
                  <td class="text-right"><b>{{ term.messages }}</b></td>
                  <td></td>
                  <td class="text-right"><b>{{ term.storage }}</b></td>
                </tr>
              }
            </tbody>
          </table>
          <p class="mc-hint m-t-16">{{ 'quote.safeSide' | t }}</p>
        </div>
      </div>
    }
  `,
})
export class QuoteComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  // Formats numbers and month names, and calls t() for the labels, so it
  // re-runs when the language changes.
  private readonly quotes = computed(() =>
    periodQuotes(this.store.scenario(), this.store.result()).filter(q => q.months > 0),
  );

  // Shown for a single period too: the reader looks for the sum in the same
  // place every time, and a row that appears only sometimes reads as missing.
  readonly term = computed(() => {
    const t = this.locales.t();
    const term = termQuote(this.quotes());
    if (!term) return null;
    return {
      label: t('quote.term'),
      span: t.plural('quote.span', term.months, {
        from: monthYear(term.start.year, term.start.month),
        to: monthYear(term.end.year, term.end.month),
      }),
      messages: n(term.messages),
      storage: wholeGibMonths(term.storageGiB),
    };
  });

  readonly rows = computed(() => {
    const t = this.locales.t();
    return this.quotes()
      .map(q => ({
        index: q.index,
        label: t('contract.periodN', { index: q.index }),
        span: t.plural('quote.span', q.months, {
          from: monthYear(q.start.year, q.start.month),
          to: monthYear(q.end.year, q.end.month),
        }),
        messagesPerMonth: n(q.messagesPerMonth),
        messagesOverPeriod: n(q.messagesOverPeriod),
        storagePerMonth: wholeGib(q.storageGiBPerMonth),
        storageOverPeriod: wholeGibMonths(q.storageGiBOverPeriod),
        stated: q.storageStated,
      }));
  });
}
