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
  derivedTypeName,
  fragmentNameFor,
  measurementView,
  type Bundle,
  type MachineType,
  type Metric,
} from '../../../../lib/engine/index.js';
import { compact } from '../../../../lib/format/index.js';
import { DATAPOINTS, STATES, UNITS, type Choice } from '../../../../lib/presets/catalog.js';
import {
  addDatapoint,
  assignBundle,
  assignOwnBundle,
  patchBundle,
  patchUnit,
  removeMetric,
  setBundleRetentionDays,
  setDatapointName,
  setInterval as setMetricInterval,
  setMetricRetentionDays,
  setSeriesFragmentName,
} from '../../../../lib/scenario/edits.js';
import { ChoiceComponent } from '../controls/choice.component.js';
import { DurationComponent } from '../controls/duration.component.js';
import { RetentionComponent, TxtComponent } from '../controls/fields.component.js';
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

interface Row {
  metric: Metric;
  seconds: number;
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
    RetentionComponent,
    RichComponent,
    TPipe,
    TxtComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <c8y-mc-machine [machineType]="machineType()">
      <h4>{{ 'series.heading' | t }}</h4>

      @if (rows().length === 0) {
        <p class="mc-hint">{{ 'series.none' | t }}</p>
      } @else {
        <div class="mc-scroll">
          <table class="table mc-table mc-dp">
            <thead>
              <tr>
                <th style="min-width:190px">{{ 'series.col.series' | t }}</th>
                <th style="min-width:150px">{{ 'series.col.unit' | t }}</th>
                <th style="min-width:230px">{{ 'series.col.howOften' | t }}</th>
                <th style="min-width:250px">{{ 'series.col.type' | t }}</th>
                <th style="width:130px">{{ 'retention.col' | t }}</th>
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
                      [value]="row.metric.bundleId ?? ''"
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
        <p class="mc-hint m-t-8"><c8y-mc-rich k="series.namingNote" /></p>
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

    return series.map(metric => {
      const seconds = metric.cadence.mode === 'interval' ? metric.cadence.seconds : 60;
      const bundle = mt.bundles.find(b => b.id === metric.bundleId);
      const siblings = mt.bundles.filter(b => b.intervalSeconds === seconds);
      // The name belongs to the measurement type, not to the row, so only the
      // first series in it gets the field. Four identical boxes for one value
      // would invite an edit in row three and change row one.
      const names =
        bundle !== undefined && series.find(m => m.bundleId === bundle.id)?.id === metric.id;
      // Offered only where it would do something: a series that is already the
      // only one in its measurement type has one.
      const alone = bundle !== undefined && bundle.metricIds.length === 1;

      return {
        metric,
        seconds,
        bundle,
        names,
        typeOptions: [
          ...siblings.map(b => ({
            value: b.id,
            label: t('series.typeOption', {
              name: b.fragmentName.trim() || t('series.typeUnnamed'),
              series: t.plural('series.count', b.metricIds.length),
            }),
            group: t('series.typesOnInterval'),
          })),
          ...(alone
            ? []
            : [{ value: '', label: t('series.ownType'), group: t('series.onItsOwn') }]),
        ],
        samplesHint: t('series.samplesPerMonth', {
          count: compact(PEAK_MONTH_SECONDS / seconds),
        }),
        typePlaceholder: bundle
          ? fragmentNameFor(this.prefix(), mt.name, bundle.intervalSeconds)
          : derivedTypeName(this.prefix(), metric.name),
        belowType: !bundle
          ? t('series.solo.timed')
          : names
            ? bundle.metricIds.length > 1
              ? t('series.oneMessageForAll', { count: bundle.metricIds.length })
              : t('series.oneMessagePerSample')
            : t('series.sameMessage'),
      };
    });
  });

  readonly retentionParams = computed(() => ({ days: String(this.defaultRetention()) }));

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
      bundleId
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
