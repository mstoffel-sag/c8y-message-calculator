/**
 * Output. CONCEPT.md section 7.
 *
 * The nine counters are the primary artefact; everything else on the page
 * supports them. Deliberately absent: billable units, utilisation, headroom,
 * commit recommendations, overage warnings. A billing system handles
 * withdrawal, and this tool cannot get a bill wrong if it never computes one.
 *
 * Every panel is a `computed()` that returns finished strings. That is not
 * indirection for its own sake: these panels format the same figure three ways,
 * and a template that calls `compact()` inline recomputes all of it on every
 * keystroke two steps away.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DEFAULT_RETENTION_DAYS, type MonthResult } from '../../../../lib/engine/index.js';
import {
  compact,
  gib,
  gibMonths,
  gibRange,
  monthYear,
  n,
  nf1,
  pct,
} from '../../../../lib/format/index.js';
import { LocaleService } from '../i18n/locale.service.js';
import { RichComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';
import { FindingsComponent } from './findings.component.js';

@Component({
  selector: 'c8y-mc-results-panels',
  standalone: true,
  imports: [FindingsComponent, RichComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-grid mc-four m-b-16">
      @for (stat of headline(); track stat.key) {
        <div class="mc-stat">
          <span>{{ stat.label }}</span>
          <b>{{ stat.value }}</b>
          <small>{{ stat.sub }}</small>
        </div>
      }
    </div>

    <div class="mc-grid mc-two">
      <div class="mc-panel">
        <header><h2>{{ 'byType.heading' | t }}</h2></header>
        <div class="mc-body mc-tight">
          @if (byType().length === 0) {
            <div class="mc-empty">{{ 'byType.empty' | t }}</div>
          } @else {
            <table class="table mc-table">
              <tbody>
                @for (row of byType(); track row.key) {
                  <tr>
                    <td>
                      {{ row.name }}
                      <div class="mc-bar"><i [style.width.%]="row.share"></i></div>
                    </td>
                    <td class="text-right" style="width:120px">
                      {{ row.total }}
                      <div class="mc-faint">{{ row.pct }} %</div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </div>

      <div class="mc-panel">
        <header>
          <h2>{{ 'ramp.heading' | t }}</h2>
          <span class="mc-sub-label">{{ ramp().monthsLabel }}</span>
        </header>
        <div class="mc-body">
          <div class="mc-ramp">
            @for (bar of ramp().bars; track bar.key) {
              <i [class.mc-peak]="bar.peak" [style.height.%]="bar.height" [title]="bar.tooltip"></i>
            }
          </div>
          <table class="table mc-table m-t-8">
            <tbody>
              @for (period of ramp().periods; track period.key) {
                <tr>
                  <td>
                    {{ period.label }}
                    <div class="mc-faint">{{ period.from }}</div>
                  </td>
                  <td class="text-right">
                    {{ period.range }}
                    <div class="mc-faint">{{ period.peak }}</div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <c8y-mc-findings />

    <p class="mc-disclaimer"><c8y-mc-rich k="results.disclaimer" /></p>
  `,
})
export class ResultsPanelsComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  private readonly peak = computed(() => this.store.result().peakMonth);

  readonly headline = computed(() => {
    const t = this.locales.t();
    const peak = this.peak();
    const steady = this.store.result().months.filter(m => m.onboardingCreates === 0);
    const best = steady.reduce<MonthResult | undefined>(
      (found, m) => (!found || m.total > found.total ? m : found),
      undefined,
    );
    const lean = steady.reduce<MonthResult | undefined>(
      (found, m) => (!found || m.total < found.total ? m : found),
      undefined,
    );

    return [
      {
        key: 'peak',
        label: t('results.stat.peakMonth'),
        value: compact(peak.total),
        sub:
          t('results.stat.peakMonth.sub', {
            month: monthYear(peak.year, peak.month),
            days: peak.days,
          }) +
          (peak.onboardingCreates > 0
            ? t('results.stat.peakMonth.registrations', { count: n(peak.onboardingCreates) })
            : ''),
      },
      {
        key: 'range',
        label: t('results.stat.range'),
        value: lean && best ? `${compact(lean.total)} – ${compact(best.total)}` : '—',
        sub:
          lean && best && lean.total > 0
            ? t('results.stat.range.swing', {
                pct: nf1.format((best.total / lean.total - 1) * 100),
              })
            : t('results.stat.range.same'),
      },
      {
        key: 'perMachine',
        label: t('results.stat.perMachine'),
        value: n(peak.perMachinePerMonth),
        sub: t('results.stat.perMachine.sub'),
      },
      {
        key: 'perSecond',
        label: t('results.stat.perSecond'),
        value: nf1.format(peak.avgMessagesPerSec),
        sub: t('results.stat.perSecond.sub'),
      },
    ];
  });

  readonly byType = computed(() => {
    this.locales.locale();
    const peak = this.peak();
    const rows = [...peak.byMachineType].sort((a, b) => b.total - a.total);
    const max = Math.max(1, ...rows.map(r => r.total));
    return rows.map(row => ({
      key: row.machineTypeId,
      name: row.name,
      total: compact(row.total),
      share: (row.total / max) * 100,
      pct: peak.total > 0 ? n((row.total / peak.total) * 100) : '0',
    }));
  });

  readonly ramp = computed(() => {
    const t = this.locales.t();
    const periods = this.store.result().periods;
    const months = periods.flatMap(p => p.months);
    const max = Math.max(1, ...months.map(m => m.total));

    return {
      monthsLabel: t.plural('ramp.months', months.length),
      bars: months.map(m => ({
        key: `${m.year}-${m.month}`,
        peak: m.total === max,
        height: (m.total / max) * 100,
        tooltip: t('ramp.tooltip', {
          month: monthYear(m.year, m.month),
          count: n(m.total),
          days: m.days,
        }),
      })),
      periods: periods.map(p => ({
        key: p.index,
        label: t('contract.periodN', { index: p.index }),
        from: t.plural('ramp.monthsFrom', p.months.length, {
          month: p.months[0] ? monthYear(p.months[0].year, p.months[0].month) : '—',
        }),
        range: `${compact(p.lean.total)} – ${compact(p.peak.total)}`,
        peak: t('ramp.peak', { month: monthYear(p.peak.year, p.peak.month) }),
      })),
    };
  });
}
