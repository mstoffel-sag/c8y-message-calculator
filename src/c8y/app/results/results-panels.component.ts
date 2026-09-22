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

    <div class="mc-panel">
      <header>
        <h2>{{ 'naive.heading' | t }}</h2>
        <span class="mc-sub-label">{{ naive().month }}</span>
      </header>
      <div class="mc-body">
        <div class="mc-grid mc-two">
          <div>
            <table class="table mc-table">
              <tbody>
                <tr>
                  <td>{{ 'naive.asDesigned' | t }}</td>
                  <td class="text-right">{{ naive().designed }}</td>
                </tr>
                <tr>
                  <td>{{ 'naive.naive' | t }}</td>
                  <td class="text-right">{{ naive().unbundled }}</td>
                </tr>
                <tr class="mc-total">
                  <td>{{ 'naive.difference' | t }}</td>
                  <td class="text-right">{{ naive().saving }}</td>
                </tr>
              </tbody>
            </table>
            @if (naive().share !== null) {
              <div class="mc-bar"><i [style.width.%]="naive().share"></i></div>
              <p class="m-t-8"><c8y-mc-rich k="naive.less" [p]="naive().lessParams!" /></p>
            }
          </div>
          <div>
            <p class="mc-note">
              <b>{{ 'naive.baselineLabel' | t }}</b> {{ 'engine.naiveBaselineRule' | t }}
            </p>
            <p class="mc-muted m-t-8">{{ naive().notCost }}</p>
            <p class="mc-muted"><c8y-mc-rich k="naive.storedValues" [p]="naive().storedParams" /></p>
          </div>
        </div>
      </div>
    </div>

    @if (storage(); as s) {
      <div class="mc-panel">
        <header>
          <h2>{{ 'storage.heading' | t }}</h2>
          <span class="mc-sub-label">{{ 'storage.sub' | t }}</span>
        </header>
        <div class="mc-body">
          <div class="mc-grid mc-four m-b-16">
            @for (stat of s.stats; track stat.key) {
              <div class="mc-stat">
                <span>{{ stat.label }}</span>
                <b>{{ stat.value }}</b>
                <small>{{ stat.sub }}</small>
              </div>
            }
          </div>

          @if (s.perPeriod) {
            <p class="mc-hint m-b-16">{{ 'storage.perPeriod' | t }} {{ s.perPeriod }}</p>
          }

          <div class="mc-grid mc-two">
            <div>
              <p class="mc-note"><c8y-mc-rich k="storage.odsCell" [p]="s.odsParams" /></p>
              <p class="mc-muted m-t-8">{{ s.bundlingHelps }}</p>
            </div>
            <div>
              <p class="mc-muted"><c8y-mc-rich k="storage.retentionDecides" [p]="s.retentionParams" /></p>
              <!-- The byte figure was measured on datapoints, so the part of the
                   estimate that is documents rests on the weaker assumption. It
                   is counted anyway -- leaving it out understates the bill, and
                   on a commit-to-consume contract that is the expensive
                   direction -- so its share is stated instead of being quietly
                   carried. -->
              <p class="mc-muted"><c8y-mc-rich k="storage.documentsToo" [p]="s.documentsParams" /></p>
            </div>
          </div>
        </div>
      </div>
    }

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

  readonly naive = computed(() => {
    const t = this.locales.t();
    const peak = this.peak();
    const saving = peak.naiveTotal - peak.total;
    const comparable = peak.naiveTotal > 0 && peak.total > 0;

    return {
      month: monthYear(peak.year, peak.month),
      designed: n(peak.total),
      unbundled: n(peak.naiveTotal),
      saving: n(saving),
      share: comparable ? (peak.total / peak.naiveTotal) * 100 : null,
      lessParams: comparable
        ? {
            factor: nf1.format(peak.naiveTotal / peak.total),
            pct: n((1 - peak.total / peak.naiveTotal) * 100),
          }
        : undefined,
      notCost: t('naive.notCost', { saving: compact(saving) }),
      storedParams: { count: compact(peak.storedValues) },
    };
  });

  /**
   * Operational storage: a range, and why it is a range.
   *
   * The two figures behind it are rules of thumb marked "to be verified" at
   * source, and one of them spans 4x on its own. Reporting a midpoint would
   * make that look like a measurement, so both ends are shown, the retention
   * that scales them is stated, and the ODS line stays somebody's decision.
   */
  readonly storage = computed(() => {
    const t = this.locales.t();
    const result = this.store.result();
    const peak = result.peakStorage;
    // The quote is anchored on the first period, which is what the
    // Configurator's own note says; the others are listed under the grid.
    const first = result.storageByPeriod[0];
    if (!peak || !first || peak.retained <= 0) return null;

    const partial = peak.daysCovered < peak.retentionDays;
    const mixed = peak.retentionDaysShortest !== peak.retentionDays;
    // What share of the retained volume is not measurement values: event, alarm
    // and operation documents plus every managed object registered so far.
    const otherShare = peak.retained > 0 ? peak.retainedOther / peak.retained : 0;
    const keptFor = mixed
      ? t('storage.kept.mixed', {
          from: n(peak.retentionDaysShortest),
          to: n(peak.retentionDays),
        })
      : t('storage.kept.uniform', { days: n(peak.retentionDays) });

    return {
      stats: [
        {
          // The unit rides in the label rather than the figure: "778
          // GiB-months" breaks across its own hyphen at this size.
          key: 'ods',
          label: t('storage.stat.ods', { index: n(first.periodIndex) }),
          value: n(first.giBMonths),
          sub: t('storage.stat.ods.sub', {
            months: n(first.monthsCounted),
            bytes: n(peak.bytesPerValue),
            range: gibRange(first.lowGiBMonths, first.highGiBMonths),
          }),
        },
        {
          key: 'fullest',
          label: t('storage.stat.fullest'),
          value: monthYear(peak.year, peak.month),
          sub:
            t('storage.stat.fullest.sub', { kept: keptFor }) +
            (partial ? t('storage.stat.fullest.partial', { days: n(peak.daysCovered) }) : ''),
        },
        {
          key: 'onDisk',
          label: t('storage.stat.onDisk'),
          value: compact(peak.retained),
          sub: t('storage.stat.onDisk.sub', { count: compact(peak.written) }),
        },
        {
          key: 'perMeasurement',
          label: t('storage.stat.perMeasurement'),
          value: nf1.format(peak.valuesPerMeasurement),
          sub:
            peak.valuesPerMeasurement > 1.5
              ? t('storage.stat.perMeasurement.shared', {
                  count: nf1.format(peak.valuesPerMeasurement),
                })
              : t('storage.stat.perMeasurement.alone'),
        },
        {
          // The same period as the ODS stat, summed the same way. Two figures
          // on two different bases in one grid reads as a contradiction rather
          // than as two facts.
          key: 'dataHub',
          label: t('storage.stat.dataHub', { index: n(first.periodIndex) }),
          value: `${n(first.dataHubLowGiBMonths)} – ${n(first.dataHubHighGiBMonths)}`,
          sub: t('storage.stat.dataHub.sub'),
        },
      ],
      perPeriod:
        result.storageByPeriod.length > 1
          ? result.storageByPeriod
              .map(p => `P${p.periodIndex} ${gibMonths(p.giBMonths)}`)
              .join(' · ')
          : '',
      odsParams: {
        amount: gibMonths(first.giBMonths),
        index: n(first.periodIndex),
        months: n(first.monthsCounted),
        average: gib(first.averageGiB),
        bytes: n(peak.bytesPerValue),
        note: t('engine.storageSourceNote'),
      },
      bundlingHelps: t('storage.bundlingHelps', {
        count: nf1.format(peak.valuesPerMeasurement),
      }),
      retentionParams: {
        kept: keptFor,
        note:
          !mixed && peak.retentionDays === DEFAULT_RETENTION_DAYS
            ? t('storage.retentionDefault')
            : '',
      },
      documentsParams: {
        share: otherShare < 0.01 ? t('storage.under1pct') : pct(otherShare),
      },
    };
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
