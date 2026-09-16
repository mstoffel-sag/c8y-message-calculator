/**
 * The hand-off: every number this tool produces, next to the Configurator cell
 * it belongs in.
 *
 * The Configurator repeats an identical block per period offset by 30 rows, so
 * the cell references below are exact for each period rather than "row 28-ish".
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  COUNTER_BASE_ROWS,
  COUNTER_KEYS,
  COUNTER_LABELS,
  LINE_ITEMS,
  PERIOD_ROW_STRIDE,
  cellFor,
  periodMonthsCell,
  storageGiBMonthsForPeriod,
  type PeriodResult,
  type Scenario,
  type ScenarioResult,
} from '../../../../lib/engine/index.js';
import { monthYear, n, nf1 } from '../../../../lib/format/index.js';
import type { T } from '../../../../lib/i18n/index.js';
import { commercialBool, commercialNumber } from '../../../../lib/scenario/edits.js';
import { CopyButtonComponent } from '../controls/copy-button.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { RichComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';

/** Where a number on this screen came from, which decides how it is drawn. */
type Origin = 'calculated' | 'estimated' | 'stated' | 'none';

/**
 * Value and display string for one line item in one period.
 *
 * The estimated lines matter here: storage is filled in by the tool unless
 * somebody states a figure, and this screen showed a dash for it while the
 * workbook wrote 64.82 into the same cell. A hand-off sheet that disagrees with
 * the file it hands off is worse than one that says nothing.
 */
function valueFor(
  t: T,
  scenario: Scenario,
  result: ScenarioResult,
  periodResult: PeriodResult,
  key: string,
): { text: string; origin: Origin } {
  const period = scenario.periods.find(p => p.index === periodResult.index);
  if (key === 'messages') {
    return { text: n(periodResult.peak.total), origin: 'calculated' };
  }
  if (!period) return { text: '—', origin: 'none' };

  const item = LINE_ITEMS.find(i => i.key === key);
  if (item?.source === 'choice') {
    return {
      text: commercialBool(period, key) ? t('deployment.yes') : t('deployment.no'),
      origin: 'stated',
    };
  }

  const value = commercialNumber(period, key);
  if (value > 0) return { text: n(value), origin: 'stated' };

  if (item?.source === 'estimated' && key === 'ods') {
    // GiB-months: what the database held at the end of each month of the
    // period, added up. See storage.ts for why that and not the fullest month.
    const giBMonths = storageGiBMonthsForPeriod(result, periodResult.index);
    if (giBMonths > 0) return { text: nf1.format(giBMonths), origin: 'estimated' };
  }
  return { text: '—', origin: 'none' };
}

@Component({
  selector: 'c8y-mc-handoff',
  standalone: true,
  imports: [CopyButtonComponent, RichComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-panel">
      <header>
        <h2>{{ 'handoff.heading' | t }}</h2>
        <span class="mc-sub-label">{{ 'handoff.sub' | t }}</span>
      </header>
      <div class="mc-body mc-tight mc-scroll">
        <table class="table mc-table">
          <thead>
            <tr>
              <th style="min-width:240px">{{ 'handoff.col.item' | t }}</th>
              @for (column of columns(); track column.index) {
                <th class="text-right" style="min-width:130px">
                  {{ column.label }}
                  <div class="mc-col-sub">{{ column.peak }}</div>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {{ 'handoff.periodLength' | t }}
                <div class="mc-hint">{{ 'handoff.months' | t }}</div>
              </td>
              @for (cell of lengthRow(); track cell.index) {
                <td class="text-right">
                  {{ cell.months }}
                  <div class="mc-cell">{{ cell.reference }}</div>
                </td>
              }
            </tr>

            @for (row of rows(); track row.key) {
              <tr [class.mc-total]="row.isMessages">
                <td>
                  {{ row.label }}
                  <div class="mc-hint">{{ row.unit }}</div>
                </td>
                @for (cell of row.cells; track cell.index) {
                  <td class="text-right">
                    <span [class]="cell.originClass" [title]="cell.title">{{ cell.text }}</span>
                    <div class="mc-cell">{{ cell.reference }}</div>
                  </td>
                }
              </tr>

              <!-- The nine counters sit directly under Messages in the workbook. -->
              @if (row.isMessages) {
                @for (counter of counters(); track counter.key) {
                  <tr>
                    <td class="mc-indent">{{ counter.label }}</td>
                    @for (cell of counter.cells; track cell.index) {
                      <td class="text-right">
                        <span [class.mc-faint]="cell.zero">{{ cell.text }}</span>
                        <div class="mc-cell">{{ cell.reference }}</div>
                      </td>
                    }
                  </tr>
                }
              }
            }

            <tr>
              <!-- What the two buttons do, said in the row that holds them. -->
              <td class="mc-hint">
                <c8y-mc-rich k="handoff.counters.explain" [p]="explainParams()" />
                <div class="m-t-4"><c8y-mc-rich k="handoff.all.explain" /></div>
              </td>
              @for (column of columns(); track column.index) {
                <td class="text-right">
                  <c8y-mc-copy
                    [label]="'handoff.counters' | t"
                    [title]="column.countersTitle"
                    [text]="column.countersText"
                  />
                  <c8y-mc-copy
                    [label]="'handoff.all' | t"
                    [title]="column.allTitle"
                    [text]="column.allText"
                  />
                </td>
              }
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class HandoffComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  readonly columns = computed(() => {
    const t = this.locales.t();
    return this.store.result().periods.map(period => ({
      index: period.index,
      label: t('contract.periodN', { index: period.index }),
      peak: t('handoff.periodPeak', {
        month: monthYear(period.peak.year, period.peak.month),
        days: period.peak.days,
      }),
      countersTitle: t('handoff.counters.title', {
        index: period.index,
        cell: cellFor(COUNTER_BASE_ROWS[0]!, period.index),
      }),
      allTitle: t('handoff.all.title', { index: period.index }),
      countersText: () =>
        COUNTER_KEYS.map(key => Math.round(period.peak.counters[key])).join('\n'),
      allText: () => this.tsvFor(period),
    }));
  });

  readonly lengthRow = computed(() =>
    this.store.result().periods.map(period => ({
      index: period.index,
      months: this.store.scenario().periods.find(p => p.index === period.index)?.months ?? '—',
      reference: periodMonthsCell(period.index),
    })),
  );

  readonly rows = computed(() => {
    const t = this.locales.t();
    const scenario = this.store.scenario();
    const result = this.store.result();

    return LINE_ITEMS.map(item => ({
      key: item.key,
      isMessages: item.key === 'messages',
      label: item.label,
      unit:
        item.unit +
        (item.source === 'calculated' ? t('handoff.calculated') : '') +
        (item.source === 'estimated' ? t('handoff.estimated') : ''),
      cells: result.periods.map(period => {
        const { text, origin } = valueFor(t, scenario, result, period, item.key);
        return {
          index: period.index,
          text,
          reference: cellFor(item.baseRow, period.index),
          originClass: `mc-origin-${origin}`,
          title: origin === 'estimated' ? t('handoff.estimateTitle') : '',
        };
      }),
    }));
  });

  readonly counters = computed(() => {
    this.locales.locale();
    const periods = this.store.result().periods;
    return COUNTER_KEYS.map((key, i) => ({
      key,
      label: COUNTER_LABELS[key],
      cells: periods.map(period => ({
        index: period.index,
        text: n(period.peak.counters[key]),
        zero: period.peak.counters[key] === 0,
        reference: cellFor(COUNTER_BASE_ROWS[i]!, period.index),
      })),
    }));
  });

  readonly explainParams = computed(() => ({
    range: `${cellFor(COUNTER_BASE_ROWS[0]!, 1)}:${cellFor(COUNTER_BASE_ROWS[8]!, 1)}`,
    stride: PERIOD_ROW_STRIDE,
  }));

  /** Cell reference, value and label per line -- pasteable straight into a sheet. */
  private tsvFor(periodResult: PeriodResult): string {
    const t = this.locales.t();
    const scenario = this.store.scenario();
    const result = this.store.result();
    const period = scenario.periods.find(p => p.index === periodResult.index);

    const lines: string[] = [
      [
        periodMonthsCell(periodResult.index),
        period?.months ?? '',
        t('handoff.lengthLabel', { index: periodResult.index }),
      ].join('\t'),
    ];

    for (const item of LINE_ITEMS) {
      if (item.key === 'messages') continue; // D27 is a formula in the workbook.
      const { text } = valueFor(t, scenario, result, periodResult, item.key);
      if (text !== '—') {
        lines.push(
          `${cellFor(item.baseRow, periodResult.index)}\t${text.replace(/,/g, '')}\t${item.label}`,
        );
      }
    }

    COUNTER_KEYS.forEach((key, i) => {
      lines.push(
        `${cellFor(COUNTER_BASE_ROWS[i]!, periodResult.index)}\t` +
          `${Math.round(periodResult.peak.counters[key])}\t${COUNTER_LABELS[key]}`,
      );
    });

    return lines.join('\n');
  }
}
