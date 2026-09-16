/**
 * One machine type's events, alarms or inventory writes.
 *
 * The three panels differ only in their words, so the words are a `KindSpec`
 * and this table is rendered three times. They are catalogue keys rather than
 * strings: the counter names stay English, because that is what a tenant's
 * usage screen calls them, and everything a customer reads is translated.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import {
  DEFAULT_RETENTION_DAYS,
  perMonthEquivalent,
  type Cadence,
  type MachineType,
  type MetricKind,
} from '../../../../lib/engine/index.js';
import { nf1 } from '../../../../lib/format/index.js';
import type { Key } from '../../../../lib/i18n/index.js';
import { catalogFor, type Choice } from '../../../../lib/presets/catalog.js';
import {
  addDatapoint,
  removeMetric,
  setCadence,
  setDatapointName,
  setMetricRetentionDays,
  setResentOnTimer,
} from '../../../../lib/scenario/edits.js';
import { ChoiceComponent } from '../controls/choice.component.js';
import { EveryComponent } from '../controls/duration.component.js';
import { RetentionComponent } from '../controls/fields.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { TPipe } from '../i18n/t.pipe.js';
import { MachineComponent } from '../machine.component.js';
import { ScenarioStore } from '../scenario.store.js';

export interface KindSpec {
  kind: MetricKind;
  headingKey: Key;
  elementKey: Key;
  /** Counter names, as the Configurator and the tenant both spell them. */
  counters: string;
  questionKey: Key;
  teachKey: Key;
  rateKey: Key;
  placeholderKey: Key;
  addKey: Key;
  /**
   * Whether a retention rule has anything to act on here.
   *
   * Events and alarms are documents: one per occurrence, kept until the rule
   * removes it. An inventory write is not -- a PUT overwrites the managed
   * object in place, so nothing accumulates to age out, and the object itself
   * is not one of the types a retention rule covers. Offering the field there
   * would be offering a control that changes no number.
   */
  retention: boolean;
}

@Component({
  selector: 'c8y-mc-discrete-table',
  standalone: true,
  imports: [
    CoreModule,
    ChoiceComponent,
    EveryComponent,
    MachineComponent,
    RetentionComponent,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <c8y-mc-machine [machineType]="machineType()" [only]="spec().kind">
      <div class="mc-row m-b-8">
        <button type="button" class="btn btn-default btn-sm" (click)="add()">
          {{ spec().addKey | t }}
        </button>
      </div>

      @if (rows().length === 0) {
        <p class="mc-hint m-b-0">{{ 'discrete.none' | t }}</p>
      } @else {
        <div class="mc-scroll">
          <table class="table mc-table mc-dp">
            <thead>
              <tr>
                <th style="min-width:200px">{{ noun() }}</th>
                <th style="min-width:230px">{{ spec().rateKey | t }}</th>
                @if (spec().kind === 'inventory') {
                  <th style="width:210px">{{ 'discrete.inventory.timerColumn' | t }}</th>
                }
                @if (spec().retention) {
                  <th style="width:130px">{{ 'retention.col' | t }}</th>
                }
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
                      [placeholder]="spec().placeholderKey | t"
                      (valueChange)="rename(row.metric.id, $event)"
                    />
                  </td>
                  <td>
                    <c8y-mc-every
                      [cadence]="row.metric.cadence"
                      [kind]="spec().kind"
                      [hint]="row.rateHint"
                      (cadenceChange)="recadence(row.metric.id, $event)"
                    />
                  </td>
                  @if (spec().kind === 'inventory') {
                    <td>
                      <label class="c8y-checkbox">
                        <input
                          type="checkbox"
                          [checked]="!!row.metric.resentOnTimer"
                          (change)="retimer(row.metric.id, $any($event.target).checked)"
                        />
                        <span></span>
                        <span>{{ 'discrete.inventory.timerLabel' | t }}</span>
                      </label>
                    </td>
                  }
                  @if (spec().retention) {
                    <td>
                      <c8y-mc-retention
                        [days]="row.metric.retentionDays"
                        [fallback]="defaultRetention()"
                        (daysChange)="keep(row.metric.id, $event)"
                      />
                    </td>
                  }
                  <td>
                    <button type="button" class="btn btn-link btn-sm" (click)="drop(row.metric.id)">&times;</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </c8y-mc-machine>
  `,
})
export class DiscreteTableComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  readonly spec = input.required<KindSpec>();
  readonly machineType = input.required<MachineType>();

  readonly defaultRetention = computed(
    () => this.store.scenario().settings.retentionDays ?? DEFAULT_RETENTION_DAYS,
  );

  /**
   * The panel heading carries an explanation after a dash; the column heading
   * is the same noun without it.
   */
  readonly noun = computed(() =>
    this.locales.t()(this.spec().headingKey).replace(/—.*/, '').trim(),
  );

  /** This kind's catalogue, with a placeholder for unnamed rows. */
  readonly nameOptions = computed<Array<Choice<string>>>(() => [
    { value: '', label: this.locales.t()('discrete.chooseOne') },
    ...catalogFor(this.spec().kind).map(seed => ({
      value: seed.name,
      label: seed.name,
      group: seed.group,
    })),
  ]);

  readonly rows = computed(() => {
    const t = this.locales.t();
    return this.machineType()
      .metrics.filter(m => m.kind === this.spec().kind)
      .map(metric => ({
        metric,
        rateHint: t('discrete.perMachineMonth', {
          count: nf1.format(perMonthEquivalent(metric.cadence)),
        }),
      }));
  });

  add(): void {
    this.store.patch(s => addDatapoint(s, this.machineType().id, this.spec().kind));
  }

  rename(metricId: string, name: string): void {
    this.store.patch(s => setDatapointName(s, this.machineType().id, metricId, name));
  }

  recadence(metricId: string, cadence: Cadence): void {
    this.store.patch(s => setCadence(s, this.machineType().id, metricId, cadence));
  }

  retimer(metricId: string, on: boolean): void {
    this.store.patch(s => setResentOnTimer(s, this.machineType().id, metricId, on));
  }

  keep(metricId: string, days: number | undefined): void {
    this.store.patch(s => setMetricRetentionDays(s, this.machineType().id, metricId, days));
  }

  drop(metricId: string): void {
    this.store.patch(s => removeMetric(s, this.machineType().id, metricId));
  }
}
