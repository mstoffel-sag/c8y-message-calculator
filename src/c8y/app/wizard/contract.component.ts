/**
 * The contract: periods, the ramp, the calendar, and what is deployed in each
 * period.
 *
 * A period used to be defined here and *used* one screen earlier, where the
 * deployment table asked for a quantity per period. Adding a fifth period meant
 * walking forward, adding it, and walking back to fill in its column. Periods
 * now exist in exactly one place, and the table that has a column per period
 * sits directly beneath the table that decides how many there are.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

import {
  BYTES_PER_VALUE_HIGH,
  DEFAULT_RETENTION_DAYS,
  periodMonthsCell,
  type Scenario,
} from '../../../../lib/engine/index.js';
import { monthLabel } from '../../../../lib/format/index.js';
import {
  addPeriod,
  patchPeriod,
  removePeriod,
  setPeriodCount,
} from '../../../../lib/scenario/edits.js';
import { EmptyComponent, NumComponent, TeachComponent } from '../controls/fields.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { ProseComponent } from '../i18n/rich.component.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';
import { DeploymentComponent } from './deployment.component.js';

/** The Configurator allows five; beyond that the quote is a different shape. */
const MAX_PERIODS = 5;

@Component({
  selector: 'c8y-mc-step-contract',
  standalone: true,
  imports: [
    CoreModule,
    DeploymentComponent,
    EmptyComponent,
    NumComponent,
    ProseComponent,
    TeachComponent,
    TPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mc-panel mc-sub">
      <header>
        <h3>{{ 'contract.ramp.heading' | t }}</h3>
        <span class="mc-sub-label">{{ 'contract.ramp.sub' | t }}</span>
      </header>
      <div class="mc-body">
        <c8y-mc-teach [title]="'contract.teach.title' | t">
          <c8y-mc-prose k="contract.teach.body" />
        </c8y-mc-teach>

        <div class="mc-row m-b-16">
          <div class="form-group" style="width:150px">
            <label>{{ 'contract.rampStarts' | t }}</label>
            <!-- Selected on the options: see choice.component.ts. -->
            <select class="form-control" (change)="setStartMonth($any($event.target).value)">
              @for (month of months(); track month.value) {
                <option [value]="month.value" [selected]="month.value === settings().startMonth">
                  {{ month.label }}
                </option>
              }
            </select>
          </div>

          <c8y-mc-num
            [label]="'contract.year' | t"
            [min]="2000"
            [value]="settings().startYear"
            (valueChange)="setSetting({ startYear: $event })"
          />

          <!-- Retention changes nothing about how many messages are sent --
               only how many of them are still on disk. It is here rather than on
               the results screen because it is a fact about the tenant, like the
               calendar start, not an output. -->
          <c8y-mc-num
            [label]="'contract.retention' | t"
            [min]="1"
            [suffix]="'contract.retention.suffix' | t"
            [title]="'contract.retention.title' | t"
            [value]="settings().retentionDays ?? defaultRetention"
            (valueChange)="setSetting({ retentionDays: $event })"
          />

          <!-- The one number picked out of the 100-400 B range to quote. It
               starts at the top of it, because under-stating usage on a
               commit-to-consume contract depletes the commitment early rather
               than saving anything. -->
          <c8y-mc-num
            [label]="'contract.bytesPerValue' | t"
            [min]="1"
            suffix="B"
            [title]="'contract.bytesPerValue.title' | t"
            [value]="settings().bytesPerValue ?? defaultBytes"
            (valueChange)="setSetting({ bytesPerValue: $event })"
          />
        </div>

        @if (machineTypes().length === 0) {
          <c8y-mc-empty>{{ 'wizard.addMachineFirst' | t }}</c8y-mc-empty>
        } @else {
          <div class="mc-scroll">
            <table class="table mc-table">
              <thead>
                <tr>
                  <th>{{ 'contract.col.period' | t }}</th>
                  <th class="text-right" style="width:120px">{{ 'contract.col.months' | t }}</th>
                  @for (machineType of machineTypes(); track machineType.id) {
                    <th class="text-right">{{ machineType.name || ('machine.unnamedShort' | t) }}</th>
                  }
                  <th style="width:80px"></th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.index) {
                  <tr>
                    <td>
                      {{ row.label }}
                      <div class="mc-cell">{{ row.monthsCell }}</div>
                    </td>
                    <td class="text-right">
                      <c8y-mc-num
                        [min]="1"
                        [max]="120"
                        [value]="row.months"
                        (valueChange)="setMonths(row.index, $event)"
                      />
                    </td>
                    @for (count of row.counts; track count.machineTypeId) {
                      <td class="text-right">
                        <c8y-mc-num
                          [value]="count.value"
                          (valueChange)="setCount(row.index, count.machineTypeId, $event)"
                        />
                      </td>
                    }
                    <td>
                      @if (rows().length > 1) {
                        <button type="button" class="btn btn-link btn-sm" (click)="drop(row.index)">
                          {{ 'contract.remove' | t }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <div class="mc-row m-t-16">
          <button
            type="button"
            class="btn btn-default btn-sm"
            [disabled]="rows().length >= maxPeriods"
            (click)="add()"
          >
            {{ 'contract.addPeriod' | t }}
          </button>
          <span class="mc-hint">{{ 'contract.addPeriod.hint' | t }}</span>
        </div>
      </div>
    </div>

    <c8y-mc-deployment />
  `,
})
export class StepContractComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  protected readonly maxPeriods = MAX_PERIODS;
  protected readonly defaultRetention = DEFAULT_RETENTION_DAYS;
  protected readonly defaultBytes = BYTES_PER_VALUE_HIGH;

  readonly settings = computed(() => this.store.scenario().settings);
  readonly machineTypes = computed(() => this.store.scenario().machineTypes);

  /**
   * Month names come from Intl, so they follow the session's language.
   *
   * `monthLabel` reads the locale the formatters were last set to, which is
   * module state and not a signal -- so this reads `locale()` to say out loud
   * what it depends on. Every computed in this app that formats a number or a
   * date without also calling `t()` needs the same line.
   */
  readonly months = computed(() => {
    this.locales.locale();
    return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthLabel(i + 1) }));
  });

  readonly rows = computed(() => {
    const t = this.locales.t();
    const machineTypes = this.machineTypes();
    return this.store.scenario().periods.map(period => ({
      index: period.index,
      label: t('contract.periodN', { index: period.index }),
      monthsCell: periodMonthsCell(period.index),
      months: period.months,
      counts: machineTypes.map(mt => ({
        machineTypeId: mt.id,
        value: period.machineCountOverrides[mt.id] ?? mt.machineCount,
      })),
    }));
  });

  setStartMonth(raw: string): void {
    this.setSetting({ startMonth: Number(raw) });
  }

  setSetting(patch: Partial<Scenario['settings']>): void {
    this.store.patch(s => ({ ...s, settings: { ...s.settings, ...patch } }));
  }

  setMonths(index: number, months: number): void {
    this.store.patch(s => patchPeriod(s, index, { months }));
  }

  setCount(index: number, machineTypeId: string, count: number): void {
    this.store.patch(s => setPeriodCount(s, index, machineTypeId, count));
  }

  add(): void {
    this.store.patch(addPeriod);
  }

  drop(index: number): void {
    this.store.patch(s => removePeriod(s, index));
  }
}
