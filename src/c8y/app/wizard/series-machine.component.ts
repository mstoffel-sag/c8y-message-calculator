/**
 * One machine type's measurements.
 *
 * Every column is a dropdown, bar one: the measurement type's name. The tool
 * suggests it, and the customer overwrites it in place when their devices
 * already send something else. A guided wizard that hands out blank number
 * boxes is not guiding anybody, and the interval and change-rate labels carry
 * the consequence of the choice rather than leaving it to be inferred.
 *
 * The per-row decisions -- which row owns the measurement type's name, which
 * rows may still join a bundle, which retention control applies -- are computed
 * into a row model rather than worked out inline. There are four of them and
 * they depend on each other; spread across a template they are unreadable and
 * they recompute on every change detection pass.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import {
  DEFAULT_RETENTION_DAYS,
  MAX_SERIES_PER_BUNDLE,
  derivedTypeName,
  fragmentNameFor,
  measurementView,
  ownFragmentName,
  seriesCountOf,
  seriesIn,
  typesIn,
  type Bundle,
  type MachineType,
  type Metric,
} from '../../../../lib/engine/index.js';
import { compact, n } from '../../../../lib/format/index.js';
import { DATAPOINTS, STATES, UNITS, type Choice } from '../../../../lib/presets/catalog.js';
import {
  addDatapoint,
  assignBundle,
  assignOwnBundle,
  assignTypePerSeries,
  patchBundle,
  patchUnit,
  removeMetric,
  setBundleRetentionDays,
  setDatapointName,
  setInterval as setMetricInterval,
  setMetricRetentionDays,
  setSeriesCount,
  setSeriesFragmentName,
} from '../../../../lib/scenario/edits.js';
import { ChoiceComponent } from '../controls/choice.component.js';
import { DurationComponent } from '../controls/duration.component.js';
import { NumComponent, RetentionComponent, TxtComponent } from '../controls/fields.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { RichComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { MachineComponent } from '../machine.component.js';
import { MeasurementDiagramComponent } from '../diagram/measurement-diagram.component.js';
import { ScenarioStore } from '../scenario.store.js';

/**
 * One list, both rhythms. The catalogue's own groups keep them apart on the
 * page -- Climate, Electrical, then Status and Connectivity -- and picking a
 * name from the on-change end moves the row's rhythm with it, because a door
 * open/closed left on a one-minute timer is the mistake this step exists to
 * prevent.
 */
const SERIES_SEEDS = [...DATAPOINTS, ...STATES];

/** Seconds in a 31-day month, for the "samples per month" hint. */
const PEAK_MONTH_SECONDS = 2_678_400;

/**
 * The measurement-type dropdown's third answer, which is not a bundle id.
 *
 * A sentinel rather than a second control: the three answers are mutually
 * exclusive -- a row cannot both ride in `acme_Climate` and send each of its
 * series separately -- so one dropdown makes the contradiction unrepresentable.
 * Empty string already means "a measurement type of its own", so this needs a
 * value no bundle id can collide with.
 */
const PER_SERIES = '\u0000per-series';

interface Row {
  metric: Metric;
  seconds: number;
  /** The dropdown's current answer: a bundle id, '' or PER_SERIES. */
  typeChoice: string;
  /** How many series this row stands for; 1 on nearly every row. */
  count: number;
  /**
   * Measurement types those series travel in. Above 1 the row says so, because
   * the split is why its message count is not the one the customer expected.
   */
  types: number;
  bundle: Bundle | undefined;
  /** This row owns the measurement type's name. */
  names: boolean;
  typeOptions: Array<Choice<string>>;
  samplesHint: string;
  typePlaceholder: string;
  belowType: string;
}

@Component({
  selector: 'c8y-mc-series-machine',
  standalone: true,
  imports: [
    CoreModule,
    ChoiceComponent,
    DurationComponent,
    MachineComponent,
    MeasurementDiagramComponent,
    NumComponent,
    RetentionComponent,
    RichComponent,
    TPipe,
    TxtComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Measurements only: this step edits series, so a header totalling every
         element is a figure that barely moves when you change what the step is
         for. See machine-line.ts. -->
    <c8y-mc-machine [machineType]="machineType()" only="continuous">
      <h4>{{ 'series.heading' | t }}</h4>

      @if (rows().length === 0) {
        <p class="mc-hint">{{ 'series.none' | t }}</p>
      } @else {
        <div class="mc-scroll">
          <table class="table mc-table mc-dp">
            <thead>
              <tr>
                <!-- The other columns gave up 60 px between them to make room
                     for the count, so the row is exactly as wide as it was: it
                     was already the widest in the wizard, and the retention
                     column falls off the end of anything wider. -->
                <th style="min-width:160px">{{ 'series.col.series' | t }}</th>
                <!-- Narrow on purpose: it holds 1 on nearly every row, and the
                     one row where it holds 450 is the one worth noticing. -->
                <th style="min-width:70px">{{ 'series.col.count' | t }}</th>
                <th style="min-width:130px">{{ 'series.col.unit' | t }}</th>
                <th style="min-width:220px">{{ 'series.col.howOften' | t }}</th>
                <th style="min-width:250px">{{ 'series.col.type' | t }}</th>
                <th style="width:120px">{{ 'retention.col' | t }}</th>
                <th style="width:34px"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.metric.id) {
                <tr>
                  <td>
                    <c8y-mc-choice
                      [value]="row.metric.name"
                      [options]="nameOptions()"
                      [placeholder]="'series.namePlaceholder' | t"
                      (valueChange)="rename(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <c8y-mc-num
                      [value]="row.count"
                      [min]="1"
                      [title]="'series.countTitle' | t"
                      (valueChange)="recount(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <c8y-mc-choice
                      [value]="row.metric.unit"
                      [options]="units"
                      [placeholder]="'series.unitPlaceholder' | t"
                      (valueChange)="reunit(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <c8y-mc-duration
                      [seconds]="row.seconds"
                      [prefix]="'every.prefix' | t"
                      [hint]="row.samplesHint"
                      (secondsChange)="retime(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <!-- Every row has a measurement type to choose: with one
                         rhythm, anything sharing a tick can share a message, so
                         nothing is excluded from a bundle on principle. -->
                    <c8y-mc-choice
                      [value]="row.typeChoice"
                      [allowOther]="false"
                      [options]="row.typeOptions"
                      (valueChange)="assign(row.metric.id, $event)"
                    />
                    @if (!row.bundle) {
                      <!-- The measurement type of a series that travels alone.
                           Same control as a bundle's name, because it is the
                           same thing: the fragment the device sends. -->
                      <div class="m-t-4">
                        <c8y-mc-txt
                          [value]="row.metric.fragmentName ?? ''"
                          [placeholder]="row.typePlaceholder"
                          (valueChange)="renameSolo(row.metric.id, $event)"
                        />
                        <div class="mc-hint m-t-4">{{ row.belowType }}</div>
                      </div>
                    } @else if (row.names) {
                      <div class="m-t-4">
                        <!-- The tool's own name for the type is stored, not
                             merely suggested, so it travels with the scenario
                             and reads the same everywhere. The placeholder is
                             what a cleared field falls back to. -->
                        <c8y-mc-txt
                          [value]="row.bundle.fragmentName"
                          [placeholder]="row.typePlaceholder"
                          (valueChange)="renameBundle(row.bundle!.id, $event)"
                        />
                        <div class="mc-hint m-t-4">{{ row.belowType }}</div>
                      </div>
                    } @else {
                      <div class="mc-hint m-t-4">{{ row.belowType }}</div>
                    }
                  </td>
                  <td>
                    <!-- The rule belongs to the type, so the row that names the
                         type is the row that sets it -- a bundled series is kept
                         for as long as its bundle, whatever any earlier scenario
                         put on the metric. -->
                    @if (row.bundle) {
                      @if (row.names) {
                        <c8y-mc-retention
                          [days]="row.bundle.retentionDays"
                          [fallback]="defaultRetention()"
                          (daysChange)="keepBundle(row.bundle!.id, $event)"
                        />
                      } @else {
                        <span class="mc-hint">{{ 'retention.shared' | t }}</span>
                      }
                    } @else {
                      <c8y-mc-retention
                        [days]="row.metric.retentionDays"
                        [fallback]="defaultRetention()"
                        (daysChange)="keepMetric(row.metric.id, $event)"
                      />
                    }
                  </td>
                  <td>
                    <button type="button" class="btn btn-link btn-sm" (click)="drop(row.metric.id)">&times;</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mc-hint m-t-8"><c8y-mc-rich k="series.countNote" [p]="countParams" /></p>
        <p class="mc-hint m-t-4"><c8y-mc-rich k="series.namingNote" /></p>
        <p class="mc-hint m-t-4"><c8y-mc-rich k="series.retentionNote" [p]="retentionParams()" /></p>
      }

      <div class="mc-row m-t-16">
        <button type="button" class="btn btn-default btn-sm" (click)="addSeries()">
          {{ 'series.add' | t }}
        </button>
      </div>

      <!-- The configuration, in the same shape as the explainer's example. -->
      @if (view().groups.length > 0) {
        <h4 class="m-t-16">{{ 'series.whatItSends' | t }}</h4>
        <c8y-mc-measurement-diagram [view]="view()" />
      }

    </c8y-mc-machine>
  `,
})
export class SeriesMachineComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  protected readonly units = UNITS;

  readonly machineType = input.required<MachineType>();

  private readonly prefix = computed(() => this.store.scenario().settings.fragmentPrefix);

  readonly defaultRetention = computed(
    () => this.store.scenario().settings.retentionDays ?? DEFAULT_RETENTION_DAYS,
  );

  readonly view = computed(() => measurementView(this.machineType(), this.prefix()));

  /**
   * Catalogue entries become dropdown options; the group headings come along.
   *
   * The empty first entry matters: a series that has just been added has no
   * name, and without a placeholder that empty value would look like a custom
   * one and open the free-text field instead of inviting a pick from the list.
   */
  readonly nameOptions = computed<Array<Choice<string>>>(() => [
    { value: '', label: this.locales.t()('series.choose') },
    ...SERIES_SEEDS.map(seed => ({ value: seed.name, label: seed.name, group: seed.group })),
  ]);

  readonly rows = computed<Row[]>(() => {
    const t = this.locales.t();
    const mt = this.machineType();
    // Everything this machine measures. One kind now, so one filter.
    const series = mt.metrics.filter(m => m.kind === 'continuous');

    // What a measurement type actually carries. The dropdown and the naming
    // hint both say it, and both used to count rows -- which stopped being the
    // same number the moment a row could stand for 450 tags.
    const seriesInBundle = (bundleId: string) =>
      seriesIn(series.filter(m => m.bundleId === bundleId));
    const bundleTypes = (bundleId: string) =>
      typesIn(series.filter(m => m.bundleId === bundleId));

    return series.map(metric => {
      const seconds = metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60;
      const count = seriesCountOf(metric);
      const perSeries = Boolean(metric.typePerSeries) && count > 1;
      const types = typesIn([metric]);
      const bundle = mt.bundles.find(b => b.id === metric.bundleId);
      // A measurement type this row is alone in is not something it can be
      // bundled *with* -- offering it under "Bundled" would make the heading a
      // lie, and choosing it would be a no-op. Its answer is "a measurement
      // type of its own", below, and its name is still editable in the field
      // under the dropdown.
      const soloBundle = bundle !== undefined && bundle.metricIds.length === 1;
      const siblings = mt.bundles.filter(
        b => b.intervalSeconds === seconds && !(soloBundle && b.id === bundle?.id),
      );
      // The name belongs to the measurement type, not to the row, so only the
      // first series in it gets the field. Four identical boxes for one value
      // would invite an edit in row three and change row one.
      const names =
        bundle !== undefined && series.find(m => m.bundleId === bundle.id)?.id === metric.id;

      return {
        metric,
        seconds,
        count,
        types,
        typeChoice: perSeries ? PER_SERIES : soloBundle ? '' : (metric.bundleId ?? ''),
        bundle,
        names,
        typeOptions: [
          ...siblings.map(b => ({
            value: b.id,
            label: t('series.typeOption', {
              name: b.fragmentName.trim() || t('series.typeUnnamed'),
              series: t.plural('series.count', seriesInBundle(b.id)),
            }),
            group: t('series.typesOnInterval'),
          })),
          { value: '', label: t('series.ownType'), group: t('series.onItsOwn') },
          // Only where it would mean something different: for a single series,
          // one type per series and a type of its own are the same answer.
          ...(count > 1
            ? [{ value: PER_SERIES, label: t('series.typePerSeries'), group: t('series.onItsOwn') }]
            : []),
        ],
        samplesHint: t('series.samplesPerMonth', {
          count: compact(PEAK_MONTH_SECONDS / seconds),
        }),
        typePlaceholder: bundle
          ? fragmentNameFor(this.prefix(), mt.name, bundle.intervalSeconds)
          : derivedTypeName(this.prefix(), metric.name),
        // The split belongs to the measurement type, not to the row that
        // happens to carry the count: a 450-tag row sharing a type with two
        // named readings splits on 452, not on 450. So it is said here, under
        // the type, rather than under the count.
        belowType: !bundle
          ? perSeries
            ? t('series.solo.perSeries', {
                count: n(count),
                name: ownFragmentName(this.prefix(), metric),
              })
            : count > MAX_SERIES_PER_BUNDLE
              ? t('series.solo.overRecommended', { count: n(count), max: n(MAX_SERIES_PER_BUNDLE) })
              : t('series.oneMessagePerSample')
          : names
            ? seriesInBundle(bundle.id) > MAX_SERIES_PER_BUNDLE
              ? t('series.overRecommended', {
                  count: n(seriesInBundle(bundle.id)),
                  max: n(MAX_SERIES_PER_BUNDLE),
                })
              : seriesInBundle(bundle.id) > 1
                ? t('series.oneMessageForAll', { count: n(seriesInBundle(bundle.id)) })
                : t('series.oneMessagePerSample')
            : t('series.sameMessage'),
      };
    });
  });

  readonly retentionParams = computed(() => ({ days: String(this.defaultRetention()) }));

  /** Static: the platform's recommendation does not depend on the session. */
  protected readonly countParams = { max: String(MAX_SERIES_PER_BUNDLE) };

  recount(metricId: string, count: number): void {
    this.edit(s => setSeriesCount(s, this.machineType().id, metricId, count));
  }

  rename(metricId: string, name: string): void {
    this.edit(s => setDatapointName(s, this.machineType().id, metricId, name));
  }

  reunit(metricId: string, unit: string): void {
    this.edit(s => patchUnit(s, this.machineType().id, metricId, unit));
  }

  retime(metricId: string, seconds: number): void {
    this.edit(s => setMetricInterval(s, this.machineType().id, metricId, seconds));
  }

  assign(metricId: string, bundleId: string): void {
    this.edit(s =>
      bundleId === PER_SERIES
        ? assignTypePerSeries(s, this.machineType().id, metricId)
        : bundleId
          ? assignBundle(s, this.machineType().id, metricId, bundleId)
          : assignOwnBundle(s, this.machineType().id, metricId),
    );
  }

  renameSolo(metricId: string, fragmentName: string): void {
    this.edit(s => setSeriesFragmentName(s, this.machineType().id, metricId, fragmentName));
  }

  renameBundle(bundleId: string, fragmentName: string): void {
    this.edit(s => patchBundle(s, this.machineType().id, bundleId, { fragmentName }));
  }

  keepBundle(bundleId: string, days: number | undefined): void {
    this.edit(s => setBundleRetentionDays(s, this.machineType().id, bundleId, days));
  }

  keepMetric(metricId: string, days: number | undefined): void {
    this.edit(s => setMetricRetentionDays(s, this.machineType().id, metricId, days));
  }

  drop(metricId: string): void {
    this.edit(s => removeMetric(s, this.machineType().id, metricId));
  }

  addSeries(): void {
    this.edit(s => addDatapoint(s, this.machineType().id, 'continuous'));
  }

  private edit(fn: Parameters<ScenarioStore['patch']>[0]): void {
    this.store.patch(fn);
  }
}
