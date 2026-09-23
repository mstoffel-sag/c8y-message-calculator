/**
 * Operational storage: what the database holds at each month's end, added up.
 *
 * Its own component so it can sit under the commitment rather than among the
 * volume panels. `D27` and `D37` are the two quantities that leave this page,
 * and they now read next to each other.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DEFAULT_RETENTION_DAYS } from '../../../../lib/engine/index.js';
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

@Component({
  selector: 'c8y-mc-storage',
  standalone: true,
  imports: [RichComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
  `,
})
export class StorageComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

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
}
